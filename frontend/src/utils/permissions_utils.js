
export const PERMISSION_STRUCTURE = [
  {
    id: 'dashboard', // 🔑 Aligné sur le Dashboard
    label: 'Tableau de Bord & Statistiques',
    subs: [
      { id: 'dashboard_view_products', label: 'Voir Total Produits', parent_link_id: 'dashboard' },
      { id: 'dashboard_view_alerts', label: 'Voir Alertes Stock', parent_link_id: 'dashboard' },
      { id: 'dashboard_view_sales_day', label: 'Voir Ventes Journalières', parent_link_id: 'dashboard' },
      { id: 'dashboard_view_credit', label: 'Voir Total Créances Clients', parent_link_id: 'dashboard' }
    ]
  },
  
  {
    id: 'params', 
    label: 'Paramètres & Cloud',
    subs: [
      { id: 'edit_settings', label: 'Page : Modifier les paramètres société', parent_link_id: 'params' },
      { id: 'view_licence', label: 'Page : Voir les détails de la licence', parent_link_id: 'params' },
      { id: 'view_audit', label: 'Page : Accès au Journal Audit (Traçabilité)', parent_link_id: 'params' },
      { id: 'action_cloud_push', label: 'Page : Sauvegarder les données vers le Cloud', parent_link_id: 'params' },
      { id: 'action_cloud_restore', label: 'Page : Restaurer les données depuis le Cloud', parent_link_id: 'params' },
      { id: 'params_btn_update_institution', label: 'Mettre à jour parametre', parent_link_id: 'params' }
    ]
  },
  {
    id: 'access_pos', 
    label: 'Terminal de Vente (POS)',
    subs: [
      { id: 'vente_create', label: 'Accès au POS (Effectuer des ventes)', parent_link_id: 'access_pos' },
      { id: 'pos_add', label: 'Vente au panier', parent_link_id: 'access_pos' },
      { id: 'pos_validate', label: 'Valider un panier', parent_link_id: 'access_pos' },
      { id: 'pos_invoice', label: 'Vente Normalisée', parent_link_id: 'access_pos' },
      { id: 'pos_history', label: 'Historique des ventes', parent_link_id: 'access_pos' },
      
      // TOURNÉES COMMERCIALES
      { id: 'pos_vente_grille', label: 'Page : Grille Vente Commerciale (Constitution Matin)', parent_link_id: 'access_pos' },
      { id: 'pos_vente_liste', label: 'Page : Liste des Tournées Commerciales (Clôture Soir)', parent_link_id: 'access_pos' },
      
      // RAPPORTS & SÉCURITÉ
      { id: 'pos_details', label: 'Rapport des ventes détaillées par date', parent_link_id: 'access_pos' },
      { id: 'pos_view_marge', label: '👉 Autoriser l\'affichage de la Marge Brute et des Bénéfices', parent_link_id: 'access_pos' },
      { id: 'pos_cancel_sale', label: '👉 Bouton : Annuler une facture ou un lot de vente', parent_link_id: 'access_pos' },
      { id: 'pos_return_item', label: '👉 Bouton : Effectuer un retour article au POS', parent_link_id: 'access_pos' },
      
      // MODES DE PAIEMENT & CLIENTS
      { id: 'pos_jr', label: 'Gérer les Méthodes de Paiement', parent_link_id: 'access_pos' },
      { id: 'vente_view', label: 'Enregistrer un Client', parent_link_id: 'access_pos' },
      { id: 'pos_creances_clients', label: 'Page : Suivi des Créances et Dettes Clients', parent_link_id: 'access_pos' },
      
      // CLÔTURES
      { id: 'pos_close', label: 'Clôture de la Caisse', parent_link_id: 'access_pos' },
      { id: 'pos_history_cloture', label: 'Historique des clôtures', parent_link_id: 'access_pos' }
    ]
  },
{
    id: 'logistique', 
    label: 'Stocks & Achats',
    subs: [
      { id: 'achat_view', label: 'Accès au menu principal Logistique', parent_link_id: 'logistique' },
      { id: 'log_suppliers', label: 'Gérer les Fournisseurs', parent_link_id: 'logistique' },
      { id: 'log_buy', label: 'Effectuer un Achat (Entrée Stock)', parent_link_id: 'logistique' },
      { id: 'log_returns', label: 'Gérer les Retours / Avoirs', parent_link_id: 'logistique' },
      { id: 'log_history', label: 'Consulter l\'Historique des Achats', parent_link_id: 'logistique' },
      { id: 'stock_view', label: 'Voir l\'état des stocks (Ruptures/Alertes)', parent_link_id: 'logistique' },
      { id: 'log_inventory_hist', label: 'Consulter l’Historique des Inventaires', parent_link_id: 'logistique' },
      { id: 'log_inventory', label: 'Accès au Hub d\'Inventaire', parent_link_id: 'logistique' }, 
      { id: 'log_inventory_create', label: 'Démarrer ou Continuer l\'Inventaire', parent_link_id: 'logistique' },
      { id: 'log_inventory_cancel', label: 'Annuler l\'Inventaire en cours', parent_link_id: 'logistique' },
      
      // 🚀 ALIGNEMENT COMMANDES : INJECTION DES DROITS MANQUANTS POUR LES BONS DE COMMANDE
      { id: 'log_bon_commande', label: 'Créer un Bon de Commande Fournisseur', parent_link_id: 'logistique' },
      { id: 'log_historique_bon', label: 'Consulter l\'Historique des Bons de Commande', parent_link_id: 'logistique' },
      
      // 🚀 ALIGNEMENT COMPTABLE : SUIVI DES DETTES
      { id: 'log_dettes_fournisseurs', label: 'Consulter le Suivi des Dettes Fournisseurs', parent_link_id: 'logistique' },
      
      { id: 'log_ajustement', label: 'Accès au menu Ajustements de Stock (Pertes / Avaries)', parent_link_id: 'logistique' },
      { id: 'log_ajustement_hist', label: 'Consulter l’Historique des Pertes & Avaries', parent_link_id: 'logistique' }
    ]
},


    {
    id: 'access_articles', 
    label: 'Gestionnaire Articles',
    subs: [
      { id: 'art_list', label: ' Liste des Articles (Référentiel / Catalogue)', parent_link_id: 'access_articles' },
      
      // 📊 AJOUT SÉCURITÉ COMPTABLE FINANCIÈRE (CMP, VAL. ACHAT, VAL. VENTE)
      { id: 'art_view_financials', label: '👉 Autoriser l\'affichage et l\'impression des Valeurs d\'Achat, Vente et CMP', parent_link_id: 'access_articles' },

      { id: 'art_create', label: 'Gestion des Articles', parent_link_id: 'access_articles' },
      { id: 'art_edit', label: ' Gestion des Tables', parent_link_id: 'access_articles' },
      { id: 'art_view', label: ' Ajouter Conditionnement / Unités', parent_link_id: 'access_articles' },
      { id: 'art_categories', label: ' Familles Catégories & Groupes', parent_link_id: 'access_articles' },
      { id: 'art_gl', label: 'Grand livre Article (Historique global)', parent_link_id: 'access_articles' },  
      { id: 'art_btn_create_submit', label: 'création d\'un article', parent_link_id: 'access_articles' },
      { id: 'art_btn_edit_submit', label: ' modification d\'un article', parent_link_id: 'access_articles' }
    ]
  },

  {
    id: 'access_emballages',
    label: 'Gestionnaire des Emballages',
    subs: [
      // 🔑 PAGES GLOBALES DU MENU SIDEBAR
      { id: 'emb_create', label: 'Page : Création Emballage', parent_link_id: 'access_emballages' },
      { id: 'emb_achat', label: 'Page : Achat Emballages', parent_link_id: 'access_emballages' },
      { id: 'emb_regles', label: 'Page : Configuration des Flux', parent_link_id: 'access_emballages' },
      { id: 'emb_consignation', label: 'Page : Consignation Emballages', parent_link_id: 'access_emballages' },
      { id: 'emb_history', label: 'Page : Historique des Flux', parent_link_id: 'access_emballages' },
      { id: 'emb_inventory', label: 'Page : Suivi & Lancement Inv. Emballage', parent_link_id: 'access_emballages' },
      
      // 🔑 GRANULARITÉ DES BOUTONS DU TABLEAU D'ACHATS EMBALLAGES
      { id: 'emb_btn_modify', label: '👉 Bouton : Modifier un achat d\'emballage', parent_link_id: 'access_emballages' },
      { id: 'emb_btn_archive', label: '👉 Bouton : Archiver un achat d\'emballage', parent_link_id: 'access_emballages' },
      { id: 'emb_btn_delete', label: '👉 Bouton : Supprimer définitivement un achat d\'emballage', parent_link_id: 'access_emballages' },

      // 🔑 GRANULARITÉ DES BOUTONS DES RÈGLES DE CONSIGNATION (Nouveaux Ajouts)
      { id: 'emb_rule_btn_create', label: '👉 Bouton Règle : Créer / Ajouter une nouvelle règle', parent_link_id: 'access_emballages' },
      { id: 'emb_rule_btn_modify', label: '👉 Bouton Règle : Modifier une règle de consignation', parent_link_id: 'access_emballages' },
      { id: 'emb_rule_btn_delete', label: '👉 Bouton Règle : Supprimer une règle de consignation', parent_link_id: 'access_emballages' },
      { id: 'emb_cons_btn_modify', label: '👉 Bouton Consignation : Modifier / Ajuster un flux', parent_link_id: 'access_emballages' },
      { id: 'emb_cons_btn_delete', label: '👉 Bouton Consignation : Supprimer / Annuler un flux', parent_link_id: 'access_emballages' }
    ]
  },
  {
    id: 'menu_users_access', 
    label: 'Gestion Utilisateurs & Personnel',
    subs: [
      // 🔑 PAGES GLOBALES DU MENU SIDEBAR & AFFICHAGE
      { id: 'user_create', label: 'Page : Gérer les Comptes Utilisateurs (Liste & Création)', parent_link_id: 'menu_users_access' },
      { id: 'staff_manage', label: 'Page : Gestion du Personnel (Fiches de paie & Contrats)', parent_link_id: 'menu_users_access' },
      { id: 'user_btn_create_submit', label: 'enregistrer un NOUVEAU collaborateur', parent_link_id: 'menu_users_access' },
      { id: 'user_btn_edit_submit', label: 'MODIFICATION ou SUSPENSION d\'un compte', parent_link_id: 'menu_users_access' },
      { id: 'staff_btn_create', label: ' Enregistrer / Créer une nouvelle fiche employé', parent_link_id: 'menu_users_access' },
      { id: 'staff_btn_modify', label: ' Modifier / Éditer les coordonnées d\'un employé', parent_link_id: 'menu_users_access' },
      { id: 'staff_btn_archive', label: ' Archiver / Réactiver un contrat employé', parent_link_id: 'menu_users_access' }
    ]
  },

  {
    id: 'compta', 
    label: 'Gestion Comptable',
    subs: [
      { id: 'compta_ex', label: 'Exercices Comptables', parent_link_id: 'compta' },
      { id: 'compta_jr', label: 'Codes Journaux', parent_link_id: 'compta' },
      { id: 'compta_plan', label: 'Plan Comptable', parent_link_id: 'compta' },
      { id: 'compta_tiers', label: 'Plan des Tiers', parent_link_id: 'compta' },
      { id: 'compta_brouillon', label: 'Saisie Assistant', parent_link_id: 'compta' },
      { id: 'compta_val', label: 'Validation Brouillons & Trésorerie', parent_link_id: 'compta' },
      { id: 'compta_gen', label: 'Saisie Journalière', parent_link_id: 'compta' },
      { id: 'compta_cloture', label: 'Clôture & Centralisation Journalière', parent_link_id: 'compta' },
      { id: 'rpt_bal_comptes', label: 'Rapport : Balance des comptes', parent_link_id: 'compta' },
      { id: 'rpt_bal_tiers', label: 'Rapport : Balance des tiers', parent_link_id: 'compta' },
      { id: 'rpt_bal_agee', label: 'Rapport : Balance âgée', parent_link_id: 'compta' },
      { id: 'rpt_bal_ana', label: 'Rapport : Balance analytique', parent_link_id: 'compta' },
      { id: 'compta_etats_recap', label: 'États Financiers (Bilan, Résultat, TFT fusionnés)', parent_link_id: 'compta' },
      { id: 'rpt_gl_comptes', label: 'Rapport : Grand livre des comptes', parent_link_id: 'compta' },
      { id: 'rpt_gl_ana', label: 'Rapport : Grand livre analytique', parent_link_id: 'compta' },
      { id: 'rpt_gl_tiers', label: 'Rapport : Grand livre des tiers', parent_link_id: 'compta' },
      { id: 'rpt_bilan', label: 'Rapport : Bilan', parent_link_id: 'compta' },
      { id: 'rpt_resultat', label: 'Rapport : Compte de résultat', parent_link_id: 'compta' },
      { id: 'rpt_tft', label: 'Rapport : TFT (Flux Trésorerie)', parent_link_id: 'compta' },
      { id: 'rpt_jr_ana', label: 'Rapport : Journal analytique', parent_link_id: 'compta' },
      { id: 'rpt_ctrl_caisse', label: 'Rapport : Contrôle de caisse', parent_link_id: 'compta' },
      { id: 'rpt_taxes', label: 'Rapport : État des taxes', parent_link_id: 'compta' },
      { id: 'compta_brouillard_config', label: 'Paramétrer les Brouillards (Admin)', parent_link_id: 'compta' },
      { id: 'treso_saisie_hub', label: 'Accès au Hub de Saisie Trésorerie (Caissier)', parent_link_id: 'compta' },
      { id: 'treso_cash', label: 'Accès Caisse & Banques', parent_link_id: 'compta' },
      { id: 'compta_ex_btn_open_next', label: '👉 Bouton : Ouvrir N+1 / Créer un nouvel exercice fiscal', parent_link_id: 'compta' },
      { id: 'compta_ex_btn_modify', label: '👉 Bouton : Modifier / Ajuster un exercice existant', parent_link_id: 'compta' },
      { id: 'compta_ex_btn_delete', label: '👉 Bouton : Supprimer définitivement un exercice comptable', parent_link_id: 'compta' },
      { id: 'compta_jr_btn_create', label: '👉 Bouton : Créer un nouveau code journal', parent_link_id: 'compta' },
      { id: 'compta_jr_btn_export', label: '👉 Bouton : Exporter le modèle de codes journaux (CSV)', parent_link_id: 'compta' },
      { id: 'compta_jr_btn_import', label: '👉 Bouton : Importer un fichier de codes journaux (CSV)', parent_link_id: 'compta' },
      { id: 'compta_jr_btn_modify', label: '👉 Bouton : Modifier / Éditer la configuration d\'un journal', parent_link_id: 'compta' },
      { id: 'compta_jr_btn_delete', label: '👉 Bouton : Supprimer définitivement un code journal vide', parent_link_id: 'compta' },
      { id: 'compta_plan_btn_create', label: '👉 Bouton : Créer / Ajouter un nouveau compte général', parent_link_id: 'compta' },
      { id: 'compta_plan_btn_purge', label: '👉 Bouton : Vider / Purger l\'intégralité du plan comptable', parent_link_id: 'compta' },
      { id: 'compta_plan_btn_modify', label: '👉 Bouton : Modifier / Renommer l\'intitulé d\'un compte', parent_link_id: 'compta' },
      { id: 'compta_plan_btn_delete', label: '👉 Bouton : Supprimer définitivement un compte comptable vide', parent_link_id: 'compta' },
      { id: 'compta_auto_btn_create', label: '👉 Bouton : Ouvrir le paramétrage d\'un NOUVEAU schéma d\'écriture', parent_link_id: 'compta' },
      { id: 'compta_auto_btn_save', label: '👉 Bouton : ENREGISTRER définitivement le schéma d\'imputation', parent_link_id: 'compta' },
      { id: 'compta_auto_btn_add_line', label: '👉 Bouton : Ajouter une ligne d\'imputation au répartiteur', parent_link_id: 'compta' }
    ]
  },
  {
    id: 'access_analytique', 
    label: 'Gestion Analytique & Production',
    subs: [
      { id: 'analytique_plan', label: 'Paramétrer le Plan Analytique', parent_link_id: 'access_analytique' }
    ]
  }
];

