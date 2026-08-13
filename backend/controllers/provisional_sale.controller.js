const { getDb } = require('../config/database'); 
const provService = require('../services/provisional_sale.service');
const conversestock = require('../services/conversestock'); 

const nettoyerNombre = (valeur) => {
    if (typeof valeur === 'number') return valeur;
    if (!valeur) return 0;
    return parseFloat(valeur.toString().replace(',', '.').replace(/[^\d.]/g, '')) || 0;
};

// Fonction utilitaire pour uniformiser le contexte utilisateur
const getUserContext = (req) => {
    const secureUserId = (req.user?.userId || req.user?.id || req.user?.id_utilisateur)?.toString();
    const secureCompanyId = (req.user?.companyId || req.user?.company_id)?.toString();
    return { secureUserId, secureCompanyId, userName: 'utilisateur' };
};

const createProvisionalSale = async (req, res) => {
    const { secureUserId, secureCompanyId, userName } = getUserContext(req);

    if (!secureUserId || !secureCompanyId) {
        return res.status(401).json({ error: "Utilisateur non authentifié ou session expirée." });
    }

    try {
        const db = getDb();
        const itemsEntrants = req.body?.items || req.body?.lignes || [];

        const itemsAvecSnapshots = itemsEntrants.map(item => {
            const pId = item.product_id || item.id_article;
            
            const product = db.prepare(`
                SELECT p.cmp, u.coefficient 
                FROM products p
                LEFT JOIN unites u ON p.unite_id = u.id
                WHERE p.id = ? AND p.company_id = ?
            `).get(pId, secureCompanyId);

            const cmpAncien = product ? Number(product.cmp || 0) : 0;
            const coeffLogistique = product ? Number(product.coefficient || 1) : 1;

            const puAchatPiecesSnap = cmpAncien / coeffLogistique;
            const chaineQuantiteBrute = item.qte_achetee || item.quantite || "1+0";
            const qtePiecesVente = conversestock.calculerUnitesNatives(db, pId, chaineQuantiteBrute);
            const totalAchatLigne = Math.round((qtePiecesVente * puAchatPiecesSnap) * 100) / 100;

            const vraiPrixUnitaire = nettoyerNombre(item.prix_vente_unitaire || item.prix_unitaire || item.prix || 0);
            const vraiTotalTTCLigne = nettoyerNombre(item.montant_ttc_ligne || item.total_ttc || 0);
            const vraiMontantHT = nettoyerNombre(item.montant_ht || item.montant_ht_ligne || (vraiTotalTTCLigne / 1.18));
            const vraieRemise = nettoyerNombre(item.remise_montant || item.remise || 0);
            const vraieTaxe = nettoyerNombre(item.taxe_montant || (vraiTotalTTCLigne - vraiMontantHT));

            return {
                ...item,
                product_id: pId,
                quantite: item.quantite,
                saisie_gros: nettoyerNombre(item.saisie_gros || 0),
                saisie_detail: nettoyerNombre(item.saisie_detail || 0),
                qte_achetee: chaineQuantiteBrute,
                expression_logistique: item.expression_logistique || item.qte_vendue_formatee || "",
                prix_vente_unitaire: vraiPrixUnitaire,
                montant_ht_ligne: vraiMontantHT,
                montant_ht: vraiMontantHT,
                remise_montant: vraieRemise,
                taxe_montant: vraieTaxe,
                montant_ttc_ligne: vraiTotalTTCLigne,
                total_ttc: vraiTotalTTCLigne,
                prix_achat_unitaire_snap: puAchatPiecesSnap,
                montant_achat_total_snap: totalAchatLigne
            };
        });

        const payloadEnrichi = {
            ...req.body,
            total: nettoyerNombre(req.body.total || itemsAvecSnapshots.reduce((acc, cur) => acc + cur.montant_ttc_ligne, 0)),
            items: itemsAvecSnapshots,
            lignes: itemsAvecSnapshots
        };

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
    const { secureCompanyId: companyId } = getUserContext(req);
    if (!companyId) return res.status(401).json({ error: "Entreprise non identifiée." });
    
    try {
        const sales = await provService.getProvisionalSales(companyId);
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
    const { secureCompanyId } = getUserContext(req);
    if (!secureCompanyId) return res.status(401).json({ error: "Entreprise non identifiée." });

    try {
        const lines = await provService.getProvisionalSaleDetails(lotId, secureCompanyId);
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
    const { is_partial } = req.body;
    const userContext = getUserContext(req);

    if (!userContext.secureUserId || !userContext.secureCompanyId) {
        return res.status(401).json({ error: "Session incomplète ou expirée." });
    }

    try {
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
    const userContext = getUserContext(req);
    if (!userContext.secureCompanyId) return res.status(401).json({ error: "Session incomplète." });

    try {
        const result = await provService.splitProvisionalItem(itemId, req.body, userContext);
        if (req.io) req.io.to(userContext.secureCompanyId).emit('DATA_EVENT', { table: 'provisional_sales', action: 'SPLIT', itemId });
        return res.json({ success: true, ...result });
    } catch (err) {
        console.error("❌ Erreur splitProvisionalItem:", err.message);
        return res.status(400).json({ error: err.message });
    }
};

const rejectProvisionalSale = async (req, res) => {
    const { lotId } = req.params;
    const userContext = getUserContext(req);
    if (!userContext.secureUserId || !userContext.secureCompanyId) return res.status(401).json({ error: "Session incomplète." });

    try {
        if (!lotId || lotId === 'undefined') throw new Error("ID lot invalide.");
        await provService.rejectProvisionalSale(lotId, userContext);
        if (req.io) {
            req.io.to(userContext.secureCompanyId).emit('DATA_EVENT', { table: 'provisional_sales', action: 'DELETE', lotId });
            req.io.to(userContext.secureCompanyId).emit('STOCK_UPDATED');
        }
        return res.json({ success: true, message: "Vente provisoire rejetée." });
    } catch (err) {
        console.error(`❌ Erreur rejet prov_sale : ${err.message}`);
        return res.status(400).json({ error: err.message });
    }
};

const saveTemporaryProvisionalCart = async (req, res) => {
    const { secureUserId: userId, secureCompanyId: companyId } = getUserContext(req);
    if (!userId || !companyId) return res.status(401).json({ error: "Session incomplète." });
    try {
        await provService.saveTemporaryCart(userId, companyId, req.body?.lignes || []);
        return res.json({ success: true });
    } catch (err) { return res.status(500).json({ error: err.message }); }
};

const getTemporaryProvisionalCart = async (req, res) => {
    const { secureUserId: userId, secureCompanyId: companyId } = getUserContext(req);
    if (!userId || !companyId) return res.status(401).json({ error: "Session incomplète." });
    try {
        const cart = await provService.getTemporaryCart(userId, companyId);
        return res.json({ lignes: cart });
    } catch (err) { return res.status(500).json({ error: err.message }); }
};

const deleteTemporaryProvisionalCart = async (req, res) => {
    const { secureUserId: userId, secureCompanyId: companyId } = getUserContext(req);
    if (!userId || !companyId) return res.status(401).json({ error: "Session incomplète." });
    try {
        await provService.deleteTemporaryCart(userId, companyId);
        return res.json({ success: true });
    } catch (err) { return res.status(500).json({ error: err.message }); }
};

const deleteProvisionalSaleItem = async (req, res) => {
    const { itemId } = req.params; 
    const userContext = getUserContext(req);
    if (!userContext.secureUserId || !userContext.secureCompanyId) return res.status(401).json({ error: "Session incomplète." });

    try {
        const result = await provService.deleteProvisionalItem(itemId, userContext);
        let messageAffichage = "Ligne supprimée.";
        if (result?.qte_mouvementee !== undefined) {
            const qteTexte = conversestock.formaterStockPourAffichage(result.qte_mouvementee, result.unit_coefficient || 1, result.unit_code_gros || 'CS', result.unit_ref_detail || 'PCS');
            messageAffichage = `Article retiré. Volume ${qteTexte} réaffecté au stock.`;
        }
        if (req.io) {
            req.io.to(userContext.secureCompanyId).emit('DATA_EVENT', { table: 'provisional_sales', action: 'UPDATE' });
            req.io.to(userContext.secureCompanyId).emit('STOCK_UPDATED');
        }
        return res.json({ success: true, message: messageAffichage });
    } catch (err) { return res.status(400).json({ error: err.message }); }
};

const updateProvisionalSale = async (req, res) => {
    const lotId = req.params.lotId || req.body?.lot_id;
    const userContext = getUserContext(req);
    try {
        if (!lotId) throw new Error("ID lot invalide.");
        await provService.updateProvisionalSale(lotId, req.body, userContext);
        if (req.io) {
            req.io.to(userContext.secureCompanyId).emit('DATA_EVENT', { table: 'provisional_sales', action: 'UPDATE', lotId });
            req.io.to(userContext.secureCompanyId).emit('PROVISIONAL_SALE_UPDATED', { lotId });
            req.io.to(userContext.secureCompanyId).emit('STOCK_UPDATED');
        }
        return res.status(200).json({ success: true, message: "Mise à jour effectuée." });
    } catch (err) { return res.status(400).json({ error: err.message }); }
};

const createCommercialTourProvisional = async (req, res) => {
    const { secureUserId, secureCompanyId, userName } = getUserContext(req);
    if (!secureUserId || !secureCompanyId) return res.status(401).json({ error: "Session expirée." });
    try {
        const db = getDb();
        const { lot_id, staff_id, staff_name } = req.body;
        const itemsEntrants = req.body?.items || req.body?.lignes || [];

        const itemsAvecSnapshots = itemsEntrants.map(item => {
            const product = db.prepare(`SELECT cmp, coefficient FROM products p LEFT JOIN unites u ON p.unite_id = u.id WHERE p.id = ?`).get(item.product_id);
            const qtePieces = conversestock.calculerUnitesNatives(db, item.product_id, item.quantite);
            return { ...item, quantite: qtePieces, prix_achat_unitaire_snap: (product?.cmp || 0) / (product?.coefficient || 1) };
        });

        await provService.createCommercialTourProvisional({ lot_id, staff_id, staff_name, lignes: itemsAvecSnapshots }, { secureUserId, secureCompanyId, userName });
        if (req.io) {
            req.io.to(secureCompanyId).emit('DATA_EVENT', { table: 'provisional_sales', action: 'INSERT' });
            req.io.to(secureCompanyId).emit('STOCK_UPDATED');
        }
        return res.status(201).json({ success: true, lot_id });
    } catch (err) { return res.status(400).json({ error: err.message }); }
};

const validateCommercialTourDefinitif = async (req, res) => {
    const userContext = getUserContext(req);
    try {
        const result = await provService.validateCommercialTourDefinitif(req.body, userContext);
        if (req.io) {
            req.io.to(userContext.secureCompanyId).emit('STOCK_UPDATED');
            req.io.to(userContext.secureCompanyId).emit('SALES_TABLE_UPDATED');
        }
        return res.status(200).json({ success: true, id_vente: result?.id });
    } catch (err) { return res.status(400).json({ error: err.message }); }
};

const getCommercialTourneesList = async (req, res) => {
    const { secureCompanyId: companyId } = getUserContext(req);
    if (!companyId) return res.status(401).json({ error: "Accès refusé." });
    try {
        const sales = await provService.getCommercialTournees(companyId);
        return res.json(sales);
    } catch (err) { return res.status(500).json({ error: err.message }); }
};

const getCommercialTourneeDetails = async (req, res) => {
    const { lotId } = req.params;
    const { secureCompanyId } = getUserContext(req);
    try {
        const lines = await provService.getCommercialTourneeDetails(lotId, secureCompanyId);
        return res.json(lines);
    } catch (err) { return res.status(500).json({ error: err.message }); }
};

const updateCommercialTourProvisionalCtrl = async (req, res) => {
    const userContext = getUserContext(req);
    try {
        await provService.updateCommercialTourProvisional(req.body, userContext);
        if (req.io) req.io.to(userContext.secureCompanyId).emit('STOCK_UPDATED');
        return res.status(200).json({ success: true });
    } catch (err) { return res.status(400).json({ error: err.message }); }
};

const deleteCommercialTourProvisionalCtrl = async (req, res) => {
    const { lotId } = req.params;
    const userContext = getUserContext(req);
    try {
        await provService.deleteFullCommercialTourProvisional(lotId, userContext);
        if (req.io) req.io.to(userContext.secureCompanyId).emit('STOCK_UPDATED');
        return res.status(200).json({ success: true });
    } catch (err) { return res.status(400).json({ error: err.message }); }
};

module.exports = { 
    createProvisionalSale, getProvisionalSales, getProvisionalSaleDetails, validateProvisionalSale, 
    rejectProvisionalSale, getCommercialTourneesList, getCommercialTourneeDetails, 
    createCommercialTourProvisional, validateCommercialTourDefinitif, deleteCommercialTourProvisionalCtrl, 
    updateCommercialTourProvisionalCtrl, splitProvisionalItemCtrl, saveTemporaryProvisionalCart, 
    getTemporaryProvisionalCart, deleteTemporaryProvisionalCart, deleteProvisionalSaleItem, updateProvisionalSale 
};