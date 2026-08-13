// backend/controllers/cloturevente.controller.js
const clotureService = require('../services/cloturevente.service');
const mongoose = require('mongoose');

/**
 * Récupère le contexte utilisateur
 */
const getContext = (req) => {
    const user = req.user || {};
    return {
        companyId: user.companyId || user.company_id,
        userId: user.userId || user.id,
        userName: 'user' // Respect consigne [2026-02-08]
    };
};

/**
 * Récupère l'état théorique actuel de la caisse
 */
exports.getTheorique = async (req, res) => {
    try {
        const companyId = req.user?.company_id || req.user?.companyId; 
        const userId = req.user?.id || req.user?.userId;

        if (!companyId) {
            return res.status(400).json({ success: false, error: "ID Entreprise manquant" });
        }

        const data = await clotureService.getEtatTheoriqueActuel(companyId, userId);
        return res.json({ success: true, data });
    } catch (err) {
        console.error("ERREUR getTheorique [Controller]:", err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
};

/**
 * Valide la clôture de caisse et enregistre les détails
 */
exports.valider = async (req, res) => {
    try {
        const context = getContext(req);
        
        if (!context.companyId) {
            return res.status(401).json({ success: false, error: "Session expirée" });
        }

        const { 
            details, 
            total_theorique_global, 
            total_reel_global, 
            solde_ouverture, 
            observation 
        } = req.body;

        if (!details || !Array.isArray(details) || details.length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: "Les détails du comptage par mode de paiement sont obligatoires." 
            });
        }

        const mainData = {
            id: req.body.id || `CLOT-${Date.now().toString().slice(-8)}`,
            caissier_id: context.userId,
            solde_ouverture: Number(solde_ouverture || 0),
            total_theorique_global: Number(total_theorique_global || 0),
            total_reel_global: Number(total_reel_global || 0),
            ecart_global: Number(total_reel_global || 0) - Number(total_theorique_global || 0),
            statut: 'VALIDE',
            observation: observation || "Clôture de session journalière",
            company_id: context.companyId,
            created_by: context.userName 
        };

        const clotureId = await clotureService.validerCloture({
            ...mainData,
            details: details
        }, context);

        if (req.io) {
            req.io.to(context.companyId.toString()).emit('DATA_EVENT', { 
                table: 'clotures_caisse', 
                action: 'INSERT', 
                id: clotureId,
                timestamp: new Date().toISOString()
            });
        }

        return res.status(201).json({ 
            success: true, 
            message: "Caisse clôturée avec succès", 
            id: clotureId 
        });

    } catch (err) {
        console.error("Erreur Clôture [Controller]:", err.message);
        return res.status(400).json({ 
            success: false, 
            error: err.message 
        });
    }
};

/**
 * Récupère l'historique complet + Sessions "En cours"
 */
exports.getHistory = async (req, res) => {
    try {
        const { companyId } = getContext(req);
        if (!companyId) return res.status(401).json({ success: false, error: "Session invalide" });

        // 1. Historique validé (Cloud)
        const validatedHistory = await clotureService.getHistory(companyId) || [];

        // 2. Récupérer sessions actives (Cloud aggregation)
        const enCoursData = await clotureService.getSessionsActives(companyId) || [];

        // 3. Fusionner : Sessions "En cours" en premier
        return res.json({ 
            success: true, 
            data: [...enCoursData, ...validatedHistory] 
        });

    } catch (err) {
        console.error("Erreur History [Controller]:", err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
};