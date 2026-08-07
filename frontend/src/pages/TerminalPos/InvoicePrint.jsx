import React, { forwardRef } from 'react';
// 🛡️ IMPORTATION DU MOTEUR UNIQUE ANTI-LITIGE DE CONVERSION
import { ConversionStockService } from '../../utils/converisonstock';

/**
 * Composant InvoicePrint - Version Finale avec formats A4 / A5 / A6
 */
const InvoicePrint = forwardRef((props, ref) => {
    const {
        panier = [],
        // 🔒 ISOLEMENT COMPTABLE : On renomme l'ancien total calculé de la caisse pour l'ignorer
        totalGeneral: totalGeneralIgnore = 0,
        venteInfo = {},
        company = {},
        isAvoir = false,
        format = 'A4',
        // 🎯 INJECTION DU TABLEAU RECAPITULATIF DES UNITÉS STRICTES SÉPARÉES DEPUIS LA PAGE PARENTE
        recapUnites = []
    } = props;

    // --- 🚀 FONCTION DE FORMATAGE LOGISTIQUE POUR L'IMPRESSION (GROS + DETAIL FORCÉS) ---
    const formaterQuantiteImpression = (qteBruteInput, item) => {
        try {
            // Extraction dynamique et sécurisée du libellé de l'unité de Gros de l'article
            const libGros = item?.unite_libelle_snap || item?.libelle_gros_final || item?.unite_code || item?.unit_code_gros || "CS";

            // 1. Décodage sécurisé de l'input (qu'il soit numérique, "1 CARTON" ou combiné "1+10") en pièces natives
            const totalPieces = ConversionStockService.toPieces(qteBruteInput, item);
            
            // 2. Ré-encodage via le dictionnaire exact de la base de données (ex: "1 CARTON")
            const resultatExpressive = ConversionStockService.toExpressionTextuelle(totalPieces, item);

            // 🎯 CORRECTIF CHIRURGICAL : Si l'expression retournée ne mentionne pas l'unité de gros, on l'ajoute à 0
            if (resultatExpressive && !resultatExpressive.includes(libGros) && !resultatExpressive.includes('+')) {
                return `0 ${libGros} + ${resultatExpressive.trim()}`;
            }

            return resultatExpressive;
        } catch (error) {
            console.error("Erreur Conversion Stock Impression:", error);
            // Repli sécurisé non bloquant si l'item est corrompu avec forçage de l'alignement
            const libGros = item?.unite_libelle_snap || item?.libelle_gros_final || item?.unite_code || item?.unit_code_gros || "CS";
            const libDetail = item?.unit_ref_detail || item?.unite_reference || item?.unite_snap || 'BTS';
            return `0 ${libGros} + ${qteBruteInput} ${libDetail}`;
        }
    };

    // --- 🛡️ VERROUILLAGE SÉCURISÉ DES MONTANTS SUR LES DONNÉES RÉELLES DU PANIER ---
    
    // 1. Le Total HT accumule directement les montants fermes calculés par les paliers de la caisse
    const sousTotalHTNet = panier.reduce((acc, cur) => {
        const montantLigneFerme = Number(cur.montant_ttc_ligne || cur.total_ttc || cur.montant_ht || 0);
        return acc + montantLigneFerme;
    }, 0);

    const totalTaxe = panier.reduce((acc, cur) => acc + (Number(cur.taxe_montant) || 0), 0);

    // 2. 🔒 ANCRE DE SÉCURITÉ : Le Total TTC global devient strictement égal à la somme réelle des lignes
    const totalGeneral = sousTotalHTNet;

    // ==============================================================================
    // 💎 MOTEUR ALGORITHMIQUE DE CONVERSION NUMÉRIQUE EN TOUTES LETTRES (FRANÇAIS)
    // ==============================================================================
    const formaterMontantEnLettres = (montantInput) => {
        const nombre = Math.round(montantInput || 0);
        if (nombre === 0) return "Arrêtée la présente facture à la somme de : Zéro (0) Francs CFA.";

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
        let reste = nombre;

        const milliards = Math.floor(reste / 1000000000); reste %= 1000000000;
        const millions = Math.floor(reste / 1000000); reste %= 1000000;
        const milliers = Math.floor(reste / 1000); reste %= 1000;

        if (milliards > 0) resultat += convertirGroupe(milliards) + ' milliard' + (milliards > 1 ? 's' : '') + ' ';
        if (millions > 0) resultat += convertirGroupe(millions) + ' million' + (millions > 1 ? 's' : '') + ' ';
        if (milliers > 0) resultat += (milliers === 1 ? '' : convertirGroupe(milliers) + ' ') + 'mille ';
        if (reste > 0) resultat += convertirGroupe(reste);

        // 🛡️ NETTOYAGE ABSOLU DE LA CHAÎNE (Supprime les espaces multiples et les blancs de début/fin)
        const lettres = resultat.replace(/\s+/g, ' ').trim();
        
        if (!lettres) return `Arrêtée la présente facture à la somme de : Zéro (${nombre}) Francs CFA.`;

        // Isolation stricte du premier caractère et forçage de la majuscule
        const premiereLettre = lettres.substring(0, 1).toUpperCase();
        const resteDuTexte = lettres.substring(1);
        const lettresFinales = premiereLettre + resteDuTexte;
        
        // Formate la mention d'arrêt officielle OHADA
        return `Arrêtée la présente facture à la somme de : ${lettresFinales} (${new Intl.NumberFormat('fr-FR').format(nombre)}) Francs CFA.`;
    };


return (
        <>
            {/* ✅ FORCE LA COMPRESSION ET COMPACTE LE CONTENU DE GAUCHE À DROITE */}
            <style>
                {`
                    @media print {
                        @page {
                            size: ${format} portrait !important;
                            margin: 0 !important;
                        }

                        html, body {
                            margin: 0 !important;
                            padding: 0 !important;
                            width: 100% !important;
                            -webkit-print-color-adjust: exact;
                            print-color-adjust: exact;
                        }

                        /* On force l'élément racine de l'impression à ne pas déborder */
                        .invoice-page {
                            width: ${format === 'A6' ? '105mm' : format === 'A5' ? '148mm' : '210mm'} !important;
                            max-width: ${format === 'A6' ? '105mm' : format === 'A5' ? '148mm' : '210mm'} !important;
                            min-height: ${format === 'A6' ? '148mm' : format === 'A5' ? '210mm' : '297mm'} !important;
                            box-sizing: border-box !important;
                            padding: ${format === 'A6' ? '4mm 6mm' : format === 'A5' ? '8mm' : '15mm'} !important;
                            margin: 0 !important;
                            position: absolute !important;
                            top: 0 !important;
                            left: 0 !important;
                            overflow: hidden !important;
                        }

                        /* Si le format est A6, on applique un micro-zoom arrière de sécurité 
                           pour faire rentrer de force les montants coupés à droite */
                        ${format === 'A6' ? `
                        .invoice-page {
                            transform: scale(0.92) !important;
                            transform-origin: top left !important;
                        }
                        ` : ''}
                    }
                `}
            </style>

            <div
                ref={ref}
                className="invoice-page"
                style={s.page(format)}
            >

                {/* HEADER */}
                <div style={s.topHeader}>
                    <div style={s.logoContainer}>
                        {company.logo_data ? (
                            <img src={company.logo_data} alt="Logo" style={s.logo(format)} />
                        ) : (
                            <div style={s.logoPlaceholder(format)}>
                                {company.name?.charAt(0) || 'L'}
                            </div>
                        )}
                    </div>

                    <div style={s.titleContainer}>
                        <h1 style={s.mainTitle(format)}>
                            {isAvoir ? "FACTURE D'AVOIR" : "FACTURE"}
                        </h1>
                        <div style={s.distinctionBadge(format)}>
                            {isAvoir ? 'AVOIR' : 'DOIT'}
                        </div>
                    </div>
                </div>

                {/* INFOS SOCIÉTÉ */}
                <div style={{ ...s.infoGrid(format), marginBottom: '4px' }}>
                    <div style={s.companyContact}>
                        <h3 style={s.blueText(format)}>{company.name || "LEDI EXPERT PRO"}</h3>
                        <p style={s.textSm(format)}>{company.address}</p>
                        <p style={s.textSm(format)}>Tél: {company.phone}</p>
                        <p style={s.textSm(format)}>Email: {company.email}</p>
                    </div>

                    <div style={s.invoiceMeta}>
                        <div style={s.metaBox(format)}>
                            <div style={s.metaHeader(format)}>N°</div>
                            <div style={s.metaContent(format)}>{venteInfo.facture_no || '---'}</div>
                        </div>
                        <div style={s.metaBox(format)}>
                            <div style={s.metaHeader(format)}>DATE</div>
                            <div style={s.metaContent(format)}>
                                {new Date().toLocaleDateString('fr-FR')}
                            </div>
                        </div>
                    </div>
                </div>


          {/* CLIENT */}
                <div style={s.clientGrid(format)}>
                    <div style={s.addressBlock}>
                        <div style={s.addressTitle(format)}>
                            {isAvoir ? 'AVOIR POUR :' : 'FACTURE POUR :'}
                        </div>
                        <div style={s.addressContent(format)}>
                            <p style={{ margin: '2px 0' }}><strong>{venteInfo.client_nom || "CLIENT AU COMPTANT"}</strong></p>
                            <p style={{ margin: '2px 0' }}>{venteInfo.client_adresse}</p>
                            <p style={{ margin: '2px 0' }}>{venteInfo.client_phone}</p>
                        </div>
                    </div>

                    <div style={s.addressBlock}>
                        <div style={s.addressTitle(format)}>MODE DE PAIEMENT</div>
                        <div style={s.addressContent(format)}>
                            <p style={{ margin: '2px 0' }}><strong>{venteInfo.mode_paiement || "Espèces"}</strong></p>
                            <p style={{ margin: '2px 0' }}>Net à réception</p>
                        </div>
                    </div>
                </div>
{/* TABLE D'IMPRESSION AVEC CONFIGURATION DE LARGEUR CHIRURGICALE POUR LA QTÉ */}
                <table style={s.table}>
                    <thead>
                        <tr>
                            <th style={{ ...s.th(format), width: '33%', textAlign: 'left' }}>DESCRIPTION</th>
                            
                            {/* 🚀 EXPANSION : Passage de 15% à 22% pour empêcher le texte "1 CS + 6 BOITE" d'être tronqué */}
                            <th style={{ ...s.th(format), width: '22%', textAlign: 'center' }}>QTÉ</th>
                            
                            <th style={{ ...s.th(format), width: '14%', textAlign: 'right' }}>PRIX</th>
                            <th style={{ ...s.th(format), width: '13%', textAlign: 'right' }}>REMISE</th>
                            <th style={{ ...s.th(format), width: '18%', textAlign: 'right' }}>MONTANT</th>
                        </tr>
                    </thead>
                    <tbody>
                        {panier.map((item, index) => {
                         const qteSaisie = Number(item.quantite) || 0;
// 🔒 Valeurs figées provenant de la facture
const qteBrutePanier = item.quantite ?? item.qte_achetee ?? ''; // ✅ Récupère l'expression complète

const remiseLigne = Number(
    item.remise_facture ??
    item.remise_montant ??
    0
);

const netFinalLigne = Number(
    item.montant_facture ??
    item.montant_ttc_ligne ??
    item.total_ttc ??
    item.montant_ht ??
    0
);

// 🌟 FIX : On pioche d'abord le prix au détail 'prix_ht_unitaire' s'il existe (calculé à chaud dans votre panier)
const prixUnitairePalier = Number(
    item.prix_ht_unitaire ??
    item.prix_unitaire_facture ??
    item.prix_vente_unitaire ??
    0
);

return (
    <tr key={item.product_id || item.id || index}>
        <td style={{ ...s.td(format), textAlign: 'left' }}>{item.nom_article_snap}</td>
        
        {/* 🚀 LOGIQUE RENDU SANS COUPURE DE LETTRES EN BOUT DE LIGNE */}
        <td style={{ ...s.td(format), textAlign: 'center', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
            {/* Si c'est une chaîne formatrice textuelle déjà prête, on l'affiche, sinon on passe par votre fonction */}
            {typeof qteBrutePanier === 'string' && qteBrutePanier.includes(' ') 
                ? qteBrutePanier 
                : (item.qte_vendue_formatee ?? formaterQuantiteImpression(qteBrutePanier, item))
            }
        </td>
        
        {/* 🚀 P.U RÉEL DU PALIER CONVERTI AU DÉTAIL AVEC GESTION DES DÉCIMALES */}
        <td style={{ ...s.td(format), textAlign: 'right' }}>
            {prixUnitairePalier.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
        </td>
        <td style={{ ...s.td(format), textAlign: 'right', color: '#ef4444' }}>
            {remiseLigne 
                ? `-${remiseLigne.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}` 
                : '-'
            }
        </td>
        
        {/* MONTANT DE LIGNE RIGIDE GÉRANT LES CENTIMES */}
        <td style={{ ...s.td(format), textAlign: 'right', fontWeight: 'bold' }}>
            {netFinalLigne.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} F
        </td>
    </tr>
);
})}

</tbody>
                </table>

                {/* TOTAL */}
                <div style={s.bottomSection(format)}>
                    {/* 🚀 COMPRESSION NETTE : Suppression du paragraphe en doublon car la fonction gère déjà l'arrêt */}
                    <div style={s.mentionLettres(format)}>
                        <p style={{ ...s.montantLettres(format), fontStyle: 'italic', lineHeight: 1.3 }}>
                            {formaterMontantEnLettres(totalGeneral)}
                        </p>
                    </div>

                    <div style={s.totalContainer(format)}>

                        <table style={s.totalTable}>
                            <tbody>
                                <tr>
                                    <td style={s.totalLabel(format)}>TOTAL HT</td>
                                    {/* 🚀 AFFICHAGE AVEC VIRGULE SI REQUIS SANS ARRONDIS AGRESSIFS */}
                                    <td style={s.totalVal(format)}>
                                        {sousTotalHTNet.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} F
                                    </td>
                                </tr>

                                {totalTaxe > 0 && (
                                    <tr>
                                        <td style={s.totalLabel(format)}>TAXES</td>
                                        <td style={s.totalVal(format)}>
                                            + {totalTaxe.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} F
                                        </td>
                                    </tr>
                                )}

                                <tr style={s.finalRow}>
                                    <td style={s.finalLabel(format)}>TOTAL TTC</td>
                                    <td style={s.finalVal(format)}>
                                        {totalGeneral.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} FCFA
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* 📊 🎯 DEPLACEMENT EFFECTUÉ ICI : BLOC DE RENDU DES UNITES DISSOCIEES EN COMPLÈTE FIN DE FACTURE */}
                {recapUnites && recapUnites.length > 0 && (
                    <div style={{ 
                        marginTop: '6px', 
                        marginBottom: '6px',
                        padding: '3px 5px', 
                        borderTop: '1px dashed #000', 
                        borderBottom: '1px dashed #000',
                        backgroundColor: '#f8fafc',
                        fontSize: format === 'A6' ? '7.5px' : '9px'
                    }}>
                        <div style={{ fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '2px', fontSize: format === 'A6' ? '7.5px' : '9px', letterSpacing: '0.3px', color: '#1e293b' }}>
                            Résumé Global des Quantités :
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                            {recapUnites.map((uniteRow, idx) => {
                                let texteUniteFinal = uniteRow.unite || "";

                                // Si la chaîne brute ne contient pas déjà de décomposition avec '+'
                                if (texteUniteFinal && !texteUniteFinal.includes('+')) {
                                    // Utilisation de la métadonnée injectée par le parent (ex: CS2, CS, CRT)
                                    const libGrosDynamique = uniteRow.unite_gros || "CS";
                                    
                                    if (!texteUniteFinal.includes(libGrosDynamique)) {
                                        texteUniteFinal = `0 ${libGrosDynamique} + ${texteUniteFinal.trim()}`;
                                    }
                                }

                                return (
                                    <div key={idx} style={{ fontWeight: 'bold', fontSize: format === 'A6' ? '7.5px' : '9px', color: '#000' }}>
                                        <span style={{ fontSize: format === 'A6' ? '8px' : '9.5px', background: '#e2e8f0', padding: '2px 5px', borderRadius: '3px', fontFamily: 'monospace' }}>
                                            {texteUniteFinal}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* FOOTER */}
                <div style={s.footer(format)}>
                    <p style={s.typeDocument(format)}>
                        --- {isAvoir ? "AVOIR" : "FACTURE"} ---
                    </p>
                    <div style={s.legalInfo(format)}>
                        <p style={{ margin: '2px 0' }}><strong>{company.name}</strong> — {company.address}</p>
                        <p style={{ margin: '2px 0' }}>Tél: {company.phone}</p>
                        <p style={{ fontSize: format === 'A6' ? '7px' : '9px', opacity: 0.6, margin: '2px 0' }}>
                            ERP LEDI EXPERT PRO - {new Date().getFullYear()}
                        </p>
                    </div>
                </div>

            </div>
        </>
    );
});


/* ================= STYLE DYNAMIQUE SÉCURISÉ ================= */

const s = {
    page: (format) => ({
        fontFamily: '"Segoe UI", sans-serif',
        color: '#1e293b',
        background: '#fff',
        position: 'relative',
        boxSizing: 'border-box',
        width: '100%'
    }),

    footer: (format) => ({
        position: format === 'A6' ? 'relative' : 'absolute',
        bottom: format === 'A6' ? '0' : '30px',
        left: format === 'A6' ? '0' : '40px',
        right: format === 'A6' ? '0' : '40px',
        textAlign: 'center',
        borderTop: '1px solid #eee',
        paddingTop: '6px',
        marginTop: format === 'A6' ? '15px' : '0'
    }),

    topHeader: { 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: 8 
    },
    
    logoContainer: { maxWidth: '30%' },
    logo: (format) => ({ maxHeight: format === 'A6' ? 32 : 60, width: 'auto' }),
    logoPlaceholder: (format) => ({ 
        width: format === 'A6' ? 32 : 50, 
        height: format === 'A6' ? 32 : 50, 
        background: '#1e40af', 
        color: '#fff', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        fontWeight: 'bold',
        fontSize: format === 'A6' ? 11 : 16
    }),

    titleContainer: { textAlign: 'right' },
    mainTitle: (format) => ({ fontSize: format === 'A6' ? 15 : 24, color: '#1e40af', margin: 0, fontWeight: 'bold' }),
    distinctionBadge: (format) => ({ fontSize: format === 'A6' ? 8 : 11, letterSpacing: 2, color: '#666', margin: 0 }),

    infoGrid: (format) => ({ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'flex-start',
        gap: 10,
        marginBottom: 8 
    }),

    companyContact: { flex: 1, minWidth: 0 },
    blueText: (format) => ({ color: '#1e40af', margin: '0 0 2px 0', fontSize: format === 'A6' ? 10 : 14, fontWeight: 'bold' }),
    textSm: (format) => ({ fontSize: format === 'A6' ? 8 : 11, margin: '1px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }),

    invoiceMeta: { display: 'flex', gap: 4, shrink: 0 },
    metaBox: (format) => ({ width: format === 'A6' ? 60 : 90 }),
    metaHeader: (format) => ({ background: '#1e40af', color: '#fff', fontSize: format === 'A6' ? 8 : 10, textAlign: 'center', padding: '1px 0', fontWeight: 'bold' }),
    metaContent: (format) => ({ border: '1px solid #ccc', textAlign: 'center', fontSize: format === 'A6' ? 8 : 10, padding: '1px 0' }),

    clientGrid: (format) => ({ 
        display: 'flex', 
        gap: 8, 
        marginBottom: 8 
    }),

    addressBlock: { flex: 1, border: '1px solid #e2e8f0', borderRadius: 4, overflow: 'hidden', minWidth: 0 },
    addressTitle: (format) => ({ background: '#f1f5f9', padding: '2px 4px', fontWeight: 'bold', fontSize: format === 'A6' ? 7 : 10 }),
    addressContent: (format) => ({ fontSize: format === 'A6' ? 8 : 11, padding: '2px 4px', lineHeight: 1.2 }),

    table: { 
        width: '100%', 
        borderCollapse: 'collapse',
        tableLayout: 'fixed',
        margin: '4px 0'
    },
    
    th: (format) => ({ 
        background: '#1e40af', 
        color: '#fff', 
        padding: format === 'A6' ? '3px 2px' : '6px 4px', 
        fontSize: format === 'A6' ? 7.5 : 10,
        fontWeight: 'bold'
    }),
    
    td: (format) => ({ 
        borderBottom: '1px solid #eee', 
        padding: format === 'A6' ? '4px 2px' : '6px 4px', 
        fontSize: format === 'A6' ? 8 : 11,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
    }),

    bottomSection: (format) => ({ 
        display: 'flex', 
        flexDirection: format === 'A6' ? 'column' : 'row',
        justifyContent: 'space-between', 
        gap: format === 'A6' ? 4 : 15,
        marginTop: 8 
    }),

    mentionLettres: (format) => ({ 
        flex: 1,
        minWidth: 0
    }),
    
    montantLettres: (format) => ({ 
        fontWeight: 'bold', 
        color: '#1e40af', 
        fontSize: format === 'A6' ? '8.5px' : '11px',
        margin: '1px 0'
    }),

    totalContainer: (format) => ({ 
        flex: format === 'A6' ? 'none' : '0 0 42%',
        width: format === 'A6' ? '38mm' : 'auto', /* Fixation rigide en millimètres pour le format A6 */
        alignSelf: format === 'A6' ? 'flex-end' : 'auto'
    }),

    totalTable: { width: '100%', borderCollapse: 'collapse' },
    totalLabel: (format) => ({ fontSize: format === 'A6' ? 8 : 11, padding: '2px 3px', textAlign: 'left' }),
    totalVal: (format) => ({ textAlign: 'right', fontSize: format === 'A6' ? 8 : 11, padding: '2px 3px', fontWeight: 'bold' }),

    finalRow: { background: '#1e40af' },
    finalLabel: (format) => ({ color: '#fff', padding: '3px 4px', fontSize: format === 'A6' ? 8.5 : 12, fontWeight: 'bold' }),
    finalVal: (format) => ({ color: '#fff', textAlign: 'right', padding: '3px 4px', fontSize: format === 'A6' ? 8.5 : 12, fontWeight: 'bold' }),
    
    typeDocument: (format) => ({ fontSize: format === 'A6' ? 8 : 10, margin: '1px 0', fontWeight: 'bold' }),
    legalInfo: (format) => ({ fontSize: format === 'A6' ? 7 : 9, lineHeight: 1.1 })
};

InvoicePrint.displayName = "InvoicePrint";
export default InvoicePrint;
