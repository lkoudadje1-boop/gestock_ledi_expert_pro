const { getDb } = require('../config/database');

class SaisieAnalytiqueBrouillonService {
    /**
     * Génère un ID unique (BR-LANA-XXXXXX)
     */
    generateBrLanaId() {
        const timestamp = Date.now().toString().slice(-6);
        const random = Math.floor(Math.random() * 100).toString().padStart(2, '0');
        return `BR-LANA-${timestamp}${random}`;
    }

    /**
     * Valide l'équilibre entre le montant de la ligne et le total ventilé
     */
    validerEquilibre(montantTheorique, repartitions) {
        const totalVentile = Math.round(repartitions.reduce((sum, r) => sum + parseFloat(r.montant || 0), 0) * 100) / 100;
        const attendu = Math.round(montantTheorique * 100) / 100;
        
        return {
            isEquilibre: Math.abs(attendu - totalVentile) <= 0.01,
            attendu,
            totalVentile
        };
    }

    /**
     * Résout le département ID (priorité saisie, sinon fallback plan) avec isolation multi-tenant
     */
    resolveDeptId(db, row, companyId) {
        let finalDeptId = row.departement_id;
        if (!finalDeptId || finalDeptId === 'DEPT-INCONNU') {
            const fallback = db.prepare(`SELECT parent_dept_id FROM plan_analytique WHERE id = ? AND company_id = ?`).get(row.plan_analytique_id, companyId);
            finalDeptId = fallback ? fallback.parent_dept_id : null;
        }

        const checkExist = db.prepare(`SELECT id FROM departements WHERE id = ? AND company_id = ?`).get(finalDeptId, companyId);
        if (!checkExist) {
            throw new Error(`Département invalide pour la section ${row.plan_analytique_id}`);
        }
        return finalDeptId;
    }

    /**
     * Enregistre ou met à jour les ventilations analytiques sous forme de brouillon
     * avec traçabilité complète dans la sync_queue (Cloud).
     */
    saveBrouillonVentilation(brouillonLigneId, montantTheorique, repartitions, companyId) {
        const db = getDb();

        // 1. Validation de l'équilibre
        const equilibre = this.validerEquilibre(montantTheorique, repartitions);
        if (!equilibre.isEquilibre) {
            throw new Error(`Déséquilibre analytique (Brouillon) : Le montant total ventilé (${equilibre.totalVentile}) ne correspond pas au montant attendu (${equilibre.attendu}).`);
        }

        return db.transaction(() => {
            const stmtSync = db.prepare(`
                INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
                VALUES ('lignes_analytiques_brouillons', ?, ?, ?)
            `);

            // 2. Nettoyage préventif des anciens brouillons pour cette ligne (avec DELETE pour le Cloud)
            const oldBrouillons = db.prepare(`SELECT id FROM lignes_analytiques_brouillons WHERE brouillon_ligne_id = ? AND company_id = ?`).all(brouillonLigneId, companyId);
            for (const old of oldBrouillons) {
                stmtSync.run(old.id, 'DELETE', companyId);
            }
            db.prepare(`DELETE FROM lignes_analytiques_brouillons WHERE brouillon_ligne_id = ? AND company_id = ?`).run(brouillonLigneId, companyId);

            // 3. Insertion des nouveaux paliers de brouillon
            const insertStmt = db.prepare(`
                INSERT INTO lignes_analytiques_brouillons (
                    id, brouillon_ligne_id, plan_analytique_id, departement_id, montant, company_id, sync_status
                ) VALUES (?, ?, ?, ?, ?, ?, 'pending')
            `);

            for (const rep of repartitions) {
                const brLanaId = this.generateBrLanaId();
                const resolvedDeptId = this.resolveDeptId(db, rep, companyId);
                const montantVal = Math.round((parseFloat(rep.montant) || 0) * 100) / 100;

                if (montantVal > 0) {
                    insertStmt.run(
                        brLanaId,
                        brouillonLigneId,
                        rep.plan_analytique_id,
                        resolvedDeptId,
                        montantVal,
                        companyId
                    );

                    stmtSync.run(brLanaId, 'INSERT', companyId);
                }
            }

            return { success: true, count: repartitions.length };
        })();
    }
}

module.exports = new SaisieAnalytiqueBrouillonService();