const productService = require('../services/product.service');
const InventoryService = require('../services/inventory.service');
const { getDb } = require('../config/database');
const conversestock = require('../services/conversestock'); // 🚀 UNE SEULE DÉCLARATION ICI

/**
 * 🌟 VERSION ULTRA-SÉCURISÉE : Rétro-conversion et formatage pour l'interface (BDD Pieces -> UI Texte/Unité)
 * Neutralise les crashs et prépare des chaînes textuelles logistiques pour l'interface.
 */
const _convertPricingRulesToCasiers = (productData) => {
    if (!productData || !productData.unite_id || productData.unite_id === "" || productData.unite_id === "null" || productData.unite_id === "undefined") {
        return productData;
    }
    
    const db = getDb();
    let coeff = 1;
    let codeGros = 'CS';
    let refDetail = 'BTL';

    try {
        // Validation et récupération complète de la règle logistique de l'unité
        const rowUnite = db.prepare("SELECT coefficient, code, unite_reference FROM unites WHERE id = ?").get(productData.unite_id);
        if (rowUnite) {
            coeff = Number(rowUnite.coefficient) || 1;
            codeGros = rowUnite.code || 'CS';
            refDetail = rowUnite.unite_reference || 'BTL';
        }
    } catch (sqlErr) {
        console.warn("⚠️ [CONVERSION APERÇU] Impossible de lire l'unité, traitement par défaut.", sqlErr.message);
        return productData; 
    }

    const updatedData = { ...productData };

    // 🚀 CORRECTIF LOGISTIQUE CHIRURGICAL : Utilisation des clés réelles du service (stock_actuel ou stock)
    const valeurStockBrute = updatedData.stock_actuel !== undefined ? updatedData.stock_actuel : (updatedData.stock ?? 0);
    
    // On s'assure que la propriété lue par React est TOUJOURS alimentée avec la chaîne formatée du serveur
    updatedData.stock_physique_formate = conversestock.formaterStockPourAffichage(
        valeurStockBrute, coeff, codeGros, refDetail
    );

    if (coeff <= 1) return updatedData;

    // Rétro-conversion mathématique propre des seuils pour que le formulaire React affiche la bonne valeur brute
    if (updatedData.stockAlerte) {
        updatedData.stockAlerte = Math.round((parseFloat(updatedData.stockAlerte) / coeff) * 100) / 100;
        updatedData.stock_alerte_formate = conversestock.formaterStockPourAffichage(
            parseFloat(productData.stockAlerte), coeff, codeGros, refDetail
        );
    }

    // Paliers de remises automatiques (R1, R2, R3, R4) convertis proprement sans résidu flottant de division
    if (updatedData.r1Seuil) updatedData.r1Seuil = Math.round((parseFloat(updatedData.r1Seuil) / coeff) * 100) / 100;
    if (updatedData.r2Seuil) updatedData.r2Seuil = Math.round((parseFloat(updatedData.r2Seuil) / coeff) * 100) / 100;
    if (updatedData.r3Multiple) updatedData.r3Multiple = Math.round((parseFloat(updatedData.r3Multiple) / coeff) * 100) / 100;

    if (updatedData.r4Active === 1) {
        if (updatedData.r4A_Max) updatedData.r4A_Max = Math.round((parseFloat(updatedData.r4A_Max) / coeff) * 100) / 100;
        if (updatedData.r4B_Max) updatedData.r4B_Max = Math.round((parseFloat(updatedData.r4B_Max) / coeff) * 100) / 100;
        if (updatedData.r4C_Max) updatedData.r4C_Max = Math.round((parseFloat(updatedData.r4C_Max) / coeff) * 100) / 100;
    }

    return updatedData;
};


/**
 * 🌟 VERSION ULTRA-SÉCURISÉE : Conversion à l'écriture (UI Saisie -> BDD Pièces Natives)
 * Exploite calculerUnitesNatives pour centraliser la conversion anti-litige des formulaires
 */
