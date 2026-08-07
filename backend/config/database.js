// 🔐 REMPLACEMENT : Utilisation du moteur avec support SQLCipher
const Database = require('better-sqlite3-multiple-ciphers');
const path = require('path');
const fs = require('fs');

let db = null;
let dbPath = null;

const isDev = process.env.NODE_ENV !== 'production';
const RESET_DB = process.env.RESET_DB === 'true' && isDev;

// ======================================================
// INIT DATABASE
// ======================================================
function initDatabase(providedPath) {
    try {
        // 1. Détermination du chemin (Priorité absolue à Electron)
        if (providedPath) {
            dbPath = path.join(providedPath, 'local.db');
        } else if (process.env.USER_DATA_PATH) {
            dbPath = path.join(process.env.USER_DATA_PATH, 'local.db');
        } else {
            // Chemin de secours pour le développement local
            dbPath = path.join(__dirname, '../../data/local.db');
        }

        const dataDir = path.dirname(dbPath);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        // 🗄️ Ouverture DB
        db = new Database(dbPath, {
            verbose: isDev ? console.log : null
        });

        // ======================================================
        // 🔑 CONFIGURATION DU CHIFFREMENT DE LA BASE (SQLCipher)
        // ======================================================
        const PASSPHRASE_SECURE = 'LediExpertERP_UltraSecure_Passphrase_2026!'; 
        
        // Applique la clé de chiffrement
        db.pragma(`key = '${PASSPHRASE_SECURE}'`);
        
        // Force la compatibilité avec le standard SQLCipher v4
        db.pragma('cipher_compatibility = 4');
        db.pragma('cipher_page_size = 4096'); // ⚡ AJOUT : Optimise le chiffrement pour les SSD

        // Test de validité immédiat
        db.exec("SELECT count(*) FROM sqlite_master;");
        
        console.log('🔒 SQLite connecté et CHIFFRÉ sur :', dbPath);
        
        // ⚙️ Optimisations avancées de performances
        db.exec(`PRAGMA foreign_keys = ON;`);
        db.exec(`PRAGMA journal_mode = WAL;`);
        db.exec(`PRAGMA synchronous = NORMAL;`);
        db.exec(`PRAGMA temp_store = MEMORY;`);
        
        // ⚡ AJOUTS CRUTIAUX POUR LA VITESSE ET LA TAILLE :
        db.exec(`PRAGMA cache_size = -40000;`); // Alloue ~40 Mo de RAM au cache de requêtes (vitesse ++ )
        db.exec(`PRAGMA auto_vacuum = INCREMENTAL;`); // Évite l'explosion inutile de la taille du fichier .db

        // ======================================================
        // RESET DB (DEV)
        // ======================================================
        if (RESET_DB) {
            console.log('⚠️ RESET TOTAL DE LA BASE (DEV MODE)');
            db.exec(`PRAGMA foreign_keys = OFF;`);

          const tablesToDrop = [
    // 1. TABLES ENFANTS / DÉTAILS ET TRANSACTIONS DE BASES (À supprimer en premier)
    'stock_adjustment_items',
    'stock_adjustments',
    'brouillon_lignes_analytiques', 
    'brouillon_lignes', 
    'brouillon_ecritures', 
    'lignes_analytiques', 
    'lignes_ecritures', 
    'ecritures',
    'flux_emballages_details',
    'flux_emballages',              // ✨ AJOUTÉ : Table parent des flux d'emballages
    'packaging_movements', 
    'packaging_purchases',
    'packaging_inventory_items',    // ✨ AJOUTÉ : Lignes d'inventaires d'emballages
    'packaging_inventories',        // ✨ AJOUTÉ : Entêtes d'inventaires d'emballages
    'packaging',
    'packaging_rule_tiers',
    'packaging_rules',
    'analytique_auto_repartition', 
    'analytique_config_comptes', 
    'analytique_details', 
    'plan_analytique', 
    'departements', 
    'mapping_comptes_rubriques', 
    'rubriques_etats', 
    'plan_tiers', 
    'plan_comptable', 
    'journaux', 
    'exercices', 
    'product_paliers',
    'reports_a_nouveau', 
    'brouillard_lignes_treso', 
    'brouillard_affectations', 
    'brouillards_treso', 
    'config_ecritures_lignes', 
    'config_ecritures_auto', 
    'payment_methods', 
    'inventory_items', 
    'inventories', 
    'stock_movements', 
    'sale_items', 
    'sales', 
    'purchase_items',               // ✨ AJOUTÉ : Lignes d'achats d'articles
    'purchases',                    // ✨ AJOUTÉ : Entêtes d'achats d'articles
    'purchase_payments',
    'purchase_orders',
    'purchase_order_items',
    'provisional_sales', 
    'payments', 
    'others_tiers', 
    'suppliers', 
    'customers', 
    'products', 
    'product_groups', 
    'categories', 
    'familles', 
    'audit_log', 
    'staff', 
    'users', 
    'restaurant_tables',            // ✨ AJOUTÉ : Gestion des tables physiques du POS
    'produits_semi_finis',          // ✨ AJOUTÉ : Table technique analytique
    'companies', 
    'unites',
    'cloture_details_paiements', 
    'clotures_caisse', 
    'sync_queue', 
    'compta_queue',                 // ✨ AJOUTÉ : File d'attente du générateur comptable
    
    // 2. TABLES TEMPORAIRES / CACHES (Aucune contrainte de clé étrangère)
    'temporary_carts',
    'temporary_factures_carts',     // ✨ AJOUTÉ : Table réelle de cache de facturation
    'temporary_provisional_carts', 
    'temporary_purchases', 
    'login_attempts'
];


            for (const table of tablesToDrop) {
                try {
                    db.exec(`DROP TABLE IF EXISTS ${table};`);
                } catch (e) {
                    console.error(`❌ Erreur table ${table}:`, e.message);
                }
            }

            db.exec(`PRAGMA foreign_keys = ON;`);
            console.log('✅ RESET DATABASE TERMINÉ');
        }

        // ======================================================
        // 🏗️ CRÉATION DES TABLES
        // ======================================================
        console.log('🏗️ Vérification et création des tables chiffrées...');

        db.exec(`CREATE TABLE IF NOT EXISTS login_attempts (email TEXT NOT NULL, ip_address TEXT NOT NULL, attempt_count INTEGER DEFAULT 0, last_attempt_at DATETIME DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (email, ip_address));`);
        db.exec(`CREATE TABLE IF NOT EXISTS companies (id TEXT PRIMARY KEY, company_code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, email TEXT UNIQUE COLLATE NOCASE, phone TEXT, address TEXT, logo_data TEXT, nif_number TEXT, rccm_number TEXT, default_customer_id TEXT, default_supplier_id TEXT, default_staff_id TEXT, gestion_analytique INTEGER DEFAULT 0, license_type TEXT DEFAULT 'FREE', hardware_mid TEXT,active_modules TEXT DEFAULT '[]', license_key TEXT, expiry_date DATETIME, regime_tva_recuperable INTEGER DEFAULT 1, plan_precision INTEGER DEFAULT 8, last_access_date DATETIME, license_start_date TEXT, sync_status TEXT CHECK(sync_status IN ('pending','synced','error')) DEFAULT 'pending', is_active INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);`);

        db.exec(`CREATE TABLE IF NOT EXISTS payment_methods (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, code TEXT NOT NULL, libelle TEXT NOT NULL, compte_comptable_id TEXT, journal_id TEXT, is_active INTEGER DEFAULT 1, is_pos INTEGER DEFAULT 0, icone_name TEXT DEFAULT 'wallet', sync_status TEXT DEFAULT 'pending', updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE, UNIQUE(company_id, code), UNIQUE(company_id, libelle));`);
      
        db.exec(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT NOT NULL, email TEXT NOT NULL, password TEXT NOT NULL, role TEXT DEFAULT 'admin', company_id TEXT NOT NULL, fonction TEXT, nif TEXT, cnss TEXT, adresse TEXT, permissions TEXT, reset_token TEXT, reset_expires INTEGER, is_temp_password INTEGER DEFAULT 1, is_active INTEGER DEFAULT 1, token_version INTEGER DEFAULT 1, sync_status TEXT DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(email, company_id), FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE);`); 
        
        // Ajout explicite de updated_at sur audit_log pour éviter le crash des triggers s'il est ciblé
        db.exec(`CREATE TABLE IF NOT EXISTS audit_log (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, user_name TEXT, action_type TEXT NOT NULL, table_concernee TEXT NOT NULL, reference_id TEXT, description TEXT, date_action DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, company_id TEXT NOT NULL, sync_status TEXT DEFAULT 'pending', FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE);`);
        db.exec(`CREATE TABLE IF NOT EXISTS staff (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT, email TEXT, adresse TEXT, nif TEXT, cnss TEXT, fonction TEXT, company_id TEXT NOT NULL, is_active INTEGER DEFAULT 1, sync_status TEXT DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE);`);

        // --- STRUCTURE ARTICLES ---
        db.exec(`CREATE TABLE IF NOT EXISTS familles (id TEXT PRIMARY KEY, nom TEXT NOT NULL, company_id TEXT NOT NULL, is_active INTEGER DEFAULT 1, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, sync_status TEXT DEFAULT 'pending', FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE, UNIQUE(nom, company_id));`);
        db.exec(`CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, nom TEXT NOT NULL, famille_id TEXT NOT NULL, company_id TEXT NOT NULL, is_active INTEGER DEFAULT 1, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, sync_status TEXT DEFAULT 'pending', FOREIGN KEY (famille_id) REFERENCES familles(id) ON DELETE CASCADE, FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE, UNIQUE(nom, famille_id, company_id));`);
        db.exec(`CREATE TABLE IF NOT EXISTS product_groups (id TEXT PRIMARY KEY, nom TEXT NOT NULL, category_id TEXT NOT NULL, company_id TEXT NOT NULL, is_active INTEGER DEFAULT 1, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, sync_status TEXT DEFAULT 'pending', FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE, FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE, UNIQUE(nom, category_id, company_id));`);
        db.exec(`CREATE TABLE IF NOT EXISTS unites (id TEXT PRIMARY KEY, code TEXT NOT NULL, libelle TEXT NOT NULL, company_id TEXT NOT NULL, coefficient REAL NOT NULL DEFAULT 1.0, unite_reference TEXT, is_active INTEGER DEFAULT 1, sync_status TEXT DEFAULT 'pending', updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE, UNIQUE(code, company_id));`);
  
        db.exec(`CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, nom TEXT NOT NULL, company_id TEXT NOT NULL, codeBarre TEXT, unite_id TEXT, image_path TEXT, group_id TEXT NOT NULL, cmp REAL DEFAULT 0, prixVente REAL DEFAULT 0, taxeActive INTEGER DEFAULT 0, taxeTaux REAL DEFAULT 0, stock_actuel REAL DEFAULT 0 CHECK (stock_actuel >= 0), stockAlerte REAL DEFAULT 0, is_active INTEGER DEFAULT 1, remiseActive INTEGER DEFAULT 0, r1Active INTEGER DEFAULT 0, r1Seuil REAL DEFAULT 0, r1Montant REAL DEFAULT 0, r1Taux REAL DEFAULT 0, r1IsPromo INTEGER DEFAULT 0, r1DateDebut TEXT, r1DateFin TEXT, r2Active INTEGER DEFAULT 0, r2Seuil REAL DEFAULT 0, r2Montant REAL DEFAULT 0, r2Taux REAL DEFAULT 0, r2IsPromo INTEGER DEFAULT 0, r2DateDebut TEXT, r2DateFin TEXT, r3Active INTEGER DEFAULT 0, r3Multiple REAL DEFAULT 0, r3Montant REAL DEFAULT 0, r3Taux REAL DEFAULT 0, r3IsPromo INTEGER DEFAULT 0, r3DateDebut TEXT, r3DateFin TEXT, r4Active INTEGER DEFAULT 0, r4A_Max REAL DEFAULT 0, r4A_Montant REAL DEFAULT 0, r4A_Taux REAL DEFAULT 0, r4B_Max REAL DEFAULT 0, r4B_Montant REAL DEFAULT 0, r4B_Taux REAL DEFAULT 0, r4C_Montant REAL DEFAULT 0, r4C_Taux REAL DEFAULT 0, r4IsPromo INTEGER DEFAULT 0, r4DateDebut TEXT, r4DateFin TEXT, sync_status TEXT DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (group_id) REFERENCES product_groups(id) ON DELETE RESTRICT, FOREIGN KEY (unite_id) REFERENCES unites(id) ON DELETE SET NULL, FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE);`);
        
        
        db.exec(`
