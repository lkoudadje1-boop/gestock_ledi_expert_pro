const mongoose = require('mongoose');
const schemaOptions = { timestamps: true, strict: false };

const CompanySchema = new mongoose.Schema({ 
    localId: { type: String, required: true, unique: true }, 
    company_code: { type: String, unique: true, required: true, trim: true }, 
    name: { type: String, required: true, trim: true }, 
    email: { type: String, lowercase: true, trim: true }, 
    address: String, 
    phone: String, 
    logo_data: String, 
    nif_number: String, 
    rccm_number: String, 
    default_customer_id: { type: String, default: null }, 
    default_supplier_id: { type: String, default: null }, 
    default_staff_id: { type: String, default: null }, 
    hardware_mid: { type: String, default: null }, 
    gestion_analytique: { type: Boolean, default: false }, 
    plan_precision: { type: Number, default: 8 }, 
    regime_tva_recuperable: { type: Number, default: 1 }, 
    last_access_date: { type: Date }, 
    license_type: { type: String, enum: ['FREE', 'PRO', 'ULTRA'], default: 'FREE' }, 
    active_modules: { type: [String], default: [] }, 
    license_key: { type: String, default: null }, 
    expiry_date: { type: Date, default: null }, 
    license_start_date: { type: Date, default: Date.now }, 
    is_active: { type: Boolean, default: true }, 
    sync_status: { type: String, enum: ['pending', 'synced', 'error'], default: 'pending' } 
}, { versionKey: false, timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, collection: 'cloud_companies' });

const UserSchema = new mongoose.Schema({ localId: String, username: String, email: String, role: String, company_id: String, fonction: String, nif: String, cnss: String, adresse: String, permissions: Object, token_version: { type: Number, default: 1 }, sync_status: String }, schemaOptions);
const StaffSchema = new mongoose.Schema({ localId: String, name: { type: String, required: true }, phone: String, email: String, adresse: String, nif: String, cnss: String, fonction: String, company_id: String, is_active: { type: Number, default: 1 }, sync_status: { type: String, default: 'pending' } }, schemaOptions);
const ProductSchema = new mongoose.Schema({ localId: String, nom: String, company_id: String, codeBarre: String, unite_id: String, image_path: String, group_id: String, cmp: { type: Number, default: 0 }, prixVente: { type: Number, default: 0 }, taxeActive: { type: Number, default: 0 }, taxeTaux: { type: Number, default: 0 }, stock_actuel: { type: Number, default: 0 }, stock_reserve: { type: Number, default: 0 }, stockAlerte: { type: Number, default: 0 }, is_active: { type: Number, default: 1 }, remiseActive: { type: Number, default: 0 }, r1Active: { type: Number, default: 0 }, r1Seuil: Number, r1Montant: Number, r1Taux: Number, r1IsPromo: Number, r1DateDebut: String, r1DateFin: String, r2Active: { type: Number, default: 0 }, r2Seuil: Number, r2Montant: Number, r2Taux: Number, r2IsPromo: Number, r2DateDebut: String, r2DateFin: String, r3Active: { type: Number, default: 0 }, r3Multiple: Number, r3Montant: Number, r3Taux: Number, r3IsPromo: Number, r3DateDebut: String, r3DateFin: String, r4Active: { type: Number, default: 0 }, r4A_Max: Number, r4A_Montant: Number, r4A_Taux: Number, r4B_Max: Number, r4B_Montant: Number, r4B_Taux: Number, r4C_Montant: Number, r4C_Taux: Number, r4IsPromo: Number, r4DateDebut: String, r4DateFin: String, sync_status: String }, schemaOptions);

// 🛠️ CORRECTION : Ajout de localId pour homogénéiser avec SQLite
const FamilleSchema = new mongoose.Schema({ localId: { type: String, required: true }, id: { type: String }, nom: { type: String, required: true }, company_id: { type: String, required: true }, is_active: { type: Number, default: 1 }, sync_status: { type: String, default: 'synced' } }, schemaOptions);
const CategorieSchema = new mongoose.Schema({ localId: { type: String, required: true }, id: { type: String }, nom: { type: String, required: true }, famille_id: { type: String, required: true }, company_id: { type: String, required: true }, is_active: { type: Number, default: 1 }, sync_status: { type: String, default: 'synced' } }, schemaOptions);
const ProductGroupSchema = new mongoose.Schema({ localId: { type: String, required: true }, id: { type: String }, nom: { type: String, required: true }, category_id: { type: String, required: true }, company_id: { type: String, required: true }, is_active: { type: Number, default: 1 }, sync_status: { type: String, default: 'synced' } }, schemaOptions);

const UniteSchema = new mongoose.Schema({ localId: { type: String, required: true }, code: { type: String, required: true, uppercase: true, trim: true }, libelle: { type: String, required: true, trim: true }, coefficient: { type: Number, required: true, default: 1.0, min: 1 }, unite_reference: { type: String, required: true, default: 'Bouteille', trim: true }, company_id: { type: String, required: true, index: true }, is_active: { type: Number, default: 1 }, sync_status: { type: String, default: 'synced', enum: ['pending', 'synced', 'error'] } }, schemaOptions);
UniteSchema.index({ code: 1, company_id: 1 }, { unique: true });

