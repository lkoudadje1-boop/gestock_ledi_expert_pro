// backend/services/boncommande.service.js
const mongoose = require('mongoose');
const { 
    CloudPurchaseOrder, 
    CloudPurchaseOrderItem, 
    CloudProduct, 
    CloudUnite, 
    CloudSupplier 
} = require('../models/cloud.model');
const conversestock = require('./conversestock');

class BonCommandeService {
    /**
     * Génère un ID unique avec préfixe conforme à la politique de l'application
     */
    genererId(prefix) {
        return `${prefix}-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`;
    }

    /**
     * Enregistre un bon de commande et ses articles associés (Sans impacter le stock physique)
     */
    async saveBonCommande(payload, user) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const { header, items } = payload;
            const companyId = (user?.company_id || user?.companyId)?.toString();
            const userId = (user?.userId || user?.id)?.toString();

            if (!companyId || !userId) {
                throw new Error("Session invalide ou expirée.");
            }

            const orderId = this.genererId('CMD');
            const currentDate = header.date || new Date();
            const totalFacture = parseFloat(header.totalFacture) || 0;

            // 1. Insertion de l'en-tête du Bon de Commande
            await CloudPurchaseOrder.create([{
                localId: orderId,
                id: orderId,
                num_bon: header.numBon,
                supplier_id: header.fournisseurId,
                total_facture: totalFacture,
                montant_avance: 0,
                montant_paye: 0,
                reste_a_payer: totalFacture,
                moyen_reglement: null,
                statut_commande: 'EN_ATTENTE',
                observations: header.observations || null,
                date_commande: currentDate,
                user_id: userId,
                company_id: companyId,
                is_active: 1,
                sync_status: 'synced'
            }], { session });

            // 2. Boucle de traitement et conversion logistique des articles
            for (const item of items) {
                const itemId = this.genererId('CMD-ITEM');
                const productId = item.product_id || item.productId;

                // Récupération du produit et de son unité
                const product = await CloudProduct.findOne({ localId: productId, company_id: companyId }).session(session);
                if (!product) {
                    throw new Error(`Produit introuvable pour l'ID ${productId}`);
                }

                let coeff = 1;
                let codeGros = 'CS';
                let refDetail = 'PCS';

                if (product.unite_id) {
                    const unite = await CloudUnite.findOne({ localId: product.unite_id, company_id: companyId }).session(session);
                    if (unite) {
                        coeff = Number(unite.coefficient) || 1;
                        codeGros = unite.code || 'CS';
                        refDetail = unite.unite_reference || 'PCS';
                    }
                }

                // Séquencement de conversion logistique
                const qteSaisieTextuelle = String(item.qte_achetee || '0');
                const qteNatives = conversestock.calculerUnitesNatives(coeff, qteSaisieTextuelle);

                const prixUnitaireBrut = parseFloat(item.prix_achat_unitaire || item.prix_achat || 0);
                const prixUnitairePiece = coeff > 1 ? (prixUnitaireBrut / coeff) : prixUnitaireBrut;
                const mntLigne = parseFloat(item.montant_facture_ligne || (qteNatives * prixUnitairePiece)) || 0;

                await CloudPurchaseOrderItem.create([{
                    localId: itemId,
                    order_id: orderId,
                    num_bon: header.numBon,
                    product_id: productId,
                    nom_article_snap: item.nom_article_snap || item.designation || 'Article inconnu',
                    observation: item.observation || null,
                    qte_achetee: qteSaisieTextuelle,
                    quantite_pieces_natives: qteNatives,
                    unit_coefficient: coeff,
                    unit_code_gros: codeGros,
                    unit_ref_detail: refDetail,
                    prix_achat_unitaire: prixUnitaireBrut,
                    montant_facture_ligne: mntLigne,
                    montant_ht_ligne: item.montant_ht_ligne || mntLigne,
                    montant_tva_ligne: item.montant_tva_ligne || 0,
                    user_id: userId,
                    company_id: companyId,
                    is_active: 1,
                    sync_status: 'synced'
                }], { session });
            }

            await session.commitTransaction();
            session.endSession();
            return orderId;

        } catch (error) {
            await session.abortTransaction();
            session.endSession();
            throw error;
        }
    }

    /**
     * 🎯 EXTRACTION DE L'HISTORIQUE DE L'EN-TÊTE UNIQUE (AVEC JOINTURE FOURNISSEUR)
     */
    async getAllBonsCommande(companyId) {
        return await CloudPurchaseOrder.aggregate([
            { $match: { company_id: companyId.toString(), is_active: 1 } },
            {
                $lookup: {
                    from: 'cloud_suppliers',
                    localField: 'supplier_id',
                    foreignField: 'localId',
                    as: 'supplier'
                }
            },
            { $unwind: { path: '$supplier', preserveNullAndEmptyArrays: true } },
            {
                $addFields: {
                    fournisseur_nom: '$supplier.nom'
                }
            },
            { $sort: { createdAt: -1 } }
        ]);
    }

    /**
     * 🎯 EXTRACTION DES ARTICLES LIÉS À UN BON SPÉCIFIQUE
     */
    async getBonCommandeItems(orderId, companyId) {
        return await CloudPurchaseOrderItem.find({
            order_id: orderId.toString(),
            company_id: companyId.toString(),
            is_active: 1
        }).sort({ createdAt: 1 }).lean();
    }
}

module.exports = new BonCommandeService();