// backend/services/company.service.js
const mongoose = require('mongoose');
const { generateUniqueCode, hashPassword } = require('../utils/helpers'); 
const { 
    CloudCompany, CloudExercice, CloudUser, CloudCustomer, 
    CloudSupplier, CloudStaff, CloudPlanComptable, CloudAuditLog 
} = require('../models/cloud.model');
const { logAction } = require('../utils/auditHelper'); 

const generateId = (prefix) => `${prefix}-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`;

// --- RÉCUPÉRATION PARAMÈTRES ---
exports.fetchSettings = async (companyId) => {
    return await CloudCompany.findOne(
        { $or: [{ localId: companyId }, { _id: mongoose.isValidObjectId(companyId) ? companyId : null }] },
        {
            name: 1, email: 1, phone: 1, address: 1, logo_data: 1, nif_number: 1, rccm_number: 1,
            default_customer_id: 1, default_supplier_id: 1, default_staff_id: 1,
            gestion_analytique: 1, plan_precision: 1, regime_tva_recuperable: 1
        }
    ).lean();
};

// --- INITIALISATION COMPLÈTE SOCIÉTÉ ---
exports.initCompany = async (data) => {
    const { companyName, name, username, adminUsername, email, password, adminPassword, plan_precision } = data;
    
    const finalCompName = companyName || name || "MA SOCIETE";
    const finalAdminName = username || adminUsername || "Admin";
    const finalAdminPass = password || adminPassword || "123456";

    const companyId = generateId('CPY');
    const companyCode = generateUniqueCode(8); 
    const userId = generateId('USR');
    const exerciceId = generateId('EXE');
    const customerId = generateId('CLI');
    const supplierId = generateId('SUP');
    const staffId = generateId('STF');
    const currentYear = new Date().getFullYear();

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        // 1. Insertion Société
        await CloudCompany.create([{
            localId: companyId,
            company_code: companyCode,
            name: finalCompName,
            email: email,
            plan_precision: parseInt(plan_precision) || 8,
            regime_tva_recuperable: 1,
            sync_status: 'synced'
        }], { session });

        // 2. Insertion Exercice
        await CloudExercice.create([{
            localId: exerciceId,
            company_id: companyId,
            libelle: `EXERCICE ${currentYear}`,
            date_debut: `${currentYear}-01-01`,
            date_fin: `${currentYear}-12-31`,
            statut: 'OUVERT',
            sync_status: 'synced'
        }], { session });

        // 3. Insertion Admin
        const hashed = hashPassword(finalAdminPass);
        await CloudUser.create([{
            localId: userId,
            username: finalAdminName,
            email: email,
            password: hashed,
            role: 'admin',
            company_id: companyId,
            sync_status: 'synced'
        }], { session });

        // 4. Insertion Client
        await CloudCustomer.create([{
            localId: customerId,
            nom: `CLIENT COMPTANT (${companyCode})`,
            nif: '0',
            contact: 'DIRECTION',
            telephone: '',
            adresse: 'MAGASIN',
            is_active: 1,
            company_id: companyId,
            sync_status: 'synced'
        }], { session });

        // 5. Insertion Fournisseur
        await CloudSupplier.create([{
            localId: supplierId,
            nom: `FOURNISSEUR DIVERS (${companyCode})`,
            nif: '0',
            contact: 'DIRECTION',
            telephone: '0000',
            adresse: 'MAGASIN',
            is_active: 1,
            company_id: companyId,
            sync_status: 'synced'
        }], { session });

        // 6. Insertion Personnel
        await CloudStaff.create([{
            localId: staffId,
            name: `PERSONNEL DIVERS (${companyCode})`,
            phone: '0000',
            email: 'divers@erp.com',
            adresse: 'MAGASIN',
            nif: '0',
            cnss: '0',
            fonction: 'PERSONNEL',
            company_id: companyId,
            is_active: 1,
            sync_status: 'synced'
        }], { session });

        await session.commitTransaction();
        session.endSession();

        return {
            companyId: companyId, 
            companyCode: companyCode, 
            adminId: userId, 
            exerciceId: exerciceId 
        };
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        throw err;
    }
};