const SupplierSchema = new mongoose.Schema({ localId: String, nom: { type: String, required: true }, nif: { type: String, default: '0' }, contact: String, telephone: String, email: String, adresse: String, company_id: String, is_active: { type: Number, default: 1 }, sync_status: String }, schemaOptions);
const CustomerSchema = new mongoose.Schema({ localId: String, nom: { type: String, required: true }, nif: { type: String, default: '' }, telephone: String, email: String, adresse: String, ville: String, company_id: String, is_active: { type: Number, default: 1 }, sync_status: String }, schemaOptions);
const StockMovementAnalytiqueSchema = new mongoose.Schema({ localId: { type: String, required: true }, matiere_id: { type: String, default: null }, semi_fini_id: { type: String, default: null }, type_mouvement: { type: String, enum: ['ENTREE', 'SORTIE', 'AJUSTEMENT'] }, quantite: { type: Number, required: true }, reference_id: String, date_mouvement: Date, company_id: { type: String, index: true }, sync_status: { type: String, default: 'synced' } }, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, collection: 'cloud_mouvements_stock_analytique' });
const SaleHeaderSchema = new mongoose.Schema({ localId: { type: String, required: true, unique: true }, lot_id: { type: String }, customer_id: { type: String }, table_id: { type: String, default: null }, table_name_snap: { type: String, default: null }, nom_client_snap: { type: String, default: 'CLIENT AU COMPTANT' }, date_vente: { type: Date, default: Date.now }, statut_vente: { type: String, enum: ['BROUILLON', 'VALIDEE', 'ANNULEE', 'RETOUR'], default: 'BROUILLON' }, montant_total: { type: Number, default: 0 }, montant_paye: { type: Number, default: 0 }, reste_a_payer: { type: Number, default: 0 }, payment_status: { type: String }, mode_reglement: { type: String }, observation: { type: String, default: '' }, user_id: { type: String, required: true }, caissier_id: { type: String }, staff_id: { type: String }, staff_name_snap: { type: String }, company_id: { type: String, index: true, required: true }, is_active: { type: Number, default: 1 }, is_solde: { type: Number, default: 0 }, is_archived: { type: Number, default: 0 }, is_comptabilise: { type: Number, default: 0 }, sync_status: { type: String, default: 'synced' } }, { timestamps: true, collection: 'cloud_sales' });
const PurchaseHeaderSchema = new mongoose.Schema({ localId: { type: String, required: true, unique: true }, lot_id: String, supplier_id: String, nom_fournisseur_snap: String, num_facture: String, date_achat: { type: Date, default: Date.now }, montant_total: { type: Number, default: 0 }, montant_paye: { type: Number, default: 0 }, reste_a_payer: { type: Number, default: 0 }, payment_status: String, user_id: String, company_id: { type: String, index: true }, is_active: { type: Number, default: 1 }, is_comptabilise: { type: Number, default: 0 }, sync_status: { type: String, default: 'synced' } }, { timestamps: true, collection: 'cloud_purchases' });

const PurchasePaymentSchema = new mongoose.Schema({ 
    localId: { type: String, required: true, unique: true }, 
    purchase_id: { type: String, index: true }, 
    is_active: { type: Number, default: 1 }, 
    lot_id: { type: String, index: true }, 
    montant: { type: Number, default: 0 }, 
    date_reglement: { type: Date, default: Date.now }, 
    mode_reglement: String, 
    statut: { type: String, default: 'VALIDEE' }, 
    reference_paiement: { type: String, default: 'COMPTANT' }, 
    user_id: String, 
    company_id: { type: String, index: true }, 
    sync_status: { type: String, default: 'synced' } 
}, { timestamps: true, collection: 'cloud_purchase_payments' });

const SaleItemSchema = new mongoose.Schema({ localId: { type: String, required: true, unique: true }, id_vente: { type: String, index: true, required: true }, lot_id: { type: String }, customer_id: { type: String }, type_ligne: { type: String, enum: ['VENTE', 'RETOUR', 'ANNULEE'], default: 'VENTE' }, product_id: { type: String, required: true }, nom_article_snap: { type: String, required: true }, quantite: { type: Number, required: true }, prix_vente_unitaire: { type: Number, required: true }, remise_montant: { type: Number, default: 0 }, montant_ht: { type: Number, required: true }, taxe_montant: { type: Number, default: 0 }, montant_ttc_ligne: { type: Number, required: true }, observation: { type: String, default: '' }, stock_avant_vente: { type: Number, default: 0 }, stock_apres_vente: { type: Number, default: 0 }, user_id: { type: String, required: true }, company_id: { type: String, required: true }, is_active: { type: Number, default: 1 }, is_comptabilise: { type: Number, default: 0 }, sync_status: { type: String, default: 'synced' } }, { timestamps: true, collection: 'cloud_sale_items' });

const PurchaseItemSchema = new mongoose.Schema({ localId: { type: String, required: true, unique: true }, id_achat: { type: String, index: true, required: true }, lot_id: { type: String }, product_id: { type: String, required: true }, nom_article_snap: { type: String, required: true }, type_ligne: { type: String, enum: ['ACHAT', 'MOUVEMENT', 'ANNULATION', 'RETOUR'], default: 'ACHAT' }, qte_achetee: { type: Number, required: true }, prix_achat_unitaire: { type: Number, required: true }, montant_facture_ligne: { type: Number, required: true }, montant_ht_ligne: { type: Number, default: 0 }, montant_tva_ligne: { type: Number, default: 0 }, stock_avant_achat: { type: Number, default: 0 }, stock_apres_achat: { type: Number, default: 0 }, cmp_ancien: { type: Number, default: 0 }, cmp_nouveau: { type: Number, default: 0 }, supplier_id: { type: String, required: true }, num_facture: { type: String, required: true }, user_id: { type: String, required: true }, company_id: { type: String, required: true }, is_active: { type: Number, default: 1 }, sync_status: { type: String, default: 'synced' } }, { timestamps: true, collection: 'cloud_purchase_items' });
const ProvisionalSaleSchema = new mongoose.Schema({ localId: String, lot_id: String, id_vente: String, session_id: String, customer_id: String, nom_client_snap: String, product_id: String, nom_article_snap: String, quantite: Number, prix_vente_unitaire: Number, remise_montant: { type: Number, default: 0 }, table_id: String, table_name_snap: String, taxe_montant: { type: Number, default: 0 }, date_vente: { type: Date, default: Date.now }, montant_ttc_ligne: Number, stock_avant_vente: { type: Number, default: 0 }, stock_apres_vente: { type: Number, default: 0 }, user_id: String, staff_id: String, staff_name_snap: String, company_id: String, sync_status: { type: String, default: 'pending' } }, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, collection: 'cloud_provisional_sales' });
const InventorySchema = new mongoose.Schema({ localId: String, lot_id: { type: String, index: true }, libelle: String, type_inventaire: String, statut: String, valeur_theo_totale: Number, valeur_reel_totale: Number, valeur_ecart_totale: Number, user_id: String, company_id: String, closed_at: Date, sync_status: { type: String, default: 'pending' } }, schemaOptions);
const PaymentSchema = new mongoose.Schema({ 
    localId: String, 
    lot_id: String, 
    sale_id: String, 
    customer_id: String, 
    client_name: String, 
    montant: Number, 
    recu: Number, 
    rendu: Number, 
    moyen_paiement: String, 
    statut: String, 
    user_id: String, 
    caissier_id: String, 
    company_id: String, 
    is_active: { type: Number, default: 1 }, 
    is_cloture: { type: Number, default: 0 }, 
    sync_status: { type: String, default: 'pending' },
    type_paiement: { type: String, default: 'COMPTANT' }, 
    payment_method_id: String 
}, { timestamps: true, collection: 'cloud_payments' });

