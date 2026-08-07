const { getDb } = require('../config/database');
const { logAction } = require('../utils/auditHelper');
const conversestock = require('./conversestock'); // 🚀 IMPORTATION DU VERROU CENTRAL ANTI-LITIGE
function genererIdVente() {
    return `VTE-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`;
}
const createSale = async (data, userContext) => {
    const db = getDb();
    const { 
        lignes = [], 
        encaissement = {}, 
        staff_id = null, 
        staff_name = null, 
        caissier_id = null 
    } = data;
    const { secureUserId, secureCompanyId, userName } = userContext;
    if (lignes.length === 0) throw new Error("Le panier est vide.");
    const totalVente = lignes.reduce((sum, item) => sum + parseFloat(item.montant_ttc_ligne || 0), 0);
    let modeReglement = encaissement.moyen_paiement; // Pour la table payments et sales
    let montantRecu = parseFloat(encaissement.total || 0);
    if (modeReglement === 'CREDIT') {
        montantRecu = 0;
    } else if (modeReglement === 'ACOMPTE' && montantRecu >= totalVente) {
        // Optionnel : ajustement si l'acompte couvre tout
    } else if (modeReglement === 'ACOMPTE' && montantRecu <= 0) {
        modeReglement = 'CREDIT';
    }
    const resteAPayer = Math.max(0, totalVente - montantRecu);
    let paymentStatus = 'SOLDE'; 
    if (montantRecu <= 0) {
        paymentStatus = 'NON_PAYE';
    } else if (resteAPayer > 0.1) {
        paymentStatus = 'PARTIEL';
    }
    const saleId = genererIdVente(); 
    const dateVente = new Date().toISOString();
    const lotId = (lignes[0] && lignes[0].id_lot) ? lignes[0].id_lot : `LOT-V-${Date.now().toString().slice(-6)}`;
    const transaction = db.transaction(() => {
        const config = db.prepare('SELECT default_customer_id, default_staff_id FROM companies WHERE id = ?').get(secureCompanyId);
        const finalClientId = encaissement.customer_id || config?.default_customer_id;
        const nomClientFinal = encaissement.nom_client || 'CLIENT AU COMPTANT';
        db.prepare(`
            INSERT INTO sales (
                id, lot_id, customer_id, nom_client_snap, montant_total, 
                montant_paye, reste_a_payer, payment_status, mode_reglement,
                user_id, caissier_id, staff_id, staff_name_snap, company_id, 
                statut_vente, date_vente, is_comptabilise, sync_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'VALIDEE', ?, 0, 'pending')
        `).run(
            saleId, lotId, finalClientId, nomClientFinal, totalVente,
            montantRecu, resteAPayer, paymentStatus, modeReglement, 
            secureUserId, (caissier_id || secureUserId), 
            (staff_id || config?.default_staff_id), (staff_name || userName), 
            secureCompanyId, dateVente
        );
        db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('sales', ?, 'INSERT', ?)").run(saleId, secureCompanyId);
        
        // 🚀 ALIGNEMENT STRUCTURAL : Ajout des deux colonnes snapshots d'achat pour optimiser les rapports
        const stmtItem = db.prepare(`
            INSERT INTO sale_items (id, lot_id, id_vente, customer_id, product_id, nom_article_snap, 
                quantite, prix_vente_unitaire, prix_achat_unitaire_snap, montant_achat_total_snap,
                remise_montant, montant_ht, taxe_montant, montant_ttc_ligne, 
                stock_avant_vente, stock_apres_vente, user_id, company_id, sync_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        `);
        for (const item of lignes) {
            // ✅ AJOUT RECUPERATION DU CMP : On extrait p.cmp qui servira à l'évaluation de la marge historique
            const product = db.prepare(`
                SELECT p.stock_actuel, p.cmp, p.nom, u.coefficient, u.code, u.unite_reference 
                FROM products p 
                LEFT JOIN unites u ON p.unite_id = u.id
                WHERE p.id = ? AND p.company_id = ?
            `).get(item.product_id, secureCompanyId);
            if (!product) throw new Error(`Produit introuvable : ${item.nom_article_snap}`);
            const qtePiecesVente = conversestock.calculerUnitesNatives(db, item.product_id, item.quantite);
            if (qtePiecesVente <= 0) {
                throw new Error(`La quantité de vente saisie pour l'article "${product.nom}" est invalide ou nulle.`);
            }
            const stockAvant = Number(product.stock_actuel || 0);
            const stockApres = stockAvant - qtePiecesVente;
            if (stockApres < 0) {
                const stockDispoFormate = conversestock.formaterStockPourAffichage(
                    stockAvant, product.coefficient, product.code, product.unite_reference
                );
                const qteDemandeeFormatee = conversestock.formaterStockPourAffichage(
                    qtePiecesVente, product.coefficient, product.code, product.unite_reference
                );
                throw new Error(`Stock insuffisant pour l'article "${product.nom}". Disponible: ${stockDispoFormate}, Demandé: ${qteDemandeeFormatee}.`);
            }
            const mtTTCLigne = parseFloat(item.montant_ttc_ligne || 0);
            const puVentePieces = mtTTCLigne / qtePiecesVente;
            
            // 🧮 LOGIQUE FINANCIÈRE SÉCURISÉE DU SNAPSHOT DE MARGE :
            // 1. On ramène le CMP (au casier) de la fiche article au coût de revient d'une seule bouteille unitaire
            const coeffLogistique = Number(product.coefficient || 1);
            const puAchatPiecesSnap = Number(product.cmp || 0) / coeffLogistique;
            
            // 2. Coût d'achat global de la ligne (Quantité de bouteilles vendues * Prix d'achat d'une bouteille)
            const mtAchatTotalLigneSnap = Math.round((qtePiecesVente * puAchatPiecesSnap) * 100) / 100;

            const itemId = `LIT-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`;
            
            // Exécution de l'insertion avec alimentation immédiate des deux snapshots
            stmtItem.run(
                itemId, lotId, saleId, finalClientId, item.product_id, item.nom_article_snap || product.nom, 
                qtePiecesVente, puVentePieces, 
                puAchatPiecesSnap,      // prix_achat_unitaire_snap (Coût bouteille)
                mtAchatTotalLigneSnap,   // montant_achat_total_snap ⚡ Évite les calculs lourds SUM(qte * prix)
                item.remise_montant || 0, 
                (item.montant_ht || (qtePiecesVente * puVentePieces)),
                item.taxe_montant || 0, mtTTCLigne, stockAvant, stockApres, secureUserId, secureCompanyId
            );
            db.prepare("UPDATE products SET stock_actuel = ?, sync_status = 'pending' WHERE id = ? AND company_id = ?")
              .run(stockApres, item.product_id, secureCompanyId);
            db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('sale_items', ?, 'INSERT', ?)").run(itemId, secureCompanyId);
            db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('products', ?, 'UPDATE', ?)").run(item.product_id, secureCompanyId);
        }
        if (montantRecu > 0) {
            const paymentId = `PAY-${Date.now().toString().slice(-7)}`;
            db.prepare(`
                INSERT INTO payments (
                    id, lot_id, sale_id, customer_id, client_name, montant, 
                    recu, rendu, moyen_paiement, company_id, 
                    user_id, caissier_id, statut, type_paiement, sync_status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'VALIDEE', ?, 'pending')
            `).run(
                paymentId, lotId, saleId, finalClientId, nomClientFinal, 
                montantRecu, montantRecu, 0, modeReglement, secureCompanyId, 
                secureUserId, secureUserId, 
                paymentStatus === 'PARTIEL' ? 'ACOMPTE' : 'COMPTANT'
            );
            db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('payments', ?, 'INSERT', ?)").run(paymentId, secureCompanyId);
        }
        
        db.prepare("INSERT INTO compta_queue (table_source, record_id, company_id, status) VALUES ('sales', ?, ?, 'pending')")
          .run(saleId, secureCompanyId);
          
        db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('compta_queue', ?, 'INSERT', ?)").run(saleId, secureCompanyId);
        
        return { 
            saleId, 
            lotId, 
            totalVente, 
            totalRecu: montantRecu, 
            reste: resteAPayer, 
            clientNameSnapshot: nomClientFinal
        };
    });

    const result = transaction();
    db.prepare('DELETE FROM temporary_carts WHERE user_id = ? AND company_id = ?').run(secureUserId, secureCompanyId);
    
    logAction({ 
        userId: secureUserId, 
        userName: userName || 'Système', 
        actionType: 'CREATE',
        tableConcernee: 'sales',
        referenceId: saleId, 
        description: `Vente POS validée. N° ${saleId} pour ${result.clientNameSnapshot}. Total : ${Number(result.totalVente).toFixed(2)} F (Règlement: ${modeReglement || 'NON SPÉCIFIÉ'}, Reçu: ${Number(result.totalRecu).toFixed(2)} F).`,
        companyId: secureCompanyId
    });
    
    return result;
};


