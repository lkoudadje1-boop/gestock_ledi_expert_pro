const { getDb } = require('../config/database');
const { logAction } = require('../utils/auditHelper');

const PackagingInventoryService = {
    // CORRIGÉ : Retourne tous les emballages, y compris ceux déjà saisis dans l'inventaire en cours
    getActiveInventory: async (companyId) => {
        const db = getDb();
        const activeInv = db.prepare(`
            SELECT id, libelle, statut 
            FROM packaging_inventories 
            WHERE company_id = ? AND statut = 'en_cours'
            LIMIT 1
        `).get(companyId);

        if (!activeInv) return null;

        const items = db.prepare(`
            SELECT 
                p.id as packaging_id, 
                p.nom as nom_article_snap,
                p.stock_actuel as stock_theorique, 
                COALESCE(p.cmp, 0) as prix_achat_snap,  -- Utilisation du CMP ici
                IFNULL(ii.stock_reel, 0) as stock_reel
            FROM packaging p
            LEFT JOIN packaging_inventory_items ii 
                ON p.id = ii.packaging_id AND ii.id_packaging_inventaire = ?
            WHERE p.is_active = 1 AND p.company_id = ?
        `).all(activeInv.id, companyId);

        return { inventory: activeInv, items };
    },

    checkStatus: async (companyId) => {
        const db = getDb();
        const activeInv = db.prepare(`
            SELECT id FROM packaging_inventories 
            WHERE company_id = ? AND statut = 'en_cours'
            LIMIT 1
        `).get(companyId);

        const lastClosure = db.prepare(`
            SELECT closed_at FROM packaging_inventories 
            WHERE company_id = ? AND statut = 'valide'
            ORDER BY closed_at DESC LIMIT 1
        `).get(companyId);

        return {
            en_cours: !!activeInv,
            active: !!activeInv,
            id: activeInv ? activeInv.id : null,
            last_closure: lastClosure ? lastClosure.closed_at : null
        };
    },

    getPackagesForInventory: async (companyId) => {
        const db = getDb();
        const query = `
            SELECT 
                id, nom, 
                IFNULL(stock_actuel, 0) AS stock, 
                IFNULL(prix_achat, 0) AS prixAchat, 
                code_barre AS barcode
            FROM packaging
            WHERE is_active = 1 AND company_id = ?
        `;
        return db.prepare(query).all(companyId);
    },

    createInventory: async (data, userInfo) => {
        const db = getDb();
        const { id, libelle } = data;
        const { userId, userName, finalCompanyId } = userInfo;

        db.transaction(() => {
            db.prepare(`
                INSERT INTO packaging_inventories (id, libelle, user_id, company_id, statut, sync_status) 
                VALUES (?, ?, ?, ?, 'en_cours', 'pending')
            `).run(id, libelle, userId, finalCompanyId);

            // 🔄 Inscription dans la file de synchronisation Cloud
            db.prepare(`
                INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
                VALUES ('packaging_inventories', ?, 'INSERT', ?)
            `).run(id, finalCompanyId);

            logAction({
                userId, userName, actionType: 'INSERTION',
                tableConcernee: 'packaging_inventories', referenceId: id,
                description: `Ouverture inventaire emballages: ${libelle}`,
                companyId: finalCompanyId
            });
        })();
        return id;
    },

    saveItem: async (data, userInfo) => {
        const db = getDb();
        const { id, inventory_id, packaging_id, nom_article_snap, prix_achat_snap, stock_theorique, stock_reel } = data;
        const { finalUserId, finalCompanyId } = userInfo;

        db.transaction(() => {
            const query = `
                INSERT INTO packaging_inventory_items (
                    id, id_packaging_inventaire, packaging_id, nom_emballage_snap, 
                    prix_achat_snap, stock_theorique, stock_reel, user_id, company_id, sync_status
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
                ON CONFLICT(id_packaging_inventaire, packaging_id) DO UPDATE SET 
                    stock_reel = excluded.stock_reel, 
                    nom_emballage_snap = excluded.nom_emballage_snap,
                    user_id = excluded.user_id,
                    sync_status = 'pending'
            `;
            db.prepare(query).run(
                id, inventory_id, packaging_id, nom_article_snap, 
                prix_achat_snap, stock_theorique, stock_reel, finalUserId, finalCompanyId
            );

            // Récupération de l'ID effectif de la ligne (en cas d'upsert)
            const itemRecord = db.prepare(`
                SELECT id FROM packaging_inventory_items 
                WHERE id_packaging_inventaire = ? AND packaging_id = ?
            `).get(inventory_id, packaging_id);

            const targetId = itemRecord ? itemRecord.id : id;

            // 🔄 Inscription dans la file de synchronisation Cloud
            db.prepare(`
                INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
                VALUES ('packaging_inventory_items', ?, 'INSERT', ?)
            `).run(targetId, finalCompanyId);
        })();
        return true;
    },

    validateInventory: async (inventory_id, userInfo) => {
        const db = getDb();
        const { finalUserId, finalCompanyId } = userInfo;

        try {
            return db.transaction(() => {
                const syncQueueStmt = db.prepare(`
                    INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
                    VALUES (?, ?, ?, ?)
                `);

                // 1. Récupération des articles saisis
                const items = db.prepare(`
                    SELECT packaging_id, prix_achat_snap, stock_theorique, stock_reel 
                    FROM packaging_inventory_items 
                    WHERE id_packaging_inventaire = ?
                `).all(inventory_id);
                
                let totalEcartValeur = 0;

                for (const item of items) {
                    const stockR = parseFloat(item.stock_reel || 0);
                    const stockT = parseFloat(item.stock_theorique || 0);
                    const prix = parseFloat(item.prix_achat_snap || 0);
                    
                    const ecartQte = stockR - stockT;
                    totalEcartValeur += (ecartQte * prix);

                    // Mise à jour stock réel dans la table packaging
                    db.prepare(`
                        UPDATE packaging 
                        SET stock_actuel = ?, updated_at = CURRENT_TIMESTAMP, sync_status = 'pending' 
                        WHERE id = ? AND company_id = ?
                    `).run(stockR, item.packaging_id, finalCompanyId);

                    syncQueueStmt.run('packaging', item.packaging_id, 'UPDATE', finalCompanyId);

                    // Enregistrement mouvement si écart
                    if (ecartQte !== 0) {
                        const moveId = `MOV-INVPKG-${Date.now()}-${Math.floor(Math.random()*1000)}`;
                        db.prepare(`
                            INSERT INTO packaging_movements (
                                id, packaging_id, type_mouvement, reference_id, 
                                quantite, stock_avant, stock_apres, prix_operation, 
                                user_id, company_id, sync_status
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
                        `).run(
                            moveId, item.packaging_id, (ecartQte > 0 ? 'INV_SURPLUS' : 'INV_MANQUANT'),
                            inventory_id, ecartQte, stockT, stockR, prix, 
                            finalUserId, finalCompanyId
                        );

                        syncQueueStmt.run('packaging_movements', moveId, 'INSERT', finalCompanyId);
                    }
                }

                // 2. Mise à jour de l'inventaire
                const result = db.prepare(`
                    UPDATE packaging_inventories 
                    SET statut = 'valide', 
                        closed_at = CURRENT_TIMESTAMP, 
                        valeur_ecart_totale = ?, 
                        sync_status = 'pending' 
                    WHERE id = ? AND company_id = ?
                `).run(totalEcartValeur, inventory_id, finalCompanyId);

                if (result.changes === 0) {
                    throw new Error("Inventaire introuvable ou déjà clôturé.");
                }

                syncQueueStmt.run('packaging_inventories', inventory_id, 'UPDATE', finalCompanyId);

                return { totalEcart: totalEcartValeur };
            })();
        } catch (err) {
            console.error("Erreur lors de la validation de l'inventaire :", err.message);
            throw err;
        }
    },

    cancelInventory: async (inventory_id, userInfo) => {
        const db = getDb();
        const { userId, userName, companyId } = userInfo;

        db.transaction(() => {
            const items = db.prepare('SELECT id FROM packaging_inventory_items WHERE id_packaging_inventaire = ?').all(inventory_id);
            const syncQueueStmt = db.prepare(`
                INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
                VALUES (?, ?, 'DELETE', ?)
            `);

            items.forEach(it => {
                syncQueueStmt.run('packaging_inventory_items', it.id, companyId);
            });

            db.prepare('DELETE FROM packaging_inventory_items WHERE id_packaging_inventaire = ?').run(inventory_id);
            db.prepare('DELETE FROM packaging_inventories WHERE id = ? AND company_id = ?').run(inventory_id, companyId);
            
            syncQueueStmt.run('packaging_inventories', inventory_id, companyId);

            logAction({
                userId, userName, actionType: 'SUPPRESSION',
                tableConcernee: 'packaging_inventories', referenceId: inventory_id,
                description: `Annulation et suppression de l'inventaire emballage ${inventory_id}`,
                companyId
            });
        })();
        return true;
    },

    getSessions: async (companyId) => {
        const db = getDb();
        const results = db.prepare(`
            SELECT 
                i.id, 
                i.libelle, 
                i.type_inventaire, 
                i.statut, 
                i.valeur_theo_totale, 
                i.valeur_reel_totale,
                i.created_at,
                i.closed_at as date_cloture, 
                ROUND(COALESCE(i.valeur_ecart_totale, 0), 2) as valeur_ajustement,
                (SELECT COUNT(*) FROM packaging_inventory_items WHERE id_packaging_inventaire = i.id) as total_articles,
                CASE 
                    WHEN u.username IS NULL OR u.username = '' THEN 'Admin' 
                    ELSE u.username 
                END as nom_utilisateur
            FROM packaging_inventories i
            LEFT JOIN users u ON i.user_id = u.id
            WHERE i.company_id = ?
            ORDER BY i.created_at DESC
        `).all(companyId);

        return results;
    },

    getDetails: async (companyId) => {
        const db = getDb();
        return db.prepare(`
            SELECT 
                ii.id_packaging_inventaire as inventory_session_id, 
                ii.nom_emballage_snap as nom_article_snap,
                ii.stock_theorique, ii.stock_reel, 
                ii.prix_achat_snap as prix_unitaire_snap
            FROM packaging_inventory_items ii
            WHERE ii.company_id = ?
            ORDER BY ii.id DESC
        `).all(companyId);
    },

    archiveSession: async (id, secureCompanyId, userInfo) => {
        const db = getDb();
        const { userId, userName } = userInfo;

        return db.transaction(() => {
            const info = db.prepare(`
                UPDATE packaging_inventories 
                SET statut = 'archive', sync_status = 'pending' 
                WHERE id = ? AND company_id = ? AND statut = 'valide'
            `).run(id, secureCompanyId);
            
            if (info.changes === 0) throw new Error("Session introuvable ou non clôturée.");

            db.prepare(`
                INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
                VALUES ('packaging_inventories', ?, 'UPDATE', ?)
            `).run(id, secureCompanyId);

            logAction({
                userId, userName, actionType: 'MODIFICATION',
                tableConcernee: 'packaging_inventories', referenceId: id,
                description: `Archivage de la session d'inventaire emballage ${id}`,
                companyId: secureCompanyId
            });
        })();
    },

    historiqueFluxEmbalage: async (companyId) => {
        const db = getDb();
        const query = `
            SELECT 
                i.id as inventaire_id,
                i.libelle,
                i.closed_at,
                ii.nom_emballage_snap,
                ROUND(ii.stock_theorique, 2) as stock_theorique,
                ROUND(ii.stock_reel, 2) as stock_reel,
                ROUND(ii.stock_reel - ii.stock_theorique, 2) as ecart,
                ROUND(ii.prix_achat_snap, 2) as prix_unitaire,
                ROUND((ii.stock_reel - ii.stock_theorique) * ii.prix_achat_snap, 2) as valeur_ecart,
                COALESCE(u.username, 'Admin') as nom_utilisateur
            FROM packaging_inventories i
            LEFT JOIN packaging_inventory_items ii ON i.id = ii.id_packaging_inventaire
            LEFT JOIN users u ON i.user_id = u.id
            WHERE i.company_id = ? 
            ORDER BY i.closed_at DESC
        `;
        return db.prepare(query).all(companyId);
    },

    getDetailsById: async (id_inventaire) => {
        const db = getDb();
        const entete = db.prepare('SELECT * FROM packaging_inventories WHERE id = ?').get(id_inventaire);
        const lignes = db.prepare('SELECT * FROM packaging_inventory_items WHERE id_packaging_inventaire = ?').all(id_inventaire);
        return { ...entete, lignes };
    }
};

module.exports = PackagingInventoryService;