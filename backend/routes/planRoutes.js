const express = require('express');
const router = express.Router();
const multer = require('multer');
const planComptableController = require('../controllers/planComptableController');
const { verifyToken } = require('../middlewares/auth.middleware');
// Import du middleware de licence
const verifyLicense = require('../middlewares/license.middleware');

// --- Configuration de Multer ---
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 } 
});

/**
 * Selon ton routeMapping : 
 * '/api/plan-comptable' => 'COMPTA_BASE'
 */

// Application du middleware de licence pour tout le routeur
router.use(verifyLicense('COMPTA_BASE'));

/**
 * @route   POST /api/plan-comptable/initialiser
 */
router.post(
    '/initialiser', 
    verifyToken, 
    upload.single('file'), 
    planComptableController.initialiserOuImporterPlan 
);

/**
 * @route   GET /api/plan-comptable/liste
 */
router.get(
    '/liste', 
    verifyToken, 
    planComptableController.getPlanComptable
);

/**
 * @route   POST /api/plan-comptable/ajouter
 */
router.post(
    '/ajouter', 
    verifyToken, 
    planComptableController.ajouterCompte 
);

/**
 * @route   GET /api/plan-comptable/export
 */
router.get(
    '/export', 
    verifyToken, 
    planComptableController.exportPlanComptable 
);

/**
 * @route   DELETE /api/plan-comptable/vider
 */
router.delete(
    '/vider', 
    verifyToken, 
    planComptableController.viderPlanComptable
);

/**
 * @route   DELETE /api/plan-comptable/supprimer/:id
 */
router.delete(
    '/supprimer/:id', 
    verifyToken, 
    planComptableController.supprimerCompte 
);

// --- Alias & Autres ---
router.get('/', verifyToken, planComptableController.getPlanComptable);

// Route pour modifier un compte spécifique
router.put('/compte/:id', verifyToken, planComptableController.modifierCompte);

module.exports = router;