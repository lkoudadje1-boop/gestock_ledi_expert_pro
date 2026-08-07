// backend/services/sync-to-cloud.service.js
const mongoose = require('mongoose');
const { getDb } = require('../config/database');
const { CloudUser, CloudCompany, CloudProduct } = require('../models/cloud.model');

require('dotenv').config();

const connectCloud = async () => {
    if (mongoose.connection.readyState === 1) return;
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('☁️ Connecté au Cloud MongoDB');
    } catch (err) {
        console.error('❌ Connexion Cloud échouée :', err.message);
        throw err;
    }
};

/**
 * Pousse l'intégralité des données locales vers le Cloud
 */
const pushLocalToCloud = async (companyId) => {
    if (!companyId) throw new Error('companyId est obligatoire pour la synchronisation');

    const db = getDb();
    await connectCloud();

    console.log(`🔥 [SYNC] Miroir intelligent Cloud pour l'entreprise ID: ${companyId}`);

    try {
        /* 1. LECTURE DES DONNÉES LOCALES */
        const localCompany = db.prepare("SELECT * FROM companies WHERE id = ?").get(companyId);
        const localUsers = db.prepare("SELECT * FROM users WHERE company_id = ?").all(companyId);
        const localProducts = db.prepare("SELECT * FROM products WHERE company_id = ?").all(companyId);

        if (!localCompany) throw new Error("Entreprise locale introuvable.");

        /* 2. PLUS DE DELETE ! On utilise l'UPSERT (Update or Insert) */

        // A. Synchronisation Entreprise
        const companyData = { ...localCompany, localId: localCompany.id };
        delete companyData.id;
        await CloudCompany.findOneAndUpdate(
            { localId: companyId },
            companyData,
            { upsert: true }
        );

        // B. Synchronisation Utilisateurs (Un par un pour fusionner)
        for (const u of localUsers) {
            const doc = { ...u, localId: u.id };
            delete doc.id;
            if (doc.permissions) {
                try { doc.permissions = typeof doc.permissions === 'string' ? JSON.parse(doc.permissions) : doc.permissions; } 
                catch(e) { doc.permissions = {}; }
            }
            await CloudUser.findOneAndUpdate(
                { localId: u.id, company_id: companyId },
                doc,
                { upsert: true }
            );
        }

        // C. Synchronisation Produits (Le cœur du miroir avec l'exhaustivité des champs logistiques & commerciaux)
        for (const p of localProducts) {
            const doc = { ...p, localId: p.id };
            delete doc.id;
            
            // Sécurisation numérique des principaux indicateurs
            doc.prixVente = parseFloat(doc.prixVente) || 0;
            doc.stock_actuel = parseFloat(doc.stock_actuel) || 0;
            doc.cmp = parseFloat(doc.cmp) || 0;
            doc.stockAlerte = parseFloat(doc.stockAlerte) || 0;
            doc.taxeTaux = parseFloat(doc.taxeTaux) || 0;

            // Sécurisation des seuils et montants de remises/paliers (r1 à r4)
            ['r1Seuil', 'r1Montant', 'r1Taux', 'r2Seuil', 'r2Montant', 'r2Taux', 'r3Multiple', 'r3Montant', 'r3Taux', 'r4A_Max', 'r4A_Montant', 'r4A_Taux', 'r4B_Max', 'r4B_Montant', 'r4B_Taux', 'r4C_Montant', 'r4C_Taux'].forEach(field => {
                if (doc[field] !== undefined && doc[field] !== null) {
                    doc[field] = parseFloat(doc[field]) || 0;
                }
            });

            await CloudProduct.findOneAndUpdate(
                { localId: p.id, company_id: companyId },
                doc,
                { upsert: true }
            );
        }

        /* 3. MARQUAGE COMME SYNCHRONISÉ EN LOCAL & NETTOYAGE DE LA FILE */
        db.transaction(() => {
            db.prepare("UPDATE companies SET sync_status = 'synced' WHERE id = ?").run(companyId);
            db.prepare("UPDATE users SET sync_status = 'synced' WHERE company_id = ?").run(companyId);
            db.prepare("UPDATE products SET sync_status = 'synced' WHERE company_id = ?").run(companyId);
            
            // Vidage de la file d'attente pour les tables synchronisées
            db.prepare("DELETE FROM sync_queue WHERE company_id = ? AND table_name IN ('companies', 'users', 'products')").run(companyId);
        })();

        console.log('✅ [SYNC] Miroir terminé : Données fusionnées avec succès');

        return { success: true };

    } catch (error) {
        console.error('❌ [SYNC ERROR] :', error.message);
        throw error;
    }
};

module.exports = { pushLocalToCloud };