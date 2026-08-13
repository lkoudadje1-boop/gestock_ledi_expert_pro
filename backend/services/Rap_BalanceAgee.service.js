// backend/services/Rap_BalanceAgee.service.js
const { CloudPlanTiers, CloudLigneEcriture } = require('../models/cloud.model');

class BalanceAgeeService {
    /**
     * Récupère les données de la balance âgée avec calcul des tranches de retard (MongoDB Pipeline)
     */
    async fetchBalanceAgee(filters, companyId) {
        const { exerciceId, typeTiers, datePivot } = filters;
        const pivotDate = new Date(datePivot || Date.now());

        const matchStage = {
            company_id: companyId.toString(),
            exercice_id: exerciceId.toString(),
            is_deleted: { $ne: 1 }
        };

        const tierMatch = {
            company_id: companyId.toString()
        };

        if (typeTiers && typeTiers !== 'TOUT') {
            tierMatch.type_tiers = typeTiers;
        }

        const pipeline = [
            { $match: matchStage },
            {
                $lookup: {
                    from: 'cloud_plan_tiers',
                    let: { tierNum: '$num_tiers', cid: companyId.toString() },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ['$numero_tiers', '$$tierNum'] },
                                        { $eq: ['$company_id', '$$cid'] },
                                        ...(typeTiers && typeTiers !== 'TOUT' ? [{ $eq: ['$type_tiers', typeTiers] }] : [])
                                    ]
                                }
                            }
                        }
                    ],
                    as: 'tier'
                }
            },
            { $unwind: '$tier' },
            {
                $addFields: {
                    netAmount: { $subtract: ['$debit', '$credit'] },
                    // Calcul de la différence en jours entre la date pivot et la date d'échéance
                    diffDays: {
                        $cond: {
                            if: { $and: ['$date_echeance', { $ne: ['$date_echeance', null] }] },
                            then: {
                                $divide: [
                                    { $subtract: [pivotDate, { $toDate: '$date_echeance' }] },
                                    1000 * 60 * 60 * 24
                                ]
                            },
                            then: 0
                        }
                    }
                }
            },
            {
                $group: {
                    _id: {
                        numero_tiers: '$tier.numero_tiers',
                        nom: '$tier.nom',
                        type_tiers: '$tier.type_tiers'
                    },
                    solde: { $sum: '$netAmount' },
                    non_echu: {
                        $sum: {
                            $cond: [{ $gte: ['$diffDays', 0] }, '$netAmount', 0]
                        }
                    },
                    tranche_1_30: {
                        $sum: {
                            $cond: [{ $and: [{ $gte: ['$diffDays', 1] }, { $lte: ['$diffDays', 30] }] }, '$netAmount', 0]
                        }
                    },
                    tranche_31_45: {
                        $sum: {
                            $cond: [{ $and: [{ $gte: ['$diffDays', 31] }, { $lte: ['$diffDays', 45] }] }, '$netAmount', 0]
                        }
                    },
                    tranche_46_60: {
                        $sum: {
                            $cond: [{ $and: [{ $gte: ['$diffDays', 46] }, { $lte: ['$diffDays', 60] }] }, '$netAmount', 0]
                        }
                    },
                    tranche_plus_61: {
                        $sum: {
                            $cond: [{ $gt: ['$diffDays', 60] }, '$netAmount', 0]
                        }
                    }
                }
            },
            {
                $match: {
                    $expr: { $gt: [{ $abs: '$solde' }, 0.01] }
                }
            },
            {
                $project: {
                    _id: 0,
                    num_tiers: '$_id.numero_tiers',
                    nom_tiers: '$_id.nom',
                    type_tiers: '$_id.type_tiers',
                    solde: { $round: ['$solde', 2] },
                    non_echu: { $round: ['$non_echu', 2] },
                    tranche_1_30: { $round: ['$tranche_1_30', 2] },
                    tranche_31_45: { $round: ['$tranche_31_45', 2] },
                    tranche_46_60: { $round: ['$tranche_46_60', 2] },
                    tranche_plus_61: { $round: ['$tranche_plus_61', 2] }
                }
            },
            { $sort: { num_tiers: 1 } }
        ];

        return await CloudLigneEcriture.aggregate(pipeline);
    }
}

module.exports = new BalanceAgeeService();