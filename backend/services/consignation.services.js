// backend/services/consignation.services.js
const mongoose = require('mongoose');
const { 
    CloudFluxEmballage, CloudFluxEmballageDetail, CloudPackaging, 
    CloudSale, CloudCustomer, CloudAuditLog 
} = require('../models/cloud.model');
const { logAction } = require('../utils/auditHelper');
const consignationRules = require('./RegleConsignation.services');

const genererIdMouvement = (prefix) => {
    return `${prefix}-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`;
};

exports.createConsignation = async ({ companyId, userId, userName, data }) => {
    const { 
        tiers_id, client_nom, sale_id, items, montant_total,
        type_garantie, montant_recu, garantie_libelle 
    } = data;
    
    if (!items || items.length === 0) throw new Error("La consignation doit contenir au moins un emballage.");
    
    let saleData = await CloudSale.findOne({ $or: [{ localId: sale_id }, { lot_id: sale_id }, { _id: mongoose.isValidObjectId(sale_id) ? sale_id : null }] }).lean();
    if (!saleData && client_nom) {
        saleData = await CloudSale.findOne({ nom_client_snap: client_nom, statut_vente: 'VALIDEE' }).sort({ date_vente: -1 }).lean();
    }
    if (!saleData) throw new Error(`Consignation refusée : Vente introuvable.`);
    
    const finalCompanyId = saleData.company_id || companyId;
    const finalTiersId = saleData.customer_id || tiers_id || null;

    let totalCalcule = 0;
    for (const item of items) {
        totalCalcule += (parseFloat(item.qte || item.quantite) || 0) * (parseFloat(item.prix_unitaire || item.prix_consigne) || 0);
    }
    const finalMontantTotal = montant_total || totalCalcule;

    const finalTypeGarantie = type_garantie || 'ESPECES';
    const finalMontantRecu = finalTypeGarantie === 'PHYSIQUE' ? 0 : (parseFloat(montant_recu) || 0);
    const finalResteAPayer = finalTypeGarantie === 'PHYSIQUE' ? 0 : Math.max(0, finalMontantTotal - finalMontantRecu);
    const finalGarantieLibelle = finalTypeGarantie === 'PHYSIQUE' ? (garantie_libelle || "Pièce d'identité") : null;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const fluxId = genererIdMouvement('FLUX');

        await CloudFluxEmballage.create([{
            localId: fluxId,
            company_id: finalCompanyId.toString(),
            sale_id: saleData.localId || saleData._id.toString(),
            client_id: finalTiersId,
            type_flux: 'CONSIGNE',
            montant_total: finalMontantTotal,
            type_garantie: finalTypeGarantie,
            montant_recu: finalMontantRecu,
            reste_a_payer: finalResteAPayer,
            garantie_libelle: finalGarantieLibelle,
            statut: 'EN COURS',
            sync_status: 'synced'
        }], { session });

        for (const item of items) {
            const targetPackagingId = item.packaging_id || item.id;
            const packaging = await CloudPackaging.findOne({ 
                $or: [{ localId: targetPackagingId }, { _id: mongoose.isValidObjectId(targetPackagingId) ? targetPackagingId : null }],
                company_id: finalCompanyId.toString() 
            }).lean();
            
            let regleComplete = null;
            if (packaging && packaging.rule_id) {
                regleComplete = await consignationRules.getRuleById(packaging.rule_id, finalCompanyId);
            }

            const calculs = consignationRules.simulerPrixRemboursement(
                targetPackagingId, new Date().toISOString(), finalCompanyId,
                regleComplete ? JSON.stringify(regleComplete) : null
            );

            const qte = parseFloat(item.qte || item.quantite) || 0;
            const pxUnit = parseFloat(item.prix_unitaire || item.prix_consigne) || 0;
            const detailId = genererIdMouvement('DET');

            await CloudFluxEmballageDetail.create([{
                localId: detailId,
                company_id: finalCompanyId.toString(),
                flux_id: fluxId,
                packaging_id: targetPackagingId,
                quantite: qte,
                quantite_restante: qte,
                prix_unitaire: pxUnit,
                montant_ligne: qte * pxUnit,
                montant_penalite_unitaire: calculs.montant_penalite_unitaire,
                regle_tarifaire_snapshot: regleComplete ? JSON.stringify(regleComplete) : null,
                sync_status: 'synced'
            }], { session });

            await CloudPackaging.updateOne(
                { 
                    $or: [{ localId: targetPackagingId }, { _id: mongoose.isValidObjectId(targetPackagingId) ? targetPackagingId : null }],
                    company_id: finalCompanyId.toString() 
                },
                { 
                    $inc: { stock_actuel: -qte, stock_consigne: qte }, 
                    $set: { updated_at: new Date(), sync_status: 'synced' } 
                }
            ).session(session);
        }

        await logAction({ 
            userId, 
            userName: userName || 'user', 
            actionType: 'INSERTION', 
            tableConcernee: 'flux_emballages', 
            referenceId: fluxId, 
            description: finalTypeGarantie === 'PHYSIQUE' 
                ? `Consignation créée avec Garantie Physique : ${finalGarantieLibelle}` 
                : `Consignation créée (Reçu: ${finalMontantRecu} F, Reste: ${finalResteAPayer} F)`, 
            companyId: finalCompanyId.toString() 
        });

        await session.commitTransaction();
        session.endSession();
        return fluxId;
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        throw err;
    }
};

