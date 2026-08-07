const { getDb } = require('../config/database');
const { logAction } = require('../utils/auditHelper');
const saleComptaService = require('./saleCompta.service');
const conversestock = require('./conversestock'); // 🚀 IMPORTATION DU VERROU CENTRAL ANTI-LITIGE
const crypto = require('crypto');

// --- UTILS INTERNES SÉCURISÉS ---
// ✅ Remplacement par crypto.randomBytes pour garantir l'unicité stricte, même en boucle ultra-rapide
const genererId = (prefix) => `${prefix}-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

const nettoyerNombre = (valeur) => {
    if (typeof valeur === 'number') return valeur;
    if (!valeur) return 0;
    return parseFloat(valeur.toString().replace(',', '.').replace(/[^\d.]/g, '')) || 0;
};

const createProvisionalSale = async (data, userContext) => {
    const db = getDb();
    const { 
        lignes = [], 
        staff_id = null, 
        staff_name = null, 
        table_id = null,         
        table_number = null,     
        nom_client = null, 
        customer_id = null, 
        lot_id = null 
    } = data;
    const { secureUserId, secureCompanyId, userName } = userContext;

    if (!lignes || lignes.length === 0) throw new Error("Le panier est vide.");

    const config = db.prepare(`SELECT default_customer_id, default_staff_id FROM companies WHERE id = ?`).get(secureCompanyId);
    
    // ✅ Sécurisation de l'ID du lot de vente
    const finalLotId = lot_id || genererId('LOT-P'); 
    const finalStaffId = staff_id || config?.default_staff_id;
    const finalClientId = customer_id || config?.default_customer_id;
    let nomClientFinal = (nom_client || 'CLIENT AU COMPTANT').toUpperCase();

    // ✅ 1. DÉCLARATION PROPRE DE LA TRANSACTION SQLITE
    const executerTransaction = db.transaction(() => {

        // =========================================================================
        // 🛡️ VERROU DE SÉCURITÉ CENTRALISÉ : REJET SI INVENTAIRE EN COURS
        // =========================================================================
        const inventaireEnCours = db.prepare(`
            SELECT libelle FROM inventories 
            WHERE company_id = ? AND statut = 'en_cours' 
            LIMIT 1
        `).get(secureCompanyId);

        if (inventaireEnCours) {
            // Le type d'erreur s'adapte selon le contexte (Table ou Camion)
            const typeOperation = table_id ? "vente provisoire sur table" : "chargement de camion / tournée";
            throw new Error(`Action refusée : Impossible de lancer ce ${typeOperation}. L'inventaire "${inventaireEnCours.libelle}" est actuellement ouvert. Tout mouvement de stock est figé.`);
        }
        // =========================================================================

        const dateVente = new Date().toISOString();

        const insertProvisional = db.prepare(`
            INSERT INTO provisional_sales 
            (id, lot_id, id_vente, customer_id, nom_client_snap, date_vente, user_id, staff_id, staff_name_snap, table_id, table_name_snap, company_id, product_id, nom_article_snap, quantite, prix_vente_unitaire, 
            prix_achat_unitaire_snap, montant_achat_total_snap, 
            remise_montant, montant_ht, taxe_montant, montant_ttc_ligne, stock_avant_vente, stock_apres_vente, sync_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        `);

        const updateStock = db.prepare(`UPDATE products SET stock_actuel = ?, sync_status = 'pending' WHERE id = ? AND company_id = ?`);
        const insertMovement = db.prepare(`INSERT INTO stock_movements (id, product_id, type_mouvement, reference_id, quantite, stock_avant, stock_apres, user_id, company_id, sync_status) VALUES (?, ?, 'VENTE_PROVISOIRE', ?, ?, ?, ?, ?, ?, 'pending')`);
        const insertSync = db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES (?, ?, ?, ?)`);
        
        const getProduct = db.prepare(`
            SELECT p.stock_actuel, p.cmp, p.nom, u.coefficient, u.code, u.unite_reference 
            FROM products p 
            LEFT JOIN unites u ON p.unite_id = u.id
            WHERE p.id = ? AND p.company_id = ?
        `);

        lignes.forEach(item => {
            const productId = item.product_id.toString();
            const product = getProduct.get(productId, secureCompanyId);
            if (!product) throw new Error(`Produit introuvable : ${item.nom_article_snap}`);

            const qtePiecesProvisoire = conversestock.calculerUnitesNatives(
                db, 
                productId, 
                item.quantite,
                item.saisie_gros,
                item.saisie_detail
            );

            if (qtePiecesProvisoire <= 0) {
                throw new Error(`La quantité provisoire pour l'article "${product.nom}" géré au détail est invalide ou nulle.`);
            }

            const stAv = Number(product.stock_actuel || 0);
            const stAp = Math.round(stAv - qtePiecesProvisoire);
            
            if (stAp < 0) {
                const stockDispoFormate = conversestock.formaterStockPourAffichage(
                    stAv, product.coefficient, product.code, product.unite_reference
                );
                const qteDemandeeFormatee = conversestock.formaterStockPourAffichage(
                    qtePiecesProvisoire, product.coefficient, product.code, product.unite_reference
                );
                throw new Error(`Stock insuffisance pour l'article "${product.nom}". Disponible en magasin : ${stockDispoFormate}, Demandé : ${qteDemandeeFormatee}.`);
            }
            
            const mtTTCLigne = nettoyerNombre(item.montant_ttc_ligne);
            const puVentePieces = mtTTCLigne / qtePiecesProvisoire;

            const coeffLogistique = Number(product.coefficient || 1);
            const puAchatPiecesSnap = Number(product.cmp || 0) / coeffLogistique;
            
            const mtAchatTotalLigneSnap = Math.round((qtePiecesProvisoire * puAchatPiecesSnap) * 100) / 100;

            // ✅ IDs désormais totalement uniques à chaque itération de la boucle
            const movementId = genererId('MOV');
            insertMovement.run(movementId, productId, finalLotId, -qtePiecesProvisoire, stAv, stAp, secureUserId, secureCompanyId);

            const venteId = genererId('VTE');
            insertProvisional.run(
                venteId, finalLotId, item.id_vente || genererId('REF'), finalClientId, nomClientFinal, dateVente, secureUserId, finalStaffId, staff_name || userName, 
                table_id, table_number, 
                secureCompanyId, productId, item.nom_article_snap || product.nom, qtePiecesProvisoire, 
                puVentePieces, 
                puAchatPiecesSnap,       
                mtAchatTotalLigneSnap,   
                nettoyerNombre(item.remise_montant), nettoyerNombre(item.montant_ht), nettoyerNombre(item.taxe_montant), mtTTCLigne,
                stAv, stAp
            );

            updateStock.run(stAp, productId, secureCompanyId);
            insertSync.run('products', productId, 'UPDATE', secureCompanyId);
            insertSync.run('stock_movements', movementId, 'INSERT', secureCompanyId);
            insertSync.run('provisional_sales', venteId, 'INSERT', secureCompanyId);
        });

        db.prepare(`DELETE FROM temporary_provisional_carts WHERE user_id = ? AND company_id = ?`).run(secureUserId, secureCompanyId);
        logAction({ userId: secureUserId, userName, actionType: 'INSERTION', tableConcernee: 'provisional_sales', referenceId: finalLotId, description: `Vente provisoire : ${finalLotId} pour ${nomClientFinal}.`, companyId: secureCompanyId });
        
        return { finalLotId, finalStaffName: staff_name || userName, nomClientFinal };
    });

    return executerTransaction();
};


