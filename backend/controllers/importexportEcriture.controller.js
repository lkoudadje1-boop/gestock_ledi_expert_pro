// backend/controllers/importexportEcriture.controller.js
const ieService = require('../services/importexportEcriture.service');

// Utilitaire interne harmonisé
const getContext = (req) => {
    const user = req.user || {};
    const companyId = user.companyId || user.company_id;
    return {
        companyId: companyId,
        userId: user.userId || user.id,
        userName: 'user' // Respect strict de la consigne [2026-02-08]
    };
};

// ==========================================
// --- 1. EXPORT MASSIF ---
// ==========================================
exports.exportMassif = async (req, res) => {
    const { companyId } = getContext(req);
    if (!companyId) return res.status(401).json({ error: "Session invalide" });
    
    try {
        const data = await ieService.getExportData(req.query, companyId);
        
        const SEP = ";", NL = "\r\n", BOM = "\ufeff";
        let csv = `DATE${SEP}JOURNAL${SEP}PIECE${SEP}COMPTE${SEP}INTITULE${SEP}LIBELLE${SEP}DEBIT${SEP}CREDIT${NL}`;

        data.forEach(row => {
            const date = row.date_ecriture ? new Date(row.date_ecriture).toISOString().split('T')[0] : '';
            const journal = row.code_journal || row.journal_code || '';
            const piece = row.numero_piece || '';
            const compte = row.numero_compte || '';
            const intitule = `"${(row.intitule_compte || '').replace(/"/g, '""')}"`;
            const libelle = `"${(row.libelle || '').replace(/"/g, '""')}"`;
            const debit = row.debit || 0;
            const credit = row.credit || 0;

            csv += `${date}${SEP}${journal}${SEP}${piece}${SEP}${compte}${SEP}${intitule}${SEP}${libelle}${SEP}${debit}${SEP}${credit}${NL}`;
        });
        
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=EXPORT_COMPTA_${Date.now()}.csv`);
        
        return res.status(200).send(BOM + csv);
    } catch (err) { 
        console.error("Erreur Export:", err.message);
        return res.status(500).json({ error: err.message }); 
    }
};

// ==========================================
// --- 2. IMPORT MASSIF ---
// ==========================================
exports.importMassif = async (req, res) => {
    const context = getContext(req);
    const { exercice_id } = req.body;

    if (!context.companyId) return res.status(401).json({ error: "Non autorisé" });
    if (!req.file) return res.status(400).json({ error: "Aucun fichier reçu." });
    if (!exercice_id) return res.status(400).json({ error: "ID de l'exercice manquant." });

    try {
        await ieService.processMassiveImport(req.file.buffer, exercice_id, context.companyId);

        // 🔥 NOTIFICATIONS SOCKET.IO
        if (req.io) {
            const room = String(context.companyId);

            // 1. SIGNAL UNIVERSEL
            req.io.to(room).emit('DATA_EVENT', { 
                table: 'journal_entries', 
                action: 'IMPORT_MASSIVE',
                exercice_id: exercice_id
            });

            // 2. SIGNAL UI
            req.io.to(room).emit('REFRESH_UI', { 
                url: '/api/plan-comptable/ecritures',
                message: "Importation massive d'écritures terminée" 
            });
            
            req.io.to(room).emit('REFRESH_JOURNAL_ENTRIES', { action: 'IMPORT' });
        }

        return res.json({ success: true, message: "Importation réussie !" });

    } catch (err) {
        console.error("Erreur import massif:", err.message);
        return res.status(400).json({ error: err.message });
    }
};