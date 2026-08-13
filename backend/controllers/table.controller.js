// backend/controllers/table.controller.js
const TableService = require('../services/table.service');

exports.getAllRows = async (req, res) => {
    try {
        const { tableName } = req.params;
        const companyId = req.user?.companyId || req.user?.company_id;
        if (!companyId) return res.status(401).json({ success: false, error: "Session invalide." });

        const result = await TableService.findAll(tableName, companyId.toString());
        res.json(result);
    } catch (error) {
        console.error(`❌ ERREUR DYNAMIQUE TABLE (GET ON ${req.params.tableName}):`, error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.createRow = async (req, res) => {
    try {
        const { tableName } = req.params;
        const companyId = req.user?.companyId || req.user?.company_id;
        if (!companyId) return res.status(401).json({ success: false, error: "Session invalide." });

        const newId = await TableService.create(tableName, req.body, req.user);
        
        // Notification temps réel via l'instance de socket.io attachée à req
        if (req.io) {
            req.io.to(String(companyId)).emit(`REFRESH_${tableName.toUpperCase()}`, { action: 'CREATE' });
        }

        res.status(201).json({ success: true, id: newId });
    } catch (error) {
        console.error(`❌ ERREUR DYNAMIQUE TABLE (POST ON ${req.params.tableName}):`, error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.updateRow = async (req, res) => {
    try {
        const { tableName, id } = req.params;
        const companyId = req.user?.companyId || req.user?.company_id;
        if (!companyId) return res.status(401).json({ success: false, error: "Session invalide." });

        await TableService.update(tableName, id, req.body, req.user);

        if (req.io) {
            req.io.to(String(companyId)).emit(`REFRESH_${tableName.toUpperCase()}`, { action: 'UPDATE' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error(`❌ ERREUR DYNAMIQUE TABLE (PUT ON ${req.params.tableName}):`, error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.deleteRow = async (req, res) => {
    try {
        const { tableName, id } = req.params;
        const companyId = req.user?.companyId || req.user?.company_id;
        if (!companyId) return res.status(401).json({ success: false, error: "Session invalide." });

        await TableService.delete(tableName, id, req.user);

        if (req.io) {
            req.io.to(String(companyId)).emit(`REFRESH_${tableName.toUpperCase()}`, { action: 'DELETE' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error(`❌ ERREUR DYNAMIQUE TABLE (DELETE ON ${req.params.tableName}):`, error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};