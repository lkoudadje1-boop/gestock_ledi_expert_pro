const { getDb } = require('../config/database');
const { hashPassword, generateUniqueCode, comparePassword } = require('../utils/helpers');
const { logAction } = require('../utils/auditHelper');
const { sendWelcomeEmail, sendResetPasswordEmail } = require('../services/mailer.service');
const mongoose = require('mongoose');
const crypto = require('crypto');

// --- CONFIGURATION CLOUD ---
const cloudSchema = new mongoose.Schema({}, { strict: false });
const CloudUser = mongoose.models.CloudUser || mongoose.model('CloudUser', cloudSchema, 'utilisateurs du cloud');
const CloudCompany = mongoose.models.CloudCompany || mongoose.model('CloudCompany', cloudSchema, 'entreprises cloud');

// --- CONFIGURATION SÉCURITÉ ---
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
const MAX_ATTEMPTS = 5;
const LOCKOUT_TIME_MINUTES = 15;

// --- LISTE DES PERMISSIONS AUTORISÉES ---
const allowedPermissions = [
    'dashboard',
   'Tableau de Bord & Statistiques',
 
        'dashboard_view_products', 
        'dashboard_view_alerts', 
        'dashboard_view_sales_day', 
        'dashboard_view_credit', 
   
    'params', 
   'Paramètres & Cloud',
 
        'edit_settings',
        'view_licence', 
        'view_audit', 
        'action_cloud_push', 
        'action_cloud_restore', 
        'params_btn_update_institution',
   'access_pos', 
   'Terminal de Vente (POS)',
 
        'vente_create',
        'pos_add', 
        'pos_validate',
        'pos_invoice',
        'pos_history', 
        'pos_vente_grille',
        'pos_vente_liste',
        'pos_details',
        'pos_view_marge', 
        'pos_cancel_sale',
        'pos_return_item', 
        'pos_jr', 
        'vente_view', 
        'pos_creances_clients', 
        'pos_close',
        'pos_history_cloture',
      'logistique', 
    'Stocks & Achats',

        'achat_view', 
        'log_suppliers', 
        'log_buy', 
        'log_returns', 
        'log_history', 
        'stock_view', 
        'log_inventory_hist', 
        'log_inventory',  
        'log_inventory_create',
        'log_inventory_cancel', 
        'log_bon_commande',
        'log_historique_bon',
        'log_dettes_fournisseurs', 
      
        'log_ajustement', 
        'log_ajustement_hist', 
      'access_articles', 
      'Gestionnaire Articles',
   
        'art_list', 
      

        'art_view_financials', 

        'art_categories', 
        'art_create', 
        'art_view', 
        'art_gl', 
        'art_edit', 
      
      // ACTION BUTTONS (BOUTONS UNITAIRES)
        'art_btn_create_submit', 
        'art_btn_edit_submit', 
 
      'access_emballages',
      'Gestionnaire des Emballages',

        'emb_create', 
        'emb_achat', 
        'emb_regles', 
        'emb_consignation',
        'emb_history', 
        'emb_inventory', 

        'emb_btn_modify', 
        'emb_btn_archive',
        'emb_btn_delete', 

        'emb_rule_btn_create',
        'emb_rule_btn_modify',
        'emb_rule_btn_delete',
        'emb_cons_btn_modify', 
        'emb_cons_btn_delete', 
      'menu_users_access', 
      'Gestion Utilisateurs & Personnel',

        'user_create', 
        'staff_manage',
        'user_btn_create_submit',
        'user_btn_edit_submit', 
        'staff_btn_create', 
        'staff_btn_modify', 
        'staff_btn_archive', 
    'Gestion Comptable',
    
        'compta_ex', 
        'compta_jr', 
        'compta_plan', 
        'compta_tiers',
        'compta_brouillon', 
        'compta_val', 
        'compta_gen', 
        'compta_cloture', 
        'rpt_bal_comptes', 
        'rpt_bal_tiers', 
        'rpt_bal_agee', 
        'rpt_bal_ana', 
        'compta_etats_recap', 
        'rpt_gl_comptes', 
        'rpt_gl_ana', 
        'rpt_gl_tiers', 
        'rpt_bilan', 
        'rpt_resultat',
        'rpt_tft', 
        'rpt_jr_ana', 
        'rpt_ctrl_caisse', 
        'rpt_taxes', 
        'compta_brouillard_config',
        'treso_saisie_hub', 
        'treso_cash',
        'compta_ex_btn_open_next', 
        'compta_ex_btn_modify',
        'compta_ex_btn_delete', 
        'compta_jr_btn_create', 
        'compta_jr_btn_export', 
        'compta_jr_btn_import', 
        'compta_jr_btn_modify', 
        'compta_jr_btn_delete', 
        'compta_plan_btn_create', 
        'compta_plan_btn_purge', 
        'compta_plan_btn_modify', 
        'compta_plan_btn_delete', 
        'compta_auto_btn_create', 
        'compta_auto_btn_save', 
        'compta_auto_btn_add_line',
 
      'access_analytique', 
    'Gestion Analytique & Production',
   'Paramétrer le Plan Analytique'
];

