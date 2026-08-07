const express = require('express');
const router = express.Router();
const customerController = require('../controllers/client.controller'); 
const { verifyToken } = require('../middlewares/auth.middleware'); 
// Import du middleware de licence
const verifyLicense = require('../middlewares/license.middleware');

/**
 * Selon ton routeMapping : 
 * '/api/customers' => 'GESTOCK'
 */

// Récupérer tous les clients
router.get('/', 
    verifyToken, 
    verifyLicense('GESTOCK'), 
    customerController.getAllCustomers
);

// Créer un nouveau client
router.post('/', 
    verifyToken, 
    verifyLicense('GESTOCK'), 
    customerController.createCustomer
);

// Mettre à jour les informations
router.put('/:id', 
    verifyToken, 
    verifyLicense('GESTOCK'), 
    customerController.updateCustomer
);

// Changer le statut (Activer/Archiver)
router.patch('/:id/status', 
    verifyToken, 
    verifyLicense('GESTOCK'), 
    customerController.updateStatus
);

// Supprimer un client
router.delete('/:id', 
    verifyToken, 
    verifyLicense('GESTOCK'), 
    customerController.deleteCustomer
);

module.exports = router;