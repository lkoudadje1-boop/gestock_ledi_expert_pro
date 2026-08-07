const { getDb } = require('../config/database');

class BalanceTiersService {
    /**
     * Calcule la balance des tiers (Ouverture RAN + Mouvements période)
     */
    async fetchBalanceTiers(params, companyId) {
        const db = getDb();
        const { exerciceId, dateDebut, dateFin } = params;

        // 1. Récupérer les dates par défaut de l'exercice
        const exInfo = db.prepare("SELECT date_debut, date_fin FROM exercices WHERE id = ?").get(exerciceId);
        if (!exInfo) throw new Error("Exercice introuvable");

        const fDateDebut = dateDebut || exInfo.date_debut;
        const fDateFin = dateFin || exInfo.date_fin;

        // 2. Requête SQL alignée sur la logique RAN et Mouvements
        const sql = `
            SELECT 
                t.numero_tiers as num_tiers, 
                t.nom as nom_tiers,
                -- 🚀 1. OUVERTURE (Venu du RAN N-1)
                (
                    SELECT IFNULL(SUM(montant_debit - montant_credit), 0) 
                    FROM reports_a_nouveau 
                    WHERE exercice_id = ? 
                      AND num_tiers = t.numero_tiers 
                      AND company_id = ?
                ) as solde_ouverture,

                -- 🚀 2. MOUVEMENTS DE LA PÉRIODE (Année N)
                IFNULL(SUM(CASE WHEN l.date_ecriture BETWEEN ? AND ? THEN l.debit ELSE 0 END), 0) as mov_debit,
                IFNULL(SUM(CASE WHEN l.date_ecriture BETWEEN ? AND ? THEN l.credit ELSE 0 END), 0) as mov_credit
            FROM plan_tiers t
            LEFT JOIN lignes_ecritures l ON t.numero_tiers = l.num_tiers 
                AND l.is_deleted = 0 
                AND l.exercice_id = ?
                AND l.company_id = ?
                -- Protection contre les doublons RAN (On ne compte pas les écritures de report comme mouvements)
                AND l.journal_id NOT IN (SELECT id FROM journaux WHERE type_journal = 'RAN' OR code = 'RAN')
            WHERE t.company_id = ?
            GROUP BY t.numero_tiers, t.nom
            HAVING solde_ouverture != 0 OR mov_debit != 0 OR mov_credit != 0
            ORDER BY t.numero_tiers ASC
        `;

        const rows = db.prepare(sql).all(
            exerciceId, companyId,            // Sous-select RAN
            fDateDebut, fDateFin,             // mov_debit
            fDateDebut, fDateFin,             // mov_credit
            exerciceId, companyId, companyId  // JOIN et WHERE
        );

        // 3. Formatage pour les colonnes de la balance (Antérieur, Période, Cumulé)
        return rows.map(row => {
            const ant_d = row.solde_ouverture > 0 ? row.solde_ouverture : 0;
            const ant_c = row.solde_ouverture < 0 ? Math.abs(row.solde_ouverture) : 0;
            const mov_d = row.mov_debit || 0;
            const mov_c = row.mov_credit || 0;
            
            const cumulTotal = (ant_d + mov_d) - (ant_c + mov_c);
            const diffPer = mov_d - mov_c;

            return {
                num_tiers: row.num_tiers,
                nom_tiers: row.nom_tiers,
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