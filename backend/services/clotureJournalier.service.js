const { getDb } = require('../config/database');

/**
 * RÉCUPÉRATION DES DONNÉES EN ATTENTE (Tableau 1)
 * Harmonise les codes (ex: CS) en libellés (ex: ESPECE) pour le matching
 */
exports.getPendingData = (companyId, startDate, endDate) => {
    const db = getDb();
    
    const sources = [
        { table: 'sales', detailTable: 'sale_items', dateCol: 'date_vente', labelCol: 'nom_client_snap' },
        { table: 'purchases', detailTable: 'purchase_items', dateCol: 'date_achat', labelCol: 'nom_fournisseur_snap' },
        { table: 'purchases_mp', detailTable: 'purchase_items_mp', dateCol: 'date_achat', labelCol: 'nom_fournisseur_snap' },
        { table: 'inventories', detailTable: 'inventory_items', dateCol: 'closed_at', labelCol: 'libelle' }
    ];

    let ready = [];
    let orphans = [];

    sources.forEach(src => {
        try {
            const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(src.table);
            if (!tableExists) return;

            const cols = db.prepare(`PRAGMA table_info(${src.table})`).all();
            const hasLotId = cols.some(c => c.name === 'lot_id');

            let query = `
                SELECT 
                    t.id, 
                    ${hasLotId ? 't.lot_id' : 'NULL as lot_id'}, 
                    t.${src.dateCol} as date, t.${src.labelCol} as label, 
                    t.montant_total as amount, t.mode_reglement, u.username as utilisateur, 
                    '${src.table}' as table_source
                FROM ${src.table} t
                LEFT JOIN users u ON t.user_id = u.id
                WHERE t.company_id = ? AND t.is_comptabilise = 0 AND t.is_active = 1
            `;

            let params = [companyId];
            if (startDate && endDate) {
                query += ` AND date(t.${src.dateCol}) >= date(?) AND date(t.${src.dateCol}) <= date(?)`;
                params.push(startDate, endDate);
            }

            const rows = db.prepare(query).all(...params);

            rows.forEach(row => {
                // 🎯 1. HARMONISATION : Mode de règlement
                const pm = db.prepare(`
                    SELECT libelle FROM payment_methods 
                    WHERE (code = ? OR libelle = ?) AND company_id = ?
                `).get(row.mode_reglement, row.mode_reglement, companyId);
                const modeFinal = pm ? pm.libelle : (row.mode_reglement || '').toUpperCase().trim();
                row.mode_reglement = modeFinal;

                // 🎯 2. DÉTECTION DES TYPES PRÉSENTS DANS LES DÉTAILS (Vente ET/OU Retour)
                const typesPresents = db.prepare(`
                    SELECT DISTINCT type_ligne FROM ${src.detailTable} 
                    WHERE ${src.table === 'sales' ? 'id_vente' : 'id_achat'} = ?
                `).all(row.id);

                // Si pas de lignes (ex: Inventaire), on met un type par défaut
                const typesToProcess = typesPresents.length > 0 
                    ? typesPresents.map(tp => tp.type_ligne) 
                    : [src.table === 'sales' ? 'VENTE' : 'ACHAT'];

                // On crée une ligne d'affichage pour chaque type trouvé (Vente et Retour apparaîtront séparément)
                typesToProcess.forEach(currentType => {
                    // Calcul du montant spécifique à ce type pour l'affichage
                    const sumCol = src.table === 'sales' ? 'montant_ttc_ligne' : 'montant_facture_ligne';
                    const detailAmount = db.prepare(`
                        SELECT SUM(ABS(${sumCol})) as total FROM ${src.detailTable} 
                        WHERE ${src.table === 'sales' ? 'id_vente' : 'id_achat'} = ? AND type_ligne = ?
                    `).get(row.id, currentType);

                    const finalRow = { 
                        ...row, 
                        type: currentType, 
                        amount: detailAmount?.total || row.amount 
                    };

                    // 🎯 3. MATCHING CONFIG
                    const hasConfig = db.prepare(`
                        SELECT id FROM config_ecritures_auto 
                        WHERE table_source = ? AND company_id = ? 
                        AND (UPPER(condition_reglement) = ? OR condition_reglement = 'TOUS' OR condition_reglement = '' OR condition_reglement IS NULL)
                        AND (UPPER(type_operation) = UPPER(?) OR type_operation = 'TOUS' OR type_operation IS NULL)
                        LIMIT 1
                    `).get(src.detailTable, companyId, modeFinal, currentType);

                    if (hasConfig) ready.push(finalRow);
                    else orphans.push(finalRow);
                });
            });
        } catch (e) {
            console.error(`Erreur sur ${src.table}:`, e.message);
        }
    });

    return {
        ready: ready.sort((a, b) => new Date(b.date) - new Date(a.date)),
        orphans: orphans.sort((a, b) => new Date(b.date) - new Date(a.date))
    };
};

