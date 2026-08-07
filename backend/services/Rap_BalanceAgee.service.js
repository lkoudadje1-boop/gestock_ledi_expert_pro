const { getDb } = require('../config/database');

class BalanceAgeeService {
    /**
     * Récupère les données de la balance âgée avec calcul des tranches de retard
     */
    async fetchBalanceAgee(filters, companyId) {
        const db = getDb();
        const { exerciceId, typeTiers, datePivot } = filters;

        // Gestion du filtre dynamique par type de tiers
        let typeFilter = "";
        const queryParams = [datePivot, datePivot, datePivot, datePivot, datePivot, companyId, exerciceId];
        
        if (typeTiers && typeTiers !== 'TOUT') {
            typeFilter = `AND pt.type_tiers = ?`;
            queryParams.push(typeTiers);
        }

        const sql = `
            SELECT 
                pt.numero_tiers as num_tiers,
                pt.nom as nom_tiers,
                pt.type_tiers,
                ROUND(SUM(l.debit - l.credit), 2) as solde,
                
                -- 1. NON ÉCHU : Échéance >= Date Pivot
                ROUND(SUM(CASE WHEN l.date_echeance >= ? THEN (l.debit - l.credit) ELSE 0 END), 2) as non_echu,

                -- 2. Tranche 1-30j : Retard entre 1 et 30 jours
                ROUND(SUM(CASE WHEN (julianday(?) - julianday(l.date_echeance)) BETWEEN 1 AND 30 
                    THEN (l.debit - l.credit) ELSE 0 END), 2) as tranche_1_30,

                -- 3. Tranche 31-45j : Retard entre 31 et 45 jours
                ROUND(SUM(CASE WHEN (julianday(?) - julianday(l.date_echeance)) BETWEEN 31 AND 45 
                    THEN (l.debit - l.credit) ELSE 0 END), 2) as tranche_31_45,

                -- 4. Tranche 46-60j : Retard entre 46 et 60 jours
                ROUND(SUM(CASE WHEN (julianday(?) - julianday(l.date_echeance)) BETWEEN 46 AND 60 
                    THEN (l.debit - l.credit) ELSE 0 END), 2) as tranche_46_60,

                -- 5. Tranche +61j : Retard strictement supérieur à 60 jours
                ROUND(SUM(CASE WHEN (julianday(?) - julianday(l.date_echeance)) > 60 
                    THEN (l.debit - l.credit) ELSE 0 END), 2) as tranche_plus_61

            FROM plan_tiers pt
            JOIN lignes_ecritures l ON pt.numero_tiers = l.num_tiers
            WHERE l.company_id = ? 
              AND l.exercice_id = ? 
              AND l.is_deleted = 0
              ${typeFilter}
            GROUP BY pt.numero_tiers, pt.nom, pt.type_tiers
            HAVING ABS(SUM(l.debit - l.credit)) > 0.01
            ORDER BY pt.numero_tiers ASC
        `;

        return db.prepare(sql).all(...queryParams);
    }
}

module.exports = new BalanceAgeeService();