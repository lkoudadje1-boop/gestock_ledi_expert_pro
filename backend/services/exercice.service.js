const { getDb } = require('../config/database');
const { logAction } = require('../utils/auditHelper');

/**
 * UTILITAIRE : Valide que la durée de l'exercice est cohérente (max 12 mois)
 */
const validerPeriodeComptable = (libelle, date_debut, date_fin) => {
    const debut = new Date(date_debut);
    const fin = new Date(date_fin);

    if (isNaN(debut.getTime()) || isNaN(fin.getTime())) {
        throw new Error("Les dates fournies sont invalides.");
    }

    if (fin <= debut) {
        throw new Error(`Pour l'exercice ${libelle}, la date de fin doit être postérieure à la date de début.`);
    }

    // Calcul de l'écart en mois
    const diffMois = (fin.getFullYear() - debut.getFullYear()) * 12 + (fin.getMonth() - debut.getMonth());

    // En comptabilité standard, l'écart entre le 01/01 et le 31/12 d'une même année est de 11 mois.
    // Un écart de 12 mois ou plus signifie que l'exercice déborde sur une deuxième année.
    if (diffMois >= 12) {
        throw new Error(`Incohérence sur ${libelle} : La durée d'un exercice ne peut pas dépasser 12 mois.`);
    }
};

/**
 * Récupère la liste des exercices
 */
exports.getAll = (companyId) => {
    const db = getDb();
    try {
        const rows = db.prepare(`
            SELECT * FROM exercices 
            WHERE company_id = ? 
            ORDER BY date_debut DESC
        `).all(companyId);
        
        return rows || []; 
    } catch (err) {
        console.error("Erreur SQL getAll Exercices:", err.message);
        throw err;
    }
};

/**
 * Logique de création d'un exercice
 */
exports.create = (data, user) => {
    const db = getDb();
    const { libelle, date_debut, date_fin, genererRAN } = data;
    const { companyId, userId, userName } = user;

    // 🛡️ Validation de la durée avant insertion
    validerPeriodeComptable(libelle, date_debut, date_fin);

    const id = `EX-${Date.now()}`;

    db.transaction(() => {
        // 1. Vérifier le dernier exercice
        const dernierEx = db.prepare(`
            SELECT id, libelle, statut FROM exercices 
            WHERE company_id = ? ORDER BY date_debut DESC LIMIT 1
        `).get(companyId);

        if (dernierEx && dernierEx.statut === 'OUVERT') {
            throw new Error(`L'exercice ${dernierEx.libelle} doit être au moins en clôture provisoire.`);
        }

        // 2. Insertion
        db.prepare(`
            INSERT INTO exercices (id, company_id, libelle, date_debut, date_fin, statut, sync_status)
            VALUES (?, ?, ?, ?, ?, 'OUVERT', 'pending')
        `).run(id, companyId, libelle.toUpperCase(), date_debut, date_fin);

        // Synchronisation Cloud
        db.prepare(`
            INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
            VALUES ('exercices', ?, 'INSERT', ?)
        `).run(id, companyId);

        // 3. Logique RAN
        if (genererRAN && dernierEx) {
            logAction({
                userId, userName,
                actionType: 'INSERTION',
                tableConcernee: 'ecritures',
                description: `Génération automatique des RAN pour l'exercice ${libelle}`,
                companyId
            });
        }

        // 4. Audit
        logAction({
            userId, userName,
            actionType: 'INSERTION',
            tableConcernee: 'exercices',
            referenceId: id,
            description: `Ouverture exercice ${libelle} (RAN: ${genererRAN ? 'OUI' : 'NON'})`,
            companyId
        });
    })();

    return id;
};

/**
 * Mise à jour du statut (Ouvert, Pré-clôture, Clôture)
 */
