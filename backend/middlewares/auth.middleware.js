// backend/middlewares/auth.middleware.js
const jwt = require('jsonwebtoken');
const NodeCache = require("node-cache");
const { CloudUser, CloudCompany } = require('../models/cloud.model');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error("❌ ERREUR FATALE : JWT_SECRET n'est pas défini");
    process.exit(1);
}

const tokenCache = new NodeCache({ stdTTL: 30, checkperiod: 60 });

const verifyToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: "Format token invalide" });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const userId = decoded.userId; 

        let user = tokenCache.get(userId);

        // --- RECHERCHE UTILISATEUR (CLOUD) ---
        if (user === undefined) {
            const rawUser = await CloudUser.findOne({ localId: userId.toString() })
                                           .populate('company_id');
            
            if (rawUser && rawUser.is_active) {
                user = {
                    id: rawUser.localId,
                    username: rawUser.username,
                    is_active: rawUser.is_active,
                    role: rawUser.role,
                    token_version: rawUser.token_version,
                    permissions: rawUser.permissions,
                    company_id: rawUser.company_id?.localId,
                    company_name: rawUser.company_id?.name
                };
                tokenCache.set(userId, user);
            }
        }

        // --- VALIDATION SESSION ---
        if (!user || !user.is_active || user.token_version !== decoded.v) {
            tokenCache.del(userId);
            return res.status(401).json({ success: false, error: "Session invalide ou révoquée." });
        }

        // --- 🛡️ SÉCURITÉ TEMPORELLE (ANTI-FRAUDE) ---
        const now = new Date();
        const companyData = await CloudCompany.findOne({ localId: user.company_id });

        if (companyData) {
            const lastAccess = companyData.last_access_date ? new Date(companyData.last_access_date) : null;
            const licenseStart = new Date(companyData.license_start_date || 0);

            // A. Cas Date système erronée
            if (now < licenseStart) {
                return res.status(403).json({ success: false, error: "Erreur d'horloge système." });
            }

            // B. Cas de Fraude (Recul de l'heure)
            if (lastAccess && now < (new Date(lastAccess.getTime() - 60000))) {
                return res.status(403).json({ success: false, error: "L'heure du système est incohérente." });
            }

            // C. Mise à jour verrou temporel
            if (!companyData.last_access_date || now > new Date(companyData.last_access_date)) {
                await CloudCompany.updateOne({ localId: user.company_id }, { last_access_date: now });
            }
        }

        // --- PERMISSIONS & INJECTION ---
        req.user = {
            userId: user.id,
            username: user.username,
            companyId: user.company_id,
            companyName: user.company_name,
            role: user.role,
            permissions: typeof user.permissions === 'string' ? JSON.parse(user.permissions || '{}') : (user.permissions || {})
        };

        next();
        
    } catch (err) {
        console.error(`🚨 JWT ERROR : ${err.message}`);
        return res.status(401).json({ success: false, error: "Session expirée." });
    }
};

const checkPermission = (permission) => {
    return (req, res, next) => {
        if (!req.user) return res.status(401).json({ error: "Non authentifié" });
        if (req.user.role === 'admin' || req.user.role === 'super_admin') return next();
        if (req.user.permissions && req.user.permissions[permission] === true) return next();
        return res.status(403).json({ error: `Accès refusé : ${permission}` });
    };
};

module.exports = { verifyToken, checkPermission };