const express = require('express');
const router = express.Router();
const regleConsignationController = require('../controllers/RegleConsignation.Controller');
const { verifyToken } = require('../middlewares/auth.middleware');
const verifyLicense = require('../middlewares/license.middleware');

// --- NOUVEAU : ENDPOINT DE CALCUL EN TEMPS RÉEL POUR LE PANNEAU DE DECONSIGNATION ---
router.get('/simulation', verifyToken, verifyLicense('GESTOCK'), regleConsignationController.getSimulationRemboursement);

// --- CRUD RÈGLES DE CONSIGNATION & PALIERS ---
router.get('/list', verifyToken, verifyLicense('GESTOCK'), regleConsignationController.getAllRules);
router.get('/:id', verifyToken, verifyLicense('GESTOCK'), regleConsignationController.getRuleById);
router.post('/', verifyToken, verifyLicense('GESTOCK'), regleConsignationController.createRule);
router.put('/:id', verifyToken, verifyLicense('GESTOCK'), regleConsignationController.updateRule);
router.delete('/:id', verifyToken, verifyLicense('GESTOCK'), regleConsignationController.deleteRule);

module.exports = router;