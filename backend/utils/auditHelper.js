// backend/utils/auditHelper.js
const { getDb } = require('../config/database');

/**
 * Enregistre une action dans le journal d'audit et l'ajoute à la file de synchronisation
 */
exports.logAction = ({ userId, userName, actionType, tableConcernee, referenceId, description, companyId }) => {
    const db = getDb();
    
    // 💡 Générer un ID unique pour le log d'audit
    const auditId = `AUD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    
    // Sécurité : Si pas de companyId (ex: échec login global), on utilise 'SYSTEM' ou null
    const finalCompanyId = companyId || 'SYSTEM';

    try {
        // 💡 Transaction pour garantir l'atomicité Log + Queue
        db.transaction(() => {
            // 1. Insérer dans audit_log
            db.prepare(`
                INSERT INTO audit_log (
                    id, user_id, user_name, action_type, table_concernee, 
                    reference_id, description, company_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(auditId, userId, userName, actionType, tableConcernee, referenceId, description, finalCompanyId);
            
            // 💡 2. Ajouter à la file de synchronisation (CORRIGÉ : ajout de company_id)
            db.prepare(`
                INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
                VALUES ('audit_log', ?, 'INSERT', ?)
            `).run(auditId, finalCompanyId);
            
            console.log(`✅ Audit log enregistré et mis en file d'attente : ${actionType} sur ${tableConcernee}`);
        })();                
        
    } catch (err) {
        // On logue l'erreur mais on ne bloque pas l'utilisateur
        console.error("❌ Erreur lors de l'insertion dans audit_log:", err.message);
    }
};