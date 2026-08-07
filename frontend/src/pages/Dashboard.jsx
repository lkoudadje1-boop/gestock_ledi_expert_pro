import React, { useState, useEffect, useMemo  } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next'; // ✅ Résout l'erreur useTranslation is not defined
import i18nInstance from '../locales/i18n'; // ✅ Lie l'instance centrale pour Electron
import { formatCurrency } from '../utils/formatters';
import { 
  Package, MapPin, ShoppingCart, Settings, Users, LayoutDashboard, 
  LogOut, ChevronDown, ChevronRight, Truck, Wallet, PlusCircle,
  UserCircle, Search, Bell, FileText, BarChart3, ShieldCheck, PackageCheck,
  TrendingUp, Activity, CreditCard, ClipboardCheck, RefreshCcw, ClipboardList,
  Loader2, Cloud, User, History, UserCheck, UserRound, UploadCloud, PieChart, FileSpreadsheet ,
  Calendar,    // Pour l'Exercice Fiscal
  Edit3,       // Pour la Saisie Journalière
  BookOpen,    // Pour les Codes Journaux
  Book,        // Pour le Grand Livre
  Lock,        // Pour la Clôture
  Unlock, Grid,     // Pour la Réouverture
  X, Eye, EyeOff, Languages, Coins, Layers, // ✅ Ajout des icônes de contrôles pour la Topbar
  ArrowRightLeft    // Pour fermer les modaux
} from 'lucide-react';

import API from '../services/api'; 
import './Dashboard.css';

