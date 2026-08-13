// backend/services/Rap_BalanceComptes.service.js
const { CloudExercice, CloudPlanComptable, CloudReportANouveau, CloudLigneEcriture, CloudJournal } = require('../models/cloud.model');

class BalanceComptesService {
    /**
     * Calcule la balance générale (Ouverture N-1 + Mouvements N)
     */
    async getBalanceData(params, companyId) {
        const { exerciceId, dateDebut, dateFin } = params;
        const cid = companyId.toString();

        const exInfo = await CloudExercice.findOne({ localId: exerciceId.toString(), company_id: cid }).lean();
        if (!exInfo) throw new Error("Exercice introuvable");

        const fDateDebut = dateDebut || exInfo.date_debut;
        const fDateFin = dateFin || exInfo.date_fin;

        // Récupération des IDs des journaux de type RAN ou code RAN à exclure
        const ranJournaux = await CloudJournal.find({
            company_id: cid,
            $or: [{ type_journal: 'RAN' }, { code: 'RAN' }]
        }, { localId: 1 }).lean();
        const ranJournalIds = ranJournaux.map(j => j.localId);

        // Pipeline Mongoose pour calculer la balance générale des comptes
        const rows = await CloudPlanComptable.aggregate([
            { $match: { company_id: cid } },
            // Lookup des reports à nouveau (solde d'ouverture)
            {
                $lookup: {
                    from: 'cloud_report_a_nouveaus',
                    let: { cptNum: '$numero_compte', cid: cid, exId: exerciceId.toString() },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ['$exercice_id', '$$exId'] },
                                        { $eq: ['$num_compte', '$$cptNum'] },
                                        { $eq: ['$company_id', '$$cid'] }
                                    ]
                                }
                            }
                        },
                        {
                            $group: {
                                _id: null,
                                total: { $sum: { $subtract: ['$montant_debit', '$montant_credit'] } }
                            }
                        }
                    ],
                    as: 'ran_data'
                }
            },
            // Lookup des lignes d'écritures pour les mouvements de la période
            {
                $lookup: {
                    from: 'cloud_ligne_ecritures',
                    let: { cptNum: '$numero_compte', cid: cid, exId: exerciceId.toString(), dStart: new Date(fDateDebut), dEnd: new Date(fDateFin + 'T23:59:59.999Z'), excludedJournals: ranJournalIds },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ['$num_compte', '$$cptNum'] },
                                        { $eq: ['$company_id', '$$cid'] },
                                        { $eq: ['$exercice_id', '$$exId'] },
                                        { $ne: ['$is_deleted', 1] },
                                        { $gte: ['$date_ecriture', '$$dStart'] },
                                        { $lte: ['$date_ecriture', '$$dEnd'] },
                                        { $not: { $in: ['$journal_id', '$$excludedJournals'] } }
                                    ]
                                }
                            }
                        },
                        {
                            $group: {
                                _id: null,
                                mov_debit: { $sum: '$debit' },
                                mov_credit: { $sum: '$credit' }
                            }
                        }
                    ],
                    as: 'mouvements'
                }
            },
            {
                $addFields: {
                    solde_ouverture: { $ifNull: [{ $arrayElemAt: ['$ran_data.total', 0] }, 0] },
                    mov_debit: { $ifNull: [{ $arrayElemAt: ['$mouvements.mov_debit', 0] }, 0] },
                    mov_credit: { $ifNull: [{ $arrayElemAt: ['$mouvements.mov_credit', 0] }, 0] }
                }
            },
            {
                $match: {
                    $or: [
                        { solde_ouverture: { $ne: 0 } },
                        { mov_debit: { $ne: 0 } },
                        { mov_credit: { $ne: 0 } }
                    ]
                }
            },
            { $sort: { numero_compte: 1 } },
            {
                $project: {
                    numero_compte: 1,
                    intitule: 1,
                    solde_ouverture: 1,
                    mov_debit: 1,
                    mov_credit: 1
                }
            }
        ]);

        return rows.map(row => {
            const ant_d = row.solde_ouverture > 0 ? row.solde_ouverture : 0;
            const ant_c = row.solde_ouverture < 0 ? Math.abs(row.solde_ouverture) : 0;
            const mov_d = row.mov_debit || 0;
            const mov_c = row.mov_credit || 0;
            
            const cumulTotal = (ant_d + mov_d) - (ant_c + mov_c);
            const diffPer = mov_d - mov_c;

            return {
                numero_compte: row.numero_compte,
                intitule: row.intitule,
                mouv_ant_debit: ant_d, 
                mouv_ant_credit: ant_c,
                mouv_periode_debit: mov_d, 
                mouv_periode_credit: mov_c,
                solde_periode_debit: diffPer > 0 ? diffPer : 0,
                solde_periode_credit: diffPer < 0 ? Math.abs(diffPer) : 0,
                solde_cumule_debit: cumulTotal > 0 ? cumulTotal : 0,
                solde_cumule_credit: cumulTotal < 0 ? Math.abs(cumulTotal) : 0
            };
        });
    }

    /**
     * Calcule le bilan détaillé par tiers (Comptes 1 à 5)
     */
    async getBilanTiers(exerciceId, companyId) {
        const cid = companyId.toString();

        const rows = await CloudLigneEcriture.aggregate([
            {
                $match: {
                    exercice_id: exerciceId.toString(),
                    company_id: cid,
                    is_deleted: { $ne: 1 },
                    num_compte: { $regex: /^[1-5]/ }
                }
            },
            {
                $group: {
                    _id: { numero_compte: '$num_compte', num_tiers: '$num_tiers' },
                    total_debit: { $sum: '$debit' },
                    total_credit: { $sum: '$credit' }
                }
            },
            {
                $match: {
                    $expr: { $ne: [{ $subtract: ['$total_debit', '$total_credit'] }, 0] }
                }
            },
            {
                $lookup: {
                    from: 'cloud_plan_comptable',
                    let: { cptNum: '$_id.numero_compte', cid: cid },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ['$numero_compte', '$$cptNum'] },
                                        { $eq: ['$company_id', '$$cid'] }
                                    ]
                                }
                            }
                        }
                    ],
                    as: 'compte'
                }
            },
            { $unwind: { path: '$compte', preserveNullAndEmptyArrays: true } },
            // Lookup pour récupérer l'intitulé du tiers à travers les entités de clients, fournisseurs ou autres
            {
                $lookup: {
                    from: 'cloud_customers',
                    let: { tierNif: '$_id.num_tiers', cid: cid },
                    pipeline: [
                        { $match: { $expr: { $and: [{ $eq: ['$nif', '$$tierNif'] }, { $eq: ['$company_id', '$$cid'] }] } } }
                    ],
                    as: 'client'
                }
            },
            {
                $lookup: {
                    from: 'cloud_suppliers',
                    let: { tierNif: '$_id.num_tiers', cid: cid },
                    pipeline: [
                        { $match: { $expr: { $and: [{ $eq: ['$nif', '$$tierNif'] }, { $eq: ['$company_id', '$$cid'] }] } } }
                    ],
                    as: 'supplier'
                }
            },
            {
                $lookup: {
                    from: 'cloud_others_tiers',
                    let: { tierCode: '$_id.num_tiers', cid: cid },
                    pipeline: [
                        { $match: { $expr: { $and: [{ $eq: ['$localId', '$$tierCode'] }, { $eq: ['$company_id', '$$cid'] }] } } }
                    ],
                    as: 'other'
                }
            },
            {
                $addFields: {
                    intitule_tiers: {
                        $cond: {
                            if: { $gt: [{ $size: '$client' }, 0] },
                            then: { $arrayElemAt: ['$client.nom', 0] },
                            else: {
                                $cond: {
                                    if: { $gt: [{ $size: '$supplier' }, 0] },
                                    then: { $arrayElemAt: ['$supplier.nom', 0] },
                                    else: {
                                        $cond: {
                                            if: { $gt: [{ $size: '$other' }, 0] },
                                            then: { $arrayElemAt: ['$other.nom', 0] },
                                            else: '$_id.num_tiers'
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            {
                $project: {
                    numero_compte: '$_id.numero_compte',
                    intitule_compte: { $ifNull: ['$compte.intitule', ''] },
                    num_tiers: '$_id.num_tiers',
                    intitule_tiers: 1,
                    total_debit: 1,
                    total_credit: 1
                }
            },
            { $sort: { numero_compte: 1, num_tiers: 1 } }
        ]);

        return rows.map(row => {
            const solde = row.total_debit - row.total_credit;
            return {
                numero_compte: row.numero_compte,
                intitule: row.intitule_compte,
                num_tiers: row.num_tiers,
                intitule_tiers: row.intitule_tiers,
                solde_cumule_debit: solde > 0 ? solde : 0,
                solde_cumule_credit: solde < 0 ? Math.abs(solde) : 0
            };
        });
    }
}

module.exports = new BalanceComptesService();