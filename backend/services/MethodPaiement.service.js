const { getDb } = require('../config/database');
const { logAction } = require('../utils/auditHelper');

/**
 * 🔒 FONCTION INTERNE : Vérifie si le moyen est rattaché à des mouvements
 */
const checkIfUsed = (id, db) => {
    // 1. Vérification dans les paiements (Table commune aux 3 versions)
    const usedInPayments = db.prepare(`SELECT id FROM payments WHERE payment_method_id = ? LIMIT 1`).get(id);
    if (usedInPayments) return true;

    // 2. Vérification dans le brouillard (Table spécifique Compta/Expert)
    const method = db.prepare("SELECT code FROM payment_methods WHERE id = ?").get(id);
    if (!method) return false;

    try {
        const usedInBrouillard = db.prepare(`SELECT id FROM brouillard_lignes_treso WHERE piece_ref = ? LIMIT 1`).get(method.code);
        if (usedInBrouillard) return true;
    } catch (e) {
        // Si la table n'existe pas (Version Stock), on ignore simplement
    }

    return false;
};

/**
 * 📝 Récupérer la liste (Adaptée pour fonctionner sans module Compta)
 */
exports.findAllMethods = (companyId) => {
    const db = getDb();
    
    // On récupère les données de base de la table autonome
    const methods = db.prepare(`
        SELECT m.*
        FROM payment_methods m
        WHERE m.company_id = ? 
        ORDER BY m.libelle ASC
    `).all(companyId);

    // On enrichit avec les données des autres modules UNIQUEMENT si ils existent
    return methods.map(method => {
        let extra = {
            num_compte: null, compte_intitule: null,
            journal_code: null, journal_libelle: null,
            is_locked: false
        };

        // Calcul du verrouillage (Autonome)
        extra.is_locked = checkIfUsed(method.id, db);

        try {
            // Tentative de récupération des infos du Plan Comptable
            if (method.compte_comptable_id) {
                const pc = db.prepare("SELECT numero_compte, intitule FROM plan_comptable WHERE id = ?").get(method.compte_comptable_id);
                if (pc) {
                    extra.num_compte = pc.numero_compte;
                    extra.compte_intitule = pc.intitule;
                }
            }
            // Tentative de récupération des infos des Journaux
            if (method.journal_id) {
                const j = db.prepare("SELECT code, libelle FROM journaux WHERE id = ?").get(method.journal_id);
                if (j) {
                    extra.journal_code = j.code;
                    extra.journal_libelle = j.libelle;
                }
            }
        } catch (e) {
            // Si les tables n'existent pas, extra reste avec ses valeurs nulles
        }

        return { ...method, ...extra };
    });
};

/**
 * ➕ Création (Accepte les IDs compta comme optionnels/null)
 */
exports.createMethod = (data, context) => {
    const db = getDb();
    const { code, libelle, compte_comptable_id, journal_id, is_pos, icone_name } = data;
    const { companyId, userId, userName } = context;

    const id = `PM-${Date.now()}`;
    const codePropre = code.toUpperCase().trim();
    const libellePropre = libelle.toUpperCase().trim();

    db.transaction(() => {
        const existe = db.prepare("SELECT id FROM payment_methods WHERE company_id = ? AND (code = ? OR libelle = ?)").get(companyId, codePropre, libellePropre);
        if (existe) throw new Error(`Le code ou le libellé "${libellePropre}" existe déjà.`);

        db.prepare(`
            INSERT INTO payment_methods (
                id, company_id, code, libelle, compte_comptable_id, journal_id, 
                is_pos, icone_name, sync_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        `).run(
            id, 
            companyId, 
            codePropre, 
            libellePropre, 
            compte_comptable_id || null, 
            journal_id || null, 
            is_pos || 0, 
            icone_name || ''
        );

        // 🔄 Synchronisation Cloud (INSERT)
        db.prepare(`
            INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
            VALUES ('payment_methods', ?, 'INSERT', ?)
        `).run(id, companyId);

        logAction({
            userId, userName, actionType: 'INSERTION', tableConcernee: 'payment_methods', 
            referenceId: id, description: `Création moyen paiement : ${libellePropre}`, companyId
        });
    })();
    return id;
};

/**
 * ✏️ Modification (Verrouillage intelligent)
 */
exports.updateMethod = (id, data, context) => {
    const db = getDb();
    const { libelle, compte_comptable_id, journal_id, is_active, is_pos, icone_name } = data;
    const { companyId } = context;

    const isUsed = checkIfUsed(id, db);
    const finalIcon = icone_name || '';

    db.transaction(() => {
        if (isUsed) {
            // 🔒 Mode restreint : On ne touche pas au Libellé/Compta si utilisé
            db.prepare(`
                UPDATE payment_methods 
                SET is_active = ?, is_pos = ?, icone_name = ?, updated_at = CURRENT_TIMESTAMP, sync_status = 'pending'
                WHERE id = ? AND company_id = ?
            `).run(is_active, is_pos, finalIcon, id, companyId);
        } else {
            // ✅ Mode libre : Tout est modifiable
            db.prepare(`
                UPDATE payment_methods 
                SET libelle = ?, compte_comptable_id = ?, journal_id = ?, is_active = ?, 
                    is_pos = ?, icone_name = ?, updated_at = CURRENT_TIMESTAMP, sync_status = 'pending'
                WHERE id = ? AND company_id = ?
            `).run(
                libelle ? libelle.toUpperCase().trim() : '', 
                compte_comptable_id || null, 
                journal_id || null, 
                is_active, 
                is_pos, 
                finalIcon, 
                id, 
                companyId
            );
        }

        // 🔄 Synchronisation Cloud (UPDATE)
        db.prepare(`
            INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
            VALUES ('payment_methods', ?, 'UPDATE', ?)
        `).run(id, companyId);
    })();
    return isUsed;
};

/**
 * 🗑️ Suppression
 */
exports.deleteMethod = (id, companyId) => {
    const db = getDb();
    if (checkIfUsed(id, db)) {
        throw new Error("🔒 Action interdite : ce moyen est rattaché à des transactions.");
    }

    db.transaction(() => {
        // 🔄 Synchronisation Cloud (DELETE) avant la suppression physique
        db.prepare(`
            INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
            VALUES ('payment_methods', ?, 'DELETE', ?)
        `).run(id, companyId);

        db.prepare("DELETE FROM payment_methods WHERE id = ? AND company_id = ?").run(id, companyId);
    })();
};