exports.createDeconsignation = async ({ companyId, userId, userName, data }) => {
    const { flux_id, qte_retournee } = data; 
    const qteRetour = parseFloat(qte_retournee);

    if (isNaN(qteRetour) || qteRetour <= 0) throw new Error("Quantité invalide.");

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const flux = await CloudFluxEmballage.findOne({ localId: flux_id, company_id: companyId.toString() }).session(session);
        if (!flux) throw new Error("Flux de consignation introuvable.");

        const detailOrigine = await CloudFluxEmballageDetail.findOne({
            flux_id: flux_id,
            company_id: companyId.toString(),
            quantite: { $gt: 0 },
            quantite_restante: { $gt: 0 }
        }).session(session);

        if (!detailOrigine) throw new Error("Aucun emballage actif restant à déconsigner pour ce flux.");
        
        if (qteRetour > detailOrigine.quantite_restante) {
            throw new Error(`Quantité retournée (${qteRetour}) supérieure au solde restant (${detailOrigine.quantite_restante}).`);
        }

        let penaliteUnitaireAuRetour = 0;
        if (detailOrigine.regle_tarifaire_snapshot && flux.created_at) {
            try {
                const simulation = consignationRules.simulerPrixRemboursement(
                    detailOrigine.packaging_id,
                    flux.created_at,
                    companyId,
                    detailOrigine.regle_tarifaire_snapshot
                );
                penaliteUnitaireAuRetour = parseFloat(simulation.montant_penalite_unitaire) || 0;
            } catch (err) {
                console.error("❌ Erreur simulation pénalité au retour:", err);
            }
        }

        const prixUnitaire = parseFloat(detailOrigine.prix_unitaire) || 0;
        const montantLigneRetour = -qteRetour * prixUnitaire; 
        const totalPenaliteRetour = qteRetour * penaliteUnitaireAuRetour; 

        const detailRetourId = genererIdMouvement('DET-RET');
        
        await CloudFluxEmballageDetail.create([{
            localId: detailRetourId,
            company_id: companyId.toString(),
            flux_id: flux_id,
            packaging_id: detailOrigine.packaging_id,
            quantite: -qteRetour,
            quantite_restante: 0,
            prix_unitaire: prixUnitaire,
            montant_ligne: montantLigneRetour,
            montant_penalite_unitaire: penaliteUnitaireAuRetour,
            sync_status: 'synced'
        }], { session });

        await CloudFluxEmballageDetail.updateOne(
            { _id: detailOrigine._id },
            { $inc: { quantite_restante: -qteRetour }, $set: { sync_status: 'synced' } }
        ).session(session);

        const ajustementSoldeGlobal = montantLigneRetour - totalPenaliteRetour; 

        await CloudFluxEmballage.updateOne(
            { _id: flux._id },
            { $inc: { reste_a_payer: ajustementSoldeGlobal }, $set: { updated_at: new Date(), sync_status: 'synced' } }
        ).session(session);

        // Vérification du solde global des quantités
        const remainingDetails = await CloudFluxEmballageDetail.find({ flux_id: flux_id, company_id: companyId.toString() }).session(session);
        const soldeQuantite = remainingDetails.reduce((sum, d) => sum + d.quantite, 0);

        const nouveauStatut = soldeQuantite <= 0 ? 'SOLDE' : 'EN COURS';
        await CloudFluxEmballage.updateOne({ _id: flux._id }, { $set: { statut: nouveauStatut } }).session(session);

        await CloudPackaging.updateOne(
            { 
                $or: [{ localId: detailOrigine.packaging_id }, { _id: mongoose.isValidObjectId(detailOrigine.packaging_id) ? detailOrigine.packaging_id : null }],
                company_id: companyId.toString() 
            },
            { 
                $inc: { stock_actuel: qteRetour, stock_consigne: -qteRetour }, 
                $set: { updated_at: new Date(), sync_status: 'synced' } 
            }
        ).session(session);

        await logAction({
            userId,
            userName: userName || 'user',
            actionType: 'UPDATE',
            tableConcernee: 'flux_emballages',
            referenceId: flux_id,
            description: `Déconsignation de ${qteRetour} unités (Remboursement: ${montantLigneRetour} F, Pénalité Retenu: ${totalPenaliteRetour} F) ajoutée au flux ${flux_id}`,
            companyId: companyId.toString()
        });

        await session.commitTransaction();
        session.endSession();
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        throw err;
    }
};

