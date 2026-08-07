const { getDb } = require('../config/database');
const { logAction } = require('../utils/auditHelper');
const BrouillardService = require('../services/TypeBrouillard.service');

// Utilitaire de contexte harmonisé
const getContext = (req) => {
    const user = req.user || {};
    const companyId = user.companyId || user.company_id;
    return {
        companyId: companyId,
        userId: user.userId || user.id,
        userName: 'user' // ✅ Consigne [2026-02-08]
    };
};

exports.getBrouillards = async (req, res) => {
    const { companyId } = getContext(req);
    try {
        if (!companyId) return res.status(401).json({ error: "Session invalide." });
        const rows = await BrouillardService.getAll(companyId);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.creerBrouillard = (req, res) => {
    const db = getDb();
    const context = getContext(req);
    const d = req.body;
    const sec = BrouillardService.calculerSecurite(d);

    try {
        const id = `BT-${Date.now()}`;
        db.prepare(`
            INSERT INTO brouillards_treso (
                id, company_id, journal_id, journal_brouillon_id, libelle, type, compte_treso_id, 
                mode_fonctionnement, sortie_directe, mode_ecriture, seuil_validation, 
                niv1_actif, niv1_user_id, niv2_actif, niv2_user_id, niv3_actif, niv3_user_id, niv4_actif, niv4_user_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            id, context.companyId, d.journal_id, d.journal_brouillon_id || null, d.libelle, d.type, d.compte_treso_id,
            sec.modeFinal, d.sortie_directe, d.mode_ecriture, sec.seuil,
            sec.niv1, sec.niv1_user, sec.niv2, sec.niv2_user, sec.niv3, sec.niv3_user, sec.niv4, sec.niv4_user
        );

        logAction({
            userId: context.userId, 
            userName: context.userName, 
            actionType: 'CREATION',
            tableConcernee: 'brouillards_treso', 
            referenceId: id,
            description: `Création du brouillard tréso : ${d.libelle}`, 
            companyId: context.companyId
        });

        // 🔥 SIGNAL SOCKET HARMONISÉ
        if (req.io && context.companyId) {
            const room = String(context.companyId);
            req.io.to(room).emit('DATA_EVENT', { table: 'brouillards_treso', action: 'INSERT', id });
            req.io.to(room).emit('REFRESH_BROUILLARDS');
        }

        res.json({ success: true, message: "Brouillard créé !" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.modifierBrouillard = (req, res) => {
    const { id } = req.params;
    const db = getDb();
    const context = getContext(req);
    const d = req.body;
    const sec = BrouillardService.calculerSecurite(d);

    try {
        db.prepare(`
            UPDATE brouillards_treso SET 
                libelle = ?, type = ?, journal_id = ?, journal_brouillon_id = ?, 
                compte_treso_id = ?, mode_fonctionnement = ?, sortie_directe = ?, 
                mode_ecriture = ?, seuil_validation = ?, niv1_actif = ?, niv1_user_id = ?,
                niv2_actif = ?, niv2_user_id = ?, niv3_actif = ?, niv3_user_id = ?,
                niv4_actif = ?, niv4_user_id = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND company_id = ?
        `).run(
            d.libelle, d.type, d.journal_id, d.journal_brouillon_id || null, d.compte_treso_id,
            sec.modeFinal, d.sortie_directe, d.mode_ecriture, sec.seuil,
            sec.niv1, sec.niv1_user, sec.niv2, sec.niv2_user, sec.niv3, sec.niv3_user, sec.niv4, sec.niv4_user,
            id, context.companyId
        );

        logAction({
            userId: context.userId, 
            userName: context.userName, 
            actionType: 'MODIFICATION',
            tableConcernee: 'brouillards_treso', 
            referenceId: id,
            description: `Mise à jour config brouillard : ${d.libelle}`, 
            companyId: context.companyId
        });

        if (req.io && context.companyId) {
            const room = String(context.companyId);
            req.io.to(room).emit('DATA_EVENT', { table: 'brouillards_treso', action: 'UPDATE', id });
            req.io.to(room).emit('REFRESH_BROUILLARDS');
        }

        res.json({ success: true, message: "Configuration mise à jour." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.supprimerBrouillard = async (req, res) => {
    const { id } = req.params;
    const db = getDb();
    const context = getContext(req);

    try {
        const canDelete = await BrouillardService.canDelete(id, context.companyId);
        if (!canDelete) {
            return res.status(403).json({ error: "Impossible de supprimer : ce brouillard contient des opérations." });
        }

        const result = db.prepare("DELETE FROM brouillards_treso WHERE id = ? AND company_id = ?").run(id, context.companyId);
        if (result.changes === 0) return res.status(404).json({ error: "Brouillard introuvable." });

        if (req.io && context.companyId) {
            const room = String(context.companyId);
            req.io.to(room).emit('DATA_EVENT', { table: 'brouillards_treso', action: 'DELETE', id });
            req.io.to(room).emit('REFRESH_BROUILLARDS');
        }

        res.json({ success: true, message: "Brouillard supprimé avec succès." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.assignerUtilisateur = (req, res) => {
    const db = getDb();
    const context = getContext(req);
    const { brouillard_id, user_id, peut_saisir, peut_valider } = req.body;

    try {
        const id = `BAF-${Date.now()}`;
        db.prepare(`
            INSERT INTO brouillard_affectations (id, company_id, brouillard_id, user_id, peut_saisir, peut_valider, sync_status)
            VALUES (?, ?, ?, ?, ?, ?, 'pending')
            ON CONFLICT(brouillard_id, user_id, company_id) DO UPDATE SET
                peut_saisir = excluded.peut_saisir, peut_valider = excluded.peut_valider, updated_at = CURRENT_TIMESTAMP
        `).run(id, context.companyId, brouillard_id, user_id, peut_saisir, peut_valider);

        if (req.io && context.companyId) {
            req.io.to(String(context.companyId)).emit('DATA_EVENT', { table: 'brouillard_affectations', action: 'UPDATE' });
        }

        res.json({ success: true, message: "Affectation réussie !" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};


exports.getAffectations = (req, res) => {
    const { id } = req.params;
    const db = getDb();
    const companyId = req.user?.companyId || req.user?.company_id;

    try {
        const rows = db.prepare(`
            SELECT a.*, u.username FROM brouillard_affectations a
            JOIN users u ON a.user_id = u.id
            WHERE a.brouillard_id = ? AND a.company_id = ?
        `).all(id, companyId);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.supprimerAffectation = (req, res) => {
    const { brouillard_id, user_id } = req.params;
    const db = getDb();
    const companyId = req.user?.companyId || req.user?.company_id;

    try {
        db.prepare(`DELETE FROM brouillard_affectations WHERE brouillard_id = ? AND user_id = ? AND company_id = ?`).run(brouillard_id, user_id, companyId);
        res.json({ success: true, message: "Accès révoqué." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getBrouillardsAffectes = (req, res) => {
    const db = getDb();
    const userId = req.user?.userId || req.user?.id; 
    const companyId = req.user?.companyId || req.user?.company_id;

    try {
        const rows = db.prepare(`
            SELECT b.*, pc.numero_compte as compte_numero, j.code as journal_code, a.peut_saisir, a.peut_valider
            FROM brouillards_treso b
            INNER JOIN brouillard_affectations a ON b.id = a.brouillard_id
            LEFT JOIN plan_comptable pc ON b.compte_treso_id = pc.id
            LEFT JOIN journaux j ON b.journal_id = j.id
            WHERE a.user_id = ? AND a.company_id = ? AND b.actif = 1
        `).all(userId, companyId);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};