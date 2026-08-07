const { getDb } = require('../config/database'); 
const provService = require('../services/provisional_sale.service');
const conversestock = require('../services/conversestock'); // 🚀 IMPORTATION DU MODULE LOGISTIQUE CENTRALISÉ

const nettoyerNombre = (valeur) => {
    if (typeof valeur === 'number') return valeur;
    if (!valeur) return 0;
    return parseFloat(valeur.toString().replace(',', '.').replace(/[^\d.]/g, '')) || 0;
};

const createProvisionalSale = async (req, res) => {
    // 🛡️ SÉCURISATION CONTEXTE : Récupération ultra-tolérante des variables de session
    const secureUserId = (req.user?.userId || req.user?.id || req.user?.id_utilisateur)?.toString();
    const secureCompanyId = (req.user?.companyId || req.user?.company_id)?.toString();
    const userName = req.user?.username || 'Utilisateur';

    if (!secureUserId || !secureCompanyId) {
        return res.status(401).json({ error: "Utilisateur non authentifié ou session expirée." });
    }

    try {
        const db = getDb(); // Récupération de l'instance SQLite active
        const itemsEntrants = req.body?.items || req.body?.lignes || [];

        // Enrichissement structurel et alignement financier strict de chaque ligne du panier
        const itemsAvecSnapshots = itemsEntrants.map(item => {
            const pId = item.product_id || item.id_article;
            
            // 1️⃣ Récupération du CMP configuré au format global (au casier/carton)
            const product = db.prepare(`
                SELECT p.cmp, u.coefficient 
                FROM products p
                LEFT JOIN unites u ON p.unite_id = u.id
                WHERE p.id = ? AND p.company_id = ?
            `).get(pId, secureCompanyId);

            const cmpAncien = product ? Number(product.cmp || 0) : 0;
            const coeffLogistique = product ? Number(product.coefficient || 1) : 1;

            // 2️⃣ Évaluation unitaire à la pièce native (bouteille) pour uniformisation comptable
            const puAchatPiecesSnap = cmpAncien / coeffLogistique;

            // 3️⃣ 🔒 FIXATION QUANTITÉ : On s'assure d'envoyer l'expression combinée textuelle ("1+0", "0+6") 
            // ou la chaine "qte_achetee" au décodeur pour éviter le crash du 10000 G.
            const chaineQuantiteBrute = item.qte_achetee || item.quantite || "1+0";
            const qtePiecesVente = conversestock.calculerUnitesNatives(db, pId, chaineQuantiteBrute);
            
            // 4️⃣ Évaluation du coût d'achat global dénormalisé de la ligne
            const totalAchatLigne = Math.round((qtePiecesVente * puAchatPiecesSnap) * 100) / 100;

            // 5️⃣ 🔒 ALIGNEMENT ET BLINDAGE FINANCIER DES PRIX POUR LE SERVICE MÉTIER
            // On extrait les vraies clés de prix et de totaux de l'UI pour interdire l'écriture par défaut à 1
            const vraiPrixUnitaire = nettoyerNombre(item.prix_vente_unitaire || item.prix_unitaire || item.prix || 0);
            const vraiTotalTTCLigne = nettoyerNombre(item.montant_ttc_ligne || item.total_ttc || 0);
            const vraiMontantHT = nettoyerNombre(item.montant_ht || item.montant_ht_ligne || (vraiTotalTTCLigne / 1.18));
            const vraieRemise = nettoyerNombre(item.remise_montant || item.remise || 0);
            const vraieTaxe = nettoyerNombre(item.taxe_montant || (vraiTotalTTCLigne - vraiMontantHT));

            // Retour de l'objet item enrichi et parfaitement mappé pour l'insertion SQLite
            return {
                ...item,
                product_id: pId,
                quantite: item.quantite, // Conserve le décimal de gros pour l'UI
                saisie_gros: nettoyerNombre(item.saisie_gros || 0),
                saisie_detail: nettoyerNombre(item.saisie_detail || 0),
                qte_achetee: chaineQuantiteBrute,
                expression_logistique: item.expression_logistique || item.qte_vendue_formatee || "",
                
                // Mappage rigide des colonnes financières pour le provService
                prix_vente_unitaire: vraiPrixUnitaire,
                montant_ht_ligne: vraiMontantHT,
                montant_ht: vraiMontantHT,
                remise_montant: vraieRemise,
                taxe_montant: vraieTaxe,
                montant_ttc_ligne: vraiTotalTTCLigne,
                total_ttc: vraiTotalTTCLigne,

                prix_achat_unitaire_snap: puAchatPiecesSnap, // Coût unitaire d'achat
                montant_achat_total_snap: totalAchatLigne    // Coût global d'achat
            };
        });

        // Reconstruction sécurisée du corps de la requête avec les lignes corrigées
        const payloadEnrichi = {
            ...req.body,
            total: nettoyerNombre(req.body.total || itemsAvecSnapshots.reduce((acc, cur) => acc + cur.montant_ttc_ligne, 0)),
            items: itemsAvecSnapshots,
            lignes: itemsAvecSnapshots
        };

        // ✅ APPEL AU SERVICE MÉTIER TRANSACTIONNEL
        const result = await provService.createProvisionalSale(payloadEnrichi, { secureUserId, secureCompanyId, userName });

        if (req.io) {
            const room = secureCompanyId;

            req.io.to(room).emit('DATA_EVENT', { table: 'provisional_sales', action: 'INSERT' });
            req.io.to(room).emit('DATA_EVENT', { table: 'products', action: 'UPDATE' });
            req.io.to(room).emit('DATA_EVENT', { table: 'carts', action: 'DELETE', userId: secureUserId });
            req.io.to(room).emit('STOCK_UPDATED');

            req.io.to(room).emit('TEMP_CART_UPDATED', { userId: secureUserId, action: 'DELETE' });
            req.io.to(room).emit('NEW_PROVISIONAL_SALE', { 
                lot_id: result?.finalLotId, 
                vendeur: result?.finalStaffName,
                client: result?.nomClientFinal
            });
            req.io.to(room).emit('SALES_TABLE_UPDATED');
            req.io.to(room).emit('REFRESH_STOCK', { reason: 'PROVISIONAL_SALE' });
        }
        
        return res.status(201).json({ success: true, lot_id: result?.finalLotId });
    } catch (err) {
        console.error("❌ Erreur createProvisionalSale:", err.message);
        return res.status(400).json({ error: err.message });
    }
};


