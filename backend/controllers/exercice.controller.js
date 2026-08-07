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
        userName: user.username || user.userName || 'utilisateur'
    };
};

// 1. Récupérer tous les exercices
exports.getExercices = (req, res) => {
    try {
        const { companyId } = getContext(req);
        if (!companyId) return res.status(401).json({ success: false, error: "Session invalide ou companyId manquant." });

        const data = exerciceService.getAll(companyId);
        // On renvoie directement data si c'est déjà un tableau, ou data.data selon ton service
        res.json({ success: true, data: data });
    } catch (err) {
        console.error("❌ Erreur getExercices:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

// 2. Créer un exercice
exports.creerExercice = (req, res) => {
    try {
        const context = getContext(req);
        if (!context.companyId) throw new Error("Identification de l'entreprise manquante.");

        const id = exerciceService.create(req.body, context);

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

        res.json({ success: true, message: "Exercice créé avec succès.", id });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// 3. Mettre à jour le statut (Ouvert/Clôturé)
exports.updateStatut = (req, res) => {
    try {
        const context = getContext(req);
        exerciceService.updateStatus(req.params.id, req.body.statut, context);

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

        res.json({ success: true, message: `Exercice passé en statut ${req.body.statut}` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// 4. Modifier les dates ou libellés
exports.modifierExercice = (req, res) => {
    try {
        const { companyId } = getContext(req);
        exerciceService.update(req.params.id, req.body, companyId);
        
        if (req.io && companyId) {
            req.io.to(companyId.toString()).emit('DATA_EVENT', { table: 'exercises', action: 'UPDATE' });
        }
        
        res.json({ success: true, message: "Exercice mis à jour." });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// 5. Supprimer
exports.supprimerExercice = (req, res) => {
    try {
        const { companyId } = getContext(req);
        exerciceService.remove(req.params.id, companyId);

        if (req.io && companyId) {
            req.io.to(companyId.toString()).emit('DATA_EVENT', { table: 'exercises', action: 'DELETE' });
        }

        res.json({ success: true, message: "Exercice supprimé." });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};