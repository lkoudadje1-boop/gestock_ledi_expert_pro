const InventoryService = require('../services/inventory.service');
const conversestock = require('../services/conversestock'); // 🚀 IMPORTATION DU MODULE LOGISTIQUE CENTRALISÉ MAÎTRE

const InventoryController = {
  

    checkStatus: async (req, res) => {
        const companyId = req.user?.companyId || req.user?.company_id || req.headers['x-company-id'];
        try {
            const status = await InventoryService.checkStatus(companyId);
            res.json(status);
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    },

    getProductsForInventory: async (req, res) => {
        const companyId = req.user?.companyId || req.user?.company_id || req.headers['x-company-id'];
        try {
            const products = await InventoryService.getProductsForInventory(companyId);
            
            // 🎯 HARMONISATION : Renvoi structuré conforme aux attentes du fetch dans React
            return res.json({ success: true, products: products });
        } catch (err) {
            console.error("❌ Erreur getProductsForInventory:", err.message);
            return res.status(500).json({ success: false, error: err.message });
        }
    },

    createInventory: async (req, res) => {
        const userInfo = {
            userId: req.user?.userId || req.user?.id || req.body.user_id,
            userName: req.user?.username || 'System',
            finalCompanyId: req.user?.companyId || req.user?.company_id || req.body.company_id
        };

        try {
            const id = await InventoryService.createInventory(req.body, userInfo);
            
            if (req.io && userInfo.finalCompanyId) {
                const room = userInfo.finalCompanyId.toString();
                
                // 🔥 SIGNAL UNIVERSEL : On informe que l'inventaire est OUVERT
                req.io.to(room).emit('DATA_EVENT', { 
                    table: 'inventory', 
                    action: 'OPENED', 
                    status: true,
                    message: `Inventaire "${req.body.libelle}" en cours.` 
                });

                // Compatibilité REFRESH_UI
                req.io.to(room).emit('REFRESH_UI', {
                    module: 'INVENTORY', action: 'OPENED', id: id,
                    message: `Inventaire "${req.body.libelle}" en cours.`
                });
            }
            res.json({ success: true, message: "Inventaire ouvert", id });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    },

    saveItem: async (req, res) => {
        const userInfo = {
            finalUserId: req.user?.userId || req.user?.id || req.body.user_id,
            finalCompanyId: req.user?.companyId || req.user?.company_id || req.body.company_id
        };

        try {
            const { stock_reel, product_id, inventory_id } = req.body;

            // 🛡️ PROTECTION SÉCURISÉE ANTI-LITIGE LOGISTIQUE :
            // On s'assure que la chaîne textuelle brute saisie (ex: "21 + 7") est nettoyée 
            // et transmise telle quelle au service pour éviter que la couche HTTP n'altère le format.
            const chaineSaisieBrute = stock_reel !== undefined && stock_reel !== null ? String(stock_reel).trim() : '0';

            const payloadSecurise = {
                ...req.body,
                stock_reel_brut_saisie: chaineSaisieBrute
            };

            const result = await InventoryService.saveItem(payloadSecurise, userInfo);

            if (req.io && userInfo.finalCompanyId) {
                // 🚀 DIFFUSION ALIGNÉE : On émet à l'interface les pièces unitaires natives de détail 
                // calculées sans ambiguïté par le service, ainsi que sa chaîne textuelle formatée.
                req.io.to(userInfo.finalCompanyId.toString()).emit('INVENTORY_PROGRESS', {
                    inventory_id: inventory_id,
                    product_id: product_id,
                    stock_reel: result?.stock_reel_pieces !== undefined ? result.stock_reel_pieces : 0,
                    stock_reel_formate: result?.stock_reel_formate || chaineSaisieBrute
                });
            }
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    },

    validateInventory: async (req, res) => {
        // 1. Extraction et centralisation des informations utilisateur
        const userInfo = {
            finalCompanyId: req.user?.companyId || req.user?.company_id || req.body.company_id,
            finalUserId: req.user?.userId || req.user?.id || req.body.user_id,
            finalUserName: req.user?.username || 'System'
        };

        // 🛡️ SÉCURITÉ : Vérification de la présence des données obligatoires
        const { inventory_id } = req.body;
        if (!inventory_id) {
            return res.status(400).json({ success: false, error: "L'identifiant de l'inventaire (inventory_id) est requis." });
        }
        if (!userInfo.finalCompanyId || !userInfo.finalUserId) {
            return res.status(400).json({ success: false, error: "Informations d'authentification ou d'entreprise manquantes." });
        }

        try {
            // 2. Exécution stricte et conforme de votre service d'origine
            const result = await InventoryService.validateInventory(inventory_id, userInfo);

            // 3. Diffusion des signaux WebSockets (Inchangée et optimisée)
            if (req.io && userInfo.finalCompanyId) {
                const room = userInfo.finalCompanyId.toString();
                
                // 🔥 SIGNALS UNIVERSELS ORIGINAUX CONSERVÉS
                req.io.to(room).emit('DATA_EVENT', { table: 'inventory', action: 'VALIDATED', status: false });
                req.io.to(room).emit('DATA_EVENT', { table: 'products', action: 'BULK_UPDATE' });

                // Signaux de compatibilité UI
                req.io.to(room).emit('REFRESH_UI', { module: 'INVENTORY', action: 'VALIDATED', message: "Inventaire clôturé." });
                req.io.to(room).emit('REFRESH_UI', { module: 'ARTICLES', action: 'BULK_UPDATE' });
                
                // 🚀 LE SÉCURISATEUR GRAPHIC : Signal d'ordre direct pour forcer le rafraîchissement local React
                req.io.to(room).emit('INVENTORY_FORCE_RESET', { inventory_id });
            }
            
            // 4. Renvoi de la réponse HTTP de validation réussie
            return res.json({ success: true, data: result });
            
        } catch (err) {
            console.error("❌ Erreur validateInventory Controller:", err.message);
            return res.status(500).json({ success: false, error: err.message });
        }
    },


    cancelInventory: async (req, res) => {
        const userInfo = {
            userId: req.user?.id || req.user?.userId || req.body.user_id,
            userName: req.user?.username || 'System',
            companyId: req.user?.companyId || req.user?.company_id || req.body.company_id
        };

        if (!req.body.inventory_id) return res.status(400).json({ success: false, error: "ID Inventaire manquant" });

        try {
            await InventoryService.cancelInventory(req.body.inventory_id, userInfo);

            // 🚀 COUPLAGE ASYNCHRONE DE SÉCURITÉ :
            // On laisse 200ms à SQLite pour exécuter complètement les requêtes de suppression (DELETE)
            // avant d'émettre le signal WebSockets qui réinitialise l'affichage de l'interface utilisateur.
            if (req.io && userInfo.companyId) {
                const room = userInfo.companyId.toString();

                setTimeout(() => {
                    // 🔥 SIGNAL UNIVERSEL : Annulation prise en compte par le système
                    req.io.to(room).emit('DATA_EVENT', { table: 'inventory', action: 'CANCELLED', status: false });

                    // Compatibilité
                    req.io.to(room).emit('REFRESH_UI', {
                        module: 'INVENTORY', action: 'CANCELLED',
                        message: "Inventaire annulé."
                    });
                    console.log("📢 [CONTROLLER INVENTORY] Signaux d'annulation émis après purge SQLite.");
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
            res.json({ success: true, ...data });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    },

    archiveSession: async (req, res) => {
        const { id } = req.params;
        const secureCompanyId = req.user?.companyId?.toString() || req.user?.company_id?.toString() || req.headers['x-company-id'];
        const userInfo = { userId: req.user?.userId || req.user?.id, userName: req.user?.username };

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

// 🏁 EXPORTATION CENTRALISÉE ET UNIFIÉE DU MODULE DU CONTRÔLEUR D'INVENTAIRE
module.exports = InventoryController;
