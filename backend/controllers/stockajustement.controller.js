const StockAdjustmentService = require('../services/stockajustement.service');

const StockAdjustmentController = {
    /**
     * Récupère les produits éligibles aux mouvements d'ajustements
     */
    getProducts: async (req, res) => {
        const companyId = (req.user?.companyId || req.user?.company_id || req.headers['x-company-id'])?.toString();
        try {
            const products = await StockAdjustmentService.getProductsForAdjustment(companyId);
            return res.json({ success: true, products });
        } catch (err) {
            console.error("❌ Erreur StockAdjustmentController.getProducts :", err.message);
            return res.status(500).json({ success: false, error: err.message });
        }
    },

    /**
     * Crée et valide un nouvel ajustement
     */
    create: async (req, res) => {
        // 🛡️ SÉCURISATION DU CONTEXTE : Alignement strict avec le format fonctionnel des ventes
        const secureUserId = (req.user?.userId || req.user?.id || req.user?.id_utilisateur)?.toString();
        const secureCompanyId = (req.user?.companyId || req.user?.company_id || req.headers['x-company-id'])?.toString();
        const userName = req.user?.username || req.user?.nom || 'Utilisateur';

        const { libelle, type_ajustement, motif, entrepot_depart_id, entrepot_arrivee_id, items } = req.body;

        if (!secureUserId || !secureCompanyId) {
            return res.status(401).json({ success: false, error: "Utilisateur non authentifié ou session expirée." });
        }

        if (!libelle || !type_ajustement || !items || !items.length) {
            return res.status(400).json({ success: false, error: "Données requises incomplètes." });
        }

        try {
            // Unification de la structure de l'objet de contexte attendu par le service révisé
            const userContext = { secureUserId, secureCompanyId, userName };

            // ✅ APPEL AU SERVICE AVEC L'OBJET CONTEXTE SÉCURISÉ
            const result = await StockAdjustmentService.createAdjustment(
                { libelle, type_ajustement, motif, entrepot_depart_id, entrepot_arrivee_id },
                items,
                userContext
            );

            // 🚀 ÉMISSION SOCKET (Optionnelle mais recommandée si req.io est dispo)
            if (req.io) {
                const room = secureCompanyId;
                req.io.to(room).emit('DATA_EVENT', { table: 'stock_adjustments', action: 'INSERT' });
                req.io.to(room).emit('STOCK_UPDATED');
                req.io.to(room).emit('REFRESH_STOCK', { reason: 'STOCK_ADJUSTMENT' });
            }

            return res.json(result);
        } catch (err) {
            console.error("❌ Erreur StockAdjustmentController.create :", err.message);
            return res.status(400).json({ success: false, error: err.message });
        }
    },

    /**
     * Récupère l'historique complet des ajustements
     */
    getHistory: async (req, res) => {
        const companyId = (req.user?.companyId || req.user?.company_id || req.headers['x-company-id'])?.toString();
        try {
            const history = await StockAdjustmentService.getAdjustmentsHistory(companyId);
            return res.json({ success: true, data: history });
        } catch (err) {
            console.error("❌ Erreur StockAdjustmentController.getHistory :", err.message);
            return res.status(500).json({ success: false, error: err.message });
        }
    },

    /**
     * Récupère les lignes de détails d'une session d'ajustement spécifique
     */
    getDetails: async (req, res) => {
        const companyId = (req.user?.companyId || req.user?.company_id || req.headers['x-company-id'])?.toString();
        const { id } = req.params;
        try {
            const details = await StockAdjustmentService.getAdjustmentDetails(id, companyId);
            return res.json({ success: true, data: details });
        } catch (err) {
            console.error("❌ Erreur StockAdjustmentController.getDetails :", err.message);
            return res.status(500).json({ success: false, error: err.message });
        }
    },

    /**
     * 🎯 Annule un ajustement complet (En-tête et toutes ses lignes actives)
     */
    cancelWhole: async (req, res) => {
        const secureUserId = (req.user?.userId || req.user?.id || req.user?.id_utilisateur)?.toString();
        const secureCompanyId = (req.user?.companyId || req.user?.company_id || req.headers['x-company-id'])?.toString();
        const userName = req.user?.username || req.user?.nom || 'Utilisateur';
        const { id } = req.params;

        if (!secureUserId || !secureCompanyId) {
            return res.status(401).json({ success: false, error: "Utilisateur non authentifié." });
        }

        try {
            const userContext = { secureUserId, secureCompanyId, userName };
            const result = await StockAdjustmentService.cancelWholeAdjustment(id, userContext);

            // 🚀 Émission en temps réel pour notifier les clients React
            if (req.io) {
                req.io.to(secureCompanyId).emit('DATA_EVENT', { table: 'stock_adjustments', action: 'UPDATE', id });
                req.io.to(secureCompanyId).emit('STOCK_UPDATED');
            }

            return res.json({ success: true, message: "Ajustement entièrement annulé.", data: result });
        } catch (err) {
            console.error("❌ Erreur StockAdjustmentController.cancelWhole :", err.message);
            return res.status(400).json({ success: false, error: err.message });
        }
    },

    /**
     * 🎯 Annule une seule ligne spécifique au sein d'un ajustement
     */
    cancelItem: async (req, res) => {
        const secureUserId = (req.user?.userId || req.user?.id || req.user?.id_utilisateur)?.toString();
        const secureCompanyId = (req.user?.companyId || req.user?.company_id || req.headers['x-company-id'])?.toString();
        const userName = req.user?.username || req.user?.nom || 'Utilisateur';
        const { id, itemId } = req.params;

        if (!secureUserId || !secureCompanyId) {
            return res.status(401).json({ success: false, error: "Utilisateur non authentifié." });
        }

        try {
            const userContext = { secureUserId, secureCompanyId, userName };
            const result = await StockAdjustmentService.cancelAdjustmentItem(id, itemId, userContext);

            if (req.io) {
                req.io.to(secureCompanyId).emit('DATA_EVENT', { table: 'stock_adjustment_items', action: 'UPDATE', id: itemId });
                req.io.to(secureCompanyId).emit('STOCK_UPDATED');
            }

            return res.json({
                success: true,
                message: result.enteteAnnulee 
                    ? "Ligne annulée. L'en-tête global passe aussi en ANNULE car toutes ses lignes le sont." 
                    : "Ligne annulée avec succès.",
                data: result
            });
        } catch (err) {
            console.error("❌ Erreur StockAdjustmentController.cancelItem :", err.message);
            return res.status(400).json({ success: false, error: err.message });
        }
    }
};

module.exports = StockAdjustmentController;
