const express = require('express');
const router = express.Router();
const analytiqueController = require('../controllers/SaisieAnalytique.controller');
const { verifyToken } = require('../middlewares/auth.middleware'); 
// Import du middleware de licence
const verifyLicense = require('../middlewares/license.middleware');

/**
 * Selon ton routeMapping : 
 * La saisie et ventilation analytique => 'ANA_PLAN'
 */

// Application du middleware de licence pour tout le routeur de saisie analytique
router.use(verifyLicense('ANA_PLAN'));

// Récupérer les plans disponibles pour la ventilation
router.get('/plans', verifyToken, analytiqueController.getPlanAnalytique);

// Effectuer la ventilation d'une écriture (Répartition sur les centres de coûts)
router.post('/ventiler', verifyToken, analytiqueController.ventilerEcriture);

// Vérifier si un compte général nécessite une ventilation analytique
router.get('/check/:compte_id', verifyToken, analytiqueController.checkConfigForSaisie);

module.exports = router;