const getProvisionalSales = async (req, res) => {
    const companyId = (req.user?.companyId || req.user?.company_id)?.toString();
    if (!companyId) return res.status(401).json({ error: "Entreprise non identifiée." });
    
    try {
        const sales = await provService.getProvisionalSales(companyId);

        // 🚀 HYDRATATION LOGISTIQUE INVERSE DE L'HISTORIQUE DES BONS PROVISOIRES
        const formattedSales = sales.map(sale => {
            if (sale.qte_vendue !== undefined) {
                return {
                    ...sale,
                    qte_vendue_formatee: conversestock.formaterStockPourAffichage(
                        sale.qte_vendue,
                        sale.unit_coefficient || sale.coefficient || 1,
                        sale.unit_code_gros || sale.unite_code || 'CS',
                        sale.unit_ref_detail || sale.unite_reference || 'PCS'
                    )
                };
            }
            return sale;
        });

        return res.json(formattedSales);
    } catch (err) {
        console.error("❌ Erreur getProvisionalSales:", err.message);
        return res.status(500).json({ error: "Erreur lors de la récupération des ventes provisoires." });
    }
};

const getProvisionalSaleDetails = async (req, res) => {
    const { lotId } = req.params;
    const secureCompanyId = (req.user?.companyId || req.user?.company_id)?.toString();
    if (!secureCompanyId) return res.status(401).json({ error: "Entreprise non identifiée." });

    try {
        const lines = await provService.getProvisionalSaleDetails(lotId, secureCompanyId);

        // 🚀 HYDRATATION LOGISTIQUE DU PANIER DE DETAILS DU BON DE COMMANDE PROVISOIRE
        const formattedLines = lines.map(item => {
            const qteBrute = Math.abs(Number(item.quantite || item.qte_vendue || 0));
            return {
                ...item,
                qte_formatee: conversestock.formaterStockPourAffichage(
                    qteBrute,
                    item.unit_coefficient || item.coefficient || 1,
                    item.unit_code_gros || item.unite_code || 'CS',
                    item.unit_ref_detail || item.unite_reference || 'PCS'
                )
            };
        });

        return res.json(formattedLines);
    } catch (err) {
        console.error("❌ Erreur getProvisionalSaleDetails:", err.message);
        return res.status(500).json({ error: "Erreur lors de la récupération des détails." });
    }
};

