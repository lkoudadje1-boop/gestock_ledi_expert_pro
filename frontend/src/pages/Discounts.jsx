   // --- AJOUTEZ CE BLOC ICI ---
    const db = getDb(); // On récupère la connexion SQLite
    try {
        // On récupère la structure actuelle de la table
        const tableInfo = db.prepare("PRAGMA table_info(purchase_items)").all();
        const columns = tableInfo.map(c => c.name);

        // Si la colonne lot_id manque, on l'ajoute
        if (!columns.includes('lot_id')) {
            db.exec("ALTER TABLE purchase_items ADD COLUMN lot_id TEXT;");
            console.log("🛠️ Migration : Colonne 'lot_id' ajoutée à purchase_items.");
        }

                // Dans votre bloc try/catch de migration dans server.js :
        if (!columns.includes('is_active')) {
            db.exec("ALTER TABLE purchase_items RENAME COLUMN statut TO is_active;");
            console.log("✅ Migration : Colonne 'is_active' ajoutée à purchase_items.");
        }
    } catch (err) {
        console.error("⚠️ Erreur lors de la vérification de la table :", err.message);
    }