CREATE TABLE IF NOT EXISTS product_paliers (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    company_id TEXT NOT NULL,                  
    quantite REAL NOT NULL CHECK (quantite > 0),
    prix_total REAL NOT NULL CHECK (prix_total >= 0),
    sync_status TEXT DEFAULT 'pending',         
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);
`);

        
        // --- EMBALLAGES (Ordonnés correctement : Parent puis Enfant) ---
        db.exec("CREATE TABLE IF NOT EXISTS packaging_rules (id TEXT PRIMARY KEY, code_regle TEXT NOT NULL, libelle TEXT NOT NULL, company_id TEXT NOT NULL, sync_status TEXT DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE);");
        db.exec("CREATE TABLE IF NOT EXISTS packaging_rule_tiers (id TEXT PRIMARY KEY, rule_id TEXT NOT NULL, jours_min INTEGER NOT NULL CHECK(jours_min >= 0), jours_max INTEGER CHECK(jours_max IS NULL OR jours_max >= jours_min), type_calcul TEXT NOT NULL DEFAULT 'POURCENTAGE_REPRISE' CHECK(type_calcul IN ('POURCENTAGE_REPRISE', 'MONTANT_FIXE_PENALITE', 'CONSIDERE_VENDU')), valeur REAL NOT NULL CHECK(valeur >= 0), company_id TEXT NOT NULL, sync_status TEXT DEFAULT 'pending', updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (rule_id) REFERENCES packaging_rules(id) ON DELETE CASCADE, FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE);");
        db.exec("CREATE TABLE IF NOT EXISTS packaging (id TEXT PRIMARY KEY, nom TEXT NOT NULL, unite_id TEXT NOT NULL, rule_id TEXT, prix_consigne REAL DEFAULT 0, cmp REAL DEFAULT 0, prix_deconsigne REAL DEFAULT 0, prix_achat REAL DEFAULT 0, stock_actuel REAL DEFAULT 0, stock_alerte REAL DEFAULT 0, stock_consigne REAL DEFAULT 0, stock_restitue REAL DEFAULT 0, is_active INTEGER DEFAULT 1, company_id TEXT NOT NULL, sync_status TEXT DEFAULT 'pending', updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (unite_id) REFERENCES unites(id), FOREIGN KEY (rule_id) REFERENCES packaging_rules(id) ON DELETE SET NULL, FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE);");
      
        db.exec("CREATE TABLE IF NOT EXISTS packaging_purchases (id TEXT PRIMARY KEY, packaging_id TEXT NOT NULL, supplier_id TEXT NOT NULL,is_cancelled INTEGER DEFAULT 0, cmp REAL DEFAULT 0, cancelled_at DATETIME, cancelled_by TEXT, motif_annulation TEXT, user_id TEXT NOT NULL, quantite REAL NOT NULL, prix_unitaire REAL NOT NULL, montant_total REAL NOT NULL, facture_ref TEXT, is_active INTEGER DEFAULT 1, is_archive INTEGER DEFAULT 0, company_id TEXT NOT NULL, sync_status TEXT DEFAULT 'pending', updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY (supplier_id) REFERENCES suppliers(id), FOREIGN KEY (user_id) REFERENCES users(id),  FOREIGN KEY (packaging_id) REFERENCES packaging(id) ON DELETE CASCADE, FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE);");
         
        db.exec("CREATE TABLE IF NOT EXISTS packaging_movements (id TEXT PRIMARY KEY, packaging_id TEXT NOT NULL, type_mouvement TEXT NOT NULL, reference_id TEXT, quantite REAL NOT NULL, prix_operation REAL, stock_avant REAL NOT NULL, stock_apres REAL NOT NULL, observation TEXT, user_id TEXT NOT NULL, company_id TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, sync_status TEXT DEFAULT 'pending', FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (packaging_id) REFERENCES packaging(id) ON DELETE CASCADE, FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE);");

        db.exec("CREATE TABLE IF NOT EXISTS packaging_inventories (id TEXT PRIMARY KEY, libelle TEXT NOT NULL, type_inventaire TEXT DEFAULT 'EMBALLAGE_GENERAL' CHECK(type_inventaire IN ('EMBALLAGE_GENERAL', 'EMBALLAGE_PARTIEL')), statut TEXT DEFAULT 'en_cours' CHECK(statut IN ('en_cours', 'valide', 'annule')), valeur_theo_totale REAL DEFAULT 0, valeur_reel_totale REAL DEFAULT 0, valeur_ecart_totale REAL DEFAULT 0, user_id TEXT NOT NULL, company_id TEXT NOT NULL, sync_status TEXT DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, closed_at DATETIME, FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE);");
        db.exec("CREATE TABLE IF NOT EXISTS packaging_inventory_items (id TEXT PRIMARY KEY, id_packaging_inventaire TEXT NOT NULL, packaging_id TEXT NOT NULL, nom_emballage_snap TEXT NOT NULL, prix_achat_snap REAL DEFAULT 0, stock_theorique REAL DEFAULT 0, stock_reel REAL NOT NULL CHECK(stock_reel >= 0), ecart_quantite REAL GENERATED ALWAYS AS (stock_reel - stock_theorique) STORED, ecart_valeur REAL GENERATED ALWAYS AS ((stock_reel - stock_theorique) * prix_achat_snap) STORED, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, user_id TEXT NOT NULL, company_id TEXT NOT NULL, sync_status TEXT DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (id_packaging_inventaire) REFERENCES packaging_inventories(id) ON DELETE CASCADE, FOREIGN KEY (packaging_id) REFERENCES packaging(id), FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE, UNIQUE (id_packaging_inventaire, packaging_id));");
       // 1. D'abord on supprime proprement (Une seule fois au démarrage)

// 2. EN-TÊTE : On recrée immédiatement la table propre
db.exec(`
    CREATE TABLE IF NOT EXISTS flux_emballages (
        id TEXT PRIMARY KEY, 
        company_id TEXT NOT NULL, 
        sale_id TEXT, 
        client_id TEXT, 
        packaging_id TEXT,
        type_flux TEXT NOT NULL CHECK(type_flux IN ('CONSIGNE', 'DECONSIGNE', 'PERTE_CASSE', 'CONSIDERE_VENDU')), 
        reference_document TEXT, 
        statut TEXT DEFAULT 'ACTIF', 
        montant_total REAL DEFAULT 0, 
        montant_reel_paye REAL DEFAULT 0, 
        reste_a_payer REAL DEFAULT 0, 
        montant_penalite REAL DEFAULT 0, 
        montant_rembourse REAL DEFAULT 0, 
        notes TEXT, 
        type_garantie TEXT DEFAULT 'ESPECES' CHECK(type_garantie IN ('ESPECES', 'PHYSIQUE')),
        montant_recu REAL DEFAULT 0,
        garantie_libelle TEXT,
        sync_status TEXT DEFAULT 'pending', 
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP, 
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, 
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE, 
        FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
    );
`);

// 3. DÉTAILS : On recrée la table des lignes
db.exec(`
    CREATE TABLE IF NOT EXISTS flux_emballages_details (
        id TEXT PRIMARY KEY, 
        company_id TEXT NOT NULL, 
        flux_id TEXT NOT NULL, 
        packaging_id TEXT NOT NULL, 
        quantite REAL NOT NULL, 
        quantite_restante REAL DEFAULT 0, 
        prix_unitaire REAL DEFAULT 0, 
        montant_ligne REAL DEFAULT 0, 
        prix_unitaire_deconsigne REAL DEFAULT 0, 
        jours_ecoules INTEGER DEFAULT 0, 
        montant_penalite_unitaire REAL DEFAULT 0, 
        montant_penalite REAL DEFAULT 0, 
        updated_at DATETIME,
        regle_tarifaire_snapshot TEXT, 
         sync_status TEXT DEFAULT 'pending', 
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP, 
        FOREIGN KEY (flux_id) REFERENCES flux_emballages(id) ON DELETE CASCADE, 
        FOREIGN KEY (packaging_id) REFERENCES packaging(id)
    );
