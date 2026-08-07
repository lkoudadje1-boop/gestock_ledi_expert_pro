const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/ConfigEcrituresAuto.controller');
const { verifyToken } = require('../middlewares/auth.middleware');
// Import du middleware de licence
const verifyLicense = require('../middlewares/license.middleware');

/**
 * Selon ton routeMapping : 
 * '/api' => 'GESTOCK'
 */

// Enregistrer ou mettre à jour un schéma de génération d'écriture
router.post('/schema-dynamique', 
    verifyToken, 
    verifyLicense('COMPTA_BASE'), 
    ctrl.saveSchema
);

// Récupérer les colonnes d'une table pour le mapping
router.get('/columns/:tableName', 
    verifyToken, 
    verifyLicense('COMPTA_BASE'), 
    ctrl.getTableColumns
);

// Lister les configurations existantes pour une table donnée
router.get('/list-by-table/:tableName', 
    verifyToken, 
    verifyLicense('COMPTA_BASE'), 
    ctrl.listConfigsByTable
);

// Supprimer une configuration d'écriture automatique
router.delete('/supprimer/:id', 
    verifyToken, 
    verifyLicense('COMPTA_BASE'), 
    ctrl.supprimerConfig
);

module.exports = router;