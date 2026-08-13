// backend/controllers/fournisseur.controller.js
const supplierService = require('../services/fournisseur.service');

// --- RÉCUPÉRER TOUS LES FOURNISSEURS ---
exports.getAllSuppliers = async (req, res) => {
    try {
        const companyId = req.user?.companyId || req.user?.company_id;
        const suppliers = await supplierService.getAllSuppliers(companyId);
        return res.json(suppliers);
    } catch (err) {
        console.error("❌ Erreur getAllSuppliers:", err);
        return res.status(500).json({ error: "Erreur lors de la récupération." });
    }
};

// --- CRÉER UN NOUVEAU FOURNISSEUR ---
exports.createSupplier = async (req, res) => {
    try {
        const userContext = { 
            ...req.user, 
            userName: 'user' // Respect strict de la consigne [2026-02-08]
        };

        const supplierId = await supplierService.createSupplier(req.body, userContext);

        // 🔥 SIGNAL UNIVERSEL : Nouveau fournisseur créé
        if (req.io && req.user.companyId) {
            req.io.to(req.user.companyId.toString()).emit('DATA_EVENT', { 
                table: 'suppliers', 
                action: 'INSERT',
                id: supplierId 
            });
        }

        return res.status(201).json({ success: true, id: supplierId });
    } catch (err) {
        console.error("❌ Erreur createSupplier:", err);
        return res.status(500).json({ error: err.message });
    }
};

// --- METTRE À JOUR UN FOURNISSEUR ---
exports.updateSupplier = async (req, res) => {
    try {
        const userContext = { 
            ...req.user, 
            userName: 'user' 
        };

        const success = await supplierService.updateSupplier(req.params.id, req.body, userContext);

        // 🔥 SIGNAL UNIVERSEL : Fournisseur mis à jour
        if (req.io && req.user.companyId && success) {
            req.io.to(req.user.companyId.toString()).emit('DATA_EVENT', { 
                table: 'suppliers', 
                action: 'UPDATE',
                id: req.params.id 
            });
        }

        return res.json({ success });
    } catch (err) {
        console.error("❌ Erreur updateSupplier:", err);
        return res.status(500).json({ error: err.message });
    }
};

// --- METTRE À JOUR LE STATUT (ARCHIVAGE) ---
exports.updateStatus = async (req, res) => {
    try {
        const { is_active } = req.body;
        const userContext = { 
            ...req.user, 
            userName: 'user' 
        };

        const success = await supplierService.updateStatus(req.params.id, is_active, userContext);

        // 🔥 SIGNAL UNIVERSEL : Statut changé
        if (req.io && req.user.companyId && success) {
            req.io.to(req.user.companyId.toString()).emit('DATA_EVENT', { 
                table: 'suppliers', 
                action: 'STATUS_CHANGE',
                id: req.params.id,
                is_active: is_active
            });
        }

        return res.json({ success });
    } catch (err) {
        console.error("❌ Erreur updateStatus:", err);
        return res.status(500).json({ error: err.message });
    }
};

// --- SUPPRIMER UN FOURNISSEUR ---
exports.deleteSupplier = async (req, res) => {
    try {
        const userContext = { 
            ...req.user, 
            userName: 'user' 
        };

        const success = await supplierService.deleteSupplier(req.params.id, userContext);

        // 🔥 SIGNAL UNIVERSEL : Fournisseur supprimé
        if (req.io && req.user.companyId && success) {
            req.io.to(req.user.companyId.toString()).emit('DATA_EVENT', { 
                table: 'suppliers', 
                action: 'DELETE',
                id: req.params.id 
            });
        }

        return res.json({ success });
    } catch (err) {
        console.error("❌ Erreur deleteSupplier:", err);
        return res.status(500).json({ error: err.message });
    }
};