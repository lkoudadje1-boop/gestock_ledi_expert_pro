// backend/config/licenseMap.js
const routeMapping = {
    '/api/auth': 'SYSTEM',
    '/api/license': 'SYSTEM',
    '/api/settings': 'SYSTEM',
    '/api/company': 'SYSTEM',
    '/api/companies': 'SYSTEM',
    '/api/audit': 'SYSTEM', 
    '/api/products': 'GESTOCK', 
    '/api/unites': 'GESTOCK',
    '/api/suppliers': 'GESTOCK', 
    '/api/customers': 'GESTOCK', 
    '/api/purchases': 'GESTOCK', 
    '/api/others-tiers': 'COMPTA_BASE', 
    '/api/sales': 'GESTOCK', 
    '/api/provisional-sales': 'GESTOCK', 
    '/api/pos': 'GESTOCK', 
    '/api/staff': 'GESTOCK',
    '/api/inventories': 'GESTOCK',
    '/api/plan-comptable': 'COMPTA_BASE',
    '/api/compta/tiers': 'COMPTA_BASE', 
    '/api/plan-comptable/exercices': 'COMPTA_BASE',
    '/api/plan-comptable/journaux': 'COMPTA_BASE',
    '/api/plan-comptable/ecritures': 'COMPTA_BASE', 
    '/api/plan-comptable/ecritures-brouillon': 'COMPTA_BASE',
    '/api/rapports-comptables': 'COMPTA_BASE', 
    '/api/plan-comptable/paiements': 'COMPTA_BASE', 
    '/api/compta/rapports': 'COMPTA_BASE',
    '/api/analytique/saisie-brouillon': 'COMPTA_BASE',
    '/api/compta/ran': 'COMPTA_BASE',
    '/api/plan-comptable/rapports': 'COMPTA_BASE',
    '/api/treso/brouillards': 'COMPTA_BASE',
    '/api/treso/operations': 'COMPTA_BASE',
    '/api/compta': 'COMPTA_BASE', 
    '/api/analytique/repartitions': 'ANA_PLAN',
    '/api/analytique/saisie': 'ANA_PLAN', 
    '/api/analytique': 'ANA_PLAN',
    '/api/articles': 'GESTOCK', 
    '/api/config-compta': 'COMPTA_BASE',
    '/api/compta/cloture': 'COMPTA_BASE',
    '/api/gestion-tables': 'GESTOCK', 
    '/api/achats-emballages': 'GESTOCK', 
    '/api/emballages/rules': 'GESTOCK', 
    '/api/emballages': 'GESTOCK',
    '/api/consignations': 'GESTOCK',
    '/api/inventaireemb': 'GESTOCK', 
    '/api/stock-adjustments': 'GESTOCK',
    '/api/purchase-orders': 'GESTOCK'
};

// Trie les clés du plus long au plus court pour que les routes spécifiques soient trouvées en premier
const sortedRoutes = Object.keys(routeMapping).sort((a, b) => b.length - a.length);

/**
 * Vérifie si la licence actuelle autorise l'accès au chemin demandé.
 * @param {Object} req - La requête Express
 * @param {Array} capabilitiesLicence - Les modules inclus dans la licence
 */
const aAccesAuModule = (req, capabilitiesLicence) => {
    const currentPath = req.path.toLowerCase().replace(/\/$/, "");
    const currentMethod = req.method.toUpperCase();

    // Exception critique : Autoriser la création de la première entreprise
    if (currentPath.startsWith('/api/company') && currentMethod === 'POST') {
        return true;
    }

    if (!capabilitiesLicence || !Array.isArray(capabilitiesLicence)) {
        console.error("⚠️ Validation Licence : Liste de capacités invalide ou absente.");
        return false;
    }
    
    const caps = capabilitiesLicence.map(c => c.toUpperCase());
    
    if (caps.includes('FULL_ACCESS') || caps.includes('ADMIN')) {
        return true;
    }

    const key = sortedRoutes.find(prefix => currentPath.startsWith(prefix.toLowerCase()));

    if (!key) return true; 

    const moduleRequis = routeMapping[key].toUpperCase();
    const hasAccess = caps.includes(moduleRequis);

    if (!hasAccess) {
        console.warn(`[SECURITY] Accès refusé : Module ${moduleRequis} requis pour ${currentPath}`);
    }

    return hasAccess;
};

module.exports = { 
    aAccesAuModule, 
    MODULE_ROUTES: routeMapping 
};