`);
  
// ======================================================
// --- ACHATS & VENTES (Tables de base) ---
// ======================================================
db.exec(`CREATE TABLE IF NOT EXISTS suppliers (id TEXT PRIMARY KEY, nom TEXT NOT NULL, nif TEXT DEFAULT 0, contact TEXT, telephone TEXT, email TEXT, adresse TEXT, is_active INTEGER DEFAULT 1, solde_dette REAL DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, company_id TEXT NOT NULL, sync_status TEXT DEFAULT 'pending', FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE, UNIQUE(nom, company_id));`);
db.exec(`CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY, nom TEXT NOT NULL, nif TEXT DEFAULT '0', contact TEXT, telephone TEXT, email TEXT, adresse TEXT, is_active INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, company_id TEXT NOT NULL, sync_status TEXT DEFAULT 'pending', FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE, UNIQUE(telephone, company_id));`);
db.exec(`CREATE TABLE IF NOT EXISTS sales (id TEXT PRIMARY KEY, lot_id TEXT, mode_reglement TEXT, customer_id TEXT, nom_client_snap TEXT DEFAULT 'CLIENT AU COMPTANT', date_vente DATETIME DEFAULT CURRENT_TIMESTAMP, observation TEXT, statut_vente TEXT CHECK(statut_vente IN ('BROUILLON','VALIDEE','ANNULEE','RETOUR')) DEFAULT 'BROUILLON', montant_total REAL DEFAULT 0, montant_paye REAL DEFAULT 0, reste_a_payer REAL DEFAULT 0, payment_status TEXT, user_id TEXT NOT NULL, caissier_id TEXT, staff_id TEXT, staff_name_snap TEXT, table_id TEXT, table_name_snap TEXT, company_id TEXT NOT NULL, is_active INTEGER DEFAULT 1, is_archived INTEGER DEFAULT 0, is_comptabilise INTEGER DEFAULT 0, is_solde INTEGER DEFAULT 0, sync_status TEXT DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE, FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (caissier_id) REFERENCES users(id), FOREIGN KEY (table_id) REFERENCES restaurant_tables(id) ON DELETE SET NULL);`);



db.exec("CREATE TABLE IF NOT EXISTS sale_items (id TEXT PRIMARY KEY, lot_id TEXT, id_vente TEXT NOT NULL, customer_id TEXT, type_ligne TEXT NOT NULL DEFAULT 'VENTE', product_id TEXT NOT NULL, observation TEXT, is_cloture INTEGER DEFAULT 0, prix_achat_unitaire_snap REAL NOT NULL DEFAULT 0, montant_achat_total_snap REAL NOT NULL DEFAULT 0, nom_article_snap TEXT NOT NULL, quantite REAL NOT NULL, prix_vente_unitaire REAL NOT NULL, remise_montant REAL DEFAULT 0, montant_ht REAL NOT NULL, taxe_montant REAL DEFAULT 0, montant_ttc_ligne REAL NOT NULL, stock_avant_vente REAL DEFAULT 0, stock_apres_vente REAL DEFAULT 0, user_id TEXT NOT NULL, company_id TEXT NOT NULL, is_active INTEGER DEFAULT 1, is_comptabilise INTEGER DEFAULT 0, sync_status TEXT DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (id_vente) REFERENCES sales(id) ON DELETE CASCADE, FOREIGN KEY (product_id) REFERENCES products(id), FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE, CHECK (type_ligne IN ('VENTE', 'RETOUR', 'ANNULEE') AND quantite > 0));");


db.exec(`CREATE TABLE IF NOT EXISTS purchases (id TEXT PRIMARY KEY, lot_id TEXT, supplier_id TEXT NOT NULL, nom_fournisseur_snap TEXT, num_facture TEXT NOT NULL,is_solde INTEGER DEFAULT 0, date_achat DATETIME DEFAULT CURRENT_TIMESTAMP, montant_total REAL DEFAULT 0, montant_paye REAL DEFAULT 0, reste_a_payer REAL DEFAULT 0, payment_status TEXT, mode_reglement TEXT, user_id TEXT NOT NULL, company_id TEXT NOT NULL, is_active INTEGER DEFAULT 1, is_archived INTEGER DEFAULT 0, is_comptabilise INTEGER DEFAULT 0, sync_status TEXT DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (supplier_id) REFERENCES suppliers(id), FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE, FOREIGN KEY (user_id) REFERENCES users(id));`);

db.exec(`CREATE TABLE IF NOT EXISTS purchase_items (id TEXT PRIMARY KEY, lot_id TEXT, id_achat TEXT NOT NULL, type_ligne TEXT NOT NULL DEFAULT 'ACHAT', mouvement_type TEXT DEFAULT 'ACHAT', product_id TEXT NOT NULL, nom_article_snap TEXT NOT NULL, observation TEXT, qte_achetee REAL NOT NULL, prix_achat_unitaire REAL NOT NULL, montant_facture_ligne REAL NOT NULL, montant_ht_ligne REAL DEFAULT 0, montant_tva_ligne REAL DEFAULT 0, stock_avant_achat REAL DEFAULT 0, stock_apres_achat REAL DEFAULT 0, cmp_ancien REAL DEFAULT 0, cmp_nouveau REAL DEFAULT 0, ecart REAL DEFAULT 0, supplier_id TEXT NOT NULL, num_facture TEXT NOT NULL, user_id TEXT NOT NULL, company_id TEXT NOT NULL, is_active INTEGER DEFAULT 1, is_comptabilise INTEGER DEFAULT 0, sync_status TEXT DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (id_achat) REFERENCES purchases(id) ON DELETE CASCADE, FOREIGN KEY (product_id) REFERENCES products(id), FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE, CHECK (type_ligne IN ('ACHAT', 'MOUVEMENT' , 'ANNULATION', 'RETOUR') AND qte_achetee > 0));`);

db.exec("CREATE TABLE IF NOT EXISTS purchase_orders (id TEXT PRIMARY KEY, num_bon TEXT NOT NULL UNIQUE, supplier_id TEXT NOT NULL, total_facture REAL NOT NULL, montant_avance REAL DEFAULT 0, montant_paye REAL DEFAULT 0, reste_a_payer REAL NOT NULL, moyen_reglement TEXT, statut_commande TEXT NOT NULL DEFAULT 'EN_ATTENTE', observations TEXT, date_commande DATETIME NOT NULL, user_id TEXT NOT NULL, company_id TEXT NOT NULL, is_active INTEGER DEFAULT 1, sync_status TEXT DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (supplier_id) REFERENCES suppliers(id), FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE, CHECK (statut_commande IN ('EN_ATTENTE', 'RECEPTIONNE', 'ANNULE')));");
db.exec("CREATE TABLE IF NOT EXISTS purchase_order_items (id TEXT PRIMARY KEY, order_id TEXT NOT NULL, num_bon TEXT NOT NULL, product_id TEXT NOT NULL, nom_article_snap TEXT NOT NULL, observation TEXT, qte_achetee TEXT NOT NULL, quantite_pieces_natives REAL NOT NULL, unit_coefficient REAL NOT NULL, unit_code_gros TEXT NOT NULL, unit_ref_detail TEXT NOT NULL, prix_achat_unitaire REAL NOT NULL, montant_facture_ligne REAL NOT NULL, montant_ht_ligne REAL DEFAULT 0, montant_tva_ligne REAL DEFAULT 0, cmp_ancien REAL DEFAULT 0, ecart REAL DEFAULT 0, user_id TEXT NOT NULL, company_id TEXT NOT NULL, is_active INTEGER DEFAULT 1, sync_status TEXT DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE, FOREIGN KEY (product_id) REFERENCES products(id), FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE, CHECK (quantite_pieces_natives > 0));");


// 2. Création de la nouvelle table avec la structure alignée
db.exec(`
    CREATE TABLE IF NOT EXISTS purchase_payments (
        id TEXT PRIMARY KEY, 
        lot_id TEXT, 
        purchase_id TEXT NOT NULL, 
        is_active INTEGER DEFAULT 1, 
        montant REAL NOT NULL, 
        date_reglement DATETIME DEFAULT CURRENT_TIMESTAMP, 
        mode_reglement TEXT NOT NULL, 
        
        -- 🔑 NOUVEL ALIGNEMENT COMPTABLE --
        statut TEXT DEFAULT 'VALIDEE',                 -- Reste toujours 'VALIDEE' (sauf si 'ANNULEE')
        reference_paiement TEXT DEFAULT 'COMPTANT',    -- Reçoit 'COMPTANT', 'ACOMPTE', 'REGLEMENT', 'REMBOURSEMENT'
        
        user_id TEXT NOT NULL, 
        company_id TEXT NOT NULL, 
        sync_status TEXT DEFAULT 'pending', 
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP, 
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, 
        is_solde INTEGER DEFAULT 0, 
        
        FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE, 
        FOREIGN KEY (user_id) REFERENCES users(id), 
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );
`);

  



// Correction syntaxe type : customer_id TEXT
db.exec(`CREATE TABLE IF NOT EXISTS provisional_sales (id TEXT PRIMARY KEY, lot_id TEXT, id_vente TEXT, customer_id TEXT, nom_client_snap TEXT, staff_id TEXT, staff_name_snap TEXT, table_id TEXT, table_name_snap TEXT,prix_achat_unitaire_snap REAL NOT NULL DEFAULT 0,montant_achat_total_snap REAL NOT NULL DEFAULT 0, product_id TEXT NOT NULL, nom_article_snap TEXT NOT NULL, quantite REAL NOT NULL, prix_vente_unitaire REAL NOT NULL, remise_montant REAL DEFAULT 0, montant_ht REAL NOT NULL, taxe_montant REAL DEFAULT 0, montant_ttc_ligne REAL NOT NULL, stock_avant_vente REAL DEFAULT 0, stock_apres_vente REAL DEFAULT 0, is_archived INTEGER DEFAULT 0, user_id TEXT NOT NULL, company_id TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, date_vente DATETIME DEFAULT CURRENT_TIMESTAMP, sync_status TEXT DEFAULT 'pending', FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE, FOREIGN KEY (product_id) REFERENCES products(id), FOREIGN KEY (table_id) REFERENCES restaurant_tables(id) ON DELETE SET NULL);`);


db.exec(`CREATE TABLE IF NOT EXISTS restaurant_tables (id TEXT PRIMARY KEY, name TEXT NOT NULL, numero INTEGER, zone TEXT, statut TEXT CHECK(statut IN ('LIBRE', 'OCCUPEE', 'RESERVEE')) DEFAULT 'LIBRE', company_id TEXT NOT NULL, is_active INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, sync_status TEXT DEFAULT 'PENDING', FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE);`);

// ======================================================
// --- EMBALLAGES TRAÇABILITÉ (Placée après 'sales') ---
// ======================================================

// ======================================================
// --- CAISSE & ENCAISSEMENTS ---
// ======================================================
db.exec(`CREATE TABLE IF NOT EXISTS clotures_caisse (id TEXT PRIMARY KEY, caissier_id TEXT NOT NULL, date_ouverture DATETIME DEFAULT CURRENT_TIMESTAMP, date_cloture DATETIME, solde_ouverture REAL DEFAULT 0, total_theorique_global REAL DEFAULT 0, total_reel_global REAL DEFAULT 0, ecart_global REAL DEFAULT 0, created_by TEXT DEFAULT 'user', statut TEXT CHECK(statut IN ('OUVERT', 'VALIDE', 'ANNULE')) DEFAULT 'OUVERT', is_late_cloture INTEGER DEFAULT 0, observation TEXT, company_id TEXT NOT NULL, sync_status TEXT DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (caissier_id) REFERENCES users(id), FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE);`);
db.exec(`CREATE TABLE IF NOT EXISTS cloture_details_paiements (id TEXT PRIMARY KEY, cloture_id TEXT NOT NULL, payment_method_id TEXT NOT NULL, created_by TEXT DEFAULT 'user', montant_theorique REAL DEFAULT 0 CHECK(montant_theorique >= 0), montant_reel REAL DEFAULT 0 CHECK(montant_reel >= 0), ecart REAL GENERATED ALWAYS AS (montant_reel - montant_theorique) STORED, commentaire_detaille TEXT, company_id TEXT NOT NULL, sync_status TEXT DEFAULT 'pending', updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (cloture_id) REFERENCES clotures_caisse(id) ON DELETE CASCADE, FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id), FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE);`);
 
// Placé après clotures_caisse pour sa clé étrangère
db.exec(`CREATE TABLE IF NOT EXISTS payments (id TEXT PRIMARY KEY, lot_id TEXT, sale_id TEXT NOT NULL, cloture_id TEXT, payment_method_id TEXT, type_paiement TEXT DEFAULT 'COMPTANT', is_cloture INTEGER DEFAULT 0, customer_id TEXT, client_name TEXT, montant REAL DEFAULT 0, is_active INTEGER DEFAULT 1, recu REAL DEFAULT 0, rendu REAL DEFAULT 0, moyen_paiement TEXT, statut TEXT DEFAULT 'VALIDEE', user_id TEXT NOT NULL, caissier_id TEXT, staff_id TEXT, staff_name_snap TEXT, company_id TEXT NOT NULL, sync_status TEXT DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE, FOREIGN KEY (cloture_id) REFERENCES clotures_caisse(id), FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id), FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE, FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (caissier_id) REFERENCES users(id));`);

// ======================================================
// --- STOCK & INVENTAIRES ---
// ======================================================

db.exec(`CREATE TABLE IF NOT EXISTS stock_movements (id TEXT PRIMARY KEY, product_id TEXT NOT NULL, type_mouvement TEXT NOT NULL, reference_id TEXT, quantite REAL NOT NULL, stock_avant REAL NOT NULL, stock_apres REAL NOT NULL CHECK (stock_apres >= 0), prix_operation REAL, cmp_resultat REAL, user_id TEXT NOT NULL, company_id TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, sync_status TEXT DEFAULT 'pending', FOREIGN KEY (product_id) REFERENCES products(id), FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE, FOREIGN KEY (user_id) REFERENCES users(id));`);
db.exec(`CREATE TABLE IF NOT EXISTS inventories (id TEXT PRIMARY KEY, libelle TEXT, type_inventaire TEXT DEFAULT 'GENERAL', statut TEXT DEFAULT 'en_cours', valeur_theo_totale REAL DEFAULT 0, valeur_reel_totale REAL DEFAULT 0, valeur_ecart_totale REAL DEFAULT 0, user_id TEXT NOT NULL, company_id TEXT NOT NULL, sync_status TEXT DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, closed_at DATETIME, FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE);`);

db.exec(`CREATE TABLE IF NOT EXISTS inventory_items (
    id TEXT PRIMARY KEY, 
    id_inventaire TEXT NOT NULL, 
    product_id TEXT NOT NULL, 
    nom_article_snap TEXT NOT NULL, 
    prix_achat_snap REAL DEFAULT 0,
     
    stock_theorique REAL DEFAULT 0, 
    stock_reel REAL NOT NULL, 
    prixVente_snap REAL DEFAULT 0,
    
    -- L'écart de quantité peut rester en GENERATED car il utilise des colonnes internes
    ecart_quantite REAL GENERATED ALWAYS AS (stock_reel - stock_theorique) STORED, 
    
    -- 🚀 CHANGEMENT : Devient une colonne classique pour stocker la valeur figée et immuable par le backend
    ecart_valeur REAL DEFAULT 0, 
    
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, 
    user_id TEXT NOT NULL, 
    company_id TEXT NOT NULL, 
    sync_status TEXT DEFAULT 'pending', 
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, 
    FOREIGN KEY (id_inventaire) REFERENCES inventories(id) ON DELETE CASCADE, 
    FOREIGN KEY (product_id) REFERENCES products(id), 
    FOREIGN KEY (user_id) REFERENCES users(id), 
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE, 
    UNIQUE (id_inventaire, product_id)
);`);

// Exécutez ceci juste après le CREATE TABLE de 'inventory_items'
try {
    // Notez le V majuscule pour rester aligné avec 'prixVente' de la table products
    db.exec(`ALTER TABLE inventory_items ADD COLUMN prixVente_snap REAL DEFAULT 0;`);
} catch (e) {
    console.log("La colonne prixVente_snap existe déjà :", e.message);
}


        // 2. Détail des Ajustements

  // ==========================================
// STEP 1 : NETTOYAGE (À supprimer après le premier démarrage réussi)
// ==========================================


// ==========================================
// STEP 2 : CRÉATION DE TOUTES VOS TABLES (L'ordre est important !)
// ==========================================

// A. Création de la table parente
db.exec(`
CREATE TABLE IF NOT EXISTS stock_adjustments (
    id TEXT PRIMARY KEY,
    libelle TEXT NOT NULL,
    type_ajustement TEXT NOT NULL CHECK (type_ajustement IN ('AVARIE', 'BRISE', 'TRANSFERT')),
    statut TEXT DEFAULT 'VALIDE' CHECK (statut IN ('BROUILLON', 'VALIDE', 'ANNULE')),
    motif TEXT,
    valeur_totale REAL DEFAULT 0,
    entrepot_depart_id TEXT,
    entrepot_arrivee_id TEXT,
    user_id TEXT NOT NULL,
    company_id TEXT NOT NULL,
    sync_status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    closed_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);
