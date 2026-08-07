const express = require('express');
const router = express.Router();
const saisieCtrl = require('../controllers/Brouillard.saisie.controller');
const { verifyToken } = require('../middlewares/auth.middleware');
// Import du middleware de licence
const verifyLicense = require('../middlewares/license.middleware');

/**
 * Selon ton routeMapping : 
 * '/api/treso/operations' => 'COMPTA_BASE'
 */

// --- ROUTES DE SAISIE DE TRÉSORERIE ---

/**
 * @route   POST /api/treso/operations/operation/creer
 */
router.post('/operation/creer', 
    verifyToken, 
    verifyLicense('COMPTA_BASE'), 
    saisieCtrl.creerOperation
);

/**
 * @route   GET /api/treso/operations/liste/:id
 */
router.get('/liste/:id', 
    verifyToken, 
    verifyLicense('COMPTA_BASE'), 
    saisieCtrl.getOperationsBrouillard
);

/**
 * @route   PUT /api/treso/operations/operation/modifier/:id
 */
router.put('/operation/modifier/:id', 
    verifyToken, 
    verifyLicense('COMPTA_BASE'), 
    saisieCtrl.modifierOperation
);

/**
 * @route   DELETE /api/treso/operations/operation/supprimer/:id
 */
router.delete('/operation/supprimer/:id', 
    verifyToken, 
    verifyLicense('COMPTA_BASE'), 
    saisieCtrl.supprimerOperation
);

/**
 * @route   GET /api/treso/operations/attente-validation
 */
router.get('/attente-validation', 
    verifyToken, 
    verifyLicense('COMPTA_BASE'), 
    saisieCtrl.getOperationsAValider
);

/**
 * @route   POST /api/treso/operations/decider/:id
 */
router.post('/decider/:id', 
    verifyToken, 
    verifyLicense('COMPTA_BASE'), 
    saisieCtrl.deciderOperation
);


// --- ROUTES DE VENTILATION COMPTABLE ---

/**
 * @route   GET /api/treso/operations/a-ventiler
 */
router.get('/a-ventiler', 
    verifyToken, 
    verifyLicense('COMPTA_BASE'), 
    saisieCtrl.getDepensesAVentiler
);

/**
 * @route   POST /api/treso/operations/ventiler
 */
router.post('/ventiler', 
    verifyToken, 
    verifyLicense('COMPTA_BASE'), 
    saisieCtrl.ventilerOperation
);

module.exports = router;