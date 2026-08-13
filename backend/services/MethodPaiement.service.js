// backend/services/MethodPaiement.service.js
const mongoose = require('mongoose');
const { 
    CloudPaymentMethod, CloudPayment, CloudBrouillardLignesTreso, 
    CloudPlanComptable, CloudJournal, CloudAuditLog 
} = require('../models/cloud.model');
const { logAction } = require('../utils/auditHelper');

/**
 * 🔒 FONCTION INTERNE : Vérifie si le moyen est rattaché à des mouvements
 */
const checkIfUsed = async (id, companyId) => {
    const companyStr = companyId.toString();
    const usedInPayments = await CloudPayment.findOne({ 
        company_id: companyStr, 
        payment_method_id: id 
    }).lean();
    if (usedInPayments) return true;

    const method = await CloudPaymentMethod.findOne({ 
        $or: [{ localId: id }, { _id: mongoose.isValidObjectId(id) ? id : null }], 
        company_id: companyStr 
    }).lean();
    
    if (!method) return false;

    try {
        const usedInBrouillard = await CloudBrouillardLignesTreso.findOne({ 
            company_id: companyStr, 
            piece_ref: method.code 
        }).lean();
        if (usedInBrouillard) return true;
    } catch (e) {
        // Ignorer si la collection n'existe pas
    }

    return false;
};

/**
 * 📝 Récupérer la liste
 */
exports.findAllMethods = async (companyId) => {
    const companyStr = companyId.toString();
    const methods = await CloudPaymentMethod.find({ company_id: companyStr }).sort({ libelle: 1 }).lean();

    const result = [];
    for (const method of methods) {
        let extra = {
            num_compte: null, compte_intitule: null,
            journal_code: null, journal_libelle: null,
            is_locked: false
        };

        const methodId = method.localId || method._id.toString();
        extra.is_locked = await checkIfUsed(methodId, companyStr);

        try {
            if (method.compte_comptable_id) {
                const pc = await CloudPlanComptable.findOne({ 
                    $or: [{ localId: method.compte_comptable_id }, { _id: mongoose.isValidObjectId(method.compte_comptable_id) ? method.compte_comptable_id : null }] 
                }).lean();
                if (pc) {
                    extra.num_compte = pc.numero_compte;
                    extra.compte_intitule = pc.intitule;
                }
            }
            if (method.journal_id) {
                const j = await CloudJournal.findOne({ 
                    $or: [{ localId: method.journal_id }, { _id: mongoose.isValidObjectId(method.journal_id) ? method.journal_id : null }] 
                }).lean();
                if (j) {
                    extra.journal_code = j.code;
                    extra.journal_libelle = j.libelle;
                }
            }
        } catch (e) {
            // Ignorer
        }

        result.push({ 
            ...method, 
            id: methodId,
            ...extra 
        });
    }
    return result;
};

/**
 * ➕ Création
 */
exports.createMethod = async (data, context) => {
    const { code, libelle, compte_comptable_id, journal_id, is_pos, icone_name } = data;
    const { companyId, userId, userName } = context;
    const companyStr = companyId.toString();

    const id = `PM-${Date.now()}`;
    const codePropre = code.toUpperCase().trim();
    const libellePropre = libelle.toUpperCase().trim();

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const existe = await CloudPaymentMethod.findOne({ 
            company_id: companyStr, 
            $or: [{ code: codePropre }, { libelle: libellePropre }] 
        }).session(session);

        if (existe) throw new Error(`Le code ou le libellé "${libellePropre}" existe déjà.`);

        await CloudPaymentMethod.create([{
            localId: id,
            company_id: companyStr,
            code: codePropre,
            libelle: libellePropre,
            compte_comptable_id: compte_comptable_id || null,
            journal_id: journal_id || null,
            is_pos: is_pos || 0,
            icone_name: icone_name || '',
            sync_status: 'synced'
        }], { session });

        await logAction({
            userId, userName: userName || 'user', actionType: 'INSERTION', tableConcernee: 'payment_methods', 
            referenceId: id, description: `Création moyen paiement : ${libellePropre}`, companyId: companyStr
        });

        await session.commitTransaction();
        session.endSession();
        return id;
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        throw err;
    }
};

/**
 * ✏️ Modification
 */
exports.updateMethod = async (id, data, context) => {
    const { libelle, compte_comptable_id, journal_id, is_active, is_pos, icone_name } = data;
    const { companyId } = context;
    const companyStr = companyId.toString();

    const isUsed = await checkIfUsed(id, companyStr);
    const finalIcon = icone_name || '';

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const queryFilter = { $or: [{ localId: id }, { _id: mongoose.isValidObjectId(id) ? id : null }], company_id: companyStr };

        if (isUsed) {
            await CloudPaymentMethod.updateOne(
                queryFilter,
                { $set: { is_active, is_pos, icone_name: finalIcon, updated_at: new Date(), sync_status: 'synced' } }
            ).session(session);
        } else {
            await CloudPaymentMethod.updateOne(
                queryFilter,
                {
                    $set: {
                        libelle: libelle ? libelle.toUpperCase().trim() : '',
                        compte_comptable_id: compte_comptable_id || null,
                        journal_id: journal_id || null,
                        is_active,
                        is_pos,
                        icone_name: finalIcon,
                        updated_at: new Date(),
                        sync_status: 'synced'
                    }
                }
            ).session(session);
        }

        await session.commitTransaction();
        session.endSession();
        return isUsed;
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        throw err;
    }
};

/**
 * 🗑️ Suppression
 */
exports.deleteMethod = async (id, companyId) => {
    const companyStr = companyId.toString();
    if (await checkIfUsed(id, companyStr)) {
        throw new Error("🔒 Action interdite : ce moyen est rattaché à des transactions.");
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        await CloudPaymentMethod.deleteOne({ 
            $or: [{ localId: id }, { _id: mongoose.isValidObjectId(id) ? id : null }], 
            company_id: companyStr 
        }).session(session);

        await session.commitTransaction();
        session.endSession();
        return true;
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        throw err;
    }
};