exports.updateStatus = (id, statut, user) => {
    const db = getDb();
    const { companyId, userName, userId } = user;
    const dateCloture = statut === 'CLOTURE' ? new Date().toISOString() : null;
    const userCloture = statut === 'CLOTURE' ? userName : null;

    db.transaction(() => {
        const ex = db.prepare("SELECT statut FROM exercices WHERE id = ? AND company_id = ?").get(id, companyId);
        if (!ex) throw new Error("Exercice introuvable.");

        db.prepare(`
            UPDATE exercices 
            SET statut = ?, date_cloture = ?, user_cloture = ?, sync_status = 'pending'
            WHERE id = ? AND company_id = ?
        `).run(statut, dateCloture, userCloture, id, companyId);

        db.prepare(`
            INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
            VALUES ('exercices', ?, 'UPDATE', ?)
        `).run(id, companyId);

        let descAudit = statut === 'PRE_CLOTURE' ? `Clôture provisoire de l'exercice` 
                      : statut === 'CLOTURE' ? `Clôture DÉFINITIVE de l'exercice` 
                      : `Réouverture de l'exercice`;

        logAction({
            userId, userName, 
            actionType: 'MODIFICATION',
            tableConcernee: 'exercices', 
            referenceId: id,
            description: descAudit,
            companyId
        });
    })();
};

/**
 * Modification sécurisée (Verrouillage si activité)
 */
exports.update = (id, data, companyId) => {
    const db = getDb();
    const { libelle, date_debut, date_fin } = data;

    // 🛡️ Validation de la durée avant mise à jour
    validerPeriodeComptable(libelle, date_debut, date_fin);

    db.transaction(() => {
        const check = db.prepare(`
            SELECT 
                (SELECT COUNT(*) FROM lignes_ecritures WHERE exercice_id = ? AND company_id = ? AND is_deleted = 0) as nb_lignes,
                (SELECT COUNT(*) FROM ecritures WHERE exercice_id = ? AND company_id = ?) as nb_entetes,
                (SELECT COUNT(*) FROM brouillon_lignes WHERE exercice_id = ? AND company_id = ?) as nb_brouillons
        `).get(id, companyId, id, companyId, id, companyId);

        const aDeLActivite = (check.nb_lignes > 0 || check.nb_entetes > 0 || check.nb_brouillons > 0);

        if (aDeLActivite) {
            const exActuel = db.prepare("SELECT date_debut, date_fin FROM exercices WHERE id = ?").get(id);
            // Si activité, on interdit de toucher aux dates
            if (date_debut !== exActuel.date_debut || date_fin !== exActuel.date_fin) {
                throw new Error(`🔒 Verrouillé : Cet exercice contient déjà des écritures ou brouillons. Modification des dates impossible.`);
            }
            db.prepare(`UPDATE exercices SET libelle = ?, updated_at = CURRENT_TIMESTAMP, sync_status = 'pending' WHERE id = ? AND company_id = ?`)
              .run(libelle.toUpperCase(), id, companyId);
        } else {
            // Si aucune activité, on autorise la modification complète
            db.prepare(`UPDATE exercices SET libelle = ?, date_debut = ?, date_fin = ?, updated_at = CURRENT_TIMESTAMP, sync_status = 'pending' WHERE id = ? AND company_id = ?`)
              .run(libelle.toUpperCase(), date_debut, date_fin, id, companyId);
        }

        db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('exercices', ?, 'UPDATE', ?)`).run(id, companyId);
    })();
};

/**
 * Suppression
 */
exports.remove = (id, companyId) => {
    const db = getDb();
    db.transaction(() => {
        const check = db.prepare(`
            SELECT 
                (SELECT COUNT(*) FROM ecritures WHERE exercice_id = ? AND company_id = ?) as nb_e,
                (SELECT COUNT(*) FROM lignes_ecritures WHERE exercice_id = ? AND company_id = ?) as nb_l
        `).get(id, companyId, id, companyId);

        if (check.nb_e > 0 || check.nb_l > 0) {
            throw new Error(`🔒 Suppression impossible : ${check.nb_e + check.nb_l} enregistrements sont rattachés à cet exercice.`);
        }

        db.prepare("DELETE FROM reports_a_nouveau WHERE exercice_id = ? AND company_id = ?").run(id, companyId);
        db.prepare("DELETE FROM exercices WHERE id = ? AND company_id = ?").run(id, companyId);
        db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('exercices', ?, 'DELETE', ?)`).run(id, companyId);
    })();
};