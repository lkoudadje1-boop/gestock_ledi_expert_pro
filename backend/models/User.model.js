// backend/models/User.model.js
const { getDb } = require('../config/database');

const UserModel = {
    // Le schéma est maintenant strictement focalisé sur l'entreprise unique
    schema: `
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT DEFAULT 'admin',
            company_id INTEGER NOT NULL,
            fonction TEXT,
            permissions TEXT, -- Stocké en JSON string
            is_temp_password INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            sync_status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
        )
    `,

    /**
     * Création d'un utilisateur (Administrateur ou Collaborateur)
     */
    create: (data) => {
        const db = getDb();
        
        // --- EXTRACTION ET NETTOYAGE ---
        const username = data.username;
        const email = data.email;
        const password = data.password;
        const role = data.role || 'user';
        const companyId = data.companyId || data.company_id;
        const fonction = data.fonction || '';
        const permissions = typeof data.permissions === 'object' 
            ? JSON.stringify(data.permissions) 
            : (data.permissions || '{}');
        const isTemp = data.isTemp || data.is_temp_password || 0;

        console.log(`[DB INSERT] Utilisateur : ${username} rattaché à l'entreprise ID : ${companyId}`);

        const transaction = db.transaction((userData) => {
            // 1. Insertion de l'utilisateur
            const stmt = db.prepare(`
                INSERT INTO users (
                    username, email, password, role, company_id, 
                    fonction, permissions, is_temp_password, sync_status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
            `);
            
            const info = stmt.run(
                userData.username, 
                userData.email, 
                userData.password, 
                userData.role, 
                userData.companyId, 
                userData.fonction,
                userData.permissions,
                userData.isTemp
            );

            const newId = info.lastInsertRowid;

            // 2. Enregistrement dans la file de synchronisation Cloud
            const syncStmt = db.prepare(`
                INSERT INTO sync_queue (table_name, record_id, operation)
                VALUES ('users', ?, 'INSERT')
            `);
            syncStmt.run(newId);

            return { id: newId, username: userData.username, email: userData.email, role: userData.role };
        });

        return transaction({ username, email, password, role, companyId, fonction, permissions, isTemp });
    },

    /**
     * Recherche pour authentification avec jointure entreprise
     */
    findByEmail: (email) => {
        const db = getDb();
        return db.prepare(`
            SELECT u.*, c.company_code, c.name as company_name 
            FROM users u
            JOIN companies c ON u.company_id = c.id
            WHERE u.email = ?
        `).get(email);
    }
};

module.exports = UserModel;