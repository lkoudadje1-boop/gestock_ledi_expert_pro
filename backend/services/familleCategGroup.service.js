// backend/services/familleCategGroup.service.js
const mongoose = require('mongoose');
const { 
    CloudFamille, CloudCategory, CloudProductGroup, 
    CloudProduct, CloudInventory, CloudAuditLog 
} = require('../models/cloud.model');
const { logAction } = require('../utils/auditHelper');

// Helper interne pour les IDs
function genererIdStructure(prefix) {
    return `${prefix}-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`;
}

// Vérification de verrouillage (Inventaire)
async function checkInventoryLock(companyId) {
    const activeInv = await CloudInventory.findOne({ 
        company_id: companyId.toString(), 
        statut: 'en_cours' 
    }).lean();
    if (activeInv) throw new Error("Action bloquée : Un inventaire est en cours.");
}

// Sélection du modèle Mongoose approprié selon le type
const getModelByType = (type) => {
    if (type === 'familles') return CloudFamille;
    if (type === 'categories') return CloudCategory;
    if (type === 'groups' || type === 'product_groups') return CloudProductGroup;
    throw new Error(`Type de structure inconnu: ${type}`);
};

// 📌 GET ALL
exports.getAll = async (type, companyId) => {
    const companyStr = companyId.toString();
    if (type === 'familles') {
        return await CloudFamille.find({ company_id: companyStr }).sort({ nom: 1 }).lean();
    } else if (type === 'categories') {
        const categories = await CloudCategory.find({ company_id: companyStr }).sort({ nom: 1 }).lean();
        const result = [];
        for (const cat of categories) {
            const famille = await CloudFamille.findOne({ 
                $or: [{ localId: cat.famille_id }, { _id: mongoose.isValidObjectId(cat.famille_id) ? cat.famille_id : null }] 
            }).lean();
            result.push({
                ...cat,
                famille_nom: famille?.nom || null
            });
        }
        return result;
    } else {
        const groups = await CloudProductGroup.find({ company_id: companyStr }).sort({ nom: 1 }).lean();
        const result = [];
        for (const grp of groups) {
            const category = await CloudCategory.findOne({ 
                $or: [{ localId: grp.category_id }, { _id: mongoose.isValidObjectId(grp.category_id) ? grp.category_id : null }] 
            }).lean();
            result.push({
                ...grp,
                category_nom: category?.nom || null
            });
        }
        return result;
    }
};

// 📌 CREATE
exports.create = async ({ type, data, companyId, userId, userName }) => {
    const { nom, famille_id, category_id } = data;
    const companyStr = companyId.toString();

    await checkInventoryLock(companyStr);

    const prefix = type === 'familles' ? 'FAM' : (type === 'categories' ? 'CAT' : 'GRP');
    const table = type === 'groups' ? 'product_groups' : type;
    const Model = getModelByType(type);
    const newId = genererIdStructure(prefix);
    const nomPropre = nom.toUpperCase().trim();

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const docData = {
            localId: newId,
            nom: nomPropre,
            company_id: companyStr,
            is_active: 1,
            sync_status: 'synced'
        };

        if (type === 'categories') {
            docData.famille_id = famille_id;
        } else if (type === 'groups') {
            docData.category_id = category_id;
        }

        await Model.create([docData], { session });

        await logAction({
            userId, 
            userName: userName || 'user', 
            actionType: 'INSERTION', 
            tableConcernee: table, 
            referenceId: newId,
            description: `Création ${type}: ${nomPropre}`, 
            companyId: companyStr
        });

        await session.commitTransaction();
        session.endSession();
        return newId;
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        throw err;
    }
};

