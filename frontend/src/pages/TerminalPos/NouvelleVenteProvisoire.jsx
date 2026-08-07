import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Search, Trash2, Save, XCircle, Barcode, ArrowLeft } from 'lucide-react';
// Importation de l'instance API et du socket centralisé
import API, { socket } from '../../services/api';
import Sidebar from '../../components/Sidebar';
import { PricingService } from '../../services/pricing.service';
import { useSearchParams } from 'react-router-dom';
import { useReactToPrint } from 'react-to-print';
import ProvisoirPrintt from './provisoirprintt';
import { ConversionStockService } from '../../utils/converisonstock';

const NouvelleVenteProvisoire = () => {
    const currentUser = useMemo(() => JSON.parse(localStorage.getItem('user') || '{}'), []);
    const USER_ID = currentUser.id || 'USR-1';
    const COMPANY_ID = currentUser.company_id || currentUser.companyId || 'CPY-1';
    
    // Génération d'un ID de lot unique pour la session actuelle
    const genererIdLot = () => `LOT-P-${Date.now().toString().slice(-6)}`;

    const [searchParams] = useSearchParams();
    const [printData, setPrintData] = useState(null);
    const [articles, setArticles] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [searchBarCode, setSearchBarCode] = useState('');
    const [selectedArt, setSelectedArt] = useState(null);
    
    // 🛡️ SÉCURITÉ COMPATIBILITÉ RÉTROACTIVE
    const [qteSaisie, setQteSaisie] = useState(1);
    
    // 🚀 AJOUTS DES COMPOSANTS LOGISTIQUES DE SAISIE DECOUPLEE
    const [qteGrosSaisie, setQteGrosSaisie] = useState('');
    const [qteDetailSaisie, setQteDetailSaisie] = useState('');
    
    const [panier, setPanier] = useState([]);
    const [currentLotId, setCurrentLotId] = useState(genererIdLot());
    const [isSaving, setIsSaving] = useState(false);
    const [alertMsg, setAlertMsg] = useState({ text: '', type: '' });
    const [isLocked, setIsLocked] = useState(false);
    const [lockMessage, setLockMessage] = useState("");
    const [isModeEdition, setIsModeEdition] = useState(false);
    const printRef = useRef();
    const [printFormat, setPrintFormat] = useState('A5');
    
    // États pour la gestion du Staff
    const [allStaff, setAllStaff] = useState([]);
    const [selectedStaffId, setSelectedStaffId] = useState(''); 
    
    // NOUVEAU : États pour la gestion des Tables
    const [allTables, setAllTables] = useState([]);
    const [selectedTableId, setSelectedTableId] = useState('');

    // 🎯 FIX CRITIQUE : Calcul du total général sécurisé
    const totalGeneral = useMemo(() => {
        return panier.reduce((sum, item) => {
            if (item.isFromDatabase) {
                const qtePieces = Math.abs(Number(item.quantite || 0));
                const puVente = Number(item.prix_vente_unitaire || item.prix_unitaire || 0);
                return sum + (qtePieces * puVente);
            }
            return sum + Math.abs(Number(item.montant_ttc_ligne || item.total_ttc || 0));
        }, 0);
    }, [panier]);

    // 📊 LOGISTIQUE STRICTE : Calcul isolé par couple d'unités exact
    const recapUnites = useMemo(() => {
        const couplesLogistiques = {};

        panier.forEach(item => {
            const ratio = Math.abs(parseInt(item.ratio_conversion || item.ratio || 1));
            const gros = Math.abs(Number(item.saisie_gros || 0));
            const detail = Math.abs(Number(item.saisie_detail || 0));
            const qteTotal = Math.abs(Number(item.quantite || 0));

            const labelGros = String(item.unite_gros || item.unite_libelle_snap || item.libelle_gros_final || 'CS').toUpperCase().trim();
            const labelDetail = String(item.unite_detail || item.unite_snap || item.libelle_detail_final || item.unite || 'BTS').toUpperCase().trim();

            const cleCouple = `${labelGros}-${labelDetail}`;

            let piecesLigne = 0;
            if (gros > 0 || detail > 0) {
                piecesLigne = (gros * ratio) + detail;
            } else {
                piecesLigne = qteTotal;
            }

            if (!couplesLogistiques[cleCouple]) {
                couplesLogistiques[cleCouple] = {
                    totalPieces: 0,
                    ratio: ratio,
                    grosLabel: labelGros,
                    detailLabel: labelDetail
                };
            }
            couplesLogistiques[cleCouple].totalPieces += piecesLigne;
        });

        return Object.keys(couplesLogistiques).map(cle => {
            const group = couplesLogistiques[cle];
            const cartonsFinaux = Math.floor(group.totalPieces / group.ratio);
            const bouteillesFinelles = Math.round(group.totalPieces % group.ratio);

            const expressionAssociee = `${cartonsFinaux} ${group.grosLabel} + ${bouteillesFinelles} ${group.detailLabel}`;

            return {
                unite: expressionAssociee,
                unite_gros: group.grosLabel,
                unite_detail: group.detailLabel
            };
        });
    }, [panier]);

    const formaterStockPOS = useCallback((art) => {
        if (!art) return "-";
        const valeurStock = art.stock_actuel !== undefined ? art.stock_actuel : (art.stock || 0);
        
        if (typeof valeurStock === 'string' && valeurStock.includes('+')) {
            return valeurStock.replace(/-/g, '');
        }

        const qtePieces = Math.abs(Number(valeurStock)) || 0;
        return ConversionStockService.toExpressionTextuelle(qtePieces, art);
    }, []);

    const showToast = useCallback((text, type = 'success') => {
        setAlertMsg({ text, type });
        setTimeout(() => setAlertMsg({ text: '', type: '' }), 3000);
    }, []);

    const fetchArticles = useCallback(async () => {
        try {
            const res = await API.get('/products');
            setArticles(Array.isArray(res.data) ? res.data : []);
        } catch (err) { console.error("Erreur chargement articles:", err); }
    }, []);

    const loadSavedCart = useCallback(async () => {
        try {
            const res = await API.get(`/provisional-sales/temp-cart`);
            if (res.data && res.data.lignes) {
                const data = typeof res.data.lignes === 'string' 
                    ? JSON.parse(res.data.lignes) 
                    : res.data.lignes;
                
                const lignesSecurisees = data.map(item => {
                    const qteTotal = Math.abs(item.quantite || 0);
                    const ratioGros = Math.abs(parseInt(item.ratio_conversion || item.ratio || 1));
                    
                    let gros = Math.abs(item.saisie_gros !== undefined ? item.saisie_gros : Math.floor(qteTotal / ratioGros));
                    let detail = Math.abs(item.saisie_detail !== undefined ? item.saisie_detail : qteTotal % ratioGros);
                    
                    let formatTexte = "";
                    if (gros > 0 && detail > 0) {
                        formatTexte = `${gros} CARTON + ${detail} G`;
                    } else if (gros > 0) {
                        formatTexte = `${gros} CARTON`;
                    } else {
                        formatTexte = `${detail} G`;
                    }

                    return {
                        ...item,
                        saisie_gros: gros,
                        saisie_detail: detail,
                        quantite: qteTotal,
                        montant_ttc_ligne: Math.abs(item.montant_ttc_ligne || item.total_ttc || 0),
                        texte_affichage: item.texte_affichage || formatTexte
                    };
                });
                
                setPanier(lignesSecurisees);
            }
        } catch (err) { 
            console.log("Aucun panier temporaire trouvé"); 
        }
    }, []);

    const [dynamiqueCompanyPrint, setDynamiqueCompanyPrint] = useState({
        name: currentUser.company_name || "LEDI EXPERT PRO",
        address: currentUser.company_address || "Adresse non renseignée",
        phone: currentUser.company_phone || "Tél: N/A",
        email: currentUser.company_email || "Email: N/A",
        logo_data: currentUser.company_logo || null
    });

    useEffect(() => {
        const fetchCompanySettings = async () => {
            try {
                const res = await API.get('/company/settings'); 
                if (res.data) {
                    const data = res.data.success && res.data.data ? res.data.data : res.data;
                    setDynamiqueCompanyPrint({
                        name: data.name || data.nom || "LEDI EXPERT PRO",
                        address: data.address || data.adresse || "Adresse non renseignée",
                        phone: data.phone || data.telephone || "Tél: N/A",
                        email: data.email || "Email: N/A",
                        logo_data: data.logo_data || data.logo || null
                    });
                }
            } catch (err) {
                console.error("Erreur chargement entreprise:", err);
            }
        };
        fetchCompanySettings();
    }, []);

    const venteInfoPrint = useMemo(() => ({
        provisoir_no: currentLotId,
        date: new Date().toISOString(),
        client_nom: "CLIENT AU COMPTANT",
        mode_paiement: "Espèces",
        vendeur: currentUser.username || currentUser.name || "Caissier Principal",
        staff_name_snap: allStaff.find(s => String(s.id) === String(selectedStaffId))?.name || 'Inconnu',
        table_name_snap: allTables.find(t => String(t.id) === String(selectedTableId))?.numero || 'Non assignée'
    }), [currentLotId, currentUser, allStaff, selectedStaffId, allTables, selectedTableId]);

    const handlePrint = useReactToPrint({
        content: () => printRef.current,
        documentTitle: `VENTE-${currentLotId}`,
        pageStyle: `
            @page {
                size: ${printFormat === 'A6' ? '105mm 148mm' : '148mm 210mm'} portrait !important;
                margin: 5mm !important;
            }
            @media print {
                body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                .no-print { display: none !important; }
            }
        `,
        onAfterPrint: () => console.log(`Impression ${printFormat} terminée`)
    });

    const chargerLotPourEdition = useCallback(async (lotId) => {
        try {
            const res = await API.get(`/provisional-sales/provisional/${lotId}`);
            if (res.data && res.data.length > 0) {
                const lignesAdaptees = res.data.map(item => {
                    const trueCoeff = Math.abs(Number(item.unit_coefficient || item.coefficient || 1)) || 1;
                    const qteBruteNum = Math.abs(Number(item.quantite || 0));

                    let grosCalcul = 0;
                    let detailCalcul = qteBruteNum;

                    if (trueCoeff > 1) {
                        grosCalcul = Math.floor(qteBruteNum / trueCoeff);
                        detailCalcul = Math.round(qteBruteNum % trueCoeff);
                    }

                    const codeGros = String(item.unit_code_gros || item.code || item.unite_libelle_snap || 'CS').toUpperCase().trim();
                    const refDetail = String(item.unit_ref_detail || item.unite_reference || 'UNITÉ').toUpperCase().trim();

                    const prixVenteUnitaireReel = Math.abs(Number(item.prix_vente_unitaire || item.prix_unitaire || 0));
                    const totalLigneCalcule = qteBruteNum * prixVenteUnitaireReel;

                    let expressionFormattee = "";
                    if (grosCalcul > 0 && detailCalcul > 0) {
                        expressionFormattee = `${grosCalcul} CARTON + ${detailCalcul} G`;
                    } else if (grosCalcul > 0) {
                        expressionFormattee = `${grosCalcul} CARTON`;
                    } else {
                        expressionFormattee = `${detailCalcul} G`;
                    }

                    return {
                        id: item.id,
                        id_vente: item.id_vente || `VTE-P-${Date.now()}-${Math.floor(Math.random()*1000)}`,
                        lot_id: item.lot_id,
                        product_id: item.product_id,
                        id_article: item.product_id,
                        user_id: USER_ID,
                        company_id: COMPANY_ID,
                        nom_article_snap: String(item.nom_article_snap || item.nom_article || '').toUpperCase(),
                        unite_libelle_snap: item.unite_libelle_snap || '',
                        prix_vente_unitaire: prixVenteUnitaireReel,
                        prix_unitaire: prixVenteUnitaireReel,
                        quantite: qteBruteNum, 
                        isFromDatabase: true,
                        saisie_gros: grosCalcul > 0 ? grosCalcul : '',
                        saisie_detail: detailCalcul > 0 ? detailCalcul : '',
                        texte_affichage: expressionFormattee,
                        unite_gros: codeGros,
                        unite_detail: refDetail,
                        ratio_conversion: trueCoeff,
                        remise_montant: Math.abs(Number(item.remise_montant || 0)),
                        montant_ht: Math.abs(Number(item.montant_ht || 0)),
                        taxe_montant: Math.abs(Number(item.taxe_montant || 0)),
                        montant_ttc_ligne: item.montant_ttc_ligne ? Math.abs(Number(item.montant_ttc_ligne)) : totalLigneCalcule,
                        stock_avant_vente: Math.abs(Number(item.stock_avant_vente || item.stock_actuel || 0)),
                        stock_apres_vente: Math.abs(Number(item.stock_apres_vente || 0)),
                        article_complet: {
                            id: item.product_id,
                            nom: String(item.nom_article_snap || item.nom_article || '').toUpperCase(),
                            coefficient: trueCoeff,
                            unit_coefficient: trueCoeff,
                            code: codeGros,
                            unit_code_gros: codeGros,
                            unite_reference: refDetail,
                            unit_ref_detail: refDetail,
                            stock_actuel: Math.abs(Number(item.stock_avant_vente || item.stock_actuel || 0))
                        }
                    };
                });

                setPanier(lignesAdaptees);
                setCurrentLotId(lotId);
                setIsModeEdition(true);

                if (res.data[0]?.staff_id) setSelectedStaffId(res.data[0].staff_id);
                if (res.data[0]?.table_id) setSelectedTableId(res.data[0].table_id);

                showToast(`Modification du bon ${lotId} chargée`, "success");
            } else {
                showToast("Le lot sélectionné est vide ou introuvable", "error");
            }
        } catch (err) {
            console.error("Erreur lors du chargement du lot pour édition:", err);
            showToast("Impossible de charger le lot à éditer", "error");
        }
    }, [USER_ID, COMPANY_ID, showToast]);

    useEffect(() => {
        fetchArticles();
        const lotIdAEditer = searchParams.get('edit');

        if (lotIdAEditer) {
            chargerLotPourEdition(lotIdAEditer);
        } else {
            loadSavedCart();
            setIsModeEdition(false);
        }
    }, [searchParams, fetchArticles, loadSavedCart, chargerLotPourEdition]);

    useEffect(() => {
        const rafraichirDonneesCatalogue = () => fetchArticles();

        if (socket) {
            socket.on('STOCK_UPDATED', rafraichirDonneesCatalogue);
            socket.on('REFRESH_STOCK', rafraichirDonneesCatalogue);
            socket.on('INVENTORY_STATUS_CHANGED', (data) => {
                setIsLocked(!!data.en_cours);
                setLockMessage(data.en_cours ? "VENTES BLOQUÉES : Un inventaire est en cours." : "");
            });
        }

        return () => {
            if (socket) {
                socket.off('STOCK_UPDATED', rafraichirDonneesCatalogue);
                socket.off('REFRESH_STOCK', rafraichirDonneesCatalogue);
                socket.off('INVENTORY_STATUS_CHANGED');
            }
        };
    }, [fetchArticles]);

    useEffect(() => {
        const handleUpdate = (event) => {
            const { table, status } = event.detail;

            if (table === 'products' || table === 'all') {
                fetchArticles();
            }

            if (table === 'inventory') {
                setIsLocked(!!status);
                setLockMessage(status ? "VENTES BLOQUÉES : Un inventaire est en cours." : "");
            }
        };

        window.addEventListener('ERP_DATA_CHANGED', handleUpdate);
        return () => {
            window.removeEventListener('ERP_DATA_CHANGED', handleUpdate);
        };
    }, [fetchArticles]);

    useEffect(() => {
        const fetchStaff = async () => {
            try {
                const res = await API.get('/staff');
                setAllStaff(Array.isArray(res.data) ? res.data : []);
            } catch (err) {
                console.error("Erreur chargement staff:", err);
                showToast("Erreur lors du chargement de la liste du personnel", "error");
            }
        };
        fetchStaff();
    }, [showToast]);

    useEffect(() => {
        const fetchTables = async () => {
            try {
                const res = await API.get('/gestion-tables/restaurant_tables');
                const tablesData = res.data?.success && res.data?.data 
                    ? res.data.data 
                    : (Array.isArray(res.data) ? res.data : []);
                setAllTables(tablesData);
            } catch (err) {
                console.error("Erreur chargement tables:", err);
                showToast("Erreur lors du chargement de la liste des tables", "error");
            }
        };
        fetchTables();
    }, [showToast]);

    const verifierStatutInventaire = useCallback(async () => {
        try {
            const res = await API.get('/inventories/check-status');
            if (res.data?.en_cours) {
                setIsLocked(true);
                setLockMessage("VENTES BLOQUÉES : Un inventaire est actuellement en cours.");
            } else {
                setIsLocked(false);
            }
        } catch (err) {
            console.error("Erreur lors de la vérification de l'inventaire:", err);
        }
    }, []);

    useEffect(() => {
        verifierStatutInventaire();
        const interval = setInterval(verifierStatutInventaire, 30000);
        return () => clearInterval(interval);
    }, [verifierStatutInventaire]);

    useEffect(() => {
        if (searchBarCode.trim() !== '') {
            const art = articles.find(a => String(a.code_barre || a.codeBarre || '').trim() === searchBarCode.trim());
            if (art) { 
                setSelectedArt(art); 
                setSearchBarCode(''); 
                setQteSaisie(1);
                setQteGrosSaisie('');
                setQteDetailSaisie('');
            }
        }
    }, [searchBarCode, articles]);

    // =========================================================================
    // 🎯 AJOUT / RE-TRI DU PANIER (NOUVEL ARTICLE EN TÊTE DE LISTE)
    // =========================================================================
    const handleAjouterAuPanier = () => {
        if (!selectedArt) return;
        const grosNettoye = String(qteGrosSaisie || '').replace(/-/g, '').replace(',', '.').trim();
        const detailNettoye = String(qteDetailSaisie || '').replace(/-/g, '').replace(',', '.').trim();
        const qteAAjouterGros = Math.abs(parseFloat(grosNettoye) || 0);
        const qteAAjouterDetail = Math.abs(parseFloat(detailNettoye) || 0);
        const coeffLogistique = Math.abs(Number(selectedArt.coefficient || selectedArt.unit_coefficient || 1)) || 1;
        let piecesSaisiesActuelles = 0;
        
        if (qteAAjouterGros === 0 && qteAAjouterDetail === 0) {
            const chaineFallback = String(qteSaisie || '1').replace(/-/g, '').replace(',', '.').trim();
            const fallbackGros = Math.abs(parseFloat(chaineFallback) || 0);
            if (fallbackGros <= 0) {
                showToast("❌ Veuillez saisir une quantité valide.", "error");
                return;
            }
            piecesSaisiesActuelles = Math.round(fallbackGros * coeffLogistique);
        } else {
            piecesSaisiesActuelles = Math.round(qteAAjouterGros * coeffLogistique) + Math.round(qteAAjouterDetail);
        }
        
        const stockBrutBDD = selectedArt.stock_actuel !== undefined ? selectedArt.stock_actuel : (selectedArt.stock || 0);
        let stockTotalDisponiblePieces = 0;
        if (typeof stockBrutBDD === 'string' && stockBrutBDD.includes('+')) {
            const parties = stockBrutBDD.split('+');
            const grosEntiers = Math.abs(parseFloat(parties[0] || '0') || 0);
            const detailRestants = Math.abs(parseFloat(parties[1] || '0') || 0);
            stockTotalDisponiblePieces = (grosEntiers * coeffLogistique) + detailRestants;
        } else {
            const valeurBruteNettoyee = typeof stockBrutBDD === 'string' ? parseFloat(stockBrutBDD.replace(/-/g, '')) : Number(stockBrutBDD);
            stockTotalDisponiblePieces = Math.abs(valeurBruteNettoyee) || 0;
        }
        
        const indexExistant = panier.findIndex(item => item.product_id === selectedArt.id);
        let piecesDejaAuPanier = 0;
        
        if (indexExistant !== -1) {
            const itemExistant = panier[indexExistant];
            if (itemExistant.isFromDatabase) {
                piecesDejaAuPanier = Math.round(Math.abs(Number(itemExistant.quantite || 0)));
            } else {
                const gEx = Math.abs(parseFloat(itemExistant.saisie_gros || 0));
                const dEx = Math.abs(parseFloat(itemExistant.saisie_detail || 0));
                if (gEx > 0 || dEx > 0) {
                    piecesDejaAuPanier = Math.round(gEx * coeffLogistique) + Math.round(dEx);
                } else {
                    piecesDejaAuPanier = Math.round(Math.abs(parseFloat(itemExistant.quantite || 0)) * coeffLogistique);
                }
            }
        }
        
        const demandeTotalePieces = piecesDejaAuPanier + piecesSaisiesActuelles;

        const stockDisponibleReelVerif = isModeEdition && indexExistant !== -1 
            ? stockTotalDisponiblePieces + piecesDejaAuPanier 
            : stockTotalDisponiblePieces;

        if (demandeTotalePieces > stockDisponibleReelVerif) {
            const { codeGros, refDetail } = ConversionStockService.getMetadata(selectedArt);
            let dispoText = `${stockDisponibleReelVerif} ${refDetail}`;
            if (coeffLogistique > 1) {
                const gE = Math.floor(stockDisponibleReelVerif / coeffLogistique);
                const rD = Math.round(stockDisponibleReelVerif % coeffLogistique);
                dispoText = gE > 0 && rD > 0 ? `${gE} ${codeGros} + ${rD} ${refDetail}` : gE > 0 ? `${gE} ${codeGros}` : `${rD} ${refDetail}`;
            }
            showToast(`❌ Stock insuffisant ! Disponible : ${dispoText}`, 'error');
            return;
        }
        
        const { codeGros: codeGrosClair, refDetail: refDetailClaire } = ConversionStockService.getMetadata(selectedArt);
        
        let expressionQuantiteFinale = "";
        const finalGrosAffichage = Math.floor(demandeTotalePieces / coeffLogistique);
        const finalDetailAffichage = Math.round(demandeTotalePieces % coeffLogistique);

        if (finalGrosAffichage > 0 && finalDetailAffichage > 0) {
            expressionQuantiteFinale = `${finalGrosAffichage} ${codeGrosClair || 'CARTON'} + ${finalDetailAffichage} ${refDetailClaire || 'G'}`;
        } else if (finalGrosAffichage > 0) {
            expressionQuantiteFinale = `${finalGrosAffichage} ${codeGrosClair || 'CARTON'}`;
        } else {
            expressionQuantiteFinale = `${finalDetailAffichage} ${refDetailClaire || 'G'}`;
        }
        
        const quantiteDecimaleGrosPourCalculs = demandeTotalePieces / coeffLogistique;
        const calculs = PricingService.calculerLigne(selectedArt, quantiteDecimaleGrosPourCalculs);
        
        const stockAvant = Math.abs(stockTotalDisponiblePieces);
        const stockApres = Math.max(0, stockTotalDisponiblePieces - piecesSaisiesActuelles);
        
        const gFinal = indexExistant !== -1 ? (Math.abs(parseFloat(panier[indexExistant].saisie_gros || 0)) + qteAAjouterGros) : qteAAjouterGros;
        const dFinal = indexExistant !== -1 ? (Math.abs(parseFloat(panier[indexExistant].saisie_detail || 0)) + qteAAjouterDetail) : qteAAjouterDetail;

        const prixUnitaireAuDetailAjuste = demandeTotalePieces > 0
            ? (calculs.netAPayer / demandeTotalePieces)
            : Math.abs(Number(selectedArt.prixVente || selectedArt.prix_vente || 0)) / coeffLogistique;
        
        let itemMisAJour;
        let panierSansExistant = panier;

        if (indexExistant !== -1) {
            // Extraction du reste du panier sans l'article qu'on est en train de modifier
            panierSansExistant = panier.filter((_, i) => i !== indexExistant);

            itemMisAJour = {
                ...panier[indexExistant],
                quantite: panier[indexExistant].isFromDatabase ? demandeTotalePieces : quantiteDecimaleGrosPourCalculs, 
                expression_logistique: expressionQuantiteFinale,
                qte_vendue_formatee: expressionQuantiteFinale,
                qte_achetee: `${gFinal}+${dFinal}`,
                prix_vente_unitaire: Number(Number(prixUnitaireAuDetailAjuste).toFixed(2)),
                unite_gros: codeGrosClair,
                unite_detail: refDetailClaire,
                ratio_conversion: coeffLogistique,
                unite_gros_snap: codeGrosClair, 
                unite_detail_snap: refDetailClaire,
                unite_libelle_snap: codeGrosClair,
                unite_snap: refDetailClaire,
                saisie_gros: gFinal > 0 ? gFinal : '',
                saisie_detail: dFinal > 0 ? dFinal : '',
                remise_montant: Number(Number(calculs.remiseTotale || 0).toFixed(2)),
                montant_ht: Number(Number(calculs.montantHT || 0).toFixed(2)),
                taxe_montant: Number(Number(calculs.montantTaxe || 0).toFixed(2)),
                montant_ttc_ligne: Number(Number(calculs.netAPayer || 0).toFixed(2)),
                stock_avant_vente: stockAvant,
                stock_apres_vente: stockApres
            };
        } else {
            itemMisAJour = {
                id: `LGN-P-${Date.now()}-${Math.floor(Math.random()*1000)}`,
                id_vente: `VTE-P-${Date.now()}-${Math.floor(Math.random()*1000)}`,
                lot_id: currentLotId,
                product_id: selectedArt.id,
                id_article: selectedArt.id,
                user_id: USER_ID,
                company_id: COMPANY_ID,
                nom_article_snap: selectedArt.nom.toUpperCase(),
                unite_libelle_snap: selectedArt.unite_libelle || '',
                unite_gros_snap: codeGrosClair, 
                unite_detail_snap: refDetailClaire,
                unite_snap: refDetailClaire,
                unite_gros: codeGrosClair,
                unite_detail: refDetailClaire,
                ratio_conversion: coeffLogistique,
                prix_vente_unitaire: Number(Number(prixUnitaireAuDetailAjuste).toFixed(2)),
                prix_unitaire: Number(Number(prixUnitaireAuDetailAjuste).toFixed(2)),
                quantite: quantiteDecimaleGrosPourCalculs, 
                expression_logistique: expressionQuantiteFinale,
                qte_vendue_formatee: expressionQuantiteFinale,
                qte_achetee: `${qteAAjouterGros}+${qteAAjouterDetail}`,
                saisie_gros: qteAAjouterGros > 0 ? qteAAjouterGros : '',
                saisie_detail: qteAAjouterDetail > 0 ? qteAAjouterDetail : '',
                remise_montant: Number(Number(calculs.remiseTotale || 0).toFixed(2)),
                montant_ht: Number(Number(calculs.montantHT || 0).toFixed(2)),
                taxe_montant: Number(Number(calculs.montantTaxe || 0).toFixed(2)),
                montant_ttc_ligne: Number(Number(calculs.netAPayer || 0).toFixed(2)),
                stock_avant_vente: stockAvant,
                stock_apres_vente: stockApres,
                article_complet: {
                    ...selectedArt,
                    id: selectedArt.id,
                    nom: selectedArt.nom,
                    coefficient: coeffLogistique,
                    unit_coefficient: coeffLogistique,
                    code: codeGrosClair || 'CS',
                    unit_code_gros: codeGrosClair || 'CS',
                    unite_reference: refDetailClaire || 'BTS',
                    unit_ref_detail: refDetailClaire || 'BTS'
                }
            };
        }

        // 🎯 RANGEMENT PAR ORDRE ANTICHRONOLOGIQUE : L'élément est TOUJOURS inséré en tête (Top)
        setPanier([itemMisAJour, ...panierSansExistant]);

        if (!isModeEdition) {
            socket?.emit('cart_changed', { userId: USER_ID, companyId: COMPANY_ID });
        }
        setSelectedArt(null); 
        setQteSaisie(1); 
        setQteGrosSaisie(''); 
        setQteDetailSaisie(''); 
        setSearchTerm('');
    };

    useEffect(() => {
        const saveCart = async () => {
            if (panier.length > 0 && !isSaving && !isModeEdition) {
                try {
                    await API.post('/provisional-sales/temp-cart', {
                        lignes: panier 
                    });
                } catch (e) { 
                    console.error("Erreur sauvegarde auto", e); 
                }
            }
        };

        const timer = setTimeout(saveCart, 1000);
        return () => clearTimeout(timer);
    }, [panier, isSaving, isModeEdition]);

    const handleViderPanier = async () => {
        if (isModeEdition) {
            setPanier([]);
            setCurrentLotId(genererIdLot());
            setIsModeEdition(false);
            window.history.replaceState(null, '', window.location.pathname); 
            showToast("Édition annulée, nouveau panier prêt", "success");
            return;
        }

        try {
            await API.delete(`/provisional-sales/temp-cart`);
            setPanier([]);
            socket?.emit('cart_changed', { userId: USER_ID, companyId: COMPANY_ID });
            showToast("Panier vidé", "success");
        } catch (err) {
            showToast("Erreur lors du vidage", "error");
        }
    };

    const handleSupprimerLigne = async (idxToRemove) => {
        const nouveauPanier = panier.filter((_, i) => i !== idxToRemove);
        
        if (isModeEdition) {
            setPanier(nouveauPanier);
            return;
        }

        try {
            if (nouveauPanier.length === 0) {
                await API.delete(`/provisional-sales/temp-cart`);
            } else {
                await API.post('/provisional-sales/temp-cart', {
                    lignes: nouveauPanier
                });
            }
            setPanier(nouveauPanier);
            socket?.emit('cart_changed', { userId: USER_ID, companyId: COMPANY_ID });
        } catch (err) {
            showToast("Erreur lors de la suppression", "error");
        }
    };

    const finaliserVenteProvisoire = async (doPrint = false, formatCible = 'A5') => {
        if (panier.length === 0 || isSaving || isLocked) return;
        
        if (!selectedTableId) {
            showToast("Veuillez sélectionner une table", "error");
            return;
        }
        if (!selectedStaffId) {
            showToast("Veuillez sélectionner un vendeur", "error");
            return;
        }

        setIsSaving(true);
        try {
            const staffInfo = allStaff.find(s => String(s.id) === String(selectedStaffId));
            const tableInfo = allTables.find(t => String(t.id) === String(selectedTableId));

            let totalHtVente = 0;
            let totalTaxeVente = 0;

            panier.forEach(item => {
                totalHtVente += Math.abs(Number(item.montant_ht || 0));
                totalTaxeVente += Math.abs(Number(item.taxe_montant || item.taxe || 0));
            });

            const dataVente = {
                staff_id: selectedStaffId,
                staff_name: staffInfo ? staffInfo.name : "Inconnu",
                table_id: selectedTableId, 
                table_number: tableInfo ? (tableInfo.numero || tableInfo.name) : "Inconnu", 
                nom_client: "CLIENT AU COMPTANT",
                lot_id: currentLotId, 
                is_update: isModeEdition, 
                lignes: panier.map(item => {
                    const quantitePiecesNatives = Math.round(Math.abs(Number(item.quantite || 0)));
                    let chaineQuantiteFinale = "";
                    
                    if (item.isFromDatabase) {
                        chaineQuantiteFinale = `0 + ${quantitePiecesNatives}`;
                    } else if (String(item.saisie_gros || '') || String(item.saisie_detail || '')) {
                        const g = item.saisie_gros || 0;
                        const d = item.saisie_detail || 0;
                        chaineQuantiteFinale = `${g} + ${d}`;
                    } else {
                        chaineQuantiteFinale = `0 + ${quantitePiecesNatives}`;
                    }

                    return {
                        id: item.id || null, 
                        product_id: item.product_id,
                        nom_article_snap: item.nom_article_snap,
                        quantite: chaineQuantiteFinale,
                        unite_libelle_snap: item.unite_libelle_snap || item.expression_logistique || '',
                        prix_vente_unitaire: Math.abs(Number(item.prix_vente_unitaire)) || 0,
                        remise_montant: Math.abs(Number(item.remise_montant)) || 0,
                        montant_ht: Math.abs(Number(item.montant_ht)) || 0, 
                        taxe_montant: Math.abs(Number(item.taxe_montant)) || 0,
                        montant_ttc_ligne: Math.abs(Number(item.montant_ttc_ligne)) || 0,
                        stock_avant_vente: Math.abs(Number(item.stock_avant_vente)) || 0,
                        stock_apres_vente: Math.abs(Number(item.stock_apres_vente)) || 0
                    };
                })
            };

            const response = isModeEdition 
                ? await API.put(`/provisional-sales/modifier-lot/${currentLotId}`, dataVente) 
                : await API.post('/provisional-sales', dataVente);

            if (response.data.success) {
                const totalTtcVente = Math.abs(totalHtVente + totalTaxeVente);
                
                if (doPrint) {
                    setPrintFormat(formatCible);
                }

                const panierImprimable = panier.map(item => {
                    const qteBruteNum = Math.abs(Number(item.quantite || 0));
                    return {
                        ...item,
                        expression_logistique: item.expression_logistique || ConversionStockService.toExpressionTextuelle(qteBruteNum, item)
                    };
                });

                setPrintData({
                    panier: panierImprimable, 
                    venteInfo: {
                        ...venteInfoPrint,
                        provisoir_no: currentLotId,
                        staff_name_snap: staffInfo ? staffInfo.name : "Inconnu",
                        table_name_snap: tableInfo ? (tableInfo.numero || tableInfo.name) : "Non assignée",
                        est_definitive: false,
                        total_ht: totalHtVente,
                        total_taxe: totalTaxeVente,
                        total_ttc: totalTtcVente
                    },
                    company: { ...dynamiqueCompanyPrint },
                    recapUnites: recapUnites
                });

                showToast(
                    isModeEdition 
                        ? "✅ Bon de commande mis à jour avec succès !" 
                        : "✅ Vente enregistrée et envoyée en caisse !", 
                    "success"
                );

                setPanier([]);
                setCurrentLotId(genererIdLot());
                setSelectedArt(null);
                setSelectedStaffId('');
                setSelectedTableId('');
                setQteSaisie(1);
                setQteGrosSaisie('');
                setQteDetailSaisie('');
                setSearchTerm('');

                if (isModeEdition) {
                    setIsModeEdition(false);
                    window.history.replaceState(null, '', window.location.pathname);
                }

                if (socket) {
                    socket.emit('cart_changed', { userId: USER_ID, companyId: COMPANY_ID });
                    socket.emit('SALES_TABLE_UPDATED');
                    socket.emit('STOCK_UPDATED'); 
                }

                await fetchArticles();

                if (doPrint) {
                    setTimeout(() => {
                        handlePrint();
                    }, 300);
                }
            }
        } catch (err) {
            console.error("Erreur finalisation:", err);
            showToast(`❌ Erreur: ${err.response?.data?.error || err.message}`, "error");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div style={layoutStyle}>
            {isLocked && (
                <div style={lockOverlayStyle}>
                    <div style={lockCardStyle}>
                        <XCircle size={50} color="#EF4444" style={{ margin: '0 auto' }} />
                        <h2 style={{ margin: '15px 0', fontSize: '18px', fontWeight: 'bold' }}>{lockMessage}</h2>
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '20px' }}>
                            <button onClick={() => window.history.back()} style={btnBackStyle}>
                                <ArrowLeft size={16} /> RETOUR
                            </button>
                            <button onClick={() => window.location.reload()} style={btnRetryStyle}>
                                ACTUALISER
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            {alertMsg.text && (
                <div style={{...toastStyle, backgroundColor: alertMsg.type === 'error' ? '#EF4444' : '#10B981'}}>
                    {alertMsg.text}
                </div>
            )}

            <style>{`
                @keyframes blink-red { 0% { background-color: #FCA5A5; } 50% { background-color: #EF4444; } 100% { background-color: #FCA5A5; } }
                .blink-bg { animation: blink-red 0.8s infinite ease-in-out; }
            `}</style>

            <Sidebar />
            <main style={mainStyle}>
                <div style={colGauche}>
                    <div style={searchSection}>
                        <div style={searchInputsRow}>
                            <div style={inputGroup}><label style={labelStyle}>NOM ARTICLE</label>
                                <div style={inputWithIcon}><Search size={14}/><input style={minimalInput} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div>
                            </div>
                            <div style={inputGroup}><label style={labelStyle}>CODE BARRE</label>
                                <div style={inputWithIcon}><Barcode size={14}/><input style={minimalInput} value={searchBarCode} onChange={(e) => setSearchBarCode(e.target.value)} /></div>
                            </div>
                        </div>
                        <div style={tableWrapper}>
                            <table style={smallTable}>
                                <thead><tr><th style={thSmall}>ARTICLE</th><th style={thSmall}>STOCK</th><th style={thSmall}>PRIX</th></tr></thead>
                                <tbody>
                                    {articles.filter(a => a.nom.toLowerCase().includes(searchTerm.toLowerCase())).map(art => {
                                        const stockBrutNum = art.stock_actuel !== undefined ? art.stock_actuel : (art.stock || 0);
                                        const isStockEpuise = stockBrutNum === undefined || stockBrutNum === null || parseFloat(String(stockBrutNum).replace(/-/g, '')) <= 0;

                                        return (
                                            <tr key={art.id} onClick={() => {
                                                setSelectedArt(art);
                                                setQteGrosSaisie('');
                                                setQteDetailSaisie('');
                                                setQteSaisie(1);
                                            }} style={{...trSelect, background: selectedArt?.id === art.id ? '#fef9c3' : 'transparent'}}>
                                                <td style={tdSmall}>{art.nom.toUpperCase()}</td>
                                                <td style={{
                                                    ...tdSmall, 
                                                    color: isStockEpuise ? '#DC2626' : 'inherit',
                                                    fontWeight: isStockEpuise ? 'bold' : 'normal'
                                                }}>
                                                    <span style={{
                                                        background: '#F8FAFC',
                                                        padding: '2px 6px',
                                                        borderRadius: '4px',
                                                        border: '1px solid #CBD5E1',
                                                        fontSize: '11px',
                                                        fontWeight: '700',
                                                        display: 'inline-block'
                                                    }}>
                                                        {formaterStockPOS(art)}
                                                    </span>
                                                </td>
                                                <td style={{...tdSmall, fontWeight: 'bold'}}>{Number(Math.abs(art.prixVente || art.prix_vente || 0)).toLocaleString()} F</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div style={colDroite}>
                    <div style={{...saisieSection, flex: 0.4, background: isModeEdition ? '#fff7ed' : '#F0FDF4', border: isModeEdition ? '1px solid #fed7aa' : '1px solid #BBF7D0'}}>
                        <div style={{display:'flex', justifyContent:'space-between', marginBottom:'10px'}}>
                            <span style={{fontSize:'12px', fontWeight:'bold', color: isModeEdition ? '#c2410c' : '#000'}}>
                                {isModeEdition ? `📝 ÉDITION EN COURS : ${currentLotId}` : `LOT : ${currentLotId}`}
                            </span>
                            <div style={{display:'flex', gap:'8px', flexWrap: 'wrap'}}>
                                <button style={btnAnnuler} onClick={handleViderPanier}>
                                    <XCircle size={14}/> {isModeEdition ? 'ANNULER' : 'VIDER'}
                                </button>
                                <button 
                                    disabled={panier.length === 0 || !selectedStaffId || !selectedTableId || isSaving} 
                                    style={{...btnEnregistrer, backgroundColor: isModeEdition ? '#ea580c' : '#166534', opacity: (panier.length === 0 || !selectedStaffId || !selectedTableId || isSaving) ? 0.5 : 1}} 
                                    onClick={() => finaliserVenteProvisoire(false)}
                                >
                                    <Save size={14}/> {isSaving ? '...' : isModeEdition ? 'METTRE À JOUR' : 'VALIDER'}
                                </button>
                                
                                <button
                                    style={{
                                        background: '#af991e',
                                        color: '#fff',
                                        border: 'none',
                                        padding: '8px 12px',
                                        borderRadius: '6px',
                                        fontSize: '11px',
                                        fontWeight: 'bold'
                                    }}
                                    onClick={() => {
                                        const staffInfo = allStaff.find(s => String(s.id) === String(selectedStaffId));
                                        const tableInfo = allTables.find(t => String(t.id) === String(selectedTableId));
                                        const totalSecuriseA5 = Math.abs(panier.reduce((acc, c) => acc + Number(c.montant_ttc_ligne || 0), 0));

                                        setPrintData({
                                            panier: [...panier],
                                            venteInfo: {
                                                ...venteInfoPrint,
                                                provisoir_no: currentLotId,
                                                staff_name_snap: staffInfo ? staffInfo.name : "Inconnu",
                                                table_name_snap: tableInfo ? (tableInfo.numero || tableInfo.name) : "Non assignée",
                                                total_ht: totalSecuriseA5,
                                                total_ttc: totalSecuriseA5
                                            },
                                            company: { ...dynamiqueCompanyPrint },
                                            recapUnites: recapUnites
                                        });
                                        finaliserVenteProvisoire(true, 'A5'); 
                                    }}
                                    disabled={panier.length === 0 || !selectedStaffId || !selectedTableId || isSaving}
                                >
                                    IMPRIMER A5
                                </button>

                                <button
                                    style={{
                                        background: '#2563EB',
                                        color: '#fff',
                                        border: 'none',
                                        padding: '8px 12px',
                                        borderRadius: '6px',
                                        fontSize: '11px',
                                        fontWeight: 'bold'
                                    }}
                                    onClick={() => {
                                        const staffInfo = allStaff.find(s => String(s.id) === String(selectedStaffId));
                                        const tableInfo = allTables.find(t => String(t.id) === String(selectedTableId));
                                        const totalSecuriseA6 = Math.abs(panier.reduce((acc, c) => acc + Number(c.montant_ttc_ligne || 0), 0));

                                        setPrintData({
                                            panier: [...panier],
                                            venteInfo: {
                                                ...venteInfoPrint,
                                                provisoir_no: currentLotId,
                                                staff_name_snap: staffInfo ? staffInfo.name : "Inconnu",
                                                table_name_snap: tableInfo ? (tableInfo.numero || tableInfo.name) : "Non assignée",
                                                total_ht: totalSecuriseA6,
                                                total_ttc: totalSecuriseA6
                                            },
                                            company: { ...dynamiqueCompanyPrint },
                                            recapUnites: recapUnites
                                        });
                                        finaliserVenteProvisoire(true, 'A6'); 
                                    }}
                                    disabled={panier.length === 0 || !selectedStaffId || !selectedTableId || isSaving}
                                >
                                    IMPRIMER A6
                                </button>
                            </div>
                        </div>
                        <div style={formSaisie}>
                            <div style={{...inputGroup, marginBottom: '10px'}}>
                                <label style={labelStyle}>TABLE (OBLIGATOIRE)</label>
                                <div style={inputWithIcon}>
                                    <select 
                                        style={{...minimalInput, width: '100%', padding: '2px'}} 
                                        value={selectedTableId} 
                                        onChange={(e) => setSelectedTableId(e.target.value)}
                                    >
                                        <option value="">-- Sélectionner une Table --</option>
                                        {allTables.map(t => (
                                            <option key={t.id} value={t.id}>
                                                Table {t.numero || t.name} {t.zone ? `(${t.zone})` : ''}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div style={{...inputGroup, marginBottom: '10px'}}>
                                <label style={labelStyle}>VENDEUR (OBLIGATOIRE)</label>
                                <div style={inputWithIcon}>
                                    <select 
                                        style={{...minimalInput, width: '100%', padding: '2px'}} 
                                        value={selectedStaffId} 
                                        onChange={(e) => setSelectedStaffId(e.target.value)}
                                    >
                                        <option value="">-- Sélectionner --</option>
                                        {allStaff.map(s => (
                                            <option key={s.id} value={s.id}>{s.name} - {s.fonction}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <label style={labelStyle}>SÉLECTION</label>
                            <div style={inputDisabled}>{selectedArt ? `${selectedArt.nom.toUpperCase()} (${Number(Math.abs(selectedArt.prixVente || selectedArt.prix_vente || 0)).toLocaleString()} F)` : 'AUCUN ARTICLE'}</div>
                            
                            <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
                                {selectedArt && Number(selectedArt.coefficient || selectedArt.unit_coefficient || 1) > 1 && (
                                    <div style={{ position: 'relative', flex: 1 }}>
                                        <label style={{ ...labelStyle, display: 'block', marginBottom: '4px', fontSize: '10px', color: '#1E3A8A' }}>EN GROS</label>
                                        <input 
                                            type="text" 
                                            style={{ ...minimalInputSaisie, fontWeight: '900', width: '100%' }} 
                                            value={qteGrosSaisie} 
                                            onKeyDown={(e) => {
                                                if (e.key === '-' || e.key === 'e' || e.key === 'E' || e.key === '+') {
                                                    e.preventDefault();
                                                }
                                            }}
                                            onChange={(e) => {
                                                const positiveVal = e.target.value.replace(/[^0-9.]/g, '');
                                                setQteGrosSaisie(positiveVal);
                                            }} 
                                            placeholder="0"
                                        />
                                        <span style={{ position: 'absolute', right: '15px', bottom: '8px', color: '#1e40af', fontWeight: '800', fontSize: '11px', background: '#dbeafe', padding: '2px 6px', borderRadius: '4px', border: '1px solid #bfdbfe' }}>
                                            {(() => {
                                                const { codeGros } = ConversionStockService.getMetadata(selectedArt);
                                                return codeGros;
                                            })()}
                                        </span>
                                    </div>
                                )}

                                <div style={{ position: 'relative', flex: 1 }}>
                                    <label style={{ ...labelStyle, display: 'block', marginBottom: '4px', fontSize: '10px', color: '#1E3A8A' }}>AU DÉTAIL</label>
                                    <input 
                                        type="text" 
                                        style={{ ...minimalInputSaisie, fontWeight: '900', width: '100%' }} 
                                        value={qteDetailSaisie} 
                                        onKeyDown={(e) => {
                                            if (e.key === '-' || e.key === 'e' || e.key === 'E' || e.key === '+') {
                                                e.preventDefault();
                                            }
                                        }}
                                        onChange={(e) => {
                                            const positiveVal = e.target.value.replace(/[^0-9.]/g, '');
                                            setQteDetailSaisie(positiveVal);
                                        }} 
                                        placeholder="0"
                                    />
                                    {selectedArt && (
                                        <span style={{ position: 'absolute', right: '15px', bottom: '8px', color: '#1e40af', fontWeight: '800', fontSize: '11px', background: '#dbeafe', padding: '2px 6px', borderRadius: '4px', border: '1px solid #bfdbfe' }}>
                                            {(() => {
                                                const { refDetail } = ConversionStockService.getMetadata(selectedArt);
                                                return refDetail;
                                            })()}
                                        </span>
                                    )}
                                </div>

                                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                                    <button 
                                        style={{
                                            ...btnAjouter, 
                                            height: '38px',
                                            opacity: (!selectedArt || (qteGrosSaisie === '' && qteDetailSaisie === '' && !qteSaisie)) ? 0.5 : 1
                                        }} 
                                        onClick={handleAjouterAuPanier} 
                                        disabled={!selectedArt || (qteGrosSaisie === '' && qteDetailSaisie === '' && !qteSaisie)}
                                    >
                                        AJOUTER
                                    </button>
                                </div>
                            </div>

                            <input type="hidden" value={qteSaisie} />
                        </div>
                    </div>

                    <div style={{...panierSection, flex: 0.6}}>
                        <div style={panierHeader}>LIGNES DE VENTE (PROVISOIRE)</div>
                        <div style={tableWrapper}>
                            <table style={{ ...fullTable, tableLayout: 'fixed', width: '100%' }}>
                                <thead>
                                    <tr>
                                        <th style={{ ...thMain, width: '30%' }}>DESIGNATION</th>
                                        <th style={{ ...thMain, width: '12%' }}>P.U</th>
                                        <th style={{ ...thMain, textAlign: 'center', width: '22%' }}>QTE</th>
                                        <th style={{ ...thMain, textAlign: 'right', width: '11%' }}>REMISE</th>
                                        <th style={{ ...thMain, textAlign: 'right', width: '10%' }}>TAXE</th>
                                        <th style={{ ...thMain, textAlign: 'right', width: '11%' }}>TOTAL TTC</th>
                                        <th style={{ ...thMain, width: '4%' }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {panier.map((item, idx) => {
                                        const artInfo = item.article_complet || {};
                                        const coeffLogistique = Math.abs(Number(artInfo.coefficient || artInfo.unit_coefficient || item.ratio_conversion || 1)) || 1;
                                        const totalPieces = Math.round(Math.abs(Number(item.quantite || 0)));

                                        return (
                                            <tr key={item.id || idx} style={trPanier}>
                                                <td style={{...tdMain, width: '30%', fontWeight: 'bold'}}>
                                                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {item.nom_article_snap}
                                                    </div>
                                                </td>
                                                <td style={{...tdMain, width: '12%', fontWeight:'bold', color: '#475569'}}>{Number(Math.abs(item.prix_vente_unitaire || 0)).toLocaleString()} F</td>
                                                
                                                <td style={{...tdMain, width: '22%', textAlign: 'center'}}>
                                                    <span style={{ fontWeight: '900', fontSize: '13px', color: '#1E40AF', whiteSpace: 'nowrap' }}>
                                                        {(() => {
                                                            if (item.expression_logistique) return item.expression_logistique;

                                                            const codeGros = (item.unite_gros || artInfo.unit_code_gros || 'CS').toUpperCase();
                                                            const refDetail = (item.unite_detail || item.unite_snap || artInfo.unit_ref_detail || 'Pcs').toUpperCase();

                                                            if (totalPieces <= 0) return `0 ${refDetail}`;

                                                            if (coeffLogistique > 1) {
                                                                const casiersEntiers = Math.floor(totalPieces / coeffLogistique);
                                                                const boitesRestantes = Math.round(totalPieces % coeffLogistique);

                                                                if (casiersEntiers > 0 && boitesRestantes > 0) {
                                                                    return `${casiersEntiers} ${codeGros} + ${boitesRestantes} ${refDetail}`;
                                                                } else if (casiersEntiers > 0) {
                                                                    return `${casiersEntiers} ${codeGros}`;
                                                                } else {
                                                                    return `${boitesRestantes} ${refDetail}`;
                                                                }
                                                            }
                                                            return `${totalPieces} ${refDetail}`;
                                                        })()}
                                                    </span>
                                                    <div style={{ fontSize: '9px', color: '#94A3B8', fontWeight: 'bold', marginTop: '2px' }}>
                                                        Pièces SQL : {totalPieces}
                                                    </div>
                                                </td>
                                                <td style={{...tdMain, width: '11%', textAlign: 'right', color: '#B91C1C'}}>
                                                    {item.remise_montant > 0 ? `-${Number(Math.abs(item.remise_montant)).toLocaleString()} F` : '-'}
                                                </td>
                                                <td style={{...tdMain, width: '10%', textAlign: 'right', color: '#475569'}}>
                                                    {Number(Math.abs(item.taxe_montant || 0)).toLocaleString()} F
                                                </td>
                                                <td style={{...tdMain, width: '11%', fontWeight:'900', color: '#1E40AF', textAlign: 'right'}}>
                                                    {Number(Math.abs(item.montant_ttc_ligne || 0)).toLocaleString()} F
                                                </td>
                                                <td style={{ ...tdMain, width: '4%', textAlign: 'center' }}><button style={btnDel} onClick={() => handleSupprimerLigne(idx)}><Trash2 size={16}/></button></td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <div style={totalContainer}>
                            <div style={totalLabel}>TOTAL PROVISOIRE</div>
                            <div style={{...totalValue, color: panier.length > 0 ? '#fff' : '#1E40AF'}} className={panier.length > 0 ? 'blink-bg' : ''}>
                                {Number(Math.abs(totalGeneral)).toLocaleString()} F
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            <div style={{ display: 'none' }}>
                {printData && printData.panier && printData.panier.length > 0 && (
                    <ProvisoirPrintt
                        ref={printRef}
                        panier={printData.panier}
                        venteInfo={printData.venteInfo}
                        company={printData.company}
                        recapUnites={printData.recapUnites}
                    />
                )}
            </div>
        </div>
    );
};

const layoutStyle = { display: 'flex', height: '100vh', background: '#F1F5F9', fontFamily: 'sans-serif' };
const mainStyle = { flex: 1, padding: '15px', display: 'flex', gap: '15px', overflow: 'hidden', position: 'relative' };
const colGauche = { flex: 1, display: 'flex', flexDirection: 'column' };
const colDroite = { flex: 1, display: 'flex', flexDirection: 'column', gap: '15px' };
const searchSection = { flex: 1, background: '#fff', borderRadius: '8px', border: '1px solid #CBD5E1', padding: '15px', display: 'flex', flexDirection: 'column', overflow:'hidden' };
const saisieSection = { borderRadius: '8px', padding: '15px', display: 'flex', flexDirection: 'column' };
const panierSection = { background: '#fff', borderRadius: '8px', border: '2px solid #1E40AF', display: 'flex', flexDirection: 'column', overflow:'hidden' };
const toastStyle = { position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)', padding: '12px 25px', color: '#fff', borderRadius: '8px', zIndex: 9999, fontWeight: 'bold', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', animation: 'slideDown 0.3s ease-out' };
const lockOverlayStyle = { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(15, 23, 42, 0.9)', zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(4px)' };
const lockCardStyle = { background: '#fff', padding: '40px', borderRadius: '12px', textAlign: 'center', maxWidth: '500px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' };
const btnRetryStyle = { padding: '10px 20px', background: '#1E40AF', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' };
const btnBackStyle = { padding: '10px 20px', background: '#fff', color: '#475569', border: '1px solid #CBD5E1', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px' };
const searchInputsRow = { display: 'flex', gap: '10px', marginBottom: '15px' };
const inputGroup = { display: 'flex', flexDirection: 'column', gap: '5px', flex: 1 };
const labelStyle = { fontSize: '10px', fontWeight: '800', color: '#475569', textTransform: 'uppercase' };
const inputWithIcon = { display: 'flex', alignItems: 'center', gap: '8px', background: '#fff', padding: '10px', borderRadius: '6px', border: '1px solid #CBD5E1' };
const minimalInput = { border: 'none', background: 'transparent', outline: 'none', fontSize: '13px', width: '100%' };
const minimalInputSaisie = { border: '2px solid #000', background: '#fff', outline: 'none', fontSize: '18px', width: '100%', padding:'10px', borderRadius:'6px', fontWeight: 'bold' };
const inputDisabled = { background: '#fff', padding: '12px', borderRadius: '6px', color: '#000', fontWeight:'bold', border: '1px solid #000', fontSize: '14px', marginTop: '5px' };
const formSaisie = { marginTop: '5px' };
const tableWrapper = { overflowY: 'auto', flex: 1 };
const smallTable = { width: '100%', borderCollapse: 'collapse' };
const thSmall = { textAlign: 'left', padding: '10px', background: '#0F172A', color: '#fff', fontSize: '10px' };
const tdSmall = { padding: '10px', borderBottom: '1px solid #E2E8F0', fontSize: '12px' };
const trSelect = { cursor: 'pointer' };
const btnEnregistrer = { background: '#166534', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' };
const btnAnnuler = { background: '#fff', color: '#991B1B', border: '1px solid #991B1B', padding: '8px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' };
const btnAjouter = { background: '#000', color: '#fff', border: 'none', padding: '0 25px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' };
const panierHeader = { background: '#1E40AF', color: '#fff', padding: '10px', fontWeight: 'bold', fontSize: '12px' };
const fullTable = { width: '100%', tableLayout: 'fixed' };
const thMain = { background: '#F8FAFC', padding: '12px', fontSize: '11px', textAlign: 'left', color: '#475569', borderBottom: '1px solid #1E40AF' };
const trPanier = { borderBottom: '1px solid #E2E8F0' };
const tdMain = { padding: '8px', fontSize: '11px' }; 
const totalContainer = { display: 'flex', borderTop: '2px solid #1E40AF', background: '#F8FAFC' };
const totalLabel = { flex: 1, textAlign: 'right', padding: '15px', fontWeight: 'bold', fontSize: '16px' };
const totalValue = { padding: '15px', fontWeight: '900', fontSize: '22px', minWidth: '150px', borderLeft: '2px solid #1E40AF', textAlign: 'center' };
const btnDel = { color: '#EF4444', border: 'none', background: 'none', cursor: 'pointer' };

export default NouvelleVenteProvisoire;