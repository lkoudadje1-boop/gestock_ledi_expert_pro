import axios from 'axios';

// ⚙️ Définissez l'URL de votre serveur backend (local ou distant)
axios.defaults.baseURL = 'http://localhost:3000'; 

/**
 * Lance la synchronisation bidirectionnelle automatique en arrière-plan (Polling)
 * @param {string} companyId - ID de l'entreprise connectée
 * @param {number} intervalMs - Fréquence de vérification en millisecondes (ex: 30000 = 30 secondes)
 */
export const initAutoSync = (companyId, intervalMs = 30000) => {
    // On mémorise la date de la dernière vérification (format ISO)
    let lastSyncTimestamp = new Date().toISOString();

    console.log("🔄 [AUTO-SYNC] Service de synchronisation automatique démarré pour l'entreprise:", companyId);

    setInterval(async () => {
        try {
            const token = localStorage.getItem('token');
            if (!token) return; // Si l'utilisateur n'est pas connecté, on ignore

            // 1. PUSH : On envoie les modifications locales en attente vers le Cloud
            await axios.post('/api/sync/push-all', {}, {
                headers: { Authorization: `Bearer ${token}` }
            });

            // 2. CHECK : On demande au serveur si le Cloud a du nouveau depuis la dernière vérification
            const checkResponse = await axios.get(`/api/sync/check-updates/${encodeURIComponent(lastSyncTimestamp)}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (checkResponse.data && checkResponse.data.hasUpdates) {
                console.log("☁️ [AUTO-SYNC] Modifications détectées sur le Cloud (par le patron ou un autre poste) ! Téléchargement...");

                // 3. PULL : Si le Cloud a changé, on met à jour la base SQLite locale
                await axios.post('/api/sync/pull', {}, {
                    headers: { Authorization: `Bearer ${token}` }
                });

                console.log("✅ [AUTO-SYNC] Base locale mise à jour avec succès.");

                // 4. SIGNAL : On prévient l'interface React qu'un rafraîchissement des données est nécessaire
                window.dispatchEvent(new CustomEvent('ERP_DATA_REFRESHED'));
            }

            // On met à jour le repère temporel pour le prochain cycle
            lastSyncTimestamp = new Date().toISOString();

        } catch (error) {
            // Si l'employé n'a pas de connexion internet, on ignore silencieusement (mode hors-ligne)
            if (error.code === 'ERR_NETWORK' || !error.response) {
                // Pas de log polluant, le travail continue normalement sur SQLite local
            } else {
                console.error("❌ [AUTO-SYNC ERROR]:", error.response?.data?.message || error.message);
            }
        }
    }, intervalMs);
};