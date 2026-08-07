// backend\routes\Rap_tafir.routes.js
const express = require('express');
const router = express.Router();
const tafirCtrl = require('../controllers/Rap_tafir.controller.js');
const { verifyToken } = require('../middlewares/auth.middleware');
// Import du middleware de licence
const verifyLicense = require('../middlewares/license.middleware');

/**
 * Selon ton routeMapping : 
 * Le Compte de Résultat et le TFT => 'COMPTA_BASE'
 */

// Application du middleware de licence pour toutes les routes TAFIR/OHADA
router.use(verifyLicense('COMPTA_BASE'));

/**
 * @route   GET /api/compta/rapports/compte-resultat
 * @desc    Génère le compte de résultat (Système Normal OHADA)
 */
router.get('/compte-resultat', 
    verifyToken, 
    tafirCtrl.getCompteResultat
);

/**
 * @route   GET /api/compta/rapports/tft
 * @desc    Génère le Tableau des Flux de Trésorerie (TFT)
 */
router.get('/tft', 
    verifyToken, 
    tafirCtrl.getTFT
);

module.exports = router;