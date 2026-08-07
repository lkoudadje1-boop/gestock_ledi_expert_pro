const { getDb } = require('../config/database');

const genererIdLocal = (prefix) => {
    return `${prefix}-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`;
};

/**
 * GÉNÉRATEUR D'ÉCRITURES UNIVERSEL (VERSION FINALE CORRIGÉE & SYNCHRONISÉE CLOUD)
 * Gère dynamiquement le basculement entre Brouillon et Réel selon la configuration
 */
exports.genererEcritureExplicite = (tableName, recordId, companyId) => {
    const db = getDb();
    
    // 1. Récupération de l'entête source (Vente, Achat, etc.)
    const header = db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(recordId);
    if (!header) return null;

    const referencePiece = header.lot_id || header.id;

    // 2. Anti-doublon (Vérifie les deux circuits)
    const dejaPresent = db.prepare(`
        SELECT id FROM ecritures WHERE reference = ? AND company_id = ? 
        UNION 
        SELECT id FROM brouillon_ecritures WHERE reference = ? AND company_id = ?
    `).get(referencePiece, companyId, referencePiece, companyId);
    
    if (dejaPresent) {
        db.prepare(`UPDATE ${tableName} SET is_comptabilise = 1, sync_status = 'pending' WHERE id = ?`).run(recordId);
        db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES (?, ?, 'UPDATE', ?)").run(tableName, recordId, companyId);
        return dejaPresent.id;
    }

    // 3. Mapping des tables de détails
    let detailTable = tableName;
    let parentKey = 'lot_id';
    if (tableName === 'sales') { detailTable = 'sale_items'; parentKey = 'id_vente'; }
    else if (tableName === 'purchases') { detailTable = 'purchase_items'; parentKey = 'id_achat'; }
    else if (tableName === 'purchases_mp') { detailTable = 'purchase_items_mp'; parentKey = 'id_achat_mp'; }
    else if (tableName === 'inventories') { detailTable = 'inventory_items'; parentKey = 'id_inventaire'; }

    const allItems = db.prepare(`SELECT * FROM ${detailTable} WHERE ${parentKey} = ? AND company_id = ?`).all(recordId, companyId);
    const itemsToProcess = allItems.length > 0 ? allItems : [header];

    // 4. Harmonisation du mode de règlement pour le matching
    const pm = db.prepare(`SELECT libelle FROM payment_methods WHERE (code = ? || libelle = ?) AND company_id = ?`)
                     .get(header.mode_reglement, header.mode_reglement, companyId);
    const modeHarmonise = pm ? pm.libelle : (header.mode_reglement || '').toUpperCase().trim();

    // 5. Récupération de la configuration ACTIVE
    const configs = db.prepare(`
        SELECT * FROM config_ecritures_auto 
        WHERE table_source = ? AND company_id = ? 
        AND (UPPER(condition_reglement) = ? OR condition_reglement = 'TOUS' OR condition_reglement = '' OR condition_reglement IS NULL)
        AND (UPPER(type_operation) = UPPER(?) OR type_operation = 'TOUS' OR type_operation IS NULL)
        ORDER BY condition_reglement DESC LIMIT 1
    `).all(detailTable, companyId, modeHarmonise, header.type_ligne || 'VENTE');

    if (configs.length === 0) return null;

    const exercice = db.prepare("SELECT id FROM exercices WHERE company_id = ? AND statut = 'OUVERT' LIMIT 1").get(companyId);
    if (!exercice) throw new Error("Aucun exercice ouvert trouvé.");

    // 6. TRANSACTION D'INJECTION
    return db.transaction(() => {
        let lastEcrId = null;
        const dateAction = (header.date_vente || header.date_achat || header.closed_at || new Date().toISOString()).split('T')[0];

        configs.forEach(config => {
            const schemaLignes = db.prepare("SELECT * FROM config_ecritures_lignes WHERE config_id = ?").all(config.id);
            const isBrouillon = config.mode_ecriture === 'BROUILLON';

            // Groupement par journal
            const lignesParJournal = schemaLignes.reduce((acc, curr) => {
                if (!acc[curr.journal_id]) acc[curr.journal_id] = [];
                acc[curr.journal_id].push(curr);
                return acc;
            }, {});

            for (const jId in lignesParJournal) {
                const journal = db.prepare("SELECT code, compteur_piece, compteur_brouillon FROM journaux WHERE id = ?").get(jId);
                const colCompteur = isBrouillon ? 'compteur_brouillon' : 'compteur_piece';
                const prochainNumero = (journal[colCompteur] || 1);
                
                const ecrId = genererIdLocal(isBrouillon ? 'BR' : 'ECR');
                lastEcrId = ecrId;

                // --- INSERTION ENTÊTE ---
                if (isBrouillon) {
                    db.prepare(`
                        INSERT INTO brouillon_ecritures (id, company_id, journal_id, exercice_id, date_ecriture, piece_provisoire, reference, libelle, user_saisie, statut, sync_status)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SYSTEM', 'EN_ATTENTE', 'pending')
                    `).run(ecrId, companyId, jId, exercice.id, dateAction, prochainNumero.toString(), referencePiece, config.libelle_evenement);
                    
                    db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('brouillon_ecritures', ?, 'INSERT', ?)").run(ecrId, companyId);
                } else {
                    db.prepare(`
                        INSERT INTO ecritures (id, company_id, journal_id, exercice_id, date_ecriture, piece, reference, libelle, user_saisie, sync_status)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SYSTEM', 'pending')
                    `).run(ecrId, companyId, jId, exercice.id, dateAction, prochainNumero.toString(), referencePiece, config.libelle_evenement);

                    db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('ecritures', ?, 'INSERT', ?)").run(ecrId, companyId);
                }

                // --- INSERTION LIGNES ---
                lignesParJournal[jId].forEach(s => {
                    const filtered = itemsToProcess.filter(it => !s.filtre_colonne || String(it[s.filtre_colonne]) === String(s.filtre_valeur));
                    const montant = Math.round(filtered.reduce((sum, it) => sum + Math.abs(Number(it[s.colonne_source] || 0)), 0) * 100) / 100;
                    
                    if (montant <= 0) return;

                    let finalCompteId = s.compte_id;
                    let numTiers = null;

                    if (s.is_tiers === 1) {
                        const refTiers = header.supplier_id || header.customer_id;
                        const t = db.prepare(`SELECT numero_tiers, compte_collectif_id FROM plan_tiers WHERE reference_id = ? AND company_id = ?`).get(refTiers, companyId);
                        if (t) { numTiers = t.numero_tiers; finalCompteId = t.compte_collectif_id; }
                    }

                    const numCpt = db.prepare("SELECT numero_compte FROM plan_comptable WHERE id = ?").get(finalCompteId)?.numero_compte;
                    const ligId = genererIdLocal('LIG');

                    if (isBrouillon) {
                        db.prepare(`
                            INSERT INTO brouillon_lignes (id, company_id, brouillon_id, journal_id, exercice_id, date_ecriture, piece_provisoire, reference, compte_id, num_compte, num_tiers, libelle, debit, credit, statut, sync_status)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'EN_ATTENTE', 'pending')
                        `).run(ligId, companyId, ecrId, jId, exercice.id, dateAction, prochainNumero.toString(), referencePiece, finalCompteId, numCpt, numTiers, s.label_ligne || config.libelle_evenement, s.sens === 'DEBIT' ? montant : 0, s.sens === 'CREDIT' ? montant : 0);

                        db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('brouillon_lignes', ?, 'INSERT', ?)").run(ligId, companyId);
                    } else {
                        db.prepare(`
                            INSERT INTO lignes_ecritures (id, company_id, ecriture_id, journal_id, exercice_id, date_ecriture, piece, reference, compte_id, num_compte, num_tiers, libelle, debit, credit, sync_status)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
                        `).run(ligId, companyId, ecrId, jId, exercice.id, dateAction, prochainNumero.toString(), referencePiece, finalCompteId, numCpt, numTiers, s.label_ligne || config.libelle_evenement, s.sens === 'DEBIT' ? montant : 0, s.sens === 'CREDIT' ? montant : 0);

                        db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('lignes_ecritures', ?, 'INSERT', ?)").run(ligId, companyId);
                    }
                });

                // Maj du compteur spécifique avec synchro Cloud
                db.prepare(`UPDATE journaux SET ${colCompteur} = ${colCompteur} + 1, sync_status = 'pending' WHERE id = ?`).run(jId);
                db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('journaux', ?, 'UPDATE', ?)").run(jId, companyId);
            }
        });

        // Marquage de la source comme traitée avec synchro Cloud
        db.prepare(`UPDATE ${tableName} SET is_comptabilise = 1, sync_status = 'pending' WHERE id = ?`).run(recordId);
        db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES (?, ?, 'UPDATE', ?)").run(tableName, recordId, companyId);
        
        return lastEcrId;
    })();
};

