// backend/routes/audit.js
const express = require('express');
const router = express.Router();
const auditController = require('../controllers/audit.controller');
const { verifyToken, checkPermission } = require('../middlewares/auth.middleware');

// Import du gendarme de licence
const verifyLicense = require('../middlewares/license.middleware');

/**
 * Selon ton routeMapping : /api/audit => 'SYSTEM'
 */

// Route pour récupérer les logs
router.get('/', 
    verifyToken, 
    verifyLicense('SYSTEM'), // Vérification de la licence SYSTEM
    checkPermission('view_audit'), 
    auditController.getAuditLogs
);

// Route pour l'enregistrement d'une action d'export dans l'audit log
router.post('/log-export', 
    verifyToken, 
    verifyLicense('SYSTEM'), // Vérification de la licence SYSTEM
    auditController.logExportAction
);

module.exports = router;