// backend/services/stockajustement.service.js
const { 
    CloudStockAdjustment, 
    CloudStockAdjustmentItem, 
    CloudInventory, 
    CloudProduct, 
    CloudStockMovement,
    CloudUser 
} = require('../models/cloud.model');
const conversestock = require('./conversestock');
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();

const StockAdjustmentService = {

    createAdjustment: async (adjustmentData, items, userContext) => {
        const { secureUserId, secureCompanyId, userName } = userContext;
        const adjustmentId = `ADJ-${uuidv4().substring(0, 8).toUpperCase()}`;

        // 🛡️ VERROU : INVENTAIRE EN COURS
        const inventaireEnCours = await CloudInventory.findOne({ 
            company_id: secureCompanyId, 
            statut: 'en_cours' 
        }).lean();

        if (inventaireEnCours) {
            throw new Error(`Action refusée : Impossible de valider cet ajustement. L'inventaire "${inventaireEnCours.libelle}" est ouvert.`);
        }

        let valeurTotale = 0;
        const adjustmentItems = [];

        // Traitement des items
        for (const item of items) {
            const product = await CloudProduct.findOne({ 
                localId: item.product_id.toString(), 
                company_id: secureCompanyId 
            });

            if (!product) throw new Error(`Produit introuvable : ${item.product_id}`);

            const stockAvant = Number(product.stock_actuel || 0);
            const quantiteMouvementee = Number(item.quantite || 0);
            let stockApres = stockAvant;

            if (['AVARIE', 'BRISE', 'TRANSFERT'].includes(adjustmentData.type_ajustement)) {
                stockApres = stockAvant - quantiteMouvementee;
            }

            if (stockApres < 0) throw new Error(`Stock insuffisant pour [${product.nom}].`);

            const prixAchatSnapBrut = Number(product.cmp || 0);
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

            // Préparation item
            adjustmentItems.push({
                localId: uuidv4(),
                adjustment_id: adjustmentId,
                product_id: product.localId,
                nom_article_snap: product.nom,
                prix_achat_snap: prixAchatSnapBrut,
                prix_vente_snap: Number(product.prixVente || 0),
                unite_snap: unitText,
                quantite: quantiteMouvementee,
                stock_avant: stockAvant,
                stock_apres: stockApres,
                valeur_ligne: valeurLigne,
                company_id: secureCompanyId,
                sync_status: 'synced'
            });

            // Update produit
            product.stock_actuel = stockApres;
            await product.save();

            // Création mouvement
            await CloudStockMovement.create({
                localId: `MOV-${uuidv4().substring(0, 8).toUpperCase()}`,
                product_id: product.localId,
                type_mouvement: adjustmentData.type_ajustement,
                reference_id: adjustmentId,
                quantite: quantiteMouvementee,
                stock_avant: stockAvant,
                stock_apres: stockApres,
                prix_operation: valeurLigne,
                cmp_resultat: prixAchatUnitaireDetail,
                user_id: secureUserId,
                company_id: secureCompanyId,
                sync_status: 'synced'
            });
        }

        // Création Ajustement
        await CloudStockAdjustment.create({
            localId: adjustmentId,
            libelle: adjustmentData.libelle,
            type_ajustement: adjustmentData.type_ajustement,
            statut: 'VALIDE',
            motif: adjustmentData.motif,
            valeur_totale: valeurTotale,
            entrepot_depart_id: adjustmentData.entrepot_depart_id,
            entrepot_arrivee_id: adjustmentData.entrepot_arrivee_id,
            user_id: secureUserId,
            company_id: secureCompanyId,
            sync_status: 'synced',
            closed_at: new Date()
        });

        await CloudStockAdjustmentItem.insertMany(adjustmentItems);

        return { success: true, id: adjustmentId, valeur_totale: valeurTotale };
    },

    getProductsForAdjustment: async (companyId) => {
        const products = await CloudProduct.find({ company_id: companyId, is_active: true }).lean();
        return products.map(p => ({
            id: p.localId,
            nom: p.nom,
            barcode: p.codeBarre,
            prixAchat: p.cmp,
            prixVente: p.prixVente,
            stock_actuel: p.stock_actuel,
            unit_coefficient: p.unit_coefficient || 1,
            unit_code_gros: p.unit_code_gros || 'CS',
            unit_ref_detail: p.unit_ref_detail || 'PCS',
            stock_formate: conversestock.formaterStockPourAffichage(p.stock_actuel, p.unit_coefficient || 1, p.unit_code_gros || 'CS', p.unit_ref_detail || 'PCS')
        }));
    },

    getAdjustmentsHistory: async (companyId) => {
        const history = await CloudStockAdjustment.find({ company_id: companyId }).sort({ created_at: -1 }).lean();
        const users = await CloudUser.find({ company_id: companyId }).lean();
        return history.map(h => ({
            ...h,
            id: h.localId,
            nom_utilisateur: users.find(u => u.localId === h.user_id)?.username || 'Utilisateur Système'
        }));
    },

    getAdjustmentDetails: async (adjustmentId, companyId) => {
        const items = await CloudStockAdjustmentItem.find({ 
            adjustment_id: adjustmentId.toString(), 
            company_id: companyId 
        }).lean();
        
        return items.map(i => ({
            ...i,
            id: i.localId,
            is_line_cancelled: i.unite_snap.includes('(ANNULÉ)') ? 1 : 0,
            valeur_ligne: i.unite_snap.includes('(ANNULÉ)') ? 0 : i.valeur_ligne
        }));
    },

    cancelAdjustmentItem: async (adjustmentId, itemId, userContext) => {
        // Logique similaire à la méthode cancelWhole ci-dessous, appliquée à un item
        // ... implémentation basée sur le modèle Mongoose ...
    },

    cancelWholeAdjustment: async (adjustmentId, userContext) => {
        const { secureCompanyId } = userContext;
        const adjustment = await CloudStockAdjustment.findOne({ localId: adjustmentId.toString(), company_id: secureCompanyId });
        if (!adjustment) throw new Error("Ajustement introuvable.");
        
        adjustment.statut = 'ANNULE';
        adjustment.valeur_totale = 0;
        await adjustment.save();

        const items = await CloudStockAdjustmentItem.find({ adjustment_id: adjustmentId, company_id: secureCompanyId });
        for (const item of items) {
            item.unite_snap += ' (ANNULÉ)';
            item.valeur_ligne = 0;
            await item.save();
        }
        return { success: true };
    }
};

module.exports = StockAdjustmentService;