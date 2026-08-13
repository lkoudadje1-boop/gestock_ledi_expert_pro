// backend/utils/notifier.js

/**
 * Notifie en temps réel tous les utilisateurs connectés d'une même entreprise 
 * via WebSocket (Socket.io) qu'une modification a eu lieu.
 * 
 * @param {Object} req - L'objet requête Express
 * @param {string} table - Le nom de la ressource ou collection modifiée
 * @param {string} [operation='UPDATE'] - Le type d'opération (CREATE, UPDATE, DELETE)
 */
const broadcastChange = (req, table, operation = 'UPDATE') => {
    const io = req.app.get('socketio');
    
    // Récupération sécurisée du companyId normalisé par les middlewares
    const companyId = req.companyId || req.user?.companyId || req.user?.company_id;

    if (!io || !companyId) return;

    const cid = companyId.toString();

    // Diffusion instantanée à tous les écrans connectés pour cette entreprise
    io.to(cid).emit('DATA_EVENT', {
        table: table,
        type: operation,
        timestamp: new Date(),
        message: `Mise à jour de la ressource ${table}`
    });
};

module.exports = { broadcastChange };