const InventoryItemSchema = new mongoose.Schema({ localId: String, lot_id: { type: String, index: true }, product_id: String, nom_article_snap: String, prix_achat_snap: Number, stock_theorique: Number, stock_reel: Number, ecart_quantite: Number, ecart_valeur: Number, user_id: String, company_id: String, sync_status: { type: String, default: 'pending' } }, schemaOptions);
const StockMovementSchema = new mongoose.Schema({ localId: String, product_id: String, type_mouvement: String, reference_id: String, quantite: Number, stock_avant: Number, stock_apres: Number, prix_operation: Number, cmp_resultat: Number, user_id: String, company_id: String, sync_status: { type: String, default: 'pending' } }, { timestamps: true, strict: false });
const AuditLogSchema = new mongoose.Schema({ localId: String, user_id: String, user_name: String, action_type: String, table_concernee: String, reference_id: String, description: String, date_action: Date, company_id: String, sync_status: { type: String, default: 'pending' } }, schemaOptions);
const DepartementSchema = new mongoose.Schema({ localId: { type: String, required: true }, company_id: { type: String, required: true }, code_analytique: { type: String, required: true }, nom: { type: String, required: true }, is_deleted: { type: Number, default: 0 }, sync_status: { type: String, default: 'synced' } }, schemaOptions);
const PlanAnalytiqueSchema = new mongoose.Schema({ localId: { type: String, required: true }, company_id: { type: String, required: true }, parent_dept_id: { type: String, required: true }, code: { type: String, required: true }, libelle: { type: String, required: true }, is_deleted: { type: Number, default: 0 }, sync_status: { type: String, default: 'synced' } }, schemaOptions);
const LigneAnalytiqueSchema = new mongoose.Schema({ localId: { type: String, required: true, unique: true }, company_id: { type: String, required: true, index: true }, ligne_ecriture_id: { type: String, required: true, index: true }, plan_analytique_id: { type: String, required: true, index: true }, departement_id: { type: String, required: true, index: true }, num_compte: { type: String, required: false }, montant: { type: Number, required: true }, sync_status: { type: String, default: 'synced' } }, schemaOptions);
const AnalytiqueDetailSchema = new mongoose.Schema({ localId: { type: String, required: true }, company_id: { type: String, required: true, index: true }, plan_analytique_id: { type: String, required: true }, product_id: { type: String, default: null }, semi_fini_id: { type: String, default: null }, code: { type: String, required: true }, libelle: { type: String, required: true }, compte_analytique: { type: String, default: '' }, montant_base_theorique: { type: Number, default: 0 }, qte_base_production: { type: Number, default: 1 }, is_deleted: { type: Number, default: 0 }, sync_status: { type: String, default: 'pending' }, updated_at: { type: Date, default: Date.now } }, { timestamps: true, collection: 'cloud_analytique_details' }); 
AnalytiqueDetailSchema.index({ company_id: 1, plan_analytique_id: 1 });
const AnalytiqueConfigCompteSchema = new mongoose.Schema({ localId: { type: String, required: true }, company_id: { type: String, required: true }, compte_general_id: { type: String, required: true }, mode_saisie: { type: String, enum: ['AUTO', 'MANUEL'], default: 'MANUEL' }, description: String, is_active: { type: Number, default: 1 }, is_deleted: { type: Number, default: 0 }, sync_status: { type: String, default: 'pending' } }, { timestamps: true, collection: 'cloud_analytique_configs' });
const AnalytiqueAutoRepartitionSchema = new mongoose.Schema({ localId: { type: String, required: true }, config_id: { type: String, required: true }, plan_analytique_id: { type: String, required: true }, company_id: { type: String, required: true, index: true }, pourcentage: { type: Number }, montant: { type: Number }, is_active: { type: Number, default: 1 }, is_deleted: { type: Number, default: 0 }, sync_status: { type: String, default: 'pending' } }, { timestamps: true, collection: 'cloud_analytique_auto_repartitions' });
const PlanComptableSchema = new mongoose.Schema({ localId: { type: String, required: true }, company_id: { type: String, required: true }, numero_compte: { type: String, required: true }, intitule: { type: String, required: true }, classe: Number, nature: { type: String, enum: ['ACTIF','PASSIF','CHARGE','PRODUIT'] }, type_etat: { type: String, enum: ['BILAN','RESULTAT'] }, sens_normal: { type: String, enum: ['DEBIT','CREDIT'] }, type_compte: String, parent_id: String, niveau: Number, lettrable: { type: Boolean, default: false }, rapprochement_bancaire: { type: Boolean, default: false }, actif: { type: Boolean, default: true }, sync_status: { type: String, default: 'pending' } }, schemaOptions);
const PlanTiersSchema = new mongoose.Schema({ localId: { type: String, required: true }, company_id: { type: String, required: true }, compte_collectif_id: String, numero_tiers: { type: String, required: true }, nom: { type: String, required: true }, type_tiers: { type: String, enum: ['CLIENT','FOURNISSEUR','SALARIE','AUTRE'] }, delai_paiement: { type: Number, default: 0 }, reference_id: { type: String }, sync_status: { type: String, default: 'pending' } }, schemaOptions);
const ExerciceSchema = new mongoose.Schema({ localId: { type: String, required: true }, company_id: { type: String, required: true }, libelle: { type: String, required: true }, date_debut: Date, date_fin: Date, statut: { type: String, enum: ['OUVERT', 'CLOTURE', 'PRE_CLOTURE'], default: 'OUVERT' }, date_cloture: Date, user_cloture: String, sync_status: { type: String, default: 'pending' } }, schemaOptions);
const JournalSchema = new mongoose.Schema({ localId: { type: String, required: true }, company_id: { type: String, required: true }, code: { type: String, required: true }, libelle: { type: String, required: true }, type_journal: String, compte_contrepartie_id: String, contrepartie_auto: { type: Number, default: 0 }, mode_numerotation: { type: String, default: 'AUTO' }, compte_treso_id: String, compteur_piece: { type: Number, default: 1 }, actif: { type: Boolean, default: true }, sync_status: { type: String, default: 'pending' } }, schemaOptions);
const LigneEcritureSchema = new mongoose.Schema({ localId: { type: String, required: true }, company_id: { type: String, required: true }, journal_id: { type: String, required: true }, exercice_id: { type: String, required: true }, date_ecriture: { type: Date, required: true }, date_echeance: Date, piece: { type: String, required: true }, facture: String, reference: String, compte_id: { type: String, required: true }, num_compte: { type: String, required: true }, num_tiers: String, libelle: String, debit: { type: Number, default: 0 }, credit: { type: Number, default: 0 }, lettre: String, date_lettrage: Date, is_deleted: { type: Number, default: 0 }, deleted_at: { type: Date, default: null }, sync_status: { type: String, enum: ['pending', 'synced', 'error'], default: 'pending' } }, schemaOptions);
const EcritureSchema = new mongoose.Schema({ localId: { type: String, required: true }, company_id: { type: String, required: true }, journal_id: String, exercice_id: String, date_ecriture: Date, piece: String, reference: String, ref_brouillon: String, libelle: String, user_saisie: String, is_deleted: { type: Number, default: 0 }, deleted_at: { type: Date, default: null }, sync_status: { type: String, enum: ['pending', 'synced', 'error'], default: 'pending' } }, schemaOptions);
const BrouillonEcritureSchema = new mongoose.Schema({ localId: { type: String, required: true }, company_id: { type: String, required: true }, journal_id: String, exercice_id: String, date_ecriture: Date, piece_provisoire: String, reference: String, ref_brouillon: String, libelle: String, user_saisie: String, is_deleted: { type: Number, default: 0 }, statut: { type: String, enum: ['EN_ATTENTE', 'VALIDE', 'REJETE'], default: 'EN_ATTENTE' }, observation: String, deleted_at: { type: Date, default: null }, sync_status: { type: String, enum: ['pending', 'synced', 'error'], default: 'pending' } }, schemaOptions);
const BrouillonLigneSchema = new mongoose.Schema({ localId: { type: String, required: true }, company_id: { type: String, required: true }, brouillon_id: { type: String, required: true }, journal_id: String, exercice_id: String, date_ecriture: Date, date_echeance: Date, piece_provisoire: String, facture: String, reference: String, compte_id: String, num_compte: String, num_tiers: String, libelle: String, debit: { type: Number, default: 0 }, credit: { type: Number, default: 0 }, is_ventilated: { type: Number, default: 0 }, statut: { type: String, enum: ['EN_ATTENTE', 'VALIDE', 'REJETE'], default: 'EN_ATTENTE' }, sync_status: { type: String, enum: ['pending', 'synced', 'error'], default: 'pending' } }, schemaOptions);
const BrouillonLigneAnalytiqueSchema = new mongoose.Schema({ localId: { type: String, required: true, unique: true }, company_id: { type: String, required: true, index: true }, ligne_brouillon_id: { type: String, required: true, index: true }, plan_analytique_id: { type: String, required: true }, departement_id: { type: String, required: true }, num_compte: String, montant: { type: Number, required: true }, statut: { type: String, enum: ['EN_ATTENTE', 'VALIDE', 'REJETE'], default: 'EN_ATTENTE' }, observation: { type: String, default: '' }, sync_status: { type: String, enum: ['pending', 'synced', 'error'], default: 'pending' } }, schemaOptions);
const OthersTiersSchema = new mongoose.Schema({ localId: { type: String, required: true }, nom: { type: String, required: true }, nif: { type: String, default: '0' }, contact: String, telephone: String, email: String, adresse: String, company_id: { type: String, required: true, index: true }, is_active: { type: Number, default: 1 }, sync_status: { type: String, default: 'synced' } }, schemaOptions);
const ReportsANouveauSchema = new mongoose.Schema({ localId: { type: String, required: true }, company_id: { type: String, required: true, index: false }, exercice_id: { type: String, required: true, index: false }, compte_id: { type: String, required: true }, num_compte: { type: String, required: true, index: false }, num_tiers: { type: String, default: '' }, montant_debit: { type: Number, default: 0 }, montant_credit: { type: Number, default: 0 }, type_report: { type: String, enum: ['PROVISOIRE', 'DEFINITIF'], default: 'PROVISOIRE' }, user_id: String, user_name: String, sync_status: { type: String, enum: ['pending', 'synced', 'error'], default: 'synced' } }, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, collection: 'cloud_reports_a_nouveau' });
const CloudBrouillardTresoSchema = new mongoose.Schema({ localId: { type: String, required: true }, company_id: { type: String, required: true, index: true }, journal_id: String, journal_brouillon_id: String, compte_treso_id: String, libelle: String, type: { type: String, enum: ['CAISSE', 'BANQUE'] }, mode_fonctionnement: { type: String, enum: ['DIRECT', 'DEMANDE'], default: 'DIRECT' }, sortie_directe: { type: Number, default: 0 }, mode_ecriture: { type: String, enum: ['BROUILLON', 'DIRECT'], default: 'BROUILLON' }, seuil_validation: { type: Number, default: 1 }, niv1_actif: { type: Number, default: 0 }, niv1_user_id: String, niv2_actif: { type: Number, default: 0 }, niv2_user_id: String, niv3_actif: { type: Number, default: 0 }, niv3_user_id: String, niv4_actif: { type: Number, default: 0 }, niv4_user_id: String, solde_initial: { type: Number, default: 0 }, solde_actuel: { type: Number, default: 0 }, is_active: { type: Number, default: 1 }, sync_status: { type: String, default: 'synced' } }, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, collection: 'cloud_brouillards_treso' });
const CloudBrouillardLigneTresoSchema = new mongoose.Schema({ localId: { type: String, required: true }, company_id: { type: String, required: true, index: true }, brouillard_id: { type: String, index: true }, journal_id: String, exercice_id: String, user_id: String, date_mouvement: Date, libelle: String, piece_ref: String, type_flux: { type: String, enum: ['ENCAISSEMENT', 'DECAISSEMENT'] }, montant: { type: Number, required: true }, statut: { type: String, enum: ['BROUILLON', 'EN_ATTENTE', 'APPROUVE', 'VALIDE', 'REJETE'], default: 'BROUILLON' }, v1_statut: { type: Number, default: 0 }, v1_date: Date, v1_user_id: String, v2_statut: { type: Number, default: 0 }, v2_date: Date, v2_user_id: String, v3_statut: { type: Number, default: 0 }, v3_date: Date, v3_user_id: String, v4_statut: { type: Number, default: 0 }, v4_date: Date, v4_user_id: String, ecriture_id: String, brouillon_ecriture_id: String, piece_comptable: String, comptabilise: { type: Number, default: 0 }, sync_status: { type: String, default: 'synced' } }, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, collection: 'cloud_brouillard_lignes_treso' });
const CloudBrouillardAffectationSchema = new mongoose.Schema({ localId: { type: String, required: true }, company_id: { type: String, required: true, index: true }, brouillard_id: { type: String, index: true }, user_id: { type: String, index: true }, peut_saisir: { type: Number, default: 1 }, peut_valider: { type: Number, default: 0 }, sync_status: { type: String, default: 'synced' } }, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, collection: 'cloud_brouillard_affectations' });
const CloudConfigEcritureAutoSchema = new mongoose.Schema({ localId: { type: String, required: true }, company_id: { type: String, required: true, index: true }, type_operation: { type: String, default: 'VENTE' }, code_evenement: { type: String, required: true }, libelle_evenement: String, table_source: String, journal_id: String, condition_reglement: String, mode_ecriture: { type: String, enum: ['BROUILLON', 'DIRECT'], default: 'BROUILLON' }, sync_status: { type: String, default: 'synced' } }, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, collection: 'cloud_config_ecritures_auto' }); 
CloudConfigEcritureAutoSchema.index({ code_evenement: 1, company_id: 1 }, { unique: true });

