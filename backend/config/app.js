// backend/config/config.js
module.exports = {
  APP_NAME: 'ERP LEDI EXPERT PRO',
  VERSION: '1.0.0',
  ENV: process.env.NODE_ENV || 'development',
  
  // Sécurité
  JWT_SECRET: process.env.JWT_SECRET, // On force la récupération depuis le .env
  SALT_ROUNDS: 10,

  // Configuration Cloud
  // Plus besoin de SYNC_ENABLED, nous sommes en connexion directe avec MongoDB Atlas
  
  // Paramètres par défaut de l'application
  DEFAULT_CURRENCY: 'FCFA',
  
  // Temps d'expiration des sessions (utile pour le cloud)
  JWT_EXPIRES_IN: '24h' 
};