const { getDb } = require('../config/database');
const conversestock = require('./conversestock'); // ✅ Importation du service anti-litige

const cleanNum = (val) => Math.round((parseFloat(val) || 0) * 100) / 100;

class ApprovisionnementService {
    // ✅ Utilitaire pour générer des IDs uniques
    genererId(prefix) {
        return `${prefix}-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`;
    }

    // ✅ Audit interne avec synchronisation Cloud
    logActionInternal(db, { userId, userName, actionType, tableConcernee, referenceId, description, companyId }) {
        const logId = `LOG-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
        const sql = `
            INSERT INTO audit_log 
            (id, user_id, user_name, action_type, table_concernee, reference_id, description, company_id, sync_status)                
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        `;
        db.prepare(sql).run(logId, userId, userName, actionType, tableConcernee, referenceId, description, companyId);
        db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES (?, ?, ?, ?)`)
          .run('audit_log', logId, 'INSERT', companyId);
    }

async saveApprovisionnement(data, user) {
    const db = getDb();
    const companyId = user?.companyId?.toString() || user?.company_id?.toString();
    const userId = user?.userId?.toString() || user?.id?.toString();
    const userName = user?.username || "utilisateur";
    const items = Array.isArray(data) ? data : (data.items || []);
    const header = !Array.isArray(data) ? (data.header || {}) : {};
    const fId = header.fournisseurId;
    const fNum = header.numFacture?.trim();
    const modeBrut = header.modeReglement || '';
    const typeAchat = header.typeAchat || 'COMPTANT'; 

    // 🎯 RECOUVREMENT LOGISTIQUE DE LA CLÉ COMMANDE TRANSMIS PAR LE FRONTEND
    const idCommandeSource = header.id_commande_source || null;

    if (!userId || !companyId) throw new Error("Session expirée. Veuillez vous reconnecter.");
    if (!fId || !fNum) throw new Error("Le fournisseur et le N° de facture sont obligatoires.");
    
    // Sécurité sur le mode de règlement (sauf si c'est un crédit pur)
    if (typeAchat !== 'CREDIT' && !modeBrut) {
        throw new Error("Vous devez sélectionner un moyen de règlement (Caisse ou Banque).");
    }
    if (items.length === 0) throw new Error("Le bordereau ne contient aucun article.");
    
    const totalBordereauTTC = cleanNum(items.reduce((sum, i) => sum + (Number(i.montant_facture_ligne) || 0), 0));
    let montantPayeGlobal = 0;
    let modePourBase = modeBrut.toUpperCase().trim();

    if (typeAchat === 'ACOMPTE') {
        montantPayeGlobal = cleanNum(header.montantAvance);
    } else if (typeAchat === 'CREDIT') {
        montantPayeGlobal = 0;
        modePourBase = 'CREDIT'; 
    } else {
        montantPayeGlobal = totalBordereauTTC;
    }

    const resteAPayerGlobal = cleanNum(Math.max(0, totalBordereauTTC - montantPayeGlobal));
    let payStatus = resteAPayerGlobal <= 0 ? 'payé' : (montantPayeGlobal > 0 ? 'partiel' : 'impayé');
    const idAchat = this.genererId('ACH');
    const lotId = header.lotId || this.genererId('LOT');

    // ✅ 1. DÉCLARATION PROPRE DE LA TRANSACTION
    const executionTransaction = db.transaction(() => {
        db.prepare(`
            INSERT INTO purchases (
                id, lot_id, supplier_id, nom_fournisseur_snap, num_facture, 
                date_achat, montant_total, montant_paye, reste_a_payer, 
                payment_status, mode_reglement, user_id, company_id, is_comptabilise, sync_status
            ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?, 0, 'pending')
        `).run(
            idAchat, lotId, fId, header.fournisseur || 'FOURNISSEUR DIVERS', 
            fNum, totalBordereauTTC, montantPayeGlobal, 
            resteAPayerGlobal, payStatus, modePourBase, userId, companyId
        );

        db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES (?, ?, ?, ?)`)
          .run('purchases', idAchat, 'INSERT', companyId);

        // 🎯 LOGIQUE COMPTABLE COMPLÉMENTAIRE : Marquage réglementaire et clôture du bon logistique
        if (idCommandeSource) {
            db.prepare(`
                UPDATE purchase_orders 
                SET statut_commande = 'RECEPTIONNE', sync_status = 'pending', updated_at = CURRENT_TIMESTAMP 
                WHERE id = ? AND company_id = ?
            `).run(idCommandeSource.toString(), companyId);

            db.prepare(`
                INSERT INTO sync_queue (table_name, record_id, operation, company_id)
                VALUES ('purchase_orders', ?, 'UPDATE', ?)
            `).run(idCommandeSource.toString(), companyId);
        }

        if (montantPayeGlobal > 0) {
            const payId = this.genererId('PAY');
            db.prepare(`
                INSERT INTO purchase_payments (
                    id, lot_id, purchase_id, montant, date_reglement, 
                    mode_reglement, statut, reference_paiement, user_id, company_id, sync_status
                ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, 'pending')
            `).run(
                payId, lotId, idAchat, montantPayeGlobal, modePourBase, 'VALIDEE', typeAchat, userId, companyId
            );
            db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES (?, ?, ?, ?)`)
              .run('purchase_payments', payId, 'INSERT', companyId);
        }

        for (const item of items) {
            const detailId = this.genererId('ACD');
            const pId = item.product_id;

            // ✅ 2. RECUPERATION DU COEFFICIENT DE CONVERSION DE L'ARTICLE
            const product = db.prepare(`
                SELECT p.stock_actuel, p.cmp, p.nom, u.coefficient 
                FROM products p
                LEFT JOIN unites u ON p.unite_id = u.id
                WHERE p.id = ?
            `).get(pId);

            if (!product) throw new Error(`Le produit avec l'ID ${pId} n'existe pas.`);
            
            const stockAvant = Number(product.stock_actuel || 0); // En pièces natives
            const cmpAncien = Number(product.cmp || 0);            // CMP actuel (exprimé en Gros/Carton si coeff > 1)
            const coeffLogistique = Number(product.coefficient || 1); // ex: 6 ou 12
            
            // 🎯 ANALYSE DE LA QUANTITÉ SAISIE
            const qteBruteAchat = Number(item.qte_achetee || item.quantite || 0);
            const uniteProvenance = String(item.unite || item.unit || item.mesure || item.unite_reference || '').toUpperCase().trim();
            const texteFormateProvenance = String(item.qte_formate || item.qte_achetee_formate || item.stock_formate || '').toUpperCase().trim();

            let expressionAnalysee = "";

            if (uniteProvenance === 'BTS' || uniteProvenance === 'PCS' || texteFormateProvenance.includes('BTS') || texteFormateProvenance.includes('PCS')) {
                expressionAnalysee = `0 + ${qteBruteAchat}`;
            } else if (uniteProvenance === 'CS' || texteFormateProvenance.includes('CS')) {
                expressionAnalysee = `${qteBruteAchat} + 0`;
            } else {
                expressionAnalysee = String(item.qte_achetee).trim();
            }

            // Nombre total de pièces natives achetées
            const qtePieces = conversestock.calculerUnitesNatives(db, pId, expressionAnalysee);
            
            if (qtePieces <= 0) {
                throw new Error(`La quantité d'achat saisie pour l'article "${product.nom}" est invalide ou nulle.`);
            }

            const mntTTC = Number(item.montant_facture_ligne) || 0;
            const mntHT = Number(item.montant_ht_ligne) || mntTTC;
            const puAchatPieces = mntTTC / qtePieces;

            // Insertion dans purchase_items
            db.prepare(`
                INSERT INTO purchase_items (
                    id, lot_id, id_achat, product_id, nom_article_snap, 
                    qte_achetee, prix_achat_unitaire, montant_facture_ligne, 
                    montant_ht_ligne, montant_tva_ligne, stock_avant_achat, 
                    stock_apres_achat, cmp_ancien, supplier_id, num_facture,
                    user_id, company_id, sync_status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
            `).run(
                detailId, lotId, idAchat, pId, product.nom || 'Article',
                qtePieces, puAchatPieces, mntTTC, mntHT, Number(item.montant_tva_ligne || 0),
                stockAvant, (stockAvant + qtePieces), cmpAncien, fId, fNum, userId, companyId
            );

            db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES (?, ?, ?, ?)`)
              .run('purchase_items', detailId, 'INSERT', companyId);

            // ✅ 3. CALCUL PRÉCIS ET CONVERSION DE CMP EN GROS (CARTON / CAISSE)
            const stockApres = stockAvant + qtePieces;
            
            // A. On ramène le CMP ancien à sa valeur par pièce native (Bouteille)
            const cmpAncienPiece = coeffLogistique > 1 ? (cmpAncien / coeffLogistique) : cmpAncien;

            // B. Valeur du stock existant (Pièces * CMP Pièce) + Montant HT Achat
            const valeurStockExistant = stockAvant * cmpAncienPiece;
            const valeurTotalStock = valeurStockExistant + mntHT;

            // C. Calcul du nouveau CMP unitaire par pièce native
            const nouveauCMPPiece = stockApres > 0 ? (valeurTotalStock / stockApres) : cmpAncienPiece;

            // D. Si l'article possède un coefficient (Gros), on convertit le CMP final au GROS (Carton)
            const nouveauCMPFinal = cleanNum(coeffLogistique > 1 ? (nouveauCMPPiece * coeffLogistique) : nouveauCMPPiece);

            // E. Mise à jour de la table products
            db.prepare(`
                UPDATE products 
                SET stock_actuel = ?, 
                    cmp = ?, 
                    updated_at = CURRENT_TIMESTAMP, 
                    sync_status = 'pending'
                WHERE id = ?
            `).run(stockApres, nouveauCMPFinal, pId);

            db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('products', ?, 'UPDATE', ?)`)
              .run(pId.toString(), companyId);
        }

        if (resteAPayerGlobal > 0) {
            db.prepare(`UPDATE suppliers SET solde_dette = ROUND(solde_dette + ?, 2), sync_status = 'pending' WHERE id = ?`)
              .run(resteAPayerGlobal, fId);
            db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('suppliers', ?, 'UPDATE', ?)`)
              .run(fId.toString(), companyId);
        }

        this.logActionInternal(db, {
            userId, userName, actionType: 'INSERTION', tableConcernee: 'purchases',
            referenceId: idAchat, 
            description: `Achat ${typeAchat} Facture ${fNum}. Total: ${totalBordereauTTC}, Payé: ${montantPayeGlobal}, Reste: ${resteAPayerGlobal}`, 
            companyId
        });

        // 🛒 Suppression du panier temporaire avec notification de la file de sync
        db.prepare(`DELETE FROM temporary_purchases WHERE user_id = ? AND company_id = ? AND cart_type = 'ARTICLE'`)
          .run(userId, companyId);
        
        db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES (?, ?, ?, ?)`)
          .run('temporary_purchases', `${userId}_ARTICLE`, 'DELETE', companyId);
        
        return idAchat;
    });

    // ✅ 4. APPEL ET RETOUR STRICT DE L'ID AU CONTRÔLEUR
    return executionTransaction();
}

