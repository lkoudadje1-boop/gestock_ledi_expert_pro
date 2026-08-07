import React, { forwardRef } from 'react';
// 📦 IMPORTATION ALIGNÉE SUR LE COMPOSANT ET L'ORTHOGRAPHE RÉELLE DU FICHIER
import { ConversionStockService } from '../../utils/converisonstock';

/**
 * Composant ProvisoirPrintt - Version Finale Condensée A5
 * Adapté pour basculer automatiquement en Facture Finale Encaissée sans bug de NaN
 */
const ProvisoirPrintt = forwardRef((props, ref) => {
    const {
        panier = [],
        venteInfo = {},
        company = {},
        // 🎯 INJECTION DU TABLEAU RECAPITULATIF DES UNITÉS DEPUIS LA PAGE PARENTE
        recapUnites = []
    } = props;

    // --- SÉCURISATION ET COMPACTION DES DONNÉES ENTRANTES ---
    const safeItems = Array.isArray(panier) ? panier : [];
    const format = 'A5';

    // --- 🚀 MOTEUR DE FORMATAGE LOGISTIQUE DOUBLE COMPATIBILITÉ AVEC UNITÉ DE GROS FORCÉE (ANTI-NaN) ---
    const formaterQuantiteImpression = (qteSaisie, item) => {
        if (!item) return `${qteSaisie || 0} U`;

        // Extraction précise des libellés configurés pour l'article
        const libGros = item.unite_libelle_snap || item.libelle_gros_final || item.unite_code || item.unit_code_gros || "CS";

        // 🎯 DISPOSITIF DE SÉCURITÉ CRITIQUE : Si la valeur est déjà du texte formaté valide venant de la BDD
        const chaineBrute = String(qteSaisie || '').trim();
        if (chaineBrute.match(/[A-Za-z]/) && !chaineBrute.toLowerCase().includes('nan')) {
            // Si la chaîne textuelle brute oublie l'unité de gros (ex: "3 BTS"), on force le "0 Gros +"
            if (!chaineBrute.includes('+') && !chaineBrute.includes(libGros)) {
                return `0 ${libGros} + ${chaineBrute}`;
            }
            return chaineBrute;
        }

        // Si le panier contient l'expression pré-calculée du moteur centralisé
        if (item.expression_logistique && !String(item.expression_logistique).toLowerCase().includes('nan')) {
            let expr = String(item.expression_logistique).trim();
            if (!expr.includes('+') && !expr.includes(libGros)) {
                return `0 ${libGros} + ${expr}`;
            }
            return expr;
        }

        // 🎯 EXTRACTION SÉCURISÉE DES CHIFFRES PURS POUR LE CONVERTISSEUR (Balaye les restes de NaN)
        const nettoye = chaineBrute.replace(/[^\d.]/g, '');
        let qteNumeriquePure = Math.abs(parseFloat(nettoye));

        if (isNaN(qteNumeriquePure)) {
            // Recalcul arithmétique de secours si l'envoi de la quantité est totalement corrompu
            const pu = Number(item.prix_vente_unitaire || item.prix_unitaire || item.prix || 0);
            const net = Number(item.montant_ttc_ligne || item.total_ttc || item.montant_ht || 0);
            qteNumeriquePure = pu > 0 ? Math.round(net / pu) : Math.abs(Number(item.quantite_vendue) || Number(item.qty) || 0);
        }

        try {
            const resultatExpressive = ConversionStockService.toExpressionTextuelle(qtePieces, item.article_complet || item);
            // Si le décompte analytique oublie l'unité supérieure, on force l'alignement
            if (resultatExpressive && !resultatExpressive.includes(libGros)) {
                return `0 ${libGros} + ${resultatExpressive.trim()}`;
            }
            return resultatExpressive;
        } catch (error) {
            console.error("Erreur de secours impression logistique :", error);
            const libelleUnite = item.unite_reference || item.unite_snap || item.libelle_detail_final || item.unite_libelle || "BTS";
            return `0 ${libGros} + ${qteNumeriquePure} ${libelleUnite}`;
        }
    };


    // --- 🛡️ VERROUILLAGE SÉCURISÉ DES MONTANTS SUR LES DONNÉES RÉELLES DU PANIER ---
    const sousTotalHTNet = safeItems.reduce((acc, cur) => {
        const montantLigneFerme = Number(cur.montant_ttc_ligne || cur.total_ttc || cur.montant_ht || 0);
        return acc + (isNaN(montantLigneFerme) ? 0 : montantLigneFerme);
    }, 0);

    const totalTaxe = safeItems.reduce((acc, cur) => {
        const t = Number(cur.taxe_montant || 0);
        return acc + (isNaN(t) ? 0 : t);
    }, 0);

    // 🔒 ANCRE DE SÉCURITÉ COMPTABLE
    const totalGeneral = sousTotalHTNet;

     // ==============================================================================
    // 💎 MOTEUR ALGORITHMIQUE DE CONVERSION NUMÉRIQUE EN TOUTES LETTRES REDUIT
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

    // Détection et formatage automatique de la chaîne Base64 pour le logo discret
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
            {/* ✅ FORCE LA COMPRESSION ET COMPACTE LE CONTENU DE GAUCHE À DROITE */}
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

                        /* Réduction drastique du padding global pour optimiser la hauteur utile */
                        .invoice-page {
                            width: 148mm !important;
                            max-width: 148mm !important;
                            min-height: 210mm !important;
                            box-sizing: border-box !important;
                            padding: 4mm 5mm !important;
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
                style={s.page(format)}
            >

                {/* HEADER ELEMENT COMPOSÉ */}
                <div style={s.topHeader}>
                    <div style={s.logoContainer}>
                        {logoSrc ? (
                            <img 
                                src={logoSrc} 
                                alt="Logo" 
                                style={{ ...s.logo(format), maxHeight: '10mm', objectFit: 'contain' }} 
                                onLoad={() => window.dispatchEvent(new Event('resize'))}
                            />
                        ) : (
                            <div style={s.logoPlaceholder(format)}>
                                {company.name?.charAt(0) || company.nom?.charAt(0) || 'L'}
                            </div>
                        )}
                    </div>

                    <div style={s.titleContainer}>
                        <h1 style={s.mainTitle(format)}>
                            {venteInfo.est_definitive ? "FACTURE DE VENTE" : "FACTURE PROVISOIRE"}
                        </h1>
                        {!venteInfo.est_definitive && (
                            <div style={s.distinctionBadge(format)}>PROVISOIRE</div>
                        )}
                    </div>
                </div>

                {/* INFOS SOCIÉTÉ & VENDEUR */}
                <div style={s.infoGrid(format)}>
                    <div style={s.companyContact}>
                        <h3 style={s.blueText(format)}>{company.name || company.nom || "LEDI EXPERT PRO"}</h3>
                        <p style={s.textSm(format)}>{company.address || company.adresse || "Adresse non renseignée"}</p>
                        <p style={s.textSm(format)}>Tél: {company.phone || company.telephone || "Tél: N/A"}</p>
                        <p style={s.textSm(format)}>Email: {company.email || "Email: N/A"}</p>
                        
                        {/* ✅ ALIGNEMENT VENDEUR/SERVEUR DIRECTEMENT LIÉ À VOTRE STRATEGIE DE CAPTURE */}
                        {venteInfo.staff_name_snap && venteInfo.staff_name_snap !== 'Inconnu' ? (
                            <p style={{ ...s.textSm(format), marginTop: '2px', fontStyle: 'italic', fontWeight: 'bold' }}>
                                Vendeur: {venteInfo.staff_name_snap}
                            </p>
                        ) : (
                            (venteInfo.vendeur || venteInfo.nom_vendeur || venteInfo.user || venteInfo.vendeurId || venteInfo.caissier) && (
                                <p style={{ ...s.textSm(format), marginTop: '2px', fontStyle: 'italic', fontWeight: 'bold' }}>
                                    Vendeur: {venteInfo.vendeur || venteInfo.nom_vendeur || venteInfo.user || venteInfo.vendeurId || venteInfo.caissier}
                                </p>
                            )
                        )}
                    </div>
                    <div style={s.invoiceMeta}>
                        <div style={s.metaBox(format)}>
                            <div style={s.metaHeader(format)}>N°</div>
                            <div style={s.metaContent(format)}>{venteInfo.provisoir_no || venteInfo.facture_no || venteInfo.numero || venteInfo.reference || venteInfo.lot_id || '---'}</div>
                        </div>
                        <div style={s.metaBox(format)}>
                            <div style={s.metaHeader(format)}>DATE</div>
                            <div style={s.metaContent(format)}>
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
                                const pu = Number(item.prix_vente_unitaire || item.prix || 0);
                                const rem = Number(item.remise_montant || item.remise || 0);
                                const quantityRaw = item.quantite !== undefined ? item.quantite : item.qty;

                                // 🔒 DOUBLE VERROUILLAGE COMPTABLE : Lecture stricte du prix ferme calculé par vos tranches/paliers
                                const net = Number(item.montant_ttc_ligne || item.total_ttc || item.montant_ht || 0);

                                return (
                                    <tr key={index}>
                                        {/* 1. DÉSIGNATION */}
                                        <td style={{ ...s.td(format), textAlign: 'left' }}>
                                            {item.nom_article_snap || item.designation || item.nom}
                                        </td>
                                        
                                        {/* 2. QUANTITÉ AU DÉTAIL FORMATÉE SANS BRUIT */}
                                        <td style={{ ...s.td(format), textAlign: 'center', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                                            {item.qte_vendue_formatee || formaterQuantiteImpression(quantityRaw, item)}
                                        </td>
                                        
                                        {/* 3. P.U ALIGNÉ À DEUX CHIFFRES APRÈS LA VIRGULE */}
                                        <td style={{ ...s.td(format), textAlign: 'right', fontFamily: 'monospace' }}>
                                            {pu.toFixed(2)}
                                        </td>
                                        
                                        {/* 4. REMISE ALIGNÉE */}
                                        <td style={{ ...s.td(format), textAlign: 'right', color: '#ef4444', fontFamily: 'monospace' }}>
                                            {rem ? `-${rem.toFixed(2)}` : '-'}
                                        </td>
                                        
                                        {/* 5. MONTANT DE LIGNE RIGIDE DE PRODUCTION SANS DÉCALAGE */}
                                        <td style={{ ...s.td(format), textAlign: 'right', fontWeight: 'bold', fontFamily: 'monospace' }}>
                                            {net.toFixed(2)} F
                                        </td>
                                    </tr>
                                );
                            });
                        })()}
                    </tbody>
                </table>

      <div style={{ ...s.bottomSection(format), marginTop: '3px', gap: '6px' }}>
    {/* MENTION DES LETTRES SERRÉE */}
    <div style={s.mentionLettres(format)}>
        <p style={{ ...s.montantLettres(format), fontStyle: 'italic', lineHeight: 1.1, fontSize: '8px', margin: 0 }}>
            {formaterMontantEnLettres(totalGeneral)}
        </p>
    </div>

    {/* COMPACTAGE DU CONTENEUR DES TOTALISATEURS */}
    <div style={s.totalContainer(format)}>
        <table style={s.totalTable}>
            <tbody>
                <tr>
                    <td style={{ ...s.totalLabel(format), padding: '1px 2px', fontSize: '8.5px' }}>TOTAL HT</td>
                    <td style={{ ...s.totalVal(format), padding: '1px 2px', fontSize: '8.5px', fontFamily: 'monospace' }}>
                        {/* ✅ CORRECTION DÉCIMALE STRICTE ET ALIGNEMENT COMPTABLE */}
                        {Number(sousTotalHTNet - totalTaxe).toFixed(2)} F
                    </td>
                </tr>
                <tr>
                    <td style={{ ...s.totalLabel(format), padding: '1px 2px', fontSize: '8.5px' }}>TAXES</td>
                    <td style={{ ...s.totalVal(format), padding: '1px 2px', fontSize: '8.5px', fontFamily: 'monospace' }}>
                        + {Number(totalTaxe).toFixed(2)} F
                    </td>
                </tr>

                <tr style={s.finalRow}>
                    <td style={{ ...s.finalLabel(format), padding: '1.5px 2px', fontSize: '9px' }}>TOTAL TTC</td>
                    <td style={{ ...s.finalVal(format), padding: '1.5px 2px', fontSize: '9px', fontWeight: 'bold', fontFamily: 'monospace' }}>
                        {Number(totalGeneral).toFixed(2)} FCFA
                    </td>
                </tr>
                
                {venteInfo.est_definitive && (
                    <>
                        <tr>
                            <td style={{ ...s.totalLabel(format), padding: '1px 2px', fontSize: '8.5px', paddingTop: '2px' }}>MONTANT REÇU</td>
                            <td style={{ ...s.totalVal(format), padding: '1px 2px', fontSize: '8.5px', paddingTop: '2px', fontWeight: 'bold', fontFamily: 'monospace' }}>
                                {Number(venteInfo.montant_recu || 0).toFixed(2)} F
                            </td>
                        </tr>
                        <tr>
                            <td style={{ ...s.totalLabel(format), padding: '1px 2px', color: '#1e40af', fontSize: '8.5px', fontWeight: '500' }}>MONNAIE RENDUE</td>
                            <td style={{ ...s.totalVal(format), padding: '1px 2px', color: '#1e40af', fontSize: '8.5px', fontWeight: 'bold', fontFamily: 'monospace' }}>
                                {Number(venteInfo.reliquat || 0).toFixed(2)} F
                            </td>
                        </tr>
                    </>
                )}
            </tbody>
        </table>
    </div>
