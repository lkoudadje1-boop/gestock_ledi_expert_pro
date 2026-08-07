const { restoreFromCloud } = require('../services/restore.service');
// 👈 1. Importer le helper d'audit
const { logAction } = require('../utils/auditHelper');

/**
 * Gère la restauration des données depuis le Cloud pour l'entité unique
 */
const handleRestoreRequest = async (req, res) => {
    // SÉCURITÉ : On récupère l'ID sous forme de CHAÎNE (String)
    const companyId = req.user ? req.user.companyId : null;
    const userId = req.user ? req.user.userId : null; // 👈 Pour l'audit
    const userName = req.user ? req.user.username : 'Utilisateur'; // 👈 Pour l'audit
    const userRole = req.user ? req.user.role : null;

    // 1. Vérification de l'identité
    if (!companyId) {
        return res.status(401).json({ error: "Session ou ID entreprise invalide" });
    }

    // 2. Sécurité : Seul l'admin peut déclencher une restauration
    if (userRole !== 'admin' && userRole !== 'super_admin') {
        return res.status(403).json({ error: "Accès refusé : Droits d'administrateur requis" });
    }

    try {
        console.log(`Relance de la restauration Cloud pour l'entreprise ID: ${companyId}`);

        // 3. Appel du service de restauration
        const result = await restoreFromCloud(companyId);
        
        // 👈 4. Audit Log: Restauration des données
        logAction({
            userId, userName, actionType: 'RESTAURATION',
            tableConcernee: 'ALL', referenceId: companyId,
            description: `Restauration des données depuis le cloud déclenchée par ${userRole}.`,
            companyId
        });

        res.json({ 
            success: true, 
            message: "Récupération des données cloud réussie", 
            details: result.details 
        });
    } catch (err) {
        console.error("Erreur lors de la restauration:", err);

        // 👈 5. Audit Log: Tentative de restauration échouée
logAction({
    userId, userName, actionType: 'RESTAURATION',
    tableConcernee: 'SYSTEME', 
    referenceId: `ENT-${companyId}`, // Mieux : utiliser un préfixe ou le nom de la société
    description: `Restauration des données cloud par ${userName} (${userRole}).`,
    companyId
});

        res.status(500).json({ 
            error: "Échec de la restauration des données",
            message: err.message 
        });
    }
};

module.exports = { 
    handleRestoreRequest
};