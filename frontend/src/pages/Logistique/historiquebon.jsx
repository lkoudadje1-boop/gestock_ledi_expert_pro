import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Search, Calendar, RefreshCw, Eye, CheckCircle, Trash2,
  ArrowLeft, Loader2, Info, FileText, Scale, Package, Barcode, 
  ChevronDown, ChevronUp, Edit3, Printer, Clock
} from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import API, { socket } from '../../services/api';

// 🚀 INTÉGRATION DE VOTRE SERVICE UNIQUE DE CONVERSION LOGISTIQUE DYNAMIQUE
import { ConversionStockService } from '../../utils/converisonstock';

// 🚀 HOOK COMPOSANT MAÎTRE DE GESTION GENERALE D'IMPRESSION DIRECTE
import { useReactToPrint } from 'react-to-print';

// --- INCLUSION DU COMPOSANT DE FICHE TECHNIQUE IMPRIMABLE ---
import BonCommandePrint from './boncommandeprint';

const HistoriqueBonsCommande = () => {
  const navigate = useNavigate();
  const panierEndRef = useRef(null);
  const currentUser = useMemo(() => JSON.parse(localStorage.getItem('user') || '{}'), []);
  const USER_ID = currentUser.id || 'USR-1';
  const COMPANY_ID = currentUser.company_id || currentUser.companyId || 'CPY-1';

  // --- ÉTATS COMPOSANT ---
  const [commandes, setCommandes] = useState([]);
  const [detailsParCommande, setDetailsParCommande] = useState({}); // Dictionnaire { order_id: [items] }
  const [loading, setLoading] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState({}); // Suivi du chargement par ID de ligne { order_id: true/false }
  const [searchTerm, setSearchTerm] = useState('');
  const [searchBarcode, setSearchBarcode] = useState('');
  const [notification, setNotification] = useState({ show: false, message: '', type: 'success' });
  const [regimeTVA, setRegimeTVA] = useState(1);

  // 🎯 ÉTAT ACCORDÉON : Stocke l'ID du bon actuellement ouvert/déplié (null si tout est fermé)
  const [openedOrderId, setOpenedOrderId] = useState(null);

  // 🎯 COMMUTATEUR D'ONGLETS POUR LE FILTRAGE DES STATUTS DE BONS
  const [activeTab, setActiveTab] = useState('en_attente'); 

  // 🎯 ANCRAGE ET VARIABLES FISCALES DÉDIÉES À L'IMPRESSION COMPACTE
  const printRef = useRef(); 
  const [printData, setPrintData] = useState(null); 
  const [articlesAImprimer, setArticlesAImprimer] = useState([]); 
  const [modeImpressionAvecValeurs, setModeImpressionAvecValeurs] = useState(true);

  const [dynamiqueCompanyPrint, setDynamiqueCompanyPrint] = useState({
    name: currentUser.company_name || currentUser.companyName || "LEDI EXPERT PRO",
    address: currentUser.company_address || currentUser.companyAddress || "Adresse non renseignée",
    phone: currentUser.company_phone || currentUser.companyPhone || "Tél: N/A",
    email: currentUser.company_email || currentUser.companyEmail || "Email: N/A",
    logo_data: currentUser.company_logo || currentUser.logo_data || currentUser.logo || null
  });

  // --- UTILS TOAST NOTIFICATION FLOTTANTE ---
  const notify = useCallback((message, type = 'success') => {
    setNotification({ show: true, message, type });
    setTimeout(() => setNotification({ show: false, message: '', type: 'success' }), 4000);
  }, []);

  // --- UTILS FORMATTAGE COMPTABLE ---
  const fmt = (val) => {
    if (val === undefined || val === null || isNaN(val) || val === '') return "0";
    return Number(val).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  // 🎯 CONFIGURATION DU GESTIONNAIRE REACT-TO-PRINT AVEC RETARD SÉCURISÉ DE 350MS
  const handlePrintTrigger = useReactToPrint({
    content: () => printRef.current,
    documentTitle: `Bon_Commande_${printData?.num_bon || 'Logistique'}`,
    onBeforeGetContent: () => {
      return new Promise((resolve) => {
        console.log("🖨️ [REACT-TO-PRINT] Capture gelée pour hydratation du panier...");
        setTimeout(() => {
          resolve();
        }, 350);
      });
    },
    onAfterPrint: () => {
      console.log("✅ Impression achevée.");
    }
  });
  // --- EXTRACTION DES BONS DE COMMANDE ---
  const fetchBonsCommande = useCallback(async () => {
    try {
      setLoading(true);
      const res = await API.get('/purchase-orders'); 
      setCommandes(Array.isArray(res.data) ? res.data : res.data?.data || []);
    } catch (err) {
      console.error("Erreur de chargement des bons de commande:", err);
      notify("❌ Impossible d'extraire les bons de commande SQLite.", "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  const fetchCompanySettings = useCallback(async () => {
    try {
      const res = await API.get(`/company/${COMPANY_ID}`);
      if (res.data?.success && res.data?.data) {
        const data = res.data.data;
        setRegimeTVA(Number(data.regime_tva_recuperable ?? 1));
        setDynamiqueCompanyPrint({
          name: data.name || data.nom || data.raison_sociale || "LEDI EXPERT PRO",
          address: data.address || data.adresse || "Adresse non renseignée",
          phone: data.phone || data.telephone || "Tél: N/A",
          email: data.email || "Email: N/A",
          logo_data: data.logo_data || data.logo || data.logo_url || null
        });
      }
    } catch (err) { 
      console.error("Erreur récupération paramètres fiscaux:", err); 
    }
  }, [COMPANY_ID]);

  // --- 🎯 CLIC SUR EN-TÊTE : DÉPLIAGE COMPACT ET EXTRACTION DES ITEMS ---
  const handleToggleExpand = async (commande) => {
    if (openedOrderId === commande.id) {
      setOpenedOrderId(null); // Si on reclique sur le même, on le replie
      return;
    }

    setOpenedOrderId(commande.id);

    if (!detailsParCommande[commande.id]) {
      try {
        setLoadingDetails(prev => ({ ...prev, [commande.id]: true }));
        const res = await API.get(`/purchase-orders/${commande.id}/items`);
        const items = Array.isArray(res.data) ? res.data : res.data?.data || [];
        setDetailsParCommande(prev => ({ ...prev, [commande.id]: items }));
      } catch (err) {
        console.error("Erreur chargement items dépliés:", err);
        notify("❌ Impossible de charger le panier de ce bon.", "error");
      } finally {
        setLoadingDetails(prev => ({ ...prev, [commande.id]: false }));
      }
    }
  };

  // --- PASSERELLE DE VALIDATION DEFINITIVE SANS BLOCAGE MONÉTAIRE ---
  const chargerPourValidationAchat = (commande) => {
    notify(`🔄 Transfert du bon ${commande.num_bon} vers l'approvisionnement...`);
    navigate('/logistique/achat', { 
      state: { 
        provenanceBonCommande: true,
        id_commande_source: commande.id,
        num_bon_source: commande.num_bon,
        supplier_id: commande.supplier_id,
        observations_source: commande.observations
      } 
    });
  };

  // --- ACTION DE SUPPRESSION LOGIQUE D'UN BON ---
  const handleSupprimerBon = async (commandeId) => {
    if (!window.confirm("⚠️ Voulez-vous vraiment annuler/supprimer ce bon de commande ?")) return;
    try {
      await API.delete(`/purchase-orders/${commandeId}`);
      notify("✅ Bon de commande annulé avec succès.", "success");
      setOpenedOrderId(null);
      fetchBonsCommande();
    } catch (err) {
      notify("❌ Erreur lors de l'annulation du bon.", "error");
    }
  };

  // 🎯 DISPOSITIF COMPTABLE D'IMPRESSION À DOUBLE ACTION (AVEC VALEURS / SANS VALEURS)
  const handleActionImprimerBon = useCallback(async (commande, avecValeurs = true) => {
    if (!commande) return;
    
    setModeImpressionAvecValeurs(avecValeurs);
    notify(`🖨️ Préparation du document (${avecValeurs ? 'Avec Valeurs' : 'Sans Valeurs'}) pour le Bon ${commande.num_bon}...`);

    try {
      let articlesAssocies = detailsParCommande[commande.id];
      if (!articlesAssocies) {
        const res = await API.get(`/purchase-orders/${commande.id}/items`);
        articlesAssocies = Array.isArray(res.data) ? res.data : res.data?.data || [];
        setDetailsParCommande(prev => ({ ...prev, [commande.id]: articlesAssocies }));
      }

      const itemsFormatte = articlesAssocies.map(d => {
        const coeff = Number(d.unit_coefficient || 1) || 1;
        const mtTTC = Number(d.montant_facture_ligne || 0);
        const mtHT = Number(d.montant_ht_ligne || mtTTC);
        const mtTVA = Number(d.montant_tva_ligne || 0);
        const txtQte = d.qte_achetee || ConversionStockService.toExpressionTextuelle(d.quantite_pieces_natives || 0, d);

        return {
          ...d,
          qte_net: txtQte,
          montant_ht_net: mtHT,
          montant_tva_net: mtTVA,
          montant_ttc_net: mtTTC
        };
      });

      const totalHTBon = itemsFormatte.reduce((sum, a) => sum + a.montant_ht_net, 0);
      const totalTVABon = itemsFormatte.reduce((sum, a) => sum + a.montant_tva_net, 0);
      const totalTTCBon = itemsFormatte.reduce((sum, a) => sum + a.montant_ttc_net, 0);

      setPrintData({
        ...commande,
        total_ht_global: totalHTBon,
        total_tva_global: totalTVABon,
        total_ttc_global: commande.total_facture || totalTTCBon
      });
      setArticlesAImprimer(itemsFormatte);

      setTimeout(() => {
        handlePrintTrigger();
      }, 150);

    } catch (err) {
      console.error("Erreur exécution impression bon:", err);
      notify("❌ Échec de génération du rapport d'impression.", "error");
    }
  }, [detailsParCommande, handlePrintTrigger, notify]);

  useEffect(() => {
    fetchBonsCommande();
    fetchCompanySettings();
  }, [fetchBonsCommande, fetchCompanySettings]);

  // 🎯 DISPOSITIF DE FILTRAGE PAR STATUT (ONGLET) ET RECHERCHE CROISÉE
  const commandesFiltrées = useMemo(() => {
    return commandes.filter(cmd => {
      const isCloture = cmd.statut_commande === 'RECEPTIONNE' || cmd.statut_commande === 'ANNULE';
      if (activeTab === 'en_attente' && isCloture) return false;
      if (activeTab === 'receptionne' && !isCloture) return false;

      const term = searchTerm.toLowerCase().trim();
      const sBar = searchBarcode.toLowerCase().trim();

      const matchText = !term || 
        String(cmd.num_bon || '').toLowerCase().includes(term) ||
        String(cmd.fournisseur_nom || '').toLowerCase().includes(term);

      const matchBar = !sBar || String(cmd.num_bon || '').toLowerCase().includes(sBar);
      return matchText && matchBar;
    });
  }, [commandes, searchTerm, searchBarcode, activeTab]);

  // --- CARACTÉRISTIQUES GRAPHIQUES SLATE COMPACT ---
  const viewLayout = { display: 'flex', height: '100vh', backgroundColor: '#f1f5f9', overflow: 'hidden' };
  const mainArea = { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '0' };
  const headerBarStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 24px', backgroundColor: '#0f172a', color: '#ffffff' };
  const wrapperStyle = { flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px' };
  const blocCard = { backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' };
  
  const thStyle = { backgroundColor: '#0f172a', color: '#ffffff', padding: '10px 8px', fontSize: '11px', fontWeight: '700', textAlign: 'center', border: '1px solid #334155' };
  const tdBorder = { padding: '8px', border: '1px solid #e2e8f0', fontSize: '12px', color: '#1e293b', verticalAlign: 'middle', textAlign: 'center' };

  return (
    <div style={viewLayout}>
      <Sidebar />

      {/* TOAST NATIF FLOTTANT */}
      {notification.show && (
        <div style={{
          position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
          padding: '10px 20px', borderRadius: '8px',
          backgroundColor: notification.type === 'error' ? '#ef4444' : '#10b981',
          color: '#ffffff', fontWeight: 'bold', zIndex: 10000, fontSize: '13px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.2)'
        }}>
          {notification.message}
        </div>
      )}

      <main style={mainArea}>
        <header style={headerBarStyle}>
          <div>
            <h1 style={{ fontSize: '18px', margin: 0, fontWeight: '700' }}>Suivi des Bons de Commande</h1>
            <p style={{ fontSize: '11px', color: '#94a3b8', margin: '2px 0 0 0' }}>Basculez entre les onglets pour filtrer, déplier et imprimer les pièces logistiques</p>
          </div>
          <button style={{ backgroundColor: '#475569', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: '700', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }} onClick={() => navigate(-1)}>
            <ArrowLeft size={14} /> RETOUR AU MENU
          </button>
        </header>

        <div style={wrapperStyle}>
          
          {/* 🎯 ACTION CLÉ : BARRE DE NAVIGATION PAR ONGLET POUR FILTRER LES STATUTS */}
          <div style={{ display: 'flex', gap: '8px', borderBottom: '2px solid #e2e8f0', paddingBottom: '2px' }}>
            <button
              onClick={() => { setActiveTab('en_attente'); setOpenedOrderId(null); }}
              style={{
                padding: '8px 16px', borderRadius: '6px 6px 0 0', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: '800',
                backgroundColor: activeTab === 'en_attente' ? '#0f172a' : '#e2e8f0',
                color: activeTab === 'en_attente' ? '#ffffff' : '#475569',
                display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.15s'
              }}
            >
              <Clock size={14} /> BONS EN ATTENTE ({commandes.filter(c => c.statut_commande === 'EN_ATTENTE').length})
            </button>
            <button
              onClick={() => { setActiveTab('receptionne'); setOpenedOrderId(null); }}
              style={{
                padding: '8px 16px', borderRadius: '6px 6px 0 0', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: '800',
                backgroundColor: activeTab === 'receptionne' ? '#0f172a' : '#e2e8f0',
                color: activeTab === 'receptionne' ? '#ffffff' : '#475569',
                display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.15s'
              }}
            >
              <CheckCircle size={14} /> LIVRÉS & REÇUS ({commandes.filter(c => c.statut_commande === 'RECEPTIONNE' || c.statut_commande === 'ANNULE').length})
            </button>
          </div>

          {/* ZONE DOUBLE FILTRE */}
          <div style={{ ...blocCard, display: 'flex', gap: '15px' }}>
            <div style={{ flex: 1.5, position: 'relative', display: 'flex', alignItems: 'center', backgroundColor: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '4px 10px' }}>
              <Search size={14} color="#64748b" style={{ marginRight: '6px' }} />
              <input type="text" placeholder="Filtrer par référence bon ou nom fournisseur..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ border: 'none', width: '100%', outline: 'none', fontSize: '13px' }} />
            </div>
            <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', backgroundColor: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '4px 10px' }}>
              <Barcode size={14} color="#64748b" style={{ marginRight: '6px' }} />
              <input type="text" placeholder="Rechercher par Code-barres bon..." value={searchBarcode} onChange={e => setSearchBarcode(e.target.value)} style={{ border: 'none', width: '100%', outline: 'none', fontSize: '13px', fontWeight: 'bold' }} />
            </div>
            <button onClick={fetchBonsCommande} style={{ border: 'none', background: '#0f172a', color: '#fff', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: '700' }}>
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> ACTUALISER
            </button>
          </div>

          {/* GRAND TABLEAU HORIZONTAL DES EN-TÊTES */}
          <div style={{ ...blocCard, padding: '0', overflow: 'hidden' }}>
            <div style={{ width: '100%', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#0f172a', color: '#fff', height: '40px' }}>
                    <th style={{ ...thStyle, width: '40px' }}></th>
                    <th style={{ ...thStyle, textAlign: 'left' }}>RÉFÉRENCE BON</th>
                    <th style={{ ...thStyle, textAlign: 'left' }}>FOURNISSEUR CONCERNÉ</th>
                    <th style={{ ...thStyle }}>DATE ÉMISSION</th>
                    <th style={{ ...thStyle, textAlign: 'right', paddingRight: '15px' }}>VALEUR DU BON</th>
                    <th style={{ ...thStyle }}>STATUT EXPÉDITION</th>
                    <th style={{ ...thStyle, width: '220px' }}>IMPRESSION DIRECTE</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan="7" style={{ padding: '30px', textAlign: 'center', color: '#475569', fontWeight: 'bold' }}>Chargement des requêtes SQLite...</td></tr>
                  ) : commandesFiltrées.length === 0 ? (
                    <tr><td colSpan="7" style={{ padding: '30px', textAlign: 'center', color: '#475569' }}>Aucun document trouvé dans cet onglet.</td></tr>
                  ) : (
                    commandesFiltrées.map(cmd => {
                      const isExpanded = openedOrderId === cmd.id;
                      const itemsLignes = detailsParCommande[cmd.id] || [];

                      const cumulLignes = itemsLignes.reduce((sum, item) => ({
                        ht: sum.ht + Number(item.montant_ht_ligne || 0),
                        tva: sum.tva + Number(item.montant_tva_ligne || 0)
                      }), { ht: 0, tva: 0 });

                      return (
                        <React.Fragment key={cmd.id}>
                          {/* LIGNE MAÎTRE D'EN-TÊTE ACCORDÉON */}
                          <tr 
                            onClick={() => handleToggleExpand(cmd)}
                            style={{ 
                              borderBottom: '1px solid #e2e8f0', cursor: 'pointer', height: '42px',
                              backgroundColor: isExpanded ? '#f8fafc' : 'transparent',
                              transition: 'background-color 0.15s'
                            }}
                          >
                            <td style={{ ...tdBorder, textAlign: 'center' }}>
                              {isExpanded ? <ChevronUp size={16} color="#2563eb" /> : <ChevronDown size={16} color="#64748b" />}
                            </td>
                            <td style={{ ...tdBorder, textAlign: 'left', fontWeight: '800', fontFamily: 'monospace', color: '#2563eb' }}>{cmd.num_bon}</td>
                            <td style={{ ...tdBorder, textAlign: 'left', fontWeight: '600', color: '#0f172a' }}>{cmd.fournisseur_nom || "Fournisseur Divers Externe"}</td>
                            <td style={{ ...tdBorder }}>{new Date(cmd.date_commande).toLocaleDateString('fr-FR')}</td>
                            <td style={{ ...tdBorder, textAlign: 'right', fontWeight: '900', color: '#10b981', paddingRight: '15px' }}>{fmt(cmd.total_facture)} F</td>
                            <td style={{ ...tdBorder }}>
                              <span style={{ 
                                padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold',
                                backgroundColor: cmd.statut_commande === 'EN_ATTENTE' ? '#fef3c7' : '#d1fae5',
                                color: cmd.statut_commande === 'EN_ATTENTE' ? '#d97706' : '#059669'
                              }}>
                                {cmd.statut_commande}
                              </span>
                            </td>
                            
                            {/* 🎯 LEVIER DOUBLE CANAL : Boutons d'action directe logés sur la ligne maîtresse */}
                            <td style={{ ...tdBorder, padding: '4px' }} onClick={(e) => e.stopPropagation()}>
                              <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                                <button 
                                  onClick={() => handleActionImprimerBon(cmd, true)} 
                                  style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: '4px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: '800', color: '#1e40af', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px' }}
                                  title="Imprimer avec prix et taxes"
                                >
                                  <Printer size={11} /> + VALEURS
                                </button>
                                <button 
                                  onClick={() => handleActionImprimerBon(cmd, false)} 
                                  style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: '4px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: '800', color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px' }}
                                  title="Imprimer uniquement articles et quantités"
                                >
                                  <Printer size={11} /> SANS VALEURS
                                </button>
                              </div>
                            </td>
                          </tr>

                                              {/* EXPAND : SOUS-LIGNE CONTENANT LE GRAND TABLEAU COMPOSANT FLUIDE DÉPLIÉ */}
                          {isExpanded && (
                            <tr>
                              <td colSpan="7" style={{ backgroundColor: '#f8fafc', padding: '15px', borderBottom: '2px solid #cbd5e1' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                  
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '11px', fontWeight: '900', color: '#475569', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                      <Package size={13} className="text-blue-600" /> COMPOSITION DU PANIER LOGISTIQUE EXPÉDIÉ ({itemsLignes.length} Réf)
                                    </span>
                                    
                                    {/* ACTIONS DIRECTES LIÉES À L'ONGLET DÉPLIÉ */}
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                      {cmd.statut_commande === 'EN_ATTENTE' && (
                                        <button 
                                          onClick={(e) => { e.stopPropagation(); handleSupprimerBon(cmd.id); }}
                                          style={{ border: 'none', background: '#fce8e6', color: '#ef4444', padding: '5px 12px', borderRadius: '4px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                        >
                                          <Trash2 size={12} /> ANNULER LE BON
                                        </button>
                                      )}
                                      {cmd.statut_commande === 'EN_ATTENTE' && (
                                        <button 
                                          onClick={(e) => { e.stopPropagation(); chargerPourValidationAchat(cmd); }}
                                          style={{ border: 'none', background: '#2563eb', color: '#fff', padding: '5px 15px', borderRadius: '4px', fontSize: '11px', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}
                                        >
                                          <CheckCircle size={12} /> VALIDER L'ACHAT SUR LE PANIER
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  {/* GRAND TABLEAU DU SOUS-PANIER INTERNAL SÉCURISÉ */}
                                  <div style={{ borderRadius: '6px', border: '1px solid #cbd5e1', overflow: 'hidden', backgroundColor: '#fff' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                      <thead>
                                        <tr style={{ backgroundColor: '#f1f5f9', height: '35px', borderBottom: '1px solid #cbd5e1' }}>
                                          <th style={{ padding: '6px 10px', textAlign: 'left', color: '#475569', fontWeight: '700', width: '30%' }}>DÉSIGNATION ARTICLE</th>
                                          <th style={{ padding: '6px', color: '#475569', fontWeight: '700', textAlign: 'center' }}>STOCK AVANT</th>
                                          <th style={{ padding: '6px', color: '#475569', fontWeight: '700', textAlign: 'center', width: '15%' }}>QUANTITÉ DEMANDÉE</th>
                                          <th style={{ padding: '6px', color: '#475569', fontWeight: '700', textAlign: 'right' }}>PRIX U. GROS</th>
                                          {Number(regimeTVA) === 1 && <th style={{ padding: '6px', color: '#475569', fontWeight: '700', textAlign: 'right' }}>BASE HT</th>}
                                          {Number(regimeTVA) === 1 && <th style={{ padding: '6px', color: '#475569', fontWeight: '700', textAlign: 'right' }}>MONTANT TVA</th>}
                                          <th style={{ padding: '6px', color: '#475569', fontWeight: '700', textAlign: 'right', paddingRight: '12px' }}>VALEUR ESTIMÉE</th>
                                        </tr>
                                      </thead>

                                                                            <tbody>
                                        {loadingDetails[cmd.id] ? (
                                          <tr><td colSpan={Number(regimeTVA) === 1 ? "7" : "5"} style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}><Loader2 className="animate-spin" size={14} style={{ display: 'inline' }} /> Chargement du sous-panier SQLite...</td></tr>
                                        ) : itemsLignes.length === 0 ? (
                                          <tr><td colSpan={Number(regimeTVA) === 1 ? "7" : "5"} style={{ padding: '15px', textAlign: 'center', color: '#94a3b8' }}>Panier vide.</td></tr>
                                        ) : (
                                          itemsLignes.map((line) => {
                                            const volTextuel = line.qte_achetee || ConversionStockService.toExpressionTextuelle(line.quantite_pieces_natives, line);
                                            const prxGrosCalcule = line.prix_achat_unitaire * (line.unit_coefficient || 1);
                                            
                                            return (
                                              <tr key={line.id} style={{ borderBottom: '1px solid #f1f5f9', height: '36px' }}>
                                                <td style={{ padding: '6px 10px', textAlign: 'left', fontWeight: '700', color: '#1e293b' }}>{line.nom_article_snap.toUpperCase()}</td>
                                                <td style={{ padding: '6px', color: '#475569', textAlign: 'center', fontWeight: '600', fontSize: '11px' }}>{line.stock_avant || '0 PCS'}</td>
                                                <td style={{ padding: '6px', fontWeight: '800', color: '#2563eb', textAlign: 'center' }}>{volTextuel}</td>
                                                <td style={{ padding: '6px', textAlign: 'right', fontWeight: '600' }}>{fmt(prxGrosCalcule)} F</td>
                                                {Number(regimeTVA) === 1 && <td style={{ padding: '6px', textAlign: 'right', color: '#0f172a' }}>{fmt(line.montant_ht_ligne)} F</td>}
                                                {Number(regimeTVA) === 1 && <td style={{ padding: '6px', textAlign: 'right', color: '#ef4444' }}>{fmt(line.montant_tva_ligne)} F</td>}
                                                <td style={{ padding: '6px', textAlign: 'right', fontWeight: '700', color: '#10b981', paddingRight: '12px' }}>{fmt(line.montant_facture_ligne)} F</td>
                                              </tr>
                                            );
                                          })
                                        )}
                                      </tbody>
                                      {/* PIED DE CENTRALISATION COMPTABLE DE L'ACCORDÉON */}
                                      {!loadingDetails[cmd.id] && itemsLignes.length > 0 && (
                                        <tfoot style={{ background: '#f8fafc', borderTop: '1px solid #cbd5e1', fontWeight: '800' }}>
                                          <tr style={{ height: '35px' }}>
                                            <td style={{ paddingLeft: '10px', textAlign: 'left' }}>CUMUL DU PANIER</td>
                                            <td></td>
                                            <td style={{ textAlign: 'center', color: '#64748b' }}>-</td>
                                            <td></td>
                                            {Number(regimeTVA) === 1 && (
                                              <>
                                                                                               <td style={{ textAlign: 'right', color: '#1e40af' }}>{fmt(cumulLignes.ht)} F</td>
                                                <td style={{ textAlign: 'right', color: '#ef4444' }}>{fmt(cumulLignes.tva)} F</td>
                                              </>
                                            )}
                                            <td style={{ textAlign: 'right', color: '#10b981', paddingRight: '12px', fontSize: '13px' }}>{fmt(cmd.total_facture)} F</td>
                                          </tr>
                                        </tfoot>
                                      )}
                                    </table>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div ref={panierEndRef} />
        </div>
      </main>

      {/* 🖨️ ANCRAGE COMPOSANT DE PRODUCTION : CONNEXION DU TEMPLATE MAÎTRE RECTIFIÉ SANS TRONCATURES */}
      <div style={{ display: 'none' }}>
        <BonCommandePrint
          ref={printRef}
          commande={printData || {}}
          articles={articlesAImprimer || []}
          company={dynamiqueCompanyPrint}
          avecValeurs={modeImpressionAvecValeurs}
          regimeTVA={regimeTVA}
        />
      </div>
    </div>
  );
};

export default HistoriqueBonsCommande;
