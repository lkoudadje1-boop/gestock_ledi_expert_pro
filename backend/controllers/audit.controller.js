const { getDb } = require('../config/database');
const AuditService = require('../services/audit.service');

/**
 * Récupère les journaux d'audit
 */
exports.getAuditLogs = async (req, res) => {
    if (!req.user || !req.user.companyId) {
        return res.status(401).json({ error: "Utilisateur non authentifié" });
    }

    try {
        const logs = await AuditService.findLogs({
            companyId: req.user.companyId,
            type: req.query.type,
            table: req.query.table,
            limit: req.query.limit
        });

        res.json(logs);
    } catch (err) {
        console.error("🔥 Erreur récupération logs d'audit:", err.message);
        res.status(500).json({ error: "Erreur lors de la récupération des journaux." });
    }
};

/**
 * Enregistre spécifiquement une action d'export
 */
exports.logExportAction = (req, res) => {
    const db = getDb();
    const { tableConcernee, description } = req.body;
    
    if (!req.user || !req.user.userId) {
        return res.status(401).json({ error: "Utilisateur non authentifié" });
    }

    try {
        const sql = AuditService.getInsertExportSql();
        const referenceId = `EXPORT-${Date.now()}`;
        const userName = "user"; // ✅ Respect consigne [2026-02-08]

        db.prepare(sql).run(
            req.user.userId,
            userName, 
            tableConcernee,
            referenceId,
            description,
            req.user.companyId
        );

        res.status(200).json({ success: true, message: "Action d'export enregistrée." });
    } catch (err) {
        console.error("❌ Erreur enregistrement export log :", err.message);
        res.status(500).json({ error: "Erreur lors de l'enregistrement de l'audit." });
    }
};