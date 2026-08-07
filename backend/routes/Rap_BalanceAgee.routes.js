// backend/routes/Rap_BalanceAgee.routes.js
const express = require('express');
const router = express.Router();
const balanceAgeeCtrl = require('../controllers/Rap_BalanceAgee.controller');
const { verifyToken } = require('../middlewares/auth.middleware');
// Import du middleware de licence
const verifyLicense = require('../middlewares/license.middleware');

/**
 * Selon ton routeMapping : 
 * Les rapports financiers et balances => 'COMPTA_BASE'
 */

// Route de consultation de la Balance Âgée (Clients ou Fournisseurs)
router.get('/balance-agee', 
    verifyToken, 
    verifyLicense('COMPTA_BASE'), 
    balanceAgeeCtrl.getBalanceAgee
);

module.exports = router;