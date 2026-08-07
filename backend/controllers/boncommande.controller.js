const orderPayService = require('../services/boncommande.service');
const conversestock = require('../services/conversestock'); 

/**
 * Enregistre un nouveau bon de commande en attente (Sans impacter le stock physique)
 */
const saveBonCommande = async (req, res) => {
    try {
        const companyId = req.user?.company_id || req.user?.companyId;
        const userId = req.user?.userId || req.user?.id;
        
        if (!companyId) {
            return res.status(401).json({ error: "Session invalide ou expirée." });
        }

        const { items, header = {} } = req.body;

        if (!items || items.length === 0) {
            return res.status(400).json({ error: "Le panier de commande est vide." });
        }
        if (!header.fournisseurId || !header.numBon) {
            return res.status(400).json({ error: "Données fournisseur ou Numéro de Bon manquants." });
        }

        const payloadFinal = {
            header: {
                numBon: String(header.numBon).trim(),
                fournisseurId: String(header.fournisseurId),
                fournisseurName: String(header.fournisseur || ''),
                totalFacture: parseFloat(header.totalFacture || header.total_ttc) || 0,
                date: header.date,
                observations: header.observations || ''
            },
            items: items
        };

        const idOrder = await orderPayService.saveBonCommande(payloadFinal, req.user);

        if (req.io) {
            const room = companyId.toString();
            req.io.to(room).emit('DATA_EVENT', { table: 'purchase_orders', action: 'INSERT' });
            req.io.to(room).emit('DATA_EVENT', { table: 'purchase_order_items', action: 'INSERT' });
            req.io.to(room).emit('ORDERS_UPDATED');
        }

        return res.status(201).json({ 
            success: true, 
            id_commande: idOrder, 
            message: "Bon de commande enregistré avec succès." 
        });

    } catch (error) {
        console.error("❌ Erreur saveBonCommande:", error.message);
        return res.status(500).json({ error: error.message });
    }
};

/**
 * Récupère l'historique de tous les bons de commandes d'une entreprise
 */
/**
 * Récupère l'historique de tous les bons de commandes d'une entreprise
 */
const getAllBonsCommande = async (req, res) => {
    try {
        const companyId = req.user?.company_id || req.user?.companyId;
        if (!companyId) {
            return res.status(401).json({ error: "Session invalide ou expirée." });
        }

        // Appel unifié au service SQLite maître (Partie A)
        const rows = await orderPayService.getAllBonsCommande(companyId);
        return res.json(rows);
        
    } catch (error) {
        console.error("❌ Erreur getAllBonsCommande:", error.message);
        return res.status(500).json({ error: error.message });
    }
};

/**
 * Récupère les lignes d'articles d'un bon de commande spécifique
 */
const getBonCommandeDetails = async (req, res) => {
    try {
        const companyId = req.user?.company_id || req.user?.companyId;
        if (!companyId) {
            return res.status(401).json({ error: "Session invalide ou expirée." });
        }

        const { id } = req.params; // Récupère l'ID transmis dans l'URL (/purchase-orders/:id/items)
        if (!id) {
            return res.status(400).json({ error: "Identifiant du bon de commande manquant." });
        }

        // Extraction à chaud depuis la table purchase_order_items (Partie A)
        const items = await orderPayService.getBonCommandeItems(id, companyId);
        return res.json(items);

    } catch (error) {
        console.error("❌ Erreur getBonCommandeDetails:", error.message);
        return res.status(500).json({ error: error.message });
    }
};

// Exposez les modules pour votre fichier de routage Express (routes/...)
module.exports = { saveBonCommande, getAllBonsCommande, getBonCommandeDetails };
