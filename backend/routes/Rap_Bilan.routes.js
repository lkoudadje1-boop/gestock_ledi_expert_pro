const express = require('express');
const router = express.Router();
const bilanCtrl = require('../controllers/Rap_Bilan.controller');
const { verifyToken } = require('../middlewares/auth.middleware');
// Import du middleware de licence
const verifyLicense = require('../middlewares/license.middleware');

/**
 * Selon ton routeMapping : 
 * Le Bilan (Actif & Passif) fait partie des états financiers => 'COMPTA_BASE'
 */

// Application du middleware de licence pour toutes les routes du Bilan
router.use(verifyLicense('COMPTA_BASE'));

/**
 * @route   GET /api/rapports/bilan
 * @desc    Génère l'Actif du Bilan
 */
router.get('/bilan', verifyToken, bilanCtrl.getBilan);

/**
 * @route   GET /api/rapports/bilan-passif
 * @desc    Génère le Passif du Bilan
 */
router.get('/bilan-passif', verifyToken, bilanCtrl.getPassif);

module.exports = router;