const fs = require('fs');
const path = require('path');
const nacl = require('tweetnacl');
const util = require('tweetnacl-util');
const { machineIdSync } = require('node-machine-id');

// 🛡️ Capturer l'empreinte matérielle unique du PC actuel
const CURRENT_MACHINE_ID = machineIdSync();

// 🔑 Clé publique textuelle issue de votre fichier 'public.key'
// Elle sert uniquement à vérifier la signature et est 100% sécurisée ici.
const PUBLIC_KEY_BASE64 = process.env.PUBLIC_KEY_BASE64 || "taR+bN75NlI/pZ1L4kxWqyc6HK/gsw+inhYqWOuy/PM=";

/**
 * Gère les chemins de fichiers de manière intelligente (Dev vs Prod)
 */
const getStoragePath = (fileName) => {
    const baseDir = process.env.USER_DATA_PATH || path.join(__dirname, '../data');
    if (!fs.existsSync(baseDir)) {
        fs.mkdirSync(baseDir, { recursive: true });
    }
    return path.join(baseDir, fileName);
};

const parseLicenseDate = (dateStr) => {
    if (!dateStr || dateStr === "--") return new Date(0);
    return new Date(dateStr.replace(' ', 'T'));
};

const LoadService = {
    getSystemStatus: (companyId) => {
        const { getDb } = require('../config/database'); 
        const db = getDb();
        const configPath = getStoragePath(`metadata_${companyId}.dat`);
        const now = new Date();

        try {
            // --- 1. RÉCUPÉRATION BDD ---
            const companyInDb = db.prepare(`SELECT id, company_code, last_access_date FROM companies WHERE id = ?`).get(companyId);
            
            if (!companyInDb) {
                return { nom: "ENTREPRISE INCONNUE", valid: false, allowed_modules: [] };
            }

            // Vérification anti-fraude horloge
            if (companyInDb.last_access_date) {
                const lastAccess = new Date(companyInDb.last_access_date);
                if (now < lastAccess) {
                    return { 
                        nom: "ERREUR SYSTÈME (HORLOGE)", 
                        valid: false, 
                        reason: "CLOCK_SKEW_DETECTED",
                        allowed_modules: [] 
                    };
                }
            }

            // Mise à jour du verrou temporel
            db.prepare(`UPDATE companies SET last_access_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
              .run(now.toISOString(), companyId);

            // --- 2. LECTURE DU FICHIER ---
            if (!fs.existsSync(configPath)) {
                return LoadService.getFallback(db, companyId);
            }

            const rawContent = fs.readFileSync(configPath, 'utf8').trim();
            if (!rawContent.includes('.')) return LoadService.getFallback(db, companyId);

            const [encodedData, providedSignature] = rawContent.split('.');

            // --- 3. VÉRIFICATION CRYPTOGRAPHIQUE ASYMÉTRIQUE Ed25519 ---
            const publicKey = util.decodeBase64(PUBLIC_KEY_BASE64);
            const dataUint8 = util.decodeUTF8(encodedData);
            const signatureUint8 = util.decodeBase64(providedSignature);

            const isSignatureValid = nacl.sign.detached.verify(dataUint8, signatureUint8, publicKey);
            if (!isSignatureValid) {
                return { nom: "LICENCE COMPROMISE (SIGNATURE INVALIDE)", valid: false, reason: "INVALID_SIGNATURE", allowed_modules: [] };
            }

            const decodedString = Buffer.from(encodedData, 'base64').toString('utf8');
            const data = JSON.parse(decodedString);

            // --- 4. VÉRIFICATION IDENTITÉ ENTREPRISE ---
            if (data.cid && String(data.cid) !== String(companyId)) {
                return { nom: "NON ENREGISTRÉ", valid: false, reason: "IDENTITY_MISMATCH", allowed_modules: [] };
            }

            // --- 5. 🛡️ VERROU MACHINE PHYSIQUE (ANTI-COPIE) ---
            if (!data.mid || data.mid !== CURRENT_MACHINE_ID) {
                return { nom: "LOGICIEL DUPLIQUÉ INTERDIT", valid: false, reason: "HARDWARE_ID_MISMATCH", allowed_modules: [] };
            }

            // --- 6. LOGIQUE D'EXPIRATION ---
            const expirationDate = parseLicenseDate(data.exp);
            const isExpired = now > expirationDate;

            return {
                nom: data.owner || "Utilisateur Enregistré",
                exp: data.exp || "01/01/2000",
                valid: !isExpired,
                isExpired: isExpired,
                allowed_modules: !isExpired ? (data.mod || []) : [],
                db_local_id: companyInDb.id
            };

        } catch (err) {
            console.error("❌ Erreur LoadService:", err.message);
            return { nom: "Mode Dégradé", valid: false, allowed_modules: [] };
        }
    },

    getFallback: (db, companyId) => {
        return { nom: "NON ENREGISTRÉ", exp: "Aucune licence", valid: false, allowed_modules: [] };
    },

    saveMetadata: (licenseData, companyId) => {
        const CompanyModel = require('../models/Company.model'); 
        const now = new Date();
        
        try {
            // 1. DÉCODAGE ET VÉRIFICATION DE LA SIGNATURE
            const parts = licenseData.split('.');
            if (parts.length !== 2) throw new Error("Format de licence invalide.");

            const [encodedData, providedSignature] = parts;

            const publicKey = util.decodeBase64(PUBLIC_KEY_BASE64);
            const dataUint8 = util.decodeUTF8(encodedData);
            const signatureUint8 = util.decodeBase64(providedSignature);

            if (!nacl.sign.detached.verify(dataUint8, signatureUint8, publicKey)) {
                throw new Error("La signature de cette clé d'activation est falsifiée ou corrompue.");
            }

            const decodedString = Buffer.from(encodedData, 'base64').toString('utf8');
            const data = JSON.parse(decodedString);

            // 2. VÉRIFICATION D'IDENTITÉ
            if (!data.cid || String(data.cid) !== String(companyId)) {
                throw new Error("Cette licence appartient à une autre structure d'entreprise.");
            }

            // 3. 🛡️ VERROU MATÉRIEL STRICT À L'ACTIVATION
            if (!data.mid || data.mid !== CURRENT_MACHINE_ID) {
                throw new Error("Cette licence ne correspond pas à la signature de votre carte mère / processeur.");
            }

            // 4. VÉRIFICATION D'EXPIRATION
            const expirationDate = parseLicenseDate(data.exp);
            if (now > expirationDate) {
                throw new Error(`Cette licence a expiré le ${data.exp} et ne peut pas être injectée.`);
            }

            // 5. NETTOYAGE DES MODULES
            let modulesToStore = data.mod || [];
            if (typeof modulesToStore === 'string') {
                try {
                    const parsed = JSON.parse(modulesToStore);
                    modulesToStore = Array.isArray(parsed) ? parsed : [parsed];
                } catch (e) {
                    modulesToStore = modulesToStore.split(',').map(m => m.replace(/[\[\]"']/g, '').trim());
                }
            }
            const finalModules = [...new Set(Array.isArray(modulesToStore) ? modulesToStore : [modulesToStore])];

            // 6. MISE À JOUR BDD
            CompanyModel.renouvelerLicence(companyId, {
                type: data.type || 'PRO',
                modules: finalModules, 
                key: licenseData,
                expiry: data.exp
            });

            // 7. PERSISTANCE PHYSIQUE (Dans AppData)
            const configPath = getStoragePath(`metadata_${companyId}.dat`);
            fs.writeFileSync(configPath, licenseData, 'utf8');

            console.log(`✅ Licence validée matériellement pour ${companyId}. Modules débloqués.`);
            return { success: true, message: "Licence matérielle activée avec succès !" };

        } catch (err) {
            console.error("❌ Erreur Activation Licence:", err.message);
            throw err; 
        }
    }
};

module.exports = LoadService;