exports.getConsignations = async (companyId, status = null) => {
    let matchQuery = { company_id: companyId.toString() };
    if (status === 'OUVERT') {
        matchQuery.statut = 'EN COURS';
    } else if (status === 'SOLDE') {
        matchQuery.statut = 'SOLDE';
    }

    const details = await CloudFluxEmballageDetail.find({ company_id: companyId.toString() }).lean();
    const result = [];

    for (const d of details) {
        const flux = await CloudFluxEmballage.findOne({ localId: d.flux_id, ...matchQuery }).lean();
        if (!flux) continue;

        const packaging = await CloudPackaging.findOne({ 
            $or: [{ localId: d.packaging_id }, { _id: mongoose.isValidObjectId(d.packaging_id) ? d.packaging_id : null }] 
        }).lean();

        const sale = await CloudSale.findOne({ 
            $or: [{ localId: flux.sale_id }, { _id: mongoose.isValidObjectId(flux.sale_id) ? flux.sale_id : null }] 
        }).lean();

        const customer = await CloudCustomer.findOne({ 
            $or: [{ localId: flux.client_id }, { _id: mongoose.isValidObjectId(flux.client_id) ? flux.client_id : null }] 
        }).lean();

        let penaliteUnitaire = d.montant_penalite_unitaire || 0;
        let joursEcoules = Math.floor((new Date() - new Date(flux.created_at || Date.now())) / (1000 * 60 * 60 * 24));
        let totalLignePenalite = 0;

        if (d.quantite > 0) {
            if (d.regle_tarifaire_snapshot) {
                try {
                    const simulation = consignationRules.simulerPrixRemboursement(
                        d.packaging_id, 
                        flux.created_at, 
                        companyId, 
                        d.regle_tarifaire_snapshot
                    );
                    penaliteUnitaire = simulation.montant_penalite_unitaire;
                    joursEcoules = simulation.jours_ecoules;
                } catch (err) {
                    console.error(`Erreur recalcul pénalité flux ${flux.localId}:`, err);
                }
            }
            const qtePourCalcul = d.quantite_restante !== undefined ? d.quantite_restante : d.quantite;
            totalLignePenalite = (qtePourCalcul || 0) * penaliteUnitaire;
        } else {
            const qteRetourneeBrute = Math.abs(d.quantite || 0);
            totalLignePenalite = qteRetourneeBrute * penaliteUnitaire;
        }

        result.push({
            ...d,
            id_flux: flux.localId || flux._id.toString(),
            company_id: flux.company_id,
            sale_id: flux.sale_id,
            client_id: flux.client_id,
            client_nom: customer?.nom || 'CLIENT AU COMPTANT',
            type_flux: flux.type_flux,
            montant_total: flux.montant_total,
            reste_a_payer: flux.reste_a_payer,
            type_garantie: flux.type_garantie,
            montant_recu: flux.montant_recu,
            garantie_libelle: flux.garantie_libelle,
            statut: flux.statut,
            created_at: flux.created_at,
            emballage: packaging?.nom || 'Emballage',
            prix_unitaire: d.prix_unitaire || 0,
            montant_ligne: d.montant_ligne || 0,
            montant_penalite_unitaire: d.quantite > 0 ? penaliteUnitaire : d.montant_penalite_unitaire,
            numero_facture: sale?.lot_id || flux.sale_id || '---',
            jours_ecoules_reel: joursEcoules,
            montant_penalite_detail: totalLignePenalite
        });
    }

    // Calcul des totaux par flux
    const totauxParFlux = {};
    result.forEach(row => {
        if (!totauxParFlux[row.id_flux]) totauxParFlux[row.id_flux] = 0;
        totauxParFlux[row.id_flux] += row.montant_penalite_detail;
    });

    return result.map(row => {
        const totalFlux = totauxParFlux[row.id_flux] || 0;
        return {
            ...row,
            montant_penalite: totalFlux,
            tot_penalite: totalFlux
        };
    }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
};

exports.updateConsignation = async ({ companyId, userId, userName, fluxId, data }) => {
    const { items, montant_total, type_garantie, montant_recu, garantie_libelle } = data;

    const aDesRetours = await CloudFluxEmballageDetail.countDocuments({
        flux_id: fluxId,
        company_id: companyId.toString(),
        quantite: { $lt: 0 }
    });

    if (aDesRetours > 0) {
        throw new Error("Impossible de modifier cette consignation : des retours (déconsignations) ont déjà été enregistrés.");
    }

    if (!items || items.length === 0) throw new Error("La consignation doit contenir au moins un emballage.");
    
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const anciensDetails = await CloudFluxEmballageDetail.find({ flux_id: fluxId }).session(session);

        for (const detail of anciensDetails) {
            await CloudPackaging.updateOne(
                { 
                    $or: [{ localId: detail.packaging_id }, { _id: mongoose.isValidObjectId(detail.packaging_id) ? detail.packaging_id : null }],
                    company_id: companyId.toString() 
                },
                { $inc: { stock_actuel: detail.quantite, stock_consigne: -detail.quantite }, $set: { updated_at: new Date(), sync_status: 'synced' } }
            ).session(session);
        }

        await CloudFluxEmballageDetail.deleteMany({ flux_id: fluxId }).session(session);

        let totalCalcule = 0;
        for (const item of items) {
            const targetPackagingId = item.packaging_id || item.id;
            const qte = parseFloat(item.qte || item.quantite) || 0;
            const pxUnit = parseFloat(item.prix_unitaire || item.prix_consigne) || 0;
            const detailId = genererIdMouvement('DET');
            
            totalCalcule += (qte * pxUnit);

            const packaging = await CloudPackaging.findOne({ 
                $or: [{ localId: targetPackagingId }, { _id: mongoose.isValidObjectId(targetPackagingId) ? targetPackagingId : null }] 
            }).lean();

            const regleComplete = packaging?.rule_id ? await consignationRules.getRuleById(packaging.rule_id, companyId) : null;
            const calculs = consignationRules.simulerPrixRemboursement(
                targetPackagingId, new Date().toISOString(), companyId,
                regleComplete ? JSON.stringify(regleComplete) : null
            );

            await CloudFluxEmballageDetail.create([{
                localId: detailId,
                company_id: companyId.toString(),
                flux_id: fluxId,
                packaging_id: targetPackagingId,
                quantite: qte,
                quantite_restante: qte,
                prix_unitaire: pxUnit,
                montant_ligne: qte * pxUnit,
                montant_penalite_unitaire: calculs.montant_penalite_unitaire,
                regle_tarifaire_snapshot: regleComplete ? JSON.stringify(regleComplete) : null,
                sync_status: 'synced'
            }], { session });
            
            await CloudPackaging.updateOne(
                { 
                    $or: [{ localId: targetPackagingId }, { _id: mongoose.isValidObjectId(targetPackagingId) ? targetPackagingId : null }],
                    company_id: companyId.toString() 
                },
                { $inc: { stock_actuel: -qte, stock_consigne: qte }, $set: { updated_at: new Date(), sync_status: 'synced' } }
            ).session(session);
        }

        const finalMontantTotal = montant_total || totalCalcule;
        const finalTypeGarantie = type_garantie || 'ESPECES';
        const finalMontantRecu = finalTypeGarantie === 'PHYSIQUE' ? 0 : (parseFloat(montant_recu) || 0);
        const finalResteAPayer = finalTypeGarantie === 'PHYSIQUE' ? 0 : Math.max(0, finalMontantTotal - finalMontantRecu);
        const finalGarantieLibelle = finalTypeGarantie === 'PHYSIQUE' ? (garantie_libelle || "Pièce d'identité") : null;

        await CloudFluxEmballage.updateOne(
            { localId: fluxId, company_id: companyId.toString() },
            {
                $set: {
                    montant_total: finalMontantTotal,
                    type_garantie: finalTypeGarantie,
                    montant_recu: finalMontantRecu,
                    reste_a_payer: finalResteAPayer,
                    garantie_libelle: finalGarantieLibelle,
                    updated_at: new Date(),
                    sync_status: 'synced'
                }
            }
        ).session(session);

        await logAction({ 
            userId, 
            userName, 
            actionType: 'MODIFICATION', 
            tableConcernee: 'flux_emballages', 
            referenceId: fluxId, 
            description: finalTypeGarantie === 'PHYSIQUE'
                ? `Consignation mise à jour avec Garantie Physique : ${finalGarantieLibelle}`
                : `Consignation mise à jour (Reçu: ${finalMontantRecu} F, Reste: ${finalResteAPayer} F)`, 
            companyId: companyId.toString() 
        });

        await session.commitTransaction();
        session.endSession();
        return fluxId;
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        throw err;
    }
};

