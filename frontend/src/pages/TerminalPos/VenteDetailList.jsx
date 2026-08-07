import React, { useState, useEffect, useMemo, useCallback } from 'react';
// 🎯 Ajout de BarChart3 pour l'icône de génération de graphiques
import { RefreshCw, Calendar, ArrowUpDown, ChevronUp, ChevronDown, BarChart3, User } from 'lucide-react'; 
import Sidebar from '../../components/Sidebar';
import API from '../../services/api'; 
// 📦 BRANCHEMENT LOGIQUE DU SERVICE CENTRALISE SUR LE CHEMIN CORRIGÉ SANS FAILLE
import { ConversionStockService } from '../../utils/converisonstock';
import '../Dashboard.css';

// 🛑 SUPPRESSION DE L'IMPORT RECHARTS QUI PROVOQUAIT LE CONFLIT 'useContext'

// Note : getUserPermissions() est supposé être accessible globalement ou importé dans votre scope
const VenteDetailList = () => {

  
  // 🛡️ ACCÈS AUX PERMISSIONS VIA VOTRE MÉTHODE GLOBALE COMPATIBLE TYPES SATELLITES
  const userPerms = useMemo(() => {
    try {
      if (typeof getUserPermissions === 'function') {
        return getUserPermissions() || {};
      }
    } catch (e) {
      console.error("Erreur lors de la récupération des permissions:", e);
    }
    return {};
  }, []);
  
  // 🔑 EXTRACTION GRANULAIRE ET SÉCURISÉE DE VOTRE CLÉ DE REVIENT/MARGES
  const canViewMarge = useMemo(() => {
    const val = userPerms['pos_view_marge'];
    return val === true || val === 1 || val === 'true' || val === '1';
  }, [userPerms]);

  // 🛡️ ANCRE DE SÉCURITÉ DE HAUT NIVEAU COMPOSANTS : VÉRIFICATION ADMIN VIA LOCALSTORAGE
  const hasMargeAccess = useMemo(() => {
    try {
      const localUserJson = localStorage.getItem('user') || localStorage.getItem('currentUser');
      const connectedUser = localUserJson ? JSON.parse(localUserJson) : null;
      const isAdmin = connectedUser?.role?.toUpperCase() === 'ADMIN';
      
      // Si c'est l'ADMIN d'entreprise il voit tout, sinon on applique strictement sa permission granulaire
      return isAdmin || canViewMarge;
    } catch (err) {
      console.error("Erreur parsing localStorage user:", err);
      return canViewMarge; // Repli de secours sur le droit granulaire en cas d'échec
    }
  }, [canViewMarge]);

  // --- 🚀 BRANCHEMENT DU MOTEUR CENTRAL DE CONVERSION (ANTI-LITIGE) ---
  const formaterStockPOS = useCallback((valeurPieces, rowContexte) => {
    if (valeurPieces === undefined || valeurPieces === null) return "-";
    
    // 1. 🛡️ VERROU CRITIQUE : Si c'est déjà une chaîne formatée contenant l'expression textuelle
    if (typeof valeurPieces === 'string' && isNaN(Number(valeurPieces.trim()))) {
        return valeurPieces;
    }

    // 2. Branchement direct sur le moteur d'expression textuelle du service centralisé
    const qtePiecesNum = Number(valeurPieces) || 0;
    const expressionTextuelleCentrale = ConversionStockService.toExpressionTextuelle(qtePiecesNum, rowContexte);

    return qtePiecesNum < 0 ? `-${expressionTextuelleCentrale}` : expressionTextuelleCentrale;
  }, []);

  // --- ÉTATS ---
  const [ventes, setVentes] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // 🎯 ÉTATS POUR LE FILTRE DES CLIENTS
  const [customers, setCustomers] = useState([]); 
  const [selectedCustomerId, setSelectedCustomerId] = useState('');

  // 📈 ÉTAT POUR L'OUVERTURE DE LA MODALE DES GRAPHIQUES DECISIONNELS
  const [showCharts, setShowCharts] = useState(false);

  // 🔒 SÉCURISATION DE SÉCURITÉ DE POSTE INTERNE : Fermeture forcée de la modale graphique sans accès requis
  useEffect(() => {
    if (showCharts && !hasMargeAccess) {
        setShowCharts(false);
    }
  }, [showCharts, hasMargeAccess]);

  // 📅 AJOUT DES ÉTATS DATE DÉBUT ET FIN (Par défaut à la date du jour)
  const todayStr = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(todayStr); 
  const [endDate, setEndDate] = useState(todayStr); 
  
  const [sortConfig, setSortConfig] = useState({ key: 'nom_article', direction: 'asc' });
  const [filterId, setFilterId] = useState('');
  const [filterNom, setFilterNom] = useState('');

  // 🎯 CHARGEMENT INITIAL DES CLIENTS DEPUIS VOTRE ROUTE EXISTANTE /api/customers
  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const res = await API.get('/customers');
        const data = res.data.data || res.data;
        setCustomers(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Erreur récupération clients:", err);
      }
    };
    fetchCustomers();
  }, []);

  // --- RÉCUPÉRATION DES DONNÉES SÉCURISÉE AVEC PLAGE DE DATES ET FILTRE CLIENT ---
  const fetchVentes = async () => {
    try {
        setLoading(true);
        
        // Formatage de la date de début (JJ/MM/AAAA)
        const [sYear, sMonth, sDay] = startDate.split('-');
        const formattedStartDate = `${sDay}/${sMonth}/${sYear}`;
        
        // Formatage de la date de fin (JJ/MM/AAAA)
        const [eYear, eMonth, eDay] = endDate.split('-');
        const formattedEndDate = `${eDay}/${eMonth}/${eYear}`;
        
        // 🎯 Appel API adapté avec injection dynamique du customer_id
        let url = `/sales/details?date_debut=${formattedStartDate}&date_fin=${formattedEndDate}`;
        if (selectedCustomerId) {
            url += `&customer_id=${selectedCustomerId}`;
        }
        
        const res = await API.get(url);
        const data = res.data.data || res.data;
        setVentes(Array.isArray(data) ? data : []);
    } catch (err) {
        console.error("Erreur récupération:", err);
    } finally {
        setLoading(false);
    }
  };
