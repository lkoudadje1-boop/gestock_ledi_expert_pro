import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next'; // 🌐 Intégration pour la fusion avec vos fichiers JSON
import { 
  LayoutDashboard, Package, Users, LogOut, ArrowLeft, Tag, List, 
  Settings2, ShieldCheck, Truck, History, ShoppingCart, 
  UserRound, Wallet, ClipboardCheck, FileText, BarChart3, 
  CreditCard, Search, Activity, Building2, 
  PlusCircle, Briefcase, Layers, PieChart, RefreshCcw,
  Edit3, MapPin, ArrowRightLeft, TrendingUp, ChevronUp, ChevronDown 
} from 'lucide-react';
import { getUserPermissions } from '../utils/permissions_utils';

const Sidebar = () => {
  const { t } = useTranslation(); // 🌐 Initialisation de la fonction t() pour la traduction
  const navigate = useNavigate();
  const location = useLocation();
  const path = location.pathname;
  const scrollRef = useRef(null);

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const companyName = localStorage.getItem('companyName') || 'Ledi Expert Pro';
  const perms = getUserPermissions();
  const isAdmin = user.role === 'admin' || user.role === 'super_admin';

  // Réactivité de la Sidebar aux changements d'états de la licence machine [mtb7pq]
   // Réactivité de la Sidebar aux changements d'états de la licence machine [mtb7pq]
  // ✅ INITIALISATION : On déclare d'office la clé valid à false par défaut
  const [licenseData, setLicenseData] = useState({ allowed_modules: [], valid: false });

  useEffect(() => {
    const raw = localStorage.getItem('licenseStatus') || localStorage.getItem('licenseData');
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        let mods = parsed.allowed_modules || [];
        
        // Nettoyage et homogénéisation stricte des formats de données de modules
        if (typeof mods === 'string') {
          mods = mods.replace(/[\[\]"']/g, '').split(',').map(m => m.trim().toUpperCase());
        } else if (Array.isArray(mods)) {
          mods = mods.map(m => String(m).replace(/[\[\]"']/g, '').trim().toUpperCase());
        }
        
        // 🚀 CORRECTION CHIRURGICALE : On extrait l'état réel et on préserve la clé "valid" !
        // On accepte 'valid', 'isActive', ou 'success' selon la déclinaison renvoyée par SQLite
        const isLicenseValid = parsed.valid === true || 
                              parsed.valid === 'true' || 
                              parsed.valid === 1 || 
                              parsed.isActive === 1 ||
                              parsed.success === true;

        setLicenseData({ 
          allowed_modules: mods,
          valid: isLicenseValid // Rend enfin la clé exploitable par le badge HTML
        });
      } catch (e) {
        console.error("❌ Erreur lecture stockage local licence", e);
      }
    }
  }, [path]);


  // 🛡️ CORRECTION DE SÉCURITÉ CRITIQUE DE LA FONCTION CANSHOW [mtb7pq]
  const canShow = React.useCallback((permKey, moduleKey) => {
    if (!moduleKey) return false;
    
    const mods = (licenseData?.allowed_modules || []).map(m => m.toUpperCase());
    const target = moduleKey.toUpperCase();

    // Seul le module technique 'SYSTEM' (activation/licence) est accessible d'office.
    // GESTOCK et COMPTA_BASE doivent IMPÉRATIVEMENT faire partie du fichier signé.
    const isModuleLicensed = mods.includes(target) || 
                             mods.includes('FULL_ACCESS') || 
                             target === 'SYSTEM';
    
    if (!isModuleLicensed) return false;

    // Si la licence machine valide le module, on vérifie l'accès de l'employé (RBAC)
    const hasPerm = isAdmin || (perms && perms[permKey]);
    return !!hasPerm;
  }, [isAdmin, perms, licenseData]);

  // --- DÉTECTIONS DES RECOUPEMENTS DE SECTIONS (Inchangées) ---
  const isVenteSection = path.startsWith('/pos') || path.startsWith('/ventes');
  const isArticleSection = path.startsWith('/admin/articles') || path.startsWith('/articles/history');
  const isLogistiqueSection = path.startsWith('/logistique');
  const isRHSection = path.startsWith('/admin/staff') || path.startsWith('/admin/users') || path.startsWith('/rh');
  const isSettingsSection = path.startsWith('/admin/settings') || path.startsWith('/audit') || path.startsWith('/params') || path.startsWith('/admin/licence');
  const isComptaSection = path.startsWith('/compta');
  const isComptaSectionOps = path.startsWith('/compta/gen') || path.startsWith('/compta/brouillon') || path.startsWith('/compta/validation');
   const isEmballageSection = path.startsWith('/emballage');
  const isAnalytiqueSection = path.startsWith('/analytique');

  // --- PERSISTANCE DU SCROLL SIDEBAR (Inchangée) ---
  // --- PERSISTANCE DU SCROLL SIDEBAR (CORRIGÉE & STABILISÉE) ---
  useEffect(() => {
    const savedScroll = sessionStorage.getItem('sidebar-scroll');
    if (savedScroll && scrollRef.current) {
      // 🌟 Un micro-délai asynchrone attend le calcul réel de la hauteur du menu
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = parseInt(savedScroll, 10);
        }
      });
    }
  }, [path]); // Reste à l'écoute des changements de routes sans sauter vers le haut

  const handleScroll = () => {
    if (scrollRef.current) {
      sessionStorage.setItem('sidebar-scroll', scrollRef.current.scrollTop);
    }
  };


  const scrollManual = (direction) => {
    if (scrollRef.current) {
      const amount = direction === 'up' ? -200 : 200;
      scrollRef.current.scrollBy({ top: amount, behavior: 'smooth' });
    }
  };

  const [isPushing, setIsPushing] = React.useState(false);
  const [isRestoring, setIsRestoring] = React.useState(false);

  const handleManualPush = async () => {
    setIsPushing(true);
    try { console.log("Sauvegarde en cours..."); } finally { setIsPushing(false); }
  };

  const handleCloudRestore = async () => {
    setIsRestoring(true);
    try { console.log("Restauration en cours..."); } finally { setIsRestoring(false); }
  };

  const goTo = (route) => navigate(route);
  const activeClass = (route) => (path === route ? 'active' : '');

  // Conserve vos classes et styles initiaux exacts
  const BackBtn = () => (
    <button className="nav-item back-button" onClick={() => goTo('/admin/dashboard')} 
      style={{color: '#6366f1', borderBottom: '1px solid #f1f5f9', marginBottom: '15px', borderRadius: '0', width: '100%', background: 'transparent'}}>
      <div className="nav-item-content">
        <ArrowLeft size={18} />
        <span style={{fontWeight: 'bold', fontSize: '11px'}}>
          {t('sidebar.back_to_menu', 'RETOUR AU MENU')}
        </span>
      </div>
    </button>
  );

  // ======================================================
  // 1. MODULE : GESTOCK - GESTIONNAIRE ARTICLES
  // ======================================================
  const renderArticleMenu = () => (
    <>
      <BackBtn />
      <div className="menu-group-label">{t('sidebar.article_manager', 'Gestionnaire Articles')}</div>
      {canShow('art_view', 'GESTOCK') && (
        <button className={`nav-item ${activeClass('/admin/articles/categories')}`} onClick={() => goTo('/admin/articles/categories')}>
          <span>{t('sidebar.categories_groups', 'Familles Catégories & Groupes')}</span>
        </button>
      )}
      {canShow('art_view', 'GESTOCK') && (
        <button className={`nav-item ${activeClass('/admin/articles')}`} onClick={() => goTo('/admin/articles')}>
          <span>{t('sidebar.add_article', 'Ajouter & Modifier un Article')}</span>
        </button>
      )}
      {canShow('art_view', 'GESTOCK') && (
        <button className={`nav-item ${activeClass('/admin/articles/list')}`} onClick={() => goTo('/admin/articles/list')}>
          <span>{t('sidebar.articles_list', 'Liste des Produits')}</span>
        </button>
      )}
      {canShow('art_view', 'GESTOCK') && (
        <button className={`nav-item ${activeClass('/admin/articles/unites')}`} onClick={() => goTo('/admin/articles/unites')}>
          <span>{t('sidebar.create_article', 'Ajouter Conditionnement')}</span>
        </button>
      )}
         {canShow('art_gl', 'GESTOCK') && (
        <button className={`nav-item ${activeClass('/admin/articles/history')}`} onClick={() => goTo('/admin/articles/history')}>
          <span>{t('sidebar.article_ledger', 'Grand livre Article')}</span>
        </button>
      )}
      {canShow('art_edit', 'GESTOCK') && (
        <button className={`nav-item ${activeClass('/admin/articles/tables')}`} onClick={() => goTo('/admin/articles/tables')}>
          <span>{t('sidebar.tables_management', 'Gestion des Tables')}</span>
        </button>
      )}
   

      

    
    </>
  );

    // ======================================================
  // 2. MODULE : GESTOCK - EMBALLAGE
  // ======================================================
   const renderEmballageMenu = () => (
    <>
<BackBtn />   

{canShow('emb_create', 'GESTOCK') && (<button className={`nav-item ${activeClass('/emballage/create')}`} onClick={() => goTo('/emballage/create')}>{t('sidebar.add_emballage', 'Création Emballage')}</button>)}
{canShow('emb_achat', 'GESTOCK') && (<button className={`nav-item ${activeClass('/emballage/achat')}`} onClick={() => goTo('/emballage/achat')}>{t('sidebar.emballage_Achat', 'Achat Emballages')}</button>)}
{canShow('emb_regles', 'GESTOCK') && (<button className={`nav-item ${activeClass('/emballage/regles-consignation')}`} onClick={() => goTo('/emballage/regles-consignation')}>{t('sidebar.regles_consignation', 'Configuration des Flux')}</button>)}
{canShow('emb_consignation', 'GESTOCK') && (<button className={`nav-item ${activeClass('/emballages/consignation')}`} onClick={() => goTo('/emballages/consignation')}>{t('sidebar.emballage_consignation', 'Consignation Emballages')}</button>)} 

{canShow('emb_history', 'GESTOCK') && (<button className={`nav-item ${activeClass('/emballage/historique-flux-emballage')}`} onClick={() => goTo('/emballage/historique-flux-emballage')}>{t('sidebar.Embalage_flux_historique', 'Historique des inventaires')}</button>)}         
{canShow('emb_inventory', 'GESTOCK') && (<button className={`nav-item ${activeClass('/emballages/suivi')}`} onClick={() => goTo('/emballages/suivi')}>{t('sidebar.emballage_inventory_suivi', 'Suivi & Lancement Inv.')}</button>)}
          


    </>
  );
  // ======================================================
  // 2. MODULE : GESTOCK - TERMINAL DE VENTE POS
  // ======================================================
  const renderVenteMenu = () => (
    <>
      <BackBtn />
      <div className="menu-group-label">{t('sidebar.pos_terminal', 'Terminal de Vente POS')}</div>
      {canShow('vente_create', 'GESTOCK') && (
        <button className={`nav-item ${activeClass('/pos')}`} onClick={() => goTo('/pos')}>
          <span>{t('sidebar.counter_sale', 'Vente au Comptoir')}</span>
        </button>
      )}
      {canShow('pos_add', 'GESTOCK') && (
        <button className={`nav-item ${activeClass('/pos/add')}`} onClick={() => goTo('/pos/add')}>
          <span>{t('sidebar.cart_sale', 'Vente Au panier')}</span>
        </button>
      )}
      {canShow('pos_validate', 'GESTOCK') && (
        <button className={`nav-item ${activeClass('/pos/validate')}`} onClick={() => goTo('/pos/validate')}>
          <span>{t('sidebar.validate_cart', 'Valider un Panier')}</span>
        </button>
      )}
      {canShow('pos_invoice', 'GESTOCK') && (
        <button className={`nav-item ${activeClass('/pos/invoice')}`} onClick={() => goTo('/pos/invoice')}>
          <span>{t('sidebar.standardized_invoice', 'Vente Normalisée')}</span>
        </button>
      )}


   {canShow('pos_vente_grille', 'GESTOCK') && (
        <button className={`nav-item ${activeClass('/pos/commerciale-clients')}`} onClick={() => goTo('/pos/commerciale-clients')}>
          <span>{t('sidebar.standardized_grille', 'Commerciale')}</span>
        </button>
      )}
      {canShow('pos_vente_liste', 'GESTOCK') && (
        <button className={`nav-item ${activeClass('/pos/tourneesCommerciales-clients')}`} onClick={() => goTo('/pos/tourneesCommerciales-clients')}>
          <span>{t('sidebar.standardized_tournees', 'Liste Commerciale')}</span>
        </button>
      )}


      {canShow('pos_close', 'GESTOCK') && (
        <button className={`nav-item ${activeClass('/pos/close')}`} onClick={() => goTo('/pos/close')}>
          <span>{t('sidebar.shift_closing', 'Clôture de la Caisse')}</span>
        </button>
      )} 
      {canShow('pos_history_cloture', 'GESTOCK') && (
        <button className={`nav-item ${activeClass('/pos/historique-cloture')}`} onClick={() => goTo('/pos/historique-cloture')}>
          <span>{t('sidebar.closing_history', 'Historique des clôtures')}</span>
        </button>
      )}
      {canShow('vente_view', 'GESTOCK') && (
        <button className={`nav-item ${activeClass('/pos/history')}`} onClick={() => goTo('/pos/history')}>
          <span>{t('sidebar.sales_history', 'Historique des ventes')}</span>
        </button>
      )}

 {canShow('pos_details', 'GESTOCK') && (
        <button className={`nav-item ${activeClass('/pos-details')}`} onClick={() => goTo('/pos-details')}>
          <span>{t('sidebar.detailed_sales', 'Rapport des ventes')}</span>
        </button>
      )}





      {canShow('pos_jr', 'GESTOCK') && (
        <button className={`nav-item ${activeClass('/pos/paiements/methodes')}`} onClick={() => goTo('/pos/paiements/methodes')}>
          <span>{t('sidebar.add_payment_method', 'Ajouter un Moyens de Paiement')}</span>
        </button>
      )}
      {canShow('vente_view', 'GESTOCK') && (
        <button className={`nav-item ${activeClass('/ventes/clients')}`} onClick={() => goTo('/ventes/clients')}>
          <span>{t('sidebar.register_customer', 'Enregistrer un Client')}</span>
        </button>
      )}
      {canShow('vente_view', 'GESTOCK') && (
        <button className={`nav-item ${activeClass('/pos/creances-clients')}`} onClick={() => goTo('/pos/creances-clients')}>
          <span>{t('sidebar.customer_debts', 'Suivi des créances')}</span>
        </button>
      )}
  
    </>
  );

  // ======================================================
  // 3. ANALYTIQUE & PRODUCTION (RESTE INCHANGÉ / RESERVÉ)
  // ======================================================
  const renderAnalytiqueMenu = () => (
    <>
      <BackBtn />
    </>
  );

  // ======================================================
  // 4. MODULE : GESTOCK - ACHAT & LOGISTIQUE
  // ======================================================
  const renderLogistiqueMenu = () => (
    <>
      <BackBtn />
      <div className="menu-group-label">{t('sidebar.purchasing_logistics', 'Achat & Logistique')}</div>
      {canShow('log_suppliers', 'GESTOCK') && (
        <button className={`nav-item ${activeClass('/logistique/fournisseurs')}`} onClick={() => goTo('/logistique/fournisseurs')}>
          {t('sidebar.register_supplier', 'Enregistrer un Fournisseur')}
        </button>
      )}
      {canShow('log_buy', 'GESTOCK') && (
        <button className={`nav-item ${activeClass('/logistique/achat')}`} onClick={() => goTo('/logistique/achat')}>
          {t('sidebar.make_purchase', 'Effectuer un Achat')}
        </button>
      )}
      {canShow('log_history', 'GESTOCK') && (
        <button className={`nav-item ${activeClass('/logistique/hist-achats')}`} onClick={() => goTo('/logistique/hist-achats')}>
          {t('sidebar.purchase_history', 'Historique Achats')}
        </button>
      )}
      {canShow('log_inventory', 'GESTOCK') && (
        <button className={`nav-item ${activeClass('/logistique/inventaire')}`} onClick={() => goTo('/logistique/inventaire')}>
          {t('sidebar.inventory', 'Inventaire')}
        </button>
      )}
      {canShow('log_inventory_hist', 'GESTOCK') && (
        <button className={`nav-item ${activeClass('/logistique/historique-inventaire')}`} onClick={() => goTo('/logistique/historique-inventaire')}>
          {t('sidebar.inventory_history', 'Hist. Inventaires')}
        </button>
      )}
       {canShow('log_bon_commande', 'GESTOCK') && (<button className={`nav-item ${activeClass('/logistique/bon-commande')}`} onClick={() => goTo('/logistique/bon-commande')}>{t('sidebar.make_order', 'Passer une Commande')}</button>)}
   {canShow('log_historique_bon', 'GESTOCK') && (<button className={`nav-item ${activeClass('/logistique/historique-bon')}`} onClick={() => goTo('/logistique/historique-bon')}>{t('sidebar.stock_adjustments_history', 'Historique des Commandes')}</button>)}


   {canShow('log_ajustement', 'GESTOCK') && (<button className={`nav-item ${activeClass('/logistique/ajustements')}`} onClick={() => goTo('/logistique/ajustements')}>{t('sidebar.stock_adjustments', 'Régularisation du Stock')}</button>)}
   {canShow('log_ajustement_hist', 'GESTOCK') && (<button className={`nav-item ${activeClass('/logistique/historique-ajustements')}`} onClick={() => goTo('/logistique/historique-ajustements')}>{t('sidebar.order_history', 'Historique des Régularisations')}</button>)}



   
      {canShow('log_suppliers', 'GESTOCK') && (
        <button className={`nav-item ${activeClass('/logistique/dettes-fournisseurs')}`} onClick={() => goTo('/logistique/dettes-fournisseurs')}>
          {t('sidebar.supplier_debts', 'Suivi des dettes')}
        </button>
      )}
    </>
  );

  // ======================================================
  // 5. MODULE : SYSTEM - GESTION UTILISATEURS
  // ======================================================
  const renderRHMenu = () => (                           
    <>
      <BackBtn />
      <div className="menu-group-label">{t('sidebar.user_management', "Gestion d'utilisateurs")}</div>      
      
      {(isAdmin || canShow('menu_users_access', 'SYSTEM')) && (
        <button className={`nav-item ${activeClass('/admin/users')}`} onClick={() => goTo('/admin/users')}>
          {t('sidebar.user_accounts', 'Utilisateurs & Accès')}
        </button>
      )}

      {(isAdmin || canShow('staff_manage', 'SYSTEM')) && (
        <button className={`nav-item ${activeClass('/admin/staff')}`} onClick={() => goTo('/admin/staff')}>
          {t('sidebar.staff_management', 'Gestion du Staff')}
        </button>
      )}
    </>
  );

  // ======================================================
  // 6. MODULE : COMPTA_BASE - GESTION COMPTABLE INTEGRÉE
  // ======================================================
  const renderComptaMenu = () => (
    <>
      <BackBtn />
      
      {/* 6.1 EN-TÊTE & CONFIGURATION COMPTABLE */}
      {canShow('compta', 'COMPTA_BASE') && (
        <>
          <div className="menu-group-label" style={{ marginTop: '15px' }}>{t('sidebar.general_accounting', 'COMPTABILITÉ GÉNÉRALE')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {canShow('compta_ex', 'COMPTA_BASE') && <button className={`nav-item ${activeClass('/compta/exercices')}`} onClick={() => goTo('/compta/exercices')}>{t('sidebar.fiscal_years', 'Exercices Comptables')}</button>}
            {canShow('compta_jr', 'COMPTA_BASE') && <button className={`nav-item ${activeClass('/compta/journaux')}`} onClick={() => goTo('/compta/journaux')}>{t('sidebar.journal_codes', 'Codes Journaux')}</button>}
            {canShow('compta_plan', 'COMPTA_BASE') && <button className={`nav-item ${activeClass('/compta/plan')}`} onClick={() => goTo('/compta/plan')}>{t('sidebar.chart_of_accounts_btn', 'Plan Comptable')}</button>}
            {canShow('analytique_plan', 'COMPTA_BASE') && <button className={`nav-item ${activeClass('/compta/Analytique')}`} onClick={() => goTo('/compta/Analytique')}>{t('sidebar.analytic_plan_btn', 'Plan Analytique')}</button>}
            {canShow('analytique_plan', 'COMPTA_BASE') && <button className={`nav-item ${activeClass('/compta/repartitions/config')}`} onClick={() => goTo('/compta/repartitions/config')}>{t('sidebar.analytic_config', 'Config Analytique')}</button>}
            {canShow('compta_tiers', 'COMPTA_BASE') && <button className={`nav-item ${activeClass('/compta/tiers')}`} onClick={() => goTo('/compta/tiers')}>{t('sidebar.third_party_plan', 'Plan des Tiers')}</button>}
            {canShow('compta_brouillard_config', 'COMPTA_BASE') && <button className={`nav-item ${activeClass('/compta/config-ecritures-auto')}`} onClick={() => goTo('/compta/config-ecritures-auto')}>{t('sidebar.auto_entries_settings', 'Paramètres Écritures Auto')}</button>}
          </div> 
        </>
      )}


      {/* 6.2 OPERATIONS DE SAISIES */}
      {canShow('compta', 'COMPTA_BASE') && (
        <>
          <div className="menu-group-label" style={{ marginTop: '15px' }}>{t('sidebar.daily_entry_section', 'OPERATIONS DE SAISIES')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {canShow('compta_brouillon', 'COMPTA_BASE') && <button className={`nav-item ${activeClass('/compta/brouillon-selection')}`} onClick={() => goTo('/compta/brouillon-selection')}>{t('sidebar.assistant_entry_btn', 'Journal Brouillon')}</button>}
            {canShow('compta_val', 'COMPTA_BASE') && <button className={`nav-item ${activeClass('/compta/validation')}`} onClick={() => goTo('/compta/validation')}>{t('sidebar.drafts_validation', 'Validation Brouillons')}</button>}
            {canShow('compta_gen', 'COMPTA_BASE') && <button className={`nav-item ${activeClass('/compta/gen')}`} onClick={() => goTo('/compta/gen')}>{t('sidebar.daily_entry_btn', 'Saisie Journalière')}</button>}
            {canShow('compta_gen', 'COMPTA_BASE') && <button className={`nav-item ${activeClass('/compta/treso/ventilation')}`} onClick={() => goTo('/compta/treso/ventilation')}>{t('sidebar.ledger_ventilation', 'Ventilation du Brouillard')}</button>}
            {canShow('compta_cloture', 'COMPTA_BASE') && <button className={`nav-item ${activeClass('/compta/cloture-journaliere')}`} onClick={() => goTo('/compta/cloture-journaliere')}>{t('sidebar.daily_closing_btn', 'Clôture Journalière')}</button>}
          </div> 
        </>
      )}
  {/* 6.3 STRUCTURE DE TRÉSORERIE */}
  {canShow('compta', 'COMPTA_BASE') && (
    <>
      <div className="menu-group-label" style={{ marginTop: '15px' }}>{t('sidebar.treasury', 'TRÉSORERIE')}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {canShow('treso_saisie_hub', 'COMPTA_BASE') && <button className={`nav-item ${activeClass('/compta/treso/choix-brouillard')}`} onClick={() => goTo('/compta/treso/choix-brouillard')}>{t('sidebar.cash_drafts', 'Brouillard de saisie')}</button>}
        {canShow('compta_val', 'COMPTA_BASE') && <button className={`nav-item ${activeClass('/compta/treso/validation')}`} onClick={() => goTo('/compta/treso/validation')}>{t('sidebar.expense_validation', 'Valider une Dépense')}</button>}
        {canShow('compta_brouillard_config', 'COMPTA_BASE') && <button className={`nav-item ${activeClass('/compta/type-brouillards')}`} onClick={() => goTo('/compta/type-brouillards')}>{t('sidebar.draft_config', 'Configuration du Brouillard')}</button>}
      </div> 
    </>
  )}

  {/* 6.4 ÉTATS FINANCIERS & RAPPORTS */}
  {canShow('compta', 'COMPTA_BASE') && (
    <>
      <div className="menu-group-label" style={{ marginTop: '15px' }}>{t('sidebar.reports_statements', 'RAPPORTS & ÉTATS')}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {canShow('rpt_bal_comptes', 'COMPTA_BASE') && <button className={`nav-item ${activeClass('/compta/rapports/balance-comptes')}`} onClick={() => goTo('/compta/rapports/balance-comptes')}>{t('sidebar.accounts_balance', 'Balance des comptes')}</button>}
        {canShow('rpt_bal_tiers', 'COMPTA_BASE') && <button className={`nav-item ${activeClass('/compta/rapports/balance-tiers')}`} onClick={() => goTo('/compta/rapports/balance-tiers')}>{t('sidebar.third_party_balance_btn', 'Balance des tiers')}</button>}
        {canShow('rpt_bal_agee', 'COMPTA_BASE') && <button className={`nav-item ${activeClass('/compta/rapports/balance-agee')}`} onClick={() => goTo('/compta/rapports/balance-agee')}>{t('sidebar.aged_balance', 'Balance âgée')}</button>}
        {canShow('rpt_bal_ana', 'COMPTA_BASE') && <button className={`nav-item ${activeClass('/compta/rapports/balance-analytique')}`} onClick={() => goTo('/compta/rapports/balance-analytique')}>{t('sidebar.analytic_balance', 'Balance analytique')}</button>}
        
        <hr style={{ border: '0.1px solid #ced4db', margin: '4px 0', opacity: 0.3 }} />
        {canShow('rpt_gl_comptes', 'COMPTA_BASE') && <button className={`nav-item ${activeClass('/compta/rapports/grand-livre')}`} onClick={() => goTo('/compta/rapports/grand-livre')}>{t('sidebar.general_ledger_btn', 'Grand livre des comptes')}</button>}
        {canShow('rpt_gl_tiers', 'COMPTA_BASE') && <button className={`nav-item ${activeClass('/compta/rapports/grand-livre-tiers')}`} onClick={() => goTo('/compta/rapports/grand-livre-tiers')}>{t('sidebar.third_party_ledger_btn', 'Grand livre des tiers')}</button>}
        {canShow('rpt_gl_ana', 'COMPTA_BASE') && <button className={`nav-item ${activeClass('/compta/rapports/grand-livre-analytique')}`} onClick={() => goTo('/compta/rapports/grand-livre-analytique')}>{t('sidebar.analytic_ledger_btn', 'Grand livre analytique')}</button>}

        <hr style={{ border: '0.1px solid #ced6e2', margin: '4px 0', opacity: 0.3 }} />
        {canShow('rpt_bilan', 'COMPTA_BASE') && <button className={`nav-item ${activeClass('/compta/rapports/bilan')}`} onClick={() => goTo('/compta/rapports/bilan')}>{t('sidebar.balance_sheet_btn', 'Bilan')}</button>}
        {canShow('rpt_resultat', 'COMPTA_BASE') && <button className={`nav-item ${activeClass('/compta/rapports/resultat')}`} onClick={() => goTo('/compta/rapports/resultat')}>{t('sidebar.income_statement', 'Compte de résultat')}</button>}
        {canShow('rpt_tft', 'COMPTA_BASE') && <button className={`nav-item ${activeClass('/compta/rapports/tft')}`} onClick={() => goTo('/compta/rapports/tft')}>{t('sidebar.cash_flow_statement', 'TFT (Flux Tréso)')}</button>}
        {canShow('etats_recap', 'COMPTA_BASE') && <button className={`nav-item ${activeClass('/compta/rapports/etats-financiers')}`} onClick={() => goTo('/compta/rapports/etats-financiers')}>{t('sidebar.financial_statements_recap', 'États Financiers Recap')}</button>}
      </div>
    </>
  )}
</>
);


const renderSettingsMenu = () => (
  <>
    <BackBtn />
    <div className="menu-group-label">{t('sidebar.company_settings', 'Paramètres de la Société')}</div>
    
    {/* Informations Société */}
    {canShow('edit_settings', 'SYSTEM') && (<button className={`nav-item ${activeClass('/admin/settings')}`} onClick={() => goTo('/admin/settings')}><div className="nav-item-content"><Settings2 size={20} /><span>{t('sidebar.company_info', 'Informations Société')}</span></div></button>)}
    {canShow('view_licence', 'SYSTEM') && (<button className={`nav-item ${activeClass('/admin/licence')}`} onClick={() => goTo('/admin/licence')}><div className="nav-item-content"><ShieldCheck size={20} /><span>{t('sidebar.my_license', 'Ma Licence')}</span></div></button>)}
    {canShow('view_audit', 'SYSTEM') && (<button className={`nav-item ${activeClass('/audit')}`} onClick={() => goTo('/audit')}><div className="nav-item-content"><Activity size={20} /><span>{t('sidebar.audit_log', 'Journal des actions')}</span></div></button>)}
    {canShow('action_cloud_push', 'SYSTEM') && (<button className="nav-item" onClick={handleManualPush} disabled={isPushing}><div className="nav-item-content">{isPushing ? <RefreshCcw size={20} className="animate-spin" /> : <TrendingUp size={20} color="#2563eb" />}<span style={{ color: '#2563eb', fontWeight: 'bold' }}>{t('sidebar.cloud_backup', 'Sauvegarder vers Cloud')}</span></div></button>)}
    {canShow('action_cloud_restore', 'SYSTEM') && (<button className="nav-item" onClick={handleCloudRestore} disabled={isRestoring}><div className="nav-item-content">{isRestoring ? <RefreshCcw size={20} className="animate-spin" /> : <RefreshCcw size={20} color="#c2410c" />}<span style={{ color: '#c2410c', fontWeight: 'bold' }}>{t('sidebar.cloud_restore', 'Restauration Cloud')}</span></div></button>)}
  </>
);

const renderMainMenu = () => (
  <>
    <div className="menu-group-label">{t('sidebar.dashboard_upper', 'TABLEAU DE BORD')}</div>
    {perms.edit_settings && (<button className={`nav-item ${activeClass('/admin/dashboard')}`} onClick={() => goTo('/admin/dashboard')}><div className="nav-item-content"><LayoutDashboard size={20}/> <span>{t('sidebar.dashboard', 'Dashboard')}</span></div></button>)}
  </>
);

 const handleFermerSessionEtRetour = () => {
    // 1. Suppression totale des caches, jetons et données utilisateurs SQLite
    localStorage.clear();
    sessionStorage.clear();

    // 2. Déconnexion optionnelle du socket s'il est utilisé dans votre fichier
    if (typeof socket !== 'undefined' && socket && typeof socket.disconnect === 'function') {
        socket.disconnect();
    }

    // 3. Redirection forcée vers l'écran de connexion / réinitialisation de l'application
    window.location.href = '/login';
  };

// ✅ 2. VOTRE MOTEUR DE DÉCISION CI-DESSOUS FONCTIONNERA ENFIN :
const renderCurrentMenu = () => {
  if (isArticleSection) return renderArticleMenu();
  if (isVenteSection) return renderVenteMenu();
  if (isLogistiqueSection) return renderLogistiqueMenu();
  if (isAnalytiqueSection) return renderAnalytiqueMenu();
  if (isComptaSection) return renderComptaMenu();
  if (isRHSection) return renderRHMenu();
   if (isEmballageSection) return renderEmballageMenu();
  if (isSettingsSection) return renderSettingsMenu();
  return renderMainMenu(); 
};

  return (
    <aside className="sidebar" style={{ position: 'relative' }}>
      {/* INJECTION DU STYLE CSS POUR LA BARRE ET LES FLÈCHES */}
      <style>{scrollbarStyles}</style>

      <div className="sidebar-header">
        <div className="logo-m">{companyName.charAt(0).toUpperCase()}</div>
        <div className="company-info">
          <span className="company-name">{companyName}</span>
          
          {/* 🛡️ BADGE DE LICENCE MULTILINGUE CORRIGÉ ET STABILISÉ */}
          <span 
            className="status-badge" 
            style={{
              // ✅ VERROU DE SÉCURITÉ : On force l'évaluation permissive pour éviter le flash rouge au chargement
              backgroundColor: (licenseData && (licenseData.valid === true || licenseData.valid === 'true' || licenseData.valid === 1)) ? '#10b981' : '#ef4444',
              color: '#ffffff',
              padding: '2px 8px',
              borderRadius: '12px',
              fontSize: '11px',
              fontWeight: '700',
              marginTop: '4px',
              display: 'inline-block',
              textAlign: 'center'
            }}
          >
            {/* ✅ CORRECTIONS DES CLÉS DE TRADUCTION RECONNUES PAR VOTRE ERP */}
            {(licenseData && (licenseData.valid === true || licenseData.valid === 'true' || licenseData.valid === 1)) 
              ? t('dashboard.licence.active', 'Licence Active') 
              : t('dashboard.licence.invalid', 'Licence Invalide')}
          </span>
        </div>
      </div>

<div className="scroll-arrow-box">
        {/* 🎯 LA FLÈCHE DU HAUT (RETOUR) FAIT DÉSORMAIS AUSSI LA DÉCONNEXION SIMULTANÉE */}
        <button onClick={handleFermerSessionEtRetour} className="arrow-btn">
          <ChevronUp size={16}/>
        </button>
        <button onClick={() => scrollManual('down')} className="arrow-btn">
          <ChevronDown size={16}/>
        </button>
      </div>

      <nav 
        className="sidebar-nav" 
        ref={scrollRef} 
        onScroll={handleScroll}
        style={{marginTop: '20px', flex: 1, overflowY: 'auto', paddingRight: '5px'}}
      >
        {renderCurrentMenu()}
      </nav>

      <div className="sidebar-footer">
        {/* 🎯 LE BOUTON FERMER LA SESSION EXÉCUTE LA MÊME LOGIQUE CENTRALISÉE */}
        <button className="logout-button" onClick={handleFermerSessionEtRetour}>
          <LogOut size={18} />
          <span>{t('sidebar.sidebar_logout', 'Fermer la session')}</span>
        </button>
      </div>
    </aside>
  );
};

// ✅ DESIGN DES SCROLLBARS ET AJUSTEMENTS ANTI-CHEVAUCHEMENT DES TEXTES LONGS
const scrollbarStyles = `
  .sidebar-nav {
    display: flex;
    flex-direction: column;
    gap: 4px; /* Crée un espacement minimal de sécurité entre les boutons */
  }
  .sidebar-nav::-webkit-scrollbar {
    width: 10px;               
    display: block !important;
  }
  .sidebar-nav::-webkit-scrollbar-track {
    background: #f1f5f9;
    border-radius: 10px;
  }
  .sidebar-nav::-webkit-scrollbar-thumb {
    background: #1e293b;      
    border-radius: 10px;
    border: 2px solid #f1f5f9;
  }
  
  /* 🛠️ FIX TEXTES LONGS : Autorise le retour à la ligne automatique et adapte la hauteur */
  .nav-item {
    display: flex !important;
    align-items: center;
    justify-content: flex-start;
    height: auto !important;
    min-height: 38px;
    white-space: normal !important;
    word-break: break-word;
    padding: 10px 14px;
  }
  .nav-item span {
    display: inline-block;
    line-height: 1.3;
    text-align: left;
  }

  .nav-item.active {
    background: #f8fafc !important;
    border-right: 5px solid #6366f1 !important; 
    color: #6366f1 !important;
    font-weight: 900 !important;
  }
  .scroll-arrow-box {
    position: absolute;
    right: 12px;
    top: 75px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    z-index: 1000;
  }
  .arrow-btn {
    background: #1e293b;
    color: white;
    border: none;
    border-radius: 4px;
    width: 26px;
    height: 26px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.6;
    transition: 0.2s;
  }
  .arrow-btn:hover { opacity: 1; transform: scale(1.1); }
`;

export default Sidebar;