const getAllSales = async (companyId) => {
    const db = getDb();
    
    // 1. Extraction brute des données incluant explicitement le filtre de clôture (0 et 1)
    const rows = db.prepare(`
        SELECT 
            i.id, s.id as id_vente, s.lot_id, i.product_id, i.type_ligne, s.nom_client_snap, s.date_vente, 
            i.nom_article_snap, 
            i.quantite as qte_vendue, 
            u_mesure.coefficient as unit_coefficient,
            u_mesure.code as unit_code_gros, 
            u_mesure.unite_reference as unit_ref_detail, 
            i.prix_vente_unitaire as prix_unitaire_snap,
            i.remise_montant as remise_ligne, i.montant_ht as montant_ht_ligne, i.taxe_montant as taxe_ligne, 
            i.montant_ttc_ligne as prix_total_ligne, s.mode_reglement as moyen_paiement, s.statut_vente,
            u.username as nom_utilisateur, s.staff_name_snap as nom_staff, uc.username as nom_caissier,
            i.is_active,
            i.is_cloture -- 💡 Retourné pour que le frontend sache si la ligne est clôturée
        FROM sale_items i
        JOIN sales s ON i.id_vente = s.id
        LEFT JOIN products p ON i.product_id = p.id
        LEFT JOIN unites u_mesure ON p.unite_id = u_mesure.id 
        LEFT JOIN users u ON s.user_id = u.id
        LEFT JOIN users uc ON s.caissier_id = uc.id
        WHERE s.company_id = ? 
          AND s.statut_vente != 'ARCHIVEE'
          AND s.is_archived = 0 
          AND s.is_active = 1 
          AND s.statut_vente != 'ANNULEE'
          AND (i.is_cloture = 0 OR i.is_cloture = 1) -- 💡 Prend en compte les deux états
        ORDER BY s.date_vente DESC
    `).all(companyId.toString());

    // 2. 🚀 HYDRATATION LOGISTIQUE INVERSE CENTRALE : Génération de la chaîne d'affichage propre
    return rows.map(row => {
        const qteBruteVentePieces = Math.abs(Number(row.qte_vendue || 0));

        // Décomposition dynamique via les vraies colonnes SQLite du produit
        const expressionLogistique = conversestock.formaterStockPourAffichage(
            qteBruteVentePieces,
            row.unit_coefficient || 1,
            row.unit_code_gros || 'CS',
            row.unit_ref_detail || 'PCS'
        );

        return {
            ...row,
            // 💡 C'est cette variable exacte que votre tableau frontend de ventes affichera dans la colonne quantité
            qte_vendue_formatee: expressionLogistique
        };
    });
};