const StockAdjustmentSchema = new mongoose.Schema({
    localId: { type: String, index: true },
    libelle: String,
    type_ajustement: { type: String, enum: ['AVARIE', 'BRISE', 'TRANSFERT'], index: true },
    statut: { type: String, default: 'VALIDE' },
    motif: String,
    valeur_totale: Number,
    entrepot_depart_id: String,
    entrepot_arrivee_id: String,
    user_id: String,
    company_id: { type: String, index: true },
    closed_at: Date,
    sync_status: { type: String, default: 'synced' }
}, schemaOptions);

const StockAdjustmentItemSchema = new mongoose.Schema({
    localId: String,
    adjustment_id: { type: String, index: true },
    product_id: String,
    nom_article_snap: String,
    prix_achat_snap: Number,
    prix_vente_snap: Number,
    unite_snap: String,
    quantite: Number,
    stock_avant: Number,
    stock_apres: Number,
    valeur_ligne: Number,
    company_id: { type: String, index: true },
    sync_status: { type: String, default: 'synced' }
}, schemaOptions);

const PurchaseOrderSchema = new mongoose.Schema({
  localId: { type: String, required: true, unique: true },
  num_bon: { type: String, required: true, index: true },
  supplier_id: { type: String, required: true },
  total_facture: { type: Number, required: true },
  montant_avance: { type: Number, default: 0 },
  montant_paye: { type: Number, default: 0 },
  reste_a_payer: { type: Number, required: true },
  moyen_reglement: { type: String, default: null },
  statut_commande: { type: String, enum: ['EN_ATTENTE', 'RECEPTIONNE', 'ANNULE'], default: 'EN_ATTENTE' },
  observations: { type: String },
  date_commande: { type: Date, required: true },
  user_id: { type: String, required: true },
  company_id: { type: String, required: true, index: true },
  is_active: { type: Number, default: 1 },
  sync_status: { type: String, default: 'synced' }
}, { timestamps: true, collection: 'cloud_purchase_orders' });

