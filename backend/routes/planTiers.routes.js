const express = require('express');
const router = express.Router();
const multer = require('multer');
const { verifyToken } = require('../middlewares/auth.middleware');
// Import du middleware de licence
const verifyLicense = require('../middlewares/license.middleware');
const PlanTiersController = require('../controllers/PlanTiers.Controller');

// Configuration de Multer
const upload = multer({ storage: multer.memoryStorage() });

/**
 * Selon ton routeMapping : 
 * '/api/plan-tiers' => 'COMPTA_BASE'
 */

// Application du middleware de licence pour tout le routeur
router.use(verifyLicense('COMPTA_BASE'));

// 1. Récupérer les tiers et entités disponibles
router.get('/', verifyToken, PlanTiersController.getAll);

// 2. Obtenir la suggestion de numéro auxiliaire
router.get('/suggest', verifyToken, PlanTiersController.getSuggestion);

// 3. EXPORT DES TIERS (CSV)
router.get('/export', verifyToken, PlanTiersController.exportTiers);

// 4. IMPORT DES TIERS (CSV)
router.post('/import', verifyToken, upload.single('file'), PlanTiersController.importTiers);

// 5. Créer un nouveau lien tiers
router.post('/', verifyToken, PlanTiersController.create);

// 6. METTRE À JOUR UN TIERS
router.put('/:id', verifyToken, PlanTiersController.update);

// 7. Supprimer un lien
router.delete('/:id', verifyToken, PlanTiersController.delete);

module.exports = router;