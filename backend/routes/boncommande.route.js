const express = require('express');
const router = express.Router();
const controller = require('../controllers/boncommande.controller');
const { verifyToken } = require('../middlewares/auth.middleware');
const verifyLicense = require('../middlewares/license.middleware');

// 🛡️ Vérification de la présence des méthodes dans le contrôleur
const requiredFunctions = ['saveBonCommande', 'getAllBonsCommande'];
const missingFunctions = requiredFunctions.filter(func => !controller[func]);

if (missingFunctions.length > 0) {
    console.error(`❌ Erreur : Fonctions manquantes dans le contrôleur Bon de Commande : ${missingFunctions.join(', ')}`);
} else {
    // 🎯 ROUTES RELATIVES (Le préfixe '/api/purchase-orders' et 'verifyToken' sont déjà interceptés par server.js)
    router.post('/', verifyLicense('GESTOCK'), controller.saveBonCommande);
    router.get('/', verifyLicense('GESTOCK'), controller.getAllBonsCommande);
     router.get('/:id/items', verifyLicense('GESTOCK'), controller.getBonCommandeDetails);
}

module.exports = router;
