// backend/services/Rap_BalanceAnalytique.service.js
const { CloudLigneAnalytique } = require('../models/cloud.model');
const mongoose = require('mongoose');

class BalanceAnalytiqueService {
    /**
     * Calcule la balance analytique avec totaux par section (MongoDB Pipeline)
     */
    async getBalanceData(filters, companyId) {
        const { exerciceId, dateDebut, dateFin } = filters;
        const cid = companyId.toString();

        // Récupération de la date de début de l'exercice cible pour le calcul du solde précédent
        const targetExercice = await mongoose.model('CloudExercice').findOne({ localId: exerciceId.toString(), company_id: cid }).lean();
        const dateDebutExercice = targetExercice ? new Date(targetExercice.date_debut) : new Date(dateDebut);

        const pipeline = [
            { $match: { company_id: cid } },
            // Jointure avec les lignes d'écritures
            {
                $lookup: {
                    from: 'cloud_ligne_ecritures',
                    localField: 'ligne_ecriture_id',
                    foreignField: 'localId',
                    as: 'ecriture_ligne'
                }
            },
            { $unwind: '$ecriture_ligne' },
            {
                $match: {
                    'ecriture_ligne.company_id': cid,
                    'ecriture_ligne.exercice_id': exerciceId.toString(),
                    'ecriture_ligne.date_ecriture': {
                        $gte: new Date(dateDebut),
                        $lte: new Date(dateFin + 'T23:59:59.999Z')
                    },
                    'ecriture_ligne.is_deleted': { $ne: 1 }
                }
            },
            // Jointure avec le plan analytique
            {
                $lookup: {
                    from: 'cloud_plan_analytique',
                    localField: 'plan_analytique_id',
                    foreignField: 'localId',
                    as: 'plan'
                }
            },
            { $unwind: '$plan' },
            // Jointure avec le plan comptable
            {
                $lookup: {
                    from: 'cloud_plan_comptable',
                    let: { numCpt: '$num_compte', cid: cid },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ['$numero_compte', '$$numCpt'] },
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
            // Lookup pour les soldes précédents (exercices antérieurs)
            {
                $lookup: {
                    from: 'cloud_ligne_analytiques',
                    let: { planId: '$plan_analytique_id', cptNum: '$num_compte', cid: cid, limitDate: dateDebutExercice },
                    pipeline: [
                        {
                            $lookup: {
                                from: 'cloud_ligne_ecritures',
                                localField: 'ligne_ecriture_id',
                                foreignField: 'localId',
                                as: 'le2'
                            }
                        },
                        { $unwind: '$le2' },
                        {
                            $lookup: {
                                from: 'cloud_exercices',
                                localField: 'le2.exercice_id',
                                foreignField: 'localId',
                                as: 'ex'
                            }
                        },
                        { $unwind: '$ex' },
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ['$plan_analytique_id', '$$planId'] },
                                        { $eq: ['$num_compte', '$$cptNum'] },
                                        { $eq: ['$company_id', '$$cid'] },
                                        { $lt: ['$ex.date_debut', '$$limitDate'] },
                                        { $ne: ['$le2.is_deleted', 1] }
                                    ]
                                }
                            }
                        },
                        {
                            $group: {
                                _id: null,
                                total: { $sum: '$montant' }
                            }
                        }
                    ],
                    as: 'solde_prec_calc'
                }
            },
            {
                $addFields: {
                    solde_prec: {
                        $ifNull: [{ $arrayElemAt: ['$solde_prec_calc.total', 0] }, 0]
                    }
                }
            },
            // Groupement par section et numéro de compte
            {
                $group: {
                    _id: {
                        code_section: '$plan.code',
                        intitule_section: '$plan.libelle',
                        num_compte: '$num_compte'
                    },
                    intitule_compte: { $first: '$compte.intitule' },
                    mouv_debit: { $sum: '$montant' },
                    solde: { $sum: '$montant' },
                    solde_prec: { $first: '$solde_prec' }
                }
            },
            {
                $project: {
                    _id: 0,
                    code_section: '$_id.code_section',
                    intitule_section: '$_id.intitule_section',
                    num_compte: '$_id.num_compte',
                    intitule_compte: { $ifNull: ['$intitule_compte', ''] },
                    mouv_debit: 1,
                    mouv_credit: 0,
                    solde: 1,
                    solde_prec: 1
                }
            },
            { $sort: { code_section: 1, num_compte: 1 } }
        ];

        const rows = await CloudLigneAnalytique.aggregate(pipeline);

        // --- Structuration des données avec lignes de totaux par section ---
        const finalData = [];
        let currentSection = null;
        let sectionTotals = { debit: 0, credit: 0, solde: 0, solde_prec: 0 };

        rows.forEach((row, index) => {
            // Si on change de section, on insère le total de la section précédente
            if (currentSection && currentSection !== row.code_section) {
                finalData.push({
                    is_total_section: true,
                    code_section: currentSection,
                    intitule_section: rows[index - 1].intitule_section,
                    mouv_debit: sectionTotals.debit,
                    mouv_credit: sectionTotals.credit,
                    solde: sectionTotals.solde,
                    solde_prec: sectionTotals.solde_prec
                });
                sectionTotals = { debit: 0, credit: 0, solde: 0, solde_prec: 0 };
            }

            currentSection = row.code_section;
            sectionTotals.debit += row.mouv_debit;
            sectionTotals.credit += row.mouv_credit;
            sectionTotals.solde += row.solde;
            sectionTotals.solde_prec += (row.solde_prec || 0);

            finalData.push(row);

            // Pour la toute dernière section
            if (index === rows.length - 1) {
                finalData.push({
                    is_total_section: true,
                    code_section: currentSection,
                    intitule_section: row.intitule_section,
                    mouv_debit: sectionTotals.debit,
                    mouv_credit: sectionTotals.credit,
                    solde: sectionTotals.solde,
                    solde_prec: sectionTotals.solde_prec
                });
            }
        });

        return finalData;
    }
}

module.exports = new BalanceAnalytiqueService();