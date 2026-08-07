const express = require('express');
const router = express.Router();
const consignationController = require('../controllers/consignation.controller');
const { verifyToken } = require('../middlewares/auth.middleware');
const verifyLicense = require('../middlewares/license.middleware');

// --- RÉCUPÉRATION DE L'HISTORIQUE ---
router.get('/consignations', verifyToken, verifyLicense('GESTOCK'), consignationController.getConsignations);
router.get('/', verifyToken, verifyLicense('GESTOCK'), consignationController.getConsignations);
router.get('/list', verifyToken, verifyLicense('GESTOCK'), consignationController.getConsignations);
// --- AJOUTEZ CETTE ROUTE ---
// Récupérer une consignation spécifique par son ID pour édition
router.get('/:fluxId', verifyToken, verifyLicense('GESTOCK'), consignationController.getConsignationById);
// --- ENREGISTREMENTS DES FLUX ---
// Créer une nouvelle consignation
router.post('/', verifyToken, verifyLicense('GESTOCK'), consignationController.createConsignation);

// Créer une déconsignation (retour)
router.post('/retour', verifyToken, verifyLicense('GESTOCK'), consignationController.createDeconsignation);

// --- MODIFICATION ET SUPPRESSION ---
// Modifier une consignation existante (nécessite l'ID du flux)
router.put('/:fluxId', verifyToken, verifyLicense('GESTOCK'), consignationController.updateConsignation);

// Supprimer une consignation
router.delete('/:fluxId', verifyToken, verifyLicense('GESTOCK'), consignationController.deleteConsignation);

module.exports = router;