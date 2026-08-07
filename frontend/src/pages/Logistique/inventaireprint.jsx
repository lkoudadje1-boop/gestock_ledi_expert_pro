import React, { forwardRef } from 'react';
// 🚀 IMPORTATION DU MODULE LOGISTIQUE CENTRALISÉ UNIQUE ANTI-NaN
import { ConversionStockService } from '../../utils/converisonstock';

/**
 * Composant InventairePrint
 * Reçoit la session d'inventaire cliquée ainsi que la liste de ses articles en écart.
 */
const InventairePrint = forwardRef((props, ref) => {
    const { 
        session = {}, 
        articles = [], 
        company = {}, 
        format = 'A4' 
    } = props;

    // Horodatage précis de la fiche de sortie
    const dateRapport = new Date().toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    // --- 🚀 UTILLITAIRE CENTRAL DE RENDU ALIGNÉ SUR LE PARC MACHINE DE L'ENTREPRISE ---
    const formaterStockImpression = (valeurStock, itemContexte) => {
        if (valeurStock === undefined || valeurStock === null || valeurStock === '') return "0 UNITÉ";
        
        // Si c'est déjà une chaîne textuelle formatée, on la renvoie brute
        if (typeof valeurStock === 'string' && isNaN(Number(valeurStock.trim()))) {
            return valeurStock.trim();
        }

        // Renvoi délégué à votre dictionnaire maître pour assainir le ticket
        return ConversionStockService.toExpressionTextuelle(valeurStock, itemContexte);
    };

    // --- GEOMÉTRIE GRAPHIQUE OPTIMISÉE POUR RÉDUIRE LES MARGES BLANCHES ---
    const s = {
        container: (fmt) => ({
            padding: '5mm 8mm', // 🚀 Réduction drastique des marges intérieures latérales (8mm au lieu de grands espaces)
            fontFamily: "'Segoe UI', Helvetica, Arial, sans-serif",
            color: '#0f172a',
            background: '#ffffff',
            width: '100%', // 🚀 Force l'étalement complet sur la largeur de la page physique
            maxWidth: fmt === 'A5' ? '148mm' : '210mm',
            height: 'auto', 
            boxSizing: 'border-box',
            fontSize: fmt === 'A5' ? '8px' : '8.5px' // 🚀 RESSERREMENT DE LA POLICE GLOBALE DU CONTAINER
        }),
        topBar: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '2px solid #0f172a',
            paddingBottom: '8px',
            marginBottom: '12px'
        },
        logoContainer: {
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
        },
        logoImage: {
            width: '45px',
            height: '45px',
            objectFit: 'contain',
            borderRadius: '6px'
        },
        companyName: {
            margin: 0,
            fontSize: '13px', // 🚀 DIMINUTION POLICE NOM ENTREPRISE
            fontWeight: '900',
            textTransform: 'uppercase',
            color: '#1e3a8a'
        },
        companyMeta: {
            margin: '1px 0 0 0',
            fontSize: '8.5px', // 🚀 DIMINUTION POLICE MÉTA ENTREPRISE
            color: '#475569',
            fontWeight: '600',
            lineHeight: 1.2
        },
        titleBox: {
            textAlign: 'right'
        },
        docTitle: {
            margin: 0,
            fontSize: '14px', // 🚀 DIMINUTION POLICE TITRE DOC
            fontWeight: '900',
            color: '#0f172a',
            textTransform: 'uppercase'
        },
        docRef: {
            margin: '2px 0 0 0',
            fontSize: '9px', // 🚀 DIMINUTION POLICE RÉF DOC
            fontWeight: '800',
            color: '#2563eb'
        },
        sessionCard: {
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '8px 10px', // 🚀 RESSERREMENT PADDING CARTE SÉCURITÉ
            marginBottom: '12px',
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '12px'
        },
        metaLabel: {
            fontSize: '8px', // 🚀 DIMINUTION POLICE LIBELLÉS METADATA
            color: '#64748b',
            textTransform: 'uppercase',
            fontWeight: '800',
            display: 'block',
            marginBottom: '2px'
        },
        metaValue: {
            fontSize: '9.5px', // 🚀 DIMINUTION POLICE VALEURS METADATA
            fontWeight: '700',
            color: '#1e293b'
        },
        table: {
            width: '100%',
            borderCollapse: 'collapse',
            marginTop: '8px',
            pageBreakInside: 'auto'
        },
        tr: {
            pageBreakInside: 'avoid',
            breakInside: 'avoid'
        },
        th: (fmt) => ({
            background: '#f1f5f9',
            color: '#1e293b',
            border: '1px solid #cbd5e1',
            padding: fmt === 'A5' ? '3px 2px' : '4px 3px', // 🚀 RESSERREMENT DU PADDING DES TH POUR PRENDRE MOINS DE PLACE
            fontSize: fmt === 'A5' ? '7.5px' : '8.2px', // 🚀 DIMINUTION FORCEE DES CARACTERES D'EN-TÊTE
            fontWeight: '800',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap' 
        }),
        td: (fmt) => ({
            border: '1px solid #e2e8f0',
            padding: fmt === 'A5' ? '3px 2px' : '4px 3px', // 🚀 RESSERREMENT DU PADDING DES TD
            fontSize: fmt === 'A5' ? '7.5px' : '8.5px', // 🚀 DIMINUTION FORCEE DES CARACTERES DE LIGNES
            color: '#334155',
            whiteSpace: 'nowrap' 
        }),
        badge: (type) => ({
            padding: '1px 3px', // 🚀 REDUCTION PADDING BADGES LOGISTIQUES
            borderRadius: '4px',
            fontWeight: '800',
            fontSize: '8px', // 🚀 REDUCTION POLICE BADGES
            background: type === 'surplus' ? '#dcfce7' : type === 'manquant' ? '#fee2e2' : '#f1f5f9',
            color: type === 'surplus' ? '#041f0e' : type === 'manquant' ? '#dc2626' : '#64748b',
            whiteSpace: 'nowrap' 
        }),
        footerSummary: {
            marginTop: '15px',
            borderTop: '2px solid #94a3b8',
            paddingTop: '10px',
            display: 'flex',
            justifyContent: 'flex-end'
        },
        summaryTable: {
            width: '260px',
            borderCollapse: 'collapse'
        },
        summaryLabel: {
            padding: '5px 0',
            fontSize: '11px',
            fontWeight: '700',
            color: '#475569',
            textAlign: 'left'
        },
        summaryValue: {
            padding: '5px 0',
            fontSize: '12px',
            fontWeight: '900',
            color: '#0f172a',
            textAlign: 'right'
        }
    };

    return (
        <div ref={ref} style={s.container(format)}>
            {/* 🚀 FORCE LE COMPOSANT À REPRENDRE TOUTE LA SURFACE DISPONIBLE AU MOMENT DE L'IMPRESSION */}
            <style>
                {`@media print { 
                    @page { margin: 5mm !important; } 
                    body { margin: 0 !important; }
                }`}
            </style>

      {/* --- ENTÊTE DE L'ENTREPRISE ET TITRE DU DOCUMENT --- */}
      <div style={s.topBar}>
        <div style={s.logoContainer}>
          {company.logo_data && (
            <img 
              src={company.logo_data} 
              alt="Logo" 
              style={s.logoImage} 
            />
          )}
          <div>
            <h2 style={s.companyName}>{company.name}</h2>
            <p style={s.companyMeta}>{company.address}</p>
            <p style={s.companyMeta}>{company.phone} {company.email !== 'Email: N/A' && `| ${company.email}`}</p>
          </div>
        </div>

        <div style={s.titleBox}>
          <h1 style={s.docTitle}>Rapport d'Inventaire</h1>
          <p style={s.docRef}>REF: INV-{session.id || session.ref_session || 'ECART'}</p>
          <p style={{ ...s.companyMeta, textAlign: 'right', marginTop: '4px' }}>
            Imprimé le : {dateRapport}
          </p>
        </div>
      </div>

      {/* --- CARTE D'IDENTITÉ DE LA SESSION D'INVENTAIRE --- */}
      <div style={s.sessionCard}>
        <div>
          <span style={s.metaLabel}>Opérateur / Créateur</span>
          <span style={s.metaValue}>
            {session.nom_utilisateur || session.user_name || 'Non renseigné'}
          </span>
        </div>
        <div>
          <span style={{ 
            ...s.metaValue, 
            color: (session.statut === 'valide' || session.statut === 'archive') ? '#04160b' : '#854d0e',
            textTransform: 'uppercase'
          }}>
            {session.statut || 'VALIDE'}
          </span>
        </div>
        <div>
          <span style={s.metaLabel}>Date de Clôture</span>
          <span style={s.metaValue}>
            {session.date_cloture || session.closed_at 
              ? new Date(session.date_cloture || session.closed_at).toLocaleDateString('fr-FR', {
                  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                })
              : '---'
            }
          </span>
        </div>
      </div>

      {/* --- TABLEAU DES ÉCARTS DE STOCK ÉLARGI ET SÉCURISÉ --- */}
      <table style={s.table}>
        <thead>
          <tr>
            <th style={{ ...s.th(format), textAlign: 'left', width: '22%' }}>Désignation Article</th>
            <th style={{ ...s.th(format), textAlign: 'center', width: '85px' }}>Stk Théo</th>
            <th style={{ ...s.th(format), textAlign: 'center', width: '90px' }}>Valeur Théo</th>
            <th style={{ ...s.th(format), textAlign: 'center', width: '85px' }}>Stk Réel</th>
            <th style={{ ...s.th(format), textAlign: 'center', width: '90px' }}>Valeur Réel</th>
            <th style={{ ...s.th(format), textAlign: 'center', width: '100px' }}>Écart Logistique</th>
            <th style={{ ...s.th(format), textAlign: 'right', width: '75px' }}>P.U Vente</th>
            <th style={{ ...s.th(format), textAlign: 'right', width: '85px' }}>Valeur Écart</th>
          </tr>
        </thead>
        <tbody>
          {articles.length === 0 ? (
            <tr>
              <td colSpan="8" style={{ ...s.td(format), textAlign: 'center', fontStyle: 'italic', padding: '20px' }}>
                Aucun écart de stock enregistré pour cette session.
              </td>
            </tr>
) : (
            articles.map((art, index) => {
              const expTheorique = art.stock_theorique_net;
              const expReelle = art.stock_reel_net;
              const expEcart = art.ecart_net;
              
              const valEcart = Number(art.valeur_ecart_net || 0);
              const vTheo = Number(art.valeur_theorique_net || 0);
              const vReel = Number(art.valeur_reel_net || 0);

              const pUnit = Number(art.prix_unitaire_snap || art.prix_achat_snap || art.prix_unitaire || 0);

              let rowBackground = '#ffffff'; 
              let typeBadge = "neutre";

              if (valEcart > 0) {
                typeBadge = "surplus";
              } else if (valEcart < 0) {
                typeBadge = "manquant";
                rowBackground = '#fef2f2'; 
              }

              return (
                <tr key={art.id || index} style={{ ...s.tr, backgroundColor: rowBackground }}>
                  <td style={{ ...s.td(format), fontWeight: '700' }}>
                    {(art.nom_article_snap || art.nom_article || 'Article').toUpperCase()}
                  </td>
                  
                  <td style={{ ...s.td(format), textAlign: 'center', color: '#475569', fontWeight: '600' }}>
                    {expTheorique}
                  </td>

                  <td style={{ ...s.td(format), textAlign: 'center', color: '#64748b', fontWeight: '600' }}>
                    {vTheo.toLocaleString('fr-FR')} F
                  </td>
                  
                  <td style={{ ...s.td(format), textAlign: 'center', color: '#2563eb', fontWeight: '800' }}>
                    {expReelle}
                  </td>

                  <td style={{ ...s.td(format), textAlign: 'center', color: '#64748b', fontWeight: '600' }}>
                    {vReel.toLocaleString('fr-FR')} F
                  </td>
                  
                  <td style={{ ...s.td(format), textAlign: 'center' }}>
                    <span style={s.badge(typeBadge)}>
                      {expEcart}
                    </span>
                  </td>
                  
                  <td style={{ ...s.td(format), textAlign: 'right' }}>
                    {pUnit.toLocaleString('fr-FR')} F
                  </td>
                  
                  <td style={{ 
                    ...s.td(format), 
                    textAlign: 'right', 
                    fontWeight: '900',
                    color: valEcart < 0 ? '#dc2626' : valEcart > 0 ? '#052210' : '#334155' 
                  }}>
                    {valEcart.toLocaleString('fr-FR')} F
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>

      <div style={{
        marginTop: '15px',
        borderTop: '2px solid #0f172a',
        paddingTop: '10px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        width: '100%'
      }}>
        <table style={{ width: '340px', borderCollapse: 'collapse', fontSize: '9.5px' }}>
          <tbody>
            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: '5px 0', fontWeight: '700', color: '#475569' }}>VALEUR THÉORIQUE TOTALE STOCK</td>
              <td style={{ padding: '5px 0', fontWeight: '800', color: '#0f172a', textAlign: 'right' }}>
                {Number(
                  session.valeur_theo_totale ?? 
                  session.valeur_theo ?? 
                  session.valeur_theorique_totale ?? 
                  session.valeur_theorique ?? 
                  0
                ).toLocaleString('fr-FR')} F
              </td>
            </tr>

            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: '5px 0', fontWeight: '700', color: '#475569' }}>VALEUR RÉELLE TOTALE STOCK</td>
              <td style={{ padding: '5px 0', fontWeight: '800', color: '#2563eb', textAlign: 'right' }}>
                {Number(
                  session.valeur_reel_totale ?? 
                  session.valeur_reel ?? 
                  session.valeur_reelle_totale ?? 
                  session.valeur_reelle ?? 
                  0
                ).toLocaleString('fr-FR')} F
              </td>
            </tr>
            
            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: '5px 0', fontWeight: '700', color: '#dc2626' }}>TOTAL DES MANQUANTS (-)</td>
              <td style={{ padding: '5px 0', fontWeight: '900', color: '#dc2626', textAlign: 'right' }}>
                {articles.reduce((sum, art) => {
                  const val = Number(art.valeur_ecart_net || 0);
                  return val < 0 ? sum + val : sum;
                }, 0).toLocaleString('fr-FR')} F
              </td>
            </tr>

            <tr style={{ borderBottom: '2px solid #0f172a' }}>
              <td style={{ padding: '5px 0', fontWeight: '700', color: '#031f0d' }}>TOTAL DES SURPLUS (+)</td>
              <td style={{ padding: '5px 0', fontWeight: '900', color: '#021b0b', textAlign: 'right' }}>
                {articles.reduce((sum, art) => {
                  const val = Number(art.valeur_ecart_net || 0);
                  return val > 0 ? sum + val : sum;
                }, 0).toLocaleString('fr-FR')} F
              </td>
            </tr>

            <tr>
              <td style={{ padding: '8px 0', fontSize: '10.5px', fontWeight: '900', color: '#0f172a' }}>SOLDE DE L'AJUSTEMENT</td>
              <td style={{
                padding: '8px 0',
                fontSize: '11px',
                fontWeight: '900',
                textAlign: 'right',
                color: articles.reduce((sum, art) => sum + Number(art.valeur_ecart_net || 0), 0) < 0 ? '#dc2626' : '#062512'
              }}>
                {articles.reduce((sum, art) => {
                  return sum + Number(art.valeur_ecart_net || 0);
                }, 0).toLocaleString('fr-FR')} F
              </td>
            </tr>
          </tbody>
        </table>

      </div>

    </div>
  );
});

InventairePrint.displayName = 'InventairePrint';

export default InventairePrint;
