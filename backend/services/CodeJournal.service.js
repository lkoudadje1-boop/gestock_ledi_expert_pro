const { getDb } = require('../config/database');
const { logAction } = require('../utils/auditHelper');

/**
 * Récupère la liste des journaux avec le compte des écritures
 */
exports.findAllJournaux = (companyId) => {
    const db = getDb();
    return db.prepare(`
        SELECT 
            j.*, 
            pc.numero_compte as compte_numero, 
            pc.intitule as compte_libelle,
            (SELECT COUNT(*) FROM ecritures WHERE journal_id = j.id) as has_entries
        FROM journaux j
        LEFT JOIN plan_comptable pc ON j.compte_contrepartie_id = pc.id
        WHERE j.company_id = ? 
        ORDER BY j.type_journal, j.code ASC
    `).all(companyId);
};

/**
 * Logique de création d'un journal
 */
exports.createJournal = (data, user) => {
    const db = getDb();
    const { code, libelle, type_journal, mode_numerotation, compte_contrepartie_id, contrepartie_auto } = data;
    const { companyId, userId, userName } = user;

    const id = `JR-${Date.now()}`;
    const codePropre = code.toUpperCase().trim();

    // Vérifier exercice ouvert
    const exerciceOuvert = db.prepare(`SELECT id FROM exercices WHERE company_id = ? AND statut = 'OUVERT' LIMIT 1`).get(companyId);
    if (!exerciceOuvert) throw new Error("Aucun exercice OUVERT. Action impossible.");

    db.transaction(() => {
        const existe = db.prepare("SELECT id FROM journaux WHERE company_id = ? AND code = ?").get(companyId, codePropre);
        if (existe) throw new Error(`Le code journal "${codePropre}" existe déjà.`);

        db.prepare(`
            INSERT INTO journaux (
                id, company_id, code, libelle, type_journal, 
                mode_numerotation, compte_contrepartie_id, contrepartie_auto, sync_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        `).run(
            id, companyId, codePropre, libelle.toUpperCase(), type_journal,
            mode_numerotation || 'AUTO', compte_contrepartie_id || null, contrepartie_auto || 0
        );

        // 🔄 Ajout dans la file de synchronisation Cloud
        db.prepare(`
            INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
            VALUES ('journaux', ?, 'INSERT', ?)
        `).run(id, companyId);

        logAction({
            userId, userName, actionType: 'INSERTION', tableConcernee: 'journaux', 
            referenceId: id, description: `Création journal : ${codePropre}`, companyId
        });
    })();
    return id;
};

/**
 * Logique de modification sécurisée
 */
exports.updateJournal = (id, data, user) => {
    const db = getDb();
    const { libelle, mode_numerotation, compte_contrepartie_id, contrepartie_auto } = data;
    const { companyId } = user;

    const entries = db.prepare("SELECT COUNT(*) as count FROM ecritures WHERE journal_id = ?").get(id);
    const hasEntries = entries.count > 0;

    db.transaction(() => {
        if (hasEntries) {
            // VERROU : Uniquement libellé et numérotation si écritures existantes
            db.prepare(`
                UPDATE journaux 
                SET libelle = ?, mode_numerotation = ?, updated_at = CURRENT_TIMESTAMP, sync_status = 'pending'
                WHERE id = ? AND company_id = ?
            `).run(libelle.toUpperCase(), mode_numerotation, id, companyId);
        } else {
            // LIBERTÉ : Modification totale possible
            db.prepare(`
                UPDATE journaux 
                SET libelle = ?, mode_numerotation = ?, compte_contrepartie_id = ?, 
                    contrepartie_auto = ?, updated_at = CURRENT_TIMESTAMP, sync_status = 'pending'
                WHERE id = ? AND company_id = ?
            `).run(libelle.toUpperCase(), mode_numerotation, compte_contrepartie_id || null, contrepartie_auto || 0, id, companyId);
        }

        // 🔄 Ajout de la mise à jour dans la file de synchronisation Cloud
        db.prepare(`
            INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
            VALUES ('journaux', ?, 'UPDATE', ?)
        `).run(id, companyId);
    })();
    return hasEntries;
};

/**
 * Logique de suppression (Blindage strict)
 */
exports.deleteJournal = (id, companyId) => {
    const db = getDb();
    const hasEcritures = db.prepare("SELECT id FROM ecritures WHERE journal_id = ? LIMIT 1").get(id);
    if (hasEcritures) throw new Error("🔒 Impossible : ce journal contient des écritures comptables.");

    db.transaction(() => {
        // 🔄 Enregistrement de la suppression dans la file de synchronisation Cloud avant suppression effective
        db.prepare(`
            INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
            VALUES ('journaux', ?, 'DELETE', ?)
        `).run(id, companyId);

        db.prepare("DELETE FROM journaux WHERE id = ? AND company_id = ?").run(id, companyId);
    })();
};

/**
 * Logique d'importation massive
 */
exports.importJournauxBatch = (journaux, user) => {
    const db = getDb();
    const { companyId, userId, userName } = user;

    db.transaction(() => {
        const stmt = db.prepare(`
            INSERT INTO journaux (
                id, company_id, code, libelle, type_journal, 
                mode_numerotation, contrepartie_auto, sync_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
            ON CONFLICT(code, company_id) DO UPDATE SET
                libelle = excluded.libelle,
                type_journal = excluded.type_journal,
                sync_status = 'pending',
                updated_at = CURRENT_TIMESTAMP
        `);

        const syncStmt = db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('journaux', ?, 'INSERT', ?)");

        journaux.forEach((j, index) => {
            const existing = db.prepare("SELECT id FROM journaux WHERE code = ? AND company_id = ?").get(j.code, companyId);
            const id = existing ? existing.id : `JR-${Date.now()}-${index}`;

            stmt.run(id, companyId, j.code, j.libelle.toUpperCase(), j.type, j.modeNum, j.contrepartie);
            syncStmt.run(id, companyId);
        });

        logAction({
            userId, userName, actionType: 'IMPORTATION', tableConcernee: 'journaux',
            description: `Importation massive de ${journaux.length} journaux`, companyId
        });
    })();
};