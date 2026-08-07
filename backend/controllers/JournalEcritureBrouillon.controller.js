const BrouillonService = require('../services/JournalEcritureBrouillon.service');

exports.creerEcritureBrouillon = async (req, res) => {
    try {
        const companyId = req.user?.companyId || req.user?.company_id;
        const userId = req.user?.userId || req.user?.id;
        const userName = req.user?.username || 'Utilisateur';
        const result = await BrouillonService.creerEcritureBrouillon({ companyId, userId, userName, body: req.body });
        res.status(201).json({ success: true, ...result });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.enregistrerLigneBrouillonIndividuelle = async (req, res) => {
    try {
        const companyId = req.user?.company_id || req.user?.companyId;
        const userName = req.user?.username || 'Utilisateur';
        const result = await BrouillonService.enregistrerLigneBrouillonIndividuelle({ companyId, userName, body: req.body });
        res.status(req.body.id ? 200 : 201).json({ success: true, ...result });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.getLignesBrouillonParPeriode = async (req, res) => {
    try {
        const companyId = req.user?.company_id || req.user?.companyId;
        const result = await BrouillonService.getLignesBrouillonParPeriode({ ...req.query, companyId });
        res.json({ success: true, ...result });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.supprimerPieceBrouillon = async (req, res) => {
    try {
        const companyId = req.user?.company_id || req.user?.companyId;
        await BrouillonService.supprimerPieceBrouillon(req.body.ids, companyId);
        res.json({ success: true, message: "Écritures supprimées du brouillon." });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.getJournauxPourBrouillon = async (req, res) => {
    try {
        const companyId = req.user?.company_id || req.user?.companyId;
        const result = await BrouillonService.getJournauxPourBrouillon(req.query.exercice_id, companyId);
        res.json({ success: true, ...result });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.validerPieceBrouillon = async (req, res) => {
    try {
        const companyId = req.user.companyId || req.user.company_id;
        const userName = req.user.username || 'Chef Comptable';
        await BrouillonService.validerPieceBrouillon({ ...req.body, companyId, userName });
        res.json({ success: true, message: `Pièce ${req.body.piece_provisoire} validée avec succès.` });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

exports.rejeterPieceBrouillon = async (req, res) => {
    try {
        const companyId = req.user.companyId || req.user.company_id;
        await BrouillonService.rejeterPieceBrouillon({ ...req.body, companyId });
        if (req.io) {
            const room = companyId.toString();
            req.io.to(room).emit('REFRESH_OP_TRESO');
            req.io.to(room).emit('DATA_EVENT', { table: 'brouillon_ecritures', action: 'UPDATE' });
        }
        res.json({ success: true, message: "Pièce rejetée et opération libérée." });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};