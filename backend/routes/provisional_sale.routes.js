const express = require('express');
const router = express.Router();
const { 
    createProvisionalSale,
    updateProvisionalSale,
    getProvisionalSales,
    getProvisionalSaleDetails,
    validateProvisionalSale,
    rejectProvisionalSale,
    deleteProvisionalSaleItem,
    saveTemporaryProvisionalCart,
    getTemporaryProvisionalCart,
    deleteTemporaryProvisionalCart,
    splitProvisionalItemCtrl,
    // 🚀 INJECTION DES TROIS NOUVEAUX CONTRÔLEURS DE LA TOURNÉE COMMERCIALE
    createCommercialTourProvisional,
     updateCommercialTourProvisionalCtrl,
    validateCommercialTourDefinitif,
    deleteCommercialTourProvisionalCtrl,

    // 🚀 AJOUT DES DEUX CONTRÔLEURS DE GESTION DES LISTES ET DÉTAILS DE TOURNÉES
    getCommercialTourneesList,
    getCommercialTourneeDetails
} = require('../controllers/provisional_sale.controller'); 
const { verifyToken } = require('../middlewares/auth.middleware');
const verifyLicense = require('../middlewares/license.middleware');

// Application des protections globales
router.use(verifyToken);
router.use(verifyLicense('GESTOCK'));

// --- ROUTES POUR LE PANIER TEMPORAIRE ---
router.post('/temp-cart', saveTemporaryProvisionalCart);
router.get('/temp-cart', getTemporaryProvisionalCart);
router.delete('/temp-cart', deleteTemporaryProvisionalCart);
router.post('/split-item/:itemId', splitProvisionalItemCtrl);
// --- ROUTES DE GESTION DES VENTES PROVISOIRES CLASSIQUES ---
router.post('/', createProvisionalSale);
router.put('/modifier-lot/:lotId', updateProvisionalSale);
router.get('/provisional', getProvisionalSales); 

// 🎯 NOTE : Cette route existante est aussi utilisée par le Bloc 2 du Frontend pour charger le décompte
router.get('/provisional/:lotId', getProvisionalSaleDetails); 

router.delete('/item/:itemId', deleteProvisionalSaleItem);
router.post('/validate/:lotId', validateProvisionalSale);
router.post('/reject/:lotId', rejectProvisionalSale);

// --- 🚚 NOUVELLES ROUTES : GRILLE & TOURNÉES COMMERCIAUX ---

// 🌅 1. Enregistrement initial du panier de chargement (Le Matin)
router.post('/validate-commercial/morning', createCommercialTourProvisional);

// 🔄 2. Mise à jour du chargement avant le départ du camion (En journée)
router.put('/validate-commercial/update/:lotId', updateCommercialTourProvisionalCtrl);


// 🌌 3. Décompte des retours, déstockage physique et facturation (Le Soir)
router.post('/validate-commercial/evening', validateCommercialTourDefinitif);

// 📊 4. Endpoints d'affichage pour la page ListeTourneesCommerciales (Via vos contrôleurs)
router.get('/commercial/list', getCommercialTourneesList);
// Dans votre fichier de routes, assurez-vous d'avoir ceci tout en bas :
// Dans votre fichier de routes
router.get('/commercial/details/:lotId', getCommercialTourneeDetails);
// Déclarez la route de suppression tout en bas avec les autres routes de tournée commerciale :
router.delete('/validate-commercial/cancel/:lotId', deleteCommercialTourProvisionalCtrl);


module.exports = router;