const PurchaseOrderItemSchema = new mongoose.Schema({
  localId: { type: String, required: true, unique: true },
  order_id: { type: String, required: true, index: true },
  num_bon: { type: String, required: true },
  product_id: { type: String, required: true },
  nom_article_snap: { type: String, required: true },
  observation: { type: String },
  qte_achetee: { type: String, required: true },
  quantite_pieces_natives: { type: Number, required: true },
  unit_coefficient: { type: Number, required: true },
  unit_code_gros: { type: String, required: true },
  unit_ref_detail: { type: String, required: true },
  prix_achat_unitaire: { type: Number, required: true },
  montant_facture_ligne: { type: Number, required: true },
  montant_ht_ligne: { type: Number, default: 0 },
  montant_tva_ligne: { type: Number, default: 0 },
  cmp_ancien: { type: Number, default: 0 },
  ecart: { type: Number, default: 0 },
  user_id: { type: String, required: true },
  company_id: { type: String, required: true, index: true },
  is_active: { type: Number, default: 1 },
  sync_status: { type: String, default: 'synced' }
}, { timestamps: true, collection: 'cloud_purchase_order_items' });

const PackagingRuleSchema = new mongoose.Schema({ localId: { type: String, required: true, unique: true }, code_regle: { type: String, required: true }, libelle: { type: String, required: true }, company_id: { type: String, required: true, index: true }, sync_status: { type: String, enum: ['pending', 'synced', 'error'], default: 'pending' } }, { versionKey: false, timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, collection: 'cloud_packaging_rules' });
const PackagingRuleTierSchema = new mongoose.Schema({ localId: { type: String, required: true, unique: true }, rule_id: { type: String, required: true, index: true }, jours_min: { type: Number, required: true }, jours_max: { type: Number, default: null }, type_calcul: { type: String, required: true, default: 'POURCENTAGE_REPRISE' }, valeur: { type: Number, required: true }, company_id: { type: String, required: true, index: true }, sync_status: { type: String, enum: ['pending', 'synced', 'error'], default: 'pending' } }, { versionKey: false, timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, collection: 'cloud_packaging_rule_tiers' });
const PackagingSchema = new mongoose.Schema({ localId: { type: String, required: true, unique: true }, nom: { type: String, required: true }, unite_id: { type: String, required: true }, rule_id: { type: String, default: null }, prix_consigne: { type: Number, default: 0 }, prix_deconsigne: { type: Number, default: 0 }, prix_achat: { type: Number, default: 0 }, stock_actuel: { type: Number, default: 0 }, stock_alerte: { type: Number, default: 0 }, stock_consigne: { type: Number, default: 0 }, stock_restitue: { type: Number, default: 0 }, is_active: { type: Number, default: 1 }, company_id: { type: String, required: true, index: true }, sync_status: { type: String, enum: ['pending', 'synced', 'error'], default: 'pending' } }, { versionKey: false, timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, collection: 'cloud_packaging' });
const PackagingPurchaseSchema = new mongoose.Schema({ localId: { type: String, required: true, unique: true }, packaging_id: { type: String, required: true }, supplier_id: { type: String, required: true }, is_cancelled: { type: Number, default: 0 }, cancelled_at: { type: Date, default: null }, cancelled_by: { type: String, default: null }, motif_annulation: { type: String, default: null }, user_id: { type: String, required: true }, quantite: { type: Number, required: true }, prix_unitaire: { type: Number, required: true }, montant_total: { type: Number, required: true }, facture_ref: { type: String, default: null }, is_active: { type: Number, default: 1 }, is_archive: { type: Number, default: 0 }, company_id: { type: String, required: true, index: true }, sync_status: { type: String, enum: ['pending', 'synced', 'error'], default: 'pending' } }, { versionKey: false, timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, collection: 'cloud_packaging_purchases' });
const PackagingMovementSchema = new mongoose.Schema({ localId: { type: String, required: true, unique: true }, packaging_id: { type: String, required: true }, type_mouvement: { type: String, required: true }, reference_id: { type: String, default: null }, quantite: { type: Number, required: true }, stock_avant: { type: Number, required: true }, stock_apres: { type: Number, required: true }, observation: { type: String, default: null }, user_id: { type: String, required: true }, company_id: { type: String, required: true, index: true }, sync_status: { type: String, enum: ['pending', 'synced', 'error'], default: 'pending' } }, { versionKey: false, timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, collection: 'cloud_packaging_movements' });
const PackagingInventorySchema = new mongoose.Schema({ localId: { type: String, required: true, unique: true }, libelle: { type: String, required: true }, type_inventaire: { type: String, default: 'EMBALLAGE_GENERAL' }, statut: { type: String, default: 'en_cours' }, valeur_theo_totale: { type: Number, default: 0 }, valeur_reel_totale: { type: Number, default: 0 }, valeur_ecart_totale: { type: Number, default: 0 }, user_id: { type: String, required: true }, company_id: { type: String, required: true, index: true }, sync_status: { type: String, enum: ['pending', 'synced', 'error'], default: 'pending' }, closed_at: { type: Date, default: null } }, { versionKey: false, timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, collection: 'cloud_packaging_inventories' });
const PackagingInventoryItemSchema = new mongoose.Schema({ localId: { type: String, required: true, unique: true }, id_packaging_inventaire: { type: String, required: true }, packaging_id: { type: String, required: true }, nom_emballage_snap: { type: String, required: true }, prix_achat_snap: { type: Number, default: 0 }, stock_theorique: { type: Number, default: 0 }, stock_reel: { type: Number, required: true }, ecart_quantite: { type: Number, default: 0 }, ecart_valeur: { type: Number, default: 0 }, user_id: { type: String, required: true }, company_id: { type: String, required: true, index: true }, sync_status: { type: String, enum: ['pending', 'synced', 'error'], default: 'pending' } }, { versionKey: false, timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, collection: 'cloud_packaging_inventory_items' });

