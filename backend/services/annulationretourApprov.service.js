const { getDb } = require('../config/database');
const conversestock = require('./conversestock'); // ✅ Importation du service anti-litige (Même dossier)

const cleanNum = (val) =>
    Math.round((parseFloat(val) || 0) * 100) / 100;

class AnnulationRetourService {
    genererId(prefix) {
        return `${prefix}-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`;
    }

    calculerNouveauCMP(stockAvant, stockApres, cmpAncien, qteSortiePieces, puAchatOriginePieces) {
        const valeurAvant = stockAvant * cmpAncien;
        const valeurSortie = puAchatOriginePieces * qteSortiePieces;
        const nouvelleValeur = valeurAvant - valeurSortie;
        if (stockApres <= 0) return cmpAncien;
        return cleanNum(nouvelleValeur / stockApres);
    }

    recalculerSoldeAchat(db, purchaseId) {
        const purchase = db.prepare(`
            SELECT montant_total, montant_paye, is_archived FROM purchases WHERE id = ?
        `).get(purchaseId);
        
        if (!purchase) return;
        if (purchase.is_archived === 1) return;
        
        const nouveauReste = Math.max(0, cleanNum(purchase.montant_total - purchase.montant_paye));
        const isSolde = nouveauReste <= 0.1 ? 1 : 0;
        const paymentStatus = nouveauReste <= 0.1 ? 'payé' : (purchase.montant_paye > 0 ? 'partiel' : 'impayé');
        
        const result = db.prepare(`
            SELECT COUNT(*) as total_actives FROM purchase_items 
            WHERE id_achat = ? AND is_active = 1
        `).get(purchaseId);
        
        const totalActives = result ? (result.total_actives ?? result['COUNT(*)'] ?? 0) : 0;
        
        db.prepare(`
            UPDATE purchases 
            SET reste_a_payer = ?, 
                is_solde = ?,
                payment_status = ?,
                is_active = CASE WHEN ? = 0 THEN 0 ELSE 1 END,
                sync_status = 'pending',
                updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
        `).run(nouveauReste, isSolde, paymentStatus, totalActives, purchaseId);
    }

    logActionInternal(db, { userId, userName, actionType, tableConcernee, referenceId, description, companyId }) {
        const logId = this.genererId('LOG');
        db.prepare(`
            INSERT INTO audit_log 
            (id, user_id, user_name, action_type, table_concernee, reference_id, description, company_id, sync_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        `).run(logId, userId, userName, actionType, tableConcernee, referenceId, description, companyId);
        
        db.prepare(`
            INSERT INTO sync_queue (table_name, record_id, operation, company_id)
            VALUES ('audit_log', ?, 'INSERT', ?)
        `).run(logId, companyId);
    }

