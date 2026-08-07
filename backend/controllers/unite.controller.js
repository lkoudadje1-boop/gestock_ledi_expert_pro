const UniteService = require('../services/unite.service');

// 📌 1. Récupérer toutes les unités
exports.getAllUnites = async (req, res) => {
  try {
    const companyId = req.user?.companyId || req.user?.company_id;
    
    if (!companyId) {
        return res.status(401).json({ error: "Session invalide ou expirée." });
    }

    const result = await UniteService.findAll(companyId);
    return res.json(result);
  } catch (error) {
    console.error("❌ ERREUR CONTROLLER GET UNITES:", error.message);
    return res.status(500).json({ error: error.message });
  }
};

// 📌 2. Créer une unité
exports.createUnite = async (req, res) => {
    try {
        const companyId = req.user?.companyId || req.user?.company_id;
        if (!companyId) {
            return res.status(401).json({ error: "Session invalide ou expirée." });
        }

        const { code, libelle, coefficient, unite_reference } = req.body || {};
        
        if (!code || !libelle || !unite_reference) {
            return res.status(400).json({ error: "Le code, le libellé de conversion et l'unité de référence sont obligatoires." });
        }

        const payloadData = {
            code: String(code).trim(),
            libelle: String(libelle).trim(),
            unite_reference: String(unite_reference).trim(),
            coefficient: isNaN(parseFloat(coefficient)) ? 1.0 : parseFloat(coefficient)
        };

        const newId = await UniteService.create(payloadData, req.user);
        return res.status(201).json({ success: true, id: newId });
    } catch (err) {
        console.error("❌ ERREUR CONTROLLER CREATE UNITE:", err.message);
        return res.status(400).json({ error: err.message });
    }
};

// 📌 3. Modifier une unité
exports.updateUnite = async (req, res) => {
    try {
        const companyId = req.user?.companyId || req.user?.company_id;
        if (!companyId) {
            return res.status(401).json({ error: "Session invalide ou expirée." });
        }

        const { code, libelle, coefficient, unite_reference } = req.body || {};
        const updateData = {};
        
        if (code !== undefined) updateData.code = String(code).trim();
        if (libelle !== undefined) updateData.libelle = String(libelle).trim();
        if (unite_reference !== undefined) updateData.unite_reference = String(unite_reference).trim();
        if (coefficient !== undefined) {
            updateData.coefficient = isNaN(parseFloat(coefficient)) ? 1.0 : parseFloat(coefficient);
        }

        await UniteService.update(req.params.id, updateData, req.user);
        return res.json({ success: true });
    } catch (err) {
        console.error("❌ ERREUR CONTROLLER UPDATE UNITE:", err.message);
        return res.status(400).json({ error: err.message });
    }
};

// 📌 4. Supprimer une unité
exports.deleteUnite = async (req, res) => {
    try {
        const companyId = req.user?.companyId || req.user?.company_id;
        if (!companyId) {
            return res.status(401).json({ error: "Session invalide ou expirée." });
        }

        await UniteService.delete(req.params.id, req.user);
        return res.json({ success: true });
    } catch (err) {
        console.error("❌ ERREUR CONTROLLER DELETE UNITE:", err.message);
        return res.status(500).json({ error: err.message || "L'unité est probablement utilisée par un produit." });
    }
};
