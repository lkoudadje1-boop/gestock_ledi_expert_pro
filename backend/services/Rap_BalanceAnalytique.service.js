const { getDb } = require('../config/database');

class BalanceAnalytiqueService {
    /**
     * Calcule la balance analytique avec totaux par section
     */
    async getBalanceData(filters, companyId) {
        const db = getDb();
        const { exerciceId, dateDebut, dateFin } = filters;

        const sql = `
            SELECT 
                pa.code as code_section,
                pa.libelle as intitule_section,
                la.num_compte,
                pc.intitule as intitule_compte,
                SUM(la.montant) as mouv_debit, 
                0 as mouv_credit, 
                SUM(la.montant) as solde,
                (
                    SELECT SUM(la2.montant) 
                    FROM lignes_analytiques la2
                    JOIN lignes_ecritures le2 ON la2.ligne_ecriture_id = le2.id
                    JOIN exercices ex ON le2.exercice_id = ex.id
                    WHERE la2.plan_analytique_id = pa.id 
                      AND la2.num_compte = la.num_compte
                      AND ex.date_debut < (SELECT date_debut FROM exercices WHERE id = ?)
                      AND la2.company_id = ?
                      AND le2.is_deleted = 0
                ) as solde_prec
            FROM lignes_analytiques la
            JOIN plan_analytique pa ON la.plan_analytique_id = pa.id
            LEFT JOIN plan_comptable pc ON la.num_compte = pc.numero_compte AND pc.company_id = ?
            JOIN lignes_ecritures le ON la.ligne_ecriture_id = le.id
            WHERE la.company_id = ? 
              AND le.exercice_id = ?
              AND le.date_ecriture BETWEEN ? AND ?
              AND le.is_deleted = 0
            GROUP BY pa.id, la.num_compte
            ORDER BY pa.code ASC, la.num_compte ASC
        `;

        const rows = db.prepare(sql).all(exerciceId, companyId, companyId, companyId, exerciceId, dateDebut, dateFin);

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