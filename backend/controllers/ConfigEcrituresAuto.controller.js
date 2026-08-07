const service = require('../services/ConfigEcrituresAuto.service');
const { getDb } = require('../config/database');

/**
 * Utilitaire pour extraire le contexte entreprise proprement
 */
const getCtx = (req) => {
    const user = req.user || {};
    return { companyId: user.companyId || user.company_id };
};

/**
 * 1. Enregistrer ou mettre à jour une configuration
 */
exports.saveSchema = async (req, res) => {
    try {
        const { companyId } = getCtx(req); // On extrait juste l'ID
        
        // On passe companyId directement
        const result = service.saveSchemaDynamique(req.body, companyId); 
        
        if (req.io) {
            const room = String(companyId);
            req.io.to(room).emit('REFRESH_CONFIG_AUTO', { 
                table: req.body.table_source,
                action: 'SAVE' 
            });
            req.io.to(room).emit('DATA_EVENT', { table: 'config_ecritures_auto', action: 'UPDATE' });
        }
        
        res.json(result);
    } catch (err) { 
        res.status(400).json({ error: err.message }); 
    }
};

/**
 * 2. Lister les configurations pour une table donnée (Onglet Liste du Front)
 */
exports.listConfigsByTable = (req, res) => {
    try {
        const { companyId } = getCtx(req);
        const data = service.listByTable(req.params.tableName, companyId);
        res.json({ success: true, data });
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
};

/**
 * 3. Récupérer les colonnes d'une table SQL (Version Nettoyée)
 */
exports.getTableColumns = (req, res) => {
    try {
        const { tableName } = req.params;
        
        // Sécurité anti-injection
        if (!/^[a-z0-9_]+$/i.test(tableName)) throw new Error("Table invalide.");
        
        // 🔥 On appelle la fonction PROPRE du service que tu as ajoutée à la fin
        const data = service.getTableColumns(tableName);
        
        res.json({ success: true, data });
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
};

/**
 * 4. Supprimer une configuration
 */
exports.supprimerConfig = (req, res) => {
    try {
        const { companyId } = getCtx(req);
        service.deleteConfig(req.params.id, companyId);
        
        if (req.io) {
            req.io.to(String(companyId)).emit('DATA_EVENT', { 
                table: 'config_ecritures_auto', 
                action: 'DELETE' 
            });
        }
        
        res.json({ success: true, message: "Configuration supprimée avec succès." });
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
};
