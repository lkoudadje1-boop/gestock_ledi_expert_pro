// backend/controllers/inventairePackage.controller.js
const PackagingInventoryService = require('../services/inventairePackage.service');

const PackagingInventoryController = {
    getActiveInventory: async (req, res) => {
        const companyId = req.user?.companyId || req.user?.company_id || req.headers['x-company-id'];
        if (!companyId) return res.status(401).json({ error: "Entreprise non identifiée" });

        try {
            const data = await PackagingInventoryService.getActiveInventory(companyId);
            if (!data) return res.json({ success: false, message: "Aucun inventaire d'emballage en cours" });
            return res.json({ success: true, ...data });
        } catch (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
    },

    checkStatus: async (req, res) => {
        const companyId = req.user?.companyId || req.user?.company_id || req.headers['x-company-id'];
        try {
            const status = await PackagingInventoryService.checkStatus(companyId);
            return res.json(status);
        } catch (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
    },

    getPackagesForInventory: async (req, res) => {
        const companyId = req.user?.companyId || req.user?.company_id || req.headers['x-company-id'];
        try {
            const packages = await PackagingInventoryService.getPackagesForInventory(companyId);
            return res.json(packages);
        } catch (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
    },

    createInventory: async (req, res) => {
        const userInfo = {
            userId: req.user?.userId || req.user?.id || req.body.user_id,
            userName: 'user', // Respect strict consigne [2026-02-08]
            finalCompanyId: req.user?.companyId || req.user?.company_id || req.body.company_id
        };

        try {
            const id = await PackagingInventoryService.createInventory(req.body, userInfo);
            
            if (req.io && userInfo.finalCompanyId) {
                const room = userInfo.finalCompanyId.toString();
                req.io.to(room).emit('DATA_EVENT', { 
                    table: 'packaging_inventory', 
                    action: 'OPENED', 
                    status: true,
                    message: `Inventaire emballage "${req.body.libelle}" en cours.` 
                });

                req.io.to(room).emit('REFRESH_UI', {
                    module: 'PACKAGING_INVENTORY', action: 'OPENED', id: id,
                    message: `Inventaire emballage "${req.body.libelle}" en cours.`
                });
            }
            return res.json({ success: true, message: "Inventaire ouvert", id });
        } catch (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
    },

    saveItem: async (req, res) => {
        const userInfo = {
            finalUserId: req.user?.userId || req.user?.id || req.body.user_id,
            finalCompanyId: req.user?.companyId || req.user?.company_id || req.body.company_id
        };

        try {
            await PackagingInventoryService.saveItem(req.body, userInfo);

            if (req.io && userInfo.finalCompanyId) {
                req.io.to(userInfo.finalCompanyId.toString()).emit('PACKAGING_INVENTORY_PROGRESS', {
                    inventory_id: req.body.inventory_id,
                    packaging_id: req.body.packaging_id,
                    stock_reel: req.body.stock_reel
                });
            }
            return res.json({ success: true });
        } catch (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
    },

    validateInventory: async (req, res) => {
        const userInfo = {
            finalCompanyId: req.user?.companyId || req.user?.company_id || req.body.company_id,
            finalUserId: req.user?.userId || req.user?.id || req.body.user_id,
            finalUserName: 'user'
        };

        try {
            const result = await PackagingInventoryService.validateInventory(req.body.inventory_id, userInfo);

            if (req.io && userInfo.finalCompanyId) {
                const room = userInfo.finalCompanyId.toString();
                req.io.to(room).emit('DATA_EVENT', { table: 'packaging_inventory', action: 'VALIDATED', status: false });
                req.io.to(room).emit('DATA_EVENT', { table: 'packaging', action: 'BULK_UPDATE' });
                req.io.to(room).emit('REFRESH_UI', { module: 'PACKAGING_INVENTORY', action: 'VALIDATED', message: "Inventaire emballage clôturé." });
                req.io.to(room).emit('REFRESH_UI', { module: 'PACKAGING', action: 'BULK_UPDATE' });
            }
            return res.json({ success: true, data: result });
        } catch (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
    },

    cancelInventory: async (req, res) => {
        const userInfo = {
            userId: req.user?.userId || req.user?.id || req.body.user_id,
            userName: 'user',
            companyId: req.user?.companyId || req.user?.company_id || req.body.company_id
        };

        if (!req.body.inventory_id) return res.status(400).json({ success: false, error: "ID Inventaire manquant" });

        try {
            await PackagingInventoryService.cancelInventory(req.body.inventory_id, userInfo);

            if (req.io && userInfo.companyId) {
                const room = userInfo.companyId.toString();
                req.io.to(room).emit('DATA_EVENT', { table: 'packaging_inventory', action: 'CANCELLED', status: false });
                req.io.to(room).emit('REFRESH_UI', {
                    module: 'PACKAGING_INVENTORY', action: 'CANCELLED',
                    message: "Inventaire emballages annulé."
                });
            }
            return res.json({ success: true, message: "Inventaire annulé" });
        } catch (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
    },

    getSessions: async (req, res) => {
        const companyId = req.user?.companyId || req.user?.company_id || req.headers['x-company-id'];
        if (!companyId) return res.status(401).json({ error: "Entreprise non identifiée" });

        try {
            const sessions = await PackagingInventoryService.getSessions(companyId);
            return res.json({ success: true, data: sessions });
        } catch (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
    },

    getDetails: async (req, res) => {
        const companyId = req.user?.companyId || req.user?.company_id || req.headers['x-company-id'];
        try {
            const details = await PackagingInventoryService.getDetails(companyId);
            return res.json({ success: true, data: details });
        } catch (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
    },

    archiveSession: async (req, res) => {
        const { id } = req.params;
        const secureCompanyId = req.user?.companyId?.toString() || req.user?.company_id?.toString() || req.headers['x-company-id'];
        const userInfo = { userId: req.user?.userId || req.user?.id, userName: 'user' };

        if (!id || !secureCompanyId) return res.status(400).json({ success: false, error: "Données manquantes" });

        try {
            await PackagingInventoryService.archiveSession(id, secureCompanyId, userInfo);
            return res.json({ success: true, message: "Session archivée." });
        } catch (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
    },

    historiqueFluxEmbalage: async (req, res) => {
        const companyId = req.user?.companyId || req.user?.company_id || req.headers['x-company-id'];
        
        if (!companyId) return res.status(401).json({ error: "Entreprise non identifiée" });

        try {
            const data = await PackagingInventoryService.historiqueFluxEmbalage(companyId);
            return res.json({ success: true, data: data || [] });
        } catch (err) {
            console.error("ERREUR DANS LE SERVICE :", err);
            return res.status(500).json({ success: false, error: err.message });
        }
    },

    getDetailsById: async (req, res) => {
        try {
            const data = await PackagingInventoryService.getDetailsById(req.params.id_inventaire);
            return res.json({ success: true, data: data || [] });
        } catch (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
    }
};

module.exports = PackagingInventoryController;