const validateProvisionalSale = async (req, res) => {
    const { lotId } = req.params;
    const { is_partial, item_ids } = req.body;

    const userContext = { 
        secureUserId: (req.user?.userId || req.user?.id)?.toString(), 
        secureCompanyId: (req.user?.companyId || req.user?.company_id)?.toString(),
        userName: req.user?.username || 'Caissier'
    };

    if (!userContext.secureUserId || !userContext.secureCompanyId) {
        return res.status(401).json({ error: "Session incomplète ou expirée." });
    }

    try {
        // 🎯 Appel direct au service métier qui gère la table provisional_sales et le transfert partiel/total en toute sécurité
        const result = await provService.validateProvisionalSale(lotId, req.body, userContext);
        
        if (req.io) {
            const room = userContext.secureCompanyId;

            req.io.to(room).emit('DATA_EVENT', { table: 'provisional_sales', action: 'VALIDATE', lotId });
            req.io.to(room).emit('DATA_EVENT', { table: 'sales', action: 'INSERT' });
            req.io.to(room).emit('STOCK_UPDATED');
            req.io.to(room).emit('PROVISIONAL_SALE_VALIDATED', { lotId, is_partial });
            req.io.to(room).emit('SALES_TABLE_UPDATED');
        }

        return res.json({ 
            success: true, 
            message: is_partial ? "Encaissement partiel effectué." : "Vente provisoire entièrement validée.",
            id: result?.id || lotId
        });
    } catch (err) {
        console.error("❌ Erreur validateProvisionalSale:", err.message);
        return res.status(400).json({ error: err.message });
    }
};
const splitProvisionalItemCtrl = async (req, res) => {
    const { itemId } = req.params;
    const userContext = { 
        secureCompanyId: (req.user?.companyId || req.user?.company_id)?.toString()
    };

    if (!userContext.secureCompanyId) {
        return res.status(401).json({ error: "Session incomplète ou expirée." });
    }

    try {
        const result = await provService.splitProvisionalItem(itemId, req.body, userContext);
        
        if (req.io) {
            req.io.to(userContext.secureCompanyId).emit('DATA_EVENT', { table: 'provisional_sales', action: 'SPLIT', itemId });
        }

        return res.json({ success: true, ...result });
    } catch (err) {
        console.error("❌ Erreur splitProvisionalItem:", err.message);
        return res.status(400).json({ error: err.message });
    }
};


const rejectProvisionalSale = async (req, res) => {
    const { lotId } = req.params;
    const userContext = { 
        secureUserId: (req.user?.userId || req.user?.id)?.toString(), 
        secureCompanyId: (req.user?.companyId || req.user?.company_id)?.toString(),
        userName: req.user?.username || 'Caissier'
    };

    if (!userContext.secureUserId || !userContext.secureCompanyId) {
        return res.status(401).json({ error: "Session incomplète ou expirée." });
    }

    console.log(`[REJET] Tentative de reconsidération du lot : "${lotId}" pour la compagnie : ${userContext.secureCompanyId}`);

    try {
        if (!lotId || lotId === 'undefined' || lotId.trim() === "") {
            throw new Error("L'identifiant du lot (lotId) est invalide ou manquant.");
        }

        await provService.rejectProvisionalSale(lotId, userContext);
        
        if (req.io) {
            req.io.to(userContext.secureCompanyId).emit('DATA_EVENT', { table: 'provisional_sales', action: 'DELETE', lotId });
            req.io.to(userContext.secureCompanyId).emit('STOCK_UPDATED');
        }

        return res.json({ success: true, message: "Vente provisoire rejetée et annulée avec succès." });
    } catch (err) {
        console.error(`❌ Erreur lors du rejet prov_sale : ${err.message}`);
        return res.status(400).json({ error: err.message });
    }
};
const saveTemporaryProvisionalCart = async (req, res) => {
    const userId = (req.user?.userId || req.user?.id)?.toString();
    const companyId = (req.user?.companyId || req.user?.company_id)?.toString();
    
    if (!userId || !companyId) return res.status(401).json({ error: "Session incomplète." });

    try {
        await provService.saveTemporaryCart(userId, companyId, req.body?.lignes || []);
        return res.json({ success: true });
    } catch (err) { 
        console.error("❌ Erreur saveTemporaryProvisionalCart:", err.message);
        return res.status(500).json({ error: err.message }); 
    }
};

