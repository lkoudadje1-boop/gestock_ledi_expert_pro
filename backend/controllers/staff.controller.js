const { getDb } = require('../config/database');
const { logAction } = require('../utils/auditHelper');
const StaffService = require('../services/staff.service');

// Utilitaire de contexte harmonisé
const getContext = (req) => {
    const user = req.user || {};
    const companyId = user.companyId || user.company_id;
    return {
        companyId: companyId,
        userId: user.userId || user.id,
        userName: 'user' // ✅ Consigne [2026-02-08] : Utiliser uniquement 'user' ou 'utilisateur'
    };
};

/**
 * Récupérer tout le personnel
 */
exports.getAllStaff = async (req, res) => {
    const { companyId } = getContext(req);
    try {
        if (!companyId) return res.status(401).json({ error: "Session invalide." });
        const staff = await StaffService.findAll(companyId);
        res.json(staff);
    } catch (error) {
        console.error("🔥 Erreur récupération staff:", error.message);
        res.status(500).json({ error: "Erreur lors de la récupération du personnel" });
    }
};

/**
 * Ajouter un nouvel employé
 */
exports.createStaff = async (req, res) => {
    const db = getDb();
    const context = getContext(req);
    
    if (!context.companyId) return res.status(401).json({ error: "ID entreprise manquant." });

    const data = StaffService.formatData(req.body);
    const newStaffId = StaffService.genererIdStaff();

    try {
        db.transaction(() => {
            // 1. Insertion locale
            db.prepare(`
                INSERT INTO staff (
                    id, name, phone, email, adresse, nif, cnss, 
                    fonction, company_id, is_active, sync_status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
            `).run(newStaffId, data.name, data.phone, data.email, data.adresse, data.nif, data.cnss, data.fonction, context.companyId, data.is_active);

            // 2. Synchro Cloud
            db.prepare(`
                INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
                VALUES ('staff', ?, 'INSERT', ?)
            `).run(newStaffId, context.companyId);

            // 3. Audit Log
            logAction({
                userId: context.userId, 
                userName: context.userName, 
                actionType: 'INSERTION',
                tableConcernee: 'staff', 
                referenceId: newStaffId,
                description: `Création de l'employé : ${data.name}`,
                companyId: context.companyId
            });
        })();

        // 🔥 SIGNAL SOCKET HARMONISÉ
        if (req.io) {
            const room = String(context.companyId);
            // Signal universel pour la synchro
            req.io.to(room).emit('DATA_EVENT', { 
                table: 'staff', 
                action: 'INSERT', 
                id: newStaffId 
            });
            // Signal UI spécifique
            req.io.to(room).emit('STAFF_UPDATED', { type: 'CREATE', name: data.name });
        }

        res.status(201).json({ success: true, id: newStaffId, message: "Employé créé avec succès" });
    } catch (error) {
        res.status(500).json({ error: "Erreur lors de la création : " + error.message });
    }
};

/**
 * Modifier la fiche d'un employé
 */
exports.updateStaff = async (req, res) => {
    const db = getDb();
    const { id } = req.params;
    const context = getContext(req);

    if (!context.companyId) return res.status(401).json({ error: "Non autorisé." });

    const data = StaffService.formatData(req.body);

    try {
        db.transaction(() => {
            const oldStaff = db.prepare('SELECT name FROM staff WHERE id = ? AND company_id = ?').get(id, context.companyId);
            if (!oldStaff) throw new Error("Employé non trouvé");

            // 1. Mise à jour locale
            db.prepare(`
                UPDATE staff SET 
                    name = ?, phone = ?, email = ?, adresse = ?, 
                    nif = ?, cnss = ?, fonction = ?, is_active = ?,
                    sync_status = 'pending', updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND company_id = ?
            `).run(data.name, data.phone, data.email, data.adresse, data.nif, data.cnss, data.fonction, data.is_active, id, context.companyId);

            // 2. Synchro Cloud
            db.prepare(`
                INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
                VALUES ('staff', ?, 'UPDATE', ?)
            `).run(id, context.companyId);

            // 3. Audit Log
            logAction({
                userId: context.userId, 
                userName: context.userName, 
                actionType: 'MODIFICATION',
                tableConcernee: 'staff', 
                referenceId: id,
                description: `Mise à jour employé : ${oldStaff.name} -> ${data.name}`,
                companyId: context.companyId
            });
        })();

        // 🔥 SIGNAL SOCKET HARMONISÉ
        if (req.io) {
            const room = String(context.companyId);
            req.io.to(room).emit('DATA_EVENT', { table: 'staff', action: 'UPDATE', id: id });
            req.io.to(room).emit('STAFF_UPDATED', { type: 'UPDATE', id });
        }

        res.json({ success: true, message: "Fiche employé mise à jour" });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

/**
 * Supprimer un employé
 */
exports.deleteStaff = async (req, res) => {
    const db = getDb();
    const { id } = req.params;
    const context = getContext(req);

    if (!context.companyId) return res.status(401).json({ error: "Non autorisé." });

    try {
        db.transaction(() => {
            const staffToDelete = db.prepare('SELECT name FROM staff WHERE id = ? AND company_id = ?').get(id, context.companyId);
            if (!staffToDelete) throw new Error("Employé introuvable");

            // 1. Synchro Cloud DELETE
            db.prepare(`
                INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
                VALUES ('staff', ?, 'DELETE', ?)
            `).run(id, context.companyId);

            // 2. Suppression locale
            db.prepare("DELETE FROM staff WHERE id = ? AND company_id = ?").run(id, context.companyId);

            // 3. Audit Log
            logAction({
                userId: context.userId, 
                userName: context.userName, 
                actionType: 'SUPPRESSION',
                tableConcernee: 'staff', 
                referenceId: id,
                description: `Suppression de l'employé : ${staffToDelete.name}`,
                companyId: context.companyId
            });
        })();

        // 🔥 SIGNAL SOCKET HARMONISÉ
        if (req.io) {
            const room = String(context.companyId);
            req.io.to(room).emit('DATA_EVENT', { table: 'staff', action: 'DELETE', id: id });
            req.io.to(room).emit('STAFF_UPDATED', { type: 'DELETE', id });
        }

        res.json({ success: true, message: "Employé supprimé" });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};