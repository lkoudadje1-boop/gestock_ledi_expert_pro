const OthersTiersService = require('../services/others_tiers.controller.service');

// Utilitaire de contexte harmonisé
const getContext = (req) => {
    const user = req.user || {};
    const companyId = user.companyId || user.company_id;
    return {
        companyId: companyId,
        userId: user.userId || user.id,
        userName: user.username || 'Utilisateur'
    };
};

// --- RÉCUPÉRER TOUS LES AUTRES TIERS ---
exports.getAllOthersTiers = (req, res) => {
    try {
        const { companyId } = getContext(req);
        if (!companyId) return res.status(401).json({ error: "Session invalide." });

        const tiers = OthersTiersService.getAll(companyId);
        res.json(tiers);
    } catch (err) {
        res.status(500).json({ error: "Erreur lors de la récupération." });
    }
};

// --- CRÉER UN NOUVEAU TIERS DIVERS ---
exports.createOtherTier = (req, res) => {
    const context = getContext(req);
    if (!req.body.nom) return res.status(400).json({ error: "Nom obligatoire." });
    if (!context.companyId) return res.status(401).json({ error: "Identification entreprise manquante." });

    try {
        const { tierId, nomPropre } = OthersTiersService.create(req.body, req.user);

        // Signal Socket.io
        if (req.io) {
            const room = String(context.companyId);
            
            // 🔥 SIGNAL UNIVERSEL
            req.io.to(room).emit('DATA_EVENT', { 
                table: 'others_tiers', 
                action: 'INSERT', 
                id: tierId 
            });

            // Compatibilité UI existante
            req.io.to(room).emit('OTHERS_TIERS_UPDATED');
            req.io.to(room).emit('REFRESH_UI', { 
                module: 'OTHERS_TIERS', 
                action: 'CREATE', 
                message: `Tiers divers ajouté : ${nomPropre}` 
            });
        }

        res.status(201).json({ success: true, id: tierId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// --- METTRE À JOUR UN TIERS DIVERS ---
exports.updateOtherTier = (req, res) => {
    const context = getContext(req);
    const { id } = req.params;

    try {
        const updated = OthersTiersService.update(id, req.body, req.user);

        if (updated && req.io && context.companyId) {
            const room = String(context.companyId);
            
            // 🔥 SIGNAL UNIVERSEL
            req.io.to(room).emit('DATA_EVENT', { 
                table: 'others_tiers', 
                action: 'UPDATE', 
                id: id 
            });

            req.io.to(room).emit('OTHERS_TIERS_UPDATED');
            req.io.to(room).emit('REFRESH_UI', { module: 'OTHERS_TIERS', action: 'UPDATE' });
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// --- SUPPRIMER UN TIERS DIVERS ---
exports.deleteOtherTier = (req, res) => {
    const context = getContext(req);
    const { id } = req.params;

    try {
        const deleted = OthersTiersService.delete(id, req.user);

        if (deleted && req.io && context.companyId) {
            const room = String(context.companyId);
            
            // 🔥 SIGNAL UNIVERSEL
            req.io.to(room).emit('DATA_EVENT', { 
                table: 'others_tiers', 
                action: 'DELETE', 
                id: id 
            });

            req.io.to(room).emit('OTHERS_TIERS_UPDATED');
            req.io.to(room).emit('REFRESH_UI', { module: 'OTHERS_TIERS', action: 'DELETE' });
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Impossible de supprimer : ce tiers est probablement utilisé." });
    }
};