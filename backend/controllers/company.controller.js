const companyService = require('../services/company.service');
const { getDb } = require('../config/database');
const { tokenCache } = require('../middlewares/auth.middleware');

// ✅ TON UTILITAIRE DE CONTEXTE HARMONISÉ
const getContext = (req) => {
    const user = req.user || {};
    const companyId = user.companyId || user.company_id;
    const userId = user.userId || user.id;

    return {
        companyId: companyId,
        userId: userId || 'USR-SYSTEM',
        userName: user.username || 'Utilisateur'
    };
};

// 1. Récupérer les réglages
exports.getCompanySettings = async (req, res) => {
    const context = getContext(req);
    if (!context.companyId) return res.status(400).json({ error: "ID Entreprise manquant" });

    try {
        const settings = companyService.fetchSettings(context.companyId);
        if (!settings) return res.status(404).json({ error: "Réglages non trouvés" });
        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 2. Création initiale de société (signup)
// MODIFIÉ : Retourne maintenant l'objet complet (ID technique + Code court)
exports.createCompany = async (req, res) => {
    try {
        const result = companyService.initCompany(req.body); 
        
        console.log(`✅ SYSTÈME INITIALISÉ POUR : ${result.companyId} (${result.companyCode})`);
        
        res.status(201).json({ 
            success: true, 
            data: result // Contient companyId, companyCode, adminId, exerciceId
        });
    } catch (error) {
        console.error("🚨 ERREUR CRITIQUE SIGNUP :", error.message);
        res.status(500).json({ error: "Échec complet : " + error.message });
    }
};

// 3. Récupérer les données d'une société par ID
exports.getCompany = (req, res) => {
    const db = getDb();
    const { id } = req.params;
    try {
        const company = db.prepare("SELECT * FROM companies WHERE id = ?").get(id);
        if (!company) return res.status(404).json({ error: "Société non trouvée" });
        res.json({ success: true, data: company });
    } catch (err) {
        res.status(500).json({ error: "Erreur récupération." });
    }
};

// 4. Mettre à jour les infos et options
exports.updateCompany = (req, res) => {
    const { id } = req.params; 
    const context = getContext(req);

    try {
        companyService.modifyCompany(id, req.body, context);

        // Nettoyage du cache pour forcer la prise en compte des nouveaux réglages
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

        res.json({ success: true, message: "Mis à jour avec succès" });
    } catch (err) {
        res.status(err.message === "Société non trouvée" ? 404 : 500).json({ error: err.message });
    }
};

// 5. Mettre à jour la précision
exports.updatePrecision = (req, res) => {
    const { id } = req.params;
    const context = getContext(req);

    try {
        companyService.modifyPrecision(id, req.body, context);

        if (req.io) {
            const room = id.toString();
            req.io.to(room).emit('DATA_EVENT', { 
                table: 'companies', 
                action: 'UPDATE_PRECISION' 
            });
        }

        res.json({ success: true, message: "Structure mise à jour." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};