const express = require('express');
const router = express.Router();
const brouillardCtrl = require('../controllers/TypeBrouillard.controller');
const { verifyToken } = require('../middlewares/auth.middleware');

// Route pour alimenter le tableau (L'URL appelée par React: /liste)
router.get('/liste', verifyToken, brouillardCtrl.getBrouillards);

// Route pour enregistrer un nouveau (L'URL appelée par React: /creer)
router.post('/creer', verifyToken, brouillardCtrl.creerBrouillard);

// Route pour modifier (L'URL appelée par React: /modifier/:id)
router.put('/modifier/:id', verifyToken, brouillardCtrl.modifierBrouillard);

// Route pour supprimer (L'URL appelée par React: /supprimer/:id)
router.delete('/supprimer/:id', verifyToken, brouillardCtrl.supprimerBrouillard);
router.post('/config/assignation', verifyToken, brouillardCtrl.assignerUtilisateur);
router.get('/config/affectations/:id', verifyToken, brouillardCtrl.getAffectations);
router.get('/mes-acces', verifyToken, brouillardCtrl.getBrouillardsAffectes);
// Route pour SUPPRIMER un accès
router.delete('/config/affectation/:brouillard_id/:user_id', verifyToken, brouillardCtrl.supprimerAffectation);


module.exports = router;