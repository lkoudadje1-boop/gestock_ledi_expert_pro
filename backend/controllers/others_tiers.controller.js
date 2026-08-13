// backend/controllers/othersTiers.controller.js
const OthersTiersService = require('../services/others_tiers.controller.service');

// Utilitaire de contexte harmonisé
const getContext = (req) => {
    const user = req.user || {};
    const companyId = user.companyId || user.company_id;
    return {
        companyId: companyId,
        userId: user.userId || user.id,
        userName: 'utilisateur'
    };
};

// --- RÉCUPÉRER TOUS LES AUTRES TIERS ---
exports.getAllOthersTiers = async (req, res) => {
    try {
        const { companyId } = getContext(req);
        if (!companyId) return res.status(401).json({ error: "Session invalide." });

        const tiers = await OthersTiersService.getAll(companyId);
        res.json(tiers);
    } catch (err) {
        console.error("❌ Erreur getAllOthersTiers:", err.message);
        res.status(500).json({ error: "Erreur lors de la récupération." });
    }
};

// --- CRÉER UN NOUVEAU TIERS DIVERS ---
exports.createOtherTier = async (req, res) => {
    const context = getContext(req);
    if (!req.body.nom) return res.status(400).json({ error: "Nom obligatoire." });
    if (!context.companyId) return res.status(401).json({ error: "Identification entreprise manquante." });

    try {
        const userContext = { ...req.user, userName: 'utilisateur' };
        const { tierId, nomPropre } = await OthersTiersService.create(req.body, userContext);

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
        console.error("❌ Erreur createOtherTier:", err.message);
        res.status(500).json({ error: err.message });
    }
};

// --- METTRE À JOUR UN TIERS DIVERS ---
exports.updateOtherTier = async (req, res) => {
    const context = getContext(req);
    const { id } = req.params;

    try {
        const userContext = { ...req.user, userName: 'utilisateur' };
        const updated = await OthersTiersService.update(id, req.body, userContext);

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
        console.error("❌ Erreur updateOtherTier:", err.message);
        res.status(500).json({ error: err.message });
    }
};

// --- SUPPRIMER UN TIERS DIVERS ---
exports.deleteOtherTier = async (req, res) => {
    const context = getContext(req);
    const { id } = req.params;

    try {
        const userContext = { ...req.user, userName: 'utilisateur' };
        const deleted = await OthersTiersService.delete(id, userContext);

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
        console.error("❌ Erreur deleteOtherTier:", err.message);
        res.status(500).json({ error: "Impossible de supprimer : ce tiers est probablement utilisé." });
    }
};