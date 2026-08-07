

const { startServer } = require('./server');
const { initDatabase } = require('./config/database');
const { purgeOldAttempts } = require('./controllers/auth.controller'); 

// --- 2. RÉCUPÉRATION DU CHEMIN DE DONNÉES ---
// En Dev, si USER_DATA_PATH n'existe pas, on utilise un dossier /data local
const userDataPath = process.env.USER_DATA_PATH || path.join(__dirname, '../data');

async function bootstrap() {
    try {
        console.log(`🚀 Mode: ${process.env.NODE_ENV || 'development'}`);
        console.log(`📂 Données: ${userDataPath}`);

        // On lance le serveur
        startServer(); 
        
        // Signal de démarrage pour Electron (si lancé via main.js)
        if (process.send) {
            process.send('SERVER_READY');
        }

    } catch (error) {
        console.error("❌ Erreur fatale :", error.message);
        process.exit(1); 
    }
}

bootstrap();