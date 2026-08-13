// backend/controllers/Rap_BalanceTiers.controller.js
const BalanceTiersService = require('../services/Rap_BalanceTiers.service');

/**
 * Récupère la balance des tiers formatée
 */
exports.getBalanceTiers = async (req, res) => {
    const companyId = req.user?.company_id || req.user?.companyId;

    try {
        if (!companyId) {
            return res.status(401).json({ success: false, error: "Session invalide." });
        }

        const { exerciceId } = req.query;

        if (!exerciceId) {
            return res.status(400).json({ success: false, error: "L'identifiant de l'exercice est obligatoire." });
        }

        // Appel au service métier (entièrement compatible Cloud)
        const formattedData = await BalanceTiersService.fetchBalanceTiers(req.query, companyId);

        res.json({ 
            success: true, 
            data: formattedData 
        });

    } catch (err) { 
        console.error("❌ Erreur Balance Tiers RAN:", err.message);
        res.status(500).json({ success: false, error: err.message }); 
    }
};