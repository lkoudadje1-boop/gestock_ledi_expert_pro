// backend/services/staff.service.js
const { CloudStaff } = require('../models/cloud.model');
const { logAction } = require('../utils/auditHelper');

class StaffService {
    /**
     * Génère un ID unique pour le personnel
     */
    genererIdStaff() {
        return `STF-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`;
    }

    /**
     * Récupère tout le personnel d'une entreprise
     */
    async findAll(companyId) {
        return await CloudStaff.find({ company_id: companyId.toString() }).sort({ name: 1 }).lean();
    }

    /**
     * Récupère un employé spécifique
     */
    async findOne(id, companyId) {
        return await CloudStaff.findOne({ localId: id.toString(), company_id: companyId.toString() }).lean();
    }

    /**
     * Prépare les données pour l'insertion ou la mise à jour
     */
    formatData(data) {
        return {
            name: data.name ? data.name.toUpperCase() : '',
            phone: data.phone || '',
            email: data.email || '',
            adresse: data.adresse || '',
            nif: data.nif || '',
            cnss: data.cnss || '',
            fonction: data.fonction || '',
            is_active: data.is_active !== undefined ? (data.is_active ? true : false) : true
        };
    }

    /**
     * Crée un nouveau membre du personnel
     */
    async create(data, user) {
        const { companyId, id: userId, username: userName } = user;
        const formatted = this.formatData(data);
        const staffId = this.genererIdStaff();

        const staff = await CloudStaff.create({
            localId: staffId,
            company_id: companyId.toString(),
            name: formatted.name,
            phone: formatted.phone,
            email: formatted.email,
            adresse: formatted.adresse,
            nif: formatted.nif,
            cnss: formatted.cnss,
            fonction: formatted.fonction,
            is_active: formatted.is_active,
            sync_status: 'synced'
        });

        // 💡 Log d'audit
        await logAction({
            userId,
            userName,
            actionType: 'CREATE',
            tableConcernee: 'staff',
            referenceId: staffId,
            description: `Création du personnel : ${formatted.name} (Fonction: ${formatted.fonction || 'Non spécifiée'})`,
            companyId: companyId.toString()
        });

        return { id: staffId };
    }

    /**
     * Met à jour un membre du personnel
     */
    async update(id, data, user) {
        const { companyId, id: userId, username: userName } = user;
        const formatted = this.formatData(data);

        const existing = await CloudStaff.findOne({ localId: id.toString(), company_id: companyId.toString() });
        if (!existing) throw new Error("Employé introuvable.");

        await CloudStaff.updateOne(
            { localId: id.toString(), company_id: companyId.toString() },
            { 
                $set: {
                    name: formatted.name,
                    phone: formatted.phone,
                    email: formatted.email,
                    adresse: formatted.adresse,
                    nif: formatted.nif,
                    cnss: formatted.cnss,
                    fonction: formatted.fonction,
                    is_active: formatted.is_active,
                    updated_at: new Date()
                }
            }
        );

        // 💡 Log d'audit
        await logAction({
            userId,
            userName,
            actionType: 'UPDATE',
            tableConcernee: 'staff',
            referenceId: id.toString(),
            description: `Mise à jour du personnel : ${formatted.name} (Statut Actif: ${formatted.is_active})`,
            companyId: companyId.toString()
        });

        return { success: true };
    }

    /**
     * Supprime un membre du personnel
     */
    async delete(id, user) {
        const { companyId, id: userId, username: userName } = user;

        const staff = await CloudStaff.findOne({ localId: id.toString(), company_id: companyId.toString() });
        if (!staff) throw new Error("Employé introuvable.");

        const staffName = staff.name;
        await CloudStaff.deleteOne({ localId: id.toString(), company_id: companyId.toString() });

        // 💡 Log d'audit
        await logAction({
            userId,
            userName,
            actionType: 'DELETE',
            tableConcernee: 'staff',
            referenceId: id.toString(),
            description: `Suppression définitive du personnel : ${staffName}`,
            companyId: companyId.toString()
        });

        return { success: true };
    }
}

module.exports = new StaffService();