exports.deleteConsignation = async ({ companyId, userId, userName, fluxId }) => {
    const aDesRetours = await CloudFluxEmballageDetail.countDocuments({
        flux_id: fluxId,
        company_id: companyId.toString(),
        quantite: { $lt: 0 }
    });

    if (aDesRetours > 0) {
        throw new Error("Impossible de supprimer cette consignation : des retours (déconsignations) ont déjà été enregistrés.");
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const details = await CloudFluxEmballageDetail.find({ flux_id: fluxId }).session(session);

        for (const d of details) {
            await CloudPackaging.updateOne(
                { 
                    $or: [{ localId: d.packaging_id }, { _id: mongoose.isValidObjectId(d.packaging_id) ? d.packaging_id : null }],
                    company_id: companyId.toString() 
                },
                { $inc: { stock_actuel: d.quantite, stock_consigne: -d.quantite }, $set: { updated_at: new Date(), sync_status: 'synced' } }
            ).session(session);
        }
        
        await CloudFluxEmballageDetail.deleteMany({ flux_id: fluxId }).session(session);
        await CloudFluxEmballage.deleteOne({ localId: fluxId, company_id: companyId.toString() }).session(session);
        
        await logAction({ userId, userName, actionType: 'SUPPRESSION', tableConcernee: 'flux_emballages', referenceId: fluxId, description: `Consignation supprimée`, companyId: companyId.toString() });

        await session.commitTransaction();
        session.endSession();
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        throw err;
    }
};

exports.getConsignationById = async (companyId, fluxId) => {
    const header = await CloudFluxEmballage.findOne({ localId: fluxId, company_id: companyId.toString() }).lean();
    if (!header) return null;

    const sale = await CloudSale.findOne({ 
        $or: [{ localId: header.sale_id }, { _id: mongoose.isValidObjectId(header.sale_id) ? header.sale_id : null }] 
    }).lean();

    const items = await CloudFluxEmballageDetail.find({ flux_id: fluxId, company_id: companyId.toString() }).lean();

    const enrichedItems = [];
    for (const item of items) {
        const packaging = await CloudPackaging.findOne({ 
            $or: [{ localId: item.packaging_id }, { _id: mongoose.isValidObjectId(item.packaging_id) ? item.packaging_id : null }] 
        }).lean();

        enrichedItems.push({
            ...item,
            nom_emballage: packaging?.nom || 'Emballage'
        });
    }

    return {
        ...header,
        numero_facture: sale?.lot_id || header.sale_id, 
        items: enrichedItems
    };
};