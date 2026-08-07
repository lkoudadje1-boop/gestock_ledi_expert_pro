const { getDb } = require('../config/database');
const BrAnalytiqueService = require('../services/SaisieAnalytiqueBrouillon.service');

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

// --- 1. VÉRIFICATION DU MODÈLE (MATCHING) ---
exports.checkConfigForSaisieBrouillon = async (req, res) => {
    const db = getDb();
    const { compte_id } = req.params; 
    let { ligne_id } = req.query; 
    const { companyId } = getContext(req);

    try {
        // 1. PARACHUTE ID (Récupération si ID perdu)
        if (!ligne_id || ligne_id === 'null' || ligne_id === 'undefined') {
            const lastLine = db.prepare(`
                SELECT id FROM brouillon_lignes 
                WHERE (compte_id = ? OR num_compte = ?) AND company_id = ? 
                ORDER BY created_at DESC LIMIT 1
            `).get(compte_id, compte_id, companyId);
            if (lastLine) ligne_id = lastLine.id;
        }

        // 2. VÉRIFIER SI UNE VENTILATION EXISTE DÉJÀ (UPDATE)
        const existingLana = db.prepare(`
            SELECT la.plan_analytique_id, la.montant, pa.libelle as plan_libelle, 
                   la.departement_id, d.nom as departement_nom
            FROM brouillon_lignes_analytiques la 
            JOIN plan_analytique pa ON la.plan_analytique_id = pa.id
            JOIN departements d ON la.departement_id = d.id
            WHERE la.ligne_brouillon_id = ? AND la.company_id = ?
        `).all(ligne_id, companyId);

        if (existingLana.length > 0) {
            const repartitions = {};
            const details_plans = {};
            existingLana.forEach(l => { 
                repartitions[l.plan_analytique_id] = l.montant; 
                details_plans[l.plan_analytique_id] = { 
                    libelle: l.plan_libelle, dept_id: l.departement_id, dept_nom: l.departement_nom 
                };
            });
            return res.json({ success: true, isUpdate: true, data: { mode_saisie: 'MANUEL', repartitions, details_plans } });
        }

        // 3. CHERCHER LA CONFIGURATION AUTOMATIQUE
        const config = db.prepare(`
            SELECT id, mode_saisie FROM analytique_config_comptes 
            WHERE (compte_general_id = ? OR compte_general_id = (SELECT id FROM plan_comptable WHERE numero_compte = ? AND company_id = ?))
            AND company_id = ? AND is_deleted = 0
        `).get(compte_id, compte_id, companyId, companyId);

        if (!config) return res.json({ success: true, data: null });

        const lines = db.prepare(`
            SELECT r.plan_analytique_id, r.pourcentage, r.montant, p.libelle, p.parent_dept_id
            FROM analytique_auto_repartition r
            JOIN plan_analytique p ON r.plan_analytique_id = p.id
            WHERE r.config_id = ? AND r.is_deleted = 0
        `).all(config.id);

        const repartitions = {};
        const details_plans = {};
        lines.forEach(l => {
            repartitions[l.plan_analytique_id] = config.mode_saisie === 'AUTO' ? l.pourcentage : l.montant;
            details_plans[l.plan_analytique_id] = { libelle: l.libelle, dept_id: l.parent_dept_id };
        });

        res.json({ success: true, isUpdate: false, data: { mode_saisie: config.mode_saisie, repartitions, details_plans } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// --- 2. ENREGISTREMENT DE LA VENTILATION ---
exports.ventilerEcritureBrouillon = async (req, res) => {
    const db = getDb();
    let { ligne_id, repartitions } = req.body; 
    const context = getContext(req);

    try {
        if (!ligne_id || ligne_id === 'null' || ligne_id === 'undefined') {
            const lastLine = db.prepare(`SELECT id FROM brouillon_lignes WHERE company_id = ? ORDER BY created_at DESC LIMIT 1`).get(context.companyId);
            if (lastLine) ligne_id = lastLine.id;
            else return res.status(400).json({ error: "Ligne introuvable." });
        }

        const ligneBrouillon = db.prepare(`SELECT id, num_compte, debit, credit FROM brouillon_lignes WHERE id = ? AND company_id = ?`).get(ligne_id, context.companyId);
        if (!ligneBrouillon) return res.status(404).json({ error: "Ligne de brouillard introuvable." });

        const montantAImputer = Math.abs(parseFloat(ligneBrouillon.debit || 0) - parseFloat(ligneBrouillon.credit || 0));
        const verif = BrAnalytiqueService.validerEquilibre(montantAImputer, repartitions);

        if (!verif.isEquilibre) {
            return res.status(400).json({ error: "DÉSÉQUILIBRE", message: `Attendu: ${verif.attendu}, Saisi: ${verif.totalVentile}` });
        }

        db.transaction(() => {
            db.prepare(`DELETE FROM brouillon_lignes_analytiques WHERE ligne_brouillon_id = ?`).run(ligne_id);
            const stmt = db.prepare(`
                INSERT INTO brouillon_lignes_analytiques 
                (id, company_id, ligne_brouillon_id, plan_analytique_id, departement_id, num_compte, montant, sync_status) 
                VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
            `);

            for (const row of repartitions) {
                const finalDeptId = BrAnalytiqueService.resolveDeptId(db, row);
                stmt.run(BrAnalytiqueService.generateBrLanaId(), context.companyId, ligne_id, row.plan_analytique_id, finalDeptId, ligneBrouillon.num_compte, parseFloat(row.montant));
            }
        })();

        // 🔥 SIGNAL SOCKET
        if (req.io && context.companyId) {
            const room = String(context.companyId);
            // Signal pour la synchro des ventilations brouillon
            req.io.to(room).emit('DATA_EVENT', { 
                table: 'brouillon_lignes_analytiques', 
                action: 'UPDATE', 
                parent_id: ligne_id 
            });
            // Indispensable : On prévient le brouillard de saisie qu'une ligne a été ventilée
            req.io.to(room).emit('REFRESH_VENTILATION');
        }

        res.json({ success: true, message: "Ventilation du brouillon enregistrée.", id_utilise: ligne_id });
    } catch (err) {
        console.error("❌ Erreur Ventiler Brouillon:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

// --- 3. DÉTAILS DE LA VENTILATION ---
exports.getDetailsVentilationBrouillon = (req, res) => {
    const db = getDb();
    const { ligne_id } = req.params;
    const { companyId } = getContext(req);

    try {
        const rows = db.prepare(`
            SELECT lab.montant, pa.code as plan_code, pa.libelle as plan_nom, d.nom as dept_nom
            FROM brouillon_lignes_analytiques lab
            JOIN plan_analytique pa ON lab.plan_analytique_id = pa.id
            JOIN departements d ON lab.departement_id = d.id
            WHERE lab.ligne_brouillon_id = ? AND lab.company_id = ?
        `).all(ligne_id, companyId);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// --- 4. PLAN ANALYTIQUE ---
exports.getPlanAnalytique = (req, res) => {
    const db = getDb();
    const { companyId } = getContext(req);
    try {
        const rows = db.prepare(`
            SELECT pa.id, pa.code, pa.libelle, pa.parent_dept_id as departement_id, d.nom as departement_nom 
            FROM plan_analytique pa
            LEFT JOIN departements d ON pa.parent_dept_id = d.id 
            WHERE pa.company_id = ? AND pa.is_deleted = 0 ORDER BY pa.code ASC
        `).all(companyId);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};