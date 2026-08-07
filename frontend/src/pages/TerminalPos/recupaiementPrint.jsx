import React, { forwardRef, useMemo } from 'react';

const RecupaiementPrint = forwardRef((props, ref) => {
    // 🎯 RE-EXTRACTION DES PROPS COMPTABLES INTÉGRANT LE RELEVÉ CHRONOLOGIQUE GLOBAL SANS ALTÉRER LE RESTE
    const {
        isStatement = false,
        client = "",
        totalGlobal = 0,
        resteGlobal = 0,
        factures = [],
        paiementInfo = {},
        venteInfo = {},
        company = {},
        format = 'A5'
    } = props;

    // =========================================================================
    // 🪪 RECONSOLIDATION DES DONNÉES FINANCIÈRES ET FLUX DE RECOUVREMENT
    // =========================================================================
    const clientFinal = client || venteInfo?.nom_client_snap || venteInfo?.client || "CLIENT AU COMPTANT";
    const factureId = venteInfo?.id || '---';
    const paiementId = paiementInfo?.id || '---';
    const datePaiement = paiementInfo?.created_at ? new Date(paiementInfo.created_at) : new Date();

    const montantVerse = Number(paiementInfo?.montant ?? 0);
    const resteAPayerApresReglement = Number(paiementInfo?.nouveauReste ?? 0);
    
    // Calcul comptable rétrospectif du solde avant l'opération du jour
    const soldeAvantReglement = resteAPayerApresReglement + montantVerse;

    const formaterMontantEnLettres = (montant) =>
        `${new Intl.NumberFormat('fr-FR').format(Math.round(montant || 0))} Francs CFA`;

    // =========================================================================
    // 🎨 CONFIGURATION GÉOMÉTRIQUE SANS MARGES POUR UN SEUL FEUILLET PHYSIQUE A5
    // =========================================================================
    const injectionStylesImpression = useMemo(() => {
        return `
            @media print {
                @page {
                    size: 148mm 210mm portrait !important;
                    margin: 0 !important;
                }
                body, html {
                    margin: 0 !important;
                    padding: 0 !important;
                    overflow: hidden !important;
                    height: 210mm !important;
                    width: 148mm !important;
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                }
                #print-container {
                    width: 148mm !important;
                    height: 210mm !important;
                    overflow: hidden !important;
                }
            }
        `;
    }, []);

    // =========================================================================
    // 🖨️ DIRECTIVES MAÎTRES DE SCISSION ET RÈGLES DE SÉCURITÉ ANTI-COUPURE
    // =========================================================================
    const stylesDuplication = {
        mainPageContainer: {
            width: '148mm',
            height: '210mm',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            backgroundColor: '#ffffff',
            boxSizing: 'border-box',
            padding: '5mm 6mm', // 🛡️ Zone de sécurité anti-coupure mécanique de l'imprimante
            overflow: 'hidden'
        },
        moitieExemplaire: {
            height: 'calc(50% - 10px)', 
            display: 'flex',
            flexDirection: 'column',
            boxSizing: 'border-box',
            overflow: 'hidden',
            padding: '2px 0'
        },
        ligneDeCoupe: {
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#94a3b8',
            fontSize: '8px',
            fontWeight: '700',
            borderTop: '1.5px dashed #cbd5e1',
            height: '14px',
            margin: 0,
            padding: 0,
            boxSizing: 'border-box',
            flexShrink: 0
        },
        badgeMention: {
            fontSize: '8px',
            fontWeight: '900',
            color: '#ffffff',
            background: '#475569',
            textTransform: 'uppercase',
            padding: '1px 4px',
            borderRadius: '2px',
            display: 'inline-block',
            letterSpacing: '0.3px',
            lineHeight: '1'
        }
    };

       // =========================================================================
    // 🖨️ FONCTION DE RENDU INTERNE D'UN TICKET UNIQUE (EXÉCUTÉE PAR EXEMPLAIRE)
    // =========================================================================
    const renderSingleReceipt = (mentionDestinataire) => {
        return (
            <div style={{
                ...stylesDuplication.moitieExemplaire,
                display: 'flex',
                flexDirection: 'column'
            }}>
                {/* 1. Header (Horizontal, fusionné et compact pour libérer l'espace) */}
                <div style={{ flex: '0 0 auto', borderBottom: '1px solid #cbd5e1', paddingBottom: '3px', marginBottom: '3px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        
                        {/* Bloc Gauche : Logo ou initiale d'entreprise */}
                        <div style={s.logoContainer}>
                            {company?.logo_data ? (
                                <img src={company.logo_data} alt="Logo" style={{ ...s.logo, maxHeight: '20px', objectFit: 'contain' }} />
                            ) : (
                                <div style={{ ...s.logoPlaceholder, fontSize: '9px', padding: '1px 5px', background: '#f1f5f9', borderRadius: '3px', fontWeight: 'bold', color: '#1e40af' }}>
                                    {company?.nom?.charAt(0) || company?.name?.charAt(0) || 'C'}
                                </div>
                            )}
                        </div>

                        {/* Bloc Central : Titre du document et badge de destination */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <h2 style={{ ...s.mainTitle, fontSize: '11px', margin: 0, fontWeight: '900', color: '#0f172a', letterSpacing: '-0.2px' }}>
                                REÇU DE RÈGLEMENT
                            </h2>
                            <div style={stylesDuplication.badgeMention}>{mentionDestinataire}</div>
                        </div>

                        {/* Bloc Droit : Numéro de paiement et Date de l'opération */}
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <span style={{ fontSize: '8.5px', fontWeight: '800', color: '#475569', background: '#f1f5f9', padding: '2px 4px', borderRadius: '3px' }}>
                                N°: {paiementId.substring(0, 12)}
                            </span>
                            <span style={{ fontSize: '8.5px', fontWeight: '800', color: '#475569', background: '#f1f5f9', padding: '2px 4px', borderRadius: '3px' }}>
                                {datePaiement.toLocaleDateString('fr-FR')}
                            </span>
                        </div>

                    </div>
                </div>

                {/* 2. CLIENT ET METADONNÉES DU FLUX DE CAISSE (Resserré) */}
                <div style={{ ...s.clientGrid, display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '8px', flex: '0 0 auto', borderTop: 'none', paddingTop: 0, marginBottom: '2px' }}>
                    <div>
                        <div style={{ ...s.addressTitle, fontSize: '8px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' }}>CLIENT / DÉBITEUR</div>
                        <div style={{ ...s.addressContent, fontSize: '10px', color: '#0f172a', fontWeight: '700', marginTop: '1px' }}>
                            {clientFinal}
                        </div>
                    </div>

                    {/* 🔄 BLOC INFORMATIF ENCAISSEMENT : Mise en valeur claire de la somme perçue ce jour */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center' }}>
                        <div style={{ border: '1px solid #cbd5e1', borderRadius: '3px', padding: '2px 6px', background: '#f8fafc', minWidth: '150px', boxSizing: 'border-box' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                                <span style={{ fontSize: '8px', fontWeight: '800', color: '#16a34a' }}>
                                    💰 ENCAISSÉ :
                                </span>
                                <span style={{ fontSize: '10px', fontWeight: '900', color: '#16a34a' }}>
                                    {montantVerse.toLocaleString()} F
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 3. Tableau de Traçabilité de la créance comptable */}
                <div style={{ flex: '1 1 auto', overflowY: 'hidden', marginTop: '2px', display: 'flex', flexDirection: 'column' }}>
                    <table style={{ ...s.table, fontSize: '9.5px', width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: '#f1f5f9' }}>
                                <th style={{ padding: '3px 4px', textAlign: 'left', fontSize: '9px', border: '1px solid #cbd5e1', width: '45%', fontWeight: '800', color: '#1e293b' }}>LIBELLÉ COMPTABLE</th>
                                <th style={{ padding: '3px 4px', textAlign: 'right', fontSize: '9px', border: '1px solid #cbd5e1', width: '25%', fontWeight: '800', color: '#1e293b' }}>RÉFÉRENCE</th>
                                <th style={{ padding: '3px 4px', textAlign: 'right', fontSize: '9px', border: '1px solid #cbd5e1', width: '30%', fontWeight: '800', color: '#1e293b' }}>MONTANT FLUX</th>
                            </tr>
                        </thead>
                        <tbody>
                                                        {/* Étape 1 : Solde initial avant le règlement du jour */}
                            <tr style={{ borderBottom: '1px solid #cbd5e1' }}>
                                <td style={{ ...s.td, fontSize: '9px', padding: '2px 4px', textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    Solde restant dû sur facture initial
                                </td>
                                <td style={{ ...s.td, textAlign: 'right', fontSize: '9px', padding: '2px 4px' }}>
                                    {factureId.substring(0, 12)}
                                </td>
                                <td style={{ ...s.td, textAlign: 'right', fontWeight: '600', fontSize: '9px', padding: '2px 4px', color: '#64748b' }}>
                                    {soldeAvantReglement.toLocaleString()} F
                                </td>
                            </tr>
                            
                            {/* Étape 2 : L'encaissement effectif du jour */}
                            <tr style={{ borderBottom: '1px solid #cbd5e1', background: '#f0fdf4' }}>
                                <td style={{ ...s.td, fontSize: '9px', padding: '2px 4px', textAlign: 'left', fontWeight: 'bold', color: '#16a34a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    Règlement partiel / acompte perçu ce jour ↩
                                </td>
                                <td style={{ ...s.td, textAlign: 'right', fontSize: '9px', padding: '2px 4px', color: '#16a34a' }}>
                                    {paiementInfo?.moyen_paiement || 'ESPECES'}
                                </td>
                                <td style={{ ...s.td, textAlign: 'right', fontWeight: 'bold', fontSize: '9px', padding: '2px 4px', color: '#16a34a' }}>
                                    -{montantVerse.toLocaleString()} F
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                {/* 4. TOTAL COMPTABLE SÉCURISÉ & HYPER-COMPACTÉ */}
                <div style={{ ...s.bottomSection, marginTop: '2px', display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '8px', flex: '0 0 auto', borderTop: '1px dashed #cbd5e1', paddingTop: '2px' }}>
                    
                    {/* Zone d'écriture du montant encaissé en toutes lettres */}
                    <div style={{ ...s.mentionLettres, textAlign: 'left' }}>
                        <p style={{ fontSize: '8px', fontStyle: 'italic', margin: 0, color: '#475569' }}>
                            Arrêté à la somme de :
                        </p>
                        <p style={{ ...s.montantLettres, fontSize: '8.5px', fontWeight: '700', marginTop: '1px', color: '#0f172a', lineHeight: '1.1' }}>
                            {formaterMontantEnLettres(montantVerse)}
                        </p>
                        <p style={{ fontSize: '7.5px', color: '#64748b', marginTop: '4px', margin: 0 }}>
                            Opérateur caisse : {paiementInfo?.caissier_name || 'Caisse Centrale'}
                        </p>
                    </div>

                    {/* Grille financière chiffrée sur la droite */}
                    <div style={s.totalContainer}>
                        <table style={s.totalTable}>
                            <tbody>
                                <tr>
                                    <td style={{ ...s.totalLabel, padding: '1px 2px', textAlign: 'left', color: '#475569', fontSize: '8.5px' }}>MONTANT REÇU</td>
                                    <td style={{ ...s.totalVal, padding: '1px 2px', textAlign: 'right', fontWeight: 'bold', fontSize: '8.5px', color: '#16a34a' }}>{montantVerse.toLocaleString()} F</td>
                                </tr>
                                <tr>
                                    <td style={{ ...s.totalLabel, padding: '1px 2px', textAlign: 'left', color: '#dc2626', fontWeight: 'bold', fontSize: '8.5px' }}>RESTE À RECOUVRER</td>
                                    <td style={{ ...s.totalVal, padding: '1px 2px', textAlign: 'right', color: '#dc2626', fontWeight: 'bold', fontSize: '8.5px' }}>{resteAPayerApresReglement.toLocaleString()} F</td>
                                </tr>
                                <tr style={{ ...s.finalRow, background: '#1e293b' }}>
                                    <td style={{ ...s.finalLabel, padding: '2px 4px', textAlign: 'left', fontSize: '8.5px', color: '#ffffff', fontWeight: 'bold' }}>FLUX CAISSE</td>
                                    <td style={{ ...s.finalVal, padding: '2px 4px', textAlign: 'right', fontSize: '9px', fontWeight: '900', color: '#4ade80' }}>
                                        +{montantVerse.toLocaleString()} F
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>
        );
    }; // <--- Fermeture étanche de la fonction de rendu unitaire du reçu
    // =========================================================================
    // 🚀 RENDU DU CONTENEUR MAÎTRE DUPLIQUANT LE REÇU SUR UNE SEULE PAGE A5
    // =========================================================================
    return (
        <>
            {/* 🎯 INJECTION DIRECTE DES DIRECTIVES CSS SANS MARGES POUR CHROME */}
            <style dangerouslySetInnerHTML={{ __html: injectionStylesImpression }} />

            <div id="print-container" ref={ref} style={stylesDuplication.mainPageContainer}>
                {/* Moitié Supérieure de la feuille physique */}
                {renderSingleReceipt("EXEMPLAIRE CLIENT")}

                {/* Repère de massicotage / pointillé central de découpe */}
                <div style={stylesDuplication.ligneDeCoupe}>
                    ✂ -- COUPE IMPRESSION / REÇU DE RÈGLEMENT DE CRÉANCE -- ✂
                </div>

                {/* Moitié Inférieure de la feuille physique */}
                {renderSingleReceipt("EXEMPLAIRE ADMINISTRATION (SOUCHE CAISSE)")}
            </div>
        </>
    );
});

RecupaiementPrint.displayName = 'RecupaiementPrint';

// =========================================================================
// 🎨 OBJET DE STYLES DE REPLI STANDARDS SÉCURISÉS (HORS DU COMPOSANT)
// =========================================================================
const s = {
    page: { 
        fontFamily: 'Segoe UI, system-ui, sans-serif', 
        color: '#1e293b', 
        background: 'white', 
        position: 'relative', 
        width: '100%' 
    },

    topHeader: { 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: 0, 
        paddingBottom: 0 
    },
    logoContainer: { 
        display: 'flex',
        alignItems: 'center'
    },
    logo: { 
        maxHeight: 20, 
        objectFit: 'contain' 
    },
    logoPlaceholder: { 
        background: '#f1f5f9', 
        color: '#1e40af', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        borderRadius: '3px', 
        fontWeight: 'bold'
    },
    titleContainer: { 
        display: 'flex', 
        flexDirection: 'column', 
        justifyContent: 'center' 
    },
    mainTitle: { 
        margin: 0, 
        color: '#0f172a', 
        fontWeight: 900
    },
    clientGrid: { 
        marginBottom: 2, 
        borderTop: 'none', 
        paddingTop: 0 
    },
    addressTitle: { 
        fontWeight: 'bold', 
        color: '#64748b'
    },
    addressContent: { 
        color: '#0f172a', 
        lineHeight: '1.2' 
    },
    table: { 
        width: '100%', 
        borderCollapse: 'collapse', 
        marginTop: 2 
    },
    td: { 
        border: '1px solid #cbd5e1', 
        color: '#0f172a' 
    },
    bottomSection: { 
        display: 'flex', 
        justifyContent: 'space-between', 
        marginTop: 2, 
        gap: '8px', 
        alignItems: 'flex-start' 
    },
    mentionLettres: { 
        flex: 1 
    },
    montantLettres: { 
        color: '#0f172a', 
        fontWeight: 'bold', 
        lineHeight: '1.1' 
    },
    totalContainer: { 
        width: 180, 
        flexShrink: 0 
    },
    totalTable: { 
        width: '100%', 
        borderCollapse: 'collapse' 
    },
    totalLabel: { 
        color: '#475569', 
        fontWeight: '600' 
    },
    totalVal: { 
        textAlign: 'right', 
        fontWeight: '700', 
        color: '#1e293b' 
    },
    finalRow: { 
        background: '#1e293b' 
    },
    finalLabel: { 
        color: 'white', 
        fontWeight: 'bold' 
    },
    finalVal: { 
        color: '#4ade80', 
        fontWeight: '900', 
        textAlign: 'right' 
    }
};

export default RecupaiementPrint;
