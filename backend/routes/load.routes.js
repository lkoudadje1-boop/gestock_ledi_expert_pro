const express = require('express');
const router = express.Router();
const loadCtrl = require('../controllers/load.controller');
const { verifyToken } = require('../middlewares/auth.middleware');

/**
 * @route   GET /api/license/status
 * @desc    Récupère les infos de licence (Détenteur, Expiration, Modules)
 * @access  Privé (Token requis)
 * NOTE : Pas de verifyLicense ici, car on doit pouvoir consulter le statut 
 * même si la licence est invalide ou expirée.
 */
router.get('/status', verifyToken, loadCtrl.getSystemStatus);

/**
 * @route   POST /api/license/update
 * @desc    Met à jour le fichier metadata.dat physiquement sur le serveur
 * @access  Privé (ADMIN recommandé)
 * NOTE : Cette route est vitale. Seul un utilisateur authentifié peut 
 * injecter une nouvelle licence.
 */
router.post('/update', verifyToken, loadCtrl.updateLicense);

module.exports = router;