const getTemporaryProvisionalCart = async (req, res) => {
    const userId = (req.user?.userId || req.user?.id)?.toString();
    const companyId = (req.user?.companyId || req.user?.company_id)?.toString();
    
    if (!userId || !companyId) return res.status(401).json({ error: "Session incomplète." });

    try {
        const cart = await provService.getTemporaryCart(userId, companyId);
        return res.json({ lignes: cart });
    } catch (err) { 
        console.error("❌ Erreur getTemporaryProvisionalCart:", err.message);
        return res.status(500).json({ error: err.message }); 
    }
};

const deleteTemporaryProvisionalCart = async (req, res) => {
    const userId = (req.user?.userId || req.user?.id)?.toString();
    const companyId = (req.user?.companyId || req.user?.company_id)?.toString();
    
    if (!userId || !companyId) return res.status(401).json({ error: "Session incomplète." });

    try {
        await provService.deleteTemporaryCart(userId, companyId);
        return res.json({ success: true });
    } catch (err) { 
        console.error("❌ Erreur deleteTemporaryProvisionalCart:", err.message);
        return res.status(500).json({ error: err.message }); 
    }
};

const deleteProvisionalSaleItem = async (req, res) => {
    const { itemId } = req.params; 
    const userContext = { 
        secureUserId: (req.user?.userId || req.user?.id)?.toString(), 
        secureCompanyId: (req.user?.companyId || req.user?.company_id)?.toString()
    };

    if (!userContext.secureUserId || !userContext.secureCompanyId) {
        return res.status(401).json({ error: "Session incomplète." });
    }

    try {
        const result = await provService.deleteProvisionalItem(itemId, userContext);
        
        // 🚀 HYDRATATION LOGISTIQUE DU POP-UP DE RETOUR D'ARTICLE PROVISOIRE (ANTI-LITIGE)
        let messageAffichage = "Ligne d'article supprimée du bon provisoire.";
        if (result && result.qte_mouvementee !== undefined) {
            const coeffLogistique = Number(result.unit_coefficient || result.coefficient || 1);
            const codeGros = String(result.unit_code_gros || result.unite_code || 'CS').toUpperCase().trim();
            const refDetail = String(result.unit_ref_detail || result.unite_reference || 'PCS').toUpperCase().trim();

            const qteTexteFormatee = conversestock.formaterStockPourAffichage(
                result.qte_mouvementee,
                coeffLogistique,
                codeGros,
                refDetail
            );
            messageAffichage = `Article retiré avec succès. Un volume de ${qteTexteFormatee} a été réaffecté au stock général disponible.`;
        }

        if (req.io) {
            req.io.to(userContext.secureCompanyId).emit('DATA_EVENT', { table: 'provisional_sales', action: 'UPDATE' });
            req.io.to(userContext.secureCompanyId).emit('STOCK_UPDATED');
        }
        
        return res.json({ 
            success: true,
            message: messageAffichage
        });
    } catch (err) { 
        console.error("❌ Erreur deleteProvisionalSaleItem:", err.message);
        return res.status(400).json({ error: err.message }); 
    }
};

