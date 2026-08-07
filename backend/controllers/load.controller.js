const LoadService = require('../services/load.service');
const { MODULE_ROUTES } = require('../config/licenseMap');
const CompanyModel = require('../models/Company.model');

exports.getSystemStatus = (req, res) => {
    try {
        const companyId = req.headers['x-company-id'] || req.user?.companyId || 1;
        const data = LoadService.getSystemStatus(companyId);
        
        console.log(`[LICENCE] Status envoyé pour Company ${companyId}:`, data.valid ? "VALIDE" : "INVALIDE");
        res.json(data);
    } catch (err) {
        console.error("❌ Error LoadController (Status):", err.message);
        res.status(500).json({ error: "Erreur lors du chargement système" });
    }
};

exports.updateLicense = (req, res) => {
    try {
        const { licenseData } = req.body;
        const activeCompanyId = req.headers['x-company-id'] || req.user?.companyId;

        // Validation rapide
        if (!licenseData) return res.status(400).json({ error: "Données absentes" });

        // On délègue TOUTE la logique au service
        // (Le service va mettre à jour la BDD ET le fichier .dat)
        LoadService.saveMetadata(licenseData, activeCompanyId);

        // Rafraîchissement du statut pour le renvoyer au client
        const updatedStatus = LoadService.getSystemStatus(activeCompanyId);
        
        // Optionnel : Mise à jour du cache global de l'app si nécessaire
        req.app.set('license', updatedStatus); 

        res.json({ 
            success: true, 
            message: "Système activé avec succès",
            newStatus: updatedStatus 
        });

    } catch (err) {
        console.error("❌ [CONTROLLER] Erreur activation:", err.message);
        res.status(500).json({ error: err.message || "Erreur interne" });
    }
};