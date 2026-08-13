// backend/controllers/planComptableController.js
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { 
    CloudCompany, 
    CloudPlanComptable, 
    CloudAuditLog 
} = require('../models/cloud.model');

// Utilitaire de contexte harmonisé
const getContext = (req) => {
    const user = req.user || {};
    const companyId = user.companyId || user.company_id;
    return {
        companyId: companyId,
        userId: user.userId || user.id,
        userName: user.username || 'Utilisateur'
    };
};

/**
 * 🚀 UTILITAIRE : Génération d'ID Unique "Anti-collision"
 */
const generateSecureId = (prefix, index = 0) => {
    const timestamp = Date.now().toString().slice(-8);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${prefix}-${timestamp}-${random}-${index}`;
};

/**
 * Initialise un plan standard ou importe un fichier personnalisé
 */
exports.initialiserOuImporterPlan = async (req, res) => {
    const context = getContext(req);
    if (!context.companyId) return res.status(401).json({ error: "ID entreprise manquant." });

    const { typePlan, source } = req.body; 
    let comptes = [];

    try {
        const company = await CloudCompany.findOne({ localId: context.companyId }).lean();
        const precision = company?.plan_precision || 8; 

        if (source === 'standard') {
            const filePath = path.join(__dirname, `../data/${typePlan}.json`);
            if (!fs.existsSync(filePath)) return res.status(404).json({ error: `Fichier ${typePlan}.json introuvable.` });
            comptes = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
        else if (source === 'upload') {
            if (!req.file) return res.status(400).json({ error: "Fichier manquant" });
            const csvRaw = req.file.buffer.toString('utf8').replace(/^\ufeff/, '');
            const lignes = csvRaw.split(/\r?\n/).filter(l => l.trim() !== "");
            comptes = lignes.slice(1).map(ligne => {
                const colonnes = ligne.split(';').map(col => col.trim().replace(/^"|"$/g, ''));
                return { num: colonnes[0], lib: colonnes[1] };
            }).filter(c => c.num && c.lib);
        }

        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            // Suppression des anciens comptes de l'entreprise
            await CloudPlanComptable.deleteMany({ company_id: context.companyId }).session(session);

            const comptesToInsert = [];

            comptes.forEach((c, index) => {
                const numeroBrut = c.num || c.code; 
                if (!numeroBrut) return;

                const numeroFinal = numeroBrut.toString().trim().padEnd(precision, '0').substring(0, precision);
                const libelle = c.lib ? c.lib.toString().trim().toUpperCase() : "SANS INTITULÉ";
                const idGenerated = generateSecureId('PC', index);
                const firstDigit = numeroFinal.charAt(0);
                
                let nature = 'ACTIF', type_etat = 'BILAN', sens = 'DEBIT';
                if (['6', '8'].includes(firstDigit)) { nature = 'CHARGE'; type_etat = 'RESULTAT'; }
                else if (firstDigit === '7') { nature = 'PRODUIT'; type_etat = 'RESULTAT'; sens = 'CREDIT'; }
                else if (['1'].includes(firstDigit)) { nature = 'PASSIF'; sens = 'CREDIT'; }
                else if (firstDigit === '4') {
                    if (numeroFinal.startsWith('40') || numeroFinal.startsWith('42') || numeroFinal.startsWith('43') || numeroFinal.startsWith('44')) {
                        nature = 'PASSIF'; sens = 'CREDIT';
                    } else { nature = 'ACTIF'; sens = 'DEBIT'; }
                } else if (['2', '3', '5'].includes(firstDigit)) { nature = 'ACTIF'; sens = 'DEBIT'; }

                comptesToInsert.push({
                    localId: idGenerated,
                    company_id: context.companyId,
                    numero_compte: numeroFinal,
                    intitule: libelle,
                    type_compte: nature,
                    classe: parseInt(firstDigit) || 0,
                    nature: nature,
                    type_etat: type_etat,
                    sens_normal: sens,
                    sync_status: 'synced',
                    updated_at: new Date()
                });
            });

            if (comptesToInsert.length > 0) {
                await CloudPlanComptable.insertMany(comptesToInsert, { session });
            }

            const logId = `LOG-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
            await CloudAuditLog.create([{
                localId: logId,
                user_id: context.userId,
                user_name: context.userName,
                action_type: 'INSERTION',
                table_concernee: 'plan_comptable',
                description: `Importation massive du plan comptable (${comptesToInsert.length} comptes)`,
                date_action: new Date(),
                company_id: context.companyId,
                sync_status: 'synced'
            }], { session });

            await session.commitTransaction();
            session.endSession();
        } catch (txErr) {
            await session.abortTransaction();
            session.endSession();
            throw txErr;
        }

        // 🔥 SIGNAL SOCKET GLOBAL
        if (req.io) {
            const room = String(context.companyId);
            req.io.to(room).emit('DATA_EVENT', { table: 'plan_comptable', action: 'IMPORT' });
            req.io.to(room).emit('REFRESH_PLAN');
        }

        return res.json({ success: true, message: `Plan initialisé avec succès.` });

    } catch (err) {
        console.error("❌ Erreur initialiserOuImporterPlan:", err.message);
        return res.status(500).json({ error: "Erreur lors de l'importation : " + err.message });
    }
};