`);

// B. Création de la table enfant corrigée
db.exec(`
CREATE TABLE IF NOT EXISTS stock_adjustment_items (
    id TEXT PRIMARY KEY,
    adjustment_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    nom_article_snap TEXT NOT NULL,
    prix_achat_snap REAL DEFAULT 0,
    prix_vente_snap REAL DEFAULT 0,
    unite_snap TEXT,
    quantite REAL NOT NULL CHECK (quantite > 0),
    stock_avant REAL DEFAULT 0,
    stock_apres REAL DEFAULT 0,
    valeur_ligne REAL DEFAULT 0,
    company_id TEXT NOT NULL, -- 🚀 Colonne obligatoire présente dès la création
    sync_status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (adjustment_id) REFERENCES stock_adjustments(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    UNIQUE (adjustment_id, product_id)
);
`);

// ======================================================
// --- ANALYTIQUE ---
// ======================================================
db.exec(`CREATE TABLE IF NOT EXISTS departements (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, code_analytique TEXT NOT NULL, nom TEXT NOT NULL, is_deleted INTEGER DEFAULT 0, sync_status TEXT DEFAULT 'pending', updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(code_analytique, company_id));`);
db.exec(`CREATE TABLE IF NOT EXISTS plan_analytique (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, parent_dept_id TEXT NOT NULL, code TEXT NOT NULL, libelle TEXT NOT NULL, is_deleted INTEGER DEFAULT 0, sync_status TEXT DEFAULT 'pending', updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (parent_dept_id) REFERENCES departements(id), UNIQUE(code, company_id));`);

// Création préventive au cas où la table n'existerait pas ailleurs
db.exec(`CREATE TABLE IF NOT EXISTS produits_semi_finis (id TEXT PRIMARY KEY);`);

db.exec(`CREATE TABLE IF NOT EXISTS analytique_details (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, plan_analytique_id TEXT NOT NULL, product_id TEXT NULL, semi_fini_id TEXT NULL, code TEXT NOT NULL, libelle TEXT NOT NULL, compte_analytique TEXT, montant_base_theorique REAL DEFAULT 0, qte_base_production REAL DEFAULT 1, is_deleted INTEGER DEFAULT 0, sync_status TEXT DEFAULT 'pending', updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(plan_analytique_id) REFERENCES plan_analytique(id) ON DELETE CASCADE, FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE, FOREIGN KEY(semi_fini_id) REFERENCES produits_semi_finis(id) ON DELETE CASCADE, FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE);`);

// ======================================================
// --- COMPTABILITÉ ---
// ======================================================
db.exec(`CREATE TABLE IF NOT EXISTS exercices (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, libelle TEXT NOT NULL, date_debut DATE NOT NULL, date_fin DATE NOT NULL, statut TEXT CHECK(statut IN ('OUVERT', 'CLOTURE', 'PRE_CLOTURE')) DEFAULT 'OUVERT', date_cloture DATETIME, user_cloture TEXT, sync_status TEXT CHECK(sync_status IN ('pending', 'synced', 'error')) DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE);`);
db.exec(`CREATE TABLE IF NOT EXISTS plan_comptable (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, numero_compte TEXT NOT NULL, intitule TEXT NOT NULL, classe INTEGER NOT NULL, nature TEXT CHECK(nature IN ('ACTIF','PASSIF','CHARGE','PRODUIT')) NOT NULL, type_etat TEXT CHECK(type_etat IN ('BILAN','RESULTAT')) NOT NULL, sens_normal TEXT CHECK(sens_normal IN ('DEBIT','CREDIT')) NOT NULL, type_compte TEXT, parent_id TEXT, niveau INTEGER, lettrable BOOLEAN DEFAULT 0, rapprochement_bancaire BOOLEAN DEFAULT 0, actif BOOLEAN DEFAULT 1, sync_status TEXT DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(parent_id) REFERENCES plan_comptable(id) ON DELETE SET NULL, FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE, UNIQUE(numero_compte, company_id));`);
db.exec(`CREATE TABLE IF NOT EXISTS plan_tiers (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, compte_collectif_id TEXT NOT NULL, numero_tiers TEXT NOT NULL, nom TEXT NOT NULL, type_tiers TEXT CHECK(type_tiers IN ('CLIENT','FOURNISSEUR','SALARIE','AUTRE')), delai_paiement INTEGER DEFAULT 0, reference_id TEXT, sync_status TEXT DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(compte_collectif_id) REFERENCES plan_comptable(id), FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE, UNIQUE(numero_tiers, company_id));`);
db.exec(`CREATE TABLE IF NOT EXISTS rubriques_etats (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, code TEXT, libelle TEXT, type_etat TEXT CHECK(type_etat IN ('BILAN','RESULTAT')) NOT NULL, parent_id TEXT, ordre INTEGER, sync_status TEXT DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(parent_id) REFERENCES rubriques_etats(id) ON DELETE CASCADE, FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE);`);
db.exec(`CREATE TABLE IF NOT EXISTS mapping_comptes_rubriques (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, compte_id TEXT NOT NULL, rubrique_id TEXT NOT NULL, sens TEXT CHECK(sens IN ('DEBIT','CREDIT','SOLDE')) DEFAULT 'SOLDE', sync_status TEXT DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(compte_id) REFERENCES plan_comptable(id) ON DELETE CASCADE, FOREIGN KEY(rubrique_id) REFERENCES rubriques_etats(id) ON DELETE CASCADE, FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE);`);
db.exec(`CREATE TABLE IF NOT EXISTS journaux (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, code TEXT NOT NULL, libelle TEXT NOT NULL, type_journal TEXT CHECK(type_journal IN ('ACHAT', 'VENTE', 'TRESORERIE', 'GENERAL', 'STOCKS', 'CAISSE', 'BANQUE', 'OD')), compte_contrepartie_id TEXT, compte_treso_id TEXT, contrepartie_auto INTEGER DEFAULT 0, mode_numerotation TEXT CHECK(mode_numerotation IN ('AUTO', 'MANUEL')) DEFAULT 'AUTO', prefixe_piece TEXT, compteur_piece INTEGER DEFAULT 1, compteur_brouillon INTEGER DEFAULT 1, longueur_compteur INTEGER DEFAULT 4, actif BOOLEAN DEFAULT 1, sync_status TEXT DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE, FOREIGN KEY(compte_contrepartie_id) REFERENCES plan_comptable(id), FOREIGN KEY(compte_treso_id) REFERENCES plan_comptable(id), UNIQUE(code, company_id));`);

db.exec(`CREATE TABLE IF NOT EXISTS ecritures (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, journal_id TEXT NOT NULL, exercice_id TEXT NOT NULL, date_ecriture DATE NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, piece TEXT, reference TEXT, ref_brouillon TEXT, libelle TEXT, user_saisie TEXT, is_deleted INTEGER DEFAULT 0, deleted_at DATETIME DEFAULT NULL, sync_status TEXT CHECK(sync_status IN ('pending','synced','error')) DEFAULT 'pending', updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(journal_id) REFERENCES journaux(id) ON DELETE CASCADE, FOREIGN KEY(exercice_id) REFERENCES exercices(id) ON DELETE CASCADE, FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE, UNIQUE(company_id, journal_id, exercice_id, piece));`);
db.exec(`CREATE TABLE IF NOT EXISTS lignes_ecritures (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, ecriture_id TEXT, journal_id TEXT NOT NULL, exercice_id TEXT NOT NULL, date_ecriture DATE NOT NULL, date_echeance DATE, piece TEXT NOT NULL, facture TEXT, reference TEXT, compte_id TEXT NOT NULL, num_compte TEXT NOT NULL, num_tiers TEXT, libelle TEXT, debit REAL DEFAULT 0, credit REAL DEFAULT 0, lettre TEXT, date_lettrage DATE, is_ventilated INTEGER DEFAULT 0, is_deleted INTEGER DEFAULT 0, deleted_at DATETIME DEFAULT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, sync_status TEXT CHECK(sync_status IN ('pending','synced','error')) DEFAULT 'pending', FOREIGN KEY(ecriture_id) REFERENCES ecritures(id) ON DELETE CASCADE, FOREIGN KEY(compte_id) REFERENCES plan_comptable(id) ON DELETE CASCADE, FOREIGN KEY(journal_id) REFERENCES journaux(id), FOREIGN KEY(exercice_id) REFERENCES exercices(id));`);

db.exec(`CREATE TABLE IF NOT EXISTS lignes_analytiques (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, ligne_ecriture_id TEXT NOT NULL, plan_analytique_id TEXT NOT NULL, departement_id TEXT NOT NULL, num_compte TEXT, montant REAL NOT NULL, sync_status TEXT DEFAULT 'pending', updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(ligne_ecriture_id) REFERENCES lignes_ecritures(id) ON DELETE CASCADE, FOREIGN KEY(plan_analytique_id) REFERENCES plan_analytique(id) ON DELETE CASCADE, FOREIGN KEY(departement_id) REFERENCES departements(id) ON DELETE CASCADE, FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE);`);
db.exec(`CREATE TABLE IF NOT EXISTS brouillon_lignes_analytiques (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, ligne_brouillon_id TEXT NOT NULL, plan_analytique_id TEXT NOT NULL, departement_id TEXT NOT NULL, num_compte TEXT, montant REAL NOT NULL, sync_status TEXT DEFAULT 'pending', updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(ligne_brouillon_id) REFERENCES brouillon_lignes(id) ON DELETE CASCADE, FOREIGN KEY(plan_analytique_id) REFERENCES plan_analytique(id) ON DELETE CASCADE, FOREIGN KEY(departement_id) REFERENCES departements(id) ON DELETE CASCADE, FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE);`);
db.exec("CREATE TABLE IF NOT EXISTS analytique_config_comptes (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, compte_general_id TEXT NOT NULL, mode_saisie TEXT CHECK(mode_saisie IN ('AUTO', 'MANUEL')) DEFAULT 'MANUEL', montant_base REAL DEFAULT 0, description TEXT, is_active INTEGER DEFAULT 1, is_deleted INTEGER DEFAULT 0, sync_status TEXT DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(compte_general_id) REFERENCES plan_comptable(id) ON DELETE CASCADE, FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE, UNIQUE(compte_general_id, company_id));");
db.exec("CREATE TABLE IF NOT EXISTS analytique_auto_repartition (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, config_id TEXT NOT NULL, plan_analytique_id TEXT NOT NULL, pourcentage REAL, montant REAL, is_active INTEGER DEFAULT 1, is_deleted INTEGER DEFAULT 0, sync_status TEXT DEFAULT 'pending', updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(config_id) REFERENCES analytique_config_comptes(id) ON DELETE CASCADE, FOREIGN KEY(plan_analytique_id) REFERENCES plan_analytique(id) ON DELETE CASCADE);");
db.exec(`CREATE TABLE IF NOT EXISTS others_tiers (id TEXT PRIMARY KEY, nom TEXT NOT NULL, nif TEXT DEFAULT '0', contact TEXT, telephone TEXT, email TEXT, adresse TEXT, is_active INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, company_id TEXT NOT NULL, sync_status TEXT DEFAULT 'pending', FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE, UNIQUE(nom, company_id));`);
db.exec(`CREATE TABLE IF NOT EXISTS brouillon_ecritures (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, journal_id TEXT NOT NULL, exercice_id TEXT NOT NULL, date_ecriture DATE NOT NULL, piece_provisoire TEXT, libelle TEXT, user_saisie TEXT, statut TEXT CHECK(statut IN ('EN_ATTENTE', 'VALIDE', 'REJETE')) DEFAULT 'EN_ATTENTE', observation TEXT, reference TEXT, ref_brouillon TEXT, is_deleted INTEGER DEFAULT 0, deleted_at DATETIME DEFAULT NULL, sync_status TEXT CHECK(sync_status IN ('pending','synced','error')) DEFAULT 'pending', updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(journal_id) REFERENCES journaux(id) ON DELETE CASCADE, FOREIGN KEY(exercice_id) REFERENCES exercices(id) ON DELETE CASCADE, FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE);`);
db.exec(`CREATE TABLE IF NOT EXISTS brouillon_lignes (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, brouillon_id TEXT NOT NULL, journal_id TEXT NOT NULL, exercice_id TEXT NOT NULL, date_ecriture DATE NOT NULL, piece_provisoire TEXT, is_ventilated INTEGER DEFAULT 0, facture TEXT, reference TEXT, ref_brouillon TEXT, compte_id TEXT NOT NULL, num_compte TEXT NOT NULL, num_tiers TEXT, libelle TEXT, debit REAL DEFAULT 0, credit REAL DEFAULT 0, date_echeance DATE, statut TEXT CHECK(statut IN ('EN_ATTENTE', 'VALIDE', 'REJETE')) DEFAULT 'EN_ATTENTE', observation TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, sync_status TEXT CHECK(sync_status IN ('pending','synced','error')) DEFAULT 'pending', updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(brouillon_id) REFERENCES brouillon_ecritures(id) ON DELETE CASCADE, FOREIGN KEY(compte_id) REFERENCES plan_comptable(id) ON DELETE CASCADE, FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE);`);

db.exec(`CREATE TABLE IF NOT EXISTS reports_a_nouveau (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, exercice_id TEXT NOT NULL, compte_id TEXT NOT NULL, num_tiers TEXT, num_compte TEXT NOT NULL, montant_debit REAL DEFAULT 0, montant_credit REAL DEFAULT 0, type_report TEXT CHECK(type_report IN ('PROVISOIRE', 'DEFINITIF')) DEFAULT 'PROVISOIRE', user_id TEXT, user_name TEXT, sync_status TEXT DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (compte_id) REFERENCES plan_comptable(id) ON DELETE CASCADE, FOREIGN KEY (exercice_id) REFERENCES exercices(id) ON DELETE CASCADE, FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE);`); 
db.exec(`CREATE TABLE IF NOT EXISTS config_ecritures_auto (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, code_evenement TEXT NOT NULL, condition_reglement TEXT, type_operation TEXT, libelle_evenement TEXT, code_flux TEXT, compte_debit_id TEXT, compte_credit_id TEXT, table_source TEXT, journal_id TEXT, libelle_auto TEXT, mode_ecriture TEXT CHECK (mode_ecriture IN ('BROUILLON','DIRECT')) DEFAULT 'BROUILLON', sync_status TEXT CHECK (sync_status IN ('pending','synced','error')) DEFAULT 'pending', updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE, FOREIGN KEY (compte_debit_id) REFERENCES plan_comptable(id), FOREIGN KEY (compte_credit_id) REFERENCES plan_comptable(id), FOREIGN KEY (journal_id) REFERENCES journaux(id), UNIQUE (code_evenement, company_id, type_operation, condition_reglement));`);
db.exec(`CREATE TABLE IF NOT EXISTS config_ecritures_lignes (id TEXT PRIMARY KEY, config_id TEXT NOT NULL, filtre_colonne TEXT, filtre_valeur TEXT, journal_id TEXT, is_tiers INTEGER DEFAULT 0, label_ligne TEXT, compte_id TEXT, sens TEXT CHECK (sens IN ('DEBIT','CREDIT')), colonne_source TEXT, type_valeur TEXT CHECK (type_valeur IN ('COLONNE','FIXE')) DEFAULT 'COLONNE', company_id TEXT NOT NULL, sync_status TEXT CHECK (sync_status IN ('pending','synced','error')) DEFAULT 'pending', updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (config_id) REFERENCES config_ecritures_auto(id) ON DELETE CASCADE, FOREIGN KEY (compte_id) REFERENCES plan_comptable(id), FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE);`);

// ======================================================
// --- TRÉSORERIE & BROUILLARDS ---
// ======================================================
db.exec(`CREATE TABLE IF NOT EXISTS brouillards_treso (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, journal_id TEXT NOT NULL, journal_brouillon_id TEXT, compte_treso_id TEXT NOT NULL, libelle TEXT NOT NULL, type TEXT CHECK(type IN ('CAISSE','BANQUE')) NOT NULL, mode_fonctionnement TEXT CHECK(mode_fonctionnement IN ('DIRECT','DEMANDE')) DEFAULT 'DIRECT', sortie_directe INTEGER DEFAULT 0, mode_ecriture TEXT CHECK(mode_ecriture IN ('BROUILLON','DIRECT')) DEFAULT 'BROUILLON', seuil_validation INTEGER DEFAULT 1, niv1_actif INTEGER DEFAULT 0, niv1_user_id TEXT, niv2_actif INTEGER DEFAULT 0, niv2_user_id TEXT, niv3_actif INTEGER DEFAULT 0, niv3_user_id TEXT, niv4_actif INTEGER DEFAULT 0, niv4_user_id TEXT, solde_initial REAL DEFAULT 0, solde_actuel REAL DEFAULT 0, actif INTEGER DEFAULT 1, sync_status TEXT DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE, FOREIGN KEY(journal_id) REFERENCES journaux(id) ON DELETE CASCADE, FOREIGN KEY(journal_brouillon_id) REFERENCES journaux(id), FOREIGN KEY(compte_treso_id) REFERENCES plan_comptable(id), FOREIGN KEY(niv1_user_id) REFERENCES users(id), FOREIGN KEY(niv2_user_id) REFERENCES users(id), FOREIGN KEY(niv3_user_id) REFERENCES users(id), FOREIGN KEY(niv4_user_id) REFERENCES users(id));`);
db.exec(`CREATE TABLE IF NOT EXISTS brouillard_lignes_treso (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, brouillard_id TEXT NOT NULL, journal_id TEXT NOT NULL, exercice_id TEXT NOT NULL, user_id TEXT, date_mouvement DATE NOT NULL, libelle TEXT NOT NULL, piece_ref TEXT, type_flux TEXT CHECK(type_flux IN ('ENCAISSEMENT','DECAISSEMENT')) NOT NULL, montant REAL NOT NULL CHECK(montant > 0), statut TEXT CHECK(statut IN ('BROUILLON','EN_ATTENTE','APPROUVE','VALIDE','REJETE')) DEFAULT 'BROUILLON', motif_annulation TEXT, v1_statut INTEGER DEFAULT 0, v1_date DATETIME, v1_user_id TEXT, v2_statut INTEGER DEFAULT 0, v2_date DATETIME, v2_user_id TEXT, v3_statut INTEGER DEFAULT 0, v3_date DATETIME, v3_user_id TEXT, v4_statut INTEGER DEFAULT 0, v4_date DATETIME, v4_user_id TEXT, ecriture_id TEXT, brouillon_ecriture_id TEXT, piece_comptable TEXT, comptabilise INTEGER DEFAULT 0, sync_status TEXT DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(brouillard_id) REFERENCES brouillards_treso(id) ON DELETE CASCADE, FOREIGN KEY(journal_id) REFERENCES journaux(id), FOREIGN KEY(exercice_id) REFERENCES exercices(id), FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL, FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE, FOREIGN KEY(ecriture_id) REFERENCES ecritures(id) ON DELETE SET NULL, FOREIGN KEY(brouillon_ecriture_id) REFERENCES brouillon_ecritures(id) ON DELETE SET NULL);`);
db.exec(`CREATE TABLE IF NOT EXISTS brouillard_affectations (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, brouillard_id TEXT NOT NULL, user_id TEXT NOT NULL, peut_saisir INTEGER DEFAULT 1, peut_valider INTEGER DEFAULT 0, sync_status TEXT DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(brouillard_id) REFERENCES brouillards_treso(id) ON DELETE CASCADE, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE, UNIQUE(brouillard_id, user_id, company_id));`);
  // ======================================================
// --- QUEUES ASYNCHRONES & REQUÊTES UTILITAIRES ---
// ======================================================
db.exec(`CREATE TABLE IF NOT EXISTS compta_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id TEXT NOT NULL,
    table_source TEXT NOT NULL,
    record_id TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    error_log TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);`);

db.exec(`CREATE TABLE IF NOT EXISTS sync_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT, 
    table_name TEXT NOT NULL, 
    record_id TEXT NOT NULL, 
    operation TEXT NOT NULL, 
    company_id TEXT NOT NULL, 
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);`);

// ======================================================
// --- TABLES DE PANIERS TEMPORAIRES (CACHES OFFLINE) ---
// ======================================================
db.exec(`CREATE TABLE IF NOT EXISTS temporary_carts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, company_id TEXT NOT NULL, lignes TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, sync_status TEXT DEFAULT 'pending', UNIQUE(user_id, company_id));`);
db.exec(`CREATE TABLE IF NOT EXISTS temporary_factures_carts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, company_id TEXT NOT NULL, lignes TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, sync_status TEXT DEFAULT 'pending', UNIQUE(user_id, company_id));`);
db.exec(`CREATE TABLE IF NOT EXISTS temporary_provisional_carts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, company_id TEXT NOT NULL, lignes TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, sync_status TEXT DEFAULT 'pending', UNIQUE(user_id, company_id));`);
db.exec(`CREATE TABLE IF NOT EXISTS temporary_purchases (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, company_id TEXT NOT NULL, cart_type TEXT, items TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, sync_status TEXT DEFAULT 'pending', UNIQUE(user_id, company_id, cart_type));`);

// ======================================================
// --- TRIGGERS MÉTIERS (Sécurisés contre la récursion) ---
// ======================================================
db.exec(`
CREATE TRIGGER IF NOT EXISTS trg_update_is_solde
AFTER UPDATE OF reste_a_payer ON sales
FOR EACH ROW
WHEN NEW.reste_a_payer IS NOT OLD.reste_a_payer
BEGIN
    UPDATE sales 
    SET is_solde = CASE WHEN NEW.reste_a_payer <= 0 THEN 1 ELSE 0 END,
        payment_status = CASE WHEN NEW.reste_a_payer <= 0 THEN 'SOLDE' ELSE 'PARTIEL' END,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
