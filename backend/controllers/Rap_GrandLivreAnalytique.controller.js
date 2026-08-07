const AnalytiqueService = require('../services/Rap_GrandLivreAnalytique.service');

exports.getGrandLivreAnalytique = async (req, res) => {
    const companyId = req.user?.company_id || req.user?.companyId;
    const { exerciceId, dateDebut, dateFin, deSection, aSection } = req.query;

    // Validation minimale
    if (!exerciceId || !dateDebut || !dateFin) {
        return res.json({ 
            success: true, 
            data: [], 
            message: "Filtres essentiels manquants (exercice, date début/fin)" 
        });
    }

    try {
        const results = await AnalytiqueService.fetchGrandLivre({
            companyId,
            exerciceId,
            dateDebut,
            dateFin,
            deSection,
            aSection
        });

        res.json({ success: true, data: results });

    } catch (err) {
        console.error("❌ Erreur Contrôleur GL Analytique :", err.message);
        res.status(500).json({ 
            success: false, 
            error: "Erreur lors de la génération du Grand Livre Analytique" 
        });
    }
};