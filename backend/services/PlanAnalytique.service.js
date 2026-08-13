// backend/services/PlanAnalytique.service.js
const mongoose = require('mongoose');
const { 
    CloudDepartement, 
    CloudPlanAnalytique, 
    CloudAnalytiqueDetail, 
    CloudAuditLog, 
    CloudProduct, 
    CloudPlanComptable 
} = require('../models/cloud.model');

/**
 * RÈGLE 1 : SUBDIVISIONS (PLAN ANALYTIQUE)
 */
const formatCodeSubdivision = (input) => {
    if (!input) return "00000000";
    let chiffres = input.toString().replace(/\D/g, ''); 
    return chiffres.slice(0, 8).padEnd(8, '0');
};

/**
 * RÈGLE 2 : GRANDS CENTRES (DÉPARTEMENTS)
 */
const formatCodeGrandCentre = (input) => {
    if (!input) return "";
    return input.toString().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
};

class PlanAnalytiqueService {
    // --- GRANDS CENTRES (DEPARTEMENTS) ---

    async getDepartements(companyId) {
        return await CloudDepartement.find({ 
            company_id: companyId.toString(), 
            is_deleted: 0 
        }).sort({ nom: 1 }).lean();
    }

    async createDepartement(data, user) {
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const { nom, code_analytique } = data;
            const companyId = user.companyId || user.company_id;
            const codeFormate = formatCodeGrandCentre(code_analytique); 
            const id = `DEPT-${Date.now().toString().slice(-6)}`;

            const existNom = await CloudDepartement.findOne({ 
                company_id: companyId, 
                nom: nom.toUpperCase(), 
                is_deleted: 0 
            }).session(session);
            if (existNom) throw new Error(`Le département "${nom}" existe déjà.`);

            const existCode = await CloudDepartement.findOne({ 
                company_id: companyId, 
                code_analytique: codeFormate, 
                is_deleted: 0 
            }).session(session);
            if (existCode) throw new Error(`Le code analytique "${codeFormate}" est déjà utilisé.`);

            await CloudDepartement.create([{
                localId: id,
                company_id: companyId,
                code_analytique: codeFormate,
                nom: nom.toUpperCase(),
                is_deleted: 0,
                sync_status: 'synced',
                updated_at: new Date()
            }], { session });

            const logId = `LOG-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
            await CloudAuditLog.create([{
                localId: logId,
                user_id: user.userId,
                user_name: user.userName || 'utilisateur',
                action_type: 'CREATION',
                table_concernee: 'departements',
                reference_id: id,
                description: `Création du Grand Centre : ${nom.toUpperCase()} (${codeFormate})`,
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

    async modifierDepartement(id, data, user) {
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const { nom, code_analytique } = data;
            const companyId = user.companyId || user.company_id;
            const codeFormate = formatCodeGrandCentre(code_analytique);

            await CloudDepartement.updateOne(
                { localId: id, company_id: companyId },
                {
                    $set: {
                        nom: nom.toUpperCase(),
                        code_analytique: codeFormate,
                        sync_status: 'synced',
                        updated_at: new Date()
                    }
                },
                { session }
            );

            const logId = `LOG-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
            await CloudAuditLog.create([{
                localId: logId,
                user_id: user.userId,
                user_name: user.userName || 'utilisateur',
                action_type: 'MODIFICATION',
                table_concernee: 'departements',
                reference_id: id,
                description: `Modification du Grand Centre : ${nom.toUpperCase()}`,
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

    async supprimerDepartement(id, user) {
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const companyId = user.companyId || user.company_id;
            const isUsed = await CloudPlanAnalytique.findOne({ 
                parent_dept_id: id, 
                company_id: companyId, 
                is_deleted: 0 
            }).session(session);

            if (isUsed) throw new Error("🔒 Ce Grand Centre contient des subdivisions actives.");
            
            await CloudDepartement.updateOne(
                { localId: id, company_id: companyId },
                { $set: { is_deleted: 1, sync_status: 'synced', updated_at: new Date() } },
                { session }
            );

            const logId = `LOG-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
            await CloudAuditLog.create([{
                localId: logId,
                user_id: user.userId,
                user_name: user.userName || 'utilisateur',
                action_type: 'SUPPRESSION',
                table_concernee: 'departements',
                reference_id: id,
                description: `Archivage département ID: ${id}`,
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

    // --- SUBDIVISIONS (PLAN ANALYTIQUE) ---

    async getPlanAnalytique(companyId) {
        return await CloudPlanAnalytique.aggregate([
            { $match: { company_id: companyId.toString(), is_deleted: 0 } },
            {
                $lookup: {
                    from: 'cloud_departements',
                    localField: 'parent_dept_id',
                    foreignField: 'localId',
                    as: 'department'
                }
            },
            { $unwind: { path: '$department', preserveNullAndEmptyArrays: true } },
            {
                $addFields: {
                    parent_dept_nom: '$department.nom'
                }
            },
            { $sort: { code: 1 } }
        ]);
    }

    async createPlanAnalytique(data, user) {
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const { code, libelle, parent_dept_id } = data;
            const companyId = user.companyId || user.company_id;
            const codeFormate = formatCodeSubdivision(code); 
            const id = `PLAN-${Date.now().toString().slice(-6)}`;

            const existLib = await CloudPlanAnalytique.findOne({ 
                company_id: companyId, 
                libelle: libelle.toUpperCase(), 
                is_deleted: 0 
            }).session(session);
            if (existLib) throw new Error(`La subdivision "${libelle}" existe déjà.`);

            const existe = await CloudPlanAnalytique.findOne({ 
                company_id: companyId, 
                code: codeFormate, 
                is_deleted: 0 
            }).session(session);
            if (existe) throw new Error(`Le code "${codeFormate}" existe déjà.`);

            await CloudPlanAnalytique.create([{
                localId: id,
                company_id: companyId,
                parent_dept_id: parent_dept_id,
                code: codeFormate,
                libelle: libelle.toUpperCase(),
                is_deleted: 0,
                sync_status: 'synced',
                updated_at: new Date()
            }], { session });

            const logId = `LOG-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
            await CloudAuditLog.create([{
                localId: logId,
                user_id: user.userId,
                user_name: user.userName || 'utilisateur',
                action_type: 'CREATION',
                table_concernee: 'plan_analytique',
                reference_id: id,
                description: `Création subdivision : ${libelle.toUpperCase()} (${codeFormate})`,
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

    async modifierPlanAnalytique(id, data, user) {
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const { libelle, parent_dept_id, code } = data;
            const companyId = user.companyId || user.company_id;
            const codeFormate = formatCodeSubdivision(code);
            
            const isUsed = await CloudAnalytiqueDetail.findOne({ 
                plan_analytique_id: id, 
                company_id: companyId, 
                is_deleted: 0 
            }).session(session);
            
            if (isUsed) {
                await CloudPlanAnalytique.updateOne(
                    { localId: id, company_id: companyId },
                    { $set: { libelle: libelle.toUpperCase(), sync_status: 'synced', updated_at: new Date() } },
                    { session }
                );
            } else {
                await CloudPlanAnalytique.updateOne(
                    { localId: id, company_id: companyId },
                    { $set: { libelle: libelle.toUpperCase(), parent_dept_id, code: codeFormate, sync_status: 'synced', updated_at: new Date() } },
                    { session }
                );
            }

            const logId = `LOG-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
            await CloudAuditLog.create([{
                localId: logId,
                user_id: user.userId,
                user_name: user.userName || 'utilisateur',
                action_type: 'MODIFICATION',
                table_concernee: 'plan_analytique',
                reference_id: id,
                description: `Modification subdivision : ${libelle.toUpperCase()}`,
                date_action: new Date(),
                company_id: companyId,
                sync_status: 'synced'
            }], { session });

            await session.commitTransaction();
            session.endSession();
            return !!isUsed;
        } catch (error) {
            await session.abortTransaction();
            session.endSession();
            throw error;
        }
    }

    async supprimerPlanAnalytique(id, user) {
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const companyId = user.companyId || user.company_id;
            const isUsed = await CloudAnalytiqueDetail.findOne({ 
                plan_analytique_id: id, 
                company_id: companyId, 
                is_deleted: 0 
            }).session(session);

            if (isUsed) throw new Error("🔒 Subdivision liée à des calculs de coûts.");
            
            await CloudPlanAnalytique.updateOne(
                { localId: id, company_id: companyId },
                { $set: { is_deleted: 1, sync_status: 'synced', updated_at: new Date() } },
                { session }
            );

            const logId = `LOG-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
            await CloudAuditLog.create([{
                localId: logId,
                user_id: user.userId,
                user_name: user.userName || 'utilisateur',
                action_type: 'SUPPRESSION',
                table_concernee: 'plan_analytique',
                reference_id: id,
                description: `Archivage subdivision ID: ${id}`,
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

    // --- DÉTAILS COÛTS ---

    async getDetailsCout(companyId) {
        return await CloudAnalytiqueDetail.aggregate([
            { $match: { company_id: companyId.toString(), is_deleted: 0 } },
            {
                $lookup: {
                    from: 'cloud_products',
                    localField: 'product_id',
                    foreignField: 'localId',
                    as: 'product'
                }
            },
            { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'cloud_plan_analytique',
                    localField: 'plan_analytique_id',
                    foreignField: 'localId',
                    as: 'plan'
                }
            },
            { $unwind: { path: '$plan', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'cloud_plan_comptable',
                    localField: 'compte_analytique',
                    foreignField: 'numero_compte',
                    as: 'compte'
                }
            },
            { $unwind: { path: '$compte', preserveNullAndEmptyArrays: true } },
            {
                $addFields: {
                    product_nom: '$product.nom',
                    plan_libelle: '$plan.libelle',
                    compte_intitule: '$compte.intitule'
                }
            }
        ]);
    }

    async createDetailCout(data, user) {
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const { product_id, plan_analytique_id, montant_base_theorique, qte_base_production, compte_analytique } = data;
            const companyId = user.companyId || user.company_id;
            const id = `DET-${Date.now().toString().slice(-6)}`;
            const isPSF = product_id.startsWith('PSF-');
            const finalProductId = isPSF ? null : product_id;
            const finalSemiFiniId = isPSF ? product_id : null;

            await CloudAnalytiqueDetail.create([{
                localId: id,
                company_id: companyId,
                plan_analytique_id,
                product_id: finalProductId,
                semi_fini_id: finalSemiFiniId,
                code: id,
                libelle: `COÛT AUTO - ${id}`,
                compte_analytique,
                montant_base_theorique,
                qte_base_production,
                is_deleted: 0,
                sync_status: 'synced',
                updated_at: new Date()
            }], { session });

            const logId = `LOG-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
            await CloudAuditLog.create([{
                localId: logId,
                user_id: user.userId,
                user_name: user.userName || 'utilisateur',
                action_type: 'CREATION',
                table_concernee: 'analytique_details',
                reference_id: id,
                description: `Nouveau détail de coût pour produit ${product_id}`,
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

    async modifierDetailCout(id, data, user) {
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const { product_id, plan_analytique_id, montant_base_theorique, qte_base_production, compte_analytique } = data;
            const companyId = user.companyId || user.company_id;
            const isPSF = product_id.startsWith('PSF-');
            const finalProductId = isPSF ? null : product_id;
            const finalSemiFiniId = isPSF ? product_id : null;

            await CloudAnalytiqueDetail.updateOne(
                { localId: id, company_id: companyId },
                {
                    $set: {
                        product_id: finalProductId,
                        semi_fini_id: finalSemiFiniId,
                        plan_analytique_id,
                        montant_base_theorique,
                        qte_base_production,
                        compte_analytique,
                        sync_status: 'synced',
                        updated_at: new Date()
                    }
                },
                { session }
            );

            const logId = `LOG-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
            await CloudAuditLog.create([{
                localId: logId,
                user_id: user.userId,
                user_name: user.userName || 'utilisateur',
                action_type: 'MODIFICATION',
                table_concernee: 'analytique_details',
                reference_id: id,
                description: `Mise à jour détail de coût ID: ${id}`,
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

    async supprimerDetailCout(id, user) {
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const companyId = user.companyId || user.company_id;
            await CloudAnalytiqueDetail.updateOne(
                { localId: id, company_id: companyId },
                { $set: { is_deleted: 1, sync_status: 'synced', updated_at: new Date() } },
                { session }
            );

            const logId = `LOG-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
            await CloudAuditLog.create([{
                localId: logId,
                user_id: user.userId,
                user_name: user.userName || 'utilisateur',
                action_type: 'SUPPRESSION',
                table_concernee: 'analytique_details',
                reference_id: id,
                description: `Suppression coût ID: ${id}`,
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

    // --- IMPORT / EXPORT LOGIC ---

    async getExportDepartementsData(companyId) {
        return await CloudDepartement.find({ 
            company_id: companyId.toString(), 
            is_deleted: 0 
        }, { code_analytique: 1, nom: 1, _id: 0 }).lean();
    }

    async importDepartementsBatch(data, companyId) {
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            for (const [i, d] of data.entries()) {
                const existing = await CloudDepartement.findOne({ 
                    code_analytique: d.code, 
                    company_id: companyId 
                }).session(session);

                const id = existing ? existing.localId : `DEPT-${Date.now()}-${i}`;

                await CloudDepartement.findOneAndUpdate(
                    { code_analytique: d.code, company_id: companyId },
                    {
                        $set: {
                            nom: d.nom,
                            is_deleted: 0,
                            sync_status: 'synced',
                            updated_at: new Date()
                        },
                        $setOnInsert: {
                            localId: id,
                            company_id: companyId,
                            code_analytique: d.code
                        }
                    },
                    { upsert: true, new: true, session }
                );
            }
            await session.commitTransaction();
            session.endSession();
        } catch (error) {
            await session.abortTransaction();
            session.endSession();
            throw error;
        }
    }

    async getExportPlanData(companyId) {
        return await CloudPlanAnalytique.aggregate([
            { $match: { company_id: companyId.toString(), is_deleted: 0 } },
            {
                $lookup: {
                    from: 'cloud_departements',
                    localField: 'parent_dept_id',
                    foreignField: 'localId',
                    as: 'department'
                }
            },
            { $unwind: '$department' },
            {
                $project: {
                    code: 1,
                    libelle: 1,
                    code_parent: '$department.code_analytique',
                    _id: 0
                }
            }
        ]);
    }

    async importPlanBatch(data, companyId) {
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            for (const [i, d] of data.entries()) {
                const parent = await CloudDepartement.findOne({ 
                    code_analytique: d.codeParent, 
                    company_id: companyId 
                }).session(session);

                if (!parent) continue;

                const existing = await CloudPlanAnalytique.findOne({ 
                    code: d.code, 
                    company_id: companyId 
                }).session(session);

                const id = existing ? existing.localId : `PLAN-${Date.now()}-${i}`;

                await CloudPlanAnalytique.findOneAndUpdate(
                    { code: d.code, company_id: companyId },
                    {
                        $set: {
                            libelle: d.libelle,
                            parent_dept_id: parent.localId,
                            is_deleted: 0,
                            sync_status: 'synced',
                            updated_at: new Date()
                        },
                        $setOnInsert: {
                            localId: id,
                            company_id: companyId,
                            code: d.code
                        }
                    },
                    { upsert: true, new: true, session }
                );
            }
            await session.commitTransaction();
            session.endSession();
        } catch (error) {
            await session.abortTransaction();
            session.endSession();
            throw error;
        }
    }
}

module.exports = new PlanAnalytiqueService();