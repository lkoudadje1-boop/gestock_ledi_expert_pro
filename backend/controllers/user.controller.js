// backend/controllers/user.controller.js
const { logAction } = require('../utils/auditHelper');
const { sendWelcomeEmail } = require('../services/mailer.service');
const UserService = require('../services/user.service');
const { CloudUser } = require('../models/cloud.model');

// Utilitaire de contexte harmonisé
const getContext = (req) => {
    const user = req.user || {};
    const companyId = user.companyId || user.company_id;
    return {
        companyId: companyId ? companyId.toString() : null,
        companyName: user.companyName,
        userId: user.userId ? user.userId.toString() : (user.id ? user.id.toString() : null),
        userName: 'user' // ✅ Consigne [2026-02-08]
    };
};

/**
 * Création d'un collaborateur
 */
exports.createEmployee = async (req, res) => {
    const { username, email, role, fonction, permissions, nif, cnss, adresse } = req.body;
    const context = getContext(req);

    try {
        if (!context.companyId) {
            return res.status(401).json({ success: false, message: "Session invalide." });
        }

        const { tempPassword, hashedPassword } = await UserService.prepareTempPassword();
        const newUserId = UserService.genererIdUser();
        const permsData = UserService.formatPermissions(permissions);

        // 1. Insertion Cloud avec Mongoose
        await CloudUser.create({
            localId: newUserId,
            username,
            email,
            password: hashedPassword,
            role: role || 'user',
            company_id: context.companyId,
            fonction: fonction || '',
            nif: nif || '',
            cnss: cnss || '',
            adresse: adresse || '',
            permissions: permsData,
            is_temp_password: true,
            is_active: true,
            sync_status: 'synced'
        });

        // 2. Audit Log
        await logAction({
            userId: context.userId, 
            userName: context.userName, 
            actionType: 'INSERTION',
            tableConcernee: 'users', 
            referenceId: newUserId,
            description: `Création de l'utilisateur : ${username}`,
            companyId: context.companyId
        });
        
        const createdUser = { id: newUserId, username, email, role, fonction, is_active: 1 };

        // 🔥 SIGNAL SOCKET HARMONISÉ
        if (req.io && context.companyId) {
            const room = String(context.companyId);
            req.io.to(room).emit('DATA_EVENT', { 
                table: 'users', 
                action: 'INSERT', 
                id: newUserId 
            });
            req.io.to(room).emit('REFRESH_UI', { module: 'USERS', action: 'CREATE' });
        }

        res.status(201).json({ success: true, message: "Collaborateur créé.", data: createdUser });

        // Tâche de fond : Email
        setImmediate(() => {
            sendWelcomeEmail(email, username, tempPassword, context.companyName)
                .catch(err => console.error("⚠️ Erreur Mailer:", err.message));
        });

    } catch (error) {
        if (error.code === 11000 || (error.message && error.message.includes('duplicate key'))) {
            return res.status(400).json({ success: false, message: "Cet email est déjà utilisé." });
        }
        console.error("❌ Erreur createEmployee:", error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Mise à jour d'un collaborateur
 */
exports.updateEmployee = async (req, res) => {
    const { id } = req.params;
    const { username, email, role, fonction, nif, cnss, adresse, permissions, is_active } = req.body;
    const context = getContext(req);

    if (!context.companyId) {
        return res.status(401).json({ success: false, message: "Session invalide." });
    }

    // Sécurité : pas d'auto-suspension
    if (String(id) === String(context.userId) && (is_active === false || is_active === 0)) {
        return res.status(403).json({ 
            success: false, 
            message: "Action interdite : vous ne pouvez pas suspendre votre propre compte." 
        });
    }

    try {
        const permsData = UserService.formatPermissions(permissions);
        const oldUser = await CloudUser.findOne({ localId: id.toString(), company_id: context.companyId }).lean();
        
        if (!oldUser) throw new Error("Utilisateur introuvable.");

        const isActiveBool = (is_active === true || is_active === 1);

        const updateResult = await CloudUser.updateOne(
            { localId: id.toString(), company_id: context.companyId },
            {
                username,
                email,
                role,
                fonction,
                nif,
                cnss,
                adresse,
                permissions: permsData,
                is_active: isActiveBool,
                sync_status: 'synced',
                updated_at: new Date()
            }
        );

        if (updateResult.matchedCount === 0) throw new Error("Utilisateur introuvable ou non modifié.");

        await logAction({
            userId: context.userId, 
            userName: context.userName, 
            actionType: 'MODIFICATION',
            tableConcernee: 'users', 
            referenceId: id.toString(),
            description: `Mise à jour : ${oldUser.username} -> ${username}`,
            companyId: context.companyId
        });

        // 🔥 TEMPS RÉEL & SÉCURITÉ
        if (req.io && context.companyId) {
            const companyRoom = String(context.companyId);
            const userRoom = id.toString();
            const permsObj = typeof permissions === 'string' ? JSON.parse(permissions) : permissions;

            // Signal universel
            req.io.to(companyRoom).emit('DATA_EVENT', { table: 'users', action: 'UPDATE', id });

            // Notification spécifique à l'utilisateur ciblé
            req.io.to(userRoom).emit('PERMISSIONS_UPDATED', { newPermissions: permsObj });

            if (!isActiveBool) {
                req.io.to(userRoom).emit('ACCOUNT_DEACTIVATED', { 
                    message: "Votre accès a été révoqué par l'administrateur." 
                });
            }

            // Rafraîchissement global de la liste pour les autres admins
            req.io.to(companyRoom).emit('REFRESH_UI', { module: 'USERS', action: 'UPDATE' });
        }

        res.json({ success: true, message: "Profil mis à jour." });
    } catch (error) {
        console.error("❌ Erreur updateEmployee:", error.message);
        res.status(400).json({ success: false, message: error.message });
    }
};