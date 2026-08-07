const emballageService = require('../services/emballages.services');
// À remplacer dans backend/controllers/emballages.controller.js

exports.getAllPackagings = (req, res) => {
    try {
        // Sécurité anti-undefined pour l'ID entreprise
        const companyId = req.user?.companyId || req.user?.company_id;
        if (!companyId) return res.status(401).json({ error: "Non autorisé. Identifiant entreprise manquant." });

        const packagings = emballageService.getAllPackagings(companyId);
        res.status(200).json(packagings);
    } catch (err) {
        console.error("❌ Erreur getAllPackagings:", err);
        res.status(500).json({ error: "Erreur lors de la récupération des emballages." });
    }
};

exports.createPackaging = (req, res) => {
    try {
        const companyId = req.user?.companyId || req.user?.company_id;
        const userId = req.user?.userId || req.user?.id;
        const userName = req.user?.username || req.user?.nom || "Système";

        const { nom, unite_id } = req.body;
        if (!nom || !unite_id) return res.status(400).json({ error: "Nom et unité obligatoires." });

        const id = emballageService.createPackaging({
            companyId,
            userId,
            userName,
            data: req.body
        });

        if (req.io) {
            req.io.to(companyId.toString()).emit('DATA_EVENT', { 
                table: 'packaging', 
                action: 'INSERT',
                id: id 
            });
        }

        res.status(201).json({ success: true, id });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erreur lors de la création de l'emballage." });
    }
};

exports.getPackagingById = (req, res) => {
    try {
        const packaging = emballageService.getPackagingById(req.params.id, req.user.companyId);
        if (!packaging) return res.status(404).json({ error: "Emballage non trouvé." });
        
        res.status(200).json(packaging);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erreur lors de la récupération de l'emballage." });
    }
};

exports.updatePackaging = (req, res) => {
    try {
        const { nom, unite_id } = req.body;
        if (!nom || !unite_id) return res.status(400).json({ error: "Nom et unité obligatoires." });

        const changes = emballageService.updatePackaging({
            id: req.params.id,
            companyId: req.user.companyId,
            userId: req.user.userId,
            userName: req.user.username,
            data: req.body
        });

        if (changes === 0) return res.status(404).json({ error: "Emballage non trouvé ou aucune modification effectuée." });

        if (req.io) {
            req.io.to(req.user.companyId.toString()).emit('DATA_EVENT', { 
                table: 'packaging', 
                action: 'UPDATE',
                id: req.params.id 
            });
        }

        res.status(200).json({ success: true, message: "Emballage mis à jour avec succès." });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erreur lors de la modification de l'emballage." });
    }
};

exports.deletePackaging = (req, res) => {
    try {
        const changes = emballageService.deletePackaging({
            id: req.params.id,
            companyId: req.user.companyId,
            userId: req.user.userId,
            userName: req.user.username
        });

        if (changes === 0) return res.status(404).json({ error: "Emballage non trouvé." });

        if (req.io) {
            req.io.to(req.user.companyId.toString()).emit('DATA_EVENT', { 
                table: 'packaging', 
                action: 'DELETE',
                id: req.params.id 
            });
        }

        res.status(200).json({ success: true, message: "Emballage supprimé avec succès." });
    } catch (err) {
        console.error(err);
        // Gestion générique si une contrainte de clé étrangère bloque la suppression (ex: emballage lié à un stock)
        res.status(500).json({ error: "Erreur lors de la suppression. L'emballage est peut-être utilisé ailleurs." });
    }
};