// 📌 STATUS
exports.updateStatus = async ({ type, id, is_active, companyId, userId, userName }) => {
    const companyStr = companyId.toString();
    const table = type === 'groups' ? 'product_groups' : type;
    const Model = getModelByType(type);

    await checkInventoryLock(companyStr);
    const activeValue = Number(is_active) === 1 ? 1 : 0;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const targetDoc = await Model.findOne({ 
            $or: [{ localId: id }, { _id: mongoose.isValidObjectId(id) ? id : null }],
            company_id: companyStr 
        }).session(session);

        if (!targetDoc) throw new Error("Élément de structure introuvable.");

        const targetLocalId = targetDoc.localId || targetDoc._id.toString();

        if (activeValue === 1) {
            if (type === 'categories') {
                const famille = await CloudFamille.findOne({ 
                    $or: [{ localId: targetDoc.famille_id }, { _id: mongoose.isValidObjectId(targetDoc.famille_id) ? targetDoc.famille_id : null }] 
                }).session(session);
                if (famille && Number(famille.is_active) === 0) {
                    throw new Error(`🚫 Grand-parent (Famille "${famille.nom}") enfermé. Impossible de restaurer.`);
                }
            } else if (type === 'groups') {
                const category = await CloudCategory.findOne({ 
                    $or: [{ localId: targetDoc.category_id }, { _id: mongoose.isValidObjectId(targetDoc.category_id) ? targetDoc.category_id : null }] 
                }).session(session);
                if (category) {
                    const famille = await CloudFamille.findOne({ 
                        $or: [{ localId: category.famille_id }, { _id: mongoose.isValidObjectId(category.famille_id) ? category.famille_id : null }] 
                    }).session(session);
                    if (famille && (Number(famille.is_active) === 0 || Number(category.is_active) === 0)) {
                        throw new Error(`🚫 Lignée verrouillée (Famille ou Catégorie enfermée).`);
                    }
                }
            }

            // Cascade de libération
            if (type === 'familles') {
                const cats = await CloudCategory.find({ famille_id: targetLocalId, company_id: companyStr }).session(session);
                const catIds = cats.map(c => c.localId || c._id.toString());
                
                const groups = await CloudProductGroup.find({ category_id: { $in: catIds }, company_id: companyStr }).session(session);
                const groupIds = groups.map(g => g.localId || g._id.toString());

                await CloudCategory.updateMany({ famille_id: targetLocalId, company_id: companyStr }, { $set: { is_active: 1, updated_at: new Date() } }).session(session);
                await CloudProductGroup.updateMany({ category_id: { $in: catIds }, company_id: companyStr }, { $set: { is_active: 1, updated_at: new Date() } }).session(session);
                await CloudProduct.updateMany({ group_id: { $in: groupIds }, company_id: companyStr }, { $set: { is_active: 1, updated_at: new Date() } }).session(session);
            } else if (type === 'categories') {
                const groups = await CloudProductGroup.find({ category_id: targetLocalId, company_id: companyStr }).session(session);
                const groupIds = groups.map(g => g.localId || g._id.toString());

                await CloudProductGroup.updateMany({ category_id: targetLocalId, company_id: companyStr }, { $set: { is_active: 1, updated_at: new Date() } }).session(session);
                await CloudProduct.updateMany({ group_id: { $in: groupIds }, company_id: companyStr }, { $set: { is_active: 1, updated_at: new Date() } }).session(session);
            } else if (type === 'groups') {
                await CloudProduct.updateMany({ group_id: targetLocalId, company_id: companyStr }, { $set: { is_active: 1, updated_at: new Date() } }).session(session);
            }
        } else {
            // Archivage & vérification de stock
            let subProducts = [];
            if (type === 'familles') {
                const cats = await CloudCategory.find({ famille_id: targetLocalId, company_id: companyStr }).session(session);
                const catIds = cats.map(c => c.localId || c._id.toString());
                const groups = await CloudProductGroup.find({ category_id: { $in: catIds }, company_id: companyStr }).session(session);
                const groupIds = groups.map(g => g.localId || g._id.toString());
                subProducts = await CloudProduct.find({ group_id: { $in: groupIds }, company_id: companyStr }).session(session);
            } else if (type === 'categories') {
                const groups = await CloudProductGroup.find({ category_id: targetLocalId, company_id: companyStr }).session(session);
                const groupIds = groups.map(g => g.localId || g._id.toString());
                subProducts = await CloudProduct.find({ group_id: { $in: groupIds }, company_id: companyStr }).session(session);
            } else if (type === 'groups') {
                subProducts = await CloudProduct.find({ group_id: targetLocalId, company_id: companyStr }).session(session);
            }

            for (const prod of subProducts) {
                if (prod.stock_actuel > 0) {
                    throw new Error(`🚫 Opération refusée : Impossible d'archiver la structure, car l'article "${prod.nom}" possède encore ${prod.stock_actuel} unité(s) en stock.`);
                }
            }

            if (type === 'familles') {
                const cats = await CloudCategory.find({ famille_id: targetLocalId, company_id: companyStr }).session(session);
                const catIds = cats.map(c => c.localId || c._id.toString());
                const groups = await CloudProductGroup.find({ category_id: { $in: catIds }, company_id: companyStr }).session(session);
                const groupIds = groups.map(g => g.localId || g._id.toString());

                await CloudCategory.updateMany({ famille_id: targetLocalId, company_id: companyStr }, { $set: { is_active: 0, updated_at: new Date() } }).session(session);
                await CloudProductGroup.updateMany({ category_id: { $in: catIds }, company_id: companyStr }, { $set: { is_active: 0, updated_at: new Date() } }).session(session);
                await CloudProduct.updateMany({ group_id: { $in: groupIds }, company_id: companyStr }, { $set: { is_active: 0, updated_at: new Date() } }).session(session);
            } else if (type === 'categories') {
                const groups = await CloudProductGroup.find({ category_id: targetLocalId, company_id: companyStr }).session(session);
                const groupIds = groups.map(g => g.localId || g._id.toString());

                await CloudProductGroup.updateMany({ category_id: targetLocalId, company_id: companyStr }, { $set: { is_active: 0, updated_at: new Date() } }).session(session);
                await CloudProduct.updateMany({ group_id: { $in: groupIds }, company_id: companyStr }, { $set: { is_active: 0, updated_at: new Date() } }).session(session);
            } else if (type === 'groups') {
                await CloudProduct.updateMany({ group_id: targetLocalId, company_id: companyStr }, { $set: { is_active: 0, updated_at: new Date() } }).session(session);
            }
        }

        const updateRes = await Model.updateOne({ _id: targetDoc._id }, { $set: { is_active: activeValue, updated_at: new Date() } }).session(session);

        await logAction({
            userId, 
            userName: userName || 'user', 
            actionType: 'MODIFICATION',
            tableConcernee: table, 
            referenceId: targetLocalId,
            description: `${activeValue === 1 ? 'RESTAURATION' : 'ARCHIVAGE'} en cascade structurelle pour l'ID : ${targetLocalId}`,
            companyId: companyStr
        });

        await session.commitTransaction();
        session.endSession();
        return updateRes;
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        throw err;
    }
};