const updateProvisionalSale = async (req, res) => {
    // 🛡️ SÉCURISATION ID : Récupération tolérante du lotId peu importe la casse
    const lotId = req.params.lotId || req.params.lot_id || req.body?.lot_id;
    
    const userContext = { 
        secureUserId: (req.user?.userId || req.user?.id || req.body?.user_id)?.toString() || 'USR-1', 
        secureCompanyId: (req.user?.companyId || req.user?.company_id || req.body?.company_id)?.toString() || 'CPY-1',
        userName: req.user?.username || req.body?.userName || 'Utilisateur'
    };

    try {
        if (!lotId || lotId === 'undefined' || lotId.trim() === "") {
            throw new Error("L'identifiant du lot (lotId) est manquant ou invalide.");
        }
        
        // Préparation du payload pour matcher à 100% avec les snaps de la base SQLite
        const payloadAjuste = {
            ...req.body,
            staff_id: req.body?.staff_id,
            staff_name_snap: req.body?.staff_name || req.body?.staff_name_snap || "Inconnu",
            table_id: req.body?.table_id,
            table_number_snap: req.body?.table_number || req.body?.table_number_snap || "Inconnu"
        };

        // Appel direct à la logique métier (Le Service)
        await provService.updateProvisionalSale(lotId, payloadAjuste, userContext);

        if (req.io) {
            const room = userContext.secureCompanyId;

            // SIGNAL UNIVERSEL : Mise à jour globale de la vue des ventes provisoires
            req.io.to(room).emit('DATA_EVENT', { 
                table: 'provisional_sales', 
                action: 'UPDATE', 
                lotId 
            });

            // SIGNALS SPÉCIFIQUES SÉCURISÉS
            req.io.to(room).emit('PROVISIONAL_SALE_UPDATED', { lotId });
            req.io.to(room).emit('STOCK_UPDATED');
            req.io.to(room).emit('REFRESH_STOCK', { reason: 'UPDATE_PROVISIONAL' });
        }

        return res.status(200).json({ success: true, message: "Mise à jour effectuée avec succès." });
    } catch (err) {
        console.error(`❌ Erreur lors de la mise à jour prov_sale : ${err.message}`);
        return res.status(400).json({ error: err.message });
    }
};
const createCommercialTourProvisional = async (req, res) => {
    // 🛡️ SÉCURISATION CONTEXTE : Récupération ultra-tolérante des variables de session (Même logique)
    const secureUserId = (req.user?.userId || req.user?.id || req.user?.id_utilisateur)?.toString();
    const secureCompanyId = (req.user?.companyId || req.user?.company_id)?.toString();
    const userName = req.user?.username || 'Utilisateur';

    if (!secureUserId || !secureCompanyId) {
        return res.status(401).json({ error: "Utilisateur non authentifié ou session expirée." });
    }

    try {
        const db = getDb();
        const { lot_id, staff_id, staff_name } = req.body;
        const itemsEntrants = req.body?.items || req.body?.lignes || [];

        if (!lot_id || !staff_id || itemsEntrants.length === 0) {
            return res.status(400).json({ error: "Données de la tournée incomplètes." });
        }

        // 🚀 INTERCEPTION ET DÉCOUPLAGE LOGISTIQUE POUR LA PROTECTION DU CMP HISTORIQUE
        const itemsAvecSnapshots = itemsEntrants.map(item => {
            const pId = item.product_id;
            
            // 1️⃣ Récupération du CMP configuré au format global (au casier/carton)
            const product = db.prepare(`
                SELECT p.cmp, u.coefficient 
                FROM products p
                LEFT JOIN unites u ON p.unite_id = u.id
                WHERE p.id = ? AND p.company_id = ?
            `).get(pId, secureCompanyId);

            const cmpAncien = product ? Number(product.cmp || 0) : 0;
            const coeffLogistique = product ? Number(product.coefficient || 1) : 1;

            // 2️⃣ Évaluation unitaire à la pièce native (bouteille)
            const puAchatPiecesSnap = cmpAncien / coeffLogistique;

            // 3️⃣ Calcul du volume de pièces natives demandées via votre module conversestock
            const qtePiecesVente = conversestock.calculerUnitesNatives(db, pId, item.quantite);
            
            // 4️⃣ Évaluation du coût d'achat global dénormalisé de la ligne
            const totalAchatLigne = Math.round((qtePiecesVente * puAchatPiecesSnap) * 100) / 100;

            return {
                ...item,
                quantite: qtePiecesVente, // Écriture au format brut de pièces natives unitaires
                prix_achat_unitaire_snap: puAchatPiecesSnap,
                montant_achat_total_snap: totalAchatLigne
            };
        });

        // Préparation des paramètres à envoyer au service
        const payloadEnrichi = {
            lot_id,
            staff_id,
            staff_name,
            lignes: itemsAvecSnapshots,
            items: itemsAvecSnapshots
        };

        // ✅ APPEL AU SERVICE MÉTIER (À créer dans votre provisional_sale.service.js)
        await provService.createCommercialTourProvisional(payloadEnrichi, { secureUserId, secureCompanyId, userName });

        // 🔥 ÉMISSION DES SIGNAUX SOCKET (Même structure que votre modèle)
        if (req.io) {
            const room = secureCompanyId;
            req.io.to(room).emit('DATA_EVENT', { table: 'provisional_sales', action: 'INSERT' });
            req.io.to(room).emit('STOCK_UPDATED');
            req.io.to(room).emit('SALES_TABLE_UPDATED');
        }

        return res.status(201).json({ success: true, lot_id });
    } catch (err) {
        console.error("❌ Erreur createCommercialTourProvisional:", err.message);
        return res.status(400).json({ error: err.message });
    }
};
const validateCommercialTourDefinitif = async (req, res) => {
    const secureUserId = (req.user?.userId || req.user?.id || req.user?.id_utilisateur)?.toString();
    const secureCompanyId = (req.user?.companyId || req.user?.company_id)?.toString();
    const userName = req.user?.username || 'Utilisateur';

    if (!secureUserId || !secureCompanyId) {
        return res.status(401).json({ error: "Utilisateur non authentifié ou session expirée." });
    }

    try {
        const db = getDb();
        const { lot_id, staff_id, staff_name, moyen_paiement, payment_method_id, encaissement } = req.body;
        const itemsEntrants = req.body?.items || req.body?.lignes || [];

        if (!lot_id || itemsEntrants.length === 0) {
            return res.status(400).json({ error: "Données de clôture du soir incomplètes." });
        }

        // 🚀 HARMONISATION TECHNIQUE DES PIÈCES NATIVES SANS DISTORSION MULTIPLICATIVE
        const itemsTraites = itemsEntrants.map(item => {
            // Extraction directe des nombres unitaires bruts calculés par le frontend
            const totalPiecesChargees = Math.abs(Number(item.quantite || item.qte_chargee_pieces || 0));
            const totalPiecesRetournees = Math.abs(Number(item.quantite_retour || item.qte_retour_pieces || 0));

            return {
                ...item,
                product_id: item.product_id,
                nom_article_snap: item.nom_article_snap || item.nom,
                quantite: totalPiecesChargees,      // 🎯 Quantité de départ unitaire brute
                quantite_retour: totalPiecesRetournees, // 🎯 Quantité de retour unitaire brute
                montant_ttc_ligne: nettoyerNombre(item.montant_ttc_ligne)
            };
        });

        const payloadEnrichi = {
            lot_id,
            staff_id,
            staff_name,
            moyen_paiement: moyen_paiement || 'ESPÈCES',
            payment_method_id: payment_method_id || null,
            encaissement: encaissement || {},
            lignes: itemsTraites,
            items: itemsTraites
        };

        // ✅ EXÉCUTION DU SERVICE MÉTIER SÉCURISÉ EN PREMIER EN-TÊTE
        const result = await provService.validateCommercialTourDefinitif(payloadEnrichi, { secureUserId, secureCompanyId, userName });

        // 🔥 SIGNAL UNIVERSEL DE RENDER TEMPS RÉEL (WebSockets Room)
        if (req.io) {
            const room = secureCompanyId;
            req.io.to(room).emit('DATA_EVENT', { table: 'provisional_sales', action: 'DELETE' });
            req.io.to(room).emit('DATA_EVENT', { table: 'sales', action: 'INSERT' });
            req.io.to(room).emit('DATA_EVENT', { table: 'products', action: 'UPDATE' });
            req.io.to(room).emit('STOCK_UPDATED');
            req.io.to(room).emit('SALES_TABLE_UPDATED');
            req.io.to(room).emit('REFRESH_STOCK', { reason: 'COMMERCIAL_VALIDATION' });
        }

        return res.status(200).json({ success: true, id_vente: result?.idVenteDefinitive || result?.id });
    } catch (err) {
        console.error("❌ Erreur contrôleur validateCommercialTourDefinitif:", err.message);
        return res.status(400).json({ error: err.message });
    }
};