const validateProvisionalSale = async (lotId, data, userContext) => {
    const db = getDb();
    const { secureUserId, secureCompanyId, userName } = userContext;
    const { moyen_paiement, montant_recu, is_partial, item_ids } = data;

    const genererIdLocal = (prefix) => `${prefix}-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

    const executionTransaction = db.transaction(() => {
        // 1. Récupération des lignes provisoires (Totalité ou Sélection Partielle)
        let lines = [];
        if (is_partial && Array.isArray(item_ids) && item_ids.length > 0) {
            const placeholders = item_ids.map(() => '?').join(',');
            lines = db.prepare(`
                SELECT * FROM provisional_sales 
                WHERE lot_id = ? AND company_id = ? AND id IN (${placeholders})
            `).all(lotId, secureCompanyId, ...item_ids);
        } else {
            lines = db.prepare(`
                SELECT * FROM provisional_sales 
                WHERE lot_id = ? AND company_id = ?
            `).all(lotId, secureCompanyId);
        }

        if (lines.length === 0) throw new Error("Aucun article trouvé à valider pour ce lot.");

        // 🎯 VÉRIFICATION : Est-ce qu'une vente définitive existe déjà pour ce lot_id ? (Cas des paiements échelonnés successifs)
        let existingSale = db.prepare(`
            SELECT id FROM sales WHERE lot_id = ? AND company_id = ? AND statut_vente = 'VALIDEE'
        `).get(lotId, secureCompanyId);

        let idVenteDefinitive;
        const dateNow = new Date().toISOString();
        const totalVente = lines.reduce((sum, item) => sum + Number(item.montant_ttc_ligne || 0), 0);
        const montantRecuClean = nettoyerNombre(montant_recu);

        if (existingSale) {
            // Si la vente existe déjà (paiement échelonné d'un même bon), on réutilise son ID et on met à jour le montant total
            idVenteDefinitive = existingSale.id;
            db.prepare(`
                UPDATE sales 
                SET montant_total = montant_total + ?, montant_paye = montant_paye + ?
                WHERE id = ?
            `).run(totalVente, totalVente, idVenteDefinitive);
        } else {
            // Sinon, création de la première en-tête de vente pour ce lot
            idVenteDefinitive = genererIdLocal('SAL'); 
            db.prepare(`
                INSERT INTO sales (
                    id, lot_id, customer_id, nom_client_snap, date_vente, 
                    statut_vente, montant_total, montant_paye, reste_a_payer, 
                    payment_status, mode_reglement, user_id, caissier_id, 
                    staff_id, staff_name_snap, table_id, table_name_snap, company_id, 
                    is_comptabilise, sync_status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                idVenteDefinitive, lotId, lines[0].customer_id, lines[0].nom_client_snap, dateNow, 
                'VALIDEE', totalVente, totalVente, 0, 'PAYE', 
                moyen_paiement, 
                lines[0].user_id, secureUserId, lines[0].staff_id, lines[0].staff_name_snap, 
                lines[0].table_id, lines[0].table_name_snap, secureCompanyId, 0, 'pending'
            );

            db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('sales', ?, 'INSERT', ?)").run(idVenteDefinitive, secureCompanyId);
        }

        const stmtItem = db.prepare(`
            INSERT INTO sale_items (
                id, lot_id, id_vente, customer_id, type_ligne, product_id, nom_article_snap, 
                quantite, prix_vente_unitaire, prix_achat_unitaire_snap, montant_achat_total_snap, 
                remise_montant, montant_ht, taxe_montant, montant_ttc_ligne, stock_avant_vente, 
                stock_apres_vente, user_id, company_id, is_comptabilise, sync_status
            ) VALUES (?, ?, ?, ?, 'VENTE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'pending')
        `);

        const stmtMouvement = db.prepare(`
            INSERT INTO stock_movements (
                id, product_id, type_mouvement, reference_id, 
                quantite, stock_avant, stock_apres, prix_operation, 
                cmp_resultat, user_id, company_id, sync_status
            ) VALUES (?, ?, 'VENTE', ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        `);

        // Nettoyage ciblé des mouvements provisoires pour les produits en cours de validation
        const productIdsToClean = [...new Set(lines.map(l => l.product_id))];
        if (productIdsToClean.length > 0) {
            const placeholdersProd = productIdsToClean.map(() => '?').join(',');
            db.prepare(`
                DELETE FROM stock_movements 
                WHERE reference_id = ? AND type_mouvement = 'VENTE_PROVISOIRE' 
                  AND company_id = ? AND product_id IN (${placeholdersProd})
            `).run(lotId, secureCompanyId, ...productIdsToClean);
        }

        lines.forEach(line => {
            const saleItemId = genererIdLocal('SITM');
            
            const product = db.prepare(`
                SELECT p.stock_actuel, p.cmp, u.coefficient 
                FROM products p
                LEFT JOIN unites u ON p.unite_id = u.id
                WHERE p.id = ? AND p.company_id = ?
            `).get(line.product_id, secureCompanyId);

            const currentStockMagasin = product ? Number(product.stock_actuel || 0) : 0;
            const currentCMP = product ? Number(product.cmp || 0) : 0;
            const coeffLogistique = product ? Number(product.coefficient || 1) : 1;
            
            const qtePiecesTransfert = Math.abs(nettoyerNombre(line.quantite));

            let puAchatPiecesSnap = Number(line.prix_achat_unitaire_snap || 0);
            let mtAchatTotalLigneSnap = Number(line.montant_achat_total_snap || 0);

            if (puAchatPiecesSnap === 0 || mtAchatTotalLigneSnap === 0) {
                puAchatPiecesSnap = coeffLogistique > 0 ? (currentCMP / coeffLogistique) : currentCMP;
                mtAchatTotalLigneSnap = Math.round((qtePiecesTransfert * puAchatPiecesSnap) * 100) / 100;
            }

            const stockAvantReel = currentStockMagasin + qtePiecesTransfert;
            const stockApresReel = currentStockMagasin;

            stmtItem.run(
                saleItemId, lotId, idVenteDefinitive, line.customer_id, line.product_id, 
                line.nom_article_snap, qtePiecesTransfert, line.prix_vente_unitaire, 
                puAchatPiecesSnap, mtAchatTotalLigneSnap, 
                line.remise_montant, line.montant_ht, line.taxe_montant, 
                line.montant_ttc_ligne, stockAvantReel, stockApresReel, 
                secureUserId, secureCompanyId
            );

            const moveId = genererIdLocal('MOV');
            
            stmtMouvement.run(
                moveId,               // 1. id
                line.product_id,        // 2. product_id
                idVenteDefinitive,      // 3. reference_id
                -qtePiecesTransfert,    // 4. quantite
                stockAvantReel,         // 5. stock_avant
                stockApresReel,         // 6. stock_apres
                line.prix_vente_unitaire, // 7. prix_operation
                currentCMP,             // 8. cmp_resultat
                secureUserId,           // 9. user_id
                secureCompanyId         // 10. company_id
            );

            db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('sale_items', ?, 'INSERT', ?)").run(saleItemId, secureCompanyId);
            db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('stock_movements', ?, 'INSERT', ?)").run(moveId, secureCompanyId);
        });

        // Enregistrement du paiement partiel ou total
        const paymentId = genererIdLocal('PAY');
        const renduCalcule = Math.max(0, Number((montantRecuClean - totalVente).toFixed(2)));

        db.prepare(`
            INSERT INTO payments (id, lot_id, sale_id, customer_id, client_name, montant, recu, rendu, moyen_paiement, user_id, caissier_id, company_id, sync_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        `).run(paymentId, lotId, idVenteDefinitive, lines[0].customer_id, lines[0].nom_client_snap, totalVente, montantRecuClean, renduCalcule, moyen_paiement, secureUserId, secureUserId, secureCompanyId);

        db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('payments', ?, 'INSERT', ?)").run(paymentId, secureCompanyId);
        db.prepare(`INSERT INTO compta_queue (table_source, record_id, company_id, status) VALUES ('sales', ?, ?, 'pending')`).run(idVenteDefinitive, secureCompanyId);
        db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('compta_queue', ?, 'INSERT', ?)").run(idVenteDefinitive, secureCompanyId);
        
        // 🎯 PURGE SÉLECTIVE : Suppression uniquement des lignes validées de la table provisoire
        const validatedIds = lines.map(l => l.id);
        const placeholdersDel = validatedIds.map(() => '?').join(',');
        db.prepare(`
            DELETE FROM provisional_sales 
            WHERE lot_id = ? AND company_id = ? AND id IN (${placeholdersDel})
        `).run(lotId, secureCompanyId, ...validatedIds);

        if (typeof logAction === 'function') {
            logAction({ 
                userId: secureUserId, 
                userName, 
                actionType: is_partial ? 'TRANSFERT_PARTIEL' : 'TRANSFERT', 
                tableConcernee: 'sales', 
                referenceId: idVenteDefinitive, 
                description: `Validation ${is_partial ? 'partielle' : 'totale'} vente provisoire : ${lotId} (${lines.length} article(s)) transférée(s) vers Vente Réelle ${idVenteDefinitive}.`, 
                companyId: secureCompanyId 
            });
        }

        return { success: true, id: idVenteDefinitive, is_partial };
    });

    return executionTransaction();
};


// --- ROUTE D'AFFICHAGE ÉCRAN EN ATTENTE CORRIGÉE ---
const getProvisionalSales = async (companyId) => {
    const db = getDb();
    
    // On fournit table_name_snap ET table_number_snap pour satisfaire le composant React
    const rows = db.prepare(`
        SELECT 
            ps.lot_id, 
            MAX(ps.nom_client_snap) as nom_client_snap, 
            MAX(ps.staff_name_snap) as staff_name_snap, 
            MAX(ps.table_name_snap) as table_name_snap,      -- Aligné sur le nom en BDD
            MAX(ps.table_name_snap) as table_number_snap,   -- Alias de secours pour le Front
            MAX(ps.user_id) as user_id_createur, 
            MAX(u.username) as username_createur, 
            SUM(CAST(COALESCE(ps.montant_ttc_ligne, 0) AS REAL)) as total, 
            SUM(ps.quantite) as qte_vendue,                  -- Agrégation brute des pièces unitaires de détail pour conversion
            MAX(IFNULL(un.coefficient, 1)) as unit_coefficient,        
            MAX(IFNULL(un.code, 'CS')) as unit_code_gros,                 
            MAX(IFNULL(un.unite_reference, 'PCS')) as unit_ref_detail,      
            MAX(ps.date_vente) as date_tri
        FROM provisional_sales ps
        LEFT JOIN users u ON ps.user_id = u.id
        LEFT JOIN products prod ON ps.product_id = prod.id
        LEFT JOIN unites un ON prod.unite_id = un.id
        WHERE ps.company_id = ? 
          AND (ps.table_name_snap IS NULL OR ps.table_name_snap != 'COMMERCIAL') -- 🚀 MASQUE LES TOURNÉES COMMERCIALES
        GROUP BY ps.lot_id 
        ORDER BY date_tri DESC
    `).all(companyId.toString());

    // 🚀 HYDRATATION LOGISTIQUE INVERSE CENTRALISÉE DES COMMANDES PROVISOIRES (ANTI-LITIGE)
    return rows.map(row => {
        const qteBruteVentePieces = Math.abs(Number(row.qte_vendue || 0));

        const expressionLogistique = conversestock.formaterStockPourAffichage(
            qteBruteVentePieces,
            row.unit_coefficient || 1,
            row.unit_code_gros || 'CS',
            row.unit_ref_detail || 'PCS'
        );

        return {
            ...row,
            qte_vendue_formatee: expressionLogistique // Donnée lue par l'interface des commandes en attente
        };
    });
};

