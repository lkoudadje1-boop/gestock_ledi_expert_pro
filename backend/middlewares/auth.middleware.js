const jwt = require('jsonwebtoken');
const { getDb } = require('../config/database');
const NodeCache = require("node-cache");

// ✅ ON NE CHARGE PAS MONGOOSE ICI POUR ÉVITER LE CRASH SI ABSENT
let mongoose; 

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error("❌ ERREUR FATALE : JWT_SECRET n'est pas défini");
    process.exit(1);
}

const tokenCache = new NodeCache({ stdTTL: 30, checkperiod: 60 });

const verifyToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: "Format token invalide" });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const userId = decoded.userId; 

        let user = tokenCache.get(userId);

        // --- RECHERCHE UTILISATEUR (HYBRIDE) ---
        if (user === undefined) {
            if (process.env.MONGO_URL) {
                // ✅ CHARGEMENT DYNAMIQUE SÉCURISÉ
                if (!mongoose) mongoose = require('mongoose');
                
                const User = mongoose.model('User'); 
                const rawUser = await User.findById(userId).populate('company_id');
                
                if (rawUser) {
                    user = {
                        id: String(rawUser._id),
                        username: rawUser.username,
                        is_active: rawUser.is_active,
                        role: rawUser.role,
                        token_version: rawUser.token_version,
                        permissions: rawUser.permissions,
                        company_id: String(rawUser.company_id?._id),
                        company_name: rawUser.company_id?.name
                    };
                }
            } else {
                // ✅ LOGIQUE SQLITE
                const db = getDb();
                user = db.prepare(`
                    SELECT u.id, u.username, u.is_active, u.role, u.token_version, u.permissions, 
                           c.id as company_id, c.name as company_name
                    FROM users u
                    JOIN companies c ON u.company_id = c.id
                    WHERE u.id = ?
                `).get(userId);

                if (user) user.id = String(user.id); // Normalisation
            }

            if (user) tokenCache.set(userId, user);
        }

        // --- VALIDATION SESSION ---
        if (!user || user.is_active === 0 || user.token_version !== decoded.v) {
            tokenCache.del(userId);
            return res.status(401).json({ error: "Session invalide ou révoquée." });
        }

        // --- 🛡️ SÉCURITÉ TEMPORELLE (ANTI-FRAUDE) ---
        const now = new Date();
        let companyData;

        if (process.env.MONGO_URL) {
            if (!mongoose) mongoose = require('mongoose');
            companyData = await mongoose.model('Company').findById(user.company_id);
        } else {
            const db = getDb();
            companyData = db.prepare('SELECT last_access_date, license_start_date FROM companies WHERE id = ?').get(user.company_id);
        }

        if (companyData) {
            const lastAccess = companyData.last_access_date ? new Date(companyData.last_access_date) : null;
            const licenseStart = new Date(companyData.license_start_date);

            // A. Cas Pile BIOS
            if (now < licenseStart) {
                return res.status(403).json({ 
                    error: "BIOS_CLOCK_ERROR", 
                    message: "Erreur d'horloge système. Veuillez régler votre PC à l'heure réelle." 
                });
            }

            // B. Cas de Fraude (Recul de l'heure)
            if (lastAccess && now < (new Date(lastAccess.getTime() - 60000))) { // Marge de 1 min
                return res.status(403).json({ 
                    error: "FRAUD_ATTEMPT", 
                    message: "L'heure du système a été reculée. Accès bloqué." 
                });
            }

            // C. Mise à jour du verrou temporel
            if (!companyData.last_access_date || now > new Date(companyData.last_access_date)) {
                if (process.env.MONGO_URL) {
                    await mongoose.model('Company').findByIdAndUpdate(user.company_id, { last_access_date: now });
                } else {
                    getDb().prepare('UPDATE companies SET last_access_date = ? WHERE id = ?')
                           .run(now.toISOString(), user.company_id);
                }
            }
        }

        // --- PERMISSIONS & INJECTION ---
        let parsedPermissions = (typeof user.permissions === 'string') 
                                ? JSON.parse(user.permissions || '{}') 
                                : (user.permissions || {});

        req.user = {
            userId: String(user.id),
            username: user.username,
            companyId: String(user.company_id), 
            companyName: user.company_name,
            role: user.role,
            permissions: parsedPermissions
        };

        next();
        
    } catch (err) {
        console.error(`🚨 JWT ERROR : ${err.message}`);
        return res.status(401).json({ error: "Session expirée." });
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