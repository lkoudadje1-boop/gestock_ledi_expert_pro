const { getDb } = require('../config/database');

class GrandLivreComptesService {
    /**
     * Récupère et traite les données du Grand Livre
     */
    async fetchGrandLivre(params) {
        const db = getDb();
        const { typeGL, companyId, exerciceId, dateDebut, dateFin, deCompte, aCompte, deTiers, aTiers } = params;

        let sql = "";
        let queryParams = [];

        if (typeGL === 'GENERAL') {
            sql = `
                SELECT 
                    e.id, e.date_ecriture, e.piece, e.facture, e.reference, e.libelle, 
                    e.debit, e.credit, e.lettre, e.num_compte, e.num_tiers, e.journal_id, e.exercice_id,
                    j.code as code_journal, j.type_journal, j.mode_numerotation,
                    ex.date_debut as date_debut_ex, ex.date_fin as date_fin_ex
                FROM lignes_ecritures e
                JOIN journaux j ON e.journal_id = j.id
                JOIN exercices ex ON e.exercice_id = ex.id
                WHERE e.company_id = ? AND e.exercice_id = ? AND e.is_deleted = 0
                AND e.date_ecriture BETWEEN ? AND ?
                AND e.num_compte BETWEEN ? AND ?
                ORDER BY e.num_compte ASC, e.date_ecriture ASC, e.id ASC
            `;
            queryParams = [companyId, exerciceId, dateDebut, dateFin, deCompte || '0', aCompte || '99999999'];
        } else {
            sql = `
                SELECT 
                    e.*, j.code as code_journal, j.type_journal, j.mode_numerotation,
                    ex.date_debut as date_debut_ex, ex.date_fin as date_fin_ex
                FROM lignes_ecritures e
                JOIN journaux j ON e.journal_id = j.id
                JOIN exercices ex ON e.exercice_id = ex.id
                WHERE e.company_id = ? AND e.exercice_id = ? AND e.is_deleted = 0
                AND e.date_ecriture BETWEEN ? AND ?
                AND e.num_tiers BETWEEN ? AND ?
                ORDER BY e.num_tiers ASC, e.date_ecriture ASC, e.id ASC
            `;
            queryParams = [companyId, exerciceId, dateDebut, dateFin, deTiers || ' ', aTiers || 'ZZZZZZ'];
        }

        const rows = db.prepare(sql).all(...queryParams);

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