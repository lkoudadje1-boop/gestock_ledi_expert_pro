// backend/config/config.js
module.exports = {
  APP_NAME: 'ERP LEDI EXPERT PRO',
  VERSION: '1.0.0',
  ENV: process.env.NODE_ENV || 'development',
  
  // Sécurité
  JWT_SECRET: process.env.JWT_SECRET || 'MA_CLE_SUPER_SECRETE_123',
  SALT_ROUNDS: 10,

  // Configuration Cloud (Nécessaire pour la synchronisation mono-site)
  CLOUD_SYNC_ENABLED: true,
  
  // Paramètres par défaut de l'application
  DEFAULT_CURRENCY: 'FCFA',
  
  // Note : Toutes les références aux IDs de succursales par défaut ont été supprimées.
};