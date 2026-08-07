import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Search, Barcode, User, CheckCircle, RefreshCw, Plus, Trash2, Edit2 } from 'lucide-react';
// 🎯 ENTIÈREMENT ALIGNÉ SUR VOS AUTRES PAGES POUR UTILISER LE MOTEUR D'IMPRESSION COMPTABLE DE L'ERP
import { useReactToPrint } from 'react-to-print';
import API from '../../services/api';
import Sidebar from '../../components/Sidebar';
import { ConversionStockService } from '../../utils/converisonstock';
// 🎯 AJOUT STRICT ET EXCLUSIF DES IMPORTS NÉCESSAIRES (useNavigate pour corriger l'erreur de console)
import { useSearchParams, useNavigate } from 'react-router-dom';
import TournerPrint from './tournerprint'; 

const GrilleTourneeCommercialeUnique = () => {
    const navigate = useNavigate(); // 🎯 DÉCLARATION POUR CORRIGER L'ERREUR DE CONSOLE
    const currentUser = useMemo(() => JSON.parse(localStorage.getItem('user') || '{}'), []);
    const COMPANY_ID = currentUser.company_id || 'CPY-1';
    const [companyInfo, setCompanyInfo] = useState({ name: 'LEDI EXPERT', logo_data: null })
    const USER_ID = currentUser.id || 'USR-1';
    const userName = currentUser.username || 'Utilisateur';
    const [searchParams, setSearchParams] = useSearchParams();
    const lotIdAEditer = useMemo(() => searchParams.get('edit'), [searchParams]);
    const isModeEvening = useMemo(() => searchParams.get('mode') === 'evening', [searchParams]);
    const isModeEdition = useMemo(() => !!lotIdAEditer, [lotIdAEditer]);
    const [articles, setArticles] = useState([]);
    const [allStaff, setAllStaff] = useState([]);
    const [selectedStaffId, setSelectedStaffId] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [searchBarCode, setSearchBarCode] = useState('');

    // 🚀 AJOUT DES ÉTATS MAÎTRES POUR LA SÉLECTION DU CLIENT LE SOIR
    const [customers, setCustomers] = useState([]);
    const [selectedCustomerId, setSelectedCustomerId] = useState('');

    // 🎯 SUIVI DE L'ARTICLE EN COURS DE SÉLECTION/SAISIE VISUELLE (EFFET DE LIGNE ACTIVE)
    const [activeRowId, setActiveRowId] = useState('');

    // 🎯 ÉTAT REQUIS POUR LE SYSTÈME DE MODIFICATION DIRECTE DE LIGNE DANS LE PANIER
    const [editingProductId, setEditingProductId] = useState(null);

    // 🎯 POINT D'ANCRAGE VIRTUEL UNIQUE POUR EXTRAIRE LE BLOC DE LA FEUILLE OHADA SANS LITIGE
    const componentRef = useRef(null);
    
    // 🎯 RÉFÉRENCE DE RECHERCHE POUR LE SYSTÈME DE FOCUS AUTOMATIQUE APRES CHARGEMENT
    const searchInputRef = useRef(null);

    // 🎯 INVOCATION DU GESTIONNAIRE COMPTABLE D'IMPRESSION COUPLÉ ON VOS AUTRES PAGES FACTURES
    const handlePrint = useReactToPrint({
        content: () => componentRef.current,
        onAfterPrint: () => setDonneesVenteAImprimer(null)
    });
    // 🚀 ALIGNEMENT STRICT SUR VOS AUTRES PAGES POUR LE MOTEUR COMPTABLE
    const [dynamiqueCompanyPrint, setDynamiqueCompanyPrint] = useState({
        name: "LEDI EXPERT PRO",
        address: "Adresse non renseignée",
        phone: "Tél: N/A",
        email: "Email: N/A",
        logo_data: null
    });

    // 🎯 RECONSTRUCTION DU GÉNÉRATEUR UNIQUE ANTI-BLOCAGE DU NUMÉRO DE TOURNÉE LE MATIN
    const genererNouveauTourId = useCallback(() => {
        const timestampPart = Date.now().toString().slice(-4);
        const randomPart = Math.floor(10 + Math.random() * 90); 
        return `TOUR-${timestampPart}${randomPart}`;
    }, []);

    const [currentTourId, setCurrentTourId] = useState(() => {
        if (new URLSearchParams(window.location.search).get('edit')) return 'TOUR-CHARGE';
        return `TOUR-${Date.now().toString().slice(-4)}${Math.floor(10 + Math.random() * 90)}`;
    });

    const [loading, setLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [alertMsg, setAlertMsg] = useState({ text: '', type: '' });
    const [paymentMethods, setPaymentMethods] = useState([]);
    
    // 🚯 APPLIQUÉ SUR L'ÉDITION DU SOIR : INITIALISATION VIE SANS PRÉ-SÉLECTION
    const [selectedMethodId, setSelectedMethodId] = useState('');
    const [formatImpression, setFormatImpression] = useState(''); // Chaîne vide pour casser la pré-sélection 'NONE'
    
    const [donneesVenteAImprimer, setDonneesVenteAImprimer] = useState(null);
    const [panierTournee, setPanierTournee] = useState(() => {
        if (new URLSearchParams(window.location.search).get('edit')) return [];
        
        const backup = localStorage.getItem(`tournee_backup_${USER_ID}`);
        return backup ? JSON.parse(backup) : [];
    });
    const [saisiesDepartGros, setSaisiesDepartGros] = useState({});   
    const [saisiesDepartDetail, setSaisiesDepartDetail] = useState({}); 
    
    // 🎯 FIX CHIRURGICAL ET PERSISTANT : RÉCUPÉRATION DES SAISIES DE RETOUR DEPUIS LE STORAGE DE SECOURS
    const [saisiesRetourGros, setSaisiesRetourGros] = useState(() => {
        const backup = localStorage.getItem(`tournee_retour_gros_backup_${USER_ID}`);
        return backup ? JSON.parse(backup) : {};
    });           
    const [saisiesRetourDetail, setSaisiesRetourDetail] = useState(() => {
        const backup = localStorage.getItem(`tournee_retour_detail_backup_${USER_ID}`);
        return backup ? JSON.parse(backup) : {};
    });           

    // =========================================================================
    // 🛡️ RECTIFICATION TARIFAIRE DE SÉCURITÉ : VRAI CALCUL DE LA VALEUR TOTALE
    // =========================================================================
    const montantChargement = useMemo(() => {
        return panierTournee.reduce((sum, item) => {
            // Extraction stricte et sécurisée de la propriété finale calculée de la ligne
            const totalLigneNet = Number(item.total_ttc_net || item.total_net || item.montant || 0);
            return sum + totalLigneNet;
        }, 0);
    }, [panierTournee]);

    // =========================================================================
    // 📦 REGROUPEMENT STRUCTURÉ ET UNITAIRE DU RÉSUMÉ GLOBAL SANS MÉLANGE
    // =========================================================================
    const resumeGlobalUnitaire = useMemo(() => {
        const dictionnaireUnites = {};

        panierTournee.forEach((item) => {
            // Extraction sécurisée des unités de mesure définies sur l'article
            const designationGros = (item.u_gros || item.unite_gros || 'CS2').trim();
            const designationDetail = (item.u_detail || item.unite_detail || 'BTS').trim();

            const coefficient = Math.max(1, Number(item.coeff || item.coefficient || 1));
            const totalPieces = Math.abs(Number(item.qte_chargee_pieces || item.quantite_depart || 0));

            // Conversion des pièces natives vers la structure Gros + Détail
            const nombreGros = Math.floor(totalPieces / coefficient);
            const nombreDetail = totalPieces % coefficient;

            // Incrémentation et regroupement strict par type d'unité de Gros
            if (nombreGros > 0) {
                dictionnaireUnites[designationGros] = (dictionnaireUnites[designationGros] || 0) + nombreGros;
            }
            // Incrémentation et regroupement strict par type d'unité de Détail
            if (nombreDetail > 0) {
                dictionnaireUnites[designationDetail] = (dictionnaireUnites[designationDetail] || 0) + nombreDetail;
            }
        });

        // Transformation en chaîne textuelle segmentée et propre
        const segmentsTexte = Object.entries(dictionnaireUnites).map(([unite, quantiteTotal]) => {
            return `${quantiteTotal} ${unite}`;
        });

        return segmentsTexte.length > 0 ? segmentsTexte.join(' + ') : 'Aucun article';
    }, [panierTournee]);

    // 📊 LOGISTIQUE COMPTABLE : Résumé global dynamique par couple d'unités exact sans mélange (CS et CS2 séparés)
      // 📊 LOGISTIQUE COMPTABLE : Résumé global dynamique par couple d'unités exact sans mélange (CS et CS2 séparés)
    const recapUnites = useMemo(() => {
        const couplesLogistiques = {};

        panierTournee.forEach(item => {
            const ratio = Math.max(1, Number(item.coeff || item.coefficient || 1));
            // 🎯 RECTIFICATION DIRECTE : Récupération basée sur le montant calculé de la ligne pour rester synchrone
            const totalPiecesNatives = Math.abs(Number(item.qte_chargee_pieces || item.quantite_depart || 0));

            // 🟢 CORRECTIF CHIRURGICAL : Lecture des clés du matin ET du soir pour éviter le fallback par défaut
            const labelGros = String(item.unit_code_gros || item.unite_gros || item.u_gros || 'CS').toUpperCase().trim();
            const labelDetail = String(item.unit_ref_detail || item.unite_detail || item.u_detail || item.unite || 'BTS').toUpperCase().trim();

            // Clé unique qui isole désormais strictement CS de CS2 dès le matin !
            const cleCouple = `${labelGros}-${labelDetail}`;

            if (!couplesLogistiques[cleCouple]) {
                couplesLogistiques[cleCouple] = {
                    totalPieces: 0,
                    ratio: ratio,
                    grosLabel: labelGros,
                    detailLabel: labelDetail
                };
            }
            couplesLogistiques[cleCouple].totalPieces += totalPiecesNatives;
        });

        // Reconstruction d'un tableau d'objets nettoyé pour votre interface
 return Object.keys(couplesLogistiques).map(cle => {
            const group = couplesLogistiques[cle];
            const cartonsFinaux = Math.floor(group.totalPieces / group.ratio);
            const bouteillesFinelles = Math.round(group.totalPieces % group.ratio);

            let expressionAssociee = "";
            
            // 🎯 CORRECTIF VISUEL : Si l'article possède un ratio de gros (ex: 24, 12 ou 15)
            // On force TOUJOURS le format complet "X Gros + Y Détail", même si cartonsFinaux vaut 0
            if (group.ratio > 1) {
                expressionAssociee = `${cartonsFinaux} ${group.grosLabel} + ${bouteillesFinelles} ${group.detailLabel}`;
            } else {
                // Uniquement pour les articles vendus strictement à l'unité sans conditionnement de gros
                expressionAssociee = `${bouteillesFinelles} ${group.detailLabel}`;
            }

            return {
                unite: expressionAssociee
            };
        });
    }, [panierTournee]);



    // Système Toast propre intégré (Zéro window.alert)
    const showToast = useCallback((text, type = 'success') => {
        setAlertMsg({ text, type });
        setTimeout(() => setAlertMsg({ text: '', type: '' }), 3000);
    }, []);

    // 🔒 WATCHER DE SÉCURITÉ : Persiste le panier et TOUTES les saisies de retour à la moindre frappe clavier
    useEffect(() => {
        if (!lotIdAEditer) {
            localStorage.setItem(`tournee_backup_${USER_ID}`, JSON.stringify(panierTournee));
            localStorage.setItem(`tournee_retour_gros_backup_${USER_ID}`, JSON.stringify(saisiesRetourGros));
            localStorage.setItem(`tournee_retour_detail_backup_${USER_ID}`, JSON.stringify(saisiesRetourDetail));
        }
    }, [panierTournee, saisiesRetourGros, saisiesRetourDetail, USER_ID, lotIdAEditer]);


  // --- 🎯 CHARGEMENT DU CATALOGUE, DES COMMERCIAUX, DU PLAN COMPTABLE ET DES CLIENTS ---
    const fetchInitialData = useCallback(async () => {
        setLoading(true);
        try {
            const [resProd, resStaff, resPayments, resCustomers] = await Promise.all([
                API.get('/products'),
                API.get('/staff'),
                API.get('/plan-comptable/paiements/methodes'),
                API.get('/customers') // 🚀 CHARGEMENT DES CLIENTS DE L'ENTREPRISE
            ]);
            
            setArticles(Array.isArray(resProd.data) ? resProd.data : []);
            setAllStaff(Array.isArray(resStaff.data) ? resStaff.data : []);
            setCustomers(Array.isArray(resCustomers.data) ? resCustomers.data : (resCustomers.data?.data || []));
            
            const modesRecus = resPayments?.data;
            let modesPaiements = [];

            if (Array.isArray(modesRecus)) {
                modesPaiements = modesRecus;
            } else if (modesRecus && Array.isArray(modesRecus.data)) {
                modesPaiements = modesRecus.data; 
            }

            setPaymentMethods(modesPaiements);
            
            // 🚯 NE PAS PRÉ-SÉLECTIONNER SI ON EST EN MODE DE RETOUR DU SOIR POUR FORCER LE CHOIX
            if (isModeEvening) {
                setSelectedMethodId('');
                setFormatImpression('');
            } else if (modesPaiements.length > 0) {
                const modeDefaut = modesPaiements[0];
                setSelectedMethodId(String(modeDefaut.id || modeDefaut._id || '').trim());
                setFormatImpression('NONE');
            }
        } catch (err) {
            console.error("Erreur chargement données catalogue/staff/paiements/clients:", err);
            showToast("Impossible de charger les données initiales", "error");
        } finally {
            setLoading(false);
        }
    }, [showToast, isModeEvening]);

    useEffect(() => {
        fetchInitialData();
    }, [fetchInitialData]);


 const chargerTourneePourDecompte = useCallback(async (lotId) => {
    if (!lotId) return;
    try {
        setLoading(true);
        setPanierTournee([]);
        
        // 🚯 VERROUILLAGE SÉLECTION : Forcer le choix vide sur le moyen de paiement et format d'impression le soir
        if (isModeEvening) {
            setSelectedMethodId('');
            setFormatImpression('');
        }
        
        // 🔒 BLINDAGE ANTI-EFFACEMENT : On vérifie si la machine possède un reliquat de saisie locale non validé
        const localGrosBackup = localStorage.getItem(`tournee_retour_gros_backup_${USER_ID}`);
        const localDetailBackup = localStorage.getItem(`tournee_retour_detail_backup_${USER_ID}`);
        
        const backupGrosExiste = localGrosBackup ? JSON.parse(localGrosBackup) : null;
        const backupDetailExiste = localDetailBackup ? JSON.parse(localDetailBackup) : null;

        setCurrentTourId(lotId);

        // 🚀 APPEL API DES DÉTAILS DE LA TOURNÉE COMMERCIALE
        const res = await API.get(`/provisional-sales/commercial/details/${lotId}`);
        
        if (res.data && Array.isArray(res.data) && res.data.length > 0) {
            const mapRetoursGrosExistants = {};
            const mapRetoursDetailExistants = {};

            const lignesAdaptees = res.data.map(item => {
                // 🎯 SÉCURISATION DU COEFFICIENT LOGISTIQUE DEPUIS L'API
                const trueCoeff = Math.abs(Number(item.unit_coefficient || item.coefficient || item.coeff || 1)) || 1;
                const qtePiecesDepart = Math.abs(Number(item.quantite || 0));
                const pId = String(item.product_id).trim();

                // 🎯 EXTRACTION SÉCURISÉE DES LIBELLÉS LOGISTIQUES REÇUS DU BACKEND
                const codeGros = String(item.unit_code_gros || item.unite_code || item.code_gros || 'CS').toUpperCase().trim();
                const refDetail = String(item.unit_ref_detail || item.unite_reference || item.unite_detail || 'PCS').toUpperCase().trim();
                
                // 1. Initialisation par défaut basée sur l'API ou le LocalStorage rescapé d'un crash
                if (backupGrosExiste && backupGrosExiste[pId] !== undefined) {
                    mapRetoursGrosExistants[pId] = backupGrosExiste[pId];
                } else {
                    mapRetoursGrosExistants[pId] = '';
                }

                if (backupDetailExiste && backupDetailExiste[pId] !== undefined) {
                    mapRetoursDetailExistants[pId] = backupDetailExiste[pId];
                } else {
                    mapRetoursDetailExistants[pId] = '';
                }

                // 2. Si aucun backup en mémoire locale ET que le serveur possède déjà une saisie antérieure enregistrée
                const aUneSaisieBDEffective = item.quantite_retour !== undefined && item.quantite_retour !== null && item.quantite_retour !== '';
                const aPasDeBackupLocal = (!backupGrosExiste || Object.keys(backupGrosExiste).length === 0);

                if (aUneSaisieBDEffective && aPasDeBackupLocal) {
                    const totalRetourPieces = Math.abs(Number(item.quantite_retour || 0));
                    if (trueCoeff > 1) {
                        const grosEntiers = Math.floor(totalRetourPieces / trueCoeff);
                        const restesDetail = totalRetourPieces % trueCoeff;
                        mapRetoursGrosExistants[pId] = grosEntiers > 0 ? String(grosEntiers) : '';
                        mapRetoursDetailExistants[pId] = restesDetail > 0 ? String(restesDetail) : '';
                    } else {
                        mapRetoursGrosExistants[pId] = '';
                        mapRetoursDetailExistants[pId] = String(totalRetourPieces);
                    }
                }

                // 🎯 CALCUL COMPTABLE CORRECT DE LA LIGNE POUR ALIGNEMENT SANS ERREUR
                // Permet de s'assurer que item.total_ttc_net est calculé correctement dès le chargement de l'API
                const prixU = Math.abs(Number(item.prix_vente_unitaire || item.prix_unitaire || 0));
                const totalCalculerLigne = qtePiecesDepart * prixU;

                // 🎯 CONSERVATION STRICTE DE TOUT L'OBJET COMPLÈTE POUR LE MOTEUR CONVERSIONSTOCKSERVICE
                return {
                    id: item.id, 
                    product_id: pId,
                    nom_article_snap: String(item.nom_article_snap || item.nom_article || '').toUpperCase(),
                    nom: String(item.nom_article_snap || item.nom_article || '').toUpperCase(),
                    prix_vente_unitaire: prixU,
                    prix_vente: prixU * trueCoeff,
                    coeff: trueCoeff,
                    coefficient: trueCoeff,
                    quantite_depart: qtePiecesDepart,
                    quantite: qtePiecesDepart, // Clé de secours d'alignement pour calcul général
                    qte_chargee_pieces: qtePiecesDepart,
                    expression_charge: item.quantite_formatee || `${qtePiecesDepart} PCS`,
                    isFromDatabase: true,
                    id_vente: item.id_vente || null,
                    
                    // 📦 CLÉS HARMONISÉES POUR LE CALCULATEUR DE RÉSUMÉ ET DE VALEUR FINANCIÈRE
                    total_ttc_net: item.total_ttc_net !== undefined ? Number(item.total_ttc_net) : totalCalculerLigne,
                    unite_gros: codeGros,
                    unite_detail: refDetail,
                    unit_code_gros: codeGros,
                    unit_ref_detail: refDetail,
                    ratio_conversion: trueCoeff,
                    
                    article_complet: {
                        ...item,
                        id: pId,
                        coefficient: trueCoeff,
                        unit_coefficient: trueCoeff,
                        unit_code_gros: codeGros,
                        unit_ref_detail: refDetail,
                        unite_reference: refDetail
                    }
                };
            });

                      setPanierTournee(lignesAdaptees);
            setSaisiesRetourGros(mapRetoursGrosExistants);
            setSaisiesRetourDetail(mapRetoursDetailExistants);

            // 🚀 AUTO-SÉLECTION COMPTABLE : Commercial & Client associés depuis SQLite
            const premierArticle = res.data[0];
            if (premierArticle) {
                if (premierArticle.staff_id) {
                    setSelectedStaffId(String(premierArticle.staff_id));
                }
            }
            // 🎯 FORCE LE SELECTEUR DU SOIR SUR LE CHOIX VIDE : ACCORDÉ À VOTRE VERROU DE SÉCURITÉ
            setSelectedCustomerId(''); 

            showToast(`📦 Tournée ${lotId} récupérée correctement !`, "success");
        } else {
            setPanierTournee([]);
            showToast("Aucun article trouvé pour cette tournée.", "error");
        }
    } catch (err) {
        console.error("Erreur chargement tournée :", err);
        showToast("Impossible de charger les articles de cette tournée", "error");
    } finally {
        setLoading(false);
    }
}, [showToast, USER_ID, isModeEvening]);


       // =========================================================================
    // 🔒 VERROU ANTI-EFFACEMENT DE SÉCURITÉ SUR LE CHARGEMENT DES COMPTES
    // =========================================================================
    useEffect(() => {
        if (lotIdAEditer) {
            // On ne vide plus brutalement le panier pour éviter l'effet flash en cas de micro-rechargement
            chargerTourneePourDecompte(lotIdAEditer);
        } else {
            // Mode création de tournée le matin : on tente de restaurer la session locale rescapée d'un crash
            const backup = localStorage.getItem(`tournee_backup_${USER_ID}`);
            if (backup) {
                setPanierTournee(JSON.parse(backup));
            } else {
                setPanierTournee([]);
            }
        }
    }, [lotIdAEditer, USER_ID, chargerTourneePourDecompte]);

const handleAjouterAuPanier = (art) => {
        const idOptions = [
            art.id, 
            art._id, 
            art.id_article, 
            art.product_id, 
            art.designation, 
            art.designation_article
        ];
        
        let grosSaisi = '';
        let detailSaisi = '';
        let articleId = null;

        for (const option of idOptions) {
            if (option !== undefined && option !== null) {
                const cleanKey = String(option).trim();
                
                if (saisiesDepartGros[cleanKey] || saisiesDepartDetail[cleanKey]) {
                    grosSaisi = saisiesDepartGros[cleanKey] || '';
                    detailSaisi = saisiesDepartDetail[cleanKey] || '';
                    articleId = cleanKey;
                    break; 
                }
            }
        }

        if (!articleId) {
            const rawId = art.id || art._id || art.id_article || art.product_id;
            articleId = rawId ? String(rawId).trim() : null;
        }

        // 🎯 CAPTURE COMPTABLE DE LA LIGNE EN COURS POUR L'EFFET VISUEL ACTIF
        if (articleId) {
            setActiveRowId(articleId);
        }

        // 🎯 1. VERROU SÉCURITÉ : Récupération du stock réel en magasin (en pièces unitaires natives)
        const quantiteStockBrute = art.stock_actuel ?? art.stock ?? art.stock_dispo ?? 0;
        const stockDisponibleEnPieces = Number(quantiteStockBrute);

        if (stockDisponibleEnPieces <= 0) {
            showToast("❌ Stock insuffisant : Cet article est épuisé (0).", "error");
            return;
        }

        // 🛡️ REJECTION STRICTE DES LETTRES ET CHIFFRES NÉGATIFS (ENTIERS UNIQUEMENT)
        const numGros = grosSaisi !== '' ? Math.floor(Math.abs(Number(grosSaisi))) : 0;
        const numDetail = detailSaisi !== '' ? Math.floor(Math.abs(Number(detailSaisi))) : 0;
        
        if (isNaN(numGros) || isNaN(numDetail)) {
            showToast("❌ Saisie invalide : Seuls les chiffres entiers sont autorisés.", "error");
            return;
        }

        const coeff = Number(art.coefficient || art.unit_coefficient || 1);
        
        // 🎯 2. CALCUL IMMÉDIAT DE LA CHARGE DEMANDÉE EN PIÈCES NATIVES
        const totalPiecesDepart = (numGros * coeff) + numDetail;

        if (totalPiecesDepart <= 0) {
            showToast("❌ Veuillez saisir une quantité supérieure à 0.", "error");
            return;
        }

        // 🎯 3. VERROU LOGISTIQUE BLOCAGE INSTANTANÉ : Demande brute supérieure au stock magasin
        if (totalPiecesDepart > stockDisponibleEnPieces) {
            const expressionStockDispo = typeof ConversionStockService?.toExpressionTextuelle === 'function'
                ? ConversionStockService.toExpressionTextuelle(stockDisponibleEnPieces, art)
                : `${stockDisponibleEnPieces} PCS`;
            showToast(`❌ Stock insuffisant ! Demande : ${totalPiecesDepart} PCS. Disponible en magasin : [ ${expressionStockDispo} ]`, "error");
            return;
        }


      if (!articleId) {
            showToast("❌ Erreur technique : Identifiant d'article introuvable.", "error");
            return;
        }

        const nomArticle = String(art.nom || art.designation || art.designation_article || '').toUpperCase().trim();
        
        // 🎯 FIX ABSOLU DES UNITÉS : Récupération dynamique depuis les vrais attributs du catalogue ERP
        const metadataArt = typeof ConversionStockService?.getMetadata === 'function' 
            ? ConversionStockService.getMetadata(art) 
            : { coeff: coeff, codeGros: String(art.unit_code_gros || art.unite_gros || art.code || 'CS'), refDetail: String(art.unit_ref_detail || art.unite_detail || 'BTS') };
            
        const codeGros = String(metadataArt.codeGros || 'CS').toUpperCase().trim();
        const refDetail = String(metadataArt.refDetail || 'BTS').toUpperCase().trim();

        // 🎯 4. VÉRIFICATION DU VOLUME GLOBAL CUMULÉ SI L'ARTICLE EXISTE DÉJÀ DANS LE PANIER
        const indexExistant = panierTournee.findIndex(item => String(item.product_id) === articleId);

        // Détermination du marqueur d'édition actif pour cette ligne précise
        const estEnModeModificationDirecte = editingProductId === articleId;

        // Extraction normalisée du prix de gros de base pour les calculs financiers
        const prixBaseLotGros = Number(art.prix_vente || art.prixVente || art.prix_vendre || art.prix_unitaire || 0);
        const prixPieceNativeCalcul = prixBaseLotGros / coeff;

        // 🟢 CORRECTIF LOGIQUE POUR EMPECHER L'INJECTION DE DOUBLONS LORS DE LA MODIFICATION DIRECTE
        if (indexExistant !== -1) {
            const quantiteDejaDansLePanier = panierTournee[indexExistant].qte_chargee_pieces;
            
            // Si on est en mode modification directe, la nouvelle quantité écrase l'ancienne, sinon on la cumule
            const quantiteAAppliquer = estEnModeModificationDirecte ? totalPiecesDepart : (quantiteDejaDansLePanier + totalPiecesDepart);

            // Contrôle de sécurité cumulatif anti-dépassement
            if (quantiteAAppliquer > stockDisponibleEnPieces) {
                showToast(`❌ Action refusée : La quantité demandée (${quantiteAAppliquer} PCS) dépasserait le stock magasin disponible (${stockDisponibleEnPieces} PCS).`, "error");
                return;
            }

           setPanierTournee(prevPanier => {
                const copy = [...prevPanier];
                
                copy[indexExistant] = {
                    ...copy[indexExistant],
                    qte_chargee_pieces: quantiteAAppliquer,
                    quantite: quantiteAAppliquer,
                    // 🔒 Sauvegarde forcée des vrais marqueurs d'unités d'origine
                    unite_gros: codeGros,
                    unit_code_gros: codeGros,
                    unite_detail: refDetail,
                    unit_ref_detail: refDetail,
                    prix_vente: prixBaseLotGros, 
                    // 💸 MISE À JOUR DU TOTAL NET DE LA LIGNE EN CAS DE CUMUL OU ÉDITION
                    total_ttc_net: quantiteAAppliquer * (copy[indexExistant].prix_vente_unitaire || prixPieceNativeCalcul),
                    expression_charge: typeof ConversionStockService?.toExpressionTextuelle === 'function'
                        ? ConversionStockService.toExpressionTextuelle(quantiteAAppliquer, copy[indexExistant].article_complet)
                        : `${quantiteAAppliquer} PCS`
                };
                return copy;
            });

            showToast(
                estEnModeModificationDirecte 
                    ? `📝 Quantité modifiée et mise à jour pour l'article "${nomArticle}" !` 
                    : `🔄 Quantité cumulée pour l'article "${nomArticle}" !`, 
                "success"
            );

        } else {
            const newItem = {
                id: null, 
                product_id: articleId,
                nom_article_snap: nomArticle,
                nom: nomArticle,
                prix_vente_unitaire: prixPieceNativeCalcul,
                prix_vente: prixBaseLotGros,
                qte_chargee_pieces: totalPiecesDepart,
                quantite: totalPiecesDepart, // Clé d'alignement globale ajoutée
                // 💸 ASSIGNATION INITIALE STRICTE DE LA VALEUR NETTE DE LA LIGNE
                total_ttc_net: totalPiecesDepart * prixPieceNativeCalcul,
                coeff: coeff,
                coefficient: coeff,
                expression_charge: typeof ConversionStockService?.toExpressionTextuelle === 'function'
                    ? ConversionStockService.toExpressionTextuelle(totalPiecesDepart, art)
                    : `${numGros} ${codeGros} + ${numDetail} ${refDetail}`,
                isFromDatabase: false,
                
                // 🚀 ANCRAGE EXPLICITE DES TYPES D'UNITÉS POUR LE MODE ÉDITION DU CHARGEMENT
                unite_gros: codeGros,
                unite_detail: refDetail,
                unit_code_gros: codeGros,
                unit_ref_detail: refDetail,
                ratio_conversion: coeff,

                // 🎯 STRUCTURE INTERNE PARFAITEMENT PRÉPARÉE ET HYDRATÉE POUR LE MODULE D'IMPRESSION FINALE
                article_complet: {
                    ...art,
                    id: articleId,
                    coefficient: coeff,
                    unit_coefficient: coeff,
                    code: codeGros,
                    unit_code_gros: codeGros,
                    unite_reference: refDetail,
                    unit_ref_detail: refDetail
                }
            };
            setPanierTournee(prevPanier => [...prevPanier, newItem]);
            showToast("✅ Nouvel article ajouté au panier !", "success");
        }
        
        // Nettoyage complet des champs de saisie pour cet article
        setSaisiesDepartGros(prev => {
            const copy = { ...prev };
            idOptions.forEach(opt => opt && delete copy[String(opt).trim()]);
            return copy;
        });
        setSaisiesDepartDetail(prev => {
            const copy = { ...prev };
            idOptions.forEach(opt => opt && delete copy[String(opt).trim()]);
            return copy;
        });

        // 🎯 RÉINITIALISATION DE SÉCURITÉ DE L'ÉDITION ET DU TEXTE DE RECHERCHE
        setEditingProductId(null);
        setSearchTerm('');
        setSearchBarCode('');
        setActiveRowId('');

        // 🎯 FACILITÉ D'UTILISATION : Le curseur se pointe directement dans le champ de recherche
        setTimeout(() => {
            if (searchInputRef.current) {
                searchInputRef.current.focus();
                searchInputRef.current.select();
            }
        }, 80);
    };

const catalogueFiltre = useMemo(() => {
    if (!Array.isArray(articles)) return [];

    return articles.filter(art => {
        const nomArticle = String(art.nom || art.designation || '').toLowerCase();
        const rechercheTexte = searchTerm.toLowerCase();

        const codeArticle = String(art.code || art.barcode || art.unit_code_gros || '').toLowerCase();
        const rechercheCode = searchBarCode.toLowerCase();

        const matchTexte = nomArticle.includes(rechercheTexte);
        const matchCode = codeArticle.includes(rechercheCode);

        return matchTexte && matchCode;
    });
}, [articles, searchTerm, searchBarCode]);

useEffect(() => {
    const fetchCompanySettings = async () => {
        try {
            const res = await API.get('/company/settings'); 
            if (res.data) {
                const data = res.data.success && res.data.data ? res.data.data : res.data;
                setDynamiqueCompanyPrint({
                    name: data.name || data.nom || data.raison_sociale || "LEDI EXPERT PRO",
                    address: data.address || data.adresse || "Adresse non renseignée",
                    phone: data.phone || data.telephone || "Tél: N/A",
                    email: data.email || "Email: N/A",
                    logo_data: data.logo_data || data.logo || data.logo_url || null
                });
            }
        } catch (err) {
            console.error("Erreur chargement paramètres entreprise:", err);
        }
    };
    fetchCompanySettings();
}, []);

// --- ⚙️ COMPILATION ET CALCULS DU PANIER EN TEMPS RÉEL (SOIR ET MATIN) ---
// --- ⚙️ COMPILATION ET CALCULS DU PANIER EN TEMPS RÉEL (CORRIGÉ SANS MULTIPLICATION PARASITE) ---
const panierConsolide = useMemo(() => {
    return panierTournee.map(item => {
        const coeff = Math.max(1, Number(item.coeff || item.coefficient || 1));
        const qteDepartPieces = Number(item.qte_chargee_pieces || item.quantite_depart || 0);

        // 🎯 EXTRACTION SÉCURISÉE DES VALEURS DE RETOUR (GROS ET DÉTAIL SÉPARÉS)
        const rawGros = String(saisiesRetourGros[item.product_id] || '').trim();
        const rawDetail = String(saisiesRetourDetail[item.product_id] || '').trim();

        // 🛡️ PARSEUR ANTI-LETTRE ET ANTI-NÉGATIF : Extraction des chiffres uniquement
        const numRetourGros = rawGros !== '' ? Math.floor(Math.abs(Number(rawGros))) : 0;
        const numRetourDetail = rawDetail !== '' ? Math.floor(Math.abs(Number(rawDetail))) : 0;

        // Conversion mathématique stricte en pièces natives unitaires
        const qteRetourPieces = (numRetourGros * coeff) + numRetourDetail;

        // 🎯 DÉTECTION VISUELLE IMMÉDIATE DU SUR-RETOUR (Saisie > Départ)
        const estSuperieurAuDepart = qteRetourPieces > qteDepartPieces;

        // Verrouillage logique de sécurité anti-stock négatif
        const qteRetourPiecesVerifiee = estSuperieurAuDepart ? qteDepartPieces : qteRetourPieces;

        // 2. Calculs mathématiques des ventes finales réelles en bouteilles
        const qeVenduPieces = Math.max(0, qteDepartPieces - qteRetourPiecesVerifiee);
        
        // 🎯 RECTIFICATION COMPTABLE DU P.U : Détermination propre du prix unitaire par pièce native
        const prixBaseGros = Number(item.prix_vente || item.prix_vente_unitaire || item.prix_unitaire || 0);
        // Si l'objet item a déjà le prix unitaire d'une pièce pré-calculé à l'ajout, on l'utilise, sinon prorata direct
        const prixUnitaireDetailRationnel = item.prix_vente_unitaire && item.prix_vente_unitaire !== prixBaseGros
            ? item.prix_vente_unitaire 
            : prixBaseGros / coeff;
        
        // Calcul du montant total de la ligne au détail près ou montant initial si mode matin complet
        const totalTtcLigne = isModeEvening 
            ? qeVenduPieces * prixUnitaireDetailRationnel
            : qteDepartPieces * prixUnitaireDetailRationnel;

        // Formatage de l'expression textuelle finale pour l'affichage de l'unité réelle
        let venduFormatee = `${qeVenduPieces} PCS`;
        if (typeof ConversionStockService?.toExpressionTextuelle === 'function' && item.article_complet) {
            try {
                venduFormatee = ConversionStockService.toExpressionTextuelle(qeVenduPieces, item.article_complet);
            } catch (e) {
                console.error("Erreur de conversion logistique sur panierConsolide", e);
                venduFormatee = `${qeVenduPieces} ${item.unit_ref_detail || 'PCS'}`;
            }
        }

        return {
            ...item,
            id: item.id || null, 
            retourGrosSaisi: rawGros,
            retourDetailSaisi: rawDetail,
            qte_retour_pieces: qteRetourPiecesVerifiee,
            qte_vendue_pieces: qeVenduPieces,
            venduFormatee: venduFormatee,
            
            // On conserve le prix de détail calculé et le total à jour
            prix_detail_calculé: prixUnitaireDetailRationnel,
            totalTtcLigne: totalTtcLigne,
            total_ttc_net: totalTtcLigne, // Double ancrage de sécurité pour les composants d'interface
            montant_ttc_ligne: totalTtcLigne, // Compatibilité totale SQL backend
            erreurRetour: estSuperieurAuDepart, // 🎯 Utilisé pour l'UI rouge et le blocage strict ERP
            totalSaisiPieces: qteRetourPieces
        };
    });
}, [panierTournee, saisiesRetourGros, saisiesRetourDetail, isModeEvening]);


// 🔒 SAUVEGARDE EN TEMPS RÉEL DU SOIR : Synchronise le stockage à chaque fois que le panier consolidé est recalculé
useEffect(() => {
    if (isModeEvening && currentTourId) {
        localStorage.setItem(`tournee_retour_gros_backup_${USER_ID}`, JSON.stringify(saisiesRetourGros));
        localStorage.setItem(`tournee_retour_detail_backup_${USER_ID}`, JSON.stringify(saisiesRetourDetail));
    }
}, [panierConsolide, saisiesRetourGros, saisiesRetourDetail, isModeEvening, currentTourId, USER_ID]);

// --- ⚙️ COMPILATION ET CALCULS DU PANIER EN TEMPS RÉEL (CORRIGÉ POUR LA VRAI VALEUR TOTALE) ---
const recetteTotaleAEncaisser = useMemo(() => {
    return panierConsolide.reduce((sum, item) => {
        // Extraction du montant total net recalculé de la ligne sans aucune multiplication parasite
        const montantLigneValide = Number(item.total_ttc_net || item.totalTtcLigne || item.montant_ttc_ligne || 0);
        return sum + montantLigneValide;
    }, 0);
}, [panierConsolide]);

// --- ✍️ GESTION DYNAMIQUE DES INPUTS DE SAISIE DE RETOURS EN GROS (SOIR) ---
const handleChangementSaisieRetourGros = useCallback((productId, value) => {
    // 🛡️ SÉCURITÉ STRICTE ENTIERS : Permet de saisir tous les chiffres de 0 à 9 sans restriction
    const cleanValue = value.replace(/[^0-9]/g, '');
    
    // 🎯 RECONNAISSANCE DE LA LIGNE EN COURS D'ÉDITION
    setActiveRowId(productId);
    
    setSaisiesRetourGros(prev => {
        const nouveauGros = {
            ...prev,
            [productId]: cleanValue
        };
        // 🔒 Synchronisation instantanée sur le disque dur pour parer la coupure de courant
        localStorage.setItem(`tournee_retour_gros_backup_${USER_ID}`, JSON.stringify(nouveauGros));
        return nouveauGros;
    });
}, [USER_ID]);
// --- ✍️ GESTION DYNAMIQUE DES INPUTS DE SAISIE DE RETOURS EN DÉTAIL (SOIR) ---
const handleChangementSaisieRetourDetail = useCallback((productId, value) => {
    // 🛡️ SÉCURITÉ STRICTE FRAUDS/SAYS : Nettoie tout caractère non numérique en temps réel
    const cleanValue = value.replace(/[^0-9]/g, '');
    
    // 🎯 RECONNAISSANCE DE LA LIGNE EN COURS D'ÉDITION POUR L'EFFET VISUEL ACTIF
    setActiveRowId(productId);
    
    setSaisiesRetourDetail(prev => {
        const nouveauDetail = {
            ...prev,
            [productId]: cleanValue
        };
        // 🔒 Synchronisation instantanée sur le disque dur pour parer la coupure de courant
        localStorage.setItem(`tournee_retour_detail_backup_${USER_ID}`, JSON.stringify(nouveauDetail));
        return nouveauDetail;
    });
}, [USER_ID]);

// --- 🗑️ RETRAIT D'UN ARTICLE DU PANIER PAR INDEX UNIQUE (CORRIGÉ POUR LES DOUBLONS) ---
const handleSupprimerDuPanier = useCallback((indexLigne) => {
    if (isModeEvening) {
        showToast("❌ Interdit : Impossible de supprimer un article du chargement lors de la clôture du soir.", "error");
        return;
    }
    setPanierTournee(prev => {
        const nouveauPanier = prev.filter((_, idx) => idx !== indexLigne);
        // Mettre à jour le backup du matin
        localStorage.setItem(`tournee_backup_${USER_ID}`, JSON.stringify(nouveauPanier));
        return nouveauPanier;
    });
    showToast("🗑️ Ligne de chargement retirée du panier.", "success");
}, [isModeEvening, showToast, USER_ID]);

const handleActionPrincipaleGrille = async () => {
    if (panierTournee.length === 0 || isSaving) return;
    if (!selectedStaffId) {
        showToast("❌ Veuillez sélectionner le commercial concerné.", "error");
        return;
    }
    
    // 🚀 VERROUILLAGE CHIRURGICAL ET STRICT DU SOIR : Sélections obligatoires sans pré-saisie
    if (isModeEvening) {
        if (!selectedCustomerId) {
            showToast("❌ Action Refusée : Vous devez sélectionner un client (ex: CLIENT AU COMPTANT ou COMMERCIAL) pour enregistrer la facturation de clôture.", "error");
            return;
        }

        // 🚯 VERROU DE SÉCURITÉ : Moyen de paiement obligatoire à la clôture du soir
        if (!selectedMethodId || String(selectedMethodId).trim() === '') {
            showToast("❌ Action Refusée : Veuillez sélectionner obligatoirement la caisse d'encaissement / moyen de paiement.", "error");
            return;
        }

        // 🚯 VERROU DE SÉCURITÉ : Format d'impression obligatoire à la clôture du soir
        if (!formatImpression || String(formatImpression).trim() === '') {
            showToast("❌ Action Refusée : Veuillez sélectionner obligatoirement un format d'impression pour continuer.", "error");
            return;
        }

        const aDesErreursDeSaisie = panierConsolide.some(item => item.erreurRetour);
        if (aDesErreursDeSaisie) {
            showToast("❌ Impossible de valider : Un ou plusieurs articles ont une quantité de retour supérieure à leur quantité de départ.", "error");
            return;
        }
    }
    
    setIsSaving(true);
    try {
        const staff = allStaff.find(s => String(s.id) === String(selectedStaffId));
        const staffNomAffiche = staff ? (staff.nom || staff.name || staff.username) : "Commercial";


               if (!isModeEdition) {
            const payloadMatin = {
                staff_id: selectedStaffId,
                staff_name: staffNomAffiche,
                lot_id: currentTourId,
                lignes: panierTournee.map(item => {
                    const coeff = Math.max(1, Number(item.coeff || 1));
                    const totalPieces = Number(item.qte_chargee_pieces || 0);
                    const grosCalcule = Math.floor(totalPieces / coeff);
                    const detailCalcule = totalPieces % coeff;
                    
                    // 💸 SÉCURISATION DU CALCUL FINANCIER PAR LIGNE POUR LE SERVEUR
                    const prixDetailCalculed = Number(item.prix_vente_unitaire || (Number(item.prix_vente || 0) / coeff));
                    const vraiMontantLigne = Number(item.total_ttc_net || (totalPieces * prixDetailCalculed));

                    return {
                        product_id: item.product_id,
                        nom_article_snap: item.nom,
                        quantite: totalPieces,               
                        saisie_gros: grosCalcule.toString(),   
                        saisie_detail: detailCalcule.toString(), 
                        prix_vente_unitaire: prixDetailCalculed,
                        montant_ttc_ligne: vraiMontantLigne
                    };
                })
            };

          const res = await API.post('/provisional-sales/validate-commercial/morning', payloadMatin);
            if (res.data.success) {
                const facture_generee = res.data.sale_id || res.data.lot_id || currentTourId;
                showToast(`✅ Panier de chargement du matin enregistré (Bon ${currentTourId})`, "success");

                // 🚀 PRÉPARATION LOGISTIQUE ET HYDRO-INJECTION COMPTABLE DE L'IMPRESSION MATIN (MAPPAGE DYNAMIQUE SQLITE)
                const articlesPourImpression = panierTournee.map(item => {
                    const coeff = Math.max(1, Number(item.coeff || 1));
                    const totalPieces = Number(item.qte_chargee_pieces || 0);
                    
                    // Récupération dynamique et sécurisée des codes logistiques réels de l'article
                    const infoArticle = item.article_complet || {};
                    const codeGros = String(item.unit_code_gros || infoArticle.unit_code_gros || 'CS').toUpperCase().trim();
                    const refDetail = String(item.unit_ref_detail || infoArticle.unit_ref_detail || 'PCS').toUpperCase().trim();

                    const prixDetailCalculed = Number(item.prix_vente_unitaire || (Number(item.prix_vente || 0) / coeff));
                    const vraiMontantLigne = Number(item.total_ttc_net || (totalPieces * prixDetailCalculed));

                    return {
                        ...item,
                        nom: item.nom,
                        qte_vendue_pieces: totalPieces, // Utilisé par tournerprint pour afficher la quantité chargée
                        prix_vente: item.prix_vente || 0,
                        prix_unitaire: item.prix_vente || 0,
                        totalTtcLigne: vraiMontantLigne,
                        total_ttc_net: vraiMontantLigne,
                        // Blindage de premier niveau pour l'impression
                        unit_code_gros: codeGros,
                        unit_ref_detail: refDetail,
                        // Hydratation de l'objet profond pour ConversionStockService.toExpressionTextuelle()
                        article_complet: {
                            ...infoArticle,
                            coefficient: coeff,
                            unit_coefficient: coeff,
                            unit_code_gros: codeGros,
                            unite_code: codeGros,
                            unit_ref_detail: refDetail,
                            unite_reference: refDetail
                        }
                    };
                });

                // 💸 SÉCURISATION DU TOTAL GLOBAL ENVOYÉ AU COMPOSANT D'IMPRESSION COMPTABLE
                const totalGeneralMatin = articlesPourImpression.reduce((acc, current) => acc + Number(current.total_ttc_net || 0), 0);

                setDonneesVenteAImprimer({
                    format: formatImpression || 'NONE', // 🎯 ALIGNEMENT DU FORMAT SÉLECTIONNÉ POUR L'IMPRESSION MATIN
                    saleId: facture_generee,
                    lot_id: currentTourId,
                    staff_name: staffNomAffiche,
                    caissierName: userName,
                    mode_reglement: 'CHARGEMENT INITIAL',
                    total: totalGeneralMatin,
                    date: new Date().toISOString(),
                    articles: articlesPourImpression,
                    // 🎯 INJECTION DU RECAP DES UNITES POUR LE REÇU COMMERCIALE DU MATIN
                    recapUnites: recapUnites
                });

                // Déclenchement sécurisé du flux physique de l'imprimante
                setTimeout(() => {
                    if (typeof handlePrint === 'function') handlePrint();
                }, 300);

                // 🎯 NETTOYAGE ABSOLU DE TOUS LES CACHES LOCAUX DE TOURNÉE (SÉCURITÉ ANTI-CONTAMINATION)
                localStorage.removeItem(`tournee_backup_${USER_ID}`); 
                localStorage.removeItem(`tournee_retour_gros_backup_${USER_ID}`); 
                localStorage.removeItem(`tournee_retour_detail_backup_${USER_ID}`); 
                
                // Réinitialisation complète des formulaires de saisie
                setPanierTournee([]);
                setSaisiesRetourGros({});
                setSaisiesRetourDetail({});
                setSelectedStaffId('');
                setFormatImpression(''); // Forcer la ré-sélection au prochain chargement
                setSelectedMethodId(''); // Forcer la ré-sélection au prochain chargement
                
                if (typeof genererNouveauTourId === 'function') {
                    setCurrentTourId(genererNouveauTourId());
                } else {
                    setCurrentTourId(`TOUR-${Date.now().toString().slice(-4)}${Math.floor(10 + Math.random() * 90)}`);
                }
                
                await fetchInitialData(); 
            }
        } else if (isModeEdition && !isModeEvening) {
            const payloadUpdate = {
                staff_id: selectedStaffId,
                staff_name: staffNomAffiche,
                lot_id: currentTourId,
                lignes: panierTournee.map(item => {
                    const coeff = Math.max(1, Number(item.coeff || 1));
                    const totalPieces = Number(item.qte_chargee_pieces || 0);
                    const grosCalcule = Math.floor(totalPieces / coeff);
                    const detailCalcule = totalPieces % coeff;

                    const prixDetailCalculed = Number(item.prix_vente_unitaire || (Number(item.prix_vente || 0) / coeff));
                    const vraiMontantLigne = Number(item.total_ttc_net || (totalPieces * prixDetailCalculed));

                    return {
                        id: item.id || null, 
                        product_id: item.product_id,
                        nom_article_snap: item.nom,
                        quantite: totalPieces,
                        saisie_gros: grosCalcule.toString(),
                        saisie_detail: detailCalcule.toString(),
                        prix_vente_unitaire: prixDetailCalculed,
                        montant_ttc_ligne: vraiMontantLigne
                    };
                })
            };

             const res = await API.put(`/provisional-sales/validate-commercial/update/${currentTourId}`, payloadUpdate);
            if (res.data.success) {
                const facture_generee = res.data.sale_id || res.data.lot_id || currentTourId;
                showToast(`🔄 Chargement de la tournée mis à jour avec succès !`, "success");

                // 🚀 IMPRESSION SYNC SUR MISE A JOUR DU CHARGEMENT (MAPPAGE CODES LOGISTIQUES SQLITE)
                const articlesPourImpressionEdit = panierTournee.map(item => {
                    const coeff = Math.max(1, Number(item.coeff || 1));
                    const totalPieces = Number(item.qte_chargee_pieces || 0);
                    
                    const infoArticle = item.article_complet || {};
                    const codeGros = String(item.unit_code_gros || infoArticle.unit_code_gros || 'CS').toUpperCase().trim();
                    const refDetail = String(item.unit_ref_detail || infoArticle.unit_ref_detail || 'PCS').toUpperCase().trim();

                    const prixDetailCalculed = Number(item.prix_vente_unitaire || (Number(item.prix_vente || 0) / coeff));
                    const vraiMontantLigne = Number(item.total_ttc_net || (totalPieces * prixDetailCalculed));

                    return {
                        ...item,
                        nom: item.nom,
                        qte_vendue_pieces: totalPieces,
                        prix_vente: item.prix_vente || 0,
                        prix_unitaire: item.prix_vente || 0,
                        totalTtcLigne: vraiMontantLigne,
                        total_ttc_net: vraiMontantLigne,
                        unit_code_gros: codeGros,
                        unit_ref_detail: refDetail,
                        article_complet: {
                            ...infoArticle,
                            coefficient: coeff,
                            unit_coefficient: coeff,
                            unit_code_gros: codeGros,
                            unite_code: codeGros,
                            unit_ref_detail: refDetail,
                            unite_reference: refDetail
                        }
                    };
                });

           // 💸 SÉCURISATION DU TOTAL GLOBAL D'IMPRESSION LORS DE LA MISE À JOUR
           const totalGeneralEdit = articlesPourImpressionEdit.reduce((acc, current) => acc + Number(current.total_ttc_net || 0), 0);

                setDonneesVenteAImprimer({
                    format: formatImpression || 'NONE', // 🎯 DYNAMISATION DU FORMAT EN MODE ÉDITION
                    saleId: facture_generee,
                    lot_id: currentTourId,
                    staff_name: staff ? (staff.nom || staff.name) : "Commercial",
                    caissierName: userName,
                    mode_reglement: 'MISE À JOUR CHARGEMENT',
                    total: totalGeneralEdit,
                    date: new Date().toISOString(),
                    articles: articlesPourImpressionEdit,
                    // 🎯 INJECTION DU RECAP DES UNITES LORS DE LA MISE A JOUR DU CHARGEMENT
                    recapUnites: recapUnites
                });

                setTimeout(() => {
                    if (typeof handlePrint === 'function') handlePrint();
                }, 300);

                // 🔒 NETTOYAGE TOTAL DU TAMPON LOCAL APRES MISE A JOUR REUSSIE
                localStorage.removeItem(`tournee_backup_${USER_ID}`); 
                localStorage.removeItem(`tournee_retour_gros_backup_${USER_ID}`); 
                localStorage.removeItem(`tournee_retour_detail_backup_${USER_ID}`); 

                setPanierTournee([]);
                setSelectedStaffId('');
                setFormatImpression(''); // Forcer le choix obligatoire au prochain tour
                setSelectedMethodId(''); // Forcer le choix obligatoire au prochain tour
                
                if (typeof genererNouveauTourId === 'function') {
                    setCurrentTourId(genererNouveauTourId());
                } else {
                    setCurrentTourId(`TOUR-${Date.now().toString().slice(-4)}${Math.floor(10 + Math.random() * 90)}`);
                }
                
                setSearchParams({}, { replace: true });
                await fetchInitialData(); 
            }
        } else {
            const idMethodeSecurisee = selectedMethodId && String(selectedMethodId).trim() !== '' ? String(selectedMethodId).trim() : null;
            const methodeSelectionnee = paymentMethods.find(m => String(m.id) === idMethodeSecurisee);
            const libelleReglement = methodeSelectionnee ? (methodeSelectionnee.libelle || methodeSelectionnee.name) : 'ESPÈCES';
            
            // 🚀 EXTRACTION CHIRURGICALE DU CLIENT CHOISI DEPUIS L'INTERFACE GRAPHIQUE
            const clientTrouve = customers.find(c => String(c.id) === String(selectedCustomerId));
            const nomClientFinal = clientTrouve ? (clientTrouve.name || clientTrouve.nom || "CLIENT COMPTOIR") : "CLIENT AU COMPTANT";

         const payloadSoir = {
                lot_id: currentTourId,
                staff_id: selectedStaffId,
                staff_name: staff ? (staff.nom || staff.name) : "Commercial",
                moyen_paiement: libelleReglement,
                payment_method_id: idMethodeSecurisee, 
                format_impression: formatImpression,
                // 🎯 INJECTION DIRECTE DU VRAI ID ET NOM DU CLIENT POUR RÉCUPÉRATION BACKEND
                chosen_customer_id: selectedCustomerId,
                chosen_customer_name: nomClientFinal,
                encaissement: {
                    payment_method_id: idMethodeSecurisee,
                    moyen_paiement: libelleReglement,
                    total: typeof recetteTotaleAEncaisser !== 'undefined' ? recetteTotaleAEncaisser : 0,
                    nom_client: nomClientFinal,
                    customer_id: selectedCustomerId 
                },
                lignes: (typeof panierConsolide !== 'undefined' ? panierConsolide : []).map(item => {
                    const coeff = Math.max(1, Number(item.coeff || 1));
                    const totalVenduPieces = Number(item.qte_vendue_pieces || 0);
                    
                    // 💸 EXCLUSION DES MULTIPLICATIONS PARASITES : Utilisation stricte de la valeur calculée
                    const prixDetailCalculed = Number(item.prix_detail_calculé || (Number(item.prix_vente || 0) / coeff));
                    const vraiMontantLigne = Number(item.total_ttc_net || item.totalTtcLigne || (totalVenduPieces * prixDetailCalculed));

                    return {
                        id: item.id || null, 
                        product_id: item.product_id,
                        nom_article_snap: item.nom,
                        quantite: Number(item.qte_chargee_pieces || 0), 
                        quantite_retour: Number(item.qte_retour_pieces || 0), 
                        quantite_vendue: totalVenduPieces, 
                        prix_vente_unitaire: prixDetailCalculed,
                        montant_ttc_ligne: vraiMontantLigne
                    };
                })
            };
            const res = await API.post('/provisional-sales/validate-commercial/evening', payloadSoir);
            if (res.data.success) {
                showToast(`✅ Tournée clôturée définitivement ! Ventes comptabilisées.`, "success");
                
                if (formatImpression !== 'NONE' && formatImpression !== '') {
                    // 🚀 AJUSTEMENT DU PANIER DU SOIR WITH HYDRATATION UNITELS LOGISTIQUES SQLITE
                    const panierSecuriseSoir = (typeof panierConsolide !== 'undefined' ? panierConsolide : []).map(item => {
                        const infoArticle = item.article_complet || {};
                        const coeff = Math.max(1, Number(item.coeff || 1));
                        const codeGros = String(item.unit_code_gros || infoArticle.unit_code_gros || 'CS').toUpperCase().trim();
                        const refDetail = String(item.unit_ref_detail || infoArticle.unit_ref_detail || 'PCS').toUpperCase().trim();

                        const prixDetailCalculed = Number(item.prix_detail_calculé || (Number(item.prix_vente || 0) / coeff));
                        const vraiMontantLigne = Number(item.total_ttc_net || item.totalTtcLigne || 0);

                        return {
                            ...item,
                            totalTtcLigne: vraiMontantLigne,
                            total_ttc_net: vraiMontantLigne,
                            unit_code_gros: codeGros,
                            unit_ref_detail: refDetail,
                            article_complet: {
                                ...infoArticle,
                                coefficient: coeff,
                                unit_coefficient: coeff,
                                unit_code_gros: codeGros,
                                unite_code: codeGros,
                                unit_ref_detail: refDetail,
                                unite_reference: refDetail
                            }
                        };
                    });

                    setDonneesVenteAImprimer({
                        saleId: res.data.sale_id || res.data.id || `SAL-T-${Date.now().toString().slice(-4)}`,
                        lot_id: currentTourId,
                        staff_name: staff ? (staff.nom || staff.name) : "Commercial",
                        caissierName: userName,
                        date: new Date().toISOString(),
                        total: typeof recetteTotaleAEncaisser !== 'undefined' ? recetteTotaleAEncaisser : 0,
                        mode_reglement: libelleReglement,
                        format: formatImpression, 
                        articles: panierSecuriseSoir,
                        // 🎯 INJECTION SYNCHRONE DU RECAP DES UNITES POUR LE REÇU DE FIN DE TOURNÉE DU SOIR
                        recapUnites: recapUnites
                    });

                    // 🎯 APPEL DU GESTIONNAIRE D'IMPRESSION PROPRE DE L'ERP AU LIEU DE WINDOW.PRINT()
                    setTimeout(() => {
                        if (typeof handlePrint === 'function') {
                            handlePrint();
                        }
                    }, 300);
                }


              // 🎯 NETTOYAGE ABSOLU DES COUPS DE COURANT : Tout effacer après envoi réussi au serveur
                localStorage.removeItem(`tournee_backup_${USER_ID}`); 
                localStorage.removeItem(`tournee_retour_gros_backup_${USER_ID}`); 
                localStorage.removeItem(`tournee_retour_detail_backup_${USER_ID}`); 

                setPanierTournee([]);
                if (typeof setSaisiesRetourGros === 'function') setSaisiesRetourGros({});
                if (typeof setSaisiesRetourDetail === 'function') setSaisiesRetourDetail({});
                setSelectedStaffId('');
                setSelectedCustomerId(''); // Réinitialisation complète de l'état client après succès
                
                // 🚯 SÉCURITÉ STRICTE : Aucune pré-sélection automatique après validation
                setSelectedMethodId('');
                setFormatImpression(''); 
                
                if (typeof genererNouveauTourId === 'function') {
                    setCurrentTourId(genererNouveauTourId());
                } else {
                    setCurrentTourId(`TOUR-${Date.now().toString().slice(-4)}${Math.floor(10 + Math.random() * 90)}`);
                }
                setSearchParams({}, { replace: true });
                await fetchInitialData(); 
            }
        }
    } catch (err) {
        console.error("Erreur execution feuille de route:", err);
        showToast("❌ Erreur: " + (err.response?.data?.error || err.message), "error");
    } finally {
        setIsSaving(false);
    }
};

// --- CONFIGURATION DES STYLES EN LIGNE (SLATE STYLE PRO) ---
    const tableHeaderStyle = { backgroundColor: '#0f172a', color: '#fff', padding: '12px 8px', fontSize: '13px', fontWeight: '600', position: 'sticky', top: 0, zIndex: 5 };
    const tdStyle = { padding: '10px 8px', borderBottom: '1px solid #e2e8f0', fontSize: '13px', color: '#334155', fontWeight: '500', transition: 'all 0.15s ease' };
    
    // 🎯 DÉFINITION ÉLARGIE, VISIBLE ET FRAPPANTE POUR TOUTES LES PAGES DE L'INTERFACE
    const inputStyle = { 
        padding: '10px 14px', 
        border: '2px solid #cbd5e1', 
        borderRadius: '6px', 
        width: '115px', // Élargi substantiellement pour une saisie fluide
        textAlign: 'center', 
        fontSize: '16px', // Grand format frappant pour éviter toute erreur
        fontWeight: '700', 
        color: '#0f172a',
        backgroundColor: '#f8fafc',
        boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
        outline: 'none',
        transition: 'all 0.15s ease-in-out'
    };

    // 🎯 MOTEUR D'AFFICHAGE UNIQUE DU STOCK PHYSIQUE DISPONIBLE (GROS + DETAIL)
    const formaterStockDisponible = (art) => {
        if (!art) return "-";
        
        // Extraction de la valeur brute du stock
        let valeurStock = art.stock_actuel !== undefined ? art.stock_actuel : (art.stock || 0);
        
        // Nettoyage si c'est une chaîne contenant des caractères parasites
        if (typeof valeurStock === 'string') {
            if (valeurStock.includes('+')) {
                return valeurStock.replace(/-/g, '');
            }
            valeurStock = valeurStock.replace(/[^\d.]/g, '');
        }
        
        const qtePieces = Math.abs(Number(valeurStock)) || 0;
        
        // 🛡️ BLINDAGE STRICT POUR EMPECHER L'AFFICHAGE DE "0 U" SI L'ARTICLE REEL POSEDÈ UNE VRAIE UNITÉ DANS SQLITE
        if (qtePieces === 0) {
            const infoArticle = art.article_complet || art.product || art || {};
            const vraieUniteDetail = infoArticle.unit_ref_detail || infoArticle.unite_reference || infoArticle.unite_snap || "U";
            return `0 ${vraieUniteDetail.toUpperCase().trim()}`;
        }
        
        return typeof ConversionStockService?.toExpressionTextuelle === 'function'
            ? ConversionStockService.toExpressionTextuelle(qtePieces, art.article_complet || art)
            : `${qtePieces} PCS`;
    };

    // 🎯 HELPER COMPLÉMENTAIRE DE VÉRIFICATION DE CHARGE ET DES RETOURS (HARMONISÉ SUR LE COMPTEUR GLOBAL)
    const verifierIncoherenceLigne = (item) => {
        if (!item) return { erreur: false, totalRetour: 0 };
        
        // Extraction sécurisée du coefficient en phase avec les states maîtres
        const coeff = Math.max(1, Number(item.coeff || item.coefficient || 1));
        
        const rawGros = String(saisiesRetourGros[item.product_id] || '').trim();
        const rawDetail = String(saisiesRetourDetail[item.product_id] || '').trim();
        
        const numGros = rawGros !== '' ? Math.floor(Math.abs(Number(rawGros))) : 0;
        const numDetail = rawDetail !== '' ? Math.floor(Math.abs(Number(rawDetail))) : 0;
        
        const totalRetourPieces = (numGros * coeff) + numDetail;
        const totalDepartPieces = Number(item.qte_chargee_pieces || item.quantite_depart || 0);
        
        return {
            erreur: totalRetourPieces > totalDepartPieces,
            totalRetour: totalRetourPieces,
            totalDepart: totalDepartPieces
        };
    };

   return (
        <div className="dashboard-layout" style={{ display: 'flex' }}>
            <Sidebar />
            
            <main style={{ display: 'flex', flexDirection: 'column', flex: 1, height: '100vh', backgroundColor: '#ffffff', overflow: 'hidden' }}>
                
                {/* 1. EN-TÊTE FIXE SUPERIEUR AVEC GESTION DU MODE METIER DYNAMIQUE */}
                <header style={{ backgroundColor: '#0f172a', padding: '16px 30px', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h1 style={{ fontSize: '22px', margin: 0, fontWeight: '700' }}>
                            {isModeEvening 
                                ? "Feuille de Route : Décompte & Clôture Définitive (Soir)" 
                                : isModeEdition 
                                    ? "Feuille de Route : Modification du Chargement (Matin)" 
                                    : "Feuille de Route : Constitution du Chargement (Matin)"
                            }
                        </h1>
                        <p style={{ fontSize: '13px', color: '#94a3b8', margin: '2px 0 0 0' }}>
                            {isModeEvening 
                                ? "Saisie finale des retours physiques pour validation et génération de la vente nette" 
                                : "Saisissez les colisages et chargez le panier de la tournée commerciale"
                            }
                        </p>
                    </div>

                    <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
                        
                        {/* 🚯 EXIGENCE EXCLUSIVE DU SOIR : SÉLECTEUR OBLIGATOIRE DU MOYEN DE PAIEMENT SANS PRÉ-SÉLECTION */}
                        {isModeEvening && (
                            <div style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '8px', 
                                backgroundColor: '#1e293b', 
                                padding: '6px 14px', 
                                borderRadius: '6px', 
                                border: !selectedMethodId ? '2px solid #ef4444' : '1px solid #334155', // Bordure rouge frappante si vide
                                boxShadow: !selectedMethodId ? '0 0 8px rgba(239, 68, 68, 0.4)' : 'none',
                                transition: 'all 0.2s ease-in-out'
                            }}>
                                <select 
                                    value={selectedMethodId} 
                                    onChange={(e) => setSelectedMethodId(e.target.value)}
                                    style={{ border: 'none', backgroundColor: 'transparent', color: '#fff', fontSize: '14px', fontWeight: '600', outline: 'none', cursor: 'pointer' }}
                                >
                                    <option value="" style={{backgroundColor: '#1e293b'}}>-- Caisse d'encaissement * --</option>
                                    {paymentMethods.map(m => (
                                        <option key={m.id || m._id} value={m.id || m._id} style={{backgroundColor: '#1e293b'}}>
                                            {String(m.libelle || m.name || '').toUpperCase()}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* 🚯 EXIGENCE EXCLUSIVE DU SOIR : SÉLECTEUR OBLIGATOIRE DU FORMAT D'IMPRESSION SANS PRÉ-SÉLECTION */}
                        {isModeEvening && (
                            <div style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '8px', 
                                backgroundColor: '#1e293b', 
                                padding: '6px 14px', 
                                borderRadius: '6px', 
                                border: !formatImpression ? '2px solid #ef4444' : '1px solid #334155', // Bordure rouge frappante si vide
                                boxShadow: !formatImpression ? '0 0 8px rgba(239, 68, 68, 0.4)' : 'none',
                                transition: 'all 0.2s ease-in-out'
                            }}>
                                <select 
                                    value={formatImpression} 
                                    onChange={(e) => setFormatImpression(e.target.value)}
                                    style={{ border: 'none', backgroundColor: 'transparent', color: '#fff', fontSize: '14px', fontWeight: '600', outline: 'none', cursor: 'pointer' }}
                                >
                                    <option value="" style={{backgroundColor: '#1e293b'}}>-- Mode d'impression * --</option>
                                    <option value="NONE" style={{backgroundColor: '#1e293b'}}>CLÔTURER SANS IMPRIMER</option>
                                    <option value="A5" style={{backgroundColor: '#1e293b'}}>IMPRIMER TICKET FORMAT A5</option>
                                    <option value="A6" style={{backgroundColor: '#1e293b'}}>IMPRIMER TICKET FORMAT A6</option>
                                </select>
                            </div>
                        )}



                   {/* Zone de choix du commercial */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#1e293b', padding: '6px 14px', borderRadius: '6px', border: '1px solid #334155' }}>
                            <User size={16} color="#94a3b8" />
                            <select 
                                value={selectedStaffId} 
                                disabled={isModeEdition} 
                                onChange={(e) => setSelectedStaffId(e.target.value)}
                                style={{ border: 'none', backgroundColor: 'transparent', color: '#fff', fontSize: '14px', fontWeight: '600', outline: 'none', cursor: 'pointer' }}
                            >
                                <option value="" style={{backgroundColor: '#1e293b'}}>-- Choisir le Commercial --</option>
                                {allStaff.map(s => (
                                    <option key={s.id} value={s.id} style={{backgroundColor: '#1e293b'}}>
                                        {String(s.nom || s.name || '').toUpperCase()}
                                    </option>
                                ))}
                            </select>
                        </div>

                       {/* 🚀 INJECTION EXCLUSIVE DU SELECTEUR DE CLIENT UNIQUE POUR LA CLÔTURE DU SOIR */}
                        {isModeEvening && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#1e293b', padding: '6px 14px', borderRadius: '6px', border: '1px solid #eab308' }}>
                                <User size={16} color="#f59e0b" />
                                <select 
                                    value={selectedCustomerId} 
                                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                                    style={{ border: 'none', backgroundColor: 'transparent', color: '#fff', fontSize: '14px', fontWeight: '600', outline: 'none', cursor: 'pointer' }}
                                >
                                    <option value="" style={{backgroundColor: '#1e293b'}}>-- Sélectionner le Client Final --</option>
                                    {customers.map(c => (
                                        <option key={c.id} value={c.id} style={{backgroundColor: '#1e293b'}}>
                                            {String(c.name || c.nom || '').toUpperCase()}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div style={{ backgroundColor: isModeEvening ? '#f59e0b' : isModeEdition ? '#ef4444' : '#3b82f6', color: '#fff', padding: '6px 12px', borderRadius: '6px', fontSize: '13px', fontWeight: '700' }}>
                            {isModeEvening ? `CLÔTURE : ${currentTourId}` : isModeEdition ? `ÉDITION : ${currentTourId}` : `NOUVEAU : ${currentTourId}`}
                        </div>
                    </div>
                </header>

{alertMsg.text && (
    <div style={{ padding: '12px', color: '#fff', fontWeight: 'bold', textAlign: 'center', backgroundColor: alertMsg.type === 'error' ? '#EF4444' : '#10B981', zIndex: 10 }}>
        {alertMsg.text}
    </div>
)}

{/* 2. BARRE DE RECHERCHE (🎯 CORRIGÉE : RECHERCHE DÉBLOQUÉE ET DISPONIBLE SUR TOUTES LES PAGES ET MODES) */}
<div style={{ padding: '12px 30px', backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '20px' }}>
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px 12px' }}>
        <Search size={16} color="#64748b" />
        <input 
            // 🎯 LIAISON DE LA REFERNECE D'ANCRAGE POUR LE REPOSITIONNEMENT AUTOMATIQUE DU CURSEUR
            ref={searchInputRef}
            type="text" 
            placeholder="Filtrer les articles par nom..." 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)} 
            disabled={false} // 🎯 ANTI-BLOCAGE : Recherche totalement débloquée en mode édition
            style={{ border: 'none', outline: 'none', width: '100%', fontSize: '13px' }} 
        />
    </div>
    <div style={{ width: '250px', display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px 12px' }}>
        <Barcode size={16} color="#64748b" />
        <input 
            type="text" 
            placeholder="Scanner Code-barres..." 
            value={searchBarCode} 
            onChange={(e) => setSearchBarCode(e.target.value)} 
            disabled={false} // 🎯 ANTI-BLOCAGE : Scanner totalement débloqué en mode édition
            style={{ border: 'none', outline: 'none', width: '100%', fontSize: '13px' }} 
        />
    </div>
    <button 
        onClick={fetchInitialData} 
        disabled={loading} 
        style={{ padding: '8px 12px', backgroundColor: '#64748b', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
    >
        <RefreshCw size={16} className={loading ? 'spin' : ''} />
    </button>
</div>
{/* 3. 📊 TABLEAU N°1 : LISTE DES ARTICLES (CORRIGÉ MODE MATIN / UNITÉS SÉCURISÉES) */}
{!isModeEvening && (
    <div style={{ height: '35vh', padding: '0 30px', overflowY: 'auto', borderBottom: '3px double #cbd5e1', marginTop: '10px' }}>
        <p style={{ fontSize: '12px', fontWeight: '800', color: '#475569', margin: '4px 0 8px 0', textTransform: 'uppercase' }}>1. Catalogue des Articles Général</p>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead>
                <tr style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                    <th style={{ ...tableHeaderStyle, width: '30%', textAlign: 'left' }}>DÉSIGNATION ARTICLE</th>
                    <th style={{ ...tableHeaderStyle, width: '15%', textAlign: 'center' }}>STOCK ACTUEL</th>
                    <th style={{ ...tableHeaderStyle, width: '13%', textAlign: 'center' }}>P.U FACTURE</th>
                    <th style={{ ...tableHeaderStyle, width: '30%', backgroundColor: '#1e293b', textAlign: 'center' }}>SAISIE QUANTITÉ DÉPART (MORNING)</th>
                    <th style={{ ...tableHeaderStyle, width: '12%', textAlign: 'center' }}>ACTION</th>
                </tr>
            </thead>


<tbody>
                {loading ? (
                    <tr><td colSpan="5" style={{ ...tdStyle, textAlign: 'center', padding: '20px' }}>Chargement du catalogue...</td></tr>
                ) : catalogueFiltre.length === 0 ? ( 
                    <tr><td colSpan="5" style={{ ...tdStyle, textAlign: 'center', padding: '20px' }}>Aucun article trouvé.</td></tr>
                ) : (
                    catalogueFiltre.map((art, idx) => {
                        const rawId = art.id || art._id || art.id_article || art.product_id;
                        const currentArtId = rawId ? String(rawId).trim() : `art-idx-${idx}`;
                        
                        // Récupération dynamique des vrais libellés d'unité du produit
                        const { coeff, codeGros, refDetail } = ConversionStockService.getMetadata(art);

                        // 🎯 DÉTECTION S'IL S'AGIT DE LA LIGNE EN COURS DE SÉLECTION/SAISIE
                        const isRowActive = activeRowId === currentArtId;

                        return (
                            <tr 
                                key={currentArtId} 
                                style={{ 
                                    backgroundColor: isRowActive 
                                        ? '#e0e7ff' // 🎯 EFFET VISUEL DE LIGNE ACTIVE INDIGO TRÈS VISIBLE SUR FOCUS
                                        : (idx % 2 === 0 ? '#ffffff' : '#f8fafc'),
                                    borderLeft: isRowActive ? '4px solid #4f46e5' : 'none', // Ajout d'une barre de focus sur le côté
                                    transition: 'all 0.15s ease-in-out'
                                }}
                            >
                                <td style={{ ...tdStyle, textAlign: 'left', fontWeight: '700', color: '#0f172a' }}>
                                    {String(art.nom || art.designation || '').toUpperCase()}
                                </td>
                                
                                <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 'bold', color: '#4f46e5' }}>
                                    {formaterStockDisponible(art)}
                                </td>

                                <td style={{ ...tdStyle, textAlign: 'center', fontWeight: '600' }}>
                                    {Math.round(art.prixVente || art.prix_vendre || art.prix_vente || art.prix_unitaire || 0).toLocaleString()} F
                                </td>
                                
                                <td style={{ ...tdStyle, backgroundColor: isRowActive ? '#dde1ff' : '#f1f5f9', textAlign: 'center' }}>
                                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center' }}>
                                        
                                        {/* Saisie quantité Gros (ex: Cartons / Casiers) */}
                                        {coeff > 1 ? (
                                            <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#fff', border: isRowActive ? '2px solid #4f46e5' : '1px solid #cbd5e1', borderRadius: '6px', padding: '2px 6px' }}>
                                                <input 
                                                    type="text" 
                                                    inputMode="numeric"
                                                    placeholder="Gros" 
                                                    value={saisiesDepartGros[currentArtId] || ''} 
                                                    onFocus={() => setActiveRowId(currentArtId)} // 🎯 ENCLENCHE L'EFFET DE LIGNE ACTIVE SUR CLICK/FOCUS
                                                    onChange={(e) => setSaisiesDepartGros({ ...saisiesDepartGros, [currentArtId]: e.target.value.replace(/[^0-9]/g, '') })} 
                                                    style={{ 
                                                        ...inputStyle, 
                                                        border: 'none', 
                                                        backgroundColor: 'transparent', 
                                                        boxShadow: 'none',
                                                        padding: '4px 2px'
                                                    }} 
                                                />
                                                <span style={{ fontSize: '12px', fontWeight: '800', color: '#4f46e5', marginLeft: '4px', textTransform: 'uppercase' }}>{codeGros}</span>
                                            </div>
                                        ) : (
                                            <span style={{ fontSize: '13px', color: '#94a3b8', width: '115px', fontStyle: 'italic' }}>—</span>
                                        )}

                                                                            <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#64748b' }}>+</span>
                                        
                                        {/* Saisie quantité Détail (ex: Bouteilles / Pièces) */}
                                        <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#fff', border: isRowActive ? '2px solid #4f46e5' : '1px solid #cbd5e1', borderRadius: '6px', padding: '2px 6px' }}>
                                            <input 
                                                type="text" 
                                                inputMode="numeric"
                                                placeholder="Détail" 
                                                value={saisiesDepartDetail[currentArtId] || ''} 
                                                onFocus={() => setActiveRowId(currentArtId)} // 🎯 ENCLENCHE L'EFFET DE LIGNE ACTIVE SUR CLICK/FOCUS
                                                onChange={(e) => setSaisiesDepartDetail({ ...saisiesDepartDetail, [currentArtId]: e.target.value.replace(/[^0-9]/g, '') })} 
                                                style={{ 
                                                    ...inputStyle, 
                                                    border: 'none', 
                                                    backgroundColor: 'transparent', 
                                                    boxShadow: 'none',
                                                    padding: '4px 2px'
                                                }} 
                                                />
                                            <span style={{ fontSize: '12px', fontWeight: '800', color: '#4f46e5', marginLeft: '4px', textTransform: 'uppercase' }}>{refDetail}</span>
                                        </div>

                                    </div>
                                </td>
                                
                                <td style={{ ...tdStyle, textAlign: 'center' }}>
                                    <button 
                                        onClick={() => handleAjouterAuPanier(art)}
                                        style={{ padding: '8px 16px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px', boxShadow: '0 2px 4px rgba(37,99,235,0.2)' }}
                                    >
                                        <Plus size={14} /> CHARGER
                                    </button>
                                </td>
                            </tr>
                        );
                    })
                )}
            </tbody>
        </table>
    </div>
)}
{/* 4. 🛒 TABLEAU N°2 : PANIER DE LA TOURNÉE COMMERCIALE (S'ADAPTE À 100% DE LA PLACE LE SOIR) */}
<div style={{ 
    height: isModeEvening ? '70vh' : 'auto', 
    flex: isModeEvening ? 'initial' : 1, 
    padding: '0 30px', 
    overflowY: 'auto', 
    marginTop: '15px' 
}}>
    <p style={{ fontSize: '12px', fontWeight: '800', color: '#1e3a8a', margin: '0 0 8px 0', textTransform: 'uppercase' }}>
        2. Panier de Chargement & Feuille de Route de la Tournée
    </p>
    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <thead>
            <tr style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                <th style={{ ...tableHeaderStyle, width: '25%', textAlign: 'left' }}>DÉSIGNATION ARTICLE</th>
                <th style={{ ...tableHeaderStyle, width: '10%', textAlign: 'center' }}>P.U FACTURE</th>
                <th style={{ ...tableHeaderStyle, width: '20%', backgroundColor: '#1e3a8a', textAlign: 'center' }}>1. LE DÉPART (CHARGÉ)</th>
                <th style={{ ...tableHeaderStyle, width: '23%', backgroundColor: '#b91c1c', textAlign: 'center' }}>2. LE RETOUR (SOIR)</th>
                <th style={{ ...tableHeaderStyle, width: '12%', backgroundColor: '#15803d', textAlign: 'center' }}>3. VENTE DÉFINITIVE</th>
                <th style={{ ...tableHeaderStyle, width: '10%', textAlign: 'center' }}>TOTAL TTC NET</th>
            </tr>
        </thead>
        <tbody>
            {panierConsolide.length === 0 ? (
                <tr>
                    <td colSpan="6" style={{ ...tdStyle, textAlign: 'center', padding: '30px', color: '#64748b', fontStyle: 'italic' }}>
                        Le panier de la tournée est vide. Utilisez le catalogue supérieur pour charger des articles ce matin.
                    </td>
                </tr>
            ) : (
                panierConsolide.map((item, index) => {
                    const uniqueRowKey = item.id ? `bdd-id-${item.id}` : `panier-idx-${item.product_id}-${index}`;
                    
                    // 🔍 Extraction propre des métadonnées et suffixes logistiques (Ex: C12, BTS)
                    const { coeff, codeGros, refDetail } = ConversionStockService.getMetadata(item.article_complet || item);

                    // 🎯 DÉTECTION DE L'ÉTAT ACTIF DE LA LIGNE
                    const isRowActive = activeRowId === item.product_id;

                    return (
                        <tr 
                            key={uniqueRowKey} 
                            style={{ 
                                // 🎨 INDICATION GRAPHIQUE : Rouge si erreurRetour, Indigo si actif, Alterné sinon
                                backgroundColor: item.erreurRetour 
                                    ? '#fee2e2' 
                                    : isRowActive 
                                        ? '#e0e7ff' 
                                        : (index % 2 === 0 ? '#ffffff' : '#f8fafc'),
                                borderLeft: item.erreurRetour 
                                    ? '4px solid #ef4444' 
                                    : isRowActive 
                                        ? '4px solid #4f46e5' 
                                        : 'none',
                                transition: 'all 0.15s ease-in-out'
                            }}
                        >
                            {/* Désignation Article */}
                            <td style={{ ...tdStyle, textAlign: 'left', fontWeight: '700', color: item.erreurRetour ? '#b91c1c' : '#0f172a' }}>
                                {item.nom || item.nom_article_snap}
                            </td>
                            
                            {/* P.U Facture */}
                            <td style={{ ...tdStyle, textAlign: 'center', fontWeight: '600' }}>
                                {Math.round(item.prix_vente_unitaire || item.prix_vente || 0).toLocaleString('fr-FR')} F
                            </td>
                            
                            {/* 1. LE DÉPART (CHARGÉ) */}
                            <td style={{ ...tdStyle, backgroundColor: item.erreurRetour ? '#fee2e2' : isRowActive ? '#dde1ff' : '#eff6ff', textAlign: 'center' }}>
                                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', alignItems: 'center' }}>
                                    <span style={{ color: '#1e3a8a', fontWeight: '700' }}>{item.expression_charge}</span>
                                    
                                    {/* 🛠️ GESTION DU MATIN : DOUBLE BOUTON DE MODIFICATION DIRECTE ET DE SUPPRESSION */}
                                    {!isModeEvening && (
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                            <Edit2 
                                                size={13} 
                                                color="#2563eb" 
                                                title="Modifier la quantité de cette ligne"
                                                style={{ cursor: 'pointer' }} 
                                                onClick={() => {
                                                    // Extraction mathématique des colisages pour ré-alimenter les inputs du haut
                                                    const totalLignePieces = Math.abs(Number(item.qte_chargee_pieces || 0));
                                                    const grosReconstitue = Math.floor(totalLignePieces / coeff);
                                                    const detailReconstitue = Math.round(totalLignePieces % coeff);
                                                    
                                                    // Ré-injection instantanée dans les états d'inputs correspondants
                                                    setSaisiesDepartGros({ ...saisiesDepartGros, [item.product_id]: grosReconstitue > 0 ? grosReconstitue.toString() : '' });
                                                    setSaisiesDepartDetail({ ...saisiesDepartDetail, [item.product_id]: detailReconstitue > 0 ? detailReconstitue.toString() : '' });
                                                    
                                                    // Enclenchement du verrou d'édition
                                                    setEditingProductId(item.product_id);
                                                    setActiveRowId(item.product_id);
                                                    showToast(`✏️ Mode édition activé pour "${item.nom}". Modifiez les colisages en haut puis validez en cliquant sur CHARGER.`, "info");
                                                }} 
                                            />
                                            <Trash2 
                                                size={13} 
                                                color="#ef4444" 
                                                title="Supprimer la ligne"
                                                style={{ cursor: 'pointer' }} 
                                                onClick={() => handleSupprimerDuPanier(index)} 
                                            />
                                        </div>
                                    )}
                                </div>
                            </td>

                       {/* 2. LE RETOUR (SOIR) - ALIGNEMENT EXACT ET TRÈS FRAPPANT DU RETOUR DES MARCHANDISES */}
                            <td style={{ ...tdStyle, backgroundColor: item.erreurRetour ? '#fca5a5' : isRowActive ? '#dde1ff' : '#fff5f5', textAlign: 'center' }}>
                                {isModeEvening ? (
                                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center' }}>
                                        
                                        {/* Champ Gros : Affiché si coeff > 1, sinon remplacé par un tiret (ex: KG, LITRE) */}
                                        {coeff > 1 ? (
                                            <div style={{ 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                backgroundColor: '#fff', 
                                                border: item.erreurRetour ? '2px solid #dc2626' : isRowActive ? '2px solid #4f46e5' : '1px solid #cbd5e1', 
                                                borderRadius: '6px', 
                                                padding: '2px 8px' 
                                            }}>
                                                <input 
                                                    type="text" 
                                                    inputMode="numeric"
                                                    placeholder="Gros"
                                                    value={saisiesRetourGros[item.product_id] || ''} 
                                                    onFocus={() => setActiveRowId(item.product_id)} // 🎯 ILLUMINE LA LIGNE AU FOCUS DU CLAVIER
                                                    onChange={(e) => handleChangementSaisieRetourGros(item.product_id, e.target.value)}
                                                    style={{ 
                                                        ...inputStyle, 
                                                        border: 'none', 
                                                        backgroundColor: 'transparent', 
                                                        boxShadow: 'none', 
                                                        padding: '4px 2px' 
                                                    }}
                                                />
                                                <span style={{ fontSize: '12px', fontWeight: '800', color: '#4f46e5', marginLeft: '4px', textTransform: 'uppercase' }}>
                                                    {codeGros}
                                                </span>
                                            </div>
                                        ) : (
                                            <span style={{ fontSize: '13px', color: '#94a3b8', width: '115px', fontStyle: 'italic' }}>—</span>
                                        )}

                                        <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#64748b' }}>+</span>

                                        {/* Champ Détail */}
                                        <div style={{ 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            backgroundColor: '#fff', 
                                            border: item.erreurRetour ? '2px solid #dc2626' : isRowActive ? '2px solid #4f46e5' : '1px solid #cbd5e1', 
                                            borderRadius: '6px', 
                                            padding: '2px 8px' 
                                        }}>
                                            <input 
                                                type="text" 
                                                inputMode="numeric"
                                                placeholder="Détail"
                                                value={saisiesRetourDetail[item.product_id] || ''} 
                                                onFocus={() => setActiveRowId(item.product_id)} // 🎯 ILLUMINE LA LIGNE AU FOCUS DU CLAVIER
                                                onChange={(e) => handleChangementSaisieRetourDetail(item.product_id, e.target.value)}
                                                style={{ 
                                                    ...inputStyle, 
                                                    border: 'none', 
                                                    backgroundColor: 'transparent', 
                                                    boxShadow: 'none', 
                                                    padding: '4px 2px' 
                                                }}
                                            />
                                            <span style={{ fontSize: '12px', fontWeight: '800', color: '#4f46e5', marginLeft: '4px', textTransform: 'uppercase' }}>
                                                {refDetail}
                                            </span>
                                        </div>

                                    </div>
                                ) : (
                                    <span style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>🔒 Saisie disponible au soir</span>
                                )}
                            </td>

{/* 3. VENTE DÉFINITIVE RECONVERTIE SANS ERREUR */}
                            <td style={{ ...tdStyle, backgroundColor: item.erreurRetour ? '#fee2e2' : isRowActive ? '#dde1ff' : '#f0fdf4', color: item.erreurRetour ? '#dc2626' : '#15803d', fontWeight: '850', textAlign: 'center' }}>
                                {item.venduFormatee}
                            </td>

                            {/* TOTAL TTC LIGNE - SÉCURISÉ AVEC LE CALCUL COMPTABLE DIRECT */}
                            <td style={{ ...tdStyle, textAlign: 'center', fontWeight: '800', color: item.erreurRetour ? '#dc2626' : '#0f172a' }}>
                                {Math.round(item.total_ttc_net || item.totalTtcLigne || 0).toLocaleString()} F
                            </td>
                        </tr>
                    );
                })
            )}
        </tbody>
    </table>
</div>
{/* 5. PIED DE PAGE DYNAMIQUE ACCROCHÉ AU BAS DE L'ÉCRAN (ÉPURÉ DES SÉLECTEURS DOUBLONS) */}
                                {panierTournee.length > 0 && (
                    <footer style={{ backgroundColor: '#f1f5f9', padding: '16px 30px', borderTop: '2px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div style={{ fontSize: '15px', fontWeight: '800', color: '#0f172a' }}>
                                {isModeEvening ? (
                                    <>RECETTE NETTE À ENCAISSER : <span style={{ color: panierConsolide.some(item => item.erreurRetour) ? '#ef4444' : '#16a34a', fontSize: '20px' }}>{Math.round(recetteTotaleAEncaisser).toLocaleString()} F</span></>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <div style={{ fontSize: '15px', fontWeight: '950', color: '#1e3a8a' }}>
                                            VALEUR TOTALE DU CHARGEMENT : <span style={{ fontSize: '20px', color: '#2563eb' }}>{Math.round(montantChargement).toLocaleString()} F</span>
                                        </div>
                                        
                                        {/* 📊 🎯 RENDU INJECTÉ DU RÉCAPITULATIF DES UNITÉS SÉPARÉES ET SEGMENTÉES SANS MÉLANGE */}
                                        {recapUnites && recapUnites.length > 0 && (
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginTop: '2px' }}>
                                                <span style={{ fontSize: '11px', fontWeight: '800', color: '#475569', textTransform: 'uppercase' }}>Résumé Global :</span>
                                                {recapUnites.map((uniteRow, idx) => (
                                                    <span key={idx} style={{ fontSize: '11px', fontWeight: 'bold', background: '#e0e7ff', border: '1px solid #c7d2fe', padding: '3px 8px', borderRadius: '4px', color: '#4338ca', fontFamily: 'monospace' }}>
                                                        {uniteRow.unite}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                            {/* 🔍 BOUTON ANNULER (Affiché uniquement en mode Édition ou Clôture du soir) */}
                            {isModeEdition && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        // 1. Nettoyage complet des données locales de travail (Gros + Détail)
                                        setPanierTournee([]);
                                        if (typeof setSaisiesRetourGros === 'function') setSaisiesRetourGros({});
                                        if (typeof setSaisiesRetourDetail === 'function') setSaisiesRetourDetail({});
                                        setSelectedStaffId('');
                                        
                                        // 🚯 REMISE À BLANC TOTALE SANS PRÉ-SÉLECTION
                                        setFormatImpression('');
                                        setSelectedMethodId('');
                                        
                                        // 🎯 REGENERATION AUTOMATIQUE ET TECHNIQUE DU NUMÉRO DE LOT
                                        if (typeof genererNouveauTourId === 'function') {
                                            setCurrentTourId(genererNouveauTourId());
                                        } else {
                                            setCurrentTourId(`TOUR-${Date.now().toString().slice(-4)}${Math.floor(10 + Math.random() * 90)}`);
                                        }
                                        
                                        // 2. Nettoyage des filtres de l'URL pour repasser en mode création standard (Matin)
                                        setSearchParams({}, { replace: true });
                                        
                                        showToast("💡 Modification/Clôture annulée. Retour au mode création.", "info");
                                    }}
                                    disabled={isSaving}
                                    style={{
                                        padding: '12px 24px',
                                        backgroundColor: '#64748b', 
                                        color: '#fff',
                                        border: 'none',
                                        borderRadius: '6px',
                                        cursor: isSaving ? 'not-allowed' : 'pointer',
                                        fontWeight: 'bold',
                                        fontSize: '14px'
                                    }}
                                >
                                    ANNULER
                                </button>
                            )}

                    {/* CYCLAGE DU BOUTON D'ACTION PRINCIPALE (ENREGISTRER / MODIFIER / CLÔTURER) */}
                            <button 
                                type="button"
                                onClick={handleActionPrincipaleGrille}
                                // 🚯 BLOQUER LE BOUTON AUSSI SI LES SÉLECTIONS OBLIGATOIRES DU SOIR SONT VIDES EN HAUT
                                disabled={
                                    isSaving || 
                                    panierConsolide.some(item => item.erreurRetour) ||
                                    (isModeEvening && (!selectedMethodId || !formatImpression))
                                }
                                style={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '8px', 
                                    padding: '12px 28px', 
                                    backgroundColor: isSaving 
                                        ? '#94a3b8' 
                                        : panierConsolide.some(item => item.erreurRetour)
                                            ? '#ef4444' // Rouge Erreur Bloquante
                                            : (isModeEvening && (!selectedMethodId || !formatImpression))
                                                ? '#f97316' // Orange d'avertissement si sélections manquantes
                                                : isModeEvening 
                                                    ? '#10b981' // Vert Clôture
                                                    : isModeEdition 
                                                        ? '#ea580c' // Orange Mise à jour
                                                        : '#2563eb', // Bleu Enregistrement Initial
                                    color: '#fff', 
                                    border: 'none', 
                                    borderRadius: '6px', 
                                    cursor: (isSaving || panierConsolide.some(item => item.erreurRetour) || (isModeEvening && (!selectedMethodId || !formatImpression))) ? 'not-allowed' : 'pointer', 
                                    fontWeight: 'bold', 
                                    fontSize: '14px',
                                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                                    transition: 'background-color 0.2s ease'
                                }}
                            >
                                {isSaving ? (
                                    <RefreshCw size={18} className="spin" />
                                ) : (
                                    <CheckCircle size={18} />
                                )}
                                
                                {isSaving ? "Traitement ERP..." : (
                                    panierConsolide.some(item => item.erreurRetour)
                                        ? "⚠️ QUANTITÉ RETOUR INVALIDE"
                                        : isModeEvening && (!selectedMethodId || !formatImpression)
                                            ? "⚠️ SÉLECTIONNEZ CAISSE & FORMAT EN HAUT"
                                            : isModeEvening 
                                                ? "CLÔTURER DÉFINITIVEMENT LA TOURNÉE" 
                                                : isModeEdition 
                                                    ? "METTRE À JOUR LE CHARGEMENT" 
                                                    : "ENREGISTRER LE CHARGEMENT"
                                )}
                            </button>
                        </div>
                    </footer>
                )}
            </main>

            {/* 🎯 RENDU DU COMPOSANT D'IMPRESSION COMPATIBLE COUPLAGE USEREACTTOPRINT */}
            {donneesVenteAImprimer && (
                /* 🎯 LE PORTEUR DE LA REF EST LA DIV CONTENEUR DU BLOC D'IMPRESSION HORS-ECRAN */
                <div ref={componentRef} className="print-section-wrapper">
                    <TournerPrint 
                        format={donneesVenteAImprimer.format}
                        // 🎯 INJECTION DIRECTE DE L'OBJET DYNAMIQUE ISSU DE /COMPANY/SETTINGS
                        company={dynamiqueCompanyPrint}
                        data={{
                            saleId: donneesVenteAImprimer.saleId,
                            lot_id: donneesVenteAImprimer.lot_id,
                            staff_name: donneesVenteAImprimer.staff_name,
                            caissierName: donneesVenteAImprimer.caissierName,
                            mode_reglement: donneesVenteAImprimer.mode_reglement,
                            total: donneesVenteAImprimer.total,
                            date: donneesVenteAImprimer.date,
                            format: donneesVenteAImprimer.format,
                            articles: donneesVenteAImprimer.articles
                        }}
                        // 🎯 INJECTION FINALE DU TABLEAU RECAPITULATIF AU TEMPLATE D'IMPRESSION FEUILLE DE ROUTE
                        recapUnites={donneesVenteAImprimer.recapUnites || []}
                    />
                </div>
            )}

<style>{`
                .spin { animation: spin 1s linear infinite; }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                
                /* 🖥️ RENDU HORS-ÉCRAN POUR L'AFFICHAGE STANDARD EN MODE SANS CONFLIT */
                .print-section-wrapper {
                    position: absolute !important;
                    left: -9999px !important;
                    top: -9999px !important;
                    opacity: 0 !important;
                }
                
                /* 🖨️ DIRECTIVES DIRECTES MEDIA PRINT NETTES ET SANS CONFLIT */
                @media print {
                    /* On masque l'application racine globale */
                    #root, .dashboard-layout, main, header, sidebar, nav, footer { 
                        display: none !important; 
                    }
                    
                    /* On isole et force l'affichage du wrapper d'impression */
                    body .print-section-wrapper { 
                        display: block !important; 
                        position: absolute !important; 
                        left: 0 !important; 
                        top: 0 !important; 
                        width: 100% !important; 
                        opacity: 1 !important;
                        z-index: 9999999 !important; 
                        background: #ffffff !important;
                    }

                    /* On s'assure que les enfants (les lignes du reçu) ne soient pas masqués */
                    .print-section-wrapper * {
                        opacity: 1 !important;
                    }
                }
            `}</style>
        </div>
    );
};

export default GrilleTourneeCommercialeUnique;
