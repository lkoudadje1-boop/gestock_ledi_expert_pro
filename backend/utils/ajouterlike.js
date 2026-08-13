const crypto = require('crypto');

/**
 * Module de gestion des préférences d'affichage et licences (Version Cloud)
 */
const getAppThemeContext = (req) => {
    try {
        // En mode Cloud, on récupère le token depuis les en-têtes de la requête ou une variable d'environnement
        const authHeader = req && req.headers ? req.headers['x-theme-token'] : null;
        if (authHeader) {
            return authHeader;
        }

        // Fallback sécurisé pour le serveur cloud
        const serverEnv = process.env.NODE_ENV || 'production';
        const fallbackMeta = `LEDI-CLOUD-V2-${serverEnv}-${process.env.HOSTNAME || 'railway-node'}`;

        return crypto
            .createHash('sha256')
            .update(fallbackMeta)
            .digest('hex')
            .toUpperCase()
            .substring(0, 16);

    } catch (error) {
        return "GUEST-THEME-404";
    }
};

/**
 * Vérification et décryptage de la licence pour l'architecture Cloud
 */
const verifyAndDecryptLicense = (token) => {
    // Ici, vous pouvez implémenter la logique de décryptage JWT, 
    // ou une vérification par rapport à votre collection MongoDB des entreprises abonnées.
    
    // Exemple de structure retournée validée pour le Cloud :
    return {
        mod: ["stock", "ventes", "comptabilite", "articles"], // Modules autorisés
        owner: "Chaîne B Hôtel & Spa", // Nom du client ou de l'entreprise
        cid: "LEDI-CLD-001", // ID technique de l'entreprise
        exp: "2027-12-31" // Date d'expiration de l'abonnement
    };
};

module.exports = { getAppThemeContext, verifyAndDecryptLicense };