/**
 * SIMULATION DES ÉCRITURES (Tableau 2)
 * Centralise par Date, Journal et Compte
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

        // 🎯 1. On récupère UNIQUEMENT les détails correspondant au type sélectionné dans l'UI
        const allDetails = db.prepare(`
            SELECT * FROM ${mapping.table} 
            WHERE ${mapping.fk} = ? AND company_id = ? AND type_ligne = ?
        `).all(item.id, companyId, item.type);
        
        if (allDetails.length === 0) continue;

        // 🎯 2. Harmonisation du mode de règlement
        const pm = db.prepare(`
            SELECT libelle FROM payment_methods 
            WHERE (code = ? OR libelle = ?) AND company_id = ?
        `).get(header.mode_reglement, header.mode_reglement, companyId);
        const modeHarmonise = pm ? pm.libelle : (header.mode_reglement || '').toUpperCase().trim();

        // 🎯 3. Recherche de la CONFIG (Prise en compte du type_operation)
        const config = db.prepare(`
            SELECT * FROM config_ecritures_auto 
            WHERE table_source = ? AND company_id = ? 
            AND (UPPER(condition_reglement) = ? OR condition_reglement = 'TOUS' OR condition_reglement IS NULL)
            AND (UPPER(type_operation) = UPPER(?) OR type_operation = 'TOUS' OR type_operation IS NULL)
            ORDER BY condition_reglement DESC LIMIT 1
        `).get(mapping.table, companyId, modeHarmonise, item.type);

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
                let intituleCompte = "";

                // 🎯 4. Gestion dynamique TIERS vs COMPTE GÉNÉRAL
                if (s.is_tiers === 1) {
                    const refTiers = header.supplier_id || header.customer_id;
                    const t = db.prepare(`
                        SELECT t.numero_tiers, t.nom, t.compte_collectif_id 
                        FROM plan_tiers t 
                        WHERE t.reference_id = ? AND t.company_id = ?
                    `).get(refTiers, companyId);

                    if (t) { 
                        numTiers = t.numero_tiers; 
                        finalCompteId = t.compte_collectif_id;
                        intituleCompte = t.nom;
                    }
                }

                const infoCpt = db.prepare("SELECT numero_compte, intitule FROM plan_comptable WHERE id = ?").get(finalCompteId);
                const numeroCompte = infoCpt?.numero_compte || 'INCONNU';
                if(!intituleCompte) intituleCompte = infoCpt?.intitule || 'COMPTE INCONNU';

                // 🎯 5. Clé d'agrégation (Date + Journal + Compte + Tiers + Sens)
                const key = `${dateOp}-${s.code_journal}-${numeroCompte}-${numTiers || 'SANS'}-${s.sens}`;

                if (!accumulation[key]) {
                    accumulation[key] = {
                        date: dateOp,
                        code_journal: s.code_journal || 'OD',
                        numero_compte: numeroCompte,
                        num_tiers: numTiers,
                        intitule: intituleCompte,
                        libelle: `${item.type} - ${config.libelle_evenement}`,
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
    })).sort((a, b) => a.date.localeCompare(b.date) || a.numero_compte.localeCompare(b.numero_compte));
};

exports.executerClotureSelectionnee = async (req, res) => {
    try {
        const { items } = req.body; 
        const { companyId } = req.user;

        if (!items || items.length === 0) {
            return res.status(400).json({ message: "Aucun élément sélectionné." });
        }

        let succesCount = 0;
        let erreurCount = 0;
        let logs = [];

        for (const item of items) {
            try {
                const configEcritureService = require('./ConfigEcrituresAuto.service');
                const result = configEcritureService.genererEcritureExplicite(
                    item.table_source, 
                    item.id, 
                    companyId
                );

                if (result) {
                    succesCount++;
                } else {
                    erreurCount++;
                }
            } catch (err) {
                console.error(`Échec injection pour ${item.id}:`, err.message);
                erreurCount++;
                logs.push({ id: item.id, error: err.message });
            }
        }

        res.json({
            message: "Traitement terminé",
            details: {
                total: items.length,
                succes: succesCount,
                erreurs: erreurCount,
                logs: logs
            }
        });

    } catch (error) {
        console.error("Erreur Controller Clôture:", error);
        res.status(500).json({ message: "Erreur interne lors de l'exécution de la clôture." });
    }
};

/**
 * VALIDE ET ENREGISTRE LA CENTRALISATION EN BASE (Avec synchronisation Cloud)
 */
