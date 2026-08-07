import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Search, Calendar, RefreshCw, ShoppingCart, Trash2, Edit3,
  Save, Package, ArrowLeft, Plus, Loader2, Info, FileText, Scale, Barcode
} from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import API, { socket } from '../../services/api';

// 🚀 INTÉGRATION DE VOTRE SERVICE UNIQUE DE CONVERSION LOGISTIQUE
import { ConversionStockService } from '../../utils/converisonstock';

const BonCommandeLogistique = () => {
  const navigate = useNavigate();
  const currentUser = useMemo(() => JSON.parse(localStorage.getItem('user') || '{}'), []);
  const USER_ID = currentUser.id || 'USR-1';
  const COMPANY_ID = currentUser.company_id || currentUser.companyId || 'CPY-1';

  // --- ÉTATS (STATES) CATALOGUE & MÉTIER ---
  const [articles, setArticles] = useState([]);
  const [ventesPeriodes, setVentesPeriodes] = useState({}); // Dictionnaire { id_article: qte_pieces_vendues }
  const [fournisseurs, setFournisseurs] = useState([]);
  
  const [panier, setPanier] = useState([]);
  const [selectedArt, setSelectedArt] = useState(null);
  const [editingId, setEditingId] = useState(null); // Gère l'édition d'une ligne du panier
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isLocked, setIsLocked] = useState(false); // Verrou d'inventaire

  // 📅 FILTRES DE PÉRIODE DE VENTES (Par défaut à la date du jour)
  const todayStr = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);

  // 🔍 FILTRES DE RECHERCHE DÉCOUPLÉS DU CATALOGUE (DÉSIGNATION + CODE-BARRES COUCHETTE)
  const [searchTerm, setSearchTerm] = useState('');
  const [searchBarcode, setSearchBarcode] = useState('');

  // 🔔 ÉTAT DE LA NOTIFICATION TOAST NATIVE (ANTI-MODALE WINDOW.ALERT)
  const [notification, setNotification] = useState({ show: false, message: '', type: 'success' });

  // 🛡️ DOUBLE CANAL DE SAISIE DE COMMANDE DÉCOUPLÉE (ANTI-LITIGE)
  const [inputQteGros, setInputQteGros] = useState('');
  const [inputQteDetail, setInputQteDetail] = useState('');
  const [inputMontant, setInputMontant] = useState(''); // Prix total estimé (TTC ou Brut selon TVA)
  const [inputObs, setInputObs] = useState('');

  // 📊 ÉTATS DE GESTION DYNAMIQUE DE LA TVA (ALIGNÉS SUR L'APPROVISIONNEMENT)
  const [regimeTVA, setRegimeTVA] = useState(1);
  const [tauxTVA, setTauxTVA] = useState(18); // Taux par défaut UEMOA
  const [isTVAApplicable, setIsTVAApplicable] = useState(true);
  const [isManualTax, setIsManualTax] = useState(false); // Mode d'ajustement HT/TVA direct
  const [inputHT, setInputHT] = useState('');
  const [inputTVA, setInputTVA] = useState('');

  // EN-TÊTE ÉPURÉ DU BON DE COMMANDE LOGISTIQUE (SANS MOYEN DE PAIEMENT)
  const [header, setHeader] = useState({
    numBon: `CMD-LOG-${Date.now().toString().slice(-6)}`,
    fournisseurId: '',
    fournisseur: '',
    date: todayStr
  });

  const panierEndRef = useRef(null);

  // Auto-scroll fluide lors de l'ajout d'articles
  useEffect(() => {
    if (panier.length > 5) {
      panierEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [panier]);

  // --- UTILS TOAST NOTIFICATION FLOTTANTE ---
  const notify = useCallback((message, type = 'success') => {
    setNotification({ show: true, message, type });
    setTimeout(() => setNotification({ show: false, message: '', type: 'success' }), 4000);
  }, []);

  // --- UTILS FORMATTAGE ---
  const fmt = (val) => {
    if (val === undefined || val === null || isNaN(val) || val === '') return "0";
    return Number(val).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  };

  const fmtStock = useCallback((row) => {
    if (!row) return "-";
    const valeurStock = row.stock_actuel !== undefined ? row.stock_actuel : (row.stock || 0);
    return ConversionStockService.toExpressionTextuelle(Number(valeurStock) || 0, row);
  }, []);

  // Remise à zéro locale de l'interface
  const viderInterfaceLocale = useCallback(() => {
    setPanier([]);
    setSelectedArt(null);
    setEditingId(null);
    setInputQteGros('');
    setInputQteDetail('');
    setInputMontant('');
    setInputHT('');
    setInputTVA('');
    setInputObs('');
    setHeader({
      numBon: `CMD-LOG-${Date.now().toString().slice(-6)}`,
      fournisseurId: '',
      fournisseur: '',
      date: todayStr
    });
  }, [todayStr]);

  // --- FETCH DATA ---
  const fetchArticles = useCallback(async () => {
    try {
      const res = await API.get('/products');
      setArticles(Array.isArray(res.data) ? res.data : []);
    } catch (err) { 
      console.error("Erreur catalogue articles d'achat:", err); 
    }
  }, []);

  const fetchFournisseurs = useCallback(async () => {
    try {
      const res = await API.get('/suppliers');
      setFournisseurs(Array.isArray(res.data) ? res.data : []);
    } catch (err) { 
      console.error("Erreur chargement fournisseurs:", err); 
    }
  }, []);

  // Récupération des configurations de taxes de l'entreprise
  const fetchCompanySettings = useCallback(async () => {
    try {
      const res = await API.get(`/company/${COMPANY_ID}`);
      if (res.data?.success && res.data?.data) {
        const regimeFiscaleEntreprise = Number(res.data.data.regime_tva_recuperable ?? 1);
        setRegimeTVA(regimeFiscaleEntreprise);
        setTauxTVA(res.data.data.taux_tva_defaut || 18); 
        setIsTVAApplicable(regimeFiscaleEntreprise === 1);
      }
    } catch (err) { 
      console.error("Erreur récupération paramètres fiscaux:", err); 
    }
  }, [COMPANY_ID]);

  // Contrôle de verrouillage de sécurité d'un inventaire en cours
  const verifierInventaire = useCallback(async () => {
    try {
      const res = await API.get('/inventories/check-status'); 
      if (res.data?.en_cours) {
        setIsLocked(true);
        notify("⚠️ Un inventaire est en cours. Les modifications sont suspendues.", "error");
      } else {
        setIsLocked(false);
      }
    } catch (err) { 
      console.error("Erreur check inventaire:", err); 
    }
  }, [notify]);

  // 📊 CUMUL DES VENTES SUR LA PÉRIODE SÉLECTIONNÉE
  const fetchCumulVentes = useCallback(async () => {
    if (!startDate || !endDate) {
      setVentesPeriodes({});
      return;
    }
    try {
      setLoading(true);
      const [sYear, sMonth, sDay] = startDate.split('-');
      const [eYear, eMonth, eDay] = endDate.split('-');
      
      const res = await API.get(`/sales/details?date_debut=${sDay}/${sMonth}/${sYear}&date_fin=${eDay}/${eMonth}/${eYear}`);
      const data = res.data?.data || res.data;
      
      if (Array.isArray(data)) {
        const dict = data.reduce((acc, current) => {
          const id = current.id_article || current.article_id || 'INCONNU';
          const qtePieces = Number(current.quantite || current.qte || 0);
          acc[id] = (acc[id] || 0) + qtePieces;
          return acc;
        }, {});
        setVentesPeriodes(dict);
      }
    } catch (err) {
      console.error("Erreur extraction cumul ventes:", err);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  // --- INITIALISATION UNIQUE ET SYNCHRONISATION DES FLUX ---
  useEffect(() => {
    fetchArticles();
    fetchFournisseurs();
    fetchCompanySettings();
    verifierInventaire();
  }, [fetchArticles, fetchFournisseurs, fetchCompanySettings, verifierInventaire]);

  useEffect(() => {
    fetchCumulVentes();
  }, [fetchCumulVentes]);

  // --- LOGIQUE TEMPS RÉEL (WEBSOCKETS) ---
  useEffect(() => {
    if (socket) {
      socket.emit('join_company', COMPANY_ID);

      const rafraichirArticles = () => fetchArticles();
      socket.on('STOCK_UPDATED', rafraichirArticles);
      socket.on('REFRESH_STOCK', rafraichirArticles);
      
      socket.on('INVENTORY_STATUS_CHANGED', (data) => {
        setIsLocked(!!data.en_cours);
        if (data.en_cours) {
          notify("⚠️ Inventaire lancé à distance : Opérations sur le bon suspendues.", "error");
        } else {
          notify("✅ Inventaire terminé : Accès logistique rétabli.", "success");
        }
      });

      return () => {
        socket.off('STOCK_UPDATED', rafraichirArticles);
        socket.off('REFRESH_STOCK', rafraichirArticles);
        socket.off('INVENTORY_STATUS_CHANGED');
      };
    }
  }, [COMPANY_ID, fetchArticles, notify]);
  // --- GESTION DE LA SÉLECTION D'UN ARTICLE ---
  const handleSelectArticle = (art) => {
    setSelectedArt(art);
    setEditingId(null);
    setInputQteGros('');
    setInputQteDetail('');
    setInputMontant('');
    setInputHT('');
    setInputTVA('');
    setInputObs('');
  };

  // --- EXTRACTION DE L'ESTIMATION D'ACHAT (CUMUL VENDU FORMATE) ---
  const estimationAchatTextuelle = useMemo(() => {
    if (!selectedArt || !startDate || !endDate) return "—";
    const totalPiecesVendues = ventesPeriodes[selectedArt.id] || 0;
    if (totalPiecesVendues === 0) return "0 UNITÉ";
    return ConversionStockService.toExpressionTextuelle(totalPiecesVendues, selectedArt);
  }, [selectedArt, ventesPeriodes, startDate, endDate]);

  // --- CALCULS FINANCIERS GLOBAUX DU PANIER (FISCALITÉ MIXTE LIGNE PAR LIGNE) ---
  const calculsFinanciers = useMemo(() => {
    return panier.reduce((acc, cur) => {
      // Extraction des montants réels figés à la ligne lors du clic
      const mtHTLigne = Number(cur.montant_ht_ligne || 0);
      const mtTVALigne = Number(cur.montant_tva_ligne || 0);
      const mtTTCLigne = Number(cur.montant_facture_ligne || 0);

      // Cumul brut : La TVA globale s'incrémente uniquement des lignes qui possèdent de la TVA
      return {
        totalHT: acc.totalHT + mtHTLigne,
        totalTVA: acc.totalTVA + mtTVALigne,
        totalTTC: acc.totalTTC + mtTTCLigne
      };
    }, { totalHT: 0, totalTVA: 0, totalTTC: 0 });
  }, [panier]); // S'actualise uniquement si le contenu du panier change

  // --- LOGIQUE D'AJOUT ET MODIFICATION AU PANIER AVEC TVA DYNAMIQUEMENT INTÉGRÉE ---
  const ajouterAuPanier = () => {
    if (!selectedArt) return;
    
    if (!header.fournisseurId) {
      notify("❌ Veuillez sélectionner un fournisseur avant d'ajouter un article.", "error");
      return;
    }

    const grosClean = String(inputQteGros || '').trim();
    const detailClean = String(inputQteDetail || '').trim();
    const qteGros = parseFloat(grosClean) || 0;
    const qteDetail = parseFloat(detailClean) || 0;

    if (qteGros === 0 && qteDetail === 0) {
      notify("⚠️ Veuillez saisir une quantité à commander (Gros ou Détail).", "error");
      return;
    }

    // 1. Détermination du volume de la saisie actuelle en pièces natives
    const coeffLogistique = Number(selectedArt.coefficient || selectedArt.unit_coefficient || 1);
    let piecesSaisies = Math.round(qteGros * coeffLogistique) + Math.round(qteDetail);

    // 2. 🎯 RECHERCHE ET FUSION DES DOUBLONS (Sauf en cas de modification via editingId)
    const produitExistant = !editingId && panier.find(item => String(item.product_id) === String(selectedArt.id));
    
    // Accumulation des volumes en pièces natives si l'article est déjà dans le panier
    const piecesCommandeesTotales = produitExistant 
      ? Number(produitExistant.quantite_pieces || 0) + piecesSaisies 
      : piecesSaisies;

    // 3. Traitement comptable des prix (Le CMP/Prix Achat de base en BDD est TOUJOURS en Hors Taxe)
    const prixAchatBaseGrosHT = Number(selectedArt.prixAchat || selectedArt.prix_achat || selectedArt.cmp || 0);
    const taux = Number(tauxTVA) || 0;

    let mtHT = 0;
    let mtTVA = 0;
    let mtTTC = 0;

    // 4. Logique financière analytique ligne par ligne (La TVA se fige selon la case au moment du clic)
    if (isManualTax && Number(regimeTVA) === 1) {
      // Mode manuel : On récupère les valeurs forcées (et on additionne si doublon)
      const ancienHT = produitExistant ? Number(produitExistant.montant_ht_ligne || 0) : 0;
      const ancienTVA = produitExistant ? Number(produitExistant.montant_tva_ligne || 0) : 0;

      mtHT = Number((ancienHT + (Number(inputHT) || 0)).toFixed(2));
      mtTVA = Number((ancienTVA + (Number(inputTVA) || 0)).toFixed(2));
      mtTTC = Number((mtHT + mtTVA).toFixed(2));
    } else {
      // Mode automatique : Basé sur l'input de coût total ou recalculé par le CMP HT
      let montantSaisieLigne = Number(inputMontant) || 0;

      // Si l'acheteur n'a rien mis dans "Coût Total Estimé", le système calcule d'après le volume actuel
      if (montantSaisieLigne === 0) {
        const coutBaseHT = (piecesSaisies / coeffLogistique) * prixAchatBaseGrosHT;
        
        // 🎯 GESTION DE LA TVA AU PRODUIT : On ajoute la taxe uniquement si cochée lors de l'ajout
        montantSaisieLigne = (Number(regimeTVA) === 1 && isTVAApplicable) 
          ? coutBaseHT * (1 + (taux / 100)) 
          : coutBaseHT;
      }

      let currentHT = 0;
      let currentTVA = 0;
      let currentTTC = montantSaisieLigne;

      // 🎯 SÉCURISATION COMPTABLE LIGNE PAR LIGNE : On isole la TVA sur cet article précis
      if (Number(regimeTVA) === 1 && isTVAApplicable) {
        const diviseur = 1 + (taux / 100);
        currentHT = Number((currentTTC / diviseur).toFixed(2));
        currentTVA = Number((currentTTC - currentHT).toFixed(2));
      } else {
        // Le produit est considéré comme exonéré/sans TVA pour cette saisie
        currentHT = currentTTC;
        currentTVA = 0;
      }

      // Cumul mathématique sain si l'article existait déjà dans le panier
      const ancienHT = produitExistant ? Number(produitExistant.montant_ht_ligne || 0) : 0;
      const ancienTVA = produitExistant ? Number(produitExistant.montant_tva_ligne || 0) : 0;
      const ancienTTC = produitExistant ? Number(produitExistant.montant_facture_ligne || 0) : 0;

      mtHT = Number((ancienHT + currentHT).toFixed(2));
      mtTVA = Number((ancienTVA + currentTVA).toFixed(2));
      mtTTC = Number((ancienTTC + currentTTC).toFixed(2));
    }
    // Reconstruction propre de la chaîne logistique unifiée (ex: "6 CS" ou "1 CS + 5 UT")
    const expressionQuantiteFinale = ConversionStockService.toExpressionTextuelle(piecesCommandeesTotales, selectedArt);

    const nouvelleLigne = {
      // Maintien de l'ID d'origine si fusion pour éviter de dupliquer les entrées dans l'UI
      id_commande_ligne: editingId || produitExistant?.id_commande_ligne || `LGN-CMD-${Date.now().toString().slice(-6)}`,
      product_id: selectedArt.id,
      nom_article: selectedArt.nom.toUpperCase(),
      expression_qte: expressionQuantiteFinale,
      quantite_pieces: piecesCommandeesTotales,
      unit_coefficient: coeffLogistique,
      unit_code_gros: String(selectedArt.unit_code_gros || 'CS').toUpperCase(),
      unit_ref_detail: String(selectedArt.unit_ref_detail || 'UNITÉ').replace(/\(s\)/g, '').toUpperCase(),
      
      prix_base_gros: prixAchatBaseGrosHT, 
      cmp_ancien: Number(selectedArt.cmp || 0),
      
      montant_ht_ligne: mtHT,
      // 🎯 LA LIGNE FIXE SA PROPRE TVA (Soit calculée, soit 0 si la case était décochée)
      montant_tva_ligne: mtTVA,
      montant_facture_ligne: mtTTC, // Alimente montant_facture_ligne (TTC) dans SQLite
      
      observations: inputObs || (isTVAApplicable ? "Réapprovisionnement auto" : "PRODUIT EXONÉRÉ"),
      article_complet: { ...selectedArt }
    };

    // 5. Hydratation de l'état local du panier
    if (editingId) {
      setPanier(panier.map(item => item.id_commande_ligne === editingId ? nouvelleLigne : item));
      setEditingId(null);
      notify("✅ Ligne de commande modifiée avec succès.");
    } else if (produitExistant) {
      // Remplace l'ancienne ligne autonome par la nouvelle ligne fusionnée et consolidée
      setPanier(panier.map(item => item.id_commande_ligne === produitExistant.id_commande_ligne ? nouvelleLigne : item));
      notify(`🔄 Quantités cumulées pour l'article ${selectedArt.nom.toUpperCase()}.`);
    } else {
      setPanier([nouvelleLigne, ...panier]);
      notify("✅ Article ajouté au panier de réapprovisionnement.");
    }

    // Reset complet de la zone de saisie active pour l'article suivant
    setSelectedArt(null);
    setInputQteGros('');
    setInputQteDetail('');
    setInputMontant('');
    setInputHT('');
    setInputTVA('');
    setInputObs('');
  };

  // --- RESTAURATION SÉCURISÉE DE LA LIGNE POUR ÉDITION ---
  const chargerPourEdition = (item) => {
    const artOriginal = item.article_complet;
    if (!artOriginal) return;

    setSelectedArt(artOriginal);
    setEditingId(item.id_commande_ligne);

    const piecesTotal = Number(item.quantite_pieces) || 0;
    const coeff = Number(artOriginal.coefficient || artOriginal.unit_coefficient || 1);

    if (coeff > 1) {
      const gros = Math.floor(piecesTotal / coeff);
      const detail = Math.round(piecesTotal % coeff);
      setInputQteGros(gros > 0 ? String(gros) : '');
      setInputQteDetail(detail > 0 ? String(detail) : '');
    } else {
      setInputQteGros('');
      setInputQteDetail(piecesTotal > 0 ? String(piecesTotal) : '');
    }

    setInputMontant(item.montant_facture_ligne);
    setInputHT(item.montant_ht_ligne);
    setInputTVA(item.montant_tva_ligne);
    setInputObs(item.observations || '');
  };

  // --- SAUVEGARDE FINALE DU BON DE COMMANDE VERS LES TABLES SQLITE ---
  const enregistrerCommandeFinale = async () => {
    if (panier.length === 0 || isSaving || isLocked) return;
    
    // Contrôle de sécurité obligatoire
    if (!header.fournisseurId) {
      notify("❌ Veuillez sélectionner un fournisseur obligatoire.", "error");
      return;
    }

    setIsSaving(true);
    
    // Récupération des totaux précis issus du useMemo
    const finalTTC = Number(calculsFinanciers.totalTTC.toFixed(2));
    const numBonRÉel = String(header.numBon).trim();

    try {
      // Construction du payload exact attendu par votre service backend node
      const payload = {
        header: {
          // Clés strictes destructurées par le backend
          numBon: numBonRÉel, 
          fournisseurId: String(header.fournisseurId),
          totalFacture: finalTTC,
          date: header.date,
          observations: inputObs || "Généré via Bon Commande Logistique"
        },
        // Tableau d'objets formaté pour la boucle "for (const item of items)"
        items: panier.map(item => {
          // Extraction du coefficient logistique de l'article
          const coeff = Number(item.unit_coefficient || 1);
          // Calcul du prix unitaire de gros ramené à sa valeur brute
          const prixAchatGros = Number(item.prix_base_gros || 0);

          return {
            product_id: String(item.product_id),
            nom_article_snap: String(item.nom_article),
            observation: item.observations || "",
            qte_achetee: String(item.expression_qte).trim(), // Sera décodé par calculerUnitesNatives au backend
            prix_achat_unitaire: prixAchatGros,
            montant_facture_ligne: Number(item.montant_facture_ligne),
            montant_ht_ligne: Number(item.montant_ht_ligne),
            montant_tva_ligne: Number(item.montant_tva_ligne)
          };
        })
      };

      // Envoi transparent vers votre API
      const res = await API.post('/purchase-orders', payload);
      
      if (res.data) {
        notify(`✅ Bon de commande ${numBonRÉel} inséré avec succès dans SQLite !`, "success");
        viderInterfaceLocale();
        if (socket) socket.emit('REFRESH_PURCHASE_ORDERS');
        await fetchArticles();
      }
    } catch (err) {
      console.error("Erreur de communication avec l'API SQLite :", err);
      const msgErreur = err.response?.data?.error || err.response?.data?.message || err.message;
      notify(`Erreur SQLite: ${msgErreur}`, "error");
    } finally {
      setIsSaving(false);
    }
  };

  // --- FILTRAGE DYNAMIQUE LOCAL DU CATALOGUE ---
  const articlesFiltrés = useMemo(() => {
    return articles.filter(art => {
      const nomNet = (art.nom || '').toLowerCase();
      const termNet = searchTerm.toLowerCase().trim();
      return nomNet.includes(termNet);
    });
  }, [articles, searchTerm]);

  // --- STYLES INTERNES SLATE TYPE UNIFIÉS (RATIONNÉS À 50% / 50%) ---
  const viewLayout = { display: 'flex', height: '100vh', backgroundColor: '#f1f5f9', overflow: 'hidden' };
  const mainArea = { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '0' };
  const headerBarStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 24px', backgroundColor: '#0f172a', color: '#ffffff', gap: '20px' };
  const splitGrid = { display: 'flex', flex: 1, overflow: 'hidden', padding: '15px', gap: '15px' };
  
  // RATIONNEMENT PARFAIT 50/50 HORIZONTAL
  const tableSection = { flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', overflow: 'hidden' };
  const actionSection = { flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto' };
  
  const blocCard = { backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' };
  const tableWrapper = { flex: 1, backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', overflowY: 'auto' };
  const thStyle = { backgroundColor: '#0f172a', color: '#ffffff', padding: '10px 12px', fontSize: '12px', fontWeight: '600', position: 'sticky', top: 0, zIndex: 10, textAlign: 'left' };
  const tdStyle = { padding: '10px 12px', borderBottom: '1px solid #e2e8f0', fontSize: '13px', color: '#1e293b', verticalAlign: 'middle' };
  const fieldInput = { width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none' };
  const fieldLabel = { fontSize: '11px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '2px', textTransform: 'uppercase' };
return (
    <div style={viewLayout}>
      <Sidebar />

      {/* 🔔 COMPOSANT TOAST FLOTTANT NATIF UNIQUE (ANTI-BLOCAGE) */}
      {notification.show && (
        <div style={{
          position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
          padding: '10px 20px', borderRadius: '8px',
          backgroundColor: notification.type === 'error' ? '#ef4444' : '#10b981',
          color: '#ffffff', fontWeight: 'bold', zIndex: 10000, fontSize: '13px',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.2)',
          display: 'flex', alignItems: 'center', gap: '8px'
        }}>
          {notification.type === 'error' ? '⚠️' : '✅'} {notification.message}
        </div>
      )}

      <main style={mainArea}>
        
        {/* EN-TÊTE SUPÉRIEUR GLOBAL INTÉGRANT TOUS LES FILTRES DE DOCUMENTS ET DATES */}
        <header style={headerBarStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flex: 1 }}>
            <div>
              <h1 style={{ fontSize: '18px', margin: 0, fontWeight: '700' }}>Bon de Commande</h1>
              <span style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace' }}>{header.numBon}</span>
            </div>

            {/* SÉLECTEUR DU FOURNISSEUR TRANSFERÉ EN HAUT */}
            <div style={{ minWidth: '180px' }}>
              <select 
                style={{ ...fieldInput, backgroundColor: '#1e293b', color: '#fff', border: '1px solid #475569', fontWeight: 'bold', padding: '6px 8px' }} 
                value={header.fournisseurId} 
                onChange={e => {
                  const id = e.target.value;
                  const name = fournisseurs.find(f => String(f.id || f._id) === id)?.nom || '';
                  setHeader({ ...header, fournisseurId: id, fournisseur: name });
                }}
                disabled={panier.length > 0}
              >
                <option value="">-- Fournisseur * --</option>
                {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
              </select>
            </div>

            {/* FILTRES ANALYTIQUES DATES DE PÉRIODE TRANSFERÉS EN HAUT */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#1e293b', padding: '4px 10px', borderRadius: '6px', border: '1px solid #475569' }}>
              <Calendar size={13} color="#94a3b8" />
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ border: 'none', backgroundColor: 'transparent', outline: 'none', fontSize: '12px', fontWeight: '600', color: '#fff', width: '110px' }} />
              <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold' }}>➔</span>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ border: 'none', backgroundColor: 'transparent', outline: 'none', fontSize: '12px', fontWeight: '600', color: '#fff', width: '110px' }} />
              <button type="button" onClick={fetchCumulVentes} style={{ border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '2px' }}>
                <RefreshCw size={12} className={loading ? 'animate-spin' : ''} color="#38bdf8" />
              </button>
            </div>
          </div>

          {/* ACTIONS GÉNÉRALES DE SAUVEGARDE */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button style={{ backgroundColor: '#475569', color: '#fff', border: 'none', padding: '7px 14px', borderRadius: '6px', cursor: 'pointer', fontWeight: '700', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={() => navigate(-1)}>
              <ArrowLeft size={13} /> RETOUR
            </button>
            <button 
              style={{ backgroundColor: '#2563eb', color: '#fff', border: 'none', padding: '7px 18px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', opacity: panier.length === 0 || isLocked || isSaving ? 0.6 : 1 }} 
              onClick={isLocked ? null : enregistrerCommandeFinale} 
              disabled={panier.length === 0 || isSaving || isLocked}
            >
              {isSaving ? <Loader2 className="animate-spin" size={13}/> : <Save size={13} />} 
              {isLocked ? "BLOQUÉ" : "ENREGISTRER LE BON"}
            </button>
          </div>
        </header>

        <div style={splitGrid}>
          {/* ========================================================================= */}
          {/* ZONE GAUCHE (50%) : FILTRES TEXTUELS ET GRILLE DU CATALOGUE PRODUITS       */}
          {/* ========================================================================= */}
          <div style={tableSection}>
            
            {/* BARRE DE RECHERCHE MIXTE DE CATALOGUE CÔTE À CÔTE */}
            <div style={{ ...blocCard, padding: '10px', display: 'flex', gap: '10px' }}>
              {/* 1. Saisie Désignation */}
              <div style={{ flex: 1.5, position: 'relative', display: 'flex', alignItems: 'center', backgroundColor: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '4px 10px' }}>
                <Search size={14} color="#64748b" style={{ marginRight: '6px' }} />
                <input type="text" placeholder="Rechercher par désignation..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ border: 'none', width: '100%', outline: 'none', fontSize: '13px', color: '#0f172a' }} />
              </div>
              {/* 2. Saisie Code-barres */}
              <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', backgroundColor: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '4px 10px' }}>
                <Barcode size={14} color="#64748b" style={{ marginRight: '6px' }} />
                <input type="text" placeholder="Code-barres / Scanner..." value={searchBarcode} onChange={e => setSearchBarcode(e.target.value)} style={{ border: 'none', width: '100%', outline: 'none', fontSize: '13px', color: '#0f172a', fontWeight: 'bold' }} />
              </div>
            </div>

            {/* GRILLE DU CATALOGUE MAÎTRE */}
            <div style={tableWrapper}>
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, width: '15%' }}>ID</th>
                    <th style={{ ...thStyle, width: '35%' }}>ARTICLE</th>
                    <th style={{ ...thStyle, width: '15%', textAlign: 'right' }}>PRIX G.</th>
                    <th style={{ ...thStyle, width: '18%', textAlign: 'center' }}>STOCK</th>
                    <th style={{ ...thStyle, width: '17%', textAlign: 'center', backgroundColor: '#1e3a8a' }}>CUMUL</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan="5" style={{ ...tdStyle, textAlign: 'center', padding: '30px', fontWeight: '600', color: '#64748b' }}>Analyse des cumuls de ventes de périodes...</td></tr>
                  ) : articlesFiltrés.length === 0 ? (
                    <tr><td colSpan="5" style={{ ...tdStyle, textAlign: 'center', padding: '30px', color: '#64748b' }}>Aucun article trouvé.</td></tr>
                  ) : (
                    articlesFiltrés.map(art => {
                      const totalPiecesVendues = ventesPeriodes[art.id] || 0;
                      const isSelected = selectedArt?.id === art.id;

                      return (
                        <tr key={art.id} onClick={() => handleSelectArticle(art)} style={{ backgroundColor: isSelected ? '#eff6ff' : 'transparent', borderBottom: '1px solid #e2e8f0', cursor: 'pointer', transition: 'background 0.1s' }}>
                          <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: 'bold', color: '#4f46e5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{art.id}</td>
                          <td style={{ ...tdStyle, fontWeight: '700', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{art.nom.toUpperCase()}</td>
                          <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 'bold' }}>{fmt(art.prixAchat || art.prix_achat || art.cmp || 0)} F</td>
                          
                          {/* COLONNE STOCK ACTUEL INTERNE */}
                          <td style={{ ...tdStyle, textAlign: 'center' }}>
                            <span style={{ backgroundColor: '#f8fafc', padding: '3px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '11px', fontWeight: '700', color: '#0f172a', display: 'inline-block' }}>
                              {fmtStock(art)}
                            </span>
                          </td>

                          {/* COLONNE COMMERCIALE DYNAMIQUE DU CUMUL VENDU */}
                          <td style={{ ...tdStyle, textAlign: 'center', backgroundColor: totalPiecesVendues > 0 ? '#eff6ff' : '#f8fafc', fontWeight: '900', color: totalPiecesVendues > 0 ? '#1e3a8a' : '#64748b' }}>
                            {startDate && endDate ? ConversionStockService.toExpressionTextuelle(totalPiecesVendues, art) : '—'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

                     {/* ========================================================================= */}
          {/* ZONE DROITE (50%) : PANNEAU UNIQUE ET COMPACT DE SAISIE & SUIVI DU PANIER */}
          {/* ========================================================================= */}
          <div style={actionSection}>
            
            {/* CARTE 1 : FORMULAIRE DE SAISIE DE LA LIGNE SÉLECTIONNÉE */}
            <div style={{ ...blocCard, borderLeft: '4px solid #2563eb', padding: '10px' }}>
              <h3 style={{ fontSize: '11px', margin: '0 0 8px 0', fontWeight: '900', color: '#1e3a8a', textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Saisie de Commande Logistique</span>
                {selectedArt && <span style={{ fontSize: '10px', color: '#64748b', textTransform: 'none', fontWeight: 'normal' }}>Coeff : {selectedArt.coefficient || 1}</span>}
              </h3>
              
              <div style={{ marginBottom: '8px' }}>
                <div style={{ backgroundColor: '#fff', border: '1px solid #cbd5e1', padding: '6px 10px', borderRadius: '6px', fontSize: '13px', fontWeight: '800', color: selectedArt ? '#0f172a' : '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selectedArt ? `📦 ${selectedArt.nom.toUpperCase()}` : "⚠️ VEUILLEZ SÉLECTIONNER UN ARTICLE À GAUCHE"}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                <div style={{ backgroundColor: '#fff', padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}>
                  <span style={{ fontSize: '10px', color: '#475569', display: 'block', fontWeight: '700' }}>PRIX D'ACHAT G.</span>
                  <strong style={{ color: '#0f172a' }}>{selectedArt ? `${fmt(selectedArt.prixAchat || selectedArt.prix_achat || selectedArt.cmp || 0)} F` : '—'}</strong>
                </div>
                <div style={{ backgroundColor: '#fff', padding: '6px 10px', borderRadius: '6px', border: '1px solid #bfdbfe', fontSize: '12px' }}>
                  <span style={{ fontSize: '10px', color: '#1e3a8a', display: 'block', fontWeight: '700' }}>SUGGESTION (VENDU)</span>
                  <strong style={{ color: '#1e3a8a' }}>{estimationAchatTextuelle}</strong>
                </div>
              </div>

              {/* FORMULAIRE DE QUANTITÉ ADAPTATIF QUANTITÉ GROS + QUANTITÉ DÉTAIL */}
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: selectedArt && Number(selectedArt.coefficient || 1) > 1 ? '1fr 1fr' : '1fr', 
                gap: '10px', 
                marginBottom: '8px' 
              }}>
                {selectedArt && Number(selectedArt.coefficient || 1) > 1 && (
                  <div style={{ position: 'relative' }}>
                    <label style={fieldLabel}>Quantité Gros</label>
                    <input type="number" min="0" style={{ ...fieldInput, fontWeight: '900' }} placeholder="0" value={inputQteGros} onChange={e => setInputQteGros(e.target.value)} />
                    <span style={{ position: 'absolute', right: '8px', bottom: '6px', fontSize: '10px', fontWeight: 'bold', background: '#e2e8f0', padding: '2px 4px', borderRadius: '3px' }}>
                      {String(selectedArt.unit_code_gros || 'CS').toUpperCase()}
                    </span>
                  </div>
                )}
                <div style={{ position: 'relative' }}>
                  <label style={fieldLabel}>Quantité Détail</label>
                  <input type="number" min="0" style={{ ...fieldInput, fontWeight: '900' }} placeholder="0" value={inputQteDetail} onChange={e => setInputQteDetail(e.target.value)} disabled={!selectedArt} />
                  <span style={{ position: 'absolute', right: '8px', bottom: '6px', fontSize: '10px', fontWeight: 'bold', background: '#e2e8f0', padding: '2px 4px', borderRadius: '3px' }}>
                    {selectedArt ? String(selectedArt.unit_ref_detail || 'UT').replace(/\(s\)/g, '').toUpperCase() : 'UT'}
                  </span>
                </div>
              </div>

              {/* 📊 BOUTON DE COMMUTATION FISCALE INTERNE À LA LIGNE */}
              {selectedArt && regimeTVA === 1 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', backgroundColor: '#fff', padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                  <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569' }}>SAISIE FISCALE :</span>
                  <button 
                    type="button"
                    onClick={() => {
                      setIsManualTax(!isManualTax);
                      setInputHT('');
                      setInputTVA('');
                      setInputMontant('');
                    }}
                    style={{ padding: '3px 8px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontSize: '10px', fontWeight: '900', backgroundColor: isManualTax ? '#0f172a' : '#e2e8f0', color: isManualTax ? '#fff' : '#0f172a' }}
                  >
                    {isManualTax ? "📏 FORCER HT / TVA MANUEL" : "🤖 CALCUL AUTO PAR DÉFAUT"}
                  </button>
                </div>
              )}

              {/* CHAMPS DE SAISIE DU MONTANT OU OBSERVATIONS INTERCALÉS AVANT LE BOUTON D'AJOUT */}
              {isManualTax && selectedArt && regimeTVA === 1 ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '8px' }}>
                  <div>
                    <label style={fieldLabel}>Montant HT Estimé *</label>
                    <input type="number" style={fieldInput} value={inputHT} onChange={e => setInputHT(e.target.value)} placeholder="0" />
                  </div>
                  <div>
                    <label style={fieldLabel}>Montant TVA Estimé *</label>
                    <input type="number" style={fieldInput} value={inputTVA} onChange={e => setInputTVA(e.target.value)} placeholder="0" />
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '10px', marginBottom: '8px', alignItems: 'end' }}>
                  <div>
                    <label style={fieldLabel}>Observations / Notes Ligne</label>
                    <input type="text" style={fieldInput} value={inputObs} onChange={e => setInputObs(e.target.value)} placeholder="Note d'approvisionnement..." disabled={!selectedArt} />
                  </div>
                  <div>
                    <label style={{ ...fieldLabel, color: '#10b981', fontWeight: 'bold' }}>Coût Total Estimé (F) *</label>
                    <input type="number" style={{ ...fieldInput, border: '1px solid #10b981', color: '#10b981', fontWeight: 'bold' }} value={inputMontant} onChange={e => setInputMontant(e.target.value)} placeholder="Montant..." disabled={!selectedArt} />
                  </div>
                </div>
              )}

              <button type="button" onClick={ajouterAuPanier} disabled={!selectedArt} style={{ width: '100%', padding: '10px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: '800', cursor: 'pointer', opacity: selectedArt ? 1 : 0.5, fontSize: '12px' }}>
                <Plus size={14} style={{ marginRight: '4px', display: 'inline', verticalAlign: 'middle' }} /> 
                {editingId ? "METTRE À JOUR LA LIGNE" : "AJOUTER AU BON DE COMMANDE"}
              </button>
            </div>


                       {/* 🛡️ CARTE 2 : CONDITION FISCALE DE MASQUAGE COMPLÈTE */}
            {/* S'affiche uniquement si l'entreprise possède un Régime Soumis (regimeTVA === 1) */}
            {Number(regimeTVA) === 1 && (
              <div style={{ ...blocCard, backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', padding: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '11px', fontWeight: '900', color: '#475569', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Scale size={13} className="text-blue-600" /> OPTIONS FISCALES & RÉGIME
                  </span>
                  <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#16a34a', backgroundColor: '#e6f4ea', padding: '1px 6px', borderRadius: '4px' }}>
                    Assujetti TVA
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', backgroundColor: '#fff', padding: '6px 8px', borderRadius: '6px', border: '1px solid #e2e8f0', marginBottom: '8px', fontSize: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 'bold', color: '#334155' }}>
                    <input 
                      type="checkbox" 
                      checked={isTVAApplicable} 
                      onChange={e => setIsTVAApplicable(e.target.checked)} 
                      style={{ width: '14px', height: '14px', cursor: 'pointer' }} 
                    />
                    Appliquer la TVA
                  </label>

                  {isTVAApplicable && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                      <span style={{ color: '#64748b', fontSize: '11px' }}>Taux :</span>
                      <select value={tauxTVA} onChange={e => setTauxTVA(Number(e.target.value))} style={{ border: '1px solid #cbd5e1', borderRadius: '4px', padding: '2px', fontSize: '11px', fontWeight: 'bold' }}>
                        <option value={18}>18 % (UEMOA)</option>
                        <option value={19}>19 %</option>
                        <option value={5.5}>5.5 %</option>
                        <option value={0}>0 %</option>
                      </select>
                    </div>
                  )}
                </div>

                <div style={{ fontSize: '12px', color: '#334155', fontWeight: '500' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                    <span>Cumul Global Hors Taxe (HT) :</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 'bold', color: '#0f172a' }}>{fmt(calculsFinanciers.totalHT)} F</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Cumul TVA ({isTVAApplicable ? `${tauxTVA}%` : 'Désactivée'}) :</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 'bold', color: isTVAApplicable ? '#ef4444' : '#64748b' }}>
                      {isTVAApplicable ? `+ ${fmt(calculsFinanciers.totalTVA)} F` : '0 F'}
                    </span>
                  </div>
                </div>
              </div>
            )}


            {/* CARTE 3 : UNIQUE PANIER DE COMMANDE ACTIF (HAUTEUR MAXIMISÉE ET TOTAL FIGÉ EN BAS) */}
            <div style={{ 
              ...blocCard, 
              flex: 1, 
              display: 'flex', 
              flexDirection: 'column', 
              minHeight: '380px', // Donne une excellente hauteur par défaut
              position: 'relative', // Permet de figer le total tout en bas
              padding: '12px 12px 60px 12px' // Padding bas augmenté pour réserver la place du total figé
            }}>
              {/* EN-TÊTE COMPACT DU PANIER */}
              <div style={{ borderBottom: '2px solid #cbd5e1', paddingBottom: '6px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', fontWeight: '900', color: '#0f172a' }}>PANIER DE RÉAPPROVISIONNEMENT</span>
                <span style={{ backgroundColor: '#1e3a8a', color: '#fff', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold' }}>
                  {panier.length} Réf
                </span>
              </div>

              {/* ZONE SCROLLABLE DE HAUTEUR MAXIMISÉE POUR LES ARTICLES */}
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', paddingRight: '2px' }}>
                {panier.length === 0 ? (
                  <div style={{ color: '#94a3b8', fontSize: '12px', textAlign: 'center', padding: '40px', fontWeight: '500' }}>
                    Aucun article ajouté pour le moment.
                  </div>
                ) : (
                  panier.map((item) => (
                    <div key={item.id_commande_ligne} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8fafc', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      <div style={{ maxWidth: '65%', overflow: 'hidden' }}>
                        <div style={{ fontSize: '12px', fontWeight: '700', color: '#0f172a', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{item.nom_article}</div>
                        <div style={{ fontSize: '11px', color: '#2563eb', fontWeight: 'bold' }}>Qte Commande : {item.expression_qte}</div>
                      </div>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '12px', fontFamily: 'monospace', fontWeight: '900', color: '#0f172a' }}>
                          {/* 🎯 RESTITUTION LOGIQUE DE LA TVA INDIVIDUELLE PAR ARTICLE (TTC OU HT SELON LA SAISIE) */}
                          {fmt(item.montant_tva_ligne > 0 ? item.montant_facture_ligne : item.montant_ht_ligne)} F
                        </span>
                        
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button 
                            type="button" 
                            style={{ border: 'none', background: 'transparent', color: '#2563eb', cursor: 'pointer', padding: '2px' }} 
                            onClick={() => chargerPourEdition(item)}
                            title="Modifier cette ligne"
                          >
                            <Edit3 size={13} />
                          </button>

                          <button 
                            type="button" 
                            style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', padding: '2px' }} 
                            onClick={() => setPanier(panier.filter(p => p.id_commande_ligne !== item.id_commande_ligne))}
                            title="Supprimer cette ligne"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
                <div ref={panierEndRef} />
              </div>

              {/* 🔒 BLOC COMPACT FIGÉ STABLE TOUT EN BAS DU CONTENEUR */}
              <div style={{ 
                position: 'absolute',
                bottom: '12px',
                left: '12px',
                right: '12px',
                borderTop: '2px solid #cbd5e1', 
                paddingTop: '10px', 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                fontWeight: '900', 
                fontSize: '13px', 
                color: '#0f172a',
                backgroundColor: '#ffffff' // Évite toute transparence lors du scroll
              }}>
                <span>CUMUL DU BON DE COMMANDE :</span>
                <span style={{ color: '#2563eb', fontSize: '15px', fontFamily: 'monospace', backgroundColor: '#eff6ff', padding: '4px 10px', borderRadius: '4px', border: '1px solid #bfdbfe' }}>
                  {/* 🎯 LOGIQUE RECALIBRÉE : Restitue la somme exacte mixte (TTC + HT mélangés s'il y a lieu) */}
                  {fmt(calculsFinanciers.totalTTC)} F
                </span>
              </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
};

export default BonCommandeLogistique;
