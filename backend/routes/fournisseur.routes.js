const express = require('express');
const router = express.Router();
const fournisseurCtrl = require('../controllers/fournisseur.controller'); 
const { verifyToken } = require('../middlewares/auth.middleware');
// Import du middleware de licence
const verifyLicense = require('../middlewares/license.middleware');

/**
 * Selon ton routeMapping : 
 * '/api/suppliers' => 'GESTOCK'
 */

// Lister tous les fournisseurs
router.get('/', 
    verifyToken, 
    verifyLicense('GESTOCK'), 
    fournisseurCtrl.getAllSuppliers
);

// Créer un fournisseur
router.post('/', 
    verifyToken, 
    verifyLicense('GESTOCK'), 
    fournisseurCtrl.createSupplier
);

// Modifier un fournisseur
router.put('/:id', 
    verifyToken, 
    verifyLicense('GESTOCK'), 
    fournisseurCtrl.updateSupplier
);

// Supprimer un fournisseur
router.delete('/:id', 
    verifyToken, 
    verifyLicense('GESTOCK'), 
    fournisseurCtrl.deleteSupplier
);

module.exports = router;