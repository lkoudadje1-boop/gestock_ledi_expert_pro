// backend/services/table.service.js
const { dynamicModel } = require('../models/cloud.model');
const { logAction } = require('../utils/auditHelper');
const crypto = require('crypto');

class TableService {
    /**
     * Valide le nom de la table pour protéger les collections systèmes
     */
    _validateTableName(tableName) {
        if (!/^[a-z0-9_]+$/i.test(tableName)) {
            throw new Error("Nom de table invalide ou non autorisé.");
        }
        // Blocage des collections système
        const forbiddenTables = ['companies', 'users', 'sync_queues', 'audit_logs', 'cloud_staff'];
        if (forbiddenTables.includes(tableName.toLowerCase())) {
            throw new Error(`Accès refusé : La collection '${tableName}' est protégée.`);
        }
    }

    /**
     * Récupère toutes les lignes actives d'une collection
     */
    async findAll(tableName, companyId) {
        this._validateTableName(tableName);
        const Model = dynamicModel(tableName);
        
        // Recherche avec filtre entreprise et statut actif
        return await Model.find({ 
            company_id: companyId,
            $or: [{ is_active: true }, { is_active: { $exists: false } }] 
        }).lean();
    }

    /**
     * Crée un enregistrement dynamique
     */
    async create(tableName, data, user) {
        this._validateTableName(tableName);
        const { companyId, id: userId, username: userName } = user;
        const Model = dynamicModel(tableName);

        // Verrous métiers spécifiques
        if (tableName === 'restaurant_tables') {
            if (data.name) {
                const nomExiste = await Model.findOne({ name: { $regex: new RegExp(`^${data.name.trim()}$`, 'i') }, company_id: companyId });
                if (nomExiste) throw new Error(`Le nom de table "${data.name}" est déjà utilisé.`);
            }
        }

        if (tableName === 'unites' && data.code) {
            const codeExiste = await Model.findOne({ code: { $regex: new RegExp(`^${data.code.trim()}$`, 'i') }, company_id: companyId });
            if (codeExiste) throw new Error(`Le code unité "${data.code.toUpperCase()}" existe déjà.`);
        }

        const id = `${tableName.substring(0, 3).toUpperCase()}-${Date.now().toString().slice(-6)}`;
        
        const newDoc = await Model.create({
            ...data,
            localId: id,
            company_id: companyId,
            sync_status: 'synced'
        });

        await logAction({ 
            userId, userName, actionType: 'CREATE', tableConcernee: tableName, 
            referenceId: id, description: `Insertion dynamique collection [${tableName}]`, companyId 
        });

        return id;
    }

    /**
     * Modifie un enregistrement dynamique
     */
    async update(tableName, id, data, user) {
        this._validateTableName(tableName);
        const { companyId, id: userId, username: userName } = user;
        const Model = dynamicModel(tableName);

        if (tableName === 'unites' && data.code) {
            const codeExiste = await Model.findOne({ 
                code: { $regex: new RegExp(`^${data.code.trim()}$`, 'i') }, 
                company_id: companyId, 
                localId: { $ne: id } 
            });
            if (codeExiste) throw new Error(`Le code unité "${data.code.toUpperCase()}" est déjà attribué.`);
        }

        const updateData = { ...data, updated_at: new Date(), sync_status: 'synced' };
        delete updateData.localId;
        delete updateData.company_id;

        const result = await Model.updateOne(
            { localId: id.toString(), company_id: companyId },
            { $set: updateData }
        );

        if (result.matchedCount === 0) throw new Error("Enregistrement introuvable.");

        await logAction({ 
            userId, userName, actionType: 'UPDATE', tableConcernee: tableName, 
            referenceId: id, description: `Mise à jour dynamique collection [${tableName}]`, companyId 
        });

        return { success: true };
    }

    /**
     * Supprime ou désactive un enregistrement
     */
    async delete(tableName, id, user) {
        this._validateTableName(tableName);
        const { companyId, id: userId, username: userName } = user;
        const Model = dynamicModel(tableName);

        const result = await Model.deleteOne({ localId: id.toString(), company_id: companyId });
        
        if (result.deletedCount === 0) throw new Error("Enregistrement introuvable.");

        await logAction({ 
            userId, userName, actionType: 'DELETE', tableConcernee: tableName, 
            referenceId: id, description: `Suppression enregistrement ${id} [${tableName}]`, companyId 
        });

        return { success: true };
    }
}

module.exports = new TableService();