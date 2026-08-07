const { getDb } = require('../config/database');
const { logAction } = require('../utils/auditHelper');

class SupplierService {
    genererIdFournisseur() {
        return `SUP-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`;
    }

    // --- RÉCUPÉRER TOUS LES FOURNISSEURS ---
    async getAllSuppliers(companyId) {
        const db = getDb();
        return db.prepare(`SELECT * FROM suppliers WHERE company_id = ? ORDER BY nom ASC`).all(companyId);
    }

    // --- CRÉER UN NOUVEAU FOURNISSEUR ---
    async createSupplier(d, user, io) {
        const db = getDb();
        const { companyId, userId, username: userName } = user;
        const { nom, nif, telephone, email, adresse } = d;

        if (!nom) throw new Error("Nom obligatoire.");

        const supplierId = this.genererIdFournisseur();
        const nomPropre = nom.toUpperCase();

        db.transaction(() => {
            // Insertion métier
            db.prepare(`
                INSERT INTO suppliers (id, company_id, nom, nif, contact, telephone, email, adresse, is_active, sync_status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'pending')
            `).run(supplierId, companyId, nomPropre, nif || 0, nomPropre, telephone || '', email || '', adresse || '');

            // Synchronisation (le trigger sync_queue s'occupera du reste si configuré, 
            // sinon on garde l'insertion manuelle ici si nécessaire)
            db.prepare(`
                INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
                VALUES ('suppliers', ?, 'INSERT', ?)
            `).run(supplierId, companyId);

            logAction({ 
                userId, userName, actionType: 'INSERTION', 
                tableConcernee: 'suppliers', referenceId: supplierId, 
                description: `Création fournisseur: ${nomPropre}`, companyId 
            });
        })();

        if (io && companyId) {
            const room = companyId.toString();
            io.to(room).emit('SUPPLIERS_UPDATED');
            io.to(room).emit('REFRESH_UI', { module: 'SUPPLIERS', action: 'CREATE', message: `Fournisseur ajouté : ${nomPropre}` });
        }

        return supplierId;
    }

    // --- METTRE À JOUR UN FOURNISSEUR ---
    async updateSupplier(id, d, user, io) {
        const db = getDb();
        const { companyId, userId, username: userName } = user;
        const { nom, nif, telephone, email, adresse } = d;
        const nomPropre = nom.toUpperCase();

        let result;
        db.transaction(() => {
            result = db.prepare(`
                UPDATE suppliers SET nom = ?, nif = ?, telephone = ?, email = ?, adresse = ?, sync_status = 'pending'
                WHERE id = ? AND company_id = ?
            `).run(nomPropre, nif || 0, telephone || '', email || '', adresse || '', id, companyId);

            if (result.changes > 0) {
                db.prepare(`
                    INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
                    VALUES ('suppliers', ?, 'UPDATE', ?)
                `).run(id, companyId);
                      
                logAction({ 
                    userId, userName, actionType: 'MODIFICATION', 
                    tableConcernee: 'suppliers', referenceId: id, 
                    description: `Mise à jour fournisseur: ${nomPropre}`, companyId 
                });
            }
        })();

        if (result.changes > 0 && io && companyId) {
            const room = companyId.toString();
            io.to(room).emit('SUPPLIERS_UPDATED');
            io.to(room).emit('REFRESH_UI', { module: 'SUPPLIERS', action: 'UPDATE', message: `Fournisseur mis à jour : ${nomPropre}` });
        }

        return result.changes > 0;
    }

    // --- METTRE À JOUR LE STATUT (ARCHIVAGE) ---
    async updateStatus(id, is_active, user, io) {
        const db = getDb();
        const { companyId, userId, username: userName } = user;

        let result;
        db.transaction(() => {
            result = db.prepare(`UPDATE suppliers SET is_active = ?, sync_status = 'pending' WHERE id = ? AND company_id = ?`)
                       .run(is_active ? 1 : 0, id, companyId);

            if (result.changes > 0) {
                db.prepare(`
                    INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
                    VALUES ('suppliers', ?, 'UPDATE', ?)
                `).run(id, companyId);
                
                logAction({ 
                    userId, userName, actionType: 'MODIFICATION', 
                    tableConcernee: 'suppliers', referenceId: id, 
                    description: `Statut fournisseur ${id} -> ${is_active ? 'Actif' : 'Archivé'}`, companyId 
                });
            }
        })();

        if (result.changes > 0 && io && companyId) {
            const room = companyId.toString();
            io.to(room).emit('SUPPLIERS_UPDATED');
            io.to(room).emit('REFRESH_UI', { module: 'SUPPLIERS', action: 'STATUS_UPDATE' });
        }

        return result.changes > 0;
    }

    // --- SUPPRIMER UN FOURNISSEUR ---
    async deleteSupplier(id, user, io) {
        const db = getDb();
        const { companyId, userId, username: userName } = user;

        let result;
        db.transaction(() => {
            // Ajout à la sync_queue AVANT la suppression locale pour garder la trace
            db.prepare(`
                INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
                VALUES ('suppliers', ?, 'DELETE', ?)
            `).run(id, companyId);
            
            result = db.prepare(`DELETE FROM suppliers WHERE id = ? AND company_id = ?`).run(id, companyId);

            if (result.changes > 0) {
                logAction({ 
                    userId, userName, actionType: 'SUPPRESSION', 
                    tableConcernee: 'suppliers', referenceId: id, 
                    description: `Suppression fournisseur ${id}`, companyId 
                });
            }
        })();

        if (result.changes > 0 && io && companyId) {
            const room = companyId.toString();
            io.to(room).emit('SUPPLIERS_UPDATED');
            io.to(room).emit('REFRESH_UI', { module: 'SUPPLIERS', action: 'DELETE' });
        }

        return result.changes > 0;
    }
}

module.exports = new SupplierService();