const getProvisionalSaleDetails = async (lotId, companyId) => {
    const db = getDb();
    
    // 1. Lecture brute des lignes en attente avec jointure des conditionnements produits
    const rows = db.prepare(`
        SELECT ps.*,
               IFNULL(u_mesure.coefficient, 1) as unit_coefficient,
               IFNULL(u_mesure.code, 'CS') as unit_code_gros,
               IFNULL(u_mesure.unite_reference, 'PCS') as unit_ref_detail
        FROM provisional_sales ps
        LEFT JOIN products p ON ps.product_id = p.id
        LEFT JOIN unites u_mesure ON p.unite_id = u_mesure.id
        WHERE ps.lot_id = ? 
          AND ps.company_id = ?
          AND (ps.table_name_snap IS NULL OR ps.table_name_snap != 'TOURNÉE COMMERCIALE') -- 🚀 MASQUE LES TOURNÉES COMMERCIALES SUR LES DÉTAILS
    `).all(lotId, companyId.toString());

    // 2. 🚀 HYDRATATION LOGISTIQUE CENTRALE (Décodage Opération 2 pour l'écran de caisse en attente)
    return rows.map(row => {
        const qteBrutePieces = Math.abs(Number(row.quantite || 0));
        return {
            ...row,
            // 💡 Variable lue par votre écran de facturation provisoire pour éviter les zéros ou décalages
            quantite_formatee: conversestock.formaterStockPourAffichage(
                qteBrutePieces, 
                row.unit_coefficient, 
                row.unit_code_gros, 
                row.unit_ref_detail
            )
        };
    });
};


const rejectProvisionalSale = async (lotId, userContext) => {
    const db = getDb();
    const { secureUserId: currentUserId, secureCompanyId, userName } = userContext;

    if (!lotId) throw new Error("ID du lot manquant.");

    // Définition de la transaction sécurisée
    const executeReject = db.transaction(() => {
        // 1. Récupérer les articles ET l'ID du créateur (🚀 Extraction des métadonnées de l'unité pour l'audit)
        const lines = db.prepare(`
            SELECT ps.product_id, ps.quantite, ps.user_id as creator_id,
                   IFNULL(u.coefficient, 1) as coefficient, 
                   IFNULL(u.code, 'CS') as code, 
                   IFNULL(u.unite_reference, 'PCS') as unite_reference
            FROM provisional_sales ps
            LEFT JOIN products p ON ps.product_id = p.id
            LEFT JOIN unites u ON p.unite_id = u.id
            WHERE ps.lot_id = ? AND ps.company_id = ?
        `).all(lotId, secureCompanyId);

        if (lines.length === 0) throw new Error("Vente provisoire introuvable ou déjà traitée.");

        const creatorId = lines[0].creator_id;

        const stmtGetStock = db.prepare(`SELECT stock_actuel FROM products WHERE id = ? AND company_id = ?`);
        const stmtUpdateStock = db.prepare(`UPDATE products SET stock_actuel = ?, sync_status = 'pending' WHERE id = ? AND company_id = ?`);
        const stmtInsertMovement = db.prepare(`
            INSERT INTO stock_movements (id, product_id, type_mouvement, reference_id, quantite, stock_avant, stock_apres, user_id, company_id, sync_status) 
            VALUES (?, ?, 'REJET_PROVISOIRE', ?, ?, ?, ?, ?, ?, 'pending')
        `);

        let totalVolumeRejeteTxt = [];

        lines.forEach(line => {
            const product = stmtGetStock.get(line.product_id, secureCompanyId);
            if (product) {
                const stAv = Number(product.stock_actuel || 0);
                
                // 🚀 PROTECTION LOGISTIQUE : Récupération brute des pièces natives entières directement depuis la table
                const qteRejetPieces = Math.abs(Number(line.quantite || 0));

                // 🛡️ REINTEGRATION STRICTE ANTI-LITIGE : Uniquement sur les entiers de pièces de détail natives
                const stAp = Math.round(stAv + qteRejetPieces);

                // Mise à jour physique du stock natif unitaire de détail
                stmtUpdateStock.run(stAp, line.product_id, secureCompanyId);

                // Capture de l'expression pour l'historique d'audit
                const txtFormate = conversestock.formaterStockPourAffichage(
                    qteRejetPieces, line.coefficient, line.code, line.unite_reference
                );
                totalVolumeRejeteTxt.push(txtFormate);

                // Mouvement complet (avec snapshots positifs pour l'annulation de sortie)
                const moveId = genererId('MOV');
                stmtInsertMovement.run(moveId, line.product_id, lotId, qteRejetPieces, stAv, stAp, currentUserId, secureCompanyId);
                
                db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('products', ?, 'UPDATE', ?)")
                  .run(line.product_id, secureCompanyId);
                db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('stock_movements', ?, 'INSERT', ?)")
                  .run(moveId, secureCompanyId);
            }
        });

        // 2. Suppression de la vente provisoire annulée
        db.prepare(`DELETE FROM provisional_sales WHERE lot_id = ? AND company_id = ?`).run(lotId, secureCompanyId);

        // 3. Nettoyage des paniers temporaires serveurs
        db.prepare(`DELETE FROM temporary_provisional_carts WHERE user_id = ? AND company_id = ?`).run(creatorId, secureCompanyId);
        if (creatorId !== currentUserId) {
            db.prepare(`DELETE FROM temporary_provisional_carts WHERE user_id = ? AND company_id = ?`).run(currentUserId, secureCompanyId);
        }

        // 4. Audit complet de réintégration
        logAction({ 
            userId: currentUserId, userName, actionType: 'MODIFICATION', 
            tableConcernee: 'provisional_sales', referenceId: lotId, 
            description: `REJET TOTAL : Lot ${lotId}. Stock rendu en magasin (${totalVolumeRejeteTxt.join(', ')}) et paniers serveurs vidés.`, 
            companyId: secureCompanyId 
        });

        return {
            success: true,
            message: "La vente provisoire a été rejetée, le stock réintégré et les paniers effacés."
        };
    });

    // EXECUTION de la transaction commit
    return executeReject(); 
};

// --- GESTION DU PANIER (PROVISOIRE) ---
const saveTemporaryCart = async (userId, companyId, lignes) => {
    const db = getDb();
    const lignesArr = Array.isArray(lignes) ? lignes : [];
    
    if (lignesArr.length === 0) {
        return db.prepare(`DELETE FROM temporary_provisional_carts WHERE user_id = ? AND company_id = ?`)
                 .run(userId, companyId);
    }

    // 🚀 ALIGNEMENT TOTAL INTERFACE : Conserve intactes les clés 'saisie_gros' et 'saisie_detail'
    return db.prepare(`
        INSERT INTO temporary_provisional_carts (user_id, company_id, lignes, updated_at) 
        VALUES (?, ?, ?, CURRENT_TIMESTAMP) 
        ON CONFLICT(user_id, company_id) 
        DO UPDATE SET lignes = EXCLUDED.lignes, updated_at = CURRENT_TIMESTAMP
    `).run(userId, companyId, JSON.stringify(lignesArr));
};

const getTemporaryCart = async (userId, companyId) => {
    const row = getDb().prepare(`SELECT lignes FROM temporary_provisional_carts WHERE user_id = ? AND company_id = ?`)
                        .get(userId, companyId);
    if (!row || !row.lignes) return [];
    try {
        return JSON.parse(row.lignes);
    } catch (err) {
        console.error("🚨 [PROV CART SERVICE] Erreur parsing JSON panier en attente :", userId, err.message);
        return [];
    }
};

const deleteTemporaryCart = async (userId, companyId) => {
    return getDb().prepare(`DELETE FROM temporary_provisional_carts WHERE user_id = ? AND company_id = ?`).run(userId, companyId);
};

