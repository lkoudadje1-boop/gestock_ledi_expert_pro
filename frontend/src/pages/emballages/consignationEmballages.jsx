import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
    ClipboardList, Trash2, Package, Search, 
    Plus, ChevronLeft, Clock, CheckCircle, Pencil ,
    Inbox, Archive, X, AlertCircle, Loader2,  CheckCircle2, FileText, User, RotateCcw
} from 'lucide-react';
import { useLocation } from 'react-router-dom'; // 🛰️ Écoute les redirections de la caisse
import Sidebar from '../../components/Sidebar';
import API, { socket } from '../../services/api';
import { getUserPermissions } from '../../utils/permissions_utils';
import { useReactToPrint } from 'react-to-print';
import ConsignationPrint from '../TerminalPos/consignationPrint';

const inlineStyles = `
  .fixed-page-container {
    height: 100vh;
    overflow: hidden;
    display: flex;
    background-color: #f8fafc;
  }
  .main-content-layout {
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow: hidden;
  }
  .form-scrollable-body {
    flex: 1;
    overflow-y: auto;
    padding: 1.25rem;
    max-height: calc(100vh - 80px);
  }
  .side-by-side-panier-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.25rem;
    margin-top: 1.25rem;
    align-items: stretch;
  }
  .scrollable-panier-card {
    height: calc(100vh - 460px);
    min-height: 280px;
    overflow-y: auto;
    border: 1px solid #e2e8f0;
    border-radius: 0.5rem;
    padding: 1rem;
    background-color: #ffffff;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  }
`;

