const GrandLivreService = require('../services/Rap_GrandLivreComptes.service');

exports.getGrandLivreDynamique = async (req, res) => {
    const companyId = req.user?.company_id || req.user?.companyId;
    
    const { 
        typeGL, exerciceId, dateDebut, dateFin,
        deCompte, aCompte, deTiers, aTiers
    } = req.query;

    if (!exerciceId || !dateDebut || !dateFin) {
        return res.json({ success: true, data: [], message: "Filtres incomplets" });
    }

    try {
        const results = await GrandLivreService.fetchGrandLivre({
            typeGL,
            companyId,
            exerciceId,
            dateDebut,
            dateFin,
            deCompte,
            aCompte,
            deTiers,
            aTiers
        });

        res.json({ success: true, data: results });

    } catch (err) {
        console.error("❌ Erreur Contrôleur Grand Livre :", err.message);
        res.status(500).json({ 
            success: false, 
            error: "Erreur lors de la récupération du Grand Livre" 
        });
    }
};
exports.getHistoriqueIndividuelTiers = async (req, res) => {
    const { num_tiers } = req.params;
    const { exerciceId } = req.query;
    const companyId = req.user?.company_id || req.user?.companyId;

    try {
        const results = await GrandLivreComptesService.fetchGrandLivre({
            typeGL: 'TIERS',
            companyId,
            exerciceId,
            // On fixe les dates larges pour tout voir, ou on les récupère de la query
            dateDebut: '1900-01-01', 
            dateFin: '2099-12-31',
            deTiers: num_tiers, // On restreint à ce tiers précis
            aTiers: num_tiers
        });

        res.json({ success: true, data: results });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};