// backend/services/inventory.service.js
const mongoose = require('mongoose');
const { 
    CloudInventory, CloudInventoryItem, CloudProduct, 
    CloudUnite, CloudPayment, CloudProvisionalSale, 
    CloudStockMovement, CloudSale, CloudPurchase, CloudAuditLog 
} = require('../models/cloud.model');
const { logAction } = require('../utils/auditHelper');
const conversestock = require('./conversestock'); 

const InventoryService = {
    getActiveInventory: async (companyId) => {
        const companyStr = companyId.toString();
        const activeInv = await CloudInventory.findOne({ 
            company_id: companyStr, 
            statut: 'en_cours' 
        }).lean();

        if (!activeInv) return null;

        const created_at = activeInv.created_at || new Date().toISOString();

        const items = await CloudInventoryItem.find({ 
            company_id: companyStr, 
            id_inventaire: activeInv.localId || activeInv._id.toString() 
        }).lean();

        const itemsHydrates = [];
        for (const item of items) {
            const pieces = Number(item.stock_reel || 0);
            const product = await CloudProduct.findOne({ 
                $or: [{ localId: item.product_id }, { _id: mongoose.isValidObjectId(item.product_id) ? item.product_id : null }] 
            }).lean();
            
            let unitCoefficient = 1;
            let unitCodeGros = 'CS';
            let unitRefDetail = 'PCS';

            if (product && product.unite_id) {
                const unite = await CloudUnite.findOne({ 
                    $or: [{ localId: product.unite_id }, { _id: mongoose.isValidObjectId(product.unite_id) ? product.unite_id : null }] 
                }).lean();
                if (unite) {
                    unitCoefficient = unite.coefficient || 1;
                    unitCodeGros = unite.code || 'CS';
                    unitRefDetail = unite.unite_reference || 'PCS';
                }
            }

            itemsHydrates.push({
                product_id: item.product_id,
                stock_reel: pieces,
                prixVente_snap: item.prixVente_snap || 0,
                prix_achat_snap: item.prix_achat_snap || 0,
                stock_reel_formate: conversestock.formaterStockPourAffichage(
                    pieces,
                    unitCoefficient,
                    unitCodeGros,
                    unitRefDetail
                )
            });
        }

        return { 
            success: true,
            id: activeInv.localId || activeInv._id.toString(),
            libelle: activeInv.libelle,
            type_inventaire: activeInv.type_inventaire,
            statut: activeInv.statut,
            created_at: created_at,
            inventory: activeInv, 
            items: itemsHydrates 
        };
    },

    checkStatus: async (companyId) => {
        const companyStr = companyId.toString();
        const activeInv = await CloudInventory.findOne({ 
            company_id: companyStr, 
            statut: 'en_cours' 
        }).lean();

        const lastClosure = await CloudInventory.findOne({ 
            company_id: companyStr, 
            statut: 'valide' 
        }).sort({ closed_at: -1 }).lean();

        return {
            en_cours: !!activeInv,
            active: !!activeInv,
            id: activeInv ? (activeInv.localId || activeInv._id.toString()) : null,
            created_at: activeInv ? (activeInv.created_at || new Date().toISOString()) : null,
            last_closure: lastClosure ? lastClosure.closed_at : null
        };
    },

    createInventory: async (data, userInfo) => {
        const { id, libelle, type_inventaire } = data;
        const { userId, userName, finalCompanyId } = userInfo;
        const companyStr = finalCompanyId.toString();

        const nonCloturesCount = await CloudPayment.countDocuments({
            company_id: companyStr,
            $or: [{ cloture_id: { $exists: false } }, { cloture_id: null }, { is_cloture: 0 }],
            is_active: 1,
            type_paiement: { $ne: 'REMBOURSEMENT' }
        });

        if (nonCloturesCount > 0) {
            throw new Error(`Action refusée : Impossible de démarrer l'inventaire car il reste ${nonCloturesCount} opération(s) ou vente(s) en cours non clôturée(s) dans le système.`);
        }

        const ventesProvisoiresCount = await CloudProvisionalSale.distinct('lot_id', {
            company_id: companyStr,
            is_archived: 0
        });

        if (ventesProvisoiresCount && ventesProvisoiresCount.length > 0) {
            throw new Error(`Action refusée : Impossible de démarrer l'inventaire. Il y a actuellement ${ventesProvisoiresCount.length} chargement(s) de camion ou vente(s) provisoire(s) en cours.`);
        }

        const dateOuvertureISO = new Date();

        await CloudInventory.create([{
            localId: id,
            libelle,
            type_inventaire,
            user_id: userId,
            company_id: companyStr,
            statut: 'en_cours',
            created_at: dateOuvertureISO,
            sync_status: 'synced'
        }]);

        await logAction({
            userId, userName: userName || 'user', actionType: 'INSERTION',
            tableConcernee: 'inventories', referenceId: id,
            description: `Ouverture inventaire: ${libelle} (${type_inventaire})`,
            companyId: companyStr
        });
        
        return id;
    },

    saveItem: async (data, userInfo) => {
        const { id, inventory_id, product_id, nom_article_snap, prix_achat_snap, stock_theorique, stock_reel, saisie_gros, saisie_detail } = data;
        const { finalUserId, finalCompanyId } = userInfo;
        const companyStr = finalCompanyId.toString();

        let chaineCalcul = stock_reel !== undefined && stock_reel !== null ? String(stock_reel).trim() : '0';
        
        if (saisie_gros !== undefined || saisie_detail !== undefined) {
            const g = saisie_gros !== '' && saisie_gros !== null ? String(saisie_gros).trim() : '0';
            const d = saisie_detail !== '' && saisie_detail !== null ? String(saisie_detail).trim() : '0';
            chaineCalcul = `${g} + ${d}`;
        }

        const product = await CloudProduct.findOne({ 
            $or: [{ localId: product_id }, { _id: mongoose.isValidObjectId(product_id) ? product_id : null }], 
            company_id: companyStr 
        }).lean();

        let unitCoefficient = 1;
        let unitCodeGros = 'CS';
        let unitRefDetail = 'UNITÉ';

        if (product && product.unite_id) {
            const unite = await CloudUnite.findOne({ 
                $or: [{ localId: product.unite_id }, { _id: mongoose.isValidObjectId(product.unite_id) ? product.unite_id : null }] 
            }).lean();
            if (unite) {
                unitCoefficient = unite.coefficient || 1;
                unitCodeGros = unite.code || 'CS';
                unitRefDetail = unite.unite_reference || 'UNITÉ';
            }
        }

        // Évaluation basique de la chaîne de calcul si nécessaire
        let stockReelPiecesStrict = Number(chaineCalcul);
        if (isNaN(stockReelPiecesStrict)) {
            try { stockReelPiecesStrict = eval(chaineCalcul) || 0; } catch(e) { stockReelPiecesStrict = 0; }
        }

        const prixVenteActuel = product?.prixVente || 0;

        await CloudInventoryItem.updateOne(
            { id_inventaire: inventory_id, product_id: product_id },
            {
                $set: {
                    nom_article_snap,
                    prix_achat_snap: prix_achat_snap || 0,
                    prixVente_snap: prixVenteActuel,
                    stock_theorique: stock_theorique || 0,
                    stock_reel: stockReelPiecesStrict,
                    user_id: finalUserId,
                    company_id: companyStr,
                    sync_status: 'synced'
                }
            },
            { upsert: true }
        );

        const chaineReelleFormatee = conversestock.formaterStockPourAffichage(
            stockReelPiecesStrict,
            unitCoefficient,
            unitCodeGros,
            unitRefDetail
        );

        return { 
            success: true, 
            stock_reel_pieces: stockReelPiecesStrict,
            stock_reel_formate: chaineReelleFormatee 
        };
    },

    getProductsForInventory: async (companyId) => {
        const companyStr = companyId.toString();
        const products = await CloudProduct.find({ company_id: companyStr, is_active: 1 }).lean();

        const result = [];
        for (const p of products) {
            let unitCoefficient = 1;
            let unitCodeGros = 'CS';
            let unitRefDetail = 'UNITÉ';

            if (p.unite_id) {
                const unite = await CloudUnite.findOne({ 
                    $or: [{ localId: p.unite_id }, { _id: mongoose.isValidObjectId(p.unite_id) ? p.unite_id : null }] 
                }).lean();
                if (unite) {
                    unitCoefficient = unite.coefficient || 1;
                    unitCodeGros = unite.code || 'CS';
                    unitRefDetail = unite.unite_reference || 'UNITÉ';
                }
            }

            const piecesNatives = parseFloat(p.stock_actuel || 0);
            const stockTexteFormate = conversestock.formaterStockPourAffichage(
                piecesNatives,
                unitCoefficient,
                unitCodeGros,
                unitRefDetail
            );

            result.push({
                ...p,
                id: p.localId || p._id.toString(),
                prixAchat: p.cmp || 0,
                prixVente: p.prixVente || 0,
                barcode: p.codeBarre || '',
                stock: piecesNatives,
                stock_actuel: piecesNatives,
                stock_formate: stockTexteFormate,
                stock_theorique_formate: stockTexteFormate
            });
        }
        return result;
    },

    validateInventory: async (inventory_id, userInfo) => {
        const { finalUserId, finalUserName, finalCompanyId } = userInfo;
        const companyStr = finalCompanyId.toString();

        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const items = await CloudInventoryItem.find({ id_inventaire: inventory_id }).session(session);
            let totalEcartValeur = 0;
            let counter = 0;

            for (const item of items) {
                counter++;
                const stockReelPieces = Number(item.stock_reel || 0);
                const stockTheoriquePieces = Number(item.stock_theorique || 0);
                const ecartQte = stockReelPieces - stockTheoriquePieces;
                totalEcartValeur += (ecartQte * (item.prix_achat_snap || 0));

                const product = await CloudProduct.findOne({ 
                    $or: [{ localId: item.product_id }, { _id: mongoose.isValidObjectId(item.product_id) ? item.product_id : null }], 
                    company_id: companyStr 
                }).session(session);
                
                const currentCMP = product ? (product.cmp || 0) : 0;

                await CloudProduct.updateOne(
                    { $or: [{ localId: item.product_id }, { _id: mongoose.isValidObjectId(item.product_id) ? item.product_id : null }], company_id: companyStr },
                    { $set: { stock_actuel: stockReelPieces, updated_at: new Date() } }
                ).session(session);

                if (ecartQte !== 0) {
                    const moveId = `MOV-INV-${Date.now().toString().slice(-6)}${counter}${Math.floor(Math.random() * 100)}`;
                    await CloudStockMovement.create([{
                        localId: moveId,
                        product_id: item.product_id,
                        type_mouvement: ecartQte > 0 ? 'INV_SURPLUS' : 'INV_MANQUANT',
                        reference_id: inventory_id,
                        quantite: Math.abs(ecartQte),
                        stock_avant: stockTheoriquePieces,
                        stock_apres: stockReelPieces,
                        prix_operation: item.prix_achat_snap || 0,
                        cmp_resultat: currentCMP,
                        user_id: finalUserId,
                        company_id: companyStr,
                        sync_status: 'synced'
                    }], { session });
                }
            }

            await CloudSale.updateMany(
                { company_id: companyStr, statut_vente: 'VALIDEE', is_archived: 0 },
                { $set: { is_archived: 1, updated_at: new Date() } }
            ).session(session);

            await CloudPurchase.updateMany(
                { company_id: companyStr, is_active: 1, is_archived: 0 },
                { $set: { is_archived: 1, updated_at: new Date() } }
            ).session(session);

            await CloudInventory.updateOne(
                { localId: inventory_id, company_id: companyStr },
                { $set: { statut: 'valide', closed_at: new Date(), valeur_ecart_totale: totalEcartValeur } }
            ).session(session);

            await logAction({
                userId: finalUserId, userName: finalUserName || 'user', actionType: 'MODIFICATION',
                tableConcernee: 'inventories', referenceId: inventory_id,
                description: `Validation inventaire. Écart total: ${totalEcartValeur}`,
                companyId: companyStr
            });

            await session.commitTransaction();
            session.endSession();
            return { totalEcart: totalEcartValeur };
        } catch (err) {
            await session.abortTransaction();
            session.endSession();
            throw err;
        }
    },

    cancelInventory: async (inventory_id, userInfo) => {
        const companyStr = String(userInfo.companyId || '').trim();
        const cleanInventoryId = String(inventory_id || '').trim();

        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            await CloudInventoryItem.deleteMany({ id_inventaire: cleanInventoryId }).session(session);
            await CloudInventory.deleteOne({ localId: cleanInventoryId, company_id: companyStr }).session(session);

            await logAction({
                userId: userInfo.userId, userName: userInfo.userName || 'user', actionType: 'SUPPRESSION',
                tableConcernee: 'inventories', referenceId: cleanInventoryId,
                description: `Annulation et suppression de l'inventaire ${cleanInventoryId}`,
                companyId: companyStr
            });

            await session.commitTransaction();
            session.endSession();
            return true;
        } catch (err) {
            await session.abortTransaction();
            session.endSession();
            throw err;
        }
    },

    archiveSession: async (id, secureCompanyId, userInfo) => {
        const cleanId = String(id || '').trim();
        const cleanCompanyId = String(secureCompanyId || '').trim();

        const res = await CloudInventory.updateOne(
            { localId: cleanId, company_id: cleanCompanyId, statut: 'valide' },
            { $set: { statut: 'archive' } }
        );

        if (res.matchedCount === 0) throw new Error("Session introuvable ou non clôturée.");

        await logAction({
            userId: userInfo.userId, userName: userInfo.userName || 'user', actionType: 'MODIFICATION',
            tableConcernee: 'inventories', referenceId: cleanId,
            description: `Archivage de la session d'inventaire ${cleanId}`,
            companyId: cleanCompanyId
        });
        return true;
    },

    getSessions: async (companyId) => {
        const cleanCompanyId = String(companyId || '').trim();
        const inventories = await CloudInventory.find({ company_id: cleanCompanyId }).sort({ created_at: -1 }).lean();

        const result = [];
        for (const inv of inventories) {
            const items = await CloudInventoryItem.find({ id_inventaire: inv.localId || inv._id.toString() }).lean();
            const totalArticles = items.length;
            const valeurAjustement = items.reduce((acc, curr) => acc + (curr.ecart_valeur || 0), 0);

            result.push({
                ...inv,
                id: inv.localId || inv._id.toString(),
                created_at: inv.created_at || new Date().toISOString(),
                date_cloture: inv.closed_at || new Date().toISOString(),
                valeur_ajustement: valeurAjustement,
                total_articles: totalArticles,
                nom_utilisateur: 'Admin'
            });
        }
        return result;
    },

    getDetails: async (companyId) => {
        const cleanCompanyId = String(companyId || '').trim();
        const items = await CloudInventoryItem.find({ company_id: cleanCompanyId }).sort({ _id: -1 }).lean();

        const result = [];
        for (const ii of items) {
            const inv = await CloudInventory.findOne({ localId: ii.id_inventaire }).lean();
            const ecartPieces = Number(ii.stock_reel || 0) - Number(ii.stock_theorique || 0);

            result.push({
                inventory_session_id: ii.id_inventaire,
                nom_article_snap: ii.nom_article_snap,
                stock_theorique: ii.stock_theorique,
                stock_reel: ii.stock_reel,
                prix_unitaire_snap: ii.prix_achat_snap,
                prixVente_snap: ii.prixVente_snap,
                valeur_theo_totale: inv?.valeur_theo_totale || 0,
                valeur_reel_totale: inv?.valeur_reel_totale || 0,
                valeur_ecart_totale: inv?.valeur_ecart_totale || 0,
                valeur_ecart_net: 0,
                valeur_ecart_vente_net: 0,
                ecart: ecartPieces,
                stock_theorique_formate: conversestock.formaterStockPourAffichage(ii.stock_theorique, 1, 'CS', 'UNITÉ'),
                stock_reel_formate: conversestock.formaterStockPourAffichage(ii.stock_reel, 1, 'CS', 'UNITÉ'),
                ecart_formate: `${ecartPieces > 0 ? '+' : ''}${conversestock.formaterStockPourAffichage(ecartPieces, 1, 'CS', 'UNITÉ')}`
            });
        }
        return result;
    },

    getDetailsById: async (id_inventaire) => {
        const cleanInventoryId = String(id_inventaire || '').trim();
        const entete = await CloudInventory.findOne({ localId: cleanInventoryId }).lean();
        const items = await CloudInventoryItem.find({ id_inventaire: cleanInventoryId }).lean();

        const lignes = items.map(l => {
            const ecartPieces = Number(l.stock_reel || 0) - Number(l.stock_theorique || 0);
            return {
                ...l,
                ecart: ecartPieces,
                valeur_ecart_net: 0,
                valeur_ecart_vente_net: 0,
                stock_theorique_formate: conversestock.formaterStockPourAffichage(l.stock_theorique, 1, 'CS', 'UNITÉ'),
                stock_reel_formate: conversestock.formaterStockPourAffichage(l.stock_reel, 1, 'CS', 'UNITÉ'),
                ecart_formate: `${ecartPieces > 0 ? '+' : ''}${conversestock.formaterStockPourAffichage(ecartPieces, 1, 'CS', 'UNITÉ')}`
            };
        });

        return { ...entete, lignes };
    },

    checkInventoryLock: async (companyId) => {
        const cleanCompanyId = String(companyId || '').trim();
        const activeCount = await CloudInventory.countDocuments({ company_id: cleanCompanyId, statut: 'en_cours' });
        
        if (activeCount > 0) {
            throw new Error("Opération rejetée : un inventaire de contrôle est actuellement en cours.");
        }
        return false;
    }
};

module.exports = InventoryService;