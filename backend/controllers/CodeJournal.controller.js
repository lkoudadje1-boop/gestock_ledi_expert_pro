// backend/controllers/CodeJournal.controller.js
const journalService = require('../services/CodeJournal.service');
const { CloudJournal } = require('../models/cloud.model');

// Utilitaire de contexte harmonisé
const getContext = (req) => {
    const user = req.user || {};
    const companyId = user.companyId || user.company_id;
    const userId = user.userId || user.id;

    if (!companyId) {
        console.error("❌ Erreur Contexte Journal : companyId manquant", user);
    }

    return {
        companyId: companyId,
        userId: userId,
        userName: user.username || user.userName || 'user' // Respect consigne [2026-02-08]
    };
};

// 1. Récupérer tous les journaux
exports.getJournaux = async (req, res) => {
    try {
        const { companyId } = getContext(req);
        if (!companyId) return res.status(401).json({ success: false, error: "Session invalide." });

        const journaux = await journalService.findAllJournaux(companyId);
        return res.json({ success: true, data: journaux });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// 2. Créer un journal
exports.creerJournal = async (req, res) => {
    try {
        const context = getContext(req);
        if (!context.companyId) throw new Error("Identification entreprise manquante.");
        
        if (!req.body.code || !req.body.libelle || !req.body.type_journal) {
            return res.status(400).json({ error: "Champs obligatoires manquants." });
        }
        
        await journalService.createJournal(req.body, context);

        if (req.io) {
            const room = context.companyId.toString();
            // 🔥 SIGNAL UNIVERSEL
            req.io.to(room).emit('DATA_EVENT', { table: 'journals', action: 'INSERT' });
            // Compatibilité Front
            req.io.to(room).emit('REFRESH_JOURNAUX', { action: 'CREATE' });
        }

        return res.json({ success: true, message: "Journal créé avec succès." });
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }
};

// 3. Modifier un journal
exports.modifierJournal = async (req, res) => {
    try {
        const context = getContext(req);
        await journalService.updateJournal(req.params.id, req.body, context);

        if (req.io && context.companyId) {
            const room = context.companyId.toString();
            // 🔥 SIGNAL UNIVERSEL
            req.io.to(room).emit('DATA_EVENT', { table: 'journals', action: 'UPDATE', id: req.params.id });
            // Compatibilité Front
            req.io.to(room).emit('REFRESH_JOURNAUX', { action: 'UPDATE', id: req.params.id });
        }

        return res.json({ success: true, message: "Journal mis à jour avec succès." });
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }
};

// 4. Supprimer un journal
exports.supprimerJournal = async (req, res) => {
    try {
        const { companyId } = getContext(req);
        await journalService.deleteJournal(req.params.id, companyId);

        if (req.io && companyId) {
            const room = companyId.toString();
            // 🔥 SIGNAL UNIVERSEL
            req.io.to(room).emit('DATA_EVENT', { table: 'journals', action: 'DELETE', id: req.params.id });
            // Compatibilité Front
            req.io.to(room).emit('REFRESH_JOURNAUX', { action: 'DELETE', id: req.params.id });
        }

        return res.json({ success: true, message: "Journal supprimé." });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

// 5. Import Batch
exports.importJournaux = async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Fichier CSV manquant." });

    try {
        const context = getContext(req);
        const csvRaw = req.file.buffer.toString('utf8').replace(/^\ufeff/, '');
        const lignes = csvRaw.split(/\r?\n/).filter(l => l.trim() !== "");
        
        const rawData = lignes.slice(1).map(ligne => {
            const cols = ligne.split(';').map(c => c.trim().replace(/^"|"$/g, ''));
            return {
                code: cols[0]?.toUpperCase(),
                libelle: cols[1],
                type: cols[2]?.toUpperCase() || 'GENERAL',
                modeNum: cols[3]?.toUpperCase() || 'AUTO',
                contrepartie: parseInt(cols[4] || 0, 10)
            };
        }).filter(j => j.code && j.libelle);

        const uniqueData = Array.from(new Map(rawData.map(item => [item.code, item])).values());
        
        await journalService.importJournauxBatch(uniqueData, context);

        if (req.io && context.companyId) {
            const room = context.companyId.toString();
            req.io.to(room).emit('DATA_EVENT', { table: 'journals', action: 'IMPORT' });
            req.io.to(room).emit('REFRESH_JOURNAUX', { action: 'IMPORT' });
        }

        return res.json({ success: true, message: `${uniqueData.length} journaux importés/mis à jour.` });
    } catch (err) {
        return res.status(500).json({ success: false, error: "Erreur import : " + err.message });
    }
};

exports.exportJournaux = async (req, res) => {
    try {
        const { companyId } = getContext(req);
        const data = await CloudJournal.find({ company_id: companyId.toString() }).sort({ code: 1 }).lean();

        const SEP = ";", NL = "\r\n", BOM = "\ufeff";
        let csv = `Code${SEP}Libelle${SEP}Type${SEP}Numerotation${SEP}Contrepartie_Auto${NL}`;

        data.forEach(row => {
            const lib = `"${(row.libelle || "").replace(/"/g, '""')}"`;
            csv += `${row.code}${SEP}${lib}${SEP}${row.type_journal}${SEP}${row.mode_numerotation}${SEP}${row.contrepartie_auto}${NL}`;
        });

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=Codes_Journaux.csv');
        return res.status(200).send(BOM + csv);
    } catch (err) {
        return res.status(500).json({ success: false, error: "Erreur export : " + err.message });
    }
};