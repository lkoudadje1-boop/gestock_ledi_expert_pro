const express = require('express');
const router = express.Router();
const multer = require('multer');
const controller = require('../controllers/familleCategGroup.controller');
const { verifyToken } = require('../middlewares/auth.middleware');
const { checkCompanyAccess } = require('../middlewares/company.middleware');
// Import du middleware de licence
const verifyLicense = require('../middlewares/license.middleware');

const upload = multer();

// Application des protections sur toutes les routes du fichier
router.use(verifyToken);
router.use(checkCompanyAccess);
// Toutes ces routes nécessitent le module GESTOCK
router.use(verifyLicense('GESTOCK'));

// 📌 1. IMPORT / EXPORT
router.get('/csv/export/:type', controller.exportData);
router.post('/csv/import/:type', upload.single('file'), controller.processMassiveImport); 

// 📌 2. CHANGEMENT DE STATUT (CASCADE)
router.patch('/status/:type/:id', controller.updateStatus);

// 📌 3. ROUTES DYNAMIQUES GÉNÉRIQUES
router.get('/:type', controller.getAll);
router.post('/:type', controller.create);

// ⚡ AJOUT COMPTABLE & TECHNIQUE CRITIQUE : ROUTE DE MODIFICATION DU NOM ET DES LIENS PARENTS
// Cette route interceptera l'action du bouton "Valider" de votre formulaire de modification
router.patch('/:type/:id', controller.update);

module.exports = router;
