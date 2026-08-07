const express = require('express');
const router = express.Router();
const othersTiersCtrl = require('../controllers/others_tiers.controller'); 
const { verifyToken } = require('../middlewares/auth.middleware');
// Import du middleware de licence
const verifyLicense = require('../middlewares/license.middleware');

/**
 * 🔍 DIAGNOSTIC DE SÉCURITÉ
 */
const checkController = (fnName) => {
    if (typeof othersTiersCtrl[fnName] !== 'function') {
        console.error(`❌ ERREUR CRITIQUE : La fonction "${fnName}" est indéfinie dans others_tiers.controller.js`);
        return (req, res) => res.status(500).json({ error: `Route ${fnName} non configurée.` });
    }
    return othersTiersCtrl[fnName];
};

/**
 * Selon ton routeMapping : 
 * '/api/others-tiers' => 'COMPTA_BASE'
 */

// --- ROUTES POUR LES TIERS DIVERS ---

// Lister tous les tiers divers
router.get('/', 
    verifyToken, 
    verifyLicense('COMPTA_BASE'), 
    checkController('getAllOthersTiers')
);

// Créer un tiers divers
router.post('/', 
    verifyToken, 
    verifyLicense('COMPTA_BASE'), 
    checkController('createOtherTier')
);

// Modifier un tiers divers
router.put('/:id', 
    verifyToken, 
    verifyLicense('COMPTA_BASE'), 
    checkController('updateOtherTier')
);

// Supprimer un tiers divers
router.delete('/:id', 
    verifyToken, 
    verifyLicense('COMPTA_BASE'), 
    checkController('deleteOtherTier')
);

module.exports = router;