const checkCompanyAccess = (req, res, next) => {
    // 1. On vérifie req.user (injecté par verifyToken)
    if (!req.user) {
        console.error("❌ [Middleware] Pas d'utilisateur dans req.user");
        return res.status(401).json({ success: false, error: "Session invalide" });
    }

    // 2. Récupération de l'ID avec fallback (très important)
    // On cherche dans le token, mais aussi éventuellement dans les paramètres si c'est une route spécifique
    const idSct = req.user.companyId || req.user.company_id || req.body.company_id;

    if (!idSct) {
        console.error("❌ [Middleware] Aucun ID entreprise trouvé pour l'utilisateur:", req.user.userId);
        return res.status(403).json({ success: false, error: "Accès refusé : Entreprise non identifiée" });
    }

    // 3. 💡 HARMONISATION ET FORCE (On s'assure que les deux formats existent)
    const finalId = String(idSct);
    
    req.user.companyId = finalId;
    req.user.company_id = finalId;
    req.companyId = finalId; 

    // 4. LOG DE DEBUG (Affiche ça dans ta console backend pour voir ce qui arrive)
    console.log(`✅ Access Granted for Company: ${finalId} (User: ${req.user.username})`);
    
    next();
};

module.exports = { checkCompanyAccess };