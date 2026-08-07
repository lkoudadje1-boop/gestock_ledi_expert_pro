const achatEmballageService = require('../services/achatemballages.services');

exports.createAchat = (req, res) => {
    try {
        const companyId = req.user?.companyId || req.user?.company_id;
        const userId = req.user?.userId || req.user?.id;
        const userName = req.user?.username || req.user?.nom || "Utilisateur";
        
        // Validation des champs reçus du frontend
        const { packaging_id, supplier_id, quantite, montant_facture } = req.body;
        if (!packaging_id || !supplier_id || !quantite || !montant_facture) {
            return res.status(400).json({ error: "Tous les champs obligatoires (Qté, Montant, Fournisseur) sont requis." });
        }

        const id = achatEmballageService.createAchat({ companyId, userId, userName, data: req.body });
        res.status(201).json({ success: true, id });
    } catch (err) {
        console.error("❌ Erreur backend:", err);
        res.status(500).json({ error: err.message });
    }
};

exports.getAll = (req, res) => {
    try {
        const companyId = req.user?.companyId || req.user?.company_id;
        const achats = achatEmballageService.getAllAchats(companyId);
        res.json(achats);
    } catch (err) {
        res.status(500).json({ error: "Erreur récupération historique." });
    }
};

exports.updateAchat = (req, res) => {
    try {
        const companyId = req.user?.companyId || req.user?.company_id;
        const userId = req.user?.userId || req.user?.id;
        const userName = req.user?.username || req.user?.nom || "Système";
        achatEmballageService.updateAchat(req.params.id, companyId, userId, userName, req.body);
        res.status(200).json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Erreur lors de la mise à jour." });
    }
};

exports.handleAction = (req, res) => {
    try {
        const companyId = req.user?.companyId || req.user?.company_id;
        const userId = req.user?.userId || req.user?.id;
        const userName = req.user?.username || req.user?.nom || "Système";
        const { action } = req.body; // 'DELETE' ou 'ARCHIVE'
        achatEmballageService.handleAction(req.params.id, companyId, userId, userName, action);
        res.status(200).json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Erreur lors de l'action." });
    }
};