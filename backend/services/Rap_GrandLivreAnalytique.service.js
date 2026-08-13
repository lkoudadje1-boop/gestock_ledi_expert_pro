// backend/services/Rap_GrandLivreAnalytique.service.js
const { CloudLigneAnalytique } = require('../models/cloud.model');

class GrandLivreAnalytiqueService {
    /**
     * Récupère les lignes analytiques avec calcul de solde progressif via MongoDB Pipeline
     */
    async fetchGrandLivre(params) {
        const { companyId, exerciceId, dateDebut, dateFin, deSection, aSection } = params;
        const cid = companyId.toString();

        const matchStage = {
            company_id: cid
        };

        const pipeline = [
            { $match: matchStage },
            // Jointure avec les lignes d'écritures
            {
                $lookup: {
                    from: 'cloud_ligne_ecritures',
                    localField: 'ligne_ecriture_id',
                    foreignField: 'localId',
                    as: 'e'
                }
            },
            { $unwind: '$e' },
            {
                $match: {
                    'e.company_id': cid,
                    'e.exercice_id': exerciceId.toString(),
                    'e.date_ecriture': {
                        $gte: new Date(dateDebut),
                        $lte: new Date(dateFin + 'T23:59:59.999Z')
                    },
                    'e.is_deleted': { $ne: 1 }
                }
            },
            // Jointure avec le plan analytique
            {
                $lookup: {
                    from: 'cloud_plan_analytique',
                    localField: 'plan_analytique_id',
                    foreignField: 'localId',
                    as: 'pa'
                }
            },
            { $unwind: '$pa' },
            // Filtres optionnels sur le code de section (deSection / aSection)
            ...(deSection || aSection ? [{
                $match: {
                    'pa.code': {
                        ...(deSection ? { $gte: deSection } : {}),
                        ...(aSection ? { $lte: aSection } : {})
                    }
                }
            }] : []),
            // Jointure avec les journaux
            {
                $lookup: {
                    from: 'cloud_journaux',
                    localField: 'e.journal_id',
                    foreignField: 'localId',
                    as: 'j'
                }
            },
            { $unwind: { path: '$j', preserveNullAndEmptyArrays: true } },
            // Jointure avec les exercices
            {
                $lookup: {
                    from: 'cloud_exercices',
                    localField: 'e.exercice_id',
                    foreignField: 'localId',
                    as: 'ex'
                }
            },
            { $unwind: { path: '$ex', preserveNullAndEmptyArrays: true } },
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
                    as: 'pc'
                }
            },
            { $unwind: { path: '$pc', preserveNullAndEmptyArrays: true } },
            // Tri initial pour garantir l'ordre chronologique et par section/compte
            {
                $sort: {
                    'pa.code': 1,
                    'num_compte': 1,
                    'e.date_ecriture': 1
                }
            },
            // Projection finale des champs correspondants
            {
                $project: {
                    _id: 0,
                    id: '$localId',
                    montant: 1,
                    num_compte: 1,
                    plan_analytique_id: 1,
                    ligne_ecriture_id: 1,
                    date_ecriture: '$e.date_ecriture',
                    piece: '$e.piece',
                    facture: '$e.facture',
                    reference: '$e.reference',
                    exercice_id: '$e.exercice_id',
                    journal_id: '$e.journal_id',
                    libelle_ecriture: '$e.libelle',
                    code_section: '$pa.code',
                    libelle_section: '$pa.libelle',
                    intitule_compte: '$pc.intitule',
                    compte_id: '$pc.localId',
                    code_journal: '$j.code',
                    type_journal: '$j.type_journal',
                    date_debut_ex: '$ex.date_debut',
                    date_fin_ex: '$ex.date_fin'
                }
            }
        ];

        const rows = await CloudLigneAnalytique.aggregate(pipeline);

        // --- CALCUL DU SOLDE CUMULÉ ---
        let soldeCourant = 0;
        let dernierCle = null;

        return rows.map(row => {
            const cleActuelle = `${row.code_section}-${row.num_compte}`;
            
            // Si on change de section ou de compte, on réinitialise le cumul
            if (dernierCle !== cleActuelle) {
                soldeCourant = 0;
                dernierCle = cleActuelle;
            }
            
            soldeCourant += row.montant;
            return { ...row, solde_cumule: soldeCourant };
        });
    }
}

module.exports = new GrandLivreAnalytiqueService();