END;
`);
db.exec(`DROP TRIGGER IF EXISTS trg_purchases_update_is_solde;`);

db.exec(`
CREATE TRIGGER IF NOT EXISTS trg_purchases_update_is_solde
AFTER UPDATE OF reste_a_payer ON purchases
FOR EACH ROW
WHEN NEW.reste_a_payer IS NOT OLD.reste_a_payer
BEGIN
    UPDATE purchases 
    SET is_solde = CASE WHEN NEW.reste_a_payer <= 0 THEN 1 ELSE 0 END,
        payment_status = CASE WHEN NEW.reste_a_payer <= 0 THEN 'payé' ELSE 'partiel' END,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
END;
`);
// ======================================================
// --- VUES COMPTABLES, LOGISTIQUES & ANALYTIQUES ---
// ======================================================
db.exec(`DROP VIEW IF EXISTS vue_chiffre_affaires;`);
db.exec(`
    CREATE VIEW IF NOT EXISTS vue_chiffre_affaires AS 
    SELECT 
        si.company_id, 
        date(s.date_vente) AS date_jour, 
        COUNT(DISTINCT si.lot_id) AS nombre_ventes, 
        SUM(CASE WHEN si.type_ligne = 'VENTE' AND s.statut_vente = 'VALIDEE' THEN si.montant_ttc_ligne ELSE 0 END) AS ca_brut, 
        SUM(CASE WHEN si.type_ligne = 'RETOUR' THEN si.montant_ttc_ligne ELSE 0 END) AS total_avoirs, 
        SUM(CASE WHEN s.statut_vente IN ('VALIDEE','RETOUR') THEN si.montant_ttc_ligne ELSE 0 END) AS ca_net 
    FROM sale_items si
    INNER JOIN sales s ON si.id_vente = s.id
    WHERE si.is_active = 1 
    GROUP BY si.company_id, date(s.date_vente);
