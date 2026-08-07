const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { verifyToken } = require('../middlewares/auth.middleware');
// Optionnel : si tu veux que seuls ceux qui ont une licence valide 
// puissent même voir la config (même si c'est pour leur dire qu'ils n'ont rien)
// const verifyLicense = require('../middlewares/license.middleware');

/**
 * @route   GET /api/settings/ui-config
 * @desc    Récupère la configuration de l'interface basée sur la licence
 * @access  Privé
 */
router.get('/ui-config', 
    verifyToken, 
    // Ici, on ne met pas de verifyLicense spécifique à un module car 
    // cette route est justement celle qui SERT à savoir quels modules sont actifs.
    settingsController.getUiConfiguration
);

module.exports = router;