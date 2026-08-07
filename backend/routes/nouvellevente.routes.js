const express = require('express');
const router = express.Router();
const { 
    createSale, 
    getAllSales, 
    getDeletedSales,
    getArchivedSales,
    getSalesForCloture,
    cancelSale,
    cancelSaleItem,
    handleReturnItem,
    archiveSale,
    getTemporaryCart,
    syncTemporaryCart,
    deleteTemporaryCart,
    getPerformanceDuJour,
    getSaleByLotId,
    createRetour,
    getTemporaryFactureCart,
    syncTemporaryFactureCart,
    deleteTemporaryFactureCart,
    payDebt,        
    getActiveDebts,
    getClientByFacture, // <--- 1. AJOUT DE L'IMPORTATION DU CONTRÔLEUR
    getSalesDetails 
} = require('../controllers/nouvellevente.controller');

const { verifyToken } = require('../middlewares/auth.middleware');
const verifyLicense = require('../middlewares/license.middleware');

router.use(verifyToken);
router.use(verifyLicense('GESTOCK'));

// --- ROUTES DE CONSULTATION ET PERFORMANCE ---
router.get('/branches', (req, res) => {
    res.json([{ id: 'all', nom: 'Vue Globale' }]);
});
router.get('/performance-jour', getPerformanceDuJour);
router.get('/deleted', getDeletedSales);
router.get('/archived', getArchivedSales);
router.get('/cloture-data', getSalesForCloture);
router.get('/lot/:lotId', getSaleByLotId);
router.get('/details', getSalesDetails); 
// --- NOUVELLE ROUTE DE MAPPAGE AUTOMATIQUE ---
router.get('/facture/:id', getClientByFacture); // <--- 2. DECOUPLEMENT ICI
router.get('/liste-reelle', getAllSales); 
// --- GESTION DES PANIERS TEMPORAIRES (POS) ---
router.get('/temporary-cart/:vendeurId', getTemporaryCart);
router.post('/temporary-cart', syncTemporaryCart);
router.delete('/temporary-cart/:vendeurId', deleteTemporaryCart);

router.get('/temporary-facture/:vendeurId', getTemporaryFactureCart);
router.post('/temporary-facture', syncTemporaryFactureCart);
router.delete('/temporary-facture/:vendeurId', deleteTemporaryFactureCart);

// --- OPÉRATIONS DE VENTE ---
router.post('/', createSale);
router.get('/', getAllSales); 

router.get('/debts', getActiveDebts); 
router.post('/pay-debt', payDebt);    
// --- ANNULATIONS ET RETOURS ---
router.post('/cancel/:lotId', cancelSale);
router.post('/cancel-item/:saleItemId', cancelSaleItem); 
router.post('/return-item/:saleItemId', handleReturnItem);
router.post('/returns', createRetour);

// --- ARCHIVAGE ---
router.post('/archive/:lotId', archiveSale);

module.exports = router;