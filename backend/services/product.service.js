// backend/services/product.service.js
const mongoose = require('mongoose');
const { 
    CloudProduct, 
    CloudProductPalier, 
    CloudUnite, 
    CloudProductGroup, 
    CloudCategory, 
    CloudFamille, 
    CloudAuditLog,
    CloudPurchaseItem,
    CloudSaleItem,
    CloudInventoryItem
} = require('../models/cloud.model');
const conversestock = require('./conversestock'); // 📦 Importation directe

const cleanNum = (val) => Math.round((parseFloat(val) || 0) * 100) / 100;

class ProductService {
    // --- CRÉATION ---
    async createProduct(d, user, io) {
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const companyId = user?.companyId || user?.company_id;
            const userId = user?.userId || user?.id;
            const userName = user?.username || 'Utilisateur';

            if (!companyId) throw new Error("Session invalide");

            const productId = d.id || d.id_article || `ART-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`;
            const productName = d.nom ? d.nom.toUpperCase().trim() : null;
            if (!productName) throw new Error("Le nom de l'article est obligatoire.");

            const existing = await CloudProduct.findOne({ nom: productName, company_id: companyId.toString() }).session(session);
            if (existing) throw new Error(`L'article "${productName}" existe déjà.`);

            // 🌟 RECUPERATION EN AMONT DU COEFFICIENT DE CONVERSION DE L'UNITE CHOISIE
            let coeffUnite = 1;
            let codeGros = 'CS';
            let refDetail = 'BTL';

            if (d.unite_id) {
                const rowUnite = await CloudUnite.findOne({ localId: d.unite_id }).session(session).lean();
                if (rowUnite) {
                    coeffUnite = Number(rowUnite.coefficient) || 1;
                    codeGros = rowUnite.code || 'CS';
                    refDetail = rowUnite.unite_reference || 'BTL';
                }
            }

            // 🌟 SÉCURISATION DU STOCK ALERTE
            const chaineAlerte = String(d.stock_alerte || d.stockAlerte || 0).trim();
            let stockAlerteValue = 0;
            if (chaineAlerte.includes('+')) {
                const parties = chaineAlerte.split('+');
                const gros = parseFloat(String(parties[0]).replace(',', '.').trim()) || 0;
                const detail = parseFloat(String(parties[1]).replace(',', '.').trim()) || 0;
                stockAlerteValue = Math.round(gros * coeffUnite) + Math.round(detail);
            } else {
                stockAlerteValue = Math.round((parseFloat(chaineAlerte.replace(',', '.')) || 0) * coeffUnite);
            }

            // 🚀 CALCUL DU STOCK INITIAL
            const chaineStock = String(d.stock_actuel || 0).trim();
            let stockInitialBouteilles = 0;
            if (chaineStock.includes('+')) {
                const parties = chaineStock.split('+');
                const grosFlottant = parseFloat(String(parties[0]).replace(',', '.').trim()) || 0;
                const detailFlottant = parseFloat(String(parties[1]).replace(',', '.').trim()) || 0;
                stockInitialBouteilles = Math.round(grosFlottant * coeffUnite) + Math.round(detailFlottant);
            } else {
                stockInitialBouteilles = Math.round((parseFloat(chaineStock.replace(',', '.')) || 0) * coeffUnite);
            }

            // 1. INSCRIPTION DU PRODUIT PRINCIPAL
            await CloudProduct.create([{
                localId: productId,
                nom: productName,
                company_id: companyId.toString(),
                codeBarre: d.codeBarre || null,
                unite_id: d.unite_id || null,
                image_path: d.image_path || null,
                group_id: d.group_id,
                is_active: 1,
                cmp: parseFloat(d.cmp) || 0,
                prixVente: parseFloat(d.prixVente) || 0,
                taxeActive: d.taxeActive || 0,
                taxeTaux: parseFloat(d.taxeTaux) || 0,
                stockAlerte: stockAlerteValue,
                stock_actuel: stockInitialBouteilles,
                stock_reserve: 0,
                remiseActive: d.remiseActive || 0,
                r1Active: d.r1Active || 0, r1Seuil: cleanNum(d.r1Seuil), r1Montant: cleanNum(d.r1Montant), r1Taux: cleanNum(d.r1Taux), r1IsPromo: d.r1IsPromo || 0, r1DateDebut: d.r1DateDebut || null, r1DateFin: d.r1DateFin || null,
                r2Active: d.r2Active || 0, r2Seuil: cleanNum(d.r2Seuil), r2Montant: cleanNum(d.r2Montant), r2Taux: cleanNum(d.r2Taux), r2IsPromo: d.r2IsPromo || 0, r2DateDebut: d.r2DateDebut || null, r2DateFin: d.r2DateFin || null,
                r3Active: d.r3Active || 0, r3Multiple: cleanNum(d.r3Multiple), r3Montant: cleanNum(d.r3Montant), r3Taux: cleanNum(d.r3Taux), r3IsPromo: d.r3IsPromo || 0, r3DateDebut: d.r3DateDebut || null, r3DateFin: d.r3DateFin || null,
                r4Active: d.r4Active || 0, r4A_Max: cleanNum(d.r4A_Max), r4A_Montant: cleanNum(d.r4A_Montant), r4A_Taux: cleanNum(d.r4A_Taux), r4B_Max: cleanNum(d.r4B_Max), r4B_Montant: cleanNum(d.r4B_Montant), r4B_Taux: cleanNum(d.r4B_Taux),
                r4C_Montant: cleanNum(d.r4C_Montant), r4C_Taux: cleanNum(d.r4C_Taux), r4IsPromo: d.r4IsPromo || 0, r4DateDebut: d.r4DateDebut || null, r4DateFin: d.r4DateFin || null,
                sync_status: 'synced',
                updated_at: new Date()
            }], { session });

            // 2. ENREGISTREMENT COMPLEMENTAIRE DES PALIERS DE PRIX
            if (Array.isArray(d.paliers) && d.paliers.length > 0) {
                const paliersToInsert = [];
                d.paliers.forEach((palier, index) => {
                    const palierId = `PAL-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`;
                    const chainePalier = String(palier.quantite || 0).trim();
                    let qteConvertieBouteilles = 0;

                    if (chainePalier.includes('+')) {
                        const parties = chainePalier.split('+');
                        const gros = parseFloat(String(parties[0]).replace(',', '.').trim()) || 0;
                        const detail = parseFloat(String(parties[1]).replace(',', '.').trim()) || 0;
                        qteConvertieBouteilles = Math.round(gros * coeffUnite) + Math.round(detail);
                    } else {
                        qteConvertieBouteilles = Math.round((parseFloat(chainePalier.replace(',', '.')) || 0) * coeffUnite);
                    }

                    const prixTotalVal = parseFloat(palier.prix_total) || 0;

                    if (qteConvertieBouteilles > 0 && prixTotalVal >= 0) {
                        paliersToInsert.push({
                            localId: palierId,
                            product_id: productId,
                            company_id: companyId.toString(),
                            quantite: qteConvertieBouteilles,
                            prix_total: prixTotalVal,
                            sync_status: 'synced',
                            updated_at: new Date()
                        });
                    }
                });

                if (paliersToInsert.length > 0) {
                    await CloudProductPalier.insertMany(paliersToInsert, { session });
                }
            }

            // 3. SYNCHRONISATION & LOGS
            const logId = `LOG-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
            await CloudAuditLog.create([{
                localId: logId,
                user_id: userId,
                user_name: userName,
                action_type: 'INSERTION',
                table_concernee: 'products',
                reference_id: productId,
                description: `Création du produit : ${productName} avec ses paliers convertis en bouteilles unitaires via coefficient direct`,
                date_action: new Date(),
                company_id: companyId.toString(),
                sync_status: 'synced'
            }], { session });

            await session.commitTransaction();
            session.endSession();

            if (io) {
                const room = companyId.toString();
                const stockFormateTxt = conversestock.formaterStockPourAffichage(
                    stockInitialBouteilles, 
                    coeffUnite, 
                    codeGros, 
                    refDetail
                );

                io.to(room).emit('PRODUCT_CREATED', { 
                    id: productId, 
                    nom: productName, 
                    stock: stockInitialBouteilles, 
                    stock_formate: stockFormateTxt,
                    has_paliers: (d.paliers?.length > 0) 
                });
            }
            return productId;
        } catch (error) {
            await session.abortTransaction();
            session.endSession();
            throw error;
        }
    }

    // --- MISE À JOUR ---
    async updateProduct(id, d, user, io) {
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const companyId = user?.companyId || user?.company_id;
            if (!companyId) throw new Error("Session invalide");

            const oldProduct = await CloudProduct.findOne({ localId: id, company_id: companyId.toString() }).session(session).lean();
            if (!oldProduct) throw new Error("Article non trouvé");

            const finalImagePath = (d.image_path !== undefined) ? d.image_path : oldProduct.image_path;

            let coeffUnite = 1;
            let codeGros = 'CS';
            let refDetail = 'BTL';

            if (d.unite_id) {
                const rowUnite = await CloudUnite.findOne({ localId: d.unite_id }).session(session).lean();
                if (rowUnite) {
                    coeffUnite = Number(rowUnite.coefficient) || 1;
                    codeGros = rowUnite.code || 'CS';
                    refDetail = rowUnite.unite_reference || 'BTL';
                }
            }

            const chaineAlerte = String(d.stock_alerte !== undefined ? d.stock_alerte : (d.stockAlerte !== undefined ? d.stockAlerte : 0)).trim();
            let stockAlerteValue = 0;
            if (chaineAlerte.includes('+')) {
                const parties = chaineAlerte.split('+');
                const gros = parseFloat(String(parties[0]).replace(',', '.').trim()) || 0;
                const detail = parseFloat(String(parties[1]).replace(',', '.').trim()) || 0;
                stockAlerteValue = Math.round(gros * coeffUnite) + Math.round(detail);
            } else {
                stockAlerteValue = Math.round((parseFloat(chaineAlerte.replace(',', '.')) || 0) * coeffUnite);
            }

            const chaineStock = String(d.stock_actuel !== undefined ? d.stock_actuel : 0).trim();
            let stockActuelValue = 0;
            if (chaineStock.includes('+')) {
                const parties = chaineStock.split('+');
                const grosFlottant = parseFloat(String(parties[0]).replace(',', '.').trim()) || 0;
                const detailFlottant = parseFloat(String(parties[1]).replace(',', '.').trim()) || 0;
                stockActuelValue = Math.round(grosFlottant * coeffUnite) + Math.round(detailFlottant);
            } else {
                stockActuelValue = Math.round((parseFloat(chaineStock.replace(',', '.')) || 0) * coeffUnite);
            }

            await CloudProduct.updateOne(
                { localId: id, company_id: companyId.toString() },
                {
                    $set: {
                        nom: d.nom.toUpperCase(),
                        codeBarre: d.codeBarre || null,
                        unite_id: d.unite_id || null,
                        image_path: finalImagePath,
                        group_id: d.group_id,
                        cmp: cleanNum(d.cmp),
                        prixVente: cleanNum(d.prixVente),
                        taxeActive: d.taxeActive || 0,
                        taxeTaux: cleanNum(d.taxeTaux),
                        stockAlerte: stockAlerteValue,
                        stock_actuel: stockActuelValue,
                        remiseActive: d.remiseActive || 0,
                        r1Active: d.r1Active || 0, r1Seuil: cleanNum(d.r1Seuil), r1Montant: cleanNum(d.r1Montant), r1Taux: cleanNum(d.r1Taux), r1IsPromo: d.r1IsPromo || 0, r1DateDebut: d.r1DateDebut || null, r1DateFin: d.r1DateFin || null,
                        r2Active: d.r2Active || 0, r2Seuil: cleanNum(d.r2Seuil), r2Montant: cleanNum(d.r2Montant), r2Taux: cleanNum(d.r2Taux), r2IsPromo: d.r2IsPromo || 0, r2DateDebut: d.r2DateDebut || null, r2DateFin: d.r2DateFin || null,
                        r3Active: d.r3Active || 0, r3Multiple: cleanNum(d.r3Multiple), r3Montant: cleanNum(d.r3Montant), r3Taux: cleanNum(d.r3Taux), r3IsPromo: d.r3IsPromo || 0, r3DateDebut: d.r3DateDebut || null, r3DateFin: d.r3DateFin || null,
                        r4Active: d.r4Active || 0, r4A_Max: cleanNum(d.r4A_Max), r4A_Montant: cleanNum(d.r4A_Montant), r4A_Taux: cleanNum(d.r4A_Taux), r4B_Max: cleanNum(d.r4B_Max), r4B_Montant: cleanNum(d.r4B_Montant), r4B_Taux: cleanNum(d.r4B_Taux),
                        r4C_Montant: cleanNum(d.r4C_Montant), r4C_Taux: cleanNum(d.r4C_Taux), r4IsPromo: d.r4IsPromo || 0, r4DateDebut: d.r4DateDebut || null, r4DateFin: d.r4DateFin || null,
                        sync_status: 'synced',
                        updated_at: new Date()
                    }
                },
                { session }
            );

            await CloudProductPalier.deleteMany({ product_id: id, company_id: companyId.toString() }).session(session);

            if (Array.isArray(d.paliers) && d.paliers.length > 0) {
                const paliersToInsert = [];
                d.paliers.forEach((palier, index) => {
                    const palierId = `PAL-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`;
                    const chainePalier = String(palier.quantite || 0).trim();
                    let qteConvertieBouteilles = 0;

                    if (chainePalier.includes('+')) {
                        const parties = chainePalier.split('+');
                        const gros = parseFloat(String(parties[0]).replace(',', '.').trim()) || 0;
                        const detail = parseFloat(String(parties[1]).replace(',', '.').trim()) || 0;
                        qteConvertieBouteilles = Math.round(gros * coeffUnite) + Math.round(detail);
                    } else {
                        qteConvertieBouteilles = Math.round((parseFloat(chainePalier.replace(',', '.')) || 0) * coeffUnite);
                    }

                    const prixTotalVal = parseFloat(palier.prix_total) || 0;

                    if (qteConvertieBouteilles > 0 && prixTotalVal >= 0) {
                        paliersToInsert.push({
                            localId: palierId,
                            product_id: id,
                            company_id: companyId.toString(),
                            quantite: qteConvertieBouteilles,
                            prix_total: prixTotalVal,
                            sync_status: 'synced',
                            updated_at: new Date()
                        });
                    }
                });

                if (paliersToInsert.length > 0) {
                    await CloudProductPalier.insertMany(paliersToInsert, { session });
                }
            }

            const logId = `LOG-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
            await CloudAuditLog.create([{
                localId: logId,
                user_id: user.userId,
                user_name: user.username,
                action_type: 'MODIFICATION',
                table_concernee: 'products',
                reference_id: id,
                description: `Mise à jour du produit : ${oldProduct.nom} avec conversion unitaire actualisée via coefficient direct.`,
                date_action: new Date(),
                company_id: companyId.toString(),
                sync_status: 'synced'
            }], { session });

            await session.commitTransaction();
            session.endSession();

            if (io) {
                const stockFormateTxt = conversestock.formaterStockPourAffichage(
                    stockActuelValue, 
                    coeffUnite, 
                    codeGros, 
                    refDetail
                );

                io.to(companyId.toString()).emit('PRODUCT_UPDATED', { 
                    id, 
                    nom: d.nom.toUpperCase(), 
                    stock: stockActuelValue,
                    stock_formate: stockFormateTxt,
                    has_paliers: (d.paliers?.length > 0) 
                });
            }
            return true;
        } catch (error) {
            await session.abortTransaction();
            session.endSession();
            throw error;
        }
    }

    // --- LECTURE GLOBALE ---
    async getAllProducts(companyId) {
        const products = await CloudProduct.aggregate([
            { $match: { company_id: companyId.toString() } },
            {
                $lookup: {
                    from: 'cloud_unites',
                    localField: 'unite_id',
                    foreignField: 'localId',
                    as: 'unite'
                }
            },
            { $unwind: { path: '$unite', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'cloud_product_groups',
                    localField: 'group_id',
                    foreignField: 'localId',
                    as: 'group'
                }
            },
            { $unwind: { path: '$group', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'cloud_categories',
                    localField: 'group.category_id',
                    foreignField: 'localId',
                    as: 'category'
                }
            },
            { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'cloud_familles',
                    localField: 'category.famille_id',
                    foreignField: 'localId',
                    as: 'famille'
                }
            },
            { $unwind: { path: '$famille', preserveNullAndEmptyArrays: true } },
            {
                $addFields: {
                    stock_brut_base: '$stock_actuel',
                    unite_coefficient: '$unite.coefficient',
                    coefficient: '$unite.coefficient',
                    unite_libelle: { $ifNull: ['$unite.libelle', 'Unité'] },
                    unite_code: { $ifNull: ['$unite.code', 'U'] },
                    unite_reference: { $ifNull: ['$unite.unite_reference', 'UNITÉ'] },
                    famille_nom: '$famille.nom',
                    category_nom: '$category.nom',
                    group_nom: '$group.nom'
                }
            },
            { $sort: { nom: 1 } }
        ]);

        const allPaliers = await CloudProductPalier.find({ company_id: companyId.toString() }).sort({ quantite: -1 }).lean();

        return products.map(product => {
            const coeff = Number(product.unite_coefficient) || 1;
            const stockBrut = parseFloat(product.stock_brut_base || 0);

            const stockTexteFormate = conversestock.formaterStockPourAffichage(
                stockBrut,
                coeff,
                product.unite_code,
                product.unite_reference
            );

            const productPaliers = allPaliers.filter(palier => palier.product_id === product.localId);
            
            return {
                ...product,
                id: product.localId,
                stock: stockBrut,                            
                stock_actuel: stockBrut,                            
                stock_physique_formate: stockTexteFormate,         
                stock_virtuel: stockTexteFormate,                  
                stock_formate: stockTexteFormate,                  
                paliers: productPaliers.map(p => ({
                    id: p.localId,
                    quantite: coeff > 1 ? cleanNum(Number(p.quantite || 0) / coeff) : Number(p.quantite || 0),
                    prix_total: Number(p.prix_total || 0)
                }))
            };
        });
    }

    // --- LECTURE UNITAIRE ---
    async getProductById(id, companyId) {
        const products = await CloudProduct.aggregate([
            { $match: { localId: id, company_id: companyId.toString() } },
            {
                $lookup: {
                    from: 'cloud_unites',
                    localField: 'unite_id',
                    foreignField: 'localId',
                    as: 'unite'
                }
            },
            { $unwind: { path: '$unite', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'cloud_product_groups',
                    localField: 'group_id',
                    foreignField: 'localId',
                    as: 'group'
                }
            },
            { $unwind: { path: '$group', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'cloud_categories',
                    localField: 'group.category_id',
                    foreignField: 'localId',
                    as: 'category'
                }
            },
            { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
            {
                $addFields: {
                    stock_brut_base: '$stock_actuel',
                    unite_coefficient: '$unite.coefficient',
                    coefficient: '$unite.coefficient',
                    unite_libelle: { $ifNull: ['$unite.libelle', 'Unité'] },
                    unite_code: { $ifNull: ['$unite.code', 'U'] },
                    unite_reference: { $ifNull: ['$unite.unite_reference', 'UNITÉ'] },
                    category_id: '$group.category_id',
                    famille_id: '$category.famille_id'
                }
            }
        ]);

        if (!products || products.length === 0) return null;
        const product = products[0];

        const paliers = await CloudProductPalier.find({ product_id: id, company_id: companyId.toString() }).sort({ quantite: 1 }).lean();

        const coeff = Number(product.unite_coefficient) || 1;
        const stockBrut = parseFloat(product.stock_brut_base || 0);
        
        const stockTexteFormate = conversestock.formaterStockPourAffichage(
            stockBrut,
            coeff,
            product.unite_code,
            product.unite_reference
        );

        return {
            ...product,
            id: product.localId,
            stock: stockBrut,
            stock_actuel: stockBrut,
            stock_physique_formate: stockTexteFormate,
            stock_virtuel: stockTexteFormate,
            stock_formate: stockTexteFormate,                                     
            paliers: paliers.map(p => ({
                id_temp: p.localId, 
                quantite: coeff > 1 ? cleanNum(Number(p.quantite || 0) / coeff) : Number(p.quantite || 0),
                prix_total: Number(p.prix_total || 0)
            }))
        };
    }

    // --- CHANGEMENT STATUT ---
    async updateStatus(id, is_active, user, io) {
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const companyId = user?.companyId?.toString();
            if (!companyId) throw new Error("Session invalide");

            const productQuery = await CloudProduct.aggregate([
                { $match: { localId: id, company_id: companyId } },
                {
                    $lookup: {
                        from: 'cloud_product_groups',
                        localField: 'group_id',
                        foreignField: 'localId',
                        as: 'group'
                    }
                },
                { $unwind: { path: '$group', preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: 'cloud_categories',
                        localField: 'group.category_id',
                        foreignField: 'localId',
                        as: 'category'
                    }
                },
                { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: 'cloud_familles',
                        localField: 'category.famille_id',
                        foreignField: 'localId',
                        as: 'famille'
                    }
                },
                { $unwind: { path: '$famille', preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        nom: 1,
                        stock_actuel: 1,
                        grp_active: '$group.is_active',
                        grp_nom: '$group.nom',
                        cat_active: '$category.is_active',
                        cat_nom: '$category.nom',
                        fam_active: '$famille.is_active',
                        fam_nom: '$famille.nom'
                    }
                }
            ]).session(session);

            if (!productQuery || productQuery.length === 0) throw new Error("Article non trouvé");
            const productInfo = productQuery[0];

            if (is_active) {
                if (productInfo.fam_active === 0) {
                    throw new Error(`🚫 Action bloquée : Le Grand-parent (Famille "${productInfo.fam_nom}") est encore enfermé.`);
                }
                if (productInfo.cat_active === 0) {
                    throw new Error(`🚫 Action bloquée : Le Parent (Catégorie "${productInfo.cat_nom}") est encore enfermé.`);
                }
                if (productInfo.grp_active === 0) {
                    throw new Error(`🚫 Action bloquée : Le Groupe (Petit-enfant "${productInfo.grp_nom}") est encore enfermé.`);
                }
            }

            if (!is_active && Number(productInfo.stock_actuel) > 0) {
                throw new Error(`Impossible d'archiver "${productInfo.nom}" : il reste ${productInfo.stock_actuel} unité(s) en stock.`);
            }

            await CloudProduct.updateOne(
                { localId: id, company_id: companyId },
                { $set: { is_active: is_active ? 1 : 0, sync_status: 'synced', updated_at: new Date() } },
                { session }
            );

            const logId = `LOG-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
            await CloudAuditLog.create([{
                localId: logId,
                user_id: user.userId,
                user_name: user.username,
                action_type: 'MODIFICATION',
                table_concernee: 'products',
                reference_id: id,
                description: `${is_active ? 'RESTAURATION' : 'ARCHIVAGE'} du produit : ${productInfo.nom}`,
                date_action: new Date(),
                company_id: companyId,
                sync_status: 'synced'
            }], { session });

            await session.commitTransaction();
            session.endSession();

            if (io) {
                const room = companyId.toString();
                io.to(room).emit('PRODUCT_STATUS_CHANGED', { id, is_active: is_active ? 1 : 0 });
                io.to(room).emit('STOCK_UPDATED', { companyId: room });
            }
            return true;
        } catch (error) {
            await session.abortTransaction();
            session.endSession();
            throw error;
        }
    }

    // --- IMPORTATION MASSIVE ---
    async processMassiveImport(items, user) {
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const companyId = user.companyId;

            const formatSqlError = (err, itemNom) => {
                const msg = err.message;
                if (msg.includes("FOREIGN KEY")) 
                    return `L'unité ou le groupe spécifié pour "${itemNom}" n'existe pas en base.`;
                if (msg.includes("UNIQUE")) 
                    return `Le nom ou le code barre de l'article "${itemNom}" existe déjà.`;
                return msg;
            };

            let count = 0;

            for (const i of items) {
                const nomUpper = i.nom ? i.nom.toUpperCase().trim() : "NOM_INCONNU";

                try {
                    const existingProduct = await CloudProduct.findOne({ nom: nomUpper, company_id: companyId.toString() }).session(session).lean();
                    if (existingProduct) continue; 

                    const group = await CloudProductGroup.findOne({ nom: new RegExp(`^${i.groupeNom?.trim()}$`, 'i'), company_id: companyId.toString() }).session(session).lean();
                    if (!group) {
                        throw new Error(`Groupe "${i.groupeNom}" introuvable.`);
                    }

                    let uniteId = null;
                    if (i.uniteLibelle) {
                        const searchVal = i.uniteLibelle.toUpperCase().trim();
                        const unite = await CloudUnite.findOne({ 
                            $or: [{ libelle: new RegExp(`^${searchVal}$`, 'i') }, { code: new RegExp(`^${searchVal}$`, 'i') }],
                            company_id: companyId.toString()
                        }).session(session).lean();
                        if (unite) {
                            uniteId = unite.localId;
                        }
                    }

                    const productId = `ART-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`;
                    let coeffUnite = 1;
                    if (uniteId) {
                        const uRef = await CloudUnite.findOne({ localId: uniteId }).session(session).lean();
                        if (uRef) coeffUnite = Number(uRef.coefficient) || 1;
                    }

                    const chaineAlerte = String(i.stockAlerte || 0).trim();
                    let finalStockAlerte = 0;
                    if (chaineAlerte.includes('+')) {
                        const parts = chaineAlerte.split('+');
                        finalStockAlerte = Math.round((parseFloat(parts[0]) || 0) * coeffUnite) + Math.round(parseFloat(parts[1]) || 0);
                    } else {
                        finalStockAlerte = Math.round((parseFloat(chaineAlerte) || 0) * coeffUnite);
                    }

                    let r1SeuilFinal = i.r1Active === 1 ? Math.round((parseFloat(i.r1Seuil) || 0) * coeffUnite) : 0;
                    let r2SeuilFinal = i.is_active === 1 || i.r2Active === 1 ? Math.round((parseFloat(i.r2Seuil) || 0) * coeffUnite) : 0;
                    let r3MultipleFinal = i.r3Active === 1 ? Math.round((parseFloat(i.r3Multiple) || 0) * coeffUnite) : 0;
                    let r4A_MaxFinal = i.r4Active === 1 ? Math.round((parseFloat(i.r4A_Max) || 0) * coeffUnite) : 0;
                    let r4B_MaxFinal = i.r4Active === 1 ? Math.round((parseFloat(i.r4B_Max) || 0) * coeffUnite) : 0;
                    let r4C_MontantFinal = cleanNum(parseFloat(i.r4C_Montant) || 0);

                    await CloudProduct.create([{
                        localId: productId,
                        nom: nomUpper,
                        company_id: companyId.toString(),
                        group_id: group.localId,
                        unite_id: uniteId,
                        codeBarre: i.codeBarre || null,
                        prixVente: cleanNum(i.prixVente),
                        cmp: cleanNum(i.cmp),
                        taxeActive: i.taxeActive || 0,
                        taxeTaux: cleanNum(i.taxeTaux),
                        stockAlerte: finalStockAlerte,
                        remiseActive: i.remiseActive || 0,
                        is_active: i.is_active ?? 1,
                        r1Active: i.r1Active || 0, r1Seuil: r1SeuilFinal, r1Montant: cleanNum(i.r1Montant), r1Taux: cleanNum(i.r1Taux),
                        r2Active: i.r2Active || 0, r2Seuil: r2SeuilFinal, r2Montant: cleanNum(i.r2Montant), r2Taux: cleanNum(i.r2Taux),
                        r3Active: i.r3Active || 0, r3Multiple: r3MultipleFinal, r3Montant: cleanNum(i.r3Montant), r3Taux: cleanNum(i.r3Taux),
                        r4Active: i.r4Active || 0, r4A_Max: r4A_MaxFinal, r4A_Montant: cleanNum(i.r4A_Montant), r4B_Max: r4B_MaxFinal, r4B_Montant: cleanNum(i.r4B_Montant), r4C_Montant: r4C_MontantFinal,
                        sync_status: 'synced',
                        updated_at: new Date()
                    }], { session });

                    count++;
                } catch (err) {
                    throw new Error(formatSqlError(err, nomUpper));
                }
            }

            await session.commitTransaction();
            session.endSession();
            return count;
        } catch (error) {
            await session.abortTransaction();
            session.endSession();
            throw error;
        }
    }

    // --- HISTORIQUE PRODUIT ---
    async getProductHistory(companyId, productId, dStart, dEnd, isAll) {
        const queryFilter = { 
            company_id: companyId.toString(),
            date: { $gte: new Date(dStart), $lte: new Date(dEnd + 'T23:59:59.999Z') }
        };
        if (!isAll) queryFilter.product_id = productId;

        // Récupération combinée via les collections d'achats, ventes et inventaires pour l'historique
        const purchases = await CloudPurchaseItem.find({ company_id: companyId.toString(), ...(isAll ? {} : { product_id: productId }) }).lean();
        const sales = await CloudSaleItem.find({ company_id: companyId.toString(), ...(isAll ? {} : { product_id: productId }) }).lean();
        const inventories = await CloudInventoryItem.find({ company_id: companyId.toString(), ...(isAll ? {} : { product_id: productId }) }).lean();

        // Transformation et formatage unifiés pour correspondre au format d'historique attendu
        let combined = [];

        purchases.forEach(pi => {
            const isRetour = pi.type_ligne === 'RETOUR';
            combined.push({
                product_id: pi.product_id,
                article_nom: pi.nom_article_snap,
                type: isRetour ? 'RETOUR_FOURNISSEUR' : (pi.type_ligne || 'ACHAT'),
                date: pi.created_at,
                reference: pi.num_facture,
                tiers: pi.nom_article_snap,
                qte_entree: isRetour ? 0 : (pi.qte_achetee || 0),
                qte_sortie: isRetour ? (pi.qte_achetee || 0) : 0,
                PU: pi.prix_achat_unitaire || 0,
                montant: pi.montant_facture_ligne || 0,
                stock_av: pi.stock_avant_achat || 0,
                stock_ap: pi.stock_apres_achat || 0,
                lot_id: pi.lot_id,
                operateur_nom: 'UTILISATEUR',
                company_id: pi.company_id,
                coefficient: 1,
                unit_code_gros: 'CS',
                unit_ref_detail: 'UNITÉ'
            });
        });

        sales.forEach(si => {
            const isRetour = si.type_ligne === 'RETOUR';
            combined.push({
                product_id: si.product_id,
                article_nom: si.nom_article_snap,
                type: isRetour ? 'RETOUR_CLIENT' : 'VENTE',
                date: si.created_at,
                reference: si.id_vente,
                tiers: si.nom_article_snap,
                qte_entree: isRetour ? (si.quantite || 0) : 0,
                qte_sortie: !isRetour ? (si.quantite || 0) : 0,
                PU: si.prix_vente_unitaire || 0,
                montant: si.montant_ttc_ligne || 0,
                stock_av: si.stock_avant_vente || 0,
                stock_ap: si.stock_apres_vente || 0,
                lot_id: si.lot_id,
                operateur_nom: 'UTILISATEUR',
                company_id: si.company_id,
                coefficient: 1,
                unit_code_gros: 'CS',
                unit_ref_detail: 'UNITÉ'
            });
        });

        inventories.forEach(iv => {
            const qteEntree = iv.stock_reel > iv.stock_theorique ? (iv.stock_reel - iv.stock_theorique) : 0;
            const qteSortie = iv.stock_reel < iv.stock_theorique ? (iv.stock_theorique - iv.stock_reel) : 0;
            combined.push({
                product_id: iv.product_id,
                article_nom: 'INVENTAIRE',
                type: 'INVENTAIRE',
                date: iv.created_at,
                reference: iv.id_inventaire,
                tiers: 'SYSTEME',
                qte_entree: qteEntree,
                qte_sortie: qteSortie,
                PU: iv.prix_achat_snap || 0,
                montant: Math.abs((iv.stock_reel - iv.stock_theorique) * (iv.prix_achat_snap || 0)),
                stock_av: iv.stock_theorique || 0,
                stock_ap: iv.stock_reel || 0,
                lot_id: null,
                operateur_nom: 'SYSTÈME',
                company_id: iv.company_id,
                coefficient: 1,
                unit_code_gros: 'CS',
                unit_ref_detail: 'UNITÉ'
            });
        });

        return combined.sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    // --- RÉSERVATION DE STOCK ---
    async reserveStock(productId, qte, companyId) {
        await CloudProduct.updateOne(
            { localId: productId, company_id: companyId.toString() },
            { 
                $inc: { stock_actuel: -qte, stock_reserve: qte },
                $set: { sync_status: 'synced', updated_at: new Date() }
            }
        );
    }

    // --- RESTITUTION DE STOCK ---
    async releaseStock(productId, qte, companyId) {
        await CloudProduct.updateOne(
            { localId: productId, company_id: companyId.toString() },
            { 
                $inc: { stock_actuel: qte, stock_reserve: -qte },
                $set: { sync_status: 'synced', updated_at: new Date() }
            }
        );
    }
}

module.exports = new ProductService();