// --- CONFIGURATION DYNAMIQUE DES RACCOURCIS PAR MODULES DE LICENCE (ALIGNÉE PERMISSIONS) ---
const ALL_POSSIBLE_SHORTCUTS = [
  // --- PARAMÈTRES & SYSTÈME (MODULE: SYSTEM) ---
  { id: 'params_cloud_push', label: 'Sauv. Cloud', path: '/params/sync', icon: <Cloud />, color: 'branch', module: 'SYSTEM' },
  { id: 'params_cloud_restore', label: 'Restaur. Cloud', path: '/params/restore', icon: <RefreshCcw />, color: 'branch', module: 'SYSTEM' },
  { id: 'params_edit_settings', label: 'Paramètres', path: '/params/settings', icon: <Settings />, color: 'branch', module: 'SYSTEM' },
  { id: 'params_view_licence', label: 'Ma Licence', path: '/admin/licence', icon: <ShieldCheck />, color: 'branch', module: 'SYSTEM' },
  { id: 'params_view_audit', label: 'Journal d\'audit', path: '/audit', icon: <ShieldCheck />, color: 'branch', module: 'SYSTEM' },
  
  // --- TERMINAL DE VENTE POS (MODULE: GESTOCK) ---
  { id: 'pos_vente_create', label: 'Nouvelle Vente', path: '/pos', icon: <ShoppingCart />, color: 'pos', module: 'GESTOCK' },
  { id: 'pos_add', label: 'Ajouter Vente', path: '/pos/add', icon: <PlusCircle />, color: 'pos', module: 'GESTOCK' },
  { id: 'pos_validate', label: 'Valider Ventes', path: '/pos/validate', icon: <Search />, color: 'pos', module: 'GESTOCK' },
  { id: 'pos_invoice', label: 'Facture Client', path: '/pos/invoice', icon: <FileText />, color: 'pos', module: 'GESTOCK' },
  { id: 'pos_history', label: 'Hist. Ventes', path: '/pos/history', icon: <Search />, color: 'pos', module: 'GESTOCK' },
  { id: 'pos_close', label: 'Clôture Caisse', path: '/pos/lastClosureDate', icon: <Lock />, color: 'pos', module: 'GESTOCK' },
  { id: 'pos_history_cloture', label: 'Hist. Clôture', path: '/pos/history', icon: <Search />, color: 'pos', module: 'GESTOCK' },
  { id: 'pos_jr', label: 'Méthodes Paiement', path: '/pos/paiements/methodes', icon: <Settings />, color: 'items', module: 'GESTOCK' },
  { id: 'pos_history_creances', label: 'Créances Clients', path: '/pos/creances-clients', icon: <Wallet/>, color: 'pos', module: 'GESTOCK' },
  { id: 'pos_details', label: 'Ventes Détaillées', path: '/admin/pos-details', icon: <FileSpreadsheet />, color: 'pos', module: 'GESTOCK' },
  { id: 'pos_vente_grille', label: 'Ventes commerciale', path: '/pos/commerciale-clients', icon: <FileSpreadsheet />, color: 'pos', module: 'GESTOCK' },
  { id: 'pos_vente_liste', label: 'liste des chargements', path: '/pos/tourneesCommerciales-clients', icon: <FileSpreadsheet />, color: 'pos', module: 'GESTOCK' },

  // --- STOCKS & ACHATS / LOGISTIQUE (MODULE: GESTOCK) ---
  { id: 'log_suppliers', label: 'Fournisseurs', path: '/logistique/fournisseurs', icon: <Users />, color: 'stock', module: 'GESTOCK' },
  { id: 'log_buy', label: 'Faire Achat', path: '/logistique/achat', icon: <PlusCircle />, color: 'stock', module: 'GESTOCK' },
  { id: 'log_history', label: 'Hist. Achats', path: '/logistique/hist-achats', icon: <Search />, color: 'stock', module: 'GESTOCK' },
  { id: 'log_inventory', label: 'Faire Inventaire', path: '/logistique/inventaire', icon: <ClipboardCheck />, color: 'stock', module: 'GESTOCK' },
  { id: 'log_inventory_hist', label: 'Hist. Inventaire', path: '/logistique/historique-inventaire', icon: <History />, color: 'stock', module: 'GESTOCK' },
  { id: 'log_suppliers_dettes', label: 'Dettes Fournisseurs', path: '/logistique/dettes-fournisseurs', icon: <Truck />, color: 'stock', module: 'GESTOCK' },
  { id: 'log_ajustement', label: 'Pertes & Avaries', path: '/logistique/ajustements', icon: <ArrowRightLeft />, color: 'stock', module: 'GESTOCK' },
  { id: 'log_historique_ajustement', label: 'Historique Pertes', path: '/logistique/historique-ajustements', icon: <ClipboardList />, color: 'stock', module: 'GESTOCK' },
    { id: 'log_bon_commande', label: 'Passer Commande', path: '/logistique/bon-commande', icon: <ShoppingCart />, color: 'stock', module: 'GESTOCK' },
{ id: 'log_historique_bon', label: 'Historique Bons', path: '/logistique/historique-bon', icon: <ClipboardList />, color: 'stock', module: 'GESTOCK' },
  
  // --- GESTIONNAIRE ARTICLES (MODULE: GESTOCK) ---
  { id: 'art_view', label: 'Catalogue', path: '/articles', icon: <Package />, color: 'items', module: 'GESTOCK' },
  { id: 'art_create', label: 'Liste Produits', path: '/articles/list', icon: <PlusCircle />, color: 'items', module: 'GESTOCK' },
  { id: 'art_categories', label: 'Catégories', path: '/articles/categories', icon: <Settings />, color: 'items', module: 'GESTOCK' },
  { id: 'art_edit', label: 'Modifier Art.', path: '/articles/edit', icon: <Package />, color: 'items', module: 'GESTOCK' },
  { id: 'art_gl', label: 'Grand Livre Art.', path: '/articles/history', icon: <Package />, color: 'items', module: 'GESTOCK' },
  
  // --- MODULE GESTIONNAIRE EMBALLAGE (MODULE: GESTOCK) ---
  { id: 'emb_achat', label: 'Gestion Emballages', path: '/emballage/liste', icon: <Layers />, color: 'items', module: 'GESTOCK' },
  { id: 'emb_history', label: 'Hist. Flux Embal.', path: '/emballage/historique-flux-emballage', icon: <History />, color: 'pos', module: 'GESTOCK' },
  { id: 'emb_regles', label: 'regles consignation', path: '/emballage/regles-consignation', icon: <Settings />, color: 'items', module: 'GESTOCK' },
  { id: 'emb_create', label: 'Créer Emballages', path: '/emballage/create', icon: <PlusCircle />, color: 'items', module: 'GESTOCK' },
  { id: 'emb_inventory_suivi', label: 'Suivi Inv. Emballages', path: '/emballages/suivi', icon: <ClipboardList />, color: 'logistique', module: 'GESTOCK' },
  { id: 'emb_inventory_saisie', label: 'Saisie Inv. Emballages', path: '/emballages/inventaire/saisie', icon: <PackageCheck />, color: 'logistique', module: 'GESTOCK' },
  { id: 'emb_consignation', label: 'Consignation Emballages', path: '/emballages/consignation', icon: <ArrowRightLeft />, color: 'pos', module: 'GESTOCK' }, 
  { id: 'art_edit_tables', label: 'Gestion des Tables', path: '/admin/articles/tables', icon: <Grid />, color: 'items', module: 'GESTOCK' },
   // --- MODULE GESTION COMPTABLE : CONFIG & STRUCTURE (MODULE: COMPTA_BASE) ---
  { id: 'compta_gen_ventilation', label: 'Ventilation Tréso', path: '/compta/treso/ventilation', icon: <ArrowRightLeft />, color: 'items', module: 'COMPTA_BASE' },
  { id: 'compta_ex', label: 'Exercice Fiscal', path: '/compta/exercices', icon: <Calendar />, color: 'items', module: 'COMPTA_BASE' },
  { id: 'compta_jr', label: 'Codes Journaux', path: '/compta/journaux', icon: <Settings />, color: 'items', module: 'COMPTA_BASE' },
  { id: 'compta_plan', label: 'Plan Comptable', path: '/compta/plan', icon: <FileText />, color: 'items', module: 'COMPTA_BASE' },
  { id: 'compta_tiers_plan', label: 'Plan des Tiers', path: '/compta/tiers', icon: <UserCheck />, color: 'items', module: 'COMPTA_BASE' },
  { id: 'compta_brouillard_config', label: 'Config. Brouillards', path: '/compta/type-brouillards', icon: <Settings />, color: 'items', module: 'COMPTA_BASE' },
  { id: 'compta_auto_config', label: 'Param. Écritures Auto', path: '/compta/config-ecritures-auto', icon: <Settings />, color: 'items', module: 'COMPTA_BASE' },
  { id: 'compta_cloture', label: 'Clôture Journalière', path: '/compta/cloture-journaliere', icon: <Lock />, color: 'branch', module: 'COMPTA_BASE' },
  { id: 'analytique_plan', label: 'Plan Analytique', path: '/analytique/plan', icon: <PieChart />, color: 'branch', module: 'COMPTA_BASE' },
  { id: 'compta_treso_saisie_hub', label: 'Saisie Trésorerie', path: '/compta/treso/choix-brouillard', icon: <Wallet />, color: 'pos', module: 'COMPTA_BASE' },
  { id: 'compta_val_treso', label: 'Validation Trésorerie', path: '/compta/treso/validation', icon: <ShieldCheck />, color: 'pos', module: 'COMPTA_BASE' },
  { id: 'compta_brouillon', label: 'Saisie Assistant', path: '/compta/brouillon-selection', icon: <Edit3 />, color: 'pos', module: 'COMPTA_BASE' },
  { id: 'compta_val_brouillon', label: 'Valider Brouillons', path: '/compta/validation', icon: <ClipboardCheck />, color: 'pos', module: 'COMPTA_BASE' },
  { id: 'compta_gen_saisie', label: 'Saisie Journal', path: '/compta/gen', icon: <Edit3 />, color: 'items', module: 'COMPTA_BASE' },
  { id: 'compta_treso_cash', label: 'Caisse/Banques', path: '/compta/caisse', icon: <Wallet />, color: 'stock', module: 'COMPTA_BASE' },
  { id: 'compta_gen_factures', label: 'Factures/Règl.', path: '/compta/factures', icon: <ShoppingCart />, color: 'items', module: 'COMPTA_BASE' },
  { id: 'compta_rpt_gl_comptes', label: 'Grand Livre G.', path: '/compta/ledger', icon: <Book />, color: 'items', module: 'COMPTA_BASE' },
  { id: 'compta_tiers_clients', label: 'Comptes Clients', path: '/compta/clients', icon: <Users />, color: 'items', module: 'COMPTA_BASE' },
  { id: 'compta_rpt_bilan', label: 'Bilan / Résultat', path: '/compta/bilan', icon: <LayoutDashboard />, color: 'items', module: 'COMPTA_BASE' },
  { id: 'compta_gen_marge', label: 'Analyse Marge', path: '/compta/marge', icon: <TrendingUp />, color: 'pos', module: 'COMPTA_BASE' },
  { id: 'compta_val_audit', label: 'Validation / Audit', path: '/compta/audit', icon: <ShieldCheck />, color: 'branch', module: 'COMPTA_BASE' },
  { id: 'compta_rpt_gl_tiers', label: 'Grand Livre Tiers', path: '/compta/rapports/grand-livre-tiers', icon: <Users />, color: 'items', module: 'COMPTA_BASE' },
  { id: 'compta_rpt_bal_tiers', label: 'Balance Tiers', path: '/compta/rapports/balance-tiers', icon: <Users />, color: 'items', module: 'COMPTA_BASE' },
  { id: 'compta_etats_recap', label: 'États Financiers', path: '/compta/rapports/etats-financiers', icon: <LayoutDashboard />, color: 'items', module: 'COMPTA_BASE' },
  { id: 'compta_gen_central', label: 'Journal Centralisateur', path: '/compta/rapports/central', icon: <BookOpen />, color: 'items', module: 'COMPTA_BASE' },
  
  // --- MODULE RESSOURCES HUMAINES ET USER (MODULE: SYSTEM) ---
  { id: 'staff_manage', label: 'Gestion Staff', path: '/staff', icon: <UserRound />, color: 'branch', module: 'SYSTEM' },
  { id: 'user_create', label: 'Comptes User', path: '/users', icon: <ShieldCheck />, color: 'branch', module: 'SYSTEM' }
];
// --- COMPOSANT MENU DÉROULANT DE SÉCURITÉ ---
const NavDropdown = ({ id, label, icon: Icon, children, level = 0, openMenus, toggleMenu }) => {
  const isOpen = openMenus[id];
  return (
    <div className={`nav-dropdown-group level-${level}`}>
      <button className={`nav-item ${isOpen ? 'is-open' : ''}`} onClick={() => toggleMenu(id)}>
        <div className="nav-item-content">
          {Icon && <Icon size={20} />}
          <span>{label}</span>
        </div>
        {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>
      {isOpen && <div className="nav-submenu">{children}</div>}
    </div>
  );
};

const Dashboard = () => {
  const navigate = useNavigate();
  const { t } = useTranslation(); // Permet d'appeler les traductions locales t()

  // 🛡️ Récupération centralisée et immuable du statut de la licence machine
  const licenseData = useMemo(() => {
    try {
      const rawStatus = localStorage.getItem('licenseStatus') || '{}';
      const parsed = JSON.parse(rawStatus);
      let mods = parsed.allowed_modules || [];
      
      if (typeof mods === 'string') {
        mods = mods.replace(/[\[\]"']/g, '').split(',').map(m => m.trim().toUpperCase());
      } else if (Array.isArray(mods)) {
        mods = mods.map(m => String(m).replace(/[\[\]"']/g, '').trim().toUpperCase());
      }
      return { 
        allowed_modules: mods, 
        valid: parsed.valid ?? true,
        expiryDate: parsed.exp || null // 🎯 Ajout de la date d'expiration pour notre futur compte à rebours
      };
    } catch (e) {
      console.error("Erreur parsing licence en local", e);
      return { allowed_modules: [], valid: false, expiryDate: null };
    }
  }, []);

// --- RÉCUPÉRATION DES DONNÉES DE SESSION DYNAMIQUES ---
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const userRole = (user.role || '').toLowerCase();
  const companyName = localStorage.getItem('companyName') || 'Ledi Expert Pro';
  const companyId = localStorage.getItem('companyId');
  const isAdmin = userRole === 'admin' || userRole === 'super_admin';

  // ✅ Gestion de la devise commerciale globale dynamique
  const [currency, setCurrency] = useState(() => {
    return localStorage.getItem('erp_currency') || 'XOF';
  });

  const [showStats, setShowStats] = useState(false);
  const [alertMsg, setAlertMsg] = useState({ text: '', type: '' });

  // 🎯 États réactifs pour la gestion dynamique du décompte de validation de licence
  const [licenseTimeLeft, setLicenseTimeLeft] = useState("");
  const [showLicenseBanner, setShowLicenseBanner] = useState(false);

  const showToast = (text, type = 'success') => {
    setAlertMsg({ text, type });
    setTimeout(() => setAlertMsg({ text: '', type: '' }), 3000);
  };

  const [searchTerm, setSearchTerm] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // --- FILTRAGE DYNAMIQUE DES DROITS APPLICATIFS SYSTÈME (RBAC ALIGNÉ) ---
  const getFreshPermissions = () => {
    const latestUser = JSON.parse(localStorage.getItem('user') || '{}');
    const role = (latestUser.role || '').toLowerCase();
    const isCurrentlyAdmin = role === 'admin' || role === 'super_admin';

    if (isCurrentlyAdmin) {
      return {
        // 🔑 1. MODULE: TABLEAU DE BORD (DASHBOARD)
        dashboard: true, dashboard_view_products: true, dashboard_view_alerts: true, 
        dashboard_view_sales_day: true, dashboard_view_credit: true,
        
        // 🔑 2. MODULE: PARAMÈTRES & CLOUD
        params: true, params_edit_settings: true, params_view_licence: true, 
        params_view_audit: true, params_cloud_push: true, params_cloud_restore: true,
        
        // 🔑 3. MODULE: TERMINAL DE VENTE (POS)
        access_pos: true, pos_vente_create: true, pos_add: true, pos_validate: true, 
        pos_invoice: true, pos_history: true, pos_client_create: true, pos_close: true, pos_vente_grille: true, pos_vente_liste: true,
        pos_history_cloture: true, pos_jr: true, pos_details: true, pos_view_marge: true,
        pos_history_creances: true,
        
        // 🔑 4. MODULE: STOCKS & ACHATS (LOGISTIQUE)
        logistique: true, log_achat_view: true, log_suppliers: true, log_buy: true, 
        log_returns: true, log_history: true, log_stock_view: true, log_inventory: true, 
        log_inventory_hist: true, log_ajustement: true, log_ajustement_hist: true, log_suppliers_dettes: true, log_historique_ajustement: true,
        log_bon_commande: true, log_historique_bon: true,
        // 🔑 5. MODULE: GESTIONNAIRE ARTICLES
        access_articles: true, art_view: true, art_list: true, art_create: true, 
        art_edit: true, art_categories: true, art_gl: true, art_edit_tables: true,
        
        // 🔑 6. MODULE: UTILISATEURS & ACCÈS (RH)
        menu_users_access: true, user_create: true, staff_manage: true,
        
        // 🔑 7. MODULE: GESTION COMPTABLE (COMPTA)
        compta: true, compta_ex: true, compta_jr: true, compta_plan: true, 
        compta_tiers: true, compta_brouillon: true, compta_val: true, compta_gen: true, 
        compta_cloture: true, compta_rpt_bal_comptes: true, compta_rpt_bal_tiers: true, 
        compta_rpt_bal_agee: true, compta_rpt_bal_ana: true, compta_etats_recap: true, 
        compta_rpt_gl_comptes: true, compta_rpt_gl_ana: true, compta_rpt_gl_tiers: true, 
        compta_rpt_bilan: true, compta_rpt_resultat: true, compta_rpt_tft: true, 
        compta_rpt_jr_ana: true, compta_rpt_ctrl_caisse: true, compta_rpt_taxes: true, 
        compta_brouillard_config: true, compta_treso_saisie_hub: true, compta_treso_cash: true,
        compta_gen_ventilation: true, compta_tiers_plan: true, compta_auto_config: true, 
        compta_val_treso: true, compta_val_brouillon: true, compta_gen_saisie: true, 
        compta_gen_factures: true, compta_tiers_clients: true, compta_gen_marge: true, 
        compta_val_audit: true, compta_gen_central: true,
        
        // 🔑 8. MODULE: GESTION ANALYTIQUE
        access_analytique: true, analytique_plan: true,
        
        // 🔑 9. MODULE: GESTION DES EMBALLAGES
        access_emballages: true, emb_create: true, emb_achat: true, emb_regles: true, 
        emb_consignation: true, emb_history: true, emb_inventory: true,
        emb_inventory_suivi: true, emb_inventory_saisie: true
      };
    }
    const p = latestUser.permissions;
    return typeof p === 'string' ? JSON.parse(p) : (p || {});
  };

const [perms, setPerms] = useState(getFreshPermissions());

  // ✅ Méthode de bascule linguistique pour la Topbar
  const switchLanguage = (langCode) => {
    i18nInstance.changeLanguage(langCode);
  };

  // ✅ Méthode de bascule de devise persistante pour la Topbar
  const switchCurrency = (currencyCode) => {
    setCurrency(currencyCode);
    localStorage.setItem('erp_currency', currencyCode);
    window.dispatchEvent(new Event('storage')); // Émet un signal de synchronisation monétaire
  };
  
  // --- 2. ÉTATS (STATES) ---
  const [selectedBranchId, setSelectedBranchId] = useState(() => {
    const savedBranch = localStorage.getItem('admin_selected_branch');
    if (savedBranch) return savedBranch;
    return isAdmin ? 'all' : user.branchId;
  });

  const [stats, setStats] = useState({ 
    totalProducts: 0, 
    stockAlerts: 0, 
    dailySales: 0,
    totalAvoirs: 0,
    bankBalance: 0,
    cashBalance: 0,
    supplierDebt: 0,
    customerCredit: 0
  });

  const [branches, setBranches] = useState([]); 
  const [openMenus, setOpenMenus] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isPushing, setIsPushing] = useState(false); 
  const [isEditingShortcuts, setIsEditingShortcuts] = useState(false);

  // 🔑 FIX : Remplacement du favori par défaut obsolète 'pos_new' par 'pos_vente_create'
  const [myShortcuts, setMyShortcuts] = useState(() => {
    const saved = localStorage.getItem(`fav_shortcuts_${user.id}`); 
    return saved ? JSON.parse(saved) : ['pos_vente_create', 'log_buy', 'art_view'];
  });

  // 🎯 ENGINE : Moteur de compte à rebours dynamique pour la validation de la licence (Se déclenche sous 5 jours)
  useEffect(() => {
    if (!licenseData?.expiryDate) return;

    // Prise en charge sécurisée du format de date de votre base de données SQLite
    const expiryDate = new Date(String(licenseData.expiryDate).replace(' ', 'T'));
    let timerId;

    const runCountdown = () => {
      const maintenant = new Date();
      const diffMs = expiryDate - maintenant;
      const joursRestants = diffMs / (1000 * 60 * 60 * 24);

      // Déclenchement automatique dès qu'il reste 5 jours ou moins
      if (joursRestants <= 5 && joursRestants > 0) {
        setShowLicenseBanner(true);

        const j = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const h = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const m = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((diffMs % (1000 * 60)) / 1000);

        setLicenseTimeLeft(`${j}j ${h}h ${m}m ${s}s`);
      } else {
        setShowLicenseBanner(false);
        clearInterval(timerId);
      }
    };

    runCountdown(); // Calcul immédiat au montage du composant
    timerId = setInterval(runCountdown, 1000);

    return () => clearInterval(timerId);
  }, [licenseData]);

  // --- 4. CHARGEMENT VIA API ---
  useEffect(() => {
    const fetchDashboardData = async () => {
      if (!companyId) return; 

      setIsLoading(true);
      try {
        const [statsRes, branchesRes] = await Promise.all([
          API.get(`/dashboard/stats?branchId=${selectedBranchId}`),
          API.get('/sales/branches')
        ]);

        setStats(statsRes.data);
        setBranches(branchesRes.data);
        
        localStorage.setItem('admin_selected_branch', selectedBranchId);
      } catch (err) {
        console.error("🔥 Erreur Dashboard API:", err.response?.data?.error || err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboardData();
  }, [selectedBranchId, isAdmin, companyId]);

  // --- 5. FONCTIONS UTILITAIRES DE SÉCURITÉ ET DE LOCALISATION MONÉTAIRE ---
  // ✅ Raccordé à l'utilitaire global pour formater les devises dynamiquement selon le thème et la langue
  const formatValue = (amount) => {
    return formatCurrency(amount || 0, currency);
  };


  // 🛡️ DOUBLE SÉCURITÉ INVIOLABLE : CROISEMENT LICENCE MACHINE MATÉRIELLE + CONFIG RBAC
const canAccess = (permKey, moduleKey) => {
  if (!moduleKey) return false;

  // 1. Extraction et vérification de la licence machine (inchangé)
  const rawStatus = localStorage.getItem('licenseStatus');
  let authorizedModules = [];
  try {
    const licenseObj = JSON.parse(rawStatus || '{"allowed_modules": []}');
    const rawModules = licenseObj.allowed_modules || [];
    authorizedModules = (Array.isArray(rawModules) ? rawModules : [rawModules])
      .map(m => String(m).replace(/[\[\]"']/g, '').trim().toUpperCase());
  } catch (e) {
    authorizedModules = [];
  }

  const targetModule = moduleKey.toUpperCase();
  const hasLicence = authorizedModules.includes(targetModule) || 
                     authorizedModules.includes('FULL_ACCESS') ||
                     targetModule === 'SYSTEM';

  if (!hasLicence) return false;

  // 2. Vérification du rôle de l'utilisateur
  const localUserJson = localStorage.getItem('user') || localStorage.getItem('currentUser');
  const user = localUserJson ? JSON.parse(localUserJson) : {};
  const userRole = (user.role || '').toLowerCase().trim();
  
  if (userRole === 'admin' || userRole === 'super_admin') return true;

  // 3. Récupération et parsing propre de l'objet des permissions utilisateur
  let perms = user.permissions;
  while (typeof perms === 'string' && perms.trim() !== "") {
    try { perms = JSON.parse(perms); } catch (e) { break; }
  }
  if (!perms || typeof perms !== 'object') return false;

  // Fonction utilitaire locale pour vérifier une clé de manière souple (bool, int, string)
  const check = (key) => perms[key] === true || perms[key] === 1 || perms[key] === 'true' || perms[key] === '1';

  // 🔑 HÉRITAGE SÉCURISÉ DES MENUS PARENTS (SIDEBAR)
  if (permKey === 'access_pos') {
    return check('vente_create') || check('pos_add') || check('pos_validate') || check('pos_invoice') || check('pos_history') || check('pos_close') || check('pos_history_cloture') || check('pos_jr') || check('vente_view') || check('pos_history_creances') || check('pos_vente_grille') || check('pos_vente_liste') || check('pos_details');
  }
  
if (permKey === 'logistique') {
    return check('achat_view') || check('log_suppliers') || check('log_buy') || 
           check('log_returns') || check('log_history') || check('stock_view') || 
           check('log_inventory') || check('log_inventory_hist') || check('log_ajustement') || 
           check('log_ajustement_hist') || check('log_suppliers_dettes') || check('log_historique_ajustement') ||
           check('log_bon_commande') || check('log_historique_bon'); // 🚀 Vérification croisée injectée
}

  
  if (permKey === 'access_articles') {
    return check('art_view') || check('art_list') || check('art_create') || check('art_edit') || check('art_categories') || check('art_gl') || check('art_edit_tables');
  }

  // 🔑 L'AJOUT CRUCIAL : Gestion de l'héritage pour ton module Emballages
  if (permKey === 'access_emballages') {
    return check('emb_create') || check('emb_achat') || check('emb_regles') || check('emb_consignation') || check('emb_history') || check('emb_inventory') || check('emb_inventory_suivi') || check('emb_inventory_saisie');
  }
  
  if (permKey === 'menu_users_access') {
    return check('user_create') || check('staff_manage');
  }
  
  if (permKey === 'compta' || permKey === 'access_compta') {
    return check('compta_ex') || check('compta_jr') || check('compta_plan') || 
           check('compta_tiers') || check('compta_brouillon') || check('compta_val') || 
           check('compta_gen') || check('compta_cloture') || check('treso_saisie_hub') || 
           check('treso_cash') || check('rpt_bal_comptes') || check('rpt_bal_tiers') || 
           check('rpt_gl_comptes') || check('rpt_bilan') || check('rpt_resultat') || 
           check('rpt_tft') || check('compta_rpt_bal_agee') || check('compta_rpt_bal_ana') || 
           check('compta_rpt_gl_tiers') || check('compta_rpt_gl_ana') || check('compta_etats_recap') ||
           check('analytique_plan') || check('compta_brouillard_config') || check('compta_gen_ventilation') ||
           check('compta_tiers_plan') || check('compta_auto_config') || check('compta_val_treso') ||
           check('compta_val_brouillon') || check('compta_gen_saisie') || check('compta_gen_factures') ||
           check('compta_tiers_clients') || check('compta_gen_marge') || check('compta_val_audit') || check('compta_gen_central');
  }

  if (permKey === 'params') {
    return check('edit_settings') || check('view_licence') || check('view_audit') || check('action_cloud_push') || check('action_cloud_restore');
  }

  // Pour toutes les sous-clés individuelles (enfants) : exemple 'log_ajustement_hist'
  return check(permKey);
};
const toggleMenu = (menuId) => {
    setOpenMenus(prev => ({ ...prev, [menuId]: !prev[menuId] }));
  };

  const smartNavigate = (path) => {
    // 🎯 SÉCURISATION SANS ALTERATION : La condition valide l'arborescence native
    if (
      path.startsWith('/admin') || 
      path.startsWith('/logistique') || 
      path.startsWith('/pos') || 
      path.startsWith('/rh') || 
      path.startsWith('/analytique') || 
      path.startsWith('/compta') || 
      path.startsWith('/emballage')
    ) { 
      navigate(path);
    } else {
      navigate(`/admin${path.startsWith('/') ? path : '/' + path}`);
    }
  };

  useEffect(() => {
    const handlePermissionUpdate = () => {
      console.log("⚡ Mise à jour instantanée des permissions détectée !");
      setPerms(getFreshPermissions());
    };
    window.addEventListener('storage', handlePermissionUpdate);
    return () => window.removeEventListener('storage', handlePermissionUpdate);
  }, []);

  // Filtrage en temps réel des résultats de recherche globale selon la licence machine
  const searchResults = useMemo(() => {
    if (!searchTerm.trim()) return [];
    const query = searchTerm.toLowerCase();
    return ALL_POSSIBLE_SHORTCUTS.filter(action => {
      const hasAccess = canAccess(action.id, action.module);
      const matchesQuery = action.label.toLowerCase().includes(query);
      return hasAccess && matchesQuery;
    }).map(p => ({ ...p, type: 'page' }));
  }, [searchTerm, perms, isAdmin, licenseData]);

  const handleManualPush = async () => {
    if (isAdmin && selectedBranchId === 'all') {
      alert(t('dashboard.alerts.select_branch', "❌ Sélectionnez une entité précise.")); return;
    }
    const branchIdToUse = isAdmin ? selectedBranchId : user.branchId;
    if (!window.confirm(t('dashboard.alerts.confirm_backup', "☁️ Sauvegarder vers le Cloud ?"))) return;
    setIsPushing(true);
    try {
      const response = await API.post('/sync/restore-to-cloud', { companyId, branchId: branchIdToUse });
      if (response.data.success) alert(t('dashboard.alerts.backup_success', "✅ Réussi !"));
    } catch (err) { alert(t('dashboard.alerts.backup_error', "❌ Erreur lors de la sauvegarde.")); }
    finally { setIsPushing(false); }
  };

    const handleCloudRestore = async () => {
    if (!window.confirm(t('dashboard.alerts.confirm_restore', "⚠️ Écraser les données locales par celles du Cloud ?"))) return;
    setIsRestoring(true);
    try {
      const response = await API.post('/sync/restore', { companyId, userRole });
      if (response.data.success) { 
        alert(t('dashboard.alerts.restore_success', "Restauration terminée !")); 
        window.location.reload(); 
      }
    } catch (err) { alert(t('dashboard.alerts.restore_error', "Erreur lors de la restauration.")); }
    finally { setIsRestoring(false); }
  };

  const handleSaveShortcuts = () => {
    localStorage.setItem(`fav_shortcuts_${user.id}`, JSON.stringify(myShortcuts));
    setIsEditingShortcuts(false);
    showToast(t('dashboard.alerts.shortcuts_updated', "Raccourcis mis à jour !"));
  };

   // --- RENDU DU COMPOSANT ---
  return (
    <div className="dashboard-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo-m">{companyName.charAt(0).toUpperCase()}</div>
          <div className="company-info">
            <span className="company-name">{companyName}</span>
            
            {/* 🛡️ BADGE DE LICENCE DYNAMIQUE EN FONCTION DE L'ÉTAT RÉEL REÇU */}
            <span 
              className="status-badge" 
              style={{
                // 🎯 S'affiche en Orange (#f59e0b) si l'expiration approche à moins de 5 jours, Rouge si invalide, Vert si tout est OK
                backgroundColor: !licenseData?.valid ? '#ef4444' : (showLicenseBanner ? '#f59e0b' : '#10b981'),
                color: '#ffffff',
                padding: '2px 8px',
                borderRadius: '12px',
                fontSize: '11px',
                fontWeight: '700',
                marginTop: '4px',
                display: 'inline-block',
                textAlign: 'center',
                transition: 'background-color 0.3s ease'
              }}
            >
              {!licenseData?.valid 
                ? t('dashboard.licence.invalid', 'Licence Invalide') 
                : (showLicenseBanner ? t('dashboard.licence.expiring', 'Échéance Proche') : t('dashboard.licence.active', 'Licence Active'))
              }
            </span>
          </div>
        </div>
        <nav className="sidebar-nav">
          <button className="nav-item active" onClick={() => navigate('/admin/dashboard')}>
            <div className="nav-item-content">
              <LayoutDashboard size={20}/> 
              <span>{t('sidebar.dashboard', 'Dashboard')}</span>
            </div>
          </button>

          {/* ====================================================== */}
          {/* 1. CONFIGURATION ET PARAMÈTRES (MODULE: SYSTEM)       */}
          {/* ====================================================== */}
        {canAccess('params', 'SYSTEM') && (
    <NavDropdown id="params" label={t('sidebar.company_settings', 'Paramètres Société')} icon={Settings} openMenus={openMenus} toggleMenu={toggleMenu}>
      
      {/* 🔑 CLÉS ALIGNÉES SUR LA STRUCTURE DES PRIVILÈGES */}
      {canAccess('edit_settings', 'SYSTEM') && (
        <button className="sub-item" onClick={() => smartNavigate('/settings')}>
          {t('sidebar.company_info', 'Informations de la Société')}
        </button>
      )}
      
      {canAccess('view_licence', 'SYSTEM') && (
        <button className="sub-item" onClick={() => smartNavigate('/admin/licence')}>
          {t('sidebar.my_license', 'Ma licence')}
        </button>
      )}
      
      {canAccess('view_audit', 'SYSTEM') && (
        <button className="sub-item" onClick={() => navigate('/audit')}>
          <Activity size={14} style={{ marginRight: '8px' }}/>
          {t('sidebar.audit_log', 'Journal des actions')}
        </button>
      )}
      
      {canAccess('action_cloud_push', 'SYSTEM') && (
        <button className="sub-item" onClick={handleManualPush} disabled={isPushing} style={{ color: '#2563eb', fontWeight: 'bold' }}>
          {isPushing ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />}
          <span style={{ marginLeft: '8px' }}>{t('sidebar.cloud_backup', 'Sauvegarder vers Cloud')}</span>
        </button>
      )}
      
      {canAccess('action_cloud_restore', 'SYSTEM') && (
        <button className="sub-item" onClick={handleCloudRestore} disabled={isRestoring} style={{ color: '#c2410c', fontWeight: 'bold' }}>
          {isRestoring ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />}
          <span style={{ marginLeft: '8px' }}>{t('sidebar.cloud_restore', 'Restauration Cloud')}</span>
        </button>
      )}
      
      <hr style={{ border: '0.1px solid #334155', margin: '4px 0' }} />
    </NavDropdown>
)}


       {/* ====================================================== */}
          {/* 2. TERMINAL DE VENTE POS (MODULE: GESTOCK)            */}
          {/* ====================================================== */}
       {canAccess('access_pos', 'GESTOCK') && (
            <NavDropdown id="pos" label={t('sidebar.pos_terminal', 'Terminal de Vente POS')} icon={ShoppingCart} openMenus={openMenus} toggleMenu={toggleMenu}>
              {canAccess('vente_create', 'GESTOCK') && <button className="sub-item" onClick={() => smartNavigate('/pos')}>{t('sidebar.counter_sale', 'Vente au Comptoir')}</button>}
              {canAccess('pos_add', 'GESTOCK') && <button className="sub-item" onClick={() => smartNavigate('/pos/add')}>{t('sidebar.cart_sale', 'Vente Au panier')}</button>}
              {canAccess('pos_validate', 'GESTOCK') && <button className="sub-item" onClick={() => smartNavigate('/pos/validate')}>{t('sidebar.validate_cart', 'Valider un Panier')}</button>}
              {canAccess('pos_invoice', 'GESTOCK') && <button className="sub-item" onClick={() => smartNavigate('/pos/invoice')}>{t('sidebar.standardized_invoice', 'Vente Normalisée')}</button>}
              {canAccess('pos_vente_grille', 'GESTOCK') && <button className="sub-item" onClick={() => smartNavigate('/pos/commerciale-clients')}>{t('sidebar.standardized_grille', 'Commerciale')}</button>}
              {canAccess('pos_vente_liste', 'GESTOCK') && <button className="sub-item" onClick={() => smartNavigate('/pos/tourneesCommerciales-clients')}>{t('sidebar.standardized_tournees', 'Liste Commerciale')}</button>}

              {canAccess('pos_close', 'GESTOCK') && <button className="sub-item" onClick={() => smartNavigate('/pos/close')}>{t('sidebar.shift_closing', 'Clôture de la Vente')}</button>}
              {canAccess('pos_history_cloture', 'GESTOCK') && <button className="sub-item" onClick={() => smartNavigate('/pos/historique-cloture')}>{t('sidebar.closing_history', 'Historique des clôtures')}</button>}
              {canAccess('pos_history', 'GESTOCK') && <button className="sub-item" onClick={() => smartNavigate('/pos/history')}>{t('sidebar.sales_history', 'Historique des ventes')}</button>}
              
            {/* --- AJOUT : BOUTON VENTES DÉTAILLÉES PAR DATE ET MARGES --- */}
{canAccess('pos_details', 'GESTOCK') && (
  <button className="sub-item" onClick={() => navigate('/pos-details')}>
    {t('sidebar.detailed_sales', 'Rapports des ventes')}
  </button>
)}

                
              {/* 🔑 FIX : Utilisation de navigate() au lieu de smartNavigate() pour forcer la route réelle */}
              {canAccess('pos_jr', 'GESTOCK') && <button className="sub-item" onClick={() => navigate('/pos/paiements/methodes')}>{t('sidebar.add_payment_method', 'Ajouter un Moyen de Paiement')}</button>}

              {canAccess('vente_view', 'GESTOCK') && <button className="sub-item" onClick={() => navigate('/ventes/clients')}>{t('sidebar.register_customer', 'Enregistrer un Client')}</button>}
              {canAccess('pos_history', 'GESTOCK') && <button className="sub-item" onClick={() => smartNavigate('/pos/creances-clients')}>{t('sidebar.customer_debts', 'Suivi Créances Clients')}</button>}
              <hr style={{ border: '0.1px solid #334155', margin: '4px 0' }} />
            </NavDropdown>
          )}


          {/* ====================================================== */}
          {/* 3. STOCKS & ACHATS / LOGISTIQUE (MODULE: GESTOCK)     */}
          {/* ====================================================== */}
        {canAccess('logistique', 'GESTOCK') && (
            <NavDropdown id="logistique" label={t('sidebar.purchasing_logistics', 'Achat & Logistique')} icon={Truck} openMenus={openMenus} toggleMenu={toggleMenu}>
              {canAccess('log_suppliers', 'GESTOCK') && <button className="sub-item" onClick={() => smartNavigate('/logistique/fournisseurs')}>{t('sidebar.register_supplier', 'Enregistrer un Fournisseur')}</button>}
              {canAccess('log_buy', 'GESTOCK') && <button className="sub-item" onClick={() => smartNavigate('/logistique/achat')}>{t('sidebar.make_purchase', 'Effectuer un Achat')}</button>}
              {canAccess('log_history', 'GESTOCK') && <button className="sub-item" onClick={() => smartNavigate('/logistique/hist-achats')}>{t('sidebar.purchase_history', 'Historique des achats')}</button>}
              {canAccess('log_inventory', 'GESTOCK') && <button className="sub-item" onClick={() => smartNavigate('/logistique/inventaire')}>{t('sidebar.inventory', 'Inventaire')}</button>}
              {canAccess('log_inventory_hist', 'GESTOCK') && <button className="sub-item" onClick={() => smartNavigate('/logistique/historique-inventaire')}>{t('sidebar.inventory_history', 'Historique Inventaires')}</button>}
              
                  {canAccess('log_bon_commande', 'GESTOCK') && <button className="sub-item" onClick={() => smartNavigate('/logistique/bon-commande')}>{t('sidebar.make_order', 'Passer une Commande')}</button>}
                 {canAccess('log_historique_bon', 'GESTOCK') && (
                <button className="sub-item" onClick={() => smartNavigate('/logistique/historique-bon')}>
                  {t('sidebar.order_history', 'Historique des Commandes')}
                </button>
              )}
              {/* 🚀 ONGLET INTERACTIF DÉDIÉ POUR LES PERTES & AVARIES DE STOCK */}
              {canAccess('log_ajustement', 'GESTOCK') && <button className="sub-item" onClick={() => smartNavigate('/logistique/ajustements')}>{t('sidebar.stock_adjustments', 'Régularisation du Stock')}</button>}
             
              
             {canAccess('log_ajustement_hist', 'GESTOCK') && (
  <button 
    className="sub-item" 
    onClick={() => smartNavigate('/logistique/historique-ajustements')} // <-- Retrait du "d" ici
  >
    {t('sidebar.stock_adjustments_history', 'Historique des Régularisations')}
  </button>
)}

            
              {canAccess('log_suppliers', 'GESTOCK') && <button className="sub-item" onClick={() => smartNavigate('/logistique/dettes-fournisseurs')}>{t('sidebar.supplier_debts', 'Suivi Dettes Fournisseurs')}</button>}
              <hr style={{ border: '0.1px solid #334155', margin: '4px 0' }} />
            </NavDropdown>
          )}

        
{/* ====================================================== */}
          {/* 4. GESTIONNAIRE ARTICLES (MODULE: GESTOCK)            */}
          {/* ====================================================== */}
          {canAccess('access_articles', 'GESTOCK') && (
            <NavDropdown id="access_articles" label={t('sidebar.article_manager', 'Gestionn Articles')} icon={Package} openMenus={openMenus} toggleMenu={toggleMenu}>
              {canAccess('art_categories', 'GESTOCK') && <button className="sub-item" onClick={() => smartNavigate('/articles/categories')}>{t('sidebar.categories_groups', 'Familles Catégories & Groupes')}</button>}
              {canAccess('art_create', 'GESTOCK') && <button className="sub-item" onClick={() => smartNavigate('/articles')}>{t('sidebar.add_article', 'Ajouter & Modifier un Article')}</button>}
              {canAccess('art_list', 'GESTOCK') && <button className="sub-item" onClick={() => smartNavigate('/articles/list')}>{t('sidebar.articles_list', 'Liste des Articles')}</button>}
              {canAccess('art_view', 'GESTOCK') && <button className="sub-item" onClick={() => smartNavigate('/articles/unites')}>{t('sidebar.add_packaging', 'Ajouter Conditionnement')}</button>}
              {canAccess('art_gl', 'GESTOCK') && <button className="sub-item" onClick={() => smartNavigate(`/articles/history`)}>{t('sidebar.article_ledger', 'Grand livre Article')}</button>}
              {canAccess('art_edit', 'GESTOCK') && <button className="sub-item" onClick={() => smartNavigate('/articles/tables')}>{t('sidebar.tables_management', 'Gestion des Tables')}</button>}
              <hr style={{ border: '0.1px solid #334155', margin: '4px 0' }} />
            </NavDropdown>
          )}

                  {/* ====================================================== */}
          {/* 4. GESTIONNAIRE EMBALLAGE (MODULE: GESTOCK)            */} 
          {/* ====================================================== */}
         {canAccess('access_emballages', 'GESTOCK') && (
            <NavDropdown id="access_emballages" label={t('sidebar.emballage_manager', 'Gestionn des Emballages')} icon={Layers} openMenus={openMenus} toggleMenu={toggleMenu}>
              {canAccess('emb_create', 'GESTOCK') && <button className="sub-item" onClick={() => smartNavigate('/emballage/create')}>{t('sidebar.add_emballage', 'Création Emballage')}</button>}
              {canAccess('emb_achat', 'GESTOCK') && <button className="sub-item" onClick={() => smartNavigate('/emballage/achat')}>{t('sidebar.emballage_Achat', 'Achat Emballages')}</button>}
              {canAccess('emb_regles', 'GESTOCK') && <button className="sub-item" onClick={() => smartNavigate('/emballage/regles-consignation')}>{t('sidebar.regles_consignation', 'Configuration des Flux')}</button>}
              {canAccess('emb_consignation', 'GESTOCK') && <button className="sub-item" onClick={() => smartNavigate('/emballages/consignation')}>{t('sidebar.emballage_consignation', 'Consignation Emballages')}</button>}
              {canAccess('emb_history', 'GESTOCK') && <button className="sub-item" onClick={() => smartNavigate('/emballage/historique-flux-emballage')}>{t('sidebar.Embalage_flux_historique', 'Historique des inventaires')}</button>}
              {canAccess('emb_inventory', 'GESTOCK') && <button className="sub-item" onClick={() => smartNavigate('/emballages/suivi')}>{t('sidebar.emballage_inventory_suivi', 'Suivi & Lancement Inv.')}</button>}
              <hr style={{ border: '0.1px solid #334155', margin: '4px 0' }} />
            </NavDropdown>
          )}
           
          {/* ====================================================== */}
          {/* 5. GESTION UTILISATEURS ET SYSTEM (MODULE: SYSTEM)     */}
          {/* ====================================================== */}
          {canAccess('menu_users_access', 'SYSTEM') && (
            <NavDropdown id="rh_management" label={t('sidebar.user_management', 'Gestion Utilisateurs')} icon={Users} openMenus={openMenus} toggleMenu={toggleMenu}>
              {canAccess('user_create', 'SYSTEM') && (<button className="sub-item" onClick={() => smartNavigate('/users')}>{t('sidebar.user_accounts', 'Comptes Utilisateurs')}</button>)}
              {canAccess('staff_manage', 'SYSTEM') && (<button className="sub-item" onClick={() => smartNavigate('/staff')}>{t('sidebar.staff_management', 'Gestion Staff')}</button>)}
              <hr style={{ border: '0.1px solid #334155', margin: '4px 0' }} />
            </NavDropdown>
          )}

       {/* 6. GESTION COMPTABLE (MODULE: COMPTA_BASE)             */}
          {canAccess('compta', 'COMPTA_BASE') && ( // 🔑 FIX : Aligné sur 'compta' parent
            <NavDropdown id="compta" label={t('sidebar.accounting', 'Gestion Comptable')} icon={Wallet} openMenus={openMenus} toggleMenu={toggleMenu}>
          {/* 6.1 COMPTABILITÉ GÉNÉRALE */}
          {(canAccess('compta_gen', 'COMPTA_BASE') || canAccess('compta_ex', 'COMPTA_BASE') || canAccess('compta_brouillon', 'COMPTA_BASE')) && (
            <NavDropdown id="compta_gen_group" label={t('sidebar.general_accounting', 'Comptabilité Générale')} level={1} openMenus={openMenus} toggleMenu={toggleMenu}>
              <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '10px', padding: '10px 15px' }}>
                {canAccess('compta_ex', 'COMPTA_BASE') && (<button className="sub-item" onClick={() => smartNavigate('/compta/exercices')}>{t('sidebar.fiscal_years', 'Exercices Comptables')}</button>)}
                {canAccess('compta_jr', 'COMPTA_BASE') && (<button className="sub-item" onClick={() => smartNavigate('/compta/journaux')}>{t('sidebar.journal_codes', 'Codes Journaux')}</button>)}
                {canAccess('compta_plan', 'COMPTA_BASE') && (<button className="sub-item" onClick={() => smartNavigate('/compta/plan')}>{t('sidebar.chart_of_accounts_btn', 'Plan comptable')}</button>)}
                {canAccess('analytique_plan', 'COMPTA_BASE') && (<button className="sub-item" onClick={() => smartNavigate('/compta/analytique')}>{t('sidebar.analytic_plan_btn', 'Plan Analytique')}</button>)}
                {canAccess('analytique_plan', 'COMPTA_BASE') && (<button className="sub-item" onClick={() => navigate('/compta/repartitions/config')}>{t('sidebar.analytic_config', 'Config Analytique')}</button>)}
                {canAccess('compta_tiers', 'COMPTA_BASE') && (<button className="sub-item" onClick={() => smartNavigate('/compta/tiers')}>{t('sidebar.third_party_plan', 'Plan des Tiers')}</button>)}
                {canAccess('compta_brouillard_config', 'COMPTA_BASE') && (<button className="sub-item" onClick={() => smartNavigate('/compta/config-ecritures-auto')}>{t('sidebar.auto_entries_settings', 'Paramètres Écritures Auto')}</button>)}
              </div>
              <hr style={{ border: '0.1px solid #334155', margin: '4px 0', opacity: 0.3 }} />
              <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '10px', padding: '10px 15px' }}>
                {canAccess('compta_brouillon', 'COMPTA_BASE') && (<button className="sub-item" onClick={() => smartNavigate('/compta/brouillon-selection')}>{t('sidebar.assistant_entry_btn', 'Saisie Assistant')}</button>)}
                {canAccess('compta_val', 'COMPTA_BASE') && (<button className="sub-item" onClick={() => smartNavigate('/compta/validation')}>{t('sidebar.drafts_validation', 'Validation Brouillons')}</button>)}
                {canAccess('compta_gen', 'COMPTA_BASE') && (<button className="sub-item" onClick={() => smartNavigate('/compta/gen')}>{t('sidebar.daily_entry_btn', 'Saisie Journalière')}</button>)}
                {canAccess('compta_gen', 'COMPTA_BASE') && (<button className="sub-item" onClick={() => smartNavigate('/compta/treso/ventilation')}>{t('sidebar.ledger_ventilation', 'Ventilation du Brouillard')}</button>)}
                {canAccess('compta_cloture', 'COMPTA_BASE') && (<button className="sub-item" onClick={() => smartNavigate('/compta/cloture-journaliere')}>{t('sidebar.daily_closing_btn', 'Clôture Journalière')}</button>)}
              </div>
            </NavDropdown>
          )}

                  {(canAccess('treso_cash', 'COMPTA_BASE') || canAccess('treso_saisie_hub', 'COMPTA_BASE')) && (
            <NavDropdown id="tresorerie_group" label={t('sidebar.treasury', 'Trésorerie')} level={1} openMenus={openMenus} toggleMenu={toggleMenu}>
              <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '10px', padding: '10px 15px' }}>
                {canAccess('treso_saisie_hub', 'COMPTA_BASE') && (<button className="sub-item" onClick={() => smartNavigate('/compta/treso/choix-brouillard')}>{t('sidebar.cash_drafts', 'Brouillards de Saisie')}</button>)}
                {canAccess('compta_val', 'COMPTA_BASE') && (<button className="sub-item" onClick={() => smartNavigate('/compta/treso/validation')}>{t('sidebar.expense_validation', 'Valider une Dépense')}</button>)}
                {canAccess('compta_brouillard_config', 'COMPTA_BASE') && (<button className="sub-item" onClick={() => smartNavigate('/compta/type-brouillards')}>{t('sidebar.draft_config', 'Configuration du Brouillard')}</button>)}
              </div>
            </NavDropdown>
          )}   
          {canAccess('access_compta', 'COMPTA_BASE') && (
            <NavDropdown id="compta_rapports_group" label={t('sidebar.reports_statements', 'Rapports & États')} level={1} openMenus={openMenus} toggleMenu={toggleMenu}>
              <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '10px', padding: '10px 15px' }}>
                {canAccess('rpt_bal_comptes', 'COMPTA_BASE') && (<button className="sub-item" onClick={() => smartNavigate('/compta/rapports/balance-comptes')}>{t('sidebar.accounts_balance', 'Balance des comptes')}</button>)}
                {canAccess('rpt_bal_tiers', 'COMPTA_BASE') && (<button className="sub-item" onClick={() => smartNavigate('/compta/rapports/balance-tiers')}>{t('sidebar.third_party_balance_btn', 'Balance des tiers')}</button>)}
                {canAccess('compta_rpt_bal_agee', 'COMPTA_BASE') && (<button className="sub-item" onClick={() => smartNavigate('/compta/rapports/balance-agee')}>{t('sidebar.aged_balance', 'Balance âgée')}</button>)}
                {canAccess('compta_rpt_bal_ana', 'COMPTA_BASE') && (<button className="sub-item" onClick={() => smartNavigate('/compta/rapports/balance-analytique')}>{t('sidebar.analytic_balance', 'Balance analytique')}</button>)}
              </div>
              <hr style={{ border: '0.1px solid #334155', margin: '4px 0', opacity: 0.3 }} />
              <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '10px', padding: '10px 15px' }}>
                {canAccess('rpt_gl_comptes', 'COMPTA_BASE') && (<button className="sub-item" onClick={() => smartNavigate('/compta/rapports/grand-livre')}>{t('sidebar.general_ledger_btn', 'Grand livre des comptes')}</button>)}
                {canAccess('compta_rpt_gl_tiers', 'COMPTA_BASE') && (<button className="sub-item" onClick={() => smartNavigate('/compta/rapports/grand-livre-tiers')}>{t('sidebar.third_party_ledger_btn', 'Grand livre des tiers')}</button>)}
                {canAccess('compta_rpt_gl_ana', 'COMPTA_BASE') && (<button className="sub-item" onClick={() => smartNavigate('/compta/rapports/grand-livre-analytique')}>{t('sidebar.analytic_ledger_btn', 'Grand livre analytique')}</button>)}
              </div>
              <hr style={{ border: '0.1px solid #334155', margin: '4px 0', opacity: 0.3 }} />
              <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '10px', padding: '10px 15px' }}>
                {canAccess('rpt_bilan', 'COMPTA_BASE') && (<button className="sub-item" onClick={() => smartNavigate('/compta/rapports/bilan')}>{t('sidebar.balance_sheet_btn', 'Bilan')}</button>)}
                {canAccess('rpt_resultat', 'COMPTA_BASE') && (<button className="sub-item" onClick={() => smartNavigate('/compta/rapports/resultat')}>{t('sidebar.income_statement', 'Compte de résultat')}</button>)}
                {canAccess('rpt_tft', 'COMPTA_BASE') && (<button className="sub-item" onClick={() => smartNavigate('/compta/rapports/tft')}>{t('sidebar.cash_flow_statement', 'TFT')}</button>)}
                {canAccess('compta_etats_recap', 'COMPTA_BASE') && (<button className="sub-item" onClick={() => smartNavigate('/compta/rapports/etats-financiers')}>{t('sidebar.financial_statements_recap', 'États Financiers (Recap)')}</button>)}
              </div>
            </NavDropdown>
          )}


                 <hr style={{ border: '0.1px solid #334155', margin: '4px 0' }} />
          </NavDropdown>
        )}
      </nav>
      
      <div className="sidebar-footer">
        <button 
          className="logout-button" 
          type="button"
          onClick={() => {
            // 🚀 1. ACTION PRIORITAIRE ET SYNC : On nettoie immédiatement la mémoire locale
            localStorage.clear(); 
            sessionStorage.clear(); 
            
            // 🚀 2. ENVOI DE LA NOTIFICATION BACKEND EN ARRIÈRE-PLAN (DÉCOUPLÉE)
            API.post('/auth/logout').catch((error) => {
                console.warn("⚠️ [LOGOUT] Notification backend échouée (souvent lié au CORS file:// sous Electron) :", error.message);
            });

            // 🚀 3. REDIRECTION ET RAFRAÎCHISSEMENT INCONTESTABLE POUR ELECTRON
            // Au lieu de navigate(), on utilise window.location pour forcer la réinitialisation
            window.location.hash = '#/welcome'; 
            window.location.reload(); 
          }}
        >
          <div className="logout-icon-wrapper"><LogOut size={18} /></div>
          <span>{t('sidebar.logout', 'Fermer la session')}</span>
        </button>
      </div>

    </aside>

    {/* --- MAIN CONTENT AREA --- */}
    <main className="main-area">
      <header className="top-bar">
        
        {/* SECTION RECHERCHE & COMMANDES GLOBALES (LANGUES / DEVISES) */}
        <div className="top-bar-left-zone">
          <div className="search-container">
            <div className="search-input-wrapper">
              <Search size={18} className="search-icon" />
              <input 
                type="text" 
                placeholder={t('dashboard.topbar.search_placeholder', 'Recherche rapide...')} 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => {
                  setTimeout(() => setIsSearchFocused(false), 250);
                }}
                className="search-field"
              />
            </div>

