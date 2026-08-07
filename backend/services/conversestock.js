/**
 * 📦 SERVICE BACKEND CENTRALISÉ DE CONVERSION & DE PROTECTION DU STOCK (ANTI-LITIGE)
 * Centralise les règles d'équivalence logistique pour s'assurer que les ventes,
 * les achats et les inventaires impactent uniquement l'unité de référence brute (les pièces).
 */

module.exports = {
    /**
     * 🚀 OPÉRATION 1 : CONVERSION LOGISTIQUE SECURE (Prend en compte Gros + Détail Combinés ou Séparés)
     * Calcule le nombre exact et entier de pièces de détail à mouvementer dans SQLite.
     * 
     * @param {Object} db - L'instance de connexion active better-sqlite3
     * @param {string} productId - L'ID unique de l'article (ex: "ART-001")
     * @param {string|number} qteSaisieGros - La quantité brute ou l'expression combinée (ex: "21 + 7", 21 ou "7")
     * @returns {number} Nombre entier strict de pièces unitaires de détail pour le SQL (ex: 259)
     */
    calculerUnitesNatives: function(db, productId, qteSaisieGros) {
        if (!productId || qteSaisieGros === undefined || qteSaisieGros === null || qteSaisieGros === '') {
            return 0;
        }

        try {
            // 1. Récupération du coefficient configuré en BDD
            const product = db.prepare(`
                SELECT u.coefficient 
                FROM products p 
                LEFT JOIN unites u ON p.unite_id = u.id 
                WHERE p.id = ?
            `).get(productId);

            const coeffLogistique = product && product.coefficient ? Number(product.coefficient) : 1;

            const chaineBrute = String(qteSaisieGros).trim();
            let totalPiecesCalculees = 0;

            // 🚀 INTERCEPTION ET DÉCOUPAGE INTÉGRAL : Si la chaîne contient un "+" (Saisie combinée Gros + Détail, ex: "21 + 7")
            if (chaineBrute.includes('+')) {
                const parties = chaineBrute.split('+');
                
                // La partie gauche représente l'unité de Gros (ex: 21 cartons) ➔ Multipliée par le coefficient
                const grosFlottant = parseFloat(String(parties[0]).replace(',', '.').trim()) || 0;
                // La partie droite représente l'unité de Détail référentiel (ex: 7 bouteilles) ➔ Ajoutée brute
                const detailFlottant = parseFloat(String(parties[1]).replace(',', '.').trim()) || 0;

                totalPiecesCalculees = Math.round(grosFlottant * coeffLogistique) + Math.round(detailFlottant);
            } else {
                // Saisie standard d'une seule dimension
                const valeurNumerique = parseFloat(chaineBrute.replace(',', '.')) || 0;
                
                // Sécurisation : Si la valeur saisie est entière et qu'un coefficient existe, 
                // on considère par défaut qu'il s'agit d'unités de Gros (Casier/Carton)
                totalPiecesCalculees = Math.round(valeurNumerique * coeffLogistique);
            }

            // 🛡️ ARRONDIS ANTI-LITIGE COMPTABLES
            return totalPiecesCalculees;

        } catch (err) {
            console.error(`🚨 [CONVERSESTOCK SERVICE] Échec évaluation sur produit ${productId}:`, err.message);
            return 0;
        }
    },

    /**
     * 🚀 OPÉRATION 2 : DECOMPOSITION LOGISTIQUE INVERSE (Unités Référence BDD ➔ Chaîne Textuelle)
     * Convertit un volume total de pièces en texte lisible selon le conditionnement gros/détail.
     */
    formaterStockPourAffichage: function(qteBruteDetail, coefficient, codeGros, refDetail) {
        const qteBruteNum = Number(qteBruteDetail || 0);
        const estNegatif = qteBruteNum < 0;
        
        // Utilisation de Math.round pour nettoyer les approximations de flottants
        const qteTotale = Math.round(Math.abs(qteBruteNum));
        
        const coeff = Number(coefficient || 1);
        const codeG = codeGros ? String(codeGros).toUpperCase().trim() : 'CS';
        let refD = refDetail ? String(refDetail) : 'UNITÉ';
        refD = refD.replace(/\(s\)/g, '').toUpperCase().trim(); 

        if (qteTotale === 0) return `0 ${refD}`;

        let resultatTextuel = "";

        if (coeff > 1) {
            const grosEntiers = Math.floor(qteTotale / coeff);
            const restesDetail = qteTotale % coeff; // Modulo sur entier propre sécurisé

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
     * 🚀 OPÉRATION 3 : VALORISATION COMPTABLE VALIDE DE L'ÉCART D'INVENTAIRE
     * Calcule la valeur financière réelle d'un écart sur la base du prix unitaire dénormalisé au détail.
     */
    calculerValeurFinanciereEcart: function(qteEcartPieces, coefficient, prixGros) {
        const ecart = Number(qteEcartPieces || 0);
        const coeff = Number(coefficient || 1);
        const pGros = Number(prixGros || 0);

        // Détermination du prix de base à la pièce unitaire (bouteille)
        const prixUnitaireDetail = coeff > 1 ? (pGros / coeff) : pGros;

        // Valeur de l'écart (signée ou absolue selon les besoins du contrôleur)
        return Math.round(ecart * prixUnitaireDetail);
    }
};
