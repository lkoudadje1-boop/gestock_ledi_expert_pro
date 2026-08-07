import React, { useEffect, useRef } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { getUserPermissions } from './utils/permissions_utils';
import { SocketProvider } from './services/SocketContext';

// Pages - Authentification & Accueil
import Signup from './pages/Signup.jsx';
import Login from './pages/Login.jsx';
import Welcome from './pages/Welcome.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx'; 
import ResetPassword from './pages/ResetPassword.jsx'; 

// Pages - Administration Générale & Système
import Dashboard from './pages/Dashboard.jsx'; 
import MaLicence from './pages/MaLicence.jsx';
import UserManagement from './pages/UserManagement.jsx';
import StaffManagement from './pages/StaffManagement';
import CompanySettings from './pages/CompanySettings.jsx';
import AuditPage from './pages/AuditPage.jsx';

// Pages - Catalogue Articles
import ArticlesHub from './pages/Articles/ArticlesHub';
import ArticleList from './pages/Articles/ArticleList';
import CategoriesPage from './pages/Articles/CategoriesPage';
import UnitesPage from './pages/Articles/CreateUnite.jsx';
import CreateArticle from './pages/Articles/CreateArticle';
import CreateTables from './pages/Articles/CreateTables.jsx';
import ProductHistory from './pages/Articles/ProductHistory';


// Pages - Logistique & Approvisionnements
import Fournisseurs from './pages/Logistique/Fournisseurs';
import HistoriqueApprov from './pages/Logistique/HistoriqueApprov';
import Approvisionnement from './pages/Logistique/approvisionnement'; 
import DetteFournisseurs from './pages/Logistique/DetteFournisseurs.jsx';
import InventaireHub from './pages/Logistique/InventaireHub';
import InventaireSaisie from './pages/Logistique/InventaireSaisie';
import HistoriqueInventaire from './pages/Logistique/HistoriqueInventaire';
import StockAjustement from './pages/Logistique/stockajustement';
import HistoriqueStockAjustement from './pages/Logistique/historiquestockajustement'; // 🚀 AJOUT DE LA NOUVELLE PAGE
import BonCommandeLogistique from './pages/Logistique/boncommande';
import HistoriqueBonsCommande from './pages/Logistique/historiquebon';

// Pages - Emballages Consignés
import EmballagesAchat from './pages/emballages/EmballagesAchat';
import CreerEmballages from './pages/emballages/CreerEmballages';
import RegleConsignation from './pages/emballages/RegleConsignation';
import HistoriqueFluxEmbalage from './pages/emballages/historiqueFluxEmbalage';
import InventaireEmballage from './pages/emballages/InventaireEmballage';
import SuiviInventaireEmballage from './pages/emballages/SuiviInventaireEmballage';
import ConsignationEmballages from './pages/emballages/consignationEmballages.jsx'; // <--- Ajouté ici

// Pages - Terminal Point de Vente (POS) & Clients
import NouvelleVente from './pages/TerminalPos/NouvelleVente';
import Clients from './pages/TerminalPos/client.jsx';
import ClotureCaisse from './pages/TerminalPos/ClotureCaisse';
import HistoriqueCloture from './pages/TerminalPos/HistoriqueCloture';
import CreancesClients from './pages/TerminalPos/CreanceClients.jsx';
import HistoriqueVentes from './pages/TerminalPos/HistoriqueVente';
import NouvelleVenteProvisoire from './pages/TerminalPos/NouvelleVenteProvisoire';
import ValidationVentePage from './pages/TerminalPos/ValidationVente';
import VenteFactureClient from './pages/TerminalPos/VenteFactureClient';
import MethodPaiement from './pages/TerminalPos/MethodPaiement.jsx';
import VenteDetailList from './pages/TerminalPos/VenteDetailList.jsx';
// Correct way to import a default export
import GrilleTourneeCommercialeUnique from './pages/TerminalPos/GestionTourneeCommerciale.jsx';
import ListeTourneesCommerciales from './pages/TerminalPos/ListeTourneesCommerciales.jsx';

