import React, { useState, useEffect, useMemo } from 'react';
import { 
  Package, Plus, X, Search, Clock, Edit2, 
  Archive, ChevronDown, ChevronRight, Percent, Database, Zap,
  TrendingUp, BarChart3, ShieldCheck, Tag, AlertCircle, Info, History, CheckCircle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../../components/Sidebar';
import { getUserPermissions } from '../../utils/permissions_utils'; // 🔑 IMPORTATION DU SÉCURISEUR

// IMPORT UNIQUE - LE MÊME QUE DANS ARTICLE LIST
import API, { socket } from '../../services/api'; 

const ArticlesHub = () => {
  const navigate = useNavigate();
  
  // 🔑 EXTRACTION GRANULAIRE ET SOUPLITUDE DU TYPE DE DONNÉE POUR LES 2 BOUTONS D'ACTION
  const userPerms = useMemo(() => getUserPermissions(), []);
  
  const canSubmitCreate = userPerms['art_btn_create_submit'] === true || userPerms['art_btn_create_submit'] === 1 || userPerms['art_btn_create_submit'] === 'true' || userPerms['art_btn_create_submit'] === '1';
  const canSubmitEdit = userPerms['art_btn_edit_submit'] === true || userPerms['art_btn_edit_submit'] === 1 || userPerms['art_btn_edit_submit'] === 'true' || userPerms['art_btn_edit_submit'] === '1';

  // --- ÉTATS (STATES) ---
  const [articles, setArticles] = useState([]);
  const [activeTab, setActiveTab] = useState('catalogue'); 
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [isInventoryActive, setIsInventoryActive] = useState(false);
  
  // État pour le Toast de confirmation/alerte intégré
  const [toast, setToast] = useState({ show: false, message: '', type: 'confirm', data: null });

  const [newArticle, setNewArticle] = useState({
    nom: '', 
    cmp: 0, 
    margeTaux: 25, 
    prixVente: 0, 
    famille: 'Général'
  });

  // --- LOGIQUE MÉTIER ---
  
  const genererIdArticle = () => `ART-${Date.now().toString().slice(-6)}`;

  const calculatePrice = (cmp, taux) => {
    const prix = parseFloat(cmp || 0) * (1 + (parseFloat(taux || 0) / 100));
    return Math.round(prix);
  };

  const toggleExpand = (id) => setExpandedId(expandedId === id ? null : id);

  const getDaysRemaining = (dateFin) => {
    if (!dateFin) return null;
    const now = new Date();
    const end = new Date(dateFin);
    const diffInMs = end - now;
    if (diffInMs <= 0) return "EXPIRÉ";
    const diffInMins = Math.floor(diffInMs / (1000 * 60));
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
    if (diffInDays >= 1) return `${diffInDays} JOUR${diffInDays > 1 ? 'S' : ''}`;
    if (diffInHours >= 1) return `${diffInHours} HEURE${diffInHours > 1 ? 'S' : ''}`;
    return `${diffInMins} MINUTE${diffInMins > 1 ? 'S' : ''}`;
  };

  const fetchInitialData = async () => {
    try {
      const response = await API.get('/products');
      setArticles(Array.isArray(response.data) ? response.data : []);
    } catch (err) { 
      console.error("🔥 Erreur de chargement Hub :", err); 
    }
  };

  // --- LOGIQUE SYNC TEMPS RÉEL (SNC) POUR ARTICLESHUB ---
  useEffect(() => {
    fetchInitialData();
    
    const checkInventoryStatus = async () => {
      try {
        const res = await API.get('/inventories/check-status');
        setIsInventoryActive(!!res.data.en_cours);
      } catch (err) {
        console.error("Erreur statut inventaire:", err);
      }
    };
    
    checkInventoryStatus();

    const handleGlobalUpdate = (event) => {
      const data = event.detail;
      const tableName = data?.table || data; 
      const action = data?.action || '';
      const impactedId = data?.id;

      if (tableName === 'products' || tableName === 'all') {
        if (action === 'STATUS_CHANGE' && impactedId) {
            setArticles(prev => prev.map(art => {
                const artId = (art.id || art.id_article)?.toString().trim();
                const incomingId = impactedId.toString().trim();
                return artId === incomingId ? { ...art, is_active: data.is_active } : art;
            }));
        } else {
            fetchInitialData();
        }
      }

      if (tableName === 'inventory') {
        console.log("📢 Changement d'état inventaire détecté...");
        checkInventoryStatus(); 
      }
    };

    window.addEventListener('ERP_DATA_CHANGED', handleGlobalUpdate);

    return () => {
      window.removeEventListener('ERP_DATA_CHANGED', handleGlobalUpdate);
    };
  }, []);

  // --- ACTIONS ---
  const handleToggleArchive = (id, currentStatus) => {
    // 🔑 SÉCURITÉ DE POSTE INTERNE : Interdire l'action d'archivage/modification si la permission du bouton est absente
    if (!canSubmitEdit) {
      setToast({
        show: true,
        message: "🛑 ACCÈS REFUSÉ : Votre profil ne possède pas le privilège requis pour archiver ou restaurer un article.",
        type: 'error',
        data: null
      });
      return;
    }

    // 1. PRIORITÉ ABSOLUE : Blocage si Inventaire en cours
    if (isInventoryActive) {
      setToast({
        show: true,
        message: "🛑 SYSTÈME GELÉ : Impossible de modifier le statut (Archive/Restauration) pendant un inventaire.",
        type: 'error',
        data: null
      });
      return;
    }

    const art = articles.find(a => a.id === id);
    const action = currentStatus === 1 ? "archiver" : "restaurer";

    // 2. RÈGLE MÉTIER AVEC SÉCURISATION LOGISTIQUE ANTI-LITIGE :
    // On bloque l'archivage si le stock natif est supérieur à 0, mais on affiche la forme textuelle formatée.
    if (currentStatus === 1 && art && parseFloat(art.stock_actuel || 0) > 0) {
      const stockVisible = art.stock_formate || art.stock_physique_formate || `${art.stock_actuel} UNITÉS`;
      setToast({
        show: true,
        message: `Cet article contient des marchandises actives en rayon (Stock actuel : ${stockVisible}) et ne peut pas être archivé sans inventaire de mise à zéro préalable.`,
        type: 'error',
        data: null
      });
      return;
    }

    // 3. CONFIRMATION via Toast intégré
    setToast({
      show: true,
      message: `Voulez-vous vraiment ${action} cet article ?`,
      type: 'confirm',
      data: { id, currentStatus }
    });
  };
// LOGIQUE DE CONFIRMATION DU TOAST
  const confirmToggleStatus = async () => {
    // 🔑 SÉCURITÉ DOUBLE VÉROU : Bloquer la fonction d'exécution si le droit du bouton d'édition est manquant
    if (!canSubmitEdit) return;

    const { id, currentStatus } = toast.data;
    try {
      const newStatus = currentStatus === 1 ? 0 : 1;
      await API.patch(`/products/${id}/status`, { is_active: newStatus });
      setToast({ show: false, message: '', type: 'confirm', data: null });
    } catch (err) { 
      console.error("🔥 Erreur statut :", err);
      setToast({ show: true, message: "Erreur lors du changement de statut", type: 'error', data: null });
    }
  };

  const handleQuickSave = async (e) => {
    e.preventDefault();

    // 🔑 SÉCURITÉ DE POSTE INTERNE : Interdire la validation si le privilège du bouton de création est absent
    if (!canSubmitCreate) {
      setToast({ show: true, message: "🛑 ACCÈS REFUSÉ : Action non autorisée pour votre profil.", type: 'error', data: null });
      return;
    }

    const dataToSend = {
      id: genererIdArticle(),
      nom: newArticle.nom.toUpperCase(),
      cmp: parseFloat(newArticle.cmp || 0),
      margeTaux: parseFloat(newArticle.margeTaux || 0),
      prixVente: parseFloat(newArticle.prixVente || 0),
      branch_id: 1, 
      is_active: 1,
      is_configured: 1,
      unite_id: null, // 🚀 ALIGNEMENT LOGISTIQUE : Un article créé à la volée devra être configuré avec une unité de gros ultérieurement
      stock_actuel: '0', // 🌟 SÉCURISATION ANTI-LITIGE : Initialisation textuelle propre attendue par SQLite
      stock_alerte: '0',
      famille: newArticle.famille,
      sync_status: 'pending'
    };

    try {
      await API.post('/products/full', dataToSend);
      setShowModal(false);
      setNewArticle({ nom: '', cmp: 0, margeTaux: 25, prixVente: 0, famille: 'Général' });
    } catch (err) { 
      setToast({ show: true, message: "Erreur lors de l'insertion", type: 'error', data: null });
    }
  };

  // --- Composants Internes ---

  const PromoBadge = ({ art }) => {
    if (art.is_promo !== 1) return null;
    
    // On utilise le nom de fonction qui existe en haut de ton fichier
    const temps = getDaysRemaining(art.promo_fin); 
    
    return (
      <div style={{ 
        display: 'inline-flex', alignItems: 'center', gap: '4px', 
        background: '#fff7ed', color: '#c2410c', padding: '4px 8px', 
        borderRadius: '6px', fontSize: '10px', fontWeight: '800', 
        border: '1px solid #ffedd5', marginTop: '6px' 
      }}>
        <Tag size={12} /> 
        PROMO : -{art.promo_valeur}{art.promo_type === 'percentage' ? '%' : 'F'} 
        {temps !== null && ` (${temps} restant)`}
      </div>
    );
  };
  // --- Filtrage ---
  const filteredArticles = articles.filter(art => {
    const matchesSearch = (art.nom || "").toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (art.id || "").toString().includes(searchTerm);
    if (!matchesSearch) return false;
    // Filtrage par onglet (Catalogue Actif vs Archives)
    return activeTab === 'catalogue' ? art.is_active === 1 : art.is_active === 0;
  });

  // --- Styles ---
  const s = {
    layout: { display: 'flex', height: '100vh', overflow: 'hidden', position: 'relative' },
    mainArea: { flex: 1, overflowY: 'auto', background: '#f1f5f9', display: 'flex', flexDirection: 'column' },
    tab: (active) => ({
      padding: '16px 24px', cursor: 'pointer',
      borderBottom: active ? '3px solid #2563eb' : '3px solid transparent',
      color: active ? '#2563eb' : '#64748b', fontWeight: active ? '800' : '600',
      display: 'flex', alignItems: 'center', gap: '10px', transition: '0.2s'
    }),
    detailGrid: { display: 'grid', gridTemplateColumns: '1.2fr 1fr 1.8fr 1fr', gap: '15px', padding: '20px', background: '#f8fafc', borderBottom: '2px solid #e2e8f0' },
    cardInfo: { background: 'white', padding: '15px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' },
    remiseItem: { padding: '10px', borderRadius: '8px', background: '#f1f5f9', marginBottom: '8px', borderLeft: '3px solid #cbd5e1' },
    modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
    modal: { background: 'white', padding: '30px', borderRadius: '16px', width: '450px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' },
    toast: {
      position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
      zIndex: 9999, padding: '16px 24px', borderRadius: '12px', background: 'white',
      boxShadow: '0 10px 25px rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', gap: '15px',
      border: '1px solid #e2e8f0', minWidth: '420px'
    }
  };

  return (
    <div style={s.layout}>
      <Sidebar />

      {/* TOAST DE CONFIRMATION / ALERTE INTÉGRÉ */}
      {toast.show && (
        <div style={s.toast}>
          {toast.type === 'confirm' ? (
            <div style={{background: '#eff6ff', padding: '8px', borderRadius: '8px'}}><Info color="#2563eb" size={24} /></div>
          ) : (
            <div style={{background: '#fee2e2', padding: '8px', borderRadius: '8px'}}><AlertCircle color="#ef4444" size={24} /></div>
          )}
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: '14px', fontWeight: '800', color: '#0f172a' }}>
              {toast.type === 'confirm' ? 'CONFIRMATION' : 'ERREUR'}
            </p>
            <p style={{ margin: 0, fontSize: '12px', color: '#64748b', fontWeight: '500' }}>{toast.message}</p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {toast.type === 'confirm' ? (
              <>
                <button 
                  onClick={() => setToast({ show: false, message: '', type: 'confirm', data: null })}
                  style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: '11px', fontWeight: '700' }}
                > ANNULER </button>
                <button 
                  onClick={confirmToggleStatus}
                  style={{ padding: '8px 12px', borderRadius: '8px', border: 'none', background: '#2563eb', color: 'white', cursor: 'pointer', fontSize: '11px', fontWeight: '700' }}
                > CONFIRMER </button>
              </>
            ) : (
              <button 
                onClick={() => setToast({ show: false, message: '', type: 'confirm', data: null })}
                style={{ padding: '8px 12px', borderRadius: '8px', border: 'none', background: '#0f172a', color: 'white', cursor: 'pointer', fontSize: '11px', fontWeight: '700' }}
              > COMPRIS </button>
            )}
          </div>
        </div>
      )}

      <main style={s.mainArea}>

       {/* Header de la page */}
        <header style={{ background: 'white', padding: '20px 40px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 10 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '22px', fontWeight: '900', color: '#0f172a' }}>RÉFÉRENTIEL ARTICLES</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
              <Database size={16} color={isInventoryActive ? "#ef4444" : "#2563eb"} />
              <span style={{ color: isInventoryActive ? '#ef4444' : '#64748b', fontSize: '13px', fontWeight: '800' }}>
                {isInventoryActive ? "⚠️ ACCÈS EN LECTURE SEULE (INVENTAIRE)" : "Base de données locale"}
              </span>
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '12px' }}>
            <div style={{ position: 'relative' }}>
              <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} size={18} />
              <input 
                type="text" 
                placeholder="Rechercher un article..." 
                style={{ padding: '11px 11px 11px 40px', borderRadius: '10px', border: '1px solid #e2e8f0', width: '280px' }} 
                value={searchTerm} 
                onChange={(e) => setSearchTerm(e.target.value)} 
              />
            </div>
            
            {/* 🔑 MAPPAGE DYNAMIQUE DU BOUTON DE CRÉATION RAPIDE */}
            <button 
              onClick={() => {
                if (isInventoryActive) {
                  setToast({ show: true, message: "CRÉATION BLOQUÉE : Un inventaire est en cours.", type: 'error' });
                } else if (!canSubmitCreate) {
                  setToast({ show: true, message: "🛑 ACCÈS REFUSÉ : Privilège de création insuffisant pour votre rôle.", type: 'error' });
                } else {
                  navigate('/admin/articles/create');
                }
              }} 
              style={{ 
                display: 'flex', alignItems: 'center', gap: '8px', padding: '11px 18px', 
                borderRadius: '10px', border: 'none', 
                background: (isInventoryActive || !canSubmitCreate) ? '#cbd5e1' : '#2563eb', 
                color: 'white', 
                cursor: (isInventoryActive || !canSubmitCreate) ? 'not-allowed' : 'pointer', 
                fontWeight: '700' 
              }}
            >
              <Plus size={18} /> {(isInventoryActive || !canSubmitCreate) ? 'Action Restreinte' : 'Nouveau'}
            </button>
          </div>
        </header>

        <div style={{ padding: '30px 40px' }}>
          {/* Système d'onglets */}
          <div style={{ display: 'flex', background: 'white', borderRadius: '12px 12px 0 0', border: '1px solid #e2e8f0', borderBottom: 'none', width: 'fit-content' }}>
            <div style={s.tab(activeTab === 'catalogue')} onClick={() => setActiveTab('catalogue')}>
              <Package size={18} /> Catalogue Actif ({articles.filter(a => a.is_active === 1).length})
            </div>
            <div style={s.tab(activeTab === 'archives')} onClick={() => setActiveTab('archives')}>
              <Archive size={18} /> Archives ({articles.filter(a => a.is_active === 0).length})
            </div>
          </div>

          {/* Table des Articles */}
          <div style={{ background: 'white', borderRadius: '0 12px 12px 12px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ width: '50px', padding: '15px' }}></th>
                  <th style={{ padding: '15px', color: '#475569', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase' }}>Article</th>
                  <th style={{ padding: '15px', color: '#475569', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase' }}>Identifiant</th>
                  <th style={{ padding: '15px', color: '#475569', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase' }}>Stock</th>
                  <th style={{ padding: '15px', color: '#475569', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase' }}>Prix Public</th>
                  <th style={{ padding: '15px', color: '#475569', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase' }}>Statut</th>
                  <th style={{ padding: '15px', textAlign: 'right', color: '#475569', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredArticles.map(art => (
                  <React.Fragment key={art.id}>
                    {/* Ligne Principale */}
                    <tr 
                      style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: '0.2s', background: expandedId === art.id ? '#f0f7ff' : 'transparent' }} 
                      onClick={() => toggleExpand(art.id)}
                    >
                      <td style={{ padding: '15px', textAlign: 'center' }}>
                        {expandedId === art.id ? <ChevronDown size={18} color="#2563eb" /> : <ChevronRight size={18} color="#cbd5e1" />}
                      </td>
                      <td style={{ padding: '15px' }}>
                        <div style={{ fontWeight: '800', color: '#0f172a', fontSize: '16px' }}>{art.nom}</div>
                        <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '600' }}>
                          {art.group_nom || art.famille} • {art.unite_libelle || 'U'}
                        </div>
                        <PromoBadge art={art} />
                      </td>
                      <td style={{ padding: '15px', color: '#64748b', fontSize: '12px', fontFamily: 'monospace' }}>{art.id}</td>
                      
                      {/* --- COLONNE STOCK CORRIGÉE AVEC LE TEXTE FORMATÉ --- */}
                      <td style={{ padding: '15px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <div style={{ 
                            fontWeight: '900', 
                            fontSize: '16px',
                            color: parseFloat(art.stock_actuel || 0) <= parseFloat(art.stockAlerte || art.stock_alerte || 0) ? '#ef4444' : '#0f172a',
                            whiteSpace: 'nowrap'
                          }}>
                            {/* 🌟 PROPRIÉTÉ DÉDIÉE : Affiche cartons + bouteilles (ex: 21 CS + 7 BTL) */}
                            {art.stock_formate || art.stock_physique_formate || `${art.stock_actuel || 0} U`}
                          </div>
                          <div style={{ width: '50px', height: '4px', background: '#e2e8f0', borderRadius: '2px', marginTop: '4px', overflow: 'hidden' }}>
                            <div style={{ 
                              width: '100%', 
                              height: '100%', 
                              background: parseFloat(art.stock_actuel || 0) <= parseFloat(art.stockAlerte || art.stock_alerte || 0) ? '#ef4444' : '#22c55e' 
                            }}></div>
                          </div>
                        </div>
                      </td>

<td style={{ padding: '15px' }}>
        <div style={{ fontWeight: '900', color: '#2563eb', fontSize: '15px' }}>{parseFloat(art.prixVente || 0).toLocaleString()} F</div>
      </td>
      <td style={{ padding: '15px' }}>
        <span style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: '800', background: art.is_active ? '#dcfce7' : '#fee2e2', color: art.is_active ? '#15803d' : '#b91c1c' }}>
          {art.is_active ? 'ACTIF' : 'ARCHIVÉ'}
        </span>
      </td>
      <td style={{ padding: '15px' }}>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }} onClick={(e) => e.stopPropagation()}>
          
          {/* 🔑 BOUTON ÉDITER : Soumis au droit granulaire de bouton art_btn_edit_submit */}
          <button 
            onClick={() => {
              if (isInventoryActive) {
                setToast({ show: true, message: "ÉDITION BLOQUÉE : Un inventaire est en cours.", type: 'error' });
              } else if (!canSubmitEdit) {
                setToast({ show: true, message: "🛑 ACCÈS REFUSÉ : Privilège de modification manquant pour votre profil.", type: 'error' });
              } else {
                navigate(`/admin/articles/edit/${art.id}`);
              }
            }} 
            style={{ 
              padding: '7px', 
              borderRadius: '6px', 
              border: '1px solid #e2e8f0', 
              background: (isInventoryActive || !canSubmitEdit) ? '#f1f5f9' : 'white', 
              cursor: (isInventoryActive || !canSubmitEdit) ? 'not-allowed' : 'pointer', 
              color: (isInventoryActive || !canSubmitEdit) ? '#94a3b8' : '#2563eb',
              opacity: (isInventoryActive || !canSubmitEdit) ? 0.6 : 1
            }} 
            title={(isInventoryActive || !canSubmitEdit) ? "Édition bloquée" : "Modifier"}
            disabled={isInventoryActive || !canSubmitEdit}
          >
            <Edit2 size={16} />
          </button>

          {/* 🔑 BOUTON ARCHIVE/ZAP : Soumis au droit granulaire de bouton art_btn_edit_submit */}
          <button 
            onClick={() => {
              if (isInventoryActive) {
                setToast({ show: true, message: "ACTION BLOQUÉE : Un inventaire est en cours.", type: 'error' });
              } else if (!canSubmitEdit) {
                setToast({ show: true, message: "🛑 ACCÈS REFUSÉ : Privilège d'archivage manquant pour votre profil.", type: 'error' });
              } else {
                handleToggleArchive(art.id, art.is_active);
              }
            }} 
            style={{ 
              padding: '7px', 
              borderRadius: '6px', 
              border: '1px solid #e2e8f0', 
              background: (isInventoryActive || !canSubmitEdit) ? '#f1f5f9' : (art.is_active ? 'white' : '#fee2e2'), 
              cursor: (isInventoryActive || !canSubmitEdit) ? 'not-allowed' : 'pointer', 
              color: (isInventoryActive || !canSubmitEdit) ? '#94a3b8' : (art.is_active ? '#64748b' : '#ef4444'),
              opacity: (isInventoryActive || !canSubmitEdit) ? 0.6 : 1
            }}
            disabled={isInventoryActive || !canSubmitEdit}
            title={(isInventoryActive || !canSubmitEdit) ? "Action bloquée" : (art.is_active ? "Archiver" : "Restaurer")}
          >
            {art.is_active ? <Archive size={16} /> : <Zap size={16} />} 
          </button>
          
        </div>
      </td>
    </tr>

    {/* 🚀 ALIGNEMENT SYNTAXIQUE PARFAIT : Rendu conditionnel du panneau dépliant hors de la ligne standard */}
    {expandedId === art.id && (
      <tr>
        <td colSpan="7" style={{ padding: 0 }}>
          <div style={s.detailGrid}>
            
            {/* RENTABILITÉ */}
            <div style={s.cardInfo}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '800', fontSize: '11px', color: '#0f172a', marginBottom: '12px', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                <TrendingUp size={16} /> RENTABILITÉ
              </div>
              <div style={{ fontSize: '12px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
                <span>Prix Achat (CMP):</span> <b>{parseFloat(art.cmp || 0).toLocaleString()} F</b>
              </div>

              {/* 🌟 APERÇU LOGISTIQUE DE DÉTAIL : Affiche le prix par bouteille ou pièce de détail native */}
              {Number(art.unite_coefficient || art.coefficient || 1) > 1 && (
                <div style={{ fontSize: '11px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', color: '#2563eb', fontWeight: 'bold', padding: '2px 4px', background: '#eff6ff', borderRadius: '4px' }}>
                  <span>Coût Réel Unitaire ({art.unite_reference || 'Détail'}) :</span>
                  <span>{Math.round(parseFloat(art.cmp || 0) / Number(art.unite_coefficient || art.coefficient || 1)).toLocaleString()} F</span>
                </div>
              )}

              <div style={{ fontSize: '12px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
                <span>Taxe ({art.taxeActive ? 'Active' : 'Non'}):</span> 
                <b style={{ color: art.taxeActive ? '#2563eb' : '#64748b' }}>{art.taxeTaux || 0}%</b>
              </div>
              <div style={{ fontSize: '12px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px dashed #e2e8f0' }}>
                <span>Marge brute:</span> 
                <b style={{ color: art.prixVente > art.cmp ? '#059669' : '#ef4444' }}>
                  {art.cmp > 0 ? (((art.prixVente - art.cmp) / art.cmp) * 100).toFixed(1) : 0}%
                </b>
              </div>
            </div>


                                                     {/* LOGISTIQUE */}
                            <div style={s.cardInfo}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '800', fontSize: '11px', color: '#0f172a', marginBottom: '12px', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                                <ShieldCheck size={16} /> LOGISTIQUE
                              </div>
                              <div style={{ fontSize: '12px', marginBottom: '10px', background: '#f8fafc', padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                <span style={{color: '#64748b', fontSize: '10px', fontWeight: 'bold'}}>STOCK DISPONIBLE:</span> <br/>
                                <b style={{fontSize: '18px', color: parseFloat(art.stock_actuel || 0) <= parseFloat(art.stockAlerte || art.stock_alerte || 0) ? '#ef4444' : '#0f172a'}}>
                                  {/* 🌟 APERÇU CENTRALISÉ : Affichage de la chaîne combinée (ex: 21 CS + 7 BTL) */}
                                  {art.stock_formate || art.stock_physique_formate || `${art.stock_actuel || 0} U`}
                                </b>
                              </div>
                              <div style={{ fontSize: '11px', marginBottom: '4px' }}>
                                <span style={{color: '#64748b'}}>Code Barre:</span> <b>{art.code_barre || art.codeBarre || 'N/A'}</b>
                              </div>
                              <div style={{ fontSize: '11px' }}>
                                <span style={{color: '#64748b'}}>Seuil d'Alerte:</span> <b style={{color: '#ef4444'}}>{art.stock_formate_alerte || art.stock_physique_formate_alerte || `${parseFloat(art.stockAlerte || art.stock_alerte || 0)} U`}</b>
                              </div>
                            </div>

                            {/* REMISES & PROMO */}
                            {/* REMISES & PROMO - CODE CORRIGÉ */}
                            <div style={{ ...s.cardInfo, borderLeft: '4px solid #2563eb' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '800', fontSize: '11px', color: '#2563eb', marginBottom: '12px', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                                <Percent size={16} /> GRILLE DE PRIX & REMISES
                              </div>
                              
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {/* Vérification si au moins une remise est active */}
                                {(art.r1Active === 1 || art.r2Active === 1 || art.r3Active === 1 || art.r4Active === 1) ? (
                                  <>
                                    {/* R1 - Remise sur seuil standard */}
                                    {art.r1Active === 1 && (
                                      <div style={{ ...s.remiseItem, borderLeft: art.r1IsPromo ? '3px solid #f97316' : '3px solid #2563eb' }}>
                                        <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '11px'}}>
                                          <b>R1: dès {art.unite_coefficient > 1 ? `${art.r1Seuil} ${art.unite_code || 'CS'}` : `${art.r1Seuil} ${art.unite_reference || 'U'}`}</b>
                                          <span style={{fontWeight: '900'}}>-{art.r1Taux > 0 ? `${art.r1Taux}%` : `${art.r1Montant}F`}</span>
                                        </div>
                                        {art.r1IsPromo === 1 && (
                                          <div style={{fontSize: '9px', color: '#c2410c', marginTop: '4px'}}>
                                            Expire dans : {getDaysRemaining(art.r1DateFin)}
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {/* R2 - Correction de la variable dateFin (r2DateFin) */}
                                    {art.r2Active === 1 && (
                                      <div style={{ 
                                        ...s.remiseItem, 
                                        borderLeft: art.r2IsPromo ? '3px solid #f97316' : '3px solid #0891b2',
                                        background: art.r2IsPromo ? '#fff7ed' : '#f1f5f9',
                                        marginBottom: '4px'
                                      }}>
                                        <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '11px'}}>
                                          <b>R2: dès {art.unite_coefficient > 1 ? `${art.r2Seuil} ${art.unite_code || 'CS'}` : `${art.r2Seuil} ${art.unite_reference || 'U'}`}</b>
                                          <span style={{fontWeight: '900', color: art.r2IsPromo ? '#c2410c' : '#0891b2'}}>
                                            -{art.r2Taux > 0 ? `${art.r2Taux}%` : `${art.r2Montant}F`}
                                          </span>
                                        </div>
                                        {art.r2IsPromo === 1 && (
                                          <div style={{fontSize: '9px', color: '#9a3412', marginTop: '4px', fontWeight: 'bold'}}>
                                            EXPIRE DANS : {getDaysRemaining(art.r2DateFin)}
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {/* R3 - Correction de la variable dateFin (r3DateFin) */}
                                    {art.r3Active === 1 && (
                                      <div style={{ 
                                        ...s.remiseItem, 
                                        borderLeft: art.r3IsPromo ? '3px solid #f97316' : '3px solid #7c3aed',
                                        background: art.r3IsPromo ? '#fff7ed' : '#f1f5f9',
                                        marginBottom: '4px'
                                      }}>
                                        <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '11px'}}>
                                          <b>R3: par multiple de {art.r3Multiple} {art.unite_coefficient > 1 ? (art.unite_code || 'CS') : (art.unite_reference || 'U')}</b>
                                          <span style={{fontWeight: '900', color: art.r3IsPromo ? '#c2410c' : '#7c3aed'}}>
                                            -{art.r3Taux > 0 ? `${art.r3Taux}%` : `${art.r3Montant}F`}
                                          </span>
                                        </div>
                                        {art.r3IsPromo === 1 && (
                                          <div style={{fontSize: '9px', color: '#9a3412', marginTop: '4px', fontWeight: 'bold'}}>
                                            EXPIRE DANS : {getDaysRemaining(art.r3DateFin)}
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {/* R4 - Grille progressive */}
                                    {art.r4Active === 1 && (
                                      <div style={{ 
                                        ...s.remiseItem, 
                                        borderLeft: art.r4IsPromo ? '3px solid #f97316' : '3px solid #db2777',
                                        background: art.r4IsPromo ? '#fff7ed' : '#f1f5f9',
                                        marginBottom: '4px'
                                      }}>
                                        <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '11px'}}>
                                          <b>R4: Grille tarifaire A/B/C ({art.unite_code || 'CS'})</b>
                                          <span style={{fontWeight: '900', color: art.r4IsPromo ? '#c2410c' : '#db2777'}}>
                                            ACTIF
                                          </span>
                                        </div>
                                        {art.r4IsPromo === 1 && (
                                          <div style={{fontSize: '9px', color: '#9a3412', marginTop: '4px', fontWeight: 'bold'}}>
                                            EXPIRE DANS : {getDaysRemaining(art.r4DateFin)}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  /* État vide si aucune remise n'est configurée */
                                  <div style={{textAlign: 'center', padding: '10px', color: '#94a3b8', fontSize: '12px', fontStyle: 'italic'}}>
                                    Aucune remise configurée
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* STATS & HISTORIQUE */}
                            <div style={s.cardInfo}>
                              <div style={{ fontWeight: '800', fontSize: '11px', color: '#0f172a', marginBottom: '12px', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>DÉCISIONS</div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: art.sync_status === 'pending' ? '#f59e0b' : '#10b981' }}></div>
                                <span style={{ fontSize: '10px', fontWeight: '800', color: art.sync_status === 'pending' ? '#b45309' : '#059669' }}>
                                  {art.sync_status === 'pending' ? 'NON SYNCHRONISÉ' : 'SYNCHRONISÉ'}
                                </span>
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <button style={{ width: '100%', background: '#0f172a', color: 'white', border: 'none', padding: '8px', borderRadius: '8px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                  <BarChart3 size={16} /> Stats Ventes
                                </button>
                                <button 
                                  onClick={() => navigate(`/admin/articles/history/${art.id}`)}
                                  style={{ 
                                    width: '100%', background: 'white', color: '#0f172a', 
                                    border: '1px solid #e2e8f0', padding: '8px', borderRadius: '8px', 
                                    fontSize: '11px', fontWeight: '700', cursor: 'pointer', 
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' 
                                  }}
                                >
                                  <History size={16} /> Historique
                                </button>
                              </div>
                            </div>

                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ArticlesHub;
