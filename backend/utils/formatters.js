// backend/utils/formatters.js

/**
 * Convertit un nombre entier en toutes lettres (Français)
 * @param {number} nombre 
 * @returns {string}
 */
function nombreEnLettres(nombre) {
    if (nombre === 0) return 'zéro';

    const unites = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf'];
    const dizaines = ['', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', '', 'quatre-vingt', 'quatre-vingt-dix'];
    const nombresSpeciaux = {
        11: 'onze', 12: 'douze', 13: 'treize', 14: 'quatorze', 15: 'quinze', 16: 'seize',
        71: 'soixante-onze', 72: 'soixante-douze', 73: 'soixante-treize', 74: 'soixante-quatorze',
        75: 'soixante-quinze', 76: 'soixante-seize', 91: 'quatre-vingt-onze', 92: 'quatre-vingt-douze',
        93: 'quatre-vingt-treize', 94: 'quatre-vingt-quatorze', 95: 'quatre-vingt-quinze', 96: 'quatre-vingt-seize'
    };

    function convertirGroupe(n) {
        let str = '';
        const c = Math.floor(n / 100);
        const r = n % 100;
        const d = Math.floor(r / 10);
        const u = r % 10;

        if (c > 0) {
            str += (c === 1 ? '' : unites[c] + ' ') + 'cent' + (c > 1 && r === 0 ? 's' : '') + ' ';
        }

        if (nombresSpeciaux[r]) {
            str += nombresSpeciaux[r];
        } else {
            if (d > 0) {
                if (d === 7 || d === 9) {
                    str += dizaines[d - 1] + '-' + nombresSpeciaux[r - (d - 1) * 10];
                } else {
                    str += dizaines[d] + (u === 1 && d !== 8 ? '-et-' : (u > 0 ? '-' : ''));
                }
            }
            if (u > 0 && !(d === 7 || d === 9)) {
                str += unites[u];
            }
        }
        return str.trim();
    }

    let resultat = '';
    let reste = Math.floor(nombre);

    const milliards = Math.floor(reste / 1000000000); reste %= 1000000000;
    const millions = Math.floor(reste / 1000000); reste %= 1000000;
    const milliers = Math.floor(reste / 1000); reste %= 1000;

    if (milliards > 0) resultat += convertirGroupe(milliards) + ' milliard' + (milliards > 1 ? 's' : '') + ' ';
    if (millions > 0) resultat += convertirGroupe(millions) + ' million' + (millions > 1 ? 's' : '') + ' ';
    if (milliers > 0) resultat += (milliers === 1 ? '' : convertirGroupe(milliers) + ' ') + 'mille ';
    if (reste > 0) resultat += convertirGroupe(reste);

    return resultat.trim();
}

/**
 * Génère la mention officielle d'arrêt de facture
 * @param {number} montant 
 * @param {string} [devise="Francs CFA"] 
 * @returns {string}
 */
function genererArreteFacture(montant, devise = 'Francs CFA') {
    const lettres = nombreEnLettres(montant);
    const lettresFormatees = lettres.charAt(0).toUpperCase() + lettres.slice(1);
    return `Arrêtée la présente facture à la somme de : ${lettresFormatees} (${montant}) ${devise}.`;
}

// 📦 EXPORTATION COMMONJS POUR LE BACKEND NODE.JS
module.exports = {
    nombreEnLettres,
    genererArreteFacture
};
