// backend/services/cloturevente.service.js
const mongoose = require('mongoose');
const { 
    CloudPayment, CloudClotureCaisse, CloudClotureDetailPaiement, 
    CloudSale, CloudSaleItem, CloudAuditLog 
} = require('../models/cloud.model');

/**
 * On vérifie s'il y a de l'argent encaissé non clôturé
 */
exports.checkSessionActive = async (companyId, userId) => {
    const count = await CloudPayment.countDocuments({
        company_id: companyId.toString(),
        $or: [{ caissier_id: userId.toString() }, { user_id: userId.toString() }],
        $or: [{ cloture_id: { $exists: false } }, { is_cloture: 0 }],
        is_active: 1,
        type_paiement: { $ne: 'REMBOURSEMENT' }
    });
    return count > 0;
};

/**
 * Récupère l'état théorique (Ventes + Recouvrements)
 */
exports.getEtatTheoriqueActuel = async (companyId, caissierId) => {
    return await CloudPayment.aggregate([
        { 
            $match: { 
                company_id: companyId.toString(),
                $or: [{ created_by: caissierId.toString() }, { user_id: caissierId.toString() }],
                cloture_id: { $exists: false }
            } 
        },
        {
            $group: {
                _id: "$moyen_paiement",
                theorique: { $sum: "$montant" }
            }
        },
        {
            $project: {
                _id: 0,
                mode: "$_id",
                theorique: 1
            }
        }
    ]);
};

exports.validerCloture = async (data, context) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { id, solde_ouverture, total_theorique_global, total_reel_global, details, observation } = data;
        const { companyId, userId, userName } = context;

        // 1. Enregistrement Clôture
        await CloudClotureCaisse.create([{
            localId: id,
            caissier_id: userId,
            solde_ouverture: Number(solde_ouverture || 0),
            total_theorique_global: Number(total_theorique_global || 0),
            total_reel_global: Number(total_reel_global || 0),
            ecart_global: Number(total_reel_global || 0) - Number(total_theorique_global || 0),
            statut: 'VALIDE',
            observation: observation || "Clôture de session journalière",
            company_id: companyId.toString(),
            created_by: userName,
            sync_status: 'synced'
        }], { session });

        // 2. Enregistrement Détails
        for (const d of details) {
            await CloudClotureDetailPaiement.create([{
                cloture_id: id,
                payment_method_id: d.payment_method_id,
                montant_theorique: Number(d.montant_theorique || 0),
                montant_reel: Number(d.montant_reel || 0),
                commentaire_detaille: d.commentaire_detaille || null,
                company_id: companyId.toString(),
                created_by: userName,
                sync_status: 'synced'
            }], { session });
        }

        // 3. Mise à jour verrouillage (Paiements et Ventes)
        await CloudPayment.updateMany(
            { 
                company_id: companyId.toString(),
                $or: [{ caissier_id: userId }, { user_id: userId }],
                is_cloture: 0 
            },
            { $set: { is_cloture: 1, cloture_id: id, sync_status: 'synced' } },
            { session }
        );

        await CloudSaleItem.updateMany(
            { 
                company_id: companyId.toString(),
                is_cloture: 0 
            },
            { $set: { is_cloture: 1, sync_status: 'synced' } },
            { session }
        );

        // 4. Audit
        await CloudAuditLog.create([{
            localId: `LOG-${Date.now()}`,
            user_id: userId,
            user_name: userName,
            action_type: 'INSERTION',
            table_concernee: 'clotures_caisse',
            reference_id: id,
            description: `Clôture validée. Écart global: ${Number(total_reel_global) - Number(total_theorique_global)}`,
            company_id: companyId.toString(),
            sync_status: 'synced'
        }], { session });

        await session.commitTransaction();
        session.endSession();
        return id;
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        throw err;
    }
};

/**
 * Historique avec agrégation
 */
exports.getHistory = async (companyId) => {
    return await CloudClotureCaisse.aggregate([
        { $match: { company_id: companyId.toString() } },
        { $sort: { createdAt: -1 } },
        {
            $lookup: {
                from: 'cloture_details_paiements',
                localField: 'localId',
                foreignField: 'cloture_id',
                as: 'tous_details'
            }
        }
    ]);
};

/**
 * Récupération sessions actives
 */
exports.getSessionsActives = async (companyId) => {
    // Agrégation simplifiée pour le front
    return await CloudPayment.aggregate([
        { 
            $match: { 
                company_id: companyId.toString(),
                $or: [{ cloture_id: { $exists: false } }, { is_cloture: 0 }] 
            } 
        },
        {
            $group: {
                _id: "$caissier_id",
                attendu: { $sum: "$montant" }
            }
        }
    ]);
};