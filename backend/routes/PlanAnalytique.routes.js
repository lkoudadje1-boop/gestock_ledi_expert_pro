const express = require('express');
const router = express.Router();
const multer = require('multer');
const analytiqueCtrl = require('../controllers/PlanAnalytique.controller');
const { verifyToken } = require('../middlewares/auth.middleware');
// Import du middleware de licence
const verifyLicense = require('../middlewares/license.middleware');

const upload = multer({ storage: multer.memoryStorage() });

/**
 * Selon ton routeMapping : 
 * '/api/analytique/plan' => 'ANA_PLAN'
 */

// Application du middleware de licence sur l'ensemble des routes analytiques
router.use(verifyLicense('ANA_PLAN'));

// --- GRANDS CENTRES ---
router.get('/departements/liste', verifyToken, analytiqueCtrl.getDepartements);
router.post('/departements/creer', verifyToken, analytiqueCtrl.createDepartement);
router.put('/departements/modifier/:id', verifyToken, analytiqueCtrl.modifierDepartement);
router.delete('/departements/supprimer/:id', verifyToken, analytiqueCtrl.supprimerDepartement);

// 📥 EXPORTS / 📤 IMPORTS
router.get('/departements/export', verifyToken, analytiqueCtrl.exportDepartements);
router.post('/departements/import', verifyToken, upload.single('file'), analytiqueCtrl.importDepartements);

router.get('/plan/export', verifyToken, analytiqueCtrl.exportPlanAnalytique);
router.post('/plan/import', verifyToken, upload.single('file'), analytiqueCtrl.importPlanAnalytique);


// --- SUBDIVISIONS ---
router.get('/plan/liste', verifyToken, analytiqueCtrl.getPlanAnalytique);
router.post('/plan/creer', verifyToken, analytiqueCtrl.createPlanAnalytique);
router.put('/plan/modifier/:id', verifyToken, analytiqueCtrl.modifierPlanAnalytique); 
router.delete('/plan/supprimer/:id', verifyToken, analytiqueCtrl.supprimerPlanAnalytique);

// --- DÉTAILS COÛTS ---
router.get('/details/liste', verifyToken, analytiqueCtrl.getDetailsCout);
router.post('/details/creer', verifyToken, analytiqueCtrl.createDetailCout);
router.put('/details/modifier/:id', verifyToken, analytiqueCtrl.modifierDetailCout); 
router.delete('/details/supprimer/:id', verifyToken, analytiqueCtrl.supprimerDetailCout);

module.exports = router;