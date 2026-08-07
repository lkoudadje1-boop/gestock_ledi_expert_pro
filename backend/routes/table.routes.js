const express = require('express');
const router = express.Router();
const tableController = require('../controllers/table.controller');

// Import des middlewares de sécurité de votre architecture
const { verifyToken } = require('../middlewares/auth.middleware');
const { checkCompanyAccess } = require('../middlewares/company.middleware');
const verifyLicense = require('../middlewares/license.middleware'); // ✅ Ajouté

// --- 🛡️ MIDDLEWARES GLOBAUX ---
// 1. Vérification du token (Authentification)
router.use(verifyToken);

// 2. Vérification de l'accès à l'entreprise
router.use(checkCompanyAccess);

// 3. Vérification de la licence GESTOCK (Autorisation du module de gestion de stock)
router.use(verifyLicense('GESTOCK')); // ✅ Sécurisation par licence injectée ici


// --- 📌 ACTIONS DYNAMIQUES SUR LES TABLES ---
// Lecture de tous les enregistrements actifs d'une table
router.get('/:tableName', tableController.getAllRows);

// Création d'un enregistrement
router.post('/:tableName', tableController.createRow);

// Mise à jour d'un enregistrement
router.put('/:tableName/:id', tableController.updateRow);

// Suppression d'un enregistrement
router.delete('/:tableName/:id', tableController.deleteRow);


module.exports = router;