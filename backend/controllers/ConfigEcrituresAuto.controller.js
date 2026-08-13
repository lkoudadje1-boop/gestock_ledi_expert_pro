// backend/controllers/ConfigEcrituresAuto.controller.js
const service = require('../services/ConfigEcrituresAuto.service');

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
        const { companyId } = getCtx(req);
        
        // service.saveSchemaDynamique doit être async dans le modèle Cloud
        const result = await service.saveSchemaDynamique(req.body, companyId); 
        
        if (req.io) {
            const room = String(companyId);
            req.io.to(room).emit('REFRESH_CONFIG_AUTO', { 
                table: req.body.table_source,
                action: 'SAVE' 
            });
            req.io.to(room).emit('DATA_EVENT', { table: 'config_ecritures_auto', action: 'UPDATE' });
        }
        
        return res.json(result);
    } catch (err) { 
        return res.status(400).json({ error: err.message }); 
    }
};

/**
 * 2. Lister les configurations pour une table donnée (Onglet Liste du Front)
 */
exports.listConfigsByTable = async (req, res) => {
    try {
        const { companyId } = getCtx(req);
        const data = await service.listByTable(req.params.tableName, companyId);
        return res.json({ success: true, data });
    } catch (err) { 
        return res.status(500).json({ error: err.message }); 
    }
};

/**
 * 3. Récupérer les colonnes d'une table (Version Cloud)
 */
exports.getTableColumns = async (req, res) => {
    try {
        const { tableName } = req.params;
        
        // Sécurité renforcée
        if (!/^[a-z0-9_]+$/i.test(tableName)) throw new Error("Nom de table invalide.");
        
        // Appelle la version async du service pour récupérer la structure du modèle MongoDB/Mongoose
        const data = await service.getTableColumns(tableName);
        
        return res.json({ success: true, data });
    } catch (err) { 
        return res.status(500).json({ error: err.message }); 
    }
};

/**
 * 4. Supprimer une configuration
 */
exports.supprimerConfig = async (req, res) => {
    try {
        const { companyId } = getCtx(req);
        await service.deleteConfig(req.params.id, companyId);
        
        if (req.io) {
            req.io.to(String(companyId)).emit('DATA_EVENT', { 
                table: 'config_ecritures_auto', 
                action: 'DELETE' 
            });
        }
        
        return res.json({ success: true, message: "Configuration supprimée avec succès." });
    } catch (err) { 
        return res.status(500).json({ error: err.message }); 
    }
};