const { getDb } = require('../config/database');
const { logAction } = require('../utils/auditHelper');
const conversestock = require('./conversestock'); // 📦 Importation directe (Même dossier)

const cleanNum = (val) => Math.round((parseFloat(val) || 0) * 100) / 100;

class ProductService {
    // --- CRÉATION ---
    async createProduct(d, user, io) {
        const db = getDb();
        const companyId = user?.companyId;
        const userId = user?.userId;
        const userName = user?.username || 'Utilisateur';

        if (!companyId) throw new Error("Session invalide");

        const productId = d.id || d.id_article;
        if (!productId) throw new Error("L'ID de l'article est manquant.");

        const productName = d.nom ? d.nom.toUpperCase().trim() : null;
        if (!productName) throw new Error("Le nom de l'article est obligatoire.");

        const existing = db.prepare(`SELECT id FROM products WHERE nom = ? AND company_id = ?`).get(productName, companyId);
        if (existing) throw new Error(`L'article "${productName}" existe déjà.`);

        // 🌟 RECUPERATION EN AMONT DU COEFFICIENT DE CONVERSION DE L'UNITE CHOISIE
        let coeffUnite = 1;
        if (d.unite_id) {
            const rowUnite = db.prepare("SELECT coefficient FROM unites WHERE id = ?").get(d.unite_id);
            if (rowUnite && rowUnite.coefficient) {
                coeffUnite = Number(rowUnite.coefficient) || 1;
            }
        }

        // 🌟 SÉCURISATION DU STOCK ALERTE : Utilisation du coefficient récupéré en amont
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

        // Déclaration hors de la transaction pour l'utiliser dans le bloc io
        let stockInitialBouteilles = 0;

        db.transaction(() => {
            // 🚀 CALCUL DU STOCK INITIAL EN AMONT DE L'INSERTION UNIQUE
            const chaineStock = String(d.stock_actuel || 0).trim();
            if (chaineStock.includes('+')) {
                const parties = chaineStock.split('+');
                const grosFlottant = parseFloat(String(parties[0]).replace(',', '.').trim()) || 0;
                const detailFlottant = parseFloat(String(parties[1]).replace(',', '.').trim()) || 0;
                stockInitialBouteilles = Math.round(grosFlottant * coeffUnite) + Math.round(detailFlottant);
            } else {
                stockInitialBouteilles = Math.round((parseFloat(chaineStock.replace(',', '.')) || 0) * coeffUnite);
            }

            // 1. INSCRIPTION DU PRODUIT PRINCIPAL
            const stmt = db.prepare(`
                INSERT INTO products (
                    id, nom, company_id, codeBarre, unite_id, image_path, group_id,
                    is_active, cmp, prixVente, taxeActive, taxeTaux, stockAlerte, 
                    stock_actuel, remiseActive,
                    r1Active, r1Seuil, r1Montant, r1Taux, r1IsPromo, r1DateDebut, r1DateFin,
                    r2Active, r2Seuil, r2Montant, r2Taux, r2IsPromo, r2DateDebut, r2DateFin,
                    r3Active, r3Multiple, r3Montant, r3Taux, r3IsPromo, r3DateDebut, r3DateFin,
                    r4Active, r4A_Max, r4A_Montant, r4A_Taux, r4B_Max, r4B_Montant, r4B_Taux, 
                    r4C_Montant, r4C_Taux, r4IsPromo, r4DateDebut, r4DateFin, sync_status
                ) VALUES (
                    ?, ?, ?, ?, ?, ?, ?,
                    1, ?, ?, ?, ?, ?, 
                    ?, ?,
                    ?, ?, ?, ?, ?, ?, ?, 
                    ?, ?, ?, ?, ?, ?, ?, 
                    ?, ?, ?, ?, ?, ?, ?, 
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending'
                )
            `);

            stmt.run(
                productId, productName, companyId, d.codeBarre || null, d.unite_id || null, d.image_path || null, d.group_id,
                parseFloat(d.cmp) || 0, parseFloat(d.prixVente) || 0, d.taxeActive || 0, parseFloat(d.taxeTaux) || 0, stockAlerteValue,
                stockInitialBouteilles, d.remiseActive || 0,
                d.r1Active || 0, cleanNum(d.r1Seuil), cleanNum(d.r1Montant), cleanNum(d.r1Taux), d.r1IsPromo || 0, d.r1DateDebut || null, d.r1DateFin || null,
                d.r2Active || 0, cleanNum(d.r2Seuil), cleanNum(d.r2Montant), cleanNum(d.r2Taux), d.r2IsPromo || 0, d.r2DateDebut || null, d.r2DateFin || null,
                d.r3Active || 0, cleanNum(d.r3Multiple), cleanNum(d.r3Montant), cleanNum(d.r3Taux), d.r3IsPromo || 0, d.r3DateDebut || null, d.r3DateFin || null,
                d.r4Active || 0, cleanNum(d.r4A_Max), cleanNum(d.r4A_Montant), cleanNum(d.r4A_Taux), cleanNum(d.r4B_Max), cleanNum(d.r4B_Montant), cleanNum(d.r4B_Taux),
                cleanNum(d.r4C_Montant), cleanNum(d.r4C_Taux), d.r4IsPromo || 0, d.r4DateDebut || null, d.r4DateFin || null
            );

            // 2. ENREGISTREMENT COMPLEMENTAIRE DES PALIERS DE PRIX
            if (Array.isArray(d.paliers) && d.paliers.length > 0) {
                const stmtPalier = db.prepare(`
                    INSERT INTO product_paliers (
                        id, product_id, company_id, quantite, prix_total, sync_status
                    ) VALUES (?, ?, ?, ?, ?, 'pending')
                `);

                const stmtSyncPalier = db.prepare(`
                    INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
                    VALUES ('product_paliers', ?, 'INSERT', ?)
                `);

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
                        stmtPalier.run(palierId, productId, companyId, qteConvertieBouteilles, prixTotalVal);
                        stmtSyncPalier.run(palierId, companyId);
                    }
                });
            }

