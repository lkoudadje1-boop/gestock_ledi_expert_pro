const BalanceService = require('../services/Rap_BalanceComptes.service');

/**
 * Récupère la balance générale
 */
exports.getBalance = async (req, res) => {
    const companyId = req.user?.company_id || req.user?.companyId;

    try {
        const data = await BalanceService.getBalanceData(req.query, companyId);
        res.json({ success: true, data });
    } catch (err) {
        console.error("❌ Erreur Balance Comptes:", err.message);
        res.status(500).json({ error: err.message });
    }
};

/**
 * Récupère le bilan détaillé par tiers
 */
exports.getBilanDetailleTiers = async (req, res) => {
    const companyId = req.user?.company_id || req.user?.companyId;
    const { exerciceId } = req.query;

    if (!exerciceId) {
        return res.status(400).json({ error: "L'identifiant de l'exercice est requis." });
    }

    try {
        const data = await BalanceService.getBilanTiers(exerciceId, companyId);
        res.json({ success: true, data });
    } catch (err) {
        console.error("❌ Erreur Bilan Tiers:", err.message);
        res.status(500).json({ error: err.message });
    }
};