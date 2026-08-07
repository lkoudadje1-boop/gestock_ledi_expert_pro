const { getDb } = require('../config/database');
const { logAction } = require('../utils/auditHelper'); // Centralisation de l'audit log

class JournalEcritureService {
    // --- UTILS ---
    trouverPieceLibre(db, journal_id, exercice_id, companyId, numeroPiece) {
        let pieceValide = numeroPiece;
        let existe = db.prepare(`SELECT 1 FROM ecritures WHERE piece = ? AND journal_id = ? AND exercice_id = ? AND company_id = ? AND is_deleted = 0 LIMIT 1`).get(pieceValide, journal_id, exercice_id, companyId);
        let index = 1;
        while (existe) {
            pieceValide = `${numeroPiece}-${index}`;
            existe = db.prepare(`SELECT 1 FROM ecritures WHERE piece = ? AND journal_id = ? AND exercice_id = ? AND company_id = ? AND is_deleted = 0 LIMIT 1`).get(pieceValide, journal_id, exercice_id, companyId);
            index++;
        }
        return pieceValide;
    }

    // --- LOGIQUE D'ÉCRITURE ---
    async creerEcritureGroupée(data, companyId, userId, userName) {
        const db = getDb();
        const { journal_id, exercice_id, date_ecriture, libelle_general, piece_manuelle, lignes } = data;

        const exercice = db.prepare("SELECT date_debut, date_fin FROM exercices WHERE id = ?").get(exercice_id);
        if (!exercice) throw new Error("Exercice introuvable.");

        if (date_ecriture < exercice.date_debut || date_ecriture > exercice.date_fin) {
            throw new Error(`Date hors limites (${exercice.date_debut} à ${exercice.date_fin})`);
        }

        const ecritureId = `ECR-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        let pieceGeneree = "";

        db.transaction(() => {
            const journal = db.prepare("SELECT * FROM journaux WHERE id = ? AND company_id = ?").get(journal_id, companyId);
            if (!journal) throw new Error("Journal introuvable.");

            let numeroPiece = piece_manuelle;
            if (journal.mode_numerotation === 'AUTO' && !piece_manuelle) {
                const lastPieceRow = db.prepare(`
                    SELECT piece FROM lignes_ecritures 
                    WHERE journal_id = ? AND exercice_id = ? AND company_id = ? AND is_deleted = 0
                    ORDER BY CAST(piece AS INTEGER) DESC LIMIT 1
                `).get(journal_id, exercice_id, companyId);

                const prochainNumero = lastPieceRow ? (parseInt(lastPieceRow.piece) + 1) : 1;
                const sequence = prochainNumero.toString().padStart(journal.longueur_compteur || 1, '0');
                const prefixe = journal.prefixe_piece || journal.code;
                numeroPiece = `${prefixe}-${sequence}`;
            }

            pieceGeneree = this.trouverPieceLibre(db, journal_id, exercice_id, companyId, numeroPiece);

            const syncQueueStmt = db.prepare(`
                INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
                VALUES (?, ?, ?, ?)
            `);

            db.prepare(`
                INSERT INTO ecritures (id, company_id, journal_id, exercice_id, date_ecriture, piece, libelle, user_saisie, sync_status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
            `).run(ecritureId, companyId, journal_id, exercice_id, date_ecriture, pieceGeneree.toString(), libelle_general.toUpperCase(), userName);

            syncQueueStmt.run('ecritures', ecritureId, 'INSERT', companyId);

            const insertLigne = db.prepare(`
                INSERT INTO lignes_ecritures (id, company_id, ecriture_id, journal_id, exercice_id, date_ecriture, date_echeance, piece, compte_id, libelle, debit, credit, sync_status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
            `);
            
            lignes.forEach((lig, index) => {
                const ligneId = `LIG-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 4)}`;
                const echeance = lig.date_echeance || date_ecriture; 
                insertLigne.run(ligneId, companyId, ecritureId, journal_id, exercice_id, date_ecriture, echeance, pieceGeneree.toString(), lig.compte_id, lig.libelle.toUpperCase(), lig.debit || 0, lig.credit || 0);
                
                syncQueueStmt.run('lignes_ecritures', ligneId, 'INSERT', companyId);
            });

            // 💡 Enregistrement de l'audit pour la saisie groupée
            logAction({
                userId,
                userName,
                actionType: 'CREATION_ECRITURE_GROUPEE',
                tableConcernee: 'ecritures',
                referenceId: ecritureId,
                description: `Création d'une écriture groupée - Pièce : ${pieceGeneree} (${lignes.length} lignes saisies)`,
                companyId
            });
        })();

        return { ecritureId, pieceGeneree };
    }

    async enregistrerLigneUnique(body, companyId, userId, userName) {
        const db = getDb();
        const { id, journal_id, exercice_id, date_ecriture, date_echeance, piece, facture, reference, num_compte, num_tiers, libelle, debit, credit, compte_id } = body;

        return db.transaction(() => {
            const journal = db.prepare(`SELECT * FROM journaux WHERE id = ? AND company_id = ?`).get(journal_id, companyId);
            if (!journal) throw new Error("Journal introuvable");

            let pieceDeTravail = piece ? piece.toString().split('.')[0] : '';

            if (!id && !piece) {
                const pieceInachevee = db.prepare(`
                    SELECT piece FROM lignes_ecritures 
                    WHERE journal_id = ? AND exercice_id = ? AND company_id = ? AND is_deleted = 0
                    GROUP BY piece HAVING ROUND(SUM(debit) - SUM(credit), 2) != 0 LIMIT 1
                `).get(journal_id, exercice_id, companyId);
                
                if (pieceInachevee) {
                    pieceDeTravail = pieceInachevee.piece.toString();
                } else if (journal.mode_numerotation === 'AUTO') {
                    const lastPieceRow = db.prepare(`
                        SELECT piece FROM lignes_ecritures 
                        WHERE journal_id = ? AND exercice_id = ? AND company_id = ? AND is_deleted = 0
                        ORDER BY CAST(piece AS INTEGER) DESC LIMIT 1
                    `).get(journal_id, exercice_id, companyId);
                    pieceDeTravail = lastPieceRow ? (parseInt(lastPieceRow.piece) + 1).toString() : "1";
                }
            }

            if (!pieceDeTravail && !id) throw new Error("Veuillez saisir un numéro de pièce.");

            const syncQueueStmt = db.prepare(`
                INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
                VALUES (?, ?, ?, ?)
            `);

            let ecriture_id;
            const finalLibelle = libelle ? libelle.toUpperCase() : '';
            let entete = db.prepare(`SELECT id FROM ecritures WHERE piece = ? AND journal_id = ? AND exercice_id = ? AND company_id = ? AND is_deleted = 0`).get(pieceDeTravail, journal_id, exercice_id, companyId);

            if (!entete) {
                ecriture_id = `ECR-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
                db.prepare(`INSERT OR IGNORE INTO ecritures (id, company_id, journal_id, exercice_id, date_ecriture, piece, libelle, user_saisie, sync_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`).run(ecriture_id, companyId, journal_id, exercice_id, date_ecriture, pieceDeTravail, finalLibelle, userName);
                
                syncQueueStmt.run('ecritures', ecriture_id, 'INSERT', companyId);

                const exist = db.prepare(`SELECT id FROM ecritures WHERE piece = ? AND journal_id = ? AND exercice_id = ? AND company_id = ?`).get(pieceDeTravail, journal_id, exercice_id, companyId);
                ecriture_id = exist.id;
            } else {
                ecriture_id = entete.id;
            }

            const ligneId = id || `LIG-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
            const finalEcheance = num_tiers ? date_echeance : null;
            const isUpdate = !!id;

            if (isUpdate) {
                db.prepare(`
                    UPDATE lignes_ecritures 
                    SET ecriture_id = ?, date_ecriture = ?, date_echeance = ?, piece = ?, facture = ?, 
                        reference = ?, compte_id = ?, num_compte = ?, num_tiers = ?, libelle = ?, 
                        debit = ?, credit = ?, updated_at = CURRENT_TIMESTAMP, sync_status = 'pending' 
                    WHERE id = ? AND company_id = ?
                `).run(ecriture_id, date_ecriture, finalEcheance, pieceDeTravail, facture || null, reference || null, compte_id, num_compte, num_tiers || null, finalLibelle, parseFloat(debit || 0), parseFloat(credit || 0), id, companyId);
                
                syncQueueStmt.run('lignes_ecritures', id, 'UPDATE', companyId);
            } else {
                db.prepare(`
                    INSERT INTO lignes_ecritures (
                        id, company_id, ecriture_id, journal_id, exercice_id, 
                        date_ecriture, date_echeance, piece, facture, reference, 
                        compte_id, num_compte, num_tiers, libelle, debit, credit, sync_status
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
                `).run(ligneId, companyId, ecriture_id, journal_id, exercice_id, date_ecriture, finalEcheance, pieceDeTravail, facture || null, reference || null, compte_id, num_compte, num_tiers || null, finalLibelle, parseFloat(debit || 0), parseFloat(credit || 0));

                syncQueueStmt.run('lignes_ecritures', ligneId, 'INSERT', companyId);
            }

            // 💡 Enregistrement de l'audit pour l'ajout ou la mise à jour d'une ligne
            logAction({
                userId,
                userName,
                actionType: isUpdate ? 'UPDATE_LIGNE_BROUILLARD' : 'INSERT_LIGNE_BROUILLARD',
                tableConcernee: 'lignes_ecritures',
                referenceId: ligneId,
                description: `${isUpdate ? 'Modification' : 'Ajout'} de la ligne de compte ${num_compte} sur la pièce ${pieceDeTravail} (Débit: ${debit || 0} / Crédit: ${credit || 0})`,
                companyId
            });

            const checkSolde = db.prepare(`SELECT ROUND(SUM(debit) - SUM(credit), 2) as reste FROM lignes_ecritures WHERE piece = ? AND journal_id = ? AND exercice_id = ? AND company_id = ? AND is_deleted = 0`).get(pieceDeTravail, journal_id, exercice_id, companyId);
            const soldeFinal = checkSolde ? checkSolde.reste : 0;
            
            let prochainePiece = pieceDeTravail;
            if (Math.abs(soldeFinal) < 0.01 && journal.mode_numerotation === 'AUTO') {
                prochainePiece = (parseInt(pieceDeTravail) + 1).toString();
            }

            return { id: ligneId, ecriture_id, numPieceFinale: pieceDeTravail, prochainePiece, soldePiece: soldeFinal, contrepartie: journal.compte_contrepartie };
        })();
    }

    // --- LOGIQUE DE LETTRAGE ---
    async calculerProchaineLettre(companyId, numTiers, numCompte) {
        const db = getDb();
        
        const row = db.prepare(`
            SELECT lettre 
            FROM lignes_ecritures 
            WHERE company_id = ? 
              AND (num_tiers = ? OR (num_tiers IS NULL AND num_compte = ?))
              AND lettre IS NOT NULL 
              AND lettre != '' 
              AND is_deleted = 0
            ORDER BY LENGTH(lettre) DESC, lettre DESC 
            LIMIT 1
        `).get(companyId, numTiers, numCompte);

        if (!row || !row.lettre) return 'A';

        const last = row.lettre;
        let chars = last.split('');
        let i = chars.length - 1;

        while (i >= 0) {
            if (chars[i] !== 'Z') {
                chars[i] = String.fromCharCode(chars[i].charCodeAt(0) + 1);
                return chars.join('');
            }
            chars[i] = 'A';
            i--;
        }
        return 'A' + chars.join('');
    }
}

module.exports = new JournalEcritureService();