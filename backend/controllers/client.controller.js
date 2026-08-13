// backend/controllers/client.controller.js
const clientService = require('../services/client.service');

// 📌 GET - Récupérer tous les clients
exports.getAllCustomers = async (req, res) => {
    try {
        const companyId = req.user?.companyId || req.user?.company_id;
        if (!companyId) return res.status(401).json({ error: "Non autorisé." });

        const customers = await clientService.getAllCustomers(companyId);
        return res.json(customers);

    } catch (err) {
        console.error(err.message);
        return res.status(500).json({ error: "Erreur récupération clients." });
    }
};

// 📌 CREATE - Création d'un client
exports.createCustomer = async (req, res) => {
    try {
        const companyId = req.user?.companyId || req.user?.company_id;
        const userId = req.user?.userId || req.user?.id;
        const { nom } = req.body;
        
        if (!nom) return res.status(400).json({ error: "Nom obligatoire." });
        if (!companyId) return res.status(401).json({ error: "Non autorisé." });

        const id = await clientService.createCustomer({
            companyId: companyId,
            userId: userId,
            userName: req.user?.username || "user",
            data: req.body
        });

        if (req.io) {
            const room = companyId.toString();

            // 🔥 SIGNAL UNIVERSEL (Pour ton SocketContext)
            req.io.to(room).emit('DATA_EVENT', { 
                table: 'customers', 
                action: 'INSERT',
                id: id 
            });

            // Signaux spécifiques (compatibilité descendante)
            req.io.to(room).emit('CUSTOMER_CREATED', { id });
            req.io.to(room).emit('REFRESH_UI', { module: 'CUSTOMERS', action: 'CREATE' });
        }

        return res.status(201).json({ success: true, id });

    } catch (err) {
        if (err.code === 11000 || err.message?.includes("UNIQUE") || err.message?.includes("déjà")) {
            return res.status(400).json({ error: "Téléphone ou NIF déjà utilisé." });
        }
        return res.status(500).json({ error: "Erreur création client : " + err.message });
    }
};

// 📌 UPDATE - Modification d'un client
exports.updateCustomer = async (req, res) => {
    try {
        const companyId = req.user?.companyId || req.user?.company_id;
        const userId = req.user?.userId || req.user?.id;
        if (!companyId) return res.status(401).json({ error: "Non autorisé." });

        const result = await clientService.updateCustomer({
            id: req.params.id,
            companyId: companyId,
            userId: userId,
            userName: req.user?.username || "user",
            data: req.body
        });

        if (!result || result.modifiedCount === 0 && result.matchedCount === 0) {
            return res.status(404).json({ error: "Client introuvable." });
        }

        if (req.io) {
            const room = companyId.toString();

            // 🔥 SIGNAL UNIVERSEL
            req.io.to(room).emit('DATA_EVENT', { 
                table: 'customers', 
                action: 'UPDATE',
                id: req.params.id 
            });

            req.io.to(room).emit('REFRESH_UI', {
                module: 'CUSTOMERS',
                action: 'UPDATE',
                id: req.params.id
            });
        }

        return res.json({ success: true });

    } catch (err) {
        if (err.code === 11000 || err.message?.includes("UNIQUE")) {
            return res.status(400).json({ error: "Téléphone déjà utilisé par un autre client." });
        }
        return res.status(500).json({ error: "Erreur modification : " + err.message });
    }
};

// 📌 STATUS - Activer/Archiver un client
exports.updateStatus = async (req, res) => {
    try {
        const companyId = req.user?.companyId || req.user?.company_id;
        const userId = req.user?.userId || req.user?.id;
        if (!companyId) return res.status(401).json({ error: "Non autorisé." });

        const result = await clientService.updateStatus({
            id: req.params.id,
            companyId: companyId,
            userId: userId,
            userName: req.user?.username || "user",
            is_active: req.body.is_active
        });

        if (!result || result.modifiedCount === 0 && result.matchedCount === 0) {
            return res.status(404).json({ error: "Client introuvable." });
        }

        if (req.io) {
            const room = companyId.toString();

            // 🔥 SIGNAL UNIVERSEL
            req.io.to(room).emit('DATA_EVENT', { 
                table: 'customers', 
                action: 'STATUS_CHANGE',
                id: req.params.id 
            });

            req.io.to(room).emit('REFRESH_UI', {
                module: 'CUSTOMERS',
                action: 'STATUS_UPDATE',
                id: req.params.id
            });
        }

        return res.json({ success: true });

    } catch (err) {
        return res.status(500).json({ error: "Erreur lors du changement de statut : " + err.message });
    }
};

// 📌 DELETE - Supprimer un client
exports.deleteCustomer = async (req, res) => {
    try {
        const companyId = req.user?.companyId || req.user?.company_id;
        const userId = req.user?.userId || req.user?.id;
        if (!companyId) return res.status(401).json({ error: "Non autorisé." });

        const result = await clientService.deleteCustomer({
            id: req.params.id,
            companyId: companyId,
            userId: userId,
            userName: req.user?.username || "user"
        });

        if (!result || result.deletedCount === 0) {
            return res.status(404).json({ error: "Client introuvable." });
        }

        if (req.io) {
            const room = companyId.toString();

            // 🔥 SIGNAL UNIVERSEL
            req.io.to(room).emit('DATA_EVENT', { 
                table: 'customers', 
                action: 'DELETE',
                id: req.params.id 
            });

            req.io.to(room).emit('REFRESH_UI', {
                module: 'CUSTOMERS',
                action: 'DELETE',
                id: req.params.id
            });
        }

        return res.json({ success: true });

    } catch (err) {
        return res.status(500).json({ error: "Erreur lors de la suppression : " + err.message });
    }
};