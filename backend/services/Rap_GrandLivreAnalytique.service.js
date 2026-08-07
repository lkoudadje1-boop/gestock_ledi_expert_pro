const { getDb } = require('../config/database');

class GrandLivreAnalytiqueService {
    /**
     * Récupère les lignes analytiques avec calcul de solde progressif
     */
    async fetchGrandLivre(params) {
        const db = getDb();
        const { companyId, exerciceId, dateDebut, dateFin, deSection, aSection } = params;

        const queryParams = [companyId, companyId, exerciceId, dateDebut, dateFin];
        
        let sql = `
            SELECT 
                la.id,
                la.montant,
                la.num_compte,
                la.plan_analytique_id,
                la.ligne_ecriture_id,
                e.date_ecriture,
                e.piece,
                e.facture,
                e.reference,
                e.exercice_id,
                e.journal_id,
                e.libelle as libelle_ecriture,
                pa.code as code_section,
                pa.libelle as libelle_section,
                pc.intitule as intitule_compte,
                pc.id as compte_id,
                j.code as code_journal,
                j.type_journal,
                ex.date_debut as date_debut_ex,
                ex.date_fin as date_fin_ex
            FROM lignes_analytiques la
            JOIN lignes_ecritures e ON la.ligne_ecriture_id = e.id
            JOIN plan_analytique pa ON la.plan_analytique_id = pa.id
            JOIN journaux j ON e.journal_id = j.id
            JOIN exercices ex ON e.exercice_id = ex.id
            LEFT JOIN plan_comptable pc ON la.num_compte = pc.numero_compte AND pc.company_id = ?
            WHERE la.company_id = ?
              AND e.exercice_id = ?
              AND e.date_ecriture BETWEEN ? AND ?
              AND e.is_deleted = 0
        `;

        if (deSection) {
            sql += ` AND pa.code >= ?`;
            queryParams.push(deSection);
        }
        if (aSection) {
            sql += ` AND pa.code <= ?`;
            queryParams.push(aSection);
        }

        sql += ` ORDER BY pa.code ASC, la.num_compte ASC, e.date_ecriture ASC`;

        const rows = db.prepare(sql).all(...queryParams);

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