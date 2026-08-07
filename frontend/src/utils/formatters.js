/**
 * Formate un montant selon la monnaie de l'entreprise
 * @param {number} amount - Le montant à formater
 * @param {string} currencyCode - Code ISO (XAF, EUR, USD...)
 */
export const formatCurrency = (amount, currencyCode = 'XAF') => {
  // On récupère la locale (fr-FR, en-US, etc.) sinon on détecte celle du navigateur
  const locale = navigator.language || 'fr-FR';

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 0, // Optionnel : pour éviter les virgules si tu n'en veux pas
  }).format(amount);
};