const getPerformanceDuJour = async (companyId) => {
    const db = getDb();
    const stats = db.prepare(`
        SELECT 
            COUNT(DISTINCT lot_id) as nb_ventes,
            SUM(CASE WHEN type_ligne = 'VENTE' THEN montant_ttc_ligne ELSE 0 END) as ca_brut,
            SUM(CASE WHEN type_ligne IN ('RETOUR', 'ANNULEE') THEN montant_ttc_ligne ELSE 0 END) as total_negatifs
        FROM sale_items 
        WHERE company_id = ? 
          AND is_active = 1
          AND date(created_at) = date('now') 
    `).get(companyId.toString());

    const caBrut = parseFloat(stats?.ca_brut || 0);
    const totalNeg = Math.abs(parseFloat(stats?.total_negatifs || 0));

    return {
        ca_brut: caBrut,
        total_negatifs: totalNeg,
        ca_net: caBrut - totalNeg,
        nombre_ventes: stats?.nb_ventes || 0
    };
};
const cancelSale = async (lotId, companyId, userContext, observation) => {
    const db = getDb();
    const activeUserId = (userContext?.userId || userContext?.id || 'SYSTEM').toString();

    const finalObservation = (observation && observation.trim().length > 0) 
        ? observation.trim() 
        : `Annulation Lot ${lotId}`;

    return db.transaction(() => {
        // 1. Recherche et vérification du verrou comptable sur l'en-tête
        const vente = db.prepare(`
            SELECT id, is_comptabilise FROM sales 
            WHERE lot_id = ? AND company_id = ? AND is_active = 1
        `).get(lotId, companyId);

        if (!vente) {
            throw new Error("Vente introuvable, déjà annulée ou archivée.");
        }

        // 🔒 VERROUILLAGE SÉCURISÉ EN-TÊTE SUR LA COLONNE EXISTANTE
        if (vente.is_comptabilise === 1 || vente.is_comptabilise === '1' || vente.is_comptabilise === true) {
            throw new Error("Action impossible : cette vente globale est déjà clôturée ou comptabilisée.");
        }

        // 2. Traitement des articles (Réintégration en pièces entières natives)
        const items = db.prepare(`
            SELECT * FROM sale_items 
            WHERE id_vente = ? AND is_active = 1
        `).all(vente.id);
        
        for (const item of items) {
            const product = db.prepare(`
                SELECT stock_actuel, cmp FROM products WHERE id = ?
            `).get(item.product_id);

            if (!product) continue;

            const stockAvant = Number(product.stock_actuel || 0);
            const qteAnnuleeVentePieces = Math.abs(Number(item.quantite || item.qte_vendue || 0));
            const stockApres = Math.round(stockAvant + qteAnnuleeVentePieces);

            // A. Réintégration en stock unitaire exact
            db.prepare(`UPDATE products SET stock_actuel = ?, sync_status = 'pending' WHERE id = ?`)
              .run(stockApres, item.product_id);
            db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('products', ?, 'UPDATE', ?)").run(item.product_id, companyId);

            // B. Traçabilité complète du Mouvement de stock
            const moveId = `MOV-CAN-${Date.now()}-${item.id}`;
            db.prepare(`
                INSERT INTO stock_movements (id, product_id, type_mouvement, reference_id, quantite, stock_avant, stock_apres, prix_operation, cmp_resultat, user_id, company_id, sync_status)
                VALUES (?, ?, 'ANNULATION_VENTE', ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
            `).run(
                moveId, item.product_id, vente.id, qteAnnuleeVentePieces, 
                stockAvant, stockApres, item.prix_vente_unitaire, (product.cmp || 0), 
                activeUserId, companyId
            );
            db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('stock_movements', ?, 'INSERT', ?)").run(moveId, companyId);

            // C. Désactivation et marquage de la ligne
            db.prepare(`UPDATE sale_items SET is_active = 0, type_ligne = 'ANNULEE', observation = ?, sync_status = 'pending' WHERE id = ?`)
              .run(finalObservation, item.id);
              
            db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('sale_items', ?, 'UPDATE', ?)")
              .run(item.id, companyId);
        }

        // 3. Désactivation des Paiements rattachés
        const paymentsToCancel = db.prepare(`SELECT id FROM payments WHERE sale_id = ?`).all(vente.id);
        db.prepare(`UPDATE payments SET is_active = 0, statut = 'ANNULEE', sync_status = 'pending' WHERE sale_id = ?`)
          .run(vente.id);
        paymentsToCancel.forEach(p => {
            db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('payments', ?, 'UPDATE', ?)").run(p.id, companyId);
        });

        // 4. Clôture de l'En-tête de vente parent
        db.prepare(`UPDATE sales SET statut_vente = 'ANNULEE', is_active = 0, observation = ?, sync_status = 'pending' WHERE id = ?`)
          .run(finalObservation, vente.id);
         
        db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('sales', ?, 'UPDATE', ?)")
          .run(vente.id, companyId);

        return {
            success: true,
            message: "La vente a été entièrement annulée, les règlements annulés et les stocks réintégrés."
        };
    })();
};

