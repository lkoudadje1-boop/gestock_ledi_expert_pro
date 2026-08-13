// backend/models/User.model.js
const { CloudUser, CloudCompany } = require('./cloud.model');

const UserModel = {
    /**
     * Création d'un utilisateur dans MongoDB Cloud
     */
    create: async (data) => {
        try {
            // Conversion propre des permissions
            const permissions = typeof data.permissions === 'object' 
                ? data.permissions 
                : JSON.parse(data.permissions || '{}');

            // Utilisation de localId pour la cohérence avec le reste du système
            const newUser = new CloudUser({
                localId: data.id || `USR-${Date.now().toString().slice(-6)}`,
                username: data.username,
                email: data.email,
                password: data.password,
                role: data.role || 'user',
                company_id: data.companyId || data.company_id,
                fonction: data.fonction || '',
                permissions: permissions,
                is_temp_password: !!data.isTemp || !!data.is_temp_password,
                is_active: true,
                sync_status: 'synced'
            });

            const savedUser = await newUser.save();

            return { 
                id: savedUser.localId, 
                username: savedUser.username, 
                email: savedUser.email, 
                role: savedUser.role 
            };
        } catch (error) {
            console.error("❌ Erreur UserModel.create:", error.message);
            throw error;
        }
    },

    /**
     * Recherche pour authentification avec jointure entreprise
     */
    findByEmail: async (email) => {
        try {
            // 1. Recherche de l'utilisateur
            const user = await CloudUser.findOne({ email }).lean();
            if (!user) return null;

            // 2. Récupération entreprise par localId (plus rapide et cohérent)
            const company = await CloudCompany.findOne({ localId: user.company_id }).lean();

            // 3. Restitution au format standard
            return {
                ...user,
                id: user.localId, // On remonte l'identifiant système
                company_id: user.company_id,
                company_code: company ? company.company_code : '',
                company_name: company ? company.name : ''
            };
        } catch (error) {
            console.error("❌ Erreur UserModel.findByEmail:", error.message);
            throw error;
        }
    }
};

module.exports = UserModel;