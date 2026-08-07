const express = require('express');
const router = express.Router();
const multer = require('multer');
const { verifyToken } = require('../middlewares/auth.middleware');
// Import du middleware de licence
const verifyLicense = require('../middlewares/license.middleware');

const upload = multer({ storage: multer.memoryStorage() });
const ieController = require('../controllers/importexportEcriture.controller');

/**
 * Selon ton routeMapping : 
 * '/api/compta/ecritures' (ou racine compta) => 'COMPTA_BASE'
 */

// ✅ Export massif d'écritures
router.get('/export-massif', 
    verifyToken, 
    verifyLicense('COMPTA_BASE'), 
    ieController.exportMassif
);

// ✅ Import massif d'écritures (via CSV/Excel)
router.post('/import-massif', 
    verifyToken, 
    upload.single('file'), 
    verifyLicense('COMPTA_BASE'), 
    ieController.importMassif
);

module.exports = router;