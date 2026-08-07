const { getAppThemeContext } = require('./ajouterlike');
const LoadService = require('../services/load.service');

/**
 * Chargeur d'actifs sécurisés
 * Vérifie l'intégrité entre le matériel et la licence installée
 */
const AssetLoader = {
    /**
     * Valide si l'environnement actuel est autorisé
     * @param {string} companyId - L'ID de la société active
     */
    validateEnvironment: (companyId) => {
        try {
            // 1. On récupère l'empreinte matérielle unique du PC (votre code ajouterlike)
            const hardwareToken = getAppThemeContext();

            // 2. On récupère le statut de la licence
            const status = LoadService.getSystemStatus(companyId);

            if (!status.valid) {
                return { 
                    authorized: false, 
                    reason: "LICENCE_INVALID", 
                    token: hardwareToken 
                };
            }

            /**
             * NOTE : Pour un verrouillage TOTAL, votre générateur de licence côté administrateur
             * devra inclure le 'hardwareToken' dans le champ 'hwid' du JSON de la licence.
             */
            
            // Si vous avez prévu un champ hwid dans votre métadonnée :
            /*
            if (status.hwid && status.hwid !== hardwareToken) {
                return { authorized: false, reason: "HARDWARE_MISMATCH" };
            }
            */

            return { 
                authorized: true, 
                theme: hardwareToken, 
                modules: status.allowed_modules 
            };

        } catch (error) {
            console.error("❌ Erreur AssetLoader:", error.message);
            return { authorized: false, reason: "SECURITY_ERROR" };
        }
    }
};

module.exports = AssetLoader;