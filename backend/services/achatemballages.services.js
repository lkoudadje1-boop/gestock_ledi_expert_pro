// backend/services/achatemballages.services.js
const mongoose = require('mongoose');
const { 
    CloudPackagingPurchase, 
    CloudPackaging, 
    CloudPackagingMovement 
} = require('../models/cloud.model');
const { logAction } = require('../utils/auditHelper');

function genererIdAchat() {
    return `PURCH-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`;
}

exports.getAllAchats = async (companyId) => {
    try {
        // Récupération des achats de l'entreprise avec jointure simulée ou peuplement Mongoose
        const achats = await CloudPackagingPurchase.find({ companyId })
            .sort({ created_at: -1 })
            .lean();

        // Récupération des infos d'emballage associées pour enrichir le résultat
        const enrichedAchats = await Promise.all(achats.map(async (achat) => {
            const pkg = await CloudPackaging.findOne({ id: achat.packaging_id, companyId }).lean();
            return {
                ...achat,
                emballage_nom: pkg ? pkg.nom : null,
                cmp_actuel: pkg ? (pkg.cmp || 0) : 0
            };
        }));

        return enrichedAchats;
    } catch (error) {
        console.error("❌ Erreur Cloud Service (getAllAchats):", error.message);
        throw error;
    }
};

exports.createAchat = async ({ companyId, userId, userName, data }) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { packaging_id, supplier_id, quantite, montant_facture, facture_ref } = data;
        
        const qte = Number(quantite);
        const total = Number(montant_facture);
        const prix = qte > 0 ? total / qte : 0;

        const id = genererIdAchat();
        const movId = `MOV-${Date.now()}`;

        // Recherche de l'emballage cible
        const pkg = await CloudPackaging.findOne({ id: packaging_id, companyId }).session(session);
        if (!pkg) {
            throw new Error("Emballage introuvable pour cet achat.");
        }

        const stockAvant = pkg.stock_actuel || 0;
        const cmpAvant = pkg.cmp || 0;
        const stockApres = stockAvant + qte;
        
        const nouveauCmp = ((stockAvant * cmpAvant) + total) / stockApres;

        // 1. Insertion Achat
        await CloudPackagingPurchase.create([{
            id,
            packaging_id,
            supplier_id,
            user_id: userId,
            quantite: qte,
            prix_unitaire: prix,
            montant_total: total,
            facture_ref,
            companyId,
            sync_status: 'synced',
            is_active: true,
            is_cancelled: false,
            is_archive: false
        }], { session });

        // 2. Mise à jour Packaging (Stock & CMP)
        await CloudPackaging.updateOne(
            { id: packaging_id, companyId },
            { 
                $set: { 
                    stock_actuel: stockApres, 
                    cmp: nouveauCmp, 
                    sync_status: 'synced', 
                    updated_at: new Date() 
                } 
            },
            { session }
        );

        // 3. Mouvement de stock
        await CloudPackagingMovement.create([{
            id: movId,
            packaging_id,
            type_mouvement: 'ACHAT',
            reference_id: id,
            quantite: qte,
            stock_avant: stockAvant,
            stock_apres: stockApres,
            user_id: userId,
            companyId,
            sync_status: 'synced'
        }], { session });

        await logAction({ userId, userName, actionType: 'INSERTION', tableConcernee: 'packaging_purchases', referenceId: id, description: `Achat ${packaging_id}`, companyId });

        await session.commitTransaction();
        session.endSession();
        return id;
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error("❌ Erreur Cloud Service (createAchat):", error.message);
        throw error;
    }
};

exports.updateAchat = async (id, companyId, userId, userName, data) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { quantite, prix_unitaire, supplier_id, facture_ref } = data;
        const nouveau_total = quantite * prix_unitaire;

        const old = await CloudPackagingPurchase.findOne({ id, companyId }).session(session);
        if (!old) throw new Error("Achat introuvable pour mise à jour");

        const diff = quantite - old.quantite;
        
        // Mise à jour du stock de l'emballage
        await CloudPackaging.updateOne(
            { id: old.packaging_id, companyId },
            { 
                $inc: { stock_actuel: diff },
                $set: { sync_status: 'synced', updated_at: new Date() }
            },
            { session }
        );

        // Mise à jour de l'achat
        await CloudPackagingPurchase.updateOne(
            { id, companyId },
            { 
                $set: { 
                    supplier_id, 
                    quantite, 
                    prix_unitaire, 
                    montant_total: nouveau_total, 
                    facture_ref, 
                    sync_status: 'synced', 
                    updated_at: new Date() 
                } 
            },
            { session }
        );

        await logAction({ userId, userName, actionType: 'MODIFICATION', tableConcernee: 'packaging_purchases', referenceId: id, companyId });

        await session.commitTransaction();
        session.endSession();
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error("❌ Erreur Cloud Service (updateAchat):", error.message);
        throw error;
    }
};

exports.handleAction = async (id, companyId, userId, userName, action) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const cleanNum = (val) => Math.round((parseFloat(val) || 0) * 100) / 100;
        const movId = `MOV-ANN-${Date.now()}`;

        const achat = await CloudPackagingPurchase.findOne({ id, companyId }).session(session);
        if (!achat) throw new Error("Achat introuvable");

        if (action === 'DELETE') {
            const pkg = await CloudPackaging.findOne({ id: achat.packaging_id, companyId }).session(session);
            
            const stockAvant = pkg ? (pkg.stock_actuel || 0) : 0;
            const cmpAvant = pkg ? (pkg.cmp || 0) : 0;
            const qteAnnulee = achat.quantite;
            const prixAchatInitial = achat.prix_unitaire;
            
            const stockApres = cleanNum(stockAvant - qteAnnulee);
            let nouveauCmp = cmpAvant;

            if (stockApres > 0) {
                const valeurTotaleAvant = stockAvant * cmpAvant;
                const valeurAchatAnnulee = qteAnnulee * prixAchatInitial;
                nouveauCmp = cleanNum((valeurTotaleAvant - valeurAchatAnnulee) / stockApres);
                if (nouveauCmp < 0) nouveauCmp = cmpAvant;
            }

            // Désactivation / Annulation de l'achat
            await CloudPackagingPurchase.updateOne(
                { id, companyId },
                { $set: { is_active: false, is_cancelled: true, sync_status: 'synced', updated_at: new Date() } },
                { session }
            );

            // Mise à jour du packaging
            await CloudPackaging.updateOne(
                { id: achat.packaging_id, companyId },
                { $set: { stock_actuel: stockApres, cmp: nouveauCmp, sync_status: 'synced', updated_at: new Date() } },
                { session }
            );

            // Enregistrement du mouvement d'annulation
            await CloudPackagingMovement.create([{
                id: movId,
                packaging_id: achat.packaging_id,
                type_mouvement: 'ANNULATION_ACHAT',
                reference_id: id,
                quantite: -qteAnnulee,
                stock_avant: stockAvant,
                stock_apres: stockApres,
                user_id: userId,
                companyId,
                sync_status: 'synced'
            }], { session });

        } else if (action === 'ARCHIVE') {
            await CloudPackagingPurchase.updateOne(
                { id, companyId },
                { $set: { is_active: false, is_archive: true, sync_status: 'synced', updated_at: new Date() } },
                { session }
            );
        }

        await logAction({ userId, userName, actionType: action, tableConcernee: 'packaging_purchases', referenceId: id, companyId });

        await session.commitTransaction();
        session.endSession();
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error("❌ Erreur Cloud Service (handleAction):", error.message);
        throw error;
    }
};