const deleteProvisionalItem = async (itemId, userContext) => {
    const db = getDb();
    const { secureUserId: userId, secureCompanyId } = userContext;

    return db.transaction(() => {
        // 1. Récupérer et vérifier la ligne provisoire (🚀 Jointures d'unités pour l'hydratation UI intégrées)
        const item = db.prepare(`
            SELECT ps.*,
                   u.coefficient as unit_coefficient,
                   u.code as unit_code_gros,
                   u.unite_reference as unit_ref_detail
            FROM provisional_sales ps
            LEFT JOIN products prod ON ps.product_id = prod.id
            LEFT JOIN unites u ON prod.unite_id = u.id
            WHERE ps.id = ? AND ps.company_id = ?
        `).get(itemId, secureCompanyId);
        
        if (!item) throw new Error("Ligne non trouvée");
        
        const product = db.prepare(`SELECT stock_actuel FROM products WHERE id = ?`).get(item.product_id);
        if (!product) throw new Error("Produit rattaché introuvable lors de l'annulation partielle.");

        const stockAvant = Number(product.stock_actuel || 0);
        
        // 🚀 PROTECTION LOGISTIQUE : Lecture de la quantité brute d'unités de détail
        const qteRejetPartielPieces = Math.abs(Number(item.quantite || 0));

        // 🛡️ REINTEGRATION LOGISTIQUE STRICTE : Uniquement sur des pièces entières natives
        const stockApres = Math.round(stockAvant + qteRejetPartielPieces);
        
        db.prepare(`UPDATE products SET stock_actuel = ?, sync_status = 'pending' WHERE id = ? AND company_id = ?`).run(stockApres, item.product_id, secureCompanyId);
        
        const moveId = genererId('MOV');
        db.prepare(`INSERT INTO stock_movements (id, product_id, type_mouvement, reference_id, quantite, stock_avant, stock_apres, user_id, company_id, sync_status) VALUES (?, ?, 'REJET_PARTIEL', ?, ?, ?, ?, ?, ?, 'pending')`).run(moveId, item.product_id, item.lot_id, qteRejetPartielPieces, stockAvant, stockApres, userId, secureCompanyId);
        db.prepare(`DELETE FROM provisional_sales WHERE id = ?`).run(itemId);
        
        const insertSync = db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES (?, ?, ?, ?)`);
        insertSync.run('provisional_sales', itemId, 'DELETE', secureCompanyId);
        insertSync.run('products', item.product_id, 'UPDATE', secureCompanyId);
        insertSync.run('stock_movements', moveId, 'INSERT', secureCompanyId);

        // 🚀 CONFIRMATION ENRICHIE COMPATIBLE CONTROLLER AVEC VALEURS LOGISTIQUES CORRIGÉES
        return {
            success: true,
            qte_mouvementee: qteRejetPartielPieces,
            coefficient: item.unit_coefficient || 1,
            unit_code_gros: item.unit_code_gros || 'CS',
            unit_ref_detail: item.unit_ref_detail || 'PCS'
        };
    })();
};

/**
 * AJOUT : Met à jour une vente provisoire existante en ajoutant de nouvelles lignes.
 */
const updateProvisionalSale = async (lotId, data, userContext) => {
    const db = getDb();
    const { secureCompanyId } = userContext;

    // 1. Récupérer les anciennes lignes pour restaurer le stock au propre avant réévaluation
    const anciennesLignes = db.prepare(`
        SELECT product_id, quantite 
        FROM provisional_sales 
        WHERE lot_id = ? AND company_id = ?
    `).all(lotId, secureCompanyId);

    if (!anciennesLignes || anciennesLignes.length === 0) {
        throw new Error("Impossible de mettre à jour : ce bon de commande n'existe pas ou est vide.");
    }

    const getProduct = db.prepare(`SELECT stock_actuel FROM products WHERE id = ? AND company_id = ?`);
    const updateStock = db.prepare(`UPDATE products SET stock_actuel = ?, sync_status = 'pending' WHERE id = ? AND company_id = ?`);

    // ✅ ÉTAPE SYNCHRONE : Pas de "async/await" ni de "return" de promesse ici. 
    // On nettoie l'ancien état de manière purement synchrone.
    db.transaction(() => {
        // A. On recrédite le stock des articles pour annuler l'impact de l'ancienne vente
        anciennesLignes.forEach(oldLine => {
            const product = getProduct.get(oldLine.product_id.toString(), secureCompanyId);
            if (product) {
                const stockAvant = Number(product.stock_actuel || 0);
                const stockApres = Math.round(stockAvant + Number(oldLine.quantite || 0));
                updateStock.run(stockApres, oldLine.product_id.toString(), secureCompanyId);
            }
        });

        // 🎯 NETTOYAGE ANTI-DOUBLON : Supprime aussi les anciens mouvements provisoires pour ne pas polluer l'historique
        db.prepare(`
            DELETE FROM stock_movements 
            WHERE reference_id = ? 
              AND type_mouvement = 'VENTE_PROVISOIRE' 
              AND company_id = ?
        `).run(lotId, secureCompanyId);

        // B. On supprime proprement toutes les anciennes lignes rattachées à ce lot
        db.prepare(`DELETE FROM provisional_sales WHERE lot_id = ? AND company_id = ?`).run(lotId, secureCompanyId);
    })(); // 👈 La transaction synchrone s'arrête et applique les modifications ici.

    // 2. On s'assure que le lot_id du formulaire correspond bien à celui à mettre à jour
    const dataAjustee = {
        ...data,
        lot_id: lotId
    };

    // 3. On appelle la fonction de création classique (Asynchrone) à l'EXTÉRIEUR du bloc de transaction précédent
    // Elle lancera sa propre transaction SQLite interne en toute sécurité.
    return await createProvisionalSale(dataAjustee, userContext);
};




const createCommercialTourProvisional = async (data, userContext) => {
    const db = getDb();
    const { 
        lignes = [], 
        staff_id = null, 
        staff_name = null, 
        lot_id = null 
    } = data;
    const { secureUserId, secureCompanyId, userName } = userContext;

    if (!lignes || lignes.length === 0) throw new Error("Le panier de chargement est vide.");

    const config = db.prepare(`SELECT default_customer_id, default_staff_id FROM companies WHERE id = ?`).get(secureCompanyId);
    
    // 🎯 SÉCURISATION DU NUMÉRO DE LOT
    const finalLotId = (lot_id && String(lot_id).trim() !== "") 
        ? String(lot_id).trim() 
        : `TOUR-${crypto.randomBytes(4).toString('hex').toUpperCase()}`; 
        
    const finalStaffId = staff_id || config?.default_staff_id;
    const finalClientId = config?.default_customer_id || 'DEFAULT_CUST';
    const finalStaffName = staff_name || userName;

    // ✅ 1. TRANSACTION SÉCURISÉE (SYNCHRONE POUR BETTER-SQLITE3)
    const executerTransaction = db.transaction(() => {

        // =========================================================================
        // 🛡️ VERROU DE SÉCURITÉ CENTRALISÉ : REJET SI INVENTAIRE EN COURS
        // =========================================================================
        const inventaireEnCours = db.prepare(`
            SELECT libelle FROM inventories 
            WHERE company_id = ? AND statut = 'en_cours' 
            LIMIT 1
        `).get(secureCompanyId);

        if (inventaireEnCours) {
            throw new Error(`Action refusée : Impossible de valider ce chargement de camion. L'inventaire "${inventaireEnCours.libelle}" est actuellement ouvert. Tout mouvement de stock est figé.`);
        }
        // =========================================================================

        const dateVente = new Date().toISOString();

        const insertProvisional = db.prepare(`
            INSERT INTO provisional_sales 
            (id, lot_id, id_vente, customer_id, nom_client_snap, date_vente, user_id, staff_id, staff_name_snap, table_id, table_name_snap, company_id, product_id, nom_article_snap, quantite, prix_vente_unitaire, 
            prix_achat_unitaire_snap, montant_achat_total_snap, remise_montant, montant_ht, taxe_montant, montant_ttc_ligne, stock_avant_vente, stock_apres_vente, sync_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        `);

        const updateStock = db.prepare(`UPDATE products SET stock_actuel = ?, sync_status = 'pending' WHERE id = ? AND company_id = ?`);
        
        const insertMovement = db.prepare(`
            INSERT INTO stock_movements 
            (id, product_id, type_mouvement, reference_id, quantite, stock_avant, stock_apres, user_id, company_id, sync_status) 
            VALUES (?, ?, 'COMMERCIAL', ?, ?, ?, ?, ?, ?, 'pending')
        `);

        const insertSync = db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES (?, ?, ?, ?)`);
        
        const getProduct = db.prepare(`
            SELECT p.stock_actuel, p.cmp, p.nom, u.coefficient, u.code, u.unite_reference 
            FROM products p 
            LEFT JOIN unites u ON p.unite_id = u.id
            WHERE p.id = ? AND p.company_id = ?
        `);

        lignes.forEach(item => {
            const productId = item.product_id.toString();
            const product = getProduct.get(productId, secureCompanyId);
            if (!product) throw new Error(`Produit introuvable : ${item.nom_article_snap}`);

            const expressionCombinee = `${item.saisie_gros || 0}+${item.saisie_detail || 0}`;

            const qtePiecesProvisoire = conversestock.calculerUnitesNatives(
                db, 
                productId, 
                expressionCombinee
            );

            if (qtePiecesProvisoire <= 0) {
                throw new Error(`La quantité provisoire pour l'article "${product.nom}" géré au détail est invalide ou nulle.`);
            }

            const stAv = Number(product.stock_actuel || 0);
            const stAp = Math.round(stAv - qtePiecesProvisoire); 
            
            if (stAp < 0) {
                const stockDispoFormate = conversestock.formaterStockPourAffichage(
                    stAv, product.coefficient, product.code, product.unite_reference
                );
                const qteDemandeeFormatee = conversestock.formaterStockPourAffichage(
                    qtePiecesProvisoire, product.coefficient, product.code, product.unite_reference
                );
                throw new Error(`Stock insuffisant pour l'article "${product.nom}". Disponible au dépôt : ${stockDispoFormate}, Demandé : ${qteDemandeeFormatee}.`);
            }
            
            const mtTTCLigne = nettoyerNombre(item.montant_ttc_ligne);
            const puVentePieces = mtTTCLigne / qtePiecesProvisoire;

            const coeffLogistique = Math.max(1, Number(product.coefficient || 1));
            const puAchatPiecesSnap = Number(product.cmp || 0) / coeffLogistique;
            const mtAchatTotalLigneSnap = Math.round((qtePiecesProvisoire * puAchatPiecesSnap) * 100) / 100;

            const movementId = `MOV-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
            
            // ✅ ALIGNEMENT DES ARGUMENTS CONSERVÉ (8 variables pour correspondre aux 8 '?' du SQL)
            insertMovement.run(
                movementId,          // 1. id
                productId,           // 2. product_id
                finalLotId,          // 3. reference_id
                qtePiecesProvisoire, // 4. quantite
                stAv,                // 5. stock_avant
                stAp,                // 6. stock_apres
                secureUserId,        // 7. user_id
                secureCompanyId      // 8. company_id
            );

            const venteId = `VTEC-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
            insertProvisional.run(
                venteId, 
                finalLotId, 
                item.id_vente || `REF-${crypto.randomBytes(4).toString('hex').toUpperCase()}`, 
                finalClientId, 
                'COMMERCIAL', 
                dateVente, 
                secureUserId, 
                finalStaffId, 
                finalStaffName, 
                null, 
                'COMMERCIAL', 
                secureCompanyId, 
                productId, 
                item.nom_article_snap || product.nom, 
                qtePiecesProvisoire, 
                puVentePieces, 
                puAchatPiecesSnap, 
                mtAchatTotalLigneSnap, 
                0, 
                mtTTCLigne, 
                0, 
                mtTTCLigne,
                stAv, 
                stAp
            );

            updateStock.run(stAp, productId, secureCompanyId);

            insertSync.run('stock_movements', movementId, 'INSERT', secureCompanyId);
            insertSync.run('provisional_sales', venteId, 'INSERT', secureCompanyId);
        });

        logAction({ userId: secureUserId, userName, actionType: 'INSERTION', tableConcernee: 'provisional_sales', referenceId: finalLotId, description: `Chargement commercial matin avec conversion centralisée : ${finalLotId} pour ${finalStaffName}.`, companyId: secureCompanyId });
        
        return { finalLotId, finalStaffName };
    });

    return executerTransaction();
};


