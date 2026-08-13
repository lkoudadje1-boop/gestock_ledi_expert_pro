// backend/controllers/familleCategGroup.controller.js
const service = require('../services/familleCategGroup.service');
const InventoryService = require('../services/inventory.service');

// 📌 RECUPERATION GENERIQUE
exports.getAll = async (req, res) => {
    try {
        const companyId = req.user?.companyId || req.user?.company_id;
        const data = await service.getAll(req.params.type, companyId);
        return res.json(data);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

// 📌 CREATION GENERIQUE
exports.create = async (req, res) => {
    try {
        const companyId = req.user?.companyId || req.user?.company_id;

        // 🛡️ VERROU INVENTAIRE
        const invStatus = await InventoryService.checkStatus(companyId);
        if (invStatus.en_cours) {
            return res.status(403).json({ 
                error: "OPÉRATION BLOQUÉE : Un inventaire est en cours. Impossible de modifier la structure des produits (familles, catégories, groupes) pour garantir la précision des rapports d'écarts." 
            });
        }

        const id = await service.create({
            type: req.params.type,
            data: req.body,
            companyId: companyId,
            userId: req.user?.id || req.user?.userId,
            userName: 'user' // Respect consigne [2026-02-08]
        });

        if (req.io) {
            const room = companyId.toString();
            req.io.to(room).emit('DATA_EVENT', { table: 'products_structure', action: 'INSERT', subModule: req.params.type.toUpperCase() });
            req.io.to(room).emit('REFRESH_UI', { module: 'PRODUCTS', action: 'CREATE_STRUCTURE' });
        }
        return res.status(201).json({ success: true, id });
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }
};

// 📌 MODIFICATION STATUT (ACTIVATION / ARCHIVAGE)
exports.updateStatus = async (req, res) => {
    try {
        const companyId = req.user?.companyId || req.user?.company_id;

        const invStatus = await InventoryService.checkStatus(companyId);
        if (invStatus.en_cours) {
            return res.status(403).json({ 
                error: "OPÉRATION BLOQUÉE : Un inventaire est en cours. Impossible de modifier le statut de la structure pour le moment." 
            });
        }

        const result = await service.updateStatus({
            type: req.params.type,
            id: req.params.id,
            is_active: req.body.is_active,
            companyId: companyId,
            userId: req.user?.id || req.user?.userId,
            userName: 'user'
        });

        if (result && req.io) {
            const room = companyId.toString();
            req.io.to(room).emit('DATA_EVENT', { table: 'products_structure', action: 'UPDATE' });
            req.io.to(room).emit('REFRESH_UI', { module: 'PRODUCTS', action: 'UPDATE_STATUS' });
        }
        return res.json({ success: true });
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }
};

exports.update = async (req, res) => {
    try {
        const companyId = req.user?.companyId || req.user?.company_id;

        const invStatus = await InventoryService.checkStatus(companyId);
        if (invStatus.en_cours) {
            return res.status(403).json({ 
                error: "OPÉRATION BLOQUÉE : Un inventaire est en cours. Impossible de modifier la structure." 
            });
        }

        await service.update({
            type: req.params.type,  
            id: req.params.id,      
            data: req.body,         
            companyId: companyId,
            userId: req.user?.id || req.user?.userId,
            userName: 'user'
        });

        if (req.io) {
            const room = companyId.toString();
            req.io.to(room).emit('DATA_EVENT', { table: 'products_structure', action: 'UPDATE' });
            req.io.to(room).emit('REFRESH_UI', { module: 'PRODUCTS', action: 'STRUCTURE_NOM_CHANGED' });
        }

        return res.json({ success: true, message: "Structure mise à jour avec succès !" });
    } catch (err) {
        console.error("❌ Erreur de modification structure :", err.message);
        return res.status(400).json({ error: err.message });
    }
};

// 📌 EXPORTATION CSV
exports.exportData = async (req, res) => {
    const { type } = req.params;
    const companyId = req.user?.companyId || req.user?.company_id;

    try {
        const data = await service.getAll(type, companyId);
        const SEP = ";", NL = "\r\n", BOM = "\ufeff";
        
        let csv = "";
        if (type === 'familles') {
            csv = `TYPE${SEP}DESIGNATION${SEP}ETAT${NL}`;
        } else if (type === 'categories') {
            csv = `TYPE${SEP}DESIGNATION${SEP}NOM_FAMILLE_PARENTE${SEP}ETAT${NL}`;
        } else {
            csv = `TYPE${SEP}DESIGNATION${SEP}NOM_CATEGORIE_PARENTE${SEP}ETAT${NL}`;
        }

        const typeCode = type === 'familles' ? 'FAM' : (type === 'categories' ? 'CAT' : 'GRP');

        data.forEach(row => {
            const nom = row.nom || row.NOM || "";
            const active = (row.is_active !== undefined ? row.is_active : row.IS_ACTIVE) == 1 ? "ACTIF" : "ARCHIVE";
            const parentNom = row.famille_nom || row.category_nom || "";
            const nomEscaped = `"${nom.replace(/"/g, '""')}"`;
            
            if (type === 'familles') {
                csv += `${typeCode}${SEP}${nomEscaped}${SEP}${active}${NL}`;
            } else {
                csv += `${typeCode}${SEP}${nomEscaped}${SEP}"${parentNom}"${SEP}${active}${NL}`;
            }
        });

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=Gabarit_${type}.csv`);
        return res.status(200).send(BOM + csv);
    } catch (err) {
        return res.status(500).send("Erreur lors de l'exportation.");
    }
};

// 📌 IMPORTATION MASSIVE CSV
exports.processMassiveImport = async (req, res) => {
    const { type } = req.params;
    const companyId = req.user?.companyId || req.user?.company_id;

    if (!req.file) return res.status(400).json({ error: "Fichier CSV manquant." });

    try {
        const invStatus = await InventoryService.checkStatus(companyId);
        if (invStatus.en_cours) {
            return res.status(403).json({ 
                success: false, 
                error: "IMPORTATION IMPOSSIBLE : Un inventaire est en cours. La structure des articles ne peut pas être modifiée tant que l'inventaire n'est pas clôturé ou annulé." 
            });
        }

        const expectedType = type === 'familles' ? 'FAM' : (type === 'categories' ? 'CAT' : 'GRP');
        const csvRaw = req.file.buffer.toString('utf8').replace(/^\ufeff/, '');
        const lines = csvRaw.split(/\r?\n/).filter(l => l.trim() !== "").slice(1);
        
        const rawItems = lines.map((line, index) => {
            const cols = line.split(';').map(c => c.trim().replace(/^"|"$/g, ''));
            
            if (cols[0] !== expectedType) {
                throw new Error(`Ligne ${index + 2} : Type incorrect. Attendu : ${expectedType}, Reçu : ${cols[0]}`);
            }

            return {
                nom: cols[1],
                parentNom: type !== 'familles' ? cols[2] : null,
                is_active: (cols[type === 'familles' ? 2 : 3] === 'ACTIF') ? 1 : 0
            };
        }).filter(item => item.nom);

        const modifiedReqUser = { ...req.user, userName: 'user' };
        await service.processMassiveImport(type, rawItems, modifiedReqUser);

        if (req.io) {
            req.io.to(String(companyId)).emit('DATA_EVENT', { table: 'products_structure', action: 'IMPORT' });
        }
        return res.json({ success: true, message: `${rawItems.length} éléments importés.` });
    } catch (err) {
        return res.status(400).json({ success: false, error: err.message });
    }
};