const LoadService = require('../services/load.service');
const { aAccesAuModule } = require('../config/licenseMap');

const gatekeeper = (req, res, next) => {
    const path = req.path.toLowerCase();

    // 1. BYPASS DÉVELOPPEMENT
    // Si on n'est pas en prod, on laisse passer pour faciliter le code
    if (process.env.NODE_ENV !== 'production') {
        return next();
    }

    // 2. ROUTES PUBLIQUES / SYSTÈME
    // On ignore le check pour l'auth et la licence elle-même
    if (path.includes('/api/license') || path.includes('/api/auth/login')) {
        return next();
    }

    // 3. RÉCUPÉRATION DU STATUT
    // On privilégie le cache de l'app (fixé au démarrage) pour la performance
    // Sinon on fallback sur le service
    const status = req.app.get('license') || LoadService.getSystemStatus(req.headers['x-company-id']);

    if (!status || !status.valid) {
        return res.status(403).json({ 
            success: false, 
            reason: status?.isExpired ? "LICENSE_EXPIRED" : "LOCKED_SYSTEM",
            message: status?.reason || "Licence invalide ou absente."
        });
    }

    // 4. VÉRIFICATION DU MODULE (Le contrat Entreprise)
    // C'est ici qu'on utilise ton licenseMap.js
    if (!aAccesAuModule(req, status.allowed_modules)) {
        return res.status(403).json({
            success: false,
            reason: "MODULE_NOT_LICENSED",
            message: "Votre abonnement ne permet pas d'accéder à ce module."
        });
    }

    // 5. PASSAGE AU MIDDLEWARE SUIVANT (verifyToken / Permissions)
    // Une fois que la licence est OK, le reste (permissions user) 
    // sera géré par 'verifyToken' dans tes routes.
    req.licenseStatus = status;
    next();
};

module.exports = { gatekeeper };