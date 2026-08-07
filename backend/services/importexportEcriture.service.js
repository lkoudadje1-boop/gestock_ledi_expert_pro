const { getDb } = require('../config/database');

/**
 * Logique de formatage des dates SQL
 */
const formatToSQLDate = (dateStr) => {
    if (!dateStr || dateStr === "null" || dateStr === "") return null;
    const s = dateStr.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; 
    if (s.includes('/')) {
        const p = s.split('/');
        if (p.length === 3) {
            return `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
        }
    }
    return s;
};

// --- LOGIQUE D'EXPORTATION ---
exports.getExportData = (queryParams, companyId) => {
    const db = getDb();
    const { exercice_id, journal_id, date_debut, date_fin, statut } = queryParams;

    let filterSQL = `WHERE l.company_id = ? AND l.exercice_id = ?`;
    let params = [companyId, exercice_id];

    if (journal_id && journal_id !== 'ALL') {
        filterSQL += ` AND l.journal_id = ?`;
        params.push(journal_id);
    }
    if (date_debut && date_fin) {
        filterSQL += ` AND l.date_ecriture BETWEEN ? AND ?`;
        params.push(date_debut, date_fin);
    }
    if (statut === 'NORMAL') filterSQL += ` AND l.is_deleted = 0`;
    else if (statut === 'DELETED') filterSQL += ` AND l.is_deleted = 1`;

    const lignesG = db.prepare(`
        SELECT 
            l.id, l.date_ecriture, l.date_echeance, j.code as journal_code, l.piece, l.facture, l.reference,
            l.num_compte, l.num_tiers, l.libelle, l.debit, l.credit, l.is_deleted
        FROM lignes_ecritures l
        JOIN journaux j ON l.journal_id = j.id
        ${filterSQL}
        ORDER BY l.date_ecriture ASC, l.piece ASC, l.created_at ASC
    `).all(...params);

    return lignesG.map(g => {
        const ventilations = db.prepare(`
            SELECT pa.code as ana_code, la.montant 
            FROM lignes_analytiques la
            JOIN plan_analytique pa ON la.plan_analytique_id = pa.id
            WHERE la.ligne_ecriture_id = ?
        `).all(g.id);
        return { ...g, ventilations };
    });
};

// --- LOGIQUE D'IMPORTATION ---
exports.processMassiveImport = (fileBuffer, exercice_id, companyId) => {
    const db = getDb();
    
    // ÉTAPE 0 : Bornes de l'exercice
    const exercice = db.prepare("SELECT date_debut, date_fin FROM exercices WHERE id = ?").get(exercice_id);
    if (!exercice) throw new Error("Exercice cible introuvable.");

    const csvRaw = fileBuffer.toString('utf8').replace(/^\ufeff/, '');
    const lines = csvRaw.split(/\r?\n/).filter(line => line.trim() !== "").slice(1);
    if (lines.length === 0) throw new Error("Le fichier est vide.");

    // ÉTAPE 1 : Validation Équilibre et Dates
    const piecesGroupes = {};
    const rowsParsed = lines.map((line, index) => {
        const cols = line.split(';').map(c => c.trim().replace(/^"|"$/g, ''));
        if (cols.length < 12) return null;

        const [dateRaw, , type, , piece, , , , , , debit, credit] = cols;
        if (!piece) return null;

        const dateSQL = formatToSQLDate(dateRaw);
        if (!dateSQL || dateSQL < exercice.date_debut || dateSQL > exercice.date_fin) {
            throw new Error(`LIGNE ${index + 2} : La date '${dateRaw}' est hors limites pour l'exercice (${exercice.date_debut} à ${exercice.date_fin}).`);
        }

        if (!piecesGroupes[piece]) piecesGroupes[piece] = { soldeGeneral: 0 };
        if (type === 'G') {
            const d = parseFloat(debit.replace(',', '.') || 0);
            const c = parseFloat(credit.replace(',', '.') || 0);
            piecesGroupes[piece].soldeGeneral += (d - c);
        }
        return cols;
    }).filter(r => r !== null);

    for (const [numPiece, data] of Object.entries(piecesGroupes)) {
        if (Math.abs(data.soldeGeneral) > 0.01) {
            throw new Error(`ERREUR ÉQUILIBRE : La pièce n° ${numPiece} est déséquilibrée.`);
        }
    }

    // ÉTAPE 2 : Insertion Transactionnelle
    db.transaction(() => {
        let lastEcritureId = null;
        let lastLigneGId = null;
        let lastLigneGMontant = 0;
        let cumulAnalytiqueLigneCourante = 0;
        let currentPiece = null;

        const syncQueueStmt = db.prepare(`
            INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
            VALUES (?, ?, 'INSERT', ?)
        `);

        const validerVentilationPrecedente = (libelleRef) => {
            if (lastLigneGId && cumulAnalytiqueLigneCourante > 0) {
                if (Math.abs(cumulAnalytiqueLigneCourante - lastLigneGMontant) > 0.01) {
                    throw new Error(`ERREUR ANALYTIQUE : La ventilation pour "${libelleRef}" est incorrecte.`);
                }
            }
        };

        rowsParsed.forEach((cols) => {
            const [dateRaw, echRaw, type, jCode, piece, facture, ref, numG, numT, libelle, debit, credit, anaSec] = cols;
            const dateSQL = formatToSQLDate(dateRaw);
            const echSQL = formatToSQLDate(echRaw); 
            const dNum = parseFloat(debit.replace(',', '.') || 0);
            const cNum = parseFloat(credit.replace(',', '.') || 0);

            const journal = db.prepare("SELECT id FROM journaux WHERE code = ? AND company_id = ?").get(jCode, companyId);
            if (!journal) throw new Error(`Journal ${jCode} inconnu.`);

            if (type === 'G') {
                validerVentilationPrecedente(libelle);
                if (piece !== currentPiece) {
                    lastEcritureId = `ECR-IMP-${Date.now()}-${piece}`;
                    
                    // 🔄 Insertion entête écriture + synchronisation Cloud
                    db.prepare(`
                        INSERT INTO ecritures (id, company_id, journal_id, exercice_id, date_ecriture, piece, libelle, sync_status) 
                        VALUES (?,?,?,?,?,?,?, 'pending')
                    `).run(lastEcritureId, companyId, journal.id, exercice_id, dateSQL, piece, libelle.toUpperCase());

                    syncQueueStmt.run('ecritures', lastEcritureId, companyId);
                    currentPiece = piece;
                }

                const compte = db.prepare("SELECT id FROM plan_comptable WHERE numero_compte = ? AND company_id = ?").get(numG, companyId);
                if (!compte) throw new Error(`Compte ${numG} introuvable.`);

                lastLigneGId = `LIG-IMP-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
                lastLigneGMontant = dNum || cNum;
                cumulAnalytiqueLigneCourante = 0;

                // 🔄 Insertion ligne écriture + synchronisation Cloud
                db.prepare(`
                    INSERT INTO lignes_ecritures (id, company_id, ecriture_id, journal_id, exercice_id, date_ecriture, date_echeance, piece, facture, reference, compte_id, num_compte, num_tiers, libelle, debit, credit, sync_status) 
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'pending')
                `).run(lastLigneGId, companyId, lastEcritureId, journal.id, exercice_id, dateSQL, echSQL, piece, facture || null, ref || null, compte.id, numG, numT || null, libelle.toUpperCase(), dNum, cNum);

                syncQueueStmt.run('lignes_ecritures', lastLigneGId, companyId);
            
            } else if (type === 'A') {
                const montantAna = dNum || cNum;
                cumulAnalytiqueLigneCourante += montantAna;
                const section = db.prepare("SELECT id, parent_dept_id FROM plan_analytique WHERE code = ? AND company_id = ?").get(anaSec, companyId);
                
                if (section && lastLigneGId) {
                    const lanaId = `LANA-IMP-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
                    
                    // 🔄 Insertion ligne analytique + synchronisation Cloud
                    db.prepare(`
                        INSERT INTO lignes_analytiques (id, company_id, ligne_ecriture_id, plan_analytique_id, departement_id, num_compte, montant, sync_status) 
                        VALUES (?,?,?,?,?,?,?, 'pending')
                    `).run(lanaId, companyId, lastLigneGId, section.id, section.parent_dept_id, numG, montantAna);

                    syncQueueStmt.run('lignes_analytiques', lanaId, companyId);
                }
            }
        });
        validerVentilationPrecedente("Dernière ligne");
    })();
};