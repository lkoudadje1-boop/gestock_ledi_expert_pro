// backend/purge_cloud.js
require('dotenv').config();
const mongoose = require('mongoose');

const purgeCloud = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("📡 Connecté au Cloud pour nettoyage...");

        // On supprime tout le contenu des collections
        const collections = await mongoose.connection.db.collections();
        for (let collection of collections) {
            await collection.deleteMany({});
            console.log(`🗑️ Collection [${collection.collectionName}] vidée.`);
        }

        console.log("✅ Le Cloud est maintenant totalement vide !");
        process.exit(0);
    } catch (err) {
        console.error("❌ Erreur de purge :", err.message);
        process.exit(1);
    }
};

purgeCloud();