exports.update = async ({ type, id, data, companyId, userId, userName }) => {
    const { nom, famille_id, category_id } = data;
    const companyStr = companyId.toString();

    await checkInventoryLock(companyStr);

    const table = type === 'groups' ? 'product_groups' : type;
    const Model = getModelByType(type);
    const nomPropre = nom ? nom.toUpperCase().trim() : null;

    if (!nomPropre) {
        throw new Error("Le nom de l'élément de structure ne peut pas être vide.");
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const updateData = { nom: nomPropre, updated_at: new Date() };

        if (type === 'categories') {
            if (!famille_id) throw new Error("La famille associée est obligatoire.");
            updateData.famille_id = famille_id;
        } else if (type === 'groups') {
            if (!category_id) throw new Error("La catégorie associée est obligatoire.");
            updateData.category_id = category_id;
        }

        const res = await Model.updateOne(
            { $or: [{ localId: id }, { _id: mongoose.isValidObjectId(id) ? id : null }], company_id: companyStr },
            { $set: updateData }
        ).session(session);

        if (res.matchedCount === 0) throw new Error("Élément introuvable.");

        await logAction({
            userId, 
            userName: userName || 'user', 
            actionType: 'MODIFICATION', 
            tableConcernee: table, 
            referenceId: id,
            description: `Modification du nom de la ${type} (ID: ${id}) -> ${nomPropre}`, 
            companyId: companyStr
        });

        await session.commitTransaction();
        session.endSession();
        return true;
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        throw err;
    }
};

exports.processMassiveImport = async (type, items, user) => {
    const prefix = type === 'familles' ? 'FAM' : (type === 'categories' ? 'CAT' : 'GRP');
    const Model = getModelByType(type);
    const companyStr = user.companyId.toString();

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        for (const item of items) {
            const newId = `${prefix}-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`;
            const nomPropre = item.nom.toUpperCase().trim();
            
            let parentId = null;

            if (type === 'categories' && item.parentNom) {
                const parent = await CloudFamille.findOne({ nom: item.parentNom.toUpperCase(), company_id: companyStr }).session(session);
                if (!parent) throw new Error(`La famille '${item.parentNom}' est introuvable. Importation annulée.`);
                parentId = parent.localId || parent._id.toString();
            } else if (type === 'groups' && item.parentNom) {
                const parent = await CloudCategory.findOne({ nom: item.parentNom.toUpperCase(), company_id: companyStr }).session(session);
                if (!parent) throw new Error(`La catégorie '${item.parentNom}' est introuvable. Importation annulée.`);
                parentId = parent.localId || parent._id.toString();
            }

            const docData = {
                localId: newId,
                nom: nomPropre,
                company_id: companyStr,
                is_active: item.is_active,
                sync_status: 'synced'
            };

            if (type === 'categories') docData.famille_id = parentId;
            if (type === 'groups') docData.category_id = parentId;

            await Model.create([docData], { session });
        }

        await session.commitTransaction();
        session.endSession();
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        throw err;
    }
};