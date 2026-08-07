const { getDb } = require('../config/database');
const { logAction } = require('../utils/auditHelper');
const conversestock = require('./conversestock'); // 🚀 ALLIANCE LOGISTIQUE AVEC LE MODULE MAÎTRE
// 🛡️ FIX CRITICAL ERR_REQUIRE_ESM : Remplacement d'uuid par le module crypto natif de Node.js
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();

const StockAdjustmentService = {


createAdjustment: async (adjustmentData, items, userContext) => {
    const db = getDb();
    const adjustmentId = `ADJ-${uuidv4().substring(0, 8).toUpperCase()}`;
    
    const { secureUserId, secureCompanyId, userName } = userContext;

    console.log('📌 [BACKEND START] Appel reçu pour createAdjustment');
    console.log('📦 Data reçue:', JSON.stringify(adjustmentData));
    console.log('📦 Items reçus:', JSON.stringify(items));
    console.log('👤 Contexte Utilisateur:', JSON.stringify(userContext));

    try {
        const executeTransaction = db.transaction(() => {
            console.log(`⚙️ [TRANSACTION] Début pour ${adjustmentId} (Entreprise: ${secureCompanyId})`);
            
            // =========================================================================
            // 🛡️ VERROU DE SÉCURITÉ CENTRALISÉ : REJET SI INVENTAIRE EN COURS
            // =========================================================================
            const inventaireEnCours = db.prepare(`
                SELECT libelle FROM inventories 
                WHERE company_id = ? AND statut = 'en_cours' 
                LIMIT 1
            `).get(secureCompanyId);

            if (inventaireEnCours) {
                throw new Error(`Action refusée : Impossible de valider cet ajustement de stock (${adjustmentData.type_ajustement}). L'inventaire "${inventaireEnCours.libelle}" est actuellement ouvert. Tout mouvement de stock est figé.`);
            }

            const stmtSync = db.prepare(`
                INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
                VALUES (?, ?, ?, ?)
            `);

            db.prepare(`
                INSERT INTO stock_adjustments (
                    id, libelle, type_ajustement, statut, motif, valeur_totale,
                    entrepot_depart_id, entrepot_arrivee_id, user_id, company_id, sync_status, closed_at
                ) VALUES (?, ?, ?, 'VALIDE', ?, 0, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)
            `).run(
                adjustmentId, adjustmentData.libelle, adjustmentData.type_ajustement,
                adjustmentData.motif || null,
                adjustmentData.entrepot_depart_id || null, adjustmentData.entrepot_arrivee_id || null,
                secureUserId, secureCompanyId
            );
            stmtSync.run('stock_adjustments', adjustmentId, 'INSERT', secureCompanyId);

            let valeurTotale = 0;

            for (const [index, item] of items.entries()) {
                console.log(`\n🔄 [BOUCLE ITEM ${index + 1}] Traitement du produit_id: ${item.product_id}`);
                const itemUuid = uuidv4();
                
                const product = db.prepare(`
                    SELECT p.nom, p.stock_actuel, p.cmp, p.prixVente,
                           u.code AS unit_code_gros, u.coefficient AS unit_coefficient, u.unite_reference AS unit_ref_detail
                    FROM products p
                    LEFT JOIN unites u ON p.unite_id = u.id
                    WHERE p.id = ? AND p.company_id = ?
                `).get(item.product_id, secureCompanyId);

                if (!product) {
                    throw new Error(`Produit introuvable ou inactif : ${item.product_id}`);
                }

                const stockAvant = Number(product.stock_actuel || 0);
                const quantiteMouvementee = Number(item.quantite || 0); 
                let stockApres = stockAvant;

                if (adjustmentData.type_ajustement === 'AVARIE' || adjustmentData.type_ajustement === 'BRISE' || adjustmentData.type_ajustement === 'TRANSFERT') {
                    stockApres = stockAvant - quantiteMouvementee;
                }

                if (stockApres < 0) {
                    throw new Error(`Ajustement refusé pour [${product.nom}]. Stock insuffisant.`);
                }

                const prixAchatSnapBrut = Number(product.cmp || 0); 
                const prixVenteSnap = Number(product.prixVente || 0);
                
                const coeffLogistique = Math.abs(Number(product.unit_coefficient || 1)) || 1;
                const prixAchatUnitaireDetail = coeffLogistique > 1 ? (prixAchatSnapBrut / coeffLogistique) : prixAchatSnapBrut;
                
                const valeurLigne = Math.round(quantiteMouvementee * prixAchatUnitaireDetail);
                valeurTotale += valeurLigne;

                const unitText = conversestock.formaterStockPourAffichage(
                    quantiteMouvementee,
                    coeffLogistique,
                    product.unit_code_gros || 'CS',
                    product.unit_ref_detail || 'PCS'
                );

                console.log(`⚙️ [BOUCLE ITEM ${index + 1}] A. Insertion dans stock_adjustment_items...`);
                db.prepare(`
                    INSERT INTO stock_adjustment_items (
                        id, adjustment_id, product_id, nom_article_snap, 
                        prix_achat_snap, prix_vente_snap, unite_snap, 
                        quantite, stock_avant, stock_apres, valeur_ligne, company_id, sync_status
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
                `).run(
                    itemUuid, adjustmentId, item.product_id, product.nom,
                    prixAchatSnapBrut, prixVenteSnap, unitText,
                    quantiteMouvementee, stockAvant, stockApres, valeurLigne,
                    secureCompanyId
                );
                stmtSync.run('stock_adjustment_items', itemUuid, 'INSERT', secureCompanyId);

                console.log(`⚙️ [BOUCLE ITEM ${index + 1}] B. Mise à jour de la table products...`);
                db.prepare(`UPDATE products SET stock_actuel = ?, sync_status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND company_id = ?`)
                    .run(stockApres, item.product_id, secureCompanyId);
                stmtSync.run('products', item.product_id, 'UPDATE', secureCompanyId);

                console.log(`⚙️ [BOUCLE ITEM ${index + 1}] C. Insertion dans stock_movements...`);
                const movementId = `MOV-${uuidv4().substring(0, 8).toUpperCase()}`;
                
                db.prepare(`
                    INSERT INTO stock_movements (
                        id, product_id, type_mouvement, reference_id, 
                        quantite, stock_avant, stock_apres, prix_operation, 
                        cmp_resultat, user_id, company_id, sync_status
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
                `).run(
                    movementId, 
                    item.product_id, 
                    adjustmentData.type_ajustement, 
                    adjustmentId,
                    quantiteMouvementee, 
                    stockAvant, 
                    stockApres, 
                    valeurLigne,            
                    prixAchatUnitaireDetail, 
                    secureUserId, 
                    secureCompanyId
                );
                stmtSync.run('stock_movements', movementId, 'INSERT', secureCompanyId);
            }

            console.log(`\n⚙️ [TRANSACTION] Étape 2 : Recalcul de la valeur_totale finale (${valeurTotale} F CFA)...`);
            db.prepare(`
                UPDATE stock_adjustments 
                SET valeur_totale = ?, sync_status = 'pending', updated_at = CURRENT_TIMESTAMP 
                WHERE id = ? AND company_id = ?
            `).run(valeurTotale, adjustmentId, secureCompanyId);
            stmtSync.run('stock_adjustments', adjustmentId, 'UPDATE', secureCompanyId);

            return { id: adjustmentId, valeur_totale: valeurTotale };
        });

        const result = executeTransaction();
        console.log('✅ [TRANSACTION COMMITTED] Données de stock enregistrées de manière intègre.');
        
        await logAction({ 
            userId: secureUserId, 
            userName, 
            actionType: 'INSERTION', 
            tableConcernee: 'stock_adjustments', 
            referenceId: adjustmentId, 
            description: `Création ajustement ${adjustmentId} (${adjustmentData.type_ajustement})`, 
            companyId: secureCompanyId 
        });
        
        return { success: true, ...result };

    } catch (error) {
        console.error('💥 [BACKEND CRITICAL ERROR] Échec de l\'ajustement !');
        throw error;
    }
},


cancelAdjustmentItem: async (adjustmentId, itemId, userContext) => {
    const db = getDb();
    const { secureUserId, secureCompanyId, userName } = userContext;

    try {
        const executeTransaction = db.transaction(() => {
            // 🛡️ VERROU 1 : INVENTAIRE EN COURS
            const inventaireEnCours = db.prepare(`SELECT libelle FROM inventories WHERE company_id = ? AND statut = 'en_cours' LIMIT 1`).get(secureCompanyId);
            if (inventaireEnCours) {
                throw new Error(`Action refusée : Inventaire "${inventaireEnCours.libelle}" ouvert. Stock figé.`);
            }

            // 🛡️ VERROU 1.5 : INVENTAIRE DÉJÀ PASSÉ (ANTI-LITIGE RE-SÉCURISÉ)
            const inventairePasse = db.prepare(`
                SELECT i.libelle, i.closed_at
                FROM stock_adjustment_items sai
                JOIN stock_adjustments sa ON sai.adjustment_id = sa.id
                JOIN inventory_items ii ON sai.product_id = ii.product_id
                JOIN inventories i ON ii.id_inventaire = i.id
                WHERE sai.id = ? 
                  AND sai.company_id = ?
                  AND i.statut = 'valide'  
                  AND i.closed_at IS NOT NULL
                  AND datetime(i.closed_at) >= datetime(sa.created_at)
                LIMIT 1
            `).get(itemId, secureCompanyId);

            if (inventairePasse) {
                throw new Error(`Action refusée : Un inventaire nommé "${inventairePasse.libelle}" a été validé le ${inventairePasse.closed_at} après la création de ce mouvement. L'annulation fausserait le stock actuel.`);
            }

            // 🛡️ VERROU 2 : VÉRIFIER L'ÉLEMENT ENFANT
            const item = db.prepare(`
                SELECT product_id, quantite, valeur_ligne, unite_snap 
                FROM stock_adjustment_items 
                WHERE id = ? AND adjustment_id = ? AND company_id = ?
            `).get(itemId, adjustmentId, secureCompanyId);

            if (!item) throw new Error("Ligne d'ajustement introuvable.");
            if (String(item.unite_snap).includes("(ANNULÉ)")) {
                throw new Error("Cette ligne est déjà annulée.");
            }

            const stmtSync = db.prepare(`
                INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
                VALUES (?, ?, ?, ?)
            `);

            // 🔄 ÉTAPE 1 : RESTITUTION DU STOCK DU PRODUIT
            const product = db.prepare(`SELECT stock_actuel, cmp FROM products WHERE id = ? AND company_id = ?`).get(item.product_id, secureCompanyId);
            if (!product) throw new Error("Produit introuvable.");

            const stockAvant = Number(product.stock_actuel || 0);
            const stockApres = stockAvant + Number(item.quantite || 0);

            db.prepare(`UPDATE products SET stock_actuel = ?, sync_status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND company_id = ?`)
                .run(stockApres, item.product_id, secureCompanyId);
            stmtSync.run('products', item.product_id, 'UPDATE', secureCompanyId);

            // 📝 ÉTAPE 2 : TRACABILITÉ DANS LES MOUVEMENTS
            const movementId = `MOV-${uuidv4().substring(0, 8).toUpperCase()}`;
            db.prepare(`
                INSERT INTO stock_movements (
                    id, product_id, type_mouvement, reference_id, quantite, stock_avant, stock_apres, prix_operation, cmp_resultat, user_id, company_id, sync_status
                ) VALUES (?, ?, 'ENTREE', ?, ?, ?, ?, 0, ?, ?, ?, 'pending')
            `).run(movementId, item.product_id, adjustmentId, item.quantite, stockAvant, stockApres, Number(product.cmp || 0), secureUserId, secureCompanyId);
            stmtSync.run('stock_movements', movementId, 'INSERT', secureCompanyId);

            // 📝 ÉTAPE 3 : MARQUER LA LIGNE COMME ANNULÉE
            const nouvelUniteSnap = `${item.unite_snap || ''} (ANNULÉ)`.trim();
            db.prepare(`
                UPDATE stock_adjustment_items 
                SET unite_snap = ?, valeur_ligne = 0, sync_status = 'pending', updated_at = CURRENT_TIMESTAMP 
                WHERE id = ? AND company_id = ?
            `).run(nouvelUniteSnap, itemId, secureCompanyId);
            stmtSync.run('stock_adjustment_items', itemId, 'UPDATE', secureCompanyId);

            // ⚙️ ÉTAPE 4 : RECALCULER LA VALEUR TOTALE DE L'EN-TÊTE
            const restants = db.prepare(`
                SELECT SUM(valeur_ligne) as total FROM stock_adjustment_items 
                WHERE adjustment_id = ? AND company_id = ? AND unite_snap NOT LIKE '%(ANNULÉ)%'
            `).get(adjustmentId, secureCompanyId);

            const nouveauTotal = Number(restants?.total || 0);

            const totalLignesActives = db.prepare(`
                SELECT COUNT(*) as count FROM stock_adjustment_items 
                WHERE adjustment_id = ? AND company_id = ? AND unite_snap NOT LIKE '%(ANNULÉ)%'
            `).get(adjustmentId, secureCompanyId).count;

            if (totalLignesActives === 0) {
                db.prepare(`UPDATE stock_adjustments SET statut = 'ANNULE', valeur_totale = 0, sync_status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND company_id = ?`)
                    .run(adjustmentId, secureCompanyId);
            } else {
                db.prepare(`UPDATE stock_adjustments SET valeur_totale = ?, sync_status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND company_id = ?`)
                    .run(nouveauTotal, adjustmentId, secureCompanyId);
            }
            stmtSync.run('stock_adjustments', adjustmentId, 'UPDATE', secureCompanyId);

            return { adjustmentId, nouveauTotal, enteteAnnulee: totalLignesActives === 0 };
        });

        const result = executeTransaction();
        await logAction({ userId: secureUserId, userName, actionType: 'MODIFICATION', tableConcernee: 'stock_adjustment_items', referenceId: itemId, description: `Annulation de la ligne ${itemId} sur l'ajustement ${adjustmentId}`, companyId: secureCompanyId });
        return { success: true, ...result };
    } catch (error) {
        console.error('💥 Erreur annulation ligne:', error);
        throw error;
    }
},


cancelWholeAdjustment: async (adjustmentId, userContext) => {
    const db = getDb();
    const { secureUserId, secureCompanyId, userName } = userContext;

    try {
        const executeTransaction = db.transaction(() => {
            // 🛡️ VERROU 1 : INVENTAIRE EN COURS
            const inventaireEnCours = db.prepare(`SELECT libelle FROM inventories WHERE company_id = ? AND statut = 'en_cours' LIMIT 1`).get(secureCompanyId);
            if (inventaireEnCours) {
                throw new Error(`Action refusée : Inventaire en cours.`);
            }

            // 🛡️ VERROU 1.5 : INVENTAIRE DÉJÀ PASSÉ (ANTI-LITIGE GLOBAL)
            const inventairePasse = db.prepare(`
                SELECT i.libelle, i.closed_at, sai.nom_article_snap AS article
                FROM stock_adjustment_items sai
                JOIN stock_adjustments sa ON sai.adjustment_id = sa.id
                JOIN inventory_items ii ON sai.product_id = ii.product_id
                JOIN inventories i ON ii.id_inventaire = i.id
                WHERE sa.id = ? 
                  AND sa.company_id = ?
                  AND sai.unite_snap NOT LIKE '%(ANNULÉ)%' 
                  AND i.statut = 'valide'              
                  AND i.closed_at IS NOT NULL
                  AND datetime(i.closed_at) >= datetime(sa.created_at)
                LIMIT 1
            `).get(adjustmentId, secureCompanyId);

            if (inventairePasse) {
                throw new Error(`Action refusée : L'article "${inventairePasse.article}" a fait l'objet d'un inventaire clôturé ("${inventairePasse.libelle}" le ${inventairePasse.closed_at}) après ce mouvement. L'annulation globale fausserait le stock actuel.`);
            }

            // 🛡️ VERROU 2 : VÉRIFIER L'EN-TÊTE
            const adjustment = db.prepare(`SELECT statut FROM stock_adjustments WHERE id = ? AND company_id = ?`).get(adjustmentId, secureCompanyId);
            if (!adjustment) throw new Error("Ajustement introuvable.");
            if (adjustment.statut === 'ANNULE') throw new Error("Cet ajustement est déjà totalement annulé.");

            const stmtSync = db.prepare(`
                INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
                VALUES (?, ?, ?, ?)
            `);

            // 🔄 ÉTAPE 1 : SEULEMENT LES LIGNES NON ENCORE ANNULÉES
            const activeItems = db.prepare(`
                SELECT id, product_id, quantite, unite_snap FROM stock_adjustment_items 
                WHERE adjustment_id = ? AND company_id = ? AND unite_snap NOT LIKE '%(ANNULÉ)%'
            `).all(adjustmentId, secureCompanyId);

            for (const item of activeItems) {
                const product = db.prepare(`SELECT stock_actuel, cmp FROM products WHERE id = ? AND company_id = ?`).get(item.product_id, secureCompanyId);
                
                if (product) {
                    const stockAvant = Number(product.stock_actuel || 0);
                    const stockApres = stockAvant + Number(item.quantite || 0);

                    // Restituer le stock
                    db.prepare(`UPDATE products SET stock_actuel = ?, sync_status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND company_id = ?`)
                        .run(stockApres, item.product_id, secureCompanyId);
                    stmtSync.run('products', item.product_id, 'UPDATE', secureCompanyId);

                    // Mouvement de stock d'annulation
                    const movementId = `MOV-${uuidv4().substring(0, 8).toUpperCase()}`;
                    db.prepare(`
                        INSERT INTO stock_movements (
                            id, product_id, type_mouvement, reference_id, quantite, stock_avant, stock_apres, prix_operation, cmp_resultat, user_id, company_id, sync_status
                        ) VALUES (?, ?, 'ENTREE', ?, ?, ?, ?, 0, ?, ?, ?, 'pending')
                    `).run(movementId, item.product_id, adjustmentId, item.quantite, stockAvant, stockApres, Number(product.cmp || 0), secureUserId, secureCompanyId);
                    stmtSync.run('stock_movements', movementId, 'INSERT', secureCompanyId);
                }

                // Marquer la ligne enfant comme annulée
                const nouvelUniteSnap = `${item.unite_snap || ''} (ANNULÉ)`.trim();
                db.prepare(`UPDATE stock_adjustment_items SET unite_snap = ?, valeur_ligne = 0, sync_status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(nouvelUniteSnap, item.id);
                stmtSync.run('stock_adjustment_items', item.id, 'UPDATE', secureCompanyId);
            }

            // 📝 ÉTAPE 2 : TOUT PASSER À ANNULÉ
            db.prepare(`
                UPDATE stock_adjustments 
                SET statut = 'ANNULE', valeur_totale = 0, sync_status = 'pending', updated_at = CURRENT_TIMESTAMP 
                WHERE id = ? AND company_id = ?
            `).run(adjustmentId, secureCompanyId);
            stmtSync.run('stock_adjustments', adjustmentId, 'UPDATE', secureCompanyId);

            return { id: adjustmentId };
        });

        const result = executeTransaction();
        await logAction({ userId: secureUserId, userName, actionType: 'MODIFICATION', tableConcernee: 'stock_adjustments', referenceId: adjustmentId, description: `Annulation complète de l'ajustement ${adjustmentId}`, companyId: secureCompanyId });
        return { success: true, ...result };
    } catch (error) {
        console.error('💥 Erreur annulation complète:', error);
        throw error;
    }
},






    getProductsForAdjustment: async (companyId) => {
        const db = getDb();
        const query = `
            SELECT 
                p.id, p.nom, 
                IFNULL(p.stock_actuel, 0) AS stock_brut_base, 
                IFNULL(p.cmp, 0) AS prixAchat, 
                IFNULL(p.prixVente, 0) AS prixVente,
                p.codeBarre AS barcode,
                u.coefficient AS unit_coefficient,
                u.code AS unit_code_gros,
                u.unite_reference AS unit_ref_detail
            FROM products p
            LEFT JOIN unites u ON p.unite_id = u.id
            WHERE p.is_active = 1 AND p.company_id = ?
        `;
        const products = db.prepare(query).all(companyId);

        return products.map(p => {
            const pieces = Number(p.stock_brut_base || 0);
            return {
                id: p.id,
                nom: p.nom,
                barcode: p.barcode,
                prixAchat: p.prixAchat,
                prixVente: p.prixVente,
                stock_actuel: pieces,
                unit_coefficient: p.unit_coefficient || 1,
                unit_code_gros: p.unit_code_gros || 'CS',
                unit_ref_detail: p.unit_ref_detail || 'PCS',
                stock_formate: conversestock.formaterStockPourAffichage(
                    pieces,
                    p.unit_coefficient || 1,
                    p.unit_code_gros || 'CS',
                    p.unit_ref_detail || 'PCS'
                )
            };
        });
    },

      getAdjustmentsHistory: async (companyId) => {
        const db = getDb();
        try {
            // 🚀 EXTRACTION UNIQUE ET FIABLE SANS CONFLIT DE COLONNE
            return db.prepare(`
                SELECT 
                    sa.id, 
                    sa.libelle, 
                    sa.type_ajustement, 
                    sa.statut, 
                    sa.motif, 
                    IFNULL(sa.valeur_totale, 0) AS valeur_totale, 
                    sa.created_at, 
                    sa.closed_at,
                    IFNULL(u.username, 'Utilisateur Système') AS nom_utilisateur
                FROM stock_adjustments sa
                LEFT JOIN users u ON sa.user_id = u.id
                WHERE sa.company_id = ?
                ORDER BY sa.created_at DESC
            `).all(companyId);
        } catch (err) {
            console.error("💥 [SQL CRITICAL ERROR] getAdjustmentsHistory failed, retry with fallback query...", err.message);
            return db.prepare(`
                SELECT *, 'Utilisateur' AS nom_utilisateur 
                FROM stock_adjustments 
                WHERE company_id = ? 
                ORDER BY created_at DESC
            `).all(companyId);
        }
    },

    getAdjustmentDetails: async (adjustmentId, companyId) => {
        const db = getDb();
        try {
            return db.prepare(`
                SELECT 
                    sai.id,
                    sai.adjustment_id,
                    sai.product_id,
                    sai.nom_article_snap,
                    sai.prix_achat_snap,
                    sai.prix_vente_snap,
                    sai.unite_snap,
                    sai.quantite,
                    sai.stock_avant,
                    sai.stock_apres,
                    sai.company_id,
                    sai.created_at,
                    IFNULL(p.codeBarre, 'SANS_CODE') AS barcode,
                    
                    -- 🎯 INDICATION VISUELLE POUR REACT (1 = Ligne annulée, 0 = Active)
                    CASE 
                        WHEN sai.unite_snap LIKE '%(ANNULÉ)%' THEN 1 
                        ELSE 0 
                    END AS is_line_cancelled,
                    
                    -- 🎯 RECALCUL TRANSITIONNEL COMPTABLE INTÈGRE DE LA VALEUR DE LA PERTE :
                    -- Forcé à 0 si la ligne contient le tag d'annulation
                    CASE 
                        WHEN sai.unite_snap LIKE '%(ANNULÉ)%' THEN 0
                        WHEN sai.quantite > 0 AND IFNULL(p.coefficient, 1) > 1 
                        THEN ROUND(sai.quantite * (sai.prix_achat_snap / CAST(p.coefficient AS REAL)))
                        ELSE ROUND(sai.quantite * sai.prix_achat_snap)
                    END AS valeur_ligne
                    
                FROM stock_adjustment_items sai
                LEFT JOIN products p ON sai.product_id = p.id
                LEFT JOIN unites u ON p.unite_id = u.id
                WHERE sai.adjustment_id = ? AND sai.company_id = ?
                ORDER BY sai.created_at ASC
            `).all(adjustmentId, companyId);
        } catch (err) {
            console.error("💥 [SQL CRITICAL ERROR] getAdjustmentDetails adaptatif a échoué :", err.message);
            // Repli de secours brut appliquant la même sécurité d'annulation sur la valeur
            return db.prepare(`
                SELECT *, 
                    CASE WHEN unite_snap LIKE '%(ANNULÉ)%' THEN 1 ELSE 0 END AS is_line_cancelled,
                    CASE WHEN unite_snap LIKE '%(ANNULÉ)%' THEN 0 ELSE valeur_ligne END AS valeur_ligne 
                FROM stock_adjustment_items 
                WHERE adjustment_id = ? AND company_id = ?
                ORDER BY created_at ASC
            `).all(adjustmentId, companyId);
        }
    }




};

module.exports = StockAdjustmentService;