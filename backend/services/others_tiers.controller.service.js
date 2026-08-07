const { getDb } = require('../config/database');
const { logAction } = require('../utils/auditHelper');

class OthersTiersService {
    // Générateur d'ID spécifique
    genererIdOtherTier() {
        return `OTR-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`;
    }

    // Récupérer tous les tiers
    getAll(companyId) {
        const db = getDb();
        return db.prepare(`SELECT * FROM others_tiers WHERE company_id = ? ORDER BY nom ASC`).all(companyId);
    }

    // Créer un tiers
    create(data, user) {
        const db = getDb();
        const { companyId, userId, username: userName } = user;
        const { nom, nif, contact, telephone, email, adresse } = data;

        const tierId = this.genererIdOtherTier();
        const nomPropre = nom.toUpperCase();

        db.transaction(() => {
            db.prepare(`
                INSERT INTO others_tiers (id, company_id, nom, nif, contact, telephone, email, adresse, is_active, sync_status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'pending')
            `).run(tierId, companyId, nomPropre, nif || '0', contact || nomPropre, telephone || '', email || '', adresse || '');

            // 🔄 Synchronisation Cloud (INSERT)
            db.prepare(`
                INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
                VALUES ('others_tiers', ?, 'INSERT', ?)
            `).run(tierId, companyId);

            logAction({ 
                userId, userName, actionType: 'INSERTION', 
                tableConcernee: 'others_tiers', referenceId: tierId, 
                description: `Création tiers divers: ${nomPropre}`, companyId 
            });
        })();

        return { tierId, nomPropre };
    }

    // Mettre à jour un tiers
    update(id, data, user) {
        const db = getDb();
        const { companyId, userId, username: userName } = user;
        const { nom, nif, contact, telephone, email, adresse, is_active } = data;
        const nomPropre = nom.toUpperCase();

        let result;
        db.transaction(() => {
            result = db.prepare(`
                UPDATE others_tiers 
                SET nom = ?, nif = ?, contact = ?, telephone = ?, email = ?, adresse = ?, is_active = ?, sync_status = 'pending', updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND company_id = ?
            `).run(nomPropre, nif || '0', contact || nomPropre, telephone || '', email || '', adresse || '', is_active ? 1 : 0, id, companyId);

            if (result.changes > 0) {
                // 🔄 Synchronisation Cloud (UPDATE)
                db.prepare(`
                    INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
                    VALUES ('others_tiers', ?, 'UPDATE', ?)
                `).run(id, companyId);

                logAction({ 
                    userId, userName, actionType: 'MODIFICATION', 
                    tableConcernee: 'others_tiers', referenceId: id, 
                    description: `Mise à jour tiers divers: ${nomPropre}`, companyId 
                });
            }
        })();

        return result.changes > 0;
    }

    // Supprimer un tiers
    delete(id, user) {
        const db = getDb();
        const { companyId, userId, username: userName } = user;

        let result;
        db.transaction(() => {
            result = db.prepare(`DELETE FROM others_tiers WHERE id = ? AND company_id = ?`).run(id, companyId);
            
            if (result.changes > 0) {
                // 🔄 Synchronisation Cloud (DELETE) avant ou après l'opération
                db.prepare(`
                    INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
                    VALUES ('others_tiers', ?, 'DELETE', ?)
                `).run(id, companyId);

                logAction({ 
                    userId, userName, actionType: 'SUPPRESSION', 
                    tableConcernee: 'others_tiers', referenceId: id, 
                    description: `Suppression tiers divers ${id}`, companyId 
                });
            }
        })();

        return result.changes > 0;
    }
}

module.exports = new OthersTiersService();