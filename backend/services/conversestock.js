/**
 * 📦 SERVICE BACKEND CENTRALISÉ DE CONVERSION & DE PROTECTION DU STOCK (ANTI-LITIGE)
 * Centralise les règles d'équivalence logistique pour MongoDB (Cloud Pur).
 */

module.exports = {
    /**
     * 🚀 OPÉRATION 1 : CONVERSION LOGISTIQUE SECURE
     * @param {number} coeffLogistique - Le coefficient récupéré de Mongoose
     * @param {string|number} qteSaisieGros - La quantité ou expression (ex: "21 + 7")
     * @returns {number} Nombre entier strict de pièces unitaires de détail
     */
    calculerUnitesNatives: function(coeffLogistique, qteSaisieGros) {
        if (qteSaisieGros === undefined || qteSaisieGros === null || qteSaisieGros === '') {
            return 0;
        }

        try {
            const coeff = Number(coeffLogistique) || 1;
            const chaineBrute = String(qteSaisieGros).trim();
            let totalPiecesCalculees = 0;

            if (chaineBrute.includes('+')) {
                const parties = chaineBrute.split('+');
                const grosFlottant = parseFloat(String(parties[0]).replace(',', '.').trim()) || 0;
                const detailFlottant = parseFloat(String(parties[1]).replace(',', '.').trim()) || 0;
                totalPiecesCalculees = Math.round(grosFlottant * coeff) + Math.round(detailFlottant);
            } else {
                const valeurNumerique = parseFloat(chaineBrute.replace(',', '.')) || 0;
                totalPiecesCalculees = Math.round(valeurNumerique * coeff);
            }

            return totalPiecesCalculees;
        } catch (err) {
            console.error(`🚨 [CONVERSESTOCK] Échec calcul conversion :`, err.message);
            return 0;
        }
    },

    /**
     * 🚀 OPÉRATION 2 : DECOMPOSITION LOGISTIQUE INVERSE
     */
    formaterStockPourAffichage: function(qteBruteDetail, coefficient, codeGros, refDetail) {
        const qteBruteNum = Number(qteBruteDetail || 0);
        const estNegatif = qteBruteNum < 0;
        const qteTotale = Math.round(Math.abs(qteBruteNum));
        
        const coeff = Number(coefficient || 1);
        const codeG = codeGros ? String(codeGros).toUpperCase().trim() : 'CS';
        let refD = refDetail ? String(refDetail) : 'UNITÉ';
        refD = refD.replace(/\(s\)/g, '').toUpperCase().trim(); 

        if (qteTotale === 0) return `0 ${refD}`;

        let resultatTextuel = "";
        if (coeff > 1) {
            const grosEntiers = Math.floor(qteTotale / coeff);
            const restesDetail = qteTotale % coeff;

            if (grosEntiers > 0 && restesDetail > 0) {
                resultatTextuel = `${grosEntiers} ${codeG} + ${restesDetail} ${refD}`;
            } else if (grosEntiers > 0) {
                resultatTextuel = `${grosEntiers} ${codeG}`;
            } else {
                resultatTextuel = `${restesDetail} ${refD}`;
            }
        } else {
            resultatTextuel = `${qteTotale} ${refD}`;
        }

        return estNegatif ? `-${resultatTextuel}` : resultatTextuel;
    },

    /**
     * 🚀 OPÉRATION 3 : VALORISATION COMPTABLE VALIDE
     */
    calculerValeurFinanciereEcart: function(qteEcartPieces, coefficient, prixGros) {
        const ecart = Number(qteEcartPieces || 0);
        const coeff = Number(coefficient || 1);
        const pGros = Number(prixGros || 0);

        const prixUnitaireDetail = coeff > 1 ? (pGros / coeff) : pGros;
        return Math.round(ecart * prixUnitaireDetail);
    }
};