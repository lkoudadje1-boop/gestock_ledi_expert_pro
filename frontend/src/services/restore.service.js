const { getDb } = require('../config/database');
const { CloudProduct, CloudUser, CloudCompany } = require('../models/cloud.model');

/**
 * Restauration manuelle et volontaire des données depuis MongoDB vers SQLite
 * @param {string} companyId - L'ID de l'entreprise à restaurer
 */
const restoreFromCloud = async (companyId) => {
    const db = getDb();
    console.log(`📥 Début de la restauration pour l'entreprise : ${companyId}`);

    try {
        // 1. Restaurer les Produits
        const products = await CloudProduct.find({ company_id: companyId });
        if (products.length > 0) {
            const insertProd = db.prepare(`
                INSERT OR REPLACE INTO products (id, company_id, nom, prixVente, stock_actuel, sync_status)
                VALUES (?, ?, ?, ?, ?, 'synced')
            `);

            db.transaction(() => {
                for (const p of products) {
                    insertProd.run(p.localId, p.company_id, p.nom, p.prixVente, p.stock_actuel);
                }
            })();
            console.log(`✅ ${products.length} produits restaurés.`);
        }

        // 2. Restaurer les Utilisateurs (sans écraser les mots de passe locaux si possible)
        const users = await CloudUser.find({ company_id: companyId });
        if (users.length > 0) {
            const insertUser = db.prepare(`
                INSERT OR REPLACE INTO users (id, company_id, username, email, role, sync_status)
                VALUES (?, ?, ?, ?, ?, 'synced')
            `);

            db.transaction(() => {
                for (const u of users) {
                    insertUser.run(u.localId, u.company_id, u.username, u.email, u.role);
                }
            })();
            console.log(`✅ ${users.length} utilisateurs restaurés.`);
        }

        return { success: true, details: `${products.length} produits et ${users.length} utilisateurs synchronisés.` };

    } catch (err) {
        console.error("❌ Erreur Restauration Cloud:", err.message);
        throw new Error("Échec de la récupération des données : " + err.message);
    }
};

module.exports = { restoreFromCloud };