const cancelSaleItem = async (saleItemId, companyId, userContext, observation) => {
    const db = getDb();
    const activeUserId = (userContext?.userId || userContext?.secureUserId || 'SYSTEM').toString();

    const finalObservation = (observation && observation.trim().length > 0) 
        ? observation.trim() 
        : `Correction saisie : Annulation ligne ${saleItemId}`;

    return db.transaction(() => {
        const item = db.prepare(`
            SELECT i.id, i.id_vente, i.product_id, i.quantite, i.prix_vente_unitaire, i.is_comptabilise,
                   u.coefficient as unit_coefficient, u.code as unit_code_gros, u.unite_reference as unit_ref_detail
            FROM sale_items i 
            LEFT JOIN products prod ON i.product_id = prod.id
            LEFT JOIN unites u ON prod.unite_id = u.id
            WHERE i.id = ? AND i.company_id = ? AND i.is_active = 1
        `).get(saleItemId, companyId);
        
        if (!item) throw new Error("Ligne introuvable ou déjà traitée.");
        
        if (item.is_comptabilise === 1 || item.is_comptabilise === '1' || item.is_comptabilise === true) {
            throw new Error("Action impossible : cette ligne d'article est déjà comptabilisée.");
        }

        const vente = db.prepare(`SELECT id, customer_id, nom_client_snap, is_comptabilise FROM sales WHERE id = ? AND company_id = ?`).get(item.id_vente, companyId);
        if (!vente) throw new Error("Vente parente introuvable.");

        if (vente.is_comptabilise === 1 || vente.is_comptabilise === '1' || vente.is_comptabilise === true) {
            throw new Error("Action impossible : impossible d'annuler cet article car la vente globale est déjà clôturée ou comptabilisée.");
        }

        const product = db.prepare(`SELECT stock_actuel, cmp FROM products WHERE id = ?`).get(item.product_id);
        const qteLignePieces = Math.abs(Number(item.quantite || 0));
        
        if (product) {
            const stockAvant = Number(product.stock_actuel || 0);
            const stockApres = Math.round(stockAvant + qteLignePieces);
            
            db.prepare(`UPDATE products SET stock_actuel = ?, sync_status = 'pending' WHERE id = ?`).run(stockApres, item.product_id);
            db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('products', ?, 'UPDATE', ?)").run(item.product_id, companyId);
            
            const moveId = `MOV-CORR-${Date.now()}-${item.id}`;
            db.prepare(`
                INSERT INTO stock_movements (id, product_id, type_mouvement, reference_id, quantite, stock_avant, stock_apres, prix_operation, cmp_resultat, user_id, company_id, sync_status)
                VALUES (?, ?, 'CORRECTION_SAISIE', ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
            `).run(moveId, item.product_id, vente.id, qteLignePieces, stockAvant, stockApres, item.prix_vente_unitaire, (product.cmp || 0), activeUserId, companyId);
            db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('stock_movements', ?, 'INSERT', ?)").run(moveId, companyId);
        }

        db.prepare(`UPDATE sale_items SET is_active = 0, type_ligne = 'ANNULEE', observation = ?, sync_status = 'pending' WHERE id = ?`)
          .run(finalObservation, saleItemId);
        db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('sale_items', ?, 'UPDATE', ?)").run(saleItemId, companyId);

        const summary = db.prepare(`SELECT SUM(montant_ttc_ligne) as total FROM sale_items WHERE id_vente = ? AND is_active = 1`).get(vente.id);
        const nouveauTotal = summary.total || 0;

        db.prepare(`
            UPDATE payments 
            SET montant = ?, recu = ?, rendu = 0, customer_id = ?, client_name = ?, caissier_id = IFNULL(caissier_id, ?), sync_status = 'pending'
            WHERE sale_id = ? AND company_id = ?
        `).run(nouveauTotal, nouveauTotal, vente.customer_id, vente.nom_client_snap, activeUserId, vente.id, companyId);

        const paymentRecord = db.prepare(`SELECT id FROM payments WHERE sale_id = ? AND company_id = ?`).get(vente.id, companyId);
        if (paymentRecord) {
            db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('payments', ?, 'UPDATE', ?)").run(paymentRecord.id, companyId);
        }

        db.prepare(`UPDATE sales SET montant_total = ?, montant_paye = ?, reste_a_payer = 0, sync_status = 'pending' WHERE id = ?`)
          .run(nouveauTotal, nouveauTotal, vente.id);
        db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('sales', ?, 'UPDATE', ?)").run(vente.id, companyId);

        return {
            success: true,
            qte_mouvementee: qteLignePieces,
            coefficient: item.unit_coefficient || 1,
            unit_code_gros: item.unit_code_gros || 'CS',
            unit_ref_detail: item.unit_ref_detail || 'PCS'
        };
    })();
};

