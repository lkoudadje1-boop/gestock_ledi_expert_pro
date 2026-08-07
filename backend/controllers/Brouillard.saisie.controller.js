const BrouillardService = require('../services/Brouillard.saisie.service');

const creerOperation = async (req, res) => {
    try {
        const companyId = req.user?.companyId || req.user?.company_id;
        const userId = req.user?.userId || req.user?.id;
        const result = await BrouillardService.creerOperation({ companyId, userId, body: req.body });
        
        if (req.io) req.io.to(companyId.toString()).emit('REFRESH_OP_TRESO');
        res.json({ success: true, ...result });
    } catch (err) { res.status(403).json({ error: err.message }); }
};

const modifierOperation = async (req, res) => {
    try {
        const result = await BrouillardService.modifierOperation(req.params.id, req.body);
        res.json(result);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

const supprimerOperation = async (req, res) => {
    try {
        const { id } = req.params;
        const { motif } = req.body;
        const userId = req.user?.userId || req.user?.id;
        const companyId = req.user?.companyId || req.user?.company_id;

        const result = await BrouillardService.supprimerOperation(id, motif, userId, companyId);
        
        if (req.io) req.io.to(companyId.toString()).emit('REFRESH_OP_TRESO');
        res.json({ success: true, ...result });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

const getOperationsBrouillard = async (req, res) => {
    try {
        const companyId = req.user?.companyId || req.user?.company_id;
        const result = await BrouillardService.getOperationsBrouillard(req.params.id, companyId);
        res.json(result);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

const getOperationsAValider = async (req, res) => {
    try {
        const companyId = req.user?.companyId || req.user?.company_id;
        const result = await BrouillardService.getOperationsAValider(companyId);
        res.json(result);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

const deciderOperation = async (req, res) => {
    try {
        const { id } = req.params;
        const { action } = req.body;
        const userId = req.user?.userId || req.user?.id;
        const companyId = req.user?.companyId || req.user?.company_id;

        const result = await BrouillardService.deciderOperation(id, action, userId, companyId);
        
        if (req.io) req.io.to(companyId.toString()).emit('REFRESH_OP_TRESO');
        res.json(result);
    } catch (err) { res.status(403).json({ error: err.message }); }
};

const getDepensesAVentiler = async (req, res) => {
    try {
        const companyId = req.user?.companyId || req.user?.company_id;
        const result = await BrouillardService.getDepensesAVentiler(companyId);
        res.json(result);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

const ventilerOperation = async (req, res) => {
    try {
        const companyId = req.user?.companyId || req.user?.company_id;
        const result = await BrouillardService.ventilerOperation({ ...req.body, companyId });

        if (req.io && companyId) {
            const room = companyId.toString();
            req.io.to(room).emit('DATA_EVENT', { table: 'brouillon_ecritures', action: 'INSERT' });
            req.io.to(room).emit('REFRESH_VENTILATION');
        }
        res.json(result);
    } catch (err) { res.status(400).json({ error: err.message }); }
};

module.exports = { 
    creerOperation, modifierOperation, supprimerOperation, 
    getOperationsBrouillard, getOperationsAValider, deciderOperation, 
    getDepensesAVentiler, ventilerOperation 
};