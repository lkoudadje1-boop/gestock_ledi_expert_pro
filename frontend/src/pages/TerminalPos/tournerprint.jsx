import React, { forwardRef } from 'react';
// 🛡️ IMPORTATION DU MOTEUR UNIQUE ANTI-LITIGE DE CONVERSION
import { ConversionStockService } from '../../utils/converisonstock';

/**
 * Composant TournerPrint - Version Finale Adaptée au modèle InvoicePrint
 * Formats supportés : 'A4' | 'A5' | 'A6'
 */
const TournerPrint = forwardRef((props, ref) => {
    // 🎯 RECEPTION SECURISEE DU PAYLOAD DEPUIS LA GRILLE PRINCIPALE
    const payload = props.data || {};

    const articles = payload.articles || [];
    const company = props.company || { name: payload.companyName || 'Ledi Expert Pro', logo_data: null };
    const format = payload.format || 'A5'; // Récupère 'A5' ou 'A6' depuis le sélecteur du soir
    
    const saleId = payload.saleId || 'SAL-TRANSFERT';
    const lotId = payload.lot_id || 'TOUR-000000';
    const staffName = payload.staff_name || 'Non spécifié';
    const caissierName = payload.caissierName || 'Opérateur';
    const moyenPaiement = payload.mode_reglement || 'ESPÈCES';
    const dateVente = payload.date || new Date().toISOString();

    // 🎯 IDENTIFICATION DYNAMIQUE DU MODE (MATIN OU SOIR) POUR ADAPTER L'AFFICHAGE
    const estModeSoir = moyenPaiement !== 'CHARGEMENT INITIAL' && moyenPaiement !== 'MISE À JOUR CHARGEMENT';

    // --- 🚀 FONCTION DE FORMATAGE LOGISTIQUE POUR L'IMPRESSION (GROS + DETAIL) ---
    const formaterQuantiteImpression = (pieces, item) => {
        try {
            const totalPieces = Number(pieces || 0);
            
            // 🎯 NETTOYAGE : Si la quantité totale est égale à 0, on retourne un tiret épuré
            if (totalPieces === 0) return "-";
            
            // 🎯 SECURISE L'AFFICHAGE ET FORCE LE FORMAT COMPLET "X Gros + Y Détail" (Ex: 1 CS + 0 BTS)
            const coeff = Math.max(1, Number(item.coeff || item.coefficient || (item.article_complet && item.article_complet.coefficient) || 1));
            
            if (coeff > 1) {
                const labelGros = String(item.unit_code_gros || item.unite_gros || (item.article_complet && item.article_complet.unit_code_gros) || 'CS').toUpperCase().trim();
                const labelDetail = String(item.unit_ref_detail || item.unite_detail || item.unite_reference || (item.article_complet && item.article_complet.unit_ref_detail) || 'BTS').toUpperCase().trim();
                
                const cartonsFinaux = Math.floor(totalPieces / coeff);
                const bouteillesFinelles = Math.round(totalPieces % coeff);
                
                // Si après calcul les deux valeurs tombent à 0, on met un tiret
                if (cartonsFinaux === 0 && bouteillesFinelles === 0) return "-";
                
                return `${cartonsFinaux} ${labelGros} + ${bouteillesFinelles} ${labelDetail}`;
            }

            return ConversionStockService.toExpressionTextuelle(totalPieces, item.article_complet || item);
        } catch (error) {
            console.error("Erreur Conversion Stock Impression:", error);
            return `${pieces || 0} PCS`;
        }
    };

    // --- 🛡️ VERROUILLAGE SÉCURISÉ DES MONTANTS SUR LES DONNÉES RÉELLES DU PANIER ---
    const totalGeneral = Number(payload.total || 0);

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

        const lettres = resultat.replace(/\s+/g, ' ').trim();
        if (!lettres) return `Arrêtée la présente facture à la somme de : Zéro (${nombre}) Francs CFA.`;

        const premiereLettre = lettres.substring(0, 1).toUpperCase();
        const resteDuTexte = lettres.substring(1);
        const lettresFinales = premiereLettre + resteDuTexte;
        
        return `Arrêtée la présente facture à la somme de : ${lettresFinales} (${new Intl.NumberFormat('fr-FR').format(nombre)}) Francs CFA.`;
    };

// --- 🎨 STYLE ULTRA-COMPACT ET MINI-LOGO PERFECTLY PROPORTIONED ---
    const s = {
        page: (f) => ({
            width: f === 'A6' ? '105mm' : f === 'A5' ? '148mm' : '210mm',
            maxWidth: f === 'A6' ? '105mm' : f === 'A5' ? '148mm' : '210mm',
            minHeight: f === 'A6' ? '148mm' : f === 'A5' ? '210mm' : '297mm',
            backgroundColor: '#ffffff',
            color: '#0f172a',
            fontFamily: 'Segoe UI, system-ui, sans-serif',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            fontSize: f === 'A6' ? '9px' : '10px', 
            // 🎯 AUGMENTATION : Marges intérieures horizontales plus larges (12px à gauche et à droite)
            padding: '8px 12px' 
        }),
        topHeader: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '4px',
            borderBottom: '1.5px solid #0f172a',
            paddingBottom: '2px'
        },
        // 🎯 TAILLE DISCRÈTE DU LOGO SANS ÉCRASEMENT DE LARGEUR ET CONTRAINT EN HAUTEUR
        logoContainer: {
            width: '22mm', 
            maxHeight: '10mm',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-start',
            overflow: 'hidden'
        },
        titleBlock: {
            textAlign: 'right'
        },
        mainTitle: (f) => ({
            margin: 0,
            fontSize: f === 'A6' ? '11px' : '13px',
            fontWeight: '900',
            textTransform: 'uppercase',
            color: '#1e3a8a'
        }),
        metaGrid: (f) => ({
            display: 'grid',
            gridTemplateColumns: f === 'A6' ? '1fr' : '1.2fr 1fr',
            gap: '4px',
            marginBottom: '4px',
            padding: '4px 6px',
            backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '3px'
        }),
        metaText: {
            margin: '1px 0',
            lineHeight: '1.2'
        },
        table: {
            width: '100%',
            borderCollapse: 'collapse',
            marginTop: '2px',
            marginBottom: '4px',
            tableLayout: 'fixed' // 🎯 FORCE LE RESPECT STRICT DES LARGEURS DE COLONNES PARAMÉTRÉES
        },
        
        // 🎯 RÉARRANGEMENT STRATÉGIQUE ET ÉLARGISSEMENT DES LARGEURS DE COLONNES (MATIN ET SOIR)
        colDesignation: { width: '22%' }, // Rétrécie substantiellement pour libérer de l'espace
        colPrixUnitaire: { width: '12%' },
        colQteChargee: { width: '18%' },  // Élargie pour accueillir les expressions logistiques
        colQteRetour: { width: '18%' },   // Élargie pour les expressions logistiques
        colQteVendue: { width: '18%' },   // Élargie pour les expressions logistiques
        colTotalNet: { width: '12%' },

        th: {
            backgroundColor: '#0f172a',
            color: '#ffffff',
            padding: '3px 4px', 
            fontSize: '9px',
            fontWeight: '700',
            textTransform: 'uppercase',
            border: '1px solid #0f172a'
        },
        td: {
            padding: '3px 4px', 
            border: '1px solid #cbd5e1',
            lineHeight: '1.1',
            wordBreak: 'break-word', // Empêche tout débordement de texte accidentel
            whiteSpace: 'normal'
        },
        footerRow: {
            fontWeight: 'bold',
            backgroundColor: '#f8fafc'
        },
        lettresBlock: {
            fontStyle: 'italic',
            fontSize: '9px',
            color: '#334155',
            marginTop: '2px',
            padding: '4px',
            backgroundColor: '#f1f5f9',
            borderRadius: '3px',
            borderLeft: '2px solid #1e3a8a',
            lineHeight: '1.2'
        }
    };
     const dateImpression = new Date(dateVente).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    return (
        <>
            {/* ✅ OPTIMISATION DES MARGES POUR LE RENDU IMPRESSION PAPIER EFFECTIF */}
            <style>
                {`
                    @media print {
                        @page {
                            size: ${format === 'A6' ? '105mm 148mm' : format === 'A5' ? '148mm 210mm' : '210mm 297mm'} portrait !important;
                            margin: 0 !important;
                        }

                        html, body {
                            margin: 0 !important;
                            padding: 0 !important;
                            width: 100% !important;
                            background-color: #ffffff !important;
                            -webkit-print-color-adjust: exact;
                            print-color-adjust: exact;
                        }

                        .invoice-page {
                            width: ${format === 'A6' ? '105mm' : format === 'A5' ? '148mm' : '210mm'} !important;
                            max-width: ${format === 'A6' ? '105mm' : format === 'A5' ? '148mm' : '210mm'} !important;
                            min-height: ${format === 'A6' ? '148mm' : format === 'A5' ? '210mm' : '297mm'} !important;
                            box-sizing: border-box !important;
                            /* 🎯 CORRECTION MARGES GAUCHE/DROITE : Augmentation des paddings horizontaux à l'impression (ex: 6mm ou 10mm selon format) */
                            padding: ${format === 'A6' ? '2mm 5mm' : format === 'A5' ? '4mm 6mm' : '8mm 12mm'} !important;
                            margin: 0 !important;
                            position: absolute !important;
                            top: 0 !important;
                            left: 0 !important;
                            overflow: hidden !important;
                            background-color: #ffffff !important;
                        }

                        ${format === 'A6' ? `
                        .invoice-page {
                            transform: scale(0.95) !important;
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
                            <img src={company.logo_data.startsWith('data:') || company.logo_data.startsWith('http') ? company.logo_data : `data:image/png;base64,${company.logo_data}`} style={{ width: '100%', height: 'auto', maxHeight: '10mm', objectFit: 'contain' }} alt="Logo" />
                        ) : (
                            <div style={{ fontWeight: 'bold', fontSize: '12px', color: '#1e3a8a' }}>{company.name || 'LEDI EXPERT'}</div>
                        )}
                    </div>
                    <div style={s.titleBlock}>
                        <h2 style={s.mainTitle(format)}>
                            {estModeSoir ? "FACTURE DE CLÔTURE TOURNÉE" : "BON DE CHARGEMENT INITIAL"}
                        </h2>
                        <p style={{ margin: 0, fontSize: '9px', color: '#020e1f' }}>Date : {dateImpression}</p>
                    </div>
                </div>

            {/* METADONNÉES METIER */}
                <div style={s.metaGrid(format)}>
                    <div>
                        <p style={s.metaText}><strong>N° Pièce :</strong> {saleId}</p>
                        <p style={s.metaText}><strong>N° de Lot :</strong> {lotId}</p>
                        <p style={s.metaText}><strong>Commercial :</strong> {String(staffName).toUpperCase()}</p>
                    </div>
                    <div style={{ textAlign: format === 'A6' ? 'left' : 'right' }}>
                        <p style={s.metaText}><strong>Mode Règlement :</strong> {String(moyenPaiement).toUpperCase()}</p>
                        <p style={s.metaText}><strong>Caissier / Opérateur :</strong> {caissierName}</p>
                        <p style={s.metaText}><strong>Statut :</strong> <span style={{ color: '#07110b', fontWeight: 'bold' }}>{estModeSoir ? "CLÔTURÉ / PAYÉ" : "CHARGÉ"}</span></p>
                    </div>
                </div>

                {/* TABLEAU DES LIGNES COMPILÉES DYNAMIQUE (ADAPTATIF MATIN / SOIR AVEC COLONNES ÉLARGIES) */}
                <table style={s.table}>
                    <thead>
                        <tr>
                            <th style={{ ...s.th, ...s.colDesignation, textAlign: 'left' }}>Désignation Article</th>
                            
                            {/* 🎯 APPLICATION DES PROPORTIONS ÉLARGIES POUR EMPECHER LES RETOURS À LA LIGNE DES UNITÉS LOGISTIQUES */}
                            {estModeSoir ? (
                                <>
                                    <th style={{ ...s.th, ...s.colQteChargee, textAlign: 'center' }}>Chargé</th>
                                    <th style={{ ...s.th, ...s.colQteRetour, textAlign: 'center' }}>Retour</th>
                                    <th style={{ ...s.th, ...s.colQteVendue, textAlign: 'center' }}>Vendu</th>
                                </>
                            ) : (
                                <th style={{ ...s.th, ...s.colQteChargee, textAlign: 'center' }}>Qté Chargée</th>
                            )}
                            
                            <th style={{ ...s.th, ...s.colPrixUnitaire, textAlign: 'right' }}>P.U Facture</th>
                            <th style={{ ...s.th, ...s.colTotalNet, textAlign: 'right' }}>Total Net</th>
                        </tr>
                    </thead>
                  <tbody>
                        {articles.length === 0 ? (
                            <tr>
                                <td colSpan={estModeSoir ? 6 : 4} style={{ ...s.td, textAlign: 'center', fontStyle: 'italic' }}>
                                    Aucun article répertorié.
                                </td>
                            </tr>
                        ) : (
                            articles.map((item, index) => {
                                const { coeff } = ConversionStockService.getMetadata(item.article_complet || item);
                                
                                // 🎯 CORRECTIF DU P.U : Restauration stricte du vrai prix de gros de l'article (ex: 5000 F au lieu de 250 F)
                                const prixGrosLotOriginal = Number(item.prix_affichage_tableau || item.prix_vente || (item.prix_vente_unitaire * coeff) || 0);
                                
                                // Extraction sécurisée du montant total calculé net de la ligne sans aucune multiplication parasite
                                const totalLigne = Number(item.total_ttc_net || item.totalTtcLigne || item.montant_ttc_ligne || 0);

                                return (
                                    <tr key={(item.product_id || item.id || index) + '-' + index}>
                                        <td style={{ ...s.td, fontWeight: '600', textTransform: 'uppercase', fontSize: '9px' }}>
                                            {item.nom || item.designation || item.article_name || 'Article inconnu'}
                                        </td>
                                        
                                        {/* BILAN DIFFERENTIEL DYNAMIQUE PROPORTIONNÉ */}
                                        {estModeSoir ? (
                                            <>
                                                <td style={{ ...s.td, textAlign: 'center', color: '#050b13' }}>
                                                    {formaterQuantiteImpression(item.qte_chargee_pieces || item.quantite || 0, item)}
                                                </td>
                                                <td style={{ ...s.td, textAlign: 'center', color: '#180303' }}>
                                                    {formaterQuantiteImpression(item.qte_retour_pieces || item.quantite_retour || 0, item)}
                                                </td>
                                                <td style={{ ...s.td, textAlign: 'center', fontWeight: 'bold', color: '#02091b' }}>
                                                    {formaterQuantiteImpression(item.qte_vendue_pieces || item.quantite_vendue || 0, item)}
                                                </td>
                                            </>
                                        ) : (
                                            <td style={{ ...s.td, textAlign: 'center', fontWeight: 'bold', color: '#1e3a8a' }}>
                                                {formaterQuantiteImpression(item.qte_chargee_pieces || item.quantite || 0, item)}
                                            </td>
                                        )}
                                        
                                        <td style={{ ...s.td, textAlign: 'right', fontSize: '9px' }}>
                                            {Math.round(prixGrosLotOriginal).toLocaleString('fr-FR')} F
                                        </td>
                                        <td style={{ ...s.td, textAlign: 'right', fontWeight: '700', fontSize: '9px' }}>
                                            {Math.round(totalLigne).toLocaleString('fr-FR')} F
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                    <tfoot>
                        <tr style={s.footerRow}>
                            {/* 🎯 CORRECTION INTEGRATION COLSPAN EN NOMBRE STRICT : Résout le décalage de la cellule totale */}
                            <td colSpan={estModeSoir ? 5 : 3} style={{ ...s.td, textAlign: 'right', fontWeight: '800' }}>
                                {estModeSoir ? "NET À ENCAISSER :" : "VALEUR DU CHARGEMENT :"}
                            </td>
                            <td style={{ ...s.td, textAlign: 'right', fontWeight: '900', color: '#05110a', fontSize: '11px' }}>
                                {Math.round(totalGeneral).toLocaleString('fr-FR')} F
                            </td>
                        </tr>
                    </tfoot>
                </table>

              {/* 📊 🎯 COMPILATION ET RENDU DES 3 RÉSUMÉS COMPTABLES FLUX : CHARGÉ, RETOUR, VENDU */}
                {(() => {
                    const cumuls = { charge: {}, retour: {}, vendu: {} };

                    articles.forEach(item => {
                        const coeff = Math.max(1, Number(item.coeff || item.coefficient || 1));
                        
                        const labelGros = String(item.unit_code_gros || item.unite_gros || 'CS').toUpperCase().trim();
                        const labelDetail = String(item.unit_ref_detail || item.unite_detail || 'BTS').toUpperCase().trim();
                        const cleCouple = `${labelGros}-${labelDetail}`;

                        const pCharge = Number(item.qte_chargee_pieces || item.quantite || 0);
                        const pRetour = Number(item.qte_retour_pieces || item.quantite_retour || 0);
                        const pVendu  = Number(item.qte_vendue_pieces || item.quantite_vendue || 0);

                        if (!cumuls.charge[cleCouple]) cumuls.charge[cleCouple] = { p: 0, c: coeff, g: labelGros, d: labelDetail };
                        if (!cumuls.retour[cleCouple]) cumuls.retour[cleCouple] = { p: 0, c: coeff, g: labelGros, d: labelDetail };
                        if (!cumuls.vendu[cleCouple])  cumuls.vendu[cleCouple]  = { p: 0, c: coeff, g: labelGros, d: labelDetail };

                        cumuls.charge[cleCouple].p += pCharge;
                        cumuls.retour[cleCouple].p += pRetour;
                        cumuls.vendu[cleCouple].p  += pVendu;
                    });

                    const genererTexteLigne = (dictionnaire) => {
                        const fragments = Object.values(dictionnaire)
                            .map(group => {
                                // 🎯 NETTOYAGE : Si le cumul global de pièces est à 0, on renvoie une chaîne vide pour ce groupe
                                if (group.p === 0) return '';
                                
                                const cartons = Math.floor(group.p / group.c);
                                const bouteilles = Math.round(group.p % group.c);
                                return group.c > 1 ? `${cartons} ${group.g} + ${bouteilles} ${group.d}` : `${bouteilles} ${group.d}`;
                            })
                            .filter(texte => texte !== ''); // On élimine les entrées vides

                        // 🎯 REPLI DE SÉCURITÉ : Si toutes les entrées sont à 0, on affiche un tiret épuré unique
                        return fragments.length > 0 ? fragments.join('  |  ') : '-';
                    };

                    return (
                        <div style={{ 
                            marginTop: '4px', 
                            padding: '5px 6px', 
                            borderTop: '1px dashed #000', 
                            borderBottom: '1px dashed #000',
                            backgroundColor: '#f8fafc',
                            fontSize: '9px',
                            lineHeight: '1.35'
                        }}>
                            <div style={{ fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '3px', fontSize: '9px', color: '#1e293b', letterSpacing: '0.3px' }}>
                                Résumé Global des Flux de Quantités :
                            </div>
                            
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontFamily: 'monospace', fontSize: '9.5px', fontWeight: 'bold' }}>
                                <div>• TOTAL CHARGÉ : <span style={{ color: '#1e3a8a' }}>{genererTexteLigne(cumuls.charge)}</span></div>
                                {estModeSoir && (
                                    <>
                                        <div>• TOTAL RETOUR  : <span style={{ color: '#b91c1c' }}>{genererTexteLigne(cumuls.retour)}</span></div>
                                        <div style={{ borderTop: '1px dotted #cbd5e1', paddingTop: '1px', marginTop: '1px' }}>
                                            • TOTAL VENDU   : <span style={{ color: '#16a34a' }}>{genererTexteLigne(cumuls.vendu)}</span>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    );
                })()}

                {/* ARRÊT DE LA PRÉSENTE FACTURE EN TOUTES LETTRES */}
                <div style={s.lettresBlock}>
                    {formaterMontantEnLettres(totalGeneral)}
                </div>

                {/* ZONE SIGNATURE MINIATURE SANS DÉBORDEMENT DE PAGE */}
                <div style={{ marginTop: '6px', display: 'flex', justifyContent: 'space-between', fontSize: '8px', opacity: 0.85 }}>
                    <p style={{ margin: 0, textDecoration: 'underline' }}>Visa Caissier / Opérateur</p>
                    <p style={{ margin: 0, textDecoration: 'underline' }}>Visa Agent Commercial</p>
                </div>
            </div>
        </>
    );
});

TournerPrint.displayName = 'TournerPrint';
export default TournerPrint;