const _convertPricingRulesToBouteilles = (bodyData) => {
    if (!bodyData || !bodyData.unite_id || bodyData.unite_id === "" || bodyData.unite_id === "null" || bodyData.unite_id === "undefined") {
        return bodyData;
    }

    const db = getDb();
    const updatedData = { ...bodyData };

    // 🚀 SÉCURISATION DES PALIERS DE SAISIE VIA LE MODULE CENTRAL
    // Si l'utilisateur saisit une expression combinée "2+4" ou une valeur brute, conversestock s'occupe de l'arrondi SQL
    if (updatedData.stockAlerte !== undefined) {
        updatedData.stockAlerte = conversestock.calculerUnitesNatives(db, updatedData.id, updatedData.stockAlerte);
    }
    if (updatedData.r1Active === 1 && updatedData.r1Seuil) {
        updatedData.r1Seuil = conversestock.calculerUnitesNatives(db, updatedData.id, updatedData.r1Seuil);
    }
    if (updatedData.r2Active === 1 && updatedData.r2Seuil) {
        updatedData.r2Seuil = conversestock.calculerUnitesNatives(db, updatedData.id, updatedData.r2Seuil);
    }
    if (updatedData.r3Active === 1 && updatedData.r3Multiple) {
        updatedData.r3Multiple = conversestock.calculerUnitesNatives(db, updatedData.id, updatedData.r3Multiple);
    }

    if (updatedData.r4Active === 1) {
        if (updatedData.r4A_Max) updatedData.r4A_Max = conversestock.calculerUnitesNatives(db, updatedData.id, updatedData.r4A_Max);
        if (updatedData.r4B_Max) updatedData.r4B_Max = conversestock.calculerUnitesNatives(db, updatedData.id, updatedData.r4B_Max);
        if (updatedData.r4C_Max) updatedData.r4C_Max = conversestock.calculerUnitesNatives(db, updatedData.id, updatedData.r4C_Max);
    }

    return updatedData;
};

// --- 1. CRÉATION & MISE À JOUR ---

exports.createProduct = async (req, res) => {
    try {
        const companyId = req.user?.companyId?.toString();

        const inventoryStatus = await InventoryService.checkStatus(companyId);
        if (inventoryStatus.en_cours) {
            return res.status(403).json({ 
                success: false, 
                error: "CRÉATION IMPOSSIBLE : Un inventaire est actuellement en cours. Veuillez le clôturer ou l'annuler avant d'ajouter de nouveaux articles." 
            });
        }

        // Conversion et sécurisation logistique unifiée avant insertion SQL
        const convertedBody = _convertPricingRulesToBouteilles(req.body);
        const productId = await productService.createProduct(convertedBody, req.user, req.io);
        
        if (req.io && companyId) {
            req.io.to(companyId).emit('DATA_EVENT', { 
                table: 'products', 
                action: 'INSERT',
                id: productId 
            });
        }

        res.status(201).json({ success: true, message: "Article créé avec succès !", id: productId });
    } catch (error) {
        console.error("❌ Erreur Create Product:", error.message);
        res.status(error.message.includes("Session") ? 403 : 400).json({ success: false, error: error.message });
    }
};

