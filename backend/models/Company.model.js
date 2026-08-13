// backend/models/Company.model.js
const { CloudCompany } = require('./cloud.model');

/**
 * CompanyModel : Gestion des données entreprises dans MongoDB Atlas.
 * Utilisation prioritaire de 'localId' pour maintenir la compatibilité avec l'ancien identifiant système.
 */
const CompanyModel = {
    
    /**
     * Met à jour la date de dernier accès
     */
    updateLastAccess: async (companyId) => {
        try {
            const now = new Date();
            return await CloudCompany.findOneAndUpdate(
                { localId: companyId.toString() },
                { $set: { last_access_date: now, updated_at: now } },
                { new: true }
            );
        } catch (error) {
            console.error("❌ Erreur CompanyModel (updateLastAccess):", error.message);
            throw error;
        }
    },

    /**
     * Renouvellement de licence : Mise à jour du verrou de sécurité et des modules
     */
    renouvelerLicence: async (companyId, licenseData) => {
        try {
            const now = new Date();
            const updateData = {
                license_start_date: now,
                license_type: licenseData.type || 'PRO',
                active_modules: licenseData.modules || [],
                license_key: licenseData.key || null,
                license_expiry: licenseData.expiry || null,
                is_active: true,
                sync_status: 'synced',
                updated_at: now
            };

            return await CloudCompany.findOneAndUpdate(
                { localId: companyId.toString() },
                { $set: updateData },
                { new: true }
            );
        } catch (error) {
            console.error("❌ Erreur CompanyModel (renouvelerLicence):", error.message);
            throw error;
        }
    },

    /**
     * Création d'une entreprise
     */
    create: async ({ id, name, code, email, license_type = 'FREE', active_modules = [] }) => {
        try {
            const now = new Date();
            const newCompany = new CloudCompany({
                localId: id.toString(),
                company_code: code,
                name: name,
                email: email,
                regime_tva_recuperable: 1,
                sync_status: 'synced',
                last_access_date: now,
                license_start_date: now,
                license_type: license_type,
                active_modules: active_modules,
                is_active: true
            });

            await newCompany.save();
            return { id, name, code, email };
        } catch (error) {
            console.error("❌ Erreur CompanyModel (create):", error.message);
            throw error;
        }
    },

    /**
     * Mise à jour des informations de l'entreprise
     */
    update: async (companyId, d) => {
        try {
            const updateFields = { updated_at: new Date(), sync_status: 'synced' };

            // Mapping explicite des champs autorisés
            const allowedFields = [
                'name', 'email', 'phone', 'address', 'nif_number', 
                'rccm_number', 'logo_data', 'gestion_analytique', 
                'plan_precision', 'regime_tva_recuperable', 'license_type', 
                'active_modules'
            ];

            allowedFields.forEach(field => {
                if (d[field] !== undefined) updateFields[field] = d[field];
            });

            return await CloudCompany.findOneAndUpdate(
                { localId: companyId.toString() },
                { $set: updateFields },
                { new: true }
            );
        } catch (error) {
            console.error("❌ Erreur CompanyModel (update):", error.message);
            throw error;
        }
    },

    /**
     * Récupération par ID
     */
    getById: async (companyId) => {
        try {
            return await CloudCompany.findOne({ localId: companyId.toString() }).lean();
        } catch (error) {
            console.error("❌ Erreur CompanyModel (getById):", error.message);
            throw error;
        }
    }
};

module.exports = CompanyModel;