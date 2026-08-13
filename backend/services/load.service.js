// backend/services/load.service.js
const nacl = require('tweetnacl');
const util = require('tweetnacl-util');
const { CloudCompany } = require('../models/cloud.model');

// 🔑 Clé publique textuelle issue de votre fichier 'public.key'
const PUBLIC_KEY_BASE64 = process.env.PUBLIC_KEY_BASE64 || "taR+bN75NlI/pZ1L4kxWqyc6HK/gsw+inhYqWOuy/PM=";

const parseLicenseDate = (dateStr) => {
    if (!dateStr || dateStr === "--") return new Date(0);
    return new Date(dateStr.replace(' ', 'T'));
};

const LoadService = {
    getSystemStatus: async (companyId) => {
        const cid = companyId.toString();
        const now = new Date();

        try {
            // --- 1. RÉCUPÉRATION MONGODB CLOUD ---
            const companyInDb = await CloudCompany.findOne({ localId: cid }).lean();
            
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
            await CloudCompany.updateOne(
                { localId: cid },
                { $set: { last_access_date: now, updated_at: now } }
            );

            // --- 2. VÉRIFICATION DE LA CLÉ DE LICENCE STOCKÉE ---
            const licenseKey = companyInDb.license_key;
            if (!licenseKey || !licenseKey.includes('.')) {
                return LoadService.getFallback(companyInDb, cid);
            }

            const [encodedData, providedSignature] = licenseKey.split('.');

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
            if (data.cid && String(data.cid) !== cid) {
                return { nom: "NON ENREGISTRÉ", valid: false, reason: "IDENTITY_MISMATCH", allowed_modules: [] };
            }

            // (Note : L'ID machine a été retiré de l'équation Cloud, la licence est rattachée au Company ID)

            // --- 5. LOGIQUE D'EXPIRATION ---
            const expirationDate = parseLicenseDate(data.exp || companyInDb.license_expiry);
            const isExpired = now > expirationDate;

            return {
                nom: data.owner || companyInDb.name || "Utilisateur Enregistré",
                exp: data.exp || companyInDb.license_expiry || "01/01/2000",
                valid: !isExpired,
                isExpired: isExpired,
                allowed_modules: !isExpired ? (data.mod || companyInDb.modules || []) : [],
                db_local_id: companyInDb.localId
            };

        } catch (err) {
            console.error("❌ Erreur LoadService Cloud:", err.message);
            return { nom: "Mode Dégradé", valid: false, allowed_modules: [] };
        }
    },

    getFallback: (company, companyId) => {
        return { 
            nom: company?.name || "NON ENREGISTRÉ", 
            exp: company?.license_expiry || "Aucune licence", 
            valid: false, 
            allowed_modules: [] 
        };
    },

    saveMetadata: async (licenseData, companyId) => {
        const cid = companyId.toString();
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

            // 2. VÉRIFICATION D'IDENTITÉ CLOUD
            if (!data.cid || String(data.cid) !== cid) {
                throw new Error("Cette licence appartient à une autre structure d'entreprise.");
            }

            // 3. VÉRIFICATION D'EXPIRATION
            const expirationDate = parseLicenseDate(data.exp);
            if (now > expirationDate) {
                throw new Error(`Cette licence a expiré le ${data.exp} et ne peut pas être injectée.`);
            }

            // 4. NETTOYAGE DES MODULES
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

            // 5. MISE À JOUR MONGODB CLOUD
            const updateResult = await CloudCompany.updateOne(
                { localId: cid },
                {
                    $set: {
                        license_type: data.type || 'PRO',
                        modules: finalModules,
                        license_key: licenseData,
                        license_expiry: data.exp,
                        updated_at: now
                    }
                }
            );

            if (updateResult.matchedCount === 0) {
                throw new Error("Entreprise introuvable dans la base de données Cloud.");
            }

            console.log(`✅ Licence validée et activée dans le Cloud pour Company ID: ${cid}. Modules débloqués.`);
            return { success: true, message: "Licence Cloud activée avec succès !" };

        } catch (err) {
            console.error("❌ Erreur Activation Licence Cloud:", err.message);
            throw err; 
        }
    }
};

module.exports = LoadService;