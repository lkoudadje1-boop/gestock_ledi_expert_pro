// backend/controllers/load.controller.js
const LoadService = require('../services/load.service');
const { MODULE_ROUTES } = require('../config/licenseMap');

exports.getSystemStatus = async (req, res) => {
    try {
        const companyId = req.headers['x-company-id'] || req.user?.companyId || req.user?.company_id || '1';
        const data = await LoadService.getSystemStatus(companyId.toString());
        
        console.log(`[LICENCE CLOUD] Status envoyé pour Company ${companyId}:`, data.valid ? "VALIDE" : "INVALIDE");
        res.json(data);
    } catch (err) {
        console.error("❌ Error LoadController (Status):", err.message);
        res.status(500).json({ success: false, error: "Erreur lors du chargement système" });
    }
};

exports.updateLicense = async (req, res) => {
    try {
        const { licenseData } = req.body;
        const activeCompanyId = req.headers['x-company-id'] || req.user?.companyId || req.user?.company_id;

        if (!licenseData) return res.status(400).json({ success: false, error: "Données absentes" });
        if (!activeCompanyId) return res.status(401).json({ success: false, error: "Entreprise non identifiée" });

        // En mode Cloud, la licence est rattachée au companyId et stockée dans MongoDB (via le service)
        await LoadService.saveMetadata(licenseData, activeCompanyId.toString());

        // Rafraîchissement du statut pour le renvoyer au client
        const updatedStatus = await LoadService.getSystemStatus(activeCompanyId.toString());
        
        req.app.set('license', updatedStatus); 

        res.json({ 
            success: true, 
            message: "Licence d'entreprise activée avec succès",
            newStatus: updatedStatus 
        });

    } catch (err) {
        console.error("❌ [CONTROLLER] Erreur activation licence cloud:", err.message);
        res.status(500).json({ success: false, error: err.message || "Erreur interne" });
    }
};