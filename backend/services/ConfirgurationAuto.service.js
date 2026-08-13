// backend/services/ConfirgurationAuto.service.js
const mongoose = require('mongoose');
const { 
    CloudAnalytiqueConfigCompte, CloudAnalytiqueAutoRepartition, 
    CloudPlanComptable, CloudPlanAnalytique, CloudAuditLog 
} = require('../models/cloud.model');
const { logAction } = require('../utils/auditHelper');

/**
 * Génère un ID unique basé sur un préfixe, le timestamp et un sel aléatoire
 */
const genererIdLocal = (prefix) => {
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 100).toString().padStart(2, '0');
    return `${prefix}-${timestamp}${random}`;
};

// --- LOGIQUE DE CRÉATION / MISE À JOUR ---
exports.processConfig = async (data, context) => {
    const { id, compte_general_id, mode_saisie, montant_base, repartitions, description } = data;
    const { companyId, userId, userName } = context;

    // 1. RÉCUPÉRER L'ID TECHNIQUE DU COMPTE GÉNÉRAL
    const account = await CloudPlanComptable.findOne({ 
        numero_compte: compte_general_id, 
        company_id: companyId.toString() 
    }).lean();

    if (!account) {
        throw new Error(`Compte ${compte_general_id} introuvable.`);
    }

    // 2. VALIDATION MATHÉMATIQUE
    const totalSaisi = Math.round(Object.values(repartitions || {}).reduce((sum, val) => sum + (parseFloat(val) || 0), 0) * 100) / 100;

    if (mode_saisie === 'AUTO' && Math.abs(totalSaisi - 100) > 0.01) {
        throw new Error(`En mode AUTO, le total doit être de 100% (Actuel: ${totalSaisi}%)`);
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        // A. Identifier si une config existe déjà
        const existingConfig = await CloudAnalytiqueConfigCompte.findOne({ 
            compte_general_id: account.localId || account._id, 
            company_id: companyId.toString() 
        }).session(session);

        const config_id_to_use = existingConfig ? existingConfig.localId : (id || genererIdLocal('CONF'));

        // B. UPSERT de la configuration parente
        if (existingConfig) {
            await CloudAnalytiqueConfigCompte.updateOne(
                { _id: existingConfig._id },
                {
                    $set: {
                        mode_saisie,
                        montant_base: mode_saisie === 'MANUEL' ? montant_base : null,
                        description: description || null,
                        is_deleted: 0,
                        updated_at: new Date(),
                        sync_status: 'synced'
                    }
                }
            ).session(session);
        } else {
            await CloudAnalytiqueConfigCompte.create([{
                localId: config_id_to_use,
                company_id: companyId.toString(),
                compte_general_id: account.localId || account._id,
                mode_saisie,
                montant_base: mode_saisie === 'MANUEL' ? montant_base : null,
                description: description || null,
                is_deleted: 0,
                sync_status: 'synced'
            }], { session });
        }

        // C. NETTOYAGE : Suppression des anciennes lignes de répartition associées
        await CloudAnalytiqueAutoRepartition.deleteMany({ config_id: config_id_to_use }).session(session);

        // D. INSERTION des nouvelles lignes
        for (const [sub_id, valeur] of Object.entries(repartitions || {})) {
            const valNum = parseFloat(valeur) || 0;
            if (valNum > 0) {
                const lineId = genererIdLocal('LIG');
                await CloudAnalytiqueAutoRepartition.create([{
                    localId: lineId,
                    config_id: config_id_to_use,
                    plan_analytique_id: sub_id,
                    company_id: companyId.toString(),
                    pourcentage: mode_saisie === 'AUTO' ? valNum : null,
                    montant: mode_saisie === 'MANUEL' ? valNum : null,
                    sync_status: 'synced'
                }], { session });
            }
        }

        // E. LOG D'AUDIT
        await logAction({
            userId, userName,
            actionType: existingConfig ? 'MODIFICATION' : 'INSERTION',
            tableConcernee: 'analytique_config_comptes',
            referenceId: config_id_to_use,
            description: `${existingConfig ? 'Mise à jour' : 'Création'} règle analytique pour ${account.numero_compte} (${mode_saisie})`,
            companyId: companyId.toString()
        });

        await session.commitTransaction();
        session.endSession();
        return config_id_to_use;
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        throw err;
    }
};

// --- RÉCUPÉRER L'HISTORIQUE ---
exports.fetchConfigs = async (companyId) => {
    const configs = await CloudAnalytiqueConfigCompte.find({ 
        company_id: companyId.toString(), 
        is_deleted: 0 
    }).lean();

    const result = [];

    for (const c of configs) {
        const account = await CloudPlanComptable.findOne({ 
            $or: [{ localId: c.compte_general_id }, { _id: mongoose.isValidObjectId(c.compte_general_id) ? c.compte_general_id : null }],
            company_id: companyId.toString() 
        }).lean();

        const lines = await CloudAnalytiqueAutoRepartition.find({ config_id: c.localId || c._id.toString() }).lean();

        const repartitions = {};
        const details_plans = {};

        for (const l of lines) {
            const planAnalytique = await CloudPlanAnalytique.findOne({ 
                $or: [{ localId: l.plan_analytique_id }, { _id: mongoose.isValidObjectId(l.plan_analytique_id) ? l.plan_analytique_id : null }] 
            }).lean();

            repartitions[l.plan_analytique_id] = c.mode_saisie === 'AUTO' ? l.pourcentage : l.montant;
            details_plans[l.plan_analytique_id] = { 
                libelle: planAnalytique?.libelle || 'Analytique', 
                dept_id: planAnalytique?.parent_dept_id 
            };
        }

        result.push({
            ...c,
            compte_num: account?.numero_compte || '',
            compte_intitule: account?.intitule || '',
            compte_general_id: account?.numero_compte || '',
            repartitions,
            details_plans
        });
    }

    return result.sort((a, b) => a.compte_num.localeCompare(b.compte_num));
};

// --- SUPPRIMER UNE RÈGLE ---
exports.removeConfig = async (id, context) => {
    const { companyId, userId, userName } = context;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const config = await CloudAnalytiqueConfigCompte.findOne({ 
            $or: [{ localId: id }, { _id: mongoose.isValidObjectId(id) ? id : null }], 
            company_id: companyId.toString() 
        }).session(session);

        if (!config) throw new Error("Configuration analytique introuvable.");

        await CloudAnalytiqueConfigCompte.updateOne(
            { _id: config._id },
            { 
                $set: { 
                    is_deleted: 1, 
                    sync_status: 'synced', 
                    updated_at: new Date() 
                } 
            }
        ).session(session);

        await logAction({
            userId, userName,
            actionType: 'SUPPRESSION',
            tableConcernee: 'analytique_config_comptes',
            referenceId: id,
            description: `Suppression (archivage) règle analytique technique ID: ${id}`,
            companyId: companyId.toString()
        });

        await session.commitTransaction();
        session.endSession();
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        throw err;
    }
};