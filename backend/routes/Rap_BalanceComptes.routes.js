const express = require('express');
const router = express.Router();
const balanceController = require('../controllers/Rap_BalanceComptes.controller');
const { verifyToken } = require('../middlewares/auth.middleware');
// Import du middleware de licence
const verifyLicense = require('../middlewares/license.middleware');

/**
 * Selon ton routeMapping : 
 * Les balances et états financiers => 'COMPTA_BASE'
 */

// Route pour récupérer le bilan détaillé des tiers (Justification des soldes)
router.get('/bilan-tiers', 
    verifyToken, 
    verifyLicense('COMPTA_BASE'), 
    balanceController.getBilanDetailleTiers
);

// Route principale pour générer la balance des comptes (Générale ou Auxiliaire)
router.get('/balance', 
    verifyToken, 
    verifyLicense('COMPTA_BASE'), 
    balanceController.getBalance
);

module.exports = router;