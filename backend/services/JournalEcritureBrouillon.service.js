const { getDb } = require('../config/database');

class JournalEcritureBrouillonService {
    // 1. Créer une écriture groupée
    async creerEcritureBrouillon({ companyId, userId, userName, body }) {
        const db = getDb();
        const { journal_id, exercice_id, date_ecriture, libelle_general, piece_manuelle, lignes } = body;

        const totalDebit = lignes.reduce((sum, l) => sum + parseFloat(l.debit || 0), 0);
        const totalCredit = lignes.reduce((sum, l) => sum + parseFloat(l.credit || 0), 0);

        if (Math.abs(totalDebit - totalCredit) > 0.001) {
            throw new Error("L'écriture brouillon n'est pas équilibrée.");
        }

        const ecritureId = `BR-ECR-${Date.now()}`;

        return db.transaction(() => {
            const journal = db.prepare("SELECT * FROM journaux WHERE id = ? AND company_id = ?").get(journal_id, companyId);
            if (!journal) throw new Error("Journal introuvable.");

            let numeroPiece = piece_manuelle;
            if (journal.mode_numerotation === 'AUTO') {
                const sequence = journal.compteur_brouillon.toString().padStart(journal.longueur_compteur || 1, '0');
                numeroPiece = `BR-${sequence}`;
                db.prepare("UPDATE journaux SET compteur_brouillon = compteur_brouillon + 1 WHERE id = ?").run(journal_id);
            }

            db.prepare(`
                INSERT INTO brouillon_ecritures (id, company_id, journal_id, exercice_id, date_ecriture, piece_provisoire, libelle, user_saisie, statut, sync_status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'EN_ATTENTE', 'pending')
            `).run(ecritureId, companyId, journal_id, exercice_id, date_ecriture, numeroPiece.toString(), libelle_general.toUpperCase(), userName);

            db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('brouillon_ecritures', ?, 'INSERT', ?)").run(ecritureId, companyId);

            const insertLigne = db.prepare(`
                INSERT INTO brouillon_lignes (id, company_id, brouillon_id, journal_id, exercice_id, date_ecriture, piece_provisoire, facture, reference, compte_id, num_compte, libelle, debit, credit, statut, sync_status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'EN_ATTENTE', 'pending')
            `);
            
            lignes.forEach((lig, index) => {
                const ligneId = `BRLIG-${Date.now()}-${index}`;
                const numCompte = db.prepare("SELECT numero_compte FROM plan_comptable WHERE id = ?").get(lig.compte_id)?.numero_compte || '';
                
                insertLigne.run(ligneId, companyId, ecritureId, journal_id, exercice_id, date_ecriture, numeroPiece.toString(), lig.facture || '', lig.reference || '', lig.compte_id, numCompte, lig.libelle.toUpperCase(), lig.debit || 0, lig.credit || 0);
                db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('brouillon_lignes', ?, 'INSERT', ?)").run(ligneId, companyId);
            });

            return { id: ecritureId };
        })();
    }