const validateCommercialTourDefinitif = async (data, userContext) => {
    const db = getDb();
    // 🎯 RECTIFICATION DIRECTE : Récupération des données du vrai client choisi au moment de la clôture
    const { 
        lot_id, staff_id, staff_name, lignes = [], payment_method_id = null, 
        moyen_paiement = 'ESPÈCES', encaissement = {}, 
        chosen_customer_id = null, chosen_customer_name = null // Injectés pour écraser le générique
    } = data;
    const { secureUserId, secureCompanyId, userName } = userContext;
    
    // ✅ Utilisation locale de crypto.randomBytes pour garantir l'unicité stricte sans promesse (Synchrone)
    const genererIdLocal = (prefix) => `${prefix}-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

    console.log("============ [DEBUT CLÔTURE TOURNÉE INTELLIGENTE & CENTRALISÉE] ============");
    if (!lot_id) throw new Error("Numéro de lot manquant pour la validation finale.");
    
    const executerTransaction = db.transaction(() => {
        // ✅ Utilisation de l'identifiant hexadécimal unique pour l'en-tête de la vente
        const idVenteDefinitive = genererIdLocal('SAL');
        const dateNow = new Date().toISOString();
        let totalGeneralVente = 0;
        let totalGeneralAchat = 0;

        // 1. Préparation des requêtes SQL (21 colonnes = 21 points d'interrogation)
        const stmtItem = db.prepare(`
            INSERT INTO sale_items (
                id, lot_id, id_vente, customer_id, type_ligne, product_id, nom_article_snap, 
                quantite, prix_vente_unitaire, prix_achat_unitaire_snap, montant_achat_total_snap, 
                remise_montant, montant_ht, taxe_montant, montant_ttc_ligne, stock_avant_vente, 
                stock_apres_vente, user_id, company_id, is_comptabilise, sync_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        // 🎯 RAPPEL DE LA STRUCTURE DE LA REQUÊTE : 10 variables à passer lors du .run()
        const stmtMouvement = db.prepare(`
            INSERT INTO stock_movements (
                id, product_id, type_mouvement, reference_id, 
                quantite, stock_avant, stock_apres, prix_operation, 
                cmp_resultat, user_id, company_id, sync_status
            ) VALUES (?, ?, 'VENTE', ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        `);

        const updateStock = db.prepare(`UPDATE products SET stock_actuel = ?, sync_status = 'pending' WHERE id = ? AND company_id = ?`);
        const insertSync = db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES (?, ?, ?, ?)`);
        
        // Suppression préventive du mouvement temporaire de chargement du matin
        // ✅ CORRECTION DU TYPE : Votre premier fichier insérait avec 'COMMERCIAL'. J'ajoute le nettoyage des deux types au cas où.
        db.prepare(`DELETE FROM stock_movements WHERE reference_id = ? AND type_mouvement IN ('CHARGEMENT', 'COMMERCIAL') AND company_id = ?`).run(lot_id, secureCompanyId);

        // Extraction des données provisoires
        const linesProvisoires = db.prepare(`SELECT * FROM provisional_sales WHERE lot_id = ? AND company_id = ?`).all(lot_id, secureCompanyId);
        if (linesProvisoires.length === 0) throw new Error("Vente de tournée non trouvée ou déjà validée.");
        
        const defaultLine = linesProvisoires[0];
        
        // 🚀 BLINDAGE DE SÉCURITÉ COMPTABLE À DOUBLE NIVEAU CONTRE LE REPLI DE L'ID CLIENT
        const UI_CustomerId = chosen_customer_id || encaissement?.customer_id || null;
        const UI_ClientName = chosen_customer_name || encaissement?.nom_client || null;

        // Si aucune saisie n'arrive de l'UI et que la ligne du matin contient "COMMERCIAL", on bascule sur la constante magasin par défaut
        const estUnCompteCommercialProvisoire = !defaultLine.customer_id || String(defaultLine.nom_client_snap).toUpperCase().includes('COMMERCIAL');

        const finalCustomerId = (UI_CustomerId && String(UI_CustomerId).trim() !== "") 
            ? UI_CustomerId 
            : (estUnCompteCommercialProvisoire ? 'CLI-COMPTANT' : defaultLine.customer_id);

        const finalClientName = (UI_ClientName && String(UI_ClientName).trim() !== "") 
            ? UI_ClientName 
            : (estUnCompteCommercialProvisoire ? 'CLIENT AU COMPTANT' : (defaultLine.nom_client_snap || 'CLIENT AU COMPTANT'));

        const originalUserId = defaultLine.user_id;

        // Structure définitive et filtrée
        const lignesValidesEtVendues = [];

        lignes.forEach(item => {
            // Extraction des métadonnées avec u.code et u.libelle pour alimenter conversestock
            const product = db.prepare(`
                SELECT p.stock_actuel, p.cmp, p.nom, u.coefficient, u.code AS code_gros, u.libelle AS ref_detail
                FROM products p 
                LEFT JOIN unites u ON p.unite_id = u.id 
                WHERE p.id = ? AND p.company_id = ?
            `).get(item.product_id, secureCompanyId);
            
            if (!product) throw new Error("Produit introuvable lors du décompte final : " + item.product_id);
            
            const currentStockMagasin = Number(product.stock_actuel || 0);
            const qteChargeeMatin = Math.abs(Number(item.quantite || 0)); 
            const qteRetourPieces = Math.abs(Number(item.quantite_retour || 0));

            // 🚫 VERROU MATÉRIEL DE SUR-RETOUR
            if (qteRetourPieces > qteChargeeMatin) {
                throw new Error("Incohérence sur " + product.nom + " : Le retour saisi (" + qteRetourPieces + " PCS) ne peut pas excéder la charge initiale (" + qteChargeeMatin + " PCS).");
            }

            // Calcul de la quantité nette vendue (ex: 21 chargés - 9 retournés = 12 pièces vendues)
            const qteVenduePieces = Math.max(0, qteChargeeMatin - qteRetourPieces);

            if (qteVenduePieces === 0) {
                // 🎯 RECONVERSION SANS VENTE : Restitution totale et immédiate au magasin
                const stockRestitueEntier = Math.round(currentStockMagasin + qteChargeeMatin);
                updateStock.run(stockRestitueEntier, item.product_id, secureCompanyId);
                insertSync.run('products', item.product_id, 'UPDATE', secureCompanyId);
                console.log("♻️ [FUITE LOGISTIQUE] 0 Vente constatée pour : " + product.nom + ". Restitution complète.");
            } else {
                // L'article a généré du CA, validation des indicateurs
                const mtTTCLigne = nettoyerNombre(item.montant_ttc_ligne);
                totalGeneralVente += mtTTCLigne;

                const puVentePieces = mtTTCLigne / qteVenduePieces;
                const coeffLogistique = Number(product.coefficient || 1);
                const puAchatPiecesSnap = Number(product.cmp || 0) / coeffLogistique;
                const mtAchatTotalLigneSnap = Math.round((qteVenduePieces * puAchatPiecesSnap) * 100) / 100;
                
                totalGeneralAchat += mtAchatTotalLigneSnap;

                // Application de la formule de régularisation de stock
                const stockAvantReel = currentStockMagasin + qteChargeeMatin;
                const stockApresReel = Math.round(stockAvantReel - qteVenduePieces);

                // 🚀 ANTI-POLLUTION DU NOM
                const labelUnitesVendu = conversestock.formaterStockPourAffichage(
                    qteVenduePieces, 
                    coeffLogistique, 
                    product.code_gros || 'CS', 
                    product.ref_detail || 'PCS'
                );

                // C'est à partir d'ici que vos lignes sale_items et stock_movements vont être poussées.
                // Assurez-vous d'utiliser `genererIdLocal('MOV')` pour vos IDs de mouvements !


                            // 🎯 RECTIFICATION CHIRURGICALE ANTI-POLLUTION : On garde STRICTEMENT le nom de l'article propre et brut
                const nomArticleNettoye = String(product.nom).toUpperCase();

                lignesValidesEtVendues.push({
                    product_id: item.product_id,
                    nom_article: nomArticleNettoye, // Stocke uniquement "PILS" ou "COCKTAIL"
                    qteVenduePieces: qteVenduePieces,
                    puVentePieces: puVentePieces,
                    puAchatPiecesSnap: puAchatPiecesSnap,
                    mtAchatTotalLigneSnap: mtAchatTotalLigneSnap,
                    mtTTCLigne: mtTTCLigne,
                    stockAvantReel: stockAvantReel,
                    stockApresReel: stockApresReel,
                    cmp_global: Number(product.cmp || 0)
                });
            }
        });

        const finalMethodText = encaissement.moyen_paiement || moyen_paiement || 'ESPÈCES';
        const finalMethodId = encaissement.payment_method_id || payment_method_id || null;

        if (totalGeneralVente > 0 && lignesValidesEtVendues.length > 0) {
            // Insertion de l'en-tête de la facture de vente réelle avec le VRAI client sélectionné
            db.prepare(`
                INSERT INTO sales (
                    id, lot_id, mode_reglement, customer_id, nom_client_snap, date_vente, observation, 
                    statut_vente, montant_total, montant_paye, reste_a_payer, payment_status, 
                    user_id, caissier_id, staff_id, staff_name_snap, table_id, table_name_snap, company_id, 
                    is_active, is_archived, is_comptabilise, is_solde, sync_status
                ) VALUES (?, ?, ?, ?, ?, ?, NULL, 'VALIDEE', ?, ?, 0, 'PAYE', ?, ?, ?, ?, NULL, 'TOURNÉE', ?, 1, 0, 0, 1, 'pending')
            `).run(
                idVenteDefinitive, lot_id, finalMethodText, finalCustomerId, finalClientName, dateNow,
                totalGeneralVente, totalGeneralVente, originalUserId, secureUserId, staff_id, staff_name || userName, secureCompanyId
            );
            insertSync.run('sales', idVenteDefinitive, 'INSERT', secureCompanyId);

            // Insertion exclusive des lignes d'articles liées filtrées ayant du CA
            lignesValidesEtVendues.forEach(item => {
                const saleItemId = genererIdLocal('SITM');
                
                stmtItem.run(
                    saleItemId,                           // 1
                    lot_id,                               // 2
                    idVenteDefinitive,                    // 3
                    finalCustomerId,                      // 4 -> Lié au vrai client finalisé
                    'VENTE',                              // 5
                    item.product_id,                      // 6
                    item.nom_article,                     // 7 -> Nom d'article brut propre
                    item.qteVenduePieces,                 // 8 -> Vraie quantité en pièces unitaires natives
                    item.puVentePieces,                   // 9
                    item.puAchatPiecesSnap,               // 10
                    item.mtAchatTotalLigneSnap,           // 11
                    0,                                    // 12
                    item.mtTTCLigne,                      // 13
                    0,                                    // 14
                    item.mtTTCLigne,                      // 15
                    item.stockAvantReel,                  // 16
                    item.stockApresReel,                  // 17
                    originalUserId,                       // 18
                    secureCompanyId,                      // 19
                    0,                                    // 20
                    'pending'                             // 21
                );

                const movementId = genererIdLocal('MOV');
                
                // ✅ ALIGNEMENT RECTIFIÉ : Passage exact de 10 variables pour correspondre aux 10 '?' de la requête préparée
                stmtMouvement.run(
                    movementId,                  // 1. id
                    item.product_id,             // 2. product_id
                    idVenteDefinitive,           // 3. reference_id
                    -item.qteVenduePieces,         // 4. quantite
                    item.stockAvantReel,         // 5. stock_avant
                    item.stockApresReel,         // 6. stock_apres
                    item.puVentePieces,          // 7. prix_operation
                    Number(item.cmp_global || 0),  // 8. cmp_resultat
                    secureUserId,                // 9. user_id
                    secureCompanyId              // 10. company_id
                );

                updateStock.run(item.stockApresReel, item.product_id, secureCompanyId);
                insertSync.run('products', item.product_id, 'UPDATE', secureCompanyId);
                insertSync.run('stock_movements', movementId, 'INSERT', secureCompanyId);
                insertSync.run('sale_items', saleItemId, 'INSERT', secureCompanyId);
            });

            // Insertion du règlement financier adossé au CA réel net avec le vrai nom client
            const paymentId = genererIdLocal('PAY');
            db.prepare(`
                INSERT INTO payments ( 
                    id, lot_id, sale_id, cloture_id, payment_method_id,  
                    type_paiement, is_cloture, customer_id, client_name, montant,  
                    is_active, recu, rendu, moyen_paiement, statut,  
                    user_id, caissier_id, staff_id, staff_name_snap, company_id,  
                    sync_status 
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                paymentId,             // 1
                lot_id,                // 2
                idVenteDefinitive,     // 3
                null,                  // 4
                finalMethodId,         // 5
                'COMPTANT',            // 6
                0,                     // 7
                finalCustomerId,       // 8
                finalClientName,       // 9
                totalGeneralVente,     // 10
                1,                     // 11
                totalGeneralVente,     // 12
                0,                     // 13
                finalMethodText,       // 14
                'VALIDEE',             // 15
                secureUserId,          // 16
                secureUserId,          // 17
                staff_id,              // 18
                staff_name || userName, // 19
                secureCompanyId,       // 20
                'pending'              // 21
            );

            insertSync.run('payments', paymentId, 'INSERT', secureCompanyId);
            db.prepare(`INSERT INTO compta_queue (table_source, record_id, company_id, status) VALUES ('sales', ?, ?, 'pending')`).run(idVenteDefinitive, secureCompanyId);
            insertSync.run('compta_queue', idVenteDefinitive, 'INSERT', secureCompanyId);
        }

        // Purge finale de la feuille de route provisoire
        db.prepare(`DELETE FROM provisional_sales WHERE lot_id = ? AND company_id = ?`).run(lot_id, secureCompanyId);
        
        logAction({ 
            userId: secureUserId, 
            userName, 
            actionType: 'VALIDATION', 
            tableConcernee: 'sales', 
            referenceId: idVenteDefinitive, 
            description: "Validation définitive tournée : " + lot_id + " convertie en vente réelle " + idVenteDefinitive + ".", 
            companyId: secureCompanyId 
        });

        // ✅ Nettoyage du doublon de clé dans l'objet de retour
        return { success: true, id: idVenteDefinitive, lot_id: lot_id };
    });

    return executerTransaction();
};





