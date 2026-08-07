/**
 * 📦 SERVICE FRONTEND CENTRALISÉ DE CONVERSION LOGISTIQUE (MOTEUR UNIQUE ANTI-LITIGE)
 * Alignement absolu et rigoureux sur les tables SQLite 'products' et 'unites'.
 * Centralise le décodage et l'encodage des colisages Gros + Détail.
 * 🚫 SÉCURITÉ STRICTE : Rejet total des valeurs négatives et des NaN.
 */

export const ConversionStockService = {
    /**
     * 1. 🛡️ ISOLEMENT ET SÉCURISATION DES MÉTADONNÉES LOGISTIQUES ALIGNÉES SUR SQLITE
     * Extrait les coefficients et libellés sans risque de permutation sur tous les canaux.
     */
    getMetadata: function(item) {
        if (!item) return { coeff: 1, codeGros: 'U', refDetail: 'U' }; // Défaut sécurisé

        // 🔍 Exploration récursive profonde pour localiser l'objet contenant les métadonnées d'origine
        const article = item.article_complet || item.product || item.article || item || {};

        // 🎯 Extraction robuste du coefficient multiplicateur (recherche multi-niveaux)
        const coeffLogistique = Number(
            article.unit_coefficient || 
            article.coefficient || 
            item.unit_coefficient || 
            item.coefficient || 
            article.unit_coeff || 
            item.unit_coeff || 1
        ) || 1;

        // 🎯 Extraction unifiée du libellé de Gros (ex: BTS, CS, CT)
        const codeGros = String(
            item.unite_libelle_snap || 
            item.unite_code || 
            item.unit_code_gros || 
            article.code_gros || 
            article.unit_code_gros || 
            article.unite_libelle || 'U'
        ).toUpperCase().trim();

        // 🎯 Extraction unifiée de l'unité de référence/détail (ex: BT, U, KG)
        const refDetail = String(
            item.unite_snap || 
            item.unite_reference || 
            item.unit_ref_detail || 
            article.unite_reference || 
            article.unite_detail || 
            article.unite || 'U'
        ).replace(/\(s\)/g, '').toUpperCase().trim();

        return { coeff: coeffLogistique, codeGros, refDetail };
    },

    /**
     * 🚀 OPÉRATION 1 : CONVERSION LOGISTIQUE SECURE (Texte/Saisie ➔ Pièces natives)
     */
    toPieces: function(quantiteInput, item) {
        const { coeff, codeGros } = this.getMetadata(item);
        
        let chaineBrute = String(quantiteInput || '').trim().replace(/-/g, '');
        if (!chaineBrute || chaineBrute === '0') return 0;

        let totalPiecesCalculees = 0;

        if (chaineBrute.includes('+')) {
            const parties = chaineBrute.split('+');
            const grosFlottant = parseFloat(String(parties[0] || '0').replace(',', '.').trim()) || 0;
            const detailFlottant = parseFloat(String(parties[1] || '0').replace(',', '.').trim()) || 0;

            totalPiecesCalculees = Math.round(Math.abs(grosFlottant) * coeff) + Math.round(Math.abs(detailFlottant));
        } else {
            const extractionSimple = chaineBrute.match(/\d+(\.\d+)?/);
            const valeurNumerique = extractionSimple ? parseFloat(extractionSimple[0].replace(',', '.')) : 0;
            const valeurAbsolue = Math.abs(valeurNumerique);
            
            if (chaineBrute.toUpperCase().includes(codeGros) || chaineBrute.toUpperCase().includes('CS') || chaineBrute.toUpperCase().includes('CT')) {
                totalPiecesCalculees = Math.round(valeurAbsolue * coeff);
            } else {
                totalPiecesCalculees = coeff > 1 ? Math.round(valeurAbsolue * coeff) : Math.round(valeurAbsolue);
            }
        }

        return isNaN(totalPiecesCalculees) ? 0 : totalPiecesCalculees;
    },

    /**
     * 🚀 OPÉRATION 2 : DECOMPOSITION LOGISTIQUE INVERSE (Pièces natives ➔ Chaîne Textuelle)
     */
    toExpressionTextuelle: function(qteBruteDetail, item) {
        const { coeff, codeGros, refDetail } = this.getMetadata(item);
        
        const qteBruteNum = Number(qteBruteDetail || 0);
        
        // 🛡️ VERROU STRICT ANTI-NaN
        if (isNaN(qteBruteNum)) {
            return `0 ${refDetail}`;
        }
        
        const qteTotale = Math.round(Math.abs(qteBruteNum));

        if (qteTotale === 0) return `0 ${refDetail}`;

        let resultatTextuel = "";

        if (coeff > 1) {
            const grosEntiers = Math.floor(qteTotale / coeff);
            const restesDetail = qteTotale % coeff;

            if (grosEntiers > 0 && restesDetail > 0) {
                resultatTextuel = `${grosEntiers} ${codeGros} + ${restesDetail} ${refDetail}`;
            } else if (grosEntiers > 0) {
                resultatTextuel = `${grosEntiers} ${codeGros}`;
            } else {
                resultatTextuel = `${restesDetail} ${refDetail}`;
            }
        } else {
            resultatTextuel = `${qteTotale} ${refDetail}`;
        }

        return resultatTextuel;
    }
};