    // 2. Saisie individuelle (Kilométrique)
    async enregistrerLigneBrouillonIndividuelle({ companyId, userName, body }) {
        const db = getDb();
        const { id, journal_id, exercice_id, date_ecriture, date_echeance, piece, facture, reference, num_compte, num_tiers, libelle, debit, credit, compte_id } = body;

        return db.transaction(() => {
            const journal = db.prepare(`
                SELECT j.*, p.numero_compte as compte_contrepartie 
                FROM journaux j 
                LEFT JOIN plan_comptable p ON j.compte_contrepartie_id = p.id 
                WHERE j.id = ? AND j.company_id = ?
            `).get(journal_id, companyId);
            
            if (!journal) throw new Error("Journal introuvable");

            let pieceDeTravail = piece ? piece.toString() : '';

            if (!id && journal.mode_numerotation === 'AUTO' && !piece) {
                const pieceInachevee = db.prepare(`
                    SELECT piece_provisoire FROM brouillon_lignes 
                    WHERE journal_id = ? AND exercice_id = ? AND company_id = ? 
                    GROUP BY piece_provisoire 
                    HAVING ROUND(SUM(debit) - SUM(credit), 2) != 0 LIMIT 1
                `).get(journal_id, exercice_id, companyId);
                
                pieceDeTravail = pieceInachevee ? pieceInachevee.piece_provisoire : `BR-${journal.compteur_brouillon.toString().padStart(4, '0')}`;
            }

            let ecriture_id;
            const finalLibelle = libelle ? libelle.toUpperCase() : '';

            let entete = db.prepare(`SELECT id FROM brouillon_ecritures WHERE piece_provisoire = ? AND journal_id = ? AND company_id = ?`).get(pieceDeTravail, journal_id, companyId);
            
            if (!entete) {
                ecriture_id = `BR-ECR-${Date.now()}`;
                db.prepare(`
                    INSERT INTO brouillon_ecritures (id, company_id, journal_id, exercice_id, date_ecriture, piece_provisoire, libelle, user_saisie, statut, sync_status) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'EN_ATTENTE', 'pending')
                `).run(ecriture_id, companyId, journal_id, exercice_id, date_ecriture, pieceDeTravail, finalLibelle, userName);
                
                db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('brouillon_ecritures', ?, 'INSERT', ?)").run(ecriture_id, companyId);
            } else {
                ecriture_id = entete.id;
            }

            const ligneId = id || `BRLIG-${Date.now()}`;

            if (id) {
                db.prepare(`
                    UPDATE brouillon_lignes 
                    SET piece_provisoire = ?, facture = ?, reference = ?, num_compte = ?, num_tiers = ?, 
                        libelle = ?, debit = ?, credit = ?, date_echeance = ?, 
                        sync_status = 'pending', updated_at = CURRENT_TIMESTAMP 
                    WHERE id = ?
                `).run(pieceDeTravail, facture || '', reference || '', num_compte, num_tiers || null, finalLibelle, parseFloat(debit || 0), parseFloat(credit || 0), date_echeance || null, id);

                db.prepare(`
                    UPDATE brouillon_lignes SET libelle = ?, reference = ?, facture = ?, sync_status = 'pending'
                    WHERE piece_provisoire = ? AND journal_id = ? AND company_id = ?
                `).run(finalLibelle, reference || '', facture || '', pieceDeTravail, journal_id, companyId);

                db.prepare(`UPDATE brouillon_ecritures SET libelle = ?, sync_status = 'pending' WHERE id = ?`).run(finalLibelle, ecriture_id);
                db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('brouillon_ecritures', ?, 'UPDATE', ?)").run(ecriture_id, companyId);
            } else {
                db.prepare(`
                    INSERT INTO brouillon_lignes (id, company_id, brouillon_id, journal_id, exercice_id, date_ecriture, piece_provisoire, facture, reference, compte_id, num_compte, num_tiers, libelle, debit, credit, date_echeance, statut, sync_status) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'EN_ATTENTE', 'pending')
                `).run(ligneId, companyId, ecriture_id, journal_id, exercice_id, date_ecriture, pieceDeTravail, facture || '', reference || '', compte_id, num_compte, num_tiers || null, finalLibelle, parseFloat(debit || 0), parseFloat(credit || 0), date_echeance || null);
            }

            db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('brouillon_lignes', ?, ?, ?)")
              .run(ligneId, id ? 'UPDATE' : 'INSERT', companyId);

            const solde = db.prepare(`SELECT ROUND(SUM(debit) - SUM(credit), 2) as reste FROM brouillon_lignes WHERE piece_provisoire = ? AND journal_id = ? AND company_id = ?`).get(pieceDeTravail, journal_id, companyId);
            
            let aEteIncremente = false;
            if (journal.mode_numerotation === 'AUTO' && solde && Math.abs(solde.reste) < 0.01) {
                db.prepare("UPDATE journaux SET compteur_brouillon = compteur_brouillon + 1 WHERE id = ?").run(journal_id);
                aEteIncremente = true;
            }

            return { id: ligneId, ecriture_id, numPieceFinale: pieceDeTravail, aEteIncremente, soldePiece: solde ? solde.reste : 0, contrepartie: journal.compte_contrepartie };
        })();
    }