const FluxEnteteSchema = new mongoose.Schema({ 
    localId: { type: String, required: true, unique: true }, 
    company_id: { type: String, required: true, index: true }, 
    sale_id: { type: String, default: null }, 
    client_id: { type: String, default: null }, 
    type_flux: { type: String, required: true }, 
    reference_document: { type: String, default: null }, 
    statut: { type: String, default: 'ACTIF' }, 
    montant_total: { type: Number, default: 0 }, 
    type_garantie: { type: String, enum: ['ESPECES', 'PHYSIQUE'], default: 'ESPECES' },
    montant_recu: { type: Number, default: 0 },
    garantie_libelle: { type: String, default: null },
    montant_reel_paye: { type: Number, default: 0 }, 
    reste_a_payer: { type: Number, default: 0 }, 
    montant_penalite: { type: Number, default: 0 }, 
    montant_rembourse: { type: Number, default: 0 }, 
    notes: { type: String, default: null }, 
    sync_status: { type: String, enum: ['pending', 'synced', 'error'], default: 'pending' } 
}, { versionKey: false, timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, collection: 'cloud_flux_packagings' });

const ProductPalierSchema = new mongoose.Schema({ localId: { type: String, required: true, unique: true }, product_id: { type: String, required: true, index: true }, company_id: { type: String, required: true, index: true }, quantite: { type: Number, required: true }, prix_total: { type: Number, required: true }, sync_status: { type: String, enum: ['pending', 'synced', 'error'], default: 'pending' } }, { versionKey: false, timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, collection: 'cloud_product_paliers' });

const FluxDetailSchema = new mongoose.Schema({ localId: { type: String, required: true, unique: true }, flux_id: { type: String, required: true, index: true }, packaging_id: { type: String, required: true }, quantite: { type: Number, required: true }, quantite_restante: { type: Number, default: 0 }, prix_unitaire: { type: Number, default: 0 }, montant_ligne: { type: Number, default: 0 }, prix_unitaire_deconsigne: { type: Number, default: 0 }, jours_ecoules: { type: Number, default: 0 }, montant_penalite_unitaire: { type: Number, default: 0 }, montant_penalite: { type: Number, default: 0 }, regle_tarifaire_snapshot: { type: String, default: null } }, { versionKey: false, timestamps: { createdAt: 'created_at' }, collection: 'cloud_flux_packagings_details' });
const CloudConfigEcritureLigneSchema = new mongoose.Schema({ localId: { type: String, required: true }, config_id: { type: String, required: true }, label_ligne: String, compte_id: String, is_tiers: { type: Number, default: 0 }, journal_id: { type: String, required: true }, sens: { type: String, enum: ['DEBIT', 'CREDIT'] }, colonne_source: String, type_valeur: { type: String, enum: ['COLONNE', 'FIXE'], default: 'COLONNE' }, filtre_colonne: { type: String, default: null }, filtre_valeur: { type: String, default: null }, company_id: { type: String, index: true }, sync_status: { type: String, default: 'synced' } }, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, collection: 'cloud_config_ecritures_lignes' });
const ComptaQueueSchema = new mongoose.Schema({ localId: { type: String, index: true }, table_source: String, record_id: String, company_id: { type: String, index: true }, status: { type: String, default: 'pending' }, sync_status: { type: String, default: 'synced' } }, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, collection: 'cloud_compta_queue' });
const PaymentMethodSchema = new mongoose.Schema({ localId: { type: String, index: true }, company_id: { type: String, index: true }, code: String, libelle: String, compte_comptable_id: String, journal_id: String, is_active: { type: Number, default: 1 }, is_pos: { type: Number, default: 0 }, icone_name: { type: String, default: 'wallet' }, sync_status: { type: String, default: 'synced' } }, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, collection: 'cloud_payment_methods' });
const ClotureCaisseSchema = new mongoose.Schema({ localId: { type: String, index: true }, caissier_id: { type: String, required: true }, date_ouverture: { type: Date, default: Date.now }, date_cloture: { type: Date }, solde_ouverture: { type: Number, default: 0 }, total_theorique_global: { type: Number, default: 0 }, total_reel_global: { type: Number, default: 0 }, ecart_global: { type: Number, default: 0 }, statut: { type: String, enum: ['OUVERT', 'VALIDE', 'ANNULE'], default: 'OUVERT' }, is_late_cloture: { type: Number, default: 0 }, observation: { type: String }, company_id: { type: String, index: true, required: true }, sync_status: { type: String, default: 'synced' } }, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, collection: 'cloud_clotures_caisse' });
const ClotureDetailPaiementSchema = new mongoose.Schema({ localId: { type: String, index: true }, cloture_id: { type: String, index: true }, commentaire_detaille: { type: String }, payment_method_id: { type: String }, montant_theorique: { type: Number, default: 0 }, montant_reel: { type: Number, default: 0 }, ecart: { type: Number, default: 0 }, company_id: { type: String, index: true }, sync_status: { type: String, default: 'synced' } }, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, collection: 'cloud_cloture_details_paiements' });

