const Database = require('better-sqlite3');
const path = require('path');

// --- CORRECTION ICI ---
// Si votre base est directement dans le dossier backend :
const db = new Database(path.join(__dirname, 'database.db')); 
// ----------------------

try {
  // On vérifie si la table existe avant de supprimer
  const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='temporary_carts'").get();
  
  if (tableExists) {
    const info = db.prepare("DELETE FROM temporary_carts WHERE user_id = 'STF-515949'").run();
    console.log(`✅ Lignes supprimées : ${info.changes}`);
  } else {
    console.error("❌ Erreur : La table 'temporary_carts' n'existe pas dans ce fichier.");
  }
} catch (err) {
  console.error("❌ Erreur :", err);
}