import React, { forwardRef } from 'react';
import { ConversionStockService } from '../../utils/converisonstock';

/**
 * Composant BonCommandePrint
 * Template A4 ultra-optimisé (polices et marges réduites) pour l'impression des bons de commande.
 * Supporte l'affichage dynamique du logo de l'entreprise.
 */
const BonCommandePrint = forwardRef((props, ref) => {
  const { 
    commande = {}, 
    articles = [], 
    company = {},
    avecValeurs = true,
    regimeTVA = 1 
  } = props;

  // --- HORODATAGE DE L'IMPRESSION ---
  const dateImpression = new Date().toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  // --- UTILS FORMATTAGE DES MONTANTS ---
  const fmt = (val) => {
    if (val === undefined || val === null || isNaN(val) || val === '') return "0";
    return Number(val).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  // --- STRUCTURE DES STYLES COMPACTS SANS GASPILLAGE D'ESPACE ---
  const styles = {
    container: {
      paddingTop: '15px',    // Conserve l'espace en haut
      paddingBottom: '15px', // Conserve l'espace en bas
      paddingLeft: '30px',   // Marges gauches augmentées pour plus d'espace
      paddingRight: '30px',  // Marges droites augmentées pour plus d'espace
      fontFamily: 'Segoe UI, Helvetica, Arial, sans-serif',
      color: '#0f172a',
      background: '#ffffff',
      width: '100%',
      boxSizing: 'border-box'
    },
    topGrid: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderBottom: '1.5px solid #0f172a',
      paddingBottom: '8px',
      marginBottom: '10px'
    },
    brandArea: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px'
    },
    logo: {
      width: '55px', // Taille compacte pour le logo d'entreprise
      height: '55px',
      objectFit: 'contain',
      borderRadius: '4px'
    },
    companyTitle: {
      margin: 0,
      fontSize: '13px', // Taille réduite
      fontWeight: '900',
      textTransform: 'uppercase',
      color: '#0f172a'
    },
    metaText: {
      margin: '1px 0',
      fontSize: '9.5px', // Taille fine
      color: '#475569',
      fontWeight: '600'
    },
    documentBadge: {
      textAlign: 'right'
    },
    title: {
      margin: 0,
      fontSize: '15px', // Titre resserré
      fontWeight: '900',
      textTransform: 'uppercase',
      color: '#2563eb',
      letterSpacing: '0.3px'
    },
    infoBar: {
      marginBottom: '8px', 
      fontSize: '10px', 
      borderBottom: '1px solid #e2e8f0', 
      paddingBottom: '4px',
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
      padding: '4px 3px', // Padding ultra-resserré
      fontSize: '9px', // Police optimisée
      fontWeight: '800',
      textAlign: 'center',
      textTransform: 'uppercase'
    },
    td: {
      border: '1px solid #e2e8f0',
      padding: '4px 3px', // Hauteur de ligne minime
      fontSize: '9.5px', // Lecture dense mais propre
      color: '#334155',
      textAlign: 'center',
      verticalAlign: 'middle'
    },
    observationsCard: {
      marginTop: '10px',
      padding: '6px',
      borderRadius: '4px',
      border: '1px dashed #cbd5e1',
      backgroundColor: '#f8fafc',
      fontSize: '9px',
      color: '#475569'
    }
  };




  return (
    <div ref={ref} style={styles.container}>
      
      {/* 🏛️ BLOC SUPÉRIEUR GRAPHISME : IDENTITÉ SÉCURISÉE AVEC LOGO */}
      <div style={styles.topGrid}>
        <div style={styles.brandArea}>
          {/* Rendu conditionnel du logo s'il existe dans les coordonnées de l'ERP */}
          {company.logo_data && (
            <img 
              src={company.logo_data.startsWith('data:') ? company.logo_data : `data:image/png;base64,${company.logo_data}`} 
              alt="Logo" 
              style={styles.logo} 
            />
          )}
          <div>
            <h2 style={styles.companyTitle}>{company.name || "LEDI EXPERT PRO"}</h2>
            <p style={styles.metaText}>{company.address}</p>
            <p style={styles.metaText}>{company.phone} | {company.email}</p>
          </div>
        </div>
        
        <div style={styles.documentBadge}>
          <h1 style={styles.title}>Bon de Commande</h1>
          <p style={{ ...styles.metaText, fontWeight: '900', color: '#0f172a', fontSize: '11px', marginTop: '2px' }}>
            RÉF : {commande.num_bon || "N/A"}
          </p>
          <p style={styles.metaText}>Émis le : {commande.date_commande ? new Date(commande.date_commande).toLocaleDateString('fr-FR') : dateImpression}</p>
          <p style={styles.metaText}>Imprimé le : {dateImpression}</p>
        </div>
      </div>

      {/* 📊 IDENTIFICATION DU TIERS FOURNISSEUR */}
      <div style={styles.infoBar}>
        <strong>FOURNISSEUR :</strong> {String(commande.fournisseur_nom || "Fournisseur Externe").toUpperCase()}
      </div>

      {/* 🚀 ARBORESCENCE DU TABLEAU COMPACT ET TRÈS FLUIDE SUR UNE SEULE PAGE */}
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={{ ...styles.th, textAlign: 'left', paddingLeft: '6px' }}>Désignation Article</th>
            <th style={{ ...styles.th, width: '130px' }}>Quantité Demandée</th>
            
            {/* Colonnes financières masquées automatiquement via le bouton SANS VALEURS */}
            {avecValeurs && <th style={{ ...styles.th, width: '85px', textAlign: 'right' }}>Prix U. Gros</th>}
            {avecValeurs && Number(regimeTVA) === 1 && <th style={{ ...styles.th, width: '75px', textAlign: 'right' }}>Base HT</th>}
            {avecValeurs && Number(regimeTVA) === 1 && <th style={{ ...styles.th, width: '75px', textAlign: 'right' }}>Taxe TVA</th>}
            {avecValeurs && <th style={{ ...styles.th, width: '95px', textAlign: 'right', paddingRight: '6px' }}>Valeur Estimée</th>}
          </tr>
        </thead>
        <tbody>
          {articles.length === 0 ? (
            <tr>
              <td colSpan={avecValeurs ? (Number(regimeTVA) === 1 ? 6 : 4) : 2} style={{ ...styles.td, color: '#64748b', padding: '12px' }}>
                Aucun article rattaché à ce bon de commande.
              </td>
            </tr>
          ) : (
            articles.map((art) => {
              const volumeAffiche = art.qte_net || art.qte_achetee;
              const prxGrosCalcule = Number(art.prix_achat_unitaire || 0) * Number(art.unit_coefficient || 1);

              return (
                <tr key={art.id || art.product_id} style={{ height: '22px' }}>
                  <td style={{ ...styles.td, textAlign: 'left', fontWeight: '700', color: '#0f172a', paddingLeft: '6px' }}>
                    {String(art.nom_article_snap || art.nom_article || 'Article').toUpperCase()}
                  </td>
                  <td style={{ ...styles.td, fontWeight: '900', color: '#2563eb' }}>
                    {volumeAffiche}
                  </td>
                  
                  {avecValeurs && (
                    <td style={{ ...styles.td, textAlign: 'right', fontWeight: '600' }}>
                      {fmt(prxGrosCalcule)} F
                    </td>
                  )}
                  {avecValeurs && Number(regimeTVA) === 1 && (
                    <td style={{ ...styles.td, textAlign: 'right' }}>
                      {fmt(art.montant_ht_net || art.montant_ht_ligne)} F
                    </td>
                  )}
                  {avecValeurs && Number(regimeTVA) === 1 && (
                    <td style={{ ...styles.td, textAlign: 'right', color: '#ef4444' }}>
                      {fmt(art.montant_tva_net || art.montant_tva_ligne)} F
                    </td>
                  )}
                  {avecValeurs && (
                    <td style={{ ...styles.td, textAlign: 'right', fontWeight: '800', color: '#10b981', paddingRight: '6px' }}>
                      {fmt(art.montant_ttc_net || art.montant_facture_ligne)} F
                    </td>
                  )}
                </tr>
              );
            })
          )}
        </tbody>

        {/* 🧮 PIED DE PAGE DE TOTALISATION UNIQUE */}
        {avecValeurs && articles.length > 0 && (
          <tfoot style={{ background: '#f8fafc', borderTop: '1.5px solid #0f172a', fontWeight: '800', fontSize: '10.5px' }}>
            <tr style={{ height: '24px' }}>
              <td style={{ ...styles.td, textAlign: 'right', paddingRight: '6px' }}>TOTAL GÉNÉRAL DU BON :</td>
              <td style={styles.td}>-</td>
              {Number(regimeTVA) === 1 ? <td colSpan="2" style={styles.td}></td> : <td style={styles.td}></td>}
              {Number(regimeTVA) === 1 && <td style={{ ...styles.td, textAlign: 'right', color: '#1e40af' }}>{fmt(commande.total_ht_global)} F</td>}
              {Number(regimeTVA) === 1 && <td style={{ ...styles.td, textAlign: 'right', color: '#ef4444' }}>{fmt(commande.total_tva_global)} F</td>}
              <td style={{ ...styles.td, textAlign: 'right', color: '#10b981', fontSize: '11px', paddingRight: '6px' }}>{fmt(commande.total_ttc_global || commande.total_facture)} F</td>
            </tr>
          </tfoot>
        )}
      </table>


    </div>
  );
});

BonCommandePrint.displayName = 'BonCommandePrint';

export default BonCommandePrint;