ReportsANouveauSchema.index({ company_id: 1, exercice_id: 1, num_compte: 1, num_tiers: 1 });
LigneAnalytiqueSchema.index({ ligne_ecriture_id: 1, company_id: 1 });
AnalytiqueAutoRepartitionSchema.index({ config_id: 1 });
AnalytiqueConfigCompteSchema.index({ compte_general_id: 1, company_id: 1 });
PaymentMethodSchema.index({ company_id: 1, code: 1 });

module.exports = {
    CloudCompany: mongoose.models.CloudCompany || mongoose.model('CloudCompany', CompanySchema, 'cloud_companies'),
    CloudUser: mongoose.models.CloudUser || mongoose.model('CloudUser', UserSchema, 'cloud_users'),
    CloudStaff: mongoose.models.CloudStaff || mongoose.model('CloudStaff', StaffSchema, 'cloud_staff'),
    CloudProduct: mongoose.models.CloudProduct || mongoose.model('CloudProduct', ProductSchema, 'cloud_products'),
    CloudUnite: mongoose.models.CloudUnite || mongoose.model('CloudUnite', UniteSchema, 'cloud_unites'),
    CloudFamille: mongoose.models.CloudFamille || mongoose.model('CloudFamille', FamilleSchema, 'cloud_familles'),
    CloudCategorie: mongoose.models.CloudCategorie || mongoose.model('CloudCategorie', CategorieSchema, 'cloud_categories'),
    CloudProductGroup: mongoose.models.CloudProductGroup || mongoose.model('CloudProductGroup', ProductGroupSchema, 'cloud_product_groups'),
    CloudSupplier: mongoose.models.CloudSupplier || mongoose.model('CloudSupplier', SupplierSchema, 'cloud_suppliers'),
    CloudCustomer: mongoose.models.CloudCustomer || mongoose.model('CloudCustomer', CustomerSchema, 'cloud_customers'),
    CloudInventory: mongoose.models.CloudInventory || mongoose.model('CloudInventory', InventorySchema, 'cloud_inventories'),
    CloudInventoryItem: mongoose.models.CloudInventoryItem || mongoose.model('CloudInventoryItem', InventoryItemSchema, 'cloud_inventory_items'),
    CloudStockMovement: mongoose.models.CloudStockMovement || mongoose.model('CloudStockMovement', StockMovementSchema, 'cloud_stock_movements'),
    CloudAuditLog: mongoose.models.CloudAuditLog || mongoose.model('CloudAuditLog', AuditLogSchema, 'cloud_audit_logs'),
    CloudDepartement: mongoose.models.CloudDepartement || mongoose.model('CloudDepartement', DepartementSchema, 'cloud_departements'),
    CloudPlanAnalytique: mongoose.models.CloudPlanAnalytique || mongoose.model('CloudPlanAnalytique', PlanAnalytiqueSchema, 'cloud_plan_analytique'),
    CloudLigneAnalytique: mongoose.models.CloudLigneAnalytique || mongoose.model('CloudLigneAnalytique', LigneAnalytiqueSchema, 'cloud_lignes_analytiques'),
    CloudAnalytiqueDetail: mongoose.models.CloudAnalytiqueDetail || mongoose.model('CloudAnalytiqueDetail', AnalytiqueDetailSchema, 'cloud_analytique_details'),
    CloudAnalytiqueConfig: mongoose.models.CloudAnalytiqueConfig || mongoose.model('CloudAnalytiqueConfig', AnalytiqueConfigCompteSchema, 'cloud_analytique_configs'),
    CloudAnalytiqueAutoRepartition: mongoose.models.CloudAnalytiqueAutoRepartition || mongoose.model('CloudAnalytiqueAutoRepartition', AnalytiqueAutoRepartitionSchema, 'cloud_analytique_auto_repartitions'),
    CloudPlanComptable: mongoose.models.CloudPlanComptable || mongoose.model('CloudPlanComptable', PlanComptableSchema, 'cloud_plan_comptable'),
    CloudPlanTiers: mongoose.models.CloudPlanTiers || mongoose.model('CloudPlanTiers', PlanTiersSchema, 'cloud_plan_tiers'),
    CloudExercice: mongoose.models.CloudExercice || mongoose.model('CloudExercice', ExerciceSchema, 'cloud_exercices'),
    CloudJournal: mongoose.models.CloudJournal || mongoose.model('CloudJournal', JournalSchema, 'cloud_journaux'),
    CloudEcriture: mongoose.models.CloudEcriture || mongoose.model('CloudEcriture', EcritureSchema, 'cloud_ecritures'),
    CloudLigneEcriture: mongoose.models.CloudLigneEcriture || mongoose.model('CloudLigneEcriture', LigneEcritureSchema, 'cloud_lignes_ecritures'),
    CloudBrouillonEcriture: mongoose.models.CloudBrouillonEcriture || mongoose.model('CloudBrouillonEcriture', BrouillonEcritureSchema, 'cloud_brouillon_ecritures'),
    CloudBrouillonLigne: mongoose.models.CloudBrouillonLigne || mongoose.model('CloudBrouillonLigne', BrouillonLigneSchema, 'cloud_brouillon_lignes'),
    CloudBrouillonLigneAnalytique: mongoose.models.CloudBrouillonLigneAnalytique || mongoose.model('CloudBrouillonLigneAnalytique', BrouillonLigneAnalytiqueSchema, 'cloud_brouillon_lignes_analytiques'),
    CloudOthersTiers: mongoose.models.CloudOthersTiers || mongoose.model('CloudOthersTiers', OthersTiersSchema, 'cloud_others_tiers'),
    CloudReportsANouveau: mongoose.models.CloudReportsANouveau || mongoose.model('CloudReportsANouveau', ReportsANouveauSchema, 'cloud_reports_a_nouveau'),
    CloudBrouillardTreso: mongoose.models.CloudBrouillardTreso || mongoose.model('CloudBrouillardTreso', CloudBrouillardTresoSchema, 'cloud_brouillards_treso'),
    CloudBrouillardLigneTreso: mongoose.models.CloudBrouillardLigneTreso || mongoose.model('CloudBrouillardLigneTreso', CloudBrouillardLigneTresoSchema, 'cloud_brouillard_lignes_treso'),
    CloudBrouillardAffectation: mongoose.models.CloudBrouillardAffectation || mongoose.model('CloudBrouillardAffectation', CloudBrouillardAffectationSchema, 'cloud_brouillard_affectations'),
    CloudConfigEcritureAuto: mongoose.models.CloudConfigEcritureAuto || mongoose.model('CloudConfigEcritureAuto', CloudConfigEcritureAutoSchema, 'cloud_config_ecritures_auto'),
    CloudConfigEcritureLigne: mongoose.models.CloudConfigEcritureLigne || mongoose.model('CloudConfigEcritureLigne', CloudConfigEcritureLigneSchema, 'cloud_config_ecritures_lignes'),
    CloudComptaQueue: mongoose.models.CloudComptaQueue || mongoose.model('CloudComptaQueue', ComptaQueueSchema, 'cloud_compta_queue'),
    CloudSaleHeader: mongoose.models.CloudSaleHeader || mongoose.model('CloudSaleHeader', SaleHeaderSchema, 'cloud_sales'),
    CloudSaleItem: mongoose.models.CloudSaleItem || mongoose.model('CloudSaleItem', SaleItemSchema, 'cloud_sale_items'),
    CloudPurchasePayment: mongoose.models.CloudPurchasePayment || mongoose.model('CloudPurchasePayment', PurchasePaymentSchema, 'cloud_purchase_payments'),
    CloudPurchaseHeader: mongoose.models.CloudPurchaseHeader || mongoose.model('CloudPurchaseHeader', PurchaseHeaderSchema, 'cloud_purchases'),
    CloudPurchaseItem: mongoose.models.CloudPurchaseItem || mongoose.model('CloudPurchaseItem', PurchaseItemSchema, 'cloud_purchase_items'),
    CloudPayment: mongoose.models.CloudPayment || mongoose.model('CloudPayment', PaymentSchema, 'cloud_payments'),
    CloudProvisionalSale: mongoose.models.CloudProvisionalSale || mongoose.model('CloudProvisionalSale', ProvisionalSaleSchema, 'cloud_provisional_sales'),
    CloudPaymentMethod: mongoose.models.CloudPaymentMethod || mongoose.model('CloudPaymentMethod', PaymentMethodSchema, 'cloud_payment_methods'),
    CloudClotureCaisse: mongoose.models.CloudClotureCaisse || mongoose.model('CloudClotureCaisse', ClotureCaisseSchema, 'cloud_clotures_caisse'),
    CloudClotureDetailPaiement: mongoose.models.CloudClotureDetailPaiement || mongoose.model('CloudClotureDetailPaiement', ClotureDetailPaiementSchema, 'cloud_cloture_details_paiements'),
    CloudPackagingRule: mongoose.models.CloudPackagingRule || mongoose.model('CloudPackagingRule', PackagingRuleSchema, 'cloud_packaging_rules'),
    CloudPackagingRuleTier: mongoose.models.CloudPackagingRuleTier || mongoose.model('CloudPackagingRuleTier', PackagingRuleTierSchema, 'cloud_packaging_rule_tiers'),
    CloudPackaging: mongoose.models.CloudPackaging || mongoose.model('CloudPackaging', PackagingSchema, 'cloud_packaging'),
    CloudPackagingMovement: mongoose.models.CloudPackagingMovement || mongoose.model('CloudPackagingMovement', PackagingMovementSchema, 'cloud_packaging_movements'),
    CloudPackagingPurchase: mongoose.models.CloudPackagingPurchase || mongoose.model('CloudPackagingPurchase', PackagingPurchaseSchema, 'cloud_packaging_purchases'),
    CloudFluxPackaging: mongoose.models.CloudFluxPackaging || mongoose.model('CloudFluxPackaging', FluxEnteteSchema, 'cloud_flux_packagings'),
    CloudFluxPackagingDetail: mongoose.models.CloudFluxPackagingDetail || mongoose.model('CloudFluxPackagingDetail', FluxDetailSchema, 'cloud_flux_packagings_details'),
    CloudProductPalier: mongoose.models.CloudProductPalier || mongoose.model('CloudProductPalier', ProductPalierSchema, 'cloud_product_paliers'),
    CloudPackagingInventory: mongoose.models.CloudPackagingInventory || mongoose.model('CloudPackagingInventory', PackagingInventorySchema, 'cloud_packaging_inventories'), 
    CloudPackagingInventoryItem: mongoose.models.CloudPackagingInventoryItem || mongoose.model('CloudPackagingInventoryItem', PackagingInventoryItemSchema, 'cloud_packaging_inventory_items'),
    CloudStockAdjustment: mongoose.models.CloudStockAdjustment || mongoose.model('CloudStockAdjustment', StockAdjustmentSchema, 'cloud_stock_adjustments'),
    CloudStockAdjustmentItem: mongoose.models.CloudStockAdjustmentItem || mongoose.model('CloudStockAdjustmentItem', StockAdjustmentItemSchema, 'cloud_stock_adjustment_items'),
    CloudPurchaseOrder: mongoose.models.CloudPurchaseOrder || mongoose.model('CloudPurchaseOrder', PurchaseOrderSchema, 'cloud_purchase_orders'),
    CloudPurchaseOrderItem: mongoose.models.CloudPurchaseOrderItem || mongoose.model('CloudPurchaseOrderItem', PurchaseOrderItemSchema, 'cloud_purchase_order_items')
};