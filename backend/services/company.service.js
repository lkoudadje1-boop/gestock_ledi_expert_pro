const { generateUniqueCode, hashPassword } = require('../utils/helpers'); 
const { getDb } = require('../config/database');
const { logAction } = require('../utils/auditHelper'); 

const generateId = (prefix) => `${prefix}-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`;

// --- RÉCUPÉRATION PARAMÈTRES ---
exports.fetchSettings = (companyId) => {
    const db = getDb();
    return db.prepare(`
        SELECT name, email, phone, address, logo_data, nif_number, rccm_number,
               default_customer_id, default_supplier_id, default_staff_id,
               gestion_analytique, plan_precision, regime_tva_recuperable
        FROM companies WHERE id = ?
    `).get(companyId);
};

// --- INITIALISATION COMPLÈTE SOCIÉTÉ ---
exports.initCompany = (data) => {
    const db = getDb();
    const { companyName, name, username, adminUsername, email, password, adminPassword, plan_precision } = data;
    
    const finalCompName = companyName || name || "MA SOCIETE";
    const finalAdminName = username || adminUsername || "Admin";
    const finalAdminPass = password || adminPassword || "123456";

    const companyId = generateId('CPY');
    const companyCode = generateUniqueCode(8); 
    const userId = generateId('USR');
    const exerciceId = generateId('EXE');
    const customerId = generateId('CLI');
    const supplierId = generateId('SUP');
    const staffId = generateId('STF');
    const currentYear = new Date().getFullYear();

    db.transaction(() => {
        db.exec('PRAGMA foreign_keys = OFF;');

        // 1. Insertion Société (Initialisée en régime récupérable par défaut)
        db.prepare(`
            INSERT INTO companies (id, company_code, name, email, plan_precision, regime_tva_recuperable, sync_status) 
            VALUES (?, ?, ?, ?, ?, 1, 'pending')
        `).run(companyId, companyCode, finalCompName, email, parseInt(plan_precision) || 8);

        // 2. Insertion Exercice
        db.prepare(`
            INSERT INTO exercices (id, company_id, libelle, date_debut, date_fin, statut, sync_status) 
            VALUES (?, ?, ?, ?, ?, 'OUVERT', 'pending')
        `).run(exerciceId, companyId, `EXERCICE ${currentYear}`, `${currentYear}-01-01`, `${currentYear}-12-31`);

        // 3. Insertion Admin
        const hashed = hashPassword(finalAdminPass);
        db.prepare(`INSERT INTO users (id, username, email, password, role, company_id, sync_status) VALUES (?, ?, ?, ?, 'admin', ?, 'pending')`)
          .run(userId, finalAdminName, email, hashed, companyId);

        // 4. Insertion Client
        db.prepare(`
            INSERT INTO customers (id, nom, nif, contact, telephone, adresse, is_active, company_id, sync_status) 
            VALUES (?, ?, '0', 'DIRECTION', ?, 'MAGASIN', 1, ?, 'pending')
        `).run(customerId, `CLIENT COMPTANT (${companyCode})`, `0000-${companyCode}`, companyId);

        // 5. Insertion Fournisseur
        db.prepare(`
            INSERT INTO suppliers (id, nom, nif, contact, telephone, adresse, is_active, company_id, sync_status) 
            VALUES (?, ?, '0', 'DIRECTION', '0000', 'MAGASIN', 1, ?, 'pending')
        `).run(supplierId, `FOURNISSEUR DIVERS (${companyCode})`, companyId);

        // 6. Insertion Personnel
        db.prepare(`
            INSERT INTO staff (
                id, name, phone, email, adresse, nif, cnss, 
                fonction, company_id, is_active, sync_status
            ) VALUES (?, ?, '0000', 'divers@erp.com', 'MAGASIN', '0', '0', 'PERSONNEL', ?, 1, 'pending')
        `).run(staffId, `PERSONNEL DIVERS (${companyCode})`, companyId);

        // Synchronisation
        const syncStmt = db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES (?, ?, 'INSERT', ?)");
        const entities = [
            ['companies', companyId], ['exercices', exerciceId], ['users', userId],
            ['customers', customerId], ['suppliers', supplierId], ['staff', staffId]
        ];
        entities.forEach(([table, id]) => syncStmt.run(table, id, companyId));

        db.exec('PRAGMA foreign_keys = ON;');
    })();

    // --- RETOUR DES IDENTIFIANTS GÉNÉRÉS ---
    return {
        companyId: companyId,    // L'ID technique (ex: CPY-57472885)
        companyCode: companyCode, // Le code court (8 caractères)
        adminId: userId,          // L'ID de l'utilisateur créé
        exerciceId: exerciceId    // L'ID de l'exercice par défaut
    };
};

