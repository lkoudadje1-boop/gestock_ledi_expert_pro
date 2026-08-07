const { getDb } = require('../config/database');

/**
 * Ajoute de la quantité au stock (Réception / Retour) avec traçabilité Cloud et multi-tenant
 */
const addStock = async (productId, qte, companyId) => {
    const db = getDb();
    try {
        db.transaction(() => {
            db.prepare(`
                UPDATE products 
                SET stock_actuel = stock_actuel + ?, 
                    sync_status = 'pending',
                    updated_at = CURRENT_TIMESTAMP 
                WHERE id = ? AND company_id = ?
            `).run(qte, productId, companyId);

            db.prepare(`
                INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
                VALUES ('products', ?, 'UPDATE', ?)
            `).run(productId, companyId);
        })();

        return true;
    } catch (err) {
        throw new Error("Erreur lors de l'ajout de stock : " + err.message);
    }
};

/**
 * Retire de la quantité au stock (Vente / Perte) avec traçabilité Cloud et multi-tenant
 */
const removeStock = async (productId, qte, companyId) => {
    const db = getDb();
    try {
        db.transaction(() => {
            db.prepare(`
                UPDATE products 
                SET stock_actuel = stock_actuel - ?, 
                    sync_status = 'pending',
                    updated_at = CURRENT_TIMESTAMP 
                WHERE id = ? AND company_id = ?
            `).run(qte, productId, companyId);

            db.prepare(`
                INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
                VALUES ('products', ?, 'UPDATE', ?)
            `).run(productId, companyId);
        })();

        return true;
    } catch (err) {
        throw new Error("Erreur lors du retrait de stock : " + err.message);
    }
};

/**
 * Récupère le stock actuel d'un produit avec isolation multi-tenant
 */
const getStock = async (productId, companyId) => {
    const db = getDb();
    try {
        const row = db.prepare("SELECT stock_actuel FROM products WHERE id = ? AND company_id = ?").get(productId, companyId);
        return row ? row.stock_actuel : 0;
    } catch (err) {
        throw new Error("Erreur lors de la lecture du stock : " + err.message);
    }
};

module.exports = {
    addStock,
    removeStock,
    getStock
};