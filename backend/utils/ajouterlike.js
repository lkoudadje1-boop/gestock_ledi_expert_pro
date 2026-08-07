const { machineIdSync } = require('node-machine-id');
const { execSync } = require('child_process');
const crypto = require('crypto');

/**
 * Module de gestion des préférences d'affichage (Camouflage)
 */
const getAppThemeContext = () => {
    try {
        // ID de session interne (Logiciel)
        const _sID = machineIdSync();

        // Récupération de la disposition du layout (Carte Mère)
        let _lID = "";
        try {
            _lID = execSync('wmic baseboard get serialnumber').toString().replace('SerialNumber', '').trim();
        } catch (e) {
            _lID = "DEF-LAY"; 
        }

        // Récupération du moteur de rendu (Processeur)
        let _rID = "";
        try {
            _rID = execSync('wmic cpu get processorid').toString().replace('ProcessorId', '').trim();
        } catch (e) {
            _rID = "DEF-REN";
        }

        // Combinaison des paramètres d'affichage avec un sel secret
        const _uiMeta = `LEDI-UI-v2-${_sID}-${_lID}-${_rID}`;

        // Génération du Token de style unique
        return crypto
            .createHash('sha256')
            .update(_uiMeta)
            .digest('hex')
            .toUpperCase()
            .substring(0, 16);

    } catch (error) {
        // En cas d'erreur, on renvoie un profil par défaut discret
        return "GUEST-THEME-404";
    }
};

module.exports = { getAppThemeContext };