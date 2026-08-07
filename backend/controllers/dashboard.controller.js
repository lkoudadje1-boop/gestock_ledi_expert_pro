const dashboardService = require('../services/dashboard.service');

/**
 * Endpoint pour récupérer les statistiques du Dashboard
 */
// backend\controllers\dashboard.controller.js
const getStats = (req, res) => {
    try {
        // req.companyId doit être injecté par ton middleware verifyToken ou verifyLicense
        const companyId = req.companyId || (req.user ? req.user.companyId : null);

        if (!companyId) {
            return res.status(403).json({ error: "Identification entreprise manquante" });
        }

        const stats = dashboardService.fetchDashboardStats(companyId);
        
        // On renvoie toujours un objet, même vide, pour éviter que le Front ne plante
        res.json(stats || {}); 

    } catch (error) {
        console.error("🔥 Erreur Stats Dashboard:", error.message);
        res.status(500).json({ error: "Erreur serveur" });
    }
};

module.exports = { getStats };