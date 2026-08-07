const BalanceTiersService = require('../services/Rap_BalanceTiers.service');

/**
 * Récupère la balance des tiers formatée
 */
exports.getBalanceTiers = async (req, res) => {
    const companyId = req.user?.company_id || req.user?.companyId;

    try {
        const { exerciceId } = req.query;

        if (!exerciceId) {
            return res.status(400).json({ error: "L'identifiant de l'exercice est obligatoire." });
        }

        // Appel au service métier
        const formattedData = await BalanceTiersService.fetchBalanceTiers(req.query, companyId);

        res.json({ 
            success: true, 
            data: formattedData 
        });

    } catch (err) { 
        console.error("❌ Erreur Balance Tiers RAN:", err.message);
        res.status(500).json({ error: err.message }); 
    }
};