// 🎯 Re-déclenchement dès que la date ou le filtre client sélectionné change
  useEffect(() => { 
    fetchVentes(); 
  }, [startDate, endDate, selectedCustomerId]);

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };
// =========================================================================
// 📦 REGROUPEMENT PAR ARTICLE FILTRÉ PAR CLIENT (VERSION ALIGNÉE TEXTE)
// =========================================================================
const ventesRegroupeesParProduit = useMemo(() => {
  let ventesFiltreesParClient = [...ventes];
  
  // 💡 selectedCustomerId contient maintenant le nom du client sélectionné
  if (selectedCustomerId) {
    const nomCherche = selectedCustomerId.toLowerCase().trim();

    ventesFiltreesParClient = ventesFiltreesParClient.filter(current => {
      // On extrait le nom écrit sur la ligne de vente brute de l'API
      const nomLigne = (
        current.client_nom || 
        current.nom_client || 
        current.nom_client_snap || 
        current.client_nom_snap || 
        current.customer_name || 
        current.client ||
        ''
      ).toLowerCase().trim();

      // On vérifie si le nom cherché est inclus dans la ligne
      return nomLigne.includes(nomCherche);
    });
  }

  // Effectue ensuite le regroupement par article et par unité de manière étanche [b4]
  const dictionnaire = ventesFiltreesParClient.reduce((acc, current) => {
    const id = current.id_article || current.article_id || 'INCONNU';
    
    // 🎯 CLÉ FINANCIÈRE UNIQUE : Extraction du prix unitaire de la pièce pour isoler CS et CS2 sans erreur SQL
    const puVenteUnitaire = Number(current.prix_unitaire || current.prix_vente || 0);
    
    // 🎯 ALIGNEMENT LOGISTIQUE : Extraction des libellés et coefficients par le service unifié [b5]
    const metaLogistique = ConversionStockService.getMetadata(current);
    
    // Si le prix de la pièce est inférieur au tarif du gros standard, on force visuellement le libellé à refléter l'unité alternative
    const estPrixUnitaireReduit = current.prix_unitaire && current.prix_unitaire < (current.prix_vente / metaLogistique.coeff);
    const libelleUniteAjuste = estPrixUnitaireReduit ? "CASIER (DEMI)" : String(current.unite_libelle || current.unite_libelle_snap || current.unite_code || metaLogistique.codeGros).trim().toUpperCase();
    const codeUniteFinal = estPrixUnitaireReduit ? "CS2" : String(current.unite_code || metaLogistique.codeGros).trim().toUpperCase();
    
    // 💡 UNIQUE CLÉ COMBINÉE FINANCIÈRE ET LOGISTIQUE CORRIGÉE : Sépare hermétiquement CS et CS2
    const uniqueKey = `${id}_${puVenteUnitaire}_${codeUniteFinal}`;
    
    const qtePiecesLigne = Number(current.quantite || current.qte || 0);
    
    const achatLigne = (Number(current.prix_achat || current.cmp || 0)) * qtePiecesLigne;
    const textVenteLigne = current.montant_ttc_ligne || current.total_ttc;
    const venteLigne = textVenteLigne !== undefined ? Number(textVenteLigne) : (puVenteUnitaire * qtePiecesLigne);

    if (!acc[uniqueKey]) {
      acc[uniqueKey] = {
        ...current,
        id_article: id,
        quantite: 0,
        achatTotal: 0,
        venteTotal: 0,
        // On adapte le coefficient au prorata financier de la ligne si c'est un demi-casier
        coefficient: estPrixUnitaireReduit ? Math.round(metaLogistique.coeff / 2) : metaLogistique.coeff,
        unite_libelle: libelleUniteAjuste,
        unite_code: codeUniteFinal,
        unite_reference: metaLogistique.refDetail
      };
    }

    acc[uniqueKey].quantite += qtePiecesLigne;
    acc[uniqueKey].achatTotal += achatLigne;
    acc[uniqueKey].venteTotal += venteLigne;
    
    return acc;
  }, {});

  return Object.values(dictionnaire);
}, [ventes, selectedCustomerId]);



  // --- FILTRAGE ET TRI DES ARTICLES UNIQUES ---
  const filteredVentes = useMemo(() => {
    return ventesRegroupeesParProduit.filter(v => {
      const artId = (v.id_article || '').toString().toLowerCase();
      const artNom = (v.nom_article_snap || v.nom_article || v.nom || '').toLowerCase();
      return artId.includes(filterId.toLowerCase()) && artNom.includes(filterNom.toLowerCase());
    }).sort((a, b) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];
      
      if (sortConfig.key === 'quantite') {
        aVal = a.quantite;
        bVal = b.quantite;
      } else if (sortConfig.key === 'marge') {
        aVal = a.venteTotal - a.achatTotal;
        bVal = b.venteTotal - b.achatTotal;
      } else if (sortConfig.key === 'id_article') {
        aVal = String(a.id_article);
        bVal = String(b.id_article);
      } else if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }
      
      return (aVal < bVal ? -1 : aVal > bVal ? 1 : 0) * (sortConfig.direction === 'asc' ? 1 : -1);
    });
  }, [ventesRegroupeesParProduit, filterId, filterNom, sortConfig]);

  // --- CALCUL DES TOTAUX GÉNÉRAUX FINANCIERS AVEC SÉCURISATION DE L'ANCRE ---
  const { totalQte, totalAchat, totalVente } = useMemo(() => {
    return filteredVentes.reduce((acc, v) => {
      acc.totalQte += v.quantite;
      // Sécurisation de l'accès aux calculs de prix de revient si autorisé
      acc.totalAchat += acc.hasMarge ? v.achatTotal : 0;
      acc.totalVente += v.venteTotal;
      return acc;
    }, { totalQte: 0, totalAchat: 0, totalVente: 0, hasMarge: hasMargeAccess });
  }, [filteredVentes, hasMargeAccess]);

  // =========================================================================
  // 📊 CALCUL RAPPORT : GROUPEMENT CONSOLIDÉ PAR UNITÉ DE MESURE CORRIGÉ
  // =========================================================================
  const totalParUnite = useMemo(() => {
    const groupe = filteredVentes.reduce((acc, v) => {
      // 🛡️ CORRECTION SÉCURITÉ : Groupement par code d'unité strict (CS, CS2, KG) au lieu du libellé long
      const codeUniteStrict = String(v.unite_code || 'UNITÉ').trim().toUpperCase();
      
      if (!acc[codeUniteStrict]) {
        acc[codeUniteStrict] = { 
          qte: 0, 
          achat: 0, 
          vente: 0, 
          libelleAffiche: String(v.unite_libelle || codeUniteStrict).trim().toUpperCase(),
          contexte: v 
        };
      }
      
      acc[codeUniteStrict].qte += v.quantite;
      acc[codeUniteStrict].achat += v.achatTotal;
      acc[codeUniteStrict].vente += v.venteTotal;
      return acc;
    }, {});

    return Object.keys(groupe).map(cle => {
      const itemGroupe = groupe[cle];
      return {
        unite: itemGroupe.libelleAffiche, // Transmet le libellé propre (ex: CASIER (DEMI)) au rendu
        qte: itemGroupe.qte, 
        achat: itemGroupe.achat,
        vente: itemGroupe.vente,
        marge: itemGroupe.vente - itemGroupe.achat,
        rowContexte: itemGroupe.contexte 
      };
    }).sort((a, b) => b.vente - a.vente);
  }, [filteredVentes]);

  // =========================================================================
  // 📈 PRÉPARATION DES DONNÉES RECHARTS POUR LES GRAPHIQUES DÉCISIONNELS (CORRIGÉE)
  // =========================================================================
  const chartTopArticles = useMemo(() => {
    return [...filteredVentes]
      .sort((a, b) => b.venteTotal - a.venteTotal)
      .slice(0, 5)
      .map(item => {
        const dataObj = {
          name: item.nom_article_snap || item.nom_article || item.nom || `ID: ${item.id_article}`,
          "Chiffre d'Affaires": Math.round(item.venteTotal)
        };
        // 💡 SÉCURISATION GRAPHIQUE : On injecte la marge uniquement si l'accès est autorisé
        if (hasMargeAccess) {
            dataObj["Marge"] = Math.round(item.venteTotal - item.achatTotal);
        }
        return dataObj;
      });
  }, [filteredVentes, hasMargeAccess]);

  const chartTopMarges = useMemo(() => {
    // 💡 SÉCURISATION GRAPHIQUE : Si l'accès aux marges est absent, on retourne un tableau vide
    if (!hasMargeAccess) return [];

    return [...filteredVentes]
      .sort((a, b) => (b.venteTotal - b.achatTotal) - (a.venteTotal - a.achatTotal))
      .slice(0, 5)
      .map(item => ({
        name: item.nom_article_snap || item.nom_article || item.nom || `ID: ${item.id_article}`,
        "Marge Bénéficiaire": Math.round(item.venteTotal - item.achatTotal)
      }));
  }, [filteredVentes, hasMargeAccess]);

  // =========================================================================
  // 📈 PRÉPARATION DES DONNÉES GRAPHIK : FLUX VOLUMÉTRIQUES CORRIGÉS
  // =========================================================================
  // =========================================================================
  // 📈 PRÉPARATION DES DONNÉES GRAPHIK : FLUX VOLUMÉTRIQUES CORRIGÉS
  // =========================================================================
  const chartUnites = useMemo(() => {
    return totalParUnite.map(item => {
      const ctx = item.rowContexte || {};
      const configLogistique = ConversionStockService.getMetadata(ctx);

      // On extrait la vraie unité de détail pour le suffixe de droite
      const vraieUniteDetail = configLogistique.refDetail || 'U';

      // Formatage de l'expression textuelle principale
      const volumePrincipalFormate = formaterStockPOS(item.qte, ctx);

      return {
        name: `${item.unite} (${volumePrincipalFormate})`,
        "Volume Vendu": Math.round(item.qte),
        "Valeur Vente": Math.round(item.vente),
        // 🎯 AJOUT CRITIQUE : Transmission de l'unité de détail au composant graphique
        uniteAffichee: vraieUniteDetail.toLowerCase()
      };
    });
  }, [totalParUnite, formaterStockPOS]);



  // --- CONFIGURATION DES STYLES ÉPURÉS (SLATE STYLE, ZÉRO VERT CHOC) ---
  const thStyleCustom = { borderBottom: '2px solid #cbd5e1', padding: '10px 8px', textAlign: 'left', color: '#ffffff', fontSize: '13px', fontWeight: '600', backgroundColor: '#0f172a' };
  const tdStyleCustom = { padding: '10px 8px', borderBottom: '1px solid #e2e8f0', fontSize: '13px', color: '#334155' };
  const inputStyleCustom = { width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #475569', backgroundColor: '#ffffff', color: '#0f172a', fontSize: '12px', marginTop: '6px', outline: 'none' };
  return (


    

    <div className="dashboard-layout">
      <Sidebar />
      <main style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#ffffff', overflow: 'hidden' }}>
        
        {/* EN-TÊTE GRIS ANTHRACITE PRO (ZÉRO VERT AGRESSIF) */}
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 30px', backgroundColor: '#0f172a', color: '#fff' }}>
          <div>
            <h1 style={{ fontSize: '22px', margin: 0, fontWeight: '700' }}>Ventes Détaillées par Date</h1>
            <p style={{ fontSize: '13px', color: '#94a3b8' }}>Analyse des quantités et chiffres d'affaires des ventes</p>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            
            {/* 🎯 FILTRE CLIENT INTÉGRÉ ICI DANS VOTRE HEADER - ÉLARGIE POUR SCANNABILITÉ COGNITIVE */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: '#1e293b', padding: '8px 16px', borderRadius: '6px', border: '1px solid #334155' }}>
              <select
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                style={{
                  border: 'none',
                  backgroundColor: 'transparent',
                  color: '#fff',
                  fontSize: '13px',
                  fontWeight: '600',
                  outline: 'none',
                  cursor: 'pointer',
                  width: '280px' // 💡 ÉLARGISSEMENT DU CHAMP DE FILTRE (Client plus lisible)
                }}
              >
                <option value="" style={{ backgroundColor: '#1e293b', color: '#fff' }}>-- TOUS LES CLIENTS --</option>
                {customers.map((cust) => (
                  /* 💡 RECTIFICATION DÉFINITIVE : On injecte cust.nom dans la value à la place de l'ID */
                  <option key={cust.id} value={cust.nom || ''} style={{ backgroundColor: '#1e293b', color: '#fff' }}>
                    {cust.nom ? cust.nom.toUpperCase() : 'SANS NOM'}
                  </option>
                ))}
              </select>
            </div>


            {/* 📊 NOUVEAU BOUTON ANALYSE GRAPHIQUE PLACÉ À CÔTÉ DU CLIENT - BLOQUÉ ET VERROUILLÉ SI PAS ACCÈS */}
            <button
              onClick={() => {
                if (hasMargeAccess) {
                  setShowCharts(true);
                }
              }}
              disabled={!hasMargeAccess} // 🔒 BLOQUÉ SI ACCÈS COMPTABLE MAUVAIS
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 14px',
                backgroundColor: '#1e293b',
                color: hasMargeAccess ? '#3b82f6' : '#64748b', // Couleur grisée si pas d'accès
                border: '1px solid #334155',
                borderRadius: '6px',
                cursor: hasMargeAccess ? 'pointer' : 'not-allowed', // Curseur d'interdiction
                fontSize: '13px',
                fontWeight: '600',
                transition: 'all 0.2s ease',
                opacity: hasMargeAccess ? 1 : 0.4 // 🔒 OPACITÉ RÉDUITE SI DROIT MANQUANT
              }}
              onMouseEnter={(e) => {
                if (hasMargeAccess) {
                  e.currentTarget.style.backgroundColor = '#3b82f6';
                  e.currentTarget.style.color = '#fff';
                }
              }}
              onMouseLeave={(e) => {
                if (hasMargeAccess) {
                  e.currentTarget.style.backgroundColor = '#1e293b';
                  e.currentTarget.style.color = '#3b82f6';
                }
              }}
            >
              <BarChart3 size={16} />
              <span>Analyse Graphique</span>
            </button>

