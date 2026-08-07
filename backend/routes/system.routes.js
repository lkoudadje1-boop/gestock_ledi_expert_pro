// backend/routes/system.routes.js
const express = require('express');
const router = express.Router();
const { pushAllToCloud } = require('../services/sync.service');
const { verifyToken } = require('../middlewares/auth.middleware');
const { checkCompanyAccess } = require('../middlewares/company.middleware');
const { logAction } = require('../utils/auditHelper');
// Import du middleware de licence
const verifyLicense = require('../middlewares/license.middleware');

/**
 * Force la synchronisation immédiate de toutes les données locales vers le Cloud
 * Selon ton routeMapping : 'ADMIN' gère l'infrastructure et la maintenance.
 */
router.post('/push-all', 
    verifyToken, 
    checkCompanyAccess, 
    verifyLicense('SYSTEM'), // 👈 Protection par licence
    async (req, res) => {
        
        const userId = req.user.userId;
        const userName = req.user.username;
        const companyId = req.companyId; 

        console.log(`☁️ [CLOUD] Sauvegarde manuelle demandée par l'utilisateur ID: ${userId}`);
        
        try {
            const result = await pushAllToCloud(companyId);

            if (result.success) {
                // Audit Log: Synchronisation réussie
                logAction({
                    userId, userName, actionType: 'SYNCHRONISATION',
                    tableConcernee: 'ALL', referenceId: 'CLOUD',
                    description: `Synchronisation manuelle vers le cloud réussie.`,
                    companyId
                });

                res.json({ 
                    success: true, 
                    message: "Sauvegarde Cloud réussie !",
                    timestamp: new Date().toISOString()
                });
            } else {
                // Audit Log: Synchronisation échouée
                logAction({
                    userId, userName, actionType: 'SYNCHRONISATION_ECHEC',
                    tableConcernee: 'ALL', referenceId: 'CLOUD',
                    description: `Échec de la synchronisation cloud : ${result.error || 'Erreur inconnue'}`,
                    companyId
                });

                res.status(500).json({ 
                    success: false, 
                    message: "La synchronisation a échoué partiellement.",
                    error: result.error 
                });
            }
        } catch (error) {
            console.error("❌ [SYNC ROUTE ERROR]:", error.message);

            // Audit Log: Erreur critique
            logAction({
                userId, userName, actionType: 'SYNCHRONISATION_ECHEC',
                tableConcernee: 'ALL', referenceId: 'CLOUD',
                description: `Erreur critique lors de la synchro : ${error.message}`,
                companyId
            });

            res.status(500).json({ 
                success: false, 
                message: "Erreur serveur lors de la sauvegarde cloud : " + error.message 
            });
        }
    }
);

module.exports = router;