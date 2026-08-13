// backend/controllers/PlanAnalytique.controller.js
const planService = require('../services/PlanAnalytique.service');

// Utilitaire de contexte harmonisé
const getContext = (req) => {
    const user = req.user || {};
    const companyId = user.companyId || user.company_id;
    return {
        companyId: companyId,
        userId: user.id || user.userId || 'USR-SYSTEM',
        userName: user.username || 'utilisateur'
    };
};

// Utilitaire pour émettre les signaux Socket de manière centralisée
const emitPlanEvent = (req, table, action, id = null) => {
    const { companyId } = getContext(req);
    if (req.io && companyId) {
        const room = String(companyId);
        // Signal universel pour la synchronisation Cloud/Local
        req.io.to(room).emit('DATA_EVENT', { table, action, id });
        // Signal UI spécifique pour rafraîchir les composants React
        req.io.to(room).emit('REFRESH_PLAN_ANALYTIQUE', { table, action });
    }
};

// ==========================================
// --- 1. GRANDS CENTRES (DEPARTEMENTS) ---
// ==========================================

exports.getDepartements = async (req, res) => {
    try {
        const { companyId } = getContext(req);
        if (!companyId) return res.status(401).json({ success: false, error: "Session invalide." });
        const rows = await planService.getDepartements(companyId);
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error("❌ Erreur getDepartements:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.createDepartement = async (req, res) => {
    try {
        const context = getContext(req);
        if (!context.companyId) return res.status(401).json({ success: false, error: "Identification entreprise manquante." });
        const id = await planService.createDepartement(req.body, context);
        
        emitPlanEvent(req, 'analytic_departments', 'INSERT', id);
        
        res.json({ success: true, message: "Grand Centre créé avec succès.", id });
    } catch (err) { 
        console.error("❌ Erreur createDepartement:", err.message);
        res.status(400).json({ success: false, error: err.message }); 
    }
};

exports.modifierDepartement = async (req, res) => {
    try {
        const context = getContext(req);
        await planService.modifierDepartement(req.params.id, req.body, context);
        
        emitPlanEvent(req, 'analytic_departments', 'UPDATE', req.params.id);
        
        res.json({ success: true, message: "Grand Centre mis à jour." });
    } catch (err) { 
        console.error("❌ Erreur modifierDepartement:", err.message);
        res.status(400).json({ success: false, error: err.message }); 
    }
};

exports.supprimerDepartement = async (req, res) => {
    try {
        const context = getContext(req);
        await planService.supprimerDepartement(req.params.id, context);
        
        emitPlanEvent(req, 'analytic_departments', 'DELETE', req.params.id);
        
        res.json({ success: true, message: "Grand Centre archivé." });
    } catch (err) { 
        console.error("❌ Erreur supprimerDepartement:", err.message);
        res.status(500).json({ success: false, error: err.message }); 
    }
};

// ==========================================
// --- 2. SUBDIVISIONS (PLAN ANALYTIQUE) ---
// ==========================================

exports.getPlanAnalytique = async (req, res) => {
    try {
        const { companyId } = getContext(req);
        if (!companyId) return res.status(401).json({ success: false, error: "Session invalide." });
        const rows = await planService.getPlanAnalytique(companyId);
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error("❌ Erreur getPlanAnalytique:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.createPlanAnalytique = async (req, res) => {
    try {
        const context = getContext(req);
        if (!context.companyId) return res.status(401).json({ success: false, error: "Identification entreprise manquante." });
        const id = await planService.createPlanAnalytique(req.body, context);
        
        emitPlanEvent(req, 'analytic_plans', 'INSERT', id);
        
        res.json({ success: true, message: "Subdivision créée avec succès.", id });
    } catch (err) { 
        console.error("❌ Erreur createPlanAnalytique:", err.message);
        res.status(400).json({ success: false, error: err.message }); 
    }
};

exports.modifierPlanAnalytique = async (req, res) => {
    try {
        const context = getContext(req);
        const isUsed = await planService.modifierPlanAnalytique(req.params.id, req.body, context);
        
        emitPlanEvent(req, 'analytic_plans', 'UPDATE', req.params.id);
        
        res.json({ success: true, message: isUsed ? "Seul le libellé a été mis à jour (déjà utilisé)." : "Subdivision mise à jour." });
    } catch (err) { 
        console.error("❌ Erreur modifierPlanAnalytique:", err.message);
        res.status(400).json({ success: false, error: err.message }); 
    }
};

exports.supprimerPlanAnalytique = async (req, res) => {
    try {
        const context = getContext(req);
        await planService.supprimerPlanAnalytique(req.params.id, context);
        
        emitPlanEvent(req, 'analytic_plans', 'DELETE', req.params.id);
        
        res.json({ success: true, message: "Subdivision archivée." });
    } catch (err) { 
        console.error("❌ Erreur supprimerPlanAnalytique:", err.message);
        res.status(500).json({ success: false, error: err.message }); 
    }
};

// ==========================================
// --- 3. DÉTAILS COÛTS ---
// ==========================================

exports.getDetailsCout = async (req, res) => {
    try {
        const { companyId } = getContext(req);
        if (!companyId) return res.status(401).json({ success: false, error: "Session invalide." });
        const rows = await planService.getDetailsCout(companyId);
        res.json({ success: true, data: rows });
    } catch (err) { 
        console.error("❌ Erreur getDetailsCout:", err.message);
        res.status(500).json({ success: false, error: err.message }); 
    }
};

exports.createDetailCout = async (req, res) => {
    try {
        const context = getContext(req);
        if (!context.companyId) return res.status(401).json({ success: false, error: "Identification entreprise manquante." });
        const id = await planService.createDetailCout(req.body, context);
        
        emitPlanEvent(req, 'analytic_details', 'INSERT', id);
        
        res.json({ success: true, message: "Détail de coût enregistré.", id });
    } catch (err) { 
        console.error("❌ Erreur createDetailCout:", err.message);
        res.status(400).json({ success: false, error: err.message }); 
    }
};

exports.modifierDetailCout = async (req, res) => {
    try {
        const context = getContext(req);
        await planService.modifierDetailCout(req.params.id, req.body, context);
        
        emitPlanEvent(req, 'analytic_details', 'UPDATE', req.params.id);
        
        res.json({ success: true, message: "Mise à jour réussie." });
    } catch (err) { 
        console.error("❌ Erreur modifierDetailCout:", err.message);
        res.status(400).json({ success: false, error: err.message }); 
    }
};

exports.supprimerDetailCout = async (req, res) => {
    try {
        const context = getContext(req);
        await planService.supprimerDetailCout(req.params.id, context);
        
        emitPlanEvent(req, 'analytic_details', 'DELETE', req.params.id);
        
        res.json({ success: true, message: "Détail de coût supprimé." });
    } catch (err) { 
        console.error("❌ Erreur supprimerDetailCout:", err.message);
        res.status(500).json({ success: false, error: err.message }); 
    }
};

// ==========================================
// --- 4. EXPORT / IMPORT CSV ---
// ==========================================

exports.importDepartements = async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Fichier CSV manquant." });
    try {
        const { companyId } = getContext(req);
        if (!companyId) return res.status(401).json({ error: "Session invalide." });

        const csvRaw = req.file.buffer.toString('utf8').replace(/^\ufeff/, '');
        const lignes = csvRaw.split(/\r?\n/).filter(l => l.trim() !== "");
        const data = lignes.slice(1).map(l => {
            const cols = l.split(';').map(c => c.trim().replace(/^"|"$/g, ''));
            return { 
                code: (cols[0] || "").toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8), 
                nom: cols[1]?.toUpperCase() 
            };
        }).filter(d => d.code && d.nom);

        await planService.importDepartementsBatch(data, companyId);
        
        emitPlanEvent(req, 'analytic_departments', 'IMPORT');
        
        res.json({ success: true, message: `${data.length} Grands Centres importés.` });
    } catch (err) { 
        console.error("❌ Erreur importDepartements:", err.message);
        res.status(500).json({ error: err.message }); 
    }
};

exports.importPlanAnalytique = async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Fichier CSV manquant." });
    try {
        const { companyId } = getContext(req);
        if (!companyId) return res.status(401).json({ error: "Session invalide." });

        const csvRaw = req.file.buffer.toString('utf8').replace(/^\ufeff/, '');
        const lignes = csvRaw.split(/\r?\n/).filter(l => l.trim() !== "");
        const data = lignes.slice(1).map(l => {
            const cols = l.split(';').map(c => c.trim().replace(/^"|"$/g, ''));
            return { 
                code: (cols[0] || "").toString().replace(/\D/g, '').slice(0, 8).padEnd(8, '0'), 
                libelle: cols[1]?.toUpperCase(), 
                codeParent: cols[2] 
            };
        }).filter(d => d.code && d.libelle && d.codeParent);

        await planService.importPlanBatch(data, companyId);
        
        emitPlanEvent(req, 'analytic_plans', 'IMPORT');
        
        res.json({ success: true, message: `${data.length} subdivisions importées.` });
    } catch (err) { 
        console.error("❌ Erreur importPlanAnalytique:", err.message);
        res.status(500).json({ error: err.message }); 
    }
};

exports.exportPlanAnalytique = async (req, res) => {
    try {
        const { companyId } = getContext(req);
        if (!companyId) return res.status(401).send("Session invalide.");

        const rows = await planService.getExportPlanData(companyId);
        const SEP = ";"; const NL = "\r\n"; const BOM = "\ufeff";
        let csv = `Code_Subdivision${SEP}Libelle${SEP}Code_Grand_Centre_Parent${NL}`;
        rows.forEach(r => { csv += `${r.code}${SEP}"${r.libelle.replace(/"/g, '""')}"${SEP}${r.code_parent}${NL}`; });
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=Plan_Analytique.csv');
        return res.status(200).send(BOM + csv);
    } catch (err) { 
        console.error("❌ Erreur exportPlanAnalytique:", err.message);
        res.status(500).send(err.message); 
    }
};

exports.exportDepartements = async (req, res) => {
    try {
        const { companyId } = getContext(req);
        if (!companyId) return res.status(401).send("Session invalide.");

        const rows = await planService.getExportDepartementsData(companyId);
        const SEP = ";"; const NL = "\r\n"; const BOM = "\ufeff";
        let csv = `Code_Analytique${SEP}Nom_Departement${NL}`;
        rows.forEach(r => { csv += `${r.code_analytique}${SEP}"${r.nom.replace(/"/g, '""')}"${NL}`; });
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=Grands_Centres.csv');
        return res.status(200).send(BOM + csv);
    } catch (err) { 
        console.error("❌ Erreur exportDepartements:", err.message);
        res.status(500).send(err.message); 
    }
};