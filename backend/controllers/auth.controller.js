const AuthService = require('../services/auth.service');
const jwt = require('jsonwebtoken');
const { sendWelcomeEmail, sendResetPasswordEmail } = require('../services/mailer.service');
const { logAction } = require('../utils/auditHelper'); 
const ClotureService = require('../services/cloturevente.service');

const JWT_SECRET = process.env.JWT_SECRET || "ledi_expert_secret_2026";
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
const LoadService = require('../services/load.service');

const validateString = (val) => typeof val === 'string' && val.trim().length > 0;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const sendResponse = async (res, user) => {
    const tokenVersion = user.token_version || 1;
    const token = jwt.sign({ 
        userId: user.id, companyId: user.company_id, role: user.role, 
        username: user.username, v: tokenVersion 
    }, JWT_SECRET, { expiresIn: '8h' });

    // --- LOGIQUE DE SESSION ACTIVE ---
    const hasActiveSession = await ClotureService.checkSessionActive(user.company_id, user.id);
    const licenseStatus = LoadService.getSystemStatus(user.company_id);

    let perms = {};
    if (user.permissions) {
        try { perms = typeof user.permissions === 'string' ? JSON.parse(user.permissions) : user.permissions; } catch (e) { perms = {}; }
    }

    return res.json({ 
        success: true, 
        token, 
        hasActiveSession,
        license: licenseStatus, 
        user: { 
            id: user.id, 
            username: user.username, 
            role: user.role, 
            company_id: user.company_id, 
            companyName: user.companyName, 
            fonction: user.fonction || '', 
            permissions: perms 
        } 
    });
};