{isSearchFocused && searchTerm.length > 0 && (
            <div className="search-results-overlay">
              {searchResults.length > 0 ? (
                searchResults.map((result) => (
                  <div 
                    key={result.id}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      smartNavigate(result.path);
                      setSearchTerm("");
                      setIsSearchFocused(false);
                    }}
                    className="search-result-row"
                  >
                    <div className={`icon-c ${result.color}`}>
                      {result.icon}
                    </div>
                    <span className="search-result-label">{result.label}</span>
                  </div>
                ))
              ) : (
                <div className="search-no-results">{t('dashboard.topbar.no_results', 'Aucun résultat')}</div>
              )}
            </div>
          )}
        </div>

        {/* ====================================================== */}
        {/* 🎛️ SÉLECTEURS DE LOCALISATION INTÉGRÉS À LA TOPBAR      */}
        {/* ====================================================== */}
        <div className="top-bar-localization-controls-3d">
          {/* Sélecteur de Langue */}
          <div className="dropdown-control-wrapper-3d">
            <Languages size={14} className="control-icon-3d" />
            <select 
              value={i18nInstance.language ? i18nInstance.language.substring(0, 2) : 'fr'} 
              onChange={(e) => switchLanguage(e.target.value)}
            >
              <option value="fr">FR</option>
              <option value="en">EN</option>
            </select>
          </div>

          {/* Sélecteur de Devise */}
          <div className="dropdown-control-wrapper-3d">
            <Coins size={14} className="control-icon-3d" />
            <select 
              value={currency} 
              onChange={(e) => switchCurrency(e.target.value)}
            >
              <option value="XOF">XOF</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GNF">GNF</option>
            </select>
          </div>
        </div>
      </div>
          
      <div className="top-bar-actions-3d">
        <div className="branch-selector-3d">
          <MapPin size={16} className="control-icon-3d" />
          <select value={selectedBranchId} onChange={(e) => setSelectedBranchId(e.target.value)}>
            {isAdmin && <option value="all">Vue Globale</option>}
            {branches.map((b) => (
              <option key={b.id || b._id} value={b.id || b._id}>{b.name || b.nom}</option>
            ))}
          </select>
        </div>

        <button className="icon-btn-top-3d">
          <Bell size={20} />
        </button>

        <div className="user-profile-3d">
          <div className="user-info-3d">
            <span className="user-name-3d">{user.username || 'Utilisateur'}</span>
            <span className="user-role-3d">{isAdmin ? t('dashboard.topbar.role_admin', 'Super Administrateur') : (user.fonction || t('dashboard.topbar.role_staff', 'Collaborateur'))}</span>
          </div>
          <div className="avatar-circle-3d">
            <UserCircle size={28} />
          </div>
        </div>
      </div>
    </header>

