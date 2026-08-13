// backend/controllers/approvisionnement.controller.js
const approService = require('../services/approvisionnement.service');
const annulRetourService = require('../services/annulationretourApprov.service'); 
const configComptaService = require('../services/ConfigEcrituresAuto.service');
const conversestock = require('../services/conversestock');

/**
 * Contrôleur pour enregistrer un approvisionnement (Achat fournisseur)
 */
const saveApprovisionnement = async (req, res) => {
    try {
        const companyId = req.user?.company_id || req.user?.companyId;
        const userId = req.user?.userId || req.user?.id;
        
        if (!companyId) return res.status(401).json({ error: "Session invalide ou expirée." });

        const { items, header = {}, typeAchat: typeAchatBrut } = req.body;
        const typeAchat = typeAchatBrut ? String(typeAchatBrut).toUpperCase().trim() : '';

        // --- VALIDATIONS ---
        if (!items || items.length === 0) return res.status(400).json({ error: "Le panier est vide." });
        if (!header.fournisseurId || !header.numFacture) return res.status(400).json({ error: "Données fournisseur ou N° Facture manquants." });

        if (typeAchat !== 'CREDIT' && (!header.modeReglement || header.modeReglement.trim() === "")) {
            return res.status(400).json({ error: "Veuillez sélectionner un moyen de règlement." });
        }

        // --- PRÉPARATION DES MONTANTS ---
        let montantFinal = 0;
        const totalFactureTTC = parseFloat(header.totalFacture || header.mtFac) || 0;
        
        switch (typeAchat) {
            case 'ACOMPTE':
                montantFinal = parseFloat(header.montantAvance || header.montantPaye) || 0;
                if (montantFinal <= 0 || montantFinal >= totalFactureTTC) return res.status(400).json({ error: "Montant acompte invalide." });
                break;
            case 'COMPTANT':
                montantFinal = totalFactureTTC;
                break;
            case 'CREDIT':
                montantFinal = 0;
                header.modeReglement = 'CREDIT'; 
                break;
            default:
                return res.status(400).json({ error: "Type d'achat non reconnu." });
        }

        const payloadFinal = {
            header: { ...header, typeAchat, montantAvance: montantFinal, montantPaye: montantFinal, totalFacture: totalFactureTTC },
            items
        };

        // ✅ SERVICE MÉTIER (Transactionnel Cloud)
        const idAchat = await approService.saveApprovisionnement(payloadFinal, req.user);

        // 🔥 COMPTABILITÉ AUTOMATIQUE
        try {
            if (configComptaService?.genererEcritureExplicite) {
                await configComptaService.genererEcritureExplicite('purchases', idAchat, companyId);
            }
        } catch (comptaError) {
            console.error("⚠️ [COMPTA AUTO] :", comptaError.message);
        }

        // 🔥 NOTIFICATIONS TEMPS RÉEL
        if (req.io) {
            const room = String(companyId);
            req.io.to(room).emit('DATA_EVENT', { table: 'purchases', action: 'INSERT' });
            req.io.to(room).emit('DATA_EVENT', { table: 'products', action: 'UPDATE' });
            req.io.to(room).emit('STOCK_UPDATED');
            req.io.to(String(userId)).emit('PURCHASE_SUCCESS_SYNC', { idAchat });
        }

        return res.status(201).json({ success: true, id_achat: idAchat, message: "Approvisionnement enregistré." });
    } catch (error) {
        console.error("❌ Erreur saveApprovisionnement:", error.message);
        return res.status(500).json({ error: error.message });
    }
};

const getAllPurchases = async (req, res) => {
    try {
        const companyId = req.user?.company_id || req.user?.companyId;
        const rows = await approService.getAllPurchases(companyId);

        const formattedRows = rows.map(row => row.qte_achetee !== undefined ? {
            ...row,
            qte_achetee_formatee: conversestock.formaterStockPourAffichage(
                row.qte_achetee, row.unite_coefficient || row.coefficient || 1,
                row.unite_code || row.unit_code_gros || 'CS', row.unite_reference || row.unit_ref_detail || 'BTL'
            )
        } : row);

        return res.json(formattedRows);
    } catch (error) {
        console.error("Erreur getAllPurchases:", error);
        return res.status(500).json({ error: error.message });
    }
};

