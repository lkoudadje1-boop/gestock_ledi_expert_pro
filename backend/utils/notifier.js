const { syncLocalToCloud } = require('../services/sync.service');

const broadcastChange = (req, table) => {
    const io = req.app.get('socketio');
    const companyId = req.user?.company_id || req.body?.company_id;

    if (!io || !companyId) return;

    // 1. On prévient immédiatement tous les écrans (PC locaux + Web)
    // C'est ce signal qui fera que l'écran de ton collègue s'actualise
    io.to(String(companyId)).emit('DATA_EVENT', {
        table: table,
        type: 'UPDATE',
        timestamp: new Date(),
        message: `Mise à jour de la table ${table}`
    });

    // 2. Si on est sur le PC, on lance le PUSH vers le Cloud sans attendre
    if (process.env.NODE_ENV === 'development') {
        syncLocalToCloud().catch(err => console.error("Sync Cloud auto échouée:", err.message));
    }
};

module.exports = { broadcastChange };