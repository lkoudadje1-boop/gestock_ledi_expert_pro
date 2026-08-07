const express = require('express');
const router = express.Router();
const glController = require('../controllers/Rap_GrandLivreComptes.controller');
const { verifyToken } = require('../middlewares/auth.middleware');
// Import du middleware de licence
const verifyLicense = require('../middlewares/license.middleware');

/**
 * Selon ton routeMapping : 
 * Le Grand Livre et l'historique des écritures => 'COMPTA_BASE'
 */

// Application du middleware de licence pour tout le routeur
router.use(verifyLicense('COMPTA_BASE'));

/**
 * @route   GET /api/rapports/grand-livre-dynamique
 * @desc    Consultation du Grand Livre avec filtres dynamiques (Dates, Comptes, etc.)
 */
router.get('/grand-livre-dynamique', verifyToken, glController.getGrandLivreDynamique);

/**
 * @route   GET /api/rapports/ecritures/historique-tiers/:num_tiers
 * @desc    Historique complet des mouvements pour un tiers spécifique (Justification de solde)
 */
router.get('/ecritures/historique-tiers/:num_tiers', verifyToken, glController.getHistoriqueIndividuelTiers);

module.exports = router;