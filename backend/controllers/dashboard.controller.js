// backend/controllers/dashboard.controller.js
const dashboardService = require('../services/dashboard.service');

/**
 * Endpoint pour récupérer les statistiques du Dashboard (100% Cloud / Asynchrone)
 */
const getStats = async (req, res) => {
    try {
        const companyId = req.companyId || (req.user ? (req.user.companyId || req.user.company_id) : null);

        if (!companyId) {
            return res.status(403).json({ error: "Identification entreprise manquante" });
        }

        const stats = await dashboardService.fetchDashboardStats(companyId);
        
        return res.json(stats || {}); 

    } catch (error) {
        console.error("🔥 Erreur Stats Dashboard:", error.message);
        return res.status(500).json({ error: "Erreur serveur" });
    }
};

module.exports = { getStats };