/**
 * Simule les écritures avec regroupement (Centralisation)
 */
exports.simulerEcrituresSelectionnees = (items, companyId) => {
    const db = getDb();
    let accumulation = {};

    const detailMapping = {
        'sales': { table: 'sale_items', fk: 'id_vente' },
        'purchases': { table: 'purchase_items', fk: 'id_achat' },
        'purchases_mp': { table: 'purchase_items_mp', fk: 'id_achat_mp' },
        'inventories': { table: 'inventory_items', fk: 'id_inventaire' }
    };

    for (const item of items) {
        const header = db.prepare(`SELECT * FROM ${item.table_source} WHERE id = ?`).get(item.id);
        if (!header) continue;

        const mapping = detailMapping[item.table_source];
        if (!mapping) continue;

        const allDetails = db.prepare(`SELECT * FROM ${mapping.table} WHERE ${mapping.fk} = ? AND company_id = ?`)
                           .all(item.id, companyId);
        
        const mode = (header.mode_reglement || '').toUpperCase().trim();

        const config = db.prepare(`
            SELECT * FROM config_ecritures_auto 
            WHERE table_source = ? AND company_id = ? 
            AND (UPPER(condition_reglement) = ? OR condition_reglement = '' OR condition_reglement IS NULL OR condition_reglement = 'TOUS')
            ORDER BY condition_reglement DESC LIMIT 1
        `).get(mapping.table, companyId, mode);

        if (!config) continue;

        const schemaLignes = db.prepare(`
            SELECT l.*, j.code as code_journal 
            FROM config_ecritures_lignes l
            LEFT JOIN journaux j ON l.journal_id = j.id
            WHERE l.config_id = ?
        `).all(config.id);
        
        const dateOp = (header.date_vente || header.date_achat || header.closed_at || "").split('T')[0];

        schemaLignes.forEach(s => {
            const subItems = allDetails.filter(si => !s.filtre_colonne || String(si[s.filtre_colonne]) === String(s.filtre_valeur));
            const montant = subItems.reduce((sum, si) => sum + Math.abs(Number(si[s.colonne_source] || 0)), 0);
            
            if (montant > 0) {
                let finalCompteId = s.compte_id;
                let numTiers = null;

                if (s.is_tiers === 1) {
                    const refTiers = header.supplier_id || header.customer_id;
                    const t = db.prepare(`SELECT numero_tiers, compte_collectif_id FROM plan_tiers WHERE reference_id = ? AND company_id = ?`).get(refTiers, companyId);
                    if (t) { 
                        numTiers = t.numero_tiers; 
                        finalCompteId = t.compte_collectif_id; 
                    }
                }

                const infoCpt = db.prepare("SELECT numero_compte FROM plan_comptable WHERE id = ?").get(finalCompteId);
                const numeroCompte = infoCpt?.numero_compte || 'INCONNU';

                const key = `${dateOp}-${s.code_journal || 'OD'}-${numeroCompte}-${numTiers || 'SANS'}-${s.sens}`;

                if (!accumulation[key]) {
                    accumulation[key] = {
                        date: dateOp,
                        code_journal: s.code_journal || 'OD',
                        numero_compte: numeroCompte,
                        num_tiers: numTiers,
                        libelle: s.is_tiers === 1 ? `TIERS: ${numTiers}` : `CENTRALISATION ${config.libelle_evenement}`,
                        debit: 0,
                        credit: 0
                    };
                }

                if (s.sens === 'DEBIT') accumulation[key].debit += montant;
                else accumulation[key].credit += montant;
            }
        });
    }

    return Object.values(accumulation).map(l => ({
        ...l,
        debit: Math.round(l.debit * 100) / 100,
        credit: Math.round(l.credit * 100) / 100
    })).sort((a,b) => a.date.localeCompare(b.date));
};

