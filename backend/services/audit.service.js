const { getDb } = require('../config/database');

class AuditService {
    async findLogs(params) {
        const db = getDb();
        const { companyId, type, table, limit } = params;

        // On définit proprement la limite pour éviter le NaN
        const cleanLimit = parseInt(limit) || 100;

        let sqlParams = [companyId];
        let sql = `
            SELECT 
                id, 
                date_action, 
                user_name, 
                action_type, 
                table_concernee, 
                reference_id, 
                description
            FROM audit_log 
            WHERE company_id = ?
        `;

        if (type && type !== 'all') {
            sql += " AND action_type = ?";
            sqlParams.push(type);
        }
        if (table) {
            sql += " AND table_concernee = ?";
            sqlParams.push(table);
        }

        sql += " ORDER BY date_action DESC LIMIT ?";
        sqlParams.push(cleanLimit);

        try {
            const rows = db.prepare(sql).all(...sqlParams);
            
            // On s'assure que chaque ligne a les bonnes clés pour React
            return rows.map(row => ({
                id: row.id || `LOG-${Math.random()}`,
                date_action: row.date_action,
                user_name: row.user_name || "Système",
                action_type: row.action_type || "INFO",
                table_concernee: row.table_concernee || "---",
                reference_id: row.reference_id || "---",
                description: row.description || ""
            }));
        } catch (error) {
            console.error("Erreur SQL Audit:", error);
            return [];
        }
    }

    getInsertExportSql() {
        // 🔄 Ajout de sync_status = 'pending' pour garantir l'intégrité de la synchronisation cloud
        return `
            INSERT INTO audit_log 
            (id, user_id, user_name, action_type, table_concernee, reference_id, description, company_id, sync_status)
            VALUES (
                'LOG-' || STRFTIME('%s', 'now') || '-' || LOWER(HEX(RANDOMBLOB(2))),
                ?, ?, 'EXPORT', ?, ?, ?, ?, 'pending'
            )
        `;
    }
}

module.exports = new AuditService();