const getCommercialTourneesList = async (req, res) => {
    const companyId = (req.user?.companyId || req.user?.company_id)?.toString();
    if (!companyId) return res.status(401).json({ error: "Entreprise non identifiée." });
    
    try {
        // Appel de la méthode de service filtrée exclusive pour les tournées
        const sales = await provService.getCommercialTournees(companyId);

        // 🚀 HYDRATATION LOGISTIQUE INVERSE DE L'HISTORIQUE DES BONS DE TOURNÉES
        const formattedSales = sales.map(sale => {
            if (sale.qte_vendue !== undefined) {
                return {
                    ...sale,
                    qte_vendue_formatee: conversestock.formaterStockPourAffichage(
                        sale.qte_vendue,
                        sale.unit_coefficient || sale.coefficient || 1,
                        sale.unit_code_gros || sale.unite_code || 'CS',
                        sale.unit_ref_detail || sale.unite_reference || 'PCS'
                    )
                };
            }
            return sale;
        });

        return res.json(formattedSales);
    } catch (err) {
        console.error("❌ Erreur getCommercialTourneesList:", err.message);
        return res.status(500).json({ error: "Erreur lors de la récupération des tournées." });
    }
};

// Le contrôleur qui fait le lien entre la route et le service
const getCommercialTourneeDetails = async (req, res) => {
    // 🚀 SÉCURISATION EXTRACT : On fouille partout et on extrait UNIQUEMENT une chaîne de texte
    let rawLotId = req.params?.lotId || req.params?.lotid || req.query?.lotId || req.query?.lotid;
    
    if (!rawLotId && req.params && Object.keys(req.params).length > 0) {
        rawLotId = Object.values(req.params)[0]; // On extrait la première valeur brute
    }

    // Sécurité absolue contre le piège du tableau Javascript [object Object] ou array
    if (Array.isArray(rawLotId)) {
        rawLotId = rawLotId[0];
    }

    const lotId = rawLotId ? String(rawLotId).trim() : null;
    const secureCompanyId = (req.user?.companyId || req.user?.company_id)?.toString();
    
    if (!secureCompanyId) return res.status(401).json({ error: "Entreprise non identifiée." });
    if (!lotId || lotId === 'undefined') return res.status(400).json({ error: "Numéro de tournée (lotId) introuvable dans la requête." });

    try {
        const lines = await provService.getCommercialTourneeDetails(lotId, secureCompanyId);

        const formattedLines = lines.map(item => {
            const qteBrute = Math.abs(Number(item.quantite || item.qte_vendue || 0));
            return {
                ...item,
                qte_formatee: conversestock.formaterStockPourAffichage(
                    qteBrute,
                    item.unit_coefficient || item.coefficient || 1,
                    item.unit_code_gros || item.unite_code || 'CS',
                    item.unit_ref_detail || item.unite_reference || 'PCS'
                )
            };
        });

        return res.json(formattedLines);
    } catch (err) {
        console.error("❌ Erreur interne getCommercialTourneeDetails :", err.message);
        return res.status(500).json({ error: err.message });
    }
};


