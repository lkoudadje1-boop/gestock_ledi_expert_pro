// backend/controllers/SaisieAnalytiqueBrouillon.controller.js
const BrAnalytiqueService = require('../services/SaisieAnalytiqueBrouillon.service');
const { 
    CloudBrouillonLigneAnalytique, 
    CloudBrouillonLigne, 
    CloudPlanAnalytique, 
    CloudDepartement, 
    CloudAnalytiqueConfigCompte, 
    CloudAnalytiqueAutoRepartition, 
    CloudPlanComptable 
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
exports.checkConfigForSaisieBrouillon = async (req, res) => {
    const { compte_id } = req.params; 
    let { ligne_id } = req.query; 
    const { companyId } = getContext(req);

    try {
        if (!companyId) {
            return res.status(401).json({ success: false, error: "Session invalide." });
        }

        // 1. PARACHUTE ID (Récupération si ID perdu)
        if (!ligne_id || ligne_id === 'null' || ligne_id === 'undefined') {
            const lastLine = await CloudBrouillonLigne.findOne({
                $or: [{ compte_id: compte_id.toString() }, { num_compte: compte_id.toString() }],
                company_id: companyId
            }).sort({ createdAt: -1 }).lean();
            if (lastLine) ligne_id = lastLine.localId;
        }

        // 2. VÉRIFIER SI UNE VENTILATION EXISTE DÉJÀ (UPDATE) via agrégation Mongoose
        const existingLana = await CloudBrouillonLigneAnalytique.aggregate([
            {
                $match: {
                    ligne_brouillon_id: ligne_id ? ligne_id.toString() : '',
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

        // 3. CHERCHER LA CONFIGURATION AUTOMATIQUE
        let compteGeneralId = compte_id;
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
        console.error("❌ Erreur checkConfigForSaisieBrouillon:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

// --- 2. ENREGISTREMENT DE LA VENTILATION ---
exports.ventilerEcritureBrouillon = async (req, res) => {
    let { ligne_id, repartitions } = req.body; 
    const context = getContext(req);

    try {
        if (!context.companyId) {
            return res.status(401).json({ success: false, error: "Session invalide." });
        }

        if (!ligne_id || ligne_id === 'null' || ligne_id === 'undefined') {
            const lastLine = await CloudBrouillonLigne.findOne({ company_id: context.companyId }).sort({ createdAt: -1 }).lean();
            if (lastLine) ligne_id = lastLine.localId;
            else return res.status(400).json({ success: false, error: "Ligne introuvable." });
        }

        const ligneBrouillon = await CloudBrouillonLigne.findOne({ 
            localId: ligne_id.toString(), 
            company_id: context.companyId 
        }).lean();

        if (!ligneBrouillon) return res.status(404).json({ success: false, error: "Ligne de brouillard introuvable." });

        const montantAImputer = Math.abs(parseFloat(ligneBrouillon.debit || 0) - parseFloat(ligneBrouillon.credit || 0));
        const verif = BrAnalytiqueService.validerEquilibre(montantAImputer, repartitions);

        if (!verif.isEquilibre) {
            return res.status(400).json({ success: false, error: "DÉSÉQUILIBRE", message: `Attendu: ${verif.attendu}, Saisi: ${verif.totalVentile}` });
        }

        // Nettoyage de l'ancienne ventilation
        await CloudBrouillonLigneAnalytique.deleteMany({ ligne_brouillon_id: ligne_id.toString(), company_id: context.companyId });

        // Insertion des nouvelles lignes analytiques de brouillon
        for (const row of repartitions) {
            const finalDeptId = await BrAnalytiqueService.resolveDeptId(row, context.companyId);
            await CloudBrouillonLigneAnalytique.create({
                localId: BrAnalytiqueService.generateBrLanaId(),
                company_id: context.companyId,
                ligne_brouillon_id: ligne_id.toString(),
                plan_analytique_id: row.plan_analytique_id.toString(),
                departement_id: finalDeptId ? finalDeptId.toString() : null,
                num_compte: ligneBrouillon.num_compte,
                montant: parseFloat(row.montant),
                sync_status: 'synced'
            });
        }

        // 🔥 SIGNAL SOCKET
        if (req.io && context.companyId) {
            const room = String(context.companyId);
            req.io.to(room).emit('DATA_EVENT', { 
                table: 'brouillon_lignes_analytiques', 
                action: 'UPDATE', 
                parent_id: ligne_id 
            });
            req.io.to(room).emit('REFRESH_VENTILATION');
        }

        res.json({ success: true, message: "Ventilation du brouillon enregistrée.", id_utilise: ligne_id });
    } catch (err) {
        console.error("❌ Erreur Ventiler Brouillon:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

// --- 3. DÉTAILS DE LA VENTILATION ---
exports.getDetailsVentilationBrouillon = async (req, res) => {
    const { ligne_id } = req.params;
    const { companyId } = getContext(req);

    try {
        if (!companyId) {
            return res.status(401).json({ success: false, error: "Session invalide." });
        }

        const rows = await CloudBrouillonLigneAnalytique.aggregate([
            {
                $match: {
                    ligne_brouillon_id: ligne_id.toString(),
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
                    montant: 1,
                    plan_code: '$pa.code',
                    plan_nom: '$pa.libelle',
                    dept_nom: '$d.nom'
                }
            }
        ]);

        res.json({ success: true, data: rows });
    } catch (err) {
        console.error("❌ Erreur getDetailsVentilationBrouillon:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

// --- 4. PLAN ANALYTIQUE ---
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
        console.error("❌ Erreur getPlanAnalytique Brouillon:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};