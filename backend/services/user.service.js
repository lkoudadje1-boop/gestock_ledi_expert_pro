const { getDb } = require('../config/database');
const { hashPassword } = require('../utils/helpers');
const { logAction } = require('../utils/auditHelper');

class UserService {
    /**
     * Génère un ID utilisateur (Léon Style)
     */
    genererIdUser() {
        return `USR-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`;
    }

    /**
     * Formate et valide les permissions pour l'enregistrement
     */
    formatPermissions(permissions) {
        if (!permissions) return JSON.stringify({});
        return typeof permissions === 'string' ? permissions : JSON.stringify(permissions);
    }

    /**
     * Prépare un mot de passe temporaire haché
     */
    async prepareTempPassword() {
        const tempPassword = Math.random().toString(36).slice(-10).toUpperCase();
        const hashedPassword = await hashPassword(tempPassword);
        return { tempPassword, hashedPassword };
    }

    /**
     * Récupère un utilisateur pour vérification
     */
    getUserById(id, companyId) {
        const db = getDb();
        return db.prepare('SELECT * FROM users WHERE id = ? AND company_id = ?').get(id, companyId);
    }

    /**
     * Crée un utilisateur avec traçabilité Cloud et audit
     */
    async create(data, userContext) {
        const db = getDb();
        const { companyId, id: creatorId, username: creatorName } = userContext;
        
        const userId = this.genererIdUser();
        const { tempPassword, hashedPassword } = await this.prepareTempPassword();
        const perms = this.formatPermissions(data.permissions);

        const result = db.transaction(() => {
            db.prepare(`
                INSERT INTO users (
                    id, company_id, username, email, password, role, fonction, permissions, sync_status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
            `).run(
                userId, companyId, data.username, data.email, hashedPassword, 
                data.role || 'USER', data.fonction || '', perms
            );

            db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('users', ?, 'INSERT', ?)").run(userId, companyId);
            
            return { userId, tempPassword };
        })();

        logAction({
            userId: creatorId,
            userName: creatorName,
            actionType: 'CREATE',
            tableConcernee: 'users',
            referenceId: userId,
            description: `Création utilisateur : ${data.username} (Role: ${data.role})`,
            companyId
        });

        return result;
    }

    /**
     * Supprime un utilisateur (Désactivation avec traçabilité)
     */
    async delete(id, userContext) {
        const db = getDb();
        const { companyId, id: creatorId, username: creatorName } = userContext;

        const userName = db.transaction(() => {
            const user = db.prepare('SELECT username FROM users WHERE id = ? AND company_id = ?').get(id, companyId);
            if (!user) throw new Error("Utilisateur introuvable.");

            db.prepare('DELETE FROM users WHERE id = ? AND company_id = ?').run(id, companyId);
            db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('users', ?, 'DELETE', ?)").run(id, companyId);
            
            return user.username;
        })();

        logAction({
            userId: creatorId,
            userName: creatorName,
            actionType: 'DELETE',
            tableConcernee: 'users',
            referenceId: id,
            description: `Suppression utilisateur : ${userName}`,
            companyId
        });

        return { success: true };
    }
}

module.exports = new UserService();