import React, { forwardRef } from 'react';
// 🚀 IMPORTATION DU MODULE LOGISTIQUE CENTRALISÉ UNIQUE ANTI-NaN
import { ConversionStockService } from '../../utils/converisonstock';

// --- FORMATEUR FINANCIER GLOBAL DU LOGICIEL ---
const fmtPaper = (valeur) => {
    if (valeur === undefined || valeur === null || isNaN(valeur)) return "0";
    return new Intl.NumberFormat('fr-FR', {
        style: 'decimal',
        minimumFractionDigits: 0
    }).format(valeur);
};

/**
 * Composant StockAjustementPrint
 * Reçoit la session d'ajustement cliquée ainsi que la liste de ses articles impactés.
 */
const StockAjustementPrint = forwardRef((props, ref) => {
    const { 
        ajustement = {}, 
        company = {}, 
        format = 'A4' 
    } = props;

    // Récupération sécurisée du tableau des articles enfants
    const items = ajustement.items || [];

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
            padding: '5mm 8mm', // 🚀 Réduction drastique des marges intérieures latérales
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
            color: '#dc2626' // 🎨 Aligné sur la couleur réglementaire rouge des pertes
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
            color: '#dc2626'
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
            padding: fmt === 'A5' ? '3px 2px' : '4px 3px', // 🚀 RESSERREMENT DU PADDING DES TH
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
        badge: {
            padding: '1px 3.5px', // 🚀 REDUCTION PADDING BADGES LOGISTIQUES
            borderRadius: '4px',
            fontWeight: '800',
            fontSize: '8px', // 🚀 REDUCTION POLICE BADGES
            background: '#fee2e2',
            color: '#dc2626',
            whiteSpace: 'nowrap',
            display: 'inline-block'
        },
        footerSummary: {
            marginTop: '15px',
            borderTop: '2px solid #94a3b8',
            paddingTop: '10px',
            display: 'flex',
            justifyContent: 'flex-end'
        },
        summaryTable: {
            width: '280px',
            borderCollapse: 'collapse'
        },
        summaryLabel: {
            padding: '4px 0',
            fontSize: '11px',
            fontWeight: '700',
            color: '#475569',
            textAlign: 'left'
        },
        summaryValue: {
            padding: '4px 0',
            fontSize: '12px',
            fontWeight: '900',
            color: '#dc2626',
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
          <h1 style={s.docTitle}>Bordereau d'Ajustement</h1>
          <p style={s.docRef}>REF: ADJ-{ajustement.id || 'ECART'}</p>
          <p style={{ ...s.companyMeta, textAlign: 'right', marginTop: '4px' }}>
            Imprimé le : {dateRapport}
          </p>
        </div>
      </div>

      {/* --- CARTE D'IDENTITÉ DE LA SESSION D'AJUSTEMENT --- */}
      <div style={s.sessionCard}>
        <div>
          <span style={s.metaLabel}>Mouvement Logistique</span>
          <span style={{ ...s.metaValue, color: '#dc2626', textTransform: 'uppercase' }}>
            {ajustement.type_ajustement || 'AVARIE'}
          </span>
        </div>
        <div>
          <span style={s.metaLabel}>Libellé / Référence</span>
          <span style={s.metaValue}>
            {(ajustement.libelle || 'Ajustement Manuel').toUpperCase()}
          </span>
        </div>
        <div>
          <span style={s.metaLabel}>Date de Clôture</span>
          <span style={s.metaValue}>
            {ajustement.created_at || ajustement.closed_at 
              ? new Date(ajustement.created_at || ajustement.closed_at).toLocaleDateString('fr-FR', {
                  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                })
              : '---'
            }
          </span>
        </div>
        {ajustement.motif && (
          <div style={{ gridColumn: 'span 3', borderTop: '1px dashed #e2e8f0', paddingTop: '4px', marginTop: '2px' }}>
            <span style={s.metaLabel}>Motif Explicatif d'Audit</span>
            <span style={{ ...s.metaValue, fontStyle: 'italic', fontWeight: '600' }}>{ajustement.motif}</span>
          </div>
        )}
      </div>

      {/* --- TABLEAU DES FLUX DE STOCKS MANQUANTS ÉLARGI --- */}
      <table style={s.table}>
        <thead>
          <tr>
            <th style={{ ...s.th(format), textAlign: 'left', width: '35%' }}>Désignation Article</th>
            <th style={{ ...s.th(format), textAlign: 'center', width: '15%' }}>Stock Avant</th>
            <th style={{ ...s.th(format), textAlign: 'center', width: '15%' }}>Quantité Sortie</th>
            <th style={{ ...s.th(format), textAlign: 'center', width: '15%' }}>Stock Après</th>
            <th style={{ ...s.th(format), textAlign: 'right', width: '20%' }}>Valeur de la Perte</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan="5" style={{ ...s.td(format), textAlign: 'center', fontStyle: 'italic', padding: '20px' }}>
                Aucune ligne d'article enregistrée dans ce bordereau.
              </td>
            </tr>
          ) : (
            items.map((art, index) => {
              // 🚀 Utilisation stricte des clés nettes fournies par le composant historique
              const expAvant = art.stock_theorique_net || formaterStockImpression(art.stock_avant, art);
              const expApres = art.stock_reel_net || formaterStockImpression(art.stock_apres, art);
              const expEcart = art.ecart_net || `-${formaterStockImpression(art.quantite, art)}`;
              
              const valEcart = Math.round(Number(art.valeur_ecart_net || art.valeur_ligne || 0));

              return (
                <tr key={art.product_id || index} style={{ ...s.tr, backgroundColor: '#fef2f2' }}>
                  <td style={{ ...s.td(format), fontWeight: '700' }}>
                    {(art.nom_article_snap || art.nom || 'Article').toUpperCase()}
                  </td>
                  
                  <td style={{ ...s.td(format), textAlign: 'center', color: '#475569', fontWeight: '600', fontFamily: 'monospace' }}>
                    {expAvant}
                  </td>
                  
                  <td style={{ ...s.td(format), textAlign: 'center' }}>
                    <span style={s.badge}>
                      {expEcart}
                    </span>
                  </td>

                  <td style={{ ...s.td(format), textAlign: 'center', color: '#1e3a8a', fontWeight: '800', fontFamily: 'monospace' }}>
                    {expApres}
                  </td>
                  
                  <td style={{ 
                    ...s.td(format), 
                    textAlign: 'right', 
                    fontWeight: '900',
                    color: '#dc2626',
                    fontFamily: 'monospace'
                  }}>
                    -{fmtPaper(valEcart)} F
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
      {/* --- TOTALISATION FINANCIÈRE ET CHARGE COMPTABLE DES PERTES --- */}
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
            <tr>
              <td style={{ padding: '8px 0', fontSize: '10.5px', fontWeight: '900', color: '#0f172a' }}>
                VALEUR TOTALE AJUSTÉE
              </td>
              <td style={{
                padding: '8px 0',
                fontSize: '12px',
                fontWeight: '900',
                textAlign: 'right',
                color: '#dc2626' // Teinte réglementaire pour la perte financière
              }}>
                -{fmtPaper(ajustement.valeur_totale || items.reduce((sum, item) => sum + Math.round(Number(item.valeur_ligne || item.valeur_ecart_net || 0)), 0))} F CFA
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* --- BAS DE PAGE ET TRAÇABILITÉ FISCALE --- */}
      <div style={{ 
        textAlign: 'center', 
        textTransform: 'uppercase', 
        fontSize: '7.5px', 
        color: '#94a3b8', 
        marginTop: '40px', 
        borderTop: '1px solid #e2e8f0', 
        paddingTop: '6px', 
        letterSpacing: '0.05em', 
        fontWeight: '700' 
      }}>
        Bordereau Historique Officiel de Stock — Édité par l'administration LEDI EXPERT PRO.
      </div>

    </div>
  );
});

StockAjustementPrint.displayName = 'StockAjustementPrint';

export default StockAjustementPrint;
