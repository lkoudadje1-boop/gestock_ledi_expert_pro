// backend/services/approvisionnement.service.js
const mongoose = require('mongoose');
const { 
    CloudPurchaseHeader, 
    CloudPurchaseItem, 
    CloudPurchasePayment, 
    CloudProduct, 
    CloudUnite, 
    CloudSupplier, 
    CloudPurchaseOrder, 
    CloudTemporaryPurchase, 
    CloudAuditLog 
} = require('../models/cloud.model');
const conversestock = require('./conversestock');

const cleanNum = (val) => Math.round((parseFloat(val) || 0) * 100) / 100;

class ApprovisionnementService {
    genererId(prefix) {
        return `${prefix}-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`;
    }

    async logActionInternal(session, { userId, userName, actionType, tableConcernee, referenceId, description, companyId }) {
        const logId = `LOG-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
        await CloudAuditLog.create([{
            localId: logId,
            user_id: userId,
            user_name: userName,
            action_type: actionType,
            table_concernee: tableConcernee,
            reference_id: referenceId,
            description: description,
            date_action: new Date(),
            company_id: companyId,
            sync_status: 'synced'
        }], { session });
    }

    async saveApprovisionnement(data, user) {
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const companyId = user?.companyId?.toString() || user?.company_id?.toString();
            const userId = user?.userId?.toString() || user?.id?.toString();
            const userName = user?.username || "utilisateur";
            const items = Array.isArray(data) ? data : (data.items || []);
            const header = !Array.isArray(data) ? (data.header || {}) : {};
            const fId = header.fournisseurId;
            const fNum = header.numFacture?.trim();
            const modeBrut = header.modeReglement || '';
            const typeAchat = header.typeAchat || 'COMPTANT'; 
            const idCommandeSource = header.id_commande_source || null;

            if (!userId || !companyId) throw new Error("Session expirée. Veuillez vous reconnecter.");
            if (!fId || !fNum) throw new Error("Le fournisseur et le N° de facture sont obligatoires.");
            
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

            // 1. Enregistrement de l'en-tête d'achat
            await CloudPurchaseHeader.create([{
                localId: idAchat,
                id: idAchat,
                lot_id: lotId,
                supplier_id: fId,
                nom_fournisseur_snap: header.fournisseur || 'FOURNISSEUR DIVERS',
                num_facture: fNum,
                date_achat: new Date(),
                montant_total: totalBordereauTTC,
                montant_paye: montantPayeGlobal,
                reste_a_payer: resteAPayerGlobal,
                payment_status: payStatus,
                mode_reglement: modePourBase,
                user_id: userId,
                company_id: companyId,
                is_active: 1,
                is_comptabilise: 0,
                is_archived: 0,
                sync_status: 'synced'
            }], { session });

            // 2. Clôture de la commande source si existante
            if (idCommandeSource) {
                await CloudPurchaseOrder.updateOne(
                    { localId: idCommandeSource.toString(), company_id: companyId },
                    { $set: { statut_commande: 'RECEPTIONNE', sync_status: 'synced', updated_at: new Date() } },
                    { session }
                );
            }

            // 3. Enregistrement du paiement initial si existant
            if (montantPayeGlobal > 0) {
                const payId = this.genererId('PAY');
                await CloudPurchasePayment.create([{
                    localId: payId,
                    purchase_id: idAchat,
                    lot_id: lotId,
                    montant: montantPayeGlobal,
                    date_reglement: new Date(),
                    mode_reglement: modePourBase,
                    statut: 'VALIDEE',
                    reference_paiement: typeAchat,
                    user_id: userId,
                    company_id: companyId,
                    sync_status: 'synced'
                }], { session });
            }

            // 4. Traitement des lignes d'articles et mise à jour des stocks / CMP
            for (const item of items) {
                const detailId = this.genererId('ACD');
                const pId = item.product_id;

                const product = await CloudProduct.findOne({ localId: pId, company_id: companyId }).session(session);
                if (!product) throw new Error(`Le produit avec l'ID ${pId} n'existe pas.`);

                const unite = await CloudUnite.findOne({ localId: product.unite_id, company_id: companyId }).session(session);
                
                const stockAvant = Number(product.stock_actuel || 0);
                const cmpAncien = Number(product.cmp || 0);
                const coeffLogistique = Number(unite?.coefficient || 1);
                
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

                // Utilisation de la logique de conversion de quantité de conversestock
                const qtePieces = conversestock.calculerUnitesNativesSimulé ? qteBruteAchat * coeffLogistique : conversestock.calculerUnitesNatives ? conversestock.calculerUnitesNatives(null, pId, expressionAnalysee) : qteBruteAchat * coeffLogistique;

                if (qtePieces <= 0) {
                    throw new Error(`La quantité d'achat saisie pour l'article "${product.nom}" est invalide ou nulle.`);
                }

                const mntTTC = Number(item.montant_facture_ligne) || 0;
                const mntHT = Number(item.montant_ht_ligne) || mntTTC;
                const puAchatPieces = mntTTC / qtePieces;
                const stockApres = stockAvant + qtePieces;

                await CloudPurchaseItem.create([{
                    localId: detailId,
                    id_achat: idAchat,
                    lot_id: lotId,
                    product_id: pId,
                    nom_article_snap: product.nom || 'Article',
                    type_ligne: 'ACHAT',
                    qte_achetee: qtePieces,
                    prix_achat_unitaire: puAchatPieces,
                    montant_facture_ligne: mntTTC,
                    montant_ht_ligne: mntHT,
                    montant_tva_ligne: Number(item.montant_tva_ligne || 0),
                    stock_avant_achat: stockAvant,
                    stock_apres_achat: stockApres,
                    cmp_ancien: cmpAncien,
                    supplier_id: fId,
                    num_facture: fNum,
                    user_id: userId,
                    company_id: companyId,
                    is_active: 1,
                    sync_status: 'synced'
                }], { session });

                // Calcul CMP Précis
                const cmpAncienPiece = coeffLogistique > 1 ? (cmpAncien / coeffLogistique) : cmpAncien;
                const valeurStockExistant = stockAvant * cmpAncienPiece;
                const valeurTotalStock = valeurStockExistant + mntHT;
                const nouveauCMPPiece = stockApres > 0 ? (valeurTotalStock / stockApres) : cmpAncienPiece;
                const nouveauCMPFinal = cleanNum(coeffLogistique > 1 ? (nouveauCMPPiece * coeffLogistique) : nouveauCMPPiece);

                await CloudProduct.updateOne(
                    { localId: pId, company_id: companyId },
                    { $set: { stock_actuel: stockApres, cmp: nouveauCMPFinal, updated_at: new Date(), sync_status: 'synced' } },
                    { session }
                );
            }

            if (resteAPayerGlobal > 0) {
                await CloudSupplier.updateOne(
                    { localId: fId, company_id: companyId },
                    { $inc: { solde_dette: resteAPayerGlobal }, $set: { sync_status: 'synced', updated_at: new Date() } },
                    { session }
                );
            }

            await this.logActionInternal(session, {
                userId, userName, actionType: 'INSERTION', tableConcernee: 'purchases',
                referenceId: idAchat, 
                description: `Achat ${typeAchat} Facture ${fNum}. Total: ${totalBordereauTTC}, Payé: ${montantPayeGlobal}, Reste: ${resteAPayerGlobal}`, 
                companyId
            });

            // Suppression du panier temporaire
            await CloudTemporaryPurchase.deleteOne({ user_id: userId, company_id: companyId, cart_type: 'ARTICLE' }).session(session);

            await session.commitTransaction();
            session.endSession();
            return idAchat;
        } catch (error) {
            await session.abortTransaction();
            session.endSession();
            throw error;
        }
    }

    async getAllPurchases(companyId) {
        const pipeline = [
            { $match: { company_id: companyId.toString(), is_active: 1 } },
            {
                $lookup: {
                    from: 'cloud_purchases',
                    localField: 'id_achat',
                    foreignField: 'id',
                    as: 'purchase'
                }
            },
            { $unwind: '$purchase' },
            { $match: { 'purchase.is_archived': 0 } },
            {
                $lookup: {
                    from: 'cloud_products',
                    localField: 'product_id',
                    foreignField: 'localId',
                    as: 'product'
                }
            },
            { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'cloud_unites',
                    localField: 'product.unite_id',
                    foreignField: 'localId',
                    as: 'unite'
                }
            },
            { $unwind: { path: '$unite', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'cloud_suppliers',
                    localField: 'purchase.supplier_id',
                    foreignField: 'localId',
                    as: 'supplier'
                }
            },
            { $unwind: { path: '$supplier', preserveNullAndEmptyArrays: true } },
            { $sort: { createdAt: -1 } }
        ];

        const rows = await CloudPurchaseItem.aggregate(pipeline);

        return rows.map(row => {
            const qteBruteLogistique = Math.abs(Number(row.qte_achetee || 0));
            let expressionTexte = conversestock?.formaterStockPourAffichage(
                qteBruteLogistique,
                row.unite?.coefficient || 1,
                row.unite?.code || 'CS',
                row.unite?.unite_reference || 'BTL'
            ) || `${qteBruteLogistique} UNITÉ`;

            if (row.type_ligne === 'RETOUR') {
                expressionTexte = `- (${expressionTexte})`;
            }

            return {
                ...row,
                unit_coefficient: row.unite?.coefficient,
                unit_code_gros: row.unite?.code,
                unit_ref_detail: row.unite?.unite_reference,
                mode_reglement: row.purchase?.mode_reglement,
                payment_status: row.purchase?.payment_status,
                date_entete: row.purchase?.date_achat,
                nom_fournisseur_reel: row.supplier?.nom,
                qte_achetee_formatee: expressionTexte 
            };
        });
    }

    async getArchivedPurchases(companyId) {
        return await CloudPurchaseItem.aggregate([
            {
                $lookup: {
                    from: 'cloud_purchases',
                    localField: 'id_achat',
                    foreignField: 'id',
                    as: 'purchase'
                }
            },
            { $unwind: '$purchase' },
            { $match: { company_id: companyId.toString(), 'purchase.is_archived': 1 } },
            {
                $lookup: {
                    from: 'cloud_suppliers',
                    localField: 'purchase.supplier_id',
                    foreignField: 'localId',
                    as: 'supplier'
                }
            },
            { $unwind: { path: '$supplier', preserveNullAndEmptyArrays: true } },
            { $sort: { updatedAt: -1 } }
        ]);
    }

    async archiveLot(lotId, companyId, userContext) {
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const { secureUserId, userName } = userContext;
            const result = await CloudPurchaseHeader.updateMany(
                { lot_id: lotId, company_id: companyId },
                { $set: { is_archived: 1, sync_status: 'synced', updated_at: new Date() } },
                { session }
            );

            if (result.matchedCount === 0) throw new Error("Lot introuvable ou déjà archivé.");

            await this.logActionInternal(session, {
                userId: secureUserId,
                userName: userName,
                actionType: 'ARCHIVAGE_LOT',
                tableConcernee: 'purchases', 
                referenceId: lotId,
                description: `Archivage global du lot : ${lotId}`,
                companyId: companyId
            });

            await session.commitTransaction();
            session.endSession();
            return true;
        } catch (error) {
            await session.abortTransaction();
            session.endSession();
            throw error;
        }
    }

    async getTemporaryCart(userId, companyId) {
        const row = await CloudTemporaryPurchase.findOne({ user_id: userId, company_id: companyId, cart_type: 'ARTICLE' }).lean();
        if (!row || !row.items) return [];
        try {
            return typeof row.items === 'string' ? JSON.parse(row.items) : row.items;
        } catch (jsonErr) {
            return [];
        }
    }

    async syncTemporaryCart(items, userId, companyId) {
        await CloudTemporaryPurchase.findOneAndUpdate(
            { user_id: userId, company_id: companyId, cart_type: 'ARTICLE' },
            { items: JSON.stringify(items), updated_at: new Date() },
            { upsert: true, new: true }
        );
    }

    async clearTemporaryCart(userId, companyId) {
        await CloudTemporaryPurchase.deleteMany({ user_id: userId, company_id: companyId, cart_type: 'ARTICLE' });
    }

    async archivePurchase(purchaseId, companyId, userContext) {
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const { secureUserId, userName } = userContext;
            const result = await CloudPurchaseHeader.updateOne(
                { id: purchaseId, company_id: companyId },
                { $set: { is_archived: 1, sync_status: 'synced', updated_at: new Date() } },
                { session }
            );

            if (result.matchedCount === 0) throw new Error("Achat introuvable.");

            await this.logActionInternal(session, {
                userId: secureUserId,
                userName,
                actionType: 'ARCHIVAGE',
                tableConcernee: 'purchases',
                referenceId: purchaseId,
                description: `Archivage de la facture d'achat : ${purchaseId}`,
                companyId
            });

            await session.commitTransaction();
            session.endSession();
            return true;
        } catch (error) {
            await session.abortTransaction();
            session.endSession();
            throw error;
        }
    }

    async getSupplierDebts(companyId) {
        return await CloudPurchaseHeader.aggregate([
            { $match: { company_id: companyId.toString(), reste_a_payer: { $gt: 0 }, $or: [{ is_active: 1 }, { is_archived: 1 }] } },
            {
                $group: {
                    _id: '$supplier_id',
                    fournisseur: { $first: '$nom_fournisseur_snap' },
                    supplier_id: { $first: '$supplier_id' },
                    total_dette: { $sum: '$reste_a_payer' },
                    detail_achats: { $push: '$$ROOT' }
                }
            }
        ]);
    }

    async getSoldPurchases(companyId) {
        return await CloudPurchaseHeader.aggregate([
            { $match: { company_id: companyId.toString(), reste_a_payer: { $lte: 0 }, $or: [{ is_active: 1 }, { is_archived: 1 }] } },
            {
                $group: {
                    _id: '$supplier_id',
                    fournisseur: { $first: '$nom_fournisseur_snap' },
                    supplier_id: { $first: '$supplier_id' },
                    total_historique: { $sum: '$montant_total' },
                    detail_achats: { $push: '$$ROOT' }
                }
            }
        ]);
    }

    async recordDebtPayment(paymentData, user) {
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const { purchase_id, montant, moyen_paiement, fournisseur_id } = paymentData;
            const companyId = user?.companyId || user?.company_id;
            const userId = user?.userId || user?.id;
            const mntEvalue = parseFloat(montant) || 0;

            const purchase = await CloudPurchaseHeader.findOne({ id: purchase_id, company_id: companyId }).session(session);
            if (!purchase) throw new Error("Impossible de trouver la facture associée.");

            const payId = this.genererId('PAY');

            await CloudPurchasePayment.create([{
                localId: payId,
                purchase_id,
                lot_id: purchase.lot_id,
                montant: mntEvalue,
                date_reglement: new Date(),
                mode_reglement: moyen_paiement,
                statut: 'VALIDEE',
                reference_paiement: 'REGLEMENT',
                user_id: userId,
                company_id: companyId,
                sync_status: 'synced'
            }], { session });

            const nouveauReste = Math.max(0, cleanNum(purchase.reste_a_payer - mntEvalue));
            const nouveauPaye = cleanNum(purchase.montant_paye + mntEvalue);
            const statusPay = nouveauReste <= 0 ? 'payé' : 'partiel';

            await CloudPurchaseHeader.updateOne(
                { id: purchase_id },
                { $set: { montant_paye: nouveauPaye, reste_a_payer: nouveauReste, payment_status: statusPay, updated_at: new Date(), sync_status: 'synced' } },
                { session }
            );

            await CloudSupplier.updateOne(
                { localId: fournisseur_id, company_id: companyId },
                { $inc: { solde_dette: -mntEvalue }, $set: { updated_at: new Date(), sync_status: 'synced' } },
                { session }
            );

            await this.logActionInternal(session, {
                userId, 
                userName: user?.username || "utilisateur", 
                actionType: 'PAIEMENT_DETTE',
                tableConcernee: 'purchase_payments', 
                referenceId: payId,
                description: `Règlement de ${mntEvalue} pour la facture ${purchase_id}`, 
                companyId
            });

            await session.commitTransaction();
            session.endSession();
            return { success: true, payId };
        } catch (error) {
            await session.abortTransaction();
            session.endSession();
            throw error;
        }
    }
}

module.exports = new ApprovisionnementService();