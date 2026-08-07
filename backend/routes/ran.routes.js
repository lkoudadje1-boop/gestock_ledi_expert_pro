const express = require('express');
const router = express.Router();
const ranController = require('../controllers/ran.controller');
const { verifyToken } = require('../middlewares/auth.middleware');
// Import du middleware de licence
const verifyLicense = require('../middlewares/license.middleware');

/**
 * Selon ton routeMapping : 
 * Les opérations de clôture et RAN => 'COMPTA_BASE'
 */

// Application du middleware de licence pour tout le routeur
router.use(verifyLicense('COMPTA_BASE'));

/**
 * 🚀 Générer le Report à Nouveau
 */
router.post('/generer', 
    verifyToken, 
    ranController.genererRAN
);

// ✅ Récupérer le bilan détaillé des tiers (pour la justification du RAN)
router.get('/bilan-tiers', 
    verifyToken, 
    ranController.getBilanDetailleTiers
);

/**
 * 🚀 Récupérer les reports existants
 */
router.get('/exercice/:exerciceId', 
    verifyToken, 
    ranController.getReportsByExercice
);

module.exports = router;