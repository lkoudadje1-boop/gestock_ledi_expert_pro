// backend/controllers/achatemballages.controller.js
const achatEmballageService = require('../services/achatemballages.services');

exports.createAchat = async (req, res) => {
    try {
        const companyId = req.user?.companyId || req.user?.company_id;
        const userId = req.user?.userId || req.user?.id;
        const userName = req.user?.username || req.user?.nom || "Utilisateur";
        
        const { packaging_id, supplier_id, quantite, montant_facture } = req.body;
        if (!packaging_id || !supplier_id || !quantite || !montant_facture) {
            return res.status(400).json({ error: "Tous les champs obligatoires sont requis." });
        }

        // Appel asynchrone au service Cloud qui gère déjà logAction
        const id = await achatEmballageService.createAchat({ companyId, userId, userName, data: req.body });
        res.status(201).json({ success: true, id });
    } catch (err) {
        console.error("❌ Erreur Cloud Controller (createAchat):", err.message);
        res.status(500).json({ error: err.message });
    }
};

exports.getAll = async (req, res) => {
    try {
        const companyId = req.user?.companyId || req.user?.company_id;
        const achats = await achatEmballageService.getAllAchats(companyId);
        res.json(achats);
    } catch (err) {
        console.error("❌ Erreur Cloud Controller (getAll):", err.message);
        res.status(500).json({ error: "Erreur récupération historique." });
    }
};

exports.updateAchat = async (req, res) => {
    try {
        const companyId = req.user?.companyId || req.user?.company_id;
        const userId = req.user?.userId || req.user?.id;
        const userName = req.user?.username || req.user?.nom || "Système";
        
        // La mise à jour est asynchrone et logue l'action via le service
        await achatEmballageService.updateAchat(req.params.id, companyId, userId, userName, req.body);
        res.status(200).json({ success: true });
    } catch (err) {
        console.error("❌ Erreur Cloud Controller (updateAchat):", err.message);
        res.status(500).json({ error: "Erreur lors de la mise à jour." });
    }
};

exports.handleAction = async (req, res) => {
    try {
        const companyId = req.user?.companyId || req.user?.company_id;
        const userId = req.user?.userId || req.user?.id;
        const userName = req.user?.username || req.user?.nom || "Système";
        const { action } = req.body; // 'DELETE' ou 'ARCHIVE'
        
        // handleAction gère désormais l'annulation, l'archivage ET le logAction
        await achatEmballageService.handleAction(req.params.id, companyId, userId, userName, action);
        res.status(200).json({ success: true });
    } catch (err) {
        console.error("❌ Erreur Cloud Controller (handleAction):", err.message);
        res.status(500).json({ error: "Erreur lors de l'action." });
    }
};