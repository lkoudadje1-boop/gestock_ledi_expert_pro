// backend/routes/sync.routes.js
const express = require('express');
const router = express.Router();
const { syncLocalToCloud, syncCloudToLocal, checkCloudUpdates } = require('../services/sync.service'); // 👈 AJOUTÉ ICI
const { verifyToken } = require('../middlewares/auth.middleware');
const { checkCompanyAccess } = require('../middlewares/company.middleware');
const verifyLicense = require('../middlewares/license.middleware');
const { logAction } = require('../utils/auditHelper');

/**
 * @route POST /api/sync/push-all
 * @desc Force la synchronisation immédiate de toutes les données locales en attente vers le Cloud (MongoDB)
 */
router.post('/push-all', 
    verifyToken, 
    checkCompanyAccess, 
    verifyLicense('SYSTEM'), // 🛡️ Protection par licence système
    async (req, res) => {
        const userId = req.user.userId;
        const userName = req.user.username;
        const companyId = req.companyId;

        console.log(`☁️ [SYNC] PUSH demandé par l'utilisateur ID: ${userId} pour l'entreprise ${companyId}`);
        
        try {
            const result = await syncLocalToCloud();

            logAction({
                userId, userName, actionType: 'SYNCHRONISATION',
                tableConcernee: 'ALL', referenceId: 'CLOUD_PUSH',
                description: `Synchronisation manuelle locale vers le cloud réussie.`,
                companyId
            });

            return res.json({ 
                success: true, 
                message: "Sauvegarde Cloud (Push) réussie !",
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error("❌ [SYNC PUSH ROUTE ERROR]:", error.message);

            logAction({
                userId, userName, actionType: 'SYNCHRONISATION_ECHEC',
                tableConcernee: 'ALL', referenceId: 'CLOUD_PUSH',
                description: `Échec de la synchronisation cloud (Push) : ${error.message}`,
                companyId
            });

            return res.status(500).json({ 
                success: false, 
                message: "Erreur serveur lors de la sauvegarde cloud : " + error.message 
            });
        }
    }
);

/**
 * @route POST /api/sync/pull
 * @desc Récupère et met à jour les données du Cloud vers SQLite local pour l'entreprise connectée
 */
router.post('/pull', 
    verifyToken, 
    checkCompanyAccess, 
    verifyLicense('SYSTEM'), // 🛡️ Protection par licence système
    async (req, res) => {
        const userId = req.user.userId;
        const userName = req.user.username;
        const companyId = req.companyId;

        console.log(`☁️ [SYNC] PULL demandé par l'utilisateur ID: ${userId} pour l'entreprise ${companyId}`);
        
        try {
            await syncCloudToLocal(companyId);

            logAction({
                userId, userName, actionType: 'SYNCHRONISATION',
                tableConcernee: 'ALL', referenceId: 'CLOUD_PULL',
                description: `Récupération des données depuis le cloud (Pull) réussie.`,
                companyId
            });

            return res.json({ 
                success: true, 
                message: "Mise à jour depuis le Cloud (Pull) réussie !",
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error("❌ [SYNC PULL ROUTE ERROR]:", error.message);

            logAction({
                userId, userName, actionType: 'SYNCHRONISATION_ECHEC',
                tableConcernee: 'ALL', referenceId: 'CLOUD_PULL',
                description: `Échec de la récupération cloud (Pull) : ${error.message}`,
                companyId
            });

            return res.status(500).json({ 
                success: false, 
                message: "Erreur serveur lors de la récupération cloud : " + error.message 
            });
        }
    }
);

/**
 * @route GET /api/sync/check-updates/:lastSync
 * @desc Permet à l'application locale de vérifier en arrière-plan si le Cloud a reçu des modifications
 */
router.get('/check-updates/:lastSync',
    verifyToken,
    checkCompanyAccess,
    async (req, res) => {
        const companyId = req.companyId;
        const { lastSync } = req.params;

        try {
            const hasUpdates = await checkCloudUpdates(companyId, lastSync);
            return res.json({ success: true, hasUpdates });
        } catch (error) {
            console.error("❌ [CHECK-UPDATES ROUTE ERROR]:", error.message);
            return res.status(500).json({ success: false, error: error.message });
        }
    }
);

module.exports = router;