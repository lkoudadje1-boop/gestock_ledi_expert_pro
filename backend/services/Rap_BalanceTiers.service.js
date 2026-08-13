// backend/services/Rap_BalanceTiers.service.js
const { CloudExercice, CloudPlanTiers, CloudReportANouveau, CloudLigneEcriture, CloudJournal } = require('../models/cloud.model');

class BalanceTiersService {
    /**
     * Calcule la balance des tiers (Ouverture RAN + Mouvements période) via MongoDB Pipeline
     */
    async fetchBalanceTiers(params, companyId) {
        const { exerciceId, dateDebut, dateFin } = params;
        const cid = companyId.toString();

        // 1. Récupérer les dates par défaut de l'exercice
        const exInfo = await CloudExercice.findOne({ localId: exerciceId.toString(), company_id: cid }).lean();
        if (!exInfo) throw new Error("Exercice introuvable");

        const fDateDebut = dateDebut || exInfo.date_debut;
        const fDateFin = dateFin || exInfo.date_fin;

        // 2. Identifier les journaux de type RAN ou code RAN pour les exclure des mouvements de la période
        const ranJournaux = await CloudJournal.find({
            company_id: cid,
            $or: [{ type_journal: 'RAN' }, { code: 'RAN' }]
        }, { localId: 1 }).lean();
        const ranJournalIds = ranJournaux.map(j => j.localId);

        // 3. Pipeline d'agrégation MongoDB (Remplace la requête SQL complexe)
        const rows = await CloudPlanTiers.aggregate([
            { $match: { company_id: cid } },
            // 🚀 1. OUVERTURE (Venu du RAN N-1)
            {
                $lookup: {
                    from: 'cloud_report_a_nouveaus',
                    let: { numTiers: '$numero_tiers', cid: cid, exId: exerciceId.toString() },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ['$exercice_id', '$$exId'] },
                                        { $eq: ['$num_tiers', '$$numTiers'] },
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
            // 🚀 2. MOUVEMENTS DE LA PÉRIODE (Année N)
            {
                $lookup: {
                    from: 'cloud_ligne_ecritures',
                    let: { 
                        numTiers: '$numero_tiers', 
                        cid: cid, 
                        exId: exerciceId.toString(), 
                        dStart: new Date(fDateDebut), 
                        dEnd: new Date(fDateFin + 'T23:59:59.999Z'), 
                        excludedJournals: ranJournalIds 
                    },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ['$num_tiers', '$$numTiers'] },
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
            // Extraction des valeurs des lookups
            {
                $addFields: {
                    solde_ouverture: { $ifNull: [{ $arrayElemAt: ['$ran_data.total', 0] }, 0] },
                    mov_debit: { $ifNull: [{ $arrayElemAt: ['$mouvements.mov_debit', 0] }, 0] },
                    mov_credit: { $ifNull: [{ $arrayElemAt: ['$mouvements.mov_credit', 0] }, 0] }
                }
            },
            // HAVING solde_ouverture != 0 OR mov_debit != 0 OR mov_credit != 0
            {
                $match: {
                    $or: [
                        { solde_ouverture: { $ne: 0 } },
                        { mov_debit: { $ne: 0 } },
                        { mov_credit: { $ne: 0 } }
                    ]
                }
            },
            { $sort: { numero_tiers: 1 } },
            {
                $project: {
                    _id: 0,
                    numero_tiers: 1,
                    nom: 1,
                    solde_ouverture: 1,
                    mov_debit: 1,
                    mov_credit: 1
                }
            }
        ]);

        // 4. Formatage pour les colonnes de la balance (Antérieur, Période, Cumulé)
        return rows.map(row => {
            const ant_d = row.solde_ouverture > 0 ? row.solde_ouverture : 0;
            const ant_c = row.solde_ouverture < 0 ? Math.abs(row.solde_ouverture) : 0;
            const mov_d = row.mov_debit || 0;
            const mov_c = row.mov_credit || 0;
            
            const cumulTotal = (ant_d + mov_d) - (ant_c + mov_c);
            const diffPer = mov_d - mov_c;

            return {
                num_tiers: row.numero_tiers,
                nom_tiers: row.nom,
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
}

module.exports = new BalanceTiersService();