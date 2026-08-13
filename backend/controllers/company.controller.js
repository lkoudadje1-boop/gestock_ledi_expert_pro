// backend/controllers/company.controller.js
const companyService = require('../services/company.service');
const { CloudCompany } = require('../models/cloud.model');
const { tokenCache } = require('../middlewares/auth.middleware');

// Utilitaires de contexte harmonisé
const getContext = (req) => {
    const user = req.user || {};
    const companyId = user.companyId || user.company_id;
    const userId = user.userId || user.id;

    return {
        companyId: companyId,
        userId: userId || 'USR-SYSTEM',
        userName: 'user' // Respect de la consigne [2026-02-08]
    };
};

// 1. Récupérer les réglages
exports.getCompanySettings = async (req, res) => {
    const context = getContext(req);
    if (!context.companyId) return res.status(400).json({ error: "ID Entreprise manquant" });

    try {
        const settings = await companyService.fetchSettings(context.companyId);
        if (!settings) return res.status(404).json({ error: "Réglages non trouvés" });
        return res.json(settings);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

// 2. Création initiale de société (signup)
exports.createCompany = async (req, res) => {
    try {
        const result = await companyService.initCompany(req.body); 
        
        console.log(`✅ SYSTÈME INITIALISÉ POUR : ${result.companyId} (${result.companyCode})`);
        
        return res.status(201).json({ 
            success: true, 
            data: result 
        });
    } catch (error) {
        console.error("🚨 ERREUR CRITIQUE SIGNUP :", error.message);
        return res.status(500).json({ error: "Échec complet : " + error.message });
    }
};

// 3. Récupérer les données d'une société par ID
exports.getCompany = async (req, res) => {
    const { id } = req.params;
    try {
        const company = await CloudCompany.findOne({ 
            $or: [{ localId: id }, { _id: mongoose.isValidObjectId(id) ? id : null }] 
        }).lean();

        if (!company) return res.status(404).json({ error: "Société non trouvée" });
        return res.json({ success: true, data: company });
    } catch (err) {
        return res.status(500).json({ error: "Erreur récupération : " + err.message });
    }
};

// 4. Mettre à jour les infos et options
exports.updateCompany = async (req, res) => {
    const { id } = req.params; 
    const context = getContext(req);

    try {
        await companyService.modifyCompany(id, req.body, context);

        if (tokenCache && context.userId) {
            tokenCache.del(context.userId);
            console.log(`🧹 Cache vidé pour l'utilisateur ${context.userId}`);
        }

        if (req.io) {
            const room = id.toString();
            req.io.to(room).emit('DATA_EVENT', { 
                table: 'companies', 
                action: 'UPDATE',
                field: 'settings' 
            });
        }

        return res.json({ success: true, message: "Mis à jour avec succès" });
    } catch (err) {
        return res.status(err.message === "Société non trouvée" ? 404 : 500).json({ error: err.message });
    }
};

// 5. Mettre à jour la précision
exports.updatePrecision = async (req, res) => {
    const { id } = req.params;
    const context = getContext(req);

    try {
        await companyService.modifyPrecision(id, req.body, context);

        if (req.io) {
            const room = id.toString();
            req.io.to(room).emit('DATA_EVENT', { 
                table: 'companies', 
                action: 'UPDATE_PRECISION' 
            });
        }

        return res.json({ success: true, message: "Structure mise à jour." });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};