<div className="content-scroll">

      {/* ====================================================== */}
      {/* ⚠️ BANDEAU D'ALERTE DE VALIDATION DE LICENCE DYNAMIQUE  */}
      {/* ====================================================== */}
      {showLicenseBanner && (
        <div 
          className="license-alert-banner-3d"
          style={{
            backgroundColor: '#fff3cd',
            color: '#856404',
            padding: '14px 20px',
            marginBottom: '20px',
            borderRadius: '8px',
            border: '1px solid #ffeeba',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            fontWeight: '600',
            fontSize: '14px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
            animation: 'fadeIn 0.3s ease-in-out'
          }}
        >
          <span style={{ fontSize: '18px', display: 'flex', alignItems: 'center' }}>⚠️</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
            <span>{t('dashboard.licence.banner_text', 'Votre licence expire dans :')}</span>
            <strong style={{ color: '#b91c1c', letterSpacing: '0.5px', paddingLeft: '2px' }}>
              {licenseTimeLeft}
            </strong>
            <span>{t('dashboard.licence.banner_text', ', veuillez contacter votre prestataire pour le réabonnement.')}</span>
          </div>
        </div>
      )}

      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>{t('dashboard.page.title', 'Tableau de Bord')}</h1>
          <p>{t('dashboard.page.subtitle', 'Espace de Gestion Professionnelle')} - {companyName}</p>
        </div>

        {/* Bouton de bascule de visibilité des valeurs chiffrées */}
        <button 
          onClick={() => setShowStats(!showStats)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid var(--border-color)',
            backgroundColor: 'var(--bg-card)',
            color: 'var(--text-main)',
            cursor: 'pointer'
          }}
        >
          {showStats ? <EyeOff size={16} /> : <Eye size={16} />}
          <span style={{ fontSize: '13px' }}>{showStats ? t('dashboard.page.hide', 'Masquer') : t('dashboard.page.show', 'Afficher')}</span>
        </button>
      </div>

    {/* ====================================================== */}
{/* SÉCURISATION DE LA GRILLE DE STATISTIQUES (MODULE: GESTOCK) */}
{/* ====================================================== */}
<section className="stats-grid-3d">
  {/* 🔑 FIX : Aligné sur dashboard_view_products de votre structure unifiée */}
  {canAccess('dashboard_view_products', 'GESTOCK') && (
    <div className="stat-card-3d">
      <div className="stat-icon-wrapper blue-icon">
        <i className="fas fa-box"></i>
      </div>
      <div className="stat-content">
        <span className="stat-label-3d">{t('dashboard.stats.products', 'Produits')}</span>
        <span className="stat-value-3d">{showStats ? stats.totalProducts : "••••••"}</span>
      </div>
    </div>
  )}

  {/* 🔑 FIX : Aligné sur dashboard_view_alerts de votre structure unifiée */}
  {canAccess('dashboard_view_alerts', 'GESTOCK') && (
    <div className="stat-card-3d">
      <div className="stat-icon-wrapper red-icon">
        <i className="fas fa-exclamation-triangle"></i>
      </div>
      <div className="stat-content">
        <span className="stat-label-3d">{t('dashboard.stats.alerts', 'Alertes Stock')}</span>
        <span className="stat-value-3d-highlight red-text">{showStats ? stats.stockAlerts : "••••••"}</span>
      </div>
    </div>
  )}

  {/* 🔑 FIX : Aligné sur dashboard_view_sales_day de votre structure unifiée */}
  {canAccess('dashboard_view_sales_day', 'GESTOCK') && (
    <div className="stat-card-3d">
      <div className="stat-icon-wrapper green-icon">
        <i className="fas fa-shopping-cart"></i>
      </div>
      <div className="stat-content">
        <span className="stat-label-3d">{t('dashboard.stats.sales_day', 'Ventes Jour')}</span>
        <span className="stat-value-3d">{showStats ? formatValue(stats.dailySales) : "••••••"}</span>
      </div>
    </div>
  )}

  {/* 🔑 FIX : Aligné sur dashboard_view_credit (Créances/Avoirs) de votre structure unifiée */}
  {canAccess('dashboard_view_credit', 'GESTOCK') && (
    <div className="stat-card-3d">
      <div className="stat-icon-wrapper orange-icon">
        <i className="fas fa-undo"></i>
      </div>
      <div className="stat-content">
        <span className="stat-label-3d">{t('dashboard.stats.returns', 'Retours / Avoirs')}</span>
        <span className="stat-value-3d">{showStats ? formatValue(stats.totalAvoirs) : "••••••"}</span>
      </div>
    </div>
  )}
