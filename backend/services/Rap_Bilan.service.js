const { getDb } = require('../config/database');

class BilanService {
    /**
     * Récupère la balance brute (RAN + Mouvements filtrés)
     */
    getRawBalance(exerciceId, companyId, dateDebut, dateFin) {
        const db = getDb();
        const sql = `
            SELECT 
                p.numero_compte, 
                (SELECT IFNULL(SUM(montant_debit - montant_credit), 0) FROM reports_a_nouveau 
                 WHERE exercice_id = ? AND num_compte = p.numero_compte AND company_id = ?) as ran,
                IFNULL(SUM(l.debit), 0) as mov_debit,
                IFNULL(SUM(l.credit), 0) as mov_credit
            FROM plan_comptable p
            LEFT JOIN lignes_ecritures l ON p.numero_compte = l.num_compte 
                AND l.is_deleted = 0 
                AND l.exercice_id = ? 
                AND l.company_id = ?
                AND l.date_ecriture >= ? 
                AND l.date_ecriture <= ?
                AND l.journal_id NOT IN (SELECT id FROM journaux WHERE type_journal = 'RAN' OR code = 'RAN')
            WHERE p.company_id = ?
            GROUP BY p.numero_compte
        `;
        return db.prepare(sql).all(exerciceId, companyId, exerciceId, companyId, dateDebut, dateFin, companyId);
    }

    /**
     * Récupère les soldes nets de l'exercice précédent (N-1)
     */
    getPrevYearValues(exerciceId, companyId) {
        const db = getDb();
        let prevValues = {};
        const currentEx = db.prepare("SELECT date_debut FROM exercices WHERE id = ?").get(exerciceId);
        if (currentEx) {
            const prevEx = db.prepare("SELECT id FROM exercices WHERE company_id = ? AND date_debut < ? ORDER BY date_debut DESC LIMIT 1")
                             .get(companyId, currentEx.date_debut);
            if (prevEx) {
                db.prepare("SELECT num_compte, SUM(debit - credit) as net FROM lignes_ecritures WHERE exercice_id = ? AND is_deleted = 0 GROUP BY num_compte")
                  .all(prevEx.id).forEach(r => { prevValues[r.num_compte] = r.net; });
            }
        }
        return prevValues;
    }
}

module.exports = new BilanService();