    // 3. Récupération périodique
    async getLignesBrouillonParPeriode({ journal_id, exercice_id, moisIdx, companyId }) {
        const db = getDb();
        let patternDate = '%'; 
        let ancienSolde = 0, mvtDebitMois = 0, mvtCreditMois = 0;

        if (exercice_id && exercice_id !== 'ALL' && exercice_id !== 'undefined') {
            const exercice = db.prepare("SELECT date_debut FROM exercices WHERE id = ?").get(exercice_id);
            if (exercice) {
                const annee = exercice.date_debut.split('-')[0];
                const moisNum = (parseInt(moisIdx) + 1).toString().padStart(2, '0');
                patternDate = `${annee}-${moisNum}-%`;
                const dateDebutMois = `${annee}-${moisNum}-01`;

                if (journal_id && journal_id !== 'ALL') {
                    const journal = db.prepare("SELECT compte_contrepartie_id FROM journaux WHERE id = ?").get(journal_id);
                    if (journal?.compte_contrepartie_id) {
                        const compte = db.prepare("SELECT numero_compte FROM plan_comptable WHERE id = ?").get(journal.compte_contrepartie_id);
                        if (compte) {
                            ancienSolde = db.prepare(`SELECT (SUM(debit) - SUM(credit)) as solde FROM lignes_ecritures WHERE num_compte = ? AND company_id = ? AND date_ecriture < ? AND is_deleted = 0`).get(compte.numero_compte, companyId, dateDebutMois)?.solde || 0;
                            const resMvts = db.prepare(`SELECT SUM(debit) as debits, SUM(credit) as credits FROM brouillon_lignes WHERE num_compte = ? AND company_id = ? AND date_ecriture LIKE ?`).get(compte.numero_compte, companyId, patternDate);
                            mvtDebitMois = resMvts?.debits || 0;
                            mvtCreditMois = resMvts?.credits || 0;
                        }
                    }
                }
            }
        }

        const data = db.prepare(`
            SELECT 
                l.*, 
                l.piece_provisoire as piece,
                j.code as journal_code,
                EXISTS (SELECT 1 FROM brouillon_lignes_analytiques la WHERE la.ligne_brouillon_id = l.id) as is_ventilated
            FROM brouillon_lignes l
            JOIN journaux j ON l.journal_id = j.id
            WHERE l.company_id = ? 
              AND (l.journal_id = ? OR ? = 'ALL' OR ? = 'undefined') 
              AND (l.exercice_id = ? OR ? = 'ALL' OR ? = 'undefined') 
              AND l.date_ecriture LIKE ?
            ORDER BY l.created_at DESC, l.id DESC
        `).all(companyId, journal_id, journal_id, journal_id, exercice_id, exercice_id, exercice_id, patternDate);
        
        return { 
            data, 
            ancienSolde: parseFloat(ancienSolde), 
            mouvementDebit: parseFloat(mvtDebitMois), 
            mouvementCredit: parseFloat(mvtCreditMois), 
            nouveauSolde: parseFloat(ancienSolde + mvtDebitMois - mvtCreditMois) 
        };
    }

    // 4. Suppression
    async supprimerPieceBrouillon(ids, companyId) {
        const db = getDb();
        return db.transaction(() => {
            const placeholders = ids.map(() => '?').join(',');
            const entetes = db.prepare(`SELECT DISTINCT brouillon_id FROM brouillon_lignes WHERE id IN (${placeholders})`).all(...ids);
            
            ids.forEach(ligneId => {
                db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('brouillon_lignes', ?, 'DELETE', ?)").run(ligneId, companyId);
            });

            db.prepare(`DELETE FROM brouillon_lignes WHERE id IN (${placeholders}) AND company_id = ?`).run(...ids, companyId);

            entetes.forEach(e => {
                const reste = db.prepare(`SELECT COUNT(*) as nb FROM brouillon_lignes WHERE brouillon_id = ?`).get(e.brouillon_id);
                if (reste.nb === 0) {
                    db.prepare(`DELETE FROM brouillon_ecritures WHERE id = ?`).run(e.brouillon_id);
                    db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('brouillon_ecritures', ?, 'DELETE', ?)").run(e.brouillon_id, companyId);
                }
            });
        })();
    }

