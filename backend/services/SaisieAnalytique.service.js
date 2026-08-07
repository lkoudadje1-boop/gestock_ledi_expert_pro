const { getDb } = require('../config/database');

class SaisieAnalytiqueService {
    /**
     * Génère un ID unique LANA
     */
    generateLanaId() {
        const timestamp = Date.now().toString().slice(-6);
        const random = Math.floor(Math.random() * 100).toString().padStart(2, '0');
        return `LANA-${timestamp}${random}`;
    }

    /**
     * Valide l'équilibre entre le montant comptable et la ventilation analytique
     */
    checkEquilibre(montantComptable, repartitions) {
        const totalVentile = Math.round(repartitions.reduce((sum, r) => sum + parseFloat(r.montant || 0), 0) * 100) / 100;
        const attendu = Math.round(montantComptable * 100) / 100;
        return {
            isEquilibre: Math.abs(attendu - totalVentile) <= 0.01,
            attendu,
            totalVentile
        };
    }

    /**
     * Résout le département ID (prend celui de la ligne ou le fallback du plan analytique)
     */
    resolveDepartement(db, row, companyId) {
        let finalDeptId = row.departement_id;

        if (!finalDeptId || finalDeptId === 'DEPT-INCONNU') {
            const fallback = db.prepare(`SELECT parent_dept_id FROM plan_analytique WHERE id = ? AND company_id = ?`).get(row.plan_analytique_id, companyId);
            finalDeptId = fallback ? fallback.parent_dept_id : null;
        }

        const exists = db.prepare(`SELECT id FROM departements WHERE id = ? AND company_id = ?`).get(finalDeptId, companyId);
        if (!exists) {
            throw new Error(`Le département pour la section ${row.plan_analytique_id} est invalide.`);
        }
        return finalDeptId;
    }

    /**
     * Enregistre ou met à jour les ventilations analytiques pour une écriture / ligne comptable
     * avec traçabilité complète dans la sync_queue (Cloud).
     */
    saveVentilation(ligneEcritureId, montantComptable, repartitions, companyId) {
        const db = getDb();

        // 1. Validation de l'équilibre
        const equilibre = this.checkEquilibre(montantComptable, repartitions);
        if (!equilibre.isEquilibre) {
            throw new Error(`Déséquilibre analytique : Le montant total ventilé (${equilibre.totalVentile}) ne correspond pas au montant comptable (${equilibre.attendu}).`);
        }

        return db.transaction(() => {
            const stmtSync = db.prepare(`
                INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
                VALUES ('lignes_analytiques', ?, ?, ?)
            `);

            // 2. Nettoyage préventif des anciennes ventilations pour cette ligne d'écriture (avec DELETE pour le Cloud)
            const oldLignes = db.prepare(`SELECT id FROM lignes_analytiques WHERE ligne_ecriture_id = ? AND company_id = ?`).all(ligneEcritureId, companyId);
            for (const old of oldLignes) {
                stmtSync.run(old.id, 'DELETE', companyId);
            }
            db.prepare(`DELETE FROM lignes_analytiques WHERE ligne_ecriture_id = ? AND company_id = ?`).run(ligneEcritureId, companyId);

            // 3. Insertion des nouvelles ventilations
            const insertStmt = db.prepare(`
                INSERT INTO lignes_analytiques (
                    id, ligne_ecriture_id, plan_analytique_id, departement_id, montant, company_id, sync_status
                ) VALUES (?, ?, ?, ?, ?, ?, 'pending')
            `);

            for (const rep of repartitions) {
                const lanaId = this.generateLanaId();
                const resolvedDeptId = this.resolveDepartement(db, rep, companyId);
                const montantVal = Math.round((parseFloat(rep.montant) || 0) * 100) / 100;

                if (montantVal > 0) {
                    insertStmt.run(
                        lanaId,
                        ligneEcritureId,
                        rep.plan_analytique_id,
                        resolvedDeptId,
                        montantVal,
                        companyId
                    );

                    stmtSync.run(lanaId, 'INSERT', companyId);
                }
            }

            return { success: true, count: repartitions.length };
        })();
    }
}

module.exports = new SaisieAnalytiqueService();