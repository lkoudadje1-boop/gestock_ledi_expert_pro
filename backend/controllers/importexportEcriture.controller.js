const ieService = require('../services/importexportEcriture.service');

// Utilitaire interne harmonisé
const getContext = (req) => {
    const user = req.user || {};
    const companyId = user.companyId || user.company_id;
    return {
        companyId: companyId,
        userId: user.userId || user.id,
        userName: user.username || 'Utilisateur'
    };
};

// ==========================================
// --- 1. EXPORT MASSIF ---
// ==========================================
exports.exportMassif = (req, res) => {
    const { companyId } = getContext(req);
    if (!companyId) return res.status(401).json({ error: "Session invalide" });
    
    try {
        const data = ieService.getExportData(req.query, companyId);
        
        // ... (ton code de génération CSV ici) ...
        
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=EXPORT_COMPTA_${Date.now()}.csv`);
        
        // Supposons que ta variable CSV est générée au-dessus
        // return res.status(200).send("\ufeff" + csv); 
    } catch (err) { 
        console.error("Erreur Export:", err.message);
        res.status(500).json({ error: err.message }); 
    }
};

// ==========================================
// --- 2. IMPORT MASSIF ---
// ==========================================
exports.importMassif = (req, res) => {
    const context = getContext(req);
    const { exercice_id } = req.body;

    if (!context.companyId) return res.status(401).json({ error: "Non autorisé" });
    if (!req.file) return res.status(400).json({ error: "Aucun fichier reçu." });
    if (!exercice_id) return res.status(400).json({ error: "ID de l'exercice manquant." });

    try {
        // Exécution de l'import via le service
        ieService.processMassiveImport(req.file.buffer, exercice_id, context.companyId);

        // 🔥 NOTIFICATIONS SOCKET.IO
        if (req.io) {
            const room = String(context.companyId);

            // 1. SIGNAL UNIVERSEL : On notifie que la table des écritures a changé massivement
            req.io.to(room).emit('DATA_EVENT', { 
                table: 'journal_entries', 
                action: 'IMPORT_MASSIVE',
                exercice_id: exercice_id
            });

            // 2. SIGNAL UI : On demande aux écrans de compta de se rafraîchir
            req.io.to(room).emit('REFRESH_UI', { 
                url: '/api/plan-comptable/ecritures',
                message: "Importation massive d'écritures terminée" 
            });
            
            // Facultatif : si tu as un événement spécifique pour les journaux
            req.io.to(room).emit('REFRESH_JOURNAL_ENTRIES', { action: 'IMPORT' });
        }

        res.json({ success: true, message: "Importation réussie !" });

    } catch (err) {
        console.error("Erreur import massif:", err.message);
        res.status(400).json({ error: err.message });
    }
};