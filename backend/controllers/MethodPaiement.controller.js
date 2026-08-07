const methodService = require('../services/MethodPaiement.service');

const getContext = (req) => {
    const user = req.user || {};
    return {
        companyId: user.companyId || user.company_id,
        userId: user.userId || user.id,
        userName: user.username || 'utilisateur'
    };
};

// 1. Récupérer la liste
exports.getMethods = (req, res) => {
    try {
        const { companyId } = getContext(req);
        if (!companyId) return res.status(401).json({ error: "Session invalide." });
        
        const methods = methodService.findAllMethods(companyId);
        res.json({ success: true, data: methods });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// 2. Création
exports.creerMethod = (req, res) => {
    try {
        const context = getContext(req);
        const id = methodService.createMethod(req.body, context);

        if (req.io && context.companyId) {
            req.io.to(context.companyId.toString()).emit('DATA_EVENT', { 
                table: 'payment_methods', 
                action: 'INSERT' 
            });
        }

        res.json({ success: true, message: "Moyen de paiement créé avec succès.", id });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// 3. Modification (avec gestion du verrouillage transactionnel)
exports.modifierMethod = (req, res) => {
    try {
        const context = getContext(req);
        
        // On récupère le flag isUsed renvoyé par le service
        const isUsed = methodService.updateMethod(req.params.id, req.body, context);

        if (req.io && context.companyId) {
            req.io.to(context.companyId.toString()).emit('DATA_EVENT', { 
                table: 'payment_methods', 
                action: 'UPDATE', 
                id: req.params.id 
            });
        }

        // Message adapté si le moyen est utilisé
        const message = isUsed 
            ? "Note : Seul le statut a été mis à jour car ce moyen est lié à des transactions."
            : "Moyen de paiement mis à jour avec succès.";

        res.json({ success: true, message });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// 4. Suppression
exports.supprimerMethod = (req, res) => {
    try {
        const { companyId } = getContext(req);
        methodService.deleteMethod(req.params.id, companyId);

        if (req.io && companyId) {
            req.io.to(companyId.toString()).emit('DATA_EVENT', { 
                table: 'payment_methods', 
                action: 'DELETE', 
                id: req.params.id 
            });
        }

        res.json({ success: true, message: "Moyen de paiement supprimé avec succès." });
    } catch (err) {
        // Erreur 403 (Interdit) ou 500 si c'est utilisé
        res.status(err.message.includes('🔒') ? 403 : 500).json({ error: err.message });
    }
};