const DynamicTimer = ({ createdAt }) => {
    const [diff, setDiff] = useState(null);

    useEffect(() => {
        const calculateDiff = () => {
            const start = new Date(createdAt).getTime();
            const now = new Date().getTime();
            const delta = now - start;

            if (delta < 0) return setDiff("0s");
            
            const days = Math.floor(delta / (1000 * 60 * 60 * 24));
            const hours = Math.floor((delta % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((delta % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((delta % (1000 * 60 ?? 0)) / 1000);

            setDiff(`${days}j ${hours}h ${minutes}m ${seconds}s`);
        };
        calculateDiff();
        const interval = setInterval(calculateDiff, 1000); // Mise à jour chaque seconde
        return () => clearInterval(interval);
    }, [createdAt]);
    return <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#475569' }}>{diff}</span>;
};

// ✅ CONFIGURATION CAMÉLÉON : Le composant accepte les appels et états de fermeture de la caisse
const ConsignationEmballages = ({ isModalMode = false, defaultFactureId = null, onClose = null }) => {
    const location = useLocation();
    const userPerms = useMemo(() => getUserPermissions(), []);
    const canModifyCons = userPerms['emb_cons_btn_modify'] === true || userPerms['emb_cons_btn_modify'] === 1 || userPerms['emb_cons_btn_modify'] === 'true' || userPerms['emb_cons_btn_modify'] === '1';
    const canDeleteCons = userPerms['emb_cons_btn_delete'] === true || userPerms['emb_cons_btn_delete'] === 1 || userPerms['emb_cons_btn_delete'] === 'true' || userPerms['emb_cons_btn_delete'] === '1';
    
    // Si ouvert en modale caisse, on affiche directement le formulaire
    const [showForm, setShowForm] = useState(isModalMode);
    const [activeTab, setActiveTab] = useState('en_cours');
    const [historique, setHistorique] = useState([]);
    const [emballages, setEmballages] = useState([]);
    const [factures, setFactures] = useState([]);
    const [vraiSaleId, setVraiSaleId] = useState('');
    const [company, setCompany] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedEmballage, setSelectedEmballage] = useState(null);
    const [quantite, setQuantite] = useState(1);
    const [panierConsignations, setPanierConsignations] = useState([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editingFluxId, setEditingFluxId] = useState(null);
    const [mode, setMode] = useState('CONSIGNATION'); // 'CONSIGNATION' ou 'DECONSIGNATION'
    const [fluxSource, setFluxSource] = useState(null); // Stocke le flux sur lequel on travaille
    
    // 💡 AJOUT STRATÉGIQUE : Retient le montant reçu initial pour le calcul du prorata de remboursement
    const [fluxSourceMontantRecuInitial, setFluxSourceMontantRecuInitial] = useState(0);

    const [selectedFacture, setSelectedFacture] = useState('');
    const [nomClient, setNomClient] = useState('');
    const [clientId, setClientId] = useState('');
    const [expandedRows, setExpandedRows] = useState({});
    const componentRef = useRef();
    const [printTrigger, setPrintTrigger] = useState(false);
    const [pendingFormat, setPendingFormat] = useState(null);

    // =========================================================================
    // ⚙️ CORRECTION MAJEURE FORMAT : Forcé à 'A5' pour éviter le crash graphique
    // =========================================================================
    const [formatImpression, setFormatImpression] = useState('A5');

    // Écoute des injections automatiques émises depuis l'écran POS de caisse
    useEffect(() => {
        if (isModalMode && defaultFactureId) {
            setSelectedFacture(defaultFactureId);
            setShowForm(true);
        } else if (location.state?.autoOpenForm) {
            setShowForm(true);
            if (location.state?.preselectedFacture) {
                setSelectedFacture(location.state.preselectedFacture);
            }
        }
    }, [isModalMode, defaultFactureId, location.state]);

    useEffect(() => {
        const styleTag = document.createElement('style');
        styleTag.innerHTML = inlineStyles;
        document.head.appendChild(styleTag);
        return () => document.head.removeChild(styleTag);
    }, []);


    const [typeGarantie, setTypeGarantie] = useState('ESPECES'); // 'ESPECES' ou 'PHYSIQUE'
    const [montantRecu, setMontantRecu] = useState(0);           // Somme réellement perçue par le caissier
    const [garantieLibelle, setGarantieLibelle] = useState('');   // Libellé de l'objet (Ex: CNI N°..., Permis)
    
    const montantTotalTheoriquePanier = useMemo(() => {
        return panierConsignations.reduce((acc, item) => {
            const qte = Number(item.qte || 0);
            const pu = Number(item.prix_unitaire || item.prix_consigne || 0);
            return acc + (qte * pu);
        }, 0);
    }, [panierConsignations]);

    const fluxFinancierReel = useMemo(() => {
        if (typeGarantie === 'PHYSIQUE') return 0;
        return Number(montantRecu || 0);
    }, [typeGarantie, montantRecu]);

    const resteAPayerEcart = useMemo(() => {
        if (typeGarantie === 'PHYSIQUE') return 0;
        const calculEcart = Number(montantTotalTheoriquePanier) - Number(montantRecu || 0);
        return calculEcart > 0 ? calculEcart : 0;
    }, [typeGarantie, montantTotalTheoriquePanier, montantRecu]);


    const validerEtImprimer = async (format) => {
        if (isSubmitting) return;

        if (isEditing && !canModifyCons) {
            return showToast("🛑 ACCÈS REFUSÉ : Privilège de modification manquant pour votre profil.", "error");
        }
        setIsSubmitting(true);
        let success = false;
        try {
            if (mode === 'CONSIGNATION') {
                success = await enregistrerConsignation();
            } else {
                success = await enregistrerDeconsignation();
            }
            if (!success) return;
            if (format !== 'NONE') {
                handlePrintWithFormat(format);
                
                setTimeout(() => {
                    resetForm();
                    if (isModalMode && onClose) {
                        onClose();
                    } else {
                        setShowForm(false);
                    }
                    fetchHistorique();
                }, 150);
            } else {
                resetForm();
                if (isModalMode && onClose) {
                    onClose();
                } else {
                    setShowForm(false);
                }
                fetchHistorique();
            }
        } catch (err) {
            showToast("Erreur lors de la validation", "error");
        } finally {
            setIsSubmitting(false);
        }
    };
    const panierImpression = useMemo(() => {
        if (mode === 'CONSIGNATION') {
            return (panierConsignations || []).map(item => ({
                nom_article_snap: item.nom,
                quantite: item.qte,
                prix_vente_unitaire: item.prix_unitaire,
                type: 'CONSIGNATION',
                type_garantie: typeGarantie,
                montant_recu: typeGarantie === 'ESPECES' ? Number(montantRecu || 0) : 0,
                garantie_libelle: typeGarantie === 'PHYSIQUE' ? garantieLibelle : ''
            }));
        }
        if (mode === 'DECONSIGNATION' && fluxSource) {
            const lignes = [];
            
            // 1. CONSIGNATIONS INITIALES (Pour afficher la colonne Q.CONS)
            (fluxSource?.emballages || []).forEach(e => {
                lignes.push({
                    nom_article_snap: e.nom || e.nom_emballage || 'Emballage',
                    quantite: Number(e.qte || e.quantite || 0),
                    prix_vente_unitaire: Number(e.prix_unitaire || 0),
                    type: 'CONSIGNATION_INITIALE'
                });
            });

            // 2. ANCIENNES DÉCONSIGNATIONS (Pour alimenter la colonne Q.DÉC passée)
            const historique = fluxSource?.deconsignations_anterieures || fluxSource?.historique_deconsignation || fluxSource?.deconsignations || [];
            historique.forEach(r => {
                lignes.push({
                    nom_article_snap: r.nom || r.nom_emballage || r.emballage,
                    quantite: -Math.abs(Number(r.quantite || r.qte || 0)),
                    // 💡 L'ASTUCE : Forcé à 0 pour que le ticket ne cumule pas financièrement les anciens remboursements [b2]
                    prix_vente_unitaire: 0, 
                    type: 'DECONSIGNATION_ANTERIEURE'
                });
            });

            // 3. DÉCONSIGNATION EN COURS (Le remboursement à l'instant T au prorata) [b2]
            const totalTheoriqueInitial = (fluxSource?.emballages || []).reduce((acc, e) => {
                return acc + (Number(e.qte || 0) * Number(e.prix_unitaire || 0));
            }, 0);
            const mntEncaisseFlux = Number(fluxSource?.montant_recu || fluxSource?.mnt_encaisse || 0);
            const prorataCoefficient = totalTheoriqueInitial > 0 ? (mntEncaisseFlux / totalTheoriqueInitial) : 1;

            (panierConsignations || []).forEach(item => {
                const prixTheorique = Number(item.prix_unitaire || item.prix_vente_unitaire || 0);
                const prixRemboursementProrata = prixTheorique * prorataCoefficient;

                lignes.push({
                    nom_article_snap: item.nom || item.nom_article_snap,
                    quantite: -Math.abs(Number(item.qte || item.quantite || 0)),
                    // Uniquement le prix prorata de l'instant T qui doit être remboursé aujourd'hui [b2]
                    prix_vente_unitaire: prixRemboursementProrata > 0 ? prixRemboursementProrata : prixTheorique,
                    type: 'DECONSIGNATION_ACTUELLE'
                });
            });

            return lignes;
        }
        return [];
    }, [panierConsignations, fluxSource, mode, typeGarantie, montantRecu, garantieLibelle]);

    const handlePrintWithFormat = (format) => {
        setPendingFormat(format);
        setPrintTrigger(true);
    };
        
    useEffect(() => {
        if (!printTrigger || !pendingFormat) return;

        setFormatImpression(pendingFormat);

        // attendre le render réel
        setTimeout(() => {
            handlePrint();
            setPrintTrigger(false);
        }, 0);

    }, [printTrigger, pendingFormat]);

    const handlePrint = useReactToPrint({
        content: () => componentRef.current,
        pageStyle: `
            @page {
                size: ${
                    formatImpression === 'A6'
                        ? '105mm 148mm'
                        : formatImpression === 'A5'
                        ? '148mm 210mm'
                        : formatImpression === 'A4'
                        ? '210mm 297mm'
                        : 'auto'
                };
                margin: 0;
            }
        `
    });


       // --- ÉTAT DU TOAST INTÉGRÉ ---
    const [notification, setNotification] = useState({
        isOpen: false,
        type: 'success', 
        message: '',
        onConfirm: null
    });

    const toggleRow = (id) => {
        setExpandedRows(prev => ({
            ...prev,
            [id]: !prev[id]
        }));
    };
    
    const primaryColor = '#2563eb';
    const borderColor = '#e2e8f0';

    // --- SYSTÈME DE NOTIFICATION TOAST ---
    const showToast = useCallback((message, type = 'success') => {
        setNotification({ isOpen: true, type, message, onConfirm: null });
    }, []);

    const showConfirm = (message, onConfirm) => {
        setNotification({ isOpen: true, type: 'confirm', message, onConfirm });
    };

    // --- FONCTION DE RÉINITIALISATION DU FORMULAIRE ET DE LA MÉMOIRE (CORRIGÉE AVEC RAZ GARANTIE) ---
    const resetFormulaire = useCallback(() => {
        setPanierConsignations([]);
        setSelectedEmballage(null);
        setQuantite(1);
        setSelectedFacture('');
        setNomClient('');
        setVraiSaleId('');
        setClientId('');
        setIsEditing(false);
        setEditingFluxId(null);
        setMode('CONSIGNATION');
        setFluxSource(null);
        setSearchTerm('');
        
        // --- 🔄 NETTOYAGE STRICT DES CHAMPS DE GARANTIE POUR ÉVITER LES FUITES DE MÉMOIRE ---
        setTypeGarantie('ESPECES');
        setMontantRecu(0);
        setGarantieLibelle('');
        // RAZ du montant reçu initial mémorisé pour le prorata
        setFluxSourceMontantRecuInitial(0);
    }, []);
    

    // --- ACCÈS PROPRE AU FORMULAIRE VIERGE ---
    const handleNouvelleConsignation = () => {
        resetFormulaire(); // Nettoie la mémoire résiduelle
        setShowForm(true); // Ouvre le formulaire vierge
    };

    // --- CHARGEMENT DES DONNÉES ---
    const fetchHistorique = useCallback(async () => {
        try {
            const res = await API.get('/consignations');
            setHistorique(res.data || []);
        } catch (err) { 
            console.error("Erreur historique consignations:", err); 
            showToast("Impossible de charger l'historique des consignations", "error");
        }
    }, [showToast]);

    const handleEdit = async (fluxId) => {
        // 🔑 SÉCURITÉ DE POSTE INTERNE : Interdire l'accès à l'édition si le droit du bouton modifier est absent
        if (!canModifyCons) {
            return showToast("🛑 ACCÈS REFUSÉ : Privilège de modification de consignation manquant.", "error");
        }

        try {
            // Nettoyage préalable par sécurité avant d'injecter les données d'édition
            resetFormulaire();

            // 1. Récupération des données du flux spécifique
            const res = await API.get(`/consignations/${fluxId}`);
            const data = res.data; 

            if (!data) return;

            // 2. Mise à jour de l'état du formulaire
            setEditingFluxId(fluxId);
            setIsEditing(true);
            setShowForm(true);

            // 3. Hydratation explicite des champs pour le client et la facture
            setSelectedFacture(data.numero_facture || ''); 
            setNomClient(data.client_nom || 'Client inconnu'); 
            setVraiSaleId(data.sale_id); 

            // --- 🔄 HYDRATATION DES NOUVELLES VARIABLES DE CONSIGNATION FLEXIBLE ---
            setTypeGarantie(data.type_garantie || 'ESPECES');
            const mtRecu = Number(data.montant_recu || 0);
            setMontantRecu(mtRecu);
            setGarantieLibelle(data.garantie_libelle || '');
            
            // 💡 PEUPLEMENT DU PRORATA : Sauvegarde permanente du montant reçu initial pour sécuriser le remboursement futur
            setFluxSourceMontantRecuInitial(mtRecu);

            // 4. Hydratation du panier
            const itemsFormates = Array.isArray(data.items) ? data.items.map(item => ({
                packaging_id: item.packaging_id,
                nom: item.nom_emballage || 'Emballage',
                qte: item.qte || item.quantite || 0,
                prix_unitaire: item.prix_unitaire || 0,
                unite: 'U'
            })) : [];

            setPanierConsignations(itemsFormates);
            
        } catch (err) {
            console.error("Erreur lors de l'édition:", err);
            showToast("Erreur lors du chargement des données à modifier", "error");
        }
    };

// --- FONCTION DE NETTOYAGE MISE À BASE (Remplace l'ancienne fonction incomplète) ---
const resetForm = () => {
    setIsEditing(false);
    setEditingFluxId(null);
    setPanierConsignations([]);
    setSelectedEmballage(null);
    setQuantite(1);
    setNomClient('');
    setSelectedFacture('');
    setVraiSaleId('');
    setClientId('');
    setMode('CONSIGNATION');
    setFluxSource(null);
    setSearchTerm('');

    // --- 🔄 AJOUT COMPTABLE : RAZ DES COMPTES DE GARANTIES ET DES CASH-FLUX REÇUS ---
    setTypeGarantie('ESPECES');
    setMontantRecu(0);
    setGarantieLibelle('');
    setFluxSourceMontantRecuInitial(0);
};
// --- OUVERTURE DE LA DÉCONSIGNATION (CORRIGÉE CONFORMÉMENT AUX RÈGLES DE TRÉSORERIE) ---
const ouvrirFormulaireDeconsignation = (flux) => {
    resetForm(); // On nettoie d'abord toute trace de consignation précédente
    setMode('DECONSIGNATION');
    setFluxSource(flux); // Stockage du flux d'origine pour les contrôles de quantité
    
    // Hydratation complète et sécurisée des métadonnées du flux
    setNomClient(flux.client_nom || 'CLIENT AU COMPTANT');
    setSelectedFacture(flux.numero_facture || flux.sale_id || '');
    setVraiSaleId(flux.sale_id || '');
    setClientId(flux.client_id || '');
    
    // NOTE : Pour une déconsignation, on conserve par défaut le même type de garantie que le flux source 
    // afin que le caissier sache s'il doit rendre de l'argent ou restituer un document physique.
    setTypeGarantie(flux.type_garantie || 'ESPECES');
    setGarantieLibelle(flux.garantie_libelle || '');

    // 🔒 SÉCURITÉ CAISSIER (Problème 1) : On indexe le montant reçu initialement en base
    const mntInitialReellementPaye = Number(flux.mnt_encaisse || flux.montant_recu || 0);
    setFluxSourceMontantRecuInitial(mntInitialReellementPaye);
    
    // 💡 REMBOURSEMENT INSTANT T (Problème 2) : Au départ de la déconsignation, le montant remboursé est à 0.
    // Il va s'incrémenter dynamiquement selon les lignes que le caissier va ajouter au panier.
    setMontantRecu(0);
    
    setPanierConsignations([]); // Vide pour laisser l'utilisateur ajouter ses retours
    setShowForm(true);
};

const handleDelete = (fluxId) => {
    // 🔑 SÉCURITÉ DE POSTE INTERNE : Interdire l'exécution si le privilège du bouton supprimer est absent
    if (!canDeleteCons) {
        return showToast("🛑 ACCÈS REFUSÉ : Privilège de suppression de consignation manquant.", "error");
    }

    showConfirm("Êtes-vous sûr de vouloir supprimer cette consignation ? Cette action réintégrera le stock.", async () => {
        try {
            await API.delete(`/consignations/${fluxId}`);
            showToast("Consignation supprimée avec succès");
            fetchHistorique();
        } catch (err) {
            showToast(err.response?.data?.error || "Erreur lors de la suppression", "error");
        }
    });
};

const fetchEmballagesDisponibles = useCallback(async () => {
    try {
        const res = await API.get('/emballages'); 
        if (res.data && Array.isArray(res.data)) {
            setEmballages(res.data);
        }
    } catch (err) { 
        showToast("Erreur de chargement des emballages", "error");
    }
}, [showToast]);

const fetchFacturesActives = useCallback(async () => {
    try {
        const res = await API.get('/sales');
        const data = Array.isArray(res.data) ? res.data : (res.data.sales || []);
        setFactures(data);
    } catch (err) { 
        console.error("Erreur de chargement des factures :", err);
    }
}, []);

        useEffect(() => {
        const fetchCompanySettings = async () => {
            try {
                const res = await API.get('/company/settings');
                
                if (res && res.data) {
                    const dbCompany = res.data;
                    
                    // Mappage et normalisation des champs SQLite vers les propriétés attendues par l'impression
                    const normalizedCompany = {
                        ...dbCompany,
                        nom: dbCompany.name || dbCompany.nom || "SOCIÉTÉ",
                        telephone: dbCompany.phone || dbCompany.telephone || "---",
                        adresse: dbCompany.address || dbCompany.adresse || "---",
                        nif: dbCompany.nif_number || dbCompany.nif || "---",
                        rccm: dbCompany.rccm_number || dbCompany.rccm || "---"
                    };
                    
                    setCompany(normalizedCompany);
                }
            } catch (err) {
                document.warn ? document.warn("Paramètres non disponibles, chargement par défaut.") : console.warn("Paramètres non disponibles, chargement par défaut.");
                setCompany(null);
            }
        };

        fetchCompanySettings();
    }, []);


    // --- EFFET DE RECHERCHE ET RECONNAISSANCE CLIENT (SÉCURISÉ) ---
    useEffect(() => {
        // Si on est en mode DECONSIGNATION, on ne doit pas laisser la recherche de facture écraser le client du fluxSource
        if (mode === 'DECONSIGNATION') return;

        if (!selectedFacture) {
            setNomClient('');
            setClientId('');
            setVraiSaleId('');
            return;
        }

        if (!factures || factures.length === 0) return;

        const searchStr = selectedFacture.toString().trim();
        
        const fact = factures.find(f => 
            (f.lot_id && f.lot_id.toString() === searchStr) || 
            (f.id && f.id.toString() === searchStr)
        );
        
        if (fact) {
            if (nomClient !== (fact.nom_client_snap || "CLIENT AU COMPTANT")) {
                setNomClient(fact.nom_client_snap || "CLIENT AU COMPTANT");
            }
            if (clientId !== (fact.customer_id || "")) {
                setClientId(fact.customer_id || "");
            }
            if (vraiSaleId !== fact.id) {
                setVraiSaleId(fact.id);
            }
        } else {
            setNomClient('Client inconnu ou introuvable');
            setClientId('');
            setVraiSaleId('');
        }
    }, [selectedFacture, factures, mode, nomClient, clientId, vraiSaleId]);

    // --- LOGIQUE SOCKET ---
    useEffect(() => {
        if (!socket) return;
        const handleRefresh = (data) => {
            if (
                data?.module === 'EMBALLAGES_CONSIGNE' ||
                data?.module === 'EMBALLAGES_DECONSIGNE' ||
                data?.module === 'EMBALLAGES'
            ) {
                fetchHistorique();
                fetchEmballagesDisponibles(); // 🔥 IMPORTANT
            }
        };

        socket.on('REFRESH_UI', handleRefresh);
        return () => {
            socket.off('REFRESH_UI', handleRefresh);
        };
    }, [fetchHistorique, fetchEmballagesDisponibles]);

    useEffect(() => {
        fetchHistorique();
        fetchEmballagesDisponibles();
        fetchFacturesActives();
    }, [fetchHistorique, fetchEmballagesDisponibles, fetchFacturesActives]);

    // --- AUTO-CLOSE TOAST ---
    useEffect(() => {
        if (notification.isOpen && notification.type !== 'confirm') {
            const timer = setTimeout(() => setNotification(prev => ({ ...prev, isOpen: false })), 4000);
            return () => clearTimeout(timer);
        }
    }, [notification.isOpen, notification.type]);

    // --- ACTIONS ---
    const executerAnnulation = async (id_flux) => {
        // 🔑 SÉCURITÉ DE POSTE INTERNE BEFORE NETWORK : Interdire la suppression si le droit est absent
        if (!canDeleteCons) {
            return showToast("🛑 ACCÈS REFUSÉ : Privilège de suppression de consignation manquant pour votre profil.", "error");
        }

        try {
            await API.delete(`/consignations/${id_flux}`);
            setNotification({ isOpen: false, type: 'success', message: '', onConfirm: null });
            showToast("Consignation annulée avec succès");
            fetchHistorique();
        } catch (err) { 
            const msg = err.response?.data?.error || "Erreur lors de la suppression";
            showToast(msg, "error"); 
        }
    };

    // --- CORRECTION : Utilisation de la fonction globale resetForm pour tout nettoyer à 100% (Garanties + Espèces) ---
    const ouvrirFormulaire = () => {
        resetForm(); // Vide le panier, réinitialise le mode, nettoie le client, les garanties et les doublons
        setShowForm(true);
    };

const ajouterAuPanier = () => {
    const qteSaisie = parseFloat(quantite);
    
    // 1. Vérification de la sélection
    if (!selectedEmballage) return showToast("Sélectionnez un emballage", "error");
    
    // 🪙 SÉCURISATION MAXIMALE DE L'IDENTIFIANT : 
    const idIdentifie = selectedEmballage.packaging_id || selectedEmballage.id || selectedEmballage._id || selectedEmballage.code;
    
    if (!idIdentifie) {
        return showToast("Erreur technique : L'emballage sélectionné n'a pas d'identifiant unique (ID) valide", "error");
    }

    if (isNaN(qteSaisie) || qteSaisie <= 0) return showToast("Quantité invalide", "error");

    // 2. Récupération de la quantité maximale consignée au départ selon le mode
    let qteConsigneeAuDepart = 0;
    if (mode === 'DECONSIGNATION') {
        // En déconsignation, on lit la quantité directement depuis l'emballage du flux source
        qteConsigneeAuDepart = parseFloat(selectedEmballage.qte || selectedEmballage.quantite || selectedEmballage.quantite_initiale || 0);
    } else {
        qteConsigneeAuDepart = parseFloat(selectedEmballage.quantite_initiale || selectedEmballage.qte_consignee || selectedEmballage.quantite || 999999);
    }

    // 3. Clonage du panier pour la détection et la fusion des doublons
    let panierMisAJour = [...panierConsignations];
    
    // 🎯 RECHERCHE ULTRA-STRICTE DE DOUBLONS (Problème 3)
    const indexExistant = panierMisAJour.findIndex(item => 
        item.packaging_id === idIdentifie || 
        item.id === idIdentifie ||
        (item.nom === (selectedEmballage.nom || selectedEmballage.designation)) ||
        (item.nom_article_snap === (selectedEmballage.nom || selectedEmballage.designation))
    );

    if (indexExistant > -1) {
        // 🔄 L'ARTICLE RECONNU EXISTE DÉJÀ DANS LE PANIER -> FUSION ET VÉRIFICATION DU PLAFOND GLOBAL
        const qteDejaDansLePanier = Math.abs(panierMisAJour[indexExistant].qte || panierMisAJour[indexExistant].quantite || 0);
        const qteCumuleeTotale = qteDejaDansLePanier + qteSaisie;

        if (mode === 'DECONSIGNATION' && qteCumuleeTotale > qteConsigneeAuDepart) {
            return showToast(
                `🛑 CUMUL INTERDIT : Cet article est déjà dans le panier (${qteDejaDansLePanier} U). Ajouter ${qteSaisie} U porterait le total à ${qteCumuleeTotale} U, ce qui dépasse la consignation d'origine de ${qteConsigneeAuDepart} U.`,
                "error"
            );
        }

        // Si le cumul est autorisé, on met à jour la quantité sur la ligne existante
        if (mode === 'DECONSIGNATION') {
            panierMisAJour[indexExistant].qte = qteCumuleeTotale;
            panierMisAJour[indexExistant].quantite = -qteCumuleeTotale;
        } else {
            panierMisAJour[indexExistant].qte = qteCumuleeTotale;
            panierMisAJour[indexExistant].quantite = qteCumuleeTotale;
        }

    } else {
        // 🆕 L'ARTICLE N'EST PAS DANS LE PANIER -> PREMIER AJOUT DE LA LIGNE
        if (mode === 'DECONSIGNATION' && qteSaisie > qteConsigneeAuDepart) {
            return showToast(
                `🛑 LIMITE ATTEINTE : Impossible de déconsigner ${qteSaisie} U. Le client n'a consigné que ${qteConsigneeAuDepart} U au départ sur cette facture.`,
                "error"
            );
        }

        const pu = Number(selectedEmballage.prix_unitaire || selectedEmballage.prix_consigne || selectedEmballage.prix_vente_unitaire || 0);

        panierMisAJour.push({
            packaging_id: idIdentifie,
            id: idIdentifie,
            nom: selectedEmballage.nom || selectedEmballage.designation,
            nom_article_snap: selectedEmballage.nom || selectedEmballage.designation,
            qte: qteSaisie,
            quantite: mode === 'DECONSIGNATION' ? -qteSaisie : qteSaisie,
            prix_unitaire: pu,
            prix_vente_unitaire: pu,
            unite: selectedEmballage.unite || selectedEmballage.unite_mesure || 'U',
            quantite_initiale: qteConsigneeAuDepart
        });
    }

    // 💡 AJOUT DU CALCUL DE REMBOURSEMENT AU PRORATA IMMÉDIAT À L'INSTANT T (Problèmes 1 & 2)
    if (mode === 'DECONSIGNATION' && fluxSource) {
        // Étape A: Calcul du montant total théorique du flux d'origine
        const totalTheoriqueInitial = (fluxSource?.emballages || []).reduce((acc, e) => {
            return acc + (Number(e.qte || 0) * Number(e.prix_unitaire || 0));
        }, 0);

        // Étape B: Récupérer le montant réel d'origine encaissé
        const montantReelEncaisseInitial = Number(fluxSource?.montant_recu || fluxSource?.mnt_encaisse || 0);

        // Étape C: Calcul du coefficient de prorata
        const prorataCoefficient = totalTheoriqueInitial > 0 ? (montantReelEncaisseInitial / totalTheoriqueInitial) : 1;

        // Étape D: Calcul du montant financier total dû uniquement pour les lignes présentes dans le panier actuel
        const totalRemboursementInstantT = panierMisAJour.reduce((acc, item) => {
            const itemQte = Number(item.qte || 0);
            const itemPuTheorique = Number(item.prix_unitaire || 0);
            return acc + (itemQte * (itemPuTheorique * prorataCoefficient));
        }, 0);

        // On assigne ce montant à l'état du montant reçu pour que l'interface affiche la valeur exacte de ce panier
        setMontantRecu(totalRemboursementInstantT);
    }

    // 4. Sauvegarde de l'état nettoyé et réinitialisation des champs de l'interface
    setPanierConsignations(panierMisAJour);
    setSelectedEmballage(null);
    setQuantite(1);
};

useEffect(() => {
    if (selectedEmballage) {
        setQuantite(1);
    }
}, [selectedEmballage]);


const enregistrerConsignation = async () => {
    if (!selectedFacture) {
        showToast("Veuillez sélectionner une facture", "error");
        return false;
    }

    if (panierConsignations.length === 0) {
        showToast("Le panier est vide", "error");
        return false;
    }

    // 🔒 SÉCURITÉ DE SAISIE PAR TYPE DE GARANTIE
    if (typeGarantie === 'PHYSIQUE' && !garantieLibelle.trim()) {
        showToast("Veuillez renseigner la nature du dépôt physique (ex: CNI N°, Permis...)", "error");
        return false;
    }

    const itemsInvalides = panierConsignations.filter(item => !item.packaging_id);
    if (itemsInvalides.length > 0) {
        showToast("Erreur : Un emballage n'a pas d'identifiant valide.", "error");
        return false;
    }

    const idCherche = String(selectedFacture).trim();
    const factureTrouvee = factures.find(f =>
        String(f.lot_id || '').trim() === idCherche ||
        String(f.id || '').trim() === idCherche
    );

    if (!factureTrouvee) {
        showToast("Facture introuvable. Vérifiez votre sélection.", "error");
        return false;
    }
    
    const totalConsignationTheorique = panierConsignations.reduce(
        (acc, item) => acc + (Number(item.qte || 0) * Number(item.prix_unitaire || 0)),
        0
    );

    // Détermination stricte du montant perçu réel
    const mntPayeReellement = typeGarantie === 'ESPECES' ? Number(montantRecu || 0) : 0;

    setIsSubmitting(true);

    try {
        const payload = {
            tiers_id: clientId || null,
            client_nom: nomClient,
            sale_id: factureTrouvee.id,
            montant_total: totalConsignationTheorique, // 5000 F (Brut système théorique)
            
            // --- 🔄 RECTIFICATION SOURCE COMPTABLE POUR SÉCURISER LE REMBOURSEMENT ---
            type_garantie: typeGarantie,
            montant_recu: mntPayeReellement,            // 4000 F (Argent réellement touché)
            flux_financier_realise: fluxFinancierReel, 
            garantie_libelle: typeGarantie === 'PHYSIQUE' ? garantieLibelle.trim() : '',
            
            // 🔒 RECOPIE DE SÉCURITÉ : Indique au backend que la dette de remboursement futur 
            // doit être indexée sur le cash encaissé et non sur la valeur théorique !
            a_rembourser: typeGarantie === 'ESPECES' ? mntPayeReellement : 0, 

            items: panierConsignations.map(item => ({
                packaging_id: item.packaging_id,
                qte: Number(item.qte),
                prix_unitaire: Number(item.prix_unitaire)
            }))
        };

        if (isEditing && editingFluxId) {
            await API.put(`/consignations/${editingFluxId}`, payload);
        } else {
            await API.post('/consignations', payload);
        }

        return true; 
    } catch (err) {
        showToast(err.response?.data?.error || "Erreur serveur", "error");
        return false;
    } finally {
        setIsSubmitting(false);
    }
};

const enregistrerDeconsignation = async () => {
    if (!fluxSource) return showToast("Flux source introuvable", "error");
    if (panierConsignations.length === 0) return showToast("Le panier de restitution est vide", "error");

    setIsSubmitting(true);
    try {
        const item = panierConsignations[0]; 

        // 💡 EXTRACTION & NETTOYAGE ABSOLU : Force la quantité à être un nombre positif strict (ex: -1 devient 1)
        const quantiteNettoyeePositive = Math.abs(parseFloat(item.qte || item.quantite || 0));

        // Validation de sécurité locale avant l'envoi au serveur
        if (isNaN(quantiteNettoyeePositive) || quantiteNettoyeePositive <= 0) {
            setIsSubmitting(false);
            return showToast("La quantité à déconsigner doit être supérieure à 0", "error");
        }

        const payload = {
            flux_id: fluxSource.id_flux || fluxSource.id, 
            // 🔒 LA SÉCURITÉ : Envoi d'une valeur positive brute pour valider le contrôle du serveur
            qte_retournee: quantiteNettoyeePositive 
        };

        await API.post('/consignations/retour', payload);
        
        // --- 🔒 SÉCURITÉ DE RESTITUTION PHYSIQUE : Alerte visuelle pour rendre la pièce d'identité ---
        if (fluxSource.type_garantie === 'PHYSIQUE' || typeGarantie === 'PHYSIQUE') {
            showToast(`✅ Déconsignation réussie ! N'OUBLIEZ PAS DE RESTITUER : ${fluxSource.garantie_libelle || garantieLibelle || "la pièce d'identité"}`, "info");
        } else {
            showToast("Déconsignation effectuée avec succès");
        }
        
        handlePrint();
        resetForm();
        setShowForm(false);
        fetchHistorique();
    } catch (err) {
        console.error(err);
        showToast(err.response?.data?.error || "Erreur de traitement", "error");
    } finally {
        setIsSubmitting(false);
    }
};



const listeAffichee = useMemo(() => {
    const rawData = historique.filter(h => h.is_archive !== 1);

    const grouped = rawData.reduce((acc, curr) => {
        const fluxId = curr.id_flux || curr.id;
        
        if (!acc[fluxId]) {
            acc[fluxId] = { 
                ...curr, 
                id: fluxId,
                emballages: [], 
                deconsignations_anterieures: [],
                solde_total_flux: 0, 
                tot_penalite_calcule: 0,
                // --- 🔄 PROPAGATION DES PROPRIÉTÉS DE GARANTIE POUR L'AFFICHAGE DE LA LISTE ---
                type_garantie: curr.type_garantie || 'ESPECES',
                garantie_libelle: curr.garantie_libelle || '',
                montant_recu: Number(curr.montant_recu || curr.mnt_encaisse || 0)
            };
        }
        
        const qteLigne = parseFloat(curr.quantite || curr.qte || 0);
        const qteRestanteLigne = parseFloat(curr.quantite_restante || curr.qte_restante || 0);
        
        // CORRECTION CRITIQUE : Lecture des propriétés calculées par le backend
        const penaliteUnitaire = parseFloat(curr.montant_penalite_unitaire || 0);
        const totalPenaliteLigneCalculee = parseFloat(curr.montant_penalite_detail || 0);
        
        if (qteLigne > 0) {
            acc[fluxId].solde_total_flux += qteRestanteLigne;
            
            // 💡 STRUCTURATION POUR LE PANIER DE RETOURS : On n'ajoute que les vraies lignes d'emballage consignées au départ
            acc[fluxId].emballages.push({ 
                packaging_id: curr.packaging_id || curr.id_emballage,
                nom: curr.emballage || curr.nom_emballage || 'Emballage', 
                qte: qteLigne, 
                qte_restante: qteRestanteLigne,
                prix_unitaire: curr.prix_unitaire, 
                montant_ligne: curr.montant_ligne,
                montant_penalite: penaliteUnitaire.toFixed(2),
                montant_penalite_detail: totalPenaliteLigneCalculee, 
                type: 'CONSIGNE'
            });
        } else if (qteLigne < 0) {
            // Mémorisation des retours déjà effectués antérieurement sur cette facture
            acc[fluxId].deconsignations_anterieures.push({
                packaging_id: curr.packaging_id || curr.id_emballage,
                nom: curr.emballage || curr.nom_emballage || 'Emballage', 
                qte: Math.abs(qteLigne),
                prix_unitaire: curr.prix_unitaire || 0
            });
        }
        
        // Le total cumulé de l'en-tête prend la valeur globale calculée par le dictionnaire du serveur
        acc[fluxId].tot_penalite_calcule = parseFloat(curr.montant_penalite || 0);
        
        return acc;
    }, {});

    return Object.values(grouped).filter(item => {
        if (activeTab === 'en_cours') return item.solde_total_flux > 0;
        if (activeTab === 'restituees') return item.solde_total_flux <= 0;
        return true;
    });
}, [historique, activeTab]);

// --- CORRECTION MAJEURE : MACARON DE STATUT BASÉ SUR LE REGROUPEMENT FINANCIER GLOBAL ---
const getStatusBadge = (item) => {
    if (item.is_archive === 1 || item.statut === 'ANNULE') {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                <span style={{ background: '#f1f5f9', color: '#475569', padding: '5px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                    <X size={12}/> ANNULÉ
                </span>
            </div>
        );
    }

    // Détermination des badges de type de garantie d'origine
    const renderGarantieBadge = () => {
        if (item.type_garantie === 'PHYSIQUE') {
            return (
                <span style={{ background: '#f5f3ff', color: '#6d28d9', border: '1px solid #ddd6fe', padding: '3px 8px', borderRadius: '12px', fontSize: '10px', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '3px' }} title={item.garantie_libelle}>
                    🔒 GARANTIE : {item.garantie_libelle ? (item.garantie_libelle.length > 15 ? `${item.garantie_libelle.slice(0, 15)}...` : item.garantie_libelle) : "Pièce d'identité"}
                </span>
            );
        }
        return null;
    };

    // Si le calcul du groupe confirme qu'il reste des emballages chez le client
    if (parseFloat(item.solde_total_flux) > 0) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                <span style={{ background: '#fef3c7', color: '#b45309', padding: '5px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                    <Clock size={12}/> EN COURS ({item.solde_total_flux} rest.)
                </span>
                {renderGarantieBadge()}
            </div>
        );
    }

    // Si le solde total du groupe est tombé à 0
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
            <span style={{ background: '#dcfce7', color: '#15803d', padding: '5px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <CheckCircle size={12}/> SOLDÉ
            </span>
            {renderGarantieBadge()}
        </div>
    );
};

// --- STYLES OBJETS ---
const s = {
    page: { display: 'flex', background: '#f8fafc', height: '100vh', width: '100%', overflow: 'hidden', position: 'relative' },
    main: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
    header: { background: '#fff', padding: '15px 30px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    tabBar: { display: 'flex', gap: '20px', padding: '0 30px', background: '#fff', borderBottom: '1px solid #e2e8f0', overflowX: 'auto' },
    tab: (active, color = '#2563eb') => ({ 
        padding: '15px 5px', fontSize: '12px', fontWeight: '800', 
        color: active ? color : '#94a3b8', 
        borderBottom: active ? `3px solid ${color}` : '3px solid transparent', 
        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap',
        transition: 'all 0.2s ease'
    }),

    // --- OBJETS DE STYLE COMPACTÉS POUR FIGER L'ÉCRAN ---
    content: { 
        flex: 1, 
        padding: '15px 30px', 
        overflowY: 'hidden',    // 🔑 Supprime définitivement le grand scroll global de la page
        display: 'flex',        // 🔑 Permet aux enfants de se distribuer l'espace proprement
        flexDirection: 'column' // 🔑 Aligne les blocs verticalement
    },

    // --- ⚡ CRITIQUE : NOUVEAUX STYLES POUR SÉCURISER L'AFFICHAGE DES DEUX PANIER CÔTE À CÔTE ---
    basketGrid: {
        display: 'grid',
        gridTemplateColumns: '1.2fr 1fr',
        gap: '20px',
        flex: 1,
        overflow: 'hidden',
        marginTop: '10px'
    },
    scrollBasketCard: {
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        padding: '15px',
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 390px)', // 🔑 Redimensionne les deux paniers à la taille stricte de l'écran
        minHeight: '260px',
        overflowY: 'auto'              // 🔑 Établit le défilement local et indépendant
    },

    btnNew: { background: '#2563eb', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'background 0.2s' },
    btnBack: { background: '#7f1d1d', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: '900', fontSize: '14px', marginBottom: '15px', display: 'inline-flex', alignItems: 'center', gap: '12px', transition: 'background 0.2s' },
    table: { width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
    th: { textAlign: 'left', padding: '15px', fontSize: '11px', color: '#64748b', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textTransform: 'uppercase' },
    td: { padding: '15px', borderBottom: '1px solid #f1f5f9', fontSize: '13px', color: '#1e293b' },
    gridForm: { display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px', height: 'calc(100% - 150px)' },
    masterFieldsBlock: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px', background: '#fff', padding: '15px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '10px', flexShrink: 0 },
    formGroup: { display: 'flex', flexDirection: 'column', gap: '4px' },
    label: { fontSize: '12px', fontWeight: 'bold', color: '#475569' },
    input: { padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', background: '#fff', outline: 'none' },
    inputDisabled: { padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', background: '#f8fafc', color: '#64748b', fontWeight: 'bold' },
    toastContainer: {
        position: 'absolute', top: '20px', left: '50%', transform: 'translateX(-50%)',
        zIndex: 1000, display: 'flex', alignItems: 'center',
        background: 'white', padding: '12px 20px', borderRadius: '15px',
        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
        border: '1px solid #e2e8f0', minWidth: '400px', 
        animation: 'slideDown 0.3s ease-out'
    },
    confirmBtn: { background: '#dc2626', color: 'white', border: 'none', padding: '6px 15px', borderRadius: '6px', fontWeight: '800', cursor: 'pointer', fontSize: '11px' },
    cancelBtn: { background: '#f1f5f9', color: '#64748b', border: 'none', padding: '6px 15px', borderRadius: '6px', fontWeight: '800', cursor: 'pointer', fontSize: '11px' }
};

const btn = (type) => ({
    padding: '8px 14px',
    borderRadius: '8px',
    border: '1px solid #cbd5e1',
    fontSize: '12px',
    background:
        type === 'A4' ? '#2563eb' :
        type === 'A5' ? '#1d4ed8' :
        type === 'A6' ? '#0f172a' :
        '#dc2626',
    color: '#fff',
    fontWeight: 'bold',
    cursor: 'pointer'
});

 // --- COMPOSANT TOAST INTERNE ---
    const NotificationToast = () => {
        if (!notification.isOpen) return null;
        const isConfirm = notification.type === 'confirm';
        const color = notification.type === 'error' ? '#ef4444' : (isConfirm ? '#f59e0b' : '#10b981');

        return (
            <div style={{ ...s.toastContainer, borderLeft: `8px solid ${color}` }}>
                <div style={{ 
                    display: 'flex', justifyContent: 'center', alignItems: 'center', 
                    width: '35px', height: '35px', borderRadius: '50%', 
                    background: `${color}15`, marginRight: '15px', flexShrink: 0
                }}>
                    {notification.type === 'error' ? <AlertCircle size={20} color={color} /> : 
                     isConfirm ? <Trash2 size={20} color={color} /> : 
                     <CheckCircle2 size={20} color={color} />}
                </div>
                <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontWeight: '700', color: '#1e293b', fontSize: '14px' }}>{notification.message}</p>
                    {isConfirm && (
                        <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                            <button onClick={() => { notification.onConfirm(); setNotification(prev => ({...prev, isOpen: false})); }} 
                                    style={s.confirmBtn}>CONFIRMER</button>
                            <button onClick={() => setNotification(prev => ({ ...prev, isOpen: false }))} 
                                    style={s.cancelBtn}>ANNULER</button>
                        </div>
                    )}
                </div>
                {!isConfirm && (
                    <button onClick={() => setNotification(prev => ({ ...prev, isOpen: false }))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1' }}>
                        <X size={20} />
                    </button>
                )}
            </div>
        );
    };
    // --- CALCUL DES COMPTEURS D'ONGLETS BASÉS SUR LA LOGIQUE DE REGROUPEMENT (CORRIGÉ) ---
    const compteursFlux = useMemo(() => {
        const rawData = historique.filter(h => h.is_archive !== 1);
        const uniqueFlux = {};
        
        rawData.forEach(curr => {
            const fId = curr.id_flux || curr.id;
            if (!uniqueFlux[fId]) {
                uniqueFlux[fId] = 0;
            }
            if (parseFloat(curr.quantite || curr.qte || 0) > 0) {
                uniqueFlux[fId] += parseFloat(curr.quantite_restante || curr.qte_restante || 0);
            }
        });

        const list = Object.values(uniqueFlux);
        return {
            enCours: list.filter(solde => solde > 0).length,
            restitues: list.filter(solde => solde <= 0).length,
            annules: historique.filter(h => h.is_archive === 1).reduce((acc, curr) => {
                const fId = curr.id_flux || curr.id;
                if (!acc.includes(fId)) acc.push(fId);
                return acc;
            }, []).length
        };
    }, [historique]);

return (
        <div style={{ ...s.page, height: isModalMode ? '100%' : '100vh' }}>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            
            {/* ✅ SÉCURITÉ MODALE : On cache la Sidebar générale si on est incrusté dans la caisse */}
            {!isModalMode && <Sidebar />}
            
            <div style={s.main}>
                <NotificationToast />
                
                <header style={{ ...s.header, padding: isModalMode ? '10px 20px' : '15px 30px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div style={{ background: '#eff6ff', padding: '10px', borderRadius: '10px' }}>
                            <ClipboardList size={isModalMode ? 22 : 28} color="#2563eb" />
                        </div>
                        {/* Intitulé dynamique de l'en-tête du module */}
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <h2 style={{ margin: 0, fontSize: isModalMode ? '16px' : '18px' }}>
                                {mode === 'CONSIGNATION' ? 'CONSIGNATION DES EMBALLAGES' : 'DÉCONSIGNATION DES EMBALLAGES'}
                            </h2>
                        </div>
                    </div>
                    {!showForm && !isModalMode && (
                        /* 🔑 MAPPAGE DYNAMIQUE DU BOUTON PRINCIPAL AVEC VÉRIFICATION DU PRIVILÈGE DE LA PAGE PARENTE */
                        <button 
                            onClick={() => {
                                const hasAccessCreate = userPerms['emb_create'] === true || userPerms['emb_create'] === 1 || userPerms['emb_create'] === 'true' || userPerms['emb_create'] === '1';
                                if (!hasAccessCreate) {
                                    showToast("🛑 ACCÈS REFUSÉ : Privilège de création de fiche consignation manquant pour votre rôle.", "error");
                                } else {
                                    ouvrirFormulaire();
                                }
                            }} 
                            style={{
                                ...s.btnNew,
                                background: (userPerms['emb_create'] === true || userPerms['emb_create'] === 1 || userPerms['emb_create'] === 'true' || userPerms['emb_create'] === '1') ? '#2563eb' : '#cbd5e1',
                                color: (userPerms['emb_create'] === true || userPerms['emb_create'] === 1 || userPerms['emb_create'] === 'true' || userPerms['emb_create'] === '1') ? '#fff' : '#64748b',
                                cursor: 'pointer'
                            }}
                        >
                            <Plus size={20} /> NOUVELLE CONSIGNATION
                        </button>
                    )}
                </header>


               {!showForm && (
                    <div style={s.tabBar}>
                        <div onClick={() => setActiveTab('en_cours')} style={s.tab(activeTab === 'en_cours')}>
                            <Inbox size={18} /> CONSIGNATIONS ACTIVES ({compteursFlux.enCours})
                        </div>
                        <div onClick={() => setActiveTab('restituees')} style={s.tab(activeTab === 'restituees', '#15803d')}>
                            <Package size={18} /> RESTITUÉES / SOLDÉES ({compteursFlux.restitues})
                        </div>
                        <div onClick={() => setActiveTab('archives')} style={s.tab(activeTab === 'archives', '#64748b')}>
                            <Archive size={18} /> ARCHIVÉES / ANNULÉES ({compteursFlux.annules})
                        </div>
                    </div>
                )}

                <div style={s.content}>
                    {!showForm ? (
                    <table style={s.table}>
                    <thead>
                        <tr>
                            <th style={s.th}>ID Flux</th>
                            <th style={s.th}>Facture Liée</th>
                            <th style={s.th}>Client</th>
                            <th style={s.th}>Garantie</th>
                            
                            {/* 🔄 NOUVELLE COLONNE VISUELLE : Affiche le cash-flow réel enregistré */}
                            <th style={s.th}>Mnt. Encaissé</th>

                            <th style={s.th}>Mnt. Consignation</th>
                            <th style={s.th}>Tot. Pénalité</th>
                            <th style={s.th}>À Rembourser</th>
                            <th style={s.th}>Qté Tot. Restante</th>
                            <th style={s.th}>Statut</th>
                            <th style={{ ...s.th, textAlign: 'center' }}>Action</th>
                        </tr>
                    </thead>
                    <tbody>

      {listeAffichee.map((item) => {
        // Normalisation de l'ID unique pour éviter les ruptures d'états
        const currentFluxId = item.id_flux || item.id;

        // Calculs financiers réels basés sur les variables issues du Backend
        const totalConsigneFlux = parseFloat(item.montant_total || 0);
        const totalPenaliteFlux = parseFloat(item.tot_penalite_calcule || 0);

        // ✅ RECTIFICATION DE TRÉSORERIE : Le montant remboursable se base STRICTEMENT sur le cash perçu réel
        const montantPercuReel = parseFloat(item.montant_recu || item.mnt_encaisse || 0);
        const totalRemboursableFlux = montantPercuReel > 0 ? (montantPercuReel - totalPenaliteFlux) : 0;   
        
        // Détermination stricte du caractère financier du flux
        const isGarantiePhysique = item.type_garantie === 'PHYSIQUE';

        return (
        <React.Fragment key={currentFluxId}>
            <tr 
                onClick={() => toggleRow(currentFluxId)} 
                style={{ 
                    cursor: 'pointer', 
                    background: expandedRows[currentFluxId] ? '#f8fafc' : 'transparent',
                    transition: 'background 0.2s'
                }}
            >
                <td style={{ ...s.td, fontWeight: 'bold' }}>
                    {expandedRows[currentFluxId] ? '▼ ' : '▶ '} {currentFluxId}
                </td>
                <td style={s.td}>{item.numero_facture || '---'}</td>
                <td style={s.td}>{item.nom_client || item.client_nom || 'Client inconnu'}</td>
                
                {/* 🪪 CELLULE SÉCURISÉE DE GARANTIE : Rendu textuel de la nature du dépôt */}
                <td style={s.td}>
                    {isGarantiePhysique ? (
                        <span style={{ color: '#6d28d9', fontWeight: '700', fontSize: '12px', backgroundColor: '#f5f3ff', padding: '3px 8px', borderRadius: '4px', border: '1px solid #ddd6fe' }} title={item.garantie_libelle}>
                            🪪 {item.garantie_libelle ? (item.garantie_libelle.length > 15 ? `${item.garantie_libelle.slice(0, 15)}...` : item.garantie_libelle) : 'Objet déposé'}
                        </span>
                    ) : (
                        <span style={{ color: '#16a34a', fontWeight: '600', fontSize: '12px' }}>💰 Espèces</span>
                    )}
                </td>

                {/* 🔄 NOUVELLE CELLULE : Affiche la somme liquide réellement laissée au caissier */}
                <td style={{ ...s.td, color: isGarantiePhysique ? '#64748b' : '#16a34a', fontWeight: 'bold' }}>
                    {isGarantiePhysique ? '0.00 F' : `${montantPercuReel.toFixed(2)} F`}
                </td>

                {/* 💵 VALEUR ACHAT CONSIGNE RECONSOLIDÉE SELON NATURE FINANCIÈRE */}
                <td style={{ ...s.td, color: isGarantiePhysique ? '#64748b' : '#2563eb', fontWeight: 'bold' }}>
                    {isGarantiePhysique ? '0.00 F' : `${totalConsigneFlux.toFixed(2)} F`}
                </td>
                <td style={{ ...s.td, color: '#dc2626', fontWeight: 'bold' }}>{totalPenaliteFlux.toFixed(2)} F</td>
                
                {/* 💵 VALEUR LIQUIDE À REMBOURSER PARFAITEMENT VERROUILLÉE À LA VALEUR ENCAISSÉE RECTIFIÉE */}
                <td style={{ ...s.td, color: isGarantiePhysique ? '#64748b' : (item.solde_total_flux <= 0 ? '#64748b' : '#15803d'), fontWeight: 'bold' }}>
                    {isGarantiePhysique ? '0.00 F' : `${totalRemboursableFlux.toFixed(2)} F`}
                </td>
                
                {/* CORRECTION : Affichage du volume physique d'emballages réellement restants */}
                <td style={{ ...s.td, fontWeight: '700', textAlign: 'center' }}>
                    {item.solde_total_flux}
                </td>
                
                {/* CORRECTION BIENVENUE : Utilisation du macaron dynamique intelligent */}
                <td style={s.td}>
                    {getStatusBadge(item)}
                </td>

                <td style={{ ...s.td, textAlign: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }} onClick={(e) => e.stopPropagation()}>
                        
                        {/* Le bouton Déconsigner disparaît uniquement si le client a tout rendu (solde <= 0) */}
                        {item.solde_total_flux > 0 && item.is_archive !== 1 && (
                            <button 
                                onClick={(e) => { e.stopPropagation(); ouvrirFormulaireDeconsignation(item); }}
                                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                                title={isGarantiePhysique ? "Restituer la pièce d'identité" : "Déconsigner ce lot"}
                            >
                                <RotateCcw size={16} color={isGarantiePhysique ? '#6d28d9' : '#15803d'} />
                            </button>
                        )}

                        {/* 🔑 MAPPAGE DU BOUTON MODIFIER : Affiché uniquement si autorisé */}
                        {canModifyCons && (
                            <button 
                                onClick={(e) => { e.stopPropagation(); handleEdit(currentFluxId); }}
                                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                                title="Modifier"
                            >
                                <Pencil size={16} color="#2563eb" />
                            </button>
                        )}

                        {/* 🔑 MAPPAGE DU BOUTON ANNULER / SUPPRIMER : Affiché uniquement si autorisé */}
                        {canDeleteCons && (
                            <button 
                                onClick={(e) => { e.stopPropagation(); showConfirm("Annuler ce lot ?", () => executerAnnulation(currentFluxId)); }}
                                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                                title="Annuler"
                            >
                                <Trash2 size={16} color="#dc2626" />
                            </button>
                        )}

                        {/* 🔒 TEXTE ACCÈS RESTREINT : S'affiche si aucun bouton n'est visible pour l'utilisateur */}
                        {!canModifyCons && !canDeleteCons && !(item.solde_total_flux > 0 && item.is_archive !== 1) && (
                            <span style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic', fontWeight: '500' }}>
                                Accès restreint
                            </span>
                        )}
                    </div>
                </td>
            </tr>

                    {/* ========================================== */}
                    {/* BLOC 7 : RENDU DU SOUS-TABLEAU ENFIN ALIGNÉ (11 COLONNES CORRIGÉES) */}
                    {/* ========================================== */}
                    {expandedRows[currentFluxId] && (
                        <tr>
                            <td colSpan={11} style={{ background: '#f8fafc', padding: '15px' }}>
                                <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ color: '#64748b', borderBottom: '1px solid #cbd5e1' }}>
                                            <th style={{ textAlign: 'left', padding: '8px' }}>Emballage</th>
                                            <th style={{ textAlign: 'left', padding: '8px' }}>Qté Mouvement</th>
                                            <th style={{ textAlign: 'left', padding: '8px' }}>Prix Unitaire</th>
                                            <th style={{ textAlign: 'left', padding: '8px' }}>Mnt. Consigne</th>
                                            <th style={{ textAlign: 'left', padding: '8px' }}>Jours écoulés</th>
                                            <th style={{ textAlign: 'left', padding: '8px' }}>Pénalité Unitaire</th>
                                            <th style={{ textAlign: 'left', padding: '8px' }}>Total Pénalité</th>
                                        </tr>
                                    </thead>

                                    <tbody>
                                        {/* Rendu combiné des lignes de consignation et des déconsignations antérieures stockées au Bloc 7 */}
                                        {[
                                            ...(item.emballages || []),
                                            ...(item.deconsignations_anterieures || []).map(d => ({ ...d, type: 'RETOUR', qte: -d.qte, montant_ligne: -(d.qte * d.prix_unitaire) }))
                                        ].map((emb, idx) => {
                                            const penaliteUnitaire = parseFloat(emb.montant_penalite || 0);
                                            const qteMouvement = parseFloat(emb.qte || 0);
                                            const prixUnitLigne = parseFloat(emb.prix_unitaire || 0);
                                            const mntConsigneLigne = parseFloat(emb.montant_ligne || 0);
                                            
                                            // LECTURE SÉCURISÉE DE LA PROPRIÉTÉ DU SERVEUR
                                            const totalPenaliteLigne = parseFloat(emb.montant_penalite_detail || 0);

                                            return (
                                                <tr key={idx} style={{ 
                                                    borderBottom: '1px solid #e2e8f0',
                                                    background: emb.type === 'RETOUR' ? '#f0fdf4' : 'transparent'
                                                }}>
                                                    <td style={{ padding: '8px', fontWeight: emb.type === 'RETOUR' ? '600' : 'normal' }}>
                                                        {emb.nom} {emb.type === 'RETOUR' && '↩ (Retour)'}
                                                    </td>
                                                    <td style={{ 
                                                        padding: '8px', 
                                                        fontWeight: 'bold', 
                                                        color: qteMouvement < 0 ? '#16a34a' : '#1e293b' 
                                                    }}>
                                                        {qteMouvement > 0 ? `+${qteMouvement}` : qteMouvement}
                                                    </td>
                                                    <td style={{ padding: '8px' }}>{prixUnitLigne.toFixed(2)} F</td>
                                                    
                                                    {/* 🔒 SÉCURITÉ DE FLUX : Masque la valeur si c'est un dépôt de document ou de CNI */}
                                                    <td style={{ 
                                                        padding: '8px', 
                                                        fontWeight: '600', 
                                                        color: isGarantiePhysique ? '#64748b' : (mntConsigneLigne < 0 ? '#16a34a' : '#2563eb') 
                                                    }}>
                                                        {isGarantiePhysique ? '0.00 F (Objet)' : `${mntConsigneLigne.toFixed(2)} F`}
                                                    </td>
                                                    <td style={{ padding: '8px' }}>
                                                        {emb.type === 'RETOUR' ? '---' : <DynamicTimer createdAt={emb.created_at || item.created_at} />}
                                                    </td>
                                                    <td style={{ padding: '8px', fontWeight: 'bold', color: penaliteUnitaire > 0 ? '#dc2626' : '#64748b' }}>
                                                        {penaliteUnitaire.toFixed(2)} F
                                                    </td>
                                                    {/* AFFICHAGE DU COMPTE DE PÉNALITÉ DE RETARD FIGÉE DE LA LIGNE */}
                                                    <td style={{ padding: '8px', fontWeight: 'bold', color: totalPenaliteLigne > 0 ? '#dc2626' : '#64748b' }}>
                                                        {totalPenaliteLigne.toFixed(2)} F
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </td>
                        </tr>
                    )}
                </React.Fragment>
            );
        })}
    </tbody>
</table>
) : (

                             <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                            {/* ✅ CORRECTION SÉCURITÉ MODALE : Ferme la popup ou revient au tableau de suivi classique */}
                            <button 
                                type="button"
                                onClick={() => { 
                                    resetForm(); 
                                    if (isModalMode && onClose) {
                                        onClose(); // Ferme proprement la modale sur l'écran de caisse
                                    } else {
                                        setShowForm(false); // Revient au tableau de suivi classique
                                    }
                                }} 
                                style={{ ...s.btnBack, padding: '8px 16px', fontSize: '13px', marginBottom: '10px' }}
                            >
                                <ChevronLeft size={16} strokeWidth={3} /> {isModalMode ? 'FERMER LE MODULE' : 'RETOUR AU SUIVI'}
                            </button>
                            <div style={{
                                display: 'flex',
                                gap: '10px',
                                marginBottom: '10px',
                                alignItems: 'center',
                                flexShrink: 0
                            }}>
   
                                <div style={{ display: 'flex', gap: '10px' }}>

                                    {/* 🔑 BOUTONS DE VALIDATION DU FORMULAIRE : Soumis aux règles de blocage des Toasts */}
                                    <button 
                                        onClick={() => {
                                            if (isEditing && !canModifyCons) {
                                                showToast("🛑 ACCÈS REFUSÉ : Votre profil n'est pas autorisé à valider des modifications.", "error");
                                            } else {
                                                validerEtImprimer('A4');
                                            }
                                        }} 
                                        style={{ ...btn('A4'), opacity: (isEditing && !canModifyCons) ? 0.6 : 1, cursor: (isEditing && !canModifyCons) ? 'not-allowed' : 'pointer' }}
                                        disabled={isSubmitting}
                                    >
                                        Valider A4
                                    </button>

                                    <button 
                                        onClick={() => {
                                            if (isEditing && !canModifyCons) {
                                                showToast("🛑 ACCÈS REFUSÉ : Votre profil n'est pas autorisé à valider des modifications.", "error");
                                            } else {
                                                validerEtImprimer('A5');
                                            }
                                        }} 
                                        style={{ ...btn('A5'), opacity: (isEditing && !canModifyCons) ? 0.6 : 1, cursor: (isEditing && !canModifyCons) ? 'not-allowed' : 'pointer' }}
                                        disabled={isSubmitting}
                                    >
                                        Valider A5
                                    </button>

                                    <button 
                                        onClick={() => {
                                            if (isEditing && !canModifyCons) {
                                                showToast("🛑 ACCÈS REFUSÉ : Votre profil n'est pas autorisé à valider des modifications.", "error");
                                            } else {
                                                validerEtImprimer('A6');
                                            }
                                        }} 
                                        style={{ ...btn('A6'), opacity: (isEditing && !canModifyCons) ? 0.6 : 1, cursor: (isEditing && !canModifyCons) ? 'not-allowed' : 'pointer' }}
                                        disabled={isSubmitting}
                                    >
                                        Valider A6
                                    </button>

                                    <button 
                                        onClick={() => {
                                            if (isEditing && !canModifyCons) {
                                                showToast("🛑 ACCÈS REFUSÉ : Votre profil n'est pas autorisé à valider des modifications.", "error");
                                            } else {
                                                validerEtImprimer('NONE');
                                            }
                                        }} 
                                        style={{ ...btn('NONE'), opacity: (isEditing && !canModifyCons) ? 0.6 : 1, cursor: (isEditing && !canModifyCons) ? 'not-allowed' : 'pointer' }}
                                        disabled={isSubmitting}
                                    >
                                        Valider sans impression
                                    </button>

                                </div>
                            </div>


                            {/* BLOCK MASTERFIELDS ADAPTATIF À 3 COLONNES DYNAMIQUE COMPACTÉ */}
                            <div style={s.masterFieldsBlock}>
                                <div style={s.formGroup}>
                                    <label style={s.label}>1. Sélectionner la Facture Principale :</label>
                                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                        <FileText size={16} style={{ position: 'absolute', left: '12px', color: '#94a3b8' }} />
                                        
                                        <input
                                            type="text"
                                            list="factures-list"
                                            value={selectedFacture}
                                            onChange={(e) => setSelectedFacture(e.target.value)}
                                            placeholder="Saisissez ou choisissez une facture..."
                                            style={{ ...s.input, width: '100%', paddingLeft: '35px' }}
                                            readOnly={mode === 'DECONSIGNATION'} // Verrouillé en déconsignation pour éviter les erreurs de saisie
                                        />
                                        
                                        <datalist id="factures-list">
                                            {factures.map(f => (
                                                <option key={f.id} value={f.lot_id || f.id}>
                                                    {f.nom_client_snap || 'CLIENT AU COMPTANT'}
                                                </option>
                                            ))}
                                        </datalist>
                                    </div>
                                </div>


                                {/* 🪪 2. TYPE DE GARANTIE DU FLUX (S'AFFICHE OU SE MET EN MODE INFORMATIF EN RETOUR) */}
                                <div style={s.formGroup}>
                                    <label style={s.label}>2. Type de Garantie Reçue :</label>
                                    <select
                                        value={typeGarantie}
                                        onChange={(e) => {
                                            setTypeGarantie(e.target.value);
                                            if (e.target.value === 'PHYSIQUE') setMontantRecu(0);
                                            if (e.target.value === 'ESPECES') setGarantieLibelle('');
                                        }}
                                        style={{ ...s.input, fontWeight: '700', color: typeGarantie === 'ESPECES' ? '#16a34a' : '#6d28d9' }}
                                        disabled={mode === 'DECONSIGNATION'} // Hérité du mode d'origine
                                    >
                                        <option value="ESPECES">💰 En espèces (Encaisser des fonds)</option>
                                        <option value="PHYSIQUE">🪪 Dépôt Physique (Pièce d'identité / Objet)</option>
                                    </select>
                                </div>

                                {/* 💰 3. CHAMP CONTEXTUEL : MONTANT REÇU OU NATURE DE L'OBJET DÉPOSÉ */}
                                <div style={s.formGroup}>
                                    {typeGarantie === 'ESPECES' ? (
                                        <>
                                            {/* 💡 CORRECTION DU LABEL : S'adapte au mode pour indiquer clairement le cash-flow à l'instant T */}
                                            <label style={s.label}>
                                                {mode === 'DECONSIGNATION' ? "3. Montant à rembourser au Prorata (Instant T) :" : "3. Montant Réellement Encaissé :"}
                                            </label>
                                            <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                                                <input
                                                    type="number"
                                                    value={montantRecu}
                                                    onChange={(e) => setMontantRecu(Math.max(0, parseFloat(e.target.value) || 0))}
                                                    style={{ ...s.input, width: '100%', fontWeight: 'bold', color: mode === 'DECONSIGNATION' ? '#15803d' : '#16a34a' }}
                                                    placeholder={mode === 'DECONSIGNATION' ? "Calcul automatique..." : "Somme perçue..."}
                                                    min="0"
                                                    disabled={mode === 'DECONSIGNATION'} // Calculé dynamiquement au prorata selon le panier à l'instant T
                                                />
                                                <span style={{ position: 'absolute', right: '15px', fontWeight: 'bold', color: '#64748b' }}>F</span>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <label style={s.label}>3. Nature du document / ID déposé :</label>
                                            <input
                                                type="text"
                                                value={garantieLibelle}
                                                onChange={(e) => setGarantieLibelle(e.target.value)}
                                                style={{ ...s.input, fontWeight: '600', color: '#6d28d9' }}
                                                placeholder="Ex: CNI N°..., Permis, Téléphone..."
                                                maxLength="100"
                                                disabled={mode === 'DECONSIGNATION'}
                                            />
                                        </>
                                    )}
                                </div>
                            </div>

{/* BANDEAU DE RAPPEL DU CLIENT COMPACTÉ (MUTÉ DU MASTERFIELDS POUR CLARIFIER LE BLOC DES GARANTIES) */}
                            <div style={{ ...s.masterFieldsBlock, gridTemplateColumns: '1fr', padding: '8px 15px', marginTop: '-5px', marginBottom: '10px' }}>
                                <div style={s.formGroup}>
                                    <label style={{ ...s.label, display: 'inline-flex', alignItems: 'center', gap: '6px', margin: 0 }}>
                                        <User size={14} color="#64748b" /> Client associé à la Facture : 
                                        <span style={{ fontWeight: '800', color: '#0f172a', marginLeft: '5px' }}>{nomClient || 'Aucune facture choisie'}</span>
                                    </label>
                                </div>
                            </div>

                            {/* 🖥️ GRILLE DE DISPOSITION CÔTE À CÔTE PARFAITEMENT LIMITÉE À LA TAILLE DE L'ÉCRAN */}
                            <div style={s.basketGrid}>
                                
                                {/* COLONNE 1 : SÉLECTION EMBALLAGES (Panier de Gauche avec défilement local sécurisé) */}
                                <div style={s.scrollBasketCard}>
                                    <label style={{ ...s.label, marginBottom: '6px', flexShrink: 0 }}>
                                        {mode === 'CONSIGNATION' ? '4. Sélectionner les Emballages :' : '4. Lot Consigné (à restituer) :'}
                                    </label>
                                    
                                    {/* Affichage conditionnel selon le mode */}
                                    {mode === 'CONSIGNATION' ? (
                                        // LISTE STOCK GLOBAL DÉFILANTE
                                        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '2px' }}>
                                            <div style={{ position: 'relative', marginBottom: '10px', flexShrink: 0 }}>
                                                <Search size={16} style={{ position: 'absolute', left: '12px', top: '10px', color: '#94a3b8' }} />
                                                <input style={{ width: '100%', padding: '8px 12px 8px 35px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }} placeholder="Chercher un emballage..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                                            </div>
                                            {emballages.filter(e => (e.nom || "").toLowerCase().includes(searchTerm.toLowerCase())).map(emb => (
                                                <div key={emb.id} onClick={() => setSelectedEmballage(emb)} style={{ padding: '8px 12px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', background: selectedEmballage?.id === emb.id ? '#eff6ff' : 'transparent', borderRadius: '8px', fontSize: '13px' }}>
                                                    <div style={{ fontWeight: 'bold' }}>{emb.nom}</div>
                                                    <div style={{ fontSize: '10px', color: '#16a34a' }}>Stock: {emb.stock_actuel || 0}</div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (

                                        // LISTE EMBALLAGES DU FLUX SOURCE DÉFILANTE (CORRIGÉE)
                                        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '2px' }}>
                                            {(fluxSource?.emballages || []).filter(e => e.type === 'CONSIGNE' && e.qte_restante > 0).map((emb, idx) => {
                                                const embId = emb.packaging_id || emb.id;
                                                const isSelected = selectedEmballage?.packaging_id === embId || selectedEmballage?.id === embId;
                                                return (
                                                    <div key={idx} onClick={() => setSelectedEmballage(emb)} style={{ padding: '8px 12px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', background: isSelected ? '#eff6ff' : 'transparent', borderRadius: '8px', fontSize: '13px' }}>
                                                        <div style={{ fontWeight: 'bold' }}>{emb.nom}</div>
                                                        <div style={{ fontSize: '10px', color: '#2563eb' }}>Reste à rendre : {emb.qte_restante}</div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                 {selectedEmballage && (
                                        <div style={{ marginTop: '10px', background: '#1e293b', padding: '10px 12px', borderRadius: '8px', color: '#fff', flexShrink: 0 }}>
                                            <div style={{fontSize: '11px', marginBottom: '4px'}}>Quantité :</div>
                                            <div style={{display: 'flex', gap: '8px'}}>
                                                <input 
                                                    type="number" 
                                                    step="any" 
                                                    min="0.01"
                                                    value={quantite} 
                                                    onChange={(e) => {
                                                        // Élimine les signes négatifs parasites tapés par l'utilisateur
                                                        const cleanVal = e.target.value;
                                                        setQuantite(cleanVal.toString().replace('-', ''));
                                                    }} 
                                                    style={{ flex: 1, padding: '6px 10px', borderRadius: '6px', border: 'none', color: '#000', fontSize: '13px' }} 
                                                />
                                                {/* 💡 CORRECTION TECHNIQUE PLAFOND (Problème 3) : On appelle l'unique fonction sécurisée de contrôle de panier */}
                                                <button 
                                                    onClick={() => {
                                                        const checkQte = parseFloat(quantite);
                                                        if (isNaN(checkQte) || checkQte <= 0) {
                                                            showToast("Veuillez saisir une quantité supérieure à 0", "error");
                                                        } else {
                                                            ajouterAuPanier();
                                                        }
                                                    }} 
                                                    style={{ background: '#fbbf24', padding: '6px 12px', borderRadius: '6px', border: 'none', fontWeight: 'bold', color: '#000', cursor: 'pointer', fontSize: '12px' }}
                                                >
                                                    AJOUTER
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>


                             {/* COLONNE 2 : PANIER DYNAMIQUE (Panier de Droite avec défilement local sécurisé) */}
                                <div style={s.scrollBasketCard}>
                                    <div style={{ fontWeight: '900', marginBottom: '8px', color: '#1e293b', fontSize: '14px', flexShrink: 0 }}>
                                        {mode === 'CONSIGNATION' ? 'LOT À CONSIGNER' : 'LOT À DÉCONSIGNER'}
                                    </div>
                                    
                                    <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #f1f5f9', borderRadius: '8px', marginBottom: '10px', paddingRight: '2px' }}>
                                        {panierConsignations.length === 0 ? (
                                            <div style={{ textAlign: 'center', padding: '30px', color: '#94a3b8', fontSize: '13px' }}>
                                                Aucun emballage sélectionné
                                            </div>
                                        ) : panierConsignations.map((item, idx) => (
                                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid #f1f5f9' }}>
                                                <div>
                                                    <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{item.nom || item.nom_article_snap}</div>
                                                    <div style={{ 
                                                        fontSize: '12px', 
                                                        color: mode === 'CONSIGNATION' ? '#2563eb' : '#16a34a', 
                                                        fontWeight: 'bold' 
                                                    }}>
                                                        {mode === 'CONSIGNATION' ? `+${item.qte}` : `-${item.qte}`} {item.unite || 'unité(s)'}
                                                    </div>
                                                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '1px' }}>
                                                        Valeur : {(Number(item.prix_unitaire || item.prix_vente_unitaire || 0) * Number(item.qte || 0)).toLocaleString()} F
                                                    </div>
                                                </div>
                                                <button 
                                                    onClick={() => {
                                                        const nouveauPanier = panierConsignations.filter((_, i) => i !== idx);
                                                        setPanierConsignations(nouveauPanier);

                                                        // 💡 RECALCUL IMMÉDIAT EN CAS DE RETRAIT : Met à jour le montant à l'instant T
                                                        if (mode === 'DECONSIGNATION' && fluxSource) {
                                                            const totalTheoriqueInitial = (fluxSource?.emballages || []).reduce((acc, e) => acc + (Number(e.qte || 0) * Number(e.prix_unitaire || 0)), 0);
                                                            const montantReelEncaisseInitial = Number(fluxSource?.montant_recu || fluxSource?.mnt_encaisse || 0);
                                                            const prorataCoefficient = totalTheoriqueInitial > 0 ? (montantReelEncaisseInitial / totalTheoriqueInitial) : 1;

                                                            const totalRemboursementInstantT = nouveauPanier.reduce((acc, currentItem) => {
                                                                return acc + (Number(currentItem.qte || 0) * (Number(currentItem.prix_unitaire || 0) * prorataCoefficient));
                                                            }, 0);
                                                            setMontantRecu(totalRemboursementInstantT);
                                                        }
                                                    }} 
                                                    style={{ background: '#fee2e2', border: 'none', padding: '6px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                >
                                                    <Trash2 size={14} color="#dc2626" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>


                                  {/* ⚙️ BANDEAU DE VALORISATION ET DE BILAN FINANCIER CONTEXTUEL COMPACTÉ */}
                                    {panierConsignations.length > 0 && mode === 'CONSIGNATION' && (
                                        <div style={{ backgroundColor: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#475569', fontWeight: '600' }}>
                                                <span>Valeur Théorique Lot :</span>
                                                <span>{montantTotalTheoriquePanier.toLocaleString()} F</span>
                                            </div>
                                            
                                            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #cbd5e1', paddingTop: '4px', fontSize: '12px', fontWeight: '700' }}>
                                                <span>Impact Tiroir-Caisse :</span>
                                                {typeGarantie === 'ESPECES' ? (
                                                    <span style={{ color: '#16a34a' }}>+{fluxFinancierReel.toLocaleString()} F</span>
                                                ) : (
                                                    <span style={{ color: '#6d28d9', backgroundColor: '#f5f3ff', padding: '1px 4px', borderRadius: '4px', fontSize: '10px' }}>
                                                        0 F (Garantie Physique)
                                                    </span>
                                                )}
                                            </div>

                                            {/* ALERTE FINANCIÈRE EN CAS D'ÉCART OU DE RESTE À PAYER */}
                                            {typeGarantie === 'ESPECES' && resteAPayerEcart > 0 && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#b45309', backgroundColor: '#fef3c7', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', marginTop: '2px' }}>
                                                    <AlertCircle size={12} />
                                                    <span>Écart / Non perçu : {resteAPayerEcart.toLocaleString()} F</span>
                                                </div>
                                            )}
                                            
                                            {typeGarantie === 'PHYSIQUE' && (
                                                <div style={{ color: '#6d28d9', fontSize: '11px', fontWeight: '600', fontStyle: 'italic', marginTop: '1px' }}>
                                                    📌 Dépôt : {garantieLibelle.trim() || "Pièce d'identité non spécifiée"}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* 💡 SÉCURISATION COMPTABLE DE DÉCONSIGNATION À L'INSTANT T (Problème 1 & 2) */}
                                    {panierConsignations.length > 0 && mode === 'DECONSIGNATION' && fluxSource && (
                                        <div style={{ backgroundColor: '#f0fdf4', padding: '10px 12px', borderRadius: '8px', border: '1px solid #bbf7d0', display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#166534', fontWeight: '600' }}>
                                                <span>Valeur Théorique Restituée :</span>
                                                <span>
                                                    {panierConsignations.reduce((acc, item) => acc + (Number(item.qte || 0) * Number(item.prix_unitaire || item.prix_vente_unitaire || 0)), 0).toLocaleString()} F
                                                </span>
                                            </div>

                                            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #bbf7d0', paddingTop: '4px', fontSize: '12px', fontWeight: '700' }}>
                                                <span>Remboursement au Prorata (Instant T) :</span>
                                                {typeGarantie === 'ESPECES' ? (
                                                    <span style={{ color: '#15803d', fontSize: '14px' }}>-{Number(montantRecu || 0).toLocaleString()} F</span>
                                                ) : (
                                                    <span style={{ color: '#6d28d9', backgroundColor: '#f5f3ff', padding: '2px 6px', borderRadius: '4px', fontSize: '10px' }}>
                                                        Restituer : {fluxSource?.garantie_libelle || "Pièce d'identité"}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* 🔑 BOUTON DE SOUUMISSION DU FORMULAIRE COMPACTÉ 
                                    {mode === 'CONSIGNATION' && (
                                        <button 
                                            onClick={() => {
                                                if (isEditing && !canModifyCons) {
                                                    showToast("🛑 ACCÈS REFUSÉ : Votre profil n'est pas autorisé à modifier une consignation.", "error");
                                                } else if (panierConsignations.length === 0) {
                                                    showToast("Le panier d'emballages est vide", "error");
                                                } else if (!isSubmitting) {
                                                    enregistrerConsignation();
                                                }
                                            }} 
                                            style={{ 
                                                width: '100%', 
                                                background: isSubmitting ? '#94a3b8' : '#059669', 
                                                color: '#fff', 
                                                border: 'none', 
                                                padding: '10px', 
                                                borderRadius: '8px', 
                                                fontWeight: '900', 
                                                fontSize: '13px',
                                                cursor: isSubmitting ? 'not-allowed' : 'pointer', 
                                                marginTop: '10px',
                                                transition: 'background 0.2s',
                                                opacity: (isEditing && !canModifyCons) ? 0.6 : 1,
                                                flexShrink: 0
                                            }}
                                        >
                                            {isSubmitting ? (
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                                    <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                                                    <span>TRAITEMENT...</span>
                                                </div>
                                            ) : (
                                                "VALIDER LA CONSIGNATION"
                                            )}
                                        </button>
                                    )} */}
                                </div>

                            </div> {/* Fin de la grille de paniers côte à côte basketGrid */}

                        
{/* Composant caché dédié à l'impression thermique multiformat */}
                            <div
                                style={{
                                    position: 'absolute',
                                    left: '-99999px',
                                    top: 0
                                }}
                            >
                                <ConsignationPrint
                                    ref={componentRef}
                                    format={formatImpression || 'A6'}
                                    titreDocument={
                                        mode === 'CONSIGNATION'
                                            ? "BON DE CONSIGNATION"
                                            : "BON DE DÉCONSIGNATION"
                                    }
                                    panier={panierImpression}
                                    
                                    // --- 🔒 RECTIFICATION DE SÉCURITÉ : Le total général du reçu s'aligne sur le cash réel ---
                                    totalGeneral={
                                        mode === 'CONSIGNATION'
                                            ? (panierConsignations || []).reduce((acc, item) => acc + (Number(item.qte || 0) * Number(item.prix_unitaire || item.prix_consigne || 0)), 0)
                                            : Number(montantRecu || 0) // Brise l'affichage abusif du cumul théorique si le client est remboursé au prorata à l'instant T
                                    }
                                    venteInfo={{
                                        facture_no: selectedFacture,
                                        client_nom: nomClient,
                                        // --- 🔄 TRANSMISSION DES PARAMÈTRES DE CONSIGNATION AU TICKET ---
                                        type_garantie: typeGarantie,
                                        montant_recu: Number(montantRecu || 0), // Transmet la valeur calculée pour l'instant T
                                        garantie_libelle: typeGarantie === 'PHYSIQUE' ? String(garantieLibelle || "").trim() : '',
                                        flux_financier_realise: fluxFinancierReel
                                    }}
                                    /* 🖨️ ALIGNEMENT SQLITE : Traduction directe et valeurs de secours pour le ticket thermal */
                                    company={{
                                        ...company,
                                        nom: company?.name || company?.nom || "VOTRE ENTREPRISE",
                                        telephone: company?.phone || company?.telephone || "Téléphone non configuré",
                                        adresse: company?.address || company?.adresse || "Adresse non configurée",
                                        nif: company?.nif_number || company?.nif || "NIF-N/A",
                                        rccm: company?.rccm_number || company?.rccm || "RCCM-N/A",
                                        logo_data: company?.logo_data || company?.logo || null
                                    }}
                                    isAvoir={false}
                                />
                            </div>

                        </div>
                    )}
                </div>
            </div>
            {/* Injecte les animations keyframes pour les toasts et icônes en attente */}
            <StyleBlock />
        </div>
    );
};

// --- STYLES ANIMATIONS ET COMPORTEMENTS DU MODULE ---
const StyleBlock = () => (
    <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideDown { 
            from { top: -50px; opacity: 0; transform: translate(-50%, -10px); }
            to { top: 20px; opacity: 1; transform: translate(-50%, 0); }
        }
    `}</style>
);

export default ConsignationEmballages;
