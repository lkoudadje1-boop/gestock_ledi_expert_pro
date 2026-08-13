// backend/utils/auditHelper.js
const { CloudAuditLog } = require('../models/cloud.model');

/**
 * Enregistre une action dans le journal d'audit MongoDB Cloud.
 * Note : La synchronisation est automatique dans le Cloud, 
 * plus besoin de table 'sync_queue'.
 */
exports.logAction = async ({ userId, userName, actionType, tableConcernee, referenceId, description, companyId }) => {
    
    // Générer un ID local cohérent (ou laisser MongoDB gérer _id)
    const localId = `AUD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const finalCompanyId = companyId || 'SYSTEM';

    try {
        const newLog = new CloudAuditLog({
            localId: localId,
            user_id: userId,
            user_name: userName,
            action_type: actionType,
            table_concernee: tableConcernee,
            reference_id: referenceId,
            description: description,
            company_id: finalCompanyId,
            date_action: new Date(),
            sync_status: 'synced'
        });

        await newLog.save();
        
        console.log(`✅ [Audit] ${actionType} enregistré pour ${tableConcernee} (Company: ${finalCompanyId})`);
    } catch (err) {
        // Log l'erreur sans bloquer le flux de l'utilisateur
        console.error("❌ Erreur lors de l'insertion dans CloudAuditLog:", err.message);
    }
};