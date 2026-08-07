const { getAppThemeContext, verifyAndDecryptLicense } = require('../utils/ajouterlike');

exports.getUiConfiguration = async (req, res) => {
    try {
        // 1. Récupération du contenu brut (metadata.dat)
        const themeToken = getAppThemeContext();
        
        // 2. Décryptage et vérification de la signature HMAC
        const licenseData = verifyAndDecryptLicense(themeToken);

        // 3. Réponse structurée pour le Frontend
        res.json({
            success: true,
            config: {
                themeToken: themeToken, // Requis par le gatekeeper pour chaque requête API
                
                // On utilise 'mod' car c'est la clé définie dans ton générateur
                modules: licenseData.mod || [], 
                
                // On utilise 'owner' pour le nom du client
                client: licenseData.owner || "Client Non Enregistré",
                
                // ID technique de l'entreprise (Utile pour vérifier la cohérence)
                companyId: licenseData.cid, 
                
                // Date d'expiration pour afficher des alertes au client
                expiration: licenseData.exp,
                
                version: "2.0.4",
                allowUpdate: false
            }
        });
    } catch (error) {
        // En cas d'erreur (signature invalide, fichier corrompu, expiration)
        console.error("🚨 Erreur Critique License:", error.message);
        
        res.status(403).json({ 
            success: false, 
            error: "Licence invalide ou corrompue",
            details: error.message 
        });
    }
};