const handleReturnSaleItem = async (saleItemId, companyId, userContext) => {
    const db = getDb();
    const activeUserId = (userContext?.userId || userContext?.secureUserId || 'user').toString();

    return db.transaction(() => {
        const item = db.prepare(`
            SELECT si.*, 
                   s.mode_reglement, 
                   s.id as sale_id, 
                   s.customer_id as head_customer_id,
                   s.nom_client_snap as head_customer_name,
                   s.user_id as head_caissier_id,
                   s.is_comptabilise as sale_comptabilise
            FROM sale_items si 
            JOIN sales s ON si.id_vente = s.id 
            WHERE si.id = ? AND si.company_id = ?
        `).get(saleItemId, companyId);

        if (!item) throw new Error("Article introuvable.");

        if (item.is_active === 0 || item.type_ligne === 'RETOUR') {
            throw new Error("Cette ligne a déjà été retournée ou annulée.");
        }

        if (item.is_comptabilise === 1 || item.sale_comptabilise === 1) {
            throw new Error("Action impossible sur une vente comptabilisée.");
        }

        const product = db.prepare(`
            SELECT p.stock_actuel, p.cmp, u.coefficient, u.code, u.unite_reference 
            FROM products p 
            LEFT JOIN unites u ON p.unite_id = u.id
            WHERE p.id = ?
        `).get(item.product_id);

        const qteLignePieces = Math.abs(Number(item.quantite || 0));

        if (product) {
            const stockAvant = Number(product.stock_actuel || 0);
            const stockApres = stockAvant + qteLignePieces;

            db.prepare(`UPDATE products SET stock_actuel = ?, sync_status = 'pending' WHERE id = ?`)
              .run(stockApres, item.product_id);
            db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('products', ?, 'UPDATE', ?)").run(item.product_id, companyId);

            const moveId = `MOV-RET-${Date.now().toString().slice(-6)}`;
            db.prepare(`
                INSERT INTO stock_movements (
                    id, product_id, type_mouvement, reference_id, 
                    quantite, stock_avant, stock_apres, 
                    prix_operation, cmp_resultat, user_id, company_id, sync_status
                ) VALUES (?, ?, 'RETOUR_VENTE', ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
            `).run(
                moveId, item.product_id, item.id_vente, qteLignePieces, 
                stockAvant, stockApres, item.prix_vente_unitaire, 
                (product.cmp || 0), activeUserId, companyId
            );
            db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('stock_movements', ?, 'INSERT', ?)").run(moveId, companyId);
        }

        const returnId = `LIT-RET-${Date.now().toString().slice(-6)}`;
        db.prepare(`
            INSERT INTO sale_items (
                id, lot_id, id_vente, customer_id, type_ligne, product_id, nom_article_snap, 
                quantite, prix_vente_unitaire, remise_montant, montant_ht, 
                taxe_montant, montant_ttc_ligne, is_active, user_id, company_id, sync_status
            ) VALUES (?, ?, ?, ?, 'RETOUR', ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 'pending')
        `).run(
            returnId, item.lot_id, item.id_vente, item.head_customer_id, item.product_id, item.nom_article_snap,
            qteLignePieces, item.prix_vente_unitaire, item.remise_montant, 
            item.montant_ht, item.taxe_montant, item.montant_ttc_ligne,
            activeUserId, companyId
        );
        db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('sale_items', ?, 'INSERT', ?)").run(returnId, companyId);

        db.prepare(`UPDATE sale_items SET is_active = 0, sync_status = 'pending' WHERE id = ?`).run(saleItemId);
        db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('sale_items', ?, 'UPDATE', ?)").run(saleItemId, companyId);

        const paymentReturnId = `PAY-RET-${Date.now().toString().slice(-6)}`;
        db.prepare(`
            INSERT INTO payments (
                id, lot_id, sale_id, customer_id, client_name, caissier_id, 
                montant, moyen_paiement, statut, type_paiement, user_id, company_id, sync_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'VALIDEE', 'REMBOURSEMENT', ?, ?, 'pending')
        `).run(
            paymentReturnId, 
            item.lot_id, 
            item.id_vente, 
            item.head_customer_id, 
            item.head_customer_name, 
            item.head_caissier_id, 
            item.montant_ttc_ligne, 
            item.mode_reglement, 
            activeUserId, 
            companyId
        );
        db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('payments', ?, 'INSERT', ?)").run(paymentReturnId, companyId);

        const totalsItems = db.prepare(`
            SELECT 
                SUM(CASE WHEN type_ligne = 'VENTE' AND is_active = 1 THEN montant_ttc_ligne ELSE 0 END) as total_initial,
                SUM(CASE WHEN type_ligne = 'RETOUR' THEN montant_ttc_ligne ELSE 0 END) as total_retours
            FROM sale_items 
            WHERE id_vente = ?
        `).get(item.id_vente);

        const nouveauMontantVente = (totalsItems.total_initial || 0) - (totalsItems.total_retours || 0);

        const totalsPayments = db.prepare(`
            SELECT 
                SUM(CASE WHEN type_paiement != 'REMBOURSEMENT' THEN montant ELSE 0 END) as total_encaisse,
                SUM(CASE WHEN type_paiement = 'REMBOURSEMENT' THEN montant ELSE 0 END) as total_rembourse
            FROM payments 
            WHERE sale_id = ? AND is_active = 1 AND statut = 'VALIDEE'
        `).get(item.id_vente);

        const nouveauMontantPaye = (totalsPayments.total_encaisse || 0) - (totalsPayments.total_rembourse || 0);
        
        const nouveauReste = Math.max(0, nouveauMontantVente - nouveauMontantPaye);
        let nouveauStatutPaiement = 'PARTIEL';
        if (nouveauReste <= 0.1) nouveauStatutPaiement = 'SOLDE';
        if (nouveauMontantPaye <= 0) nouveauStatutPaiement = 'NON_PAYE';

        const countActive = db.prepare(`
            SELECT COUNT(*) as c FROM sale_items 
            WHERE id_vente = ? AND type_ligne = 'VENTE' AND is_active = 1
        `).get(item.id_vente);

        db.prepare(`
            UPDATE sales 
            SET montant_total = ?, 
                montant_paye = ?, 
                reste_a_payer = ?, 
                payment_status = ?,
                statut_vente = CASE WHEN ? = 0 THEN 'RETOUR' ELSE statut_vente END,
                sync_status = 'pending',
                updated_at = DATETIME('now')
            WHERE id = ?
        `).run(
            Math.max(0, nouveauMontantVente),
            Math.max(0, nouveauMontantPaye),
            nouveauReste,
            nouveauStatutPaiement,
            countActive.c,
            item.id_vente
        );
        db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('sales', ?, 'UPDATE', ?)").run(item.id_vente, companyId);

        return { 
            success: true, 
            saleId: item.id_vente, 
            nouveauReste,
            qte_mouvementee: qteLignePieces,
            coefficient: product?.coefficient || 1,
            unit_code_gros: product?.code || 'CS',
            unit_ref_detail: product?.unite_reference || 'PCS'
        };
    })();
};

// --- GESTION DES PANIERS TEMPORAIRES ---
const getTemporaryCart = async (vendeurId, companyId) => {
    const cart = getDb().prepare(`SELECT lignes FROM temporary_carts WHERE user_id = ? AND company_id = ?`).get(vendeurId, companyId);
    return cart ? JSON.parse(cart.lignes) : [];
};

const syncTemporaryCart = async (vendeurId, companyId, lignes) => {
    getDb().prepare(`INSERT OR REPLACE INTO temporary_carts (user_id, company_id, lignes, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)`).run(vendeurId, companyId, JSON.stringify(lignes));
    return true;
};

const deleteTemporaryCart = async (vendeurId, companyId) => {
    return getDb().prepare(`DELETE FROM temporary_carts WHERE user_id = ? AND company_id = ?`).run(vendeurId, companyId).changes;
};
const deleteTemporaryFactureCart = async (vendeurId, companyId) => {
    return getDb()
        .prepare(`DELETE FROM temporary_factures_carts WHERE user_id = ? AND company_id = ?`)
        .run(vendeurId, companyId).changes;
};

const getTemporaryFactureCart = async (vendeurId, companyId) => {
    const cart = getDb()
        .prepare(`SELECT lignes FROM temporary_factures_carts WHERE user_id = ? AND company_id = ?`)
        .get(vendeurId, companyId);
    return cart ? JSON.parse(cart.lignes) : [];
};

const syncTemporaryFactureCart = async (vendeurId, companyId, lignes) => {
    getDb().prepare(`INSERT OR REPLACE INTO temporary_factures_carts (user_id, company_id, lignes, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)`).run(vendeurId, companyId, JSON.stringify(lignes));
    return true;
};

