// backend/controllers/SaisieAnalytique.controller.js
const AnalytiqueService = require('../services/SaisieAnalytique.service');
const { 
    CloudLigneAnalytique, 
    CloudPlanAnalytique, 
    CloudDepartement, 
    CloudAnalytiqueConfigCompte, 
    CloudAnalytiqueAutoRepartition, 
    CloudPlanComptable, 
    CloudLigneEcriture 
} = require('../models/cloud.model');

// Utilitaire de contexte harmonisé
const getContext = (req) => {
    const user = req.user || {};
    const companyId = user.companyId || user.company_id;
    return {
        companyId: companyId ? companyId.toString() : null,
        userId: user.userId || user.id,
        userName: user.username || 'Utilisateur'
    };
};

// --- 1. VÉRIFICATION DU MODÈLE (MATCHING) ---
exports.checkConfigForSaisie = async (req, res) => {
    const { compte_id } = req.params; 
    const { ligne_id } = req.query; 
    const { companyId } = getContext(req);

    try {
        if (!companyId) {
            return res.status(401).json({ success: false, error: "Session invalide." });
        }

        // 1. Vérifier si une ventilation existe déjà (Cas d'une modification) via agrégation Mongoose
        const existingLana = await CloudLigneAnalytique.aggregate([
            {
                $match: {
                    ligne_ecriture_id: ligne_id.toString(),
                    company_id: companyId
                }
            },
            {
                $lookup: {
                    from: 'cloud_plan_analytiques',
                    localField: 'plan_analytique_id',
                    foreignField: 'localId',
                    as: 'pa'
                }
            },
            { $unwind: '$pa' },
            {
                $lookup: {
                    from: 'cloud_departements',
                    localField: 'departement_id',
                    foreignField: 'localId',
                    as: 'd'
                }
            },
            { $unwind: { path: '$d', preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    _id: 0,
                    plan_analytique_id: 1,
                    montant: 1,
                    plan_libelle: '$pa.libelle',
                    departement_id: 1,
                    departement_nom: '$d.nom'
                }
            }
        ]);

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
        let compteGeneralId = compte_id;
        // Si compte_id n'est pas le localId mais un numéro de compte, on cherche le plan comptable
        const planCompte = await CloudPlanComptable.findOne({ numero_compte: compte_id, company_id: companyId }).lean();
        if (planCompte) {
            compteGeneralId = planCompte.localId;
        }

        const config = await CloudAnalytiqueConfigCompte.findOne({
            $or: [
                { compte_general_id: compte_id.toString() },
                { compte_general_id: compteGeneralId }
            ],
            company_id: companyId,
            is_deleted: { $ne: 1 }
        }).lean();

        if (!config) return res.json({ success: true, data: null });

        const lines = await CloudAnalytiqueAutoRepartition.aggregate([
            {
                $match: {
                    config_id: config.localId,
                    is_deleted: { $ne: 1 }
                }
            },
            {
                $lookup: {
                    from: 'cloud_plan_analytiques',
                    localField: 'plan_analytique_id',
                    foreignField: 'localId',
                    as: 'p'
                }
            },
            { $unwind: '$p' },
            {
                $project: {
                    _id: 0,
                    plan_analytique_id: 1,
                    pourcentage: 1,
                    montant: 1,
                    libelle: '$p.libelle',
                    parent_dept_id: '$p.parent_dept_id'
                }
            }
        ]);

        const repartitions = {};
        const details_plans = {};
        lines.forEach(l => {
            repartitions[l.plan_analytique_id] = config.mode_saisie === 'AUTO' ? l.pourcentage : l.montant;
            details_plans[l.plan_analytique_id] = { libelle: l.libelle, dept_id: l.parent_dept_id };
        });

        res.json({ success: true, isUpdate: false, data: { mode_saisie: config.mode_saisie, repartitions, details_plans } });
    } catch (err) {
        console.error("❌ Erreur checkConfigForSaisie:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

// --- 2. ENREGISTREMENT DE LA VENTILATION ---
exports.ventilerEcriture = async (req, res) => {
    const { ligne_id, repartitions } = req.body; 
    const context = getContext(req);

    try {
        if (!context.companyId) {
            return res.status(401).json({ success: false, error: "Session invalide." });
        }

        const ligneOriginale = await CloudLigneEcriture.findOne({ 
            localId: ligne_id.toString(), 
            company_id: context.companyId 
        }).lean();

        if (!ligneOriginale) return res.status(404).json({ success: false, error: "Ligne comptable introuvable." });

        const montantComptable = Math.abs(parseFloat(ligneOriginale.debit || 0) - parseFloat(ligneOriginale.credit || 0));
        const equilibre = AnalytiqueService.checkEquilibre(montantComptable, repartitions);

        if (!equilibre.isEquilibre) {
            return res.status(400).json({ success: false, error: "DÉSÉQUILIBRE", message: `Attendu: ${equilibre.attendu}, Saisi: ${equilibre.totalVentile}` });
        }

        // Nettoyage de l'ancienne ventilation
        await CloudLigneAnalytique.deleteMany({ ligne_ecriture_id: ligne_id.toString(), company_id: context.companyId });

        // Insertion des nouvelles lignes analytiques
        for (const row of repartitions) {
            const finalDeptId = await AnalytiqueService.resolveDepartement(row, context.companyId);
            await CloudLigneAnalytique.create({
                localId: AnalytiqueService.generateLanaId(),
                company_id: context.companyId,
                ligne_ecriture_id: ligne_id.toString(),
                plan_analytique_id: row.plan_analytique_id.toString(),
                departement_id: finalDeptId ? finalDeptId.toString() : null,
                num_compte: ligneOriginale.num_compte,
                montant: parseFloat(row.montant),
                sync_status: 'synced'
            });
        }

        // 🔥 SIGNAL SOCKET
        if (req.io && context.companyId) {
            const room = String(context.companyId);
            req.io.to(room).emit('DATA_EVENT', { 
                table: 'analytic_entries', 
                action: 'UPDATE', 
                parent_id: ligne_id 
            });
            req.io.to(room).emit('REFRESH_JOURNAL_ENTRIES', { action: 'VENTILATION_UPDATE' });
        }

        res.json({ success: true, message: "Ventilation analytique enregistrée." });
    } catch (err) {
        console.error("❌ Erreur ventilerEcriture:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

// --- 3. RÉCUPÉRATION DU PLAN ANALYTIQUE (Lecture seule) ---
exports.getPlanAnalytique = async (req, res) => {
    const { companyId } = getContext(req);
    try {
        if (!companyId) {
            return res.status(401).json({ success: false, error: "Session invalide." });
        }

        const rows = await CloudPlanAnalytique.aggregate([
            {
                $match: {
                    company_id: companyId,
                    is_deleted: { $ne: 1 }
                }
            },
            {
                $lookup: {
                    from: 'cloud_departements',
                    localField: 'parent_dept_id',
                    foreignField: 'localId',
                    as: 'd'
                }
            },
            { $unwind: { path: '$d', preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    _id: 0,
                    id: '$localId',
                    code: 1,
                    libelle: 1,
                    departement_id: '$parent_dept_id',
                    departement_nom: '$d.nom'
                }
            },
            { $sort: { code: 1 } }
        ]);

        res.json({ success: true, data: rows });
    } catch (err) {
        console.error("❌ Erreur getPlanAnalytique:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};