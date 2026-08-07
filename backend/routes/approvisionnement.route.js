const express = require('express');
const router = express.Router();
const controller = require('../controllers/approvisionnement.controller');
const { verifyToken } = require('../middlewares/auth.middleware');
const verifyLicense = require('../middlewares/license.middleware');

// ✅ Ajout de 'getDebts' et 'postPayment' à la liste des fonctions requises
const requiredFunctions = [
    'saveApprovisionnement', 
    'getAllPurchases', 
    'traiterActionLigne',
    'archiveLot',
    'getArchivedPurchases',
    'syncTemporaryPurchase',
    'getTemporaryPurchase',
    'clearTemporaryPurchase',
    'getSoldHistory',
    'getDebts',      // <--- Nouveau
    'postPayment'    // <--- Nouveau
];

const missingFunctions = requiredFunctions.filter(func => !controller[func]);

if (missingFunctions.length > 0) {
    console.error(`❌ Erreur : Fonctions manquantes dans le contrôleur : ${missingFunctions.join(', ')}`);
} else {
    // --- ROUTES ACHATS ET APPROVISIONNEMENTS ---
    router.post('/', verifyToken, verifyLicense('GESTOCK'), controller.saveApprovisionnement);
    router.get('/', verifyToken, verifyLicense('GESTOCK'), controller.getAllPurchases);
    
    // --- ROUTES GESTION DES DETTES (PAIEMENTS FOURNISSEURS) ---
    // Récupérer les factures impayées groupées par fournisseur
    router.get('/debts', verifyToken, verifyLicense('GESTOCK'), controller.getDebts);
    // Enregistrer un nouveau règlement pour une dette
    router.post('/pay-debt', verifyToken, verifyLicense('GESTOCK'), controller.postPayment);

    // --- ROUTES ARCHIVAGE ---
    router.put('/archive-lot/:lotId', verifyToken, verifyLicense('GESTOCK'), controller.archiveLot);
    router.get('/archived', verifyToken, verifyLicense('GESTOCK'), controller.getArchivedPurchases); 
    router.get('/sold-history', verifyToken, verifyLicense('GESTOCK'), controller.getSoldHistory);
    // --- ROUTES ACTIONS SUR LIGNES ---
    router.post('/action-ligne/:itemId', verifyToken, verifyLicense('GESTOCK'), controller.traiterActionLigne);

    // --- ROUTES PANIER TEMPORAIRE ---
    router.post('/save-temp', verifyToken, verifyLicense('GESTOCK'), controller.syncTemporaryPurchase);
    router.get('/get-temp', verifyToken, verifyLicense('GESTOCK'), controller.getTemporaryPurchase);
    router.delete('/clear-temp', verifyToken, verifyLicense('GESTOCK'), controller.clearTemporaryPurchase);
}

module.exports = router;