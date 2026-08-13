// backend/services/stock.service.js
const { CloudProduct } = require('../models/cloud.model');

/**
 * Ajoute de la quantité au stock (Réception / Retour) avec traçabilité Cloud et multi-tenant
 */
const addStock = async (productId, qte, companyId) => {
    try {
        const cid = companyId.toString();
        const pid = productId.toString();
        const quantity = Number(qte) || 0;

        const result = await CloudProduct.updateOne(
            { localId: pid, company_id: cid },
            { 
                $inc: { stock_actuel: quantity }, 
                $set: { 
                    sync_status: 'synced', 
                    updated_at: new Date() 
                } 
            }
        );

        if (result.matchedCount === 0) {
            throw new Error(`Produit introuvable pour l'ID : ${pid}`);
        }

        return true;
    } catch (err) {
        throw new Error("Erreur lors de l'ajout de stock : " + err.message);
    }
};

/**
 * Retire de la quantité au stock (Vente / Perte) avec traçabilité Cloud et multi-tenant
 */
const removeStock = async (productId, qte, companyId) => {
    try {
        const cid = companyId.toString();
        const pid = productId.toString();
        const quantity = Number(qte) || 0;

        // Optionnel : vérifier si le stock est suffisant avant de décrémenter
        const product = await CloudProduct.findOne({ localId: pid, company_id: cid }).lean();
        if (!product) {
            throw new Error(`Produit introuvable pour l'ID : ${pid}`);
        }

        const currentStock = Number(product.stock_actuel || 0);
        if (currentStock < quantity) {
            throw new Error(`Stock insuffisant pour le produit [${product.nom || pid}]. Actuel: ${currentStock}, Demandé: ${quantity}`);
        }

        await CloudProduct.updateOne(
            { localId: pid, company_id: cid },
            { 
                $inc: { stock_actuel: -quantity }, 
                $set: { 
                    sync_status: 'synced', 
                    updated_at: new Date() 
                } 
            }
        );

        return true;
    } catch (err) {
        throw new Error("Erreur lors du retrait de stock : " + err.message);
    }
};

/**
 * Récupère le stock actuel d'un produit avec isolation multi-tenant
 */
const getStock = async (productId, companyId) => {
    try {
        const cid = companyId.toString();
        const pid = productId.toString();

        const product = await CloudProduct.findOne({ 
            localId: pid, 
            company_id: cid 
        }).select('stock_actuel').lean();

        return product ? Number(product.stock_actuel || 0) : 0;
    } catch (err) {
        throw new Error("Erreur lors de la lecture du stock : " + err.message);
    }
};

module.exports = {
    addStock,
    removeStock,
    getStock
};