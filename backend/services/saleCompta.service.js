// backend/services/saleCompta.service.js
const { genererEcritureExplicite } = require('./ConfigEcrituresAuto.service');

/**
 * Cette fonction ne contient plus de comptes "en dur".
 * Elle appelle le moteur de ConfigEcrituresAuto pour chercher le schéma configuré pour 'sale_items'.
 */
exports.genererEcritureVente = async (recordId, companyId) => {
    // On délègue tout au moteur dynamique
    // Il va chercher la config associée à 'sales' et au mode de règlement
    return await genererEcritureExplicite('sales', recordId, companyId.toString());
};