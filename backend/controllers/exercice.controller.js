// backend/controllers/exercice.controller.js
const exerciceService = require('../services/exercice.service');

// Utilitaire pour extraire le contexte de manière sécurisée
const getContext = (req) => {
    const user = req.user || {};
    const companyId = user.companyId || user.company_id;
    const userId = user.userId || user.id;

    if (!companyId) {
        console.error("❌ Erreur Contexte : companyId manquant dans req.user", user);
    }

    return {
        companyId: companyId,
        userId: userId,
        userName: 'user' // Respect strict de la consigne [2026-02-08]
    };
};

// 1. Récupérer tous les exercices
exports.getExercices = async (req, res) => {
    try {
        const { companyId } = getContext(req);
        if (!companyId) return res.status(401).json({ success: false, error: "Session invalide ou companyId manquant." });

        const data = await exerciceService.getAll(companyId);
        return res.json({ success: true, data: data });
    } catch (err) {
        console.error("❌ Erreur getExercices:", err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
};

// 2. Créer un exercice
exports.creerExercice = async (req, res) => {
    try {
        const context = getContext(req);
        if (!context.companyId) throw new Error("Identification de l'entreprise manquante.");

        const id = await exerciceService.create(req.body, context);

        if (req.io) {
            const room = context.companyId.toString();
            // 🔥 SIGNAL SNC UNIVERSEL
            req.io.to(room).emit('DATA_EVENT', { 
                table: 'exercises', 
                action: 'INSERT' 
            });
            // Compatibilité
            req.io.to(room).emit('REFRESH_EXERCICES', {
                action: 'CREATE',
                message: `Nouvel exercice ouvert : ${req.body.libelle}`
            });
        }

        return res.json({ success: true, message: "Exercice créé avec succès.", id });
    } catch (err) {
        return res.status(400).json({ success: false, error: err.message });
    }
};

// 3. Mettre à jour le statut (Ouvert/Clôturé)
exports.updateStatut = async (req, res) => {
    try {
        const context = getContext(req);
        await exerciceService.updateStatus(req.params.id, req.body.statut, context);

        if (req.io && context.companyId) {
            const room = context.companyId.toString();
            // 🔥 SIGNAL SNC UNIVERSEL
            req.io.to(room).emit('DATA_EVENT', { 
                table: 'exercises', 
                action: 'STATUS_CHANGE', 
                id: req.params.id 
            });
            // Compatibilité
            req.io.to(room).emit('REFRESH_EXERCICES', {
                action: 'UPDATE_STATUS',
                statut: req.body.statut,
                message: `Statut mis à jour : ${req.body.statut}`
            });
        }

        return res.json({ success: true, message: `Exercice passé en statut ${req.body.statut}` });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// 4. Modifier les dates ou libellés
exports.modifierExercice = async (req, res) => {
    try {
        const { companyId } = getContext(req);
        await exerciceService.update(req.params.id, req.body, companyId);
        
        if (req.io && companyId) {
            req.io.to(companyId.toString()).emit('DATA_EVENT', { table: 'exercises', action: 'UPDATE' });
        }
        
        return res.json({ success: true, message: "Exercice mis à jour." });
    } catch (err) {
        return res.status(400).json({ success: false, error: err.message });
    }
};

// 5. Supprimer
exports.supprimerExercice = async (req, res) => {
    try {
        const { companyId } = getContext(req);
        await exerciceService.remove(req.params.id, companyId);

        if (req.io && companyId) {
            req.io.to(companyId.toString()).emit('DATA_EVENT', { table: 'exercises', action: 'DELETE' });
        }

        return res.json({ success: true, message: "Exercice supprimé." });
    } catch (err) {
        return res.status(400).json({ success: false, error: err.message });
    }
};