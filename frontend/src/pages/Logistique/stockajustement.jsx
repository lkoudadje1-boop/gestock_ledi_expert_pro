import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    Search, Trash2, Save, XCircle, ScanBarcode, 
    ArrowLeft, CheckCircle, Package, RefreshCcw, 
    FileText, Edit3, ArrowRightLeft, Loader2, Printer, 
    Plus, CircleEllipsis // 🚀 LE FIX : Ajout de l'icône CircleEllipsis manquante ici !
} from 'lucide-react';

import { useReactToPrint } from 'react-to-print';

// Utilisation de l'instance API centralisée
import API, { socket } from '../../services/api'; 
import Sidebar from '../../components/Sidebar';

// 🚀 SERVICE CENTRALISÉ DE CONVERSION LOGISTIQUE FRONTEND
import { ConversionStockService } from '../../utils/converisonstock';

// 🛡️ FORMATEUR FINANCIER GLOBAL DU LOGICIEL
const fmt = (valeur) => {
    if (valeur === undefined || valeur === null || isNaN(valeur)) return "0";
    return new Intl.NumberFormat('fr-FR', {
        style: 'decimal',
        minimumFractionDigits: 0
    }).format(valeur);
};

const StockAjustement = () => {
    const navigate = useNavigate();
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    const USER_ID = currentUser.id || 'USR-1';
    const COMPANY_ID = currentUser.company_id || currentUser.companyId || 'CPY-1';
    
    // --- ÉTATS (STATES) ---
    const panierEndRef = useRef(null);
    const [articles, setArticles] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [searchBarCode, setSearchBarCode] = useState('');
    const [selectedArt, setSelectedArt] = useState(null);
    
    // 🛡️ PERSISTANCE LOCALE ELECTRON : Lecture immédiate au démarrage de l'application
    const [panier, setPanier] = useState(() => {
        const backup = localStorage.getItem(`ajustement_backup_${USER_ID}`);
        return backup ? JSON.parse(backup) : [];
    });

    // 🛡️ TRIPLE CANAL DE SAISIE LOGISTIQUE (Gros / Détail séparés pour interdire le calcul mental)
    const [saisieGros, setSaisieGros] = useState(''); 
    const [saisieDetail, setSaisieDetail] = useState(''); 
    const [inputObs, setInputObs] = useState('');

    // --- SÉCURITÉS ET CONTEXTE ---
    const [editingId, setEditingId] = useState(null); 
    const [isLocked, setIsLocked] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [alertMsg, setAlertMsg] = useState({ text: '', type: '' });
    const [formatImpression, setFormatImpression] = useState('A4');

    // --- EN-TÊTE DE L'AJUSTEMENT (À blanc pour forcer la sélection obligatoire à la fin) ---
    const [header, setHeader] = useState(() => {
        const backupHeader = localStorage.getItem(`ajustement_header_backup_${USER_ID}`);
        return backupHeader ? JSON.parse(backupHeader) : {
            libelle: '', 
            type_ajustement: '', // 🔒 Reste strictement vide au début
            motif: '',
            date: new Date().toISOString().split('T')[0]
        };
    });

    // --- PARAMÈTRES SOCIÉTÉ ET CONFIGURATION D'IMPRESSION ---
    const printRef = useRef();
    const [printData, setPrintData] = useState(null);
    const [dynamiqueCompanyPrint, setDynamiqueCompanyPrint] = useState({
        name: currentUser.company_name || currentUser.companyName || "LEDI EXPERT PRO",
        address: currentUser.company_address || currentUser.companyAddress || "Adresse non renseignée",
        phone: currentUser.company_phone || currentUser.companyPhone || "Tél: N/A",
        email: currentUser.company_email || currentUser.companyEmail || "Email: N/A",
        logo_data: currentUser.company_logo || currentUser.logo_data || currentUser.logo || null
    });

    // Défilement automatique du panier
    useEffect(() => {
        if (panier.length > 8) {
            panierEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }
    }, [panier]);

    // 🚀 RECTIFICATION LOGISTIQUE INTERNE : Alignement parfait sur le dictionnaire de conversion unique
    const formaterStockPOS = useCallback((art) => {
        if (!art) return "-";
        const valeurStock = art.stock_actuel !== undefined ? art.stock_actuel : (art.stock || 0);
        if (typeof valeurStock === 'string' && valeurStock.includes('+')) {
            return valeurStock.replace(/-/g, '');
        }
        const qtePieces = Math.abs(Number(valeurStock)) || 0;
        return ConversionStockService.toExpressionTextuelle(qtePieces, art);
    }, []);

    // --- ALERTE ET TOAST COMPATIBLE POS ---
    const showToast = useCallback((text, type = 'success') => {
        setAlertMsg({ text, type });
        setTimeout(() => setAlertMsg({ text: '', type: '' }), 3000);
    }, []);

    // --- MISE À ZÉRO COMPLÈTE DE L'INTERFACE (AVEC NETTOYAGE DU LOCALSTORAGE) ---
    const viderInterfaceLocale = useCallback(() => {
        setPanier([]);
        setEditingId(null);
        setSelectedArt(null);
        setSaisieGros('');
        setSaisieDetail('');
        setInputObs('');
        setHeader({
            libelle: '',
            type_ajustement: '',
            motif: '',
            date: new Date().toISOString().split('T')[0]
        });
        localStorage.removeItem(`ajustement_backup_${USER_ID}`);
        localStorage.removeItem(`ajustement_header_backup_${USER_ID}`);
    }, [USER_ID]);

    // --- CHARGEMENT ASYNCHRONE COORDONNÉES SOCIÉTÉ ---
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

       // --- CHARGEMENT DU CATALOGUE D'ARTICLES D'AJUSTEMENT ---
    const fetchArticles = useCallback(async () => {
        try {
            // 🚀 FIX MULTI-ENTREPRISE : Ajout obligatoire de la query companyId pour le cloisonnement BDD
            const res = await API.get(`/stock-adjustments/products?companyId=${COMPANY_ID}`);
            if (res.data && res.data.success) {
                setArticles(Array.isArray(res.data.products) ? res.data.products : []);
            } else {
                setArticles(Array.isArray(res.data) ? res.data : []);
            }
        } catch (err) { 
            console.error("❌ Erreur chargement catalogue ajustements:", err); 
            showToast("Impossible de charger le catalogue d'articles", "error");
        }
    }, [COMPANY_ID, showToast]);

    // --- VERIFICATION DU VERROU DE SÉCURITÉ INVENTAIRE ---
    const checkInventoryLock = useCallback(async () => {
        try {
            const res = await API.get('/inventories/check-status');
            setIsLocked(!!res.data.en_cours);
        } catch (err) { 
            console.error("❌ Erreur check lock inventaire:", err); 
            setIsLocked(false);
        }
    }, []);

    // --- CYCLE DE VIE INITIAL ---
    useEffect(() => {
        fetchArticles();
        checkInventoryLock();
    }, [fetchArticles, checkInventoryLock]);

    // 🚀 SYNCHRONISATION EN TEMPS RÉEL INTER-POSTES (WEB_SOCKETS ET CUSTOM_EVENTS)
    useEffect(() => {
        const rafraichirDonneesArticles = () => fetchArticles();

        if (socket) {
            socket.on('STOCK_UPDATED', rafraichirDonneesArticles);
            socket.on('REFRESH_STOCK', rafraichirDonneesArticles);
            socket.on('DATA_EVENT', (data) => {
                if (data.table === 'products' || data.table === 'stock_adjustments') rafraichirDonneesArticles();
            });
        }

        const handleUpdate = (event) => {
            const { table, status } = event.detail;

            if (table === 'products' || table === 'all') {
                fetchArticles();
            }

            if (table === 'inventory') {
                setIsLocked(status);
            }
        };

        window.addEventListener('ERP_DATA_CHANGED', handleUpdate);
        return () => {
            window.removeEventListener('ERP_DATA_CHANGED', handleUpdate);
            if (socket) {
                socket.off('STOCK_UPDATED', rafraichirDonneesArticles);
                socket.off('REFRESH_STOCK', rafraichirDonneesArticles);
                socket.off('DATA_EVENT');
            }
        };
    }, [fetchArticles]);

    // 🔒 WATCHER DE SÉCURITÉ ELECTRON : Sauvegarde automatique à la moindre frappe ou modification
    useEffect(() => {
        localStorage.setItem(`ajustement_backup_${USER_ID}`, JSON.stringify(panier));
        localStorage.setItem(`ajustement_header_backup_${USER_ID}`, JSON.stringify(header));
    }, [panier, header, USER_ID]);

        // 🛡️ RECHERCHE AUTOMATIQUE PAR SCANNER SANS TOUCHE ENTRÉE (STABILISÉE)
    useEffect(() => {
        const barcodeNettoye = searchBarCode.trim();
        if (barcodeNettoye === '') return;

        // ⏱️ ANTI-REBOND RAPIDE : On attend que la douchette finisse d'envoyer toute sa chaîne
        const delayDebounceFn = setTimeout(() => {
            const art = articles.find(a => 
                String(a.barcode || a.codeBarre || a.code_barre || '').trim() === barcodeNettoye
            );
            
            if (art) { 
                setSelectedArt(art); 
                setSearchBarCode(''); // 🧼 Vide l'input pour le scan suivant
                setSearchTerm('');    // 🚀 CRITIQUE : Vide la recherche texte pour que le tableau se focus sur lui !
                setSaisieGros('');    
                setSaisieDetail('');
                showToast(`🎯 Article détecté : ${art.nom?.toUpperCase()}`);
            }
        }, 120); 

        return () => clearTimeout(delayDebounceFn);
    }, [searchBarCode, articles, showToast]);


    // --- CALCUL SECURISE SANS DECALAGE DECIMAL ---
    const totalGeneralAjustement = useMemo(() => {
        return panier.reduce((sum, item) => sum + Number(item.valeur_ligne || 0), 0);
    }, [panier]);

    // --- GESTIONNAIRE D'AJOUT ET ÉDITION DANS LE PANIER ---
    const handleAjouterArticle = useCallback(() => {
        if (!selectedArt) {
            showToast("Veuillez sélectionner un article.", "error");
            return;
        }

        // 🚀 NETTOYAGE STRICT ANTI-NÉGATIF : Gros + Détail scindés sans signe moins
        const gClean = String(saisieGros || '0').replace(/-/g, '').replace(',', '.').trim();
        const dClean = String(saisieDetail || '0').replace(/-/g, '').replace(',', '.').trim();

        const valGros = Math.abs(parseFloat(gClean) || 0);
        const valDetail = Math.abs(parseFloat(dClean) || 0);

        if (valGros === 0 && valDetail === 0) {
            showToast("La quantité à ajuster doit être supérieure à 0.", "error");
            return;
        }

        // 🛡️ EXTRACTION MULTI-PROPRIETES DU COEFFICIENT LOGISTIQUE
        const coeffLogistique = Math.abs(Number(selectedArt.unit_coefficient || selectedArt.coefficient || 1)) || 1;

        // ÉVALUATION DE LA DEMANDE COURANTE EN PIÈCES NATIVES DE DÉTAIL
        const quantiteTotalePieces = Math.round(valGros * coeffLogistique) + Math.round(valDetail);

        // 🛡️ EXTRACTION STRICTE DU STOCK DISPONIBLE EN PIÈCES NATIVES UNITAIRES
        const stockBrutBDD = selectedArt.stock_actuel !== undefined ? selectedArt.stock_actuel : (selectedArt.stock || 0);
        let stockTotalDisponiblePieces = 0;

        if (typeof stockBrutBDD === 'string' && stockBrutBDD.includes('+')) {
            const parties = stockBrutBDD.split('+');
            const grosEntiers = Math.abs(parseFloat(parties[0]) || 0);
            const detailRestants = Math.abs(parseFloat(parties[1]) || 0);
            stockTotalDisponiblePieces = (grosEntiers * coeffLogistique) + detailRestants;
        } else {
            const valeurBruteNettoyee = typeof stockBrutBDD === 'string' ? parseFloat(stockBrutBDD.replace(/-/g, '')) : Number(stockBrutBDD);
            stockTotalDisponiblePieces = Math.abs(valeurBruteNettoyee) || 0;
        }

        let stockApresMouvement = stockTotalDisponiblePieces;

        // Évaluation logistique préventive selon le type d'opération (Avarie, Brise, Transfert)
        if (header.type_ajustement === 'AVARIE' || header.type_ajustement === 'BRISE' || header.type_ajustement === 'TRANSFERT') {
            stockApresMouvement = stockTotalDisponiblePieces - quantiteTotalePieces;
        }

        // 🔒 LOCK DE RUPTURE STRICT : Évitons les stocks négatifs
        if (stockApresMouvement < 0) {
            const expressionDispoTxt = formaterStockPOS({ ...selectedArt, stock_actuel: stockTotalDisponiblePieces });
            showToast(`❌ Ajustement refusé ! Disponible en magasin : ${expressionDispoTxt}`, "error");
            return;
        }

               // Valorisation financière de la ligne au coût d'achat (CMP) figée sans décalage
        const prixAchatSnap = Number(selectedArt.prixAchat || selectedArt.prix_achat || 0);
        const prixVenteSnap = Number(selectedArt.prixVente || selectedArt.prix_vente || 0);
        
        // 🎯 FIX CHIRURGICAL COÛT DÉTAIL : Prix d'une bouteille/unité = Prix du carton divisé par le coefficient
        const prixAchatUnitaireDetail = coeffLogistique > 0 ? (prixAchatSnap / coeffLogistique) : prixAchatSnap;
        const valeurLigneCalculee = Math.round(quantiteTotalePieces * prixAchatUnitaireDetail);

        // Récupération des métadonnées d'unités pour l'expression textuelle
        const meta = ConversionStockService.getMetadata?.(selectedArt) || {};
        const codeGrosNet = (meta.codeGros || selectedArt.unit_code_gros || 'CS').toUpperCase();
        const refDetailNet = (meta.refDetail || selectedArt.unit_ref_detail || 'PCS').replace(/\(s\)/g, '').toUpperCase();

        let expressionQuantiteSaisie = "";
        if (valGros > 0 && valDetail > 0) expressionQuantiteSaisie = `${valGros} ${codeGrosNet} + ${valDetail} ${refDetailNet}`;
        else if (valGros > 0) expressionQuantiteSaisie = `${valGros} ${codeGrosNet}`;
        else expressionQuantiteSaisie = `${valDetail} ${refDetailNet}`;

        if (editingId) {
            // Mode Modification
            setPanier(prev => prev.map(item => item.product_id === editingId ? {
                ...item,
                quantite: quantiteTotalePieces,
                expression_quantite: expressionQuantiteSaisie,
                stock_avant: stockTotalDisponiblePieces,
                stock_apres: stockApresMouvement,
                prix_achat_snap: Number(Number(prixAchatUnitaireDetail).toFixed(2)), 
                valeur_ligne: valeurLigneCalculee,
                observation: inputObs
            } : item));
            setEditingId(null);
            showToast("Ligne d'ajustement modifiée avec succès.");
        } else {
            // Mode Nouvel Ajout (Évite les doublons)
            const existeDeja = panier.some(item => item.product_id === selectedArt.id);
            if (existeDeja) {
                showToast("Cet article est déjà présent dans le panier. Modifiez sa ligne.", "error");
                return;
            }

            setPanier(prev => [...prev, {
                product_id: selectedArt.id,
                nom: selectedArt.nom,
                barcode: selectedArt.barcode || selectedArt.codeBarre || selectedArt.code_barre,
                prix_achat_snap: Number(Number(prixAchatUnitaireDetail).toFixed(2)), 
                prix_vente_snap: prixVenteSnap,
                unite_snap: refDetailNet,
                quantite: quantiteTotalePieces,
                expression_quantite: expressionQuantiteSaisie,
                stock_avant: stockTotalDisponiblePieces,
                stock_apres: stockApresMouvement,
                valeur_ligne: valeurLigneCalculee,
                observation: inputObs
            }]);
            showToast("Article ajouté au panier d'ajustement.");
        }

        // Réinitialisation des champs de saisie
        setSelectedArt(null);
        setSaisieGros('');
        setSaisieDetail('');
        setInputObs('');
    }, [selectedArt, saisieGros, saisieDetail, header.type_ajustement, panier, editingId, inputObs, showToast, formaterStockPOS]);

    const handleSupprimerLigne = useCallback((productId) => {
        setPanier(prev => prev.filter(item => item.product_id !== productId));
        showToast("Ligne retirée du panier.");
        if (editingId === productId) {
            setEditingId(null);
            setSelectedArt(null);
            setSaisieGros('');
            setSaisieDetail('');
            setInputObs('');
        }
    }, [editingId, showToast]);

    const handleEditerLigne = useCallback((item) => {
        const artOrigine = articles.find(a => a.id === item.product_id);
        if (!artOrigine) return;

        setEditingId(item.product_id);
        setSelectedArt(artOrigine);
        
        const coeff = Number(artOrigine.unit_coefficient || artOrigine.coefficient || 1);
        const totalPieces = Number(item.quantite || 0);

        if (coeff > 1) {
            setSaisieGros(Math.floor(totalPieces / coeff) || '');
            setSaisieDetail((totalPieces % coeff) || '');
        } else {
            setSaisieGros('');
            setSaisieDetail(totalPieces || '');
        }
        setInputObs(item.observation || '');
    }, [articles]);

    // --- GESTIONNAIRE D'IMPRESSION SANS DÉCALAGE DE RENDU COMPTABLE ---
    const handlePrintTrigger = useReactToPrint({
        content: () => printRef.current,
        documentTitle: `Ajustement_Stock_${printData?.id || 'Rapport'}`,
        onBeforeGetContent: () => {
            return new Promise((resolve) => {
                console.log(`🖨️ [REACT-TO-PRINT] Capture figée pour le format d'ajustement : ${formatImpression}`);
                setTimeout(() => {
                    resolve();
                }, 150);
            });
        },
        onAfterPrint: () => {
            console.log("✅ Fenêtre d'impression de l'ajustement fermée.");
            setPrintData(null);
        }
    });

// --- ACTION FINALE DE VALIDATION ET ENVOI DE LA TRANSACTION AU BACKEND ---
// --- ACTION FINALE DE VALIDATION ET ENVOI DE LA TRANSACTION AU BACKEND ---
const handleValiderAjustement = async () => {
    if (isLocked || isSaving) return;

    // 🔒 LOCK MÉTIER REQUIS 1 : Saisie obligatoire du Libellé / Référence par l'opérateur
    if (!header.libelle || !header.libelle.trim()) {
        showToast("❌ Veuillez saisir obligatoirement un libellé ou référence pour cette opération.", "error");
        return;
    }

    // 🔒 LOCK MÉTIER REQUIS 2 : Validation obligatoire du choix du mouvement logistique
    if (!header.type_ajustement || header.type_ajustement === '') {
        showToast("❌ Veuillez sélectionner obligatoirement un type de mouvement logistique (Avarie, Brise...).", "error");
        return;
    }

    if (panier.length === 0) {
        showToast("Le panier d'ajustement est vide.", "error");
        return;
    }

    setIsSaving(true);

    // Nettoyage sémantique des espaces superflus avant envoi
    const libelleFinal = header.libelle.trim();
    const motifFinal = (header.motif && header.motif.trim() !== '') ? header.motif.trim() : null;

    try {
        // 🚀 DOUBLE PAYLOAD SÉCURISÉ : Fournit les données encapsulées ET à plat 
        const payload = {
            // Option A : Pour le backend qui déstructure req.body.adjustmentData
            adjustmentData: {
                libelle: libelleFinal,
                type_ajustement: header.type_ajustement,
                motif: motifFinal,
                entrepot_depart_id: null,
                entrepot_arrivee_id: null
            },
            // Option B : Pour le backend qui déstructure directement depuis req.body (A plat)
            libelle: libelleFinal,
            type_ajustement: header.type_ajustement,
            motif: motifFinal,
            entrepot_depart_id: null,
            entrepot_arrivee_id: null,

            // Tableau d'items envoyé au serveur (en pièces unitaire de détail natives)
            items: panier.map(item => ({
                product_id: item.product_id,
                quantite: Number(item.quantite)
            })),

            // Contexte utilisateur commun
            userContext: {
                secureUserId: USER_ID,
                secureCompanyId: COMPANY_ID,
                userName: currentUser.name || currentUser.username || 'Utilisateur Système'
            }
        };

        console.log("✈️ [ENVOI API AJUSTEMENT]:", JSON.stringify(payload));

        let response;
        try {
            response = await API.post('/stock-adjustments/create', payload);
        } catch (routeErr) {
            if (routeErr.response?.status === 404 || routeErr.response?.status === 400) {
                console.warn("⚠️ Échec sur /create, tentative de repli sur la route racine /stock-adjustments...");
                response = await API.post('/stock-adjustments', payload);
            } else {
                throw routeErr;
            }
        }

        if (response.data && response.data.success) {
            const docId = response.data.id || 'AJ-OK';
            const currentTotal = response.data.valeur_totale || totalGeneralAjustement;
            
            showToast(`🎉 Ajustement validé avec succès (${header.type_ajustement})`);
            
            const sessionAImprimer = {
                id: docId,
                nom_utilisateur: currentUser.name || currentUser.username || 'Opérateur',
                statut: 'VALIDE',
                date_cloture: new Date().toISOString(),
                valeur_ecart_totale: currentTotal,
                type_ajustement: header.type_ajustement,
                libelle: libelleFinal,
                
                // 🚀 HARMONISATION TECHNIQUE APPRÊTÉE POUR LE COMPOSANT D'IMPRESSION EXTERNE :
                items: panier.map(item => {
                    const articleCatalogue = articles.find(a => a.id === item.product_id) || {};
                    const coeff = Math.abs(Number(articleCatalogue.unit_coefficient || 1)) || 1;
                    
                    const prixAchatCartonBrut = Number(item.prix_achat_snap || articleCatalogue.prixAchat || articleCatalogue.cmp || 0);

                    return {
                        ...item,
                        nom_article_snap: item.nom,
                        stock_theorique_net: formaterStockPOS({ stock_actuel: item.stock_avant, ...articleCatalogue }),
                        stock_reel_net: formaterStockPOS({ stock_actuel: item.stock_apres, ...articleCatalogue }),
                        ecart_net: `-${item.expression_quantite || item.quantite}`, 
                        prix_achat_snap: prixAchatCartonBrut, 
                        valeur_ligne: item.valeur_ligne,
                        valeur_ecart_net: item.valeur_ligne
                    };
                })
            };

            setPrintData(sessionAImprimer);
            
            localStorage.removeItem(`ajustement_backup_${USER_ID}`);
            localStorage.removeItem(`ajustement_header_backup_${USER_ID}`);

            setPanier([]);
            if (socket) {
                socket.emit('STOCK_UPDATED'); 
            }

            setTimeout(() => {
                viderInterfaceLocale();
                fetchArticles(); 
            }, 100);

        } else {
            showToast(response.data?.message || "Erreur lors de la validation de l'ajustement.", "error");
        }
    } catch (err) {
        console.error("❌ Échec de l'enregistrement de l'ajustement :", err);
        const errMsg = err.response?.data?.message || err.response?.data?.error || "Une erreur serveur est survenue.";
        showToast(`Erreur : ${errMsg}`, "error");
    } finally {
        setIsSaving(false);
    }
};



    return (
        <div style={layoutStyle}>
            <Sidebar />
            
            <main style={{ ...mainStyle, flexDirection: 'column' }}>
                
                {/* 🚀 TOAST INTEGRÉ DE SÉCURITÉ : Fixé en haut de l'écran, calqué sur NouvelleVente */}
                {alertMsg.text && (
                    <div style={{
                        ...toastStyle,
                        backgroundColor: alertMsg.type === 'error' ? '#DC2626' : '#10B981'
                    }}>
                        {alertMsg.type === 'error' ? <XCircle size={16} /> : <CheckCircle size={16} />}
                        <span>{alertMsg.text.toUpperCase()}</span>
                    </div>
                )}

                {/* 🔒 BANDEAU FIXE DE VERROUILLAGE DE SÉCURITÉ INVENTAIRE */}
                {isLocked && (
                    <div style={{
                        position: 'fixed',
                        top: '20px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        backgroundColor: '#FEF2F2',
                        border: '2px solid #EF4444',
                        borderRadius: '8px',
                        padding: '12px 20px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                        zIndex: 9999,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '15px'
                    }}>
                        <XCircle size={24} color="#EF4444" />
                        <div>
                            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 'bold', color: '#991B1B' }}>
                                INVENTAIRE EN COURS
                            </h4>
                            <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#7F1D1D' }}>
                                Les ajustements et pertes de stocks sont bloqués durant le comptage physique.
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', marginLeft: '10px' }}>
                            <button 
                                type="button" 
                                onClick={() => navigate('/')} 
                                style={{ ...btnAnnuler, padding: '4px 10px', fontSize: '12px', height: 'auto' }}
                            >
                                <ArrowLeft size={12} /> Quitter
                            </button>
                            <button 
                                type="button" 
                                onClick={() => checkInventoryLock()} 
                                style={{ ...btnEnregistrer, padding: '4px 10px', fontSize: '12px', height: 'auto' }}
                            >
                                Actualiser
                            </button>
                        </div>
                    </div>
                )}
{/* EN-TÊTE PRINCIPALE AJUSTÉE AVEC SÉLECTION LOGISTIQUE STRICTE OBLIGATOIRE */}
                <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#ffffff', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '16px 20px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', marginBottom: '4px', width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1 }}>
                        <div style={{ padding: '12px', background: '#DC2626', color: '#ffffff', borderRadius: '12px', boxShadow: '0 4px 12px rgba(220, 38, 38, 0.15)' }}>
                            <Package size={24} />
                        </div>
                        <div>
                            <h1 style={{ fontSize: '18px', fontWeight: '900', trackingTight: '-0.025em', color: '#0F172A', margin: 0 }}>AJUSTEMENTS & PERTES DE STOCK</h1>
                            <p style={{ fontSize: '11px', color: '#64748B', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '2px 0 0 0' }}>Avaries • Brises • Casses • Mouvements Magasin</p>
                        </div>
                    </div>
                    
                   {/* ZONE DE CHOIX DU TYPE DE MOUVEMENT LOGISTIQUE & LIBELLÉ (DÉVERROUILLÉE) */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        
                        {/* 🚀 NOUVEAU : ENTRÉE DYNAMIQUE DU LIBELLÉ / RÉFÉRENCE COMPTABLE */}
                        <div style={{ ...inputGroup, minWidth: '280px', gap: '4px' }}>
                            <label style={{ ...labelStyle, fontSize: '10px' }}>LIBELLÉ / RÉFÉRENCE DE L'OPÉRATION *</label>
                            <div style={{ ...inputWithIcon, padding: '8px 12px', border: !header.libelle.trim() ? '2px dashed #DC2626' : '1px solid #CBD5E1' }}>
                                <FileText size={14} style={{ color: '#64748B' }} />
                                <input 
                                    type="text"
                                    placeholder="Ex: PERTE FIN DE MOIS, CASSE RAYON..."
                                    style={{ ...minimalInput, fontWeight: '700', color: '#0F172A' }}
                                    value={header.libelle}
                                    onChange={(e) => setHeader({ ...header, libelle: e.target.value })}
                                    disabled={isSaving || isLocked}
                                />
                            </div>
                        </div>

                        {/* CHOIX DU MOUVEMENT PHYSIQUE */}
                        <div style={{ ...inputGroup, minWidth: '320px', gap: '4px' }}>
                            <label style={{ ...labelStyle, fontSize: '10px' }}>TYPE DE MOUVEMENT LOGISTIQUE *</label>
                            <div style={{ ...inputWithIcon, padding: '8px 12px', border: !header.type_ajustement ? '2px dashed #DC2626' : '1px solid #CBD5E1' }}>
                                <ArrowRightLeft size={14} style={{ color: '#EF4444' }} />
                                <select 
                                    style={{ ...minimalInput, cursor: (isSaving || isLocked) ? 'not-allowed' : 'pointer', fontWeight: '900', color: !header.type_ajustement ? '#DC2626' : '#0F172A' }}
                                    value={header.type_ajustement}
                                    onChange={(e) => setHeader({ ...header, type_ajustement: e.target.value })}
                                    disabled={isSaving || isLocked}
                                >
                                    <option value="">-- SÉLECTIONNER LE MOUVEMENT OBLIGATOIRE --</option>
                                    <option value="AVARIE">⚠️ STOCK AVARIE (SORTIE)</option>
                                    <option value="BRISE">💥 STOCK BRISE / CASSE (SORTIE)</option>
                                    <option value="TRANSFERT">🔄 TRANSFERT ENTREPÔT (SORTIE DIRECTE)</option>
                                </select>
                            </div>
                        </div>

                        <button type="button" onClick={viderInterfaceLocale} style={{ ...btnAnnuler, textTransform: 'uppercase', fontSize: '11px', fontWeight: '700', letterSpacing: '0.03em', height: '40px', marginTop: '16px' }}>
                            <RefreshCcw size={13} /> Vider la saisie
                        </button>
                    </div>
                </header>

                {/* ZONE DE TRAVAIL SPLITTÉE EN DEUX GRANDES COLONNES STYLE CAISSE */}
                <div style={{ display: 'flex', flex: 1, gap: '20px', overflow: 'hidden', width: '100%', minHeight: 0 }}>
                    {/* PANNEAU GAUCHE : MOTEUR DE SÉLECTION & CONFIGURATION DE L'ARTICLE */}
                    <div style={{ ...searchSection, flex: 0.38, padding: '20px', background: '#ffffff', borderRadius: '12px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <h3 style={{ fontSize: '11px', fontWeight: '900', textTransform: 'uppercase', color: '#0F172A', letterSpacing: '0.05em', margin: '0 0 16px 0', borderBottom: '1px solid #E2E8F0', paddingBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Plus size={14} style={{ color: '#DC2626' }} /> Saisie des articles à ajuster
                        </h3>

                        {/* DOUBLE CANAL DE FILTRAGE DES ARTICLES */}
                        <div style={searchInputsRow}>
                            <div style={inputGroup}>
                                <label style={labelStyle}>Recherche Article</label>
                                <div style={inputWithIcon}>
                                    <Search size={14} style={{ color: '#DC2626' }} />
                                    <input 
                                        type="text"
                                        placeholder="Nom du produit..."
                                        style={minimalInput}
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        disabled={isLocked || isSaving}
                                    />
                                </div>
                            </div>
                            
                            {/* 🚀 OPTIMISATION SCANNER SÉCURISÉ */}
                                                        <div style={inputGroup}>
                                <label style={labelStyle}>Scanner (Code-barres)</label>
                                <div style={inputWithIcon}>
                                    <ScanBarcode size={14} style={{ color: '#2563EB' }} />
                                    <input 
                                        type="text"
                                        placeholder="Flashez un article..."
                                        style={minimalInput}
                                        value={searchBarCode}
                                        // 🚀 L'écriture déclenche le useEffect stabilisé (avec le délai debounce)
                                        onChange={(e) => setSearchBarCode(e.target.value)}
                                        disabled={isLocked || isSaving}
                                        // 🚀 FORCE LE CURSEUR À RESTER ICI POUR SÉRIALISER LES SCANS À LA CHAÎNE
                                        autoFocus 
                                    />
                                </div>
                            </div>

                        </div>

                 {/* 🎯 CATALOGUE ÉCLATÉ EN COMPTABILITÉ STRUCTURÉE À 3 COLONNES DISTINCTES */}
                        {/* 🚀 EXTENSION LOGISTIQUE : Verrouillé à une hauteur de 10 lignes maximum (35px par ligne + entête) */}
                        <div style={{ ...tableWrapper, maxHeight: '375px', marginBottom: '16px', background: '#F8FAFC', overflowY: 'auto' }}>
                            <table style={{ ...smallTable, tableLayout: 'fixed' }}>
                                <thead>
                                    <tr>
                                        <th style={{ ...thSmall, width: '46%' }}>DESIGNATION</th>
                                        <th style={{ ...thSmall, width: '27%', textAlign: 'right' }}>CPM / ACHAT</th>
                                        <th style={{ ...thSmall, width: '27%', textAlign: 'right' }}>QTÉ STOCK</th>
                                    </tr>
                                </thead>
                               <tbody style={{ fontSize: '12px' }}>
    {articles
        // 🚀 DOUBLE CANAL FLUIDE : Le tableau réagit en temps réel au texte OU au code-barres scanné !
        .filter(a => {
            const nomArticle = (a.nom || '').toLowerCase();
            const codeArticle = String(a.barcode || a.codeBarre || a.code_barre || '').trim();
            
            const txt = searchTerm.trim().toLowerCase();
            const bar = searchBarCode.trim();

            // Si aucun filtre n'est actif, on affiche tout
            if (!txt && !bar) return true;

            // Si un scan ou un texte match, on garde l'article à l'écran
            const matchTexte = txt && nomArticle.includes(txt);
            const matchScan = bar && codeArticle.includes(bar);

            return matchTexte || matchScan;
        })
        .map((art) => {
            const isSelected = selectedArt?.id === art.id;
            return (
                <tr 
                    key={art.id} 
                    style={{ ...trSelect, background: isSelected ? '#FEF2F2' : 'transparent', height: '35px' }}
                    onClick={() => {
                        if (!isLocked && !isSaving) {
                            setSelectedArt(art);
                            setEditingId(null);
                            setSaisieGros('');
                            setSaisieDetail('');
                            setInputObs('');
                        }
                    }}
                >
                    <td style={{ ...tdSmall, padding: '8px 10px', fontWeight: isSelected ? '900' : 'bold', color: isSelected ? '#991B1B' : '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {art.nom?.toUpperCase()}
                    </td>
                    <td style={{ ...tdSmall, padding: '8px 10px', textAlign: 'right', fontWeight: '700', color: '#475569' }}>
                        {fmt(art.prixAchat || art.prix_achat || art.cmp || 0)} F
                    </td>
                    <td style={{ ...tdSmall, padding: '8px 10px', textAlign: 'right', fontWeight: '900', color: isSelected ? '#991B1B' : '#1E40AF' }}>
                        <span style={{ background: isSelected ? '#FEE2E2' : '#EFF6FF', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', display: 'inline-block' }}>
                            {formaterStockPOS(art)}
                        </span>
                    </td>
                </tr>
            );
        })}
    {articles.length === 0 && (
        <tr>
            <td colSpan="3" style={{ ...tdSmall, textAlign: 'center', color: '#94A3B8', fontStyle: 'italic', padding: '40px 0' }}>
                Aucun produit disponible
            </td>
        </tr>
    )}
</tbody>

                            </table>
                        </div>

                        {/* CARTOGRAPHIE DE COMPOSITION DE SAISIE LOGISTIQUE */}
                        {selectedArt && (
                            <div style={{ padding: '16px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '14px', flex: 1 }}>
                                <div style={{ borderBottom: '1px solid #E2E8F0', paddingBottom: '8px' }}>
                                    <div style={{ fontSize: '9px', fontWeight: '900', color: '#DC2626', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Article sélectionné</div>
                                    <div style={{ fontSize: '13px', fontWeight: '900', color: '#0F172A', marginTop: '2px' }}>{selectedArt.nom?.toUpperCase()}</div>
                                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#475569', marginTop: '4px' }}>
                                        Stock Magasin Actuel : <span style={{ fontWeight: '900', color: '#0F172A' }}>{formaterStockPOS(selectedArt)}</span>
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                    <div style={inputGroup}>
                                        <label style={labelStyle}>QUANTITÉ GROS ({String(selectedArt.unit_code_gros || 'CS').toUpperCase()})</label>
                                        <input 
                                            type="number"
                                            min="0"
                                            placeholder="0"
                                            style={minimalInputSaisie}
                                            value={saisieGros}
                                            onChange={(e) => setSaisieGros(e.target.value)}
                                            disabled={Number(selectedArt.unit_coefficient || selectedArt.coefficient || 1) <= 1}
                                        />
                                    </div>
                                    <div style={inputGroup}>
                                        <label style={labelStyle}>QUANTITÉ DÉTAIL ({String(selectedArt.unit_ref_detail || 'PCS').toUpperCase()})</label>
                                        <input 
                                            type="number"
                                            min="0"
                                            placeholder="0"
                                            style={minimalInputSaisie}
                                            value={saisieDetail}
                                            onChange={(e) => setSaisieDetail(e.target.value)}
                                        />
                                    </div>
                                </div>
                                <div style={inputGroup}>
                                    <label style={labelStyle}>MOTIF / REMARQUE POUR CET ARTICLE</label>
                                    <div style={inputWithIcon}>
                                        <input 
                                            type="text"
                                            placeholder="Ex: Périmé, cassé en rayon, manquant..."
                                            style={minimalInput}
                                            value={inputObs}
                                            onChange={(e) => setInputObs(e.target.value)}
                                        />
                                    </div>
                                </div>

                                <button 
                                    type="button"
                                    onClick={handleAjouterArticle}
                                    style={{ ...btnFinalV2, backgroundColor: '#DC2626', color: '#ffffff', width: '100%', marginTop: 'auto' }}
                                >
                                    <Plus size={16} /> <span>{editingId ? "Modifier la ligne" : "Ajouter au registre"}</span>
                                </button>
                            </div>
                        )}
                    </div>

                    {/* PANNEAU DROIT : TABLEAU ET RÈGLEMENT DU REGISTRE D'AJUSTEMENT */}
                    <div style={{ ...panierSection, flex: 0.62, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <div style={panierHeader}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <FileText size={16} /> ARTICLES ENREGISTRÉS DANS CETTE SESSION ({panier.length})
                                </span>
                                <span style={{ fontSize: '10px', background: '#EF4444', color: '#ffffff', padding: '4px 10px', borderRadius: '6px', fontWeight: '900' }}>
                                    MOUVEMENT : {header.type_ajustement || 'NON SÉLECTIONNÉ'}
                                </span>
                            </div>
                        </div>

                        {/* GRILLE DES LIGNES DU PANIER */}
                        <div style={tableWrapper}>
                            <table style={fullTable}>
                                <thead>
                                    <tr>
                                        <th style={thMain}>DÉSIGNATION ARTICLE</th>
                                        <th style={{ ...thMain, textAlign: 'center' }}>MOUVEMENT</th>
                                        <th style={{ ...thMain, textAlign: 'right' }}>P.U ACHAT</th>
                                        <th style={{ ...thMain, textAlign: 'right' }}>VALEUR PERTE</th>
                                        <th style={{ ...thMain, textAlign: 'center' }}>ACTIONS</th>
                                    </tr>
                                </thead>
                                <tbody style={{ fontSize: '13px', fontWeight: '700', color: '#1E293B' }}>
                                    {panier.map((item) => (
                                        <tr key={item.product_id} style={{ ...trPanier, background: editingId === item.product_id ? '#FEF2F2' : 'transparent' }}>
                                            <td style={tdMain}>
                                                <div style={{ fontWeight: '900', color: '#0F172A' }}>{item.nom?.toUpperCase()}</div>
                                                {item.observation && (
                                                    <div style={{ fontSize: '10px', color: '#64748B', fontWeight: '600', fontStyle: 'italic', marginTop: '2px' }}>
                                                        Raison: {item.observation}
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ ...tdMain, textAlign: 'center' }}>
                                                <span style={{ px: '8px', py: '2px', background: '#FEE2E2', color: '#991B1B', fontSize: '11px', fontWeight: '900', borderRadius: '6px', padding: '2px 8px', display: 'inline-block' }}>
                                                    - {item.expression_quantite}
                                                </span>
                                            </td>
                                            <td style={{ ...tdMain, textAlign: 'right', color: '#475569' }}>
                                                {fmt(item.prix_achat_snap)} F
                                            </td>
                                            <td style={{ ...tdMain, textAlign: 'right', fontWeight: '900', color: '#DC2626' }}>
                                                {fmt(item.valeur_ligne)} F
                                            </td>
                                            <td style={tdMain}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
                                                    <button 
                                                        type="button"
                                                        onClick={() => handleEditerLigne(item)}
                                                        style={{ background: 'transparent', border: 'none', color: '#475569', cursor: isSaving ? 'not-allowed' : 'pointer', padding: '4px' }}
                                                        title="Modifier la ligne"
                                                        disabled={isSaving}
                                                    >
                                                        <Edit3 size={14} />
                                                    </button>
                                                    <button 
                                                        type="button"
                                                        onClick={() => handleSupprimerLigne(item.product_id)}
                                                        style={{ background: 'transparent', border: 'none', color: '#DC2626', cursor: isSaving ? 'not-allowed' : 'pointer', padding: '4px' }}
                                                        title="Retirer l'article"
                                                        disabled={isSaving}
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}

                                                                    {panier.length === 0 && (
                                        <tr>
                                            <td colSpan="5" style={{ ...tdMain, textAlign: 'center', padding: '60px 0', color: '#94A3B8', fontStyle: 'italic' }}>
                                                Le panier d'ajustement est actuellement vide. Saisissez ou scannez des articles à gauche.
                                            </td>
                                        </tr>
                                    )}
                                    {/* 🚀 LE FIX DE RENDU : Elément tr sémantiquement valide pour le scroll automatique */}
                                    <tr style={{ height: 0, padding: 0, margin: 0, border: 'none' }}>
                                        <td colSpan="5" ref={panierEndRef} style={{ padding: 0, height: 0 }} />
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        {/* TOTALISATION COMPTABLE DES PERTES ESTIMÉES */}
                        <div style={totalContainer}>
                            <div style={totalLabel}>VALEUR COMPTABLE ESTIMÉE DES PERTES</div>
                            <div style={{ ...totalValue, background: '#DC2626', minWidth: '220px' }}>
                                {fmt(totalGeneralAjustement)} F CFA
                            </div>
                        </div>
                        <div style={{ padding: '16px', background: '#F8FAFC', borderTop: '1px solid #E2E8F0', display: 'flex', gap: '12px' }}>
                            <button
                                type="button"
                                onClick={handleValiderAjustement}
                                disabled={isSaving || isLocked || panier.length === 0}
                                style={{
                                    ...btnFinalV2,
                                    backgroundColor: (isSaving || isLocked || panier.length === 0) ? '#94A3B8' : '#DC2626',
                                    cursor: (isSaving || isLocked || panier.length === 0) ? 'not-allowed' : 'pointer',
                                    width: '100%',
                                    marginTop: 0
                                }}
                            >
                                {isSaving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                                <span>
                                    {isLocked ? 'ACCÈS RESTREINT (INVENTAIRE)' : isSaving ? 'ENREGISTREMENT EN COURS...' : 'VALIDER ET IMPRIMER LA FICHE'}
                                </span>
                            </button>
                        </div>
                    </div>
                </div>
            </main>

            {/* --- ZONE TECHNIQUE INTERNE MASQUÉE POUR RENDU DU DOCUMENT PAPIER A4 --- */}
            {printData && (
                <div style={{ display: 'none' }}>
                    <div ref={printRef} className="p-8 bg-white text-slate-900" style={{ width: '210mm', height: 'auto', fontFamily: 'monospace', fontSize: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #000', paddingBottom: '10px', marginBottom: '20px' }}>
                            <div>
                                <h2 style={{ fontSize: '16px', fontWeight: '900', margin: 0 }}>{dynamiqueCompanyPrint.name}</h2>
                                <p style={{ margin: '2px 0 0 0', color: '#475569' }}>{dynamiqueCompanyPrint.address}</p>
                                <p style={{ margin: '2px 0 0 0', color: '#475569' }}>{dynamiqueCompanyPrint.phone}</p>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <h1 style={{ fontSize: '18px', fontWeight: '900', margin: 0 }}>FICHE D'AJUSTEMENT</h1>
                                <p style={{ fontSize: '14px', fontWeight: '900', color: '#DC2626', margin: '4px 0 0 0' }}>RÉF : {printData.id}</p>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px', background: '#F1F5F9', padding: '12px', borderRadius: '6px', marginBottom: '20px', fontWeight: '700' }}>
                            <div><span style={{ color: '#64748B', display: 'block', fontSize: '10px' }}>OPÉRATION LOGISTIQUE</span>{printData.type_ajustement}</div>
                            <div><span style={{ color: '#64748B', display: 'block', fontSize: '10px' }}>LIBELLÉ / COMMODITÉ</span>{printData.libelle}</div>
                            <div><span style={{ color: '#64748B', display: 'block', fontSize: '10px' }}>DATE TRANSACTION</span>{printData.date_cloture ? new Date(printData.date_cloture).toLocaleString('fr-FR') : '---'}</div>
                        </div>

                        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px' }}>
                            <thead>
                                <tr style={{ background: '#E2E8F0', borderBottom: '2px solid #000' }}>
                                    <th style={{ padding: '8px', textAlign: 'left', border: '1px solid #CBD5E1' }}>DÉSIGNATION ARTICLE</th>
                                    <th style={{ padding: '8px', textAlign: 'center', border: '1px solid #CBD5E1' }}>STK AVANT</th>
                                    <th style={{ padding: '8px', textAlign: 'center', border: '1px solid #CBD5E1' }}>QTÉ AJUSTÉE</th>
                                    <th style={{ padding: '8px', textAlign: 'center', border: '1px solid #CBD5E1' }}>STK APRÈS</th>
                                    <th style={{ padding: '8px', textAlign: 'right', border: '1px solid #CBD5E1' }}>VALEUR PERTE</th>
                                </tr>
                            </thead>
                            <tbody>
                                {/* 🚀 FIX SECURE RENDU PAPIER : Changement de articlesAImprimer vers printData.items */}
                                {(printData.items || []).map((art, idx) => (
                                    <tr key={idx} style={{ borderBottom: '1px solid #CBD5E1' }}>
                                        <td style={{ padding: '8px', border: '1px solid #CBD5E1', fontWeight: '700' }}>{art.nom?.toUpperCase()}</td>
                                        <td style={{ padding: '8px', textAlign: 'center', border: '1px solid #CBD5E1' }}>{art.stock_theorique_net}</td>
                                        <td style={{ padding: '8px', textAlign: 'center', border: '1px solid #CBD5E1', color: '#DC2626', fontWeight: '900' }}>-{art.expression_quantite}</td>
                                        <td style={{ padding: '8px', textAlign: 'center', border: '1px solid #CBD5E1' }}>{art.stock_reel_net}</td>
                                        <td style={{ padding: '8px', textAlign: 'right', border: '1px solid #CBD5E1', fontWeight: '900' }}>{fmt(art.valeur_ligne)} F</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px', paddingTop: '10px', borderTop: '2px solid #000', fontWeight: '900' }}>
                            <div>SOLDE GLOBAL CONSTATÉ : <span style={{ color: '#DC2626' }}>{fmt(printData.valeur_ecart_totale)} F CFA</span></div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};


// ==============================================================================
// 🎨 CARTOGRAPHIE DES STYLES GRAPHIQUES ET DESIGN DE L'INTERFACE (STYLE CAISSE)
// ==============================================================================
const layoutStyle = { display: 'flex', height: '100vh', background: '#F8FAFC', fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' };
const mainStyle = { flex: 1, padding: '20px', display: 'flex', gap: '20px', overflow: 'hidden', position: 'relative' };
const searchSection = { flex: 1, background: '#ffffff', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '20px', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' };
const panierSection = { background: '#ffffff', borderRadius: '12px', border: '1px solid #CBD5E1', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.05)' };
const toastStyle = { position: 'fixed', top: '25px', left: '50%', transform: 'translateX(-50%)', padding: '14px 35px', color: '#ffffff', borderRadius: '50px', zIndex: 9999, fontWeight: '700', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15)' };
const btnAnnuler = { background: '#ffffff', color: '#DC2626', border: '1px solid #FCA5A5', padding: '10px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s ease' };
const btnEnregistrer = { background: '#10B981', color: '#ffffff', border: 'none', padding: '10px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 2px 4px rgba(16, 185, 129, 0.15)', transition: 'background 0.2s ease' };
const btnFinalV2 = { width: '100%', background: '#10B981', color: '#ffffff', border: 'none', padding: '14px', borderRadius: '8px', marginTop: 'auto', fontWeight: '700', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContext: 'center', gap: '10px', boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.2)', transition: 'background 0.2s ease', display: 'flex', justifyContent: 'center' };
const searchInputsRow = { display: 'flex', gap: '12px', marginBottom: '18px', width: '100%' };
const inputGroup = { display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 };
const labelStyle = { fontSize: '11px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' };
const inputWithIcon = { display: 'flex', alignItems: 'center', gap: '10px', background: '#F8FAFC', padding: '10px 14px', borderRadius: '8px', border: '1px solid #CBD5E1', transition: 'all 0.2s ease', outline: 'none', width: '100%' };
const minimalInput = { border: 'none', background: 'transparent', outline: 'none', fontSize: '13px', color: '#1E293B', width: '100%', fontWeight: '700' };
const minimalInputSaisie = { border: '1px solid #94A3B8', background: '#ffffff', outline: 'none', fontSize: '18px', width: '100%', padding: '12px', borderRadius: '8px', fontWeight: '700', color: '#0F172A', textAlign: 'center', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)', transition: 'all 0.2s ease' };
const tableWrapper = { overflowY: 'auto', flex: 1, borderRadius: '8px', border: '1px solid #F1F5F9' };
const smallTable = { width: '100%', borderCollapse: 'separate', borderSpacing: 0 };
const thSmall = { textAlign: 'left', padding: '12px 14px', background: '#0F172A', color: '#ffffff', fontSize: '11px', fontWeight: '600', letterSpacing: '0.02em', position: 'sticky', top: 0, zIndex: 10 };
const tdSmall = { padding: '12px 14px', borderBottom: '1px solid #F1F5F9', fontSize: '13px', color: '#334155' };
const trSelect = { cursor: 'pointer', transition: 'background 0.15s ease' };
const panierHeader = { background: '#4F46E5', color: '#ffffff', padding: '14px 18px', fontWeight: '700', fontSize: '13px', letterSpacing: '0.03em', shrink: 0 };
const fullTable = { width: '100%', borderCollapse: 'separate', borderSpacing: 0 };
const thMain = { background: '#F8FAFC', padding: '14px 16px', fontSize: '11px', fontWeight: '700', textAlign: 'left', color: '#475569', borderBottom: '2px solid #E2E8F0', letterSpacing: '0.02em' };
const trPanier = { borderBottom: '1px solid #F1F5F9', transition: 'background 0.15s ease' };
const tdMain = { padding: '12px 16px', fontSize: '13px', color: '#1E293B', verticalAlign: 'middle' };
const totalContainer = { display: 'flex', alignItems: 'center', borderTop: '2px solid #E2E8F0', background: '#F8FAFC', shrink: 0 };
const totalLabel = { flex: 1, textAlign: 'right', padding: '20px 25px', fontWeight: '700', fontSize: '14px', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' };
const totalValue = { padding: '18px', fontWeight: '900', fontSize: '24px', minWidth: '180px', background: '#4F46E5', color: '#ffffff', textAlign: 'center' };

export default StockAjustement;