exports.enregistrerCentralisation = (lignesGroupees, itemsSource, companyId) => {
    const db = getDb();
    
    const generateUID = (prefix) => `${prefix}-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`;

    const exercice = db.prepare("SELECT id FROM exercices WHERE company_id = ? AND statut = 'OUVERT' LIMIT 1").get(companyId);
    if (!exercice) throw new Error("Aucun exercice ouvert trouvé.");

    return db.transaction(() => {
        try {
            const config = db.prepare(`SELECT libelle_evenement FROM config_ecritures_auto WHERE table_source = 'sale_items' AND company_id = ? LIMIT 1`).get(companyId);
            const libelleGlobal = config?.libelle_evenement || "CENTRALISATION VENTES";

            const groupes = [...new Set(lignesGroupees.map(l => `${l.date}|${l.code_journal}`))];

            groupes.forEach(key => {
                const [date, codeJ] = key.split('|');
                const journal = db.prepare("SELECT id, compteur_piece FROM journaux WHERE code = ? AND company_id = ?").get(codeJ, companyId);
                
                if (!journal) throw new Error(`Journal ${codeJ} introuvable.`);

                const pieceNum = (journal.compteur_piece || 0) + 1;
                const ecrId = generateUID('ECR-CENT');

                // Insertion de l'en-tête (avec sync_status = 'pending')
                db.prepare(`
                    INSERT INTO ecritures (id, company_id, journal_id, exercice_id, date_ecriture, piece, reference, libelle, user_saisie, sync_status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SYSTEM', 'pending')
                `).run(ecrId, companyId, journal.id, exercice.id, date, pieceNum.toString(), "CENTRALISATION", libelleGlobal);

                db.prepare(`
                    INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
                    VALUES ('ecritures', ?, 'INSERT', ?)
                `).run(ecrId, companyId);

                const lignes = lignesGroupees.filter(l => l.date === date && l.code_journal === codeJ);
                
                for (const l of lignes) {
                    const compte = db.prepare("SELECT id FROM plan_comptable WHERE numero_compte = ? AND company_id = ?").get(l.numero_compte, companyId);
                    const compteId = compte ? compte.id : null;
                    const ligId = generateUID('LIG');

                    db.prepare(`
                        INSERT INTO lignes_ecritures (id, company_id, ecriture_id, journal_id, exercice_id, date_ecriture, piece, compte_id, num_compte, num_tiers, libelle, debit, credit, sync_status)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
                    `).run(
                        ligId,
                        companyId, ecrId, journal.id, exercice.id, date, pieceNum.toString(),
                        compteId, l.numero_compte, l.num_tiers, l.libelle, l.debit || 0, l.credit || 0
                    );

                    db.prepare(`
                        INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
                        VALUES ('lignes_ecritures', ?, 'INSERT', ?)
                    `).run(ligId, companyId);
                }

                // Maj compteur journal (avec sync_status = 'pending')
                db.prepare("UPDATE journaux SET compteur_piece = ?, sync_status = 'pending' WHERE id = ?").run(pieceNum, journal.id);
                db.prepare(`
                    INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
                    VALUES ('journaux', ?, 'UPDATE', ?)
                `).run(journal.id, companyId);
            });

            // 3. Marquage des pièces sources comme comptabilisées + synchro
            for (const item of itemsSource) {
                db.prepare(`UPDATE ${item.table_source} SET is_comptabilise = 1, sync_status = 'pending' WHERE id = ?`).run(item.id);
                db.prepare(`
                    INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
                    VALUES (?, ?, 'UPDATE', ?)
                `).run(item.table_source, item.id, companyId);
            }

            return { success: true };
        } catch (error) {
            console.error("Détail SQL:", error.message);
            throw error; 
        }
    })();
};