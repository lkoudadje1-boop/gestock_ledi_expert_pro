const express = require('express');
const router = express.Router();
const clotureController = require('../controllers/clotureJournalier.controller');
const { verifyToken } = require('../middlewares/auth.middleware');
// Import du middleware de licence
const verifyLicense = require('../middlewares/license.middleware');

/**
 * Selon ton routeMapping : 
 * '/api' => 'GESTOCK'
 * La clôture journalière fait partie intégrante de la gestion commerciale.
 */

// Récupérer les données en attente de synchronisation
router.get('/pending-sync', 
    verifyToken, 
    verifyLicense('COMPTA_BASE'), 
    clotureController.getPendingSync
);

// Simuler la clôture (Vérification des écarts, etc.)
router.post('/simuler', 
    verifyToken, 
    verifyLicense('COMPTA_BASE'), 
    clotureController.simulerCloture
);

// Exécuter la clôture sélective
router.post('/executer', 
    verifyToken, 
    verifyLicense('COMPTA_BASE'), 
    clotureController.executerClotureSective
);

module.exports = router;