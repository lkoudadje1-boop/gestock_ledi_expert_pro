// Remplace le contenu de ton fichier par ceci :
const express = require('express');
const router = express.Router();
// IMPORTANT : Utilise ton contrôleur d'inventaire emballage, pas celui de la balance comptable
const PackagingInventoryController = require('../controllers/inventairePackage.controller'); 
const { verifyToken } = require('../middlewares/auth.middleware');
const verifyLicense = require('../middlewares/license.middleware');
// Ajoutez cette ligne dans votre fichier de routes
router.get('/historique-flux', verifyLicense('GESTOCK'), PackagingInventoryController.historiqueFluxEmbalage);

router.get('/export-historique', verifyToken, verifyLicense('GESTOCK'), PackagingInventoryController.historiqueFluxEmbalage);
router.get('/active', verifyToken, verifyLicense('GESTOCK'), PackagingInventoryController.getActiveInventory);
router.post('/create', verifyToken, verifyLicense('GESTOCK'), PackagingInventoryController.createInventory);
router.post('/save-item', verifyToken, verifyLicense('GESTOCK'), PackagingInventoryController.saveItem);
router.post('/validate', verifyToken, verifyLicense('GESTOCK'), PackagingInventoryController.validateInventory);
router.post('/cancel', verifyToken, verifyLicense('GESTOCK'), PackagingInventoryController.cancelInventory);

module.exports = router;