{/* 📅 DUPLICATION ET RE-DESIGN DU BLOC CALENDAR POUR GÉRER LA PLAGE DE DATES */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', backgroundColor: '#1e293b', padding: '6px 12px', borderRadius: '6px', border: '1px solid #334155' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '700' }}>Du</span>
                <input 
                  type="date" 
                  value={startDate} 
                  onChange={(e) => setStartDate(e.target.value)} 
                  style={{ 
                    border: 'none', 
                    backgroundColor: 'transparent', 
                    color: '#fff', 
                    fontSize: '13px', 
                    fontWeight: '600', 
                    outline: 'none', 
                    cursor: 'pointer',
                    colorScheme: 'dark' /* 📅 Force l'icône calendrier natif de l'input en blanc sous Chrome/Edge/Firefox */
                  }} 
                />
              </div>
              
              <div style={{ width: '1px', height: '16px', backgroundColor: '#475569' }} />

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '700' }}>Au</span>
                <input 
                  type="date" 
                  value={endDate} 
                  onChange={(e) => setEndDate(e.target.value)} 
                  style={{ 
                    border: 'none', 
                    backgroundColor: 'transparent', 
                    color: '#fff', 
                    fontSize: '13px', 
                    fontWeight: '600', 
                    outline: 'none', 
                    cursor: 'pointer',
                    colorScheme: 'dark' /* 📅 Force l'icône calendrier natif de l'input en blanc sous Chrome/Edge/Firefox */
                  }} 
                />
              </div>
            </div>

            <button onClick={fetchVentes} style={{ padding: '8px 12px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
              <RefreshCw size={16} className={loading ? 'spin' : ''} />
            </button>
          </div>
        </header>
{/* CONTENEUR PRINCIPAL DE DÉFILEMENT DE LA PAGE */}
              <div style={{ flex: 1, padding: '20px 30px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '25px' }}>
          
          {/* GRILLE DES PRODUITS WITH SCROLL APARTIR DE 8 LIGNES */}
          <div style={{ 
            backgroundColor: '#ffffff', 
            borderRadius: '8px', 
            border: '1px solid #e2e8f0', 
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Conteneur de défilement pour le corps du tableau */}
            <div style={{ 
              maxHeight: '340px', // Hauteur maximale correspondant à environ 8 lignes d'articles + filtres
              overflowY: 'auto',
              width: '100%'
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                  <tr>
                    <th style={{ ...thStyleCustom, width: '10%' }}>
                      <div style={{ cursor: 'pointer' }} onClick={() => requestSort('id_article')}>ID {sortConfig.key === 'id_article' && (sortConfig.direction === 'asc' ? '▲' : '▼')}</div>
                      <input type="text" placeholder="Filtrer..." style={inputStyleCustom} value={filterId} onChange={(e) => setFilterId(e.target.value)} />
                    </th>
                    <th style={{ ...thStyleCustom, width: hasMargeAccess ? '30%' : '56%' }}>
                      <div style={{ cursor: 'pointer' }} onClick={() => requestSort('nom_article')}>ARTICLE {sortConfig.key === 'nom_article' && (sortConfig.direction === 'asc' ? '▲' : '▼')}</div>
                      <input type="text" placeholder="Filtrer..." style={inputStyleCustom} value={filterNom} onChange={(e) => setFilterNom(e.target.value)} />
                    </th>
                    <th style={{ ...thStyleCustom, width: '10%' }}>
                      <div>UNITÉ</div>
                      <div style={{ height: '34px' }}></div>
                    </th>
                    <th style={{ ...thStyleCustom, width: '14%' }}>
                      <div>QTÉ</div>
                      <div style={{ height: '34px' }}></div>
                    </th>
                    {hasMargeAccess && (
                      <th style={{ ...thStyleCustom, width: '12%' }}>
                        <div>VAL. ACHAT</div>
                        <div style={{ height: '34px' }}></div>
                      </th>
                    )}
                    <th style={{ ...thStyleCustom, width: '12%' }}>
                      <div>VAL. VENTE</div>
                      <div style={{ height: '34px' }}></div>
                    </th>
                    {hasMargeAccess && (
                      <th style={{ ...thStyleCustom, width: '12%' }}>
                        <div>MARGE</div>
                        <div style={{ height: '34px' }}></div>
                      </th>
                    )}
                  </tr>
                </thead>
                 <tbody>
                  {loading ? (
                    <tr><td colSpan={hasMargeAccess ? "7" : "5"} style={{ ...tdStyleCustom, textAlign: 'center', padding: '30px' }}>Chargement des ventes...</td></tr>
                  ) : filteredVentes.length === 0 ? (
                    <tr><td colSpan={hasMargeAccess ? "7" : "5"} style={{ ...tdStyleCustom, textAlign: 'center', padding: '30px' }}>Aucun article vendu sur cette période.</td></tr>
                  ) : (
                    filteredVentes.map((v, i) => {
                      const qtePiecesBrutes = Number(v.quantite || 0);
                      const achatTotal = Number(v.achatTotal || 0);
                      const venteTotal = Number(v.venteTotal || 0);
                      const margeTotal = venteTotal - achatTotal;
                      
                      return (
                        <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                          <td style={tdStyleCustom}>{v.id_article}</td>
                          <td style={{ ...tdStyleCustom, fontWeight: '600' }}>{(v.nom_article_snap || v.nom_article || v.nom || '').toUpperCase()}</td>
                          <td style={tdStyleCustom}>{v.unite_code}</td>
                          <td style={{ ...tdStyleCustom, fontWeight: '700' }}>{formaterStockPOS(qtePiecesBrutes, v)}</td>
                          {hasMargeAccess && <td style={tdStyleCustom}>{Math.round(achatTotal).toLocaleString()} F</td>}
                          <td style={{ ...tdStyleCustom, fontWeight: '600' }}>{Math.round(venteTotal).toLocaleString()} F</td>
                          {hasMargeAccess && (
                            <td style={{ ...tdStyleCustom, fontWeight: '700', color: margeTotal >= 0 ? '#16a34a' : '#dc2626' }}>
                              {Math.round(margeTotal).toLocaleString()} F
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>



                    
               </table>
            </div>
{/* Pied de page fixe isolé en dehors de la zone de scroll vertical */}
{!loading && filteredVentes.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', borderTop: '3px solid #cbd5e1', backgroundColor: '#f8fafc' }}>
                <tfoot>
                  <tr>
                    <td style={{ ...tdStyleCustom, width: hasMargeAccess ? '50%' : '76%', fontWeight: 'bold', textAlign: 'right', color: '#0f172a', padding: '14px', fontSize: '14px' }}>
                      TOTAL GÉNÉRAL :
                    </td>
                    {/* 🛡️ CORRECTIF QUANTITÉ GLOBALE : Affichage d'un tiret explicite car sommer des unités hétérogènes est faux */}
                    <td style={{ ...tdStyleCustom, width: '14%', fontWeight: 'bold', color: '#64748b', fontSize: '14px', textAlign: 'left' }}>
                      -
                    </td>
                    {hasMargeAccess && (
                      <td style={{ ...tdStyleCustom, width: '12%', fontWeight: 'bold', color: '#475569', fontSize: '14px' }}>
                        {Math.round(totalAchat).toLocaleString()} F
                      </td>
                    )}
                    <td style={{ ...tdStyleCustom, width: '12%', fontWeight: '900', color: '#0f172a', fontSize: '14px' }}>
                      {Math.round(totalVente).toLocaleString()} F
                    </td>
                    {hasMargeAccess && (
                      <td style={{ 
                        ...tdStyleCustom, 
                        width: '12%', 
                        fontWeight: '900', 
                        color: (totalVente - totalAchat) > 0 ? '#16a34a' : ((totalVente - totalAchat) < 0 ? '#ef4444' : '#475569'),
                        backgroundColor: (totalVente - totalAchat) < 0 ? '#fef2f2' : 'transparent',
                        fontSize: '14px' 
                      }}>
                        {Math.round(totalVente - totalAchat).toLocaleString()} F
                      </td>
                    )}
                  </tr>
                </tfoot>
              </table>
            )}
          </div>

          {/* 📊 RAPPORT DE VENTE CONSOLIDÉ PAR UNITÉ DE MESURE AVEC SCROLL APARTIR DE 2 LIGNES */}
          {!loading && totalParUnite.length > 0 && (
            <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '15px', color: '#0f172a' }}>
                <BarChart3 size={20} color="#3b82f6" />
                <h3 style={{ fontSize: '16px', margin: 0, fontWeight: '700' }}>Récapitulatif de Vente Consolidé par Unité de Mesure</h3>
              </div>
              
              {/* Conteneur avec défilement vertical activé dès que la grille dépasse 2 lignes de hauteur */}
              <div style={{ 
                maxHeight: '280px', 
                overflowY: 'auto', 
                paddingRight: '5px' 
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '15px' }}>
                  {totalParUnite.map((item, index) => {
                    // 🎯 RÉCUPÉRATION RECONSOLIDÉE DEPUIS LE MOTEUR CENTRAL
                    const ctx = item.rowContexte || {};
                    const metadataCentrale = ConversionStockService.getMetadata(ctx);
                    
                    const configurationLogistique = {
                      coefficient: metadataCentrale.coeff,
                      unite_code: metadataCentrale.codeGros,
                      unite_reference: metadataCentrale.refDetail
                    };

                    return (
                      <div key={index} style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '14px', backgroundColor: '#f8fafc' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px', marginBottom: '10px' }}>
                          <span style={{ fontSize: '14px', fontWeight: '800', color: '#1e293b' }}>{item.unite.toUpperCase()}</span>
                          <span style={{ fontSize: '13px', fontWeight: '700', color: '#10b981', backgroundColor: '#ecfdf5', padding: '2px 8px', borderRadius: '4px', whiteSpace: 'nowrap' }} title={`Nombre total de pièces : ${item.qte}`}>
                            {formaterStockPOS(item.qte, configurationLogistique)}
                          </span>
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
                          {hasMargeAccess && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
                              <span>Valeur Achat :</span>
                              <span style={{ fontWeight: '500' }}>{Math.round(item.achat).toLocaleString()} F</span>
                            </div>
                          )}
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#1e293b', fontWeight: '600' }}>
                            <span>Valeur Vente :</span>
                            <span>{Math.round(item.vente).toLocaleString()} F</span>
                          </div>
                          {hasMargeAccess && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: item.marge >= 0 ? '#16a34a' : '#dc2626', fontWeight: '700', borderTop: '1px dashed #cbd5e1', paddingTop: '4px', marginTop: '2px' }}>
                              <span>Marge Bénéficiaire :</span>
                              <span>{Math.round(item.marge).toLocaleString()} F</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}


       {/* ========================================================================= */}
          {/* 📉 MODULE DÉCISIONNEL FIXE DE BAS DE PAGE (SANS MODALE, RATIOS PROS)      */}
          {/* ========================================================================= */}
          {showCharts && !loading && filteredVentes.length > 0 && (
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '20px', 
              backgroundColor: '#f8fafc', 
              padding: '24px', 
              borderRadius: '8px', 
              border: '1px solid #cbd5e1',
              marginTop: '10px'
            }}>
              
              {/* En-tête de la section décisionnelle intégrée */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #e2e8f0', paddingBottom: '12px' }}>
                <div>
                  <h3 style={{ fontSize: '16px', margin: 0, fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <BarChart3 size={20} color="#3b82f6" /> Indicateurs Stratégiques & Ratios de Rentabilité
                  </h3>
                  <p style={{ fontSize: '12px', color: '#64748b', margin: '2px 0 0 0' }}>
                    {hasMargeAccess 
                      ? "Analyses consolidées de contribution et performances financières pour la direction" 
                      : "Analyses consolidées des volumes vendus et performances de chiffre d'affaires"
                    }
                  </p>
                </div>
                <button 
                  onClick={() => setShowCharts(false)}
                  style={{ backgroundColor: '#e2e8f0', color: '#475569', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}
                >
                  Masquer les graphiques
                </button>
              </div>


           {/* Conteneur principal Grid des analyses graphiques natives */}
             <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                
                {/* 1. TOP 5 CHIFFRE D'AFFAIRES ENRICHI AVEC TAUX DE CONTRIBUTION */}
                <div style={{ backgroundColor: '#ffffff', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                  <h4 style={{ fontSize: '14px', color: '#0f172a', margin: '0 0 16px 0', fontWeight: '700' }}>
                    Top 5 Articles par Part de Chiffre d'Affaires
                  </h4>
                  <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '12px', paddingTop: '10px' }}>
                    {chartTopArticles.length > 0 ? (
                      chartTopArticles.map((item, idx) => {
                        const totalCAGlobal = totalVente || 1;
                        const tauxContribution = ((item["Chiffre d'Affaires"] / totalCAGlobal) * 100).toFixed(1);
                        const maxCA = Math.max(...chartTopArticles.map(m => m["Chiffre d'Affaires"]), 1);
                        const pourcentage = Math.min(100, Math.max(5, (item["Chiffre d'Affaires"] / maxCA) * 100));

                        return (
                          <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#1e293b' }}>
                              <span style={{ fontWeight: '600', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '65%' }}>
                                {idx + 1}. {item.name}
                              </span>
                              <span style={{ fontWeight: '700', color: '#3b82f6' }}>
                                {item["Chiffre d'Affaires"].toLocaleString()} F 
                                <span style={{ color: '#64748b', fontSize: '11px', fontWeight: 'normal', marginLeft: '6px' }}>({tauxContribution}%)</span>
                              </span>
                            </div>
                            <div style={{ width: '100%', height: '10px', backgroundColor: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                              <div style={{ width: `${pourcentage}%`, height: '100%', backgroundColor: '#3b82f6', borderRadius: '4px', transition: 'width 0.5s ease-in-out' }} />
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div style={{ textAlign: 'center', fontSize: '12px', color: '#64748b', padding: '20px 0' }}>Aucune donnée disponible</div>
                    )}
                  </div>
                </div>
{/* 2. VOLUMES VENDUS ENRICHIS AVEC RATIOS DE DISTRIBUTION */}
                <div style={{ backgroundColor: '#ffffff', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                  <h4 style={{ fontSize: '14px', color: '#0f172a', margin: '0 0 16px 0', fontWeight: '700' }}>
                    Analyse des Flux Volumétriques par Unité
                  </h4>
                  <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '12px', paddingTop: '10px' }}>
                    {chartUnites.length > 0 ? (
                      chartUnites.map((item, idx) => {
                        const totalVolumeGlobal = totalParUnite.reduce((acc, curr) => acc + curr.qte, 0) || 1;
                        const ratioDistribution = ((item["Volume Vendu"] / totalVolumeGlobal) * 100).toFixed(1);
                        const maxVolume = Math.max(...chartUnites.map(m => m["Volume Vendu"]), 1);
                        const pourcentage = Math.min(100, Math.max(5, (item["Volume Vendu"] / maxVolume) * 100));

                        return (
                          <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#1e293b' }}>
                              <span style={{ fontWeight: '600', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '65%' }}>{item.name}</span>
                              <span style={{ fontWeight: '700', color: '#6366f1' }}>
                                {/* 🎯 CORRECTION STRICTE : Remplacement du texte statique par l'unité de détail dynamique */}
                                {item["Volume Vendu"].toLocaleString()} {item.uniteAffichee || 'pces'}
                                <span style={{ color: '#64748b', fontSize: '11px', fontWeight: 'normal', marginLeft: '6px' }}>({ratioDistribution}%)</span>
                              </span>
                            </div>
                            <div style={{ width: '100%', height: '10px', backgroundColor: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                              <div style={{ width: `${pourcentage}%`, height: '100%', backgroundColor: '#6366f1', borderRadius: '4px', transition: 'width 0.5s ease-in-out' }} />
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div style={{ textAlign: 'center', fontSize: '12px', color: '#64748b', padding: '20px 0' }}>Aucune donnée disponible</div>
                    )}
                  </div>
                </div>
              </div>


              {/* 3. DIAGNOSTIC DE MARGES SÉCURISÉ & RATIOS FINANCIERS DE SYNTHÈSE */}
              <div style={{ backgroundColor: '#ffffff', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                <h4 style={{ fontSize: '14px', color: '#0f172a', margin: '0 0 16px 0', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  Top 5 Articles par Marge Réelle & Taux de Marge Brute
                  {!hasMargeAccess && (
                    <span style={{ fontSize: '11px', backgroundColor: '#fee2e2', color: '#ef4444', padding: '2px 6px', borderRadius: '4px' }}>
                      Privilège Requis
                    </span>
                  )}
                </h4>


               {hasMargeAccess ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '25px', paddingTop: '10px' }}>
                    
                    {/* Côté gauche : Les Barres de Marges avec calcul de Taux de marge par produit */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      {chartTopMarges.map((item, idx) => {
                        const maxMarge = Math.max(...chartTopMarges.map(m => m["Marge Bénéficiaire"]), 1);
                        const pourcentageBarre = Math.min(100, Math.max(5, (item["Marge Bénéficiaire"] / maxMarge) * 100));
                        
                        // Extraction de la ligne de vente d'origine pour calculer le taux de marge spécifique
                        const originalItem = filteredVentes.find(v => (v.nom_article_snap || v.nom_article || v.nom) === item.name);
                        const CA_Article = originalItem ? originalItem.venteTotal : 1;
                        const tauxMargeArticle = originalItem ? (((originalItem.venteTotal - originalItem.achatTotal) / CA_Article) * 100).toFixed(1) : '0';

                        return (
                          <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                              <span style={{ fontWeight: '600', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '60%' }}>{item.name}</span>
                              <span style={{ fontWeight: '700', color: '#10b981' }}>
                                {item["Marge Bénéficiaire"].toLocaleString()} F 
                                <span style={{ color: '#475569', fontSize: '11px', fontWeight: 'bold', marginLeft: '6px', backgroundColor: '#f0fdf4', padding: '1px 5px', borderRadius: '3px' }}>{tauxMargeArticle}% Mrg</span>
                              </span>
                            </div>
                            <div style={{ width: '100%', height: '10px', backgroundColor: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                              <div style={{ width: `${pourcentageBarre}%`, height: '100%', backgroundColor: '#10b981', borderRadius: '4px', transition: 'width 0.5s ease-in-out' }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>

{/* Côté droit : Ratios Globaux Consolidés de Performance Commerciale */}
                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '12px', padding: '16px', backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a', borderBottom: '1px solid #cbd5e1', paddingBottom: '6px', marginBottom: '4px' }}>Ratios de Synthèse Financière :</div>
                      
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                        <span style={{ color: '#475569' }}>Taux de Marge Global :</span>
                        <span style={{ fontWeight: '800', color: '#0f172a' }}>{(((totalVente - totalAchat) / (totalVente || 1)) * 100).toFixed(2)} %</span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                        <span style={{ color: '#475569' }}>Ratio de Levier (Vente / Achat) :</span>
                        <span style={{ fontWeight: '800', color: '#3b82f6' }}>{(totalVente / (totalAchat || 1)).toFixed(2)}x</span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                        <span style={{ color: '#475569' }}>Marge Moyenne par Article Unique :</span>
                        <span style={{ fontWeight: '800', color: '#10b981' }}>{Math.round((totalVente - totalAchat) / (filteredVentes.length || 1)).toLocaleString()} F</span>
                      </div>
                    </div>

                  </div>
                ) : (
                  <div style={{ padding: '40px 0', textAlign: 'center', fontSize: '13px', color: '#64748b', backgroundColor: '#fafafa', borderRadius: '6px', border: '1px solid #f1f5f9' }}>
                    🔒 Accès restreint. Les indicateurs de marges financières ne sont pas accessibles pour votre profil utilisateur.
                  </div>
                )}
              </div>

            </div>
          )}

        </div>
  </main>
      
      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .table-row-hover:hover { background-color: #f1f5f9 !important; transition: background-color 0.1s ease; }
      `}</style>
    </div>
  );
};

export default VenteDetailList;
