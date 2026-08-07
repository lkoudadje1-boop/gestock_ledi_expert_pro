import React, { forwardRef } from 'react';

/**
 * Composant CloturePrint - Version Finale Format Procès-verbal d'Audit A5 Portrait
 * Dédié à l'impression analytique détaillée des bilans de sessions de caisse
 */
const CloturePrint = forwardRef((props, ref) => {
    const {
        clotureInfo = {},     // Contient les données de la ligne de clôture sélectionnée (incluant tous_details)
        company = {},         // Métadonnées de l'entreprise pour l'en-tête
        format = 'A5',        // Forcé par défaut sur le format A5 portrait
        userName = '---'      // Nom du caissier ou de l'utilisateur connecté
    } = props;

    // --- 🛡️ EXTRACTION ET NETTOYAGE DES FLUX FINANCIERS DE LA CLÔTURE ---
    const montantTheorique = Number(clotureInfo.THEORIQUE || clotureInfo.montant_total || 0);
    const montantReel = Number(clotureInfo.REEL || clotureInfo.montant_paye || 0);
    const écartCaisse = Number(clotureInfo.ÉCART || (montantReel - montantTheorique));

    // 🚀 CAPTURE DU TABLEAU RÉEL DES FLUX DE PAIEMENTS DÉTAILLÉS (DÉCOUPLAGE DEPUIS L'HISTORIQUE SÉLECTIONNÉ)
    const lignesMethodesCaisse = Array.isArray(clotureInfo.tous_details) ? clotureInfo.tous_details : [];

    // ==============================================================================
    // 💎 MOTEUR ALGORITHMIQUE DE CONVERSION NUMÉRIQUE EN TOUTES LETTRES (FRANÇAIS)
    // ==============================================================================
    const formaterMontantEnLettres = (montantInput) => {
        const nombre = Math.round(Math.abs(montantInput || 0));
        if (nombre === 0) return "Arrêté le présent bilan à la somme de : Zéro (0) Francs CFA.";

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
        
        if (!lettres) return `Arrêté le présent bilan à la somme de : Zéro (${nombre}) Francs CFA.`;

        const premiereLettre = lettres.substring(0, 1).toUpperCase();
        const resteDuTexte = lettres.substring(1);
        const lettresFinales = premiereLettre + resteDuTexte;
        
        return `Arrêté le présent bilan à la somme de : ${lettresFinales} (${new Intl.NumberFormat('fr-FR').format(nombre)}) Francs CFA.`;
    };

    return (
        <>
            {/* ✅ FEUILLE DE STYLE UNIQUE ET FORCEE POUR L'IMPRESSION COMPTABLE D'AUDIT SUR FORMAT A5 */}
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
                            background: #fff !important;
                            -webkit-print-color-adjust: exact;
                            print-color-adjust: exact;
                        }

                        .cloture-page {
                            width: 148mm !important;
                            max-width: 148mm !important;
                            min-height: 210mm !important;
                            box-sizing: border-box !important;
                            padding: 10mm !important;
                            margin: 0 !important;
                            position: absolute !important;
                            top: 0 !important;
                            left: 0 !important;
                            overflow: hidden !important;
                        }
                    }
                `}
            </style>

                    <div
                ref={ref}
                className="cloture-page"
                style={s.page(format)}
            >
                {/* EN-TÊTE DE LA FICHE D'IMPRESSION D'AUDIT */}
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
                            PROCÈS-VERBAL DE CLÔTURE
                        </h1>
                        <div style={s.distinctionBadge(format)}>
                            AUDIT DE FIN DE SESSION
                        </div>
                    </div>
                </div>

                {/* INFOS SOCIÉTÉ & EN-TÊTE CHRONOLOGIQUE */}
                <div style={s.infoGrid(format)}>
                    <div style={s.companyContact}>
                        <h3 style={s.blueText(format)}>{company.name || "LEDI EXPERT PRO"}</h3>
                        <p style={s.textSm(format)}>{company.address}</p>
                        <p style={s.textSm(format)}>Tél: {company.phone}</p>
                        <p style={s.textSm(format)}>Email: {company.email}</p>
                    </div>

                    <div style={s.invoiceMeta}>
                        <div style={s.metaBox(format)}>
                            <div style={s.metaHeader(format)}>SESSION ID</div>
                            <div style={s.metaContent(format)}>{clotureInfo.id || clotureInfo.id_cloture || '---'}</div>
                        </div>
                        <div style={s.metaBox(format)}>
                            <div style={s.metaHeader(format)}>DATE CLÔTURE</div>
                            <div style={s.metaContent(format)}>
                                {clotureInfo.DATE_CLÔTURE || clotureInfo.date_cloture || new Date().toLocaleDateString('fr-FR')}
                            </div>
                        </div>
                    </div>
                </div>

                       {/* DÉTAILS DE L'AGENT ET CONTEXTE */}
            <div style={s.clientGrid(format)}>
                    <div style={s.addressBlock}>
                        <div style={s.addressTitle(format)}>CAISSIER / COMPTABLE RESPONSABLE</div>
                        <div style={s.addressContent(format)}>
                            <p style={{ margin: '2px 0' }}><strong>{clotureInfo.UTILISATEUR || userName}</strong></p>
                            <p style={{ margin: '2px 0', fontSize: '11px', color: '#555' }}>Statut administratif: Arrêté validé</p>
                        </div>
                    </div>

                    <div style={s.addressBlock}>
                        <div style={s.addressTitle(format)}>MÉTHODE ANALYTIQUE</div>
                        <div style={s.addressContent(format)}>
                            <p style={{ margin: '2px 0' }}><strong>Rapprochement Multi-flux de caisse</strong></p>
                            <p style={{ margin: '2px 0', fontSize: '11px', color: '#555' }}></p>
                        </div>
                    </div>
                </div>

                {/* 📊 GRILLE FINANCIÈRE COMPTABLE AVEC TOUTES LES LIGNES ET DÉTAILS RÉELS PAR MÉTHODE */}
                <table style={s.table}>
                    <thead>
                        <tr>
                            <th style={{ ...s.th(format), width: '25%', textAlign: 'left' }}>MÉTHODE</th>
                            <th style={{ ...s.th(format), width: '20%', textAlign: 'right' }}>ATTENDU</th>
                            <th style={{ ...s.th(format), width: '20%', textAlign: 'right' }}>RÉEL</th>
                            <th style={{ ...s.th(format), width: '15%', textAlign: 'right' }}>ÉCART</th>
                            <th style={{ ...s.th(format), width: '20%', textAlign: 'left' }}>OBSERVATION</th>
                        </tr>
                    </thead>
                    <tbody>
                        {lignesMethodesCaisse.length === 0 ? (
                            <tr>
                                <td style={{ ...s.td(format), textAlign: 'left', fontWeight: 'bold' }}>Flux Unique (Générique)</td>
                                <td style={{ ...s.td(format), textAlign: 'right' }}>{Math.round(montantTheorique).toLocaleString()} F</td>
                                <td style={{ ...s.td(format), textAlign: 'right' }}>{Math.round(montantReel).toLocaleString()} F</td>
                                <td style={{ 
                                    ...s.td(format), textAlign: 'right', fontWeight: 'bold', 
                                    color: écartCaisse < 0 ? '#ef4444' : écartCaisse > 0 ? '#10b981' : '#000' 
                                }}>
                                    {écartCaisse > 0 ? `+${Math.round(écartCaisse).toLocaleString()}` : Math.round(écartCaisse).toLocaleString()} F
                                </td>
                                <td style={{ ...s.td(format), textAlign: 'left', color: '#64748b', fontStyle: 'italic' }}>---</td>
                            </tr>
                        ) : (
                            lignesMethodesCaisse.map((det, idx) => {
                                const theoreticalVal = Number(det.theorique || det.attendu || 0);
                                const realVal = Number(det.reel || 0);
                                const ecartVal = Number(det.ecart !== undefined ? det.ecart : (realVal - theoreticalVal));
                                return (
                                    <tr key={idx}>
                                        <td style={{ ...s.td(format), textAlign: 'left', fontWeight: 'bold' }}>{det.methode || 'Inconnu'}</td>
                                        <td style={{ ...s.td(format), textAlign: 'right' }}>{Math.round(theoreticalVal).toLocaleString()} F</td>
                                        <td style={{ ...s.td(format), textAlign: 'right' }}>{Math.round(realVal).toLocaleString()} F</td>
                                        <td style={{ 
                                            ...s.td(format), textAlign: 'right', fontWeight: 'bold', 
                                            color: ecartVal < 0 ? '#ef4444' : ecartVal > 0 ? '#10b981' : '#000' 
                                        }}>
                                            {ecartVal > 0 ? `+${Math.round(ecartVal).toLocaleString()}` : Math.round(ecartVal).toLocaleString()} F
                                        </td>
                                        <td style={{ ...s.td(format), textAlign: 'left', color: '#475569', fontStyle: 'italic', fontSize: '10px' }}>
                                            {det.commentaire || det.observation || '---'}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>

                {/* ZONE DU TOTAL COMPTABLE SYNTHÉTIQUE ET FINANCIER REPOSITIONNÉ */}
                <div style={s.bottomSection(format)}>
                    <div style={s.mentionLettres(format)}>
                        <p style={{ ...s.montantLettres(format), fontStyle: 'italic', lineHeight: 1.3 }}>
                            {formaterMontantEnLettres(montantReel)}
                        </p>
                    </div>

                    <div style={s.totalContainer(format)}>
                        <table style={s.totalTable}>
                            <tbody>
                                <tr>
                                    <td style={s.totalLabel(format)}>TOTAL ATTENDU</td>
                                    <td style={s.totalVal(format)}>
                                        {Math.round(montantTheorique).toLocaleString()} F
                                    </td>
                                </tr>
                                <tr>
                                    <td style={s.totalLabel(format)}>TOTAL RÉEL</td>
                                    <td style={s.totalVal(format)}>
                                        {Math.round(montantReel).toLocaleString()} F
                                    </td>
                                </tr>
                                <tr style={s.finalRow}>
                                    <td style={s.finalLabel(format)}>ÉCART TOTAL</td>
                                    <td style={{ 
                                        ...s.finalVal(format), 
                                        color: '#fff',
                                        fontWeight: 'bold'
                                    }}>
                                        {écartCaisse > 0 ? `+${Math.round(écartCaisse).toLocaleString()}` : Math.round(écartCaisse).toLocaleString()} F
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>


                {/* ZONE DE SIGNATURE POUR VALIDATION JURIDIQUE ET AUDIT */}
                <div style={s.signatureZone}>
                    <div style={s.signatureBlock}>
                        <p style={s.signatureTitle}>Signature Caissier / Déposant</p>
                        <div style={s.signatureLine}></div>
                    </div>
                    <div style={s.signatureBlock}>
                        <p style={s.signatureTitle}>Paraphe Contrôleur / Validateur</p>
                        <div style={s.signatureLine}></div>


                    </div>
                </div>

                            {/* FOOTER DE SECURITE DU PROCES-VERBAL */}
                <div style={s.footer(format)}>
                    <p style={s.typeDocument(format)}>
                        --- PROCES-VERBAL D'ARRETE DE CAISSE ET RAPPORT D'AUDIT ---
                    </p>
                    <div style={s.legalInfo(format)}>
                        <p style={{ margin: '2px 0' }}><strong>{company.name}</strong> — {company.address}</p>
                        <p style={{ margin: '2px 0' }}>Tél: {company.phone}</p>
                        <p style={{ fontSize: '9px', opacity: 0.6, margin: '2px 0' }}>
                            ERP LEDI EXPERT PRO - {new Date().getFullYear()}
                        </p>
                    </div>
                </div>

            </div>
        </>
    );
});

/* ================= STYLE DYNAMIQUE SÉCURISÉ CALIBRÉ POUR LE FORMAT A5 ================= */
const s = {
    page: (format) => ({
        fontFamily: '"Segoe UI", sans-serif',
        color: '#1e293b',
        background: '#fff',
        position: 'relative',
        boxSizing: 'border-box',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
    }),

    footer: (format) => ({
        position: 'absolute',
        bottom: '20px',
        left: '40px',
        right: '40px',
        textAlign: 'center',
        borderTop: '1px solid #eee',
        paddingTop: '6px'
    }),

    topHeader: { 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: 12 
    },
    
    logoContainer: { maxWidth: '30%' },
    logo: (format) => ({ maxHeight: 45, width: 'auto' }),
    logoPlaceholder: (format) => ({ 
        width: 45, 
        height: 45, 
        background: '#1e40af', 
        color: '#fff', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        fontWeight: 'bold',
        fontSize: 14
    }),

    titleContainer: { textAlign: 'right' },
    mainTitle: (format) => ({ fontSize: 18, color: '#1e40af', margin: 0, fontWeight: 'bold' }),
    distinctionBadge: (format) => ({ fontSize: 10, letterSpacing: 1, color: '#666', margin: 0 }),

    infoGrid: (format) => ({ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'flex-start',
        gap: 10,
        marginBottom: 12 
    }),

    companyContact: { flex: 1, minWidth: 0 },
    blueText: (format) => ({ color: '#1e40af', margin: '0 0 2px 0', fontSize: 12, fontWeight: 'bold' }),
    textSm: (format) => ({ fontSize: 10, margin: '1px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }),

    invoiceMeta: { display: 'flex', gap: 6, shrink: 0 },
    metaBox: (format) => ({ width: 85 }),
    metaHeader: (format) => ({ background: '#1e40af', color: '#fff', fontSize: 9, textAlign: 'center', padding: '2px 0', fontWeight: 'bold' }),
    metaContent: (format) => ({ border: '1px solid #ccc', textAlign: 'center', fontSize: 9, padding: '3px 0', fontWeight: 'bold' }),

    clientGrid: (format) => ({ 
        display: 'flex', 
        gap: 8, 
        marginBottom: 12 
    }),

    addressBlock: { flex: 1, border: '1px solid #e2e8f0', borderRadius: 4, overflow: 'hidden', minWidth: 0 },
    addressTitle: (format) => ({ background: '#f1f5f9', padding: '3px 6px', fontWeight: 'bold', fontSize: 9 }),
    addressContent: (format) => ({ fontSize: 10, padding: '4px 6px', lineHeight: 1.3 }),

    table: { 
        width: '100%', 
        borderCollapse: 'collapse',
        margin: '8px 0'
    },
    
    th: (format) => ({ 
        background: '#1e40af', 
        color: '#fff', 
        padding: '6px 8px', 
        fontSize: 10,
        fontWeight: 'bold'
    }),
    
    td: (format) => ({ 
        borderBottom: '1px solid #eee', 
        borderLeft: '1px solid #eee', 
        borderRight: '1px solid #eee', 
        padding: '6px 8px', 
        fontSize: 10,
        color: '#0f172a'
    }),

    bottomSection: (format) => ({ 
        display: 'flex', 
        justifyContent: 'space-between', 
        gap: 15,
        marginTop: 12 
    }),

    mentionLettres: (format) => ({ 
        flex: 1,
        minWidth: 0,
        backgroundColor: '#f8fafc',
        border: '1px dotted #cbd5e1',
        borderRadius: 4,
        padding: '6px'
    }),
    
    montantLettres: (format) => ({ 
        fontStyle: 'italic',
        color: '#475569', 
        fontSize: '9.5px',
        margin: 0
    }),

    totalContainer: (format) => ({ 
        flex: '0 0 40%',
        width: 'auto'
    }),

    totalTable: { width: '100%', borderCollapse: 'collapse' },
    totalLabel: (format) => ({ fontSize: 10, padding: '3px 0', textAlign: 'left', color: '#475569' }),
    totalVal: (format) => ({ textAlign: 'right', fontSize: 10, padding: '3px 0', fontWeight: '500' }),

    finalRow: { background: '#1e40af' },
    finalLabel: (format) => ({ color: '#fff', padding: '4px 6px', fontSize: 11, fontWeight: 'bold' }),
    finalVal: (format) => ({ color: '#fff', textAlign: 'right', padding: '4px 6px', fontSize: 11, fontWeight: 'bold' }),
    
    typeDocument: (format) => ({ fontSize: 9, margin: '1px 0', fontWeight: 'bold' }),
    legalInfo: (format) => ({ fontSize: 8, lineHeight: 1.1 }),

    signatureZone: {
        display: 'flex',
        justifyContent: 'space-between',
        marginTop: '25px',
        paddingTop: '10px',
        gap: '40px'
    },
    signatureBlock: {
        flex: 1,
        textAlign: 'center'
    },
    signatureTitle: {
        fontSize: '10px',
        fontWeight: 'bold',
        color: '#475569',
        margin: '0 0 35px 0'
    },
    signatureLine: {
        borderBottom: '1px dashed #cbd5e1',
        width: '80%',
        margin: '0 auto'
    }
};

CloturePrint.displayName = "CloturePrint";
export default CloturePrint;
