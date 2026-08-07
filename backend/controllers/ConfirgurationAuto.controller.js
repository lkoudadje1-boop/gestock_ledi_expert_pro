const configService = require('../services/ConfirgurationAuto.service');

// Utilitaire interne harmonisé
const getContext = (req) => {
    const user = req.user || {};
    const companyId = user.companyId || user.company_id;
    const userId = user.userId || user.id;

    return {
        companyId: companyId,
        userId: userId || 'USR-SYSTEM',
        userName: user.username || 'Utilisateur'
    };
};

// ==========================================
// --- 1. ENREGISTRER / MODIFIER UNE RÈGLE ---
// ==========================================
exports.createOrUpdateConfig = async (req, res) => {
    const context = getContext(req);

    if (!context.companyId) {
        return res.status(403).json({ success: false, error: "Session expirée ou entreprise invalide." });
    }

    try {
        const data = { ...req.body, id: req.params.id };
        const final_config_id = await configService.processConfig(data, context);

        // 🔥 Notification Socket.io harmonisée
        if (req.io) {
            const room = String(context.companyId);
            
            // Signal UNIVERSEL pour la synchro
            req.io.to(room).emit('DATA_EVENT', { 
                table: 'analytic_configs', 
                action: req.params.id ? 'UPDATE' : 'INSERT',
                id: final_config_id 
            });

            // Signal UI spécifique
            req.io.to(room).emit('REFRESH_UI', { 
                url: '/api/analytique/repartitions',
                message: "Règles analytiques mises à jour" 
            });
        }

        res.json({ success: true, message: "Configuration enregistrée avec succès !", id: final_config_id });

    } catch (error) {
        console.error("❌ ERREUR ANALYTIQUE_CONFIG :", error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ==========================================
// --- 2. RÉCUPÉRER L'HISTORIQUE ---
// ==========================================
exports.getConfigs = async (req, res) => {
    const { companyId } = getContext(req);
    try {
        const data = await configService.fetchConfigs(companyId);
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// ==========================================
// --- 3. SUPPRIMER UNE RÈGLE ---
// ==========================================
exports.deleteConfig = async (req, res) => {
    const context = getContext(req);
    const { id } = req.params;

    if (!context.companyId) return res.status(403).json({ success: false, error: "Interdit." });

    try {
        await configService.removeConfig(id, context);

        if (req.io) {
            const room = String(context.companyId);
            
            // Signal UNIVERSEL
            req.io.to(room).emit('DATA_EVENT', { 
                table: 'analytic_configs', 
                action: 'DELETE', 
                id: id 
            });

            // Signal UI
            req.io.to(room).emit('REFRESH_UI', { url: '/api/analytique/repartitions' });
        }

        res.json({ success: true, message: "Règle supprimée avec succès." });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// ==========================================
// --- 4. MOTEUR DE VENTILATION AUTO ---
// ==========================================
exports.getAutomaticVentilation = async (req, res) => {
    const { companyId } = getContext(req);
    const { compte_id, montant } = req.query; 

    try {
        const montantGlobal = parseFloat(montant);
        if (!compte_id || isNaN(montantGlobal)) {
            return res.status(400).json({ success: false, error: "Données invalides." });
        }

        const allConfigs = await configService.fetchConfigs(companyId);

        const rule = allConfigs.find(c => 
            String(c.compte_general_id) === String(compte_id) || 
            String(c.compte_num) === String(compte_id) ||
            String(c.id) === String(compte_id)
        );

        if (!rule || rule.mode_saisie !== 'AUTO') {
            return res.json({ success: true, canAutoVentilate: false });
        }

        const repartitions = [];
        for (const [anaId, pourcentage] of Object.entries(rule.repartitions)) {
            const montantLigne = Math.round((montantGlobal * (parseFloat(pourcentage) / 100)) * 100) / 100;
            
            repartitions.push({
                plan_analytique_id: anaId,
                libelle: rule.details_plans[anaId]?.libelle || 'Analytique',
                montant: montantLigne,
                pourcentage: pourcentage
            });
        }

        return res.json({ 
            success: true, 
            canAutoVentilate: true, 
            repartitions 
        });

    } catch (error) {
        console.error("Erreur moteur ventilation:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};