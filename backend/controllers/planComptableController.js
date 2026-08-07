const fs = require('fs');
const path = require('path');
const { getDb } = require('../config/database');
const { logAction } = require('../utils/auditHelper'); 

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
exports.initialiserOuImporterPlan = (req, res) => {
    const db = getDb();
    const context = getContext(req);

    if (!context.companyId) return res.status(401).json({ error: "ID entreprise manquant." });

    const { typePlan, source } = req.body; 
    let comptes = [];

    try {
        const company = db.prepare("SELECT plan_precision FROM companies WHERE id = ?").get(context.companyId);
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

        db.transaction(() => {
            const anciensComptes = db.prepare("SELECT id FROM plan_comptable WHERE company_id = ?").all(context.companyId);
            const syncDelStmt = db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('plan_comptable', ?, 'DELETE', ?)");
            
            anciensComptes.forEach(c => syncDelStmt.run(c.id, context.companyId));
            db.prepare("DELETE FROM plan_comptable WHERE company_id = ?").run(context.companyId);

            const stmt = db.prepare(`
                INSERT OR IGNORE INTO plan_comptable (
                    id, numero_compte, intitule, type_compte, company_id, 
                    sync_status, classe, nature, type_etat, sens_normal
                ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)
            `);
            const syncInsStmt = db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('plan_comptable', ?, 'INSERT', ?)");

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

                const result = stmt.run(idGenerated, numeroFinal, libelle, nature, context.companyId, parseInt(firstDigit) || 0, nature, type_etat, sens);
                if (result.changes > 0) syncInsStmt.run(idGenerated, context.companyId);
            });

            logAction({
                userId: context.userId, userName: context.userName,
                actionType: 'INSERTION', tableConcernee: 'plan_comptable',
                description: `Importation massive du plan comptable (${comptes.length} comptes)`,
                companyId: context.companyId
            });
        })();

        // 🔥 SIGNAL SOCKET GLOBAL
        if (req.io) {
            const room = String(context.companyId);
            req.io.to(room).emit('DATA_EVENT', { table: 'plan_comptable', action: 'IMPORT' });
            req.io.to(room).emit('REFRESH_PLAN');
        }

        return res.json({ success: true, message: `Plan initialisé avec succès.` });

    } catch (err) {
        return res.status(500).json({ error: "Erreur lors de l'importation : " + err.message });
    }
};

/**
 * Ajoute manuellement un compte
 */