const getSaleByLotId = async (lotId, companyId) => {
    const db = getDb();
    const paiement = db.prepare(`SELECT * FROM payments WHERE lot_id = ? AND company_id = ?`).get(lotId, companyId);
    if (!paiement) throw new Error("Lot non trouvé.");
    
    const articles = db.prepare(`
        SELECT 
            si.*,
            u.coefficient as unit_coefficient,
            u.code as unit_code_gros,
            u.unite_reference as unit_ref_detail
        FROM sale_items si
        LEFT JOIN products p ON si.product_id = p.id
        LEFT JOIN unites u ON p.unite_id = u.id
        WHERE si.lot_id = ? AND si.company_id = ? AND si.is_active = 1
    `).all(lotId, companyId);

    const articlesHydrates = articles.map(item => {
        const qteBrute = Math.abs(Number(item.quantite || item.qte_vendue || 0));
        
        const expressionFormatee = conversestock.formaterStockPourAffichage(
            qteBrute,
            item.unit_coefficient || 1,
            item.unit_code_gros || 'CS',
            item.unit_ref_detail || 'PCS'
        );

        return {
            ...item,
            qte_vendue_formatee: expressionFormatee,
            quantite_formatee: expressionFormatee
        };
    });

    return { paiement, articles: articlesHydrates };
};

const getSalesForCloture = async (companyId, userId) => {
    const db = getDb();
    try {
        return db.prepare(`
            SELECT 
                pm.id AS payment_method_id,
                COALESCE(pm.libelle, p.moyen_paiement) as mode_paiement, 
                IFNULL(SUM(
                    CASE 
                        WHEN TRIM(UPPER(p.type_paiement)) = 'REMBOURSEMENT' THEN -p.montant 
                        ELSE p.montant 
                    END
                ), 0) AS montant_total
            FROM payments p
            LEFT JOIN sales s ON p.sale_id = s.id
            LEFT JOIN payment_methods pm ON (p.payment_method_id = pm.id OR p.moyen_paiement = pm.code)
            WHERE p.company_id = ? 
              AND (p.caissier_id = ? OR p.user_id = ?)
              AND p.is_cloture = 0
              AND p.is_active = 1
              AND (s.statut_vente IS NULL OR s.statut_vente != 'ANNULEE')
            GROUP BY pm.id, pm.libelle
        `).all(companyId, userId, userId);
    } catch (error) {
        console.error("Erreur dans getSalesForCloture:", error);
        throw error;
    }
};