    // 5. Récupérer journaux
    async getJournauxPourBrouillon(exercice_id, companyId) {
        const db = getDb();
        const checkAnalytique = db.prepare(`SELECT c.gestion_analytique, (SELECT COUNT(*) FROM plan_analytique WHERE company_id = ? AND is_deleted = 0) as nb_plans FROM companies c WHERE c.id = ?`).get(companyId, companyId);
        const analytiqueBloque = checkAnalytique?.gestion_analytique === 1 && checkAnalytique.nb_plans === 0;

        const data = db.prepare(`
            SELECT j.*, pc.numero_compte as compte_numero, pc.intitule as compte_libelle,
            (SELECT GROUP_CONCAT(DISTINCT CAST(strftime('%m', bl.date_ecriture) AS INTEGER) - 1) FROM brouillon_lignes bl WHERE bl.journal_id = j.id AND bl.company_id = j.company_id AND bl.exercice_id = ? AND bl.statut IN ('EN_ATTENTE', 'VALIDE')) as mois_saisis
            FROM journaux j LEFT JOIN plan_comptable pc ON j.compte_contrepartie_id = pc.id WHERE j.company_id = ?
        `).all(exercice_id, companyId);

        return { data, analytique_alerte: analytiqueBloque };
    }

    // 6. Validation finale vers Grand Livre
    async validerPieceBrouillon({ piece_provisoire, journal_id, companyId, userName }) {
        const db = getDb();
        
        if (!journal_id) throw new Error("Le journal_id est requis pour valider cette pièce.");

        return db.transaction(() => {
            const lignesBrouillon = db.prepare(`
                SELECT * FROM brouillon_lignes 
                WHERE piece_provisoire = ? 
                  AND journal_id = ? 
                  AND company_id = ? 
                  AND statut = 'EN_ATTENTE'
            `).all(piece_provisoire, journal_id, companyId);

            if (lignesBrouillon.length === 0) {
                throw new Error("Cette pièce est déjà validée ou n'existe plus dans ce journal.");
            }

            const first = lignesBrouillon[0];

            const existeDeja = db.prepare(`
                SELECT id FROM ecritures 
                WHERE piece = ? AND journal_id = ? AND exercice_id = ? AND company_id = ?
            `).get(piece_provisoire, journal_id, first.exercice_id, companyId);

            if (existeDeja) throw new Error(`La pièce ${piece_provisoire} existe déjà au Grand Livre pour ce journal.`);

            const journal = db.prepare("SELECT * FROM journaux WHERE id = ? AND company_id = ?").get(journal_id, companyId);
            if (journal?.mode_numerotation === 'AUTO') {
                db.prepare("UPDATE journaux SET compteur_piece = compteur_piece + 1 WHERE id = ?").run(journal_id);
            }

            const ecritureIdReel = `ECR-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
            db.prepare(`
                INSERT INTO ecritures (id, company_id, journal_id, exercice_id, date_ecriture, piece, reference, ref_brouillon, libelle, user_saisie, sync_status) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
            `).run(
                ecritureIdReel, 
                companyId, 
                journal_id, 
                first.exercice_id, 
                first.date_ecriture, 
                piece_provisoire, 
                first.reference, 
                piece_provisoire, 
                first.libelle, 
                userName
            );
            
            db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('ecritures', ?, 'INSERT', ?)").run(ecritureIdReel, companyId);

            for (const lb of lignesBrouillon) {
                const ligneIdReelle = `LIG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                
                db.prepare(`
                    INSERT INTO lignes_ecritures (
                        id, company_id, ecriture_id, journal_id, exercice_id, 
                        date_ecriture, date_echeance, piece, facture, reference, 
                        compte_id, num_compte, num_tiers, libelle, debit, credit, sync_status
                    ) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
                `).run(
                    ligneIdReelle, 
                    companyId, 
                    ecritureIdReel, 
                    journal_id, 
                    lb.exercice_id, 
                    lb.date_ecriture, 
                    lb.date_echeance, 
                    piece_provisoire, 
                    lb.facture, 
                    lb.reference, 
                    lb.compte_id, 
                    lb.num_compte, 
                    lb.num_tiers, 
                    lb.libelle, 
                    lb.debit, 
                    lb.credit
                );
                
                db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('lignes_ecritures', ?, 'INSERT', ?)").run(ligneIdReelle, companyId);

                const anaBrouillon = db.prepare(`SELECT * FROM brouillon_lignes_analytiques WHERE ligne_brouillon_id = ?`).all(lb.id);
                anaBrouillon.forEach((ana, idx) => {
                    const anaIdReel = `LANA-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 5)}`;
                    db.prepare(`
                        INSERT INTO lignes_analytiques (id, company_id, ligne_ecriture_id, plan_analytique_id, departement_id, num_compte, montant, sync_status) 
                        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
                    `).run(anaIdReel, companyId, ligneIdReelle, ana.plan_analytique_id, ana.departement_id, lb.num_compte, ana.montant);
                    
                    db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('lignes_analytiques', ?, 'INSERT', ?)").run(anaIdReel, companyId);
                });
            }

            db.prepare(`
                UPDATE brouillon_lignes 
                SET statut = 'VALIDE', observation = ?, sync_status = 'pending' 
                WHERE piece_provisoire = ? AND journal_id = ? AND company_id = ?
            `).run(`Transféré le ${new Date().toISOString()}`, piece_provisoire, journal_id, companyId);
            
            db.prepare(`
                UPDATE brouillon_ecritures 
                SET statut = 'VALIDE', sync_status = 'pending' 
                WHERE piece_provisoire = ? AND journal_id = ? AND company_id = ?
            `).run(piece_provisoire, journal_id, companyId);

            const updatedLignes = db.prepare(`SELECT id FROM brouillon_lignes WHERE piece_provisoire = ? AND journal_id = ? AND company_id = ?`).all(piece_provisoire, journal_id, companyId);
            updatedLignes.forEach(l => {
                db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('brouillon_lignes', ?, 'UPDATE', ?)").run(l.id, companyId);
            });

            const enteteBrouillon = db.prepare(`SELECT id FROM brouillon_ecritures WHERE piece_provisoire = ? AND journal_id = ? AND company_id = ?`).get(piece_provisoire, journal_id, companyId);
            if (enteteBrouillon) {
                db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('brouillon_ecritures', ?, 'UPDATE', ?)").run(enteteBrouillon.id, companyId);
            }

            if (lignesBrouillon.some(l => l.libelle?.includes('EXTOURNE'))) {
                db.prepare(`
                    UPDATE brouillard_lignes_treso 
                    SET statut = 'REJETE', v1_statut = 0, motif_annulation = 'Annulation confirmée par extourne' 
                    WHERE piece_comptable = ? AND journal_id = ? AND company_id = ? AND v1_statut = 9
                `).run(piece_provisoire.replace('BR-', ''), journal_id, companyId);
            }
        });
    }

    // 7. Rejet et Libération Trésorerie
    async rejeterPieceBrouillon({ piece_provisoire, journal_id, observation, companyId }) {
        const db = getDb();

        if (!journal_id) throw new Error("Le journal_id est requis pour rejeter cette pièce.");

        return db.transaction(() => {
            db.prepare(`
                UPDATE brouillon_lignes 
                SET statut = 'REJETE', observation = ?, sync_status = 'pending' 
                WHERE piece_provisoire = ? 
                  AND journal_id = ? 
                  AND company_id = ?
            `).run(observation, piece_provisoire, journal_id, companyId);

            db.prepare(`
                UPDATE brouillon_ecritures 
                SET statut = 'REJETE', sync_status = 'pending' 
                WHERE piece_provisoire = ? 
                  AND journal_id = ? 
                  AND company_id = ?
            `).run(piece_provisoire, journal_id, companyId);

            // 🔄 Synchronisation Cloud des modifications de statut
            const updatedLignes = db.prepare(`SELECT id FROM brouillon_lignes WHERE piece_provisoire = ? AND journal_id = ? AND company_id = ?`).all(piece_provisoire, journal_id, companyId);
            updatedLignes.forEach(l => {
                db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('brouillon_lignes', ?, 'UPDATE', ?)").run(l.id, companyId);
            });

            const enteteBrouillon = db.prepare(`SELECT id FROM brouillon_ecritures WHERE piece_provisoire = ? AND journal_id = ? AND company_id = ?`).get(piece_provisoire, journal_id, companyId);
            if (enteteBrouillon) {
                db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('brouillon_ecritures', ?, 'UPDATE', ?)").run(enteteBrouillon.id, companyId);
            }

            const refOriginale = piece_provisoire.replace('BR-', '');

            db.prepare(`
                UPDATE brouillard_lignes_treso 
                SET comptabilise = 0, 
                    brouillon_ecriture_id = NULL 
                WHERE piece_comptable = ? 
                  AND journal_id = ? 
                  AND company_id = ?
            `).run(refOriginale, journal_id, companyId);
        });
    }
}

module.exports = new JournalEcritureBrouillonService();