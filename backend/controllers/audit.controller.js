// backend/controllers/audit.controller.js
const AuditService = require('../services/audit.service');

/**
 * Récupère les journaux d'audit
 */
exports.getAuditLogs = async (req, res) => {
    const companyId = req.user?.companyId || req.user?.company_id;
    if (!req.user || !companyId) {
        return res.status(401).json({ error: "Utilisateur non authentifié" });
    }

    try {
        const logs = await AuditService.findLogs({
            companyId: companyId,
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
exports.logExportAction = async (req, res) => {
    const companyId = req.user?.companyId || req.user?.company_id;
    const userId = req.user?.userId || req.user?.id;
    const { tableConcernee, description } = req.body;
    
    if (!req.user || !userId || !companyId) {
        return res.status(401).json({ error: "Utilisateur non authentifié" });
    }

    try {
        const referenceId = `EXPORT-${Date.now()}`;
        const userName = "user"; // Respect de la directive sur la nomenclature utilisateur

        // Appel direct du service d'audit asynchrone (Cloud)
        await AuditService.createLog({
            userId,
            userName,
            actionType: 'EXPORT',
            tableConcernee: tableConcernee || 'GLOBAL',
            referenceId,
            description: description || 'Export de données',
            companyId
        });

        res.status(200).json({ success: true, message: "Action d'export enregistrée." });
    } catch (err) {
        console.error("❌ Erreur enregistrement export log :", err.message);
        res.status(500).json({ error: "Erreur lors de l'enregistrement de l'audit." });
    }
};