import React, { forwardRef } from 'react';
import conversestock from '../../services/conversestock'; // 🚀 IMPORTATION DU MODULE LOGISTIQUE CENTRALISÉ

const StockPrint = forwardRef((props, ref) => {
  const { 
    articles = [], 
    companyName = 'Ledi Expert Pro', 
    showFinancials = true, 
    totalStock = 0 
  } = props;

  const dateImpression = new Date().toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  // --- 🚀 UTILLITAIRE DE RECONVERSION LOGISTIQUE LOCAL POUR L'IMPRESSION D'INVENTAIRE ---
  const fmtStockLocal = (row) => {
    if (!row) return "-";
    
    const coeff = Number(row.coefficient || row.unit_coefficient || row.coeff || 1);
    const codeGros = String(row.unit_code_gros || row.unite_code || row.code || 'CS').toUpperCase().trim();
    const refDetail = String(row.unit_ref_detail || row.unite_reference || 'UNITÉ').replace(/\(s\)/g, '').toUpperCase().trim();

    // 1. 🛡️ EXTRACTION ET SÉCURISATION DU STOCK BRUT
    const sourceStock = row.stock ?? row.stock_virtuel ?? row.stock_actuel ?? 0;
    let qteBrutePieces = 0;

    if (typeof sourceStock === 'string') {
      // Si la chaîne contient un "+", on additionne le gros et le détail
      if (sourceStock.includes('+')) {
        const parties = sourceStock.split('+');
        const gros = parseFloat(parties[0]) || 0;
        const detail = parseFloat(parties[1]) || 0;
        qteBrutePieces = (gros * coeff) + detail;
      } else {
        // Supprime tout le texte (ex: "BOUTEILLE", "NaN") pour ne garder que le premier nombre
        const extractionNumerique = sourceStock.replace(/[^\d.-]/g, '');
        qteBrutePieces = parseFloat(extractionNumerique) || 0;
      }
    } else {
      qteBrutePieces = Number(sourceStock) || 0;
    }

    // 2. 🛡️ FILTRE DE SÉCURITÉ : Si la quantité finale est invalide ou <= 0, on renvoie proprement 0
    if (isNaN(qteBrutePieces) || qteBrutePieces <= 0) {
      return `0 ${refDetail}`;
    }

    // 3. CALCUL DU RENDU LOGISTIQUE
    if (coeff > 1) {
      const grosEntiers = Math.floor(qteBrutePieces / coeff);
      const restesDetail = Math.round(qteBrutePieces % coeff);

      if (grosEntiers > 0 && restesDetail > 0) {
        return `${grosEntiers} ${codeGros} + ${restesDetail} ${refDetail}`;
      } else if (grosEntiers > 0) {
        return `${grosEntiers} ${codeGros}`;
      } else {
        return `${restesDetail} ${refDetail}`;
      }
    }
    
    return `${Math.round(qteBrutePieces)} ${refDetail}`;
  };

  // --- 🚀 NOUVEAU : UTILITAIRE CENTRAL D'EXTRACTION NUMÉRIQUE POUR LE BLOC 2 (FINANCIER) ---
  const extraireStockNumeriqueBase = (art) => {
    if (!art) return 0;
    const coeff = Number(art.coefficient || art.unit_coefficient || art.coeff || 1);
    const sourceStock = art.stock ?? art.stock_virtuel ?? art.stock_actuel ?? 0;
    
    if (typeof sourceStock === 'string') {
      if (sourceStock.includes('+')) {
        const parties = sourceStock.split('+');
        const gros = parseFloat(parties[0]) || 0;
        const detail = parseFloat(parties[1]) || 0;
        return (gros * coeff) + detail;
      }
      const nettoyage = sourceStock.replace(/[^\d.-]/g, '');
      return parseFloat(nettoyage) || 0;
    }
    return Number(sourceStock) || 0;
  };

  const styles = {
    container: {
      padding: '15px',
      fontFamily: 'Segoe UI, Helvetica, Arial, sans-serif',
      color: '#0f172a',
      background: '#ffffff',
      width: '100%', // S'adapte dynamiquement au format demandé (A4/A5)
      boxSizing: 'border-box'
    },
    topBar: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      borderBottom: '2px solid #0f172a',
      paddingBottom: '8px',
      marginBottom: '12px'
    },
    title: {
      margin: 0,
      fontSize: '18px',
      fontWeight: '900',
      textTransform: 'uppercase',
      letterSpacing: '0.5px'
    },
    metaText: {
      margin: 0,
      fontSize: '11px',
      color: '#475569',
      fontWeight: '600'
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse',
      marginTop: '5px'
    },
    th: {
      background: '#f1f5f9',
      color: '#1e293b',
      border: '1px solid #cbd5e1',
      padding: '6px 4px',
      fontSize: '10px',
      fontWeight: '800',
      textAlign: 'left',
      textTransform: 'uppercase'
    },
    td: {
      border: '1px solid #e2e8f0',
      padding: '6px 4px',
      fontSize: '10px',
      color: '#334155',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    },
    tfoot: {
      background: '#f8fafc',
      borderTop: '2px solid #94a3b8',
      fontWeight: 'bold'
    }
  };

  return (
    <div ref={ref} style={styles.container}>
      
      <div style={styles.topBar}>
        <div>
          <h2 style={styles.title}>État de Stock</h2>
          <p style={{ ...styles.metaText, marginTop: '2px', color: '#0f172a', fontSize: '12px' }}>
            {companyName}
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={styles.metaText}>Imprimé le : {dateImpression}</p>
        </div>
      </div>

      <table style={styles.table}>
        <thead>
          <tr>
            <th style={{ ...styles.th, width: '40px' }}>ID</th>
            <th style={styles.th}>Désignation Article</th>
            <th style={{ ...styles.th, width: '55px' }}>Unité</th>
            
            {showFinancials && <th style={{ ...styles.th, width: '55px', textAlign: 'right' }}>CMP</th>}
            {showFinancials && <th style={{ ...styles.th, width: '55px', textAlign: 'right' }}>P. Vente</th>}
            
            <th style={{ ...styles.th, width: '90px', textAlign: 'center' }}>Stock SYS</th>

            {showFinancials && <th style={{ ...styles.th, width: '65px', textAlign: 'right' }}>Val. Achat</th>}
            {showFinancials && <th style={{ ...styles.th, width: '65px', textAlign: 'right' }}>Val. Vente</th>}

            <th style={{ ...styles.th, width: '55px', textAlign: 'center', background: '#f8fafc', border: '1px solid #94a3b8' }}>Qté Réelle</th>
            <th style={{ ...styles.th, width: '90px', background: '#f8fafc', border: '1px solid #94a3b8' }}>Observation</th>
          </tr>
        </thead>
        <tbody>
          {articles.map((art) => {
            // 🚀 APPEL À L'UTILITAIRE ASSAINI DU BLOC 1 CONTRE LES STRINGS POLUÉES
            const qtePieces = extraireStockNumeriqueBase(art);
            const cmpGlobal = Number(art.cmp || art.prix_achat || 0);
            const pxVenteGlobal = Number(art.prixVente || art.prix_vendre || art.prix_vente || 0);
            const coeff = Number(art.coefficient || art.unit_coefficient || art.coeff || 1);

            // 🧮 PROTECTION VALORISATION COMPTABLE SECURISEE SANS AUCUN NAN
            const valeurAchatLigne = qtePieces * (cmpGlobal / coeff);
            const valeurVenteLigne = qtePieces * (pxVenteGlobal / coeff);
            return (
              <tr key={art.id}>
                <td style={{ ...styles.td, fontFamily: 'monospace', fontWeight: 'bold' }}>
                  {art.id || art.id_article}
                </td>
                
                {/* 🏷️ CELLULE NOM + [FAMILLE • CATÉGORIE • GROUPE] JUSTE EN BAS */}
                <td style={{ ...styles.td, fontWeight: '700' }}>
                  <div>{art.nom}</div>
                  {(art.famille_nom || art.category_nom || art.group_nom) && (
                    <div style={{ fontSize: '7.5px', color: '#64748b', fontWeight: '500', marginTop: '1px', whiteSpace: 'nowrap' }}>
                      {[art.famille_nom, art.category_nom, art.group_nom].filter(Boolean).join(' • ')}
                    </div>
                  )}
                </td>

                <td style={styles.td}>
                  {art.unite_libelle || art.conditionnement || 'U'}
                </td>

                {showFinancials && (
                  <td style={{ ...styles.td, textAlign: 'right' }}>
                    {cmpGlobal.toLocaleString('fr-FR')} F
                  </td>
                )}
                {showFinancials && (
                  <td style={{ ...styles.td, textAlign: 'right' }}>
                    {pxVenteGlobal.toLocaleString('fr-FR')} F
                  </td>
                )}
                
                {/* 🚀 RENDU FORMATÉ STABLE GROS + DÉTAIL DYNAMIQUE */}
                <td style={{ ...styles.td, textAlign: 'center', fontWeight: 'bold', color: qtePieces > 0 ? '#0284c7' : '#dc2626' }}>
                  {fmtStockLocal(art)}
                </td>

                {/* 🔒 VALORISATIONS INDIVIDUELLES NETTOYÉES À VIRGULE FLUIDE */}
                {showFinancials && (
                  <td style={{ ...styles.td, textAlign: 'right' }}>
                    {valeurAchatLigne.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} F
                  </td>
                )}
                {showFinancials && (
                  <td style={{ ...styles.td, textAlign: 'right' }}>
                    {valeurVenteLigne.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} F
                  </td>
                )}

                <td style={{ ...styles.td, background: '#ffffff', border: '1px solid #94a3b8', height: '24px' }}></td>
                <td style={{ ...styles.td, background: '#ffffff', border: '1px solid #94a3b8', color: '#cbd5e1' }}>.......................</td>
              </tr>
            );
          })}
        </tbody>

        <tfoot style={styles.tfoot}>
          <tr>
            <td colSpan="2" style={{ ...styles.td, textAlign: 'right', fontWeight: 'bold' }}>
              TOTAL GÉNÉRAL :
            </td>
            <td style={styles.td}></td>

            {showFinancials && <td style={styles.td}></td>}
            {showFinancials && <td style={styles.td}></td>}

            {/* Affiche le nombre total brut de pièces à l'inventaire */}
            <td style={{ ...styles.td, textAlign: 'center', fontWeight: 'bold', color: '#0284c7', fontSize: '9px' }}>
              {totalStock} UNITÉS
            </td>


            {/* 🚀 COMPTABILISATION DES TOTALISATEURS SÉCURISÉE CONTRE TOUTE CONTAMINATION NAN */}
            {showFinancials && (
              <td style={{ ...styles.td, textAlign: 'right' }}>
                {articles.reduce((acc, a) => {
                  const q = extraireStockNumeriqueBase(a);
                  const c = Number(a.cmp || 0);
                  const co = Number(a.coefficient || a.unit_coefficient || 1);
                  return acc + (q * (c / co));
                }, 0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} F
              </td>
            )}
            {showFinancials && (
              <td style={{ ...styles.td, textAlign: 'right' }}>
                {articles.reduce((acc, a) => {
                  const q = extraireStockNumeriqueBase(a);
                  const p = Number(a.prixVente || a.prix_vente || 0);
                  const co = Number(a.coefficient || a.unit_coefficient || 1);
                  return acc + (q * (p / co));
                }, 0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} F
              </td>
            )}

            <td style={{ ...styles.td, background: '#f8fafc', borderTop: '2px solid #94a3b8' }}></td>
            <td style={{ ...styles.td, background: '#f8fafc', borderTop: '2px solid #94a3b8' }}></td>
          </tr>
        </tfoot>
      </table>

    </div>
  );
});

StockPrint.displayName = 'StockPrint';

export default StockPrint;
