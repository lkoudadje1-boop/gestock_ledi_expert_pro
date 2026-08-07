// backend\controllers\cloturevente.controller.js
const clotureService = require('../services/cloturevente.service');

/**
 * Récupère le contexte utilisateur en respectant les consignes de sécurité
 * @param {Object} req - La requête Express
 */
const getContext = (req) => {
    const user = req.user || {};
    return {
        companyId: user.companyId || user.company_id,
        userId: user.userId || user.id,
        userName: 'user' // Application stricte de la consigne [2026-02-08]
    };
};

/**
 * Récupère l'état théorique actuel de la caisse pour le caissier
 */
exports.getTheorique = async (req, res) => {
    try {
        // Ajoute ces logs pour voir ce qui arrive réellement du token
        console.log("DEBUG - User Object from Token:", req.user);

        const companyId = req.user?.company_id || req.user?.companyId; 
        const userId = req.user?.id;

        if (!companyId) {
            return res.status(400).json({ success: false, error: "ID Entreprise manquant" });
        }

        const data = await clotureService.getEtatTheoriqueActuel(companyId, userId);
        res.json({ success: true, data });
    } catch (err) {
        console.error("ERREUR 500 DETECTÉE:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

/**
 * Valide la clôture de caisse et enregistre les détails avec commentaires
 */
exports.valider = (req, res) => {
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

        // 1. Validation de la présence des détails
        if (!details || !Array.isArray(details) || details.length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: "Les détails du comptage par mode de paiement sont obligatoires." 
            });
        }

        // 2. Préparation du payload pour la table 'clotures_caisse'
        const mainData = {
            // Génération ID selon format standard ou timestamp
            id: req.body.id || `CLOT-${Date.now().toString().slice(-8)}`,
            caissier_id: context.userId,
            solde_ouverture: Number(solde_ouverture || 0),
            total_theorique_global: Number(total_theorique_global || 0),
            total_reel_global: Number(total_reel_global || 0),
            // Calcul automatique de l'écart global
            ecart_global: Number(total_reel_global || 0) - Number(total_theorique_global || 0),
            statut: 'VALIDE',
            observation: observation || "Clôture de session journalière",
            company_id: context.companyId,
            sync_status: 'pending',
            created_by: context.userName 
        };

        // 3. Appel au service
        // Note : On ne passe plus 'explications' car elles sont intégrées dans 'details'
        const clotureId = clotureService.validerCloture({
            ...mainData,
            details: details
        }, context);

        // 4. Notification Temps Réel via Socket.io
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
 * Récupère l'historique des clôtures pour l'entreprise
 */
/**
 * Récupère l'historique complet + Sessions "En cours" (Statut 0)
 */
exports.getHistory = (req, res) => {
    try {
        const { companyId } = getContext(req);
        const db = require('../config/database').getDb();

        // 1. Récupérer l'historique des clôtures validées/archivées
        const validatedHistory = clotureService.getHistory(companyId) || [];

        // 2. Récupérer TOUS les utilisateurs qui ont des paiements non clôturés
        // On réutilise la logique de ta requête de service mais groupée par utilisateur
        const sessionsActives = db.prepare(`
            SELECT 
                u.id as caissier_id,
                u.username as utilisateur,
                JSON_GROUP_ARRAY(
                    JSON_OBJECT(
                        'methode', pm.libelle,
                        'theorique', IFNULL(p.montant_calcule, 0),
                        'reel', 0,
                        'ecart', -IFNULL(p.montant_calcule, 0),
                        'commentaire', 'Session ouverte'
                    )
                ) as tous_details,
                SUM(IFNULL(p.montant_calcule, 0)) as attendu
            FROM users u
            CROSS JOIN payment_methods pm
            LEFT JOIN (
                SELECT payment_method_id, user_id, SUM(montant) as montant_calcule
                FROM payments 
                WHERE company_id = ? AND cloture_id IS NULL
                GROUP BY payment_method_id, user_id
            ) p ON p.payment_method_id = pm.id AND p.user_id = u.id
            WHERE u.company_id = ? AND pm.company_id = ? AND pm.is_active = 1
            GROUP BY u.id
            HAVING attendu > 0 -- On n'affiche que s'il y a de l'argent en caisse
        `).all(companyId, companyId, companyId);

        // 3. Formater les sessions actives pour correspondre à la structure de l'historique
        const enCoursData = sessionsActives.map(s => ({
            id: `ACTIVE-${s.caissier_id}`,
            caissier_id: s.caissier_id,
            utilisateur: s.utilisateur,
            attendu: s.attendu,
            reel: 0,
            ecart: -s.attendu,
            statut: 'OUVERT', // Statut textuel pour SQL
            is_cloture: 0,    // Indicateur numérique pour ton onglet Front
            date_cloture: new Date().toISOString(),
            note_cloture: "Ventes en cours de session",
            tous_details: JSON.parse(s.tous_details)
        }));

        // 4. Fusionner : Les sessions "En cours" en premier, puis l'historique
        res.json({ 
            success: true, 
            data: [...enCoursData, ...validatedHistory] 
        });

    } catch (err) {
        console.error("Erreur History [Controller]:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};