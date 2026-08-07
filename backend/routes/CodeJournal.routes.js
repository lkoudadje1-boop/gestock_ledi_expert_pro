const express = require('express');
const router = express.Router();
const multer = require('multer'); 
const codeJournalController = require('../controllers/CodeJournal.controller');
const { verifyToken } = require('../middlewares/auth.middleware');
// Import du middleware de licence
const verifyLicense = require('../middlewares/license.middleware');

// Configuration de Multer (Stockage en mémoire vive)
const upload = multer({ storage: multer.memoryStorage() });

/**
 * Selon ton routeMapping : 
 * '/api/plan-comptable/journaux' => 'GESTOCK'
 */

// --- LECTURE ---
router.get('/liste', 
    verifyToken, 
    verifyLicense('GESTOCK'), 
    codeJournalController.getJournaux
);

// --- IMPORT / EXPORT ---
// Export : Télécharger les codes journaux
router.get('/export', 
    verifyToken, 
    verifyLicense('GESTOCK'), 
    codeJournalController.exportJournaux
);

// Import : Envoyer un fichier CSV
router.post('/import', 
    verifyToken, 
    verifyLicense('GESTOCK'), 
    upload.single('file'), 
    codeJournalController.importJournaux
);

// --- CRÉATION ---
router.post('/creer', 
    verifyToken, 
    verifyLicense('GESTOCK'), 
    codeJournalController.creerJournal
);

// --- MODIFICATION ---
router.put('/modifier/:id', 
    verifyToken, 
    verifyLicense('GESTOCK'), 
    codeJournalController.modifierJournal
);

// --- SUPPRESSION ---
router.delete('/supprimer/:id', 
    verifyToken, 
    verifyLicense('GESTOCK'), 
    codeJournalController.supprimerJournal
);

module.exports = router;