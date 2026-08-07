const { getDb } = require('../config/database');
const { logAction } = require('../utils/auditHelper');
// 🚀 ALLIANCE LOGISTIQUE : Utilisation du service centralisé maître
const conversestock = require('./conversestock'); 

const InventoryService = {
    getActiveInventory: async (companyId) => {
    const db = getDb();
    const activeInv = db.prepare(`
        SELECT id, libelle, type_inventaire, statut, created_at 
        FROM inventories 
        WHERE company_id = ? AND statut = 'en_cours'
        LIMIT 1
    `).get(companyId);

    if (!activeInv) return null;

    activeInv.created_at = activeInv.created_at || new Date().toISOString();

    // 🚀 CORRECTIF : Sélection de prixVente_snap et prix_achat_snap
    const items = db.prepare(`
        SELECT 
            ii.product_id, 
            ii.stock_reel AS stock_reel_pieces,
            ii.prixVente_snap,  -- 👈 AJOUTÉ ICI
            ii.prix_achat_snap, -- 👈 AJOUTÉ ICI (Optionnel mais recommandé pour les écarts de valeur)
            u.coefficient AS unit_coefficient,
            u.code AS unit_code_gros,
            u.unite_reference AS unit_ref_detail
        FROM inventory_items ii
        LEFT JOIN products p ON ii.product_id = p.id
        LEFT JOIN unites u ON p.unite_id = u.id
        WHERE ii.company_id = ? AND ii.id_inventaire = ?
    `).all(companyId, activeInv.id);

    const itemsHydrates = items.map(item => {
        const pieces = Number(item.stock_reel_pieces || 0);
        return {
            product_id: item.product_id,
            stock_reel: pieces,
            prixVente_snap: item.prixVente_snap || 0,   // 👈 TRANSMIS À REACT
            prix_achat_snap: item.prix_achat_snap || 0, // 👈 TRANSMIS À REACT
            stock_reel_formate: conversestock.formaterStockPourAffichage(
                pieces,
                item.unit_coefficient || 1,
                item.unit_code_gros || 'CS',
                item.unit_ref_detail || 'PCS'
            )
        };
    });

    return { 
        success: true,
        id: activeInv.id,
        libelle: activeInv.libelle,
        type_inventaire: activeInv.type_inventaire,
        statut: activeInv.statut,
        created_at: activeInv.created_at,
        inventory: activeInv, 
        items: itemsHydrates 
    };
},


    checkStatus: async (companyId) => {
        const db = getDb();
        // 🚀 CORRECTIF : Sélection de created_at rattachée à la session active
        const activeInv = db.prepare(`
            SELECT id, created_at FROM inventories 
            WHERE company_id = ? AND statut = 'en_cours'
            LIMIT 1
        `).get(companyId);

        const lastClosure = db.prepare(`
            SELECT closed_at FROM inventories 
            WHERE company_id = ? AND statut = 'valide'
            ORDER BY closed_at DESC LIMIT 1
        `).get(companyId);

        return {
            en_cours: !!activeInv,
            active: !!activeInv,
            id: activeInv ? activeInv.id : null,
            // 🚀 PROTECTION GRAPHIQUE STRICTE : Injection d'un format string ISO lisible par le Front
            created_at: activeInv ? (activeInv.created_at || new Date().toISOString()) : null,
            last_closure: lastClosure ? lastClosure.closed_at : null
        };
    },

   createInventory: async (data, userInfo) => {
        const db = getDb();
        const { id, libelle, type_inventaire } = data;
        const { userId, userName, finalCompanyId } = userInfo;

        return db.transaction(() => {
            // =========================================================================
            // 🛡️ SÉCURITÉ 1 : Caisses / Paiements non clôturés
            // =========================================================================
            const nonClotures = db.prepare(`
                SELECT COUNT(*) as count 
                FROM payments 
                WHERE company_id = ? 
                  AND (cloture_id IS NULL OR is_cloture = 0)
                  AND is_active = 1
                  AND TRIM(UPPER(type_paiement)) != 'REMBOURSEMENT'
            `).get(finalCompanyId);

            if (nonClotures && nonClotures.count > 0) {
                throw new Error(`Action refusée : Impossible de démarrer l'inventaire car il reste ${nonClotures.count} opération(s) ou vente(s) en cours non clôturée(s) dans le système. Veuillez valider la clôture des caisses avant de figer les stocks.`);
            }

            // =========================================================================
            // 🛡️ SÉCURITÉ 2 : Verrou sur les chargements et ventes provisoires en attente
            // =========================================================================
            const ventesProvisoiresActives = db.prepare(`
                SELECT COUNT(DISTINCT lot_id) as count 
                FROM provisional_sales 
                WHERE company_id = ? AND is_archived = 0
            `).get(finalCompanyId);

            if (ventesProvisoiresActives && ventesProvisoiresActives.count > 0) {
                throw new Error(`Action refusée : Impossible de démarrer l'inventaire. Il y a actuellement ${ventesProvisoiresActives.count} chargement(s) de camion ou vente(s) provisoire(s) en cours (non archivés) dans le système. Le commercial doit faire ses comptes et clôturer sa journée avant de pouvoir figer les stocks.`);
            }

            // =========================================================================
            // 🚀 TOUT EST OK : ENREGISTREMENT DE L'INVENTAIRE
            // =========================================================================
            const dateOuvertureISO = new Date().toISOString();

            db.prepare(`
                INSERT INTO inventories (id, libelle, type_inventaire, user_id, company_id, statut, created_at, sync_status) 
                VALUES (?, ?, ?, ?, ?, 'en_cours', ?, 'pending')
            `).run(id, libelle, type_inventaire, userId, finalCompanyId, dateOuvertureISO);

            // 🔄 Synchronisation Cloud
            db.prepare(`
                INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
                VALUES ('inventories', ?, 'INSERT', ?)
            `).run(id, finalCompanyId);

            logAction({
                userId, userName, actionType: 'INSERTION',
                tableConcernee: 'inventories', referenceId: id,
                description: `Ouverture inventaire: ${libelle} (${type_inventaire})`,
                companyId: finalCompanyId
            });
            
            return id;
        })();
    },

saveItem: async (data, userInfo) => {
    const db = getDb();
    const { id, inventory_id, product_id, nom_article_snap, prix_achat_snap, stock_theorique, stock_reel, saisie_gros, saisie_detail } = data;
    const { finalUserId, finalCompanyId } = userInfo;

    let chaineCalcul = stock_reel !== undefined && stock_reel !== null ? String(stock_reel).trim() : '0';
    
    if (saisie_gros !== undefined || saisie_detail !== undefined) {
        const g = saisie_gros !== '' && saisie_gros !== null ? String(saisie_gros).trim() : '0';
        const d = saisie_detail !== '' && saisie_detail !== null ? String(saisie_detail).trim() : '0';
        chaineCalcul = `${g} + ${d}`;
    }

    const stockReelPiecesStrict = conversestock.calculerUnitesNatives(db, product_id, chaineCalcul);

    // 🚀 CHIRURGIE 1 : Récupérer le prix de vente actuel du produit directement depuis la table products
    const productPrice = db.prepare(`SELECT prixVente FROM products WHERE id = ?`).get(product_id);
    const prixVenteActuel = productPrice?.prixVente || 0;

    db.transaction(() => {
        // 🚀 CHIRURGIE 2 : Intégration de la colonne prixVente_snap dans la requête d'insertion
        const query = `
            INSERT INTO inventory_items (id, id_inventaire, product_id, nom_article_snap, prix_achat_snap, prixVente_snap, stock_theorique, stock_reel, user_id, company_id, sync_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
            ON CONFLICT(id_inventaire, product_id) DO UPDATE SET 
                stock_reel = excluded.stock_reel, 
                user_id = excluded.user_id,
                sync_status = 'pending'
        `;
        db.prepare(query).run(
            id, 
            inventory_id, 
            product_id, 
            nom_article_snap, 
            prix_achat_snap, 
            prixVenteActuel, // 👈 Inséré ici en toute sécurité
            stock_theorique, 
            stockReelPiecesStrict, 
            finalUserId, 
            finalCompanyId
        );

        // 🔄 Synchronisation Cloud
        db.prepare(`
            INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
            VALUES ('inventory_items', ?, 'INSERT', ?)
        `).run(id, finalCompanyId);
    })();

    const artConfig = db.prepare(`
        SELECT u.coefficient, u.code, u.unite_reference 
        FROM products p
        LEFT JOIN unites u ON p.unite_id = u.id
        WHERE p.id = ?
    `).get(product_id);

    const chaineReelleFormatee = conversestock.formaterStockPourAffichage(
        stockReelPiecesStrict,
        artConfig?.coefficient || 1,
        artConfig?.code || 'CS',
        artConfig?.unite_reference || 'UNITÉ'
    );

    return { 
        success: true, 
        stock_reel_pieces: stockReelPiecesStrict,
        stock_reel_formate: chaineReelleFormatee 
    };
},

  getProductsForInventory: async (companyId) => {
    const db = getDb();
    const query = `
        SELECT 
            p.id, p.nom, 
            IFNULL(p.stock_actuel, 0) AS stock_brut_base, 
            IFNULL(p.cmp, 0) AS prixAchat, 
            IFNULL(p.prixVente, 0) AS prixVente, -- 🚀 AJOUTÉ ICI : Pour l'interface React
            p.codeBarre AS barcode,
            pg.category_id, c.famille_id, p.group_id,
            u.coefficient AS unit_coefficient,
            u.code AS unit_code_gros,
            u.unite_reference AS unit_ref_detail
        FROM products p
        LEFT JOIN product_groups pg ON p.group_id = pg.id
        LEFT JOIN categories c ON pg.category_id = c.id
        LEFT JOIN unites u ON p.unite_id = u.id
        WHERE p.is_active = 1 AND p.company_id = ?
    `;
    const products = db.prepare(query).all(companyId);

    return products.map(p => {
        const coeffLogistique = Number(p.unit_coefficient) || 1;
        const piecesNatives = parseFloat(p.stock_brut_base || 0);

        const stockTexteFormate = conversestock.formaterStockPourAffichage(
            piecesNatives,
            coeffLogistique,
            p.unit_code_gros || 'CS',
            p.unit_ref_detail || 'UNITÉ'
        );

        return {
            ...p,
            stock: piecesNatives, 
            stock_actuel: piecesNatives,
            stock_formate: stockTexteFormate,
            stock_theorique_formate: stockTexteFormate 
        };
    });
},

   validateInventory: async (inventory_id, userInfo) => {
        const db = getDb();
        const { finalUserId, finalUserName, finalCompanyId } = userInfo;

        return db.transaction(() => {
            // 1. Récupérer les lignes de l'inventaire
            const items = db.prepare('SELECT * FROM inventory_items WHERE id_inventaire = ?').all(inventory_id);
            let totalEcartValeur = 0;
            let counter = 0; 
            const syncQueueStmt = db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES (?, ?, ?, ?)`);

            for (const item of items) {
                counter++;
                
                const stockReelPieces = Number(item.stock_reel || 0);
                const stockTheoriquePieces = Number(item.stock_theorique || 0);

                const ecartQte = stockReelPieces - stockTheoriquePieces;
                totalEcartValeur += (ecartQte * (item.prix_achat_snap || 0));
                
                const product = db.prepare("SELECT cmp FROM products WHERE id = ?").get(item.product_id);
                const currentCMP = product ? product.cmp : 0;
                
                // Réajustement du stock physique natif
                db.prepare(`
                    UPDATE products 
                    SET stock_actuel = ?, updated_at = CURRENT_TIMESTAMP, sync_status = 'pending' 
                    WHERE id = ? AND company_id = ?
                `).run(stockReelPieces, item.product_id, finalCompanyId);

                // Enregistrement explicite dans la sync_queue pour MongoDB
                syncQueueStmt.run('products', item.product_id, 'UPDATE', finalCompanyId);

                // B. Insertion dans "stock_movements" si un écart existe
                if (ecartQte !== 0) {
                    const moveId = `MOV-INV-${Date.now().toString().slice(-6)}${counter}${Math.floor(Math.random() * 100)}`;
                    
                    db.prepare(`
                        INSERT INTO stock_movements (
                            id, product_id, type_mouvement, reference_id, 
                            quantite, stock_avant, stock_apres, prix_operation,
                            cmp_resultat, user_id, company_id, sync_status
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
                    `).run(
                        moveId,
                        item.product_id,
                        ecartQte > 0 ? 'INV_SURPLUS' : 'INV_MANQUANT',
                        inventory_id,
                        Math.abs(ecartQte),
                        stockTheoriquePieces,
                        stockReelPieces,
                        item.prix_achat_snap || 0,
                        currentCMP,
                        finalUserId,
                        finalCompanyId
                    );

                    syncQueueStmt.run('stock_movements', moveId, 'INSERT', finalCompanyId);
                }

                // Synchronisation individuelle de chaque item d'inventaire
                syncQueueStmt.run('inventory_items', item.id, 'UPDATE', finalCompanyId);
            }

            // 🎯 ARCHIVAGE EN BLOC DES VENTES & ACHATS EN DESSOUS DE L'INVENTAIRE
            const ventesArchivees = db.prepare(`
                SELECT id FROM sales 
                WHERE company_id = ? AND statut_vente = 'VALIDEE' AND is_archived = 0
            `).all(finalCompanyId);

            db.prepare(`
                UPDATE sales 
                SET is_archived = 1, sync_status = 'pending', updated_at = CURRENT_TIMESTAMP 
                WHERE company_id = ? AND statut_vente = 'VALIDEE' AND is_archived = 0
            `).run(finalCompanyId);

            // On trace individuellement chaque vente archivée pour le Cloud
            ventesArchivees.forEach(v => {
                syncQueueStmt.run('sales', v.id, 'UPDATE', finalCompanyId);
            });

            const achatsArchives = db.prepare(`
                SELECT id FROM purchases 
                WHERE company_id = ? AND is_active = 1 AND is_archived = 0
            `).all(finalCompanyId);

            db.prepare(`
                UPDATE purchases 
                SET is_archived = 1, sync_status = 'pending', updated_at = CURRENT_TIMESTAMP 
                WHERE company_id = ? AND is_active = 1 AND is_archived = 0
            `).run(finalCompanyId);

            // On trace individuellement chaque achat archivé pour le Cloud
            achatsArchives.forEach(a => {
                syncQueueStmt.run('purchases', a.id, 'UPDATE', finalCompanyId);
            });

            // Clôture définitive de l'inventaire en local
            db.prepare(`
                UPDATE inventories SET 
                    statut = 'valide', 
                    closed_at = CURRENT_TIMESTAMP, 
                    valeur_ecart_totale = ?,
                    sync_status = 'pending' 
                WHERE id = ? AND company_id = ?
            `).run(totalEcartValeur, inventory_id, finalCompanyId);

            syncQueueStmt.run('inventories', inventory_id, 'UPDATE', finalCompanyId);

            logAction({
                userId: finalUserId, userName: finalUserName, actionType: 'MODIFICATION',
                tableConcernee: 'inventories', referenceId: inventory_id,
                description: `Validation inventaire. Écart total: ${totalEcartValeur} & Verrouillage global des écritures parentes.`,
                companyId: finalCompanyId
            });

            return { totalEcart: totalEcartValeur };
        })(); 
    },


    cancelInventory: async (inventory_id, userInfo) => {
        const db = getDb();
        const { userId, userName, companyId } = userInfo;

        const cleanInventoryId = String(inventory_id || '').trim();
        const cleanCompanyId = String(companyId || '').trim();

        db.transaction(() => {
            const items = db.prepare('SELECT id FROM inventory_items WHERE id_inventaire = ?').all(cleanInventoryId);
            const syncQueueStmt = db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES (?, ?, 'DELETE', ?)`);
            
            items.forEach(it => syncQueueStmt.run('inventory_items', it.id, cleanCompanyId));

            db.prepare('DELETE FROM inventory_items WHERE id_inventaire = ?').run(cleanInventoryId);
            db.prepare('DELETE FROM inventories WHERE id = ? AND company_id = ?').run(cleanInventoryId, cleanCompanyId);

            syncQueueStmt.run('inventories', cleanInventoryId, cleanCompanyId);

            logAction({
                userId, userName, actionType: 'SUPPRESSION',
                tableConcernee: 'inventories', referenceId: cleanInventoryId,
                description: `Annulation et suppression de l'inventaire ${cleanInventoryId}`,
                companyId: cleanCompanyId
            });
        })();
        return true;
    },

   

    archiveSession: async (id, secureCompanyId, userInfo) => {
        const db = getDb();
        const { userId, userName } = userInfo;

        const cleanId = String(id || '').trim();
        const cleanCompanyId = String(secureCompanyId || '').trim();

        return db.transaction(() => {
            const stmt = db.prepare(`
                UPDATE inventories 
                SET statut = 'archive', sync_status = 'pending' 
                WHERE id = ? AND company_id = ? AND statut = 'valide'
            `);
            const info = stmt.run(cleanId, cleanCompanyId);
            if (info.changes === 0) throw new Error("Session introuvable ou non clôturée.");

            db.prepare(`
                INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
                VALUES ('inventories', ?, 'UPDATE', ?)
            `).run(cleanId, cleanCompanyId);

            logAction({
                userId, userName, actionType: 'MODIFICATION',
                tableConcernee: 'inventories', referenceId: cleanId,
                description: `Archivage de la session d'inventaire ${cleanId}`,
                companyId: cleanCompanyId
            });
            return true;
        })();
    },
       getSessions: async (companyId) => {
        console.log("🔍 [AUDIT-GETSESSIONS] Début pour companyId:", companyId);
        const db = getDb();
        const cleanCompanyId = String(companyId || '').trim();

        try {
            console.log("⚙️ [AUDIT-GETSESSIONS] Exécution de la requête SQL consolidée...");
            
            const rows = db.prepare(`
                SELECT 
                    i.*, i.closed_at as date_cloture, 
                    IFNULL((
                        SELECT SUM(ecart_valeur) 
                        FROM inventory_items 
                        WHERE id_inventaire = i.id
                    ), 0) as valeur_ajustement,
                    (
                        SELECT COUNT(*) 
                        FROM inventory_items 
                        WHERE id_inventaire = i.id
                    ) as total_articles,
                    COALESCE(u.username, 'Admin') as nom_utilisateur
                FROM inventories i
                LEFT JOIN users u ON i.user_id = u.id
                WHERE i.company_id = ?
                ORDER BY i.created_at DESC
            `).all(cleanCompanyId);

            console.log(`✅ [AUDIT-GETSESSIONS] Succès, ${rows.length} sessions trouvées.`);

            // 🚀 PROTECTION GRAPHIQUE HISTORIQUE
            return rows.map(row => ({
                ...row,
                created_at: row.created_at || new Date().toISOString(),
                date_cloture: row.date_cloture || row.closed_at || new Date().toISOString()
            }));

        } catch (err) {
            console.error("❌ [CRASH FATAL - GETSESSIONS] La requête SQL a échoué :", err.message);
            throw err;
        }
    },

    getDetails: async (companyId) => {
        console.log("🔍 [AUDIT-GETDETAILS] Début pour companyId:", companyId);
        const db = getDb();
        const cleanCompanyId = String(companyId || '').trim();

        try {
            console.log("⚙️ [AUDIT-GETDETAILS] Exécution de la requête SQL...");
            const lignesRaw = db.prepare(`
                SELECT 
                    inv.id as inventory_session_id, 
                    ii.nom_article_snap,
                    ii.stock_theorique, ii.stock_reel, 
                    ii.prix_achat_snap as prix_unitaire_snap,
                    ii.prixVente_snap, -- 🚀 AJOUTÉ : Récupération de la photo fixe du prix de vente
                    u.coefficient as unit_coefficient,
                    u.code as unit_code_gros,
                    u.unite_reference as unit_ref_detail,
                    inv.valeur_theo_totale,
                    inv.valeur_reel_totale,
                    inv.valeur_ecart_totale,
                    ROUND(
                        (CAST(ii.stock_reel AS REAL) - CAST(ii.stock_theorique AS REAL)) * 
                        (CAST(ii.prix_achat_snap AS REAL) / COALESCE(NULLIF(u.coefficient, 0), 1.0))
                    ) as valeur_ecart,
                    -- 🚀 AJOUTÉ : Formule mathématique saine exécutée au niveau SQL pour la valeur de vente fégée
                    ROUND(
                        (CAST(ii.stock_reel AS REAL) - CAST(ii.stock_theorique AS REAL)) * 
                        (CAST(ii.prixVente_snap AS REAL) / COALESCE(NULLIF(u.coefficient, 0), 1.0))
                    ) as valeur_ecart_vente
                FROM inventory_items ii
                LEFT JOIN inventories inv ON ii.id_inventaire = inv.id
                LEFT JOIN products p ON ii.product_id = p.id
                LEFT JOIN unites u ON p.unite_id = u.id
                WHERE ii.company_id = ?
                ORDER BY ii.id DESC
            `).all(cleanCompanyId);

            console.log(`✅ [AUDIT-GETDETAILS] Succès, ${lignesRaw.length} lignes trouvées.`);

            return lignesRaw.map((l, index) => {
                const ecartPieces = Number(l.stock_reel || 0) - Number(l.stock_theorique || 0);
                return {
                    ...l,
                    ecart: ecartPieces,
                    valeur_ecart_net: l.valeur_ecart || 0,
                    valeur_ecart_vente_net: l.valeur_ecart_vente || 0, // 🚀 TRANSMIS À REACT
                    stock_theorique_formate: conversestock.formaterStockPourAffichage(l.stock_theorique, l.unit_coefficient, l.unit_code_gros, l.unit_ref_detail),
                    stock_reel_formate: conversestock.formaterStockPourAffichage(l.stock_reel, l.unit_coefficient, l.unit_code_gros, l.unit_ref_detail),
                    ecart_formate: `${ecartPieces > 0 ? '+' : ''}${conversestock.formaterStockPourAffichage(ecartPieces, l.unit_coefficient, l.unit_code_gros, l.unit_ref_detail)}`
                };
            });

        } catch (err) {
            console.error("❌ [CRASH] getDetails a échoué :", err.message);
            throw err;
        }
    },

    getDetailsById: async (id_inventaire) => {
        console.log("🔍 [AUDIT-GETDETAILSBYID] Demande pour la session ID:", id_inventaire);
        const db = getDb();
        const cleanInventoryId = String(id_inventaire || '').trim();
        
        try {
            console.log("⚙️ [AUDIT-GETDETAILSBYID] Exécution du SELECT...");
            const queryLignes = `
                SELECT 
                    ii.*,
                    inv.id as inventory_session_id,
                    u.coefficient AS unit_coefficient,
                    u.code AS unit_code_gros,
                    u.unite_reference AS unit_ref_detail,
                    inv.valeur_theo_totale,
                    inv.valeur_reel_totale,
                    inv.valeur_ecart_totale,
                    ROUND(
                        (CAST(ii.stock_reel AS REAL) - CAST(ii.stock_theorique AS REAL)) * 
                        (CAST(ii.prix_achat_snap AS REAL) / COALESCE(NULLIF(u.coefficient, 0), 1.0))
                    ) as valeur_ecart,
                    -- 🚀 AJOUTÉ : Valorisation rigoureuse de la vente calculée au niveau SQL transmise fixe à l'interface
                    ROUND(
                        (CAST(ii.stock_reel AS REAL) - CAST(ii.stock_theorique AS REAL)) * 
                        (CAST(ii.prixVente_snap AS REAL) / COALESCE(NULLIF(u.coefficient, 0), 1.0))
                    ) as valeur_ecart_vente
                FROM inventory_items ii
                LEFT JOIN inventories inv ON ii.id_inventaire = inv.id
                LEFT JOIN products p ON ii.product_id = p.id
                LEFT JOIN unites u ON p.unite_id = u.id
                WHERE ii.id_inventaire = ?
            `;
            const lignesRaw = db.prepare(queryLignes).all(cleanInventoryId);

            console.log(`✅ [AUDIT-GETDETAILSBYID] Succès, ${lignesRaw.length} lignes récupérées.`);

            return lignesRaw.map(l => {
                const ecartPieces = Number(l.stock_reel || 0) - Number(l.stock_theorique || 0);
                return {
                    ...l,
                    ecart: ecartPieces,
                    valeur_ecart_net: l.valeur_ecart || 0,
                    valeur_ecart_vente_net: l.valeur_ecart_vente || 0, // 🚀 TRANSMIS À REACT
                    stock_theorique_formate: conversestock.formaterStockPourAffichage(l.stock_theorique, l.unit_coefficient, l.unit_code_gros, l.unit_ref_detail),
                    stock_reel_formate: conversestock.formaterStockPourAffichage(l.stock_reel, l.unit_coefficient, l.unit_code_gros, l.unit_ref_detail),
                    ecart_formate: `${ecartPieces > 0 ? '+' : ''}${conversestock.formaterStockPourAffichage(ecartPieces, l.unit_coefficient, l.unit_code_gros, l.unit_ref_detail)}`
                };
            });

        } catch (err) {
            console.error(`❌ [CRASH] getDetailsById a échoué sur l'inventaire ${id_inventaire} :`, err.message);
            throw err;
        }
    },




    // 🔑 MÉTHODE DE SÉCURITÉ ABSOLUE INTERNE CONTRE LES MODIFICATIONS APRÈS/PENDANT L'INVENTAIRE
    checkInventoryLock: async (companyId) => {
        const db = getDb();
        const cleanCompanyId = String(companyId || '').trim();

        const activeInv = db.prepare(`
            SELECT COUNT(*) as count FROM inventories 
            WHERE company_id = ? AND statut = 'en_cours'
        `).get(cleanCompanyId);
        
        if (activeInv.count > 0) {
            throw new Error("Opération rejetée : un inventaire de contrôle est actuellement en cours. Toutes les transactions (Ventes, Achats, Modifications) sont strictement bloquées.");
        }
        return false;
    }
};

// 🏁 EXPORTATION CENTRALISÉE ET UNIFIÉE DU MODULE DE SERVICE D'INVENTAIRE
module.exports = InventoryService;