async getAllPurchases(companyId) {
    const db = getDb();
    
    const rows = db.prepare(`
        SELECT 
            pi.id,
            pi.lot_id,
            pi.id_achat,
            pi.type_ligne,
            pi.mouvement_type,
            pi.product_id,
            pi.nom_article_snap,
            pi.observation,
            pi.prix_achat_unitaire,
            pi.stock_avant_achat,
            pi.stock_apres_achat,
            pi.supplier_id,
            pi.num_facture,
            pi.user_id,
            pi.company_id,
            pi.is_active,
            pi.is_comptabilise,
            pi.sync_status,
            pi.created_at,
            pi.updated_at,
            u.coefficient as unit_coefficient,
            u.code as unit_code_gros,
            u.unite_reference as unit_ref_detail,
            pi.qte_achetee as qte_achetee,
            pi.montant_facture_ligne as montant_facture_ligne,
            pi.montant_ht_ligne as montant_ht_ligne,
            pi.montant_tva_ligne as montant_tva_ligne,
            p.mode_reglement, 
            p.payment_status, 
            p.date_achat as date_entete, 
            s.nom as nom_fournisseur_reel
        FROM purchase_items pi
        JOIN purchases p ON pi.id_achat = p.id
        LEFT JOIN products prod ON pi.product_id = prod.id
        LEFT JOIN unites u ON prod.unite_id = u.id
        LEFT JOIN suppliers s ON p.supplier_id = s.id
        WHERE pi.company_id = ? 
          AND p.is_archived = 0 
          AND pi.is_active = 1 
        ORDER BY pi.created_at DESC
    `).all(companyId.toString());

    return rows.map(row => {
        const qteBruteLogistique = Math.abs(Number(row.qte_achetee || 0));

        let expressionTexte = this.conversestock?.formaterStockPourAffichage(
            qteBruteLogistique,
            row.unit_coefficient,
            row.unit_code_gros,
            row.unit_ref_detail
        ) || `${qteBruteLogistique} UNITÉ`;

        if (row.type_ligne === 'RETOUR') {
            expressionTexte = `- (${expressionTexte})`;
        }

        return {
            ...row,
            qte_achetee_formatee: expressionTexte 
        };
    });
}

