// backend/controllers/RegleConsignation.Controller.js
const regleConsignationService = require('../services/RegleConsignation.services');

// ======================================================
// --- FONCTION UTILITAIRE INTERNE (ANTI-ERREUR CHECK) ---
// ======================================================
/**
 * Nettoie et normalise les types de calcul reçus de l'UI
 * pour correspondre aux contraintes de la base de données Cloud.
 */
const formaterTiersPourDonneesBrutes = (tiers) => {
    return (tiers || []).map(t => {
        let typeNettoye = t.type_calcul;

        // Équivalence entre les libellés textuels UI et les valeurs normalisées
        if (typeNettoye === 'POURCENTAGE REPRISE (%)') typeNettoye = 'POURCENTAGE_REPRISE';
        if (typeNettoye === 'MONTANT FIXE PENALITE')  typeNettoye = 'MONTANT_FIXE_PENALITE';
        if (typeNettoye === 'CONSIDERE VENDU')        typeNettoye = 'CONSIDERE_VENDU';

        return {
            ...t,
            type_calcul: typeNettoye
        };
    });
};

// ======================================================
// --- ACTIONS DU CONTRÔLEUR ---
// ======================================================

// --- RÉCUPÉRER TOUTES LES RÈGLES ---
exports.getAllRules = async (req, res) => {
    try {
        const companyId = req.user?.companyId || req.user?.company_id;
        if (!companyId) return res.status(401).json({ success: false, error: "Non autorisé. Identifiant entreprise manquant." });

        const items = await regleConsignationService.getAllRules(companyId);
        res.json(items);
    } catch (err) {
        console.error("Erreur dans getAllRules:", err);
        res.status(500).json({ success: false, error: "Erreur lors du chargement des règles de consignation." });
    }
};

// --- RÉCUPÉRER UNE RÈGLE UNIQUE VIA ID ---
exports.getRuleById = async (req, res) => {
    try {
        const { id } = req.params;
        const companyId = req.user?.companyId || req.user?.company_id;
        if (!companyId) return res.status(401).json({ success: false, error: "Non autorisé. Identifiant entreprise manquant." });

        const rule = await regleConsignationService.getRuleById(id, companyId);
        if (!rule) return res.status(404).json({ success: false, error: "La règle demandée reste introuvable." });

        res.json(rule);
    } catch (err) {
        console.error("Erreur dans getRuleById:", err);
        res.status(500).json({ success: false, error: "Erreur lors du chargement de la règle." });
    }
};

// --- CRÉER UNE RÈGLE ET SES COMPOSANTS ---
exports.createRule = async (req, res) => {
    try {
        const companyId = req.user?.companyId || req.user?.company_id;
        const userId = req.user?.userId || req.user?.id;
        const userName = req.user?.username || req.user?.nom || "Système";

        if (!companyId) return res.status(401).json({ success: false, error: "Non autorisé. Session expirée ou invalide." });

        const { code_regle, libelle, tiers } = req.body;
        if (!code_regle || !libelle) {
            return res.status(400).json({ success: false, error: "Le matricule/code de la règle ainsi que son libellé descriptif sont obligatoires." });
        }

        // Nettoyage des tranches avant traitement par le service
        const tiersFormates = formaterTiersPourDonneesBrutes(tiers);

        const ruleId = await regleConsignationService.createRuleWithTiers({
            companyId,
            userId,
            userName,
            data: { code_regle, libelle, tiers: tiersFormates }
        });

        // Diffusion temps réel multi-fenêtres via WebSockets
        if (req.io) {
            const room = companyId.toString();
            req.io.to(room).emit('DATA_EVENT', { table: 'packaging_rules', action: 'INSERT', id: ruleId });
            req.io.to(room).emit('REFRESH_UI', { module: 'PACKAGING_RULES', action: 'CREATE' });
        }

        res.status(201).json({ success: true, id: ruleId });
    } catch (err) {
        console.error("Erreur dans createRule:", err);
        res.status(400).json({ success: false, error: err.message || "Erreur lors de la validation ou insertion de la règle." });
    }
};