</div>

{/* 📊 🎯 DEPLACEMENT EFFECTUÉ : BLOC DE RENDU DES UNITES DISSOCIEES CS / CS2 EN BAS DE FACTURE */}
{recapUnites && recapUnites.length > 0 && (
    <div style={{ 
        marginTop: '6px', 
        marginBottom: '6px',
        padding: '3px 5px', 
        borderTop: '1px dashed #000', 
        borderBottom: '1px dashed #000',
        backgroundColor: '#f8fafc',
        fontSize: '9px'
    }}>
        <div style={{ fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '2px', fontSize: '9px', letterSpacing: '0.3px', color: '#1e293b' }}>
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
                    <div key={idx} style={{ fontWeight: 'bold', fontSize: '9px', color: '#000' }}>
                        <span style={{ fontSize: '9.5px', background: '#e2e8f0', padding: '2px 5px', borderRadius: '3px', fontFamily: 'monospace' }}>
                            {texteUniteFinal}
                        </span>
                    </div>
                );
            })}
        </div>
    </div>
)}

{/* FOOTER - POUSSÉ DYNAMIQUEMENT TOUT EN BAS DE LA FEUILLE COMPACTE */}
<div style={s.footer(format)}>
    <p style={{ ...s.typeDocument(format), margin: '0 0 1px 0', fontSize: '8px', fontWeight: 'bold', letterSpacing: '0.5px' }}>
        {venteInfo.est_definitive ? "--- FACTURE DE VENTE ---" : "--- FACTURE PROVISOIRE ---"}
    </p>
    <div style={{ ...s.legalInfo(format), fontSize: '7px', lineHeight: 1.1 }}>
        <p style={{ margin: '1px 0' }}>
            <strong>{company.name || company.nom || "LEDI EXPERT PRO"}</strong> 
            {company.address || company.adresse ? ` — ${company.address || company.adresse}` : ''}
        </p>
        {(company.phone || company.telephone) && <p style={{ margin: '1px 0' }}>Tél: {company.phone || company.telephone}</p>}
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
       page: (format) => ({
        fontFamily: '"Segoe UI", sans-serif', 
        color: '#1e293b', 
        background: '#fff',
        boxSizing: 'border-box', 
        width: '100%',
        
        // 🚀 ACTIVATEUR DE REPOUSSEMENT : Permet aux enfants d'occuper tout l'espace vertical
        display: 'flex',
        flexDirection: 'column',
        minHeight: '198mm' // Ajusté pour le format A5 moins les marges physiques de l'imprimante
    }),

    footer: (format) => ({
        width: '100%',
        textAlign: 'center', 
        borderTop: '1px solid #eee', 
        paddingTop: '3px',
        
        // 🚀 DÉCENTRE ET POUSSE VERS LE BAS DE LA FEUILLE
        marginTop: 'auto', 
        paddingBottom: '2px'
    }),
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

ProvisoirPrintt.displayName = 'ProvisoirPrintt';
export default ProvisoirPrintt;