`);

db.exec(`DROP VIEW IF EXISTS balance_comptable;`);
db.exec(`DROP VIEW IF EXISTS vue_controle_analytique;`);
db.exec(`
    CREATE VIEW vue_controle_analytique AS 
    SELECT 
        le.id AS ligne_id, 
        le.num_compte, 
        le.libelle, 
        (ABS(le.debit) + ABS(le.credit)) AS montant_general, 
        IFNULL(SUM(la.montant), 0) AS montant_analytique, 
        (ABS(le.debit) + ABS(le.credit) - IFNULL(SUM(la.montant), 0)) AS ecart 
    FROM lignes_ecritures le 
    LEFT JOIN lignes_analytiques la ON le.id = la.ligne_ecriture_id 
    WHERE le.is_deleted = 0
    GROUP BY le.id;
`);

db.exec(`DROP VIEW IF EXISTS vue_produits_disponibles;`);
db.exec(`DROP VIEW IF EXISTS vue_rentabilite_analytique;`);
db.exec(`CREATE VIEW vue_rentabilite_analytique AS SELECT d.nom AS departement, pa.libelle AS nature_charge, le.num_compte, le.libelle AS libelle_general, la.montant, le.date_ecriture, la.company_id FROM lignes_analytiques la LEFT JOIN lignes_ecritures le ON la.ligne_ecriture_id = le.id LEFT JOIN plan_analytique pa ON la.plan_analytique_id = pa.id LEFT JOIN departements d ON la.departement_id = d.id;`);
// ======================================================
// --- PLAN D'INDEXATION GLOBAL (Optimisation Index) ---
// ======================================================
 db.exec(`CREATE INDEX IF NOT EXISTS idx_stock_adjustments_company ON stock_adjustments(company_id);`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_stock_adjustments_type ON stock_adjustments(type_ajustement);`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_stock_adjustment_items_adjustment ON stock_adjustment_items(adjustment_id);`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_stock_adjustment_items_product ON stock_adjustment_items(product_id);`);

db.exec(`CREATE INDEX IF NOT EXISTS idx_users_company ON users(company_id);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_products_company ON products(company_id);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_sale_items_id_vente ON sale_items(id_vente);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_ecr_co ON ecritures(company_id);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_sync_queue_table ON sync_queue(table_name);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_departements_company ON departements(company_id);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_lignes_ecr_recherche ON lignes_ecritures(journal_id, exercice_id, date_ecriture);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_plan_tiers_compte ON plan_tiers(compte_collectif_id);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_sale_items_lot ON sale_items(lot_id);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_purchase_items_lot ON purchase_items(lot_id);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_analytique_ligne ON lignes_analytiques(ligne_ecriture_id);`);
// Index pour accélérer les recherches lors de la récupération des détails d'un flux spécifique
db.exec("CREATE INDEX IF NOT EXISTS idx_flux_details_flux_id ON flux_emballages_details(flux_id);");
db.exec("CREATE INDEX IF NOT EXISTS idx_flux_details_packaging_id ON flux_emballages_details(packaging_id);");
// Correction de l'index suite à la nomenclature standard : code_barre

