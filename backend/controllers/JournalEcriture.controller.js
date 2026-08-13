// backend/controllers/JournalEcriture.controller.js
const JournalService = require('../services/JournalEcriture.service');

const getContext = (req) => {
    const user = req.user || {};
    const companyId = user.companyId || user.company_id;
    return {
        companyId: companyId,
        userId: user.userId || user.id,
        userName: 'user' // Respect strict de la consigne [2026-02-08]
    };
};

// 1. Création Groupée
exports.creerEcriture = async (req, res) => {
    const context = getContext(req);
    try {
        const result = await JournalService.creerEcritureGroupée(req.body, context.companyId, context.userName);
        
        if (req.io && context.companyId) {
            const room = String(context.companyId);
            req.io.to(room).emit('DATA_EVENT', { table: 'journal_entries', action: 'INSERT' });
            req.io.to(room).emit('REFRESH_JOURNAL_ENTRIES', { action: 'CREATE', piece: result.pieceGeneree });
        }

        return res.status(201).json({ success: true, id: result.ecritureId, piece_generee: result.pieceGeneree });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

// 2. Saisie Individuelle (au kilomètre)
exports.enregistrerLigneIndividuelle = async (req, res) => {
    const context = getContext(req);
    try {
        const result = await JournalService.enregistrerLigneUnique(req.body, context.companyId, context.userName);
        
        if (req.io && context.companyId) {
            const room = String(context.companyId);
            req.io.to(room).emit('DATA_EVENT', { 
                table: 'journal_entries', 
                action: req.body.id ? 'UPDATE' : 'INSERT' 
            });
        }

        return res.status(req.body.id ? 200 : 201).json({ success: true, ...result });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

// 3. Récupération par Journal (avec is_ventilated)
exports.getEcrituresByJournal = async (req, res) => {
    const { journal_id, exercice_id, patternDate } = req.query;
    const companyId = req.user?.companyId || req.user?.company_id;

    try {
        const data = await JournalService.getEcrituresByJournal({
            journal_id,
            exercice_id,
            patternDate,
            companyId
        });
        return res.json({ success: true, data: data.map(item => ({ ...item, is_balanced: Math.abs(item.solde || 0) < 0.01 })) });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

// 4. Récupération par Période (Mois)
exports.getLignesParPeriode = async (req, res) => {
    const { journal_id, exercice_id, moisIdx } = req.query;
    const companyId = req.user?.company_id || req.user?.companyId;

    try {
        const result = await JournalService.getLignesParPeriode({
            journal_id,
            exercice_id,
            moisIdx,
            companyId
        });
        return res.json({ success: true, ...result });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

// 5. Annulation Pièce
exports.annulerPieceComplete = async (req, res) => {
    const context = getContext(req);
    const { ids } = req.body; 
    if (!ids || ids.length === 0) return res.status(400).json({ error: "Aucune ligne sélectionnée." });

    try {
        await JournalService.annulerPieceComplete(ids, context.companyId, context.userName);

        if (req.io && context.companyId) {
            req.io.to(String(context.companyId)).emit('DATA_EVENT', { table: 'journal_entries', action: 'DELETE' });
        }

        return res.json({ success: true, message: "Nettoyage effectué." });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

// 6. Journaux pour Saisie
exports.getJournauxPourSaisie = async (req, res) => {
    const companyId = req.user?.company_id || req.user?.companyId;
    let { exercice_id } = req.query; 

    try {
        const result = await JournalService.getJournauxPourSaisie(companyId, exercice_id);
        return res.json({ success: true, ...result });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

// 7. Historiques (Compte & Tiers)
exports.getHistoriqueParCompte = async (req, res) => {
    const { num_compte } = req.params;
    const { exercice_id } = req.query;
    const companyId = req.user?.companyId || req.user?.company_id;
    try {
        const data = await JournalService.getHistoriqueParCompte(num_compte, exercice_id, companyId);
        return res.json({ success: true, data });
    } catch (err) { 
        return res.status(500).json({ error: err.message }); 
    }
};

exports.getHistoriqueParTiers = async (req, res) => {
    const { num_tiers } = req.params;
    const { exercice_id } = req.query;
    const companyId = req.user?.companyId || req.user?.company_id;
    try {
        const data = await JournalService.getHistoriqueParTiers(num_tiers, exercice_id, companyId);
        return res.json({ success: true, data });
    } catch (err) { 
        return res.status(500).json({ error: err.message }); 
    }
};

// 8. Lettrage / Délettrage
exports.lettrerEcritures = async (req, res) => {
    const { ids, lettre } = req.body;
    const context = getContext(req);

    if (!ids || ids.length < 2) return res.status(400).json({ error: "Sélectionnez au moins deux lignes." });
    
    try {
        await JournalService.lettrerEcritures(ids, lettre, context.companyId);

        if (req.io && context.companyId) {
            req.io.to(String(context.companyId)).emit('DATA_EVENT', { table: 'journal_entries', action: 'LETTRAGE' });
        }

        return res.json({ success: true, message: "Lettrage effectué avec succès." });
    } catch (err) { 
        return res.status(400).json({ error: err.message }); 
    }
};

exports.getProchaineLettre = async (req, res) => {
    try {
        const companyId = req.user?.company_id || req.user?.companyId;
        const { num_tiers } = req.query; 

        const prochaine = await JournalService.calculerProchaineLettre(companyId, num_tiers);
        return res.json({ success: true, prochaineLettre: prochaine });
    } catch (err) { 
        return res.status(500).json({ error: err.message }); 
    }
};

exports.delettrerEcritures = async (req, res) => {
    const { ids } = req.body;
    const companyId = req.user?.company_id || req.user?.companyId;
    
    try {
        await JournalService.delettrerEcritures(ids, companyId);

        if (req.io && companyId) {
            req.io.to(String(companyId)).emit('DATA_EVENT', { table: 'journal_entries', action: 'DELETTRAGE' });
        }

        return res.json({ success: true, message: "Délettrage effectué." });
    } catch (err) { 
        return res.status(500).json({ error: err.message }); 
    }
};