exports.listByTable = (table, companyId) => {
    const db = getDb();
    const configs = db.prepare("SELECT * FROM config_ecritures_auto WHERE table_source = ? AND company_id = ?").all(table, companyId);
    return configs.map(c => ({ ...c, lignes: db.prepare("SELECT l.*, pc.numero_compte FROM config_ecritures_lignes l LEFT JOIN plan_comptable pc ON l.compte_id = pc.id WHERE l.config_id = ?").all(c.id) }));
};

exports.deleteConfig = (id, companyId) => {
    const db = getDb();
    return db.transaction(() => {
        // Enregistrement des suppressions dans la file Cloud avant exécution
        const lines = db.prepare("SELECT id FROM config_ecritures_lignes WHERE config_id = ? AND company_id = ?").all(id, companyId);
        const syncDel = db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES (?, ?, 'DELETE', ?)");
        lines.forEach(l => syncDel.run('config_ecritures_lignes', l.id, companyId));
        syncDel.run('config_ecritures_auto', id, companyId);

        db.prepare("DELETE FROM config_ecritures_lignes WHERE config_id = ? AND company_id = ?").run(id, companyId);
        db.prepare("DELETE FROM config_ecritures_auto WHERE id = ? AND company_id = ?").run(id, companyId);
    })();
};

