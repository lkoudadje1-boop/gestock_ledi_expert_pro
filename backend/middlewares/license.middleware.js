const LoadService = require('../services/load.service');

/**
 * Middleware de vérification de licence
 * @param {string} moduleName - Le nom du module à vérifier (ex: 'ACHATS', 'VENTES')
 */
const verifyLicense = (moduleName) => {
    return (req, res, next) => {
        try {
            // 1. Récupération STRICTE (pas de valeur par défaut '1')
            const companyId = req.user?.companyId;
            
            if (!companyId) {
                return res.status(401).json({ error: "Session invalide ou entreprise non identifiée." });
            }

            const status = LoadService.getSystemStatus(companyId);

            // 2. Vérification de la licence globale
            if (!status || !status.valid) {
                return res.status(403).json({ 
                    error: "LICENSE_EXPIRED", 
                    message: "Licence expirée ou invalide." 
                });
            }

            // 3. Cas particulier : FULL_ACCESS
            // Si l'entreprise a FULL_ACCESS, elle passe partout, peu importe le nom du module
            const allowedModules = status.allowed_modules || [];
            const isAllowed = allowedModules.includes(moduleName) || allowedModules.includes('FULL_ACCESS');

            if (!isAllowed) {
                return res.status(403).json({ 

                    
                    error: "MODULE_NOT_PURCHASED", 
                    message: `Le module [${moduleName}] n'est pas activé.` 
                });
            }

            next();
        } catch (error) {
            console.error("🚨 Erreur License Middleware:", error.message);
            return res.status(500).json({ error: "Erreur serveur" });
        }
    };
};

module.exports = verifyLicense;