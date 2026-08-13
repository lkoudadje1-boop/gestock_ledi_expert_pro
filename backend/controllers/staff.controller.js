// backend/controllers/staff.controller.js
const { logAction } = require('../utils/auditHelper');
const StaffService = require('../services/staff.service');
const { CloudStaff } = require('../models/cloud.model');

// Utilitaire de contexte harmonisé
const getContext = (req) => {
    const user = req.user || {};
    const companyId = user.companyId || user.company_id;
    return {
        companyId: companyId ? companyId.toString() : null,
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
        if (!companyId) return res.status(401).json({ success: false, error: "Session invalide." });
        const staff = await StaffService.findAll(companyId);
        res.json(staff);
    } catch (error) {
        console.error("🔥 Erreur récupération staff:", error.message);
        res.status(500).json({ success: false, error: "Erreur lors de la récupération du personnel" });
    }
};

/**
 * Ajouter un nouvel employé
 */
exports.createStaff = async (req, res) => {
    const context = getContext(req);
    
    if (!context.companyId) return res.status(401).json({ success: false, error: "ID entreprise manquant." });

    const data = StaffService.formatData(req.body);
    const newStaffId = StaffService.genererIdStaff();

    try {
        // 1. Insertion Cloud avec Mongoose
        await CloudStaff.create({
            localId: newStaffId,
            name: data.name,
            phone: data.phone,
            email: data.email,
            adresse: data.adresse,
            nif: data.nif,
            cnss: data.cnss,
            fonction: data.fonction,
            company_id: context.companyId,
            is_active: data.is_active,
            sync_status: 'synced'
        });

        // 2. Audit Log
        await logAction({
            userId: context.userId, 
            userName: context.userName, 
            actionType: 'INSERTION',
            tableConcernee: 'staff', 
            referenceId: newStaffId,
            description: `Création de l'employé : ${data.name}`,
            companyId: context.companyId
        });

        // 🔥 SIGNAL SOCKET HARMONISÉ
        if (req.io) {
            const room = String(context.companyId);
            req.io.to(room).emit('DATA_EVENT', { 
                table: 'staff', 
                action: 'INSERT', 
                id: newStaffId 
            });
            req.io.to(room).emit('STAFF_UPDATED', { type: 'CREATE', name: data.name });
        }

        res.status(201).json({ success: true, id: newStaffId, message: "Employé créé avec succès" });
    } catch (error) {
        console.error("❌ Erreur createStaff:", error.message);
        res.status(500).json({ success: false, error: "Erreur lors de la création : " + error.message });
    }
};

/**
 * Modifier la fiche d'un employé
 */
exports.updateStaff = async (req, res) => {
    const { id } = req.params;
    const context = getContext(req);

    if (!context.companyId) return res.status(401).json({ success: false, error: "Non autorisé." });

    const data = StaffService.formatData(req.body);

    try {
        const oldStaff = await CloudStaff.findOne({ localId: id.toString(), company_id: context.companyId }).lean();
        if (!oldStaff) throw new Error("Employé non trouvé");

        // 1. Mise à jour Cloud Mongoose
        const updateResult = await CloudStaff.updateOne(
            { localId: id.toString(), company_id: context.companyId },
            { 
                name: data.name, 
                phone: data.phone, 
                email: data.email, 
                adresse: data.adresse, 
                nif: data.nif, 
                cnss: data.cnss, 
                fonction: data.fonction, 
                is_active: data.is_active,
                sync_status: 'synced',
                updated_at: new Date()
            }
        );

        if (updateResult.matchedCount === 0) throw new Error("Employé non trouvé ou non modifié.");

        // 2. Audit Log
        await logAction({
            userId: context.userId, 
            userName: context.userName, 
            actionType: 'MODIFICATION',
            tableConcernee: 'staff', 
            referenceId: id.toString(),
            description: `Mise à jour employé : ${oldStaff.name} -> ${data.name}`,
            companyId: context.companyId
        });

        // 🔥 SIGNAL SOCKET HARMONISÉ
        if (req.io) {
            const room = String(context.companyId);
            req.io.to(room).emit('DATA_EVENT', { table: 'staff', action: 'UPDATE', id: id });
            req.io.to(room).emit('STAFF_UPDATED', { type: 'UPDATE', id });
        }

        res.json({ success: true, message: "Fiche employé mise à jour" });
    } catch (error) {
        console.error("❌ Erreur updateStaff:", error.message);
        res.status(400).json({ success: false, error: error.message });
    }
};

/**
 * Supprimer un employé
 */
exports.deleteStaff = async (req, res) => {
    const { id } = req.params;
    const context = getContext(req);

    if (!context.companyId) return res.status(401).json({ success: false, error: "Non autorisé." });

    try {
        const staffToDelete = await CloudStaff.findOne({ localId: id.toString(), company_id: context.companyId }).lean();
        if (!staffToDelete) throw new Error("Employé introuvable");

        // 1. Suppression Cloud Mongoose
        await CloudStaff.deleteOne({ localId: id.toString(), company_id: context.companyId });

        // 2. Audit Log
        await logAction({
            userId: context.userId, 
            userName: context.userName, 
            actionType: 'SUPPRESSION',
            tableConcernee: 'staff', 
            referenceId: id.toString(),
            description: `Suppression de l'employé : ${staffToDelete.name}`,
            companyId: context.companyId
        });

        // 🔥 SIGNAL SOCKET HARMONISÉ
        if (req.io) {
            const room = String(context.companyId);
            req.io.to(room).emit('DATA_EVENT', { table: 'staff', action: 'DELETE', id: id });
            req.io.to(room).emit('STAFF_UPDATED', { type: 'DELETE', id });
        }

        res.json({ success: true, message: "Employé supprimé" });
    } catch (error) {
        console.error("❌ Erreur deleteStaff:", error.message);
        res.status(400).json({ success: false, error: error.message });
    }
};