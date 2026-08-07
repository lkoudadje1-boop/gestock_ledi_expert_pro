const clientService = require('../services/client.service');

// 📌 GET - Récupérer tous les clients
exports.getAllCustomers = (req, res) => {
    try {
        const companyId = req.user?.companyId;
        if (!companyId) return res.status(401).json({ error: "Non autorisé." });

        const customers = clientService.getAllCustomers(companyId);
        res.json(customers);

    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "Erreur récupération clients." });
    }
};

// 📌 CREATE - Création d'un client
exports.createCustomer = (req, res) => {
    try {
        const { nom } = req.body;
        if (!nom) return res.status(400).json({ error: "Nom obligatoire." });

        const id = clientService.createCustomer({
            companyId: req.user.companyId,
            userId: req.user.userId,
            userName: req.user.username,
            data: req.body
        });

        if (req.io) {
            const room = req.user.companyId.toString();

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

        res.status(201).json({ success: true, id });

    } catch (err) {
        if (err.message?.includes("UNIQUE")) {
            return res.status(400).json({ error: "Téléphone ou NIF déjà utilisé." });
        }
        res.status(500).json({ error: "Erreur création client." });
    }
};

// 📌 UPDATE - Modification d'un client
exports.updateCustomer = (req, res) => {
    try {
        const result = clientService.updateCustomer({
            id: req.params.id,
            companyId: req.user.companyId,
            userId: req.user.userId,
            userName: req.user.username,
            data: req.body
        });

        if (!result || result.changes === 0) {
            return res.status(404).json({ error: "Client introuvable." });
        }

        if (req.io) {
            const room = req.user.companyId.toString();

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

        res.json({ success: true });

    } catch (err) {
        if (err.message?.includes("UNIQUE")) {
            return res.status(400).json({ error: "Téléphone déjà utilisé par un autre client." });
        }
        res.status(500).json({ error: "Erreur modification." });
    }
};

// 📌 STATUS - Activer/Archiver un client
exports.updateStatus = (req, res) => {
    try {
        const result = clientService.updateStatus({
            id: req.params.id,
            companyId: req.user.companyId,
            userId: req.user.userId,
            userName: req.user.username,
            is_active: req.body.is_active
        });

        if (!result || result.changes === 0) {
            return res.status(404).json({ error: "Client introuvable." });
        }

        if (req.io) {
            const room = req.user.companyId.toString();

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

        res.json({ success: true });

    } catch (err) {
        res.status(500).json({ error: "Erreur lors du changement de statut." });
    }
};

// 📌 DELETE - Supprimer un client
exports.deleteCustomer = (req, res) => {
    try {
        const result = clientService.deleteCustomer({
            id: req.params.id,
            companyId: req.user.companyId,
            userId: req.user.userId,
            userName: req.user.username
        });

        if (!result || result.changes === 0) {
            return res.status(404).json({ error: "Client introuvable." });
        }

        if (req.io) {
            const room = req.user.companyId.toString();

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

        res.json({ success: true });

    } catch (err) {
        res.status(500).json({ error: "Erreur lors de la suppression." });
    }
};