</section>
{/* ====================================================== */}
  {/* SECTION SÉCURISÉE ET LOCALISÉE DES RACCOURCIS FAVORIS    */}
  {/* ====================================================== */}
  <section className="quick-actions" style={{ marginTop: '30px' }}>
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
    <h2 className="section-title" style={{ fontSize: '1.1rem', fontWeight: '600', color: 'var(--text-main)', margin: 0 }}>
      {t('dashboard.shortcuts.title', 'Mes Raccourcis')}
    </h2>
    
    <div style={{ display: 'flex', gap: '10px' }}>
      {isEditingShortcuts && (
        <button 
          onClick={() => setIsEditingShortcuts(false)}
          className="btn-cancel"
          style={{ 
            padding: '8px 16px', 
            borderRadius: '8px', 
            border: '1px solid var(--border-color)',
            backgroundColor: '#ffffff',
            color: 'var(--text-secondary)',
            fontSize: '13px',
            fontWeight: '500',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '3px 3px 8px rgba(163, 177, 198, 0.15)'
          }}
        >
          ✖️ {t('dashboard.shortcuts.cancel', 'Annuler')}
        </button>
      )}
      <button 
        onClick={isEditingShortcuts ? handleSaveShortcuts : () => setIsEditingShortcuts(true)}
        className="btn-modifier"
        style={{ 
          padding: '8px 16px', 
          borderRadius: '8px', 
          border: 'none',
          backgroundColor: isEditingShortcuts ? '#4318ff' : '#ffffff', 
          color: isEditingShortcuts ? '#fff' : '#1e293b',
          fontSize: '13px',
          fontWeight: '600',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          transition: 'all 0.2s ease',
          boxShadow: isEditingShortcuts ? '0 4px 14px rgba(67, 24, 255, 0.4)' : '3px 3px 8px rgba(163, 177, 198, 0.2)'
        }}
      >
        {isEditingShortcuts ? t('dashboard.shortcuts.save', '💾 Enregistrer') : t('dashboard.shortcuts.configure', '⚙️ Configurer')}
      </button>
    </div>
  </div>

  <div className="quick-grid" style={{ 
    display: 'grid', 
    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', 
    gap: '15px',
    padding: isEditingShortcuts ? '15px' : '0',
    backgroundColor: isEditingShortcuts ? 'rgba(163, 177, 198, 0.05)' : 'transparent',
    borderRadius: '16px',
    border: isEditingShortcuts ? '1px dashed rgba(163, 177, 198, 0.4)' : 'none'
  }}>
    {isEditingShortcuts ? (
      // 🛡️ MODE ÉDITION SÉCURISÉ & TRADUIT DYNAMIQUE MULTI-LANGUES (STYLE 3D BLANC)
      ALL_POSSIBLE_SHORTCUTS
        .filter(a => canAccess(a.id, a.module)) 
        .map(action =>  {
          const isActive = myShortcuts.includes(action.id);
          return (
            <div 
              key={action.id} 
              className={`action-tile ${isActive ? 'active' : ''}`}
              onClick={() => {
                setMyShortcuts(prev => 
                  isActive ? prev.filter(id => id !== action.id) : [...prev, action.id]
                );
              }}
              style={{ 
                position: 'relative',
                cursor: 'pointer', 
                border: isActive ? '2px solid #4318ff' : '1px solid rgba(0, 0, 0, 0.03)',
                backgroundColor: '#ffffff',
                opacity: isActive ? 1 : 0.5, 
                padding: '15px',
                borderRadius: '14px',
                textAlign: 'center',
                transition: 'all 0.2s ease',
                boxShadow: isActive 
                  ? '0 10px 20px rgba(67, 24, 255, 0.12)' 
                  : '4px 4px 10px rgba(163, 177, 198, 0.2), -4px -4px 10px rgba(255, 255, 255, 0.8)'
              }}
            >
              {isActive && (
                <div style={{ 
                  position: 'absolute', top: '-8px', right: '-8px', 
                  background: '#4318ff', color: 'white', borderRadius: '50%', 
                  width: '20px', height: '20px', fontSize: '12px', 
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 0 8px rgba(67, 24, 255, 0.6)',
                  fontWeight: '800',
                  zIndex: 2
                }}>
                  ✓
                </div>
              )}
              <div className={`icon-c ${action.color}`} style={{ margin: '0 auto 8px' }}>
                {action.icon}
              </div>
              <span style={{ fontSize: '12.5px', fontWeight: '600', color: '#1e293b' }}>
                {t(`dashboard.shortcuts.${action.id}`, action.label)}
              </span>
            </div>
          );
        })
    ) : (

   // 🛡️ MODE AFFICHAGE SÉCURISÉ & TRADUIT DYNAMIQUE MULTI-LANGUES (STYLE 3D BLANC)
      ALL_POSSIBLE_SHORTCUTS
        .filter(a => myShortcuts.includes(a.id) && canAccess(a.id, a.module))
        .map(action => (
          <div 
            key={action.id} 
            className="action-tile" 
            onClick={() => smartNavigate(action.path)}
            style={{
              padding: '20px',
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              boxShadow: '6px 6px 16px rgba(163, 177, 198, 0.35), -6px -6px 16px rgba(255, 255, 255, 0.8)',
              textAlign: 'center',
              cursor: 'pointer',
              border: '1px solid rgba(0, 0, 0, 0.02)',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-3px)';
              e.currentTarget.style.boxShadow = '8px 8px 20px rgba(163, 177, 198, 0.45), -8px -8px 20px rgba(255, 255, 255, 0.9)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '6px 6px 16px rgba(163, 177, 198, 0.35), -6px -6px 16px rgba(255, 255, 255, 0.8)';
            }}
          >
            <div className={`icon-c ${action.color}`} style={{ margin: '0 auto 10px' }}>
              {action.icon}
            </div>
            <span style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b' }}>
              {t(`dashboard.shortcuts.${action.id}`, action.label)}
            </span>
          </div>
        ))
    )}
  </div>
</section>

</div>
</main>
</div>
);
};

export default Dashboard;