const AuthService = {
    // --- UTILITAIRES INTERNES ---
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

    purgeOldAttempts: () => {
        const db = getDb();
        return db.prepare("DELETE FROM login_attempts WHERE last_attempt_at < datetime('now', '-1 day')").run();
    },

    checkLockout: (email, ip) => {
        const db = getDb();
        const attempt = db.prepare('SELECT attempt_count, last_attempt_at FROM login_attempts WHERE email = ? AND ip_address = ?').get(email, ip);
        if (!attempt) return { locked: false };
        const lastAttemptTime = new Date(attempt.last_attempt_at).getTime();
        const lockoutDuration = LOCKOUT_TIME_MINUTES * 60 * 1000;
        if (attempt.attempt_count >= MAX_ATTEMPTS && (Date.now() - lastAttemptTime) < lockoutDuration) {
            return { locked: true, remainingMinutes: Math.ceil((lockoutDuration - (Date.now() - lastAttemptTime)) / 60000) };
        }
        if ((Date.now() - lastAttemptTime) >= lockoutDuration) db.prepare('DELETE FROM login_attempts WHERE email = ? AND ip_address = ?').run(email, ip);
        return { locked: false };
    },

    recordFailedAttempt: (email, ip) => {
        const db = getDb();
        db.prepare(`INSERT INTO login_attempts (email, ip_address, attempt_count, last_attempt_at) VALUES (?, ?, 1, CURRENT_TIMESTAMP) ON CONFLICT(email, ip_address) DO UPDATE SET attempt_count = attempt_count + 1, last_attempt_at = CURRENT_TIMESTAMP`).run(email, ip);
    },

    resetFailedAttempts: (email, ip) => {
        const db = getDb();
        db.prepare('DELETE FROM login_attempts WHERE email = ? AND ip_address = ?').run(email, ip);
    },

    // --- ACTIONS PRINCIPALES SÉCURISÉES ---
    signup: async (data) => {
        const db = getDb();
        const { username, email, password, companyName, machine_mid } = data;
        const companyCode = generateUniqueCode(8);
        const hashedPassword = await hashPassword(password);
        
        const companyId = AuthService.generateId('CPY');
        const userId = AuthService.generateId('USR');
        const exerciceId = AuthService.generateId('EXE');
        const customerId = AuthService.generateId('CLI');
        const supplierId = AuthService.generateId('SUP');
        const staffId = `STF-${Date.now().toString().slice(-6)}00`; 
        const currentYear = new Date().getFullYear();

        db.transaction(() => {
            db.exec('PRAGMA foreign_keys = OFF;');
            
            db.prepare(`
                INSERT INTO companies (
                    id, company_code, name, email, default_customer_id, 
                    default_supplier_id, default_staff_id, sync_status, hardware_mid
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
            `).run(companyId, companyCode, companyName, email, customerId, supplierId, staffId, machine_mid);
            
            db.prepare(`INSERT INTO users (id, username, email, password, role, company_id, is_temp_password, is_active, sync_status, token_version) VALUES (?, ?, ?, ?, 'admin', ?, 0, 1, 'pending', 1)`)
              .run(userId, username, email, hashedPassword, companyId);

            db.prepare(`INSERT INTO exercices (id, company_id, libelle, date_debut, date_fin, statut, sync_status) VALUES (?, ?, ?, ?, ?, 'OUVERT', 'pending')`)
              .run(exerciceId, companyId, `EXERCICE ${currentYear}`, `${currentYear}-01-01`, `${currentYear}-12-31`);

            db.prepare(`INSERT INTO customers (id, nom, contact, telephone, adresse, is_active, company_id, sync_status) VALUES (?, ?, 'DIRECTION', ?, 'MAGASIN', 1, ?, 'pending')`)
              .run(customerId, `CLIENT AU COMPTANT`, `0000-${companyCode}`, companyId);

            db.prepare(`INSERT INTO suppliers (id, nom, contact, telephone, adresse, is_active, company_id, sync_status) VALUES (?, ?, 'DIRECTION', '0000', 'MAGASIN', 1, ?, 'pending')`)
              .run(supplierId, `FOURNISSEUR DIVERS`, companyId);

            db.prepare(`INSERT INTO staff (id, name, phone, email, adresse, fonction, company_id, is_active, sync_status) VALUES (?, ?, '0000', 'staff@erp.com', 'MAGASIN', 'PERSONNEL', ?, 1, 'pending')`)
              .run(staffId, `PERSONNEL DIVERS (${companyCode})`, companyId);

            const syncStmt = db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES (?, ?, 'INSERT', ?)");
            [['companies', companyId], ['users', userId], ['exercices', exerciceId], ['customers', customerId], ['suppliers', supplierId], ['staff', staffId]]
            .forEach(([table, id]) => syncStmt.run(table, id, companyId));

            try {
                logAction(userId, companyId, 'SIGNUP', `Initialisation complète de la base chiffrée ERP : ${companyName}`);
            } catch (auditErr) {
                console.warn("⚠️ Log audit initial non enregistré :", auditErr.message);
            }
            
            db.exec('PRAGMA foreign_keys = ON;');
        })();

        return { userId, companyId, companyCode, email, username, companyName };
    },

    loginLocal: async (email, companyCode, password) => {
        const db = getDb();
        const user = db.prepare(`
            SELECT u.*, c.name as companyName 
            FROM users u 
            JOIN companies c ON u.company_id = c.id 
            WHERE LOWER(u.email) = LOWER(?) AND c.company_code = ?
        `).get(email, companyCode);
        
        if (user && user.is_active !== 0 && await comparePassword(password, user.password)) {
            return user;
        }
        return null;
    },

    loginCloudSync: async (email, companyCode, password) => {
        if (mongoose.connection.readyState !== 1) return null;

        try {
            const db = getDb();

            const cloudComp = await CloudCompany.findOne({ company_code: String(companyCode) }).lean();
            if (!cloudComp) return null;

            const cloudUsr = await CloudUser.findOne({ 
                email: String(email).toLowerCase(), 
                $or: [
                    { company_id: cloudComp._id.toString() }, 
                    { company_id: cloudComp.localId }        
                ]
            }).lean();

            if (cloudUsr && await comparePassword(password, cloudUsr.password)) {
                
                const finalCpyId = cloudComp.localId || cloudComp._id.toString();
                const finalUsrId = cloudUsr.localId || cloudUsr._id.toString();

                db.transaction(() => {
                    db.prepare(`
                        INSERT INTO companies (id, company_code, name, email, sync_status) 
                        VALUES (?, ?, ?, ?, 'synced')
                        ON CONFLICT(id) DO UPDATE SET sync_status = 'synced'
                    `).run(finalCpyId, cloudComp.company_code, cloudComp.name, cloudComp.email);
                    
                    db.prepare(`
                        INSERT INTO users (id, username, email, password, role, company_id, is_active, sync_status, token_version) 
                        VALUES (?, ?, ?, ?, ?, ?, 1, 'synced', ?)
                        ON CONFLICT(id) DO UPDATE SET 
                            password = excluded.password,
                            sync_status = 'synced',
                            token_version = excluded.token_version
                    `).run(
                        finalUsrId, 
                        cloudUsr.username, 
                        cloudUsr.email, 
                        cloudUsr.password, 
                        cloudUsr.role, 
                        finalCpyId, 
                        cloudUsr.token_version || 1
                    );
                })();

                return db.prepare(`
                    SELECT u.*, c.name as companyName 
                    FROM users u 
                    JOIN companies c ON u.company_id = c.id 
                    WHERE u.id = ?
                `).get(finalUsrId);
            }
        } catch (error) {
            console.error("⚠️ [Auth Cloud Sync Error]:", error.message);
        }
        return null;
    },

    forgotPassword: async (email, companyCode) => {
        const db = getDb();
        const user = db.prepare('SELECT u.id, u.username, u.email, u.is_active, u.company_id FROM users u JOIN companies c ON u.company_id = c.id WHERE u.email = ? AND c.company_code = ?').get(email, companyCode);
        
        if (!user || user.is_active === 0) return null;

        const resetToken = crypto.randomBytes(32).toString('hex');
        const expires = Date.now() + 3600000;

        db.transaction(() => {
            db.prepare('UPDATE users SET reset_token = ?, reset_expires = ?, sync_status = ? WHERE id = ?').run(resetToken, expires, 'pending', user.id);
            db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('users', ?, 'UPDATE', ?)").run(user.id, user.company_id);
        })();

        return { user, resetToken };
    },

    resetPassword: async (token, password) => {
        const db = getDb();
        const user = db.prepare('SELECT id, company_id FROM users WHERE reset_token = ? AND reset_expires > ?').get(token, Date.now());
        if (!user) return null;

        const hashedPassword = await hashPassword(password);
        db.transaction(() => {
            db.prepare(`UPDATE users SET password = ?, reset_token = NULL, reset_expires = NULL, is_temp_password = 0, token_version = token_version + 1, sync_status = ? WHERE id = ?`).run(hashedPassword, 'pending', user.id);
            db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('users', ?, 'UPDATE', ?)").run(user.id, user.company_id);
        })();
        return true;
    },

    getUsers: (companyId) => {
        const db = getDb();
        return db.prepare('SELECT id, username, email, role, fonction, permissions, is_active FROM users WHERE company_id = ?').all(companyId);
    },

    createUserByAdmin: async (data, adminInfo) => {
        const db = getDb();
        const { username, email, password, fonction, permissions } = data;
        const userId = AuthService.generateId('USR');
        const hashedPassword = await hashPassword(password);
        const pJson = JSON.stringify(AuthService.validatePermissions(permissions));

        db.transaction(() => {
            db.prepare(`INSERT INTO users (id, username, email, password, role, company_id, fonction, permissions, is_temp_password, is_active, sync_status, token_version) VALUES (?, ?, ?, ?, 'user', ?, ?, ?, 1, 1, 'pending', 1)`)
              .run(userId, username, email, hashedPassword, adminInfo.companyId, fonction || '', pJson);
            db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('users', ?, 'INSERT', ?)").run(userId, adminInfo.companyId);
            
            try {
                logAction(adminInfo.adminId, adminInfo.companyId, 'INSERTION', `Création du compte collaborateur pour ${username}`);
            } catch (e) {
                console.warn("⚠️ Échec journalisation audit création utilisateur");
            }
        })();
        return userId;
    },

    updateUser: (id, data, adminCompanyId, adminId) => {
        const db = getDb();
        const { username, email, fonction, permissions } = data;
        const pJson = JSON.stringify(AuthService.validatePermissions(permissions));

        db.transaction(() => {
            db.prepare('UPDATE users SET username = ?, email = ?, fonction = ?, permissions = ?, sync_status = ? WHERE id = ?').run(username, email, fonction, pJson, 'pending', id);
            db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('users', ?, 'UPDATE', ?)").run(id, adminCompanyId);
            
            try {
                logAction(adminId, adminCompanyId, 'MODIFICATION', `Mise à jour des accès et permissions de ${username}`);
            } catch (e) {
                console.warn("⚠️ Échec journalisation audit mise à jour utilisateur");
            }
        })();
        return pJson;
    },

    toggleUserStatus: (id, is_active, adminCompanyId, adminId) => {
        const db = getDb();
        db.transaction(() => {
            const versionUpdate = is_active ? "" : ", token_version = token_version + 1";
            db.prepare(`UPDATE users SET is_active = ?, sync_status = ?${versionUpdate} WHERE id = ?`).run(is_active ? 1 : 0, 'pending', id);
            db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('users', ?, 'UPDATE', ?)").run(id, adminCompanyId);
            
            try {
                logAction(adminId, adminCompanyId, 'MODIFICATION', `Bascule du statut collaborateur ID ${id} : ${is_active ? 'Actif' : 'Inactif'}`);
            } catch (e) {
                console.warn("⚠️ Échec journalisation audit bascule statut utilisateur");
            }
        })();
        return true;
    }
};

module.exports = AuthService;