// backend/controllers/clotureJournalier.controller.js
const clotureService = require('../services/clotureJournalier.service');
const { genererEcritureExplicite } = require('../services/ConfigEcrituresAuto.service');

exports.getPendingSync = async (req, res) => {
    try {
        const companyId = req.user?.companyId || req.user?.company_id;
        const { start, end } = req.query; 
        
        // Service passé en async pour le Cloud
        const list = await clotureService.getPendingData(companyId, start, end);
        return res.json({ list });
    } catch (err) { 
        console.error("Erreur getPendingSync:", err.message);
        return res.status(500).json({ error: err.message }); 
    }
};

exports.simulerCloture = async (req, res) => {
    try {
        const companyId = req.user?.companyId || req.user?.company_id;
        const { items } = req.body;
        
        const lignes = await clotureService.simulerEcrituresSelectionnees(items, companyId);
        return res.json({ success: true, lignes });
    } catch (err) { 
        console.error("Erreur simulerCloture:", err.message);
        return res.status(500).json({ error: err.message }); 
    }
};

/**
 * EXÉCUTION DE LA CLÔTURE (Soutient les deux modes)
 */
exports.executerClotureSective = async (req, res) => {
    const companyId = req.user?.companyId || req.user?.company_id;
    const { items, mode } = req.body; // 'CENTRALISE' ou 'DETAIL'

    if (!companyId) return res.status(401).json({ error: "Utilisateur non authentifié." });
    if (!items || items.length === 0) return res.status(400).json({ error: "Aucun élément sélectionné." });

    try {
        if (mode === 'DETAIL') {
            // --- MODE 1 : INJECTION DÉTAILLÉE (PIÈCE PAR PIÈCE) ---
            let succesCount = 0;
            let logs = [];

            for (const item of items) {
                try {
                    const result = await genererEcritureExplicite(
                        item.table_source, 
                        item.id, 
                        companyId
                    );
                    if (result) succesCount++;
                } catch (err) {
                    logs.push({ id: item.id, error: err.message });
                }
            }

            return res.json({ 
                success: true, 
                message: `Injection détaillée terminée : ${succesCount} traité(s).`,
                details: { total: items.length, succes: succesCount, erreurs: logs.length, logs }
            });

        } else {
            // --- MODE 2 : CENTRALISATION (AGRÉGATION PAR COMPTE/JOURNAL) ---
            // 1. Récupération des lignes AGRÉGÉES
            const lignesAInjecter = await clotureService.simulerEcrituresSelectionnees(items, companyId);
            
            // 2. Injection du bloc centralisé
            const resultat = await clotureService.enregistrerCentralisation(lignesAInjecter, items, companyId);

            return res.json({ 
                success: true, 
                message: "Centralisation effectuée avec succès.",
                stats: resultat
            });
        }
    } catch (err) {
        console.error("Erreur exécution clôture:", err.message);
        return res.status(500).json({ error: err.message });
    }
};