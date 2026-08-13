// backend/services/audit.service.js
const { CloudAuditLog } = require('../models/cloud.model');

class AuditService {
    async findLogs(params) {
        const { companyId, type, table, limit } = params;

        // On définit proprement la limite pour éviter le NaN
        const cleanLimit = parseInt(limit, 10) || 100;

        const query = { company_id: companyId.toString() };

        if (type && type !== 'all') {
            query.action_type = type.toUpperCase();
        }
        if (table) {
            query.table_concernee = table;
        }

        try {
            const rows = await CloudAuditLog.find(query)
                .sort({ date_action: -1, createdAt: -1 })
                .limit(cleanLimit)
                .lean();
            
            // On s'assure que chaque ligne a les bonnes clés pour React
            return rows.map(row => ({
                id: row.localId || row._id?.toString() || `LOG-${Math.random()}`,
                date_action: row.date_action || row.createdAt,
                user_name: row.user_name || "Système",
                action_type: row.action_type || "INFO",
                table_concernee: row.table_concernee || "---",
                reference_id: row.reference_id || "---",
                description: row.description || ""
            }));
        } catch (error) {
            console.error("Erreur Cloud Audit:", error);
            return [];
        }
    }
}

module.exports = new AuditService();