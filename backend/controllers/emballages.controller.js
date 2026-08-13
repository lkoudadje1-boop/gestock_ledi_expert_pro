// backend/controllers/emballages.controller.js
const emballageService = require('../services/emballages.services');

exports.getAllPackagings = async (req, res) => {
    try {
        const companyId = req.user?.companyId || req.user?.company_id;
        if (!companyId) return res.status(401).json({ error: "Non autorisé. Identifiant entreprise manquant." });

        const packagings = await emballageService.getAllPackagings(companyId);
        return res.status(200).json(packagings);
    } catch (err) {
        console.error("❌ Erreur getAllPackagings:", err);
        return res.status(500).json({ error: "Erreur lors de la récupération des emballages." });
    }
};

exports.createPackaging = async (req, res) => {
    try {
        const companyId = req.user?.companyId || req.user?.company_id;
        const userId = req.user?.userId || req.user?.id;
        const userName = 'user'; // Respect strict consigne [2026-02-08]

        const { nom, unite_id } = req.body;
        if (!nom || !unite_id) return res.status(400).json({ error: "Nom et unité obligatoires." });

        const id = await emballageService.createPackaging({
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

        return res.status(201).json({ success: true, id });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Erreur lors de la création de l'emballage." });
    }
};

exports.getPackagingById = async (req, res) => {
    try {
        const companyId = req.user?.companyId || req.user?.company_id;
        const packaging = await emballageService.getPackagingById(req.params.id, companyId);
        if (!packaging) return res.status(404).json({ error: "Emballage non trouvé." });
        
        return res.status(200).json(packaging);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Erreur lors de la récupération de l'emballage." });
    }
};

exports.updatePackaging = async (req, res) => {
    try {
        const { nom, unite_id } = req.body;
        if (!nom || !unite_id) return res.status(400).json({ error: "Nom et unité obligatoires." });

        const companyId = req.user?.companyId || req.user?.company_id;
        const result = await emballageService.updatePackaging({
            id: req.params.id,
            companyId: companyId,
            userId: req.user?.userId || req.user?.id,
            userName: 'user',
            data: req.body
        });

        if (!result || (result.modifiedCount === 0 && result.matchedCount === 0)) {
            return res.status(404).json({ error: "Emballage non trouvé ou aucune modification effectuée." });
        }

        if (req.io) {
            req.io.to(companyId.toString()).emit('DATA_EVENT', { 
                table: 'packaging', 
                action: 'UPDATE',
                id: req.params.id 
            });
        }

        return res.status(200).json({ success: true, message: "Emballage mis à jour avec succès." });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Erreur lors de la modification de l'emballage." });
    }
};

exports.deletePackaging = async (req, res) => {
    try {
        const companyId = req.user?.companyId || req.user?.company_id;
        const result = await emballageService.deletePackaging({
            id: req.params.id,
            companyId: companyId,
            userId: req.user?.userId || req.user?.id,
            userName: 'user'
        });

        if (!result || result.deletedCount === 0) {
            return res.status(404).json({ error: "Emballage non trouvé." });
        }

        if (req.io) {
            req.io.to(companyId.toString()).emit('DATA_EVENT', { 
                table: 'packaging', 
                action: 'DELETE',
                id: req.params.id 
            });
        }

        return res.status(200).json({ success: true, message: "Emballage supprimé avec succès." });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Erreur lors de la suppression. L'emballage est peut-être utilisé ailleurs." });
    }
};