const getTemporaryPurchase = async (req, res) => {
    try {
        const userId = req.user?.userId || req.user?.id;
        const companyId = req.user?.companyId || req.user?.company_id;
        const items = await approService.getTemporaryCart(userId, companyId);
        return res.json({ items });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

const syncTemporaryPurchase = async (req, res) => {
    try {
        const userId = req.user?.userId || req.user?.id;
        const companyId = req.user?.companyId || req.user?.company_id;
        await approService.syncTemporaryCart(req.body.items, userId, companyId);
        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

const deleteTemporaryPurchase = async (req, res) => {
    try {
        const userId = req.user?.userId || req.user?.id;
        const companyId = req.user?.companyId || req.user?.company_id;
        await approService.clearTemporaryCart(userId, companyId);
        return res.json({ success: true, message: "Panier temporaire vidé." });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

const traiterActionLigne = async (req, res) => {
    try {
        const companyId = req.user?.company_id || req.user?.companyId;
        const { itemId } = req.params;
        const { action: actionBrute, qte, observation } = req.body; 

        if (!itemId) return res.status(400).json({ error: "ID de ligne manquant." });

        const action = actionBrute ? String(actionBrute).toUpperCase().trim() : '';
        let result;

        if (action === 'ANNULER') {
            result = await annulRetourService.annulerLigneAchat(itemId, req.user, observation || "Annulation");
        } else if (action === 'RETOUR') {
            if (!qte && qte !== 0) return res.status(400).json({ error: "Quantité obligatoire." });
            result = await annulRetourService.retournerLigneAchat(itemId, req.user, qte, observation || "");
        } else {
            return res.status(400).json({ error: "Action non reconnue." });
        }

        try {
            await configComptaService.genererEcritureExplicite(action === 'ANNULER' ? 'purchase_line_cancel' : 'purchase_line_return', itemId, companyId);
        } catch (e) { console.error("⚠️ [COMPTA] :", e.message); }

        let messageAffichage = result.message;
        if (result?.qte_mouvementee !== undefined && result?.coefficient) {
            const qteTexte = conversestock.formaterStockPourAffichage(result.qte_mouvementee, result.coefficient, result.unit_code_gros || 'CS', result.unit_ref_detail || 'BTL');
            messageAffichage = `${action === 'ANNULER' ? 'Annulation' : 'Retour'} validé pour : ${qteTexte}.`;
        }

        if (req.io) {
            const room = String(companyId);
            req.io.to(room).emit('STOCK_UPDATED');
            req.io.to(room).emit('DATA_EVENT', { table: 'purchases', action: 'UPDATE' });
        }

        return res.json({ success: true, message: messageAffichage });
    } catch (error) {
        console.error("❌ Erreur traiterActionLigne:", error.message);
        return res.status(500).json({ error: error.message });
    }
};

const archivePurchase = async (req, res) => {
    try {
        const { id } = req.params;
        const companyId = req.user?.company_id || req.user?.companyId;
        await approService.archivePurchase(id, companyId, { secureUserId: req.user?.userId || req.user?.id, userName: req.user?.username });

        if (req.io) req.io.to(String(companyId)).emit('DATA_EVENT', { table: 'purchases', action: 'ARCHIVE' });
        return res.json({ success: true, message: "Archivé." });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};

const getArchivedPurchases = async (req, res) => {
    try {
        const companyId = req.user?.company_id || req.user?.companyId;
        const rows = await approService.getArchivedPurchases(companyId);
        return res.json(rows);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};

const getDebts = async (req, res) => {
    try {
        const companyId = req.user?.company_id || req.user?.companyId;
        const debts = await approService.getSupplierDebts(companyId);
        return res.json({ success: true, data: debts });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};

const postPayment = async (req, res) => {
    try {
        const companyId = req.user?.company_id || req.user?.companyId;
        const result = await approService.recordDebtPayment(req.body, req.user);
        
        try {
            await configComptaService.genererEcritureExplicite('purchase_payments', result.payId, companyId);
        } catch (e) { console.error("⚠️ [COMPTA] :", e.message); }

        if (req.io) {
            req.io.to(String(companyId)).emit('DATA_EVENT', { table: 'purchases', action: 'UPDATE' });
        }
        return res.json({ success: true, payId: result.payId });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};

module.exports = { 
    saveApprovisionnement, getAllPurchases, traiterActionLigne, getTemporaryPurchase,
    archivePurchase, getArchivedPurchases, archiveLot: async (req, res) => {
        try {
            await approService.archiveLot(req.params.lotId, req.user?.companyId, { secureUserId: req.user?.id });
            res.json({ success: true });
        } catch(e) { res.status(500).json({ error: e.message }); }
    }, 
    getDebts, postPayment, getSoldHistory: async (req, res) => {
        try {
            const data = await approService.getSoldPurchases(req.user?.companyId);
            res.json({ success: true, data });
        } catch(e) { res.status(500).json({ error: e.message }); }
    }, syncTemporaryPurchase, clearTemporaryPurchase: deleteTemporaryPurchase 
};