// --- 🔑 LOGIQUE DE RÉCUPÉRATION RECONSTRUITE & TOTALEMENT ÉTANCHE ---
export const getUserPermissions = () => {
  const userData = localStorage.getItem('user');
  if (!userData) return {};
  
  try {
    const user = JSON.parse(userData);
    const role = (user.role || '').toLowerCase().trim();
    
    // 1. SI ADMIN OU SUPER_ADMIN -> FULL ACCÈS AUTOMATIQUE SANS RESTRICTION
    if (role === 'admin' || role === 'super_admin') {
      const adminPerms = {};
      PERMISSION_STRUCTURE.forEach(group => {
        adminPerms[group.id] = true;
        if (group.subs) {
          group.subs.forEach(sub => {
            adminPerms[sub.id] = true;
          });
        }
      });
      return adminPerms;
    }

    // 2. SI COLLABORATEUR -> DÉCODAGE ET INJECTION D'HÉRITAGE PARENT-ENFANT
    let perms = user.permissions;

    while (typeof perms === 'string' && perms.trim() !== "") {
      try {
        perms = JSON.parse(perms);
      } catch (e) {
        break; 
      }
    }

    if (!perms || typeof perms !== 'object' || Array.isArray(perms)) {
      return {};
    }

    // On prépare la copie calculée pour injecter dynamiquement l'accès aux onglets parents
    const computedPerms = { ...perms };
    
    // 🎯 RECONSOLIDATION MAÎTRESSE : Si un sous-bouton ou sous-droit est coché, la page parente s'ouvre d'office
    PERMISSION_STRUCTURE.forEach(group => {
      if (group.subs) {
        const hasActiveChild = group.subs.some(sub => {
          const val = perms[sub.id];
          return val === true || val === 1 || val === 'true' || val === '1';
        });
        
        if (hasActiveChild) {
          computedPerms[group.id] = true; // 🔑 Ouvre automatiquement le NavDropdown parent dans la Sidebar et la route principale
        }
      }
    });

    return computedPerms;
      
  } catch (e) {
    console.error("Erreur critique lecture permissions:", e);
    return {};
  }
};

export const hasPermission = (permissionId) => {
  const perms = getUserPermissions();
  const val = perms[permissionId];
  return val === true || val === 1 || val === 'true' || val === '1';
};


export const getFilteredStructureForManager = () => {
  return PERMISSION_STRUCTURE;
};
