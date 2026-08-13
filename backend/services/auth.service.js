// backend/services/auth.service.js
const { hashPassword, generateUniqueCode, comparePassword } = require('../utils/helpers');
const { logAction } = require('../utils/auditHelper');
const { sendWelcomeEmail, sendResetPasswordEmail } = require('../services/mailer.service');
const mongoose = require('mongoose');
const crypto = require('crypto');
const { CloudUser, CloudCompany } = require('../models/cloud.model');

// --- CONFIGURATION SÉCURITÉ ---
const MAX_ATTEMPTS = 5;
const LOCKOUT_TIME_MINUTES = 15;
// Stockage temporaire en mémoire pour la gestion des tentatives de connexion (anti-brute force)
const loginAttemptsStore = new Map();

// --- LISTE DES PERMISSIONS AUTORISÉES ---
const allowedPermissions = [
    'dashboard', 'Tableau de Bord & Statistiques',
    'dashboard_view_products', 'dashboard_view_alerts', 'dashboard_view_sales_day', 'dashboard_view_credit', 
    'params', 'Paramètres & Cloud',
    'edit_settings', 'view_licence', 'view_audit', 'action_cloud_push', 'action_cloud_restore', 'params_btn_update_institution',
    'access_pos', 'Terminal de Vente (POS)',
    'vente_create', 'pos_add', 'pos_validate', 'pos_invoice', 'pos_history', 'pos_vente_grille', 'pos_vente_liste', 'pos_details', 'pos_view_marge', 'pos_cancel_sale', 'pos_return_item', 'pos_jr', 'vente_view', 'pos_creances_clients', 'pos_close', 'pos_history_cloture',
    'logistique', 'Stocks & Achats',
    'achat_view', 'log_suppliers', 'log_buy', 'log_returns', 'log_history', 'stock_view', 'log_inventory_hist', 'log_inventory', 'log_inventory_create', 'log_inventory_cancel', 'log_bon_commande', 'log_historique_bon', 'log_dettes_fournisseurs', 'log_ajustement', 'log_ajustement_hist', 
    'access_articles', 'Gestionnaire Articles',
    'art_list', 'art_view_financials', 'art_categories', 'art_create', 'art_view', 'art_gl', 'art_edit', 
    'art_btn_create_submit', 'art_btn_edit_submit', 
    'access_emballages', 'Gestionnaire des Emballages',
    'emb_create', 'emb_achat', 'emb_regles', 'emb_consignation', 'emb_history', 'emb_inventory', 
    'emb_btn_modify', 'emb_btn_archive', 'emb_btn_delete', 
    'emb_rule_btn_create', 'emb_rule_btn_modify', 'emb_rule_btn_delete', 'emb_cons_btn_modify', 'emb_cons_btn_delete', 
    'menu_users_access', 'Gestion Utilisateurs & Personnel',
    'user_create', 'staff_manage', 'user_btn_create_submit', 'user_btn_edit_submit', 'staff_btn_create', 'staff_btn_modify', 'staff_btn_archive', 
    'Gestion Comptable',
    'compta_ex', 'compta_jr', 'compta_plan', 'compta_tiers', 'compta_brouillon', 'compta_val', 'compta_gen', 'compta_cloture', 'rpt_bal_comptes', 'rpt_bal_tiers', 'rpt_bal_agee', 'rpt_bal_ana', 'compta_etats_recap', 'rpt_gl_comptes', 'rpt_gl_ana', 'rpt_gl_tiers', 'rpt_bilan', 'rpt_resultat', 'rpt_tft', 'rpt_jr_ana', 'rpt_ctrl_caisse', 'rpt_taxes', 'compta_brouillard_config', 'treso_saisie_hub', 'treso_cash',
    'compta_ex_btn_open_next', 'compta_ex_btn_modify', 'compta_ex_btn_delete', 'compta_jr_btn_create', 'compta_jr_btn_export', 'compta_jr_btn_import', 'compta_jr_btn_modify', 'compta_jr_btn_delete', 'compta_plan_btn_create', 'compta_plan_btn_purge', 'compta_plan_btn_modify', 'compta_plan_btn_delete', 'compta_auto_btn_create', 'compta_auto_btn_save', 'compta_auto_btn_add_line',
    'access_analytique', 'Gestion Analytique & Production', 'Paramétrer le Plan Analytique'
];

