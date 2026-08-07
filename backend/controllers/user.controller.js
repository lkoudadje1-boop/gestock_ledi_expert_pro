const { getDb } = require('../config/database');
const { logAction } = require('../utils/auditHelper');
const { sendWelcomeEmail } = require('../services/mailer.service');
const UserService = require('../services/user.service');

// Utilitaire de contexte harmonisé
const getContext = (req) => {
    const user = req.user || {};
    const companyId = user.companyId || user.company_id;
    return {
        companyId: companyId,
        companyName: user.companyName,
        userId: user.userId || user.id,
        userName: 'user' // ✅ Consigne [2026-02-08]
    };
};

/**
 * Création d'un collaborateur
 */
exports.createEmployee = async (req, res) => {
    const db = getDb();
    const { username, email, role, fonction, permissions, nif, cnss, adresse } = req.body;
    const context = getContext(req);

    try {
        const { tempPassword, hashedPassword } = await UserService.prepareTempPassword();
        const newUserId = UserService.genererIdUser();
        const permsData = UserService.formatPermissions(permissions);

        let createdUser;

        db.transaction(() => {
            db.prepare(`
                INSERT INTO users (
                    id, username, email, password, role, 
                    company_id, fonction, nif, cnss, adresse, 
                    permissions, is_temp_password, is_active, sync_status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 'pending')
            `).run(
                newUserId, username, email, hashedPassword, role || 'user', 
                context.companyId, fonction || '', nif || '', cnss || '', adresse || '',
                permsData
            );

            logAction({
                userId: context.userId, 
                userName: context.userName, 
                actionType: 'INSERTION',
                tableConcernee: 'users', 
                referenceId: newUserId,
                description: `Création de l'utilisateur : ${username}`,
                companyId: context.companyId
            });
            
            createdUser = { id: newUserId, username, email, role, fonction, is_active: 1 };
        })();

        // 🔥 SIGNAL SOCKET HARMONISÉ
        if (req.io && context.companyId) {
            const room = String(context.companyId);
            // Signal universel pour la synchro cloud
            req.io.to(room).emit('DATA_EVENT', { 
                table: 'users', 
                action: 'INSERT', 
                id: newUserId 
            });
            // Signal UI
            req.io.to(room).emit('REFRESH_UI', { module: 'USERS', action: 'CREATE' });
        }

        res.status(201).json({ success: true, message: "Collaborateur créé.", data: createdUser });

        // Tâche de fond : Email
        setImmediate(() => {
            sendWelcomeEmail(email, username, tempPassword, context.companyName)
                .catch(err => console.error("⚠️ Erreur Mailer:", err.message));
        });

    } catch (error) {
        if (error.message.includes('UNIQUE constraint failed: users.email')) {
            return res.status(400).json({ success: false, message: "Cet email est déjà utilisé." });
        }
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Mise à jour d'un collaborateur
 */
exports.updateEmployee = async (req, res) => {
    const db = getDb();
    const { id } = req.params;
    const { username, email, role, fonction, nif, cnss, adresse, permissions, is_active } = req.body;
    const context = getContext(req);

    // Sécurité : pas d'auto-suspension
    if (String(id) === String(context.userId) && (is_active === false || is_active === 0)) {
        return res.status(403).json({ 
            success: false, 
            message: "Action interdite : vous ne pouvez pas suspendre votre propre compte." 
        });
    }

    try {
        const permsData = UserService.formatPermissions(permissions);

        db.transaction(() => {
            const oldUser = UserService.getUserById(id, context.companyId);
            if (!oldUser) throw new Error("Utilisateur introuvable.");

            db.prepare(`
                UPDATE users SET 
                    username = ?, email = ?, role = ?, fonction = ?, 
                    nif = ?, cnss = ?, adresse = ?, permissions = ?, 
                    is_active = ?, sync_status = 'pending'
                WHERE id = ? AND company_id = ?
            `).run(
                username, email, role, fonction, nif, cnss, adresse, 
                permsData, (is_active === true || is_active === 1) ? 1 : 0, id, context.companyId
            );

            logAction({
                userId: context.userId, 
                userName: context.userName, 
                actionType: 'MODIFICATION',
                tableConcernee: 'users', 
                referenceId: id,
                description: `Mise à jour : ${oldUser.username} -> ${username}`,
                companyId: context.companyId
            });
        })();

        // 🔥 TEMPS RÉEL & SÉCURITÉ
        if (req.io && context.companyId) {
            const companyRoom = String(context.companyId);
            const userRoom = id.toString();
            const permsObj = typeof permissions === 'string' ? JSON.parse(permissions) : permissions;

            // Signal universel
            req.io.to(companyRoom).emit('DATA_EVENT', { table: 'users', action: 'UPDATE', id });

            // Notification spécifique à l'utilisateur ciblé (changement de droits ou suspension)
            req.io.to(userRoom).emit('PERMISSIONS_UPDATED', { newPermissions: permsObj });

            if (is_active === false || is_active === 0) {
                req.io.to(userRoom).emit('ACCOUNT_DEACTIVATED', { 
                    message: "Votre accès a été révoqué par l'administrateur." 
                });
            }

            // Rafraîchissement global de la liste pour les autres admins
            req.io.to(companyRoom).emit('REFRESH_UI', { module: 'USERS', action: 'UPDATE' });
        }

        res.json({ success: true, message: "Profil mis à jour." });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};s