db.exec(`CREATE INDEX IF NOT EXISTS idx_products_lookup ON products(company_id, codeBarre, nom);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id, created_at);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_lignes_ecr_compte_date ON lignes_ecritures(company_id, num_compte, date_ecriture);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_lignes_ecr_lettrage ON lignes_ecritures(company_id, compte_id) WHERE lettre IS NULL;`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_packaging_company ON packaging(company_id);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_packaging_mvts_lookup ON packaging_movements(packaging_id, created_at);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_unites_company ON unites(company_id, is_active);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_packaging_purchases_lookup ON packaging_purchases(packaging_id, supplier_id, company_id);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_cloture_statut ON clotures_caisse(company_id, caissier_id, statut);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_payments_cloture_fk ON payments(cloture_id);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_cloture_details_fk ON cloture_details_paiements(cloture_id);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON purchases(company_id, supplier_id);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_purchases_id_achat ON purchase_items(id_achat);`);

db.exec(`CREATE INDEX IF NOT EXISTS idx_flux_pkg ON flux_emballages (packaging_id, type_flux, company_id);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(company_id, customer_id);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_compta_queue_status ON compta_queue(status, company_id);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(company_id, product_id);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_sync_queue_lookup ON sync_queue(company_id, created_at);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_ran_lookup ON reports_a_nouveau(company_id, exercice_id, num_compte);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_bt_main ON brouillards_treso(company_id, type);`);
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_config_ecr_unique ON config_ecritures_auto(code_evenement, company_id);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_blt_wf ON brouillard_lignes_treso(brouillard_id, statut);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_flux_emballages_company ON flux_emballages(company_id);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_pkg_rule_tiers_lookup ON packaging_rule_tiers(rule_id, jours_min, jours_max);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_packaging_rule_tiers_company ON packaging_rule_tiers(company_id);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_packaging_rule_tiers_sync ON packaging_rule_tiers(sync_status);`);
// ==============================================================================
// 🚀 AJUSTEMENTS FINAUX DE HAUTE PERFORMANCE (LEDI EXPERT PRO)
// ==============================================================================
db.exec(`CREATE INDEX IF NOT EXISTS idx_sales_sync_perf ON sales(company_id, sync_status);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_ecritures_sync_perf ON ecritures(company_id, sync_status);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_lignes_ecr_tiers_perf ON lignes_ecritures(company_id, num_tiers, date_ecriture);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_stock_movements_global ON stock_movements(company_id, product_id, created_at);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_sales_date_index ON sales(company_id, date(date_vente));`);

db.exec("CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders(supplier_id);");
db.exec("CREATE INDEX IF NOT EXISTS idx_purchase_orders_company ON purchase_orders(company_id);");
db.exec("CREATE INDEX IF NOT EXISTS idx_purchase_orders_user ON purchase_orders(user_id);");
db.exec("CREATE INDEX IF NOT EXISTS idx_purchase_orders_date ON purchase_orders(date_commande);");
db.exec("CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(statut_commande);");
db.exec("CREATE INDEX IF NOT EXISTS idx_purchase_orders_company_status ON purchase_orders(company_id, statut_commande);");
db.exec("CREATE INDEX IF NOT EXISTS idx_purchase_orders_company_date ON purchase_orders(company_id, date_commande);");
db.exec("CREATE INDEX IF NOT EXISTS idx_purchase_orders_sync ON purchase_orders(sync_status);");
db.exec("CREATE INDEX IF NOT EXISTS idx_purchase_order_items_order ON purchase_order_items(order_id);");
db.exec("CREATE INDEX IF NOT EXISTS idx_purchase_order_items_product ON purchase_order_items(product_id);");
db.exec("CREATE INDEX IF NOT EXISTS idx_purchase_order_items_company ON purchase_order_items(company_id);");
db.exec("CREATE INDEX IF NOT EXISTS idx_purchase_order_items_user ON purchase_order_items(user_id);");
db.exec("CREATE INDEX IF NOT EXISTS idx_purchase_order_items_num_bon ON purchase_order_items(num_bon);");
db.exec("CREATE INDEX IF NOT EXISTS idx_purchase_order_items_company_product ON purchase_order_items(company_id, product_id);");
db.exec("CREATE INDEX IF NOT EXISTS idx_purchase_order_items_order_product ON purchase_order_items(order_id, product_id);");
db.exec("CREATE INDEX IF NOT EXISTS idx_purchase_order_items_sync ON purchase_order_items(sync_status);");


// Triggers d'emballages
db.exec(`CREATE TRIGGER IF NOT EXISTS trg_packaging_rules_updated_at AFTER UPDATE ON packaging_rules FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at BEGIN UPDATE packaging_rules SET updated_at = CURRENT_TIMESTAMP, sync_status = CASE WHEN OLD.sync_status = 'SYNCED' THEN 'MODIFIED' ELSE OLD.sync_status END WHERE id = OLD.id; END;`);
db.exec(`CREATE TRIGGER IF NOT EXISTS trg_packaging_rule_tiers_updated_at AFTER UPDATE ON packaging_rule_tiers FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at BEGIN UPDATE packaging_rule_tiers SET updated_at = CURRENT_TIMESTAMP, sync_status = CASE WHEN OLD.sync_status = 'SYNCED' THEN 'MODIFIED' ELSE OLD.sync_status END WHERE id = OLD.id; END;`);

// ======================================================
// --- GENERATION DES TRIGGERS AUTOMATIQUES UPDATED_AT ---
// ======================================================
// ==============================================================================
// ⚙️ GÉNÉRATION SÉCURISÉE DES TRIGGERS UPDATED_AT (ZÉRO RÉCURSION - HAUTE PERFORMANCE)
// ==============================================================================

const tablesWithUpdate = [
    'brouillon_lignes_analytiques', 'brouillon_lignes', 'brouillon_ecritures', 
    'lignes_analytiques', 'lignes_ecritures', 'ecritures','packaging', 'packaging_movements', 'packaging_purchases',
    'analytique_auto_repartition', 'analytique_config_comptes', 'analytique_details', 
    'plan_analytique', 'departements', 'mapping_comptes_rubriques',    'stock_adjustment_items',
    'stock_adjustments',
    'rubriques_etats', 'plan_tiers', 'plan_comptable', 'journaux', 'exercices', 
    'reports_a_nouveau', 'brouillard_lignes_treso', 'brouillard_affectations', 'product_paliers',
    'brouillards_treso', 'config_ecritures_lignes', 'config_ecritures_auto', 
    'payment_methods', 'inventory_items', 'inventories', 'stock_movements', 
    'sale_items', 'sales', 'provisional_sales', 'payments', 'others_tiers', 
    'suppliers', 'customers', 'products', 'product_groups', 'categories', 'flux_emballages_details',
    'familles', 'audit_log', 'staff', 'users', 'companies', 'unites',
    'cloture_details_paiements', 'clotures_caisse', 'sync_queue', 'purchase_payments',   'purchase_orders',
    'purchase_order_items',
    'temporary_carts','temporary_provisional_carts', 'temporary_purchases', 'login_attempts'
];

tablesWithUpdate.forEach(table => {
    // 1. Suppression de sécurité de l'ancien trigger défectueux
    db.exec(`DROP TRIGGER IF EXISTS trg_${table}_updated_at;`);
    
    // 2. Création du trigger conforme à la grammaire SQLite (Barrière anti-boucle intégrée)
    db.exec(`
        CREATE TRIGGER IF NOT EXISTS trg_${table}_updated_at
        AFTER UPDATE ON ${table}
        FOR EACH ROW
        WHEN NEW.updated_at IS OLD.updated_at OR OLD.updated_at IS NULL
        BEGIN
            UPDATE ${table}
            SET updated_at = CURRENT_TIMESTAMP
            WHERE id = NEW.id;
        END;
    `);
});


    
   // ======================================================
