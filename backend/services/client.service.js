// backend/services/client.service.js
const mongoose = require('mongoose');
const { CloudCustomer, CloudAuditLog } = require('../models/cloud.model');

function genererIdClient() {
    return `CUS-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`;
}

// 📌 GET ALL
exports.getAllCustomers = async (companyId) => {
    return await CloudCustomer.find({ company_id: companyId.toString() })
        .sort({ nom: 1 })
        .lean();
};

// 📌 CREATE
exports.createCustomer = async ({ companyId, userId, userName, data }) => {
    const { nom, nif, telephone, email, adresse } = data;
    const customerId = genererIdClient();

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        await CloudCustomer.create([{
            localId: customerId,
            company_id: companyId.toString(),
            nom: nom.toUpperCase(),
            nif: nif || '0',
            contact: nom.toUpperCase(),
            telephone: telephone || '',
            email: email || '',
            adresse: adresse || '',
            is_active: 1,
            sync_status: 'synced'
        }], { session });

        await CloudAuditLog.create([{
            localId: `LOG-${Date.now()}`,
            user_id: userId ? userId.toString() : null,
            user_name: userName || "user",
            action_type: 'INSERTION',
            table_concernee: 'customers',
            reference_id: customerId,
            description: `Création du client: ${nom.toUpperCase()}`,
            company_id: companyId.toString(),
            sync_status: 'synced'
        }], { session });

        await session.commitTransaction();
        session.endSession();

        return customerId;
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        throw err;
    }
};

// 📌 UPDATE
exports.updateCustomer = async ({ id, companyId, userId, userName, data }) => {
    const { nom, nif, telephone, email, adresse } = data;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const result = await CloudCustomer.updateOne(
            { 
                $or: [{ localId: id }, { _id: mongoose.isValidObjectId(id) ? id : null }], 
                company_id: companyId.toString() 
            },
            { 
                $set: { 
                    nom: nom.toUpperCase(), 
                    nif: nif || '0', 
                    contact: nom.toUpperCase(), 
                    telephone: telephone || '', 
                    email: email || '', 
                    adresse: adresse || '', 
                    sync_status: 'synced',
                    updated_at: new Date()
                } 
            }
        ).session(session);

        if (result.matchedCount > 0) {
            await CloudAuditLog.create([{
                localId: `LOG-${Date.now()}`,
                user_id: userId ? userId.toString() : null,
                user_name: userName || "user",
                action_type: 'MODIFICATION',
                table_concernee: 'customers',
                reference_id: id,
                description: `Mise à jour du client: ${nom.toUpperCase()}`,
                company_id: companyId.toString(),
                sync_status: 'synced'
            }], { session });
        }

        await session.commitTransaction();
        session.endSession();

        return result;
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        throw err;
    }
};

// 📌 STATUS
exports.updateStatus = async ({ id, companyId, userId, userName, is_active }) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const activeVal = is_active ? 1 : 0;
        const result = await CloudCustomer.updateOne(
            { 
                $or: [{ localId: id }, { _id: mongoose.isValidObjectId(id) ? id : null }], 
                company_id: companyId.toString() 
            },
            { 
                $set: { 
                    is_active: activeVal, 
                    sync_status: 'synced',
                    updated_at: new Date() 
                } 
            }
        ).session(session);

        if (result.matchedCount > 0) {
            await CloudAuditLog.create([{
                localId: `LOG-${Date.now()}`,
                user_id: userId ? userId.toString() : null,
                user_name: userName || "user",
                action_type: 'MODIFICATION',
                table_concernee: 'customers',
                reference_id: id,
                description: `Statut client ${id} → ${is_active ? 'Actif' : 'Archivé'}`,
                company_id: companyId.toString(),
                sync_status: 'synced'
            }], { session });
        }

        await session.commitTransaction();
        session.endSession();

        return result;
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        throw err;
    }
};

// 📌 DELETE
exports.deleteCustomer = async ({ id, companyId, userId, userName }) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const result = await CloudCustomer.deleteOne({ 
            $or: [{ localId: id }, { _id: mongoose.isValidObjectId(id) ? id : null }], 
            company_id: companyId.toString() 
        }).session(session);

        if (result.deletedCount > 0) {
            await CloudAuditLog.create([{
                localId: `LOG-${Date.now()}`,
                user_id: userId ? userId.toString() : null,
                user_name: userName || "user",
                action_type: 'SUPPRESSION',
                table_concernee: 'customers',
                reference_id: id,
                description: `Suppression client ${id}`,
                company_id: companyId.toString(),
                sync_status: 'synced'
            }], { session });
        }

        await session.commitTransaction();
        session.endSession();

        return result;
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        throw err;
    }
};