const AuthService = {
    generateId: (prefix) => `${prefix}-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`,

    validatePermissions: (perms) => {
        let permissionsObject = perms;
        if (typeof perms === 'string') {
            try { permissionsObject = JSON.parse(perms); } catch (e) { return {}; }
        }
        if (!permissionsObject || typeof permissionsObject !== 'object' || Array.isArray(permissionsObject)) return {};
        const validated = {};
        for (const key of allowedPermissions) {
            if (permissionsObject[key] === true || permissionsObject[key] === 1) validated[key] = true;
        }
        return validated;
    },

    purgeOldAttempts: async () => {
        const now = Date.now();
        for (const [key, val] of loginAttemptsStore.entries()) {
            if (now - new Date(val.last_attempt_at).getTime() > 24 * 60 * 60 * 1000) {
                loginAttemptsStore.delete(key);
            }
        }
    },

    checkLockout: async (email, ip) => {
        const key = `${email}_${ip}`;
        const attempt = loginAttemptsStore.get(key);
        if (!attempt) return { locked: false };
        
        const lastAttemptTime = new Date(attempt.last_attempt_at).getTime();
        const lockoutDuration = LOCKOUT_TIME_MINUTES * 60 * 1000;
        
        if (attempt.attempt_count >= MAX_ATTEMPTS && (Date.now() - lastAttemptTime) < lockoutDuration) {
            return { locked: true, remainingMinutes: Math.ceil((lockoutDuration - (Date.now() - lastAttemptTime)) / 60000) };
        }
        if ((Date.now() - lastAttemptTime) >= lockoutDuration) {
            loginAttemptsStore.delete(key);
        }
        return { locked: false };
    },

    recordFailedAttempt: async (email, ip) => {
        const key = `${email}_${ip}`;
        const attempt = loginAttemptsStore.get(key) || { attempt_count: 0 };
        loginAttemptsStore.set(key, {
            attempt_count: attempt.attempt_count + 1,
            last_attempt_at: new Date()
        });
    },

    resetFailedAttempts: async (email, ip) => {
        const key = `${email}_${ip}`;
        loginAttemptsStore.delete(key);
    },

    // --- ACTIONS PRINCIPALES CLOUD ---
    signup: async (data) => {
        const { username, email, password, companyName } = data;
        const companyCode = generateUniqueCode(8);
        const hashedPassword = await hashPassword(password);
        
        const companyId = AuthService.generateId('CPY');
        const userId = AuthService.generateId('USR');

        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            await CloudCompany.create([{
                localId: companyId,
                company_code: companyCode,
                name: companyName,
                email: email,
                sync_status: 'synced'
            }], { session });

            await CloudUser.create([{
                localId: userId,
                username: username,
                email: email.toLowerCase(),
                password: hashedPassword,
                role: 'admin',
                company_id: companyId,
                is_temp_password: 0,
                is_active: 1,
                token_version: 1,
                sync_status: 'synced'
            }], { session });

            await session.commitTransaction();
            session.endSession();

            try {
                await logAction(userId, companyId, 'SIGNUP', `Initialisation Cloud ERP : ${companyName}`);
            } catch (auditErr) {
                console.warn("⚠️ Log audit initial non enregistré :", auditErr.message);
            }

            return { userId, companyId, companyCode, email, username, companyName };
        } catch (error) {
            await session.abortTransaction();
            session.endSession();
            throw error;
        }
    },

    loginCloud: async (email, companyCode, password) => {
        if (mongoose.connection.readyState !== 1) throw new Error("Base de données Cloud non connectée.");

        const cloudComp = await CloudCompany.findOne({ company_code: String(companyCode) }).lean();
        if (!cloudComp) return null;

        const companyIdRef = cloudComp.localId || cloudComp._id.toString();

        const cloudUsr = await CloudUser.findOne({ 
            email: String(email).toLowerCase(), 
            company_id: companyIdRef
        }).lean();

        if (cloudUsr && cloudUsr.is_active !== 0 && await comparePassword(password, cloudUsr.password)) {
            return {
                id: cloudUsr.localId || cloudUsr._id.toString(),
                username: cloudUsr.username,
                email: cloudUsr.email,
                role: cloudUsr.role,
                company_id: companyIdRef,
                companyName: cloudComp.name,
                fonction: cloudUsr.fonction || '',
                permissions: cloudUsr.permissions || {},
                token_version: cloudUsr.token_version || 1
            };
        }
        return null;
    },

    forgotPassword: async (email, companyCode) => {
        const cloudComp = await CloudCompany.findOne({ company_code: String(companyCode) }).lean();
        if (!cloudComp) return null;

        const companyIdRef = cloudComp.localId || cloudComp._id.toString();
        const user = await CloudUser.findOne({ email: String(email).toLowerCase(), company_id: companyIdRef, is_active: { $ne: 0 } }).lean();
        
        if (!user) return null;

        const resetToken = crypto.randomBytes(32).toString('hex');
        const expires = Date.now() + 3600000;

        await CloudUser.updateOne(
            { _id: user._id },
            { $set: { reset_token: resetToken, reset_expires: expires, sync_status: 'synced' } }
        );

        return { user: { email: user.email, username: user.username }, resetToken };
    },

    resetPassword: async (token, password) => {
        const user = await CloudUser.findOne({ reset_token: token, reset_expires: { $gt: Date.now() } });
        if (!user) return null;

        const hashedPassword = await hashPassword(password);
        await CloudUser.updateOne(
            { _id: user._id },
            { 
                $set: { 
                    password: hashedPassword, 
                    reset_token: null, 
                    reset_expires: null, 
                    is_temp_password: 0, 
                    sync_status: 'synced' 
                },
                $inc: { token_version: 1 }
            }
        );
        return true;
    },

    getUsers: async (companyId) => {
        const users = await CloudUser.find({ company_id: companyId.toString() }).lean();
        return users.map(u => ({
            id: u.localId || u._id.toString(),
            username: u.username,
            email: u.email,
            role: u.role,
            fonction: u.fonction || '',
            permissions: u.permissions || {},
            is_active: u.is_active !== undefined ? u.is_active : 1
        }));
    },

    createUserByAdmin: async (data, adminInfo) => {
        const { username, email, password, fonction, permissions } = data;
        const userId = AuthService.generateId('USR');
        const hashedPassword = await hashPassword(password);
        const validatedPerms = AuthService.validatePermissions(permissions);

        await CloudUser.create({
            localId: userId,
            username: username,
            email: email.toLowerCase(),
            password: hashedPassword,
            role: 'user',
            company_id: adminInfo.companyId.toString(),
            fonction: fonction || '',
            permissions: validatedPerms,
            is_temp_password: 1,
            is_active: 1,
            token_version: 1,
            sync_status: 'synced'
        });

        try {
            await logAction(adminInfo.adminId, adminInfo.companyId, 'INSERTION', `Création du compte collaborateur pour ${username}`);
        } catch (e) {
            console.warn("⚠️ Échec journalisation audit création utilisateur");
        }

        return userId;
    },

    updateUser: async (id, data, adminCompanyId, adminId) => {
        const { username, email, fonction, permissions } = data;
        const validatedPerms = AuthService.validatePermissions(permissions);

        const user = await CloudUser.findOne({ $or: [{ localId: id }, { _id: mongoose.isValidObjectId(id) ? id : null }] });
        if (!user) throw new Error("Utilisateur introuvable.");

        await CloudUser.updateOne(
            { _id: user._id },
            { 
                $set: { 
                    username: username, 
                    email: email.toLowerCase(), 
                    fonction: fonction, 
                    permissions: validatedPerms, 
                    sync_status: 'synced' 
                } 
            }
        );

        try {
            await logAction(adminId, adminCompanyId, 'MODIFICATION', `Mise à jour des accès et permissions de ${username}`);
        } catch (e) {
            console.warn("⚠️ Échec journalisation audit mise à jour utilisateur");
        }

        return JSON.stringify(validatedPerms);
    },

    toggleUserStatus: async (id, is_active, adminCompanyId, adminId) => {
        const user = await CloudUser.findOne({ $or: [{ localId: id }, { _id: mongoose.isValidObjectId(id) ? id : null }] });
        if (!user) throw new Error("Utilisateur introuvable.");

        const updateData = { 
            is_active: is_active ? 1 : 0, 
            sync_status: 'synced' 
        };

        const query = { _id: user._id };
        if (!is_active) {
            await CloudUser.updateOne(query, { $set: updateData, $inc: { token_version: 1 } });
        } else {
            await CloudUser.updateOne(query, { $set: updateData });
        }

        try {
            await logAction(adminId, adminCompanyId, 'MODIFICATION', `Bascule du statut collaborateur ID ${id} : ${is_active ? 'Actif' : 'Inactif'}`);
        } catch (e) {
            console.warn("⚠️ Échec journalisation audit bascule statut utilisateur");
        }

        return true;
    }
};

module.exports = AuthService;