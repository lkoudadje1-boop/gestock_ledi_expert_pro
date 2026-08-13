// backend/services/PlanTiers.service.js
const mongoose = require('mongoose');
const { 
    CloudPlanTiers, 
    CloudPlanComptable, 
    CloudStaff, 
    CloudUser, 
    CloudCustomer, 
    CloudSupplier, 
    CloudOthersTiers, 
    CloudAuditLog 
} = require('../models/cloud.model');

class PlanTiersService {
    // 1. Récupérer les tiers et les entités disponibles
    async getAllData(type, companyId) {
        const tiersEnregistres = await CloudPlanTiers.aggregate([
            { $match: { company_id: companyId.toString() } },
            {
                $lookup: {
                    from: 'cloud_plan_comptable',
                    localField: 'compte_collectif_id',
                    foreignField: 'localId',
                    as: 'comptable'
                }
            },
            { $unwind: { path: '$comptable', preserveNullAndEmptyArrays: true } },
            {
                $addFields: {
                    collectif_numero: '$comptable.numero_compte',
                    collectif_nom: '$comptable.intitule'
                }
            },
            { $sort: { numero_tiers: 1 } }
        ]);

        let disponibles = [];
        const cid = companyId.toString();

        if (type === 'SALARIE') {
            const staffList = await CloudStaff.find({ company_id: cid }, { localId: 1, name: 1, _id: 0 }).lean();
            const userList = await CloudUser.find({ company_id: cid }, { localId: 1, username: 1, _id: 0 }).lean();
            
            const map = new Map();
            staffList.forEach(s => map.set(s.localId, { id: s.localId, nom: s.name }));
            userList.forEach(u => {
                if (!map.has(u.localId)) {
                    map.set(u.localId, { id: u.localId, nom: u.username });
                }
            });
            disponibles = Array.from(map.values());
        } else if (type === 'CLIENT') {
            disponibles = await CloudCustomer.find({ company_id: cid }, { localId: 1, nom: 1, _id: 0 }).lean()
                .then(docs => docs.map(d => ({ id: d.localId, nom: d.nom })));
        } else if (type === 'FOURNISSEUR') {
            disponibles = await CloudSupplier.find({ company_id: cid }, { localId: 1, nom: 1, _id: 0 }).lean()
                .then(docs => docs.map(d => ({ id: d.localId, nom: d.nom })));
        } else if (type === 'AUTRE') {
            disponibles = await CloudOthersTiers.find({ company_id: cid }, { localId: 1, nom: 1, _id: 0 }).lean()
                .then(docs => docs.map(d => ({ id: d.localId, nom: d.nom })));
        }

        return { tiersEnregistres, disponibles };
    }

    // 2. Logique de suggestion de numéro auxiliaire
    async getSuggestionNum(nom, collectifId, companyId) {
        const collectif = await CloudPlanComptable.findOne({ localId: collectifId, company_id: companyId.toString() }).lean();
        if (!collectif) throw new Error("Collectif introuvable");

        const prefixeCompte = collectif.numero_compte.toString().substring(0, 4);
        const nomNettoye = nom.replace(/\s+/g, '').toUpperCase();
        const baseSuggestion = `${prefixeCompte}${nomNettoye}`;

        const existants = await CloudPlanTiers.find({
            company_id: companyId.toString(),
            numero_tiers: { $regex: `^${baseSuggestion}` }
        }).lean();

        const index = existants.length > 0 ? existants.length : "";
        return `${baseSuggestion}${index}`;
    }

