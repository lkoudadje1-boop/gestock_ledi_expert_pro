const mongoose = require('mongoose');
const { getDb } = require('../config/database');
require('dotenv').config();

const cloudModels = require('../models/cloud.model');

// Table de correspondance entre SQLite et MongoDB
const syncConfig = [
    { table: 'companies', model: 'CloudCompany' },
    { table: 'users', model: 'CloudUser' },
    { table: 'staff', model: 'CloudStaff' },
    { table: 'products', model: 'CloudProduct' },
    { table: 'unites', model: 'CloudUnite' },
    { table: 'familles', model: 'CloudFamille' },
    { table: 'categories', model: 'CloudCategorie' },
    { table: 'product_groups', model: 'CloudProductGroup' },
    { table: 'suppliers', model: 'CloudSupplier' },
    { table: 'customers', model: 'CloudCustomer' },
    { table: 'sales', model: 'CloudSaleHeader' },
    { table: 'sale_items', model: 'CloudSaleItem' },
    { table: 'purchases', model: 'CloudPurchaseHeader' },
    { table: 'purchase_items', model: 'CloudPurchaseItem' },
    { table: 'purchase_payments', model: 'CloudPurchasePayment' },
    { table: 'payments', model: 'CloudPayment' },
    { table: 'provisional_sales', model: 'CloudProvisionalSale' },
    { table: 'inventories', model: 'CloudInventory' },
    { table: 'inventory_items', model: 'CloudInventoryItem' },
    { table: 'stock_movements', model: 'CloudStockMovement' },
    { table: 'audit_log', model: 'CloudAuditLog' },
    { table: 'departements', model: 'CloudDepartement' },
    { table: 'plan_analytique', model: 'CloudPlanAnalytique' },
    { table: 'lignes_analytiques', model: 'CloudLigneAnalytique' },
    { table: 'analytique_details', model: 'CloudAnalytiqueDetail' },
    { table: 'analytique_config_comptes', model: 'CloudAnalytiqueConfig' },
    { table: 'analytique_auto_repartition', model: 'CloudAnalytiqueAutoRepartition' },
    { table: 'plan_comptable', model: 'CloudPlanComptable' },
    { table: 'plan_tiers', model: 'CloudPlanTiers' },
    { table: 'exercices', model: 'CloudExercice' },
    { table: 'journaux', model: 'CloudJournal' },
    { table: 'ecritures', model: 'CloudEcriture' },
    { table: 'lignes_ecritures', model: 'CloudLigneEcriture' },
    { table: 'brouillon_ecritures', model: 'CloudBrouillonEcriture' },
    { table: 'brouillon_lignes', model: 'CloudBrouillonLigne' },
    { table: 'brouillon_lignes_analytiques', model: 'CloudBrouillonLigneAnalytique' },
    { table: 'others_tiers', model: 'CloudOthersTiers' },
    { table: 'reports_a_nouveau', model: 'CloudReportsANouveau' },
    { table: 'brouillards_treso', model: 'CloudBrouillardTreso' },
    { table: 'brouillard_lignes_treso', model: 'CloudBrouillardLigneTreso' },
    { table: 'brouillard_affectations', model: 'CloudBrouillardAffectation' },
    { table: 'config_ecritures_auto', model: 'CloudConfigEcritureAuto' },
    { table: 'config_ecritures_lignes', model: 'CloudConfigEcritureLigne' },
    { table: 'stock_adjustments', model: 'CloudStockAdjustment' },
    { table: 'stock_adjustment_items', model: 'CloudStockAdjustmentItem' },
    { table: 'purchase_orders', model: 'CloudPurchaseOrder' },
    { table: 'purchase_order_items', model: 'CloudPurchaseOrderItem' },
    { table: 'packaging_rules', model: 'CloudPackagingRule' },
    { table: 'packaging_rule_tiers', model: 'CloudPackagingRuleTier' },
    { table: 'packaging', model: 'CloudPackaging' },
    { table: 'packaging_purchases', model: 'CloudPackagingPurchase' },
    { table: 'packaging_movements', model: 'CloudPackagingMovement' },
    { table: 'packaging_inventories', model: 'CloudPackagingInventory' },
    { table: 'packaging_inventory_items', model: 'CloudPackagingInventoryItem' },
    { table: 'flux_emballages', model: 'CloudFluxPackaging' },
    { table: 'flux_emballages_details', model: 'CloudFluxPackagingDetail' },
    { table: 'product_paliers', model: 'CloudProductPalier' },
    { table: 'compta_queue', model: 'CloudComptaQueue' },
    { table: 'payment_methods', model: 'CloudPaymentMethod' },
    { table: 'clotures_caisse', model: 'CloudClotureCaisse' },
    { table: 'cloture_details_paiements', model: 'CloudClotureDetailPaiement' }
];

