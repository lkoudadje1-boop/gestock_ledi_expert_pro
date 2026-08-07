const express = require('express');
const router = express.Router();
const { 
    getCompany, 
    updateCompany, 
    createCompany, 
    updatePrecision,
    getCompanySettings 
} = require('../controllers/company.controller');
const { verifyToken } = require('../middlewares/auth.middleware');
// Import du middleware de licence
const verifyLicense = require('../middlewares/license.middleware');

/**
 * Selon ton routeMapping : 
 * '/api/company' et '/api/settings' => 'GESTOCK'
 */

// --- Inscription (CRÉATION INITIALE) ---
// Note : Pas de verifyLicense ici car l'entreprise n'existe pas encore
router.post('/signup', createCompany);

// --- RÉGLAGES ---
router.get('/settings', 
    verifyToken, 
    verifyLicense('GESTOCK'), 
    getCompanySettings
);

// --- Autres Routes ---
router.patch('/:id/precision', 
    verifyToken, 
    verifyLicense('GESTOCK'), 
    updatePrecision
);

router.get('/:id', 
    verifyToken, 
    verifyLicense('GESTOCK'), 
    getCompany
);

router.put('/:id', 
    verifyToken, 
    verifyLicense('GESTOCK'), 
    updateCompany
);

module.exports = router;