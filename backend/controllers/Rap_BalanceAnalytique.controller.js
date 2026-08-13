// backend/controllers/Rap_BalanceAnalytique.controller.js
const BalanceAnalytiqueService = require('../services/Rap_BalanceAnalytique.service');

/**
 * Récupère la balance analytique formatée
 */
exports.getBalanceAnalytique = async (req, res) => {
    const companyId = req.user?.companyId || req.user?.company_id;
    const { exerciceId, dateDebut, dateFin } = req.query;

    if (!companyId) {
        return res.status(401).json({ success: false, error: "Session invalide." });
    }
    if (!exerciceId || !dateDebut || !dateFin) {
        return res.status(400).json({ success: false, error: "Paramètres de recherche incomplets." });
    }

    try {
        const data = await BalanceAnalytiqueService.getBalanceData(req.query, companyId);
        
        res.json({ 
            success: true, 
            data: data 
        });
    } catch (err) {
        console.error("❌ Erreur Balance Analytique:", err.message);
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
};