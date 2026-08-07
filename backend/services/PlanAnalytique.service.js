const { getDb } = require('../config/database');
const { logAction } = require('../utils/auditHelper');

/**
 * RÈGLE 1 : SUBDIVISIONS (PLAN ANALYTIQUE)
 */
const formatCodeSubdivision = (input) => {
    if (!input) return "00000000";
    let chiffres = input.toString().replace(/\D/g, ''); 
    return chiffres.slice(0, 8).padEnd(8, '0');
};

/**
 * RÈGLE 2 : GRANDS CENTRES (DÉPARTEMENTS)
 */
const formatCodeGrandCentre = (input) => {
    if (!input) return "";
    return input.toString().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
};

// --- GRANDS CENTRES (DEPARTEMENTS) ---

exports.getDepartements = (companyId) => {
    const db = getDb();
    return db.prepare(`
        SELECT * FROM departements 
        WHERE company_id = ? AND is_deleted = 0 
        ORDER BY nom ASC
    `).all(companyId);
};

exports.createDepartement = (data, user) => {
    const db = getDb();
    const { nom, code_analytique } = data;
    const codeFormate = formatCodeGrandCentre(code_analytique); 
    const id = `DEPT-${Date.now().toString().slice(-6)}`;

    db.transaction(() => {
        const existNom = db.prepare("SELECT id FROM departements WHERE company_id = ? AND nom = ? AND is_deleted = 0").get(user.companyId, nom.toUpperCase());
        if (existNom) throw new Error(`Le département "${nom}" existe déjà.`);

        const existCode = db.prepare("SELECT id FROM departements WHERE company_id = ? AND code_analytique = ? AND is_deleted = 0").get(user.companyId, codeFormate);
        if (existCode) throw new Error(`Le code analytique "${codeFormate}" est déjà utilisé.`);

        db.prepare(`
            INSERT INTO departements (id, company_id, code_analytique, nom, is_deleted, sync_status, updated_at) 
            VALUES (?, ?, ?, ?, 0, 'pending', CURRENT_TIMESTAMP)
        `).run(id, user.companyId, codeFormate, nom.toUpperCase());

        // 🔄 Synchronisation Cloud (INSERT)
        db.prepare(`
            INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
            VALUES ('departements', ?, 'INSERT', ?)
        `).run(id, user.companyId);

        logAction({
            userId: user.userId, userName: user.userName,
            actionType: 'CREATION', tableConcernee: 'departements',
            referenceId: id, companyId: user.companyId,
            description: `Création du Grand Centre : ${nom.toUpperCase()} (${codeFormate})`
        });
    })();
    return id;
};

exports.modifierDepartement = (id, data, user) => {
    const db = getDb();
    const { nom, code_analytique } = data;
    const codeFormate = formatCodeGrandCentre(code_analytique);
    
    db.transaction(() => {
        db.prepare(`
            UPDATE departements SET nom = ?, code_analytique = ?, updated_at = CURRENT_TIMESTAMP, sync_status = 'pending'
            WHERE id = ? AND company_id = ?
        `).run(nom.toUpperCase(), codeFormate, id, user.companyId);

        // 🔄 Synchronisation Cloud (UPDATE)
        db.prepare(`
            INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
            VALUES ('departements', ?, 'UPDATE', ?)
        `).run(id, user.companyId);

        logAction({
            userId: user.userId, userName: user.userName,
            actionType: 'MODIFICATION', tableConcernee: 'departements',
            referenceId: id, companyId: user.companyId,
            description: `Modification du Grand Centre : ${nom.toUpperCase()}`
        });
    })();
};

