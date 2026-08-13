// backend/middlewares/company.middleware.js

/**
 * Middleware pour assurer que chaque requête est bien isolée par entreprise (Multi-tenancy).
 * Il normalise l'identifiant companyId pour éviter les incohérences de format.
 */
const checkCompanyAccess = (req, res, next) => {
    // 1. L'utilisateur doit être authentifié (le middleware verifyToken passe avant celui-ci)
    if (!req.user) {
        return res.status(401).json({ success: false, error: "Session non authentifiée." });
    }

    // 2. Récupération de l'ID avec priorité au contexte utilisateur (injecté par verifyToken)
    // On ignore le body pour éviter toute usurpation d'identité via une injection malveillante.
    const companyId = req.user.companyId || req.user.company_id;

    if (!companyId) {
        console.error(`❌ [CompanyMiddleware] Accès refusé : Aucun companyId pour l'utilisateur ${req.user.userId}`);
        return res.status(403).json({ success: false, error: "Entreprise non identifiée." });
    }

    // 3. Harmonisation (On force le format string pour éviter les problèmes de comparaison types)
    const finalId = companyId.toString();
    
    // On met à jour req.user et on définit une propriété directe sur req pour facilité d'usage
    req.user.companyId = finalId;
    req.user.company_id = finalId;
    req.companyId = finalId; 

    // Log de debug simplifié (tu pourras le retirer plus tard)
    // console.log(`[CompanyAccess] Granted: CID ${finalId} | User ${req.user.username}`);
    
    next();
};

module.exports = { checkCompanyAccess };