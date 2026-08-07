const RanService = require('../services/ran.service');
const { getDb } = require('../config/database');

// Utilitaire de contexte harmonisé
const getContext = (req) => {
    const user = req.user || {};
    const companyId = user.companyId || user.company_id;
    return {
        companyId: companyId,
        userId: user.userId || user.id,
        userName: user.username || 'Utilisateur'
    };
};

// --- GÉNÉRER LE REPORT A NOUVEAU ---
exports.genererRAN = async (req, res) => {
    const context = getContext(req);
    try {
        if (!context.companyId) return res.status(401).json({ error: "Session invalide." });

        // On adapte l'objet user pour le service
        const userForService = {
            companyId: context.companyId,
            userId: context.userId,
            username: context.userName
        };
        
        await RanService.genererRAN(req.body, userForService);

        // 🔥 NOTIFICATIONS SOCKET.IO
        if (req.io) {
            const room = String(context.companyId);
            
            // 1. Signal universel (Le RAN génère des lignes d'écritures)
            req.io.to(room).emit('DATA_EVENT', { 
                table: 'journal_entries', 
                action: 'INSERT_RAN',
                exercice_cible: req.body.exercice_cible_id 
            });

            // 2. Signal spécifique UI
            req.io.to(room).emit('REFRESH_RAN', { 
                message: "Les Reports à Nouveau ont été générés." 
            });
            
            // Optionnel : Rafraîchir aussi la liste des exercices car leur état peut changer
            req.io.to(room).emit('REFRESH_EXERCICES');
        }

        res.json({ success: true });
    } catch (err) {
        console.error("❌ ERREUR RAN:", err.message);
        res.status(500).json({ error: err.message });
    }
};

// --- OBTENIR LES RAPPORTS GÉNÉRÉS ---
exports.getReportsByExercice = (req, res) => {
    const db = getDb();
    const { companyId } = getContext(req);
    const { exerciceId } = req.params;

    try {
        const data = db.prepare(`
            SELECT r.*, p.intitule as intitule_compte
            FROM reports_a_nouveau r
            JOIN plan_comptable p ON r.compte_id = p.id
            WHERE r.exercice_id = ? AND r.company_id = ?
            ORDER BY r.num_compte ASC, r.num_tiers ASC
        `).all(exerciceId, companyId);
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// --- RÉCUPÉRER LE BILAN DÉTAILLÉ (AVANT CLÔTURE) ---
exports.getBilanDetailleTiers = async (req, res) => {
    const { companyId } = getContext(req);
    const { exerciceId } = req.query;
    try {
        const data = RanService.getBilanTiersData(exerciceId, companyId);
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};