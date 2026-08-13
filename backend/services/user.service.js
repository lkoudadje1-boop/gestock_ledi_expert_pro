// backend/services/user.service.js
const { CloudUser } = require('../models/cloud.model');
const { hashPassword } = require('../utils/helpers');
const { logAction } = require('../utils/auditHelper');

class UserService {
    /**
     * Génère un ID utilisateur
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
    async getUserById(id, companyId) {
        return await CloudUser.findOne({ 
            localId: id.toString(), 
            company_id: companyId.toString() 
        }).lean();
    }

    /**
     * Crée un utilisateur avec traçabilité Cloud et audit
     */
    async create(data, userContext) {
        const { companyId, id: creatorId, username: creatorName } = userContext;
        
        const userId = this.genererIdUser();
        const { tempPassword, hashedPassword } = await this.prepareTempPassword();
        const perms = this.formatPermissions(data.permissions);

        await CloudUser.create({
            localId: userId,
            company_id: companyId.toString(),
            username: data.username,
            email: data.email,
            password: hashedPassword,
            role: data.role || 'USER',
            fonction: data.fonction || '',
            permissions: perms,
            is_temp_password: true,
            is_active: true,
            sync_status: 'synced'
        });

        await logAction({
            userId: creatorId,
            userName: creatorName,
            actionType: 'CREATE',
            tableConcernee: 'users',
            referenceId: userId,
            description: `Création utilisateur : ${data.username} (Role: ${data.role || 'USER'})`,
            companyId: companyId.toString()
        });

        return { userId, tempPassword };
    }

    /**
     * Supprime un utilisateur (Désactivation avec traçabilité)
     */
    async delete(id, userContext) {
        const { companyId, id: creatorId, username: creatorName } = userContext;

        const user = await CloudUser.findOne({ 
            localId: id.toString(), 
            company_id: companyId.toString() 
        });
        if (!user) throw new Error("Utilisateur introuvable.");

        const userName = user.username;
        await CloudUser.deleteOne({ 
            localId: id.toString(), 
            company_id: companyId.toString() 
        });

        await logAction({
            userId: creatorId,
            userName: creatorName,
            actionType: 'DELETE',
            tableConcernee: 'users',
            referenceId: id.toString(),
            description: `Suppression utilisateur : ${userName}`,
            companyId: companyId.toString()
        });

        return { success: true };
    }
}

module.exports = new UserService();