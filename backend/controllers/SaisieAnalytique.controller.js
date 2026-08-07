const { getDb } = require('../config/database');
const AnalytiqueService = require('../services/SaisieAnalytique.service');

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
exports.checkConfigForSaisie = async (req, res) => {
    const db = getDb();
    const { compte_id } = req.params; 
    const { ligne_id } = req.query; 
    const { companyId } = getContext(req);

    try {
        // 1. Vérifier si une ventilation existe déjà (Cas d'une modification)
        const existingLana = db.prepare(`
            SELECT la.plan_analytique_id, la.montant, pa.libelle as plan_libelle,
                   la.departement_id, d.nom as departement_nom
            FROM lignes_analytiques la 
            JOIN plan_analytique pa ON la.plan_analytique_id = pa.id
            JOIN departements d ON la.departement_id = d.id
            WHERE la.ligne_ecriture_id = ? AND la.company_id = ?
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

        // 2. Sinon chercher la configuration automatique liée au compte
        const config = db.prepare(`
            SELECT id, mode_saisie FROM analytique_config_comptes 
            WHERE (
                compte_general_id = ? 
                OR compte_general_id = (SELECT id FROM plan_comptable WHERE numero_compte = ? AND company_id = ?)
            )
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
exports.ventilerEcriture = async (req, res) => {
    const db = getDb();
    const { ligne_id, repartitions } = req.body; 
    const context = getContext(req);

    try {
        const ligneOriginale = db.prepare(`SELECT id, num_compte, debit, credit FROM lignes_ecritures WHERE id = ? AND company_id = ?`).get(ligne_id, context.companyId);
        if (!ligneOriginale) return res.status(404).json({ error: "Ligne comptable introuvable." });

        const montantComptable = Math.abs(parseFloat(ligneOriginale.debit || 0) - parseFloat(ligneOriginale.credit || 0));
        const equilibre = AnalytiqueService.checkEquilibre(montantComptable, repartitions);

        if (!equilibre.isEquilibre) {
            return res.status(400).json({ error: "DÉSÉQUILIBRE", message: `Attendu: ${equilibre.attendu}, Saisi: ${equilibre.totalVentile}` });
        }

        db.transaction(() => {
            // Nettoyage de l'ancienne ventilation
            db.prepare(`DELETE FROM lignes_analytiques WHERE ligne_ecriture_id = ?`).run(ligne_id);

            const stmt = db.prepare(`
                INSERT INTO lignes_analytiques (id, company_id, ligne_ecriture_id, plan_analytique_id, departement_id, num_compte, montant, sync_status)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
            `);

            for (const row of repartitions) {
                const finalDeptId = AnalytiqueService.resolveDepartement(db, row);
                stmt.run(AnalytiqueService.generateLanaId(), context.companyId, ligne_id, row.plan_analytique_id, finalDeptId, ligneOriginale.num_compte, parseFloat(row.montant));
            }
        })();

        // 🔥 SIGNAL SOCKET
        if (req.io && context.companyId) {
            const room = String(context.companyId);
            // Signal universel pour les rapports analytiques
            req.io.to(room).emit('DATA_EVENT', { 
                table: 'analytic_entries', 
                action: 'UPDATE', 
                parent_id: ligne_id 
            });
            // Signal UI pour mettre à jour l'icône de ventilation dans le journal
            req.io.to(room).emit('REFRESH_JOURNAL_ENTRIES', { action: 'VENTILATION_UPDATE' });
        }

        res.json({ success: true, message: "Ventilation analytique enregistrée." });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// --- 3. RÉCUPÉRATION DU PLAN ANALYTIQUE (Lecture seule) ---
exports.getPlanAnalytique = (req, res) => {
    const db = getDb();
    const { companyId } = getContext(req);
    try {
        const rows = db.prepare(`
            SELECT pa.id, pa.code, pa.libelle, pa.parent_dept_id as departement_id, d.nom as departement_nom 
            FROM plan_analytique pa
            LEFT JOIN departements d ON pa.parent_dept_id = d.id 
            WHERE pa.company_id = ? AND pa.is_deleted = 0 
            ORDER BY pa.code ASC
        `).all(companyId);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};