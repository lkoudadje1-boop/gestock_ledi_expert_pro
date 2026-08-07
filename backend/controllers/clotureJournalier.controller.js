const clotureService = require('../services/clotureJournalier.service');
// On s'assure d'importer le service d'injection explicite (détaillé)
const { genererEcritureExplicite } = require('../services/ConfigEcrituresAuto.service');

exports.getPendingSync = async (req, res) => {
    try {
        const companyId = req.userContext?.companyId || req.user?.companyId;
        const { start, end } = req.query; 
        const list = clotureService.getPendingData(companyId, start, end);
        res.json({ list });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.simulerCloture = async (req, res) => {
    try {
        const companyId = req.userContext?.companyId || req.user?.companyId;
        const { items } = req.body;
        const lignes = clotureService.simulerEcrituresSelectionnees(items, companyId);
        res.json({ success: true, lignes });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

/**
 * EXÉCUTION DE LA CLÔTURE (Soutient les deux modes)
 */
exports.executerClotureSective = async (req, res) => {
    const companyId = req.userContext?.companyId || req.user?.companyId;
    const { items, mode } = req.body; // 'CENTRALISE' ou 'DETAIL'

    if (!items || items.length === 0) return res.status(400).json({ error: "Aucun élément sélectionné." });

    try {
        if (mode === 'DETAIL') {
            // --- MODE 1 : INJECTION DÉTAILLÉE (PIÈCE PAR PIÈCE) ---
            let succesCount = 0;
            let logs = [];

            for (const item of items) {
                try {
                    // On utilise le service qui traite chaque table_source individuellement
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
            const lignesAInjecter = clotureService.simulerEcrituresSelectionnees(items, companyId);
            
            // 2. Injection du bloc centralisé
            const resultat = clotureService.enregistrerCentralisation(lignesAInjecter, items, companyId);

            return res.json({ 
                success: true, 
                message: "Centralisation effectuée avec succès.",
                stats: resultat
            });
        }
    } catch (err) {
        console.error("Erreur exécution clôture:", err.message);
        res.status(500).json({ error: err.message });
    }
};