// --- 🚚 UNIK 1 : RÉCUPÉRATION DU COMPTEUR GLOBAL DES TOURNÉES COMMERCIALES ---
const getCommercialTournees = async (companyId) => {
    const db = getDb();
    
    const rows = db.prepare(`
        SELECT 
            ps.lot_id, 
            MAX(ps.nom_client_snap) as nom_client_snap, 
            MAX(ps.staff_name_snap) as staff_name_snap, 
            MAX(ps.table_name_snap) as table_name_snap,      
            MAX(ps.table_name_snap) as table_number_snap,   
            MAX(ps.user_id) as user_id_createur, 
            MAX(u.username) as username_createur, 
            SUM(CAST(COALESCE(ps.montant_ttc_ligne, 0) AS REAL)) as total, 
            SUM(ps.quantite) as qte_vendue,                  
            MAX(IFNULL(un.coefficient, 1)) as unit_coefficient,        
            MAX(IFNULL(un.code, 'CS')) as unit_code_gros,                 
            MAX(IFNULL(un.unite_reference, 'PCS')) as unit_ref_detail,      
            MAX(ps.date_vente) as date_tri
        FROM provisional_sales ps
        LEFT JOIN users u ON ps.user_id = u.id
        LEFT JOIN products prod ON ps.product_id = prod.id
        LEFT JOIN unites un ON prod.unite_id = un.id
        WHERE ps.company_id = ? 
          AND ps.table_name_snap = 'COMMERCIAL' -- Filtre exclusif des camions
        GROUP BY ps.lot_id 
        ORDER BY date_tri DESC
    `).all(companyId.toString());

    return rows.map(row => {
        const qteBruteVentePieces = Math.abs(Number(row.qte_vendue || 0));

        const expressionLogistique = conversestock.formaterStockPourAffichage(
            qteBruteVentePieces,
            row.unit_coefficient || 1,
            row.unit_code_gros || 'CS',
            row.unit_ref_detail || 'PCS'
        );

        return {
            ...row,
            qte_vendue_formatee: expressionLogistique 
        };
    });
};