const updateCommercialTourProvisionalCtrl = async (req, res) => {
    const secureUserId = (req.user?.userId || req.user?.id || req.user?.id_utilisateur)?.toString();
    const secureCompanyId = (req.user?.companyId || req.user?.company_id)?.toString();
    const userName = req.user?.username || 'Utilisateur';

    if (!secureUserId || !secureCompanyId) {
        return res.status(401).json({ error: "Utilisateur non authentifié ou session expirée." });
    }

    try {
        const db = getDb(); 
        const { lot_id, staff_id, staff_name } = req.body;
        const itemsEntrants = req.body?.items || req.body?.lignes || [];

        if (!lot_id || !staff_id || itemsEntrants.length === 0) {
            return res.status(400).json({ error: "Données de mise à jour incomplètes." });
        }

        const itemsAvecSnapshots = itemsEntrants.map(item => {
            const pId = item.product_id;
            const product = db.prepare(`
                SELECT p.cmp, u.coefficient 
                FROM products p
                LEFT JOIN unites u ON p.unite_id = u.id
                WHERE p.id = ? AND p.company_id = ?
            `).get(pId, secureCompanyId);

            const cmpAncien = product ? Number(product.cmp || 0) : 0;
            const coeffLogistique = product ? Number(product.coefficient || 1) : 1;
            const puAchatPiecesSnap = cmpAncien / coeffLogistique;

            // 🎯 FIX SÉCURITÉ QUANTITÉ : Le frontend envoie 'qte_chargee_pieces' lors de la manipulation du panier.
            // On vérifie d'abord cette clé, puis 'quantite' si elle existe, sinon 0.
            const qtePiecesVente = Number(item.qte_chargee_pieces ?? item.quantite ?? 0); 

            const totalAchatLigne = Math.round((qtePiecesVente * puAchatPiecesSnap) * 100) / 100;

            return {
                ...item,
                quantite: qtePiecesVente,                    
                prix_achat_unitaire_snap: puAchatPiecesSnap, 
                montant_achat_total_snap: totalAchatLigne    
            };
        });

        const payloadEnrichi = {
            lot_id,
            staff_id,
            staff_name,
            items: itemsAvecSnapshots,
            lignes: itemsAvecSnapshots
        };

        const result = await provService.updateCommercialTourProvisional(payloadEnrichi, { secureUserId, secureCompanyId, userName });

        if (req.io) {
            const room = secureCompanyId;
            req.io.to(room).emit('DATA_EVENT', { table: 'provisional_sales', action: 'UPDATE' });
            req.io.to(room).emit('STOCK_UPDATED');
            req.io.to(room).emit('SALES_TABLE_UPDATED');
            req.io.to(room).emit('REFRESH_STOCK', { reason: 'COMMERCIAL_TOUR_UPDATE' });
        }
        
        return res.status(200).json({ success: true, lot_id: result?.lot_id });
    } catch (err) {
        console.error("❌ Erreur updateCommercialTourProvisional:", err.message);
        return res.status(400).json({ error: err.message });
    }
};
const deleteCommercialTourProvisionalCtrl = async (req, res) => {
    const secureUserId = (req.user?.userId || req.user?.id || req.user?.id_utilisateur)?.toString();
    const secureCompanyId = (req.user?.companyId || req.user?.company_id)?.toString();
    const userName = req.user?.username || 'Utilisateur';

    if (!secureUserId || !secureCompanyId) {
        return res.status(401).json({ error: "Utilisateur non authentifié ou session expirée." });
    }

    try {
        const { lotId } = req.params;
        if (!lotId) return res.status(400).json({ error: "Identifiant de tournée manquant." });

        const result = await provService.deleteFullCommercialTourProvisional(lotId, { secureUserId, secureCompanyId, userName });

        if (req.io) {
            const room = secureCompanyId;
            req.io.to(room).emit('DATA_EVENT', { table: 'provisional_sales', action: 'DELETE' });
            req.io.to(room).emit('STOCK_UPDATED');
        }

        return res.status(200).json({ success: true, message: "Tournée annulée et stocks recrédités.", lot_id: result.lot_id });
    } catch (err) {
        console.error("❌ Erreur deleteCommercialTourProvisional:", err.message);
        return res.status(400).json({ error: err.message });
    }
};

// 🎯 Ajoutez "deleteCommercialTourProvisionalCtrl" dans le module.exports de votre contrôleur !




// 🎯 TOUT EN BAS DE VOTRE FICHIER DE CONTRÔLEUR :
module.exports = { 
    // Méthodes du Bloc 1
    createProvisionalSale, 
    getProvisionalSales, 
    getProvisionalSaleDetails, 
    validateProvisionalSale, 
    rejectProvisionalSale, 
    getCommercialTourneesList,
    getCommercialTourneeDetails,
    // Méthodes du Bloc 2
    createCommercialTourProvisional,
    validateCommercialTourDefinitif,
    deleteCommercialTourProvisionalCtrl,
    // 🎯 FIX ICI : On exporte le contrôleur sous son vrai nom propre !
    updateCommercialTourProvisionalCtrl, 
    splitProvisionalItemCtrl,
    saveTemporaryProvisionalCart, 
    getTemporaryProvisionalCart, 
    deleteTemporaryProvisionalCart, 
    deleteProvisionalSaleItem,
    updateProvisionalSale
};
