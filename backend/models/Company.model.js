const { getDb } = require('../config/database');

const CompanyModel = {
    /**
     * Schéma mis à jour avec les verrous de licence et matériel
     */
    schema: `
        CREATE TABLE IF NOT EXISTS companies (
            id TEXT PRIMARY KEY, 
            company_code TEXT NOT NULL UNIQUE, 
            name TEXT NOT NULL, 
            email TEXT UNIQUE COLLATE NOCASE, 
            phone TEXT, 
            address TEXT, 
            logo_data TEXT, 
            nif_number TEXT, 
            rccm_number TEXT, 
            default_customer_id TEXT, 
            default_supplier_id TEXT, 
            default_staff_id TEXT, 
            hardware_mid TEXT, -- 🛡️ AJOUTÉ : Stocke l'empreinte matérielle physique du PC
            gestion_analytique INTEGER DEFAULT 0, 
            regime_tva_recuperable INTEGER DEFAULT 1, 
            plan_precision INTEGER DEFAULT 8, 
            last_access_date DATETIME, 
            
            -- CHAMPS DE LICENCE --
            license_type TEXT DEFAULT 'FREE', 
            active_modules TEXT DEFAULT '[]', 
            license_key TEXT, 
            expiry_date DATETIME,
            license_start_date DATETIME, 

            sync_status TEXT CHECK(sync_status IN ('pending','synced','error')) DEFAULT 'pending', 
            is_active INTEGER DEFAULT 1, 
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP, 
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `,

    /**
     * 🛡️ FORCE LA MIGRATION SUR LES ANCIENNES BASES CLIENTS EXIS-TANTES
     */
    applyMigrations: () => {
        const db = getDb();
        try {
            db.exec(`ALTER TABLE companies ADD COLUMN hardware_mid TEXT;`);
            console.log("✅ Migration : Colonne hardware_mid injectée avec succès.");
        } catch (e) {
            // Si la colonne est déjà présente, SQLite renvoie une erreur. On passe outre proprement.
        }
    },

    /**
     * Met à jour la date de dernier accès
     */
    updateLastAccess: (id) => {
        const db = getDb();
        const now = new Date().toISOString();
        const stmt = db.prepare(`UPDATE companies SET last_access_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`);
        return stmt.run(now, id);
    },

    /**
     * Action de renouvellement : Met à jour le verrou de sécurité et les modules
     */
    renouvelerLicence: (companyId, licenseData) => {
        const db = getDb();
        const now = new Date().toISOString();
        try {
            return db.transaction(() => {
                const stmt = db.prepare(`
                    UPDATE companies 
                    SET 
                        license_start_date = ?, 
                        license_type = ?,
                        active_modules = ?,
                        license_key = ?,
                        expiry_date = ?,
                        is_active = 1, 
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `);
                
                const result = stmt.run(
                    now, 
                    licenseData.type || 'FREE',
                    JSON.stringify(licenseData.modules || []),
                    licenseData.key || null,
                    licenseData.expiry || null,
                    companyId
                );

                db.prepare(`
                    INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
                    VALUES ('companies', ?, 'UPDATE', ?)
                `).run(companyId, companyId);

                return result;
            })();
        } catch (error) {
            console.error("❌ Erreur Model Company (renouvelerLicence):", error.message);
            throw error;
        }
    },

    create: ({ id, name, code, email, license_type = 'FREE', active_modules = [], machine_mid = null }) => {
        const db = getDb();
        try {
            // 🛡️ On s'assure que la colonne existe avant d'écrire dedans
            CompanyModel.applyMigrations();

            return db.transaction(() => {
                const now = new Date().toISOString();
                const stmt = db.prepare(`
                    INSERT INTO companies (
                        id, company_code, name, email, regime_tva_recuperable, 
                        sync_status, last_access_date, license_start_date,
                        license_type, active_modules, hardware_mid
                    )
                    VALUES (?, ?, ?, ?, 1, 'pending', ?, ?, ?, ?, ?)
                `);
                
                stmt.run(
                    id, code, name, email, now, now, 
                    license_type, JSON.stringify(active_modules), machine_mid
                );

                db.prepare(`
                    INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
                    VALUES ('companies', ?, 'INSERT', ?)
                `).run(id, id);

                return { id, name, code, email };
            })();
        } catch (error) {
            console.error("❌ Erreur Model Company (create):", error.message);
            throw error;
        }
    },

    update: (id, d) => {
        const db = getDb();
        try {
            return db.transaction(() => {
                const stmt = db.prepare(`
                    UPDATE companies SET 
                        name = IFNULL(?, name), 
                        email = IFNULL(?, email), 
                        phone = IFNULL(?, phone), 
                        address = IFNULL(?, address),
                        nif_number = IFNULL(?, nif_number),
                        rccm_number = IFNULL(?, rccm_number),
                        logo_data = IFNULL(?, logo_data),
                        gestion_analytique = IFNULL(?, gestion_analytique),
                        plan_precision = IFNULL(?, plan_precision),
                        regime_tva_recuperable = IFNULL(?, regime_tva_recuperable),
                        license_type = IFNULL(?, license_type),
                        active_modules = IFNULL(?, active_modules),
                        hardware_mid = IFNULL(?, hardware_mid),

                        sync_status = 'pending', 
                        updated_at = CURRENT_TIMESTAMP 
                    WHERE id = ?
                `);

                const result = stmt.run(
                    d.name || null, 
                    d.email || null, 
                    d.phone || null, 
                    d.address || null,
                    d.nif_number || null,
                    d.rccm_number || null,
                    d.logo_data || null,
                    (d.gestion_analytique !== undefined) ? (d.gestion_analytique ? 1 : 0) : null,
                    d.plan_precision || null,
                    (d.regime_tva_recuperable !== undefined) ? (d.regime_tva_recuperable ? 1 : 0) : null,
                    d.license_type || null,
                    d.active_modules ? JSON.stringify(d.active_modules) : null,
                    d.hardware_mid || null,
                    id
                );

                if (result.changes > 0) {
                    db.prepare(`
                        INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
                        VALUES ('companies', ?, 'UPDATE', ?)
                    `).run(id, id);
                }

                return result;
            })();
        } catch (error) {
            console.error("❌ Erreur Model Company (update):", error.message);
            throw error;
        }
    },

    getById: (id) => {
        const db = getDb();
        const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(id);
        if (company && company.active_modules) {
            try {
                company.active_modules = JSON.parse(company.active_modules);
            } catch (e) {
                company.active_modules = [];
            }
        }
        return company;
    }
};

module.exports = CompanyModel;