// Pages - Comptabilité Générale
import PlanComptable from './pages/Comptabilté_Generale/PlanComptable';
import PlanTiers from './pages/Comptabilté_Generale/Plan_tiers.jsx';
import ExerciceComptable from './pages/Comptabilté_Generale/Exercice.jsx';
import CodeJournal from './pages/Comptabilté_Generale/CodeJournal.jsx';
import JournalEcriture from './pages/Comptabilté_Generale/JournalEcriture.jsx';
import Ecritures from './pages/Comptabilté_Generale/Ecritures.jsx';
import BrouillonEcritures from './pages/Comptabilté_Generale/BrouillonEcriture.jsx';
import ValidationEcritures from './pages/Comptabilté_Generale/ValidationEcriture.jsx';
import JournalSelectionBrouillon from './pages/Comptabilté_Generale/JournalSelectionBrouillon.jsx';
import HistoriqueEcriture from './pages/Comptabilté_Generale/historiqueEcriture.jsx';
import HistoriqueTiers from './pages/Comptabilté_Generale/historiqueTiers.jsx';
import Ran from './pages/Comptabilté_Generale/ran.jsx'; 
import ClotureJournalier from './pages/Comptabilté_Generale/clotureJournalier.jsx';
import TypeBrouillards from './pages/Comptabilté_Generale/Type.Brouillards.jsx';
import BrouillardsSaisie from './pages/Comptabilté_Generale/BrouillardsSaisie.jsx';
import ValiderBrouillard from './pages/Comptabilté_Generale/Valider.Brouillard.jsx';
import VentilationBrouillard from './pages/Comptabilté_Generale/VentilationBrouillard.jsx';

// Pages - Gestion Analytique
import PlanAnalytique from './pages/gestion_analytique/PlanAnalytique.jsx';
import ConfigurationAuto from './pages/gestion_analytique/ConfigurationAuto.jsx';

// Pages - Rapports & États Comptables
import RapBalanceAgee from './pages/Comptabilté_Generale/Rap_BalanceAgee';
import RapBalanceTiers from './pages/Comptabilté_Generale/Rap_BalanceTiers';
import RapJournalAnalytique from './pages/Comptabilté_Generale/Rap_JournalAnalytique.jsx';
import RapImpotsTaxes from './pages/Comptabilté_Generale/Rap_ImpotsTaxes.jsx';
import RapGrandLivreComptes from './pages/Comptabilté_Generale/Rap_GrandLivreComptes.jsx';
import RapGrandLivreAnalytique from './pages/Comptabilté_Generale/Rap_GrandLivreAnalytique.jsx';
import Rap_GrandLivreTiers from './pages/Comptabilté_Generale/Rap_GrandLivreTiers.jsx';
import RapControleCaisse from './pages/Comptabilté_Generale/Rap_ControleCaisse.jsx';
import RapCompteResultat from './pages/Comptabilté_Generale/Rap_CompteResultat.jsx';
import RapBrouillardSaisie from './pages/Comptabilté_Generale/Rap_BrouillardSaisie.jsx';
import ConfigEcrituresAutoParam from './pages/Comptabilté_Generale/ConfigEcrituresAuto.jsx';
import RapBalanceComptes from './pages/Comptabilté_Generale/Rap_BalanceComptes.jsx';
import RapTFT from './pages/Comptabilté_Generale/Rap_TFT.jsx';
import RapBalanceAnalytique from './pages/Comptabilté_Generale/Rap_BalanceAnalytique';
import RapBilan from './pages/Comptabilté_Generale/Rap_Bilan.jsx';
import EtatsFinanciersRecap from './pages/Comptabilté_Generale/EtatsFinanciersRecap.jsx';

