const mongoose = require('mongoose');

let isConnected = false;

// ======================================================
// INIT DATABASE (MONGODB CLOUD)
// ======================================================
async function initDatabase() {
    if (isConnected) {
        return mongoose;
    }

    try {
        const mongoURI = process.env.MONGO_URI;
        
        if (!mongoURI) {
            throw new Error("L'URI de MongoDB est introuvable dans les variables d'environnement (MONGO_URI).");
        }

        // Connexion asynchrone à MongoDB Atlas
        await mongoose.connect(mongoURI);
        
        isConnected = true;
        console.log('☁️ Connecté avec succès à MongoDB Atlas (Mode 100% Cloud) !');
        
        return mongoose;
    } catch (err) {
        console.error('❌ Erreur critique de connexion à MongoDB :', err.message);
        throw err;
    }
}

// ======================================================
// GET DB / CLIENT INSTANCE
// ======================================================
function getDb() {  
    if (!isConnected) {
        throw new Error('Base de données non initialisée. Appelez initDatabase() d\'abord.'); 
    }
    return mongoose;  
}

// Fermeture propre de la connexion si nécessaire
async function closeDatabase() {
    if (isConnected) {
        await mongoose.connection.close();
        isConnected = false;
        console.log('🔌 Déconnexion propre de MongoDB Cloud.');
    }
}

module.exports = { initDatabase, getDb, closeDatabase };