// --- METTRE À JOUR UNE RÈGLE ET RECONSTRUIRE SES TRANCHES ---
exports.updateRule = async (req, res) => {
    try {
        const { id } = req.params;
        const companyId = req.user?.companyId || req.user?.company_id;
        const userId = req.user?.userId || req.user?.id;
        const userName = req.user?.username || req.user?.nom || "Système";

        if (!companyId) return res.status(401).json({ success: false, error: "Non autorisé. Session expirée." });

        const { code_regle, libelle, tiers } = req.body;
        if (!code_regle || !libelle) {
            return res.status(400).json({ success: false, error: "Le code et le libellé ne peuvent pas être enregistrés vides." });
        }

        // Nettoyage des tranches avant traitement par le service
        const tiersFormates = formaterTiersPourDonneesBrutes(tiers);

        const result = await regleConsignationService.updateRuleWithTiers({
            id,
            companyId,
            userId,
            userName,
            data: { code_regle, libelle, tiers: tiersFormates }
        });

        if (req.io && result.modifiedCount > 0) {
            const room = companyId.toString();
            req.io.to(room).emit('DATA_EVENT', { table: 'packaging_rules', action: 'UPDATE', id });
            req.io.to(room).emit('REFRESH_UI', { module: 'PACKAGING_RULES', action: 'UPDATE' });
        }

        res.json({ success: true });
    } catch (err) {
        console.error("Erreur dans updateRule:", err);
        res.status(400).json({ success: false, error: err.message || "Erreur lors de la mise à jour structurelle de la règle." });
    }
};

// --- SUPPRIMER DÉFINITIVEMENT UNE RÈGLE ---
exports.deleteRule = async (req, res) => {
    try {
        const { id } = req.params;
        const companyId = req.user?.companyId || req.user?.company_id;
        const userId = req.user?.userId || req.user?.id;
        const userName = req.user?.username || req.user?.nom || "Système";

        if (!companyId) return res.status(401).json({ success: false, error: "Non autorisé." });

        // Vérification d'intégrité référentielle applicative
        const isLinked = await regleConsignationService.isRuleLinkedToPackaging(id, companyId);
        if (isLinked) {
            return res.status(400).json({ 
                success: false, 
                error: "Action impossible : Cette règle applique son barème sur des emballages encore référencés au sein de votre stock." 
            });
        }

        const result = await regleConsignationService.deleteRule({ id, companyId, userId, userName });

        if (req.io && result.deletedCount > 0) {
            const room = companyId.toString();
            req.io.to(room).emit('DATA_EVENT', { table: 'packaging_rules', action: 'DELETE', id });
            req.io.to(room).emit('REFRESH_UI', { module: 'PACKAGING_RULES', action: 'DELETE' });
        }

        res.json({ success: true });
    } catch (err) {
        console.error("Erreur dans deleteRule:", err);
        res.status(500).json({ success: false, error: "Échec système lors du traitement de suppression de la règle de consignation." });
    } 
};

// --- SIMULATION DU TARIF DE REMBOURSEMENT ---
exports.getSimulationRemboursement = async (req, res) => {
    try {
        const companyId = req.user?.companyId || req.user?.company_id;
        if (!companyId) return res.status(401).json({ success: false, error: "Non autorisé." });

        const { packaging_id, date_consignation } = req.query;
        if (!packaging_id || !date_consignation) {
            return res.status(400).json({ success: false, error: "Paramètres manquants pour le calcul automatique." });
        }

        // Appel au service Cloud sécurisé
        const simulation = await regleConsignationService.simulerPrixRemboursement(packaging_id, date_consignation, companyId);

        // Envoi de la réponse alignée sur les variables attendues par l'UI React
        res.json({ 
            success: true,
            prixRemboursementUnitaire: simulation.prix_unitaire_remboursement,
            joursEcoules: simulation.jours_ecoules,
            montantPenaliteUnitaire: simulation.montant_penalite_unitaire
        });
    } catch (err) {
        console.error("Erreur dans getSimulationRemboursement:", err);
        res.status(500).json({ success: false, error: "Erreur lors du calcul automatique de la règle." });
    }
};