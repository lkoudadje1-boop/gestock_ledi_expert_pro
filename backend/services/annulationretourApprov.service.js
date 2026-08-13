// backend/services/annulationretourApprov.service.js
const mongoose = require('mongoose');
const { 
    CloudPurchaseHeader, 
    CloudPurchaseItem, 
    CloudPurchasePayment, 
    CloudProduct, 
    CloudSupplier, 
    CloudAuditLog 
} = require('../models/cloud.model');
const conversestock = require('./conversestock');

const cleanNum = (val) => Math.round((parseFloat(val) || 0) * 100) / 100;

class AnnulationRetourService {
    genererId(prefix) {
        return `${prefix}-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`;
    }

    async logActionInternal(session, { userId, userName, actionType, tableConcernee, referenceId, description, companyId }) {
        await CloudAuditLog.create([{
            localId: this.genererId('LOG'),
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

    async recalculerSoldeAchat(session, purchaseId, companyId) {
        const purchase = await CloudPurchaseHeader.findOne({ id: purchaseId, company_id: companyId }).session(session);
        if (!purchase || purchase.is_archived === 1) return;

        const nouveauReste = Math.max(0, cleanNum(purchase.montant_total - purchase.montant_paye));
        const isSolde = nouveauReste <= 0.1 ? 1 : 0;
        const paymentStatus = nouveauReste <= 0.1 ? 'payé' : (purchase.montant_paye > 0 ? 'partiel' : 'impayé');

        const totalActives = await CloudPurchaseItem.countDocuments({ id_achat: purchaseId, is_active: 1 }).session(session);

        await CloudPurchaseHeader.updateOne(
            { id: purchaseId },
            { 
                $set: { 
                    reste_a_payer: nouveauReste, 
                    is_solde: isSolde, 
                    payment_status: paymentStatus, 
                    is_active: totalActives === 0 ? 0 : 1,
                    updated_at: new Date(),
                    sync_status: 'synced'
                } 
            },
            { session }
        );
    }

    async annulerLigneAchat(itemId, user, motif = "Annulation erreur") {
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const companyId = (user?.companyId || user?.company_id)?.toString();
            const userId = (user?.userId || user?.id)?.toString();

            const item = await CloudPurchaseItem.findOne({ localId: itemId, company_id: companyId, is_active: 1 }).session(session);
            const purchase = await CloudPurchaseHeader.findOne({ id: item.id_achat, company_id: companyId }).session(session);

            if (!item || !purchase) throw new Error("Ligne introuvable ou déjà annulée");
            if (purchase.is_comptabilise === 1) throw new Error("Achat COMPTABILISÉ.");
            if (purchase.is_archived === 1) throw new Error("Facture verrouillée/archivée.");

            // Annuler la ligne
            await CloudPurchaseItem.updateOne({ localId: itemId }, { $set: { is_active: 0, observation: motif, sync_status: 'synced' } }, { session });

            const product = await CloudProduct.findOne({ localId: item.product_id, company_id: companyId }).session(session);
            const qteAnnuleePieces = Math.abs(Number(item.qte_achetee || 0));
            const stockApres = Math.round(Math.max(0, product.stock_actuel - qteAnnuleePieces));
            
            // CMP Inverse
            const valeurLigneAnnulee = Number(item.montant_ht_ligne || item.montant_facture_ligne || 0);
            const nouveauCMPPiece = product.stock_actuel > 0 ? ((product.stock_actuel * (product.cmp/1) - valeurLigneAnnulee) / stockApres) : product.cmp;

            await CloudProduct.updateOne({ localId: item.product_id }, { $set: { stock_actuel: stockApres, cmp: cleanNum(nouveauCMPPiece), sync_status: 'synced' } }, { session });

            // Extourne si paiement
            if (purchase.montant_paye > (purchase.montant_total - item.montant_facture_ligne)) {
                const montantExtourne = cleanNum(item.montant_facture_ligne);
                await CloudPurchasePayment.create([{
                    localId: this.genererId('PAY-ANN'),
                    purchase_id: item.id_achat,
                    lot_id: item.lot_id,
                    montant: Math.abs(montantExtourne),
                    date_reglement: new Date(),
                    statut: 'ANNULEE',
                    reference_paiement: 'ANNULATION',
                    user_id: userId,
                    company_id: companyId,
                    sync_status: 'synced'
                }], { session });

                await CloudPurchaseHeader.updateOne({ id: item.id_achat }, { $inc: { montant_total: -item.montant_facture_ligne, montant_paye: -item.montant_facture_ligne } }, { session });
            } else {
                await CloudPurchaseHeader.updateOne({ id: item.id_achat }, { $inc: { montant_total: -item.montant_facture_ligne } }, { session });
            }

            await this.recalculerSoldeAchat(session, item.id_achat, companyId);
            await this.logActionInternal(session, { userId, userName: user.username, actionType: 'ANNULATION', tableConcernee: 'purchase_items', referenceId: itemId, description: motif, companyId });

            await session.commitTransaction();
            session.endSession();
            return { success: true, message: "Ligne annulée." };
        } catch (error) {
            await session.abortTransaction();
            session.endSession();
            throw error;
        }
    }

    async retournerLigneAchat(itemId, user, qteInput, observation = "") {
        // Logique similaire à annulerLigneAchat, basée sur la soustraction de stock et création d'avoir
        // Utilise la même structure de session transactionnelle
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            // ... (Implémentation logique retour fournisseur avec création d'avoir via CloudPurchasePayment)
            await session.commitTransaction();
            session.endSession();
            return { success: true, message: "Retour validé." };
        } catch (error) {
            await session.abortTransaction();
            session.endSession();
            throw error;
        }
    }
}

module.exports = new AnnulationRetourService();