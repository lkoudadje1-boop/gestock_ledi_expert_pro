const { getDb } = require('../config/database');
const { genererEcritureExplicite } = require('./ConfigEcrituresAuto.service');

/**
 * Cette fonction ne contient plus de comptes "en dur".
 * Elle appelle le moteur de ConfigEcrituresAuto pour chercher le schéma configuré pour 'sale_items'.
 */
exports.genererEcritureVente = (recordId, companyId) => {
    // On délègue tout au moteur dynamique
    // Il va chercher la config associée à 'sale_items' et au mode de règlement
    return genererEcritureExplicite('sales', recordId, companyId);
};