const { getDb } = require('../config/database');
const JournalService = require('../services/JournalEcriture.service');
const getContext = (req) => {
    const user = req.user || {};
    const companyId = user.companyId || user.company_id;
    return {
        companyId: companyId,
        userId: user.userId || user.id,
        userName: user.username || 'Utilisateur'
    };
};

// 1. Création Groupée
exports.creerEcriture = async (req, res) => {
    const context = getContext(req);
    try {
        const result = await JournalService.creerEcritureGroupée(req.body, context.companyId, context.userName);
        
        if (req.io && context.companyId) {
            const room = String(context.companyId);
            // Signal universel pour les écritures
            req.io.to(room).emit('DATA_EVENT', { table: 'journal_entries', action: 'INSERT' });
            // Signal spécifique pour rafraîchir les journaux de saisie
            req.io.to(room).emit('REFRESH_JOURNAL_ENTRIES', { action: 'CREATE', piece: result.pieceGeneree });
        }

        res.status(201).json({ success: true, id: result.ecritureId, piece_generee: result.pieceGeneree });
    } catch (err) {
        res.status(500).json({ error: err.message });
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

        res.status(req.body.id ? 200 : 201).json({ success: true, ...result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
// 3. Récupération par Journal (avec is_ventilated)
exports.getEcrituresByJournal = (req, res) => {
    const db = getDb();
    const { journal_id, exercice_id, patternDate } = req.query; // patternDate fourni par le front
    const companyId = req.user?.companyId || req.user?.company_id;

    try {
     // Dans JournalEcriture.controller.js (Ligne ~77)
// Remplace la ligne du SELECT par celle-ci :
const data = db.prepare(`
    SELECT l.*, 
    (SELECT COUNT(*) FROM lignes_analytiques WHERE ligne_ecriture_id = l.id) > 0 as is_ventilated
    FROM lignes_ecritures l
    WHERE l.journal_id = ? AND l.exercice_id = ? AND l.company_id = ? AND l.date_ecriture LIKE ? AND l.is_deleted = 0
    ORDER BY l.created_at DESC, l.id DESC
`).all(journal_id, exercice_id, companyId, patternDate);
        res.json({ success: true, data: data.map(item => ({ ...item, is_balanced: Math.abs(item.solde || 0) < 0.01 })) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 4. Récupération par Période (Mois)
exports.getLignesParPeriode = (req, res) => {
    const db = getDb();
    const { journal_id, exercice_id, moisIdx } = req.query;
    const companyId = req.user?.company_id || req.user?.companyId;

    try {
        const exercice = db.prepare("SELECT date_debut FROM exercices WHERE id = ?").get(exercice_id);
        if (!exercice) return res.status(404).json({ error: "Exercice introuvable" });

        const journal = db.prepare("SELECT compte_contrepartie_id FROM journaux WHERE id = ?").get(journal_id);
        const annee = exercice.date_debut.split('-')[0];
        const moisNum = (parseInt(moisIdx) + 1).toString().padStart(2, '0');
        const patternDate = `${annee}-${moisNum}-%`;
        const dateDebutMois = `${annee}-${moisNum}-01`;

        let ancienSolde = 0, mvtDebitMois = 0, mvtCreditMois = 0;

        if (journal?.compte_contrepartie_id) {
            const compte = db.prepare("SELECT numero_compte FROM plan_comptable WHERE id = ?").get(journal.compte_contrepartie_id);
            if (compte) {
                const resAncien = db.prepare(`SELECT (SUM(debit) - SUM(credit)) as solde FROM lignes_ecritures WHERE num_compte = ? AND company_id = ? AND date_ecriture < ? AND is_deleted = 0`).get(compte.numero_compte, companyId, dateDebutMois);
                ancienSolde = resAncien?.solde || 0;
                const resMvts = db.prepare(`SELECT SUM(debit) as debits, SUM(credit) as credits FROM lignes_ecritures WHERE num_compte = ? AND company_id = ? AND date_ecriture LIKE ? AND is_deleted = 0`).get(compte.numero_compte, companyId, patternDate);
                mvtDebitMois = resMvts?.debits || 0;
                mvtCreditMois = resMvts?.credits || 0;
            }
        }

        const data = db.prepare(`
            SELECT l.*, EXISTS (SELECT 1 FROM lignes_analytiques la WHERE la.ligne_ecriture_id = l.id) as is_ventilated
            FROM lignes_ecritures l
            WHERE l.journal_id = ? AND l.exercice_id = ? AND l.company_id = ? AND l.date_ecriture LIKE ? AND l.is_deleted = 0
            ORDER BY l.created_at DESC, l.id DESC
        `).all(journal_id, exercice_id, companyId, patternDate);

        res.json({ success: true, data, ancienSolde, mouvementDebit: mvtDebitMois, mouvementCredit: mvtCreditMois, nouveauSolde: (ancienSolde + mvtDebitMois - mvtCreditMois) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 5. Annulation Pièce (Logique Double : Delete si erreur / Update si équilibré)
exports.annulerPieceComplete = async (req, res) => {
    const db = getDb();
    const context = getContext(req);
    const { ids } = req.body; 
    if (!ids || ids.length === 0) return res.status(400).json({ error: "Aucune ligne sélectionnée." });

    try {
        db.transaction(() => {
            const placeholders = ids.map(() => '?').join(',');
            const pieces = db.prepare(`SELECT DISTINCT piece, ecriture_id FROM lignes_ecritures WHERE id IN (${placeholders}) AND company_id = ?`).all(...ids, context.companyId);

            for (const p of pieces) {
                const solde = db.prepare(`SELECT ROUND(SUM(debit) - SUM(credit), 2) as reste FROM lignes_ecritures WHERE ecriture_id = ? AND is_deleted = 0`).get(p.ecriture_id);
                if (!solde || Math.abs(solde.reste) > 0.01) {
                    // Suppression réelle
                    db.prepare(`DELETE FROM lignes_analytiques WHERE ligne_ecriture_id IN (SELECT id FROM lignes_ecritures WHERE ecriture_id = ?)`).run(p.ecriture_id);
                    db.prepare(`DELETE FROM lignes_ecritures WHERE ecriture_id = ?`).run(p.ecriture_id);
                    db.prepare(`DELETE FROM ecritures WHERE id = ?`).run(p.ecriture_id);
                } else {
                    // Annulation logique
                    db.prepare(`UPDATE ecritures SET is_deleted = 1 WHERE id = ?`).run(p.ecriture_id);
                    db.prepare(`UPDATE lignes_ecritures SET is_deleted = 1 WHERE ecriture_id = ?`).run(p.ecriture_id);
                }
            }
        })();

        // 🔥 Notification de suppression/annulation
        if (req.io && context.companyId) {
            req.io.to(String(context.companyId)).emit('DATA_EVENT', { table: 'journal_entries', action: 'DELETE' });
        }

        res.json({ success: true, message: "Nettoyage effectué." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 6. Journaux pour Saisie
exports.getJournauxPourSaisie = (req, res) => {
    const db = getDb();
    const companyId = req.user?.company_id || req.user?.companyId;
    let { exercice_id } = req.query; 

    try {
        if (!exercice_id || exercice_id === 'undefined') {
            const currentEx = db.prepare(`SELECT id FROM exercices WHERE company_id = ? AND statut = 'OUVERT' LIMIT 1`).get(companyId);
            exercice_id = currentEx?.id || null;
        }

        const checkAnalytique = db.prepare(`SELECT c.gestion_analytique, (SELECT COUNT(*) FROM plan_analytique WHERE company_id = ? AND is_deleted = 0) as nb_plans FROM companies c WHERE c.id = ?`).get(companyId, companyId);
        const analytiqueBloque = checkAnalytique?.gestion_analytique === 1 && checkAnalytique?.nb_plans === 0;

        const data = db.prepare(`
            SELECT j.*, pc.numero_compte as compte_numero, pc.intitule as compte_libelle,
            (SELECT GROUP_CONCAT(DISTINCT CAST(STRFTIME('%m', date_ecriture) AS INTEGER) - 1) FROM lignes_ecritures WHERE journal_id = j.id AND exercice_id = ? AND is_deleted = 0 AND company_id = ?) as mois_saisis
            FROM journaux j LEFT JOIN plan_comptable pc ON j.compte_contrepartie_id = pc.id WHERE j.company_id = ?
            ORDER BY j.type_journal, j.code ASC
        `).all(exercice_id, companyId, companyId);

        res.json({ success: true, data, analytique_alerte: analytiqueBloque });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 7. Historiques (Compte & Tiers)
exports.getHistoriqueParCompte = (req, res) => {
    const db = getDb();
    const { num_compte } = req.params;
    const { exercice_id } = req.query;
    const companyId = req.user?.companyId || req.user?.company_id;
    try {
        let sql = `SELECT l.*, j.code as code_journal, ex.date_debut as date_debut_ex, ex.date_fin as date_fin_ex 
                   FROM lignes_ecritures l JOIN journaux j ON l.journal_id = j.id JOIN exercices ex ON l.exercice_id = ex.id 
                   WHERE l.num_compte = ? AND l.company_id = ? AND l.is_deleted = 0`;
        const params = [num_compte, companyId];
        if (exercice_id && exercice_id !== 'ALL') { sql += ` AND l.exercice_id = ?`; params.push(exercice_id); }
        res.json({ success: true, data: db.prepare(sql + ` ORDER BY l.date_ecriture ASC`).all(...params) });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.getHistoriqueParTiers = (req, res) => {
    const db = getDb();
    const { num_tiers } = req.params;
    const { exercice_id } = req.query;
    const companyId = req.user?.companyId || req.user?.company_id;
    try {
        let sql = `SELECT l.*, j.code as code_journal, ex.date_debut as date_debut_ex, ex.date_fin as date_fin_ex 
                   FROM lignes_ecritures l JOIN journaux j ON l.journal_id = j.id JOIN exercices ex ON l.exercice_id = ex.id 
                   WHERE l.num_tiers = ? AND l.company_id = ? AND l.is_deleted = 0`;
        const params = [num_tiers, companyId];
        if (exercice_id && exercice_id !== 'ALL') { sql += ` AND l.exercice_id = ?`; params.push(exercice_id); }
        res.json({ success: true, data: db.prepare(sql + ` ORDER BY l.date_ecriture ASC`).all(...params) });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// 8. Lettrage / Délettrage
exports.lettrerEcritures = async (req, res) => {
    const db = getDb();
    const { ids, lettre } = req.body;
    const context = getContext(req);

    if (!ids || ids.length < 2) return res.status(400).json({ error: "Sélectionnez au moins deux lignes." });
    
    const lettreUpper = lettre.trim().toUpperCase();

    try {
        db.transaction(() => {
            const placeholders = ids.map(() => '?').join(',');

            // 1. Récupérer le num_tiers des lignes sélectionnées (pour isoler la vérification)
            const infoLigne = db.prepare(`SELECT num_tiers, num_compte FROM lignes_ecritures WHERE id = ?`).get(ids[0]);
            const tiers = infoLigne?.num_tiers;
            const compte = infoLigne?.num_compte;

            // 2. VERIFICATION : La lettre est-elle déjà utilisée POUR CE TIERS ?
            const existeDeja = db.prepare(`
                SELECT COUNT(*) as count 
                FROM lignes_ecritures 
                WHERE lettre = ? 
                  AND (num_tiers = ? OR (num_tiers IS NULL AND num_compte = ?))
                  AND company_id = ? 
                  AND is_deleted = 0
            `).get(lettreUpper, tiers, compte, context.companyId);

            if (existeDeja.count > 0) {
                throw new Error(`La lettre "${lettreUpper}" est déjà utilisée pour ce compte/tiers.`);
            }

            // 3. VERIFICATION : Équilibre du solde
            const check = db.prepare(`
                SELECT ROUND(SUM(debit) - SUM(credit), 2) as solde 
                FROM lignes_ecritures 
                WHERE id IN (${placeholders}) AND company_id = ?
            `).get(...ids, context.companyId);

            if (Math.abs(check.solde) > 0.01) {
                throw new Error(`Déséquilibre de ${check.solde}. Le lettrage doit être nul.`);
            }

            // 4. ACTION : Mise à jour du lettrage
            db.prepare(`
                UPDATE lignes_ecritures 
                SET lettre = ?, date_lettrage = CURRENT_DATE 
                WHERE id IN (${placeholders}) AND company_id = ?
            `).run(lettreUpper, ...ids, context.companyId);
        })();

        if (req.io && context.companyId) {
            req.io.to(String(context.companyId)).emit('DATA_EVENT', { table: 'journal_entries', action: 'LETTRAGE' });
        }

        res.json({ success: true, message: "Lettrage effectué avec succès." });
    } catch (err) { 
        res.status(400).json({ error: err.message }); 
    }
};

exports.getProchaineLettre = async (req, res) => {
    try {
        const companyId = req.user?.company_id || req.user?.companyId;
        // 📥 On récupère le tiers envoyé par le front
        const { num_tiers } = req.query; 

        // 🚀 On passe num_tiers au service pour qu'il calcule la lettre propre à ce tiers
        const prochaine = await JournalService.calculerProchaineLettre(companyId, num_tiers);
        
        res.json({ success: true, prochaineLettre: prochaine });
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
};
exports.delettrerEcritures = async (req, res) => {
    const db = getDb();
    const { ids } = req.body;
    const companyId = req.user?.company_id || req.user?.companyId;
    
    try {
        const placeholders = ids.map(() => '?').join(',');
        db.prepare(`
            UPDATE lignes_ecritures 
            SET lettre = NULL, date_lettrage = NULL 
            WHERE id IN (${placeholders}) AND company_id = ?
        `).run(...ids, companyId);

        // 📡 On prévient le front qu'une donnée a changé (ce qui peut libérer une lettre)
        if (req.io && companyId) {
            req.io.to(String(companyId)).emit('DATA_EVENT', { table: 'journal_entries', action: 'DELETTRAGE' });
        }

        res.json({ success: true, message: "Délettrage effectué." });
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
};