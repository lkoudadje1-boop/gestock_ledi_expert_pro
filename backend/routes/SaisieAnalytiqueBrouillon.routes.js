const express = require('express');
const router = express.Router();
const controller = require('../controllers/SaisieAnalytiqueBrouillon.controller');
const { verifyToken } = require('../middlewares/auth.middleware'); 
// Import du middleware de licence
const verifyLicense = require('../middlewares/license.middleware');

/**
 * Selon ton routeMapping : 
 * La saisie analytique (même en brouillon) => 'ANA_PLAN'
 */

// Application du middleware de licence pour tout le routeur
router.use(verifyLicense('ANA_PLAN'));

/**
 * @route   GET /api/analytique-brouillon/check/:compte_id
 * @desc    Vérifie si un compte nécessite une ventilation avant validation du brouillard
 */
router.get('/check/:compte_id', verifyToken, controller.checkConfigForSaisieBrouillon);

/**
 * @route   POST /api/analytique-brouillon/ventiler
 * @desc    Enregistre la ventilation dans les tables de brouillard
 */
router.post('/ventiler', verifyToken, controller.ventilerEcritureBrouillon);

/**
 * @route   GET /api/analytique-brouillon/plan
 * @desc    Récupère la structure analytique pour l'interface de saisie
 */
router.get('/plan', verifyToken, controller.getPlanAnalytique);

/**
 * @route   GET /api/analytique-brouillon/details/:ligne_id
 * @desc    Récupère le détail d'une ventilation déjà enregistrée en brouillon
 */
router.get('/details/:ligne_id', verifyToken, controller.getDetailsVentilationBrouillon);

module.exports = router;