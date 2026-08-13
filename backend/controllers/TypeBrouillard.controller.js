// backend/controllers/TypeBrouillard.controller.js
const BrouillardService = require('../services/TypeBrouillard.service');
const { logAction } = require('../utils/auditHelper');
const { 
    CloudBrouillardTreso, 
    CloudBrouillardAffectation, 
    CloudUser 
} = require('../models/cloud.model');

// Utilitaire de contexte harmonisé
const getContext = (req) => {
    const user = req.user || {};
    const companyId = user.companyId || user.company_id;
    return {
        companyId: companyId ? companyId.toString() : null,
        userId: user.userId || user.id,
        userName: 'user'
    };
};

exports.getBrouillards = async (req, res) => {
    const { companyId } = getContext(req);
    try {
        if (!companyId) return res.status(401).json({ success: false, error: "Session invalide." });
        const rows = await BrouillardService.getAll(companyId);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.creerBrouillard = async (req, res) => {
    const context = getContext(req);
    const d = req.body;
    const sec = BrouillardService.calculerSecurite(d);

    try {
        const id = `BT-${Date.now()}`;
        await CloudBrouillardTreso.create({
            localId: id,
            company_id: context.companyId,
            journal_id: d.journal_id,
            journal_brouillon_id: d.journal_brouillon_id || null,
            libelle: d.libelle,
            type: d.type,
            compte_treso_id: d.compte_treso_id,
            mode_fonctionnement: sec.modeFinal,
            sortie_directe: d.sortie_directe,
            mode_ecriture: d.mode_ecriture,
            seuil_validation: sec.seuil,
            niv1_actif: sec.niv1, niv1_user_id: sec.niv1_user,
            niv2_actif: sec.niv2, niv2_user_id: sec.niv2_user,
            niv3_actif: sec.niv3, niv3_user_id: sec.niv3_user,
            niv4_actif: sec.niv4, niv4_user_id: sec.niv4_user,
            sync_status: 'synced'
        });

        await logAction({
            userId: context.userId, 
            userName: context.userName, 
            actionType: 'CREATION',
            tableConcernee: 'brouillards_treso', 
            referenceId: id,
            description: `Création du brouillard tréso : ${d.libelle}`, 
            companyId: context.companyId
        });

        if (req.io && context.companyId) {
            req.io.to(String(context.companyId)).emit('DATA_EVENT', { table: 'brouillards_treso', action: 'INSERT', id });
            req.io.to(String(context.companyId)).emit('REFRESH_BROUILLARDS');
        }

        res.json({ success: true, message: "Brouillard créé !" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.modifierBrouillard = async (req, res) => {
    const { id } = req.params;
    const context = getContext(req);
    const d = req.body;
    const sec = BrouillardService.calculerSecurite(d);

    try {
        await CloudBrouillardTreso.updateOne(
            { localId: id.toString(), company_id: context.companyId },
            {
                libelle: d.libelle, type: d.type, journal_id: d.journal_id, 
                journal_brouillon_id: d.journal_brouillon_id || null, 
                compte_treso_id: d.compte_treso_id, mode_fonctionnement: sec.modeFinal, 
                sortie_directe: d.sortie_directe, mode_ecriture: d.mode_ecriture, 
                seuil_validation: sec.seuil, niv1_actif: sec.niv1, niv1_user_id: sec.niv1_user,
                niv2_actif: sec.niv2, niv2_user_id: sec.niv2_user, niv3_actif: sec.niv3, 
                niv3_user_id: sec.niv3_user, niv4_actif: sec.niv4, niv4_user_id: sec.niv4_user,
                updated_at: new Date()
            }
        );

        await logAction({
            userId: context.userId, 
            userName: context.userName, 
            actionType: 'MODIFICATION',
            tableConcernee: 'brouillards_treso', 
            referenceId: id.toString(),
            description: `Mise à jour config brouillard : ${d.libelle}`, 
            companyId: context.companyId
        });

        if (req.io && context.companyId) {
            req.io.to(String(context.companyId)).emit('DATA_EVENT', { table: 'brouillards_treso', action: 'UPDATE', id });
            req.io.to(String(context.companyId)).emit('REFRESH_BROUILLARDS');
        }

        res.json({ success: true, message: "Configuration mise à jour." });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.supprimerBrouillard = async (req, res) => {
    const { id } = req.params;
    const context = getContext(req);

    try {
        const canDelete = await BrouillardService.canDelete(id, context.companyId);
        if (!canDelete) return res.status(403).json({ success: false, error: "Impossible de supprimer : opérations existantes." });

        const result = await CloudBrouillardTreso.deleteOne({ localId: id.toString(), company_id: context.companyId });
        if (result.deletedCount === 0) return res.status(404).json({ success: false, error: "Brouillard introuvable." });

        if (req.io && context.companyId) {
            req.io.to(String(context.companyId)).emit('DATA_EVENT', { table: 'brouillards_treso', action: 'DELETE', id });
            req.io.to(String(context.companyId)).emit('REFRESH_BROUILLARDS');
        }

        res.json({ success: true, message: "Brouillard supprimé." });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.assignerUtilisateur = async (req, res) => {
    const context = getContext(req);
    const { brouillard_id, user_id, peut_saisir, peut_valider } = req.body;

    try {
        await CloudBrouillardAffectation.findOneAndUpdate(
            { brouillard_id, user_id, company_id: context.companyId },
            { peut_saisir, peut_valider, updated_at: new Date() },
            { upsert: true, new: true }
        );

        if (req.io && context.companyId) {
            req.io.to(String(context.companyId)).emit('DATA_EVENT', { table: 'brouillard_affectations', action: 'UPDATE' });
        }

        res.json({ success: true, message: "Affectation réussie !" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.getAffectations = async (req, res) => {
    const { id } = req.params;
    const { companyId } = getContext(req);

    try {
        const rows = await CloudBrouillardAffectation.aggregate([
            { $match: { brouillard_id: id.toString(), company_id: companyId } },
            {
                $lookup: {
                    from: 'cloud_users',
                    localField: 'user_id',
                    foreignField: 'localId',
                    as: 'user'
                }
            },
            { $unwind: '$user' },
            { $project: { _id: 0, brouillard_id: 1, user_id: 1, peut_saisir: 1, peut_valider: 1, username: '$user.username' } }
        ]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.supprimerAffectation = async (req, res) => {
    const { brouillard_id, user_id } = req.params;
    const { companyId } = getContext(req);

    try {
        await CloudBrouillardAffectation.deleteOne({ brouillard_id, user_id, company_id: companyId });
        res.json({ success: true, message: "Accès révoqué." });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.getBrouillardsAffectes = async (req, res) => {
    const { companyId } = getContext(req);
    const userId = req.user?.userId || req.user?.id;

    try {
        const rows = await CloudBrouillardAffectation.aggregate([
            { $match: { user_id: userId.toString(), company_id: companyId } },
            {
                $lookup: {
                    from: 'cloud_brouillards_tresos',
                    localField: 'brouillard_id',
                    foreignField: 'localId',
                    as: 'b'
                }
            },
            { $unwind: '$b' },
            { $match: { 'b.actif': true } },
            { $project: { _id: 0, brouillard: '$b', peut_saisir: 1, peut_valider: 1 } }
        ]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};