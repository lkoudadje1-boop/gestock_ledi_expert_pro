// backend/services/fournisseur.service.js
const mongoose = require('mongoose');
const { CloudSupplier, CloudAuditLog } = require('../models/cloud.model');
const { logAction } = require('../utils/auditHelper');

class SupplierService {
    genererIdFournisseur() {
        return `SUP-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`;
    }

    // --- RÉCUPÉRER TOUS LES FOURNISSEURS ---
    async getAllSuppliers(companyId) {
        return await CloudSupplier.find({ company_id: companyId.toString() }).sort({ nom: 1 }).lean();
    }

    // --- CRÉER UN NOUVEAU FOURNISSEUR ---
    async createSupplier(d, user) {
        const { companyId, userId, userName } = user;
        const { nom, nif, telephone, email, adresse } = d;

        if (!nom) throw new Error("Nom obligatoire.");

        const supplierId = this.genererIdFournisseur();
        const nomPropre = nom.toUpperCase();

        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            await CloudSupplier.create([{
                localId: supplierId,
                company_id: companyId.toString(),
                nom: nomPropre,
                nif: nif || 0,
                contact: nomPropre,
                telephone: telephone || '',
                email: email || '',
                adresse: adresse || '',
                is_active: 1,
                sync_status: 'synced'
            }], { session });

            await logAction({ 
                userId, 
                userName: userName || 'user', 
                actionType: 'INSERTION', 
                tableConcernee: 'suppliers', 
                referenceId: supplierId, 
                description: `Création fournisseur: ${nomPropre}`, 
                companyId: companyId.toString() 
            });

            await session.commitTransaction();
            session.endSession();
            return supplierId;
        } catch (err) {
            await session.abortTransaction();
            session.endSession();
            throw err;
        }
    }

    // --- METTRE À JOUR UN FOURNISSEUR ---
    async updateSupplier(id, d, user) {
        const { companyId, userId, userName } = user;
        const { nom, nif, telephone, email, adresse } = d;
        const nomPropre = nom ? nom.toUpperCase() : null;

        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const result = await CloudSupplier.updateOne(
                { $or: [{ localId: id }, { _id: mongoose.isValidObjectId(id) ? id : null }], company_id: companyId.toString() },
                {
                    $set: {
                        nom: nomPropre,
                        nif: nif || 0,
                        telephone: telephone || '',
                        email: email || '',
                        adresse: adresse || '',
                        sync_status: 'synced',
                        updated_at: new Date()
                    }
                }
            ).session(session);

            if (result.matchedCount > 0) {
                await logAction({ 
                    userId, 
                    userName: userName || 'user', 
                    actionType: 'MODIFICATION', 
                    tableConcernee: 'suppliers', 
                    referenceId: id, 
                    description: `Mise à jour fournisseur: ${nomPropre}`, 
                    companyId: companyId.toString() 
                });
            }

            await session.commitTransaction();
            session.endSession();
            return result.matchedCount > 0;
        } catch (err) {
            await session.abortTransaction();
            session.endSession();
            throw err;
        }
    }

    // --- METTRE À JOUR LE STATUT (ARCHIVAGE) ---
    async updateStatus(id, is_active, user) {
        const { companyId, userId, userName } = user;

        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const result = await CloudSupplier.updateOne(
                { $or: [{ localId: id }, { _id: mongoose.isValidObjectId(id) ? id : null }], company_id: companyId.toString() },
                { $set: { is_active: is_active ? 1 : 0, sync_status: 'synced', updated_at: new Date() } }
            ).session(session);

            if (result.matchedCount > 0) {
                await logAction({ 
                    userId, 
                    userName: userName || 'user', 
                    actionType: 'MODIFICATION', 
                    tableConcernee: 'suppliers', 
                    referenceId: id, 
                    description: `Statut fournisseur ${id} -> ${is_active ? 'Actif' : 'Archivé'}`, 
                    companyId: companyId.toString() 
                });
            }

            await session.commitTransaction();
            session.endSession();
            return result.matchedCount > 0;
        } catch (err) {
            await session.abortTransaction();
            session.endSession();
            throw err;
        }
    }

    // --- SUPPRIMER UN FOURNISSEUR ---
    async deleteSupplier(id, user) {
        const { companyId, userId, userName } = user;

        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const result = await CloudSupplier.deleteOne({ 
                $or: [{ localId: id }, { _id: mongoose.isValidObjectId(id) ? id : null }], 
                company_id: companyId.toString() 
            }).session(session);

            if (result.deletedCount > 0) {
                await logAction({ 
                    userId, 
                    userName: userName || 'user', 
                    actionType: 'SUPPRESSION', 
                    tableConcernee: 'suppliers', 
                    referenceId: id, 
                    description: `Suppression fournisseur ${id}`, 
                    companyId: companyId.toString() 
                });
            }

            await session.commitTransaction();
            session.endSession();
            return result.deletedCount > 0;
        } catch (err) {
            await session.abortTransaction();
            session.endSession();
            throw err;
        }
    }
}

module.exports = new SupplierService();