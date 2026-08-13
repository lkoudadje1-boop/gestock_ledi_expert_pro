// backend/controllers/PlanTiers.Controller.js
const PlanTiersService = require('../services/PlanTiers.service');
const { CloudPlanTiers } = require('../models/cloud.model');

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

const PlanTiersController = {
    getAll: async (req, res) => {
        try {
            const { companyId } = getContext(req);
            if (!companyId) return res.status(401).json({ success: false, error: "Session invalide." });

            const { type } = req.query;
            const result = await PlanTiersService.getAllData(type, companyId);
            res.json({ success: true, data: result.tiersEnregistres, available: result.disponibles });
        } catch (err) {
            console.error("❌ Erreur getAll PlanTiers:", err.message);
            res.status(500).json({ success: false, error: err.message });
        }
    },

    getSuggestion: async (req, res) => {
        try {
            const { companyId } = getContext(req);
            const { nom, collectifId } = req.query;
            if (!nom || !collectifId) return res.json({ success: true, suggestion: "" });

            const suggestion = await PlanTiersService.getSuggestionNum(nom, collectifId, companyId);
            res.json({ success: true, suggestion });
        } catch (err) {
            console.error("❌ Erreur getSuggestion PlanTiers:", err.message);
            res.status(500).json({ success: false, error: err.message });
        }
    },

    create: async (req, res) => {
        const context = getContext(req);
        try {
            await PlanTiersService.createTier(req.body, req.user);

            if (req.io && context.companyId) {
                const room = String(context.companyId);
                // 🔥 SIGNAL UNIVERSEL (Utilisé par tous les composants)
                req.io.to(room).emit('DATA_EVENT', { 
                    table: 'plan_tiers', 
                    action: 'INSERT' 
                });
                // Compatibilité spécifique
                req.io.to(room).emit('REFRESH_PLAN_TIERS', { action: 'CREATE' });
            }
            res.json({ success: true, message: "Compte tiers créé et synchronisé" });
        } catch (err) {
            console.error("❌ Erreur create PlanTiers:", err.message);
            res.status(500).json({ success: false, error: err.message });
        }
    },

    update: async (req, res) => {
        const context = getContext(req);
        try {
            const { id } = req.params;
            await PlanTiersService.updateTier(id, req.body, req.user);

            if (req.io && context.companyId) {
                const room = String(context.companyId);
                req.io.to(room).emit('DATA_EVENT', { 
                    table: 'plan_tiers', 
                    action: 'UPDATE', 
                    id 
                });
                req.io.to(room).emit('REFRESH_PLAN_TIERS', { action: 'UPDATE' });
            }

            res.json({ success: true, message: "Tiers mis à jour avec succès" });
        } catch (err) {
            console.error("❌ Erreur update PlanTiers:", err.message);
            res.status(500).json({ success: false, error: err.message });
        }
    },

    delete: async (req, res) => {
        const context = getContext(req);
        try {
            const { id } = req.params;
            await PlanTiersService.deleteTier(id, req.user);

            if (req.io && context.companyId) {
                const room = String(context.companyId);
                req.io.to(room).emit('DATA_EVENT', { 
                    table: 'plan_tiers', 
                    action: 'DELETE', 
                    id 
                });
                req.io.to(room).emit('REFRESH_PLAN_TIERS', { action: 'DELETE' });
            }

            res.json({ success: true, message: "Lien supprimé localement et sur le Cloud" });
        } catch (err) {
            console.error("❌ Erreur delete PlanTiers:", err.message);
            res.status(500).json({ success: false, error: err.message });
        }
    },

    importTiers: async (req, res) => {
        const context = getContext(req);
        if (!req.file) return res.status(400).json({ error: "Fichier CSV manquant." });
        
        try {
            const csvRaw = req.file.buffer.toString('utf8').replace(/^\ufeff/, '');
            const lignes = csvRaw.split(/\r?\n/).filter(l => l.trim() !== "");
            
            const rawTiers = lignes.slice(1).map(ligne => {
                const cols = ligne.split(';').map(c => c.trim().replace(/^"|"$/g, ''));
                return {
                    num: cols[0], nom: cols[1],
                    type: cols[2] ? cols[2].toUpperCase() : 'CLIENT',
                    delai: parseInt(cols[3]) || 0,
                    numCollectif: cols[4]
                };
            }).filter(t => t.num && t.nom);

            const tiersData = Array.from(new Map(rawTiers.map(item => [item.num, item])).values());
            await PlanTiersService.importMassive(tiersData, req.user);

            // 🔥 SIGNAL IMPORT MASSIF
            if (req.io && context.companyId) {
                const room = String(context.companyId);
                req.io.to(room).emit('DATA_EVENT', { table: 'plan_tiers', action: 'IMPORT' });
                req.io.to(room).emit('REFRESH_PLAN_TIERS', { action: 'IMPORT' });
            }

            res.json({ success: true, message: `${tiersData.length} tiers importés avec succès.` });
        } catch (err) {
            console.error("❌ Erreur importTiers:", err.message);
            res.status(500).json({ success: false, error: err.message });
        }
    },

    exportTiers: async (req, res) => {
        const { companyId } = getContext(req);
        try {
            const data = await CloudPlanTiers.aggregate([
                { $match: { company_id: companyId.toString() } },
                {
                    $lookup: {
                        from: 'cloud_plan_comptable',
                        localField: 'compte_collectif_id',
                        foreignField: 'localId',
                        as: 'comptable'
                    }
                },
                { $unwind: { path: '$comptable', preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        numero_tiers: 1,
                        nom: 1,
                        type_tiers: 1,
                        delai_paiement: 1,
                        collectif: '$comptable.numero_compte',
                        _id: 0
                    }
                },
                { $sort: { numero_tiers: 1 } }
            ]);

            const SEP = ";", NL = "\r\n", BOM = "\ufeff";
            let csv = `Numero_Tiers${SEP}Nom_Raison_Sociale${SEP}Type${SEP}Delai_Paiement${SEP}Compte_Collectif${NL}`;

            data.forEach(row => {
                const nomEscaped = `"${(row.nom || "").replace(/"/g, '""')}"`;
                csv += `${row.numero_tiers}${SEP}${nomEscaped}${SEP}${row.type_tiers}${SEP}${row.delai_paiement || 0}${SEP}${row.collectif || ""}${NL}`;
            });

            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', 'attachment; filename=PlanTiers.csv');
            return res.status(200).send(BOM + csv);
        } catch (err) {
            console.error("❌ Erreur exportTiers:", err.message);
            return res.status(500).send("Erreur lors de l'exportation.");
        }
    }
};

module.exports = PlanTiersController;