// backend/services/others_tiers.controller.service.js
const mongoose = require('mongoose');
const { CloudOthersTiers, CloudAuditLog } = require('../models/cloud.model');

class OthersTiersService {
    // Générateur d'ID spécifique
    genererIdOtherTier() {
        return `OTR-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`;
    }

    // Récupérer tous les tiers
    async getAll(companyId) {
        return await CloudOthersTiers.find({ company_id: companyId.toString() }).sort({ nom: 1 }).lean();
    }

    // Créer un tiers
    async create(data, user) {
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const companyId = user?.companyId?.toString() || user?.company_id?.toString();
            const userId = user?.userId?.toString() || user?.id?.toString();
            const userName = user?.username || "utilisateur";
            const { nom, nif, contact, telephone, email, adresse } = data;

            const tierId = this.genererIdOtherTier();
            const nomPropre = nom.toUpperCase();

            // 1. Création du tiers dans MongoDB Atlas
            await CloudOthersTiers.create([{
                localId: tierId,
                company_id: companyId,
                nom: nomPropre,
                nif: nif || '0',
                contact: contact || nomPropre,
                telephone: telephone || '',
                email: email || '',
                adresse: adresse || '',
                is_active: 1,
                sync_status: 'synced'
            }], { session });

            // 2. Journalisation de l'audit
            const logId = `LOG-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
            await CloudAuditLog.create([{
                localId: logId,
                user_id: userId,
                user_name: userName,
                action_type: 'INSERTION',
                table_concernee: 'others_tiers',
                reference_id: tierId,
                description: `Création tiers divers: ${nomPropre}`,
                date_action: new Date(),
                company_id: companyId,
                sync_status: 'synced'
            }], { session });

            await session.commitTransaction();
            session.endSession();

            return { tierId, nomPropre };
        } catch (error) {
            await session.abortTransaction();
            session.endSession();
            throw error;
        }
    }

    // Mettre à jour un tiers
    async update(id, data, user) {
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const companyId = user?.companyId?.toString() || user?.company_id?.toString();
            const userId = user?.userId?.toString() || user?.id?.toString();
            const userName = user?.username || "utilisateur";
            const { nom, nif, contact, telephone, email, adresse, is_active } = data;
            const nomPropre = nom.toUpperCase();

            // 1. Mise à jour du tiers
            const result = await CloudOthersTiers.updateOne(
                { localId: id, company_id: companyId },
                {
                    $set: {
                        nom: nomPropre,
                        nif: nif || '0',
                        contact: contact || nomPropre,
                        telephone: telephone || '',
                        email: email || '',
                        adresse: adresse || '',
                        is_active: is_active ? 1 : 0,
                        sync_status: 'synced',
                        updated_at: new Date()
                    }
                },
                { session }
            );

            if (result.matchedCount > 0) {
                // 2. Journalisation de l'audit si modifié
                const logId = `LOG-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
                await CloudAuditLog.create([{
                    localId: logId,
                    user_id: userId,
                    user_name: userName,
                    action_type: 'MODIFICATION',
                    table_concernee: 'others_tiers',
                    reference_id: id,
                    description: `Mise à jour tiers divers: ${nomPropre}`,
                    date_action: new Date(),
                    company_id: companyId,
                    sync_status: 'synced'
                }], { session });
            }

            await session.commitTransaction();
            session.endSession();

            return result.matchedCount > 0;
        } catch (error) {
            await session.abortTransaction();
            session.endSession();
            throw error;
        }
    }

    // Supprimer un tiers
    async delete(id, user) {
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const companyId = user?.companyId?.toString() || user?.company_id?.toString();
            const userId = user?.userId?.toString() || user?.id?.toString();
            const userName = user?.username || "utilisateur";

            // 1. Suppression du tiers
            const result = await CloudOthersTiers.deleteOne({ localId: id, company_id: companyId }).session(session);

            if (result.deletedCount > 0) {
                // 2. Journalisation de l'audit si supprimé
                const logId = `LOG-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
                await CloudAuditLog.create([{
                    localId: logId,
                    user_id: userId,
                    user_name: userName,
                    action_type: 'SUPPRESSION',
                    table_concernee: 'others_tiers',
                    reference_id: id,
                    description: `Suppression tiers divers ${id}`,
                    date_action: new Date(),
                    company_id: companyId,
                    sync_status: 'synced'
                }], { session });
            }

            await session.commitTransaction();
            session.endSession();

            return result.deletedCount > 0;
        } catch (error) {
            await session.abortTransaction();
            session.endSession();
            throw error;
        }
    }
}

module.exports = new OthersTiersService();