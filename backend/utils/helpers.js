// backend/services/utils.service.js
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
 * 🔐 Sécurité : Hachage du mot de passe (Asynchrone)
 */
async function hashPassword(password) {
  const saltRounds = 10;
  return await bcrypt.hash(password, saltRounds);
}

/**
 * 🔑 Sécurité : Comparaison pour l'authentification (Asynchrone)
 */
async function comparePassword(plainPassword, hashedPassword) {
  return await bcrypt.compare(plainPassword, hashedPassword);
}

/**
 * 📦 Générateur d'ID Article
 * Format : ART- + 6 chiffres uniques basés sur le timestamp
 */
function genererIdArticle() {
  const ts = Date.now().toString().slice(-6);
  return `ART-${ts}`;
}

/**
 * 📊 Formateur de prix
 */
function formatCurrency(value) {
  return Number(parseFloat(value).toFixed(2));
}

module.exports = {
  generateUniqueCode,
  hashPassword,
  comparePassword,
  genererIdArticle,
  formatCurrency
};