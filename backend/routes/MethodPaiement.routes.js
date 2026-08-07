const express = require('express');
const router = express.Router();
const methodController = require('../controllers/MethodPaiement.controller');
const { verifyToken } = require('../middlewares/auth.middleware');
// Import du middleware de licence
const verifyLicense = require('../middlewares/license.middleware');

/**
 * Selon ton routeMapping : 
 * '/api/method-paiement' => 'GESTOCK'
 */

// LECTURE : Lister les modes de paiement actifs
router.get('/methodes', 
    verifyToken, 
    verifyLicense('GESTOCK'), 
    methodController.getMethods
);

// CRÉATION : Ajouter un nouveau mode (ex: Flooz, T-Money)
router.post('/creer', 
    verifyToken, 
    verifyLicense('GESTOCK'), 
    methodController.creerMethod
);

// MODIFICATION
router.put('/modifier/:id', 
    verifyToken, 
    verifyLicense('GESTOCK'), 
    methodController.modifierMethod
);

// SUPPRESSION
router.delete('/supprimer/:id', 
    verifyToken, 
    verifyLicense('GESTOCK'), 
    methodController.supprimerMethod
);

module.exports = router;