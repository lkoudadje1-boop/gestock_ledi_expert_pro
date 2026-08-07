const express = require('express');
const router = express.Router();
const analytiqueCtrl = require('../controllers/Rap_BalanceAnalytique.controller');
const { verifyToken } = require('../middlewares/auth.middleware');
// Import du middleware de licence
const verifyLicense = require('../middlewares/license.middleware');

/**
 * Selon ton routeMapping : 
 * Les rapports et balances analytiques => 'ANA_PLAN'
 */

// Route de calcul et consultation de la balance analytique
router.get('/balance-analytique', 
    verifyToken, 
    verifyLicense('ANA_PLAN'), 
    analytiqueCtrl.getBalanceAnalytique
);

module.exports = router;