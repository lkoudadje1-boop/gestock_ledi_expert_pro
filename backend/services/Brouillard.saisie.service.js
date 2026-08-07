const { getDb } = require('../config/database');
// Import de la fonction d'audit (adapte le chemin si nécessaire)
const { logAction } = require('../utils/auditHelper'); 

class BrouillardSaisieService {
    // 1. Créer une nouvelle opération
    async creerOperation({ companyId, userId, body }) {
        const db = getDb();
        const { brouillard_id, date_mouvement, libelle, piece_ref, type_flux, montant } = body;

        return db.transaction(() => {
            const affectation = db.prepare(`
                SELECT peut_saisir FROM brouillard_affectations 
                WHERE brouillard_id = ? AND user_id = ? AND company_id = ?
            `).get(brouillard_id, userId, companyId);

            if (!affectation || affectation.peut_saisir !== 1) {
                throw new Error("Accès refusé : Vous n'avez pas le droit de saisie sur ce brouillard.");
            }

            const exercice = db.prepare(`SELECT id FROM exercices WHERE company_id = ? AND statut = 'OUVERT'`).get(companyId);
            if (!exercice) throw new Error("Aucun exercice comptable OUVERT trouvé.");

            const brouillard = db.prepare(`
                SELECT b.*, j.code, j.compteur_piece, j.longueur_compteur, j.prefixe_piece 
                FROM brouillards_treso b JOIN journaux j ON b.journal_id = j.id WHERE b.id = ?
            `).get(brouillard_id);

            const montantNum = parseFloat(montant);

            const s = db.prepare(`
                SELECT SUM(CASE WHEN type_flux = 'ENCAISSEMENT' THEN montant ELSE -montant END) as reel
                FROM brouillard_lignes_treso 
                WHERE brouillard_id = ? AND statut = 'VALIDE' AND (v1_statut IS NULL OR v1_statut != 9)
            `).get(brouillard_id);
            const soldeReel = (brouillard.solde_initial || 0) + (s.reel || 0);

            let statutInitial = 'VALIDE';
            if (type_flux === 'DECAISSEMENT') {
                if (brouillard.mode_fonctionnement === 'DEMANDE') {
                    statutInitial = 'EN_ATTENTE';
                } else if (montantNum > soldeReel) {
                    throw new Error(`Solde insuffisant (${soldeReel} F). Sortie de ${montantNum} impossible.`);
                }
            }

            const sequence = String(brouillard.compteur_piece).padStart(brouillard.longueur_compteur || 4, '0');
            const pieceChrono = `${brouillard.prefixe_piece || brouillard.code}-${sequence}`;
            
            // Mise à jour du compteur journal avec marquage sync_status
            db.prepare(`UPDATE journaux SET compteur_piece = compteur_piece + 1, sync_status = 'pending' WHERE id = ?`).run(brouillard.journal_id);
            db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('journaux', ?, 'UPDATE', ?)`).run(brouillard.journal_id, companyId);

            const id = `OPTR-${Date.now()}`;
            db.prepare(`
                INSERT INTO brouillard_lignes_treso (
                    id, company_id, brouillard_id, journal_id, exercice_id, user_id, 
                    date_mouvement, libelle, piece_ref, piece_comptable, type_flux, montant, statut,
                    v1_statut, v2_statut, v3_statut, v4_statut, sync_status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 'pending')
            `).run(id, companyId, brouillard_id, brouillard.journal_id, exercice.id, userId, date_mouvement, libelle.toUpperCase(), piece_ref || null, pieceChrono, type_flux, montantNum, statutInitial);

            // Synchronisation de la nouvelle ligne de trésorerie
            db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('brouillard_lignes_treso', ?, 'INSERT', ?)`).run(id, companyId);

            // ─── AUDIT DE CRÉATION ───────────────────────────────────────────
            logAction({
                userId,
                actionType: 'CREATION',
                tableConcernee: 'brouillard_lignes_treso',
                referenceId: id,
                description: `Création opération de trésorerie (${type_flux}) - Pièce ${pieceChrono} - Montant : ${montantNum} F - Statut : ${statutInitial}`,
                companyId
            });

            return { id, pieceChrono, statutInitial };
        })();
    }

    // 2. Modifier une opération
    async modifierOperation(id, { libelle, piece_ref, montant, userId, companyId }) {
        const db = getDb();
        const op = db.prepare('SELECT * FROM brouillard_lignes_treso WHERE id = ?').get(id);
        if (!op) throw new Error("Opération introuvable.");

        if (!['BROUILLON', 'EN_ATTENTE'].includes(op.statut)) {
            throw new Error("Modification interdite : opération déjà validée.");
        }

        db.transaction(() => {
            db.prepare(`
                UPDATE brouillard_lignes_treso 
                SET libelle = ?, piece_ref = ?, montant = ?, sync_status = 'pending', updated_at = CURRENT_TIMESTAMP 
                WHERE id = ?
            `).run(libelle.toUpperCase(), piece_ref, montant, id);

            db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('brouillard_lignes_treso', ?, 'UPDATE', ?)`).run(id, companyId);
            
            // ─── AUDIT DE MODIFICATION ───────────────────────────────────────
            logAction({
                userId,
                actionType: 'MODIFICATION',
                tableConcernee: 'brouillard_lignes_treso',
                referenceId: id,
                description: `Modification opé. ${op.piece_comptable}. Ancien montant: ${op.montant} F -> Nouveau: ${montant} F`,
                companyId
            });
        });

        return { success: true };
    }

    // 3. Supprimer / Annuler
    async supprimerOperation(id, motif, userId, companyId) {
        const db = getDb();
        const op = db.prepare(`
            SELECT l.*, b.mode_fonctionnement, b.seuil_validation, b.niv1_user_id 
            FROM brouillard_lignes_treso l
            JOIN brouillards_treso b ON l.brouillard_id = b.id
            WHERE l.id = ? AND l.company_id = ?
        `).get(id, companyId);

        if (!op) throw new Error("Opération introuvable.");

        if (op.comptabilise === 1) {
            throw new Error("Action impossible : Cette opération a déjà été ventilée en comptabilité.");
        }

        const affectation = db.prepare(`
            SELECT peut_saisir FROM brouillard_affectations 
            WHERE brouillard_id = ? AND user_id = ? AND company_id = ?
        `).get(op.brouillard_id, userId, companyId);

        if (!affectation || affectation.peut_saisir !== 1) {
            throw new Error("Accès refusé : Vous n'avez pas le droit de modifier ce brouillard.");
        }

        if (['BROUILLON', 'EN_ATTENTE', 'APPROUVE'].includes(op.statut)) {
            db.transaction(() => {
                if (op.id.includes('ANNUL')) {
                    db.prepare(`UPDATE brouillard_lignes_treso SET v1_statut = NULL, sync_status = 'pending' WHERE piece_comptable = ? AND v1_statut = 9`).run(op.piece_comptable);
                    // Récupération de la ligne impactée pour la synchro
                    const affected = db.prepare(`SELECT id FROM brouillard_lignes_treso WHERE piece_comptable = ? AND v1_statut IS NULL`).get(op.piece_comptable);
                    if (affected) {
                        db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('brouillard_lignes_treso', ?, 'UPDATE', ?)`).run(affected.id, companyId);
                    }
                }
                db.prepare(`DELETE FROM brouillard_lignes_treso WHERE id = ?`).run(id);
                db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('brouillard_lignes_treso', ?, 'DELETE', ?)`).run(id, companyId);

                // ─── AUDIT DE SUPPRESSION PHYSIQUE ───────────────────────────
                logAction({
                    userId,
                    actionType: 'SUPPRESSION',
                    tableConcernee: 'brouillard_lignes_treso',
                    referenceId: id,
                    description: `Suppression définitive de la ligne d'opération en statut ${op.statut} (Pièce: ${op.piece_comptable})`,
                    companyId
                });
            });
            return { deleted: true };
        }

        if (op.statut === 'VALIDE') {
            if (!motif) throw new Error("Le motif d'annulation est obligatoire.");

            const idAnnul = `OPTR-ANNUL-${Date.now()}`;
            const fluxInverse = op.type_flux === 'ENCAISSEMENT' ? 'DECAISSEMENT' : 'ENCAISSEMENT';
            const aBesoinDeValidation = (op.seuil_validation > 0 && op.niv1_user_id !== null);
            const statutAnnulation = aBesoinDeValidation ? 'EN_ATTENTE' : 'VALIDE';

            db.transaction(() => {
                db.prepare(`
                    INSERT INTO brouillard_lignes_treso (
                        id, company_id, brouillard_id, journal_id, exercice_id, user_id,
                        date_mouvement, libelle, piece_ref, piece_comptable, type_flux, montant, 
                        statut, motif_annulation, v1_statut, v2_statut, v3_statut, v4_statut, sync_status
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 'pending')
                `).run(idAnnul, op.company_id, op.brouillard_id, op.journal_id, op.exercice_id, userId, op.date_mouvement, `ANNULATION PIECE ${op.piece_comptable}`.toUpperCase(), op.piece_ref, op.piece_comptable, fluxInverse, op.montant, statutAnnulation, motif.toUpperCase());

                db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('brouillard_lignes_treso', ?, 'INSERT', ?)`).run(idAnnul, companyId);

                db.prepare(`UPDATE brouillard_lignes_treso SET v1_statut = 9, sync_status = 'pending' WHERE id = ?`).run(id);
                db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('brouillard_lignes_treso', ?, 'UPDATE', ?)`).run(id, companyId);

                // ─── AUDIT DE GÉNÉRATION D'ANNULATION ────────────────────────
                logAction({
                    userId,
                    actionType: 'ANNULATION',
                    tableConcernee: 'brouillard_lignes_treso',
                    referenceId: idAnnul,
                    description: `Demande d'annulation pour la pièce ${op.piece_comptable}. Motif : ${motif.toUpperCase()}. Statut généré : ${statutAnnulation}`,
                    companyId
                });
            });

            return { 
                cancelled: true, 
                message: aBesoinDeValidation ? "Demande d'annulation créée (en attente)." : "Opération annulée immédiatement." 
            };
        }
    }

    // 4. Liste + Soldes
    async getOperationsBrouillard(brouillardId, companyId) {
        const db = getDb();
        const rows = db.prepare(`
            SELECT l.*, u.username as auteur FROM brouillard_lignes_treso l
            LEFT JOIN users u ON l.user_id = u.id
            WHERE l.brouillard_id = ? AND l.company_id = ?
            ORDER BY l.created_at DESC LIMIT 100
        `).all(brouillardId, companyId);

        const soldes = db.prepare(`
            SELECT b.solde_initial,
            SUM(CASE WHEN l.statut = 'VALIDE' THEN (CASE WHEN l.type_flux = 'ENCAISSEMENT' THEN l.montant ELSE -l.montant END) ELSE 0 END) as total_flux,
            SUM(CASE WHEN l.statut IN ('VALIDE', 'EN_ATTENTE', 'APPROUVE') THEN (CASE WHEN l.type_flux = 'ENCAISSEMENT' THEN l.montant ELSE -l.montant END) ELSE 0 END) as total_provisoire
            FROM brouillards_treso b
            LEFT JOIN brouillard_lignes_treso l ON b.id = l.brouillard_id
            WHERE b.id = ?
        `).get(brouillardId);

        return {
            operations: rows,
            solde_reel: (soldes.solde_initial || 0) + (soldes.total_flux || 0),
            solde_provisoire: (soldes.solde_initial || 0) + (soldes.total_provisoire || 0)
        };
    }

    // 5. Liste Centre Validation
    async getOperationsAValider(companyId) {
        const db = getDb();
        return db.prepare(`
            SELECT l.*, u.username, b.libelle as brouillard_libelle, b.type as brouillard_type, b.solde_initial
            FROM brouillard_lignes_treso l
            JOIN users u ON l.user_id = u.id
            JOIN brouillards_treso b ON l.brouillard_id = b.id
            WHERE l.company_id = ? AND l.statut IN ('EN_ATTENTE', 'APPROUVE', 'VALIDE', 'REJETE')
            AND (l.id NOT LIKE 'OPTR-ANNUL-%' OR (b.seuil_validation > 0 AND b.niv1_user_id IS NOT NULL))
            ORDER BY l.created_at DESC LIMIT 200
        `).all(companyId);
    }

    // 6. Décider (APPROUVER/REJETER)
    async deciderOperation(id, action, userId, companyId) {
        const db = getDb();
        return db.transaction(() => {
            const op = db.prepare(`
                SELECT l.*, b.seuil_validation, b.niv1_user_id, b.niv2_user_id, b.niv3_user_id, b.niv4_user_id
                FROM brouillard_lignes_treso l
                JOIN brouillards_treso b ON l.brouillard_id = b.id
                WHERE l.id = ? AND l.company_id = ?
            `).get(id, companyId);

            if (!op) throw new Error("Opération introuvable.");

            const affectation = db.prepare(`
                SELECT peut_valider FROM brouillard_affectations 
                WHERE brouillard_id = ? AND user_id = ? AND company_id = ?
            `).get(op.brouillard_id, userId, companyId);

            if (!affectation || affectation.peut_valider !== 1) throw new Error("Accès refusé : Droits de validation insuffisants.");
            if (op.statut === 'VALIDE') throw new Error("Déjà validée.");

            if (action === 'REJETER') {
                db.prepare(`UPDATE brouillard_lignes_treso SET statut = 'REJETE', sync_status = 'pending' WHERE id = ?`).run(id);
                db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('brouillard_lignes_treso', ?, 'UPDATE', ?)`).run(id, companyId);

                if (id.includes('ANNUL')) {
                    db.prepare(`UPDATE brouillard_lignes_treso SET v1_statut = NULL, sync_status = 'pending' WHERE piece_comptable = ? AND company_id = ? AND v1_statut = 9`).run(op.piece_comptable, companyId);
                    const affected = db.prepare(`SELECT id FROM brouillard_lignes_treso WHERE piece_comptable = ? AND company_id = ? AND v1_statut IS NULL`).get(op.piece_comptable, companyId);
                    if (affected) {
                        db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('brouillard_lignes_treso', ?, 'UPDATE', ?)`).run(affected.id, companyId);
                    }
                }

                // ─── AUDIT DE REJET ──────────────────────────────────────────
                logAction({
                    userId,
                    actionType: 'VALIDATION_REJET',
                    tableConcernee: 'brouillard_lignes_treso',
                    referenceId: id,
                    description: `Rejet de l'opération (Pièce: ${op.piece_comptable}, Montant: ${op.montant} F)`,
                    companyId
                });

                return { success: true };
            }

            let visaColumn = null;
            if (userId === op.niv1_user_id) visaColumn = 'v1';
            else if (userId === op.niv2_user_id) visaColumn = 'v2';
            else if (userId === op.niv3_user_id) visaColumn = 'v3';
            else if (userId === op.niv4_user_id) visaColumn = 'v4';

            if (!visaColumn) throw new Error("Vous n'êtes pas dans le circuit de signature.");
            if (op[`${visaColumn}_statut`] === 1) throw new Error("Déjà signé.");

            db.prepare(`
                UPDATE brouillard_lignes_treso 
                SET ${visaColumn}_statut = 1, ${visaColumn}_date = CURRENT_TIMESTAMP, ${visaColumn}_user_id = ?, sync_status = 'pending'
                WHERE id = ?
            `).run(userId, id);

            const upd = db.prepare(`SELECT v1_statut, v2_statut, v3_statut, v4_statut FROM brouillard_lignes_treso WHERE id = ?`).get(id);
            const totalVisas = (upd.v1_statut || 0) + (upd.v2_statut || 0) + (upd.v3_statut || 0) + (upd.v4_statut || 0);

            const nouveauStatut = totalVisas >= op.seuil_validation ? 'VALIDE' : 'APPROUVE';
            db.prepare(`UPDATE brouillard_lignes_treso SET statut = ? WHERE id = ?`).run(nouveauStatut, id);
            
            db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('brouillard_lignes_treso', ?, 'UPDATE', ?)`).run(id, companyId);

            // ─── AUDIT D'APPROBATION / VISA ──────────────────────────────────
            logAction({
                userId,
                actionType: 'VALIDATION_APPROBATION',
                tableConcernee: 'brouillard_lignes_treso',
                referenceId: id,
                description: `Signature niveau (${visaColumn.toUpperCase()}) appliquée sur la pièce ${op.piece_comptable}. Statut actuel passe à : ${nouveauStatut}`,
                companyId
            });

            return { success: true };
        })();
    }

    // 7. Ventilation (Analytique et Comptable)
    async getDepensesAVentiler(companyId) {
        const db = getDb();
        return db.prepare(`
            SELECT l.*, u.username as auteur, b.libelle as brouillard_libelle, j.compte_treso_id,
            -- 🛡️ RÉCUPÉRATION DU MOTIF DE REJET COMPTA
            (SELECT observation FROM brouillon_lignes bl 
             WHERE bl.piece_provisoire = 'BR-' || l.piece_comptable 
             AND bl.statut = 'REJETE' 
             ORDER BY bl.created_at DESC LIMIT 1) as motif_rejet_compta
            FROM brouillard_lignes_treso l
            JOIN brouillards_treso b ON l.brouillard_id = b.id
            JOIN journaux j ON l.journal_id = j.id
            LEFT JOIN users u ON l.user_id = u.id
            WHERE l.company_id = ? 
              AND l.statut = 'VALIDE' 
              AND l.type_flux = 'DECAISSEMENT' 
              AND l.comptabilise = 0 
              AND (l.v1_statut IS NULL OR l.v1_statut != 9) 
              AND l.id NOT LIKE 'OPTR-ANNUL-%'
            ORDER BY l.date_mouvement DESC
        `).all(companyId);
    }

    async ventilerOperation({ operation_id, lignes, companyId, userId }) {
        const db = getDb();
        const userName = 'utilisateurs_systeme';

        const totalVentile = lignes.reduce((sum, l) => sum + parseFloat(l.montant || 0), 0);
        const opCheck = db.prepare("SELECT montant, v1_statut FROM brouillard_lignes_treso WHERE id = ?").get(operation_id);
        
        if (!opCheck) throw new Error("Opération introuvable.");

        // 🛡️ VERROU CRITIQUE : Bloquer si annulation demandée
        if (opCheck.v1_statut === 9) throw new Error("Ventilation impossible : Une demande d'annulation est en cours.");
        
        if (Math.abs(totalVentile - opCheck.montant) > 0.01) throw new Error("Déséquilibre montant.");

        return db.transaction(() => {
            const op = db.prepare(`
                SELECT l.*, b.mode_ecriture, j.compte_treso_id, j.compte_contrepartie_id
                FROM brouillard_lignes_treso l 
                JOIN brouillards_treso b ON l.brouillard_id = b.id 
                JOIN journaux j ON l.journal_id = j.id 
                WHERE l.id = ? AND l.company_id = ?
            `).get(operation_id, companyId);

            if (!op || op.comptabilise === 1) throw new Error("Déjà comptabilisée.");

            const sourceId = op.compte_treso_id || op.compte_contrepartie_id;
            const cpteCaisse = db.prepare("SELECT numero_compte FROM plan_comptable WHERE id = ?").get(sourceId);
            const dateRef = Date.now();
            const pieceRef = op.piece_comptable || `T-${dateRef.toString().slice(-6)}`;
            const pieceProvisoire = `BR-${pieceRef}`;

            if (op.mode_ecriture === 'BROUILLON') {
                db.prepare(`DELETE FROM brouillon_lignes WHERE piece_provisoire = ? AND company_id = ?`).run(pieceProvisoire, companyId);
                db.prepare(`DELETE FROM brouillon_ecritures WHERE piece_provisoire = ? AND company_id = ?`).run(pieceProvisoire, companyId);

                const brId = `BR-ECR-${dateRef}`;
                db.prepare(`INSERT INTO brouillon_ecritures (id, company_id, journal_id, exercice_id, date_ecriture, piece_provisoire, libelle, user_saisie, statut, sync_status) VALUES (?,?,?,?,?,?,?,?,?,'pending')`)
                  .run(brId, companyId, op.journal_id, op.exercice_id, op.date_mouvement, pieceProvisoire, op.libelle, userName);
                db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('brouillon_ecritures', ?, 'INSERT', ?)`).run(brId, companyId);

                const stmtLig = db.prepare(`INSERT INTO brouillon_lignes (id, company_id, brouillon_id, journal_id, exercice_id, date_ecriture, piece_provisoire, compte_id, num_compte, num_tiers, libelle, debit, credit, statut, sync_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'EN_ATTENTE','pending')`);
                const stmtSyncLig = db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('brouillon_lignes', ?, 'INSERT', ?)`);
                
                // Ligne Trésorerie (Crédit)
                const ligTrId = `BRLIG-${dateRef}-C`;
                stmtLig.run(ligTrId, companyId, brId, op.journal_id, op.exercice_id, op.date_mouvement, pieceProvisoire, sourceId, cpteCaisse.numero_compte, null, op.libelle, 0, op.montant);
                stmtSyncLig.run(ligTrId, companyId);

                // Nouvelles lignes de ventilation (Débit)
                lignes.forEach((l, idx) => {
                    const ligId = `BRLIG-${dateRef}-D${idx}`;
                    const cpteInfo = db.prepare("SELECT numero_compte FROM plan_comptable WHERE id = ?").get(l.compte_id);
                    stmtLig.run(ligId, companyId, brId, op.journal_id, op.exercice_id, op.date_mouvement, pieceProvisoire, l.compte_id, cpteInfo.numero_compte, l.num_tiers || null, op.libelle, l.montant, 0);
                    stmtSyncLig.run(ligId, companyId);

                    if (l.is_analytique && l.repartitions) {
                        const stmtAna = db.prepare(`INSERT INTO brouillon_lignes_analytiques (id, company_id, ligne_brouillon_id, plan_analytique_id, departement_id, num_compte, montant, sync_status) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`);
                        const stmtSyncAna = db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('brouillon_lignes_analytiques', ?, 'INSERT', ?)`);
                        
                        l.repartitions.forEach((rep, rIdx) => {
                            const anaId = `BRANA-${dateRef}-${idx}-${rIdx}`;
                            stmtAna.run(anaId, companyId, ligId, rep.plan_analytique_id, rep.dept_id || rep.departement_id, cpteInfo.numero_compte, rep.montant);
                            stmtSyncAna.run(anaId, companyId);
                        });
                    }
                });
                
                db.prepare(`UPDATE brouillard_lignes_treso SET comptabilise = 1, brouillon_ecriture_id = ?, sync_status = 'pending' WHERE id = ?`).run(brId, operation_id);
                db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('brouillard_lignes_treso', ?, 'UPDATE', ?)`).run(operation_id, companyId);
            } else {
                // Logique Grand Livre (Ecriture directe)
                const ecrId = `ECR-${dateRef}`;
                db.prepare(`INSERT INTO ecritures (id, company_id, journal_id, exercice_id, date_ecriture, piece, libelle, user_saisie, sync_status) VALUES (?,?,?,?,?,?,?,?,'pending')`)
                  .run(ecrId, companyId, op.journal_id, op.exercice_id, op.date_mouvement, pieceRef, op.libelle, userName);
                db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('ecritures', ?, 'INSERT', ?)`).run(ecrId, companyId);

                const stmtLig = db.prepare(`INSERT INTO lignes_ecritures (id, company_id, ecriture_id, journal_id, exercice_id, date_ecriture, piece, compte_id, num_compte, num_tiers, libelle, debit, credit, sync_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'pending')`);
                const stmtSyncLig = db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('lignes_ecritures', ?, 'INSERT', ?)`);
                
                const ligTrId = `LIG-${dateRef}-C`;
                stmtLig.run(ligTrId, companyId, ecrId, op.journal_id, op.exercice_id, op.date_mouvement, pieceRef, sourceId, cpteCaisse.numero_compte, null, op.libelle, 0, op.montant);
                stmtSyncLig.run(ligTrId, companyId);

                lignes.forEach((l, idx) => {
                    const ligId = `LIG-${dateRef}-D${idx}`;
                    const cpteInfo = db.prepare("SELECT numero_compte FROM plan_comptable WHERE id = ?").get(l.compte_id);
                    stmtLig.run(ligId, companyId, ecrId, op.journal_id, op.exercice_id, op.date_mouvement, pieceRef, l.compte_id, cpteInfo.numero_compte, l.num_tiers || null, op.libelle, l.montant, 0);
                    stmtSyncLig.run(ligId, companyId);

                    if (l.is_analytique && l.repartitions) {
                        const stmtAna = db.prepare(`INSERT INTO lignes_analytiques (id, company_id, ligne_ecriture_id, plan_analytique_id, departement_id, num_compte, montant, sync_status) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`);
                        const stmtSyncAna = db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('lignes_analytiques', ?, 'INSERT', ?)`);
                        
                        l.repartitions.forEach((rep, rIdx) => {
                            const anaId = `ANA-${dateRef}-${idx}-${rIdx}`;
                            stmtAna.run(anaId, companyId, ligId, rep.plan_analytique_id, rep.dept_id || rep.departement_id, cpteInfo.numero_compte, rep.montant);
                            stmtSyncAna.run(anaId, companyId);
                        });
                        db.prepare(`UPDATE lignes_ecritures SET is_ventilated = 1, sync_status = 'pending' WHERE id = ?`).run(ligId);
                        db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('lignes_ecritures', ?, 'UPDATE', ?)`).run(ligId, companyId);
                    }
                });
                db.prepare(`UPDATE brouillard_lignes_treso SET comptabilise = 1, ecriture_id = ?, sync_status = 'pending' WHERE id = ?`).run(ecrId, operation_id);
                db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('brouillard_lignes_treso', ?, 'UPDATE', ?)`).run(operation_id, companyId);
            }

            // ─── AUDIT DE VENTILATION ────────────────────────────────────────
            logAction({
                userId,
                actionType: 'VENTILATION',
                tableConcernee: 'brouillard_lignes_treso',
                referenceId: operation_id,
                description: `Ventilation de la pièce ${op.piece_comptable} en comptabilité (Mode: ${op.mode_ecriture}). Éclatée en ${lignes.length} imputation(s) de charges.`,
                companyId
            });

            return { success: true };
        })();
    }
}

module.exports = new BrouillardSaisieService();