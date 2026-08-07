const BalanceAgeeService = require('../services/Rap_BalanceAgee.service');

/**
 * Endpoint pour obtenir le rapport de balance âgée
 */
exports.getBalanceAgee = async (req, res) => {
    const companyId = req.user?.companyId || req.user?.company_id;
    const { exerciceId } = req.query;

    try {
        // Validation minimale
        if (!exerciceId) {
            return res.status(400).json({ error: "Exercice non spécifié." });
        }

        // Appel au service métier
        const data = await BalanceAgeeService.fetchBalanceAgee(req.query, companyId);

        res.json({ 
            success: true, 
            data 
        });

    } catch (err) {
        console.error("Erreur Backend Balance Âgée:", err.message);
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
};