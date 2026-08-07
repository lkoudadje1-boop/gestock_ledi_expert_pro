const express = require('express');
const router = express.Router();
const staffController = require('../controllers/staff.controller');
const { verifyToken } = require('../middlewares/auth.middleware'); 
// Import du middleware de licence
const verifyLicense = require('../middlewares/license.middleware');

/**
 * Selon ton routeMapping : 
 * La gestion des utilisateurs et du personnel => 'ADMIN'
 */

// Application des protections globales au routeur
router.use(verifyToken);
router.use(verifyLicense('GESTOCK'));

/**
 * Routes pour la gestion du personnel (Staff)
 */

// Lister tout le personnel
router.get('/', staffController.getAllStaff);

// Créer un nouveau membre du personnel
router.post('/', staffController.createStaff);

// Mettre à jour les informations d'un membre
router.put('/:id', staffController.updateStaff);

// Supprimer (ou désactiver) un membre
router.delete('/:id', staffController.deleteStaff);

module.exports = router;