// ===================== HELPERS =====================

async function retryPush(fn, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try { return await fn(); }
        catch (e) {
            if (i === retries - 1) throw e;
            await new Promise(r => setTimeout(r, 1000));
        }
    }
}

const connectCloud = async () => {
    if (mongoose.connection.readyState !== 1) {
        await mongoose.connect(process.env.MONGO_URI, { maxPoolSize: 10 });
    }
};

// ===================== SYNC LOCAL -> CLOUD (PUSH) =====================

const syncLocalToCloud = async () => {
    const db = getDb();

    try {
        const pendingTasks = db.prepare(`
            SELECT CAST(id AS INTEGER) as id, table_name, record_id, operation, company_id
            FROM sync_queue ORDER BY created_at ASC
        `).all();

        if (!pendingTasks.length) return { success: true };

        await connectCloud();

        for (const task of pendingTasks) {
            const config = syncConfig.find(t => t.table === task.table_name);

            if (!config || !cloudModels[config.model]) {
                db.prepare("DELETE FROM sync_queue WHERE id = ?").run(task.id);
                continue;
            }

            console.log(`📡 SYNC [${task.operation}] ${task.table_name} #${task.record_id}`);

            if (task.operation === 'DELETE') {
                const ok = await retryPush(() =>
                    deleteFromCloud(config.model, task.record_id, task.company_id, task.table_name)
                );
                if (ok) {
                    db.prepare("DELETE FROM sync_queue WHERE id = ?").run(task.id);
                }
                continue;
            }

            let data = null;
            try {
                data = db.prepare(`SELECT * FROM ${task.table_name} WHERE id = ?`).get(task.record_id);
            } catch (errDb) {}

            if (!data) {
                db.prepare("DELETE FROM sync_queue WHERE id = ?").run(task.id);
                continue;
            }

            const ok = await retryPush(() =>
                pushToCloud(config.model, data, task.table_name)
            );

            if (ok) {
                const tx = db.transaction(() => {
                    try {
                        db.prepare(`UPDATE ${task.table_name} SET sync_status='synced' WHERE id=?`).run(task.record_id);
                    } catch (e) {}
                    db.prepare("DELETE FROM sync_queue WHERE id=?").run(task.id);
                });
                tx();
            }
        }

        return { success: true };

    } catch (err) {
        console.error("❌ SYNC ERROR:", err.message);
        throw err;
    }
};

