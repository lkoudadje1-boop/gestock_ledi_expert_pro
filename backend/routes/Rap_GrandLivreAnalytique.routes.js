const express = require('express');
const router = express.Router();
const analytiqueCtrl = require('../controllers/Rap_GrandLivreAnalytique.controller'); 
const { verifyToken } = require('../middlewares/auth.middleware');
// Import du middleware de licence
const verifyLicense = require('../middlewares/license.middleware');

/**
 * Selon ton routeMapping : 
 * Le Grand Livre Analytique => 'ANA_PLAN'
 */

// Route de consultation détaillée du Grand Livre Analytique
router.get('/grand-livre-analytique', 
    verifyToken, 
    verifyLicense('ANA_PLAN'), 
    analytiqueCtrl.getGrandLivreAnalytique
);

module.exports = router;