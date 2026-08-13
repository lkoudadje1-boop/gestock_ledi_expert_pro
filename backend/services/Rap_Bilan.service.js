// backend/services/Rap_Bilan.service.js
const { 
    CloudExercice, 
    CloudPlanComptable, 
    CloudReportANouveau, 
    CloudLigneEcriture, 
    CloudJournal 
} = require('../models/cloud.model');

class BilanService {
    /**
     * Récupère la balance brute (RAN + Mouvements filtrés) via Pipeline Mongoose
     */
    async getRawBalance(exerciceId, companyId, dateDebut, dateFin) {
        const cid = companyId.toString();

        // Récupérer les IDs des journaux de type RAN ou code RAN pour les exclure
        const ranJournaux = await CloudJournal.find({
            company_id: cid,
            $or: [{ type_journal: 'RAN' }, { code: 'RAN' }]
        }, { localId: 1 }).lean();
        const ranJournalIds = ranJournaux.map(j => j.localId);

        const rows = await CloudPlanComptable.aggregate([
            { $match: { company_id: cid } },
            // 1. Lookup pour les reports à nouveau (RAN)
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
            // 2. Lookup pour les mouvements de la période
            {
                $lookup: {
                    from: 'cloud_ligne_ecritures',
                    let: { 
                        cptNum: '$numero_compte', 
                        cid: cid, 
                        exId: exerciceId.toString(), 
                        dStart: new Date(dateDebut), 
                        dEnd: new Date(dateFin + 'T23:59:59.999Z'), 
                        excludedJournals: ranJournalIds 
                    },
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
                    ran: { $ifNull: [{ $arrayElemAt: ['$ran_data.total', 0] }, 0] },
                    mov_debit: { $ifNull: [{ $arrayElemAt: ['$mouvements.mov_debit', 0] }, 0] },
                    mov_credit: { $ifNull: [{ $arrayElemAt: ['$mouvements.mov_credit', 0] }, 0] }
                }
            },
            { $sort: { numero_compte: 1 } },
            {
                $project: {
                    _id: 0,
                    numero_compte: 1,
                    ran: 1,
                    mov_debit: 1,
                    mov_credit: 1
                }
            }
        ]);

        return rows;
    }

    /**
     * Récupère les soldes nets de l'exercice précédent (N-1)
     */
    async getPrevYearValues(exerciceId, companyId) {
        const cid = companyId.toString();
        let prevValues = {};

        const currentEx = await CloudExercice.findOne({ localId: exerciceId.toString(), company_id: cid }).lean();
        if (currentEx) {
            const prevEx = await CloudExercice.findOne({
                company_id: cid,
                date_debut: { $lt: currentEx.date_debut }
            }).sort({ date_debut: -1 }).lean();

            if (prevEx) {
                const prevLines = await CloudLigneEcriture.aggregate([
                    {
                        $match: {
                            exercice_id: prevEx.localId,
                            company_id: cid,
                            is_deleted: { $ne: 1 }
                        }
                    },
                    {
                        $group: {
                            _id: '$num_compte',
                            net: { $sum: { $subtract: ['$debit', '$credit'] } }
                        }
                    }
                ]);

                prevLines.forEach(r => {
                    prevValues[r._id] = r.net;
                });
            }
        }
        return prevValues;
    }

    /**
     * Calcule le résultat net N (Comptes [6-7] et 8)
     */
    async getCalculResultatNetN(exerciceId, companyId, dateDebut, dateFin) {
        const cid = companyId.toString();

        const ranJournaux = await CloudJournal.find({
            company_id: cid,
            $or: [{ type_journal: 'RAN' }, { code: 'RAN' }]
        }, { localId: 1 }).lean();
        const ranJournalIds = ranJournaux.map(j => j.localId);

        const res = await CloudPlanComptable.aggregate([
            {
                $match: {
                    company_id: cid,
                    $or: [
                        { numero_compte: { $regex: /^[67]/ } },
                        { numero_compte: { $regex: /^8/ } }
                    ]
                }
            },
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
                    as: 'ran'
                }
            },
            {
                $lookup: {
                    from: 'cloud_ligne_ecritures',
                    let: { 
                        cptNum: '$numero_compte', 
                        cid: cid, 
                        exId: exerciceId.toString(), 
                        dStart: new Date(dateDebut), 
                        dEnd: new Date(dateFin + 'T23:59:59.999Z'), 
                        excludedJournals: ranJournalIds 
                    },
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
                                total: { $sum: { $subtract: ['$debit', '$credit'] } }
                            }
                        }
                    ],
                    as: 'mov'
                }
            },
            {
                $project: {
                    solde: {
                        $add: [
                            { $ifNull: [{ $arrayElemAt: ['$ran.total', 0] }, 0] },
                            { $ifNull: [{ $arrayElemAt: ['$mov.total', 0] }, 0] }
                        ]
                    }
                }
            },
            {
                $group: {
                    _id: null,
                    solde_global: { $sum: '$solde' }
                }
            }
        ]);

        return res.length > 0 ? (res[0].solde_global || 0) : 0;
    }

    /**
     * Calcule le résultat net N-1 (via RAN de gestion)
     */
    async getCalculResultatNetN1(exerciceId, companyId) {
        const cid = companyId.toString();

        const res = await CloudReportANouveau.aggregate([
            {
                $match: {
                    exercice_id: exerciceId.toString(),
                    company_id: cid,
                    $or: [
                        { num_compte: { $regex: /^[67]/ } },
                        { num_compte: { $regex: /^8/ } }
                    ]
                }
            },
            {
                $group: {
                    _id: null,
                    solde_ran_gestion: { $sum: { $subtract: ['$montant_debit', '$montant_credit'] } }
                }
            }
        ]);

        return res.length > 0 ? (res[0].solde_ran_gestion || 0) : 0;
    }
}

module.exports = new BilanService();