// --- MISE À JOUR SOCIÉTÉ ---
exports.modifyCompany = async (id, body, user) => {
    const current = await CloudCompany.findOne({ 
        $or: [{ localId: id }, { _id: mongoose.isValidObjectId(id) ? id : null }] 
    }).lean();

    if (!current) throw new Error("Société non trouvée");

    const { 
        name, email, address, phone, logo_data, nif_number, rccm_number, 
        gestion_analytique, plan_precision, regime_tva_recuperable 
    } = body;

    const updateFields = {
        name: name || current.name,
        email: email !== undefined ? email : current.email,
        address: address !== undefined ? address : current.address,
        phone: phone !== undefined ? phone : current.phone,
        logo_data: logo_data !== undefined ? logo_data : current.logo_data,
        nif_number: nif_number !== undefined ? nif_number : current.nif_number,
        rccm_number: rccm_number !== undefined ? rccm_number : current.rccm_number,
        gestion_analytique: gestion_analytique !== undefined ? (gestion_analytique ? 1 : 0) : current.gestion_analytique,
        plan_precision: plan_precision !== undefined ? parseInt(plan_precision) : current.plan_precision,
        regime_tva_recuperable: regime_tva_recuperable !== undefined ? (regime_tva_recuperable ? 1 : 0) : current.regime_tva_recuperable,
        updated_at: new Date(),
        sync_status: 'synced'
    };

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        await CloudCompany.updateOne(
            { $or: [{ localId: id }, { _id: mongoose.isValidObjectId(id) ? id : null }] },
            { $set: updateFields }
        ).session(session);

        await CloudAuditLog.create([{
            localId: `LOG-${Date.now()}`,
            user_id: user.userId, 
            user_name: user.userName, 
            action_type: 'MODIFICATION',
            table_concernee: 'companies', 
            reference_id: id,
            description: `Mise à jour paramètres (TVA: ${updateFields.regime_tva_recuperable ? 'Récupérable' : 'Non-récupérable'})`,
            company_id: id,
            sync_status: 'synced'
        }], { session });

        await session.commitTransaction();
        session.endSession();
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        throw err;
    }
};

// --- MISE À JOUR PRÉCISION ET STRUCTURE COMPTABLE ---
exports.modifyPrecision = async (id, body, user) => {
    const { plan_precision, gestion_analytique, regime_tva_recuperable } = body;
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        let logDesc = "";
        let planComptableModifie = false;
        let updateData = { updated_at: new Date(), sync_status: 'synced' };

        if (gestion_analytique !== undefined) {
            updateData.gestion_analytique = gestion_analytique ? 1 : 0;
            logDesc += `Analytique: ${gestion_analytique ? 'Activé' : 'Désactivé'}. `;
        }

        if (regime_tva_recuperable !== undefined) {
            updateData.regime_tva_recuperable = regime_tva_recuperable ? 1 : 0;
            logDesc += `Régime TVA: ${regime_tva_recuperable ? 'Récupérable' : 'Non-récupérable'}. `;
        }

        if (plan_precision !== undefined) {
            const newPrecision = parseInt(plan_precision, 10);
            const currentConfig = await CloudCompany.findOne({ 
                $or: [{ localId: id }, { _id: mongoose.isValidObjectId(id) ? id : null }] 
            }).session(session);
            
            const oldPrecision = currentConfig?.plan_precision || 8;
            updateData.plan_precision = newPrecision;

            if (newPrecision > oldPrecision || newPrecision < oldPrecision) {
                const accounts = await CloudPlanComptable.find({ company_id: id.toString() }).session(session);
                for (const acc of accounts) {
                    let newNumero = acc.numero_compte;
                    if (newPrecision > oldPrecision) {
                        newNumero = newNumero.padEnd(newPrecision, '0');
                    } else {
                        newNumero = newNumero.substring(0, newPrecision);
                    }
                    await CloudPlanComptable.updateOne({ _id: acc._id }, { $set: { numero_compte: newNumero } }).session(session);
                }
                planComptableModifie = true;
            }
            logDesc += `Précision: ${oldPrecision} -> ${newPrecision} chiffres. `;
        }

        await CloudCompany.updateOne(
            { $or: [{ localId: id }, { _id: mongoose.isValidObjectId(id) ? id : null }] },
            { $set: updateData }
        ).session(session);

        await CloudAuditLog.create([{
            localId: `LOG-${Date.now()}`,
            user_id: user.userId, 
            user_name: user.userName, 
            action_type: 'MODIFICATION',
            table_concernee: 'companies', 
            reference_id: id,
            description: `Mise à jour structure comptable : ${logDesc.trim()}`,
            company_id: id.toString(),
            sync_status: 'synced'
        }], { session });

        await session.commitTransaction();
        session.endSession();
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        throw err;
    }
};