// --- GENERATEUR DYNAMIQUE DE TRIGGERS DE SYNC ---
// ======================================================
const syncTables = [
  // ================= USERS / STRUCTURE =================
  { table: 'companies', op: 'UPDATE' },
  { table: 'users', op: 'UPDATE' },
  { table: 'staff', op: 'INSERT' }, { table: 'staff', op: 'UPDATE' },

  // ================= PRODUITS =================
  { table: 'familles', op: 'INSERT' }, { table: 'familles', op: 'UPDATE' }, { table: 'familles', op: 'DELETE', mode: 'OLD' },
  { table: 'categories', op: 'INSERT' }, { table: 'categories', op: 'UPDATE' }, { table: 'categories', op: 'DELETE', mode: 'OLD' },
  { table: 'product_groups', op: 'INSERT' }, { table: 'product_groups', op: 'UPDATE' }, { table: 'product_groups', op: 'DELETE', mode: 'OLD' },
  { table: 'products', op: 'INSERT' }, { table: 'products', op: 'UPDATE' }, { table: 'products', op: 'DELETE', mode: 'OLD' },
   { table: 'product_paliers', op: 'INSERT' }, { table: 'product_paliers', op: 'UPDATE' }, { table: 'product_paliers', op: 'DELETE', mode: 'OLD' },
  { table: 'unites', op: 'INSERT' }, { table: 'unites', op: 'UPDATE' }, { table: 'unites', op: 'DELETE', mode: 'OLD' },
      // 🚀 AJOUTS : ÉCOUTEURS DE SYNCHRONISATION POUR LES AJUSTEMENTS DE STOCK
  { table: 'stock_adjustments', op: 'INSERT' }, 
  { table: 'stock_adjustments', op: 'UPDATE' }, 
  { table: 'stock_adjustments', op: 'DELETE', mode: 'OLD' },

  { table: 'stock_adjustment_items', op: 'INSERT' }, 
  { table: 'stock_adjustment_items', op: 'UPDATE' }, 
  { table: 'stock_adjustment_items', op: 'DELETE', mode: 'OLD' },

  // ================= PARTENAIRES =================
  { table: 'suppliers', op: 'INSERT' }, { table: 'suppliers', op: 'UPDATE' }, { table: 'suppliers', op: 'DELETE', mode: 'OLD' },
  { table: 'customers', op: 'INSERT' }, { table: 'customers', op: 'UPDATE' }, { table: 'customers', op: 'DELETE', mode: 'OLD' },
  { table: 'others_tiers', op: 'INSERT' }, { table: 'others_tiers', op: 'UPDATE' },

  // ================= VENTES / ACHATS / PAIEMENTS =================
  { table: 'sales', op: 'INSERT' }, { table: 'sales', op: 'UPDATE' }, { table: 'sales', op: 'DELETE', mode: 'OLD' },
  { table: 'sale_items', op: 'INSERT' }, { table: 'sale_items', op: 'UPDATE' }, { table: 'sale_items', op: 'DELETE', mode: 'OLD' },
  { table: 'purchases', op: 'INSERT' }, { table: 'purchases', op: 'UPDATE' }, { table: 'purchases', op: 'DELETE', mode: 'OLD' },
  { table: 'purchase_items', op: 'INSERT' }, { table: 'purchase_items', op: 'UPDATE' }, { table: 'purchase_items', op: 'DELETE', mode: 'OLD' },
  { table: 'payments', op: 'INSERT' }, { table: 'payments', op: 'UPDATE' }, { table: 'payments', op: 'DELETE', mode: 'OLD' },
  { table: 'purchase_orders', op: 'INSERT' }, 
{ table: 'purchase_orders', op: 'UPDATE' }, 
{ table: 'purchase_orders', op: 'DELETE', mode: 'OLD' },
{ table: 'purchase_order_items', op: 'INSERT' }, 
{ table: 'purchase_order_items', op: 'UPDATE' }, 
{ table: 'purchase_order_items', op: 'DELETE', mode: 'OLD' },

  { table: 'purchase_payments', op: 'INSERT' }, { table: 'purchase_payments', op: 'UPDATE' }, { table: 'purchase_payments', op: 'DELETE', mode: 'OLD' },
  { table: 'payment_methods', op: 'INSERT' }, { table: 'payment_methods', op: 'UPDATE' }, { table: 'payment_methods', op: 'DELETE', mode: 'OLD' },
  { table: 'provisional_sales', op: 'INSERT' }, { table: 'provisional_sales', op: 'UPDATE' }, { table: 'provisional_sales', op: 'DELETE', mode: 'OLD' },

  // ================= STOCK & EMBALLAGES =================
  { table: 'stock_movements', op: 'INSERT' }, { table: 'stock_movements', op: 'UPDATE' }, { table: 'stock_movements', op: 'DELETE', mode: 'OLD' },
  { table: 'inventories', op: 'INSERT' }, { table: 'inventories', op: 'UPDATE' }, { table: 'inventories', op: 'DELETE', mode: 'OLD' },
  { table: 'inventory_items', op: 'INSERT' }, { table: 'inventory_items', op: 'UPDATE' }, { table: 'inventory_items', op: 'DELETE', mode: 'OLD' },
  { table: 'packaging', op: 'INSERT' }, { table: 'packaging', op: 'UPDATE' }, { table: 'packaging', op: 'DELETE', mode: 'OLD' },
  { table: 'packaging_movements', op: 'INSERT' }, { table: 'packaging_movements', op: 'UPDATE' }, { table: 'packaging_movements', op: 'DELETE', mode: 'OLD' }, 
  { table: 'packaging_purchases', op: 'INSERT' }, { table: 'packaging_purchases', op: 'UPDATE' }, { table: 'packaging_purchases', op: 'DELETE', mode: 'OLD' }, 
  { table: 'flux_emballages', op: 'INSERT' },{ table: 'flux_emballages', op: 'UPDATE' }, { table: 'flux_emballages', op: 'DELETE', mode: 'OLD' }, 
  { table: 'packaging_rules', op: 'INSERT' }, { table: 'packaging_rules', op: 'UPDATE' }, { table: 'packaging_rules', op: 'DELETE', mode: 'OLD' },
  { table: 'packaging_rule_tiers', op: 'INSERT' }, { table: 'packaging_rule_tiers', op: 'UPDATE' }, { table: 'packaging_rule_tiers', op: 'DELETE', mode: 'OLD' },
 { table: 'flux_emballages_details', op: 'INSERT' }, { table: 'flux_emballages_details', op: 'UPDATE' }, { table: 'flux_emballages_details', op: 'DELETE', mode: 'OLD' },

   { table: 'packaging_inventories', op: 'INSERT' }, { table: 'packaging_inventories', op: 'UPDATE' },
  { table: 'packaging_inventory_items', op: 'INSERT' }, { table: 'packaging_inventory_items', op: 'UPDATE' },
  { table: 'restaurant_tables', op: 'INSERT' }, { table: 'restaurant_tables', op: 'UPDATE' },

  // ================= COMPTABILITÉ & ETATS =================
  { table: 'exercices', op: 'INSERT' }, { table: 'exercices', op: 'UPDATE' }, { table: 'exercices', op: 'DELETE', mode: 'OLD' },
  { table: 'plan_comptable', op: 'INSERT' }, { table: 'plan_comptable', op: 'UPDATE' }, { table: 'plan_comptable', op: 'DELETE', mode: 'OLD' },
  { table: 'plan_tiers', op: 'INSERT' }, { table: 'plan_tiers', op: 'UPDATE' }, { table: 'plan_tiers', op: 'DELETE', mode: 'OLD' },
  { table: 'journaux', op: 'INSERT' }, { table: 'journaux', op: 'UPDATE' }, { table: 'journaux', op: 'DELETE', mode: 'OLD' },
  { table: 'ecritures', op: 'INSERT' }, { table: 'ecritures', op: 'UPDATE' }, { table: 'ecritures', op: 'DELETE', mode: 'OLD' },
  { table: 'lignes_ecritures', op: 'INSERT' }, { table: 'lignes_ecritures', op: 'UPDATE' }, { table: 'lignes_ecritures', op: 'DELETE', mode: 'OLD' },
  { table: 'reports_a_nouveau', op: 'INSERT' }, { table: 'reports_a_nouveau', op: 'UPDATE' }, { table: 'reports_a_nouveau', op: 'DELETE', mode: 'OLD' },

  // ================= ANALYTIQUE =================
  { table: 'departements', op: 'INSERT' }, { table: 'departements', op: 'UPDATE' },
  { table: 'plan_analytique', op: 'INSERT' }, { table: 'plan_analytique', op: 'UPDATE' }, { table: 'plan_analytique', op: 'DELETE', mode: 'OLD' },
  { table: 'analytique_details', op: 'INSERT' }, { table: 'analytique_details', op: 'UPDATE' }, { table: 'analytique_details', op: 'DELETE', mode: 'OLD' },
  { table: 'analytique_config_comptes', op: 'INSERT' }, { table: 'analytique_config_comptes', op: 'UPDATE' }, { table: 'analytique_config_comptes', op: 'DELETE', mode: 'OLD' },
  { table: 'analytique_auto_repartition', op: 'INSERT' }, { table: 'analytique_auto_repartition', op: 'UPDATE' }, { table: 'analytique_auto_repartition', op: 'DELETE', mode: 'OLD' },

  // ================= BROUILLONS & WORKFLOWS =================
  { table: 'brouillon_ecritures', op: 'INSERT' }, { table: 'brouillon_ecritures', op: 'UPDATE' }, { table: 'brouillon_ecritures', op: 'DELETE', mode: 'OLD' },
  { table: 'brouillon_lignes', op: 'INSERT' }, { table: 'brouillon_lignes', op: 'UPDATE' }, { table: 'brouillon_lignes', op: 'DELETE', mode: 'OLD' },
  { table: 'brouillon_lignes_analytiques', op: 'INSERT' }, { table: 'brouillon_lignes_analytiques', op: 'UPDATE' }, { table: 'brouillon_lignes_analytiques', op: 'DELETE', mode: 'OLD' },

  // ================= TRÉSORERIE & CAISSE =================
  { table: 'brouillards_treso', op: 'INSERT' }, { table: 'brouillards_treso', op: 'UPDATE' }, { table: 'brouillards_treso', op: 'DELETE', mode: 'OLD' },
  { table: 'brouillard_lignes_treso', op: 'INSERT' }, { table: 'brouillard_lignes_treso', op: 'UPDATE' }, { table: 'brouillard_lignes_treso', op: 'DELETE', mode: 'OLD' },
  { table: 'brouillard_affectations', op: 'INSERT' }, { table: 'brouillard_affectations', op: 'UPDATE' }, { table: 'brouillard_affectations', op: 'DELETE', mode: 'OLD' },
  { table: 'clotures_caisse', op: 'INSERT' }, { table: 'clotures_caisse', op: 'UPDATE' },
  { table: 'cloture_details_paiements', op: 'INSERT' }, { table: 'cloture_details_paiements', op: 'UPDATE' },

  // ================= CONFIGURATION ET LOGS =================
  { table: 'config_ecritures_auto', op: 'INSERT' }, { table: 'config_ecritures_auto', op: 'UPDATE' }, { table: 'config_ecritures_auto', op: 'DELETE', mode: 'OLD' },
  { table: 'config_ecritures_lignes', op: 'INSERT' }, { table: 'config_ecritures_lignes', op: 'UPDATE' }, { table: 'config_ecritures_lignes', op: 'DELETE', mode: 'OLD' },
  { table: 'audit_log', op: 'INSERT' }
];

syncTables.forEach(s => {
    const isDelete = s.op === 'DELETE';
    const idSource = isDelete ? 'OLD' : 'NEW';
    const pkField = s.table.startsWith('temporary_') ? 'user_id' : 'id';
    
    // 🛡️ SÉCURITÉ COMPAGNIE : On bloque l'UPDATE automatique pour briser le bug infini
    if (s.table === 'companies' && s.op === 'UPDATE') {
        db.exec(`DROP TRIGGER IF EXISTS trg_sync_${s.table}_update;`);
        return; // On ignore la création de ce trigger spécifique
    }

    let compId;
    if (s.table === 'companies') {
        compId = `${idSource}.id`;
    } else if (['audit_log', 'payment_methods'].includes(s.table)) {
        compId = "'SYSTEM'";
    } else {
        compId = `IFNULL(${idSource}.company_id, 'SYSTEM')`;
    }

    db.exec(`DROP TRIGGER IF EXISTS trg_sync_${s.table}_${s.op.toLowerCase()};`);

    // Sécurité anti-boucle : On ne capture l'événement que si l'état local repasse explicitement en 'pending'
    let condition = !isDelete ? `WHEN ${idSource}.sync_status = 'pending'` : "";

    db.exec(`
        CREATE TRIGGER IF NOT EXISTS trg_sync_${s.table}_${s.op.toLowerCase()} 
        AFTER ${s.op} ON ${s.table} 
        ${condition} 
        BEGIN 
            INSERT INTO sync_queue(table_name, record_id, operation, company_id) 
            VALUES ('${s.table}', ${idSource}.${pkField}, '${s.op}', ${compId}); 
        END;
    `);
});



        console.log('✅ Base de données initialisée avec succès (Mode Multi-entités)');
        return db;

    } catch (err) {
        console.error('❌ Erreur initDatabase:', err.message);
        throw err;
    }
}

function getDb() { 
    if (!db) throw new Error('Base non initialisée'); 
    return db; 
}

module.exports = { initDatabase, getDb };