exports.supprimerDepartement = (id, user) => {
    const db = getDb();
    const isUsed = db.prepare("SELECT id FROM plan_analytique WHERE parent_dept_id = ? AND is_deleted = 0 LIMIT 1").get(id);
    if (isUsed) throw new Error("🔒 Ce Grand Centre contient des subdivisions actives.");
    
    db.transaction(() => {
        db.prepare("UPDATE departements SET is_deleted = 1, sync_status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);

        // 🔄 Synchronisation Cloud (UPDATE / Archivage)
        db.prepare(`
            INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
            VALUES ('departements', ?, 'UPDATE', ?)
        `).run(id, user.companyId);

        logAction({
            userId: user.userId, userName: user.userName,
            actionType: 'SUPPRESSION', tableConcernee: 'departements',
            referenceId: id, companyId: user.companyId,
            description: `Archivage département ID: ${id}`
        });
    })();
};

// --- SUBDIVISIONS (PLAN ANALYTIQUE) ---

exports.getPlanAnalytique = (companyId) => {
    const db = getDb();
    return db.prepare(`
        SELECT pa.*, d.nom as parent_dept_nom 
        FROM plan_analytique pa
        JOIN departements d ON pa.parent_dept_id = d.id
        WHERE pa.company_id = ? AND pa.is_deleted = 0 
        ORDER BY pa.code ASC
    `).all(companyId);
};

exports.createPlanAnalytique = (data, user) => {
    const db = getDb();
    const { code, libelle, parent_dept_id } = data;
    const codeFormate = formatCodeSubdivision(code); 
    const id = `PLAN-${Date.now().toString().slice(-6)}`;

    db.transaction(() => {
        const existLib = db.prepare("SELECT id FROM plan_analytique WHERE company_id = ? AND libelle = ? AND is_deleted = 0").get(user.companyId, libelle.toUpperCase());
        if (existLib) throw new Error(`La subdivision "${libelle}" existe déjà.`);

        const existe = db.prepare("SELECT id FROM plan_analytique WHERE company_id = ? AND code = ? AND is_deleted = 0").get(user.companyId, codeFormate);
        if (existe) throw new Error(`Le code "${codeFormate}" existe déjà.`);

        db.prepare(`
            INSERT INTO plan_analytique (id, company_id, parent_dept_id, code, libelle, is_deleted, sync_status, updated_at) 
            VALUES (?, ?, ?, ?, ?, 0, 'pending', CURRENT_TIMESTAMP)
        `).run(id, user.companyId, parent_dept_id, codeFormate, libelle.toUpperCase());

        // 🔄 Synchronisation Cloud (INSERT)
        db.prepare(`
            INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
            VALUES ('plan_analytique', ?, 'INSERT', ?)
        `).run(id, user.companyId);

        logAction({
            userId: user.userId, userName: user.userName,
            actionType: 'CREATION', tableConcernee: 'plan_analytique',
            referenceId: id, companyId: user.companyId,
            description: `Création subdivision : ${libelle.toUpperCase()} (${codeFormate})`
        });
    })();
    return id;
};

exports.modifierPlanAnalytique = (id, data, user) => {
    const db = getDb();
    const { libelle, parent_dept_id, code } = data;
    const codeFormate = formatCodeSubdivision(code);
    const isUsed = db.prepare("SELECT id FROM analytique_details WHERE plan_analytique_id = ? AND is_deleted = 0 LIMIT 1").get(id);
    
    db.transaction(() => {
        if (isUsed) {
            db.prepare(`
                UPDATE plan_analytique SET libelle = ?, updated_at = CURRENT_TIMESTAMP, sync_status = 'pending'
                WHERE id = ? AND company_id = ?
            `).run(libelle.toUpperCase(), id, user.companyId);
        } else {
            db.prepare(`
                UPDATE plan_analytique SET libelle = ?, parent_dept_id = ?, code = ?, updated_at = CURRENT_TIMESTAMP, sync_status = 'pending'
                WHERE id = ? AND company_id = ?
            `).run(libelle.toUpperCase(), parent_dept_id, codeFormate, id, user.companyId);
        }

        // 🔄 Synchronisation Cloud (UPDATE)
        db.prepare(`
            INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
            VALUES ('plan_analytique', ?, 'UPDATE', ?)
        `).run(id, user.companyId);

        logAction({
            userId: user.userId, userName: user.userName,
            actionType: 'MODIFICATION', tableConcernee: 'plan_analytique',
            referenceId: id, companyId: user.companyId,
            description: `Modification subdivision : ${libelle.toUpperCase()}`
        });
    })();
    return isUsed;
};

exports.supprimerPlanAnalytique = (id, user) => {
    const db = getDb();
    const isUsed = db.prepare("SELECT id FROM analytique_details WHERE plan_analytique_id = ? AND is_deleted = 0 LIMIT 1").get(id);
    if (isUsed) throw new Error("🔒 Subdivision liée à des calculs de coûts.");
    
    db.transaction(() => {
        db.prepare(`UPDATE plan_analytique SET is_deleted = 1, sync_status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);

        // 🔄 Synchronisation Cloud (UPDATE / Archivage)
        db.prepare(`
            INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
            VALUES ('plan_analytique', ?, 'UPDATE', ?)
        `).run(id, user.companyId);

        logAction({
            userId: user.userId, userName: user.userName,
            actionType: 'SUPPRESSION', tableConcernee: 'plan_analytique',
            referenceId: id, companyId: user.companyId,
            description: `Archivage subdivision ID: ${id}`
        });
    })();
};

// --- DÉTAILS COÛTS ---

exports.getDetailsCout = (companyId) => {
    const db = getDb();
    return db.prepare(`
        SELECT ad.*, 
               COALESCE(p.nom, psf.nom) as product_nom, 
               pa.libelle as plan_libelle,
               pc.intitule as compte_intitule
        FROM analytique_details ad
        LEFT JOIN products p ON ad.product_id = p.id
        LEFT JOIN produits_semi_finis psf ON ad.semi_fini_id = psf.id
        LEFT JOIN plan_analytique pa ON ad.plan_analytique_id = pa.id
        LEFT JOIN plan_comptable pc ON ad.compte_analytique = pc.numero_compte
        WHERE ad.company_id = ? AND ad.is_deleted = 0
    `).all(companyId);
};

exports.createDetailCout = (data, user) => {
    const db = getDb();
    const { product_id, plan_analytique_id, montant_base_theorique, qte_base_production, compte_analytique } = data;
    const id = `DET-${Date.now().toString().slice(-6)}`;
    const isPSF = product_id.startsWith('PSF-');
    const finalProductId = isPSF ? null : product_id;
    const finalSemiFiniId = isPSF ? product_id : null;

    db.transaction(() => {
        db.prepare(`
            INSERT INTO analytique_details (
                id, company_id, plan_analytique_id, product_id, semi_fini_id, code, libelle, 
                compte_analytique, montant_base_theorique, qte_base_production, is_deleted, sync_status, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'pending', CURRENT_TIMESTAMP)
        `).run(id, user.companyId, plan_analytique_id, finalProductId, finalSemiFiniId, id, `COÛT AUTO - ${id}`, compte_analytique, montant_base_theorique, qte_base_production);

        // 🔄 Synchronisation Cloud (INSERT)
        db.prepare(`
            INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
            VALUES ('analytique_details', ?, 'INSERT', ?)
        `).run(id, user.companyId);

        logAction({
            userId: user.userId, userName: user.userName,
            actionType: 'CREATION', tableConcernee: 'analytique_details',
            referenceId: id, companyId: user.companyId,
            description: `Nouveau détail de coût pour produit ${product_id}`
        });
    })();
};

exports.modifierDetailCout = (id, data, user) => {
    const db = getDb();
    const { product_id, plan_analytique_id, montant_base_theorique, qte_base_production, compte_analytique } = data;
    const isPSF = product_id.startsWith('PSF-');
    const finalProductId = isPSF ? null : product_id;
    const finalSemiFiniId = isPSF ? product_id : null;

    db.transaction(() => {
        db.prepare(`
            UPDATE analytique_details SET 
                product_id = ?, semi_fini_id = ?, plan_analytique_id = ?, 
                montant_base_theorique = ?, qte_base_production = ?, 
                compte_analytique = ?, updated_at = CURRENT_TIMESTAMP, sync_status = 'pending'
            WHERE id = ? AND company_id = ?
        `).run(finalProductId, finalSemiFiniId, plan_analytique_id, montant_base_theorique, qte_base_production, compte_analytique, id, user.companyId);

        // 🔄 Synchronisation Cloud (UPDATE)
        db.prepare(`
            INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
            VALUES ('analytique_details', ?, 'UPDATE', ?)
        `).run(id, user.companyId);

        logAction({
            userId: user.userId, userName: user.userName,
            actionType: 'MODIFICATION', tableConcernee: 'analytique_details',
            referenceId: id, companyId: user.companyId,
            description: `Mise à jour détail de coût ID: ${id}`
        });
    })();
};

exports.supprimerDetailCout = (id, user) => {
    const db = getDb();
    db.transaction(() => {
        db.prepare("UPDATE analytique_details SET is_deleted = 1, sync_status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);

        // 🔄 Synchronisation Cloud (UPDATE / Archivage)
        db.prepare(`
            INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
            VALUES ('analytique_details', ?, 'UPDATE', ?)
        `).run(id, user.companyId);

        logAction({
            userId: user.userId, userName: user.userName,
            actionType: 'SUPPRESSION', tableConcernee: 'analytique_details',
            referenceId: id, companyId: user.companyId,
            description: `Suppression coût ID: ${id}`
        });
    })();
};

// --- IMPORT / EXPORT LOGIC ---

exports.getExportDepartementsData = (companyId) => {
    const db = getDb();
    return db.prepare(`SELECT code_analytique, nom FROM departements WHERE company_id = ? AND is_deleted = 0`).all(companyId);
};

exports.importDepartementsBatch = (data, companyId) => {
    const db = getDb();
    db.transaction(() => {
        const stmt = db.prepare(`INSERT INTO departements (id, company_id, code_analytique, nom, is_deleted, sync_status) VALUES (?, ?, ?, ?, 0, 'pending') ON CONFLICT(code_analytique, company_id) DO UPDATE SET nom = excluded.nom, is_deleted = 0, sync_status = 'pending'`);
        const queueStmt = db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('departements', ?, 'INSERT', ?)`);
        
        data.forEach((d, i) => {
            const existing = db.prepare("SELECT id FROM departements WHERE code_analytique = ? AND company_id = ?").get(d.code, companyId);
            const id = existing ? existing.id : `DEPT-${Date.now()}-${i}`;
            stmt.run(id, companyId, d.code, d.nom);
            
            if (!existing) {
                queueStmt.run(id, companyId);
            } else {
                db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('departements', ?, 'UPDATE', ?)`.replace(/UPDATE/, 'UPDATE')).run(id, companyId);
            }
        });
    })();
};

exports.getExportPlanData = (companyId) => {
    const db = getDb();
    return db.prepare(`SELECT pa.code, pa.libelle, d.code_analytique as code_parent FROM plan_analytique pa JOIN departements d ON pa.parent_dept_id = d.id WHERE pa.company_id = ? AND pa.is_deleted = 0`).all(companyId);
};

exports.importPlanBatch = (data, companyId) => {
    const db = getDb();
    db.transaction(() => {
        const stmt = db.prepare(`INSERT INTO plan_analytique (id, company_id, parent_dept_id, code, libelle, is_deleted, sync_status) VALUES (?, ?, ?, ?, ?, 0, 'pending') ON CONFLICT(code, company_id) DO UPDATE SET libelle = excluded.libelle, parent_dept_id = excluded.parent_dept_id, is_deleted = 0, sync_status = 'pending'`);
        
        data.forEach((d, i) => {
            const parent = db.prepare("SELECT id FROM departements WHERE code_analytique = ? AND company_id = ?").get(d.codeParent, companyId);
            if (!parent) return;
            const existing = db.prepare("SELECT id FROM plan_analytique WHERE code = ? AND company_id = ?").get(d.code, companyId);
            const id = existing ? existing.id : `PLAN-${Date.now()}-${i}`;
            stmt.run(id, companyId, parent.id, d.code, d.libelle);

            db.prepare(`
                INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
                VALUES ('plan_analytique', ?, ?, ?)
            `).run(id, existing ? 'UPDATE' : 'INSERT', companyId);
        });
    })();
};