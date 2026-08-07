import React, { forwardRef, useMemo } from 'react';

const ConsignationPrint = forwardRef((props, ref) => {
    const {
        panier = [],
        totalGeneral = 0,
        venteInfo = {},
        company = {},
        isAvoir = false,
        titreDocument = '',
        numeroFacture = '',
        dateFacture = null,
        client = null,
        format = 'A5' 
    } = props;

    const typeGarantie = venteInfo?.type_garantie || 'ESPECES';
    const montantRecu = Number(venteInfo?.montant_recu ?? 0);
    const garantieLibelle = venteInfo?.garantie_libelle || '';
    
    // 🎯 IDENTIFICATION UNIQUE DE L'ACTION DU DOCUMENT
    const isDeconsignation = titreDocument && titreDocument.includes("DÉCONSIGNATION");

    const titreFinal = titreDocument || (isAvoir ? "FACTURE D'AVOIR" : "FACTURE");
    const clientFinal = client?.nom || venteInfo?.client_nom || "CLIENT AU COMPTANT";
    const numeroFinal = numeroFacture || venteInfo?.facture_no || '---';
    const dateFinal = dateFacture ? new Date(dateFacture) : new Date();

    // =========================================================================
    // ⚙️ CALCUL DE L'ÉCART SÉCURISÉ POUR LE BLOC 4
    // =========================================================================
    const resteAPayerEcart = useMemo(() => {
        if (typeGarantie === 'PHYSIQUE') return 0;
        if (isDeconsignation) return 0;
        const calcul = Number(totalGeneral) - montantRecu;
        return calcul > 0 ? calcul : 0;
    }, [typeGarantie, totalGeneral, montantRecu, isDeconsignation]);

    // =========================================================================
    // 🧮 LOGIQUE PANIER INSTANT T : RECALCUL EXCLUSIF DE CE QUI SORT DE CAISSE
    // =========================================================================
       // =========================================================================
    // 🧮 LOGIQUE PANIER INSTANT T : RECALCUL EXCLUSIF DE CE QUI SORT DE CAISSE
    // =========================================================================
    const { lignesFiltreesPourImpression, totalRemboursementInstantT, totalTaxeCalcule, valeurTotaleBruteLot } = useMemo(() => {
        const agregation = {};
        let argentAFeaireSortirCaisseCeJour = 0;
        let taxeCumulee = 0;
        let cumulBrutToutesLignes = 0;

        (panier || []).forEach(item => {
            if (!item) return;
            const nom = item?.nom_article_snap || item?.designation || 'ARTICLE';
            const qteCourante = Number(item.quantite ?? 0);
            const pu = Number(item.prix_vente_unitaire ?? 0);
            const dateOperation = item?.updated_at || item?.created_at || new Date();

            taxeCumulee += Number(item?.taxe_montant ?? 0);

            if (!agregation[nom]) {
                agregation[nom] = {
                    nom_article_snap: nom,
                    prix_vente_unitaire: pu,
                    qteConsignee: 0,
                    qteDeconsigneeInstantT: 0,
                    dateDeconsignation: '—'
                };
            }

            if (qteCourante > 0) {
                agregation[nom].qteConsignee += qteCourante;
                cumulBrutToutesLignes += qteCourante * pu;
            } else if (qteCourante < 0) {
                const qteAbsolue = Math.abs(qteCourante);
                agregation[nom].qteDeconsigneeInstantT += qteAbsolue;
                agregation[nom].dateDeconsignation = new Date(dateOperation).toLocaleDateString('fr-FR');
                
                // Cumul de la valeur brute réelle de l'emballage traité
                cumulBrutToutesLignes += qteAbsolue * pu;
                
                // Argent validé dans le panier courant à rembourser
                argentAFeaireSortirCaisseCeJour += qteAbsolue * pu;
            }
        });

        return { 
            lignesFiltreesPourImpression: Object.values(agregation),
            totalRemboursementInstantT: argentAFeaireSortirCaisseCeJour,
            totalTaxeCalcule: taxeCumulee,
            valeurTotaleBruteLot: cumulBrutToutesLignes // <-- Calcul de la valeur réelle à afficher
        };
    }, [panier]);


    const formaterMontantEnLettres = (montant) =>
        `${new Intl.NumberFormat('fr-FR').format(Math.round(montant || 0))} Francs CFA`;

    const getFont = (base) => {
        const linesCount = lignesFiltreesPourImpression?.length || 0;
        if (linesCount > 6) return base * 0.72; 
        return base * 0.82; 
    };

    const injectionStylesImpression = useMemo(() => {
        return `
            @media print {
                @page { size: 148mm 210mm portrait !important; margin: 0 !important; }
                body, html { margin: 0 !important; padding: 0 !important; overflow: hidden !important; height: 210mm !important; width: 148mm !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                #print-container { width: 148mm !important; height: 210mm !important; overflow: hidden !important; }
            }
        `;
    }, []);

    const stylesDuplication = {
        mainPageContainer: { width: '148mm', height: '210mm', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', backgroundColor: '#ffffff', boxSizing: 'border-box', padding: '5mm 5mm', overflow: 'hidden' },
        moitieExemplaire: { height: 'calc(50% - 10px)', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', overflow: 'hidden', padding: '2px 0' },
        ligneDeCoupe: { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '8px', fontWeight: '700', borderTop: '1.5px dashed #cbd5e1', height: '14px', margin: 0, padding: 0, boxSizing: 'border-box', flexShrink: 0 },
        badgeMention: { fontSize: '8px', fontWeight: '900', color: '#ffffff', background: '#475569', textTransform: 'uppercase', padding: '1px 4px', borderRadius: '2px', display: 'inline-block', letterSpacing: '0.3px', lineHeight: '1' }
    };



   

       const renderSingleInvoice = (mentionDestinataire) => {
        return (
            <div style={{
                ...stylesDuplication.moitieExemplaire,
                display: 'flex',
                flexDirection: 'column'
            }}>
                {/* 1. HEADER COUPLÉ ET COMPACT (S'adapte dynamiquement grâce à getFont) */}
                <div style={{ flex: '0 0 auto', borderBottom: '1px solid #cbd5e1', paddingBottom: '3px', marginBottom: '3px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        
                        {/* Bloc Gauche : Logo ou Initiale */}
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                            {company?.logo_data ? (
                                <img src={company.logo_data} alt="Logo" style={{ maxHeight: `${getFont(20)}px`, objectFit: 'contain' }} />
                            ) : (
                                <div style={{ fontSize: `${getFont(9)}px`, padding: '1px 5px', background: '#f1f5f9', borderRadius: '3px', fontWeight: 'bold', color: '#1e40af' }}>
                                    {company?.nom?.charAt(0) || company?.name?.charAt(0) || 'C'}
                                </div>
                            )}
                        </div>

                        {/* Bloc Central : Titre de la pièce & Badge */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <h2 style={{ fontSize: `${getFont(11)}px`, margin: 0, fontWeight: '900', color: '#0f172a', letterSpacing: '-0.2px' }}>
                                {titreFinal.toUpperCase()}
                            </h2>
                            <div style={stylesDuplication.badgeMention}>{mentionDestinataire}</div>
                        </div>

                        {/* Bloc Droit : Numéro et Date sur badges discrets */}
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <span style={{ fontSize: `${getFont(8.5)}px`, fontWeight: '800', color: '#475569', background: '#f1f5f9', padding: '2px 4px', borderRadius: '3px', whiteSpace: 'nowrap' }}>
                                N°: {numeroFinal}
                            </span>
                            <span style={{ fontSize: `${getFont(8.5)}px`, fontWeight: '800', color: '#475569', background: '#f1f5f9', padding: '2px 4px', borderRadius: '3px', whiteSpace: 'nowrap' }}>
                                {dateFinal.toLocaleDateString('fr-FR')}
                            </span>
                        </div>

                    </div>
                </div>

                {/* 2. CLIENT ET METADONNÉES DE GARANTIES DE LA FACTURE (Resserré et fluide) */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '8px', flex: '0 0 auto', borderTop: 'none', paddingTop: 0, marginBottom: '2px', alignItems: 'center' }}>
                    <div>
                        <div style={{ fontSize: `${getFont(8)}px`, fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.2px' }}>DESTINATAIRE</div>
                        <div style={{ fontSize: `${getFont(10)}px`, color: '#0f172a', fontWeight: '700', marginTop: '1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '140px' }}>
                            {clientFinal}
                        </div>
                    </div>

                    {/* 🔄 BLOC INFORMATIF COMPACT : Gestion des garanties et affichage du flux réel de l'instant T */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center' }}>
                        <div style={{ border: '1px solid #cbd5e1', borderRadius: '3px', padding: '2px 6px', background: '#f8fafc', minWidth: '150px', boxSizing: 'border-box' }}>
                            {typeGarantie === 'ESPECES' ? (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                                    <span style={{ fontSize: `${getFont(8)}px`, fontWeight: '800', color: isDeconsignation ? '#dc2626' : '#2563eb' }}>
                                        {isDeconsignation ? '↩ REMBOURSER :' : '💰 DÉPÔT :'}
                                    </span>
                                    <span style={{ fontSize: `${getFont(10)}px`, fontWeight: '900', color: isDeconsignation ? '#dc2626' : '#2563eb' }}>
                                        {isDeconsignation 
                                            ? `${Math.round(totalRemboursementInstantT).toLocaleString()} F` // Corrigé : pointe fidèlement sur l'action immédiate
                                            : `${montantRecu.toLocaleString()} F`
                                        }
                                    </span>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                                    <span style={{ fontSize: `${getFont(8)}px`, fontWeight: '800', color: '#6d28d9', textTransform: 'uppercase' }}>🪪 PIÈCE :</span>
                                    <span style={{ fontSize: `${getFont(8.5)}px`, color: '#4c1d95', fontWeight: '700', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '85px' }} title={garantieLibelle}>
                                        {garantieLibelle || "Pièce"}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>


                                {/* 3. TABLEAU ANALYTIQUE HORIZONTAL DES EMBALLAGES (7 Colonnes - Structure Fluide de Suivi) */}
                <div style={{ 
                    flex: '1 1 auto', 
                    overflowY: 'hidden', 
                    marginTop: '2px', 
                    display: 'flex', 
                    flexDirection: 'column' 
                }}>
                    <table style={{ 
                        width: '100%', 
                        tableLayout: 'fixed', 
                        borderCollapse: 'collapse',
                        border: '1px solid #cbd5e1'
                    }}>
                        <thead>
                            <tr style={{ background: '#f1f5f9' }}>
                                <th style={{ padding: '3px 2px', textAlign: 'left', fontSize: `${getFont(8.5)}px`, border: '1px solid #cbd5e1', width: '26%', fontWeight: '800', color: '#1e293b' }}>DESCRIPTION</th>
                                <th style={{ padding: '3px 2px', textAlign: 'center', fontSize: `${getFont(8)}px`, border: '1px solid #cbd5e1', width: '10%', fontWeight: '800', color: '#1e293b' }}>Q.CONS</th>
                                <th style={{ padding: '3px 2px', textAlign: 'center', fontSize: `${getFont(8)}px`, border: '1px solid #cbd5e1', width: '10%', fontWeight: '800', color: '#1e293b' }}>Q.DÉC</th>
                                <th style={{ padding: '3px 2px', textAlign: 'center', fontSize: `${getFont(8)}px`, border: '1px solid #cbd5e1', width: '8%', fontWeight: '800', color: '#1e293b' }}>RST</th>
                                <th style={{ padding: '3px 2px', textAlign: 'right', fontSize: `${getFont(8)}px`, border: '1px solid #cbd5e1', width: '15%', fontWeight: '800', color: '#1e293b' }}>MT CONS.</th>
                                <th style={{ padding: '3px 2px', textAlign: 'right', fontSize: `${getFont(8)}px`, border: '1px solid #cbd5e1', width: '16%', fontWeight: '800', color: '#1e293b' }}>MT DÉCONS.</th>
                                <th style={{ padding: '3px 2px', textAlign: 'center', fontSize: `${getFont(8)}px`, border: '1px solid #cbd5e1', width: '15%', fontWeight: '800', color: '#1e293b' }}>DATE DÉC.</th>
                            </tr>
                        </thead>

                        <tbody>
                            {(lignesFiltreesPourImpression || []).map((item, i) => {
                                const nom = item.nom_article_snap;
                                const pu = item.prix_vente_unitaire;
                                const qteCons = item.qteConsignee;
                                const qteDeconsInstant = item.qteDeconsigneeInstantT;
                                
                                // Reste d'emballages réel après l'opération immédiate
                                const reste = qteCons - qteDeconsInstant;

                                // Calcul précis des colonnes financières individualisées
                                const mtConsigne = qteCons * pu;
                                const mtDeconsigne = qteDeconsInstant > 0 ? -(qteDeconsInstant * pu) : 0;

                                return (
                                    <tr key={i} style={{
                                        backgroundColor: qteDeconsInstant > 0 ? '#f0fdf4' : 'transparent',
                                        borderBottom: '1px solid #cbd5e1'
                                    }}>
                                        {/* 1. Description */}
                                        <td style={{ 
                                            fontSize: `${getFont(8.5)}px`, 
                                            padding: '2px 3px', 
                                            border: '1px solid #cbd5e1', 
                                            whiteSpace: 'nowrap', 
                                            overflow: 'hidden', 
                                            textOverflow: 'ellipsis', 
                                            color: '#0f172a' 
                                        }} title={nom}>
                                            {nom}
                                        </td>

                                        {/* 2. Quantité Consignée */}
                                        <td style={{ textAlign: 'center', fontSize: `${getFont(8.5)}px`, padding: '2px 2px', border: '1px solid #cbd5e1', color: '#475569' }}>
                                            {qteCons}
                                        </td>
                                        
                                        {/* 3. Quantité Déconsignée (Instant T) */}
                                        <td style={{ textAlign: 'center', fontSize: `${getFont(8.5)}px`, padding: '2px 2px', border: '1px solid #cbd5e1', color: qteDeconsInstant > 0 ? '#16a34a' : '#475569', fontWeight: qteDeconsInstant > 0 ? 'bold' : 'normal' }}>
                                            {qteDeconsInstant > 0 ? `-${qteDeconsInstant}` : '0'}
                                        </td>
                                        
                                        {/* 4. Reste d'emballages en possession */}
                                        <td style={{ textAlign: 'center', fontSize: `${getFont(8.5)}px`, padding: '2px 2px', border: '1px solid #cbd5e1', color: reste > 0 ? '#334155' : '#94a3b8', fontWeight: reste > 0 ? '700' : 'normal' }}>
                                            {reste}
                                        </td>
                                        
                                        {/* 5. NOUVELLE : Montant de Consignation */}
                                        <td style={{ textAlign: 'right', fontSize: `${getFont(8.5)}px`, padding: '2px 3px', border: '1px solid #cbd5e1', color: '#0f172a' }}>
                                            {mtConsigne > 0 ? `${mtConsigne.toLocaleString()} F` : '0 F'}
                                        </td>

                                        {/* 6. NOUVELLE : Montant de Déconsignation (Passage forcé en négatif rouge) */}
                                        <td style={{ textAlign: 'right', fontSize: `${getFont(8.5)}px`, padding: '2px 3px', border: '1px solid #cbd5e1', color: mtDeconsigne < 0 ? '#dc2626' : '#475569', fontWeight: mtDeconsigne < 0 ? 'bold' : 'normal' }}>
                                            {mtDeconsigne < 0 ? `${mtDeconsigne.toLocaleString()} F` : '0 F'}
                                        </td>

                                        {/* 7. NOUVELLE : Date exacte de Déconsignation */}
                                        <td style={{ textAlign: 'center', fontSize: `${getFont(8)}px`, padding: '2px 2px', border: '1px solid #cbd5e1', color: '#64748b', whiteSpace: 'nowrap' }}>
                                            {item.dateDeconsignation}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>



                {/* 4. TOTAL COMPTABLE RECALCULÉ & HYPER-COMPACTÉ (Fluide et synchrone avec le modèle analytique) */}
                <div style={{ 
                    flex: '0 0 auto', 
                    marginTop: '2px', 
                    display: 'grid', 
                    gridTemplateColumns: '1.2fr 1fr', 
                    gap: '8px', 
                    borderTop: '1px dashed #cbd5e1', 
                    paddingTop: '2px'
                }}>
                    
                    {/* Zone d'écriture en toutes lettres fidèle à l'argent réel sortant/entrant à l'instant T */}
                    <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <p style={{ fontSize: `${getFont(8)}px`, fontStyle: 'italic', margin: 0, color: '#475569' }}>
                            Arrêté à la somme de :
                        </p>
                        <p style={{ 
                            fontSize: `${getFont(8.5)}px`, 
                            fontWeight: '700', 
                            marginTop: '1px', 
                            marginBottom: 0,
                            color: '#0f172a', 
                            lineHeight: '1.1' 
                        }}>
                            {typeGarantie === 'PHYSIQUE' 
                                ? `Zéro Francs CFA (Dépôt Matériel sous Garantie : ${garantieLibelle || "Pièce"})`
                                : isDeconsignation
                                    ? formaterMontantEnLettres(totalRemboursementInstantT) // Convertit fidèlement la valeur de déconsignation calculée ce jour
                                    : formaterMontantEnLettres(totalGeneral)
                            }
                        </p>
                        <p style={{ fontSize: `${getFont(7.5)}px`, color: '#64748b', marginTop: '4px', margin: 0 }}>
                            Opérateur caisse : {venteInfo?.caissier_name || 'Caisse Centrale'}
                        </p>
                    </div>

                    {/* Grille financière de droite (Largeur fixe de 180px identique à la page témoin) */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', width: '180px', marginLeft: 'auto', flexShrink: 0 }}>
                        <table style={{ 
                            fontSize: `${getFont(8.5)}px`, 
                            width: '100%', 
                            borderCollapse: 'collapse' 
                        }}>
                            <tbody>
                                                                <tr>
                                    <td style={{ padding: '1px 2px', textAlign: 'left', color: '#475569', fontSize: `${getFont(8.5)}px`, fontWeight: '600' }}>VALEUR BRUTE LOT</td>
                                    <td style={{ padding: '1px 2px', textAlign: 'right', fontWeight: '700', color: '#0f172a', fontSize: `${getFont(8.5)}px` }}>
                                        {Math.round(valeurTotaleBruteLot).toLocaleString()} F
                                    </td>
                                </tr>


                                {totalTaxeCalcule > 0 && (
                                    <tr>
                                        <td style={{ padding: '1px 2px', textAlign: 'left', color: '#475569', fontSize: `${getFont(8.5)}px`, fontWeight: '600' }}>TAXES</td>
                                        <td style={{ padding: '1px 2px', textAlign: 'right', fontWeight: 'bold', color: '#0f172a', fontSize: `${getFont(8.5)}px` }}>+{Math.round(totalTaxeCalcule).toLocaleString()} F</td>
                                    </tr>
                                )}

                                {/* Traçabilité immédiate sur le ticket corrigé */}
                                <tr>
                                    <td style={{ 
                                        padding: '1px 2px', 
                                        textAlign: 'left', 
                                        fontWeight: '700', 
                                        fontSize: `${getFont(8.5)}px`,
                                        color: typeGarantie === 'ESPECES' ? (isDeconsignation ? '#dc2626' : '#16a34a') : '#6d28d9' 
                                    }}>
                                        {typeGarantie === 'ESPECES' 
                                            ? (isDeconsignation ? 'MONTANT RENDU' : 'MONTANT REÇU') 
                                            : 'GARANTIE PHYSIQUE'
                                        }
                                    </td>
                                    <td style={{ 
                                        padding: '1px 2px', 
                                        textAlign: 'right', 
                                        fontWeight: '700', 
                                        fontSize: `${getFont(8.5)}px`,
                                        color: typeGarantie === 'ESPECES' ? (isDeconsignation ? '#dc2626' : '#16a34a') : '#6d28d9' 
                                    }}>
                                        {typeGarantie === 'ESPECES' 
                                            ? (isDeconsignation 
                                                ? `${Math.round(totalRemboursementInstantT).toLocaleString()} F` 
                                                : `${montantRecu.toLocaleString()} F`)
                                            : '0 F (Objet)'
                                        }
                                    </td>
                                </tr>

                                {typeGarantie === 'ESPECES' && resteAPayerEcart > 0 && (
                                    <tr>
                                        <td style={{ padding: '1px 2px', textAlign: 'left', color: '#dc2626', fontWeight: 'bold', fontSize: `${getFont(8.5)}px` }}>ÉCART / RESTE</td>
                                        <td style={{ padding: '1px 2px', textAlign: 'right', color: '#dc2626', fontWeight: 'bold', fontSize: `${getFont(8.5)}px` }}>{resteAPayerEcart.toLocaleString()} F</td>
                                    </tr>
                                )}

                                <tr style={{ backgroundColor: '#1e293b' }}>
                                    <td style={{ padding: '2px 4px', textAlign: 'left', fontSize: `${getFont(8.5)}px`, color: '#ffffff', fontWeight: 'bold' }}>FLUX CAISSE</td>
                                    <td style={{ 
                                        padding: '2px 4px', 
                                        textAlign: 'right', 
                                        fontSize: `${getFont(9)}px`, 
                                        fontWeight: '900', 
                                        color: (isDeconsignation && typeGarantie === 'ESPECES') ? '#f87171' : '#4ade80' 
                                    }}>
                                        {typeGarantie === 'PHYSIQUE' 
                                            ? '0 F' 
                                            : (isDeconsignation 
                                                ? `-${Math.round(totalRemboursementInstantT).toLocaleString()} F` // Sortie de caisse effective
                                                : `+${montantRecu.toLocaleString()} F`)
                                        }
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* 🚀 LE BLOCK FOOTER RESTE SUPPRIMÉ POUR GAGNER DE LA HAUTEUR */}

            </div>
        );
    }; // <--- Fermeture étanche de la fonction de rendu unitaire


        // =========================================================================
    // 🚀 RENDU DU CONTENEUR MAÎTRE : DOUBLE CANAL EXCLUSIF SOUCHE/CLIENT
    // =========================================================================
    return (
        <>
            {/* 🎯 INJECTION DIRECTE DES DIRECTIVES CSS SANS MARGES POUR LE SPOOLER ELECTRON */}
            <style dangerouslySetInnerHTML={{ __html: injectionStylesImpression }} />

            <div 
                id="print-container" 
                ref={ref} 
                style={{
                    ...stylesDuplication.mainPageContainer,
                    fontFamily: 'Segoe UI, -apple-system, BlinkMacSystemFont, Roboto, sans-serif'
                }}
            >
                {/* Moitié Supérieure de la feuille physique (Exemplaire Client) */}
                {renderSingleInvoice("EXEMPLAIRE CLIENT")}

                {/* Repère de massicotage / pointillé central de découpe */}
                <div style={stylesDuplication.ligneDeCoupe}>
                    ✂ -- DECOUPE / ARCHIVE BON DE CONSIGNATION -- ✂
                </div>

                {/* Moitié Inférieure de la feuille physique (Exemplaire Souche Caisse) */}
                {renderSingleInvoice("EXEMPLAIRE COMPTABILITE (SOUCHE)")}
            </div>
        </>
    );
});

ConsignationPrint.displayName = 'ConsignationPrint';

export default ConsignationPrint;
