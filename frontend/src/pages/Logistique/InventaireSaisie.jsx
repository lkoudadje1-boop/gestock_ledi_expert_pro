import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Search, AlertTriangle, CheckCircle2, XCircle, 
  ArrowDownCircle, Info, ShieldAlert, Barcode
} from 'lucide-react';
import Sidebar from '../../components/Sidebar';

const InventaireSaisie = () => {
  const navigate = useNavigate();
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [familles, setFamilles] = useState([]);
  const [categories, setCategories] = useState([]);
  const [groupes, setGroupes] = useState([]);
  const [selFamille, setSelFamille] = useState('');
  const [selCategorie, setSelCategorie] = useState('');
  const [selGroupe, setSelGroupe] = useState('');

  const [searchNom, setSearchNom] = useState('');
  const [searchBarcode, setSearchBarcode] = useState('');
  const [articleEnCours, setArticleEnCours] = useState(null);
  
  // 🛡️ ÉTATS DE TRI DU TABLEAU
  const [sortField, setSortField] = useState('nom');
  const [sortDirection, setSortDirection] = useState('asc');
  
  // 🛡️ DOUBLE CANAL DE SAISIE LOGISTIQUE (Gros / Référence)
  const [qteSaisie, setQteSaisie] = useState(''); 
  const [saisieGros, setSaisieGros] = useState(''); 
  const [saisieDetail, setSaisieDetail] = useState(''); 
  
  const [dialogue, setDialogue] = useState({ show: false, titre: '', msg: '', type: 'primary', action: null });
  const inputRef = useRef(null);

  const [activeInvId, setActiveInvId] = useState(null);

  const API_BASE = 'http://localhost:3030/api';

  const getHeaders = () => ({
    'Authorization': `Bearer ${localStorage.getItem('token')}`,
    'Content-Type': 'application/json'
  });

  // 🚀 DECODEUR LOGISTIQUE EMBARQUÉ CORRIGÉ : Gère parfaitement les écarts négatifs
  const formaterStockPOS = useCallback((art, quantiteForcee = undefined) => {
    if (!art) return "-";
    
    const valeurStock = quantiteForcee !== undefined ? quantiteForcee : (art.qteTemp !== undefined ? art.qteTemp : (art.stock_theorique_fige !== undefined ? art.stock_theorique_fige : (art.stock ?? art.stock_actuel ?? 0)));
    
    if (typeof valeurStock === 'string' && isNaN(Number(valeurStock.trim()))) {
        return valeurStock.trim();
    }

    const qtePiecesBrute = Number(valeurStock) || 0;
    const estNegatif = qtePiecesBrute < 0;
    const qtePieces = Math.abs(qtePiecesBrute);
    
    const coeff = Number(art.unit_coefficient || art.unite_coefficient || art.coefficient || 1);
    const codeGros = String(art.unit_code_gros || art.unite_code || art.code || 'CS').toUpperCase().trim();
    let refDetail = String(art.unit_ref_detail || art.unite_reference || 'UNITÉ');
    
    refDetail = refDetail.replace(/\(s\)/g, '').toUpperCase().trim();

    if (qtePieces === 0) return `0 ${refDetail}`;

    let chaineResultat = "";

    if (coeff > 1) {
        const grosEntiers = Math.floor(qtePieces / coeff);
        const restesDetail = Math.round(qtePieces % coeff);

        if (grosEntiers > 0 && restesDetail > 0) {
            chaineResultat = `${grosEntiers} ${codeGros} + ${restesDetail} ${refDetail}`;
        } else if (grosEntiers > 0) {
            chaineResultat = `${grosEntiers} ${codeGros}`;
        } else {
            chaineResultat = `${restesDetail} ${refDetail}`;
        }
    } else {
        chaineResultat = `${Math.round(qtePieces)} ${refDetail}`;
    }

    return estNegatif ? `-${chaineResultat}` : chaineResultat;
  }, []);

  // 1. RÉCUPÉRATION DE L'INVENTAIRE ACTIF & ÉCOUTEURS
  useEffect(() => {
    const getActiveInventoryFromSQL = async () => {
        try {
            const res = await fetch(`${API_BASE}/inventories/active`, { headers: getHeaders() });
            const data = await res.json();
            if (data.success && data.inventory) {
                setActiveInvId(data.inventory.id);
                chargerDonneesInitiales(data.items || []);
            } else {
                alert("Aucun inventaire actif trouvé.");
                navigate('/logistique/inventaire');
            }
        } catch (err) {
            console.error("Erreur liaison SQL Inventaire:", err);
        }
    };

    getActiveInventoryFromSQL();

    const handleUpdate = (event) => {
        const { table, action } = event.detail;
        if (table === 'inventory' && (action === 'VALIDATED' || action === 'CANCELLED')) {
            navigate('/logistique/inventaire');
        }
    };

    window.addEventListener('ERP_DATA_CHANGED', handleUpdate);
    return () => window.removeEventListener('ERP_DATA_CHANGED', handleUpdate);
  }, [navigate]);

  // 2. CHARGEMENT INITIAL DES DONNÉES & PHOTOGRAPHIE DU THÉORIQUE
  const chargerDonneesInitiales = async (itemsSauvegardes = []) => {
    setLoading(true);
    try {
      const resArt = await fetch(`${API_BASE}/inventories/products`, { headers: getHeaders() });
      const dataArt = await resArt.json();
      const listeBrute = dataArt.success ? (dataArt.products || []) : [];

      const articlesAvecPersistance = listeBrute.map(art => {
        const matchingSaisie = itemsSauvegardes.find(item => item.product_id === art.id);
        const stockInitialTheoriquePieces = Number(art.stock ?? art.stock_actuel ?? 0);

        return {
          ...art,
          stock_theorique_fige: stockInitialTheoriquePieces,
          qteTemp: matchingSaisie ? Number(matchingSaisie.stock_reel) : undefined,
          prixVente_snap: matchingSaisie ? Number(matchingSaisie.prixVente_snap) : Number(art.prixVente || 0)
        };
      });

      setArticles(articlesAvecPersistance);

      const [resF, resC, resG] = await Promise.all([
        fetch(`${API_BASE}/articles/familles`, { headers: getHeaders() }),
        fetch(`${API_BASE}/articles/categories`, { headers: getHeaders() }),
        fetch(`${API_BASE}/articles/groups`, { headers: getHeaders() }) 
      ]);
      
      const f = await resF.json();
      const c = await resC.json();
      const g = await resG.json();

      setFamilles(Array.isArray(f) ? f : []);
      setCategories(Array.isArray(c) ? c : []);
      setGroupes(Array.isArray(g) ? g : []);

    } catch (err) {
      console.error("Erreur chargement données:", err);
    } finally {
      setLoading(false);
    }
  };

  const selectionnerArticle = (art) => {
    setArticleEnCours(art);
    
    const totalPiecesEnregistrees = art.qteTemp !== undefined ? Number(art.qteTemp || 0) : null;
    
    if (totalPiecesEnregistrees !== null) {
        setQteSaisie(String(totalPiecesEnregistrees));
        const coeff = Number((art.unit_coefficient || art.coefficient) || 1);
        
        const piecesAbs = Math.abs(totalPiecesEnregistrees);
        const signe = totalPiecesEnregistrees < 0 ? '-' : '';

        if (coeff > 1) {
            const gros = Math.floor(piecesAbs / coeff);
            const detail = Math.round(piecesAbs % coeff);
            
            setSaisieGros(gros > 0 ? `${signe}${gros}` : '');
            setSaisieDetail(detail > 0 ? (gros > 0 ? String(detail) : `${signe}${detail}`) : '');
        } else {
            setSaisieGros('');
            setSaisieDetail(`${signe}${piecesAbs}`);
        }
    } else {
        setQteSaisie('');
        setSaisieGros('');
        setSaisieDetail('');
    }
    
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  // 3. ENREGISTREMENT D'UNE LIGNE SÉCURISÉE SANS PERTE DE SCROLL
  const enregistrerQte = async () => {
    if (!articleEnCours || !activeInvId) return;

    if (saisieGros === '' && saisieDetail === '') return;

    const grosClean = String(saisieGros || '0').replace(',', '.').trim();
    const detailClean = String(saisieDetail || '0').replace(',', '.').trim();

    const nbrGros = Number(grosClean) || 0;
    const nbrDetail = Number(detailClean) || 0;

    const coeff = Number(articleEnCours.unit_coefficient || articleEnCours.unite_coefficient || articleEnCours.coefficient || 1);
    const quantiteCalculeeEnPieces = (nbrGros * coeff) + nbrDetail;

    const chaineCombineeJumelee = `${grosClean} + ${detailClean}`;

    try {
      const grosEnvoye = saisieGros === '' ? 0 : saisieGros;
      const detailEnvoye = saisieDetail === '' ? 0 : saisieDetail;

      const prixGrosAchat = Number(articleEnCours.prixAchat || articleEnCours.cmp || articleEnCours.prix_achat || 0);
      const prixVenteActuel = Number(articleEnCours.prixVente || 0);

      const response = await fetch(`${API_BASE}/inventories/save-item`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          id: `ART-INV-${Date.now()}`,
          inventory_id: activeInvId,
          product_id: articleEnCours.id,
          nom_article_snap: articleEnCours.nom,
          prix_achat_snap: prixGrosAchat,
          prixVente: prixVenteActuel,
          stock_theorique: articleEnCours.stock_theorique_fige || articleEnCours.stock_actuel || 0,
          stock_reel: chaineCombineeJumelee, 
          saisie_gros: grosEnvoye,
          saisie_detail: detailEnvoye
        })
      });

      const resData = await response.json();
      
      if (resData.success) {
         setArticles(prevArticles => 
            prevArticles.map(art => {
               if (art.id === articleEnCours.id) {
                  return {
                     ...art,
                     qteTemp: quantiteCalculeeEnPieces
                  };
               }
               return art;
            })
         );
      }

    } catch (err) {
      console.error("Erreur sauvegarde SQL ligne:", err);
    }

    setArticleEnCours(null);
    setSaisieGros('');
    setSaisieDetail('');
    setQteSaisie('');
  };

  const mettreAZeroLeReste = async () => {
    const articlesMisAZero = articles.map(a => ({ 
        ...a, 
        qteTemp: a.qteTemp !== undefined ? a.qteTemp : 0 
    }));
    setArticles(articlesMisAZero);

    try {
        const promises = articles.filter(art => art.qteTemp === undefined).map(art => {
            const prixGrosAchat = Number(art.prixAchat || art.cmp || art.prix_achat || 0);
            const prixVenteActuel = Number(art.prixVente || 0);

            return fetch(`${API_BASE}/inventories/save-item`, {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({
                    id: `ART-INV-${Date.now()}-${art.id}`,
                    inventory_id: activeInvId,
                    product_id: art.id,
                    nom_article_snap: art.nom,
                    prix_achat_snap: prixGrosAchat,
                    prixVente: prixVenteActuel,
                    stock_theorique: art.stock_theorique_fige ?? 0, 
                    stock_reel: '0 + 0',
                    saisie_gros: 0,
                    saisie_detail: 0
                })
            });
        });

        if (promises.length > 0) {
            await Promise.all(promises);
        }
    } catch (err) {
        console.error("Erreur lors de la mise à zéro en base:", err);
    }

    setDialogue({ ...dialogue, show: false });
  };

  const annulerEtDebloquer = async () => {
    try {
      const response = await fetch(`${API_BASE}/inventories/cancel`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ inventory_id: activeInvId })
      });
      const res = await response.json();
      if (res.success) {
        localStorage.setItem('systeme_gele', 'false');
        navigate('/logistique/inventaire');
      } else {
        alert("Erreur lors de l'annulation SQL.");
      }
    } catch (err) {
      console.error("Erreur annulation:", err);
    }
  };

  const executerCloture = async () => {
    if (!activeInvId) return;
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      const response = await fetch(`${API_BASE}/inventories/validate`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ inventory_id: activeInvId, user_id: user.id })
      });
      const res = await response.json();
      if (res.success) {
        localStorage.setItem('systeme_gele', 'false');
        navigate('/logistique/inventaire');
      }
    } catch (err) {
      console.error("Validation Error:", err);
    }
  };

  // Helpers pour récupérer les noms de Famille, Catégorie et Groupe
  const getNomFamille = (art) => familles.find(f => String(f.id) === String(art.famille_id || art.familleId))?.nom || art.famille || '-';
  const getNomCategorie = (art) => categories.find(c => String(c.id) === String(art.category_id || art.categoryId))?.nom || art.categorie || '-';
  const getNomGroupe = (art) => groupes.find(g => String(g.id) === String(art.group_id || art.groupId))?.nom || art.groupe || '-';

  // FILTRAGE DES ARTICLES
  const articlesFiltrés = articles.filter(a => {
    const matchNom = (a.nom || '').toLowerCase().includes(searchNom.toLowerCase());
    const cleanBarcodeSearch = searchBarcode.trim();
    const matchBarcode = cleanBarcodeSearch === '' || String(a.codeBarre || a.barcode || '').includes(cleanBarcodeSearch);
    
    const matchFam = selFamille === '' || String(a.famille_id || '') === String(selFamille);
    const matchCat = selCategorie === '' || String(a.category_id || '') === String(selCategorie);
    const matchGrp = selGroupe === '' || String(a.group_id || '') === String(selGroupe);

    return matchNom && matchBarcode && matchFam && matchCat && matchGrp;
  });

  // LOGIQUE DE TRI DES COLONNES
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getSortArrow = (field) => {
    if (sortField === field) {
      return sortDirection === 'asc' ? ' ↑' : ' ↓';
    }
    return ' ↕';
  };

  const articlesTries = [...articlesFiltrés].sort((a, b) => {
    let aVal, bVal;

    const paGrosA = a.prixAchat || a.cmp || a.prix_achat || 0;
    const coeffA = Number(a.unit_coefficient || a.unite_coefficient || a.coefficient || 1);
    const paDetailA = coeffA > 1 ? (paGrosA / coeffA) : paGrosA;
    const qTheoA = a.stock_theorique_fige ?? 0;
    const qReelA = a.qteTemp !== undefined ? a.qteTemp : qTheoA;
    const eQteA = qReelA - qTheoA;
    const valEcartA = Math.round(eQteA * paDetailA);

    const paGrosB = b.prixAchat || b.cmp || b.prix_achat || 0;
    const coeffB = Number(b.unit_coefficient || b.unite_coefficient || b.coefficient || 1);
    const paDetailB = coeffB > 1 ? (paGrosB / coeffB) : paGrosB;
    const qTheoB = b.stock_theorique_fige ?? 0;
    const qReelB = b.qteTemp !== undefined ? b.qteTemp : qTheoB;
    const eQteB = qReelB - qTheoB;
    const valEcartB = Math.round(eQteB * paDetailB);

    switch (sortField) {
      case 'nom':
        aVal = (a.nom || '').toLowerCase();
        bVal = (b.nom || '').toLowerCase();
        break;
      case 'famille':
        aVal = getNomFamille(a).toLowerCase();
        bVal = getNomFamille(b).toLowerCase();
        break;
      case 'categorie':
        aVal = getNomCategorie(a).toLowerCase();
        bVal = getNomCategorie(b).toLowerCase();
        break;
      case 'groupe':
        aVal = getNomGroupe(a).toLowerCase();
        bVal = getNomGroupe(b).toLowerCase();
        break;
      case 'theorique':
        aVal = qTheoA;
        bVal = qTheoB;
        break;
      case 'reel':
        aVal = qReelA;
        bVal = qReelB;
        break;
      case 'ecart':
        aVal = eQteA;
        bVal = eQteB;
        break;
      case 'valeurEcart':
        aVal = valEcartA;
        bVal = valEcartB;
        break;
      default:
        aVal = (a.nom || '').toLowerCase();
        bVal = (b.nom || '').toLowerCase();
    }

    if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  // 🚀 SYNC TOTAUX FINANCIERS NETTOYÉS DES IMPRÉCISIONS FLOTTANTES
  const totaux = articles.reduce((acc, art) => {
    const coeffLogistique = Number(art.unit_coefficient || art.unite_coefficient || art.coefficient || 1);
    const prixGros = parseFloat(art.prixAchat || art.cmp || art.prix_achat || 0); 
    const prixAchatUnitaireDetail = coeffLogistique > 1 ? (prixGros / coeffLogistique) : prixGros;

    const qTheo = parseFloat(art.stock_theorique_fige ?? 0);
    const qReel = art.qteTemp !== undefined ? parseFloat(art.qteTemp) : qTheo;
    
    acc.valTheo += qTheo * prixAchatUnitaireDetail;
    acc.valReel += qReel * prixAchatUnitaireDetail;
    acc.ecartVal += (qReel - qTheo) * prixAchatUnitaireDetail;

    acc.valTheo = Math.round(acc.valTheo);
    acc.valReel = Math.round(acc.valReel);
    acc.ecartVal = Math.round(acc.ecartVal);

    return acc;
  }, { valTheo: 0, valReel: 0, ecartVal: 0 });

  // Styles internes
  const layoutStyle = { display: 'flex', height: '100vh', background: '#f1f5f9', overflow: 'hidden' };
  const mainStyle = { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '0' };
  const bannerStyle = { background: '#0f172a', color: '#fbbf24', padding: '12px 25px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', fontWeight: '800', letterSpacing: '0.5px' };
  const contentLayout = { display: 'flex', flex: 1, overflow: 'hidden', padding: '15px', gap: '15px' };
  const leftZone = { flex: 3, display: 'flex', flexDirection: 'column', gap: '15px', overflow: 'hidden' };
  const rightZone = { flex: 1, display: 'flex', flexDirection: 'column', gap: '15px' };
  const searchContainer = { background: '#fff', padding: '15px', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', display: 'flex', gap: '10px', flexWrap: 'wrap' };
  const searchBox = { display: 'flex', alignItems: 'center', gap: '8px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '0 12px', flex: 1, minWidth: '150px' };
  const searchInput = { border: 'none', background: 'transparent', padding: '8px 0', width: '100%', fontSize: '13px', fontWeight: '600', outline: 'none' };
  const selectStyle = { padding: '8px 12px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', fontWeight: '600', color: '#1e293b', outline: 'none', cursor: 'pointer' };
  const tableWrapper = { flex: 1, background: '#fff', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflowY: 'auto', overflowX: 'auto', border: '1px solid #e2e8f0' };
  const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: '13px' };
  const theadStyle = { background: '#1e293b', color: '#fff', position: 'sticky', top: 0, zIndex: 10, userSelect: 'none' };
  const trStyle = { borderBottom: '1px solid #e2e8f0', cursor: 'pointer', transition: 'background 0.2s' };
  const tdStyle = { padding: '12px 15px', verticalAlign: 'middle' };
  const tdCenter = { padding: '12px 15px', textAlign: 'center', verticalAlign: 'middle', fontWeight: '700' };
  const footerSummary = { background: '#1e293b', color: '#fff', padding: '15px 25px', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' };
  const summaryItem = { display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' };
  const valBold = { fontSize: '16px', fontWeight: '900', color: '#fff' };
  const voletSaisie = { background: '#fff', borderRadius: '10px', border: '2px solid #2563eb', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column' };
  const voletTitre = { background: '#2563eb', color: '#fff', padding: '12px', fontSize: '13px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center', borderRadius: '6px 6px 0 0' };
  const inputStyle = { padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none', width: '100%' };
  const btnSuccess = { background: '#10b981', color: '#fff', padding: '12px', borderRadius: '8px', border: 'none', fontWeight: '800', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer', boxShadow: '0 2px 4px rgba(16,185,129,0.2)' };
  const btnWarn = { background: '#f59e0b', color: '#fff', padding: '12px', borderRadius: '8px', border: 'none', fontWeight: '800', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer', boxShadow: '0 2px 4px rgba(245,158,11,0.2)' };
  const btnDanger = { background: '#ef4444', color: '#fff', padding: '12px', borderRadius: '8px', border: 'none', fontWeight: '800', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer', boxShadow: '0 2px 4px rgba(239,68,68,0.2)' };
  const btnPrimarySmall = { background: '#2563eb', color: '#fff', padding: '10px 20px', borderRadius: '6px', border: 'none', fontWeight: '800', fontSize: '12px', cursor: 'pointer', flex: 1 };
  const btnOutlineSmall = { background: '#fff', color: '#64748b', padding: '10px 20px', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: '700', fontSize: '12px', cursor: 'pointer', flex: 1 };
  const aideBox = { background: '#fff', borderRadius: '10px', border: '2px dashed #cbd5e1', padding: '40px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1 };
  const overlayStyle = { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(2px)' };
  const modalStyle = { background: '#fff', borderRadius: '12px', width: '90%', maxWidth: '400px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', overflow: 'hidden', animation: 'fadeIn 0.2s ease-out' };
  const modalHeader = { background: '#f8fafc', padding: '15px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px' };
  const modalFooter = { background: '#f8fafc', padding: '12px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '10px', justifyContent: 'flex-end' };
  const loaderStyle = { padding: '60px 20px', textAlign: 'center', fontWeight: '800', color: '#64748b', fontSize: '14px', letterSpacing: '0.5px' };

  return (
    <div style={layoutStyle}>
      <Sidebar />
      <main style={mainStyle}>
        <div style={bannerStyle}>
          <AlertTriangle size={18} />
          <span>INVENTAIRE EN COURS (ID: {activeInvId}) | Mode : P.A (CMP) & Enregistrement P.V</span>
        </div>

        <div style={contentLayout}>
          <div style={leftZone}>
            <div style={searchContainer}>
              <div style={searchBox}>
                <Barcode size={20} color="#1e293b" />
                <input 
                  type="text"
                  placeholder="Scanner..." style={searchInput} value={searchBarcode}
                  onChange={(e) => { setSearchBarcode(e.target.value); if(e.target.value) setSearchNom(''); }}
                />
              </div>
              <div style={searchBox}>
                <Search size={20} color="#1e293b" />
                <input 
                  type="text"
                  placeholder="Nom article..." style={searchInput} value={searchNom}
                  onChange={(e) => setSearchNom(e.target.value)}
                />
              </div>
              <select style={selectStyle} value={selFamille} onChange={(e) => { setSelFamille(e.target.value); setSelCategorie(''); setSelGroupe(''); }}>
                <option value="">Familles</option>
                {familles.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
              </select>
              <select style={selectStyle} value={selCategorie} onChange={(e) => { setSelCategorie(e.target.value); setSelGroupe(''); }}>
                <option value="">Catégories</option>
                {categories.filter(c => !selFamille || String(c.famille_id) === String(selFamille)).map(c => (
                  <option key={c.id} value={c.id}>{c.nom}</option>
                ))}
              </select>
              <select style={selectStyle} value={selGroupe} onChange={(e) => setSelGroupe(e.target.value)}>
                <option value="">Groupes</option>
                {groupes.filter(g => !selCategorie || String(g.category_id) === String(selCategorie)).map(g => (
                  <option key={g.id} value={g.id}>{g.nom}</option>
                ))}
              </select>
            </div>
            
            <div style={tableWrapper}>
              {loading ? (
                <div style={loaderStyle}>SYNCHRONISATION SQL EN COURS...</div>
              ) : (
                <table style={tableStyle}>
                  <thead style={theadStyle}>
                    <tr>
                      <th style={{textAlign: 'left', padding: '15px', cursor: 'pointer'}} onClick={() => handleSort('nom')}>
                        DÉSIGNATION{getSortArrow('nom')}
                      </th>
                      <th style={{textAlign: 'center', padding: '15px', cursor: 'pointer'}} onClick={() => handleSort('famille')}>
                        FAMILLE{getSortArrow('famille')}
                      </th>
                      <th style={{textAlign: 'center', padding: '15px', cursor: 'pointer'}} onClick={() => handleSort('categorie')}>
                        CATÉGORIE{getSortArrow('categorie')}
                      </th>
                      <th style={{textAlign: 'center', padding: '15px', cursor: 'pointer'}} onClick={() => handleSort('groupe')}>
                        GROUPE{getSortArrow('groupe')}
                      </th>
                      <th style={{textAlign: 'center', padding: '15px', cursor: 'pointer'}} onClick={() => handleSort('theorique')}>
                        THÉORIQUE{getSortArrow('theorique')}
                      </th>
                      <th style={{textAlign: 'center', padding: '15px', cursor: 'pointer'}} onClick={() => handleSort('reel')}>
                        RÉEL{getSortArrow('reel')}
                      </th>
                      <th style={{textAlign: 'center', padding: '15px', cursor: 'pointer'}} onClick={() => handleSort('ecart')}>
                        ÉCART{getSortArrow('ecart')}
                      </th>
                      <th style={{textAlign: 'center', padding: '15px', cursor: 'pointer'}} onClick={() => handleSort('valeurEcart')}>
                        VALEUR ÉCART{getSortArrow('valeurEcart')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {articlesTries.map(art => {
                      const paGros = art.prixAchat || art.cmp || art.prix_achat || 0;
                      const coeffLogistique = Number(art.unit_coefficient || art.unite_coefficient || art.coefficient || 1);
                      const paDetailUnitaire = coeffLogistique > 1 ? (paGros / coeffLogistique) : paGros;
                      
                      const qTheo = art.stock_theorique_fige ?? 0; 
                      const qReel = art.qteTemp;
                      const eQte = qReel !== undefined ? qReel - qTheo : null;

                      const expressionTheorique = formaterStockPOS({ ...art, qteTemp: qTheo });
                      const expressionReelle = qReel !== undefined ? formaterStockPOS({ ...art, qteTemp: qReel }) : '---';
                      
                      let expressionEcart = '';
                      if (eQte !== null) {
                          if (eQte === 0) {
                              expressionEcart = formaterStockPOS(art, 0);
                          } else {
                              const estManquant = eQte < 0;
                              const volumeAbsolu = Math.abs(eQte);
                              const chaineFormateeAbsolue = formaterStockPOS(art, volumeAbsolu);
                              expressionEcart = estManquant ? `-${chaineFormateeAbsolue}` : `+${chaineFormateeAbsolue}`;
                          }
                      }

                      const valeurFinanciereEcart = eQte !== null ? Math.round(eQte * paDetailUnitaire) : null;

                      // 🎯 MISE EN ÉVIDENCE DE LA LIGNE SÉLECTIONNÉE
                      const estSelectionne = articleEnCours?.id === art.id;
                      const bgCouleur = estSelectionne 
                        ? '#dbeafe' // Bleu de sélection distinctif quand la ligne est cliquée
                        : (qReel !== undefined ? '#f0f9ff' : 'white');

                      return (
                        <tr 
                          key={art.id} 
                          style={{
                            ...trStyle, 
                            backgroundColor: bgCouleur,
                            borderLeft: estSelectionne ? '4px solid #2563eb' : '4px solid transparent'
                          }} 
                          onClick={() => selectionnerArticle(art)}
                        >
                          <td style={tdStyle}>
                              <div style={{fontWeight: '900', color: estSelectionne ? '#1e40af' : '#0f172a'}}>{art.nom}</div>
                              <div style={{fontSize: '10px', color: '#64748b'}}>REF: {art.codeBarre || art.id} | P.V: {Number(art.prixVente || 0).toLocaleString()} F</div>
                          </td>
                          <td style={tdCenter}>{getNomFamille(art)}</td>
                          <td style={tdCenter}>{getNomCategorie(art)}</td>
                          <td style={tdCenter}>{getNomGroupe(art)}</td>
                          <td style={{ ...tdCenter, color: '#475569', fontSize: '12px', fontWeight: '700' }}>{expressionTheorique}</td>
                          <td style={{ ...tdCenter, color: '#2563eb', fontWeight: '900', fontSize: '12px' }}>{expressionReelle}</td>
                          <td style={{ ...tdCenter, fontWeight: '900', color: eQte < 0 ? '#dc2626' : eQte > 0 ? '#16a34a' : '#475569', fontSize: '12px' }}>{expressionEcart}</td>
                          <td style={{ ...tdCenter, fontWeight: '700', color: eQte < 0 ? '#dc2626' : eQte > 0 ? '#16a34a' : '#475569' }}>
                            {valeurFinanciereEcart !== null ? `${valeurFinanciereEcart.toLocaleString()} F` : ''}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div style={footerSummary}>
                <div style={summaryItem}><span>VALEUR THÉORIQUE</span> <strong style={valBold}>{totaux.valTheo.toLocaleString()} F</strong></div>
                <div style={summaryItem}><span>VALEUR RÉELLE</span> <strong style={{...valBold, color: '#60a5fa'}}>{totaux.valReel.toLocaleString()} F</strong></div>
                <div style={summaryItem}><span>IMPACT NET</span> <strong style={{...valBold, color: totaux.ecartVal < 0 ? '#f87171' : '#4ade80'}}>{totaux.ecartVal.toLocaleString()} F</strong></div>
            </div>
          </div>

          <div style={rightZone}>
            <button type="button" style={btnSuccess} onClick={() => setDialogue({ show: true, titre: "Clôturer ?", msg: "Valider les stocks définitifs ?", type: "primary", action: executerCloture })}>
              <CheckCircle2 size={18} /> CLÔTURER
            </button>
            <button type="button" style={btnWarn} onClick={() => setDialogue({ show: true, titre: "Confirmer ?", msg: "Mettre à 0 le non-compté ?", type: "primary", action: mettreAZeroLeReste })}>
              <ArrowDownCircle size={18} /> RESTE À 0
            </button>
            <button type="button" style={btnDanger} onClick={() => setDialogue({ show: true, titre: "Annuler ?", msg: "Arrêter l'inventaire et déverrouiller le système ?", type: "danger", action: annulerEtDebloquer })}>
              <XCircle size={18} /> ANNULER
            </button>

            {articleEnCours ? (
              <div style={voletSaisie}>
                <div style={voletTitre}>SAISIE QUANTITÉ</div>
                <div style={{padding: '15px', display: 'flex', flexDirection: 'column', gap: '12px'}}>
                  <p style={{fontWeight: '900', fontSize: '12px', marginBottom: '4px', textTransform: 'uppercase', color: '#2563eb', textAlign: 'center'}}>{articleEnCours.nom}</p>
                  
                  {Number(articleEnCours.unit_coefficient || articleEnCours.unite_coefficient || articleEnCours.coefficient || 1) > 1 && (
                    <div style={{display: 'flex', flexDirection: 'column', gap: '4px'}}>
                      <label style={{fontSize: '10px', fontWeight: '900', color: '#64748b'}}>
                        En {(articleEnCours.unit_code_gros ?? articleEnCours.code) || 'GROS'} :
                      </label>
                      <div style={{display: 'flex', alignItems: 'center', position: 'relative'}}>
                        <input 
                          ref={inputRef} 
                          type="number" 
                          placeholder="0"
                          style={{...inputStyle, paddingRight: '45px', fontWeight: '800'}} 
                          value={saisieGros}
                          onChange={(e) => setSaisieGros(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && enregistrerQte()}
                        />
                        <span style={{position: 'absolute', right: '12px', fontWeight: '900', color: '#94a3b8', fontSize: '11px'}}>
                          {(articleEnCours.unit_code_gros ?? articleEnCours.code) || 'CS'}
                        </span>
                      </div>
                    </div>
                  )}

                  <div style={{display: 'flex', flexDirection: 'column', gap: '4px'}}>
                    <label style={{fontSize: '10px', fontWeight: '900', color: '#64748b'}}>
                      En {(articleEnCours.unit_ref_detail ?? articleEnCours.unite_reference) || 'DÉTAIL'} :
                    </label>
                    <div style={{display: 'flex', alignItems: 'center', position: 'relative'}}>
                      <input 
                        ref={Number(articleEnCours.unit_coefficient || articleEnCours.unite_coefficient || articleEnCours.coefficient || 1) <= 1 ? inputRef : null}
                        type="number" 
                        placeholder="0"
                        style={{...inputStyle, paddingRight: '45px', fontWeight: '800'}} 
                        value={saisieDetail}
                        onChange={(e) => setSaisieDetail(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && enregistrerQte()}
                      />
                      <span style={{position: 'absolute', right: '12px', fontWeight: '900', color: '#94a3b8', fontSize: '11px'}}>
                        {(articleEnCours.unit_ref_detail ?? articleEnCours.unite_reference) || 'UNITÉ'}
                      </span>
                    </div>
                  </div>

                  <div style={{display: 'flex', gap: '8px', marginTop: '6px'}}>
                    <button type="button" style={btnOutlineSmall} onClick={() => { setArticleEnCours(null); setSaisieGros(''); setSaisieDetail(''); }}>RETOUR</button>
                    <button type="button" style={btnPrimarySmall} onClick={enregistrerQte}>VALIDER</button>
                  </div>
                </div>
              </div>
            ) : (
              <div style={aideBox}>
                <Info size={30} color="#cbd5e1" />
                <p style={{fontSize: '10px', marginTop: '10px', color: '#64748b', fontWeight: '900'}}>CLIQUEZ SUR UN ARTICLE POUR SAISIR</p>
              </div>
            )}
          </div>
        </div>

        {dialogue.show && (
          <div style={overlayStyle}>
            <div style={modalStyle}>
              <div style={modalHeader}>
                <ShieldAlert color={dialogue.type === 'danger' ? '#dc2626' : '#3b82f6'} />
                <span style={{fontWeight: '900'}}>{dialogue.titre}</span>
              </div>
              <div style={{padding: '20px', textAlign: 'center', fontWeight: '700'}}>{dialogue.msg}</div>
              <div style={modalFooter}>
                <button type="button" style={btnOutlineSmall} onClick={() => setDialogue({ ...dialogue, show: false })}>Annuler</button>
                <button 
                  type="button" 
                  style={dialogue.type === 'danger' ? {...btnPrimarySmall, background: '#dc2626'} : btnPrimarySmall} 
                  onClick={() => { dialogue.action(); }}
                >
                  Confirmer
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default InventaireSaisie;