            // 3. SYNCHRONISATION & LOGS
            db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('products', ?, 'INSERT', ?)`).run(productId, companyId);

            logAction({
                userId, userName, actionType: 'INSERTION',
                tableConcernee: 'products', referenceId: productId,
                description: `Création du produit : ${productName} avec ses paliers convertis en bouteilles unitaires via coefficient direct`,
                companyId
            });
        })();

        if (io) {
            const room = companyId.toString();
            const txtUnite = db.prepare("SELECT code, unite_reference FROM unites WHERE id = ?").get(d.unite_id);
            const stockFormateTxt = conversestock.formaterStockPourAffichage(
                stockInitialBouteilles, 
                coeffUnite, 
                txtUnite?.code || 'CS', 
                txtUnite?.unite_reference || 'BTL'
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
    }

    // --- MISE À JOUR ---
    async updateProduct(id, d, user, io) {
        const db = getDb();
        const companyId = user?.companyId;
        if (!companyId) throw new Error("Session invalide");

        const oldProduct = db.prepare('SELECT nom, image_path FROM products WHERE id = ? AND company_id = ?').get(id, companyId);
        if (!oldProduct) throw new Error("Article non trouvé");

        const finalImagePath = (d.image_path !== undefined) ? d.image_path : oldProduct.image_path;

        let coeffUnite = 1;
        if (d.unite_id) {
            const rowUnite = db.prepare("SELECT coefficient FROM unites WHERE id = ?").get(d.unite_id);
            if (rowUnite && rowUnite.coefficient) {
                coeffUnite = Number(rowUnite.coefficient) || 1;
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

        db.transaction(() => {
            const stmt = db.prepare(`
                UPDATE products SET 
                    nom = ?, codeBarre = ?, unite_id = ?, image_path = ?, group_id = ?,
                    cmp = ?, prixVente = ?, taxeActive = ?, taxeTaux = ?, stockAlerte = ?, 
                    stock_actuel = ?, remiseActive = ?,
                    r1Active = ?, r1Seuil = ?, r1Montant = ?, r1Taux = ?, r1IsPromo = ?, r1DateDebut = ?, r1DateFin = ?,
                    r2Active = ?, r2Seuil = ?, r2Montant = ?, r2Taux = ?, r2IsPromo = ?, r2DateDebut = ?, r2DateFin = ?,
                    r3Active = ?, r3Multiple = ?, r3Montant = ?, r3Taux = ?, r3IsPromo = ?, r3DateDebut = ?, r3DateFin = ?,
                    r4Active = ?, r4A_Max = ?, r4A_Montant = ?, r4A_Taux = ?, r4B_Max = ?, r4B_Montant = ?, r4B_Taux = ?, 
                    r4C_Montant = ?, r4C_Taux = ?, r4IsPromo = ?, r4DateDebut = ?, r4DateFin = ?,
                    sync_status = 'pending'
                WHERE id = ? AND company_id = ?
            `);

            stmt.run(
                d.nom.toUpperCase(), d.codeBarre || null, d.unite_id || null, finalImagePath, d.group_id,
                cleanNum(d.cmp), cleanNum(d.prixVente), d.taxeActive || 0, cleanNum(d.taxeTaux), 
                stockAlerteValue, stockActuelValue, d.remiseActive || 0,
                d.r1Active || 0, cleanNum(d.r1Seuil), cleanNum(d.r1Montant), cleanNum(d.r1Taux), d.r1IsPromo || 0, d.r1DateDebut || null, d.r1DateFin || null,
                d.r2Active || 0, cleanNum(d.r2Seuil), cleanNum(d.r2Montant), cleanNum(d.r2Taux), d.r2IsPromo || 0, d.r2DateDebut || null, d.r2DateFin || null,
                d.r3Active || 0, cleanNum(d.r3Multiple), cleanNum(d.r3Montant), cleanNum(d.r3Taux), d.r3IsPromo || 0, d.r3DateDebut || null, d.r3DateFin || null,
                d.r4Active || 0, cleanNum(d.r4A_Max), cleanNum(d.r4A_Montant), cleanNum(d.r4A_Taux), cleanNum(d.r4B_Max), cleanNum(d.r4B_Montant), cleanNum(d.r4B_Taux),
                cleanNum(d.r4C_Montant), cleanNum(d.r4C_Taux), d.r4IsPromo || 0, d.r4DateDebut || null, d.r4DateFin || null,
                id, companyId
            );

            db.prepare('DELETE FROM product_paliers WHERE product_id = ? AND company_id = ?').run(id, companyId);
            db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('product_paliers', ?, 'DELETE', ?)`).run(id, companyId);

            if (Array.isArray(d.paliers) && d.paliers.length > 0) {
                const stmtPalier = db.prepare(`
                    INSERT INTO product_paliers (
                        id, product_id, company_id, quantite, prix_total, sync_status
                    ) VALUES (?, ?, ?, ?, ?, 'pending')
                `);

                const stmtSyncPalier = db.prepare(`
                    INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
                    VALUES ('product_paliers', ?, 'INSERT', ?)
                `);

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
                        stmtPalier.run(palierId, id, companyId, qteConvertieBouteilles, prixTotalVal);
                        stmtSyncPalier.run(palierId, companyId);
                    }
                });
            }

            db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('products', ?, 'UPDATE', ?)`).run(id, companyId);

            logAction({
                userId: user.userId, userName: user.username, actionType: 'MODIFICATION',
                tableConcernee: 'products', referenceId: id,
                description: `Mise à jour du produit : ${oldProduct.nom} avec conversion unitaire actualisée via coefficient direct.`,
                companyId
            });
        })();

        if (io) {
            const txtUnite = db.prepare("SELECT code, unite_reference FROM unites WHERE id = ?").get(d.unite_id);
            const stockFormateTxt = conversestock.formaterStockPourAffichage(
                stockActuelValue, 
                coeffUnite, 
                txtUnite?.code || 'CS', 
                txtUnite?.unite_reference || 'BTL'
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
    }

    // --- LECTURE GLOBALE ---
    async getAllProducts(companyId) {
        const db = getDb();
        
        const products = db.prepare(`
            SELECT 
                p.*, 
                p.stock_actuel as stock_brut_base,                    
                u.coefficient as unite_coefficient,          
                u.coefficient as coefficient,                
                IFNULL(u.libelle, 'Unité') as unite_libelle, 
                IFNULL(u.code, 'U') as unite_code,
                IFNULL(u.unite_reference, 'UNITÉ') as unite_reference,
                f.nom as famille_nom, 
                c.nom as category_nom, 
                g.nom as group_nom
            FROM products p
            LEFT JOIN unites u ON p.unite_id = u.id
            LEFT JOIN product_groups g ON p.group_id = g.id
            LEFT JOIN categories c ON g.category_id = c.id
            LEFT JOIN familles f ON c.famille_id = f.id
            WHERE p.company_id = ?
            ORDER BY p.nom ASC
        `).all(companyId);

        const allPaliers = db.prepare(`
            SELECT id, product_id, quantite, prix_total 
            FROM product_paliers 
            WHERE company_id = ?
            ORDER BY quantite DESC
        `).all(companyId);

        return products.map(product => {
            const coeff = Number(product.unite_coefficient) || 1;
            const stockBrut = parseFloat(product.stock_brut_base || 0);

            const stockTexteFormate = conversestock.formaterStockPourAffichage(
                stockBrut,
                coeff,
                product.unite_code,
                product.unite_reference
            );

            const productPaliers = allPaliers.filter(palier => palier.product_id === product.id);
            
            return {
                ...product,
                stock: stockBrut,                                   
                stock_actuel: stockBrut,                            
                stock_physique_formate: stockTexteFormate,            
                stock_virtuel: stockTexteFormate,                     
                stock_formate: stockTexteFormate,                     
                paliers: productPaliers.map(p => ({
                    id: p.id,
                    quantite: coeff > 1 ? cleanNum(Number(p.quantite || 0) / coeff) : Number(p.quantite || 0),
                    prix_total: Number(p.prix_total || 0)
                }))
            };
        });
    }

    // --- LECTURE UNITAIRE ---
    async getProductById(id, companyId) {
        const db = getDb();
        
        const product = db.prepare(`
            SELECT 
                p.*, 
                p.stock_actuel as stock_brut_base,                    
                u.coefficient as unite_coefficient,          
                u.coefficient as coefficient,                
                IFNULL(u.libelle, 'Unité') as unite_libelle,
                IFNULL(u.code, 'U') as unite_code,
                IFNULL(u.unite_reference, 'UNITÉ') as unite_reference,
                g.category_id, 
                c.famille_id
            FROM products p
            LEFT JOIN unites u ON p.unite_id = u.id
            LEFT JOIN product_groups g ON p.group_id = g.id
            LEFT JOIN categories c ON g.category_id = c.id
            WHERE p.id = ? AND p.company_id = ?
        `).get(id, companyId);

        if (!product) return null;

        const paliers = db.prepare(`
            SELECT id, quantite, prix_total 
            FROM product_paliers 
            WHERE product_id = ? AND company_id = ?
            ORDER BY quantite ASC
        `).all(id, companyId);

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
            stock: stockBrut,
            stock_actuel: stockBrut,
            stock_physique_formate: stockTexteFormate,
            stock_virtuel: stockTexteFormate,
            stock_formate: stockTexteFormate,                                     
            paliers: paliers.map(p => ({
                id_temp: p.id, 
                quantite: coeff > 1 ? cleanNum(Number(p.quantite || 0) / coeff) : Number(p.quantite || 0),
                prix_total: Number(p.prix_total || 0)
            }))
        };
    }

    // --- CHANGEMENT STATUT ---
    async updateStatus(id, is_active, user, io) {
        const db = getDb();
        const companyId = user?.companyId?.toString();
        if (!companyId) throw new Error("Session invalide");

        const productInfo = db.prepare(`
            SELECT p.nom, p.stock_actuel, 
                   g.is_active as grp_active, g.nom as grp_nom,
                   c.is_active as cat_active, c.nom as cat_nom,
                   f.is_active as fam_active, f.nom as fam_nom
            FROM products p
            LEFT JOIN product_groups g ON p.group_id = g.id
            LEFT JOIN categories c ON g.category_id = c.id
            LEFT JOIN familles f ON c.famille_id = f.id
            WHERE p.id = ? AND p.company_id = ?
        `).get(id, companyId);

        if (!productInfo) throw new Error("Article non trouvé");

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

        db.transaction(() => {
            db.prepare(`UPDATE products SET is_active = ?, sync_status = 'pending' WHERE id = ? AND company_id = ?`)
              .run(is_active ? 1 : 0, id, companyId);
            
            db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('products', ?, 'UPDATE', ?)`)
              .run(id, companyId);
            
            logAction({
                userId: user.userId, userName: user.username, actionType: 'MODIFICATION',
                tableConcernee: 'products', referenceId: id,
                description: `${is_active ? 'RESTAURATION' : 'ARCHIVAGE'} du produit : ${productInfo.nom}`,
                companyId
            });
        })();

        if (io) {
            const room = companyId.toString();
            io.to(room).emit('PRODUCT_STATUS_CHANGED', { id, is_active: is_active ? 1 : 0 });
            io.to(room).emit('STOCK_UPDATED', { companyId: room });
        }
        return true;
    }

    // --- IMPORTATION MASSIVE ---
    async processMassiveImport(items, user) {
        const db = getDb();
        const companyId = user.companyId;

        const formatSqlError = (err, itemNom) => {
            const msg = err.message;
            if (msg.includes("FOREIGN KEY constraint failed")) 
                return `L'unité ou le groupe spécifié pour "${itemNom}" n'existe pas en base.`;
            if (msg.includes("UNIQUE constraint failed")) 
                return `Le nom ou le code barre de l'article "${itemNom}" existe déjà.`;
            if (msg.includes("CHECK constraint failed")) 
                return `Les données de l'article "${itemNom}" ne respectent pas les règles de validation (ex: stock négatif).`;
            return msg;
        };

        try {
            return db.transaction(() => {
                let count = 0;
                
                const checkGroupStmt = db.prepare("SELECT id FROM product_groups WHERE UPPER(nom) = ? AND company_id = ?");
                const checkUniteStmt = db.prepare("SELECT id, coefficient FROM unites WHERE (UPPER(libelle) = ? OR UPPER(code) = ?) AND company_id = ?");
                const checkNameStmt = db.prepare("SELECT id FROM products WHERE UPPER(nom) = ? AND company_id = ?");
                
                const insertProductStmt = db.prepare(`
                    INSERT INTO products (
                        id, nom, company_id, group_id, unite_id, codeBarre, prixVente, cmp, 
                        taxeActive, taxeTaux, stockAlerte, remiseActive, is_active,
                        r1Active, r1Seuil, r1Montant, r1Taux,
                        r2Active, r2Seuil, r2Montant, r2Taux,
                        r3Active, r3Multiple, r3Montant, r3Taux,
                        r4Active, r4A_Max, r4A_Montant, r4B_Max, r4B_Montant, r4C_Montant,
                        sync_status
                    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'pending')
                `);

                for (const i of items) {
                    const nomUpper = i.nom ? i.nom.toUpperCase().trim() : "NOM_INCONNU";

                    try {
                        const existingProduct = checkNameStmt.get(nomUpper, companyId);
                        if (existingProduct) continue; 

                        const group = checkGroupStmt.get(i.groupeNom ? i.groupeNom.toUpperCase().trim() : '', companyId);
                        if (!group) {
                            throw new Error(`Groupe "${i.groupeNom}" introuvable.`);
                        }

                        let uniteId = null;
                        if (i.uniteLibelle) {
                            const searchVal = i.uniteLibelle.toUpperCase().trim();
                            const unite = checkUniteStmt.get(searchVal, searchVal, companyId);
                            if (unite) {
                                uniteId = unite.id;
                            }
                        }

                        const productId = `ART-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`;

                        const finalStockAlerte = conversestock.calculerUnitesNatives(db, productId, i.stockAlerte || 0);
                        
                        let r1SeuilFinal = i.r1Active === 1 ? conversestock.calculerUnitesNatives(db, productId, i.r1Seuil || 0) : 0;
                        let r2SeuilFinal = i.is_active === 1 || i.r2Active === 1 ? conversestock.calculerUnitesNatives(db, productId, i.r2Seuil || 0) : 0;
                        let r3MultipleFinal = i.r3Active === 1 ? conversestock.calculerUnitesNatives(db, productId, i.r3Multiple || 0) : 0;
                        
                        let r4A_MaxFinal = i.r4Active === 1 ? conversestock.calculerUnitesNatives(db, productId, i.r4A_Max || 0) : 0;
                        let r4B_MaxFinal = i.r4Active === 1 ? conversestock.calculerUnitesNatives(db, productId, i.r4B_Max || 0) : 0;
                        let r4C_MontantFinal = cleanNum(parseFloat(i.r4C_Montant) || 0);

                        insertProductStmt.run(
                            productId, 
                            nomUpper, 
                            companyId, 
                            group.id, 
                            uniteId,
                            i.codeBarre || null, 
                            cleanNum(i.prixVente), 
                            cleanNum(i.cmp),
                            i.taxeActive || 0, 
                            cleanNum(i.taxeTaux), 
                            finalStockAlerte, 
                            i.remiseActive || 0, 
                            i.is_active ?? 1,
                            i.r1Active || 0, r1SeuilFinal, cleanNum(i.r1Montant), cleanNum(i.r1Taux),
                            i.r2Active || 0, r2SeuilFinal, cleanNum(i.r2Montant), cleanNum(i.r2Taux),
                            i.r3Active || 0, r3MultipleFinal, cleanNum(i.r3Montant), cleanNum(i.r3Taux),
                            i.r4Active || 0, r4A_MaxFinal, cleanNum(i.r4A_Montant), r4B_MaxFinal, cleanNum(i.r4B_Montant), r4C_MontantFinal
                        );

                        db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('products', ?, 'INSERT', ?)`).run(productId, companyId);
                        
                        count++;
                    } catch (err) {
                        throw new Error(formatSqlError(err, nomUpper));
                    }
                }
                return count;
            })();
        } catch (error) {
            throw error;
        }
    }

    // --- RÉSERVATION DE STOCK ---
    async reserveStock(productId, qte, companyId) {
        const db = getDb();
        db.prepare(`
            UPDATE products 
            SET stock_actuel = stock_actuel - ?, 
                stock_reserve = stock_reserve + ?,
                sync_status = 'pending'
            WHERE id = ? AND company_id = ?
        `).run(qte, qte, productId, companyId);

        // 🔄 Synchronisation Cloud (UPDATE)
        db.prepare(`
            INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
            VALUES ('products', ?, 'UPDATE', ?)
        `).run(productId, companyId);
    }

    // --- RESTITUTION DE STOCK ---
    async releaseStock(productId, qte, companyId) {
        const db = getDb();
        db.prepare(`
            UPDATE products 
            SET stock_actuel = stock_actuel + ?, 
                stock_reserve = stock_reserve - ?,
                sync_status = 'pending'
            WHERE id = ? AND company_id = ?
        `).run(qte, qte, productId, companyId);

        // 🔄 Synchronisation Cloud (UPDATE)
        db.prepare(`
            INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
            VALUES ('products', ?, 'UPDATE', ?)
        `).run(productId, companyId);
    }
}

module.exports = new ProductService();