exports.updateProduct = async (req, res) => {
    try {
        const companyId = req.user?.companyId?.toString();

        // Conversion et sécurisation logistique unifiée avant modification SQL
        const convertedBody = _convertPricingRulesToBouteilles(req.body);
        await productService.updateProduct(req.params.id, convertedBody, req.user, req.io);
        
        if (req.io && companyId) {
            req.io.to(companyId).emit('DATA_EVENT', { 
                table: 'products', 
                action: 'UPDATE',
                id: req.params.id 
            });
        }

        res.json({ success: true, message: "Article mis à jour avec succès !" });
    } catch (error) {
        console.error("❌ Erreur Update Product:", error.message);
        res.status(error.message.includes("Session") ? 403 : 400).json({ success: false, error: error.message });
    }
};
exports.updateStatus = async (req, res) => {
    try {
        const { is_active } = req.body;
        const companyId = req.user?.companyId?.toString();

        await productService.updateStatus(req.params.id, is_active, req.user, req.io);
        
        if (req.io && companyId) {
            req.io.to(companyId).emit('DATA_EVENT', { 
                table: 'products', 
                action: 'STATUS_CHANGE',
                id: req.params.id 
            });
        }

        res.json({ 
            success: true, 
            message: is_active ? "Article restauré avec succès." : "Article archivé avec succès." 
        });
    } catch (error) {
        console.error("❌ Erreur Update Status:", error.message);
        res.status(400).json({ error: error.message });
    }
};

// --- 2. LECTURE ---

exports.getAllProducts = async (req, res) => {
    try {
        const products = await productService.getAllProducts(req.user.companyId);
        
        // 🚀 ALIGNEMENT STRICT : Rétro-conversion linéaire et injection des chaînes formatées
        const formattedProducts = products.map(p => _convertPricingRulesToCasiers(p));
        res.json(formattedProducts);
    } catch (error) {
        console.error("❌ Erreur Lecture Produits:", error.message);
        res.status(500).json({ error: error.message });
    }
};

exports.getProductById = async (req, res) => {
    try {
        const product = await productService.getProductById(req.params.id, req.user.companyId);
        if (!product) return res.status(404).json({ error: "Article non trouvé" });
        
        // 🚀 ALIGNEMENT STRICT : Préparation du produit pour le formulaire React (avec valeurs décimales et textes formatés)
        const formattedProduct = _convertPricingRulesToCasiers(product);
        res.json(formattedProduct);
    } catch (error) {
        console.error("❌ Erreur Get Product By ID:", error.message);
        res.status(500).json({ error: error.message });
    }
};

// --- 3. IMPORT / EXPORT CSV ---

