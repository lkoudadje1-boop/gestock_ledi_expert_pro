const { getDb } = require('../config/database');
const { logAction } = require('../utils/auditHelper');

/**
 * Génère un ID unique basé sur un préfixe, le timestamp et un sel aléatoire
 */
const genererIdLocal = (prefix) => {
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 100).toString().padStart(2, '0');
    return `${prefix}-${timestamp}${random}`;
};

// --- LOGIQUE DE CRÉATION / MISE À JOUR ---
exports.processConfig = async (data, context) => {
    const db = getDb();
    const { id, compte_general_id, mode_saisie, montant_base, repartitions, description } = data;
    const { companyId, userId, userName } = context;

    // 1. RÉCUPÉRER L'ID TECHNIQUE DU COMPTE GÉNÉRAL
    const account = db.prepare(`
        SELECT id, numero_compte 
        FROM plan_comptable 
        WHERE numero_compte = ? AND company_id = ?
    `).get(compte_general_id, companyId);

    if (!account) {
        throw new Error(`Compte ${compte_general_id} introuvable.`);
    }

    // 2. VALIDATION MATHÉMATIQUE
    const totalSaisi = Math.round(Object.values(repartitions).reduce((sum, val) => sum + (parseFloat(val) || 0), 0) * 100) / 100;

    if (mode_saisie === 'AUTO' && Math.abs(totalSaisi - 100) > 0.01) {
        throw new Error(`En mode AUTO, le total doit être de 100% (Actuel: ${totalSaisi}%)`);
    }

    // --- TRANSACTION ATOMIQUE ---
    return db.transaction(() => {
        // A. Identifier si une config existe déjà
        const existingConfig = db.prepare('SELECT id FROM analytique_config_comptes WHERE compte_general_id = ? AND company_id = ?').get(account.id, companyId);
        const config_id_to_use = existingConfig ? existingConfig.id : (id || genererIdLocal('CONF'));

        // B. UPSERT de la configuration parente
        db.prepare(`
            INSERT INTO analytique_config_comptes (
                id, company_id, compte_general_id, mode_saisie, montant_base, description, sync_status, is_deleted
            ) VALUES (?, ?, ?, ?, ?, ?, 'pending', 0)
            ON CONFLICT(compte_general_id, company_id) DO UPDATE SET
                mode_saisie = EXCLUDED.mode_saisie,
                montant_base = EXCLUDED.montant_base,
                description = EXCLUDED.description,
                updated_at = CURRENT_TIMESTAMP,
                sync_status = 'pending',
                is_deleted = 0
        `).run(
            config_id_to_use, 
            companyId, 
            account.id, 
            mode_saisie, 
            mode_saisie === 'MANUEL' ? montant_base : null,
            description || null
        );

        // 🔄 Inscription de la configuration parente dans la file de synchronisation Cloud
        db.prepare(`
            INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
            VALUES ('analytique_config_comptes', ?, ?, ?)
        `).run(config_id_to_use, existingConfig ? 'UPDATE' : 'INSERT', companyId);

        // C. NETTOYAGE : Enregistrement des suppressions dans la file de synchro avant purge
        const oldLines = db.prepare(`SELECT id FROM analytique_auto_repartition WHERE config_id = ?`).all(config_id_to_use);
        const syncQueueStmt = db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES (?, ?, 'DELETE', ?)`);
        oldLines.forEach(l => syncQueueStmt.run('analytique_auto_repartition', l.id, companyId));

        db.prepare(`DELETE FROM analytique_auto_repartition WHERE config_id = ?`).run(config_id_to_use);

        // D. INSERTION des nouvelles lignes
        const insertLine = db.prepare(`
            INSERT INTO analytique_auto_repartition (
                id, config_id, plan_analytique_id, company_id, pourcentage, montant, sync_status
            ) VALUES (?, ?, ?, ?, ?, ?, 'pending')
        `);

        const syncInsertLine = db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('analytique_auto_repartition', ?, 'INSERT', ?)`);

        for (const [sub_id, valeur] of Object.entries(repartitions)) {
            const valNum = parseFloat(valeur) || 0;
            if (valNum > 0) {
                const lineId = genererIdLocal('LIG');
                insertLine.run(
                    lineId,
                    config_id_to_use,
                    sub_id,
                    companyId,
                    mode_saisie === 'AUTO' ? valNum : null,
                    mode_saisie === 'MANUEL' ? valNum : null
                );
                syncInsertLine.run(lineId, companyId);
            }
        }

        // E. LOG D'AUDIT
        logAction({
            userId, userName,
            actionType: existingConfig ? 'MODIFICATION' : 'INSERTION',
            tableConcernee: 'analytique_config_comptes',
            referenceId: config_id_to_use,
            description: `${existingConfig ? 'Mise à jour' : 'Création'} règle analytique pour ${account.numero_compte} (${mode_saisie})`,
            companyId: companyId
        });

        return config_id_to_use;
    })();
};

// --- RÉCUPÉRER L'HISTORIQUE ---
exports.fetchConfigs = async (companyId) => {
    const db = getDb();
    const rows = db.prepare(`
        SELECT c.*, pc.numero_compte as compte_num, pc.intitule as compte_intitule
        FROM analytique_config_comptes c
        JOIN plan_comptable pc ON c.compte_general_id = pc.id
        WHERE c.company_id = ? AND c.is_deleted = 0
        ORDER BY pc.numero_compte ASC
    `).all(companyId);

    return rows.map(row => {
        const lines = db.prepare(`
            SELECT r.plan_analytique_id, r.pourcentage, r.montant, 
                   p.libelle, p.parent_dept_id as dept_id
            FROM analytique_auto_repartition r
            JOIN plan_analytique p ON r.plan_analytique_id = p.id
            WHERE r.config_id = ?
        `).all(row.id);

        const repartitions = {};
        const details_plans = {};

        lines.forEach(l => {
            repartitions[l.plan_analytique_id] = row.mode_saisie === 'AUTO' ? l.pourcentage : l.montant;
            details_plans[l.plan_analytique_id] = { libelle: l.libelle, dept_id: l.dept_id };
        });

        return { 
            ...row, 
            compte_general_id: row.compte_num, 
            repartitions, 
            details_plans 
        };
    });
};

// --- SUPPRIMER UNE RÈGLE ---
exports.removeConfig = async (id, context) => {
    const db = getDb();
    const { companyId, userId, userName } = context;

    return db.transaction(() => {
        db.prepare(`
            UPDATE analytique_config_comptes 
            SET is_deleted = 1, sync_status = 'pending', updated_at = CURRENT_TIMESTAMP 
            WHERE id = ? AND company_id = ?
        `).run(id, companyId);

        // 🔄 Inscription de la mise à jour (soft delete) dans la file de synchronisation Cloud
        db.prepare(`
            INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
            VALUES ('analytique_config_comptes', ?, 'UPDATE', ?)
        `).run(id, companyId);

        logAction({
            userId, userName,
            actionType: 'SUPPRESSION',
            tableConcernee: 'analytique_config_comptes',
            referenceId: id,
            description: `Suppression (archivage) règle analytique technique ID: ${id}`,
            companyId: companyId
        });
    })();
};