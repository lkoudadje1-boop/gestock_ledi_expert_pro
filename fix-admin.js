const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'data/local.db'));

try {
    // 1. Lister tous les utilisateurs pour voir ce qu'il y a en base
    const users = db.prepare("SELECT id, email, username, role FROM users").all();
    
    if (users.length === 0) {
        console.log("❌ La table 'users' est VIDE. Connecte-toi d'abord sur l'application.");
    } else {
        console.log("👥 Utilisateurs trouvés en base :");
        console.table(users);

        // 2. On prend le premier utilisateur trouvé et on le passe ADMIN par défaut
        const firstUserEmail = users[0].email;
        db.prepare("UPDATE users SET role = 'admin' WHERE email = ?").run(firstUserEmail);
        
        console.log(`\n✅ SUCCÈS : L'utilisateur ${firstUserEmail} est maintenant ADMIN.`);
    }
} catch (err) {
    console.error("❌ Erreur :", err.message);
} finally {
    db.close();
}