const getCommercialTourneeDetails = async (lotId, companyId) => {
    const db = getDb();
    try {
        const rows = db.prepare(`
            SELECT ps.*,
                   IFNULL(u_mesure.coefficient, 1) as unit_coefficient,
                   IFNULL(u_mesure.code, 'CS') as unit_code_gros,
                   IFNULL(u_mesure.unite_reference, 'PCS') as unit_ref_detail
            FROM provisional_sales ps
            LEFT JOIN products p ON ps.product_id = p.id
            LEFT JOIN unites u_mesure ON p.unite_id = u_mesure.id
            WHERE ps.lot_id = ?
        `).all(lotId);

        return rows.map(row => {
            const qteBrutePieces = Math.abs(Number(row.quantite || 0));
            return {
                ...row,
                quantite_formatee: conversestock.formaterStockPourAffichage(
                    qteBrutePieces, 
                    row.unit_coefficient, 
                    row.unit_code_gros, 
                    row.unit_ref_detail
                )
            };
        });
    } catch (err) {
        console.error("🚨 Erreur interne dans getCommercialTourneeDetails :", err.message);
        throw err; // On propage l'erreur pour que le contrôleur puisse envoyer un 500
    }
};


const updateCommercialTourProvisional = async (data, userContext) => {
    const db = getDb();
    const itemsEntrants = data.lignes || data.items || [];
    const { staff_id = null, staff_name = null, lot_id = null } = data;
    const { secureUserId, secureCompanyId, userName } = userContext;

    if (!itemsEntrants || itemsEntrants.length === 0) throw new Error("Le panier de modification est vide.");
    if (!lot_id) throw new Error("ID de lot requis pour la mise à jour.");

    const config = db.prepare(`SELECT default_customer_id, default_staff_id FROM companies WHERE id = ?`).get(secureCompanyId);
    const finalClientId = config?.default_customer_id || 'DEFAULT_CUST';
    const finalStaffId = staff_id || config?.default_staff_id;
    const finalStaffName = staff_name || userName;

    // ✅ Génération d'ID synchrone sécurisée pour better-sqlite3
    const genererIdLocal = (prefix) => `${prefix}-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

    const executerTransaction = db.transaction(() => {
        const dateVente = new Date().toISOString();

        // 📋 Préparation des requêtes SQL
        const getAnciennesLignes = db.prepare(`SELECT * FROM provisional_sales WHERE lot_id = ? AND company_id = ?`);
        const updateStock = db.prepare(`UPDATE products SET stock_actuel = ?, sync_status = 'pending' WHERE id = ? AND company_id = ?`);
        const getProduct = db.prepare(`
            SELECT p.stock_actuel, p.cmp, p.nom, u.coefficient, u.code, u.unite_reference 
            FROM products p 
            LEFT JOIN unites u ON p.unite_id = u.id
            WHERE p.id = ? AND p.company_id = ?
        `);
        
        // 🎯 ALIGNEMENT STRUCTURAL : 25 colonnes déclarées = 22 points d'interrogation (3 valeurs étant écrites en dur)
        const insertProvisional = db.prepare(`
            INSERT INTO provisional_sales 
            (id, lot_id, id_vente, customer_id, nom_client_snap, date_vente, user_id, staff_id, staff_name_snap, table_id, table_name_snap, company_id, product_id, nom_article_snap, quantite, prix_vente_unitaire, 
            prix_achat_unitaire_snap, montant_achat_total_snap, remise_montant, montant_ht, taxe_montant, montant_ttc_ligne, stock_avant_vente, stock_apres_vente, sync_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'COMMERCIAL', ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, ?, ?, ?, 'pending')
        `);

        // 🎯 ALIGNEMENT STRUCTURAL : Attend exactement 8 variables au .run() car 'AJUSTEMENT_CAMION' est en dur
        const insertMovement = db.prepare(`
            INSERT INTO stock_movements 
            (id, product_id, type_mouvement, reference_id, quantite, stock_avant, stock_apres, user_id, company_id, sync_status) 
            VALUES (?, ?, 'AJUSTEMENT_CAMION', ?, ?, ?, ?, ?, ?, 'pending')
        `);
        const insertSync = db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES (?, ?, ?, ?)`);

        // 🔄 1️⃣ CONSOLIDATION ET RESTITUTION DU STOCK
        const mappingAnciennesQte = {};
        const cumulatRestitution = {};
        let snapshotVenteOrigine = null;

        const anciennesLignes = getAnciennesLignes.all(lot_id, secureCompanyId);
        anciennesLignes.forEach(ancienne => {
            const prodId = String(ancienne.product_id).trim();
            const qte = Number(ancienne.quantite || 0);
            
            mappingAnciennesQte[prodId] = (mappingAnciennesQte[prodId] || 0) + qte;
            cumulatRestitution[prodId] = (cumulatRestitution[prodId] || 0) + qte;
            
            if (!snapshotVenteOrigine && ancienne.id_vente) {
                snapshotVenteOrigine = {
                    id_vente: ancienne.id_vente,
                    customer_id: ancienne.customer_id,
                    nom_client_snap: ancienne.nom_client_snap
                };
            }
        });

        for (const [prodId, qteTotaleARestituer] of Object.entries(cumulatRestitution)) {
            const prod = getProduct.get(prodId, secureCompanyId);
            if (prod) {
                const stockRestitue = Number(prod.stock_actuel || 0) + qteTotaleARestituer;
                updateStock.run(stockRestitue, prodId, secureCompanyId);
            }
        }

        // ❌ 2️⃣ PURGE DES ANCIENS MOUVEMENTS ET DE LA TOURNÉE PROVISOIRE DE CE LOT
        db.prepare(`DELETE FROM stock_movements WHERE reference_id = ? AND type_mouvement = 'AJUSTEMENT_CAMION' AND company_id = ?`).run(lot_id, secureCompanyId);
        db.prepare(`DELETE FROM provisional_sales WHERE lot_id = ? AND company_id = ?`).run(lot_id, secureCompanyId);

        // 🎯 3️⃣ FUSION DU NOUVEAU PANIER PAR PRODUIT
        const nouveauPanierConsolide = {};
        itemsEntrants.forEach(item => {
            const pId = String(item.product_id).trim();
            const qte = Number(item.quantite || item.qte_chargee_pieces || 0);
            const mtt = Number(item.montant_ttc_ligne || item.totalTtcLigne || 0);

            if (!nouveauPanierConsolide[pId]) {
                nouveauPanierConsolide[pId] = {
                    product_id: pId,
                    quantite: 0,
                    montant_ttc_ligne: 0,
                    nom_article_snap: item.nom || item.nom_article_snap,
                    id_vente: item.id_vente || snapshotVenteOrigine?.id_vente || lot_id,
                    customer_id: item.customer_id || snapshotVenteOrigine?.customer_id || finalClientId,
                    nom_client_snap: item.nom_client_snap || snapshotVenteOrigine?.nom_client_snap || 'COMMERCIAL TOURNÉE'
                };
            }
            nouveauPanierConsolide[pId].quantite += qte;
            nouveauPanierConsolide[pId].montant_ttc_ligne += mtt;
        });

        // 🔄 4️⃣ ENREGISTREMENT DES NOUVELLES DONNÉES SÉCURISÉES
        Object.values(nouveauPanierConsolide).forEach(item => {
            const productId = item.product_id;
            const product = getProduct.get(productId, secureCompanyId);
            if (!product) throw new Error(`Produit introuvable.`);

            const qtePiecesProvisoire = item.quantite;
            const stAv = Number(product.stock_actuel || 0);
            const stAp = Math.round(stAv - qtePiecesProvisoire); 

            if (stAp < 0) {
                throw new Error(`Stock insuffisant après réajustement pour "${product.nom}".`);
            }

            const mtTTCLigne = item.montant_ttc_ligne;
            const puVentePieces = qtePiecesProvisoire > 0 ? (mtTTCLigne / qtePiecesProvisoire) : 0;

            const coeffLogistique = Math.max(1, Number(product.coefficient || 1));
            const puAchatPiecesSnap = Number(product.cmp || 0) / coeffLogistique;
            const mtAchatTotalLigneSnap = Math.round((qtePiecesProvisoire * puAchatPiecesSnap) * 100) / 100;

            const ancienneQte = mappingAnciennesQte[productId] || 0;
            const deltaMouvement = qtePiecesProvisoire - ancienneQte;

            if (deltaMouvement !== 0) {
                const movementId = genererIdLocal('MOV');
                // ✅ CORRECTION ALIGNEMENT DES 8 ARGUMENTS DU RUN :
                insertMovement.run(
                    movementId,          // 1. id
                    productId,           // 2. product_id
                    lot_id,              // 3. reference_id
                    deltaMouvement,      // 4. quantite
                    stAv,                // 5. stock_avant
                    stAp,                // 6. stock_apres
                    secureUserId,        // 7. user_id
                    secureCompanyId      // 8. company_id
                );
                insertSync.run('stock_movements', movementId, 'INSERT', secureCompanyId);
            }

            const venteId = genererIdLocal('VTE-C');
            // ✅ CORRECTION ET ALIGNEMENT STRICT DES 22 PARAMÈTRES ATTENDUS PAR L'INSERT :
            insertProvisional.run(
                venteId,                // 1
                lot_id,                 // 2
                item.id_vente,          // 3
                item.customer_id,       // 4
                item.nom_client_snap,   // 5
                dateVente,              // 6
                secureUserId,           // 7
                finalStaffId,           // 8
                finalStaffName,         // 9
                secureCompanyId,        // 10 -> company_id
                productId,              // 11
                item.nom_article_snap || product.nom, // 12
                qtePiecesProvisoire,    // 13
                puVentePieces,          // 14
                puAchatPiecesSnap,      // 15
                mtAchatTotalLigneSnap,  // 16
                mtTTCLigne,             // 17 -> montant_ht
                mtTTCLigne,             // 18 -> montant_ttc_ligne
                stAv,                   // 19 -> stock_avant_vente
                stAp                    // 20 -> stock_apres_vente
            );

            updateStock.run(stAp, productId, secureCompanyId);
            insertSync.run('provisional_sales', venteId, 'INSERT', secureCompanyId);
        });

        logAction({ userId: secureUserId, userName, actionType: 'MODIFICATION', tableConcernee: 'provisional_sales', referenceId: lot_id, description: `Mise à jour complète sans conflit FK du lot : ${lot_id}.`, companyId: secureCompanyId });
        
        return { lot_id };
    });

    return executerTransaction();
};


