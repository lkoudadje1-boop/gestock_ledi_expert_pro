const Database = require('better-sqlite3');
const path = require('path');

// 1. On cherche le fichier dans le dossier backend/data (adapte si nécessaire)
const dbPath = path.resolve(__dirname, 'backend/data/database.sqlite'); 

console.log("🔍 Tentative de connexion à :", dbPath);

const db = new Database(dbPath);

try {
    // 2. On vérifie si la table existe avant
    const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='branches'").get();
    
    if (!tableExists) {
        console.error("❌ Erreur : La table 'branches' n'existe toujours pas dans ce fichier.");
        console.log("👉 Vérifie le nom de ton fichier .sqlite dans le dossier backend.");
    } else {
        db.prepare("ALTER TABLE branches ADD COLUMN is_active INTEGER DEFAULT 1").run();
        console.log("✅ Colonne 'is_active' ajoutée avec succès !");
    }
} catch (err) {
    if (err.message.includes("duplicate column name")) {
        console.log("ℹ️ La colonne existe déjà.");
    } else {
        console.error("❌ Erreur SQL :", err.message);
    }
} finally {
    db.close();
}