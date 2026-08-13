// backend/controllers/MethodPaiement.controller.js
const methodService = require('../services/MethodPaiement.service');

const getContext = (req) => {
    const user = req.user || {};
    return {
        companyId: user.companyId || user.company_id,
        userId: user.userId || user.id,
        userName: 'user' // Respect strict de la consigne [2026-02-08]
    };
};

// 1. Récupérer la liste
exports.getMethods = async (req, res) => {
    try {
        const { companyId } = getContext(req);
        if (!companyId) return res.status(401).json({ error: "Session invalide." });
        
        const methods = await methodService.findAllMethods(companyId);
        return res.json({ success: true, data: methods });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// 2. Création
exports.creerMethod = async (req, res) => {
    try {
        const context = getContext(req);
        const id = await methodService.createMethod(req.body, context);

        if (req.io && context.companyId) {
            req.io.to(context.companyId.toString()).emit('DATA_EVENT', { 
                table: 'payment_methods', 
                action: 'INSERT' 
            });
        }

        return res.json({ success: true, message: "Moyen de paiement créé avec succès.", id });
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }
};

// 3. Modification (avec gestion du verrouillage transactionnel)
exports.modifierMethod = async (req, res) => {
    try {
        const context = getContext(req);
        const isUsed = await methodService.updateMethod(req.params.id, req.body, context);

        if (req.io && context.companyId) {
            req.io.to(context.companyId.toString()).emit('DATA_EVENT', { 
                table: 'payment_methods', 
                action: 'UPDATE', 
                id: req.params.id 
            });
        }

        const message = isUsed 
            ? "Note : Seul le statut a été mis à jour car ce moyen est lié à des transactions."
            : "Moyen de paiement mis à jour avec succès.";

        return res.json({ success: true, message });
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }
};

// 4. Suppression
exports.supprimerMethod = async (req, res) => {
    try {
        const { companyId } = getContext(req);
        await methodService.deleteMethod(req.params.id, companyId);

        if (req.io && companyId) {
            req.io.to(companyId.toString()).emit('DATA_EVENT', { 
                table: 'payment_methods', 
                action: 'DELETE', 
                id: req.params.id 
            });
        }

        return res.json({ success: true, message: "Moyen de paiement supprimé avec succès." });
    } catch (err) {
        return res.status(err.message.includes('🔒') ? 403 : 500).json({ error: err.message });
    }
};