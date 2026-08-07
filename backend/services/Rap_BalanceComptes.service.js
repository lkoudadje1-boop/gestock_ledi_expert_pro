const { getDb } = require('../config/database');

class BalanceComptesService {
    /**
     * Calcule la balance générale (Ouverture N-1 + Mouvements N)
     */
    async getBalanceData(params, companyId) {
        const db = getDb();
        const { exerciceId, dateDebut, dateFin } = params;

        const exInfo = db.prepare("SELECT date_debut, date_fin FROM exercices WHERE id = ?").get(exerciceId);
        if (!exInfo) throw new Error("Exercice introuvable");

        const fDateDebut = dateDebut || exInfo.date_debut;
        const fDateFin = dateFin || exInfo.date_fin;

        const sql = `
            SELECT 
                p.numero_compte, 
                p.intitule,
                (
                    SELECT IFNULL(SUM(montant_debit - montant_credit), 0) 
                    FROM reports_a_nouveau 
                    WHERE exercice_id = ? 
                      AND num_compte = p.numero_compte 
                      AND company_id = ?
                ) as solde_ouverture,
                IFNULL(SUM(CASE WHEN l.date_ecriture BETWEEN ? AND ? THEN l.debit ELSE 0 END), 0) as mov_debit,
                IFNULL(SUM(CASE WHEN l.date_ecriture BETWEEN ? AND ? THEN l.credit ELSE 0 END), 0) as mov_credit
            FROM plan_comptable p
            LEFT JOIN lignes_ecritures l ON p.numero_compte = l.num_compte 
                AND l.is_deleted = 0 
                AND l.exercice_id = ?
                AND l.company_id = ?
                AND l.journal_id NOT IN (SELECT id FROM journaux WHERE type_journal = 'RAN' OR code = 'RAN')
            WHERE p.company_id = ?
            GROUP BY p.numero_compte, p.intitule
            HAVING solde_ouverture != 0 OR mov_debit != 0 OR mov_credit != 0
            ORDER BY p.numero_compte ASC
        `;

        const rows = db.prepare(sql).all(
            exerciceId, companyId, 
            fDateDebut, fDateFin,   
            fDateDebut, fDateFin,   
            exerciceId, companyId, companyId    
        );

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
        const db = getDb();
        const sql = `
            SELECT 
                l.num_compte as numero_compte,
                p.intitule as intitule_compte,
                l.num_tiers,
                COALESCE(
                    (SELECT nom FROM clients WHERE nif = l.num_tiers AND company_id = ?),
                    (SELECT nom FROM fournisseurs WHERE nif = l.num_tiers AND company_id = ?),
                    (SELECT libelle FROM others_tiers WHERE code = l.num_tiers AND company_id = ?),
                    l.num_tiers
                ) as intitule_tiers,
                SUM(l.debit) as total_debit,
                SUM(l.credit) as total_credit
            FROM lignes_ecritures l
            JOIN plan_comptable p ON l.num_compte = p.numero_compte AND l.company_id = p.company_id
            WHERE l.exercice_id = ? 
              AND l.company_id = ? 
              AND l.is_deleted = 0
              AND l.num_compte GLOB '[1-5]*'
            GROUP BY l.num_compte, l.num_tiers
            HAVING (total_debit - total_credit) != 0
            ORDER BY l.num_compte ASC, l.num_tiers ASC
        `;

        const rows = db.prepare(sql).all(companyId, companyId, companyId, exerciceId, companyId);

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