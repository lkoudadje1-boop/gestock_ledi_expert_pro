import React, { useState, useEffect, useMemo, useCallback, useRef  } from 'react';
import { useNavigate, useLocation } from 'react-router-dom'; // 🚀 AJOUT DE USELOCATION POUR LA PASSERELLE
import { 
    Save, Trash2, Plus, Search, Package, 
    RefreshCcw, ShoppingCart, FileText, Edit3, Barcode, Hash, Scale
} from 'lucide-react'; 
import Sidebar from '../../components/Sidebar';
import API, { socket } from '../../services/api';

// 🚀 INTÉGRATION MAÎTRE DU SERVICE UNIQUE DE CONVERSION LOGISTIQUE ANTI-LITIGE
import { ConversionStockService } from '../../utils/converisonstock';

const Approvisionnement = () => {
    const navigate = useNavigate();
    const location = useLocation(); // 🚀 HOOK DE TRANSLATION DES ÉTATS ACCORDÉONS
    const currentUser = useMemo(() => JSON.parse(localStorage.getItem('user') || '{}'), []);
    const USER_ID = currentUser.id || 'USR-1';
    const COMPANY_ID = currentUser.company_id || currentUser.companyId || 'CPY-1';
    const [paymentMethods, setPaymentMethods] = useState([]);
    
    // --- ÉTATS (STATES) ---
    const panierEndRef = React.useRef(null);
    const [articles, setArticles] = useState([]);
    const [fournisseurs, setFournisseurs] = useState([]); 
    const [panier, setPanier] = useState([]);
    const [notification, setNotification] = useState({ show: false, message: '', type: '' });
    const [searchId, setSearchId] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [searchBarcode, setSearchBarcode] = useState('');
    const [selectedArt, setSelectedArt] = useState(null);
    
    // 🛡️ SÉCURITÉ CONFORMITÉ : Maintien de l'ancien état pour éviter toute rupture dans l'UI
    const [inputQte, setInputQte] = useState('');
    
    // 🚀 AJOUTS DES COMPOSANTS LOGISTIQUES : Champs de saisie découplés pour l'achat Gros + Détail
    const [inputQteGros, setInputQteGros] = useState('');
    const [inputQteDetail, setInputQteDetail] = useState('');
    
    const [inputMontant, setInputMontant] = useState('');
    const [inputObs, setInputObs] = useState('');
    const [editingId, setEditingId] = useState(null); 
    const [isLocked, setIsLocked] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [currentLotId, setCurrentLotId] = useState(`LOT-${Math.floor(1000 + Math.random() * 9000)}`);
    const [regimeTVA, setRegimeTVA] = useState(1);
    const [tauxTVA, setTauxTVA] = useState(18); // Taux par défaut
    const [isTVAApplicable, setIsTVAApplicable] = useState(true);
    const [isManualTax, setIsManualTax] = useState(false);
    const [typeAchat, setTypeAchat] = React.useState('COMPTANT');
    const [inputHT, setInputHT] = useState(''); 
    const [inputTVA, setInputTVA] = useState(''); 
    
    // 🎯 CLÉ DE TRAÇABILITÉ COMPTABLE POUR LA FERMETURE DU BON DE COMMANDE SOURCE DANS SQLITE
    const [idCommandeSource, setIdCommandeSource] = useState(null);

    const [header, setHeader] = useState({
        numFacture: '',
        fournisseur: '', 
        fournisseurId: '', 
        modeReglement: '', 
        montantAvance: 0,
        date: new Date().toISOString().split('T')[0] 
    });

    React.useEffect(() => {
        if (panier.length > 8) {
            panierEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }
    }, [panier]);

    // --- UTILS (Correction NaN -> Tiret) ---
    const fmt = (val) => {
        if (val === undefined || val === null || isNaN(val) || val === '') return "-";
        return Number(val).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    };

    // 🚀 ALIGNEMENT TOTAL SUR LE CONVERSION_SERVICE UNIQUE SANS INVENTER DE CALCULS
    const fmtStock = useCallback((row) => {
        if (!row) return "-";
        
        const valeurStock = row.stock_actuel !== undefined ? row.stock_actuel : (row.stock || 0);
        
        // 🛡️ VERROU ANTI-NaN SI DÉJÀ TEXTUEL
        if (typeof valeurStock === 'string' && isNaN(Number(valeurStock.trim()))) {
            return valeurStock;
        }

        const qteBrutePieces = Number(valeurStock) || 0;
        return ConversionStockService.toExpressionTextuelle(qteBrutePieces, row);
    }, []);

    const notify = useCallback((message, type = 'success') => {
        setNotification({ show: true, message, type });
        setTimeout(() => setNotification({ show: false, message: '', type: '' }), 4000);
    }, []);

    const resetLot = useCallback(() => setCurrentLotId(`LOT-${Math.floor(1000 + Math.random() * 9000)}`), []);

        const viderInterfaceLocale = useCallback(() => {
        // 1. Vidage complet des lignes du tableau du bas et des sélections
        setPanier([]);
        setEditingId(null);
        setSelectedArt(null);
        setInputQte('');
        setInputQteGros('');
        setInputQteDetail('');
        setInputMontant('');
        setInputHT('');  
        setInputTVA(''); 
        setInputObs('');
        
        // 2. 🎯 DESACTIVATION CHIRURGICALE DE LA PASSERELLE LOGISTIQUE
        setIdCommandeSource(null); // Nettoyage de la clé réactive
        
        // On écrase les variables du routeur pour empêcher le useEffect de se redéclencher
        if (location && location.state) {
            try {
                location.state.provenanceBonCommande = false;
                location.state.id_commande_source = null;
                location.state.num_bon_source = null;
                location.state.supplier_id = null;
            } catch (e) {
                // Repli sécurisé si le state est totalement gelé en lecture seule
                console.info("Navigation state nettoyé par l'historique.");
            }
        }

        // 3. Remise à zéro complète du formulaire supérieur droit
        setHeader({
            numFacture: '',
            fournisseur: '', 
            fournisseurId: '', 
            modeReglement: '', // Remet le moyen de règlement sur l'option par défaut
            montantAvance: 0,
            date: new Date().toISOString().split('T')[0]
        });
        
        setTypeAchat('COMPTANT'); 
        resetLot(); // Génère un nouveau code de lot neutre
    }, [resetLot, location]);


    // --- FETCH DATA ---
    const fetchArticles = useCallback(async () => {
        try {
            const res = await API.get('/products');
            setArticles(Array.isArray(res.data) ? res.data : []);
        } catch (err) { console.error("Erreur catalogue articles d'achat:", err); }
    }, []);

    const fetchFournisseurs = useCallback(async () => {
        try {
            const res = await API.get('/suppliers'); 
            setFournisseurs(Array.isArray(res.data) ? res.data : []);
        } catch (err) { console.error("Erreur fournisseurs", err); }
    }, []);

    const verifierInventaire = useCallback(async () => {
        try {
            const res = await API.get('/inventories/check-status'); 
            if (res.data.en_cours) {
                setIsLocked(true);
                notify("⚠️ Un inventaire est en cours. Les approvisionnements sont bloqués.", "error");
            } else {
                setIsLocked(false);
            }
        } catch (err) { console.error("Erreur check inventaire", err); }
    }, [notify]);


    const recupererPanierTemporaire = useCallback(async () => {
        try {
            const res = await API.get('/provisional-sales/temp-cart');
            const savedItems = res.data?.lignes || [];
            const savedHeader = res.data?.header || {}; 

            if (Array.isArray(savedItems) && savedItems.length > 0) {
                const dataItems = typeof savedItems === 'string' ? JSON.parse(savedItems) : savedItems;
                setPanier(dataItems);
                
                const ref = dataItems[0];
                if (ref.lot_id) setCurrentLotId(ref.lot_id);

                setHeader(prev => ({
                    ...prev,
                    numFacture: savedHeader.numFacture || ref.num_facture || '',
                    fournisseurId: savedHeader.fournisseurId || ref.id_fournisseur || '',
                    fournisseur: savedHeader.fournisseur || ref.fournisseur || '',
                    modeReglement: savedHeader.modeReglement || prev.modeReglement,
                    montantAvance: savedHeader.montantAvance || 0,
                    date: savedHeader.date || ref.date || prev.date 
                }));
            } else if (savedHeader && Object.keys(savedHeader).length > 0) {
                setHeader(prev => ({ ...prev, ...savedHeader }));
            }

        } catch (err) { 
            console.info("Restauration : Aucune donnée temporaire.");
        }
    }, []);

    // --- LOGIQUE SOCKET ---
    useEffect(() => {
        if (socket) {
            socket.emit('join_company', COMPANY_ID);
            socket.emit('join_user', USER_ID);

            const rafraichirArticles = () => fetchArticles();
            const rafraichirFournisseurs = () => fetchFournisseurs();

            socket.on('STOCK_UPDATED', rafraichirArticles);
            socket.on('REFRESH_STOCK', rafraichirArticles);
            socket.on('SUPPLIERS_UPDATED', rafraichirFournisseurs);

            socket.on('REFRESH_UI', (data) => {
                if (data.module === 'SUPPLIERS' || data.module === 'FOURNISSEUR') rafraichirFournisseurs();
                if (data.module === 'ARTICLES' || data.module === 'STOCK') rafraichirArticles();
            });

            socket.on('PURCHASE_SUCCESS_SYNC', (data) => {
                if (data.userId === USER_ID) {
                    viderInterfaceLocale();
                    fetchArticles();
                }
            });

            socket.on('CART_CLEARED', (data) => {
                if (data.userId === USER_ID && data.cartType === 'ARTICLE') viderInterfaceLocale();
            });

            socket.on('INVENTORY_STATUS_CHANGED', (data) => {
                setIsLocked(!!data.en_cours);
                if (data.en_cours) notify("⚠️ Inventaire lancé : Approvisionnements suspendus.", "error");
            });

            return () => {
                socket.off('STOCK_UPDATED', rafraichirArticles);
                socket.off('REFRESH_STOCK', rafraichirArticles);
                socket.off('SUPPLIERS_UPDATED', rafraichirFournisseurs);
                socket.off('REFRESH_UI');
                socket.off('PURCHASE_SUCCESS_SYNC');
                socket.off('CART_CLEARED');
                socket.off('INVENTORY_STATUS_CHANGED');
            };
        }
    }, [COMPANY_ID, USER_ID, fetchArticles, fetchFournisseurs, viderInterfaceLocale, notify]);


      useEffect(() => {
        const chargerBonCommandeSource = async () => {
            // S'exécute uniquement si l'état provient d'une redirection "provenanceBonCommande"
            if (location.state?.provenanceBonCommande && location.state?.id_commande_source) {
                const { id_commande_source, num_bon_source, supplier_id, observations_source } = location.state;
                
                try {
                    setIsSaving(true);
                    
                    // 1. Extraction à chaud des articles rattachés au bon de commande
                    const res = await API.get(`/purchase-orders/${id_commande_source}/items`);
                    const lignesSource = Array.isArray(res.data) ? res.data : res.data?.data || [];

                    if (lignesSource.length === 0) {
                        notify("⚠️ Ce bon de commande ne contient aucun article.", "error");
                        return;
                    }

                    // 🔍 Sécurisation du fournisseur en amont pour éviter l'erreur de référence sur "header" pendant le map
                    const fTrouve = fournisseurs.find(f => String(f.id || f._id) === String(supplier_id));
                    const nomFournisseurFinal = fTrouve ? fTrouve.nom : "Fournisseur Commande";

                    // 2. 🎯 ALIGNEMENT LOGISTIQUE : Le N° de Bon devient le Code de Lot (N° Facture reste à blanc)
                    const panierReconstruit = lignesSource.map(item => {
                        const coeff = Number(item.unit_coefficient || 1);
                        const mntTTC = Number(item.montant_facture_ligne || 0);
                        const mntHT = Number(item.montant_ht_ligne || mntTTC);
                        const tvaLigne = Number(item.montant_tva_ligne || 0);
                        const piecesNatives = Number(item.quantite_pieces_natives || 0);

                        // Rapprochement à chaud du produit dans le catalogue local pour extraire le vrai stock actuel et prix d'achat
                        const prodCatalogue = articles.find(a => String(a.id || a._id) === String(item.product_id));
                        
                        // Détermination sécurisée du stock avant achat
                        const stockBrutBDD = prodCatalogue 
                            ? (prodCatalogue.stock_actuel !== undefined ? prodCatalogue.stock_actuel : (prodCatalogue.stock || 0))
                            : (item.stock_avant || 0);

                        // Récupération du CMP d'origine ou prix de base
                        const cmpAncien = prodCatalogue ? Number(prodCatalogue.cmp || 0) : Number(item.cmp_ancien || 0);

                        return {
                            // Clé unique requise pour l'édition/suppression locale de votre panier d'achat
                            id_achat: `ACH-BC-${Date.now().toString().slice(-4)}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
                            
                            // 🎯 RECADRAGE : Le N° de bon logistique remplace la référence du Lot d'achat
                            lot_id: String(num_bon_source).trim(),
                            
                            // 🎯 EXIGENCE COMPTABLE : On force la chaîne de facture à vide pour exiger la saisie manuelle
                            num_facture: '',
                            
                            // Association aux clés d'origine de l'approvisionnement
                            id_article: item.product_id, 
                            nom_article: String(item.nom_article_snap).toUpperCase(),
                            id_fournisseur: String(supplier_id),
                            fournisseur: nomFournisseurFinal,
                            
                            // Distribution logistique conforme
                            qte_achetee: item.qte_achetee, 
                            quantite_pieces_natives: piecesNatives,
                            unit_coefficient: coeff,
                            unit_code_gros: String(item.unit_code_gros || 'CS').toUpperCase(),
                            unit_ref_detail: String(item.unit_ref_detail || 'PCS').toUpperCase(),
                            
                            // Remplissage fixe du prix de base (PRICE A.) pour alimenter la colonne
                            prix_achat_unitaire: Number(item.prix_achat_unitaire || cmpAncien || 0),
                            cmp_ancien: cmpAncien,
                            
                            // Correction MT CMP : On calcule la valeur globale du stock au CMP d'origine
                            montant_cmp_ancien: Number(((piecesNatives / coeff) * cmpAncien).toFixed(2)),
                            
                            // Alignement des lignes financières et des taxes
                            montant_ht_ligne: mntHT,
                            montant_tva_ligne: tvaLigne,
                            montant_facture_ligne: mntTTC, // TTC global de la ligne
                            
                            // Écart financier (HT - Valeur théorique CMP)
                            ecart: Number((mntHT - ((piecesNatives / coeff) * cmpAncien)).toFixed(2)),
                            
                            // Reconversion du stock sécurisé pour remplir la colonne "STK."
                            stock_avant: stockBrutBDD,
                            observations: item.observation || `Transféré depuis le bon ${num_bon_source}`
                        };
                    });

                    // 3. Hydratation immédiate du panier et de la clé de fermeture SQLite
                    setPanier(panierReconstruit);
                    setIdCommandeSource(id_commande_source);
                    
                    // 🎯 RECADRAGE COUPLAGE : Le numéro de bon logistique prend la place du Lot global actuel à l'écran
                    setCurrentLotId(String(num_bon_source).trim());

                    setHeader(prev => ({
                        ...prev,
                        // 🎯 RESTRUCTURATION COMPTABLE CRITIQUE : Le champ N° Facture est laissé VIDE pour obliger la saisie du papier fournisseur
                        numFacture: '',
                        fournisseurId: String(supplier_id),
                        fournisseur: nomFournisseurFinal,
                        date: prev.date || new Date().toISOString().slice(0, 10),
                        observations: observations_source || ''
                    }));

                    // 🎯 SÉCURITÉ ANTI-ÉCRASEMENT : Synchronisation forcée des références de sauvegarde automatique
                    if (localHeaderRef && localHeaderRef.current) {
                        localHeaderRef.current.numFacture = ''; // Vide pour neutraliser la mémoire tampon
                        localHeaderRef.current.fournisseurId = String(supplier_id);
                        localHeaderRef.current.fournisseur = nomFournisseurFinal;
                    }

                    notify(`📋 Bon lié au Lot ${num_bon_source}. Renseignez le N° de Facture du livreur pour enregistrer !`, "success");

                } catch (err) {
                    console.error("Erreur d'injection logistique du bon de commande :", err);
                    notify("❌ Impossible de charger le panier de commande.", "error");
                } finally {
                    setIsSaving(false);
                    // Nettoyage immédiat du state de navigation pour sécuriser les rafraîchissements (F5)
                    window.history.replaceState({}, document.title);
                }
            }
        };

        // L'interception s'exécute dès que le catalogue d'articles et de fournisseurs est instancié en mémoire cache local
        if (fournisseurs && fournisseurs.length > 0 && articles.length > 0) {
            chargerBonCommandeSource();
        }
    }, [location.state, fournisseurs, articles, notify]);


       const fetchCompanySettings = useCallback(async () => {
        try {
            const res = await API.get(`/company/${COMPANY_ID}`);
            if (res.data?.success && res.data?.data) {
                setRegimeTVA(res.data.data.regime_tva_recuperable);
                setTauxTVA(res.data.data.taux_tva_defaut || 18); 
            }
        } catch (err) { console.error("Erreur settings", err); }
    }, [COMPANY_ID]);

    const fetchPaymentMethods = useCallback(async () => {
        try {
            const res = await API.get('/plan-comptable/paiements/methodes');
            const methods = res.data?.data || res.data || [];
            setPaymentMethods(Array.isArray(methods) ? methods.filter(m => m.is_active === 1) : []);
        } catch (err) { 
            console.error("Erreur modes paiement", err); 
        }
    }, []);

    // 🎯 INITIALISATION UNIQUE AU MONTAGE DE L'ÉCRAN D'ACHATS
    useEffect(() => { 
        fetchArticles(); 
        fetchFournisseurs();
        verifierInventaire();
        recupererPanierTemporaire();
        fetchCompanySettings();
        fetchPaymentMethods(); 
    }, [fetchArticles, fetchFournisseurs, verifierInventaire, recupererPanierTemporaire, fetchCompanySettings, fetchPaymentMethods]);

    // 🛡️ SÉCURISATION SAUVEGARDE AUTOMATIQUE CONTRE LE BOUCLAGE DE REQUÊTES
    const localPanierRef = useRef(panier);
    const localHeaderRef = useRef(header);

    useEffect(() => {
        localPanierRef.current = panier;
        localHeaderRef.current = header;
    }, [panier, header]);

    useEffect(() => {
        if (isSaving || isLocked) return;
        
        const saveCart = async () => {
            if (localPanierRef.current.length > 0 || localHeaderRef.current.numFacture) {
                try {
                    await API.post('/provisional-sales/temp-cart', { 
                        lignes: localPanierRef.current, 
                        header: localHeaderRef.current 
                    });
                } catch (err) { console.error("Erreur sauvegarde auto", err); }
            }
        };

        const timer = setTimeout(saveCart, 2500); 
        return () => clearTimeout(timer);
    }, [panier, header, isSaving, isLocked]);


   // --- LOGIQUE MÉTIER SÉLECTION ---
    const handleSelect = (art) => {
        setSelectedArt(art);
        setEditingId(null); 
        
        setInputQte(1);
        
        setInputQteGros('');
        setInputQteDetail('');
        
        setInputMontant('');
        setInputObs('');
        setInputHT('');  
        setInputTVA('');
    };

const ajouterAuBordereau = () => {
    // 1. Capture et nettoyage sémantique des données du header
    const fctSaisie = String(header.numFacture || '').trim();
    const fournisseurIdSaisi = String(header.fournisseurId || '').trim();

    if (!selectedArt || !fournisseurIdSaisi) {
        return notify("❌ Veuillez remplir les champs obligatoires (Article et Fournisseur)", "error");
    }

    // Le numéro de facture est exigé pour ajouter une nouvelle ligne, mais toléré à blanc en cours d'édition
    if (!editingId && !fctSaisie) {
        return notify("❌ Veuillez renseigner le N° de Facture du livreur avant d'ajouter un article.", "error");
    }

    // Interception logistique du double champ Gros + Détail
    const grosNettoye = String(inputQteGros || '').replace(',', '.').trim();
    const detailNettoye = String(inputQteDetail || '').replace(',', '.').trim();

    const qteAchatGros = parseFloat(grosNettoye) || 0;
    const qteAchatDetail = parseFloat(detailNettoye) || 0;

    // Détermination sécurisée du volume en pièces natives
    let piecesAcheteesActuelles = 0;
    const coeffLogistique = Number(selectedArt.coefficient || selectedArt.unit_coefficient || selectedArt.coeff || 1);

    if (qteAchatGros === 0 && qteAchatDetail === 0) {
        // Système de secours rétrocompatible sur l'ancienne variable unique
        const chaineFallback = String(inputQte || '1').replace(/-/g, '').trim();
        piecesAcheteesActuelles = ConversionStockService.toPieces(chaineFallback, selectedArt);
        if (piecesAcheteesActuelles <= 0) {
            return notify("❌ Veuillez saisir une quantité valide en Gros ou au Détail.", "error");
        }
    } else {
        if (qteAchatGros < 0 || qteAchatDetail < 0) {
            return notify("❌ Les quantités ne peuvent pas être négatives.", "error");
        }
        piecesAcheteesActuelles = Math.round(qteAchatGros * coeffLogistique) + Math.round(qteAchatDetail);
    }

    const isAmountValid = isManualTax ? (inputHT !== '' && inputTVA !== '') : (inputMontant !== '');
    if (!isAmountValid) {
        return notify("❌ Veuillez renseigner le prix ou les montants de taxes.", "error");
    }

    // 2. 🎯 VERROU DU HEADER INTELLIGENT (ANTI-BLOCAGE MISE À JOUR FACTURE)
    if (panier.length > 0) {
        const ref = panier[0];
        // On valide uniquement la cohérence du fournisseur pour éviter les mélanges de tiers
        if (fournisseurIdSaisi !== String(ref.id_fournisseur)) {
            notify(`❌ Ce lot est lié à : ${ref.fournisseur}`, "error");
            setHeader(prev => ({ ...prev, fournisseurId: ref.id_fournisseur, fournisseur: ref.fournisseur }));
            return;
        }
        // Si le panier inférieur contient déjà un numéro de facture fixé, on empêche le mélange
        if (String(ref.num_facture).trim() !== "" && fctSaisie !== String(ref.num_facture).trim()) {
            notify(`❌ Ce lot est déjà validé sous la facture : ${ref.num_facture}`, "error");
            setHeader(prev => ({ ...prev, numFacture: ref.num_facture }));
            return;
        }
    }

        // 3. Construction de l'expression textuelle combinée via le ConversionStockService unique
    const expressionQuantiteFinale = ConversionStockService.toExpressionTextuelle(piecesAcheteesActuelles, selectedArt);

    // 4. Calculs financiers avec précision (2 décimales)
    let mtHT = 0, mtTVA = 0, mtTTC = 0;

    if (isManualTax) {
        mtHT = Number(inputHT) || 0;
        mtTVA = Number(inputTVA) || 0;
        mtTTC = Number((mtHT + mtTVA).toFixed(2));
    } else {
        mtTTC = Number(inputMontant) || 0;
        const taux = Number(tauxTVA) || 0; 
        const diviseur = 1 + (taux / 100);
        
        if (regimeTVA === 1) {
            mtHT = Number((mtTTC / diviseur).toFixed(2));
            mtTVA = Number((mtTTC - mtHT).toFixed(2));
        } else {
            mtHT = mtTTC;
            mtTVA = 0;
        }
    }

    // 🔒 DECODAGE SECURISÉ DU STOCK EN PIÈCES NATIVES
    const stockBrutBDD = selectedArt.stock_actuel !== undefined ? selectedArt.stock_actuel : (selectedArt.stock || 0);
    let piecesStockAvant = 0;

    if (typeof stockBrutBDD === 'string' && isNaN(Number(stockBrutBDD.trim()))) {
        piecesStockAvant = ConversionStockService.toPieces(stockBrutBDD, selectedArt);
    } else {
        piecesStockAvant = Number(stockBrutBDD) || 0;
    }

    const cmpAncien = Number(selectedArt.cmp || 0);

    // 5. Construction de l'objet ligne enrichi pour l'affichage des totaux
    const nouvelleLigne = {
        id_achat: editingId || `ACH-${Date.now().toString().slice(-6)}`,
        lot_id: currentLotId,
        
        // 🎯 LIAISON FACTURE DIRECTE : La ligne hérite du numéro actuellement tapé dans le formulaire
        num_facture: fctSaisie, 
        
        id_article: selectedArt.id || selectedArt._id || selectedArt.ID,
        nom_article: selectedArt.nom || selectedArt.NOM,
        id_fournisseur: fournisseurIdSaisi,
        fournisseur: header.fournisseur,
        stock_avant: stockBrutBDD,
        qte_achetee: expressionQuantiteFinale, 
        quantite_pieces_natives: piecesAcheteesActuelles,
        unit_coefficient: coeffLogistique,
        unit_code_gros: String(selectedArt.unit_code_gros || selectedArt.unite_code || selectedArt.code || 'CS').toUpperCase().trim(),
        unit_ref_detail: String(selectedArt.unit_ref_detail || selectedArt.unite_reference || 'UNITÉ').replace(/\(s\)/g, '').toUpperCase().trim(),
        montant_ht_ligne: mtHT,
        montant_tva_ligne: mtTVA,
        montant_facture_ligne: mtTTC,
        cmp_ancien: cmpAncien,
        montant_cmp_ancien: Number(((piecesStockAvant / coeffLogistique) * cmpAncien).toFixed(2)),
        ecart: Number((mtHT - ((piecesAcheteesActuelles / coeffLogistique) * cmpAncien)).toFixed(2)),
        observations: inputObs || (isManualTax ? "SAISIE MANUELLE" : ""),
        date: header.date,
        supplier_id: fournisseurIdSaisi 
    };

    // 6. Mise à jour du panier (Édition ou Ajout)
    let panierAjuste = [];
    if (editingId) {
        panierAjuste = panier.map(item => item.id_achat === editingId ? nouvelleLigne : item);
        setEditingId(null);
        notify("✅ Ligne modifiée");
    } else {
        panierAjuste = [...panier, nouvelleLigne];
        notify("✅ Article ajouté au bordereau");
    }

    // 🎯 PROPAGATION AUTOMATIQUE : Si l'utilisateur a écrit une facture, on l'applique sur TOUTES les lignes importées
    if (fctSaisie) {
        panierAjuste = panierAjuste.map(item => ({ ...item, num_facture: fctSaisie }));
    }

    setPanier(panierAjuste);

    // 7. Reset complet de la zone de saisie active
    setSelectedArt(null); 
    setInputQte(''); 
    setInputQteGros('');
    setInputQteDetail('');
    setInputMontant(''); 
    setInputHT(''); 
    setInputTVA(''); 
    setInputObs('');
    setSearchTerm('');
    setSearchId('');
    setSearchBarcode('');
};


// 🛡️ RECHERCHE AUTOMATIQUE SCANNER RE-STABILISÉE ET UNIFORMISÉE
useEffect(() => {
    const barcodeNettoye = searchBarcode.trim();
    if (barcodeNettoye === "") return;

    // ⏱️ ANTI-REBOND AUTOMATIQUE : On laisse le temps à la douchette de finir sa saisie
    const delayDebounceFn = setTimeout(() => {
        const found = articles.find(a => String(a.codeBarre || a.code_barre || '').trim() === barcodeNettoye);
        if (found) {
            handleSelect(found);
            setSearchBarcode(""); 
        }
    }, 150);

    return () => clearTimeout(delayDebounceFn);
}, [searchBarcode, articles, handleSelect]);
// 🚀 RESTRUCTURATION COMPLÈTE DU CHARGEMENT WITH RECONVERSION UNIFORME
const chargerPourEdition = (ligne) => {
    const artOriginal = articles.find(a => String(a.id || a._id || a.ID) === String(ligne.id_article));
    
    if (artOriginal) {
        setSelectedArt(artOriginal);
        setEditingId(ligne.id_achat); 
        
        // 🎯 FIX CHIRURGICAL CHARGEMENT : Extraction des pièces natives ou reconversion à la volée via ConversionStockService
        const piecesAchetes = ligne.quantite_pieces_natives !== undefined 
            ? Number(ligne.quantite_pieces_natives) 
            : ConversionStockService.toPieces(ligne.qte_achetee, artOriginal);
        
        const coeff = Number(artOriginal.coefficient || artOriginal.unit_coefficient || 1);

        // Répartition fluide et intègre dans les inputs de l'interface
        if (coeff > 1) {
            const gros = Math.floor(piecesAchetes / coeff);
            const detail = Math.round(piecesAchetes % coeff);
            setInputQteGros(gros > 0 ? String(gros) : '');
            setInputQteDetail(detail > 0 ? String(detail) : '');
        } else {
            setInputQteGros('');
            setInputQteDetail(piecesAchetes > 0 ? String(piecesAchetes) : '');
        }
        
        setInputQte(ligne.qte_achetee);
        
        if (ligne.observations === "SAISIE MANUELLE") {
            setIsManualTax(true);
            setInputHT(ligne.montant_ht_ligne);
            setInputTVA(ligne.montant_tva_ligne);
        } else {
            setIsManualTax(false);
            setInputMontant(ligne.montant_facture_ligne);
        }
        
        setInputObs(ligne.observations);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
};

const enregistrerBordereau = async () => {
    if (!header.fournisseurId || !header.numFacture) {
        return notify("❌ Fournisseur et N° Facture obligatoires.", "error");
    }

    if (panier.length === 0 || isLocked || isSaving) return;

    const totalTTC = Number(totaux.mtFac.toFixed(2));
    let montantFinalAPayer = 0;
    let moyenDePaiementFinal = header.modeReglement ? String(header.modeReglement) : null;

    switch (typeAchat) {
        case 'COMPTANT':
            if (!moyenDePaiementFinal) {
                return notify("❌ Veuillez sélectionner un moyen de règlement.", "error");
            }
            montantFinalAPayer = totalTTC;
            break;

        case 'ACOMPTE':
            const avance = Number(header.montantAvance);
            if (isNaN(avance) || avance <= 0 || avance >= totalTTC) {
                return notify(`❌ L'acompte doit être compris entre 1 et ${totalTTC - 1}.`, "error");
            }
            if (!moyenDePaiementFinal) {
                return notify("❌ Sélectionnez le mode de règlement de l'acompte.", "error");
            }
            montantFinalAPayer = avance;
            break;

        case 'CREDIT':
            montantFinalAPayer = 0;
            moyenDePaiementFinal = null; 
            break;

        default:
            return notify("❌ Type d'achat non reconnu.", "error");
    }

    setIsSaving(true);

    try {
        // Construction du Payload d'approvisionnement destiné au backend SQLite
        const payload = {
            typeAchat: typeAchat, 
            header: {
                numFacture: String(header.numFacture).trim(),
                fournisseurId: String(header.fournisseurId),
                fournisseur: String(header.fournisseur),
                totalFacture: totalTTC,
                montantAvance: Number(montantFinalAPayer.toFixed(2)),
                montantPaye: Number(montantFinalAPayer.toFixed(2)),
                resteAPayer: Number((totalTTC - montantFinalAPayer).toFixed(2)),
                modeReglement: moyenDePaiementFinal,
                lotId: String(currentLotId),
                date: header.date,
                id_commande_source: idCommandeSource || null
            },
            items: panier.map(item => {
                // 🎯 LE CORRECTIF LOGISTIQUE ABSOLU ANTI-MUTATION :
                // Extraction de la quantité brute saisie et nettoyage de l'espace
                const qteBrute = String(item.qte_achetee || item.quantite || '0').trim();
                
                // Détermination de l'unité ou du texte d'affichage de la ligne du panier
                const uniteSaisie = String(item.unite || item.unit || item.mesure || '').toUpperCase().trim();
                const texteFormate = String(item.qte_formate || item.qte_achetee_formate || '').toUpperCase().trim();

                let expressionPourBackend = qteBrute;

                // Si l'interface indique du détail (BTS / PCS), on force le format "0 + X" 
                // pour interdire au service de conversion du serveur de multiplier par le coefficient
                if (uniteSaisie === 'BTS' || uniteSaisie === 'PCS' || texteFormate.includes('BTS') || texteFormate.includes('PCS')) {
                    expressionPourBackend = `0 + ${qteBrute}`;
                } 
                // Si l'interface indique du Gros (Caisses), on force le format "X + 0"
                else if (uniteSaisie === 'CS' || texteFormate.includes('CS')) {
                    expressionPourBackend = `${qteBrute} + 0`;
                } 
                // Filet de sécurité si aucune unité textuelle n'est trouvée : On utilise les pièces déjà calculées
                else {
                    const piecesNativesPures = Number(item.quantite_pieces_natives || 0);
                    expressionPourBackend = piecesNativesPures > 0 ? `0 + ${piecesNativesPures}` : qteBrute;
                }

                return {
                    product_id: String(item.id_article || item.product_id), 
                    qte_achetee: expressionPourBackend, // 🚀 Transmet la chaîne combinée ("0 + 2") au serveur
                    quantite_pieces_natives: Number(item.quantite_pieces_natives || 0),
                    montant_facture_ligne: Number(item.montant_facture_ligne),
                    montant_ht_ligne: Number(item.montant_ht_ligne),
                    montant_tva_ligne: Number(item.montant_tva_ligne),
                    supplier_id: String(header.fournisseurId),
                    num_facture: String(header.numFacture).trim()
                };
            })
        };

        const response = await API.post('/purchases', payload);

        if (response.data) {
            // 1. Nettoyage de la mémoire tampon temporaire en base de données
            await API.delete('/provisional-sales/temp-cart'); 
            
            // 2. 🎯 PURGE RADICALE DU NAVIGATEUR : Remplace l'historique par un objet vide
            window.history.replaceState({}, document.title);
            
            // 3. 🎯 APPEL DU RESET COMPLET : Vide le panier, les inputs et éteint la passerelle
            viderInterfaceLocale(); 
            
            notify("✅ Bordereau et Facture enregistrés avec succès !", "success");
            
            // 4. Notifications en temps réel inter-postes et actualisation
            socket?.emit('REFRESH_STOCK');
            socket?.emit('REFRESH_PURCHASE_ORDERS'); 
            
            fetchArticles(); 
        }

    } catch (err) {
        const errorMsg = err.response?.data?.error || err.response?.data?.message || err.message;
        notify(`❌ Erreur: ${errorMsg}`, "error");
    } finally {
        setIsSaving(false);
    }
};



const filteredArticles = useMemo(() => {
    return articles.filter(art => {
        const term = searchTerm.toLowerCase().trim();
        const sId = searchId.toLowerCase().trim();
        const sBar = searchBarcode.toLowerCase().trim();

        // Récupération sécurisée des valeurs (id système et code-barres SQLite)
        const artId = String(art.id || art._id || "").toLowerCase();
        const artBarcode = String(art.code_barre || art.codeBarre || "").toLowerCase();

        // Vérification croisée adaptative (Si un champ est vide, la condition est validée par défaut)
        const matchNom = !term || art.nom?.toLowerCase().includes(term);
        const matchId = !sId || artId.includes(sId);
        const matchBarcode = !sBar || artBarcode.includes(sBar);

        return matchNom && matchId && matchBarcode;
    });
}, [articles, searchTerm, searchId, searchBarcode]);
const totaux = useMemo(() => {
    return panier.reduce((acc, cur) => {
        const coeff = Number(cur.unit_coefficient || 1);

        // 🎯 FIX DE SÉCURITÉ COMPTABLE : Récupération instantanée du nombre de pièces natives
        // Sans risque de rupture ni besoin de découpage manuel de texte instable
        const totalPiecesLigne = cur.quantite_pieces_natives !== undefined 
            ? Number(cur.quantite_pieces_natives) 
            : ConversionStockService.toPieces(cur.qte_achetee, cur);

        // On convertit le total de pièces en valeur équivalente en gros pour l'affichage récapitulatif
        const qteEquivalentGros = totalPiecesLigne / coeff;

        return {
            qte: acc.qte + qteEquivalentGros,
            mtHT: acc.mtHT + Number(cur.montant_ht_ligne || 0),
            mtTVA: acc.mtTVA + Number(cur.montant_tva_ligne || 0),
            mtFac: acc.mtFac + Number(cur.montant_facture_ligne || 0),
            
            // 🎯 FIX COMPTABLE ABSOLU : On additionne la valeur globale du stock au CMP d'origine 
            // au lieu de sommer de manière brute les coûts unitaires disparates des articles
            mtCmp: acc.mtCmp + Number(cur.montant_cmp_ancien || 0), 
            ecart: acc.ecart + Number(cur.ecart || 0)
        };
    }, { qte: 0, mtHT: 0, mtTVA: 0, mtFac: 0, mtCmp: 0, ecart: 0 });
}, [panier]);

return (
    <div style={layoutStyle}>
        {notification.show && (
            <div style={{
                position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
                padding: '15px 25px', borderRadius: '12px',
                backgroundColor: notification.type === 'error' ? '#ef4444' : '#10b981',
                color: '#fff', fontWeight: '800', zIndex: 10000,
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.2)',
                display: 'flex', alignItems: 'center', gap: '10px'
            }}>
                {notification.type === 'error' ? '⚠️' : '✅'} {notification.message}
            </div>
        )}

            <style>
                {`
                    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');
                    * { font-family: 'Plus Jakarta Sans', sans-serif; }
                    @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
                    tr:active { transform: scale(0.99); transition: 0.1s; }
                    button:active { transform: scale(0.95); transition: 0.1s; }
                `}
            </style>
            
            <Sidebar />

        <main style={mainStyle}>
                <header style={headerBarStyle}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                            <div style={iconBox}><Package size={24} color="#fff" /></div>
                            <div>
                                <h1 style={titleStyle}>LOGISTIQUE & STOCK</h1>  
                                <p style={subtitleStyle}>Lot actuel : <span style={{color:'#1d4ed8', fontWeight:'900'}}>{currentLotId}</span></p>
                            </div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '15px' }}>
                        <button style={btnReset} onClick={() => { setPanier([]); resetLot(); notify("Panier vidé", "error"); }}><RefreshCcw size={18} /> ANNULER / NOUVEAU LOT</button>
                        <button 
                            style={{...btnSave, opacity: isLocked ? 0.5 : 1}} 
                            onClick={isLocked ? null : enregistrerBordereau}
                            disabled={isLocked}
                        >
                            <Save size={20} /> {isLocked ? "MODIFICATIONS BLOQUÉES" : "ENREGISTRER LA FACTURE"}
                        </button>
                    </div>
                </header>

                <div style={contentArea}>
                    <div style={topGrid}>
                        {/* SECTION GAUCHE : CHOIX ARTICLE */}
                        <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                            <h3 style={cardTitle}>CHOIX DE L'ARTICLE</h3>
                            
                            {/* Barre de recherche triple : Nom, ID, et Code-barres */}
                            <div style={{ ...searchBox, gap: '8px', display: 'flex' }}>
                                {/* 1. Recherche par Nom */}
                                <div style={{ position: 'relative', flex: 2 }}>
                                    <Search size={16} style={iconInside} />
                                    <input 
                                        style={searchInput} 
                                        placeholder="Rechercher nom..." 
                                        value={searchTerm} 
                                        onChange={e => setSearchTerm(e.target.value)} 
                                    />
                                </div>

                                {/* 2. Recherche par ID Article (Le code système ART-...) */}
                                <div style={{ position: 'relative', flex: 1 }}>
                                    <Hash size={16} style={iconInside} />
                                    <input 
                                        style={searchInput} 
                                        placeholder="ID Article..." 
                                        value={searchId} 
                                        onChange={e => setSearchId(e.target.value)} 
                                    />
                                </div>


                              {/* 3. Recherche par Code-barres (Champ dédié à la douchette) */}
                                <div style={{ position: 'relative', flex: 1 }}>
                                    <Barcode size={16} style={iconInside} />
                                    <input 
                                        style={searchInput} 
                                        placeholder="Code-barres..." 
                                        value={searchBarcode} 
                                        onChange={e => setSearchBarcode(e.target.value)} 
                                    />
                                </div>
                            </div>

                            <div style={{ 
                                height: '360px', 
                                overflowY: 'auto',  
                                border: '1px solid #e2e8f0',
                                borderRadius: '8px',
                                backgroundColor: '#fff',
                                marginTop: '10px'
                            }}>
                                <table style={{ ...tableMini, width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
                                    <thead style={{ 
                                        position: 'sticky', 
                                        top: 0, 
                                        background: '#f8fafc', 
                                        zIndex: 10,
                                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)' 
                                    }}>
                                        <tr style={{ height: '40px' }}>
                                            <th style={thMiniBorder}>ID / CODE-BARRE</th>
                                            <th style={thMiniBorder}>NOM</th>
                                            <th style={{...thMiniBorder, ...centerText}}>STOCK</th>
                                            <th style={{...thMiniBorder, ...centerText}}>COND.</th>
                                            <th style={{...thMiniBorder, ...centerText}}>CMP</th>
                                            <th style={{...thMiniBorder, ...centerText}}>VENTE</th> 
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredArticles.map(art => {
                                            const currentId = String(art.id || art._id || art.ID || "");
                                            const selectedId = String(selectedArt?.id || selectedArt?._id || selectedArt?.ID || "");
                                            const isSelected = selectedId !== "" && currentId === selectedId;


                                           return (
                                                <tr 
                                                    key={currentId} 
                                                    onClick={() => handleSelect(art)} 
                                                    style={{
                                                        ...rowSelectStyle,
                                                        height: '40px',
                                                        backgroundColor: isSelected ? '#f1f5f9' : 'transparent',
                                                        borderLeft: isSelected ? '4px solid #64748b' : '4px solid transparent',
                                                        fontWeight: isSelected ? 'bold' : 'normal',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    <td style={{...tdMini, ...smallId}}>
                                                        {/* ID système (ex: ART-001) */}
                                                        <div style={{ fontSize: '10px', color: '#64748b' }}>{currentId}</div>
                                                        {/* CodeBarre de la base SQLite */}
                                                        <div style={{ fontWeight: 'bold', color: '#0f172a' }}>
                                                            {art.codeBarre || art.code_barre || "-"}
                                                        </div>
                                                    </td>
                                                    
                                                    <td style={tdMini}><strong>{art.nom}</strong></td>
                                                    
                                                    {/* 🚀 EXTRACTEUR LOGISTIQUE CORRIGÉ UNIFORME SANS CONFLIT */}
                                                    <td style={{...tdMini, ...centerText}}>
                                                        <span style={{
                                                            ...stockBadge,
                                                            background: '#f8fafc',
                                                            padding: '4px 8px',
                                                            borderRadius: '6px',
                                                            border: '1px solid #cbd5e1',
                                                            fontSize: '11px',
                                                            fontWeight: '800',
                                                            color: '#0f172a',
                                                            display: 'inline-block'
                                                        }}>
                                                            {fmtStock(art)}
                                                        </span>
                                                    </td>

                                                    <td style={{...tdMini, ...centerText, color: '#64748b', fontSize: '11px', fontWeight: 'bold'}}>
                                                        {/* On affiche le libellé long de l'unité configurée */}
                                                        {art.unite_libelle || art.libelle || art.unite_id || '-'} 
                                                    </td>
                                                    
                                                    <td style={{...tdMini, ...centerText, fontWeight: '800', color: '#475569'}}>
                                                        {fmt(art.cmp)}
                                                    </td>
                                                    
                                                    <td style={{...tdMini, ...centerText, color: '#1d4ed8', fontWeight: '900'}}>
                                                        {fmt(art.prixVente || 0)}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>


                       {/* SECTION DROITE : SAISIE ACHAT */}
                        <div style={cardStyle}>
                            <div style={formGrid}>
                                <div style={inputGroup}>
                                    <label style={labelStyle}>N° FACTURE *</label>
                                    <input style={inputStyle} value={header.numFacture} onChange={e => setHeader({...header, numFacture: e.target.value})} placeholder="Ex: FAC-001" />
                                </div>
                                <div style={inputGroup}>
                                    <label style={labelStyle}>FOURNISSEUR *</label>
                                    <select 
                                        style={inputStyle} 
                                        value={header.fournisseurId} 
                                        onChange={e => {
                                            const id = e.target.value;
                                            const name = fournisseurs.find(f => f.id.toString() === id)?.nom || '';
                                            setHeader({...header, fournisseurId: id, fournisseur: name});
                                        }}
                                    >
                                        <option value="">-- Choisir --</option>
                                        {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
                                    </select>
                                </div>
                            </div>

                            {/* ✅ SECTION RÈGLEMENT DYNAMIQUE MISE À ZONE */}
                            <div style={{...formGrid, borderTop: '1px solid #e2e8f0', paddingTop: '15px'}}>
                                
                                {/* 1. SÉLECTEUR DU TYPE D'OPÉRATION (Champ à part entière) */}
                                <div style={inputGroup}>
                                    <label style={labelStyle}>TYPE D'ACHAT *</label>
                                    <select 
                                        style={{...inputStyle, border: '2px solid #64748b', fontWeight: 'bold'}} 
                                        value={typeAchat}
                                        onChange={e => {
                                            const val = e.target.value;
                                            setTypeAchat(val);
                                            
                                            // Logique de nettoyage automatique lors du changement
                                            if (val === 'CREDIT') {
                                                setHeader({...header, modeReglement: '', montantAvance: 0});
                                            } else if (val === 'COMPTANT') {
                                                setHeader({...header, montantAvance: 0}); 
                                            }
                                        }}
                                    >
                                        <option value="COMPTANT">COMPTANT</option>
                                        <option value="ACOMPTE">ACOMPTE</option>
                                        <option value="CREDIT">CREDIT</option>
                                    </select>
                                </div>


                                {/* 2. SÉLECTEUR MOYEN DE RÈGLEMENT */}
                                {/* Ce champ est bloqué (masqué) si c'est un CRÉDIT */}
                                {typeAchat !== 'CREDIT' && (
                                    <div style={inputGroup}>
                                        <label style={{...labelStyle, color: header.modeReglement ? '#475569' : '#ef4444'}}>
                                            MOYEN DE RÈGLEMENT *
                                        </label>
                                        <select 
                                            style={{...inputStyle, border: header.modeReglement ? '1px solid #cbd5e1' : '2px solid #ef4444'}} 
                                            value={header.modeReglement} 
                                            onChange={e => setHeader({...header, modeReglement: e.target.value})}
                                        >
                                            <option value="">-- SÉLECTIONNER (CAISSE/BANQUE) --</option>
                                            {paymentMethods
                                                // On nettoie : on garde uniquement les vrais moyens financiers
                                                .filter(m => m.code !== 'CREDIT' && m.code !== 'ACOMPTE')
                                                .map(m => (
                                                    <option key={m.id} value={m.code}>{m.libelle}</option>
                                                ))
                                            }
                                        </select>
                                    </div>
                                )}

                                   {/* 3. CHAMP MONTANT DU RÈGLEMENT */}
                                {typeAchat === 'ACOMPTE' && (
                                    <div style={inputGroup}>
                                        <label style={{...labelStyle, color: '#2563eb'}}>MONTANT DE L'ACOMPTE *</label>
                                        <input 
                                            type="number" 
                                            style={{...inputStyle, border: '2px solid #2563eb', fontWeight: 'bold'}} 
                                            value={header.montantAvance} 
                                            onChange={e => setHeader({...header, montantAvance: e.target.value})} 
                                            placeholder="Saisir le montant payé"
                                        />
                                    </div>
                                )}
                            </div>

                            <div style={saisieActive}>
                                <div style={{ display: 'flex', justifyBetween: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                                    <p style={{fontSize:'12px', fontWeight:'800', color:'#1e3a8a', margin: 0}}>
                                        Article : {selectedArt ? (
                                            <span>
                                                {selectedArt.nom} 
                                                <span style={{
                                                    marginLeft: '8px', 
                                                    padding: '2px 6px', 
                                                    backgroundColor: '#dbeafe', 
                                                    color: '#1e40af', 
                                                    borderRadius: '4px',
                                                    fontSize: '10px'
                                                }}>
                                                    {/* On force l'affichage du libellé ici aussi */}
                                                    {selectedArt.unite_libelle || selectedArt.libelle || "Unité"}
                                                </span>
                                            </span>
                                        ) : "⚠️ Sélectionnez à gauche"}
                                    </p>
                                
                                {/* BOUTON DE BASCULE MODE AUTO / MANUEL */}
                                {regimeTVA === 1 && (
                                    <button 
                                        onClick={() => setIsManualTax(!isManualTax)}
                                        style={{
                                            padding: '4px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                                            fontSize: '10px', fontWeight: '900',
                                            backgroundColor: isManualTax ? '#0f172a' : '#e2e8f0',
                                            color: isManualTax ? '#fff' : '#0f172a'
                                        }}
                                    >
                                        {isManualTax ? "📏 MODE MANUEL (HT/TVA)" : "🤖 MODE AUTO (TTC)"}
                                    </button>
                                )}
                            </div>


                            {/* 🚀 MUTATION CHIRURGICALE DU DOUBLE CHAMP DE QUANTITÉ : EN GROS ET AU DETAIL AVEC MASQUAGE AUTO */}
                            {/* 🚀 ARBORESCENCE GRAPHIQUE ADAPTATIVE : Adapte le nombre de colonnes selon la structure logistique de l'article */}
                            <div style={{ 
                                display: 'grid', 
                                gridTemplateColumns: selectedArt && Number(selectedArt.coefficient || selectedArt.unit_coefficient || 1) > 1 ? '1fr 1fr 1.2fr' : '1fr 1.2fr', 
                                gap: '15px', 
                                marginBottom: '15px', 
                                alignItems: 'end' 
                            }}>
                                
                            {/* 1. CHAMP DE SAISIE EN GROS : Apparaît uniquement si l'article gère le gros (coefficient > 1) */}
                                {selectedArt && Number(selectedArt.coefficient || selectedArt.unit_coefficient || 1) > 1 && (
                                    <div style={{ position: 'relative' }}>
                                        <label style={{ ...labelStyle, display: 'block', marginBottom: '4px', color: '#1e3a8a' }}>EN GROS</label>
                                        <input 
                                            type="text" 
                                            style={{ ...inputStyle, fontWeight: '900', paddingRight: '60px' }} 
                                            value={inputQteGros} 
                                            /* 🎯 REGEX DÉCIMAL CAS 1 : Autorise les décimaux pour le gros et bloque les lettres */
                                            onChange={e => {
                                                let val = e.target.value.replace(',', '.'); 
                                                val = val.replace(/[^0-9.]/g, ''); 
                                                const parties = val.split('.');
                                                if (parties.length > 2) {
                                                    val = parties[0] + '.' + parties.slice(1).join('');
                                                }
                                                setInputQteGros(val);
                                            }} 
                                            placeholder="0"
                                            disabled={!selectedArt} 
                                        />
                                        <span style={{ position: 'absolute', right: '10px', bottom: '8px', color: '#1e40af', fontWeight: '800', fontSize: '10px', background: '#dbeafe', padding: '2px 6px', borderRadius: '4px', border: '1px solid #bfdbfe' }}>
                                            {String(selectedArt.unit_code_gros || selectedArt.unite_code || selectedArt.code || 'CS').toUpperCase()}
                                        </span>
                                    </div>
                                )}


               {/* 2. CHAMP DE SAISIE AU DÉTAIL : Toujours actif, s'étend si le gros est masqué */}
        <div style={{ position: 'relative' }}>
            <label style={{ ...labelStyle, display: 'block', marginBottom: '4px', color: '#1e3a8a' }}>AU DÉTAIL</label>
            <input 
                type="text" 
                style={{ ...inputStyle, fontWeight: '900', paddingRight: '60px' }} 
                value={inputQteDetail} 
                /* 🎯 REGEX DÉCIMAL CAS 2 : Autorise les décimaux pour le détail et bloque les lettres */
                onChange={e => {
                    let val = e.target.value.replace(',', '.'); 
                    val = val.replace(/[^0-9.]/g, ''); 
                    const parties = val.split('.');
                    if (parties.length > 2) {
                        val = parties[0] + '.' + parties.slice(1).join('');
                    }
                    setInputQteDetail(val);
                }} 
                placeholder="0"
                disabled={!selectedArt} 
            />
            {selectedArt && (
                <span style={{ position: 'absolute', right: '10px', bottom: '8px', color: '#1e40af', fontWeight: '800', fontSize: '10px', background: '#dbeafe', padding: '2px 6px', borderRadius: '4px', border: '1px solid #bfdbfe' }}>
                    {String(selectedArt.unit_ref_detail || selectedArt.unite_reference || 'UNITÉ').replace(/\(s\)/g, '').toUpperCase()}
                </span>
            )}
        </div>

        {/* 3. CHAMP DE SAISIE DU MONTANT FINANCIER (HT OU TTC) */}
        {isManualTax ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={labelStyle}>MONTANT HT DIRECT *</label>
                <input 
                    type="number" 
                    style={{...inputStyle, border: '2px solid #2563eb', fontWeight: '900'}} 
                    value={inputHT} 
                    onChange={e => setInputHT(e.target.value)} 
                />
            </div>
        ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={labelStyle}>MONTANT TTC FACTURÉ *</label>
                <input 
                    type="number" 
                    style={{ ...inputStyle, fontWeight: '900' }} 
                    value={inputMontant} 
                    onChange={e => setInputMontant(e.target.value)} 
                    disabled={!selectedArt} 
                />
            </div>
        )}
    </div>


    {/* 🛡️ TAMPON DE COMPATIBILITÉ INVISIBLE POUR EMPECHER TOUTE RUPTURE DE FLUX */}
    <input type="hidden" value={inputQte} />

   {/* LIGNE 2 : TVA (Si mode manuel) OU OBSERVATION */}
    <div style={formGrid}>
        {isManualTax ? (
            <>
                <div style={inputGroup}>
                    <label style={labelStyle}>MONTANT TVA DIRECT *</label>
                    <input 
                        type="number" 
                        style={{...inputStyle, border: '2px solid #2563eb'}} 
                        value={inputTVA} 
                        onChange={e => setInputTVA(e.target.value)} 
                    />
                </div>
                <div style={inputGroup}>
                    <label style={labelStyle}>TOTAL TTC CALCULÉ</label>
                    <div style={{...inputStyle, background: '#f8fafc', color: '#1e3a8a', display: 'flex', alignItems: 'center'}}>
                        {fmt(Number(inputHT) + Number(inputTVA))} F
                    </div>
                </div>
            </>
        ) : (
            <div style={{...inputGroup, gridColumn: 'span 2'}}>
                <label style={labelStyle}>OBSERVATION</label>
                <input style={inputStyle} value={inputObs} onChange={e => setInputObs(e.target.value)} placeholder="Note particulière..." disabled={!selectedArt} />
            </div>
        )}
    </div>

    {/* SI MODE MANUEL, ON REPLACERA L'OBSERVATION EN DESSOUS */}
    {isManualTax && (
        <div style={inputGroup}>
            <label style={labelStyle}>OBSERVATION</label>
            <input style={inputStyle} value={inputObs} onChange={e => setInputObs(e.target.value)} placeholder="Note particulière..." disabled={!selectedArt} />
        </div>
    )}


                                {/* PRÉVISUALISATION RENTABILITÉ IMMUNISÉE CONTRE LES NaN */}
                            {(() => {
                                if (!selectedArt) return null;
                                
                                const gN = String(inputQteGros || '').replace(',', '.').trim();
                                const dN = String(inputQteDetail || '').replace(',', '.').trim();
                                const qG = parseFloat(gN) || 0;
                                const qD = parseFloat(dN) || 0;
                                const coeff = Number(selectedArt.coefficient || selectedArt.unit_coefficient || 1);

                                let piecesTotales = Math.round(qG * coeff) + Math.round(qD);
                                if (piecesTotales === 0) {
                                    piecesTotales = Math.round((parseFloat(String(inputQte || '1')) || 0) * coeff);
                                }

                                const volumeDecimalGros = piecesTotales / coeff;
                                const prixEvalue = isManualTax ? inputHT : inputMontant;

                                if (volumeDecimalGros <= 0 || !prixEvalue) return null;

                                const paUnitGros = (isManualTax ? Number(inputHT) : (regimeTVA === 1 && isTVAApplicable ? Number(inputMontant)/1.18 : Number(inputMontant))) / volumeDecimalGros;
                                const margeBruteGros = Number(selectedArt.prixVente) - (isManualTax ? Number(inputHT)/volumeDecimalGros : (regimeTVA === 1 && isTVAApplicable ? Number(inputMontant)/1.18/volumeDecimalGros : Number(inputMontant)/volumeDecimalGros));

                                return (
                                    <div style={{ marginTop: '10px', padding: '10px', borderRadius: '8px', background: '#fff', border: '1px dashed #cbd5e1' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: '700' }}>
                                            <span>P.A. Moyen Équiv. Gros : <strong>{fmt(paUnitGros)} F</strong></span>
                                            <span>Marge brute (Gros) : 
                                                <strong style={{ marginLeft: '5px', color: margeBruteGros < 0 ? '#ef4444' : '#10b981' }}>
                                                    {fmt(margeBruteGros)} F
                                                </strong>
                                            </span>
                                        </div>
                                    </div>
                                );
                            })()}

                           <button 
                                style={{...btnAdd, marginTop: '15px', opacity: isLocked ? 0.5 : 1}} 
                                onClick={isLocked ? null : ajouterAuBordereau} 
                                disabled={!selectedArt || isLocked}
                            >
                                {isLocked ? "BLOQUÉ" : (editingId ? "METTRE À JOUR" : "AJOUTER AU PANIER")}
                            </button>
                        </div>
                    </div>
                </div>

                {/* TABLEAU BORDEREAU */}
                <div style={{ ...cardStyle, marginTop: '30px', padding: '0', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                    <div style={{ width: '100%', overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: '12px', minWidth: '900px' }}>
                            {/* EN-TÊTE FIXE */}
                            <thead style={{ 
                                display: 'table', 
                                width: '100%', 
                                tableLayout: 'fixed',
                                backgroundColor: '#f8fafc', 
                                zIndex: 20, 
                                boxShadow: '0 1px 2px rgba(0,0,0,0.1)' 
                            }}>
                                <tr style={{ height: '40px' }}>
                                    <th style={{ ...thStyle, textAlign: 'left', padding: '8px', width: '180px' }}>ARTICLE</th>
                                    <th style={{ ...thCenter, width: '90px' }}>STK.</th>
                                    <th style={{ ...thCenter, width: '100px' }}>QTE.</th>
                                    <th style={{ ...thCenter, width: '80px' }}>PRICE A.</th>
                                    <th style={{ ...thCenter, width: '90px' }}>MT CMP</th>
                                    {regimeTVA === 1 && <th style={{ ...thCenter, width: '90px' }}>MT HT</th>}
                                    {regimeTVA === 1 && <th style={{ ...thCenter, width: '90px' }}>TVA</th>}
                                    <th style={{ ...thCenter, width: '100px' }}>MT TTC</th>
                                    <th style={{ ...thCenter, width: '70px' }}>ÉCART</th>
                                    <th style={{ ...thCenter, width: '80px' }}>ACTION</th>
                                </tr>
                            </thead>

           {/* CORPS DU PANIER AVEC SCROLL INTERNE IMMUNISÉ */}
            <tbody style={{ 
                display: 'block', 
                maxHeight: '320px', // Hauteur pour environ 8 lignes
                overflowY: panier.length > 0 ? 'scroll' : 'hidden', 
                width: '100%' 
            }}>
                {panier.length === 0 ? (
                    <tr style={{ display: 'table', width: '100%', tableLayout: 'fixed' }}>
                        <td colSpan={regimeTVA === 1 ? 10 : 8} style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                            Bordereau de facture actuellement vide.
                        </td>
                    </tr>
                ) : panier.map((line) => (
                    <tr key={line.id_achat} style={{ 
                        display: 'table', 
                        width: '100%', 
                        tableLayout: 'fixed', 
                        borderBottom: '1px solid #f1f5f9', 
                        height: '40px' 
                    }}>
                        <td style={{ ...tdBorder, padding: '8px', width: '180px', fontWeight: '600', color: '#1e293b' }}>
                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {line.nom_article}
                            </div>
                        </td>
                        
                        {/* 🚀 EXTRACTEUR DU STOCK AVANT : Utilise directement la logique stable et héritée de fmtStock */}
                        <td style={{ ...centerText, width: '90px', color: '#475569', fontWeight: '600', fontSize: '11px' }}>
                            {typeof line.stock_avant === 'string' ? line.stock_avant : fmtStock({ stock_actuel: line.stock_avant, coefficient: line.unit_coefficient, unit_code_gros: line.unit_code_gros, unit_ref_detail: line.unit_ref_detail })}
                        </td>
                        
                        {/* 🚀 AFFICHAGE LOGISTIQUE PARFAIT, FLUIDE ET UNIFORME DE LA QUANTITÉ ACHETÉE (ex: "10 CS + 2 PCS") */}
                        <td style={{ ...qteCell, width: '100px', fontWeight: '800', color: '#1d4ed8', textAlign: 'center', fontSize: '11px', whiteSpace: 'nowrap' }}>
                            {/* 🎯 FIX ABSOLU : Lecture directe de la chaîne textuelle déjà formatée sans aucun filtre fantaisiste */}
                            {line.qte_achetee || "—"}
                        </td>
                        
                        <td style={{ ...centerText, width: '80px' }}>{fmt(line.cmp_ancien)}</td>
                        <td style={{ ...centerText, width: '90px' }}>{fmt(line.montant_cmp_ancien)}</td>
                        {regimeTVA === 1 && <td style={{ ...centerText, width: '90px' }}>{fmt(line.montant_ht_ligne)}</td>}
                        {regimeTVA === 1 && <td style={{ ...centerText, width: '90px', color: '#64748b' }}>{fmt(line.montant_tva_ligne)}</td>}
                        <td style={{ ...factureCell, width: '100px', fontWeight: '700' }}>{fmt(line.montant_facture_ligne)}</td>
                        <td style={{ ...centerText, width: '70px' }}>
                            <span style={{ ...ecartStyle(line.ecart), fontSize: '11px' }}>{fmt(line.ecart)}</span>
                        </td>
                        <td style={{ padding: '4px', textAlign: 'center', width: '80px' }}>
                            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                                <button 
                                    style={{ ...btnIconEdit, padding: '4px' }} 
                                    onClick={() => chargerPourEdition(line)}
                                    title="Modifier la ligne"
                                >
                                    <Edit3 size={14} />
                                </button>
                                <button style={{ ...btnIconDel, padding: '4px' }} onClick={() => setPanier(panier.filter(p => p.id_achat !== line.id_achat))} title="Supprimer la ligne"><Trash2 size={14} /></button>
                            </div>
                        </td>
                    </tr>
                ))}
                <tr ref={panierEndRef} style={{ height: 0 }}><td colSpan="10" style={{ padding: 0 }}></td></tr>
            </tbody>

      {/* PIED DE PAGE FIXE */}
            <tfoot style={{ 
                display: 'table', 
                width: '100%', 
                tableLayout: 'fixed',
                background: '#f8fafc', 
                borderTop: '2px solid #cbd5e1' 
            }}>
                <tr style={{ height: '40px', fontWeight: '800' }}>
                    <td style={{ width: '180px', textAlign: 'right', paddingRight: '10px' }}>TOTAL</td>
                    <td style={{ width: '90px' }}></td>
                    {/* 🚀 TOTAL LOGISTIQUE SÉCURISÉ : On affiche un tiret car additionner des unités différentes fausserait le calcul */}
                    <td style={{ ...centerText, width: '100px', color: '#64748b', fontWeight: '700' }}>-</td>
                    <td style={{ width: '80px' }}></td>
                    <td style={{ ...centerText, width: '90px' }}>{fmt(totaux.mtCmp)}</td>
                    {regimeTVA === 1 && (
                        <>
                            <td style={{ ...centerText, width: '90px', color: '#1e40af' }}>{fmt(totaux.mtHT)}</td>
                            <td style={{ ...centerText, width: '90px', color: '#64748b' }}>{fmt(totaux.mtTVA)}</td>
                        </>
                    )}
                    <td style={{ ...factureCell, width: '100px' }}>{fmt(totaux.mtFac)}</td>
                    <td style={{ ...centerText, width: '70px', ...ecartTotalStyle(totaux.ecart) }}>{fmt(totaux.ecart)}</td>
                    <td style={{ width: '80px' }}></td>
                </tr>
            </tfoot>
        </table>
    </div>
</div>

                </div>
            </main>
        </div>
    );
};


// =========================================================================
// 🎨 STYLES DE CONFORMITÉ GRAPHIQUE RESTAURÉS (LIAISON LOGISTIQUE ELECTRON)
// =========================================================================
const layoutStyle = { display: 'flex', height: '100vh', background: '#f1f5f9' };
const mainStyle = { flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' };
const headerBarStyle = { background: '#fff', padding: '15px 30px', borderBottom: '2px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 100 };
const iconBox = { background: '#0f172a', padding: '10px', borderRadius: '12px' };
const titleStyle = { margin: 0, fontSize: '20px', fontWeight: '900', color: '#000' };
const subtitleStyle = { margin: 0, fontSize: '14px', color: '#475569', fontWeight: '700' };
const contentArea = { padding: '25px' };
const topGrid = { display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '25px' };
const cardStyle = { background: '#fff', borderRadius: '16px', border: '1px solid #cbd5e1', padding: '20px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' };
const cardTitle = { fontSize: '14px', fontWeight: '900', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '10px', color: '#0f172a' };
const searchBox = { display: 'flex', gap: '10px', marginBottom: '15px' };
const searchInput = { width: '100%', padding: '10px 10px 10px 38px', borderRadius: '10px', border: '1px solid #94a3b8', fontSize: '13px', fontWeight: '700' };
const iconInside = { position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#475569' };
const tableMini = { width: '100%', borderCollapse: 'collapse' };
const rowSelectStyle = { cursor: 'pointer', transition: 'all 0.1s', borderBottom: '1px solid #e2e8f0' };
const tdMini = { padding: '12px 10px', fontSize: '13px' };
const thMiniBorder = { padding: '12px 10px', background: '#f8fafc', color: '#0f172a', fontSize: '11px', textAlign: 'left', fontWeight: '900' };
const tdBorder = { padding: '12px 15px', borderBottom: '1px solid #e2e8f0', fontSize: '13px' };
const thStyle = { padding: '14px 15px', background: '#0f172a', color: '#fff', fontSize: '11px', textAlign: 'left', fontWeight: '900' };
const centerText = { textAlign: 'center' };
const stockBadge = { background: '#0f172a', padding: '4px 10px', borderRadius: '6px', fontWeight: '900', color: '#fff', fontSize: '11px' };
const thCenter = { ...thStyle, textAlign: 'center' };
const rowTableStyle = { background: '#fff' };
const qteCell = { textAlign: 'center', fontWeight: '700', background: '#f8fafc' };
const factureCell = { textAlign: 'center', fontWeight: '800', color: '#1d4ed8', background: '#eff6ff' };
const smallId = { fontSize: '11px', color: '#64748b', fontFamily: 'monospace' };
const formGrid = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' };
const inputGroup = { marginBottom: '10px' };
const labelStyle = { fontSize: '11px', fontWeight: '800', color: '#475569', marginBottom: '5px', display: 'block' };
const inputStyle = { width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: '700' };
const saisieActive = { marginTop: '10px', padding: '15px', borderRadius: '12px', background: '#f1f5f9', border: '1px solid #e2e8f0' };
const btnAdd = { width: '100%', padding: '12px', borderRadius: '10px', border: 'none', background: '#2563eb', color: '#fff', fontWeight: '800', cursor: 'pointer' };
const btnSave = { padding: '12px 20px', borderRadius: '10px', border: 'none', background: '#10b981', color: '#fff', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' };
const btnReset = { padding: '12px 20px', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#fff', color: '#ef4444', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' };
const tableHeader = { padding: '15px 20px', background: '#f8fafc', borderBottom: '2px solid #e2e8f0' };
const btnIconEdit = { background: '#dbeafe', color: '#2563eb', border: 'none', padding: '6px', borderRadius: '6px', cursor: 'pointer' };
const btnIconDel = { background: '#fee2e2', color: '#ef4444', border: 'none', padding: '6px', borderRadius: '6px', cursor: 'pointer' };

const ecartStyle = (val) => ({ 
    padding: '3px 8px', 
    borderRadius: '4px', 
    fontSize: '11px', 
    fontWeight: '800', 
    background: val >= 0 ? '#d1fae5' : '#fee2e2', 
    color: val >= 0 ? '#059669' : '#ef4444' 
});

const ecartTotalStyle = (val) => ({ 
    background: val >= 0 ? '#d1fae5' : '#fee2e2', 
    color: val >= 0 ? '#059669' : '#ef4444' 
});

const cardStyleCustom = { 
    ...cardStyle, 
    height: '100%', 
    display: 'flex', 
    flexDirection: 'column', 
    marginBottom: 0,
    padding: '20px 15px'
};

const rowSelectedStyle = {
    background: '#0f4d8b', 
    borderLeft: '4px solid #517ab3', 
    cursor: 'pointer'
};

const scrollList = { 
    flex: 1, 
    overflowY: 'auto', 
    borderRadius: '10px', 
    border: '1px solid #cbd5e1',
    background: '#fff'
};

export default Approvisionnement;