// --- MISE À JOUR SOCIÉTÉ ---
exports.modifyCompany = (id, body, user) => {
    const db = getDb();
    const current = db.prepare("SELECT * FROM companies WHERE id = ?").get(id);
    if (!current) throw new Error("Société non trouvée");

    const { 
        name, email, address, phone, logo_data, nif_number, rccm_number, 
        gestion_analytique, plan_precision, regime_tva_recuperable 
    } = body;

    const params = [
        name || current.name,
        email !== undefined ? email : current.email,
        address !== undefined ? address : current.address,
        phone !== undefined ? phone : current.phone,
        logo_data !== undefined ? logo_data : current.logo_data,
        nif_number !== undefined ? nif_number : current.nif_number,
        rccm_number !== undefined ? rccm_number : current.rccm_number,
        gestion_analytique !== undefined ? (gestion_analytique ? 1 : 0) : current.gestion_analytique,
        plan_precision !== undefined ? parseInt(plan_precision) : current.plan_precision,
        regime_tva_recuperable !== undefined ? (regime_tva_recuperable ? 1 : 0) : current.regime_tva_recuperable,
        id
    ];

    db.transaction(() => {
        db.prepare(`
            UPDATE companies 
            SET name = ?, email = ?, address = ?, phone = ?, logo_data = ?, 
                nif_number = ?, rccm_number = ?, gestion_analytique = ?, 
                plan_precision = ?, regime_tva_recuperable = ?, 
                sync_status = 'pending', updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(...params);

        // 🔄 Inscription dans la file de synchronisation Cloud
        db.prepare(`
            INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
            VALUES ('companies', ?, 'UPDATE', ?)
        `).run(id, id);

        logAction({
            userId: user.userId, userName: user.userName, actionType: 'MODIFICATION',
            tableConcernee: 'companies', referenceId: id,
            description: `Mise à jour paramètres (TVA: ${regime_tva_recuperable ? 'Récupérable' : 'Non-récupérable'})`,
            companyId: id
        });
    })();
};

// --- MISE À JOUR PRÉCISION ET STRUCTURE COMPTABLE ---
exports.modifyPrecision = (id, body, user) => {
    const db = getDb();
    const { plan_precision, gestion_analytique, regime_tva_recuperable } = body;

    db.transaction(() => {
        let logDesc = "";
        let planComptableModifie = false;

        if (gestion_analytique !== undefined) {
            db.prepare(`UPDATE companies SET gestion_analytique = ?, sync_status = 'pending' WHERE id = ?`)
              .run(gestion_analytique ? 1 : 0, id);
            logDesc += `Analytique: ${gestion_analytique ? 'Activé' : 'Désactivé'}. `;
        }

        // Ajout de la gestion TVA dans la structure comptable si besoin
        if (regime_tva_recuperable !== undefined) {
            db.prepare(`UPDATE companies SET regime_tva_recuperable = ?, sync_status = 'pending' WHERE id = ?`)
              .run(regime_tva_recuperable ? 1 : 0, id);
            logDesc += `Régime TVA: ${regime_tva_recuperable ? 'Récupérable' : 'Non-récupérable'}. `;
        }

        if (plan_precision !== undefined) {
            const newPrecision = parseInt(plan_precision);
            const currentConfig = db.prepare("SELECT plan_precision FROM companies WHERE id = ?").get(id);
            const oldPrecision = currentConfig?.plan_precision || 8;

            db.prepare(`UPDATE companies SET plan_precision = ?, sync_status = 'pending' WHERE id = ?`)
              .run(newPrecision, id);

            if (newPrecision > oldPrecision) {
                const zeros = '0'.repeat(newPrecision - oldPrecision);
                db.prepare(`UPDATE plan_comptable SET numero_compte = numero_compte || ?, sync_status = 'pending' WHERE company_id = ?`)
                  .run(zeros, id);
                planComptableModifie = true;
            } 
            else if (newPrecision < oldPrecision) {
                db.prepare(`UPDATE plan_comptable SET numero_compte = substr(numero_compte, 1, ?), sync_status = 'pending' WHERE company_id = ?`)
                  .run(newPrecision, id);
                planComptableModifie = true;
            }
            logDesc += `Précision: ${oldPrecision} -> ${newPrecision} chiffres. `;
        }

        // 🔄 Inscription de la société mise à jour dans la file de synchronisation Cloud
        db.prepare(`
            INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
            VALUES ('companies', ?, 'UPDATE', ?)
        `).run(id, id);

        // 🔄 Si le plan comptable a subi une modification de format, on enregistre chaque compte impacté dans la sync_queue
        if (planComptableModifie) {
            const affectedAccounts = db.prepare("SELECT id FROM plan_comptable WHERE company_id = ?").all(id);
            const syncQueueStmt = db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('plan_comptable', ?, 'UPDATE', ?)");
            affectedAccounts.forEach(acc => {
                syncQueueStmt.run(acc.id, id);
            });
        }

        logAction({
            userId: user.userId, userName: user.userName, actionType: 'MODIFICATION',
            tableConcernee: 'companies', referenceId: id,
            description: `Mise à jour structure comptable : ${logDesc.trim()}`,
            companyId: id
        });
    })();
};