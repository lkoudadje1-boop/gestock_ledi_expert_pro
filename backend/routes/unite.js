const express = require('express');
const router = express.Router();
const uniteController = require('../controllers/unite.controller');

// Import des middlewares de sécurité
const { verifyToken } = require('../middlewares/auth.middleware');
const { checkCompanyAccess } = require('../middlewares/company.middleware');
const verifyLicense = require('../middlewares/license.middleware');

// --- 🛡️ MIDDLEWARES GLOBAUX ---
// 1. Vérification du token (Authentification)
router.use(verifyToken);
// 2. Vérification de l'accès à l'entreprise
router.use(checkCompanyAccess);
// 3. Vérification de la licence GESTOCK (Autorisation module)
router.use(verifyLicense('GESTOCK'));


// --- 📌 ROUTES DE LECTURE ---
router.get('/', uniteController.getAllUnites);


// --- 📌 ROUTES D'ACTIONS ---
// Création d'une unité
router.post('/', uniteController.createUnite);

// Mise à jour d'une unité
router.put('/:id', uniteController.updateUnite);

// Suppression d'une unité
router.delete('/:id', uniteController.deleteUnite);


module.exports = router;