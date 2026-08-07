const express = require('express');
const router = express.Router();
const clotureController = require('../controllers/cloturevente.controller');
const { verifyToken } = require('../middlewares/auth.middleware');
// Import du middleware de licence
const verifyLicense = require('../middlewares/license.middleware');

/**
 * Selon ton routeMapping : 
 * '/api/sales' et '/api/pos' => 'GESTOCK'
 * La clôture de vente est donc protégée par le module GESTOCK.
 */

// Valider une clôture (Enregistrer les montants réels vs théoriques)
router.post('/clotures', 
    verifyToken, 
    verifyLicense('GESTOCK'), 
    clotureController.valider
); 

// Récupérer l'état théorique (Calcul des ventes en cours)
router.get('/etat-theorique', 
    verifyToken, 
    verifyLicense('GESTOCK'), 
    clotureController.getTheorique
);

// Historique des clôtures
router.get('/historique', 
    verifyToken, 
    verifyLicense('GESTOCK'), 
    clotureController.getHistory
);

router.get('/clotures/history', 
    verifyToken, 
    verifyLicense('GESTOCK'), 
    clotureController.getHistory
);

module.exports = router;