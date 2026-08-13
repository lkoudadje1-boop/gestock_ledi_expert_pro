// backend/controllers/ran.controller.js
const RanService = require('../services/ran.service');
const { CloudReportANouveau } = require('../models/cloud.model');

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
            
            // Rafraîchir aussi la liste des exercices car leur état peut changer
            req.io.to(room).emit('REFRESH_EXERCICES');
        }

        res.json({ success: true });
    } catch (err) {
        console.error("❌ ERREUR RAN:", err.message);
        res.status(500).json({ error: err.message });
    }
};

// --- OBTENIR LES RAPPORTS GÉNÉRÉS ---
exports.getReportsByExercice = async (req, res) => {
    const { companyId } = getContext(req);
    const { exerciceId } = req.params;

    try {
        if (!companyId) return res.status(401).json({ success: false, error: "Session invalide." });

        const data = await CloudReportANouveau.aggregate([
            { 
                $match: { 
                    exercice_id: exerciceId.toString(), 
                    company_id: companyId.toString() 
                } 
            },
            {
                $lookup: {
                    from: 'cloud_plan_comptable',
                    localField: 'compte_id',
                    foreignField: 'localId',
                    as: 'comptable'
                }
            },
            { $unwind: { path: '$comptable', preserveNullAndEmptyArrays: true } },
            {
                $addFields: {
                    intitule_compte: '$comptable.intitule'
                }
            },
            { $sort: { num_compte: 1, num_tiers: 1 } }
        ]);

        res.json({ success: true, data });
    } catch (err) {
        console.error("❌ Erreur getReportsByExercice:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

// --- RÉCUPÉRER LE BILAN DÉTAILLÉ (AVANT CLÔTURE) ---
exports.getBilanDetailleTiers = async (req, res) => {
    const { companyId } = getContext(req);
    const { exerciceId } = req.query;
    try {
        if (!companyId) return res.status(401).json({ success: false, error: "Session invalide." });

        const data = await RanService.getBilanTiersData(exerciceId, companyId);
        res.json({ success: true, data });
    } catch (err) {
        console.error("❌ Erreur getBilanDetailleTiers:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};