const { startServer } = require('./server');

async function bootstrap() {
    try {
        console.log(`🚀 Mode: ${process.env.NODE_ENV || 'development'}`);
        console.log(`☁️ Architecture : 100% Cloud (MongoDB Atlas & Railway)`);

        // On lance le serveur et sa connexion Cloud
        startServer(); 

    } catch (error) {
        console.error("❌ Erreur fatale au démarrage :", error.message);
        process.exit(1); 
    }
}

bootstrap();