/**
 * Ajoute manuellement un compte
 */
exports.ajouterCompte = async (req, res) => {
    const context = getContext(req);
    const { numero_compte, intitule } = req.body;

    try {
        const company = await CloudCompany.findOne({ localId: context.companyId }).lean();
        const precision = company?.plan_precision || 8;
        const numeroFinal = numero_compte.toString().trim().padEnd(precision, '0').substring(0, precision);
        
        const existing = await CloudPlanComptable.findOne({ company_id: context.companyId, numero_compte: numeroFinal }).lean();
        if (existing) throw new Error("Ce numéro de compte existe déjà.");

        const newId = generateSecureId('PC', 'MAN');
        const firstDigit = numeroFinal.charAt(0);
        
        let nature = 'ACTIF', type_etat = 'BILAN', sens = 'DEBIT';
        if (['6', '8'].includes(firstDigit)) { nature = 'CHARGE'; type_etat = 'RESULTAT'; }
        else if (firstDigit === '7') { nature = 'PRODUIT'; type_etat = 'RESULTAT'; sens = 'CREDIT'; }
        else if (['1'].includes(firstDigit)) { nature = 'PASSIF'; sens = 'CREDIT'; }
        else if (firstDigit === '4') {
            if (numeroFinal.startsWith('40') || numeroFinal.startsWith('42') || numeroFinal.startsWith('43') || numeroFinal.startsWith('44')) {
                nature = 'PASSIF'; sens = 'CREDIT';
            } else { nature = 'ACTIF'; sens = 'DEBIT'; }
        } else if (['2', '3', '5'].includes(firstDigit)) { nature = 'ACTIF'; sens = 'DEBIT'; }

        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            await CloudPlanComptable.create([{
                localId: newId,
                company_id: context.companyId,
                numero_compte: numeroFinal,
                intitule: intitule.toUpperCase(),
                type_compte: nature,
                classe: parseInt(firstDigit) || 0,
                nature: nature,
                type_etat: type_etat,
                sens_normal: sens,
                sync_status: 'synced',
                updated_at: new Date()
            }], { session });

            const logId = `LOG-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
            await CloudAuditLog.create([{
                localId: logId,
                user_id: context.userId,
                user_name: context.userName,
                action_type: 'INSERTION',
                table_concernee: 'plan_comptable',
                reference_id: newId,
                description: `Création manuelle du compte ${numeroFinal}`,
                date_action: new Date(),
                company_id: context.companyId,
                sync_status: 'synced'
            }], { session });

            await session.commitTransaction();
            session.endSession();
        } catch (txErr) {
            await session.abortTransaction();
            session.endSession();
            throw txErr;
        }

        // 🔥 SIGNAL SOCKET
        if (req.io) {
            const room = String(context.companyId);
            req.io.to(room).emit('DATA_EVENT', { table: 'plan_comptable', action: 'INSERT', id: newId });
            req.io.to(room).emit('REFRESH_PLAN');
        }

        res.json({ success: true, message: `Compte enregistré.` });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

/**
 * Modifie un compte
 */
exports.modifierCompte = async (req, res) => {
    const context = getContext(req);
    const { id } = req.params;
    const { numero_compte, intitule } = req.body;

    try {
        const company = await CloudCompany.findOne({ localId: context.companyId }).lean();
        const precision = company?.plan_precision || 8;
        const numeroFinal = numero_compte.toString().trim().padEnd(precision, '0').substring(0, precision);
        
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const result = await CloudPlanComptable.updateOne(
                { localId: id, company_id: context.companyId },
                {
                    $set: {
                        numero_compte: numeroFinal,
                        intitule: intitule.toUpperCase(),
                        sync_status: 'synced',
                        updated_at: new Date()
                    }
                },
                { session }
            );

            if (result.matchedCount === 0) throw new Error("Compte introuvable.");

            const logId = `LOG-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
            await CloudAuditLog.create([{
                localId: logId,
                user_id: context.userId,
                user_name: context.userName,
                action_type: 'MODIFICATION',
                table_concernee: 'plan_comptable',
                reference_id: id,
                description: `Modification du compte en ${numeroFinal}`,
                date_action: new Date(),
                company_id: context.companyId,
                sync_status: 'synced'
            }], { session });

            await session.commitTransaction();
            session.endSession();
        } catch (txErr) {
            await session.abortTransaction();
            session.endSession();
            throw txErr;
        }

        if (req.io) {
            const room = String(context.companyId);
            req.io.to(room).emit('DATA_EVENT', { table: 'plan_comptable', action: 'UPDATE', id });
            req.io.to(room).emit('REFRESH_PLAN');
        }

        res.json({ success: true, message: "Compte mis à jour." });
    } catch (err) {
        res.status(500).json({ error: err.message || "Erreur lors de la modification." });
    }
};

