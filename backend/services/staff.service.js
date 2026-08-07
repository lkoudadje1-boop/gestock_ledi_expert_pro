const { getDb } = require('../config/database');
const { logAction } = require('../utils/auditHelper');

class StaffService {
    /**
     * Génère un ID unique pour le personnel (Léon Style)
     */
    genererIdStaff() {
        return `STF-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`;
    }

    /**
     * Récupère tout le personnel d'une entreprise
     */
    async findAll(companyId) {
        const db = getDb();
        return db.prepare(`
            SELECT * FROM staff 
            WHERE company_id = ? 
            ORDER BY name ASC
        `).all(companyId);
    }

    /**
     * Récupère un employé spécifique
     */
    async findOne(id, companyId) {
        const db = getDb();
        return db.prepare('SELECT * FROM staff WHERE id = ? AND company_id = ?').get(id, companyId);
    }

    /**
     * Prépare les données pour l'insertion ou la mise à jour
     */
    formatData(data) {
        return {
            name: data.name ? data.name.toUpperCase() : '',
            phone: data.phone || '',
            email: data.email || '',
            adresse: data.adresse || '',
            nif: data.nif || '',
            cnss: data.cnss || '',
            fonction: data.fonction || '',
            is_active: data.is_active !== undefined ? (data.is_active ? 1 : 0) : 1
        };
    }

    /**
     * Crée un nouveau membre du personnel
     */
    async create(data, user) {
        const db = getDb();
        const { companyId, id: userId, username: userName } = user;
        const formatted = this.formatData(data);
        const staffId = this.genererIdStaff();

        const result = db.transaction(() => {
            db.prepare(`
                INSERT INTO staff (id, company_id, name, phone, email, adresse, nif, cnss, fonction, is_active, sync_status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
            `).run(staffId, companyId, formatted.name, formatted.phone, formatted.email, formatted.adresse, formatted.nif, formatted.cnss, formatted.fonction, formatted.is_active);

            db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('staff', ?, 'INSERT', ?)").run(staffId, companyId);

            return { id: staffId };
        })();

        // 💡 Log d'audit après le succès de l'insertion
        logAction({
            userId,
            userName,
            actionType: 'CREATE',
            tableConcernee: 'staff',
            referenceId: staffId,
            description: `Création du personnel : ${formatted.name} (Fonction: ${formatted.fonction || 'Non spécifiée'})`,
            companyId
        });

        return result;
    }

    /**
     * Met à jour un membre du personnel
     */
    async update(id, data, user) {
        const db = getDb();
        const { companyId, id: userId, username: userName } = user;
        const formatted = this.formatData(data);

        db.transaction(() => {
            // Vérifier l'existence
            const existing = db.prepare('SELECT id FROM staff WHERE id = ? AND company_id = ?').get(id, companyId);
            if (!existing) throw new Error("Employé introuvable.");

            db.prepare(`
                UPDATE staff 
                SET name = ?, phone = ?, email = ?, adresse = ?, nif = ?, cnss = ?, fonction = ?, is_active = ?, sync_status = 'pending', updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND company_id = ?
            `).run(formatted.name, formatted.phone, formatted.email, formatted.adresse, formatted.nif, formatted.cnss, formatted.fonction, formatted.is_active, id, companyId);

            db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('staff', ?, 'UPDATE', ?)").run(id, companyId);
        })();

        // 💡 Log d'audit après le succès de la mise à jour
        logAction({
            userId,
            userName,
            actionType: 'UPDATE',
            tableConcernee: 'staff',
            referenceId: id,
            description: `Mise à jour du personnel : ${formatted.name} (Statut Actif: ${formatted.is_active})`,
            companyId
        });

        return { success: true };
    }

    /**
     * Supprime un membre du personnel
     */
    async delete(id, user) {
        const db = getDb();
        const { companyId, id: userId, username: userName } = user;

        const staffName = db.transaction(() => {
            const staff = db.prepare('SELECT name FROM staff WHERE id = ? AND company_id = ?').get(id, companyId);
            if (!staff) throw new Error("Employé introuvable.");

            db.prepare('DELETE FROM staff WHERE id = ? AND company_id = ?').run(id, companyId);
            db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('staff', ?, 'DELETE', ?)").run(id, companyId);

            return staff.name;
        })();

        // 💡 Log d'audit après le succès de la suppression
        logAction({
            userId,
            userName,
            actionType: 'DELETE',
            tableConcernee: 'staff',
            referenceId: id,
            description: `Suppression définitive du personnel : ${staffName}`,
            companyId
        });

        return { success: true };
    }
}

module.exports = new StaffService();