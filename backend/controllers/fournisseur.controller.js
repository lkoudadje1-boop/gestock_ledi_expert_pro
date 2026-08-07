const supplierService = require('../services/fournisseur.service');

// --- RÉCUPÉRER TOUS LES FOURNISSEURS ---
exports.getAllSuppliers = async (req, res) => {
    try {
        const suppliers = await supplierService.getAllSuppliers(req.user.companyId);
        res.json(suppliers);
    } catch (err) {
        res.status(500).json({ error: "Erreur lors de la récupération." });
    }
};

// --- CRÉER UN NOUVEAU FOURNISSEUR ---
exports.createSupplier = async (req, res) => {
    try {
        const supplierId = await supplierService.createSupplier(req.body, req.user, req.io);

        // 🔥 SIGNAL UNIVERSEL : Nouveau fournisseur créé
        if (req.io && req.user.companyId) {
            req.io.to(req.user.companyId.toString()).emit('DATA_EVENT', { 
                table: 'suppliers', 
                action: 'INSERT',
                id: supplierId 
            });
        }

        res.status(201).json({ success: true, id: supplierId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// --- METTRE À JOUR UN FOURNISSEUR ---
exports.updateSupplier = async (req, res) => {
    try {
        const success = await supplierService.updateSupplier(req.params.id, req.body, req.user, req.io);

        // 🔥 SIGNAL UNIVERSEL : Fournisseur mis à jour
        if (req.io && req.user.companyId && success) {
            req.io.to(req.user.companyId.toString()).emit('DATA_EVENT', { 
                table: 'suppliers', 
                action: 'UPDATE',
                id: req.params.id 
            });
        }

        res.json({ success });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// --- METTRE À JOUR LE STATUT (ARCHIVAGE) ---
exports.updateStatus = async (req, res) => {
    try {
        const { is_active } = req.body;
        const success = await supplierService.updateStatus(req.params.id, is_active, req.user, req.io);

        // 🔥 SIGNAL UNIVERSEL : Statut changé
        if (req.io && req.user.companyId && success) {
            req.io.to(req.user.companyId.toString()).emit('DATA_EVENT', { 
                table: 'suppliers', 
                action: 'STATUS_CHANGE',
                id: req.params.id,
                is_active: is_active
            });
        }

        res.json({ success });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// --- SUPPRIMER UN FOURNISSEUR ---
exports.deleteSupplier = async (req, res) => {
    try {
        const success = await supplierService.deleteSupplier(req.params.id, req.user, req.io);

        // 🔥 SIGNAL UNIVERSEL : Fournisseur supprimé
        if (req.io && req.user.companyId && success) {
            req.io.to(req.user.companyId.toString()).emit('DATA_EVENT', { 
                table: 'suppliers', 
                action: 'DELETE',
                id: req.params.id 
            });
        }

        res.json({ success });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};