exports.ajouterCompte = (req, res) => {
    const db = getDb();
    const context = getContext(req);
    const { numero_compte, intitule } = req.body;

    try {
        const newId = generateSecureId('PC', 'MAN');
        db.transaction(() => {
            const company = db.prepare("SELECT plan_precision FROM companies WHERE id = ?").get(context.companyId);
            const precision = company?.plan_precision || 8;
            const numeroFinal = numero_compte.toString().trim().padEnd(precision, '0').substring(0, precision);
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

            const stmt = db.prepare(`
                INSERT OR IGNORE INTO plan_comptable (id, numero_compte, intitule, type_compte, company_id, sync_status, classe, nature, type_etat, sens_normal)
                VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)
            `);

            const result = stmt.run(newId, numeroFinal, intitule.toUpperCase(), nature, context.companyId, parseInt(firstDigit) || 0, nature, type_etat, sens);
            if (result.changes === 0) throw new Error("Ce numéro de compte existe déjà.");

            db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('plan_comptable', ?, 'INSERT', ?)").run(newId, context.companyId);

            logAction({
                userId: context.userId, userName: context.userName,
                actionType: 'INSERTION', tableConcernee: 'plan_comptable',
                referenceId: newId, description: `Création manuelle du compte ${numeroFinal}`,
                companyId: context.companyId
            });
        })();

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
exports.modifierCompte = (req, res) => {
    const db = getDb();
    const context = getContext(req);
    const { id } = req.params;
    const { numero_compte, intitule } = req.body;

    try {
        db.transaction(() => {
            const company = db.prepare("SELECT plan_precision FROM companies WHERE id = ?").get(context.companyId);
            const precision = company?.plan_precision || 8;
            const numeroFinal = numero_compte.toString().trim().padEnd(precision, '0').substring(0, precision);
            
            db.prepare(`
                UPDATE plan_comptable 
                SET numero_compte = ?, intitule = ?, sync_status = 'pending'
                WHERE id = ? AND company_id = ?
            `).run(numeroFinal, intitule.toUpperCase(), id, context.companyId);

            db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('plan_comptable', ?, 'UPDATE', ?)").run(id, context.companyId);

            logAction({
                userId: context.userId, userName: context.userName,
                actionType: 'MODIFICATION', tableConcernee: 'plan_comptable',
                referenceId: id, description: `Modification du compte en ${numeroFinal}`,
                companyId: context.companyId
            });
        })();

        if (req.io) {
            const room = String(context.companyId);
            req.io.to(room).emit('DATA_EVENT', { table: 'plan_comptable', action: 'UPDATE', id });
            req.io.to(room).emit('REFRESH_PLAN');
        }

        res.json({ success: true, message: "Compte mis à jour." });
    } catch (err) {
        res.status(500).json({ error: "Erreur lors de la modification." });
    }
};

/**
 * Supprime un compte
 */
exports.supprimerCompte = (req, res) => {
    const db = getDb();
    const context = getContext(req);
    const { id } = req.params;

    try {
        db.transaction(() => {
            const compte = db.prepare("SELECT numero_compte FROM plan_comptable WHERE id = ? AND company_id = ?").get(id, context.companyId);
            if (!compte) throw new Error("Compte introuvable.");

            db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('plan_comptable', ?, 'DELETE', ?)").run(id, context.companyId);
            db.prepare("DELETE FROM plan_comptable WHERE id = ? AND company_id = ?").run(id, context.companyId);

            logAction({
                userId: context.userId, userName: context.userName,
                actionType: 'SUPPRESSION', tableConcernee: 'plan_comptable',
                referenceId: id, description: `Suppression du compte ${compte.numero_compte}`,
                companyId: context.companyId
            });
        })();

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
exports.viderPlanComptable = (req, res) => {
    const db = getDb();
    const context = getContext(req);

    try {
        db.transaction(() => {
            const comptes = db.prepare("SELECT id FROM plan_comptable WHERE company_id = ?").all(context.companyId);
            const syncStmt = db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('plan_comptable', ?, 'DELETE', ?)");
            
            comptes.forEach(c => syncStmt.run(c.id, context.companyId));
            const result = db.prepare("DELETE FROM plan_comptable WHERE company_id = ?").run(context.companyId);

            logAction({
                userId: context.userId, 
                userName: context.userName,
                actionType: 'SUPPRESSION',
                tableConcernee: 'plan_comptable',
                description: `Vidage complet du plan (${result.changes} comptes)`,
                companyId: context.companyId
            });
        })();

        // 🔥 SIGNAL SOCKET GLOBAL
        if (req.io && context.companyId) {
            const room = String(context.companyId);
            
            // On signale un DELETE massif sur la table
            req.io.to(room).emit('DATA_EVENT', { 
                table: 'plan_comptable', 
                action: 'DELETE_ALL' 
            });

            // On force le rafraîchissement du module Plan Comptable côté UI
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

exports.getPlanComptable = (req, res) => {
    const db = getDb();
    const companyId = req.user?.company_id || req.user?.companyId;
    const { collectif } = req.query; 
    try {
        const company = db.prepare("SELECT plan_precision FROM companies WHERE id = ?").get(companyId);
        const precision = company?.plan_precision || 8;
        let query = "SELECT * FROM plan_comptable WHERE company_id = ?";
        let params = [companyId];
        if (collectif === 'true') { query += " AND length(numero_compte) = ?"; params.push(precision); }
        const plan = db.prepare(query + " ORDER BY numero_compte ASC").all(...params);
        res.json({ success: true, data: plan }); 
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

exports.exportPlanComptable = (req, res) => {
    const db = getDb();
    const companyId = req.user?.company_id || req.user?.companyId;

    try {
        const data = db.prepare(`
            SELECT numero_compte, intitule, nature, type_etat, sens_normal 
            FROM plan_comptable 
            WHERE company_id = ? 
            ORDER BY numero_compte ASC
        `).all(companyId);

        const SEP = ";"; 
        const NEW_LINE = "\r\n";
        const BOM = "\ufeff"; 

        let csv = `Numero${SEP}Intitule${SEP}Nature${SEP}Etat${SEP}Sens${NEW_LINE}`;

        // Dans exportPlanComptable
data.forEach(row => {
    // Remplacer les points-virgules par des virgules dans l'intitulé pour éviter les sauts de colonnes
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