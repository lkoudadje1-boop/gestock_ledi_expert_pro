const express = require('express');
const router = express.Router();
const ecritureController = require('../controllers/JournalEcriture.controller');
const { verifyToken } = require('../middlewares/auth.middleware');
const multer = require('multer');
// Import du middleware de licence
const verifyLicense = require('../middlewares/license.middleware');

const upload = multer(); 

/**
 * Selon ton routeMapping : 
 * '/api/compta/ecritures' => 'COMPTA_BASE'
 */

// --- ROUTES DE CONFIGURATION & STATUT ---

// Liste des journaux filtrés par exercice
router.get('/liste-journaux-statut', 
    verifyToken, 
    verifyLicense('COMPTA_BASE'), 
    ecritureController.getJournauxPourSaisie
);

// --- ROUTES DE SAISIE ---
router.post('/enregistrer-ligne', 
    verifyToken, 
    verifyLicense('COMPTA_BASE'), 
    ecritureController.enregistrerLigneIndividuelle
);

router.get('/lignes-periodiques', 
    verifyToken, 
    verifyLicense('COMPTA_BASE'), 
    ecritureController.getLignesParPeriode
);

router.post('/valider', 
    verifyToken, 
    verifyLicense('COMPTA_BASE'), 
    ecritureController.creerEcriture
);

router.get('/liste-ecritures', 
    verifyToken, 
    verifyLicense('COMPTA_BASE'), 
    ecritureController.getEcrituresByJournal
);

// --- GESTION DES PIÈCES ---
router.post('/annuler-piece', 
    verifyToken, 
    verifyLicense('COMPTA_BASE'), 
    ecritureController.annulerPieceComplete
);

// --- CONSULTATION ET LETTRAGE ---
router.get('/historique-compte/:num_compte', 
    verifyToken, 
    verifyLicense('COMPTA_BASE'), 
    ecritureController.getHistoriqueParCompte
);

router.get('/historique-tiers/:num_tiers', 
    verifyToken, 
    verifyLicense('COMPTA_BASE'), 
    ecritureController.getHistoriqueParTiers
);

router.get('/prochaine-lettre', 
    verifyToken, 
    verifyLicense('COMPTA_BASE'), 
    ecritureController.getProchaineLettre
);

router.post('/lettrer', 
    verifyToken, 
    verifyLicense('COMPTA_BASE'), 
    ecritureController.lettrerEcritures
);

router.post('/delettrer', 
    verifyToken, 
    verifyLicense('COMPTA_BASE'), 
    ecritureController.delettrerEcritures
);

module.exports = router;