const ProtectedRoute = ({ children, permission, module }) => {
  const token = localStorage.getItem('token');
  if (!token) return <Navigate to="/login" replace />;
  
  // 1. Récupération sécurisée du statut matériel de la licence
  const rawStatus = localStorage.getItem('licenseStatus');
  let allowedModules = [];

  try {
    const licenseData = JSON.parse(rawStatus || '{}');
    let mods = licenseData.allowed_modules || [];

    // 🛡️ Alignement et nettoyage des formats de tableaux
    if (typeof mods === 'string') {
        allowedModules = mods.replace(/[\[\]"']/g, '').split(',').map(m => m.trim().toUpperCase());
    } else if (Array.isArray(mods)) {
        allowedModules = mods.map(m => String(m).replace(/[\[\]"']/g, '').trim().toUpperCase());
    }
  } catch (e) {
    console.error("Erreur lecture stockage licence", e);
    allowedModules = [];
  }

  // 2. Vérification stricte du module de l'ERP
  if (module) {
    const target = module.toUpperCase();
    if (!allowedModules.includes(target) && !allowedModules.includes('FULL_ACCESS')) {
      console.error(`🚫 Module non inclus dans votre licence : ${target}`);
      return <Navigate to="/admin/ma-licence" replace />;
    }
  }

  // 3. Vérification complémentaire des droits de l'employé (Permissions RBAC)
  const perms = getUserPermissions();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isAdmin = user.role === 'admin' || user.role === 'super_admin';

  if (permission && !isAdmin && (!perms || !perms[permission])) {
    return <Navigate to="/admin/dashboard" replace />;
  }
  return children;
};

const TimeGuardian = () => {
    const lastTick = useRef(Date.now());

    useEffect(() => {
        const interval = setInterval(() => {
            const currentTime = Date.now();
            // Détection si l'horloge système recule de plus de 2 secondes (Fraude à l'expiration)
            if (currentTime < (lastTick.current - 2000)) {
                console.error("🚨 Modification malveillante de l'heure système détectée !");
                localStorage.clear();
                window.location.href = "/login?error=clock_manipulation";
            }
            lastTick.current = currentTime;
        }, 1000);

        return () => clearInterval(interval);
    }, []);

    return null;
};

function App() {
  const userData = localStorage.getItem('user');
  const token = localStorage.getItem('token');
  let user = null;

  try { 
    user = userData ? JSON.parse(userData) : null; 
  } catch (e) { 
    console.error("Erreur JSON User:", e); 
    localStorage.clear(); 
  }

  return (
    <SocketProvider>
      <Router>
        <TimeGuardian />
        <Routes>
          {/* ====================================================== */}
          {/* ROUTES PUBLIQUES & CONFIGURATION INITIALE              */}
          {/* ====================================================== */}
          <Route path="/welcome" element={<Welcome />} />         
          <Route path="/signup" element={<Signup />} />
          <Route path="/login" element={<Login />} />
          <Route path="/activation-licence" element={<MaLicence user={user} />} />
          <Route path="/forgot-password" element={<ForgotPassword />} /> 
          <Route path="/reset-password/:token" element={<ResetPassword />} /> 

          {/* ====================================================== */}
          {/* ROUTE DE GESTION DE LA LICENCE                         */}
          {/* ====================================================== */}
          <Route path="/params/licence" element={<ProtectedRoute><MaLicence user={user}/></ProtectedRoute>} />
          <Route path="/admin/ma-licence" element={<ProtectedRoute><MaLicence user={user}/></ProtectedRoute>} />

          {/* ====================================================== */}
          {/* TABLEAU DE BORD CENTRAL                                */}
          {/* ====================================================== */}
          <Route path="/admin/dashboard" element={<ProtectedRoute><Dashboard user={user}/></ProtectedRoute>} />

          {/* ====================================================== */}
          {/* MODULE : SYSTEM (Gestion interne de la structure)      */}
          {/* ====================================================== */}
          <Route path="/admin/users" element={<ProtectedRoute permission="user_create" module="SYSTEM"><UserManagement user={user}/></ProtectedRoute>} /> 
          <Route path="/admin/staff" element={<ProtectedRoute permission="staff_manage" module="SYSTEM"><StaffManagement user={user} /></ProtectedRoute>} />
          <Route path="/admin/settings" element={<ProtectedRoute permission="edit_settings" module="SYSTEM"><CompanySettings user={user} /></ProtectedRoute>} />
          <Route path="/admin/licence" element={<ProtectedRoute permission="view_licence" module="SYSTEM"><MaLicence user={user} /></ProtectedRoute>}/>
          <Route path="/audit" element={<ProtectedRoute permission="view_audit" module="SYSTEM"><AuditPage user={user}/></ProtectedRoute>} />

          {/* ====================================================== */}
          {/* MODULE : GESTOCK (Logistique & Fournisseurs)           */}
          {/* ====================================================== */}
          <Route path="/logistique/fournisseurs" element={<ProtectedRoute permission="log_suppliers" module="GESTOCK"><Fournisseurs user={user} /></ProtectedRoute>} />
          <Route path="/ventes/clients" element={<ProtectedRoute permission="vente_view" module="GESTOCK"><Clients user={user} /></ProtectedRoute>} />
          <Route path="/logistique/achat" element={<ProtectedRoute permission="log_buy" module="GESTOCK"><Approvisionnement user={user} /></ProtectedRoute>} /> 
          <Route path="/logistique/hist-achats" element={<ProtectedRoute permission="log_history" module="GESTOCK"><HistoriqueApprov user={user} /></ProtectedRoute>} />
          <Route path="/logistique/inventaire" element={<ProtectedRoute permission="log_inventory" module="GESTOCK"><InventaireHub user={user} /></ProtectedRoute>} />
          <Route path="/logistique/inventaire/saisie" element={<ProtectedRoute module="GESTOCK"><InventaireSaisie user={user} /></ProtectedRoute>} />
          <Route path="/logistique/historique-inventaire" element={<ProtectedRoute permission="log_inventory_hist" module="GESTOCK"><HistoriqueInventaire user={user}/></ProtectedRoute>} />
          <Route path="/logistique/dettes-fournisseurs" element={<ProtectedRoute permission="log_suppliers" module="GESTOCK"><DetteFournisseurs user={user} /></ProtectedRoute>} />
          <Route path="/logistique/ajustements" element={<ProtectedRoute permission="log_inventory" module="GESTOCK"><StockAjustement user={user} /></ProtectedRoute>} /> 
    <Route path="/logistique/bon-commande" element={<ProtectedRoute permission="log_buy" module="GESTOCK"><BonCommandeLogistique user={user} /></ProtectedRoute>} />
 <Route path="/logistique/historique-bon" element={<ProtectedRoute permission="log_buy" module="GESTOCK"><HistoriqueBonsCommande user={user} /></ProtectedRoute>} />

          <Route path="/logistique/historique-ajustements" element={<ProtectedRoute permission="log_inventory" module="GESTOCK"><HistoriqueStockAjustement user={user} /></ProtectedRoute>} />
          {/* ====================================================== */}
          {/* MODULE : GESTOCK (Gestion des emballages consignés)    */}
          {/* ====================================================== */}
          <Route path="/emballage/historique-flux-emballage" element={<ProtectedRoute permission="emb_history" module="GESTOCK"><HistoriqueFluxEmbalage user={user} /></ProtectedRoute>} />
          <Route path="/emballage/regles-consignation" element={<ProtectedRoute permission="emb_regles" module="GESTOCK"><RegleConsignation user={user}/></ProtectedRoute>} />
          <Route  path="/emballages/suivi" element={<ProtectedRoute permission="emb_inventory" module="GESTOCK"><SuiviInventaireEmballage user={user} /></ProtectedRoute>} />
          <Route path="/emballages/inventaire/saisie" element={<ProtectedRoute module="GESTOCK"><InventaireEmballage user={user} /></ProtectedRoute>} />
          <Route path="/emballage/create" element={<ProtectedRoute permission="emb_create" module="GESTOCK"><CreerEmballages user={user}/></ProtectedRoute>} />
          <Route path="/emballage/achat" element={<ProtectedRoute permission="emb_achat" module="GESTOCK"><EmballagesAchat user={user}/></ProtectedRoute>} />
          <Route path="/emballages/consignation" element={<ProtectedRoute permission="emb_regles" module="GESTOCK"><ConsignationEmballages user={user}/></ProtectedRoute>} /> {/* <--- Route ajoutée ici */}

          {/* ====================================================== */}
          {/* MODULE : GESTOCK (Catalogue Articles)                  */}
          {/* ====================================================== */}
         {/* 🔑 ALIGNEMENT STRATÉGIQUE SUR ART_VIEW */}
<Route path="/admin/articles/tables" element={<ProtectedRoute permission="art_view" module="GESTOCK"><CreateTables user={user}/></ProtectedRoute>} />
          <Route path="/admin/articles" element={<ProtectedRoute permission="art_view" module="GESTOCK"><ArticlesHub user={user}/></ProtectedRoute>} />
          <Route path="/admin/articles/list" element={<ProtectedRoute permission="art_view" module="GESTOCK"><ArticleList user={user} /></ProtectedRoute>} />
          <Route path="/admin/articles/categories" element={<ProtectedRoute permission="art_view" module="GESTOCK"><CategoriesPage user={user}/></ProtectedRoute>} />
          <Route path="/admin/articles/unites" element={<ProtectedRoute permission="art_view" module="GESTOCK"><UnitesPage user={user}/></ProtectedRoute>} />
          <Route path="/admin/articles/create" element={<ProtectedRoute permission="art_create" module="GESTOCK"><CreateArticle user={user}/></ProtectedRoute>} />
          <Route path="/admin/articles/edit/:id" element={<ProtectedRoute permission="art_edit" module="GESTOCK"><CreateArticle user={user}/></ProtectedRoute>} />
          <Route path="/admin/articles/history/:id" element={<ProtectedRoute permission="art_gl" module="GESTOCK"><ProductHistory user={user}/></ProtectedRoute>} />
          <Route path="/admin/articles/history" element={<ProtectedRoute permission="art_gl" module="GESTOCK"><ProductHistory user={user}/></ProtectedRoute>} />

          {/* ====================================================== */}
          {/* MODULE : GESTOCK (Point de Vente POS & Caisses)        */}
          {/* ====================================================== */}
          <Route path="/pos" element={<ProtectedRoute permission="vente_create" module="GESTOCK"><NouvelleVente user={user}/></ProtectedRoute>} />
          <Route path="/admin/pos" element={<ProtectedRoute permission="vente_create" module="GESTOCK"><NouvelleVente user={user}/></ProtectedRoute>} />
          <Route path="/pos/history" element={<ProtectedRoute permission="vente_view" module="GESTOCK"><HistoriqueVentes user={user}/></ProtectedRoute>} />
          <Route path="/pos/add" element={<ProtectedRoute permission="vente_create" module="GESTOCK"><NouvelleVenteProvisoire user={user}/></ProtectedRoute>} />
          <Route path="/pos/validate" element={<ProtectedRoute permission="pos_validate" module="GESTOCK"><ValidationVentePage user={user}/></ProtectedRoute>} />
          <Route path="/pos/invoice" element={<ProtectedRoute permission="pos_invoice" module="GESTOCK"><VenteFactureClient user={user}/></ProtectedRoute>} />
          <Route path="/pos/close" element={<ProtectedRoute permission="vente_create" module="GESTOCK"><ClotureCaisse user={user}/></ProtectedRoute>} />
          <Route path="/pos/historique-cloture" element={<ProtectedRoute permission="vente_create" module="GESTOCK"><HistoriqueCloture user={user} /></ProtectedRoute>} />
          {/* 🔑 ALIGNEMENT DE LA ROUTE SUR LA PERMISSION POS_JR */}
          <Route path="/pos/paiements/methodes" element={<ProtectedRoute permission="pos_jr" module="GESTOCK"><MethodPaiement user={user} /></ProtectedRoute>} />
          <Route path="/pos-details" element={<ProtectedRoute permission="vente_create" module="GESTOCK"><VenteDetailList user={user}/></ProtectedRoute>} />

          <Route path="/pos/creances-clients" element={<ProtectedRoute permission="vente_view" module="GESTOCK"><CreancesClients user={user} /></ProtectedRoute>} />

        {/* ❌ ANCIEN CODE BLOQUANT :
<Route path="/pos/commerciale-clients" element={<ProtectedRoute permission="vente_grille" module="GESTOCK"><GrilleTourneeCommercialeUnique user={user} /></ProtectedRoute>} />
<Route path="/pos/tourneesCommerciales-clients" element={<ProtectedRoute permission="vente_grille" module="GESTOCK"><ListeTourneesCommerciales user={user} /></ProtectedRoute>} />
*/}

{/*  CODE CORRIGÉ ET ETANCHE : */}
<Route 
  path="/pos/commerciale-clients" 
  element={
    <ProtectedRoute permission="pos_vente_grille" module="GESTOCK">
      <GrilleTourneeCommercialeUnique user={user} />
    </ProtectedRoute>
  } 
/>

<Route 
  path="/pos/tourneesCommerciales-clients" 
  element={
    <ProtectedRoute permission="pos_vente_liste" module="GESTOCK">
      <ListeTourneesCommerciales user={user} />
    </ProtectedRoute>
  } 
/>



          {/* ====================================================== */}
          {/* MODULE : COMPTA_BASE (Comptabilité Générale)           */}
          {/* ====================================================== */}
          <Route path="/compta/plan" element={<ProtectedRoute permission="compta_plan" module="COMPTA_BASE"><PlanComptable user={user} /></ProtectedRoute>} />
          <Route path="/compta/tiers" element={<ProtectedRoute permission="compta_tiers" module="COMPTA_BASE"><PlanTiers user={user} /></ProtectedRoute>} />
          <Route path="/compta/exercices" element={<ProtectedRoute permission="compta_ex" module="COMPTA_BASE"><ExerciceComptable user={user} /></ProtectedRoute>} />
          <Route path="/compta/cloture-journaliere" element={<ProtectedRoute permission="compta_gen" module="COMPTA_BASE"><ClotureJournalier user={user} /></ProtectedRoute>} />
          <Route path="/compta/journaux" element={<ProtectedRoute permission="compta_jr" module="COMPTA_BASE"><CodeJournal user={user} /></ProtectedRoute>} />
          <Route path="/compta/gen" element={<ProtectedRoute permission="compta_gen" module="COMPTA_BASE"><JournalEcriture user={user} /></ProtectedRoute>} />
          <Route path="/compta/ecritures-saisie" element={<ProtectedRoute permission="compta_gen" module="COMPTA_BASE"><Ecritures user={user} /></ProtectedRoute>} />
          <Route path="/compta/brouillon" element={<ProtectedRoute permission="compta_brouillon" module="COMPTA_BASE"><BrouillonEcritures user={user} /></ProtectedRoute>} />
          <Route path="/compta/validation" element={<ProtectedRoute permission="compta_val" module="COMPTA_BASE"><ValidationEcritures user={user} /></ProtectedRoute>} />
          <Route path="/compta/brouillon-selection" element={<ProtectedRoute permission="compta_brouillon" module="COMPTA_BASE"><JournalSelectionBrouillon user={user} /></ProtectedRoute>} />
          <Route path="/compta/treso/ventilation" element={<ProtectedRoute permission="compta_gen" module="COMPTA_BASE"><VentilationBrouillard user={user}/></ProtectedRoute>} />
          <Route path="/compta/config-ecritures-auto" element={<ProtectedRoute permission="compta_brouillard_config" module="COMPTA_BASE"><ConfigEcrituresAutoParam user={user}/></ProtectedRoute>} />          
          <Route path="/compta/ran" element={<ProtectedRoute permission="compta_ex" module="COMPTA_BASE"><Ran user={user} /></ProtectedRoute>} />
          <Route path="/compta/type-brouillards" element={<ProtectedRoute permission="compta_jr" module="COMPTA_BASE"><TypeBrouillards user={user} /></ProtectedRoute>} />
          <Route path="/compta/treso/choix-brouillard" element={<ProtectedRoute permission="compta_gen" module="COMPTA_BASE"><BrouillardsSaisie user={user}/></ProtectedRoute>} />   
          <Route path="/compta/treso/validation" element={<ProtectedRoute permission="compta_val" module="COMPTA_BASE"><ValiderBrouillard user={user}/></ProtectedRoute>} />   

          {/* ====================================================== */}
          {/* MODULE : COMPTA_BASE (Gestion Analytique)              */}
          {/* ====================================================== */}
          <Route path="/compta/Analytique" element={<ProtectedRoute permission="access_analytique" module="COMPTA_BASE"><PlanAnalytique user={user} /></ProtectedRoute>} />
          <Route path="/compta/repartitions/config" element={<ProtectedRoute permission="access_analytique" module="COMPTA_BASE"><ConfigurationAuto user={user} /></ProtectedRoute>} />

          {/* ====================================================== */}
          {/* MODULE : COMPTA_BASE (Rapports & États Financiers)    */}
          {/* ====================================================== */}
          <Route path="/compta/rapports/balance-comptes" element={<ProtectedRoute permission="rpt_bal_comptes" module="COMPTA_BASE"><RapBalanceComptes user={user} /></ProtectedRoute>} />
          <Route path="/compta/rapports/balance-agee" element={<ProtectedRoute permission="rpt_bal_tiers" module="COMPTA_BASE"><RapBalanceAgee user={user} /></ProtectedRoute>} />
          <Route path="/compta/rapports/grand-livre" element={<ProtectedRoute permission="rpt_gl_comptes" module="COMPTA_BASE"><RapGrandLivreComptes user={user} /></ProtectedRoute>} />
          <Route path="/compta/rapports/grand-livre-analytique" element={<ProtectedRoute permission="rpt_gl_ana" module="COMPTA_BASE"><RapGrandLivreAnalytique user={user} /></ProtectedRoute>} />
          <Route path="/compta/rapports/grand-livre-tiers" element={<ProtectedRoute permission="rpt_gl_tiers" module="COMPTA_BASE"><Rap_GrandLivreTiers user={user} /></ProtectedRoute>} />
          <Route path="/compta/rapports/balance-tiers" element={<ProtectedRoute permission="rpt_bal_tiers" module="COMPTA_BASE"><RapBalanceTiers user={user} /></ProtectedRoute>} />
          <Route path="/compta/historique-tiers/:num_tiers" element={<ProtectedRoute permission="rpt_gl_tiers" module="COMPTA_BASE"><HistoriqueTiers user={user}/></ProtectedRoute>} />
          <Route path="/compta/rapports/balance-analytique" element={<ProtectedRoute permission="rpt_bal_ana" module="COMPTA_BASE"><RapBalanceAnalytique user={user} /></ProtectedRoute>} />
          <Route path="/compta/rapports/bilan" element={<ProtectedRoute permission="rpt_bilan" module="COMPTA_BASE"><RapBilan user={user} /></ProtectedRoute>} />
          <Route path="/compta/rapports/resultat" element={<ProtectedRoute permission="rpt_resultat" module="COMPTA_BASE"><RapCompteResultat user={user} /></ProtectedRoute>} />
          <Route path="/compta/rapports/tft" element={<ProtectedRoute permission="rpt_tft" module="COMPTA_BASE"><RapTFT user={user} /></ProtectedRoute>} />
          <Route path="/compta/rapports/etats-financiers" element={<ProtectedRoute permission="compta_etats_recap" module="COMPTA_BASE"><EtatsFinanciersRecap user={user} /></ProtectedRoute>} />
          <Route path="/compta/historique-compte/:num_compte" element={<ProtectedRoute permission="rpt_gl_comptes" module="COMPTA_BASE"><HistoriqueEcriture user={user} /></ProtectedRoute>} />

          {/* ====================================================== */}
          {/* 🛡️ AIGUILLAGE DE DÉMARRAGE CORRIGÉ                    */}
          {/* ====================================================== */}
          <Route path="/" element={token && user ? <Navigate to="/admin/dashboard" replace /> : <Navigate to="/welcome" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </SocketProvider>
  );
}

export default App;