const AuthController = {
signup: async (req, res) => {
    try {
        // 1. Vérification req.body
        if (!req.body) {
            return res.status(400).json({ 
                error: "Le serveur n'a reçu aucune donnée." 
            });
        }

        const { username, email, password, companyName, machine_mid } = req.body;

        // 2. Vérification des champs obligatoires
        if (!username || !email || !password || !companyName) {
            return res.status(400).json({ error: "Tous les champs sont obligatoires." });
        }

        if (!passwordRegex.test(password)) {
            return res.status(400).json({ error: "Mot de passe trop faible." });
        }

        // 3. Appel au service d'inscription (auquel on passe req.body contenant machine_mid)
        const result = await AuthService.signup(req.body);

        // 4. Génération du token initial
        const token = jwt.sign(
            { userId: result.userId, companyId: result.companyId, role: 'admin', v: 1 }, 
            JWT_SECRET, 
            { expiresIn: '8h' }
        );
        
        // 5. Envoi de l'email de bienvenue
        sendWelcomeEmail(email, username, companyName, result.companyCode)
            .catch(e => console.warn("📧 Email non envoyé (Mode hors-ligne ou erreur SMTP)"));   

        // 🛡️ Trace d'audit système locale obligatoires de création
        try {
            await logAction(result.userId, result.companyId, 'COMPANY_CREATION', `Création locale de l'entreprise ${companyName} associée au matériel.`);
        } catch (auditErr) {
            console.warn("⚠️ Impossible d'écrire le log d'audit initial:", auditErr.message);
        }

        // --- RÉPONSE MODIFIÉE ---
        return res.status(201).json({ 
            success: true, 
            companyCode: result.companyCode, 
            companyId: result.companyId,     
            token, 
            user: { 
                id: result.userId, 
                email, 
                role: 'admin', 
                company_id: result.companyId 
            } 
        });

    } catch (err) {
        console.error("Erreur Signup:", err);
        res.status(500).json({ error: "Erreur création compte : " + err.message });
    }
},

    login: async (req, res) => {
        const { email, password, companyCode } = req.body;
        const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;

        if (!validateString(email) || !validateString(companyCode)) {
            return res.status(400).json({ error: "Données invalides." });
        }

        const lockout = AuthService.checkLockout(email, ip);
        if (lockout.locked) {
            return res.status(429).json({ error: `Trop de tentatives. Réessayez dans ${lockout.remainingMinutes} minutes.` });
        }

        try {
            // 1. Authentification LOCALE
            const user = await AuthService.loginLocal(email, companyCode, password);
            
            if (user) {
                AuthService.resetFailedAttempts(email, ip);

                // 🛡️ Correction de la signature du log d'audit
                try {
                    await logAction(user.id, user.company_id, 'LOGIN', `Connexion réussie de ${user.username} (Local ERP)`);
                } catch (auditErr) {
                    console.warn("⚠️ Échec écriture log audit login:", auditErr.message);
                }

                // 2. Vérification Session Vente
                const hasActiveSession = await ClotureService.checkSessionActive(user.company_id, user.id);

                // 3. Envoi de la réponse
                return await sendResponse(res, user, hasActiveSession); 
            }

            // Échec de la saisie
            AuthService.recordFailedAttempt(email, ip);
            await sleep(Math.floor(Math.random() * 200) + 300);
            return res.status(401).json({ error: "Identifiants incorrects." });

        } catch (err) {
            console.error("Erreur login local:", err);
            res.status(500).json({ error: "Erreur serveur local." });
        }
    },

    // 🌐 Support hybride Cloud/Local pour la demande de récupération
    forgotPassword: async (req, res) => {
        const { email, companyCode } = req.body;
        const genericResponse = { success: true, message: "Si le compte existe localement et que le réseau est disponible, un email de réinitialisation sera expédié." };
        
        try {
            const result = await AuthService.forgotPassword(email, companyCode);
            if (result) {
                const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/#/reset-password/${result.resetToken}`;
                await sendResetPasswordEmail(result.user.email, result.user.username, resetLink);
            }
            return res.json(genericResponse);
        } catch (err) {
            return res.json(genericResponse);
        }
    },

    resetPassword: async (req, res) => {
        const { token, password } = req.body;
        if (!password || !passwordRegex.test(password)) return res.status(400).json({ error: "Mot de passe trop faible." });
        try {
            const success = await AuthService.resetPassword(token, password);
            if (!success) return res.status(400).json({ error: "Lien invalide ou expiré." });
            return res.json({ success: true, message: "Mot de passe mis à jour !" });
        } catch (err) {
            res.status(500).json({ error: "Erreur serveur." });
        }
    },

    logout: async (req, res) => {
        if (req.user) {
            try {
                await logAction(req.user.userId, req.user.companyId, 'LOGOUT', `Déconnexion de la session`);
            } catch (e) {
                console.warn("⚠️ Échec log audit logout");
            }
        }
        return res.json({ success: true, message: "Déconnexion réussie." });
    },

    getUsers: async (req, res) => {
        const company_id = req.user ? req.user.companyId : null; 
        if (!company_id) return res.status(403).json({ error: "Accès refusé." });
        try {
            const users = AuthService.getUsers(company_id);
            res.json(users.map(u => ({ ...u, permissions: u.permissions ? JSON.parse(u.permissions) : {} })));
        } catch (err) { res.status(500).json({ error: err.message }); }
    },

    createUserByAdmin: async (req, res) => {
        const adminInfo = { companyId: req.user?.companyId, adminId: req.user?.userId, adminName: req.user?.username };
        if (!adminInfo.companyId) return res.status(403).json({ error: "Non autorisé." });
        if (!req.body.password || !passwordRegex.test(req.body.password)) return res.status(400).json({ error: "Mot de passe trop faible." });

        try {
            await AuthService.createUserByAdmin(req.body, adminInfo);
            if (req.io) {
                req.io.to(adminInfo.companyId.toString()).emit('USER_REGISTRY_CHANGED');
                req.io.to(adminInfo.companyId.toString()).emit('REFRESH_UI', { module: 'USERS', action: 'CREATE' });
            }
            res.json({ success: true, message: "Collaborateur créé avec succès." });
        } catch (err) { res.status(500).json({ error: "Erreur lors de la création." }); }
    },

    updateUser: async (req, res) => {
        const adminCompanyId = req.user?.companyId;
        try {
            const pJson = await AuthService.updateUser(req.params.id, req.body, adminCompanyId, req.user?.userId);
            if (req.io) {
                req.io.to(req.params.id.toString()).emit('PERMISSIONS_UPDATED', { newPermissions: JSON.parse(pJson) });
                req.io.to(adminCompanyId.toString()).emit('REFRESH_UI', { module: 'USERS', action: 'UPDATE' });
            }
            res.json({ success: true, message: "Utilisateur mis à jour." });
        } catch (err) { res.status(500).json({ error: err.message }); }
    },

    toggleUserStatus: async (req, res) => {
        const { id } = req.params; 
        const { is_active } = req.body;
        const adminCompanyId = req.user?.companyId;
        try {
            await AuthService.toggleUserStatus(id, is_active, adminCompanyId, req.user?.userId);
            if (req.io) {
                if (!is_active) req.io.to(id.toString()).emit('ACCOUNT_DEACTIVATED', { message: "Compte suspendu." });
                else req.io.to(id.toString()).emit('ACCOUNT_REACTIVATED');
                req.io.to(adminCompanyId.toString()).emit('USER_REGISTRY_CHANGED');
            }
            res.json({ success: true, status: is_active ? 'active' : 'inactive' });
        } catch (err) { res.status(500).json({ error: err.message }); }
    },

    checkEmailAvailability: (req, res) => res.json({ exists: false }),
    
    purgeOldAttempts: (req, res) => {
        try {
            AuthService.purgeOldAttempts();
            if (res) res.json({ success: true });
        } catch (err) { if (res) res.status(500).json({ error: err.message }); }
    }
};

module.exports = AuthController;
