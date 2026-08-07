const express = require('express');
const router = express.Router();
const InventoryController = require('../controllers/inventory.controller'); 
const { verifyToken } = require('../middlewares/auth.middleware');
// Import du middleware de licence
const verifyLicense = require('../middlewares/license.middleware');

/**
 * Selon ton routeMapping : 
 * '/api/inventory' => 'GESTOCK'
 */

// 1. --- ROUTES DE STATUS / GESTION ---
router.get('/check-status', 
    verifyToken, 
    verifyLicense('GESTOCK'), 
    InventoryController.checkStatus
);

router.get('/active', 
    verifyToken, 
    verifyLicense('GESTOCK'), 
    InventoryController.getActiveInventory
);

// 🚀 HARMONISATION ANTI-LITIGE : Déclaration des deux alias d'URL pour sécuriser le fetch de l'interface
router.get('/products', 
    verifyToken, 
    verifyLicense('GESTOCK'), 
    InventoryController.getProductsForInventory
);

router.get('/active-products', 
    verifyToken, 
    verifyLicense('GESTOCK'), 
    InventoryController.getProductsForInventory
);

router.post('/create', 
    verifyToken, 
    verifyLicense('GESTOCK'), 
    InventoryController.createInventory
);

router.post('/save-item', 
    verifyToken, 
    verifyLicense('GESTOCK'), 
    InventoryController.saveItem
);

router.post('/validate', 
    verifyToken, 
    verifyLicense('GESTOCK'), 
    InventoryController.validateInventory
);

router.post('/cancel', 
    verifyToken, 
    verifyLicense('GESTOCK'), 
    InventoryController.cancelInventory
); 

// 2. --- ROUTES HISTORIQUE / SESSIONS ---
router.get('/sessions', 
    verifyToken, 
    verifyLicense('GESTOCK'), 
    InventoryController.getSessions
);

router.get('/details', 
    verifyToken, 
    verifyLicense('GESTOCK'), 
    InventoryController.getDetails
);

router.get('/details/:id_inventaire', 
    verifyToken, 
    verifyLicense('GESTOCK'), 
    InventoryController.getDetailsById
); 

// 3. --- ACTIONS SESSIONS ---
router.put('/sessions/:id/archive', 
    verifyToken, 
    verifyLicense('GESTOCK'), 
    InventoryController.archiveSession
);

module.exports = router;
