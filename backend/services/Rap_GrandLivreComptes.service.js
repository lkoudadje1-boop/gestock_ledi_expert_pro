// backend/services/Rap_GrandLivreComptes.service.js
const { CloudLigneEcriture } = require('../models/cloud.model');

class GrandLivreComptesService {
    /**
     * Récupère et traite les données du Grand Livre via MongoDB Pipeline
     */
    async fetchGrandLivre(params) {
        const { typeGL, companyId, exerciceId, dateDebut, dateFin, deCompte, aCompte, deTiers, aTiers } = params;
        const cid = companyId.toString();

        const matchStage = {
            company_id: cid,
            exercice_id: exerciceId.toString(),
            is_deleted: { $ne: 1 },
            date_ecriture: {
                $gte: new Date(dateDebut),
                $lte: new Date(dateFin + 'T23:59:59.999Z')
            }
        };

        if (typeGL === 'GENERAL') {
            matchStage.num_compte = {
                $gte: deCompte || '0',
                $lte: aCompte || '99999999'
            };
        } else {
            matchStage.num_tiers = {
                $gte: deTiers || ' ',
                $lte: aTiers || 'ZZZZZZ'
            };
        }

        const pipeline = [
            { $match: matchStage },
            // Jointure avec les journaux
            {
                $lookup: {
                    from: 'cloud_journaux',
                    localField: 'journal_id',
                    foreignField: 'localId',
                    as: 'j'
                }
            },
            { $unwind: { path: '$j', preserveNullAndEmptyArrays: true } },
            // Jointure avec les exercices
            {
                $lookup: {
                    from: 'cloud_exercices',
                    localField: 'exercice_id',
                    foreignField: 'localId',
                    as: 'ex'
                }
            },
            { $unwind: { path: '$ex', preserveNullAndEmptyArrays: true } },
            // Tri chronologique et par compte / tiers
            {
                $sort: typeGL === 'GENERAL' 
                    ? { num_compte: 1, date_ecriture: 1, localId: 1 }
                    : { num_tiers: 1, date_ecriture: 1, localId: 1 }
            },
            // Projection des champs
            {
                $project: {
                    _id: 0,
                    id: '$localId',
                    date_ecriture: 1,
                    piece: 1,
                    facture: 1,
                    reference: 1,
                    libelle: 1,
                    debit: 1,
                    credit: 1,
                    lettre: 1,
                    num_compte: 1,
                    num_tiers: 1,
                    journal_id: 1,
                    exercice_id: 1,
                    code_journal: '$j.code',
                    type_journal: '$j.type_journal',
                    mode_numerotation: '$j.mode_numerotation',
                    date_debut_ex: '$ex.date_debut',
                    date_fin_ex: '$ex.date_fin'
                }
            }
        ];

        const rows = await CloudLigneEcriture.aggregate(pipeline);

        // --- REGROUPEMENT DU RAN ET CALCUL DES SOLDES ---
        let finalData = [];
        let dernierCle = null;
        let ranGrouped = null;

        rows.forEach(row => {
            const cle = typeGL === 'GENERAL' ? row.num_compte : row.num_tiers;
            const isRAN = row.type_journal === 'RAN' || row.code_journal === 'RAN';

            if (dernierCle !== cle) {
                dernierCle = cle;
                ranGrouped = null;
            }

            if (isRAN) {
                if (!ranGrouped) {
                    ranGrouped = { 
                        ...row, 
                        libelle: "SOLDE INITIAL (REPORT À NOUVEAU)",
                        debit: 0, 
                        credit: 0,
                        is_grouped_ran: true 
                    };
                    finalData.push(ranGrouped);
                }
                ranGrouped.debit += row.debit;
                ranGrouped.credit += row.credit;
            } else {
                finalData.push(row);
            }
        });

        // Calcul du solde cumulé
        let soldeFinal = 0;
        let lastCleSolde = null;

        return finalData.map(row => {
            const cle = typeGL === 'GENERAL' ? row.num_compte : row.num_tiers;
            if (lastCleSolde !== cle) {
                soldeFinal = 0;
                lastCleSolde = cle;
            }
            soldeFinal += (row.debit - row.credit);
            return { ...row, solde_cumule: soldeFinal };
        });
    }
}

module.exports = new GrandLivreComptesService();