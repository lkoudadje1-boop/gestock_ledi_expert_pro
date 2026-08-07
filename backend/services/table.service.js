const { getDb } = require('../config/database');
const { logAction } = require('../utils/auditHelper');

class TableService {
    /**
     * Valide le nom de la table pour éviter les injections SQL et protéger les tables systèmes
     */
    _validateTableName(tableName) {
        if (!/^[a-z0-9_]+$/i.test(tableName)) {
            throw new Error("Nom de table invalide ou non autorisé.");
        }
        // Blocage de sécurité pour empêcher la manipulation des tables système critiques via ce service générique
        const forbiddenTables = ['companies', 'users', 'sync_queue', 'audit_logs'];
        if (forbiddenTables.includes(tableName.toLowerCase())) {
            throw new Error(`Accès refusé : La table '${tableName}' est protégée et ne peut être modifiée par le service générique.`);
        }
    }

    /**
     * Récupère toutes les lignes actives d'une table pour une entreprise
     */
    findAll(tableName, companyId) {
        this._validateTableName(tableName);
        const db = getDb();
        
        try {
            return db.prepare(`
                SELECT * FROM ${tableName} 
                WHERE (company_id = ? OR company_id IS NULL) AND is_active = 1
            `).all(companyId);
        } catch (err) {
            return db.prepare(`
                SELECT * FROM ${tableName} 
                WHERE company_id = ? OR company_id IS NULL
            `).all(companyId);
        }
    }

    /**
     * Crée un enregistrement dynamique avec audit et file de synchronisation
     */
    async create(tableName, data, user) {
        this._validateTableName(tableName);
        const db = getDb();
        const { companyId, id: userId, username: userName } = user;
        
        // Verrous métiers
        if (tableName === 'restaurant_tables') {
            if (data.name) {
                const nomExiste = db.prepare(`SELECT id FROM restaurant_tables WHERE LOWER(name) = LOWER(?) AND company_id = ? AND is_active = 1`).get(data.name.trim(), companyId);
                if (nomExiste) throw new Error(`Le nom de table "${data.name}" est déjà utilisé.`);
            }
            if (data.numero) {
                const numeroExiste = db.prepare(`SELECT id FROM restaurant_tables WHERE numero = ? AND company_id = ? AND is_active = 1`).get(data.numero, companyId);
                if (numeroExiste) throw new Error(`Le numéro de table "${data.numero}" est déjà attribué.`);
            }
        }

        if (tableName === 'unites' && data.code) {
            const codeExiste = db.prepare(`SELECT id FROM unites WHERE LOWER(code) = LOWER(?) AND company_id = ? AND is_active = 1`).get(data.code.trim(), companyId);
            if (codeExiste) throw new Error(`Le code unité "${data.code.toUpperCase()}" existe déjà.`);
        }

        const prefix = tableName.substring(0, 3).toUpperCase();
        const id = `${prefix}-${Date.now().toString().slice(-6)}`;

        const rowData = { id, ...data, company_id: companyId, sync_status: 'pending' };
        const keys = Object.keys(rowData);
        const placeholders = keys.map(() => '?').join(', ');
        const values = Object.values(rowData);

        db.transaction(() => {
            db.prepare(`INSERT INTO ${tableName} (${keys.join(', ')}) VALUES (${placeholders})`).run(values);
            db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES (?, ?, 'INSERT', ?)`).run(tableName, id, companyId);
        })();

        logAction({ userId, userName, actionType: 'CREATE', tableConcernee: tableName, referenceId: id, description: `Insertion dynamique table [${tableName}]`, companyId });
        return id;
    }

    /**
     * Modifie un enregistrement dynamique
     */
    async update(tableName, id, data, user) {
        this._validateTableName(tableName);
        const db = getDb();
        const { companyId, id: userId, username: userName } = user;

        if (tableName === 'unites' && data.code) {
            const codeExiste = db.prepare(`SELECT id FROM unites WHERE LOWER(code) = LOWER(?) AND company_id = ? AND id != ? AND is_active = 1`).get(data.code.trim(), companyId, id);
            if (codeExiste) throw new Error(`Le code unité "${data.code.toUpperCase()}" est déjà attribué.`);
        }

        const rowData = { ...data };
        delete rowData.id;
        delete rowData.company_id;

        const keys = Object.keys(rowData);
        if (keys.length === 0) throw new Error("Aucune donnée à mettre à jour.");

        const setClause = keys.map(key => `${key} = ?`).join(', ') + ", sync_status = 'pending', updated_at = CURRENT_TIMESTAMP";
        const values = [...Object.values(rowData), id, companyId];

        db.transaction(() => {
            const existing = db.prepare(`SELECT id FROM ${tableName} WHERE id = ? AND company_id = ?`).get(id, companyId);
            if (!existing) throw new Error(`Enregistrement introuvable.`);

            db.prepare(`UPDATE ${tableName} SET ${setClause} WHERE id = ? AND company_id = ?`).run(values);
            db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES (?, ?, 'UPDATE', ?)`).run(tableName, id, companyId);
        })();

        logAction({ userId, userName, actionType: 'UPDATE', tableConcernee: tableName, referenceId: id, description: `Mise à jour dynamique table [${tableName}]`, companyId });
        return { success: true };
    }

    /**
     * Supprime ou désactive un enregistrement
     */
    async delete(tableName, id, user) {
        this._validateTableName(tableName);
        const db = getDb();
        const { companyId, id: userId, username: userName } = user;

        db.transaction(() => {
            const current = db.prepare(`SELECT id FROM ${tableName} WHERE id = ? AND company_id = ?`).get(id, companyId);
            if (!current) throw new Error("Enregistrement introuvable.");

            db.prepare(`DELETE FROM ${tableName} WHERE id = ? AND company_id = ?`).run(id, companyId);
            db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES (?, ?, 'DELETE', ?)`).run(tableName, id, companyId);
        })();

        logAction({ userId, userName, actionType: 'DELETE', tableConcernee: tableName, referenceId: id, description: `Suppression enregistrement ${id} [${tableName}]`, companyId });
        return { success: true };
    }
}

module.exports = new TableService();