    async annulerLigneAchat(itemId, user, motif = "Annulation erreur") {
        const db = getDb();
        const companyId = (user?.companyId || user?.company_id)?.toString();
        const userId = (user?.userId || user?.id)?.toString();

        // 🛡️ DÉCLARATION PROPRE DE LA TRANSACTION
        const executerTransaction = db.transaction(() => {
            const item = db.prepare(`
                SELECT pi.*, p.is_comptabilise, p.is_archived, p.montant_total, p.montant_paye, p.num_facture, p.mode_reglement as ancien_mode,
                       u.coefficient as unit_coefficient, u.code as unit_code_gros, u.unite_reference as unit_ref_detail
                FROM purchase_items pi
                JOIN purchases p ON pi.id_achat = p.id
                LEFT JOIN products prod ON pi.product_id = prod.id
                LEFT JOIN unites u ON prod.unite_id = u.id
                WHERE pi.id = ? AND pi.company_id = ? AND pi.is_active = 1
            `).get(itemId, companyId);

            if (!item) throw new Error("Ligne introuvable ou déjà annulée");
            if (item.is_comptabilise === 1) throw new Error("Achat COMPTABILISÉ.");
            if (item.is_archived === 1) {
                throw new Error("Action refusée : Cette facture d'achat est verrouillée et archivée suite à la validation de l'inventaire. Aucune modification n'est plus autorisée."); 
            }

            db.prepare(`UPDATE purchase_items SET is_active = 0, observation = ?, sync_status = 'pending' WHERE id = ?`)
              .run(motif, itemId);
            db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('purchase_items', ?, 'UPDATE', ?)`)
              .run(itemId, companyId);

            const product = db.prepare(`SELECT stock_actuel, cmp FROM products WHERE id = ?`).get(item.product_id);
            if (!product) throw new Error("Produit introuvable lors de l'annulation.");

            const stockAvant = Number(product.stock_actuel || 0);
            const qteAnnuleePieces = Math.abs(Number(item.qte_achetee || 0));
            const stockApres = Math.round(Math.max(0, stockAvant - qteAnnuleePieces));
            
            const cmpAncien = Number(product.cmp || 0);
            const coeffLogistique = Number(item.unit_coefficient || 1);
            let nouveauCmp = cmpAncien;

            // 🧮 FORMULE DU CMP INVERSE ET SÉCURISÉE AVEC CONVERSION :
            if (stockApres > 0 && qteAnnuleePieces > 0) {
                const cmpAncienPiece = cmpAncien / coeffLogistique;
                const valeurTotaleAvant = stockAvant * cmpAncienPiece;
                const valeurLigneAnnulee = Number(item.montant_ht_ligne || item.montant_facture_ligne || 0);
                
                const nouveauCmpUnitaire = (valeurTotaleAvant - valeurLigneAnnulee) / stockApres;
                nouveauCmp = cleanNum(nouveauCmpUnitaire * coeffLogistique);
                
                if (nouveauCmp < 0) nouveauCmp = cmpAncien;
            }

            db.prepare(`UPDATE products SET stock_actuel = ?, cmp = ?, sync_status = 'pending' WHERE id = ?`)
              .run(stockApres, nouveauCmp, item.product_id);
            db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('products', ?, 'UPDATE', ?)`)
              .run(item.product_id, companyId);

            const nouveauTotal = cleanNum(item.montant_total - item.montant_facture_ligne);
            if (item.montant_paye > nouveauTotal) {
                const montantExtourne = cleanNum(item.montant_paye - nouveauTotal);
                const nouveauPayId = this.genererId('PAY-ANN');
                db.prepare(`
                    INSERT INTO purchase_payments (
                        id, lot_id, purchase_id, montant, date_reglement, mode_reglement, 
                        statut, reference_paiement, user_id, company_id, is_active, sync_status
                    ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, 'ANNULER', ?, ?, 1, 'pending')
                `).run(
                    nouveauPayId, item.lot_id, item.id_achat, 
                    Math.abs(montantExtourne), 
                    item.ancien_mode || 'ESPECES', 
                    'ANNULEE',                
                    userId, 
                    companyId
                );
                db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('purchase_payments', ?, 'INSERT', ?)`).run(nouveauPayId, companyId);
                db.prepare(`INSERT INTO compta_queue (table_source, record_id, company_id, status) VALUES ('purchase_payments', ?, ?, 'pending')`).run(nouveauPayId, companyId);
                
                db.prepare(`UPDATE purchases SET montant_total = ?, montant_paye = ?, sync_status = 'pending' WHERE id = ?`)
                  .run(nouveauTotal, nouveauTotal, item.id_achat);
            } else {
                db.prepare(`UPDATE purchases SET montant_total = ?, sync_status = 'pending' WHERE id = ?`).run(nouveauTotal, item.id_achat);  
            }

            const movId = this.genererId('MOV-ANN');
            db.prepare(`INSERT INTO stock_movements (id, product_id, type_mouvement, reference_id, quantite, stock_avant, stock_apres, user_id, company_id, sync_status)
                VALUES (?, ?, 'ANNULATION_ACHAT', ?, ?, ?, ?, ?, ?, 'pending')`)
                .run(movId, item.product_id, item.id_achat, -qteAnnuleePieces, stockAvant, stockApres, userId, companyId);
            db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('stock_movements', ?, 'INSERT', ?)`)
              .run(movId, companyId);

            this.recalculerSoldeAchat(db, item.id_achat);
            db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('purchases', ?, 'UPDATE', ?)`)
              .run(item.id_achat, companyId);

            return { 
                success: true, 
                message: "Ligne d'article annulée. Écriture d'extourne insérée en trésorerie.",
                qte_mouvementee: qteAnnuleePieces,
                coefficient: coeffLogistique,
                unit_code_gros: item.unit_code_gros || 'CS',
                unit_ref_detail: item.unit_ref_detail || 'BTL'
            };
        });

        return executerTransaction();
    }

    async retournerLigneAchat(itemId, user, qteInput = null, observation = "") {
        const db = getDb();
        const companyId = (user?.companyId || user?.company_id)?.toString();
        const userId = (user?.userId || user?.id)?.toString();

        // 🛡️ DÉCLARATION PROPRE DE LA TRANSACTION
        const executerTransaction = db.transaction(() => {
            const item = db.prepare(`
                SELECT pi.*, p.is_comptabilise, p.is_archived, p.mode_reglement as ancien_mode, 
                       p.montant_total, p.montant_paye, p.reste_a_payer,
                       u.coefficient as unit_coefficient, u.code as unit_code_gros, u.unite_reference as unit_ref_detail
                FROM purchase_items pi
                JOIN purchases p ON pi.id_achat = p.id
                LEFT JOIN products prod ON pi.product_id = prod.id
                LEFT JOIN unites u ON prod.unite_id = u.id
                WHERE pi.id = ? AND pi.company_id = ? AND pi.is_active = 1
            `).get(itemId, companyId);

            if (!item) throw new Error("Ligne achat introuvable ou déjà traitée.");
            if (item.is_comptabilise === 1) throw new Error("Facture déjà COMPTABILISÉE.");
            
            if (item.is_archived === 1) {
                throw new Error("Action refusée : Cette facture d'achat est verrouillée et archivée suite à la validation de l'inventaire. Aucun retour fournisseur n'est autorisé.");
            }

            const qtePiecesEvaluee = conversestock.calculerUnitesNatives(db, item.product_id, qteInput || item.qte_achetee);
            const qtePiecesPositive = Math.abs(qtePiecesEvaluee);

            if (qtePiecesPositive <= 0) {
                throw new Error("La quantité de retour saisie est invalide ou nulle.");
            }

            if (qtePiecesPositive > item.qte_achetee) {
                throw new Error("Action impossible : La quantité à retourner dépasse le volume d'achat initial.");
            }

            const product = db.prepare(`SELECT stock_actuel, cmp FROM products WHERE id = ?`).get(item.product_id);
            if (!product) throw new Error("Produit introuvable lors du retour.");

            const stockAvant = Number(product.stock_actuel || 0);
            const stockApres = Math.round(Math.max(0, stockAvant - qtePiecesPositive));
            
            const cmpAncien = Number(product.cmp || 0);
            const coeffLogistique = Number(item.unit_coefficient || 1);
            let cmpNouveau = cmpAncien;

            const ratio = qtePiecesPositive / item.qte_achetee;
            const montantTTC_Retour = cleanNum(item.montant_facture_ligne * ratio);
            const montantHT_Retour  = cleanNum((item.montant_ht_ligne || item.montant_facture_ligne || 0) * ratio);
            const montantTVA_Retour = cleanNum((item.montant_tva_ligne || 0) * ratio);

            if (stockApres > 0 && qtePiecesPositive > 0) {
                const cmpAncienPiece = cmpAncien / coeffLogistique;
                const valeurTotaleAvant = stockAvant * cmpAncienPiece;
                
                const nouveauCmpUnitaire = (valeurTotaleAvant - montantHT_Retour) / stockApres;
                cmpNouveau = cleanNum(nouveauCmpUnitaire * coeffLogistique);
                
                if (cmpNouveau < 0) cmpNouveau = cmpAncien;
            }

            db.prepare(`UPDATE products SET stock_actuel = ?, cmp = ?, sync_status = 'pending' WHERE id = ?`)
              .run(stockApres, cmpNouveau, item.product_id);

            db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('products', ?, 'UPDATE', ?)`).run(item.product_id, companyId);

            const retId = this.genererId('PUR-RET');
            db.prepare(`
                INSERT INTO purchase_items (
                    id, lot_id, id_achat, type_ligne, product_id, supplier_id, num_facture, 
                    nom_article_snap, observation, qte_achetee, prix_achat_unitaire, 
                    montant_ht_ligne, montant_tva_ligne, montant_facture_ligne, stock_avant_achat, stock_apres_achat, 
                    cmp_ancien, cmp_nouveau, user_id, company_id, sync_status
                ) VALUES (?, ?, ?, 'RETOUR', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
            `).run(
                retId, item.lot_id, item.id_achat, item.product_id, item.supplier_id, 
                item.num_facture, item.nom_article_snap, observation,
                qtePiecesPositive, item.prix_achat_unitaire, 
                montantHT_Retour, montantTVA_Retour, montantTTC_Retour, 
                stockAvant, stockApres, cmpAncien, cmpNouveau, userId, companyId
            );

            db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('purchase_items', ?, 'INSERT', ?)`).run(retId, companyId);

            const payId = this.genererId('PAY-RET');
            db.prepare(`
                INSERT INTO purchase_payments (
                    id, lot_id, purchase_id, montant, date_reglement, mode_reglement, 
                    statut, reference_paiement, user_id, company_id, sync_status
                ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, 'pending')
            `).run(
                payId,
                item.lot_id,
                item.id_achat,
                Math.abs(montantTTC_Retour),   
                item.ancien_mode || 'ESPECES', 
                'VALIDEE',                     
                'REMBOURSEMENT',               
                userId,
                companyId
            );

            db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('purchase_payments', ?, 'INSERT', ?)`).run(payId, companyId);
            db.prepare(`INSERT INTO compta_queue (table_source, record_id, company_id, status) VALUES ('purchase_payments', ?, ?, 'pending')`).run(payId, companyId);

            db.prepare(`
                UPDATE suppliers 
                SET solde_dette = ROUND(solde_dette - ?, 2),
                    sync_status = 'pending',
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(montantTTC_Retour, item.supplier_id);

            db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('suppliers', ?, 'UPDATE', ?)`).run(item.supplier_id, companyId);

            db.prepare(`
                UPDATE purchases 
                SET montant_total = ROUND(montant_total - ?, 2),
                    sync_status = 'pending',
                    updated_at = CURRENT_TIMESTAMP 
                WHERE id = ?
            `).run(montantTTC_Retour, item.id_achat);

            this.recalculerSoldeAchat(db, item.id_achat);

            db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('purchases', ?, 'UPDATE', ?)`).run(item.id_achat, companyId);

            return { 
                success: true, 
                message: "Retour effectué : l'avoir a été enregistré positivement, le stock extrait, et la dette fournisseur déduite.",
                qte_mouvementee: qtePiecesPositive,
                coefficient: coeffLogistique,
                unit_code_gros: item.unit_code_gros || 'CS',
                unit_ref_detail: item.unit_ref_detail || 'BTL'
            };
        });

        return executerTransaction();
    }
}

module.exports = new AnnulationRetourService();