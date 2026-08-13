// backend/utils/helpers.js
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

/**
 * 🏢 Générateur de code Entreprise (Format : HEXADÉCIMAL)
 */
function generateUniqueCode(length = 8) {
  return crypto.randomBytes(Math.ceil(length / 2))
               .toString('hex')
               .slice(0, length)
               .toUpperCase();
}

/**
 * 🔐 Sécurité : Hachage du mot de passe
 */
async function hashPassword(password) {
  const saltRounds = 10;
  return await bcrypt.hash(password, saltRounds);
}

/**
 * 🔑 Sécurité : Comparaison pour l'authentification
 */
async function comparePassword(plainPassword, hashedPassword) {
  return await bcrypt.compare(plainPassword, hashedPassword);
}

/**
 * 📦 Générateur d'ID Article (Anti-collision amélioré pour le Cloud)
 * Format : ART- + timestamp + random
 */
function genererIdArticle() {
  const ts = Date.now().toString().slice(-4);
  const random = Math.floor(Math.random() * 1000).toString().padStart(2, '0');
  return `ART-${ts}${random}`;
}

/**
 * 📊 Formateur de prix
 */
function formatCurrency(value) {
  return Number(parseFloat(value || 0).toFixed(2));
}

module.exports = {
  generateUniqueCode,
  hashPassword,
  comparePassword,
  genererIdArticle,
  formatCurrency
};