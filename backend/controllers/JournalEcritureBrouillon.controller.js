// backend/controllers/JournalEcritureBrouillon.controller.js
const BrouillonService = require('../services/JournalEcritureBrouillon.service');

const getContext = (req) => {
    const user = req.user || {};
    const companyId = user.companyId || user.company_id;
    return {
        companyId: companyId,
        userId: user.userId || user.id,
        userName: 'user' // Respect strict de la consigne [2026-02-08]
    };
};

exports.creerEcritureBrouillon = async (req, res) => {
    try {
        const { companyId, userId } = getContext(req);
        const result = await BrouillonService.creerEcritureBrouillon({ companyId, userId, userName: 'user', body: req.body });
        return res.status(201).json({ success: true, ...result });
    } catch (err) { 
        return res.status(500).json({ error: err.message }); 
    }
};

exports.enregistrerLigneBrouillonIndividuelle = async (req, res) => {
    try {
        const { companyId } = getContext(req);
        const result = await BrouillonService.enregistrerLigneBrouillonIndividuelle({ companyId, userName: 'user', body: req.body });
        return res.status(req.body.id ? 200 : 201).json({ success: true, ...result });
    } catch (err) { 
        return res.status(500).json({ error: err.message }); 
    }
};

exports.getLignesBrouillonParPeriode = async (req, res) => {
    try {
        const { companyId } = getContext(req);
        const result = await BrouillonService.getLignesBrouillonParPeriode({ ...req.query, companyId });
        return res.json({ success: true, ...result });
    } catch (err) { 
        return res.status(500).json({ error: err.message }); 
    }
};

exports.supprimerPieceBrouillon = async (req, res) => {
    try {
        const { companyId } = getContext(req);
        await BrouillonService.supprimerPieceBrouillon(req.body.ids, companyId);
        return res.json({ success: true, message: "Écritures supprimées du brouillon." });
    } catch (err) { 
        return res.status(500).json({ error: err.message }); 
    }
};

exports.getJournauxPourBrouillon = async (req, res) => {
    try {
        const { companyId } = getContext(req);
        const result = await BrouillonService.getJournauxPourBrouillon(req.query.exercice_id, companyId);
        return res.json({ success: true, ...result });
    } catch (err) { 
        return res.status(500).json({ error: err.message }); 
    }
};

exports.validerPieceBrouillon = async (req, res) => {
    try {
        const { companyId } = getContext(req);
        await BrouillonService.validerPieceBrouillon({ ...req.body, companyId, userName: 'user' });
        return res.json({ success: true, message: `Pièce ${req.body.piece_provisoire} validée avec succès.` });
    } catch (err) { 
        return res.status(500).json({ success: false, error: err.message }); 
    }
};

exports.rejeterPieceBrouillon = async (req, res) => {
    try {
        const { companyId } = getContext(req);
        await BrouillonService.rejeterPieceBrouillon({ ...req.body, companyId });
        if (req.io && companyId) {
            const room = companyId.toString();
            req.io.to(room).emit('REFRESH_OP_TRESO');
            req.io.to(room).emit('DATA_EVENT', { table: 'brouillon_ecritures', action: 'UPDATE' });
        }
        return res.json({ success: true, message: "Pièce rejetée et opération libérée." });
    } catch (err) { 
        return res.status(500).json({ success: false, error: err.message }); 
    }
};