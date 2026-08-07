import i18n from 'i18next';

/**
 * Formate un montant numérique selon la langue de l'ERP et n'importe quelle devise mondiale.
 * @param {number} amount - Montant brut
 * @param {string} currencyCode - Code ISO international (ex: 'XOF', 'USD', 'EUR', 'GNF')
 */
export const formatGlobalCurrency = (amount, currencyCode = 'XOF') => {
  const currentLang = i18n.language || 'fr'; 

  try {
    return new Intl.NumberFormat(currentLang, {
      style: 'currency',
      currency: currencyCode.toUpperCase(),
      minimumFractionDigits: 0,
      maximumFractionDigits: 2 
    }).format(amount);
  } catch (error) {
    console.error(`Erreur devise: ${currencyCode}`, error);
    return `${amount.toLocaleString(currentLang)} ${currencyCode}`;
  }
};