    // 3. Création
    async createTier(body, user) {
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const companyId = user.companyId || user.company_id;
            const { numero_tiers, nom, type_tiers, compte_collectif_id, reference_id, delai_paiement } = body;
            const id = `TIR-${Date.now()}`;

            await CloudPlanTiers.create([{
                localId: id,
                company_id: companyId,
                compte_collectif_id,
                numero_tiers,
                nom: nom.toUpperCase(),
                type_tiers,
                reference_id: reference_id || null,
                delai_paiement: delai_paiement || 0,
                sync_status: 'synced',
                updated_at: new Date()
            }], { session });

            const logId = `LOG-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
            await CloudAuditLog.create([{
                localId: logId,
                user_id: user.userId || user.id,
                user_name: user.username || 'utilisateur',
                action_type: 'INSERTION',
                table_concernee: 'plan_tiers',
                reference_id: id,
                description: `Création du tiers auxiliaire ${numero_tiers} (${type_tiers}) pour ${nom}. Délai: ${delai_paiement || 0} jours.`,
                date_action: new Date(),
                company_id: companyId,
                sync_status: 'synced'
            }], { session });

            await session.commitTransaction();
            session.endSession();
            return id;
        } catch (error) {
            await session.abortTransaction();
            session.endSession();
            throw error;
        }
    }

    // 4. Mise à jour
    async updateTier(id, body, user) {
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const companyId = user.companyId || user.company_id;
            const { numero_tiers, nom, compte_collectif_id, delai_paiement } = body;

            const result = await CloudPlanTiers.updateOne(
                { localId: id, company_id: companyId.toString() },
                {
                    $set: {
                        numero_tiers,
                        nom: nom.toUpperCase(),
                        compte_collectif_id,
                        delai_paiement: delai_paiement || 0,
                        sync_status: 'synced',
                        updated_at: new Date()
                    }
                },
                { session }
            );

            if (result.matchedCount === 0) throw new Error("Tiers introuvable.");

            const logId = `LOG-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
            await CloudAuditLog.create([{
                localId: logId,
                user_id: user.userId || user.id,
                user_name: user.username || 'utilisateur',
                action_type: 'MODIFICATION',
                table_concernee: 'plan_tiers',
                reference_id: id,
                description: `Mise à jour du tiers ${numero_tiers} (${nom}). Nouveau délai: ${delai_paiement || 0}j`,
                date_action: new Date(),
                company_id: companyId,
                sync_status: 'synced'
            }], { session });

            await session.commitTransaction();
            session.endSession();
        } catch (error) {
            await session.abortTransaction();
            session.endSession();
            throw error;
        }
    }

    // 5. Suppression
    async deleteTier(id, user) {
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const companyId = user.companyId || user.company_id;
            const tiers = await CloudPlanTiers.findOne({ localId: id, company_id: companyId.toString() }).session(session);
            if (!tiers) throw new Error("Tiers introuvable.");

            await CloudPlanTiers.deleteOne({ localId: id, company_id: companyId.toString() }).session(session);

            const logId = `LOG-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
            await CloudAuditLog.create([{
                localId: logId,
                user_id: user.userId || user.id,
                user_name: user.username || 'utilisateur',
                action_type: 'SUPPRESSION',
                table_concernee: 'plan_tiers',
                reference_id: id,
                description: `Suppression du compte tiers ${tiers.numero_tiers} (${tiers.nom})`,
                date_action: new Date(),
                company_id: companyId,
                sync_status: 'synced'
            }], { session });

            await session.commitTransaction();
            session.endSession();
        } catch (error) {
            await session.abortTransaction();
            session.endSession();
            throw error;
        }
    }

    // 6. Importation Massive
    async importMassive(tiersData, user) {
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const companyId = user.companyId || user.company_id;
            const timestamp = Date.now();

            for (const [index, t] of tiersData.entries()) {
                const collectif = await CloudPlanComptable.findOne({ numero_compte: t.numCollectif, company_id: companyId.toString() }).session(session);
                if (!collectif) continue;

                let referenceId = null;
                const nomMaj = t.nom.toUpperCase();

                // Gestion entités sources
                if (['CLIENT', 'FOURNISSEUR', 'SALARIE', 'AUTRE'].includes(t.type)) {
                    const map = { 
                        CLIENT: [CloudCustomer, 'CUST-', 'nom'], 
                        FOURNISSEUR: [CloudSupplier, 'SUPP-', 'nom'], 
                        SALARIE: [CloudStaff, 'STF-', 'name'], 
                        AUTRE: [CloudOthersTiers, 'OTR-', 'nom'] 
                    };
                    const [Model, prefix, colNom] = map[t.type];
                    
                    let entityQuery = { company_id: companyId.toString() };
                    entityQuery[colNom] = nomMaj;

                    let entity = await Model.findOne(entityQuery).session(session);
                    if (!entity) {
                        referenceId = `${prefix}${timestamp}-${index}`;
                        const insertData = {
                            localId: referenceId,
                            company_id: companyId.toString(),
                            sync_status: 'synced',
                            updated_at: new Date()
                        };
                        insertData[colNom] = nomMaj;
                        if (t.type === 'SALARIE') insertData.is_active = 1;
                        if (t.type === 'AUTRE') {
                            insertData.nif = '0';
                            insertData.is_active = 1;
                        }

                        await Model.create([insertData], { session });
                    } else {
                        referenceId = entity.localId;
                    }
                }

                const tiersId = `TIR-${timestamp}-${index}`;
                await CloudPlanTiers.findOneAndUpdate(
                    { numero_tiers: t.num, company_id: companyId.toString() },
                    {
                        $set: {
                            compte_collectif_id: collectif.localId,
                            nom: nomMaj,
                            type_tiers: t.type,
                            delai_paiement: t.delai || 0,
                            reference_id: referenceId,
                            sync_status: 'synced',
                            updated_at: new Date()
                        },
                        $setOnInsert: {
                            localId: tiersId,
                            company_id: companyId.toString(),
                            numero_tiers: t.num
                        }
                    },
                    { upsert: true, new: true, session }
                );
            }

            const logId = `LOG-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
            await CloudAuditLog.create([{
                localId: logId,
                user_id: user.userId || user.id,
                user_name: user.username || 'utilisateur',
                action_type: 'INSERTION',
                table_concernee: 'plan_tiers',
                description: `Importation massive (${tiersData.length} tiers).`,
                date_action: new Date(),
                company_id: companyId,
                sync_status: 'synced'
            }], { session });

            await session.commitTransaction();
            session.endSession();
        } catch (error) {
            await session.abortTransaction();
            session.endSession();
            throw error;
        }
    }
}

module.exports = new PlanTiersService();