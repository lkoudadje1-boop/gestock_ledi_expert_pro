// backend/jobs/sync.job.js
const { syncLocalToCloud } = require('../services/sync.service');

let isSyncing = false; // Verrou pour éviter les chevauchements

/**
 * Lance le cycle de synchronisation automatique
 */
const startSyncJob = () => {
    const SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes

    setInterval(async () => {
        if (isSyncing) {
            console.log("⏳ [SYNC] Un cycle est déjà en cours, report au prochain intervalle.");
            return;
        }

        try {
            isSyncing = true;
            console.log("⏱️ [SYNC] Début de la synchronisation globale...");
            
            // Traite la sync_queue (Produits, Users, etc.)
            await syncLocalToCloud();
            
            console.log("✅ [SYNC] Cycle terminé.");
        } catch (error) {
            console.error("❌ [SYNC] Échec :", error.message);
        } finally {
            isSyncing = false; // On libère le verrou quoi qu'il arrive
        }
    }, SYNC_INTERVAL); 

    // Premier lancement immédiat
    console.log("🚀 [SYSTEM] Moteur de synchronisation démarré.");
    syncLocalToCloud().catch(err => console.error("⚠️ [SYNC] Échec initial :", err.message));
};

module.exports = { startSyncJob };