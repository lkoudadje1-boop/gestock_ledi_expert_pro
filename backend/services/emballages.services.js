// backend/services/emballages.services.js
const mongoose = require('mongoose');
const { 
    CloudPackaging, CloudUnite, CloudPackagingRule, 
    CloudPackagingRuleTier, CloudAuditLog 
} = require('../models/cloud.model');
const { logAction } = require('../utils/auditHelper');

function genererIdArticle() {
    return `EMB-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`;
}

exports.createPackaging = async ({ companyId, userId, userName, data }) => {
    const { nom, unite_id, rule_id, prix_consigne, prix_deconsigne, prix_achat, stock_alerte, cmp } = data;
    const packagingId = genererIdArticle();

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        await CloudPackaging.create([{
            localId: packagingId,
            nom: nom.toUpperCase(),
            unite_id: unite_id || null,
            rule_id: rule_id || null,
            prix_consigne: prix_consigne || 0,
            prix_deconsigne: prix_deconsigne || 0,
            prix_achat: prix_achat || 0,
            stock_alerte: stock_alerte || 0,
            cmp: cmp || 0,
            company_id: companyId.toString(),
            sync_status: 'synced'
        }], { session });

        await logAction({
            userId,
            userName: userName || 'user',
            actionType: 'INSERTION',
            tableConcernee: 'packaging',
            referenceId: packagingId,
            description: `Création de l'emballage: ${nom.toUpperCase()}`,
            companyId: companyId.toString()
        });

        await session.commitTransaction();
        session.endSession();
        return packagingId;
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        throw err;
    }
};

// Récupérer tous les emballages d'une entreprise (Cloud)
exports.getAllPackagings = async (companyId) => {
    try {
        const packagings = await CloudPackaging.find({ company_id: companyId.toString() }).lean();
        const result = [];

        for (const pkg of packagings) {
            let uniteNom = null;
            if (pkg.unite_id) {
                const unite = await CloudUnite.findOne({ 
                    $or: [{ localId: pkg.unite_id }, { _id: mongoose.isValidObjectId(pkg.unite_id) ? pkg.unite_id : null }] 
                }).lean();
                uniteNom = unite?.nom || null;
            }

            let regleObj = null;
            if (pkg.rule_id) {
                const rule = await CloudPackagingRule.findOne({ 
                    $or: [{ localId: pkg.rule_id }, { _id: mongoose.isValidObjectId(pkg.rule_id) ? pkg.rule_id : null }] 
                }).lean();

                if (rule) {
                    const tiers = await CloudPackagingRuleTier.find({ 
                        rule_id: pkg.rule_id, 
                        company_id: companyId.toString() 
                    }).sort({ jours_min: 1 }).lean();

                    regleObj = {
                        id: rule.localId || rule._id.toString(),
                        code_regle: rule.code_regle,
                        libelle: rule.libelle,
                        tiers: tiers.map(t => ({
                            id: t.localId || t._id.toString(),
                            jours_min: t.jours_min,
                            jours_max: t.jours_max,
                            type_calcul: t.type_calcul,
                            valeur: t.valeur
                        }))
                    };
                }
            }

            result.push({
                ...pkg,
                unite_nom: uniteNom,
                regle: regleObj
            });
        }

        return result;
    } catch (error) {
        console.warn("⚠️ Échec de la récupération complète des packagings avec règles :", error.message);
        try {
            const packagings = await CloudPackaging.find({ company_id: companyId.toString() }).lean();
            return packagings.map(pkg => ({ ...pkg, unite_nom: null, regle: null }));
        } catch (fallbackError) {
            console.error("Erreur critique sur la table packaging :", fallbackError.message);
            return [];
        }
    }
};

// Récupérer un emballage par son ID
exports.getPackagingById = async (id, companyId) => {
    return await CloudPackaging.findOne({ 
        $or: [{ localId: id }, { _id: mongoose.isValidObjectId(id) ? id : null }],
        company_id: companyId.toString() 
    }).lean();
};

// Mettre à jour un emballage
exports.updatePackaging = async ({ id, companyId, userId, userName, data }) => {
    const { nom, unite_id, rule_id, prix_consigne, prix_deconsigne, prix_achat, stock_alerte, cmp } = data;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const result = await CloudPackaging.updateOne(
            { 
                $or: [{ localId: id }, { _id: mongoose.isValidObjectId(id) ? id : null }],
                company_id: companyId.toString() 
            },
            {
                $set: {
                    nom: nom.toUpperCase(),
                    unite_id: unite_id || null,
                    rule_id: rule_id || null,
                    prix_consigne: prix_consigne || 0,
                    prix_deconsigne: prix_deconsigne || 0,
                    prix_achat: prix_achat || 0,
                    stock_alerte: stock_alerte || 0,
                    cmp: cmp || 0,
                    updated_at: new Date(),
                    sync_status: 'synced'
                }
            }
        ).session(session);

        if (result.matchedCount > 0) {
            await logAction({
                userId,
                userName: userName || 'user',
                actionType: 'MODIFICATION',
                tableConcernee: 'packaging',
                referenceId: id,
                description: `Modification de l'emballage: ${nom.toUpperCase()}`,
                companyId: companyId.toString()
            });
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

// Supprimer un emballage
exports.deletePackaging = async ({ id, companyId, userId, userName }) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const current = await CloudPackaging.findOne({ 
            $or: [{ localId: id }, { _id: mongoose.isValidObjectId(id) ? id : null }],
            company_id: companyId.toString() 
        }).lean();

        const result = await CloudPackaging.deleteOne({ 
            $or: [{ localId: id }, { _id: mongoose.isValidObjectId(id) ? id : null }],
            company_id: companyId.toString() 
        }).session(session);

        if (result.deletedCount > 0) {
            await logAction({
                userId,
                userName: userName || 'user',
                actionType: 'SUPPRESSION',
                tableConcernee: 'packaging',
                referenceId: id,
                description: `Suppression de l'emballage: ${current ? current.nom : id}`,
                companyId: companyId.toString()
            });
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