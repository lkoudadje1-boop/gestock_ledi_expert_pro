const express = require('express');
const router = express.Router();
const exerciceController = require('../controllers/exercice.controller');
const { verifyToken } = require('../middlewares/auth.middleware');
// Import du middleware de licence
const verifyLicense = require('../middlewares/license.middleware');

/**
 * Selon ton routeMapping : 
 * '/api/exercices' => 'COMPTA_BASE'
 */

/**
 * @route   GET /api/exercices/liste
 */
router.get('/liste', 
    verifyToken, 
    verifyLicense('COMPTA_BASE'), 
    exerciceController.getExercices
);

/**
 * @route   POST /api/exercices/creer
 */
router.post('/creer', 
    verifyToken, 
    verifyLicense('COMPTA_BASE'), 
    exerciceController.creerExercice
);

/**
 * @route   PUT /api/exercices/statut/:id
 */
router.put('/statut/:id', 
    verifyToken, 
    verifyLicense('COMPTA_BASE'), 
    exerciceController.updateStatut
);

/**
 * @route   PUT /api/exercices/:id
 */
router.put('/:id', 
    verifyToken, 
    verifyLicense('COMPTA_BASE'), 
    exerciceController.modifierExercice
);

/**
 * @route   DELETE /api/exercices/:id
 */
router.delete('/:id', 
    verifyToken, 
    verifyLicense('COMPTA_BASE'), 
    exerciceController.supprimerExercice
);

module.exports = router;