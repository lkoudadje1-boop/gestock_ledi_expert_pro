// backend/controllers/discount.controller.js
const { CloudProduct, CloudBranch } = require('../models/cloud.model');

exports.getStats = async (req, res) => {
    try {
        const companyId = req.companyId || (req.user ? (req.user.companyId || req.user.company_id) : null) || req.query.companyId || '1';

        const productCount = await CloudProduct.countDocuments({ company_id: companyId.toString() });
        const branchCount = await CloudBranch.countDocuments({ company_id: companyId.toString() });

        return res.json({
            totalProducts: productCount,
            totalBranches: branchCount,
            stockAlerts: 0,
            dailySales: "0 FCFA"
        });
    } catch (error) {
        console.error("Erreur Stats Discount/Dashboard:", error);
        return res.status(500).json({ error: "Erreur serveur" });
    }
};