const deleteFullCommercialTourProvisional = async (lotId, userContext) => {
    const db = getDb();
    const { secureUserId, secureCompanyId, userName } = userContext;

    if (!lotId) throw new Error("ID de lot requis pour la suppression complète.");
    
    // 🎯 FIX CHIRURGICAL 1 : Normalisation de l'ID en chaîne propre
    const finalLotId = String(lotId).trim();

    const executerTransaction = db.transaction(() => {
        // 📋 Préparation des requêtes SQL (Élargie pour cibler le lot sans risquer de rater des lignes)
        const getLignesLot = db.prepare(`SELECT product_id, quantite FROM provisional_sales WHERE lot_id = ? AND company_id = ?`);
        const updateStock = db.prepare(`UPDATE products SET stock_actuel = ?, sync_status = 'pending' WHERE id = ? AND company_id = ?`);
        const getProductStock = db.prepare(`SELECT stock_actuel FROM products WHERE id = ? AND company_id = ?`);
        
        const insertMovement = db.prepare(`
            INSERT INTO stock_movements 
            (id, product_id, type_mouvement, reference_id, quantite, stock_avant, stock_apres, user_id, company_id, sync_status) 
            VALUES (?, ?, 'AJUSTEMENT_CAMION', ?, ?, ?, ?, ?, ?, 'pending')
        `);
        const insertSync = db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES (?, ?, ?, ?)`);

        // 🗺️ Consolidation des lignes pour éviter les doublons lors de la restitution
        const cumulatRestitution = {};
        const lignes = getLignesLot.all(finalLotId, secureCompanyId);

        lignes.forEach(ligne => {
            const prodId = String(ligne.product_id).trim();
            const qte = Number(ligne.quantite || 0);
            cumulatRestitution[prodId] = (cumulatRestitution[prodId] || 0) + qte;
        });

        // 🔄 1. Restitution physique complète dans la table products & traçabilité des mouvements
        for (const [prodId, qteTotaleARestituer] of Object.entries(cumulatRestitution)) {
            const prod = getProductStock.get(prodId, secureCompanyId);
            if (prod) {
                const stAv = Number(prod.stock_actuel || 0);
                const stAp = stAv + qteTotaleARestituer;

                // Sauvegarde du stock mis à jour
                updateStock.run(stAp, prodId, secureCompanyId);

                // Mouvement d'annulation de stock (Quantité négative pour signifier le rendu/restitution inverse au déstockage)
                const movementId = genererId('MOV');
                insertMovement.run(movementId, prodId, finalLotId, -qteTotaleARestituer, stAv, stAp, secureUserId, secureCompanyId);
                insertSync.run('stock_movements', movementId, 'INSERT', secureCompanyId);
            }
        }

        // ❌ 2. Purge définitive absolue (Suppression globale basée uniquement sur le lot_id unique)
        // 🎯 FIX CHIRURGICAL 2 : Retrait du filtre restrictif table_id pour garantir le nettoyage intégral du lot
        db.prepare(`DELETE FROM provisional_sales WHERE lot_id = ? AND company_id = ?`).run(finalLotId, secureCompanyId);

        // Audit log
        logAction({ 
            userId: secureUserId, 
            userName, 
            actionType: 'SUPPRESSION', 
            tableConcernee: 'provisional_sales', 
            referenceId: finalLotId, 
            description: `Annulation et suppression complète du chargement de tournée : ${finalLotId}. Restitution intégrale des stocks effectuée.`, 
            companyId: secureCompanyId 
        });

        return { lot_id: finalLotId };
    });

    return executerTransaction();
};


const splitProvisionalItem = async (itemId, data, userContext) => {
    const db = getDb();
    const { secureCompanyId } = userContext;
    const { qtePayee } = data; // Quantité en pièces à détacher pour paiement immédiat

    const executerTransaction = db.transaction(() => {
        const item = db.prepare(`
            SELECT * FROM provisional_sales 
            WHERE id = ? AND company_id = ?
        `).get(itemId, secureCompanyId);

        if (!item) throw new Error("Ligne provisoire introuvable.");

        const qteTotale = Math.abs(Number(item.quantite || 0));
        const qtePayeeNum = Math.abs(Number(qtePayee || 0));

        if (qtePayeeNum <= 0 || qtePayeeNum >= qteTotale) {
            throw new Error("Quantité à payer invalide pour la scission.");
        }

        const qteRestante = qteTotale - qtePayeeNum;
        const totalTTC = Math.abs(Number(item.montant_ttc_ligne || item.total_ttc || 0));
        const puUnitaire = qteTotale > 0 ? (totalTTC / qteTotale) : Number(item.prix_vente_unitaire || 0);

        const montantPayeTTC = Number((qtePayeeNum * puUnitaire).toFixed(2));
        const montantRestantTTC = Number((qteRestante * puUnitaire).toFixed(2));

        // Génération de deux nouveaux IDs uniques
        const idPayee = `PROV-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
        const idRestante = `PROV-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

        const insertProvisional = db.prepare(`
            INSERT INTO provisional_sales 
            (id, lot_id, id_vente, customer_id, nom_client_snap, date_vente, user_id, staff_id, staff_name_snap, table_id, table_name_snap, company_id, product_id, nom_article_snap, quantite, prix_vente_unitaire, prix_achat_unitaire_snap, montant_achat_total_snap, remise_montant, montant_ht, taxe_montant, montant_ttc_ligne, stock_avant_vente, stock_apres_vente, sync_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        `);

        const insertSync = db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES (?, ?, ?, ?)`);

        // 1. Insertion de la portion payée
        insertProvisional.run(
            idPayee, item.lot_id, item.id_vente, item.customer_id, item.nom_client_snap, item.date_vente, 
            item.user_id, item.staff_id, item.staff_name_snap, item.table_id, item.table_name_snap, 
            item.company_id, item.product_id, item.nom_article_snap, qtePayeeNum, 
            item.prix_vente_unitaire, item.prix_achat_unitaire_snap, 
            Number((qtePayeeNum * (item.prix_achat_unitaire_snap || 0)).toFixed(2)), 
            0, montantPayeTTC, 0, montantPayeTTC, item.stock_avant_vente, item.stock_apres_vente
        );
        insertSync.run('provisional_sales', idPayee, 'INSERT', secureCompanyId);

        // 2. Insertion de la portion restante
        insertProvisional.run(
            idRestante, item.lot_id, item.id_vente, item.customer_id, item.nom_client_snap, item.date_vente, 
            item.user_id, item.staff_id, item.staff_name_snap, item.table_id, item.table_name_snap, 
            item.company_id, item.product_id, item.nom_article_snap, qteRestante, 
            item.prix_vente_unitaire, item.prix_achat_unitaire_snap, 
            Number((qteRestante * (item.prix_achat_unitaire_snap || 0)).toFixed(2)), 
            0, montantRestantTTC, 0, montantRestantTTC, item.stock_avant_vente, item.stock_apres_vente
        );
        insertSync.run('provisional_sales', idRestante, 'INSERT', secureCompanyId);

        // 3. Suppression de la ligne d'origine
        db.prepare(`DELETE FROM provisional_sales WHERE id = ?`).run(itemId);
        insertSync.run('provisional_sales', itemId, 'DELETE', secureCompanyId);

        return { success: true, idPayee, idRestante };
    });

    return executerTransaction();
};

// 🏁 SYSTEME D'EXPORTS FINAL DU MODULE PROVISOIRE RESPECTE ET COMPLETE
module.exports = {
    createProvisionalSale, 
    getProvisionalSales, 
    getProvisionalSaleDetails, 
    updateProvisionalSale, 
    validateProvisionalSale,
    rejectProvisionalSale, 
    getCommercialTournees,
    getCommercialTourneeDetails,
    updateCommercialTourProvisional,
    deleteFullCommercialTourProvisional,
    saveTemporaryCart, 
    getTemporaryCart, 
    createCommercialTourProvisional, // Matin
    validateCommercialTourDefinitif,
    deleteTemporaryCart, 
    splitProvisionalItem,
    deleteProvisionalItem
};