/**
 * Supprime un compte
 */
exports.supprimerCompte = async (req, res) => {
    const context = getContext(req);
    const { id } = req.params;

    try {
        const compte = await CloudPlanComptable.findOne({ localId: id, company_id: context.companyId }).lean();
        if (!compte) return res.status(404).json({ error: "Compte introuvable." });

        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            await CloudPlanComptable.deleteOne({ localId: id, company_id: context.companyId }).session(session);

            const logId = `LOG-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
            await CloudAuditLog.create([{
                localId: logId,
                user_id: context.userId,
                user_name: context.userName,
                action_type: 'SUPPRESSION',
                table_concernee: 'plan_comptable',
                reference_id: id,
                description: `Suppression du compte ${compte.numero_compte}`,
                date_action: new Date(),
                company_id: context.companyId,
                sync_status: 'synced'
            }], { session });

            await session.commitTransaction();
            session.endSession();
        } catch (txErr) {
            await session.abortTransaction();
            session.endSession();
            throw txErr;
        }

        if (req.io) {
            const room = String(context.companyId);
            req.io.to(room).emit('DATA_EVENT', { table: 'plan_comptable', action: 'DELETE', id });
            req.io.to(room).emit('REFRESH_PLAN');
        }

        res.json({ success: true, message: "Compte supprimé." });
    } catch (err) {
        res.status(500).json({ error: "Impossible de supprimer : le compte est utilisé." });
    }
};

/**
 * Vide intégralement le plan
 */
exports.viderPlanComptable = async (req, res) => {
    const context = getContext(req);

    try {
        const countBefore = await CloudPlanComptable.countDocuments({ company_id: context.companyId });

        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            await CloudPlanComptable.deleteMany({ company_id: context.companyId }).session(session);

            const logId = `LOG-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
            await CloudAuditLog.create([{
                localId: logId,
                user_id: context.userId,
                user_name: context.userName,
                action_type: 'SUPPRESSION',
                table_concernee: 'plan_comptable',
                description: `Vidage complet du plan (${countBefore} comptes)`,
                date_action: new Date(),
                company_id: context.companyId,
                sync_status: 'synced'
            }], { session });

            await session.commitTransaction();
            session.endSession();
        } catch (txErr) {
            await session.abortTransaction();
            session.endSession();
            throw txErr;
        }

        // 🔥 SIGNAL SOCKET GLOBAL
        if (req.io && context.companyId) {
            const room = String(context.companyId);
            req.io.to(room).emit('DATA_EVENT', { 
                table: 'plan_comptable', 
                action: 'DELETE_ALL' 
            });

            req.io.to(room).emit('REFRESH_PLAN', { 
                message: "Le plan comptable a été réinitialisé." 
            });
        }

        res.json({ success: true, message: "Plan vidé avec succès." });
    } catch (err) {
        console.error("❌ Erreur vidage plan:", err.message);
        res.status(500).json({ error: "Échec du vidage : certains comptes sont probablement liés à des écritures." });
    }
};

exports.getPlanComptable = async (req, res) => {
    const companyId = req.user?.company_id || req.user?.companyId;
    const { collectif } = req.query; 
    try {
        const company = await CloudCompany.findOne({ localId: companyId }).lean();
        const precision = company?.plan_precision || 8;
        
        let query = { company_id: companyId };
        if (collectif === 'true') {
            query.$expr = { $eq: [{ $strLenCP: "$numero_compte" }, precision] };
        }

        const plan = await CloudPlanComptable.find(query).sort({ numero_compte: 1 }).lean();
        res.json({ success: true, data: plan }); 
    } catch (err) { 
        res.status(500).json({ success: false, error: err.message }); 
    }
};

exports.exportPlanComptable = async (req, res) => {
    const companyId = req.user?.company_id || req.user?.companyId;

    try {
        const data = await CloudPlanComptable.find(
            { company_id: companyId },
            { numero_compte: 1, intitule: 1, nature: 1, type_etat: 1, sens_normal: 1, _id: 0 }
        ).sort({ numero_compte: 1 }).lean();

        const SEP = ";"; 
        const NEW_LINE = "\r\n";
        const BOM = "\ufeff"; 

        let csv = `Numero${SEP}Intitule${SEP}Nature${SEP}Etat${SEP}Sens${NEW_LINE}`;

        data.forEach(row => {
            const libClean = (row.intitule || "").replace(/;/g, ',').replace(/"/g, '""');
            const lib = `"${libClean}"`;
            csv += `${row.numero_compte}${SEP}${lib}${SEP}${row.nature}${SEP}${row.type_etat}${SEP}${row.sens_normal}${NEW_LINE}`;
        });

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=PlanComptable.csv');
        return res.send(BOM + csv);
    } catch (err) {
        return res.status(500).json({ error: "Erreur export" });
    }
};