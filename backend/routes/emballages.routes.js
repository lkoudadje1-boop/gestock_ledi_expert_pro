const express = require('express');
const router = express.Router();
const emballageController = require('../controllers/emballages.controller');
const { verifyToken } = require('../middlewares/auth.middleware');
const verifyLicense = require('../middlewares/license.middleware');

// Créer un emballage
router.post('/', verifyToken, verifyLicense('GESTOCK'), emballageController.createPackaging);

// Récupérer tous les emballages
router.get('/', verifyToken, verifyLicense('GESTOCK'), emballageController.getAllPackagings);

// Récupérer un emballage spécifique
router.get('/:id', verifyToken, verifyLicense('GESTOCK'), emballageController.getPackagingById);

// Modifier un emballage
router.put('/:id', verifyToken, verifyLicense('GESTOCK'), emballageController.updatePackaging);

// Supprimer un emballage
router.delete('/:id', verifyToken, verifyLicense('GESTOCK'), emballageController.deletePackaging);

module.exports = router;