const getArchivedSales = async (companyId, filters = {}) => {
    const db = getDb();
    const { search, startDate, endDate } = filters;

    let query = `
        SELECT 
            i.id, s.id as id_vente, s.lot_id, i.product_id, i.type_ligne, s.nom_client_snap, s.date_vente, 
            i.nom_article_snap, i.quantite as qte_vendue, i.prix_vente_unitaire as prix_unitaire_snap,
            i.remise_montant as remise_ligne, i.montant_ht as montant_ht_ligne, i.taxe_montant as taxe_ligne, 
            i.montant_ttc_ligne as prix_total_ligne, s.mode_reglement as moyen_paiement, s.statut_vente,
            u.username as nom_utilisateur, s.staff_name_snap as nom_staff, uc.username as nom_caissier,
            IFNULL(un.coefficient, 1) AS coefficient,
            IFNULL(un.code, 'CS') AS unit_code_gros,
            IFNULL(un.unite_reference, 'UNITÉ') AS unit_ref_detail
        FROM sale_items i
        JOIN sales s ON i.id_vente = s.id
        LEFT JOIN products p ON i.product_id = p.id
        LEFT JOIN unites un ON p.unite_id = un.id
        LEFT JOIN users u ON s.user_id = u.id
        LEFT JOIN users uc ON s.caissier_id = uc.id
        WHERE s.company_id = ? 
          AND s.is_archived = 1
    `;
    const params = [companyId];

    if (search) {
        query += ` AND (s.lot_id LIKE ? OR s.nom_client_snap LIKE ? OR i.nom_article_snap LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    
    if (startDate && endDate) {
        query += ` AND date(s.date_vente) BETWEEN date(?) AND date(?)`;
        params.push(startDate, endDate);
    }

    query += ` ORDER BY s.date_vente DESC`;

    try {
        const results = db.prepare(query).all(...params);
        
        return results.map(row => {
            const qteBruteVentePieces = Math.abs(Number(row.qte_vendue || 0));

            const expressionLogistique = conversestock.formaterStockPourAffichage(
                qteBruteVentePieces,
                row.coefficient,
                row.unit_code_gros,
                row.unit_ref_detail
            );

            return {
                ...row,
                qte_vendue_formatee: expressionLogistique
            };
        });

    } catch (error) {
        console.error("🚨 [ARCHIVED SALES CRITICAL ERROR] Échec lors de la lecture des ventes archivées :", error.message);
        throw error;
    }
};

const getDeletedSales = async (companyId, filters = {}) => {
    const db = getDb();
    const { search } = filters;

    let query = `
        SELECT 
            i.id, 
            s.id as id_vente, 
            s.lot_id, 
            i.product_id, 
            i.type_ligne, 
            s.nom_client_snap, 
            s.date_vente, 
            i.nom_article_snap, 
            i.quantite as qte_vendue, 
            i.prix_vente_unitaire as prix_unitaire_snap,
            i.remise_montant as remise_ligne, 
            i.montant_ht as montant_ht_ligne, 
            i.taxe_montant as taxe_ligne, 
            i.montant_ttc_ligne as prix_total_ligne, 
            s.mode_reglement as moyen_paiement, 
            s.statut_vente,
            u.username as nom_utilisateur, 
            s.staff_name_snap as nom_staff, 
            uc.username as nom_caissier,

            CASE 
                WHEN i.type_ligne = 'RETOUR' THEN 'RETOUR'
                WHEN s.statut_vente = 'ANNULEE' THEN 'ANNULEE'
                ELSE 'ACTIF'
            END as statut_ligne,
            
            IFNULL(un.coefficient, 1) AS unit_coefficient,
            IFNULL(un.code, 'CS') AS unit_code_gros,
            IFNULL(un.unite_reference, 'PCS') AS unit_ref_detail

        FROM sale_items i
        JOIN sales s ON i.id_vente = s.id
        LEFT JOIN products prod ON i.product_id = prod.id
        LEFT JOIN unites un ON prod.unite_id = un.id
        LEFT JOIN users u ON s.user_id = u.id
        LEFT JOIN users uc ON s.caissier_id = uc.id

        WHERE s.company_id = ?
        AND (
            s.statut_vente = 'ANNULEE'
            OR i.type_ligne = 'RETOUR'
        )
    `;

    const params = [companyId];

    if (search) {
        query += ` AND (s.lot_id LIKE ? OR s.nom_client_snap LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`);
    }

    query += ` ORDER BY s.date_vente DESC`;

    try {
        const results = db.prepare(query).all(...params);

        return results.map(row => {
            const qteBruteVentePieces = Math.abs(Number(row.qte_vendue || 0));

            const expressionLogistique = conversestock.formaterStockPourAffichage(
                qteBruteVentePieces,
                row.unit_coefficient,
                row.unit_code_gros,
                row.unit_ref_detail
            );

            return {
                ...row,
                qte_vendue_formatee: expressionLogistique
            };
        });
    } catch (error) {
        console.error("🚨 [DELETED SALES ERROR] Échec lecture ventes annulées :", error.message);
        throw error;
    }
};

const archiveSale = async (lotId, companyId, userContext) => {
    const db = getDb();
    const { secureUserId, userName } = userContext;

    const executeArchive = db.transaction(() => {
        const result = db.prepare(`
            UPDATE sales 
            SET is_archived = 1, sync_status = 'pending' 
            WHERE lot_id = ? AND company_id = ?
        `).run(lotId, companyId);

        if (result.changes === 0) throw new Error("Lot introuvable");

        const sale = db.prepare("SELECT id FROM sales WHERE lot_id = ? AND company_id = ?").get(lotId, companyId);
        if (sale) {
            db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('sales', ?, 'UPDATE', ?)").run(sale.id, companyId);
        }

        try {
            logAction({ 
                userId: secureUserId, 
                userName, 
                actionType: 'ARCHIVAGE', 
                tableConcernee: 'sales', 
                referenceId: lotId, 
                description: `Archivage du lot : ${lotId}`, 
                companyId 
            });
        } catch (auditError) {
            console.error("Erreur Audit:", auditError.message);
        }
        return true;
    });

    return executeArchive();
};

const getActiveDebts = async (companyId) => {
    const db = getDb();
    return db.prepare(`
        SELECT 
            s.nom_client_snap AS client,
            COUNT(s.id) AS nombre_factures,
            SUM(s.montant_total) AS total_du_global,
            SUM(IFNULL(p_sum.total_net_paye, 0)) AS total_encaisse_global,
            
            JSON_GROUP_ARRAY(
                JSON_OBJECT(
                    'id', s.id,
                    'lot_id', s.lot_id,
                    'date_vente', s.date_vente,
                    'statut_vente', s.statut_vente,
                    'montant_total', s.montant_total,
                    'deja_paye', ROUND(IFNULL(p_sum.total_net_paye, 0), 2),
                    'reste_a_payer', ROUND(s.montant_total - IFNULL(p_sum.total_net_paye, 0), 2),
                    
                    'articles_factures', (
                        SELECT JSON_GROUP_ARRAY(
                            JSON_OBJECT(
                                'product_id', pi.product_id,
                                'nom_article', pi.nom_article_snap,
                                'qte_pieces', pi.quantite,
                                'coeff', IFNULL(un.coefficient, 1),
                                'code_gros', IFNULL(un.code, 'CS'),
                                'ref_detail', IFNULL(un.unite_reference, 'PCS')
                            )
                        )
                        FROM sale_items pi
                        LEFT JOIN products prod ON pi.product_id = prod.id
                        LEFT JOIN unites un ON prod.unite_id = un.id
                        WHERE pi.id_vente = s.id AND (pi.is_active = 1 OR s.statut_vente = 'RETOUR')
                    ),

                    'paiements', (
                        SELECT JSON_GROUP_ARRAY(
                            JSON_OBJECT(
                                'id', p.id,
                                'date', p.created_at,
                                'montant', p.montant,
                                'moyen_paiement', p.moyen_paiement,
                                'type_operation', p.type_paiement
                            )
                        )
                        FROM payments p 
                        WHERE p.sale_id = s.id 
                          AND p.statut = 'VALIDEE' 
                          AND p.is_active = 1
                        ORDER BY p.created_at ASC
                    )
                )
            ) AS detail_factures
        FROM sales s
        LEFT JOIN (
            SELECT sale_id, 
                   SUM(CASE 
                       WHEN TRIM(UPPER(type_paiement)) = 'REMBOURSEMENT' THEN -montant 
                       ELSE montant 
                   END) as total_net_paye 
            FROM payments 
            WHERE statut = 'VALIDEE' AND is_active = 1 
            GROUP BY sale_id
        ) p_sum ON s.id = p_sum.sale_id
        WHERE s.company_id = ? 
          AND s.statut_vente IN ('VALIDEE', 'RETOUR')
          AND s.is_active = 1
        GROUP BY s.nom_client_snap
        ORDER BY s.nom_client_snap ASC
    `).all(companyId.toString()).map(row => {
        let detailles = [];
        try {
            detailles = row.detail_factures ? JSON.parse(row.detail_factures) : [];
        } catch (jsonErr) {
            detailles = [];
        }
        return {
            ...row,
            detail_factures: detailles
        };
    });
};

const payDebt = async (saleId, paymentData) => {
    const db = getDb();
    const { 
        montant, 
        payment_method_id, 
        moyen_paiement,       
        secureUserId, 
        secureCompanyId, 
        type_paiement = 'REGLEMENT' 
    } = paymentData;

    const executeTransaction = db.transaction(() => {
        const vente = db.prepare(`
            SELECT id, lot_id, customer_id, nom_client_snap, montant_total, montant_paye 
            FROM sales 
            WHERE id = ? AND company_id = ? AND is_active = 1 AND statut_vente IN ('VALIDEE', 'RETOUR')
        `).get(saleId, secureCompanyId);

        if (!vente) throw new Error("Facture introuvable.");

        const totalFacture = parseFloat(vente.montant_total || 0);
        
        const totalsPayments = db.prepare(`
            SELECT 
                SUM(CASE WHEN TRIM(UPPER(type_paiement)) != 'REMBOURSEMENT' THEN montant ELSE 0 END) as total_encaisse,
                SUM(CASE WHEN TRIM(UPPER(type_paiement)) = 'REMBOURSEMENT' THEN montant ELSE 0 END) as total_rembourse
            FROM payments 
            WHERE sale_id = ? AND is_active = 1 AND statut = 'VALIDEE'
        `).get(saleId);

        const dejaPayeNet = (totalsPayments.total_encaisse || 0) - (totalsPayments.total_rembourse || 0);
        const resteReel = Math.max(0, totalFacture - dejaPayeNet);

        if (resteReel <= 0.01) throw new Error("Cette facture est déjà soldée.");

        const montantAEncaisser = Math.min(parseFloat(montant), resteReel);
        const nouveauMontantPayeEntete = (totalsPayments.total_encaisse || 0) + montantAEncaisser;
        
        const nouveauResteEntete = Math.max(0, Number((totalFacture - (nouveauMontantPayeEntete - (totalsPayments.total_rembourse || 0))).toFixed(2)));
        const nouveauStatutPaiement = nouveauResteEntete <= 0.1 ? 'SOLDE' : 'PARTIEL';

        const paymentId = `PAY-${Date.now().toString().slice(-8)}`;
        
        db.prepare(`
            INSERT INTO payments (
                id, lot_id, sale_id, customer_id, client_name, 
                montant, payment_method_id, moyen_paiement, user_id, caissier_id, 
                company_id, statut, type_paiement, sync_status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'VALIDEE', ?, 'pending', DATETIME('now'))
        `).run(
            paymentId, vente.lot_id, vente.id, vente.customer_id, vente.nom_client_snap,
            montantAEncaisser, payment_method_id, moyen_paiement, secureUserId, secureUserId, 
            secureCompanyId, type_paiement
        );

        db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('payments', ?, 'INSERT', ?)")
          .run(paymentId, secureCompanyId);

        db.prepare(`
            UPDATE sales 
            SET montant_paye = ?, reste_a_payer = ?, payment_status = ?, sync_status = 'pending', updated_at = DATETIME('now')
            WHERE id = ?
        `).run(nouveauMontantPayeEntete, nouveauResteEntete, nouveauStatutPaiement, saleId);

        db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('sales', ?, 'UPDATE', ?)")
          .run(saleId, secureCompanyId);

        return { success: true, paymentId, nouveauReste: nouveauResteEntete };
    });

    return executeTransaction(); 
};

const getClientByFacture = async (id, companyId) => {
    const db = getDb();
    try {
        return db.prepare(`
            SELECT nom_client_snap 
            FROM sales 
            WHERE id = ? AND company_id = ?
        `).get(id, companyId);
    } catch (error) {
        console.error("Erreur dans le service getClientByFacture:", error.message);
        throw error;
    }
};

const getVraiesFacturesConsignation = async (companyId) => {
    const db = getDb();
    try {
        return db.prepare(`
            SELECT id, lot_id, nom_client_snap 
            FROM sales 
            WHERE company_id = ? AND statut_vente = 'VALIDEE'
            ORDER BY date_vente DESC
        `).all(companyId);
    } catch (error) {
        console.error("Erreur service getVraiesFacturesConsignation:", error.message);
        throw error;
    }
};

const getSalesDetailsByDate = async (startDate, endDate, companyId) => {
    try {
        const db = getDb();
        
        const [sDay, sMonth, sYear] = startDate.split('/');
        const isoStartDate = `${sYear}-${sMonth}-${sDay}T00:00:00.000Z`;
        
        const [eDay, eMonth, eYear] = endDate.split('/');
        const isoEndDate = `${eYear}-${eMonth}-${eDay}T23:59:59.999Z`;

        return db.prepare(`
            SELECT 
                i.product_id as id_article,
                i.nom_article_snap as nom_article,
                SUM(i.quantite) as quantite,
                i.prix_achat_unitaire_snap as prix_achat, 
                SUM(i.montant_achat_total_snap) as total_achat_facture,
                i.prix_vente_unitaire as prix_unitaire,
                SUM(i.montant_ttc_ligne) as total_vente_facture,
                IFNULL(u.libelle, 'Unité') as unite_libelle, 
                IFNULL(u.coefficient, 1) as unit_coefficient,
                IFNULL(u.code, 'CS') as unit_code_gros,
                IFNULL(u.unite_reference, 'PCS') as unit_ref_detail,
                s.customer_id as customer_id,
                IFNULL(s.nom_client_snap, 'CLIENT AU COMPTANT') as client_nom
            FROM sale_items i
            JOIN sales s ON i.id_vente = s.id
            LEFT JOIN unites u ON i.company_id = u.company_id AND u.id = (SELECT unite_id FROM products WHERE id = i.product_id)        
            WHERE s.company_id = ? 
              AND s.date_vente BETWEEN ? AND ?
              AND s.statut_vente = 'VALIDEE'
              AND i.is_active = 1
            GROUP BY i.product_id, i.prix_vente_unitaire, i.prix_achat_unitaire_snap, s.customer_id, s.nom_client_snap
            ORDER BY i.nom_article_snap ASC
        `).all(companyId, isoStartDate, isoEndDate);
    } catch (error) {
        console.error("❌ Erreur SQL dans getSalesDetailsByDate:", error);
        throw error;
    }
};

module.exports = { 
    createSale, 
    getAllSales, 
    getTemporaryCart, 
    syncTemporaryCart, 
    getSalesForCloture,
    deleteTemporaryCart, 
    getPerformanceDuJour, 
    getSaleByLotId, 
    cancelSaleItem, 
    handleReturnSaleItem, 
    getSalesDetailsByDate,
    getTemporaryFactureCart, 
    syncTemporaryFactureCart, 
    deleteTemporaryFactureCart, 
    payDebt, 
    getClientByFacture,
    getDeletedSales, 
    getArchivedSales, 
    cancelSale, 
    archiveSale, 
    getActiveDebts, 
    getVraiesFacturesConsignation 
};
