const express = require('express');
const router = express.Router();
const StockAdjustmentController = require('../controllers/stockajustement.controller');
const { verifyToken } = require('../middlewares/auth.middleware');
const verifyLicense = require('../middlewares/license.middleware');

/**
 * Route mapping : '/api/stock-adjustments' => 'GESTOCK'
 */

// Saisie et formulaire
router.get('/products', 
    verifyToken, 
    verifyLicense('GESTOCK'), 
    StockAdjustmentController.getProducts
);

router.post('/create', 
    verifyToken, 
    verifyLicense('GESTOCK'), 
    StockAdjustmentController.create
);

// Consultation et Historique
router.get('/history', 
    verifyToken, 
    verifyLicense('GESTOCK'), 
    StockAdjustmentController.getHistory
);

router.get('/details/:id', 
    verifyToken, 
    verifyLicense('GESTOCK'), 
    StockAdjustmentController.getDetails
);

// 🎯 ANNULATIONS COMPTABLES ET LOGISTIQUES
// Annuler la totalité d'une session d'ajustement
router.put('/cancel/:id', 
    verifyToken, 
    verifyLicense('GESTOCK'), 
    StockAdjustmentController.cancelWhole
);

// Annuler une seule ligne spécifique dans un ajustement
router.put('/cancel/:id/items/:itemId', 
    verifyToken, 
    verifyLicense('GESTOCK'), 
    StockAdjustmentController.cancelItem
);

module.exports = router;
