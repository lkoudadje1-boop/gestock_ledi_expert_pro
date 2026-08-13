// backend/controllers/consignation.controller.js
const consignationService = require('../services/consignation.services');

// --- ENREGISTRER UNE CONSIGNATION ---
exports.createConsignation = async (req, res) => {
    try {
        const companyId = req.user?.companyId || req.user?.company_id;
        const userId = req.user?.userId || req.user?.id;

        if (!companyId) return res.status(401).json({ error: "Identifiant entreprise manquant." });

        const { tiers_id, client_nom, sale_id, items, montant_total, type_garantie, montant_recu, garantie_libelle } = req.body;

        const cleanedData = {
            tiers_id: (tiers_id && tiers_id.toString().trim() !== "") ? tiers_id.toString().trim() : null,
            client_nom: client_nom || "CLIENT AU COMPTANT",
            sale_id: (sale_id && sale_id.toString().trim() !== "") ? sale_id.toString().trim() : null,
            items: items || [],
            montant_total: parseFloat(montant_total) || 0,
            type_garantie: type_garantie || 'ESPECES',
            montant_recu: parseFloat(montant_recu) || 0,
            garantie_libelle: (garantie_libelle && garantie_libelle.toString().trim() !== "") ? garantie_libelle.toString().trim() : null
        };

        const fluxId = await consignationService.createConsignation({
            companyId,
            userId,
            userName: 'user', // Respect strict consigne [2026-02-08]
            data: cleanedData 
        });

        if (req.io && fluxId) {
            const room = companyId.toString();
            req.io.to(room).emit('DATA_EVENT', { table: 'flux_emballages', action: 'INSERT', id: fluxId });
            req.io.to(room).emit('REFRESH_UI', { module: 'EMBALLAGES_CONSIGNE', action: 'CREATE', fluxId });
        }

        return res.status(201).json({ success: true, id: fluxId });
    } catch (err) {
        console.error("❌ Erreur createConsignation:", err);
        return res.status(400).json({ error: err.message || "Erreur lors de la création du bordereau de consignation." });
    }
};

// --- ENREGISTRER UN RETOUR (DÉCONSIGNATION) ---
exports.createDeconsignation = async (req, res) => {
    try {
        const companyId = req.user?.companyId || req.user?.company_id;
        const userId = req.user?.userId || req.user?.id;

        if (!companyId) return res.status(401).json({ error: "Identifiant entreprise manquant." });

        const id = await consignationService.createDeconsignation({
            companyId,
            userId,
            userName: 'user', 
            data: req.body
        });

        if (req.io) {
            const room = companyId.toString();
            req.io.to(room).emit('DATA_EVENT', { table: 'flux_emballages', action: 'INSERT', id });
            req.io.to(room).emit('REFRESH_UI', { module: 'EMBALLAGES_DECONSIGNE', action: 'CREATE' });
        }

        return res.status(201).json({ success: true, id });
    } catch (err) {
        console.error("❌ Erreur createDeconsignation:", err);
        return res.status(400).json({ error: err.message || "Erreur lors du traitement de retour de l'emballage." });
    }
};

// --- RÉCUPÉRER LES MOUVEMENTS ---
exports.getConsignations = async (req, res) => {
    try {
        const companyId = req.user?.companyId || req.user?.company_id;
        if (!companyId) return res.status(401).json({ error: "Identifiant entreprise manquant." });

        const { status } = req.query; 
        const list = await consignationService.getConsignations(companyId, status);
        
        return res.status(200).json(list);
    } catch (err) {
        console.error("❌ Erreur getConsignations:", err);
        return res.status(500).json({ error: "Erreur lors de la récupération des consignations." });
    }
};

// --- MODIFIER UNE CONSIGNATION ---
exports.updateConsignation = async (req, res) => {
    try {
        const companyId = req.user?.companyId || req.user?.company_id;
        const userId = req.user?.userId || req.user?.id;
        const { fluxId } = req.params; 

        if (!companyId) return res.status(401).json({ error: "Identifiant entreprise manquant." });
        if (!fluxId) return res.status(400).json({ error: "ID du flux requis." });

        const updatedFluxId = await consignationService.updateConsignation({
            companyId,
            userId,
            userName: 'user',
            fluxId,
            data: req.body
        });

        if (req.io) {
            const room = companyId.toString();
            req.io.to(room).emit('DATA_EVENT', { table: 'flux_emballages', action: 'UPDATE', id: updatedFluxId });
            req.io.to(room).emit('REFRESH_UI', { module: 'EMBALLAGES_CONSIGNE', action: 'UPDATE', fluxId: updatedFluxId });
        }

        return res.status(200).json({ success: true, id: updatedFluxId });
    } catch (err) {
        console.error("❌ Erreur updateConsignation:", err);
        return res.status(400).json({ error: err.message || "Erreur lors de la modification de la consignation." });
    }
};

// --- SUPPRIMER UNE CONSIGNATION ---
exports.deleteConsignation = async (req, res) => {
    try {
        const companyId = req.user?.companyId || req.user?.company_id;
        const userId = req.user?.userId || req.user?.id;
        const { fluxId } = req.params;

        if (!companyId) return res.status(401).json({ error: "Identifiant entreprise manquant." });
        if (!fluxId) return res.status(400).json({ error: "ID du flux requis." });

        await consignationService.deleteConsignation({
            companyId,
            userId,
            userName: 'user',
            fluxId
        });

        if (req.io) {
            const room = companyId.toString();
            req.io.to(room).emit('DATA_EVENT', { table: 'flux_emballages', action: 'DELETE', id: fluxId });
            req.io.to(room).emit('REFRESH_UI', { module: 'EMBALLAGES_CONSIGNE', action: 'DELETE', fluxId });
        }

        return res.status(200).json({ success: true, message: "Consignation supprimée avec succès." });
    } catch (err) {
        console.error("❌ Erreur deleteConsignation:", err);
        return res.status(400).json({ error: err.message || "Erreur lors de la suppression de la consignation." });
    }
};

// --- RÉCUPÉRER PAR ID ---
exports.getConsignationById = async (req, res) => {
    try {
        const companyId = req.user?.companyId || req.user?.company_id;
        const { fluxId } = req.params;

        const data = await consignationService.getConsignationById(companyId, fluxId);
        
        if (!data) return res.status(404).json({ error: "Consignation introuvable." });

        return res.status(200).json(data);
    } catch (err) {
        console.error("❌ Erreur getConsignationById:", err);
        return res.status(500).json({ error: "Erreur serveur." });
    }
};