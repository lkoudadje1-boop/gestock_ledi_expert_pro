// backend/controllers/inventory.controller.js
const InventoryService = require('../services/inventory.service');
const conversestock = require('../services/conversestock'); 

const InventoryController = {
    checkStatus: async (req, res) => {
        const companyId = req.user?.companyId || req.user?.company_id || req.headers['x-company-id'];
        try {
            const status = await InventoryService.checkStatus(companyId);
            return res.json(status);
        } catch (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
    },

    getProductsForInventory: async (req, res) => {
        const companyId = req.user?.companyId || req.user?.company_id || req.headers['x-company-id'];
        try {
            const products = await InventoryService.getProductsForInventory(companyId);
            return res.json({ success: true, products: products });
        } catch (err) {
            console.error("❌ Erreur getProductsForInventory:", err.message);
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
            const id = await InventoryService.createInventory(req.body, userInfo);
            
            if (req.io && userInfo.finalCompanyId) {
                const room = userInfo.finalCompanyId.toString();
                
                req.io.to(room).emit('DATA_EVENT', { 
                    table: 'inventory', 
                    action: 'OPENED', 
                    status: true,
                    message: `Inventaire "${req.body.libelle}" en cours.` 
                });

                req.io.to(room).emit('REFRESH_UI', {
                    module: 'INVENTORY', action: 'OPENED', id: id,
                    message: `Inventaire "${req.body.libelle}" en cours.`
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
            const { stock_reel, product_id, inventory_id } = req.body;
            const chaineSaisieBrute = stock_reel !== undefined && stock_reel !== null ? String(stock_reel).trim() : '0';

            const payloadSecurise = {
                ...req.body,
                stock_reel_brut_saisie: chaineSaisieBrute
            };

            const result = await InventoryService.saveItem(payloadSecurise, userInfo);

            if (req.io && userInfo.finalCompanyId) {
                req.io.to(userInfo.finalCompanyId.toString()).emit('INVENTORY_PROGRESS', {
                    inventory_id: inventory_id,
                    product_id: product_id,
                    stock_reel: result?.stock_reel_pieces !== undefined ? result.stock_reel_pieces : 0,
                    stock_reel_formate: result?.stock_reel_formate || chaineSaisieBrute
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

        const { inventory_id } = req.body;
        if (!inventory_id) {
            return res.status(400).json({ success: false, error: "L'identifiant de l'inventaire (inventory_id) est requis." });
        }
        if (!userInfo.finalCompanyId || !userInfo.finalUserId) {
            return res.status(400).json({ success: false, error: "Informations d'authentification ou d'entreprise manquantes." });
        }

        try {
            const result = await InventoryService.validateInventory(inventory_id, userInfo);

            if (req.io && userInfo.finalCompanyId) {
                const room = userInfo.finalCompanyId.toString();
                
                req.io.to(room).emit('DATA_EVENT', { table: 'inventory', action: 'VALIDATED', status: false });
                req.io.to(room).emit('DATA_EVENT', { table: 'products', action: 'BULK_UPDATE' });

                req.io.to(room).emit('REFRESH_UI', { module: 'INVENTORY', action: 'VALIDATED', message: "Inventaire clôturé." });
                req.io.to(room).emit('REFRESH_UI', { module: 'ARTICLES', action: 'BULK_UPDATE' });
                
                req.io.to(room).emit('INVENTORY_FORCE_RESET', { inventory_id });
            }
            
            return res.json({ success: true, data: result });
        } catch (err) {
            console.error("❌ Erreur validateInventory Controller:", err.message);
            return res.status(500).json({ success: false, error: err.message });
        }
    },

    cancelInventory: async (req, res) => {
        const userInfo = {
            userId: req.user?.id || req.user?.userId || req.body.user_id,
            userName: 'user',
            companyId: req.user?.companyId || req.user?.company_id || req.body.company_id
        };

        if (!req.body.inventory_id) return res.status(400).json({ success: false, error: "ID Inventaire manquant" });

        try {
            await InventoryService.cancelInventory(req.body.inventory_id, userInfo);

            if (req.io && userInfo.companyId) {
                const room = userInfo.companyId.toString();

                setTimeout(() => {
                    req.io.to(room).emit('DATA_EVENT', { table: 'inventory', action: 'CANCELLED', status: false });
                    req.io.to(room).emit('REFRESH_UI', {
                        module: 'INVENTORY', action: 'CANCELLED',
                        message: "Inventaire annulé."
                    });
                }, 200);
            }
            return res.json({ success: true, message: "Inventaire annulé avec succès" });
        } catch (err) {
            console.error("❌ Erreur cancelInventory Controller:", err.message);
            return res.status(500).json({ success: false, error: err.message });
        }
    },

    getSessions: async (req, res) => {
        const companyId = req.user?.companyId || req.user?.company_id || req.headers['x-company-id'];
        if (!companyId) return res.status(401).json({ error: "Entreprise non identifiée" });

        try {
            const sessions = await InventoryService.getSessions(companyId);
            return res.json({ success: true, data: sessions });
        } catch (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
    },

    getDetails: async (req, res) => {
        const companyId = req.user?.companyId || req.user?.company_id || req.headers['x-company-id'];
        if (!companyId) return res.status(401).json({ error: "Entreprise non identifiée" });

        try {
            const details = await InventoryService.getDetails(companyId);
            return res.json({ success: true, data: details });
        } catch (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
    },

    getActiveInventory: async (req, res) => {
        const companyId = req.user?.companyId || req.user?.company_id || req.headers['x-company-id'];
        if (!companyId) return res.status(401).json({ error: "Entreprise non identifiée" });

        try {
            const data = await InventoryService.getActiveInventory(companyId);
            if (!data) return res.json({ success: false, message: "Aucun inventaire en cours" });
            return res.json({ success: true, ...data });
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
            await InventoryService.archiveSession(id, secureCompanyId, userInfo);
            return res.json({ success: true, message: "Session archivée." });
        } catch (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
    },

    getDetailsById: async (req, res) => {
        try {
            const data = await InventoryService.getDetailsById(req.params.id_inventaire);
            return res.json({ success: true, data });
        } catch (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
    }
};

module.exports = InventoryController;