exports.exportProductsCSV = async (req, res) => {
    try {
        const companyId = req.user.companyId;
        const products = await productService.getAllProducts(companyId);
        
        const SEP = ";", NL = "\r\n", BOM = "\ufeff";
        
        // 🛡️ AJOUT D'UNE COLONNE DÉDIÉE AU TEXTE LOGISTIQUE : STOCK_PHYSIQUE_FORMATE pour Excel
        let csv = `TYPE${SEP}DESIGNATION${SEP}GROUPE_PARENT${SEP}CODE_BARRE${SEP}UNITE${SEP}PRIX_VENTE${SEP}CMP${SEP}TAXE_ACTIVE${SEP}TAXE_TAUX${SEP}STOCK_PHYSIQUE_TEXTE${SEP}STOCK_ALERTE_TEXTE${SEP}REMISE_ACTIVE${SEP}`;
        csv += `R1_ACT${SEP}R1_SEUIL${SEP}R1_MONT${SEP}R1_TAUX${SEP}R2_ACT${SEP}R2_SEUIL${SEP}R2_MONT${SEP}R2_TAUX${SEP}R3_ACT${SEP}R3_MULT${SEP}R3_MONT${SEP}R3_TAUX${SEP}R4_ACT${SEP}R4A_MAX${SEP}R4A_MONT${SEP}R4B_MAX${SEP}R4B_MONT${SEP}R4C_MONT${SEP}ETAT${NL}`;

        products.forEach(rawP => {
            // 🌟 PROJECTION LOGISTIQUE EXACTE VIA LE SERVICE CENTRALISÉ
            const p = _convertPricingRulesToCasiers(rawP);
            const uniteText = p.unite_libelle || p.unite_id || 'Unité';
            
            // On extrait les expressions textuelles propres (Ex: "10 Casier(s)" ou "0 Btl") plutôt que des nombres bruts à virgule
            const stockPhysiqueTexte = p.stock_physique_formate || `${p.stock_physique || 0} U`;
            const stockAlerteTexte = p.stock_alerte_formate || `${p.stockAlerte || 0} U`;
            
            csv += `ART${SEP}"${p.nom}"${SEP}"${p.group_nom || ''}"${SEP}"${p.codeBarre || ''}"${SEP}"${uniteText}"${SEP}${p.prixVente}${SEP}${p.cmp}${SEP}${p.taxeActive}${SEP}${p.taxeTaux}${SEP}"${stockPhysiqueTexte}"${SEP}"${stockAlerteTexte}"${SEP}${p.remiseActive}${SEP}`;
            csv += `${p.r1Active}${SEP}${p.r1Seuil}${SEP}${p.r1Montant}${SEP}${p.r1Taux}${SEP}`;
            csv += `${p.r2Active}${SEP}${p.r2Seuil}${SEP}${p.r2Montant}${SEP}${p.r2Taux}${SEP}`;
            csv += `${p.r3Active}${SEP}${p.r3Multiple}${SEP}${p.r3Montant}${SEP}${p.r3Taux}${SEP}`;
            csv += `${p.r4Active}${SEP}${p.r4A_Max}${SEP}${p.r4A_Montant}${SEP}${p.r4B_Max}${SEP}${p.r4B_Montant}${SEP}${p.r4C_Montant}${SEP}`;
            csv += `${Number(p.is_active) === 1 ? "ACTIF" : "ARCHIVE"}${NL}`;
        });

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=Export_Articles.csv`);
        return res.status(200).send(BOM + csv);
    } catch (error) {
        console.error("❌ Erreur Export Produits CSV:", error.message);
        res.status(500).json({ error: error.message });
    }
};

exports.importProductsCSV = async (req, res) => {
    try {
        const companyId = req.user?.companyId?.toString();
        
        // 🛡️ VERROU DE SÉCURITÉ INVENTAIRE SÉCURISÉ
        const inventoryStatus = await InventoryService.checkStatus(companyId);
        if (inventoryStatus.en_cours) {
            return res.status(403).json({ 
                success: false, 
                error: "IMPORTATION IMPOSSIBLE : Un inventaire est actuellement en cours. Veuillez le clôturer ou l'annuler avant d'importer des fichiers." 
            });
        }

        if (!req.file) throw new Error("Fichier CSV manquant.");
        
        const csvRaw = req.file.buffer.toString('utf8').replace(/^\ufeff/, '');
        const lines = csvRaw.split(/\r?\n/).filter(l => l.trim() !== "").slice(1);
        
        const rawItems = lines.map((line, index) => {
            const c = line.split(';').map(col => col.trim().replace(/^"|"$/g, ''));
            
            return {
                nom: c[1],
                groupeNom: c[2],
                codeBarre: c[3],
                uniteLibelle: c[4], 
                prixVente: parseFloat(c[5]) || 0,
                cmp: parseFloat(c[6]) || 0,
                taxeActive: parseInt(c[7]) || 0,
                taxeTaux: parseFloat(c[8]) || 0,
                stockAlerte: parseFloat(c[9]) || 0, // Sera converti de Casier vers Bouteilles natives par le service
                remiseActive: parseInt(c[10]) || 0,
                r1Active: parseInt(c[11]) || 0, r1Seuil: parseFloat(c[12]) || 0, r1Montant: parseFloat(c[13]) || 0, r1Taux: parseFloat(c[14]) || 0,
                r2Active: parseInt(c[15]) || 0, r2Seuil: parseFloat(c[16]) || 0, r2Montant: parseFloat(c[17]) || 0, r2Taux: parseFloat(c[18]) || 0,
                r3Active: parseInt(c[19]) || 0, r3Multiple: parseFloat(c[20]) || 0, r3Montant: parseFloat(c[21]) || 0, r3Taux: parseFloat(c[22]) || 0,
                r4Active: parseInt(c[23]) || 0, r4A_Max: parseFloat(c[24]) || 0, r4A_Montant: parseFloat(c[25]) || 0, r4B_Max: parseFloat(c[26]) || 0, r4B_Montant: parseFloat(c[27]) || 0, r4C_Montant: parseFloat(c[28]) || 0,
                is_active: c[29] === 'ACTIF' ? 1 : 0
            };
        });

        // Le service associera l'uniteLibelle à l'unite_id et convertira les seuils en bouteilles unitaires
        const count = await productService.processMassiveImport(rawItems, req.user);
        
        if (req.io && companyId) {
            req.io.to(companyId).emit('DATA_EVENT', { table: 'products', action: 'IMPORT' });
        }

        res.json({ success: true, message: `${count} articles importés.` });
    } catch (error) {
        console.error("❌ Erreur Import Produits CSV:", error.message);
        res.status(400).json({ success: false, error: error.message });
    }
};

exports.getProductHistory = async (req, res) => {
    try {
        const { id } = req.params;
        const { dateDebut, dateFin } = req.query;
        const companyId = req.user.companyId;
        const db = req.db; 

        const dStart = dateDebut || '1900-01-01';
        const dEnd = dateFin || '2100-12-31';
        
        // 🛡️ Détection globale
        const isAll = !id || id === 'all' || id === 'undefined';

        // 🚀 STRUCTURE DE REQUÊTE PRÉSERVÉE : Extraction brute unitaire depuis SQLite
        const sql = `
        SELECT * FROM (
            /* ===================== 1. ACHATS & RETOURS FRS ===================== */
            SELECT 
                pi.product_id, p_ref.nom AS article_nom,
                CASE WHEN pi.type_ligne = 'RETOUR' THEN 'RETOUR_FOURNISSEUR' ELSE pi.type_ligne END AS type, 
                pi.created_at AS date, pi.num_facture AS reference, pi.nom_article_snap AS tiers, 
                CASE WHEN pi.type_ligne = 'RETOUR' THEN 0 ELSE pi.qte_achetee END AS qte_entree, 
                CASE WHEN pi.type_ligne = 'RETOUR' THEN pi.qte_achetee ELSE 0 END AS qte_sortie,
                pi.prix_achat_unitaire AS PU, pi.montant_facture_ligne AS montant,
                pi.stock_avant_achat AS stock_av, pi.stock_apres_achat AS stock_ap,
                pi.lot_id, u.username AS operateur_nom, pi.company_id,
                IFNULL(un.coefficient, 1) AS coefficient, IFNULL(un.code, 'CS') AS unit_code_gros, IFNULL(un.unite_reference, 'UNITÉ') AS unit_ref_detail
            FROM purchase_items pi
            LEFT JOIN products p_ref ON pi.product_id = p_ref.id
            LEFT JOIN unites un ON p_ref.unite_id = un.id
            LEFT JOIN users u ON pi.user_id = u.id
            WHERE pi.is_active = 1

            UNION ALL

            /* ===================== 2. VENTES & RETOURS CLIENTS ===================== */
            SELECT 
                si.product_id, p_ref.nom AS article_nom,
                CASE WHEN si.type_ligne = 'RETOUR' THEN 'RETOUR_CLIENT' ELSE si.type_ligne END AS type, 
                si.created_at AS date, si.id_vente AS reference, si.nom_article_snap AS tiers, 
                CASE WHEN si.type_ligne = 'RETOUR' THEN si.quantite ELSE 0 END AS qte_entree, 
                CASE WHEN si.type_ligne = 'VENTE' THEN si.quantite ELSE 0 END AS qte_sortie,
                si.prix_vente_unitaire AS PU, si.montant_ttc_ligne AS montant,
                IFNULL(si.stock_avant_vente, 0) AS stock_av, IFNULL(si.stock_apres_vente, 0) AS stock_ap,
                si.lot_id, u.username AS operateur_nom, si.company_id,
                IFNULL(un.coefficient, 1) AS coefficient, IFNULL(un.code, 'CS') AS unit_code_gros, IFNULL(un.unite_reference, 'UNITÉ') AS unit_ref_detail
            FROM sale_items si
            LEFT JOIN products p_ref ON si.product_id = p_ref.id
            LEFT JOIN unites un ON p_ref.unite_id = un.id
            LEFT JOIN users u ON si.user_id = u.id
            WHERE (si.is_active = 1 OR si.type_ligne = 'RETOUR')

            UNION ALL

            /* ===================== 3. INVENTAIRES ===================== */
          /* ===================== 3. INVENTAIRES CORRIGÉS EN SIMPLE LECTURE PROPRE ===================== */
SELECT 
    iv.product_id, p_ref.nom AS article_nom, 'INVENTAIRE' AS type, 
    iv.created_at AS date, iv.id_inventaire AS reference, 'SYSTEME' AS tiers, 
    CASE WHEN iv.stock_reel > iv.stock_theorique THEN (iv.stock_reel - iv.stock_theorique) ELSE 0 END AS qte_entree,
    CASE WHEN iv.stock_reel < iv.stock_theorique THEN (iv.stock_theorique - iv.stock_reel) ELSE 0 END AS qte_sortie,
    
    -- 🚀 AFFICHAGE DU PRIX UNITAIRE AU DÉTAIL DANS LA COLONNE PU POUR L'AUDIT
    (iv.prix_achat_snap / COALESCE(NULLIF(un.coefficient, 0), 1.0)) AS PU, 
    
    -- 🎯 CORRECTION D'AFFICHAGE DU FLUX EN SIMPLE LECTURE DE L'ÉCART UNITAIRE PONDÉRÉ
    ABS(ROUND(
        (iv.stock_reel - iv.stock_theorique) * (iv.prix_achat_snap / COALESCE(NULLIF(un.coefficient, 0), 1.0))
    )) AS montant,
    
    iv.stock_theorique AS stock_av, iv.stock_reel AS stock_ap,
    NULL AS lot_id, 'SYSTÈME' AS operateur_nom, iv.company_id,
    IFNULL(un.coefficient, 1) AS coefficient, IFNULL(un.code, 'CS') AS unit_code_gros, IFNULL(un.unite_reference, 'UNITÉ') AS unit_ref_detail
FROM inventory_items iv
LEFT JOIN products p_ref ON iv.product_id = p_ref.id
LEFT JOIN unites un ON p_ref.unite_id = un.id

        ) 
        WHERE company_id = ? 
          AND date BETWEEN ? AND ?
          ${isAll ? '' : 'AND product_id = ?'}
        ORDER BY date DESC
        `;

        const params = [companyId, dStart, dEnd];
        if (!isAll) params.push(id);

        const rows = db.prepare(sql).all(...params);

        // 🚀 CORRECTION LOGISTIQUE : Hydratation de chaque ligne de l'historique
        const formattedHistory = rows.map(row => {
            const coeff = Number(row.coefficient || 1);
            
            return {
                ...row,
                // Formatage textuel prêt pour l'affichage de l'interface graphique
                qte_entree_formatee: conversestock.formaterStockPourAffichage(row.qte_entree, coeff, row.unit_code_gros, row.unit_ref_detail),
                qte_sortie_formatee: conversestock.formaterStockPourAffichage(row.qte_sortie, coeff, row.unit_code_gros, row.unit_ref_detail),
                stock_av_formate: conversestock.formaterStockPourAffichage(row.stock_av, coeff, row.unit_code_gros, row.unit_ref_detail),
                stock_ap_formate: conversestock.formaterStockPourAffichage(row.stock_ap, coeff, row.unit_code_gros, row.unit_ref_detail)
            };
        });

        res.json(formattedHistory);

    } catch (error) {
        console.error("❌ ERREUR SQL GRAND LIVRE :", error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};
