import React, { forwardRef } from 'react';
// 📦 IMPORTATION ALIGNÉE SUR LE COMPOSANT ET L'ORTHOGRAPHE RÉELLE DU FICHIER
import { ConversionStockService } from '../../utils/converisonstock';

/**
 * Composant ProvisoirPrinttt - Version Finale Fluide A5 avec Calculs et Liaisons Corrigés
 * Adapté pour basculer automatiquement en Facture Finale Encaissée
 */
const ProvisoirPrinttt = forwardRef((props, ref) => {
    const {
        panier = [],
        venteInfo = {},
        company = {}
    } = props;

    // --- SÉCURISATION ET CONDENSATION DES DONNÉES ---
    const safeItems = Array.isArray(panier) ? panier : [];
    const format = 'A5';

    // --- 🚀 FONCTION DE FORMATAGE LOGISTIQUE INVERSE SÉCURISÉE (SANS LES ZÉROS DANS LE TABLEAU) ---
    const formaterQuantiteImpression = (qteSaisie, item) => {
        try {
            const totalPieces = Number(qteSaisie || 0);
            
            // Récupération des métadonnées pour analyser le coefficient de colisage
            const metadata = typeof ConversionStockService?.getMetadata === 'function'
                ? ConversionStockService.getMetadata(item.article_complet || item)
                : { coeff: Math.max(1, Number(item.coefficient || item.unit_coefficient || item.coeff || 1)), codeGros: String(item.unit_code_gros || item.unite_gros || 'CS'), refDetail: String(item.unit_ref_detail || item.unite_detail || 'BTS') };
                
            const coeff = Math.max(1, Number(metadata.coeff || 1));

            if (coeff > 1) {
                const labelGros = String(metadata.codeGros || 'CS').toUpperCase().trim();
                const labelDetail = String(metadata.refDetail || 'BTS').toUpperCase().trim();
                
                const cartonsFinaux = Math.floor(totalPieces / coeff);
                const bouteillesFinelles = Math.round(totalPieces % coeff);
                
                // 🎯 RECTIFICATION COMPTABLE VISUELLE ÉPURÉE POUR LE TABLEAU DES LIGNES
                if (cartonsFinaux === 0) {
                    return `${bouteillesFinelles} ${labelDetail}`; // Ex: "2 BTS" au lieu de "0 CS + 2 BTS"
                }
                if (bouteillesFinelles === 0) {
                    return `${cartonsFinaux} ${labelGros}`; // Ex: "1 CS" au lieu de "1 CS + 0 BTS"
                }
                return `${cartonsFinaux} ${labelGros} + ${bouteillesFinelles} ${labelDetail}`;
            }

            return ConversionStockService.toExpressionTextuelle(totalPieces, item.article_complet || item);
        } catch (error) {
            console.error("Erreur formatage impression logistique, repli sur fallback:", error);
            
            // 2. Fallback de sécurité ultra-blindé si le service échoue
            const libGros = item.libelle_gros_final || item.unite_code || item.unit_code_gros || "";
            const libDetail = item.libelle_detail_final || item.unite_reference || item.unit_ref_detail || "U";
            
            const gros = Number(item.saisie_gros || 0);
            const detail = Number(item.saisie_detail || 0);

            if (gros > 0 || detail > 0) {
                let texte = "";
                if (gros > 0 && detail > 0) return `${gros} ${libGros} + ${detail} ${libDetail}`;
                if (gros > 0) texte += `${gros} ${libGros} `;
                if (detail > 0) texte += `${detail} ${libDetail}`;
                return texte.trim();
            }

            const libelleUnite = item.unite_reference || item.unite_code || "U";
            return `${Number(qteSaisie || 0)} ${libelleUnite}`;
        }
    };


    // --- 🛡️ VERROUILLAGE SÉCURISÉ DES MONTANTS SUR LES DONNÉES RÉELLES DU PANIER ---
    const sousTotalHTNet = safeItems.reduce((acc, cur) => {
        const montantLigneFerme = Number(cur.montant_ttc_ligne || cur.total_ttc || cur.montant_ht || 0);
        return acc + montantLigneFerme;
    }, 0);

    const totalTaxe = safeItems.reduce((acc, cur) => acc + (Number(cur.taxe_montant) || 0), 0);

    // 🔒 ANCRE DE SÉCURITÉ : Le Total TTC global devient strictement égal à la somme réelle des lignes par palier
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

        const lettres = resultat.replace(/\s+/g, ' ').trim();
        if (!lettres) return `Arrêtée la présente facture à la somme de : Zéro (${nombre}) Francs CFA.`;

        const premiereLettre = lettres.substring(0, 1).toUpperCase();
        const resteDuTexte = lettres.substring(1);
        const lettresFinales = premiereLettre + resteDuTexte;
        
        return `Arrêtée la présente facture à la somme de : ${lettresFinales} (${new Intl.NumberFormat('fr-FR').format(nombre)}) Francs CFA.`;
    };

    // Détection et formatage automatique de la chaîne Base64 pour le logo
    const getLogoSrc = () => {
        const data = company.logo_data || company.logo || company.logo_url;
        if (!data) return null;
        if (data.startsWith('data:') || data.startsWith('http') || data.startsWith('blob:')) {
            return data;
        }
        return `data:image/png;base64,${data}`;
    };

    const logoSrc = getLogoSrc();


      return (
        <>
            {/* ✅ MARGES DE SÉCURITÉ AJUSTÉES POUR ÉVITER LES COUPURES D'IMPRIMANTE */}
            <style>
                {`
                    @media print {
                        @page {
                            size: A5 portrait !important;
                            margin: 0 !important;
                        }

                        html, body {
                            margin: 0 !important;
                            padding: 0 !important;
                            width: 100% !important;
                            -webkit-print-color-adjust: exact;
                            print-color-adjust: exact;
                        }

                        /* 🎯 MARGES DE SÉCURITÉ OPTIMALES (6mm Haut/Bas et 8mm Gauche/Droite) */
                        .invoice-page {
                            width: 148mm !important;
                            max-width: 148mm !important;
                            min-height: 210mm !important;
                            box-sizing: border-box !important;
                            padding: 6mm 8mm !important; 
                            margin: 0 auto !important;
                            overflow: hidden !important;
                            background: #fff !important;
                        }
                    }
                `}
            </style>

            <div
                ref={ref}
                className="invoice-page"
                style={{ ...s.page(format), fontSize: '9px' }}
            >

                {/* HEADER ELEMENT COMPOSÉ */}
                <div style={{ ...s.topHeader, marginBottom: '4px' }}>
                    <div style={s.logoContainer}>
                        {logoSrc ? (
                            <img 
                                src={logoSrc} 
                                alt="Logo" 
                                style={{ ...s.logo(format), maxHeight: '10mm', objectFit: 'contain' }}
                                onLoad={() => window.dispatchEvent(new Event('resize'))}
                            />
                        ) : (
                            <div style={{ ...s.logoPlaceholder(format), width: '28px', height: '28px', fontSize: '11px' }}>
                                {company.name?.charAt(0) || company.nom?.charAt(0) || 'L'}
                            </div>
                        )}
                    </div>


                    <div style={s.titleContainer}>
                        <h1 style={{ ...s.mainTitle(format), fontSize: '13px' }}>
                            {venteInfo.est_definitive ? "FACTURE DE VENTE" : "FACTURE PROVISOIRE"}
                        </h1>
                        {!venteInfo.est_definitive && (
                            <div style={{ ...s.distinctionBadge(format), fontSize: '7.5px' }}>PROVISOIRE</div>
                        )}
                    </div>
                </div>

                {/* INFOS SOCIÉTÉ & VENDEUR */}
                <div style={{ ...s.infoGrid(format), marginBottom: '4px' }}>
                    <div style={s.companyContact}>
                        <h3 style={{ ...s.blueText(format), fontSize: '10px', marginBottom: '1px' }}>{company.name || company.nom || "LEDI EXPERT PRO"}</h3>
                        <p style={{ ...s.textSm(format), fontSize: '8.5px', margin: '1px 0' }}>{company.address || company.adresse || "Adresse non renseignée"}</p>
                        <p style={{ ...s.textSm(format), fontSize: '8.5px', margin: '1px 0' }}>Tél: {company.phone || company.telephone || "Tél: N/A"}</p>
                        <p style={{ ...s.textSm(format), fontSize: '8.5px', margin: '1px 0' }}>Email: {company.email || "Email: N/A"}</p>
                        
                        {/* ✅ ALIGNEMENT VENDEUR/SERVEUR DIRECTEMENT LIÉ À VOTRE STRATEGIE DE CAPTURE */}
                        {venteInfo.staff_name_snap && venteInfo.staff_name_snap !== 'Inconnu' ? (
                            <p style={{ ...s.textSm(format), fontSize: '8.5px', marginTop: '1px', fontStyle: 'italic', fontWeight: 'bold' }}>
                                Vendeur: {venteInfo.staff_name_snap}
                            </p>
                        ) : (
                            (venteInfo.vendeur || venteInfo.nom_vendeur || venteInfo.user || venteInfo.caissier) && (
                                <p style={{ ...s.textSm(format), fontSize: '8.5px', marginTop: '1px', fontStyle: 'italic', fontWeight: 'bold' }}>
                                    Vendeur: {venteInfo.vendeur || venteInfo.nom_vendeur || venteInfo.user || venteInfo.caissier}
                                </p>
                            )
                        )}
                    </div>
                    <div style={s.invoiceMeta}>
                        <div style={{ ...s.metaBox(format), width: '55px' }}>
                            <div style={{ ...s.metaHeader(format), fontSize: '8px', padding: '1px 0' }}>N°</div>
                            <div style={{ ...s.metaContent(format), fontSize: '8px', padding: '1px 0' }}>{venteInfo.provisoir_no || venteInfo.facture_no || venteInfo.numero || venteInfo.reference || venteInfo.lot_id || '---'}</div>
                        </div>
                        <div style={{ ...s.metaBox(format), width: '60px' }}>
                            <div style={{ ...s.metaHeader(format), fontSize: '8px', padding: '1px 0' }}>DATE</div>
                            <div style={{ ...s.metaContent(format), fontSize: '8px', padding: '1px 0' }}>
                                {venteInfo.date ? new Date(venteInfo.date).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR')}
                            </div>
                        </div>
                    </div>
                </div>


{/* CLIENT */}
                <div style={s.clientGrid(format)}>
                    <div style={s.addressBlock}>
                        <div style={s.addressTitle(format)}>FACTURE POUR :</div>
                        <div style={s.addressContent(format)}>
                            <p style={{ margin: '2px 0' }}><strong>{venteInfo.client_nom || venteInfo.client || "CLIENT AU COMPTANT"}</strong></p>
                            {/* ✅ AFFICHAGE NETTOYÉ DE LA TABLE ASSIGNÉE */}
                            <p style={{ margin: '2px 0' }}>
                                {venteInfo.table_name_snap ? `Table: ${venteInfo.table_name_snap}` : (venteInfo.client_adresse || "Table: Non assignée")}
                            </p>
                            {venteInfo.client_phone && <p style={{ margin: '2px 0' }}>{venteInfo.client_phone}</p>}
                        </div>
                    </div>

                    <div style={s.addressBlock}>
                        <div style={s.addressTitle(format)}>MODE DE PAIEMENT</div>
                        <div style={s.addressContent(format)}>
                            <p style={{ margin: '2px 0' }}><strong>{venteInfo.mode_paiement || venteInfo.paiement || "Espèces"}</strong></p>
                            <p style={{ margin: '2px 0' }}>Net à réception</p>
                        </div>
                    </div>
                </div>

                            {/* TABLE D'IMPRESSION AVEC CONFIGURATION DE LARGEUR CHIRURGICALE POUR LA QTÉ */}
                <table style={s.table}>
                    <thead>
                        <tr>
                            <th style={{ ...s.th(format), width: '33%', textAlign: 'left' }}>DESCRIPTION</th>
                            {/* 🚀 EXPANSION CONSOLIDÉE : Passage de 12% à 22% pour empêcher le texte de conversion d'être tronqué en A5 */}
                            <th style={{ ...s.th(format), width: '22%', textAlign: 'center' }}>QTÉ</th>
                            <th style={{ ...s.th(format), width: '14%', textAlign: 'right' }}>P.U</th>
                            <th style={{ ...s.th(format), width: '13%', textAlign: 'right' }}>REMISE</th>
                            <th style={{ ...s.th(format), width: '18%', textAlign: 'right' }}>MONTANT</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(() => {
                            // 🔒 FILTRE ANTI-DOUBLONS SUR LES ID DE PRODUITS REÇUS EN DOUBLE DU COMPOSANT PARENT
                            const vus = new Set();
                            const itemsUniques = safeItems.filter(item => {
                                const cleUnique = item.product_id || item.id || item.nom_article_snap;
                                if (vus.has(cleUnique)) return false;
                                vus.add(cleUnique);
                                return true;
                            });

                           return itemsUniques.map((item, index) => {
                                const quantityRaw = item.quantite !== undefined ? item.quantite : (item.qty || 0);
                                
                                const pu = Number(item.prix_vente_unitaire || item.prix_unitaire || item.prix || 0);
                                const rem = Number(item.remise_montant || item.remise || 0);
                                const net = Number(item.montant_ttc_ligne || item.total_ttc || item.montant_ht || 0);

                                return (
                                    <tr key={item.product_id || item.id || index}>
                                        {/* 1. DÉSIGNATION */}
                                        <td style={{ ...s.td(format), textAlign: 'left' }}>
                                            {item.nom_article_snap || item.designation || item.nom}
                                        </td>
                                        
                                        {/* 2. QUANTITÉ AU DÉTAIL ENTIÈRE PROPRE ÉPUREE (Ex: "1 BTS" ou "12 BTS" au lieu de 0 CS + 1 BTS) */}
                                        <td style={{ ...s.td(format), textAlign: 'center', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                                            {formaterQuantiteImpression(quantityRaw, item)}
                                        </td>
                                        
                                        {/* 3. P.U ALIGNÉ SANS ARRONDI DESTRUCTEUR */}
                                        <td style={{ ...s.td(format), textAlign: 'right', fontFamily: 'monospace' }}>
                                            {pu.toFixed(2)}
                                        </td>
                                        
                                        {/* 4. REMISE ACCORDÉE */}
                                        <td style={{ ...s.td(format), textAlign: 'right', color: '#ef4444', fontFamily: 'monospace' }}>
                                            {rem > 0 ? `-${rem.toFixed(2)}` : '-'}
                                        </td>
                                        
                                        {/* 5. MONTANT DE LIGNE RIGIDE COMPTABLE REÇU DU PRICING */}
                                        <td style={{ ...s.td(format), textAlign: 'right', fontWeight: 'bold', fontFamily: 'monospace' }}>
                                            {net.toFixed(2)} F
                                        </td>
                                    </tr>
                                );
                            });
                        })()}
                    </tbody>
                </table>

                            {/* TOTAL SECTION - SANS INCOHÉRENCE DE CALCUL PAR PALIER */}
                <div style={{ ...s.bottomSection(format), marginTop: '3px', gap: '6px' }}>
                    {/* 🚀 COMPRESSION NETTE : On supprime la mention "Arrêtée à la somme de :" car la fonction la génère déjà */}
                    <div style={s.mentionLettres(format)}>
                        <p style={{ ...s.montantLettres(format), fontStyle: 'italic', lineHeight: 1.2, fontSize: '8px', margin: 0 }}>
                            {formaterMontantEnLettres(totalGeneral)}
                        </p>
                    </div>


           <div style={s.totalContainer(format)}>
                        <table style={s.totalTable}>
                            <tbody>
                                <tr>
                                    <td style={{ ...s.totalLabel(format), padding: '1px 2px', fontSize: '8px' }}>TOTAL HT</td>
                                    <td style={{ ...s.totalVal(format), padding: '1px 2px', fontSize: '8px', fontFamily: 'monospace' }}>
                                        {/* ✅ BALANCE ARITHMÉTIQUE SÉCURISÉE À 2 DÉCIMALES */}
                                        {Number(sousTotalHTNet - totalTaxe).toFixed(2)} F
                                    </td>
                                </tr>
                                <tr>
                                    <td style={{ ...s.totalLabel(format), padding: '1px 2px', fontSize: '8px' }}>TAXES</td>
                                    <td style={{ ...s.totalVal(format), padding: '1px 2px', fontSize: '8px', fontFamily: 'monospace' }}>
                                        + {Number(totalTaxe).toFixed(2)} F
                                    </td>
                                </tr>

                                <tr style={s.finalRow}>
                                    <td style={{ ...s.finalLabel(format), padding: '1.5px 2px', fontSize: '8.5px' }}>TOTAL TTC</td>
                                    <td style={{ ...s.finalVal(format), padding: '1.5px 2px', fontSize: '8.5px', fontWeight: 'bold', fontFamily: 'monospace' }}>
                                        {Number(totalGeneral).toFixed(2)} FCFA
                                    </td>
                                </tr>
                                {/* 🔥 AFFICHAGE DYNAMIQUE DU MONTANT REÇU ET DU RELIQUAT D'ENCAISSEMENT EN COLONNES RIGIDES */}
                                {venteInfo.est_definitive && (
                                    <>
                                        <tr>
                                            <td style={{ ...s.totalLabel(format), padding: '1px 2px', paddingTop: '2px', fontSize: '8px' }}>MONTANT REÇU</td>
                                            <td style={{ ...s.totalVal(format), padding: '1px 2px', paddingTop: '2px', fontSize: '8px', fontWeight: 'bold', fontFamily: 'monospace' }}>
                                                {Number(venteInfo.montant_recu || 0).toFixed(2)} F
                                            </td>
                                        </tr>
                                        <tr>
                                            <td style={{ ...s.totalLabel(format), padding: '1px 2px', color: '#1e40af', fontSize: '8px', fontWeight: '500' }}>MONNAIE RENDUE</td>
                                            <td style={{ ...s.totalVal(format), padding: '1px 2px', color: '#1e40af', fontSize: '8px', fontWeight: 'bold', fontFamily: 'monospace' }}>
                                                {Number(venteInfo.reliquat || 0).toFixed(2)} F
                                            </td>
                                        </tr>
                                    </>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* 📊 🎯 COMPILATION COMPTABLE : UNIQUE LIGNE DE RÉSUMÉ GLOBAL POUR LA FACTURE CLIENT */}
                {(() => {
                    const cumulsFacture = {};

                    safeItems.forEach(item => {
                        const coeff = Math.max(1, Number(item.coeff || item.coefficient || (item.article_complet && item.article_complet.coefficient) || 1));
                        
                        const labelGros = String(item.unit_code_gros || item.unite_gros || (item.article_complet && item.article_complet.unit_code_gros) || 'CS').toUpperCase().trim();
                        const labelDetail = String(item.unit_ref_detail || item.unite_detail || item.unite_reference || (item.article_complet && item.article_complet.unit_ref_detail) || 'BTS').toUpperCase().trim();
                        const cleCouple = `${labelGros}-${labelDetail}`;

                        // On extrait uniquement la quantité vendue finale facturée au client
                        const pVendu = Number(item.qte_vendue_pieces || item.quantite_vendue || item.quantite || item.qty || 0);

                        if (!cumulsFacture[cleCouple]) {
                            cumulsFacture[cleCouple] = { p: 0, c: coeff, g: labelGros, d: labelDetail };
                        }
                        cumulsFacture[cleCouple].p += pVendu;
                    });

                    // Formatage strict complet exigeant les zéros pour la logistique (Ex: 0 CS + 3 BTS)
                    const fragments = Object.values(cumulsFacture).map(group => {
                        const cartons = Math.floor(group.p / group.c);
                        const bouteilles = Math.round(group.p % group.c);
                        return group.c > 1 ? `${cartons} ${group.g} + ${bouteilles} ${group.d}` : `${bouteilles} ${group.d}`;
                    });

                    const texteFinalAffiche = fragments.length > 0 ? fragments.join('  |  ') : '0';

                    return (
                        <div style={{ 
                            marginTop: '6px', 
                            padding: '4px 6px', 
                            borderTop: '1px dashed #000', 
                            borderBottom: '1px dashed #000',
                            backgroundColor: '#f8fafc',
                            fontSize: '8.5px',
                            lineHeight: '1.3'
                        }}>
                            <div style={{ fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '2px', fontSize: '8.5px', color: '#1e293b' }}>
                                Résumé Global des Quantités Facturées :
                            </div>
                            <div style={{ fontFamily: 'monospace', fontWeight: 'bold', fontSize: '9.5px', color: '#1e3a8a' }}>
                                • TOTAL FACTURÉ : <span>{texteFinalAffiche}</span>
                            </div>
                        </div>
                    );
                })()}

                {/* FOOTER - MENTIONS LÉGALES EXTRACTÉES ET REPOUSSÉES DE FAÇON RIGIDE TOUT EN BAS */}
                <div style={{ ...s.footer(format), marginTop: 'auto', borderTop: '1px solid #eee', paddingTop: '3px', paddingBottom: '2px' }}>
                    <p style={{ ...s.typeDocument(format), margin: '0 0 1px 0', fontSize: '8px', fontWeight: 'bold' }}>
                        {venteInfo.est_definitive ? "--- FACTURE DE VENTE ---" : "--- FACTURE PROVISOIRE ---"}
                    </p>
                    <div style={{ ...s.legalInfo(format), fontSize: '7px', lineHeight: 1.1 }}>
                        <p style={{ margin: '1px 0' }}><strong>{company.name || company.nom || "LEDI EXPERT PRO"}</strong> — {company.address || company.adresse || ""}</p>
                        <p style={{ margin: '1px 0' }}>Tél: {company.phone || company.telephone || ""}</p>
                        <p style={{ fontSize: '6.5px', opacity: 0.4, margin: '1px 0' }}>
                            ERP LEDI EXPERT PRO - {new Date().getFullYear()}
                        </p>
                    </div>
                </div>

            </div>
        </>
    );
});

/* ================= COMPOSITIONS DE STYLES FLUIDES A5 ================= */
const s = {
    page: (format) => ({
        fontFamily: '"Segoe UI", sans-serif', color: '#1e293b', background: '#fff',
        position: 'relative', boxSizing: 'border-box', width: '100%'  }),
    footer: (format) => ({
        position: 'absolute',
        bottom: '15mm', left: '10mm', right: '10mm',
        textAlign: 'center', borderTop: '1px solid #eee', paddingTop: '8px' }),
    topHeader: { 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: 15  },
    logoContainer: { maxWidth: '35%' },
    logo: (format) => ({ maxHeight: 50, width: 'auto' }),
    logoPlaceholder: (format) => ({ 
        width: 45, height: 45, background: '#1e40af', 
        color: '#fff', display: 'flex', 
        alignItems: 'center', justifyContent: 'center',
        fontWeight: 'bold', fontSize: 16 }),
    titleContainer: { textAlign: 'right' },
    mainTitle: (format) => ({ fontSize: 22, color: '#1e40af', margin: 0, fontWeight: 'bold' }),
    distinctionBadge: (format) => ({ fontSize: 11, letterSpacing: 2, color: '#666', margin: 0 }),
    infoGrid: (format) => ({ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'flex-start', gap: 15, marginBottom: 15  }),
    companyContact: { flex: 1, minWidth: 0 },
    blueText: (format) => ({ color: '#1e40af', margin: '0 0 4px 0', fontSize: 13, fontWeight: 'bold' }),
    textSm: (format) => ({ fontSize: 11, margin: '2px 0' }),
    invoiceMeta: { display: 'flex', gap: 6, shrink: 0 },
    metaBox: (format) => ({ width: 85 }),
    metaHeader: (format) => ({ background: '#1e40af', color: '#fff', fontSize: 10, textAlign: 'center', padding: '3px 0', fontWeight: 'bold' }),
    metaContent: (format) => ({ border: '1px solid #ccc', textAlign: 'center', fontSize: 10, padding: '3px 0' }),
    clientGrid: (format) => ({ 
        display: 'flex', 
        gap: 12, 
        marginBottom: 15 
    }),
    addressBlock: { flex: 1, border: '1px solid #e2e8f0', borderRadius: 4, overflow: 'hidden', minWidth: 0 },
    addressTitle: (format) => ({ background: '#f1f5f9', padding: '4px 6px', fontWeight: 'bold', fontSize: 10 }),
    addressContent: (format) => ({ fontSize: 11, padding: '4px 6px', lineHeight: 1.3 }),
    table: { 
        width: '100%', 
        borderCollapse: 'collapse',
        tableLayout: 'fixed', margin: '8px 0' },
    th: (format) => ({ 
        background: '#1e40af', 
        color: '#fff',   padding: '6px 5px', 
        fontSize: 10, fontWeight: 'bold' }),
    td: (format) => ({ 
        borderBottom: '1px solid #eee',   padding: '6px 5px', 
        fontSize: 11, whiteSpace: 'nowrap',
        overflow: 'hidden', textOverflow: 'ellipsis' }),
    bottomSection: (format) => ({ 
        display: 'flex', 
        flexDirection: 'row', justifyContent: 'space-between', 
        gap: 20, marginTop: 15  }),
    mentionLettres: (format) => ({ 
        flex: 1,
        minWidth: 0  }),
    montantLettres: (format) => ({ 
        fontWeight: 'bold', 
        color: '#1e40af', 
        fontSize: '11px',
        margin: '2px 0'  }),
    totalContainer: (format) => ({ 
        flex: '0 0 45%',
        width: 'auto' }),
    totalTable: { width: '100%', borderCollapse: 'collapse' },
    totalLabel: (format) => ({ fontSize: 11, padding: '3px 4px', textAlign: 'left' }),
    totalVal: (format) => ({ textAlign: 'right', fontSize: 11, padding: '3px 4px', fontWeight: 'bold' }),
    finalRow: { background: '#1e40af' },
    finalLabel: (format) => ({ color: '#fff', padding: '5px 6px', fontSize: 12, fontWeight: 'bold' }),
    finalVal: (format) => ({ color: '#fff', textAlign: 'right', padding: '5px 6px', fontSize: 12, fontWeight: 'bold' }),
    typeDocument: (format) => ({ fontSize: 10, margin: '2px 0', fontWeight: 'bold' }),
    legalInfo: (format) => ({ fontSize: 9, lineHeight: 1.2 })
};

ProvisoirPrinttt.displayName = 'ProvisoirPrinttt';
export default ProvisoirPrinttt;