exports.getTableColumns = (tableName) => {
    const db = getDb();
    const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
    return columns
        .map(col => col.name)
        .filter(name => ![
            'id', 'company_id', 'user_id', 'sync_status', 
            'created_at', 'updated_at', 'is_active', 'is_archived',
            'lot_id', 'matiere_id', 'supplier_id'
        ].includes(name));
};

/**
 * VALIDE ET ENREGISTRE LA CENTRALISATION EN BASE (Avec Synchronisation Cloud)
 */
exports.saveSchemaDynamique = (data, companyId) => {
    const db = getDb();
    const cId = typeof companyId === 'object' ? companyId.companyId : companyId;

    return db.transaction(() => {
        const typeOp = data.type_operation || data.code_flux || 'VENTE';
        const codeEvt = data.code_evenement || 'EVT_AUTO';

        const existing = db.prepare(`
            SELECT id FROM config_ecritures_auto 
            WHERE code_evenement = ? AND company_id = ? AND type_operation = ? AND condition_reglement = ?
        `).get(codeEvt, cId, typeOp, data.condition_reglement || '');

        let configId;
        const syncQueueStmt = db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES (?, ?, ?, ?)");

        if (existing) {
            configId = existing.id;
            
            // Queue delete pour les anciennes lignes avant de les purger
            const oldLines = db.prepare("SELECT id FROM config_ecritures_lignes WHERE config_id = ?").all(configId);
            oldLines.forEach(l => syncQueueStmt.run('config_ecritures_lignes', l.id, 'DELETE', cId));

            db.prepare(`
                UPDATE config_ecritures_auto SET 
                    libelle_evenement = ?, table_source = ?, mode_ecriture = ?, sync_status = 'pending', updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(data.libelle_evenement, data.table_source, data.mode_ecriture || 'BROUILLON', configId);
            
            syncQueueStmt.run('config_ecritures_auto', configId, 'UPDATE', cId);
            db.prepare(`DELETE FROM config_ecritures_lignes WHERE config_id = ?`).run(configId);
        } else {
            configId = genererIdLocal('CFG');
            db.prepare(`
                INSERT INTO config_ecritures_auto (
                    id, company_id, code_evenement, type_operation, 
                    condition_reglement, libelle_evenement, table_source, mode_ecriture, sync_status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
            `).run(configId, cId, codeEvt, typeOp, data.condition_reglement || '', data.libelle_evenement, data.table_source, data.mode_ecriture || 'BROUILLON');
            
            syncQueueStmt.run('config_ecritures_auto', configId, 'INSERT', cId);
        }

        const stmtLigne = db.prepare(`
            INSERT INTO config_ecritures_lignes (
                id, config_id, company_id, journal_id, compte_id, 
                sens, colonne_source, label_ligne, 
                is_tiers, filtre_colonne, filtre_valeur, sync_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        `);

        if (data.lignes && Array.isArray(data.lignes)) {
            for (const ligne of data.lignes) {
                if (!ligne.compte_id || !ligne.journal_id || !ligne.sens) continue;
                const ligneId = genererIdLocal('LIG');

                stmtLigne.run(
                    ligneId,
                    configId,
                    cId,
                    ligne.journal_id,
                    ligne.compte_id,
                    ligne.sens,
                    ligne.colonne_source,
                    ligne.label_ligne || data.libelle_evenement,
                    ligne.is_tiers ? 1 : 0,
                    ligne.filtre_colonne || null,
                    ligne.filtre_valeur || null
                );

                syncQueueStmt.run('config_ecritures_lignes', ligneId, 'INSERT', cId);
            }
        }
        return { success: true, id: configId };
    })();
};