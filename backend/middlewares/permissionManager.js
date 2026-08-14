const LoadService = require('../services/load.service');
const { aAccesAuModule } = require('../config/licenseMap');

const gatekeeper = async (req, res, next) => {
    const path = req.path.toLowerCase();

    // 1. ROUTES PUBLIQUES / SYSTÈME & FRONTEND INITIAL
    // On autorise l'authentification, les licences, les compagnies et les requêtes GET non-API (Frontend React)
    if (
        (req.method === 'GET' && !path.startsWith('/api')) ||
        path.includes('/api/auth') || 
        path.includes('/api/license') || 
        path.includes('/api/company') || 
        path.includes('/api/companies') ||
        path.includes('/api/settings')
    ) {
        return next();
    }

    try {
        // Récupération sécurisée du companyId depuis les headers ou l'utilisateur connecté
        const companyId = req.headers['x-company-id'] || req.user?.companyId || req.user?.company_id;

        // Si aucun identifiant d'entreprise n'est fourni, on laisse passer (la route API spécifique gérera l'erreur si besoin)
        if (!companyId) {
            return next();
        }

        // 3. RÉCUPÉRATION DU STATUT (Asynchrone Cloud)
        let status = req.app.get('license');

        if (!status && companyId) {
            status = await LoadService.getSystemStatus(companyId.toString());
        }

        if (!status || !status.valid) {
            return res.status(403).json({ 
                success: false, 
                reason: status?.isExpired ? "LICENSE_EXPIRED" : "LOCKED_SYSTEM",
                message: status?.reason || "Licence invalide ou absente."
            });
        }

        // 4. VÉRIFICATION DU MODULE (Le contrat Entreprise)
        if (!aAccesAuModule(req, status.allowed_modules)) {
            return res.status(403).json({
                success: false,
                reason: "MODULE_NOT_LICENSED",
                message: "Votre abonnement ne permet pas d'accéder à ce module."
            });
        }

        // 5. PASSAGE AU MIDDLEWARE SUIVANT
        req.licenseStatus = status;
        next();
        
    } catch (err) {
        console.error("❌ [Gatekeeper Error]:", err.message);
        return res.status(500).json({ success: false, error: "Erreur lors de la vérification de la licence." });
    }
};

module.exports = { gatekeeper };