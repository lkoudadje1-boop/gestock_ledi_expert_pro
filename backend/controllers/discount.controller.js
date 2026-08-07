// backend/controllers/dashboard.controller.js
const { getDb } = require('../config/database'); // On utilise getDb pour éviter l'erreur d'initialisation

exports.getStats = (req, res) => {
    try {
        const db = getDb(); // Récupération de la base ici
        const { companyId } = req.query;

        // Requêtes sécurisées avec une valeur par défaut
        const productCount = db.prepare(
            "SELECT COUNT(*) as total FROM products WHERE company_id = ?"
        ).get(companyId || 1) || { total: 0 };

        const branchCount = db.prepare(
            "SELECT COUNT(*) as total FROM branches WHERE company_id = ?"
        ).get(companyId || 1) || { total: 0 };

        res.json({
            totalProducts: productCount.total,
            totalBranches: branchCount.total,
            stockAlerts: 0,
            dailySales: "0 FCFA"
        });
    } catch (error) {
        console.error("Erreur Stats Dashboard:", error);
        res.status(500).json({ error: "Erreur serveur" });
    }
};