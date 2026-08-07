const express = require('express');
const router = express.Router();
const balanceTiersController = require('../controllers/Rap_BalanceTiers.controller');
const { verifyToken } = require('../middlewares/auth.middleware');
// Import du middleware de licence
const verifyLicense = require('../middlewares/license.middleware');

/**
 * Selon ton routeMapping : 
 * Les balances auxiliaires et rapports tiers => 'COMPTA_BASE'
 */

// Route de consultation de la Balance des Tiers (Auxiliaire)
router.get('/balance-tiers', 
    verifyToken, 
    verifyLicense('COMPTA_BASE'), 
    balanceTiersController.getBalanceTiers
);

module.exports = router;