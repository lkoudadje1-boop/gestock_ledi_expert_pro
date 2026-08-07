const consignationService = require('../services/consignation.services');

// --- ENREGISTRER UNE CONSIGNATION ---
// --- ENREGISTRER UNE CONSIGNATION ---
exports.createConsignation = (req, res) => {
    try {
        const companyId = req.user?.companyId || req.user?.company_id;
        const userId = req.user?.userId || req.user?.id;

        if (!companyId) return res.status(401).json({ error: "Identifiant entreprise manquant." });

        // 🔄 AJOUT DES PROPRIÉTÉS MANQUANTES EXTRAITES DU BODY
        const { tiers_id, client_nom, sale_id, items, montant_total, type_garantie, montant_recu, garantie_libelle } = req.body;

        const cleanedData = {
            tiers_id: (tiers_id && tiers_id.toString().trim() !== "") ? tiers_id.toString().trim() : null,
            client_nom: client_nom || "CLIENT AU COMPTANT",
            sale_id: (sale_id && sale_id.toString().trim() !== "") ? sale_id.toString().trim() : null,
            items: items || [],
            montant_total: parseFloat(montant_total) || 0,
            
            // 🔄 NETTOYAGE ET PASSAGE DES DONNÉES AU SERVICE BACKEND
            type_garantie: type_garantie || 'ESPECES',
            montant_recu: parseFloat(montant_recu) || 0,
            garantie_libelle: (garantie_libelle && garantie_libelle.toString().trim() !== "") ? garantie_libelle.toString().trim() : null
        };

        // On récupère l'ID du flux (entête) renvoyé par le service
        const fluxId = consignationService.createConsignation({
            companyId,
            userId,
            userName: req.user?.username || 'user', 
            data: cleanedData // Transmet maintenant le cleanedData enrichi
        });

        if (req.io && fluxId) {
            const room = companyId.toString();
            // Événement pour synchroniser l'entête
            req.io.to(room).emit('DATA_EVENT', { table: 'flux_emballages', action: 'INSERT', id: fluxId });
            // Événement pour rafraîchir les deux tables côté client si besoin
            req.io.to(room).emit('REFRESH_UI', { module: 'EMBALLAGES_CONSIGNE', action: 'CREATE', fluxId });
        }

        res.status(201).json({ success: true, id: fluxId });
    } catch (err) {
        console.error("❌ Erreur createConsignation:", err);
        res.status(400).json({ error: err.message || "Erreur lors de la création du bordereau de consignation." });
    }
};



// --- ENREGISTRER UN RETOUR (DÉCONSIGNATION) ---
exports.createDeconsignation = (req, res) => {
    try {
        const companyId = req.user?.companyId || req.user?.company_id;
        const userId = req.user?.userId || req.user?.id;

        if (!companyId) return res.status(401).json({ error: "Identifiant entreprise manquant." });

        const id = consignationService.createDeconsignation({
            companyId,
            userId,
            userName: 'user', // Respect de la consigne de normalisation
            data: req.body
        });

        if (req.io) {
            const room = companyId.toString();
            // Utilisation du nom réel de la table pour les événements de données
            req.io.to(room).emit('DATA_EVENT', { table: 'flux_emballages', action: 'INSERT', id });
            req.io.to(room).emit('REFRESH_UI', { module: 'EMBALLAGES_DECONSIGNE', action: 'CREATE' });
        }

        res.status(201).json({ success: true, id });
    } catch (err) {
        console.error("❌ Erreur createDeconsignation:", err);
        res.status(400).json({ error: err.message || "Erreur lors du traitement de retour de l'emballage." });
    }
};

// --- RÉCUPÉRER LES MOUVEMENTS (Depuis la table flux_emballages via le service) ---
exports.getConsignations = (req, res) => {
    try {
        const companyId = req.user?.companyId || req.user?.company_id;
        if (!companyId) return res.status(401).json({ error: "Identifiant entreprise manquant." });

        const { status } = req.query; // Filtre optionnel (?status=en_cours...)
        
        // Le service va exécuter le SELECT sur la table 'flux_emballages'
        const list = consignationService.getConsignations(companyId, status);
        
        res.status(200).json(list);
    } catch (err) {
        console.error("❌ Erreur getConsignations:", err);
        res.status(500).json({ error: "Erreur lors de la récupération des consignations." });
    }
};
// --- MODIFIER UNE CONSIGNATION ---
exports.updateConsignation = (req, res) => {
    try {
        const companyId = req.user?.companyId || req.user?.company_id;
        const userId = req.user?.userId || req.user?.id;
        const { fluxId } = req.params; // On récupère l'ID du flux via l'URL

        if (!companyId) return res.status(401).json({ error: "Identifiant entreprise manquant." });
        if (!fluxId) return res.status(400).json({ error: "ID du flux requis." });

        // Appel du service
        const updatedFluxId = consignationService.updateConsignation({
            companyId,
            userId,
            userName: req.user?.username || 'user',
            fluxId,
            data: req.body
        });

        // Notification WebSocket pour synchronisation temps réel
        if (req.io) {
            const room = companyId.toString();
            req.io.to(room).emit('DATA_EVENT', { table: 'flux_emballages', action: 'UPDATE', id: updatedFluxId });
            req.io.to(room).emit('REFRESH_UI', { module: 'EMBALLAGES_CONSIGNE', action: 'UPDATE', fluxId: updatedFluxId });
        }

        res.status(200).json({ success: true, id: updatedFluxId });
    } catch (err) {
        console.error("❌ Erreur updateConsignation:", err);
        res.status(400).json({ error: err.message || "Erreur lors de la modification de la consignation." });
    }
};
// --- SUPPRIMER UNE CONSIGNATION ---
exports.deleteConsignation = (req, res) => {
    try {
        const companyId = req.user?.companyId || req.user?.company_id;
        const userId = req.user?.userId || req.user?.id;
        const { fluxId } = req.params;

        if (!companyId) return res.status(401).json({ error: "Identifiant entreprise manquant." });
        if (!fluxId) return res.status(400).json({ error: "ID du flux requis." });

        consignationService.deleteConsignation({
            companyId,
            userId,
            userName: req.user?.username || 'user',
            fluxId
        });

        // Notification WebSocket
        if (req.io) {
            const room = companyId.toString();
            req.io.to(room).emit('DATA_EVENT', { table: 'flux_emballages', action: 'DELETE', id: fluxId });
            req.io.to(room).emit('REFRESH_UI', { module: 'EMBALLAGES_CONSIGNE', action: 'DELETE', fluxId });
        }

        res.status(200).json({ success: true, message: "Consignation supprimée avec succès." });
    } catch (err) {
        console.error("❌ Erreur deleteConsignation:", err);
        res.status(400).json({ error: err.message || "Erreur lors de la suppression de la consignation." });
    }
};
// Dans votre consignation.controller.js
exports.getConsignationById = (req, res) => {
    try {
        const companyId = req.user?.companyId || req.user?.company_id;
        const { fluxId } = req.params;

        const data = consignationService.getConsignationById(companyId, fluxId);
        
        if (!data) return res.status(404).json({ error: "Consignation introuvable." });

        res.status(200).json(data);
    } catch (err) {
        res.status(500).json({ error: "Erreur serveur." });
    }
};