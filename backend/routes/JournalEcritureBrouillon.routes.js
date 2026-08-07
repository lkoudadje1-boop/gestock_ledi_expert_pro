const express = require('express');
const router = express.Router();
const controller = require('../controllers/JournalEcritureBrouillon.controller');
const { verifyToken } = require('../middlewares/auth.middleware');
// Import du middleware de licence
const verifyLicense = require('../middlewares/license.middleware');

/**
 * Selon ton routeMapping : 
 * '/api/compta/brouillon' => 'COMPTA_BASE'
 */

// Saisie kilométrique
router.post('/enregistrer-ligne', 
    verifyToken, 
    verifyLicense('COMPTA_BASE'), 
    controller.enregistrerLigneBrouillonIndividuelle
);

// Saisie groupée (Création d'une pièce entière en brouillon)
router.post('/creer-ecriture', 
    verifyToken, 
    verifyLicense('COMPTA_BASE'), 
    controller.creerEcritureBrouillon
);

// Affichage de la grille de saisie
router.get('/lignes-periodiques', 
    verifyToken, 
    verifyLicense('COMPTA_BASE'), 
    controller.getLignesBrouillonParPeriode
);

// Suppression / Annulation d'une pièce en brouillon
router.post('/annuler-piece', 
    verifyToken, 
    verifyLicense('COMPTA_BASE'), 
    controller.supprimerPieceBrouillon
);

// ✅ VALIDATION : Transfert du brouillon vers le journal définitif
router.post('/valider-piece', 
    verifyToken, 
    verifyLicense('COMPTA_BASE'), 
    controller.validerPieceBrouillon
);

// ✅ REJET : Suppression ou marquage comme rejeté
router.post('/rejeter-piece', 
    verifyToken, 
    verifyLicense('COMPTA_BASE'), 
    controller.rejeterPieceBrouillon
);

// Liste des journaux autorisés pour le brouillon
router.get('/liste-journaux-brouillon', 
    verifyToken, 
    verifyLicense('COMPTA_BASE'), 
    controller.getJournauxPourBrouillon
);

module.exports = router;