async getArchivedPurchases(companyId) {
    const db = getDb();
    return db.prepare(`
        SELECT pi.id,
               pi.id_achat,
               pi.lot_id,
               pi.num_facture,
               pi.product_id,
               pi.nom_article_snap,
               pi.qte_achetee,
               pi.montant_ht_ligne,
               pi.montant_tva_ligne,
               pi.montant_facture_ligne,
               pi.is_active,
               pi.type_ligne,
               p.date_achat as date_entete,
               p.is_archived,
               p.user_id as nom_utilisateur,
               s.nom as nom_fournisseur_snap
        FROM purchase_items pi
        JOIN purchases p ON pi.id_achat = p.id
        LEFT JOIN suppliers s ON p.supplier_id = s.id
        WHERE pi.company_id = ? 
          AND p.is_archived = 1 
        ORDER BY pi.updated_at DESC
    `).all(companyId.toString());
}

async archiveLot(lotId, companyId, userContext) {
    const db = getDb();
    const { secureUserId, userName } = userContext;

    return db.transaction(() => {
        const result = db.prepare(`
            UPDATE purchases 
            SET is_archived = 1, sync_status = 'pending', updated_at = CURRENT_TIMESTAMP 
            WHERE lot_id = ? AND company_id = ?
        `).run(lotId, companyId);

        if (result.changes === 0) throw new Error("Lot introuvable ou déjà archivé.");

        this.logActionInternal(db, {
            userId: secureUserId,
            userName: userName,
            actionType: 'ARCHIVAGE_LOT',
            tableConcernee: 'purchases', 
            referenceId: lotId,
            description: `Archivage global du lot : ${lotId} (Nettoyage interface)`,
            companyId: companyId
        });

        db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES (?, ?, ?, ?)`)
          .run('purchases_lot', lotId, 'UPDATE_BATCH', companyId);

        return true;
    })();
}

async getTemporaryCart(userId, companyId) {
    const db = getDb();
    const row = db.prepare(`
        SELECT items FROM temporary_purchases 
        WHERE user_id = ? AND company_id = ? AND cart_type = 'ARTICLE'
    `).get(userId, companyId);
    
    if (!row || !row.items) return [];
    
    try {
        return JSON.parse(row.items);
    } catch (jsonErr) {
        console.error("🚨 [TEMPORARY CART] Erreur de parsing JSON pour l'utilisateur:", userId, jsonErr.message);
        return [];
    }
}

async syncTemporaryCart(items, userId, companyId) {
    const db = getDb();
    db.prepare(`
        INSERT INTO temporary_purchases (user_id, company_id, cart_type, items, updated_at) 
        VALUES (?, ?, 'ARTICLE', ?, CURRENT_TIMESTAMP) 
        ON CONFLICT(user_id, company_id, cart_type) 
        DO UPDATE SET items = excluded.items, updated_at = CURRENT_TIMESTAMP
    `).run(userId, companyId, JSON.stringify(items));
}

async clearTemporaryCart(userId, companyId) {
    const db = getDb();
    db.prepare(`
        DELETE FROM temporary_purchases 
        WHERE user_id = ? AND company_id = ? AND cart_type = 'ARTICLE'
    `).run(userId, companyId);
}

async archivePurchase(purchaseId, companyId, userContext) {
    const db = getDb();
    const { secureUserId, userName } = userContext;

    return db.transaction(() => {
        const result = db.prepare(`
            UPDATE purchases 
            SET is_archived = 1, sync_status = 'pending' 
            WHERE id = ? AND company_id = ?
        `).run(purchaseId, companyId);

        if (result.changes === 0) throw new Error("Achat introuvable.");

        this.logActionInternal(db, {
            userId: secureUserId,
            userName,
            actionType: 'ARCHIVAGE',
            tableConcernee: 'purchases',
            referenceId: purchaseId,
            description: `Archivage de la facture d'achat : ${purchaseId}`,
            companyId
        });

        db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES (?, ?, ?, ?)`)
          .run('purchases', purchaseId, 'UPDATE', companyId);

        return true;
    })();
}

async getSupplierDebts(companyId) {
    const db = getDb();
    return db.prepare(`
        SELECT 
            p.nom_fournisseur_snap as fournisseur,
            p.supplier_id,
            SUM(p.reste_a_payer) as total_dette,
            json_group_array(
                json_object(
                    'id', p.id,
                    'lot_id', p.lot_id,
                    'num_facture', p.num_facture,
                    'date_achat', p.date_achat,
                    'montant_total', p.montant_total,
                    'montant_paye', p.montant_paye,
                    'reste_a_payer', p.reste_a_payer,
                    'is_archived', p.is_archived,
                    'articles_factures', (
                        SELECT json_group_array(
                            json_object(
                                'product_id', pi.product_id,
                                'nom_article', pi.nom_article_snap,
                                'qte_pieces', pi.qte_achetee,
                                'coeff', u.coefficient,
                                'code_gros', u.code,
                                'ref_detail', u.unite_reference
                            )
                        )
                        FROM purchase_items pi
                        LEFT JOIN products prod ON pi.product_id = prod.id
                        LEFT JOIN unites u ON prod.unite_id = u.id
                        WHERE pi.id_achat = p.id AND (pi.is_active = 1 OR p.is_archived = 1)
                    ),
                    'paiements', (
                        SELECT json_group_array(
                            json_object(
                                'id', pp.id, 
                                'montant', pp.montant, 
                                'date', pp.date_reglement,
                                'mode_reglement', pp.mode_reglement,       
                                'reference_paiement', pp.reference_paiement 
                            )
                        )
                        FROM purchase_payments pp 
                        WHERE pp.purchase_id = p.id AND pp.is_active = 1
                    )
                )
            ) as detail_achats
        FROM purchases p
        WHERE p.company_id = ? 
          AND p.reste_a_payer > 0 
          AND (p.is_active = 1 OR p.is_archived = 1)
        GROUP BY p.supplier_id
    `).all(companyId.toString());
}

async getSoldPurchases(companyId) {
    const db = getDb();
    return db.prepare(`
        SELECT 
            p.nom_fournisseur_snap as fournisseur,
            p.supplier_id,
            SUM(p.montant_total) as total_historique,
            json_group_array(
                json_object(
                    'id', p.id,
                    'lot_id', p.lot_id,
                    'num_facture', p.num_facture,
                    'date_achat', p.date_achat,
                    'montant_total', p.montant_total,
                    'montant_paye', p.montant_paye,
                    'reste_a_payer', p.reste_a_payer,
                    'is_archived', p.is_archived,
                    'articles_factures', (
                        SELECT json_group_array(
                            json_object(
                                'product_id', pi.product_id,
                                'nom_article', pi.nom_article_snap,
                                'qte_pieces', pi.qte_achetee,
                                'coeff', u.coefficient,
                                'code_gros', u.code,
                                'ref_detail', u.unite_reference
                            )
                        )
                        FROM purchase_items pi
                        LEFT JOIN products prod ON pi.product_id = prod.id
                        LEFT JOIN unites u ON prod.unite_id = u.id
                        WHERE pi.id_achat = p.id AND (pi.is_active = 1 OR p.is_archived = 1)
                    ),
                    'paiements', (
                        SELECT json_group_array(
                            json_object(
                                'id', pp.id, 
                                'montant', pp.montant, 
                                'date', pp.date_reglement,
                                'mode_reglement', pp.mode_reglement,       
                                'reference_paiement', pp.reference_paiement 
                            )
                        )
                        FROM purchase_payments pp 
                        WHERE pp.purchase_id = p.id AND pp.is_active = 1
                    )
                )
            ) as detail_achats
        FROM purchases p
        WHERE p.company_id = ? 
          AND p.reste_a_payer <= 0  
          AND (p.is_active = 1 OR p.is_archived = 1)
        GROUP BY p.supplier_id
    `).all(companyId.toString());
}

async recordDebtPayment(paymentData, user) {
    const db = getDb();
    const { purchase_id, montant, moyen_paiement, fournisseur_id } = paymentData;
    const companyId = user?.companyId || user?.company_id;
    const userId = user?.userId || user?.id;

    const mntEvalue = parseFloat(montant) || 0;

    return db.transaction(() => {
        const purchase = db.prepare("SELECT lot_id, reste_a_payer FROM purchases WHERE id = ? AND company_id = ?")
                           .get(purchase_id, companyId);
        
        if (!purchase) {
            throw new Error("Impossible de trouver la facture associée. Le paiement a été annulé.");
        }
        
        const lotIdOriginal = purchase.lot_id;
        const payId = this.genererId('PAY');

        db.prepare(`
            INSERT INTO purchase_payments (
                id, purchase_id, lot_id, montant, date_reglement, 
                mode_reglement, statut, reference_paiement, user_id, company_id, sync_status
            ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, 'pending')
        `).run(
            payId, 
            purchase_id, 
            lotIdOriginal, 
            mntEvalue, 
            moyen_paiement, 
            'VALIDEE',    
            'REGLEMENT',  
            userId, 
            companyId
        );

        db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES (?, ?, ?, ?)`)
          .run('purchase_payments', payId, 'INSERT', companyId);

        db.prepare(`
            UPDATE purchases 
            SET montant_paye = ROUND(montant_paye + ?, 2), 
                reste_a_payer = ROUND(reste_a_payer - ?, 2),
                payment_status = CASE WHEN ROUND(reste_a_payer - ?, 2) <= 0 THEN 'payé' ELSE 'partiel' END,
                sync_status = 'pending',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(mntEvalue, mntEvalue, mntEvalue, purchase_id);

        db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES (?, ?, ?, ?)`)
          .run('purchases', purchase_id, 'UPDATE', companyId);

        db.prepare(`
            UPDATE suppliers 
            SET solde_dette = ROUND(solde_dette - ?, 2),
                sync_status = 'pending',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(mntEvalue, fournisseur_id);

        db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES (?, ?, ?, ?)`)
          .run('suppliers', fournisseur_id, 'UPDATE', companyId);

        this.logActionInternal(db, {
            userId, 
            userName: user?.username || "utilisateur", 
            actionType: 'PAIEMENT_DETTE',
            tableConcernee: 'purchase_payments', 
            referenceId: payId,
            description: `Règlement de ${mntEvalue} (Lot: ${lotIdOriginal}) pour la facture ${purchase_id}`, 
            companyId
        });

        return { success: true, payId };
    })();
}

}

module.exports = new ApprovisionnementService();