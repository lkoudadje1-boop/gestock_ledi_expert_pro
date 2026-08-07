const { getDb } = require('../config/database');
const { logAction } = require('../utils/auditHelper');

class RanService {
    /**
     * Génère les reports à nouveau et l'exercice N+1
     */
    async genererRAN(data, user) {
        const db = getDb();
        const { companyId, id: userId } = user;
        const userName = user.username || 'Système';
        const { exerciceACloturerId, compteResultatId, numCompteResultat, journalId, typeCloture } = data;

        // Exécution de la transaction principale
        const result = db.transaction(() => {
            // 1. Charger l'exercice source (N)
            const exSource = db.prepare("SELECT * FROM exercices WHERE id = ? AND company_id = ?").get(exerciceACloturerId, companyId);
            if (!exSource) throw new Error("Exercice source introuvable.");

            // 2. Gérer l'exercice suivant (N+1)
            const anneeN1 = new Date(exSource.date_fin).getFullYear() + 1;
            const libelleN1 = `EXERCICE ${anneeN1}`;
            
            let exSuivant = db.prepare("SELECT id FROM exercices WHERE libelle = ? AND company_id = ?").get(libelleN1, companyId);
            let nouvelExId;

            const stmtSync = db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES (?, ?, ?, ?)`);

            if (exSuivant) {
                nouvelExId = exSuivant.id;
            } else {
                nouvelExId = `EXE-N1-${Date.now()}`;
                db.prepare(`
                    INSERT INTO exercices (id, company_id, libelle, date_debut, date_fin, statut, sync_status)
                    VALUES (?, ?, ?, ?, ?, 'OUVERT', 'pending')
                `).run(nouvelExId, companyId, libelleN1, `${anneeN1}-01-01`, `${anneeN1}-12-31`);

                stmtSync.run('exercices', nouvelExId, 'INSERT', companyId);
            }

            // 3. NETTOYAGE préalable (avec traçabilité DELETE pour le Cloud)
            const pieceRan = `RAN-${anneeN1}`;
            
            // Récupération des IDs à supprimer pour la sync_queue
            const oldRans = db.prepare("SELECT id FROM reports_a_nouveau WHERE exercice_id = ? AND company_id = ?").all(nouvelExId, companyId);
            oldRans.forEach(r => stmtSync.run('reports_a_nouveau', r.id, 'DELETE', companyId));

            const oldLignes = db.prepare("SELECT id FROM lignes_ecritures WHERE exercice_id = ? AND journal_id = ? AND piece = ?").all(nouvelExId, journalId, pieceRan);
            oldLignes.forEach(l => stmtSync.run('lignes_ecritures', l.id, 'DELETE', companyId));

            const oldEcritures = db.prepare("SELECT id FROM ecritures WHERE exercice_id = ? AND journal_id = ? AND piece = ?").all(nouvelExId, journalId, pieceRan);
            oldEcritures.forEach(e => stmtSync.run('ecritures', e.id, 'DELETE', companyId));

            db.prepare("DELETE FROM reports_a_nouveau WHERE exercice_id = ? AND company_id = ?").run(nouvelExId, companyId);
            db.prepare("DELETE FROM ecritures WHERE exercice_id = ? AND journal_id = ? AND piece = ?").run(nouvelExId, journalId, pieceRan);
            db.prepare("DELETE FROM lignes_ecritures WHERE exercice_id = ? AND journal_id = ? AND piece = ?").run(nouvelExId, journalId, pieceRan);

            // 4. CALCUL DES SOLDES (Comptes de bilan uniquement [1-5])
            const soldes = db.prepare(`
                SELECT compte_id, num_compte, num_tiers, SUM(debit - credit) as solde_net
                FROM lignes_ecritures 
                WHERE exercice_id = ? AND company_id = ? AND is_deleted = 0 AND num_compte GLOB '[1-5]*' 
                GROUP BY compte_id, num_tiers 
                HAVING ABS(SUM(debit - credit)) > 0.001
            `).all(exerciceACloturerId, companyId);

            // 5. CRÉATION DE L'ÉCRITURE DE REPORT
            const ecritureId = `ECR-RAN-${Date.now()}`;
            db.prepare(`
                INSERT INTO ecritures (id, company_id, journal_id, exercice_id, date_ecriture, piece, libelle, user_saisie, sync_status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
            `).run(ecritureId, companyId, journalId, nouvelExId, `${anneeN1}-01-01`, pieceRan, `REPORT A NOUVEAU ${typeCloture}`, userName);

            stmtSync.run('ecritures', ecritureId, 'INSERT', companyId);

            // 6. INSERTION DES LIGNES DÉTAILLÉES
            const stmtLigne = db.prepare(`
                INSERT INTO lignes_ecritures (id, company_id, ecriture_id, journal_id, exercice_id, date_ecriture, piece, compte_id, num_compte, num_tiers, libelle, debit, credit, sync_status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
            `);

            const stmtTableRan = db.prepare(`
                INSERT INTO reports_a_nouveau (id, company_id, exercice_id, compte_id, num_compte, num_tiers, montant_debit, montant_credit, type_report, user_name, sync_status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
            `);

            let tDeb = 0, tCre = 0;
            soldes.forEach((s, i) => {
                const lid = `LIG-RAN-${Date.now()}-${i}`;
                const d = s.solde_net > 0 ? s.solde_net : 0;
                const c = s.solde_net < 0 ? Math.abs(s.solde_net) : 0;
                tDeb += d; tCre += c;
                
                stmtLigne.run(lid, companyId, ecritureId, journalId, nouvelExId, `${anneeN1}-01-01`, pieceRan, s.compte_id, s.num_compte, s.num_tiers, "SOLDE INITIAL", d, c);
                stmtTableRan.run(lid, companyId, nouvelExId, s.compte_id, s.num_compte, s.num_tiers, d, c, typeCloture, userName);

                stmtSync.run('lignes_ecritures', lid, 'INSERT', companyId);
                stmtSync.run('reports_a_nouveau', lid, 'INSERT', companyId);
            });

            // 7. ÉQUILIBRE PAR LE RÉSULTAT (Report à nouveau du bénéfice ou de la perte)
            const diff = tDeb - tCre;
            if (Math.abs(diff) > 0.01) {
                const rid = `LIG-RES-${Date.now()}`;
                const rd = diff < 0 ? Math.abs(diff) : 0;
                const rc = diff > 0 ? diff : 0;
                stmtLigne.run(rid, companyId, ecritureId, journalId, nouvelExId, `${anneeN1}-01-01`, pieceRan, compteResultatId, numCompteResultat, null, "RÉSULTAT NET REPORTÉ", rd, rc);
                stmtTableRan.run(rid, companyId, nouvelExId, compteResultatId, numCompteResultat, null, rd, rc, typeCloture, userName);

                stmtSync.run('lignes_ecritures', rid, 'INSERT', companyId);
                stmtSync.run('reports_a_nouveau', rid, 'INSERT', companyId);
            }

            // 8. MISE À JOUR DU STATUT DE L'EXERCICE CLÔTURÉ
            const nouveauStatut = (typeCloture === 'DEFINITIF') ? 'CLOTURE' : 'PRE_CLOTURE';
            db.prepare("UPDATE exercices SET statut = ?, sync_status = 'pending' WHERE id = ?").run(nouveauStatut, exerciceACloturerId);
            stmtSync.run('exercices', exerciceACloturerId, 'UPDATE', companyId);

            return { success: true, exSourceLibelle: exSource.libelle, nouveauStatut };
        })();

        // 💡 Journal d'audit déclenché après succès du traitement des RAN
        logAction({
            userId,
            userName,
            actionType: 'GENERATE_RAN',
            tableConcernee: 'exercices',
            referenceId: exerciceACloturerId,
            description: `Génération des reports à nouveau (${typeCloture}) pour l'${result.exSourceLibelle}. Passage au statut: ${result.nouveauStatut}`,
            companyId
        });

        return { success: true };
    }

    getBilanTiersData(exerciceId, companyId) {
        const db = getDb();
        const rows = db.prepare(`
            SELECT 
                l.num_compte as numero_compte,
                l.num_tiers,
                (SELECT nom FROM plan_tiers WHERE numero_tiers = l.num_tiers AND company_id = ?) as intitule_tiers,
                SUM(l.debit) as total_debit,
                SUM(l.credit) as total_credit
            FROM lignes_ecritures l
            WHERE l.exercice_id = ? AND l.company_id = ? AND l.is_deleted = 0 AND l.num_compte GLOB '[1-5]*'
            GROUP BY l.num_compte, l.num_tiers
            HAVING (SUM(l.debit) - SUM(l.credit)) != 0
            ORDER BY l.num_compte ASC, l.num_tiers ASC
        `).all(companyId, exerciceId, companyId);

        return rows.map(row => {
            const solde = row.total_debit - row.total_credit;
            return {
                numero_compte: row.numero_compte,
                num_tiers: row.num_tiers || '',
                intitule_tiers: row.intitule_tiers || "REPORT A NOUVEAU",
                solde_cumule_debit: solde > 0 ? solde : 0,
                solde_cumule_credit: solde < 0 ? Math.abs(solde) : 0
            };
        });
    }
}

module.exports = new RanService();