async function pushToCloud(modelName, data, tableName) {
    try {
        const Model = cloudModels[modelName];
        if (!Model) return false;

        const companyId = data.company_id ? String(data.company_id) : null;
        let rawId = data.id || data.id_inventaire || data.id_achat || data.id_achat_mp || data.lot_id;

        if (!rawId && tableName.startsWith('temporary_')) {
            rawId = tableName === 'temporary_purchases' 
                ? `${data.user_id}_${data.cart_type}` 
                : data.user_id;
        }

        if (!rawId) return false;

        const globalId = tableName === 'companies' ? String(rawId) : `${companyId}_${rawId}`;

        const cloudData = {
            ...data,
            localId: globalId,
            company_id: companyId,
            sync_status: 'synced',
            deleted: data.is_deleted === 1
        };

        delete cloudData.id;
        delete cloudData._id;
        delete cloudData.__v;

        await Model.findOneAndUpdate(
            { localId: globalId },
            { $set: cloudData },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        return true;
    } catch (err) {
        return false;
    }
}

async function deleteFromCloud(modelName, localId, companyId, tableName) {
    try {
        const Model = cloudModels[modelName];
        if (!Model) return false;

        const globalId = tableName === 'companies' ? String(localId) : `${companyId}_${localId}`;

        await Model.findOneAndUpdate(
            { localId: globalId },
            { $set: { is_deleted: 1, deleted_at: new Date(), sync_status: 'synced' } }
        );
        return true;
    } catch (err) {
        return false;
    }
}

// ===================== PULL CLOUD -> LOCAL (SÉCURISÉ) =====================

const syncCloudToLocal = async (company_id) => {
    const db = getDb();
    if (!company_id) return;

    try {
        await connectCloud();

        for (const config of syncConfig) {
            const Model = cloudModels[config.model];
            if (!Model) continue;

            const cloudItems = await Model.find({ company_id }).lean();
            if (!cloudItems.length) continue;

            for (const item of cloudItems) {
                let localId;
                if (config.table === 'companies') {
                    localId = item.localId;
                } else {
                    if (!item.localId) continue;
                    localId = item.localId.split('_').slice(1).join('_');
                }

                // 🛡️ SÉCURITÉ ANTI-ÉCRASEMENT : Protection des éléments 'pending' ou plus récents en local
                try {
                    const localRow = db.prepare(`SELECT updated_at, sync_status FROM ${config.table} WHERE id = ?`).get(localId);

                    if (localRow) {
                        if (localRow.sync_status === 'pending') {
                            continue; // On ne touche pas au travail local en attente d'envoi
                        }
                        if (localRow.updated_at && item.updated_at) {
                            const localTime = new Date(localRow.updated_at).getTime();
                            const cloudTime = new Date(item.updated_at).getTime();
                            if (localTime > cloudTime) {
                                continue; // Le local est plus récent, on ignore le pull
                            }
                        }
                    }
                } catch (e) {}

                let sqliteData = {
                    ...item,
                    id: localId,
                    sync_status: 'synced'
                };

                delete sqliteData._id;
                delete sqliteData.localId;
                delete sqliteData.__v;

                // --- 🛡️ SÉRIALISEUR SÉCURISÉ (Dates, Objets, Booléens) ---
                Object.keys(sqliteData).forEach(k => {
                    if (sqliteData[k] !== null && sqliteData[k] !== undefined) {
                        if (sqliteData[k] instanceof Date) {
                            sqliteData[k] = sqliteData[k].toISOString();
                        } else if (typeof sqliteData[k] === 'object') {
                            sqliteData[k] = JSON.stringify(sqliteData[k]);
                        } else if (typeof sqliteData[k] === 'boolean') {
                            sqliteData[k] = sqliteData[k] ? 1 : 0;
                        }
                    }
                });

                const tableInfo = db.prepare(`PRAGMA table_info(${config.table})`).all();
                const validColumns = tableInfo.map(c => c.name);

                const filtered = {};
                validColumns.forEach(c => {
                    if (sqliteData[c] !== undefined) filtered[c] = sqliteData[c];
                });

                const columns = Object.keys(filtered);
                if (!columns.length) continue;

                const values = Object.values(filtered);
                const placeholders = columns.map(() => '?').join(', ');
                const updates = columns.filter(c => c !== 'id').map(c => `${c}=excluded.${c}`).join(', ');

                const sql = `
                    INSERT INTO ${config.table} (${columns.join(', ')})
                    VALUES (${placeholders})
                    ON CONFLICT(id) DO UPDATE SET ${updates}
                `;

                db.prepare(sql).run(values);
            }
        }

        return true;

    } catch (err) {
        console.error("❌ PULL ERROR:", err.message);
    }
};

// ===================== SMARTSYNC (PUSH PUIS PULL) =====================
const smartSync = async (companyId) => {
    try {
        await syncLocalToCloud(); // 1. Envoi prioritaire des modifications locales vers le Cloud
        if (companyId) {
            await syncCloudToLocal(companyId); // 2. Récupération des données distantes à jour
        }
        return { success: true };
    } catch (err) {
        console.error("❌ SMARTSYNC ERROR:", err.message);
        throw err;
    }
};
// ===================== VÉRIFICATION DES MISES À JOUR CLOUD =====================
const checkCloudUpdates = async (companyId, lastSync) => {
    await connectCloud();
    const lastSyncDate = new Date(lastSync);

    // On vérifie sur les tables principales si des modifications ont eu lieu après la dernière synchro
    const hasSalesUpdate = await cloudModels.CloudSaleHeader.exists({
        company_id: companyId,
        updated_at: { $gt: lastSyncDate }
    });

    const hasProductsUpdate = await cloudModels.CloudProduct.exists({
        company_id: companyId,
        updated_at: { $gt: lastSyncDate }
    });

    const hasPurchasesUpdate = await cloudModels.CloudPurchaseHeader.exists({
        company_id: companyId,
        updated_at: { $gt: lastSyncDate }
    });

    return !!(hasSalesUpdate || hasProductsUpdate || hasPurchasesUpdate);
};

module.exports = {
    syncLocalToCloud,
    syncCloudToLocal,
    smartSync,
    checkCloudUpdates,
    pushAllToCloud: smartSync
};