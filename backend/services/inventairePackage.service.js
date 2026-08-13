// backend/services/inventairePackage.service.js
const mongoose = require('mongoose');
const { 
    CloudPackaging, CloudPackagingInventory, CloudPackagingInventoryItem, 
    CloudPackagingMovement, CloudAuditLog 
} = require('../models/cloud.model');
const { logAction } = require('../utils/auditHelper');

const PackagingInventoryService = {
    getActiveInventory: async (companyId) => {
        const companyStr = companyId.toString();
        const activeInv = await CloudPackagingInventory.findOne({ 
            company_id: companyStr, 
            statut: 'en_cours' 
        }).lean();

        if (!activeInv) return null;

        const allPackages = await CloudPackaging.find({ company_id: companyStr, is_active: 1 }).lean();
        const inventoryItems = await CloudPackagingInventoryItem.find({ id_packaging_inventaire: activeInv.localId || activeInv._id.toString() }).lean();

        const items = allPackages.map(p => {
            const recorded = inventoryItems.find(ii => (ii.packaging_id === (p.localId || p._id.toString())));
            return {
                packaging_id: p.localId || p._id.toString(),
                nom_article_snap: p.nom,
                stock_theorique: p.stock_actuel || 0,
                prix_achat_snap: p.cmp || 0,
                stock_reel: recorded ? recorded.stock_reel : 0
            };
        });

        return { inventory: activeInv, items };
    },

    checkStatus: async (companyId) => {
        const companyStr = companyId.toString();
        const activeInv = await CloudPackagingInventory.findOne({ company_id: companyStr, statut: 'en_cours' }).lean();
        const lastClosure = await CloudPackagingInventory.findOne({ company_id: companyStr, statut: 'valide' })
            .sort({ closed_at: -1 }).lean();

        return {
            en_cours: !!activeInv,
            active: !!activeInv,
            id: activeInv ? (activeInv.localId || activeInv._id.toString()) : null,
            last_closure: lastClosure ? lastClosure.closed_at : null
        };
    },

    getPackagesForInventory: async (companyId) => {
        const packages = await CloudPackaging.find({ company_id: companyId.toString(), is_active: 1 }).lean();
        return packages.map(p => ({
            id: p.localId || p._id.toString(),
            nom: p.nom,
            stock: p.stock_actuel || 0,
            prixAchat: p.cmp || 0,
            barcode: p.code_barre || ''
        }));
    },

    createInventory: async (data, userInfo) => {
        const { id, libelle } = data;
        const { userId, userName, finalCompanyId } = userInfo;
        const companyStr = finalCompanyId.toString();

        await CloudPackagingInventory.create([{
            localId: id,
            libelle,
            user_id: userId,
            company_id: companyStr,
            statut: 'en_cours',
            sync_status: 'synced'
        }]);

        await logAction({
            userId, userName: userName || 'user', actionType: 'INSERTION',
            tableConcernee: 'packaging_inventories', referenceId: id,
            description: `Ouverture inventaire emballages: ${libelle}`,
            companyId: companyStr
        });
        return id;
    },

    saveItem: async (data, userInfo) => {
        const { inventory_id, packaging_id, nom_article_snap, prix_achat_snap, stock_theorique, stock_reel } = data;
        const { finalUserId, finalCompanyId } = userInfo;

        await CloudPackagingInventoryItem.updateOne(
            { id_packaging_inventaire: inventory_id, packaging_id: packaging_id },
            {
                $set: {
                    nom_emballage_snap: nom_article_snap,
                    prix_achat_snap: prix_achat_snap,
                    stock_theorique: stock_theorique,
                    stock_reel: stock_reel,
                    user_id: finalUserId,
                    company_id: finalCompanyId.toString(),
                    sync_status: 'synced'
                }
            },
            { upsert: true }
        );
        return true;
    },

    validateInventory: async (inventory_id, userInfo) => {
        const { finalUserId, finalCompanyId } = userInfo;
        const companyStr = finalCompanyId.toString();
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const items = await CloudPackagingInventoryItem.find({ id_packaging_inventaire: inventory_id }).session(session);
            let totalEcartValeur = 0;

            for (const item of items) {
                const stockR = Number(item.stock_reel) || 0;
                const stockT = Number(item.stock_theorique) || 0;
                const prix = Number(item.prix_achat_snap) || 0;
                const ecartQte = stockR - stockT;
                totalEcartValeur += (ecartQte * prix);

                await CloudPackaging.updateOne(
                    { $or: [{ localId: item.packaging_id }, { _id: mongoose.isValidObjectId(item.packaging_id) ? item.packaging_id : null }], company_id: companyStr },
                    { $set: { stock_actuel: stockR, updated_at: new Date() } }
                ).session(session);

                if (ecartQte !== 0) {
                    await CloudPackagingMovement.create([{
                        packaging_id: item.packaging_id,
                        type_mouvement: ecartQte > 0 ? 'INV_SURPLUS' : 'INV_MANQUANT',
                        reference_id: inventory_id,
                        quantite: ecartQte,
                        stock_avant: stockT,
                        stock_apres: stockR,
                        prix_operation: prix,
                        user_id: finalUserId,
                        company_id: companyStr,
                        sync_status: 'synced'
                    }], { session });
                }
            }

            await CloudPackagingInventory.updateOne(
                { localId: inventory_id, company_id: companyStr },
                { $set: { statut: 'valide', closed_at: new Date(), valeur_ecart_totale: totalEcartValeur } }
            ).session(session);

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
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            await CloudPackagingInventoryItem.deleteMany({ id_packaging_inventaire: inventory_id }).session(session);
            await CloudPackagingInventory.deleteOne({ localId: inventory_id, company_id: userInfo.companyId.toString() }).session(session);
            
            await logAction({
                userId: userInfo.userId, userName: userInfo.userName || 'user', actionType: 'SUPPRESSION',
                tableConcernee: 'packaging_inventories', referenceId: inventory_id,
                description: `Annulation inventaire emballage ${inventory_id}`,
                companyId: userInfo.companyId.toString()
            });
            await session.commitTransaction();
            session.endSession();
        } catch (err) {
            await session.abortTransaction();
            session.endSession();
            throw err;
        }
    },

    getSessions: async (companyId) => {
        return await CloudPackagingInventory.find({ company_id: companyId.toString() }).sort({ created_at: -1 }).lean();
    },

    getDetails: async (companyId) => {
        return await CloudPackagingInventoryItem.find({ company_id: companyId.toString() }).sort({ _id: -1 }).lean();
    },

    archiveSession: async (id, companyId, userInfo) => {
        const res = await CloudPackagingInventory.updateOne(
            { localId: id, company_id: companyId.toString(), statut: 'valide' },
            { $set: { statut: 'archive' } }
        );
        if (res.matchedCount === 0) throw new Error("Session introuvable ou non clôturée.");
        return true;
    },

    historiqueFluxEmbalage: async (companyId) => {
        return await CloudPackagingInventory.aggregate([
            { $match: { company_id: companyId.toString() } },
            { $lookup: { from: 'packaging_inventory_items', localId: 'localId', foreignField: 'id_packaging_inventaire', as: 'items' } },
            { $unwind: '$items' }
        ]);
    },

    getDetailsById: async (id_inventaire) => {
        const entete = await CloudPackagingInventory.findOne({ localId: id_inventaire }).lean();
        const lignes = await CloudPackagingInventoryItem.find({ id_packaging_inventaire: id_inventaire }).lean();
        return { ...entete, lignes };
    }
};

module.exports = PackagingInventoryService;