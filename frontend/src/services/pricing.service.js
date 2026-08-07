export const PricingService = {
    isPromoValide: function(article, prefix) {
        if (!article) return false;
        const isPromoCoche = Number(article[`${prefix}IsPromo`] || 0);

        if (isPromoCoche === 0) return true;

        const debut = article[`${prefix}DateDebut`];
        const fin = article[`${prefix}DateFin`] || article[`${prefix}DateFIn`];

        if (!debut || !fin) return false;

        const maintenant = new Date();

        return maintenant >= new Date(debut) &&
               maintenant <= new Date(fin);
    },

    /**
     * Calcul des paliers avec gestion intelligente du reliquat.
     */
    calculerPrixPaliersLots: function(paliers, qteSaisie, prixVenteBase) {

        let qteRestante = Number(qteSaisie) || 0;
        let montantTotalLotsTTC = 0;

        if (!paliers || paliers.length === 0) {
            return qteRestante * prixVenteBase;
        }

        // Tri décroissant
        const paliersTries = [...paliers]
            .map(p => ({
                quantite: Number(p.quantite),
                prix_total: Number(p.prix_total)
            }))
            .filter(p => p.quantite > 0 && p.prix_total > 0)
            .sort((a, b) => b.quantite - a.quantite);

        if (paliersTries.length === 0) {
            return qteRestante * prixVenteBase;
        }

        // Plus petit palier disponible
        const plusPetitPalier = paliersTries[paliersTries.length - 1];

        // Cas où la quantité est inférieure au plus petit palier :
        // on facture proportionnellement à ce palier.
        if (qteRestante < plusPetitPalier.quantite) {

            const prixUnitaire =
                plusPetitPalier.prix_total /
                plusPetitPalier.quantite;

            return qteRestante * prixUnitaire;
        }

        // Décomposition par lots
        for (const palier of paliersTries) {

            if (qteRestante >= palier.quantite) {

                const nbLots = Math.floor(qteRestante / palier.quantite);

                montantTotalLotsTTC +=
                    nbLots * palier.prix_total;

                qteRestante =
                    qteRestante % palier.quantite;
            }
        }

        // Reliquat
        if (qteRestante > 0) {

            const prixUnitairePlusPetit =
                plusPetitPalier.prix_total /
                plusPetitPalier.quantite;

            montantTotalLotsTTC +=
                qteRestante * prixUnitairePlusPetit;
        }

        return montantTotalLotsTTC;
    },
    calculerLigne: function(article, qteSaisie) {
        const qte = Number(qteSaisie) || 0;
        const getVal = (key) => Number(article?.[key] || 0);
        
        const pVenteTTCBase = getVal('prixVente');
        
        // --- ⚡ ÉTAPE 1 : INTERCEPTION DU MOTEUR DE PALIERS DE PRIX ---
        let montantBrutTTCApresPaliers = pVenteTTCBase * qte;
        
        // Si le module palier est coché ou si l'article embarque des paliers rattachés
        if (getVal('palierActive') === 1 || (article?.paliers && article.paliers.length > 0)) {
            montantBrutTTCApresPaliers = this.calculerPrixPaliersLots(article.paliers || [], qte, pVenteTTCBase);
        }

        const taxeTaux = getVal('taxeActive') === 1 ? getVal('taxeTaux') : 0;
        const t = taxeTaux / 100;

        // Calcul du montant HT Brut après application des tarifs de paliers par lots
        const montantHTLigneBrut = montantBrutTTCApresPaliers / (1 + t);
        
        // Prix unitaire moyen recalculé dynamiquement pour la justesse des remises en cascade
        const htUnitaireMoyen = qte > 0 ? (montantHTLigneBrut / qte) : 0;

        let remiseTotaleHT = 0;
        let typesAppliques = [];

        if (getVal('remiseActive') === 1) {
            
            // --- R1 : REMISE PAR QUANTITÉ ---
            if (getVal('r1Active') === 1 && this.isPromoValide(article, 'r1')) {
                if (qte >= getVal('r1Seuil')) {
                    const r1M = getVal('r1Montant'), r1T = getVal('r1Taux');
                    if (r1M > 0) remiseTotaleHT += (r1M * qte);
                    else if (r1T > 0) remiseTotaleHT += (montantHTLigneBrut * (r1T / 100)); 
                    typesAppliques.push("R1");
                }
            }

            // --- R2 : REMISE EN GROS ---
            if (getVal('r2Active') === 1 && this.isPromoValide(article, 'r2')) {
                if (qte >= getVal('r2Seuil')) {
                    const r2M = getVal('r2Montant'), r2T = getVal('r2Taux');
                    if (r2M > 0) remiseTotaleHT += r2M;
                    else if (r2T > 0) remiseTotaleHT += (montantHTLigneBrut * (r2T / 100));
                    typesAppliques.push("R2");
                }
            }

            // --- R3 : REMISE PAR MULTIPLE ---
            if (getVal('r3Active') === 1 && this.isPromoValide(article, 'r3')) {
                const mult = getVal('r3Multiple');
                if (mult > 0 && qte >= mult) {
                    const nbMultiples = Math.floor(qte / mult);
                    const r3M = getVal('r3Montant'), r3T = getVal('r3Taux');
                    if (r3M > 0) remiseTotaleHT += (nbMultiples * r3M);
                    else if (r3T > 0) remiseTotaleHT += nbMultiples * (htUnitaireMoyen * mult * (r3T / 100));
                    typesAppliques.push("R3");
                }
            }

            // --- R4 : INTERVALLE CUMULÉ ---
            if (getVal('r4Active') === 1 && this.isPromoValide(article, 'r4')) {
                let r4Accumulee = 0;

                // Palier A
                if (qte >= getVal('r4A_Max') && getVal('r4A_Max') > 0) {
                    const r4AM = getVal('r4A_Montant'), r4AT = getVal('r4A_Taux');
                    r4Accumulee += r4AM > 0 ? r4AM : (montantHTLigneBrut * (r4AT / 100));
                }
                // Palier B
                if (qte >= getVal('r4B_Max') && getVal('r4B_Max') > 0) {
                    const r4BM = getVal('r4B_Montant'), r4BT = getVal('r4B_Taux');
                    r4Accumulee += r4BM > 0 ? r4BM : (montantHTLigneBrut * (r4BT / 100));
                }
                // Palier C (Seuil fixe 20)
                if (qte >= 20) {
                    const r4CM = getVal('r4C_Montant'), r4CT = getVal('r4C_Taux');
                    r4Accumulee += r4CM > 0 ? r4CM : (montantHTLigneBrut * (r4CT / 100));
                }

                if (r4Accumulee > 0) {
                    remiseTotaleHT += r4Accumulee;
                    typesAppliques.push("R4");
                }
            }
        }

        const montantHTTotal = montantHTLigneBrut - remiseTotaleHT;
        const montantTTCTotal = montantHTTotal * (1 + t);
        const montantTaxeTotal = montantTTCTotal - montantHTTotal;

        return {
            montantBrutTTC: montantBrutTTCApresPaliers, // Reçoit la valeur décomposée par lots
            remiseTotale: remiseTotaleHT,
            typeRemise: typesAppliques.length > 0 ? typesAppliques.join("+") : null,
            prixHTUnitaire: htUnitaireMoyen, // Retourne le coût HT moyen d'un article après palier
            montantHT: montantHTTotal,
            montantTaxe: montantTaxeTotal,
            taxeTaux: taxeTaux,
            netAPayer: montantTTCTotal
        };
    }
};
