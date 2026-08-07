const express = require('express');
const router = express.Router();
const configCtrl = require('../controllers/ConfirgurationAuto.controller');
const { verifyToken } = require('../middlewares/auth.middleware');
// Import du middleware de licence
const verifyLicense = require('../middlewares/license.middleware');

/**
 * Selon ton routeMapping : 
 * '/api/analytique' => 'ANA_PLAN'
 */

// --- ROUTES DE RÉPARTITION ANALYTIQUE ---

// 1. Charger l'historique
router.get('/liste', 
    verifyToken, 
    verifyLicense('COMPTA_BASE'), 
    configCtrl.getConfigs
);

// 2. Créer une nouvelle règle
router.post('/creer', 
    verifyToken, 
    verifyLicense('COMPTA_BASE'), 
    configCtrl.createOrUpdateConfig
);

// 3. Modifier une règle existante
router.put('/modifier/:id', 
    verifyToken, 
    verifyLicense('COMPTA_BASE'), 
    configCtrl.createOrUpdateConfig
);

// 4. Supprimer une règle
router.delete('/supprimer/:id', 
    verifyToken, 
    verifyLicense('COMPTA_BASE'), 
    configCtrl.deleteConfig
);

// Récupérer la ventilation automatique
router.get('/auto-ventil', 
    verifyToken, 
    verifyLicense('COMPTA_BASE'), 
    configCtrl.getAutomaticVentilation
);

module.exports = router;