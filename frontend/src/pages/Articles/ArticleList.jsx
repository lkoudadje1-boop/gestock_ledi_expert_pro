import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  RefreshCw, CloudCheck, FileSpreadsheet, Upload, CheckCircle2, XCircle, ArrowUpDown, ChevronUp, ChevronDown, 
  Loader2, AlertCircle, CheckCircle, Info, X, Printer
} from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import API from '../../services/api'; 
import { getUserPermissions } from '../../utils/permissions_utils'; // 🔑 IMPORTATION DU SÉCURISEUR ERP
import { useReactToPrint } from 'react-to-print';
import StockPrint from '../Logistique/stockPrint'; // 🖨️ IMPORT COMPOSANT D'IMPRESSION SUR PLAN
import '../Dashboard.css';

const ArticleList = () => {
  // --- RÉFÉRENCES ---
  const fileInputRef = useRef(null);
  const componentRef = useRef(null); // Référence indispensable pour useReactToPrint

  // --- 🛡️ SÉCURISATION COMPTABLE & ROLES (SANS VERTS CHOCS) ---
  const userPerms = useMemo(() => {
    try {
      if (typeof getUserPermissions === 'function') return getUserPermissions() || {};
    } catch (e) { console.error(e); }
    return {};
  }, []);

  const canViewFinancials = useMemo(() => {
    const val = userPerms['art_view_financials'];
    return val === true || val === 1 || val === 'true' || val === '1';
  }, [userPerms]);

  // ANCRE DE SECURITE ABSOLUE : ADMINS ET ROLES GRANULAIRES VALIVES
  const hasFinancialAccess = useMemo(() => {
    try {
      const localUserJson = localStorage.getItem('user') || localStorage.getItem('currentUser');
      const connectedUser = localUserJson ? JSON.parse(localUserJson) : null;
      const isAdmin = connectedUser?.role?.toUpperCase() === 'ADMIN';
      return isAdmin || canViewFinancials;
    } catch (e) {
      return canViewFinancials;
    }
  }, [canViewFinancials]);

  // --- 🚀 INTEGRATION DU VERROU LOGISTIQUE DYNAMIQUE : GROS & DETAIL (ANTI-NAN) ---
  const formaterStockPOS = useCallback((art) => {
    if (!art) return "-";
    
    // 1. Récupération de la valeur brute stockée en BDD
    const valeurStock = art.stock_actuel !== undefined ? art.stock_actuel : (art.stock || 0);
    
    // 2. 🛡️ VERROU CRITIQUE : Si c'est déjà une chaîne formatée contenant l'expression textuelle
    if (typeof valeurStock === 'string' && isNaN(Number(valeurStock.trim()))) {
        return valeurStock;
    }

    // 3. Traitement classique si c'est un pur nombre d'unités natives (pièces entières)
    const qtePieces = Number(valeurStock) || 0;
    const coeff = Number(art.coefficient || art.unit_coefficient || art.coeff || 1);
    const codeGros = String(art.unit_code_gros || art.unite_code || art.code || 'CS').toUpperCase().trim();
    const refDetail = String(art.unit_ref_detail || art.unite_reference || 'UNITÉ').replace(/\(s\)/g, '').toUpperCase().trim();

    if (qtePieces <= 0) return `0 ${refDetail}`;

    if (coeff > 1) {
        const grosEntiers = Math.floor(qtePieces / coeff);
        const restesDetail = Math.round(qtePieces % coeff);

        if (grosEntiers > 0 && restesDetail > 0) {
            return `${grosEntiers} ${codeGros} + ${restesDetail} ${refDetail}`;
        } else if (grosEntiers > 0) {
            return `${grosEntiers} ${codeGros}`;
        } else {
            return `${restesDetail} ${refDetail}`;
        }
    }
    return `${Math.round(qtePieces)} ${refDetail}`;
  }, []);

  // --- ÉTATS ---
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isInventoryActive, setIsInventoryActive] = useState(false);
  const [toasts, setToasts] = useState([]); 
  
  const [companyName] = useState(localStorage.getItem('companyName') || 'Ledi Expert Pro');

  // --- ÉTATS DES FILTRES ---
  const [filterId, setFilterId] = useState('');
  const [filterNom, setFilterNom] = useState('');
  const [filterCodeBarre, setFilterCodeBarre] = useState('');
  const [filterFamille, setFilterFamille] = useState('Toutes');
  const [filterCategory, setFilterCategory] = useState('Toutes');
  const [filterGroup, setFilterGroup] = useState('Tous');
  const [filterConditionnement, setFilterConditionnement] = useState('Tous');
  const [filterStatus, setFilterStatus] = useState('Tous');
  const [sortConfig, setSortConfig] = useState({ key: 'id', direction: 'asc' });

  // --- GESTION DES TOASTS ---
  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000); 
  }, []);

  // --- CHARGEMENT DES DONNÉES SÉCURISÉ ---
  const fetchArticles = async () => {
    try {
      setLoading(true);
      const res = await API.get('/products');
      const data = res.data.data || res.data; 
      setArticles(Array.isArray(data) ? data : []);
    } catch (err) {
      addToast("Erreur lors de la récupération des produits", "error");
    } finally {
      setLoading(false);
    }
  };

  const checkInventoryStatus = async () => {
    try {
      const res = await API.get('/inventories/check-status');
      setIsInventoryActive(!!res.data.en_cours);
    } catch (err) {
      console.error("Erreur statut inventaire:", err);
    }
  };

  useEffect(() => {
    fetchArticles();
    checkInventoryStatus();

    const handleUpdate = (event) => {
      if (['products', 'inventory', 'all'].includes(event.detail?.table)) {
        fetchArticles();
        checkInventoryStatus(); 
      }
    };
    window.addEventListener('ERP_DATA_CHANGED', handleUpdate);
    return () => window.removeEventListener('ERP_DATA_CHANGED', handleUpdate);
  }, []);
  // --- 🖨️ ACTION D'IMPRESSION A5 INTEGRÉE ---
  const handlePrintStock = useReactToPrint({
    content: () => componentRef.current,
    // ⚡ ON INTERCEPTE L'IMPRESSION ICI
    print: async (printWindow) => {
      if (window.electronAPI && window.electronAPI.printPdf) {
        // 1. Extraction du contenu HTML brut généré à l'intérieur de votre composant StockPrint
        const bodyContent = printWindow.contentDocument.body.innerHTML;
        
        // 2. Création d'une feuille de style CSS A5 stricte et incontournable
        const forcedA5Style = `
          <style>
            @all {
              box-sizing: border-box;
            }
            @media print {
              @page { 
                size: 148mm 210mm !important; /* Dimensions physiques A5 précises */
                margin: 5mm 5mm 5mm 5mm !important; /* Marges réduites pour maximiser l'espace */
              }
              body { 
                margin: 0 !important;
                padding: 0 !important;
                width: 138mm !important; /* Largeur utile (148mm - 10mm de marges) */
                -webkit-print-color-adjust: exact !important; 
                print-color-adjust: exact !important; 
              }
              /* Optimisation de la taille du tableau pour le format A5 */
              table {
                width: 100% !important;
                font-size: 9px !important; /* Légère réduction pour éviter les retours à la ligne */
              }
              th, td {
                padding: 4px 2px !important; /* Tableaux plus compacts */
              }
            }
          </style>
        `;

        // 3. Assemblage final d'un document HTML propre et standardisé
        const htmlContent = `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              ${forcedA5Style}
            </head>
            <body>
              ${bodyContent}
            </body>
          </html>
        `;
        
        // 4. Envoi du document configuré au processus principal Electron
        window.electronAPI.printPdf(htmlContent, { format: 'A5' });
        console.log("🔥 Document HTML injecté avec styles A5 envoyé à Electron.");
      } else {
        // Replicat si testé sur navigateur standard
        printWindow.contentWindow.print();
      }
    }
  });

  // --- ACTIONS IMPORT / EXPORT ---
  const handleExportCSV = async () => {
    try {
      setIsExporting(true);
      const response = await API.get('/products/csv/export', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `Catalogue_Articles_${new Date().toISOString().slice(0,10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      addToast("Exportation réussie", "success");
    } catch (error) {
      addToast("Échec de l'exportation", "error");
    } finally {
      setIsExporting(false);
    }
  };

  // --- 📊 CALCUL DYNAMIQUE ET SÉCURISÉ DES TOTAUX FINANCIERS ---
  const totauxFinanciers = useMemo(() => {
    return articles.reduce((acc, art) => {
      if (!art) return acc;

      // 1. Récupération de la quantité brute totale en pièces (Détail)
      const qtePieces = Number(art.stock_actuel !== undefined ? art.stock_actuel : (art.stock || 0));
      
      // 2. Récupération des prix unitaires (par pièce de détail)
      const cmpUnitaire = Number(art.cmp || art.prix_achat || 0);
      const prixVenteUnitaire = Number(art.prix_vente || art.prixVente || 0);

      // 3. Incrémentation des cumuls financiers globaux
      acc.totalValAchat += qtePieces * cmpUnitaire;
      acc.totalValVente += qtePieces * prixVenteUnitaire;

      return acc;
    }, { totalValAchat: 0, totalValVente: 0 });
  }, [articles]);

  const handleImportCSV = async (e) => {
    if (isInventoryActive) {
      addToast("Action impossible : un inventaire est en cours", "error");
      return;
    }

    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      setIsImporting(true);
      const response = await API.post('/products/csv/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      addToast(response.data.message || "Importation réussie", "success");
      fetchArticles(); 
    } catch (error) {
      const errorMsg = error.response?.data?.error || "Erreur d'importation";
      addToast(errorMsg, "error");
    } finally {
      setIsImporting(false);
      e.target.value = '';
    }
  };

    // --- TRI ET FILTRAGE ---
  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const filteredArticles = useMemo(() => {
    const result = articles.filter(art => {
      const artId = (art.id || art.id_article || '').toString().toLowerCase();
      const artNom = (art.nom || '').toLowerCase();
      const artCB = (art.codeBarre || art.code_barre || '').toLowerCase();
      const matchStatus = filterStatus === 'Tous' || 
                         (filterStatus === 'Actif' ? Number(art.is_active) === 1 : Number(art.is_active) === 0);

      return (
        artId.includes(filterId.toLowerCase()) &&
        artNom.includes(filterNom.toLowerCase()) &&
        artCB.includes(filterCodeBarre.toLowerCase()) &&
        (filterFamille === 'Toutes' || art.famille_nom === filterFamille) &&
        (filterCategory === 'Toutes' || art.category_nom === filterCategory) &&
        (filterGroup === 'Tous' || art.group_nom === filterGroup) &&
        (filterConditionnement === 'Tous' || (art.unite_libelle || art.conditionnement) === filterConditionnement) &&
        matchStatus
      );
    });

    result.sort((a, b) => {
      let aVal = '';
      let bVal = '';

      // Normalisation des clés pour mapper correctement les propriétés d'objets imbriquées ou renommées
      switch (sortConfig.key) {
        case 'id_article':
          aVal = (a.id || a.id_article || '').toString();
          bVal = (b.id || b.id_article || '').toString();
          break;
        case 'nom':
          aVal = a.nom || '';
          bVal = b.nom || '';
          break;
        case 'code_barre':
          aVal = a.codeBarre || a.code_barre || '';
          bVal = b.codeBarre || b.code_barre || '';
          break;
        case 'famille':
          aVal = a.famille_nom || '';
          bVal = b.famille_nom || '';
          break;
        case 'categorie':
          aVal = a.category_nom || '';
          bVal = b.category_nom || '';
          break;
        case 'groupe':
          aVal = a.group_nom || '';
          bVal = b.group_nom || '';
          break;
        case 'unite':
          aVal = a.unite_libelle || a.conditionnement || '';
          bVal = b.unite_libelle || b.conditionnement || '';
          break;
        case 'cmp':
          aVal = Number(a.cmp || a.prix_achat || 0);
          bVal = Number(b.cmp || b.prix_achat || 0);
          break;
        case 'prix_vente':
          aVal = Number(a.prix_vente || a.prixVente || 0);
          bVal = Number(b.prix_vente || b.prixVente || 0);
          break;
        case 'stock':
          aVal = Number(a.stock_actuel !== undefined ? a.stock_actuel : (a.stock || 0));
          bVal = Number(b.stock_actuel !== undefined ? b.stock_actuel : (b.stock || 0));
          break;
        case 'is_active':
          aVal = Number(a.is_active || 0);
          bVal = Number(b.is_active || 0);
          break;
        default:
          aVal = a[sortConfig.key] || '';
          bVal = b[sortConfig.key] || '';
      }

      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();

      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [articles, filterId, filterNom, filterCodeBarre, filterFamille, filterCategory, filterGroup, filterConditionnement, filterStatus, sortConfig]);

  const famillesList = ['Toutes', ...new Set(articles.map(a => a.famille_nom).filter(Boolean))].sort();
  const categoriesList = ['Toutes', ...new Set(articles.map(a => a.category_nom).filter(Boolean))].sort();
  const groupsList = ['Tous', ...new Set(articles.map(a => a.group_nom).filter(Boolean))].sort();
  const condList = ['Tous', ...new Set(articles.map(a => a.unite_libelle || a.conditionnement).filter(Boolean))].sort();

  // =========================================================================
  // 🛡️ RECALCUL DES VALEURS DU CATALOGUE : HARMONISATION DES ÉCHELLES DE STOCK
  // =========================================================================
    // =========================================================================
  // 🛡️ RECALCUL DES VALEURS DU CATALOGUE : COMPTABILITÉ SUR BASE DU PRIX CARTON
  // =========================================================================
  const { totalStock, totalValeurAchat, totalValeurVente } = useMemo(() => {
    return filteredArticles.reduce((acc, art) => {
      if (!art) return acc;

      // 1. Récupération de la quantité totale (exprimée en unités de détail / pièces)
      const rawStock = art.stock_actuel !== undefined ? art.stock_actuel : (art.stock || 0);
      const qteTotalPieces = isNaN(Number(rawStock)) ? 0 : Number(rawStock); 
      
      // 2. Récupération du coefficient de colisage (ex: 24 pour C24)
      const coeff = Number(art.coefficient || art.unit_coefficient || art.coeff || 1);

      // 3. Conversion du stock brut en équivalent cartons (ex: 57 pièces / 24 = 2.375 cartons)
      const qteEnCartons = coeff > 0 ? (qteTotalPieces / coeff) : qteTotalPieces;

      // 4. Extraction des prix (Le CMP et le Prix de Vente correspondent au carton/colis)
      const prixAchatCarton = parseFloat(art.cmp || art.prix_achat || 0) || 0;
      const prixVenteCarton = parseFloat(art.prix_vente || art.prixVente || 0) || 0;

      // A. Valeur d'achat de la ligne : Nombre de cartons équivalents × Prix du carton
      const valeurAchatLigne = qteEnCartons * prixAchatCarton;
      
      // B. Valeur de vente de la ligne : Nombre de cartons équivalents × Prix de vente du carton
      const valeurVenteLigne = qteEnCartons * prixVenteCarton;

      // Stockage des calculs sur l'objet pour l'affichage dans la ligne (tbody)
      art.valeur_achat_calculee = valeurAchatLigne;
      art.valeur_vente_calculee = valeurVenteLigne;

      acc.totalStock += qteTotalPieces;
      acc.totalValeurAchat += valeurAchatLigne;
      acc.totalValeurVente += valeurVenteLigne;
      return acc;
    }, { totalStock: 0, totalValeurAchat: 0, totalValeurVente: 0 });
  }, [filteredArticles]);

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return <ArrowUpDown size={13} style={{ opacity: 0.5, marginLeft: '6px' }} />;
    return sortConfig.direction === 'asc' ? <ChevronUp size={13} style={{ marginLeft: '6px' }} /> : <ChevronDown size={13} style={{ marginLeft: '6px' }} />;
  };

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="main-area" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        
        {/* SYSTÈME DE TOASTS */}
        <div style={toastContainerStyle}>
          {toasts.map(toast => (
            <div key={toast.id} style={toastStyle(toast.type)} className="toast-fade-in">
              {toast.type === 'error' && <AlertCircle size={20} />}
              {toast.type === 'success' && <CheckCircle size={20} />}
              {toast.type === 'info' && <Info size={20} />}
              <span style={{ flex: 1, fontSize: '14px', fontWeight: '600' }}>{toast.message}</span>
              <button onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))} style={toastCloseBtn}>
                <X size={16} />
              </button>
            </div>
          ))}
        </div>


             <input 
          type="file" 
          ref={fileInputRef} 
          style={{ display: 'none' }} 
          accept=".csv" 
          onChange={handleImportCSV} 
        />

        <header className="top-bar">
          <div className="page-title-area">
            <h1 style={{fontSize: '28px', color: '#0f172a'}}>Catalogue des Produits</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <p style={{fontSize: '15px', color: '#475569', fontWeight: '500'}}>Société : {companyName}</p>
              {isInventoryActive && (
                <span style={inventoryBadgeStyle}>
                  <XCircle size={14} /> INVENTAIRE EN COURS
                </span>
              )}
            </div>
          </div>


                  <div className="top-bar-actions" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button 
              onClick={() => isInventoryActive ? addToast("Inventaire en cours : Import bloqué", "error") : fileInputRef.current.click()} 
              className="btn-secondary" 
              style={{ ...actionBtnStyle, opacity: isInventoryActive ? 0.5 : 1, cursor: isInventoryActive ? 'not-allowed' : 'pointer' }} 
              disabled={isImporting || isInventoryActive}
            >
              {isImporting ? <Loader2 size={20} className="spin" /> : <Upload size={20} />} 
              {isImporting ? 'En cours...' : 'Importer CSV'}
            </button>
            
            <button onClick={handleExportCSV} className="btn-secondary" style={actionBtnStyle} disabled={isExporting}>
              {isExporting ? <Loader2 size={20} className="spin" /> : <FileSpreadsheet size={20} color="#059669" />} 
              {isExporting ? 'En cours...' : 'Exporter CSV'}
            </button>

            {/* 🖨️ BOUTON : IMPRESSION DE LA FICHE DE STOCK JOURNALIÈRE A5 EN GROS & DETAIL */}
            <button 
              onClick={handlePrintStock} 
              className="btn-secondary" 
              style={{ ...actionBtnStyle, background: '#0f172a', color: '#fff', border: 'none' }}
              disabled={loading || filteredArticles.length === 0}
              title="Imprimer le contrôle de stock journalier (A5)"
            >
              <Printer size={20} color="#ffffff" />
              Imprimer Fiche A5
            </button>

            <button onClick={fetchArticles} style={refreshBtnStyle} title="Actualiser">
              <RefreshCw size={20} className={loading ? 'spin' : ''} />
            </button>
          </div>
        </header>

        <div style={{ flex: 1, padding: '20px 30px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }} className="fade-in">
          <div style={{ ...tableWrapperStyle, overflowX: 'hidden', width: '100%' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <thead style={theadStyle}>
                <tr>
                  <th style={{...thStyle, width: '60px'}}>
                    <div style={{ ...thTitleArea, cursor: 'pointer' }} onClick={() => requestSort('id_article')}>ID {getSortIcon('id_article')}</div>
                    <input type="text" placeholder="ID..." style={headerInputStyle} value={filterId} onChange={(e) => setFilterId(e.target.value)} />
                  </th>
                  {/* SÉCURITÉ DE LARGEUR : S'élargit si les colonnes financières cachées libèrent de la place */}
                  <th style={{...thStyle, width: hasFinancialAccess ? '160px' : '360px' }}>
                    <div style={{ ...thTitleArea, cursor: 'pointer' }} onClick={() => requestSort('nom')}>ARTICLE {getSortIcon('nom')}</div>
                    <input type="text" placeholder="Nom..." style={headerInputStyle} value={filterNom} onChange={(e) => setFilterNom(e.target.value)} />
                  </th>
                  <th style={{...thStyle, width: '110px'}}>
                    <div style={{ ...thTitleArea, cursor: 'pointer' }} onClick={() => requestSort('code_barre')}>C. BARRE {getSortIcon('code_barre')}</div>
                    <input type="text" placeholder="Code..." style={headerInputStyle} value={filterCodeBarre} onChange={(e) => setFilterCodeBarre(e.target.value)} />
                  </th>
                  <th style={{...thStyle, width: '110px'}}>
                    <div style={{ ...thTitleArea, cursor: 'pointer' }} onClick={() => requestSort('famille')}>FAMILLE {getSortIcon('famille')}</div>
                    <select style={headerSelectStyle} value={filterFamille} onChange={(e) => setFilterFamille(e.target.value)}>
                      {famillesList.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </th>
                  <th style={{...thStyle, width: '110px'}}>
                    <div style={{ ...thTitleArea, cursor: 'pointer' }} onClick={() => requestSort('categorie')}>CATÉGORIE {getSortIcon('categorie')}</div>
                    <select style={headerSelectStyle} value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
                      {categoriesList.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </th>
                  <th style={{...thStyle, width: '110px'}}>
                    <div style={{ ...thTitleArea, cursor: 'pointer' }} onClick={() => requestSort('groupe')}>GROUPE {getSortIcon('groupe')}</div>
                    <select style={headerSelectStyle} value={filterGroup} onChange={(e) => setFilterGroup(e.target.value)}>
                      {groupsList.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </th>
                  <th style={{...thStyle, width: '90px'}}>
                    <div style={{ ...thTitleArea, cursor: 'pointer' }} onClick={() => requestSort('unite')}>UNITÉ {getSortIcon('unite')}</div>
                    <select style={headerSelectStyle} value={filterConditionnement} onChange={(e) => setFilterConditionnement(e.target.value)}>
                      {condList.map(item => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </th>

                 {/* 🔒 SÉCURITÉ COMPTABLE : CMP masqué si pas de permission financière */}
                  {hasFinancialAccess && (
                    <th style={{...thStyle, width: '90px'}}>
                      <div style={{ ...thTitleArea, cursor: 'pointer' }} onClick={() => requestSort('cmp')}>CMP {getSortIcon('cmp')}</div>
                      <div style={{height: '34px'}}></div>
                    </th>
                  )}

                {/* 🔒 SÉCURITÉ COMPTABLE : PRIX VENTE masqué si pas de permission financière */}
                  {hasFinancialAccess && (
                    <th style={{...thStyle, width: '100px'}}>
                      <div style={{ ...thTitleArea, cursor: 'pointer' }} onClick={() => requestSort('prix_vente')}>PRIX VENTE {getSortIcon('prix_vente')}</div>
                      <div style={{height: '34px'}}></div>
                    </th>
                  )}
                  
                  {/* 🚀 COLONNE DE STOCK PROTOCOLE GROS + DETAIL INTEGRÉE */}
                  <th style={{...thStyle, width: '120px'}}>
                    <div style={{ ...thTitleArea, cursor: 'pointer' }} onClick={() => requestSort('stock')}>STOCK {getSortIcon('stock')}</div>
                    <div style={{height: '34px'}}></div>
                  </th>

                  {/* 🔒 SÉCURITÉ COMPTABLE : VAL. ACHAT masquée si pas de permission financière */}
                  {hasFinancialAccess && (
                    <th style={{...thStyle, width: '110px'}}>
                      <div style={{ ...thTitleArea, cursor: 'pointer' }} onClick={() => requestSort('val_achat')}>VAL. ACHAT {getSortIcon('val_achat')}</div>
                      <div style={{height: '34px'}}></div>
                    </th>
                  )}

                  {/* 🔒 SÉCURITÉ COMPTABLE : VAL. VENTE masquée si pas de permission financière */}
                  {hasFinancialAccess && (
                    <th style={{...thStyle, width: '110px'}}>
                      <div style={{ ...thTitleArea, cursor: 'pointer' }} onClick={() => requestSort('val_vente')}>VAL. VENTE {getSortIcon('val_vente')}</div>
                      <div style={{height: '34px'}}></div>
                    </th>
                  )}
                  
                  <th style={{...thStyle, width: '90px'}}>
                    <div style={{ ...thTitleArea, cursor: 'pointer' }} onClick={() => requestSort('is_active')}>ÉTAT {getSortIcon('is_active')}</div>
                    <select style={headerSelectStyle} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                      <option value="Tous">Tous</option>
                      <option value="Actif">Actif</option>
                      <option value="Inactif">Inactif</option>
                    </select>
                  </th>
                  <th style={{...thStyle, width: '60px', textAlign:'right'}}>
                    <div style={{...thTitleArea, justifyContent:'flex-end'}}>SYNC</div>
                    <div style={{height: '34px'}}></div>
                  </th>
                </tr>
              </thead>

           <tbody>
                {loading ? (
                  <tr><td colSpan={hasFinancialAccess ? "14" : "10"} style={loadingTdStyle}>Chargement des produits...</td></tr>
                ) : filteredArticles.length === 0 ? (
                  <tr><td colSpan={hasFinancialAccess ? "14" : "10"} style={loadingTdStyle}>Aucun article trouvé.</td></tr>
                ) : (
                  filteredArticles.map((art) => {
                    const stockNum = parseFloat(art.stock_actuel !== undefined ? art.stock_actuel : (art.stock || art.quantite || 0)) || 0;
                    const cmpNum = parseFloat(art.cmp || art.prix_achat || 0) || 0;
                    const prixVenteNum = parseFloat(art.prixVente || art.prix_vendre || art.prix_vente || 0) || 0;
                    const coeff = Number(art.coefficient || art.unit_coefficient || art.coeff || 1) || 1;

                    // A. Calcul de la valeur d'achat réelle (CMP du carton × Volume équivalent en cartons)
                    const valeurAchatLigne = cmpNum * (stockNum / coeff);
                    
                    // B. FIX SÉCURISATION FINANCIÈRE : Prix de gros x Volume équivalent en Gros (pièces / coeff)
                    const valeurVenteLigne = prixVenteNum * (stockNum / coeff);

                    // Style de sécurité pour forcer le texte à rester sur une seule ligne
                    const cellEllipsisStyle = {
                      ...tdStyle,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      padding: '8px 4px',
                      fontSize: '13px'
                    };

                                    return (
                      <tr key={art.id} style={trStyle} className="table-row-hover">
                        <td style={{...cellEllipsisStyle, fontFamily: 'monospace', color: '#4f46e5', fontWeight: 'bold'}} title={art.id || art.id_article}>
                          {art.id || art.id_article}
                        </td>
                        <td style={{...cellEllipsisStyle, fontWeight: '800', color: '#000000', fontSize: '13px'}} title={art.nom}>
                          {art.nom}
                        </td>
                        <td style={{...cellEllipsisStyle, color: '#334155', fontSize: '11px', fontWeight: '600'}} title={art.codeBarre || '---'}>
                          {art.codeBarre || '---'}
                        </td>
                        <td style={{...cellEllipsisStyle, color: '#1e293b', fontWeight: '500'}} title={art.famille_nom || '-'}>
                          {art.famille_nom || '-'}
                        </td>
                        <td style={{...cellEllipsisStyle, color: '#1e293b', fontWeight: '500'}} title={art.category_nom || '-'}>
                          {art.category_nom || '-'}
                        </td>
                        <td style={{...cellEllipsisStyle, color: '#1e293b', fontWeight: '500'}} title={art.group_nom || '-'}>
                          {art.group_nom || '-'}
                        </td>
                        <td style={cellEllipsisStyle}>
                          <span style={{ ...condBadgeStyle, fontSize: '11px', padding: '2px 4px' }}>
                            {art.unite_libelle || art.conditionnement || 'U'}
                          </span>
                        </td>  

                        {/* 🔒 SÉCURITÉ COMPTABLE : Cellule CMP masquée si pas d'accès financier */}
                        {hasFinancialAccess && (
                          <td style={{...cellEllipsisStyle, color: '#475569', fontWeight: '600'}}>{cmpNum.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} F</td>
                        )}

                        {/* 🔒 SÉCURITÉ COMPTABLE : Cellule Prix Vente masquée si pas d'accès financier */}
                        {hasFinancialAccess && (
                          <td style={{...cellEllipsisStyle, fontWeight: '800', color: '#000000'}}>{prixVenteNum.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} F</td>
                        )}
                        
                        {/* 🚀 CELLULE DE RENDU DU STOCK DYNAMIQUE (GROS + DETAIL) */}
                        <td style={{...cellEllipsisStyle, fontWeight: '700', color: stockNum > 0 ? '#10b981' : '#ef4444'}} title={`Quantité native brute : ${stockNum}`}>
                          {formaterStockPOS(art)}
                        </td>
                        
                        {/* 🔒 SÉCURITÉ COMPTABLE : Cellule Valeur Achat masquée si pas d'accès financier */}
                        {hasFinancialAccess && (
                          <td style={{...cellEllipsisStyle, color: '#475569', fontWeight: '600'}}>{Math.round(valeurAchatLigne).toLocaleString('fr-FR')} F</td>
                        )}

                        {/* 🔒 SÉCURITÉ COMPTABLE : Cellule Valeur Vente masquée si pas d'accès financier */}
                        {hasFinancialAccess && (
                          <td style={{...cellEllipsisStyle, fontWeight: '900', color: '#1e293b'}}>{Math.round(valeurVenteLigne).toLocaleString('fr-FR')} F</td>
                        )}
                        
                        <td style={cellEllipsisStyle}>
                          <span style={{ ...statusBadgeStyle(Number(art.is_active) === 1), fontSize: '11px', padding: '2px 4px' }}>
                            {Number(art.is_active) === 1 ? 'Actif' : 'Inactif'}
                          </span>
                        </td>
                        <td style={{...cellEllipsisStyle, textAlign:'right', paddingRight: '5px'}}>
                          {art.sync_status === 'synced' ? <CloudCheck size={18} color="#059669" /> : <RefreshCw size={16} color="#d97706" />}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>

              {/* --- PIED DE PAGE : CORRECTION ALIGNEMENT CHIRURGICALE DYNAMIQUE --- */}
              {!loading && filteredArticles.length > 0 && (
                <tfoot style={{ borderTop: '3px solid #cbd5e1', backgroundColor: '#f8fafc', position: 'sticky', bottom: 0, zIndex: 1 }}>
                  <tr>
                    <td 
                      colSpan={hasFinancialAccess ? "9" : "7"} 
                      style={{ ...tdStyle, fontWeight: 'bold', textAlign: 'right', color: '#0f172a', fontSize: '13px', padding: '10px 4px' }}
                    >
                      TOTAL :
                    </td>

                    {/* 📦 TOTAL STOCK ÉPURÉ : On affiche un tiret car sommer des unités hétérogènes fausse la comptabilité */}
                    <td 
                      style={{ ...tdStyle, fontWeight: 'bold', color: '#64748b', fontSize: '13px', textAlign: 'center' }}
                      title={`Volume global en pièces natives : ${totalStock.toLocaleString()} Pcs`}
                    >
                      -
                    </td>
                    
                    {/* 🔒 SÉCURITÉ COMPTABLE : Le cumul de la valeur d'achat ne s'affiche QUE si autorisé */}
                    {hasFinancialAccess && (
                      <td style={{ ...tdStyle, fontWeight: 'bold', color: '#475569', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {Math.round(totalValeurAchat).toLocaleString()} F
                      </td>
                    )}

                    {/* 🔒 SÉCURITÉ COMPTABLE : Le cumul de la valeur de vente ne s'affiche QUE si autorisé */}
                    {hasFinancialAccess && (
                      <td style={{ ...tdStyle, fontWeight: '900', color: '#0f172a', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {Math.round(totalValeurVente).toLocaleString()} F
                      </td>
                    )}

                    {/* Cases de fin pour l'État et la Synchro */}
                    <td colSpan="2" style={tdStyle}></td>
                  </tr>
                </tfoot>
              )}

            </table>
          </div>
        </div>
      </main>


      {/* 🖨️ PROJECTION DU COMPOSANT D'IMPRESSION CACHÉ AVEC LA DIV-PASSERELLE DE RÉFÉRENCE DOM */}
      <div style={{ display: 'none' }}>
        <div ref={componentRef}>
          <StockPrint 
            articles={filteredArticles}
            companyName={companyName}
            showFinancials={hasFinancialAccess} // 🔒 Sécurité héritée transmise à la mise en page
            totalStock={totalStock}
            formaterStock={formaterStockPOS} // 🚀 Passerelle du formateur pour la mise en page du document A5
          />
        </div>
      </div>

      {/* CSS INTERNE POUR LES ANIMATIONS */}
      <style>{`
        .toast-fade-in { animation: toastIn 0.3s ease-out forwards; }
        @keyframes toastIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .table-row-hover:hover { background-color: #f1f5f9 !important; transition: background-color 0.15s ease; }
      `}</style>
    </div>
  );
};


// --- STYLES DES TOASTS ---
const toastContainerStyle = {
  position: 'fixed', top: '20px', right: '20px', zIndex: 9999,
  display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '350px'
};

const toastStyle = (type) => ({
  display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px',
  borderRadius: '8px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
  color: 'white',
  background: type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : '#3b82f6',
});

const toastCloseBtn = {
  background: 'transparent', border: 'none', color: 'white', cursor: 'pointer',
  padding: '4px', display: 'flex', opacity: 0.8
};

// Styles annexes manquants hérités de votre fichier d'origine pour sceller le rendu
const tableWrapperStyle = { flex: 1, overflowY: 'auto', background: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' };
const theadStyle = { position: 'sticky', top: 0, zIndex: 10, background: '#f8fafc' };
const thStyle = { padding: '12px 8px', background: '#0f172a', color: '#fff', fontSize: '11px', fontWeight: '900', textAlign: 'left', borderBottom: '2px solid #cbd5e1' };
const tdStyle = { padding: '10px 8px', borderBottom: '1px solid #e2e8f0', color: '#334155', verticalAlign: 'middle' };
const trStyle = { transition: 'background-color 0.1s ease' };
const headerInputStyle = { width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #475569', fontSize: '11px', outline: 'none', color: '#0f172a', marginTop: '6px', fontWeight: '700' };
const headerSelectStyle = { ...headerInputStyle, padding: '5px' };
const thTitleArea = { display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: '900' };
const condBadgeStyle = { background: '#f1f5f9', color: '#475569', borderRadius: '4px', fontWeight: '700' };
const loadingTdStyle = { textAlign: 'center', padding: '40px', color: '#94a3b8', fontStyle: 'italic', fontSize: '14px' };
const actionBtnStyle = { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '8px', fontWeight: '700', fontSize: '13px', cursor: 'pointer' };
const refreshBtnStyle = { background: 'transparent', border: 'none', cursor: 'pointer', padding: '8px' };
const inventoryBadgeStyle = { background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '4px' };

const statusBadgeStyle = (isActive) => ({
  background: isActive ? '#ecfdf5' : '#fef2f2',
  color: isActive ? '#059669' : '#ef4444',
  border: isActive ? '1px solid #a7f3d0' : '1px solid #fecaca',
  borderRadius: '4px', fontWeight: '700'
});

export default ArticleList;
