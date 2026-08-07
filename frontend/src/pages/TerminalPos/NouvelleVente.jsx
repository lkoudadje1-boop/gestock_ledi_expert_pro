import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    Search, Trash2, Save, XCircle, ScanBarcode, 
    Wallet, Smartphone, CreditCard, ArrowLeft, CheckCircle,
    Banknote, Landmark, Coins, HandCoins, Receipt, 
    Building2, QrCode, Ticket, CircleEllipsis, ArrowRightLeft, 
    PiggyBank, Briefcase, Monitor, Loader2, Printer
} from 'lucide-react';
import { useReactToPrint } from 'react-to-print';

// Utilisation de l'instance API et du socket centralisé
import API, { socket } from '../../services/api'; 
import Sidebar from '../../components/Sidebar';
import { PricingService } from '../../services/pricing.service';
import ProvisoirPrint from './provisoirprint';

// 🚀 SERVICE CENTRALISÉ DE CONVERSION LOGISTIQUE FRONTEND
import { ConversionStockService } from '../../utils/converisonstock';

const NouvelleVente = () => {
    const navigate = useNavigate();
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    const USER_ID = currentUser.id || 'USR-1';
    const COMPANY_ID = currentUser.company_id || currentUser.companyId || 'CPY-1';
    
    const genererIdLot = () => `LOT-V-${Date.now().toString().slice(-6)}`;
    
    const PosIcons = {
        wallet: <Wallet size={16} />,
        smartphone: <Smartphone size={16} />,
        card: <CreditCard size={16} />,
        banknote: <Banknote size={16} />,
        landmark: <Landmark size={16} />,
        coins: <Coins size={16} />,
        hand: <HandCoins size={16} />,
        receipt: <Receipt size={16} />,
        building: <Building2 size={16} />,
        qr: <QrCode size={16} />,
        ticket: <Ticket size={16} />,
        transfer: <ArrowRightLeft size={16} />,
        piggy: <PiggyBank size={16} />,
        business: <Briefcase size={16} />,
        other: <CircleEllipsis size={16} />
    };

    // --- ÉTATS ---
    const [articles, setArticles] = useState([]);
    const [paymentMethods, setPaymentMethods] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [searchBarCode, setSearchBarCode] = useState('');
    const [selectedArt, setSelectedArt] = useState(null);
    
    // 🛡️ TRIPLE CANAL DE SAISIE LOGISTIQUE
    const [qteSaisie, setQteSaisie] = useState(''); 
    const [saisieGros, setSaisieGros] = useState(''); 
    const [saisieDetail, setSaisieDetail] = useState(''); 

    const [panier, setPanier] = useState([]);
    const [currentLotId, setCurrentLotId] = useState(genererIdLot());
    const [showValidation, setShowValidation] = useState(false);
    const [montantRecu, setMontantRecu] = useState('');
    const [monnaieARendre, setMonnaieARendre] = useState(0);
    const [moyenPaiement, setMoyenPaiement] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [alertMsg, setAlertMsg] = useState({ text: '', type: '' });
    const [paymentMapping, setPaymentMapping] = useState({});
    const [isLocked, setIsLocked] = useState(false);
    const [expandedRows, setExpandedRows] = useState(new Set());
    
    const [formatImpression, setFormatImpression] = useState('A6'); // 'A5' ou 'A6'

    // 🚀 RECTIFICATION LOGISTIQUE INTERNE
    const formaterStockPOS = useCallback((art) => {
        if (!art) return "-";
        
        const valeurStock = art.stock_actuel !== undefined ? art.stock_actuel : (art.stock || 0);
        
        if (typeof valeurStock === 'string' && valeurStock.includes('+')) {
            return valeurStock.replace(/-/g, '');
        }

        const qtePieces = Math.abs(Number(valeurStock)) || 0;
        return ConversionStockService.toExpressionTextuelle(qtePieces, art);
    }, []);

    // --- ÉTATS D'IMPRESSION & PARAMÈTRES SOCIÉTÉ ---
    const printRef = useRef();
    const [printData, setPrintData] = useState(null);
    const [dynamiqueCompanyPrint, setDynamiqueCompanyPrint] = useState({
        name: currentUser.company_name || currentUser.companyName || "LEDI EXPERT PRO",
        address: currentUser.company_address || currentUser.companyAddress || "Adresse non renseignée",
        phone: currentUser.company_phone || currentUser.companyPhone || "Tél: N/A",
        email: currentUser.company_email || currentUser.companyEmail || "Email: N/A",
        logo_data: currentUser.company_logo || currentUser.logo_data || currentUser.logo || null
    });

    // --- CALCULS SECURISE SANS DECALAGE DECIMAL ---
    const totalGeneral = useMemo(() => {
        return panier.reduce((sum, item) => sum + Number(item.montant_ttc_ligne || 0), 0);
    }, [panier]);

    // 🎯 TRI AUTOMATIQUE DU PANIER : CATÉGORIE + UNITÉ DE GROS + NOM ARTICLE
    const panierTrie = useMemo(() => {
        return [...panier].sort((a, b) => {
            const artA = a.article_complet || {};
            const artB = b.article_complet || {};

            // 1. Extraction et comparaison par Catégorie
            const catA = String(artA.categorie || artA.category_name || artA.nom_categorie || a.categorie || '').toLowerCase().trim();
            const catB = String(artB.categorie || artB.category_name || artB.nom_categorie || b.categorie || '').toLowerCase().trim();

            if (catA < catB) return -1;
            if (catA > catB) return 1;

            // 2. Si même catégorie, comparaison par Unité de Gros (ex: CS, B, BOX)
            const unitGrosA = String(a.unite_gros || artA.unit_code_gros || artA.unite_code || artA.code || a.unite_libelle_snap || '').toLowerCase().trim();
            const unitGrosB = String(b.unite_gros || artB.unit_code_gros || artB.unite_code || artB.code || b.unite_libelle_snap || '').toLowerCase().trim();

            if (unitGrosA < unitGrosB) return -1;
            if (unitGrosA > unitGrosB) return 1;

            // 3. Si même unité de gros, tri par Désignation (Nom Article)
            const nomA = String(a.nom_article_snap || artA.nom || '').toLowerCase().trim();
            const nomB = String(b.nom_article_snap || artB.nom || '').toLowerCase().trim();

            return nomA.localeCompare(nomB);
        });
    }, [panier]);

    // 📊 LOGISTIQUE STRICTE : Calcul isolé par couple d'unités exact basés sur le panier trié
    const recapUnites = useMemo(() => {
        const couplesLogistiques = {};

        panierTrie.forEach(item => {
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
                unite_detail: group.detailLabel,
                totalQuantite: ""
            };
        });
    }, [panierTrie]);

    // --- UTILS ---
    const toggleExpand = (id) => {
        const newExpanded = new Set(expandedRows);
        if (newExpanded.has(id)) newExpanded.delete(id);
        else newExpanded.add(id);
        setExpandedRows(newExpanded);
    };

    const showToast = useCallback((text, type = 'success') => {
        setAlertMsg({ text, type });
        setTimeout(() => setAlertMsg({ text: '', type: '' }), 3000);
    }, []);

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

    const fetchArticles = useCallback(async () => {
        try {
            const res = await API.get('/products');
            setArticles(Array.isArray(res.data) ? res.data : []);
        } catch (err) { console.error("Erreur articles:", err); }
    }, []);

    const fetchPaymentMethods = useCallback(async () => {
        try {
            const res = await API.get('/plan-comptable/paiements/methodes');
            if (res.data && res.data.success) {
                const actives = res.data.data.filter(m => m.is_active === 1 && m.is_pos === 1);
                setPaymentMethods(actives);

                const mapping = {};
                res.data.data.forEach(m => {
                    mapping[m.code.toUpperCase()] = m.libelle;
                });
                setPaymentMapping(mapping);
                
                if (actives.length > 0 && !moyenPaiement) {
                    setMoyenPaiement(actives[0].code);
                }
            }
        } catch (err) { console.error("Erreur méthodes de paiement:", err); }
    }, [moyenPaiement]);

    const checkInventoryLock = useCallback(async () => {
        try {
            const res = await API.get('/inventories/check-status');
            setIsLocked(!!res.data.en_cours);
        } catch (err) { console.error("Erreur check lock:", err); }
    }, []);

    const loadSavedCart = useCallback(async () => {
        try {
            const res = await API.get(`/sales/temporary-cart/${USER_ID}`);
            if (res.data && res.data.lignes) {
                setPanier(JSON.parse(res.data.lignes));
            } else {
                setPanier([]);
            }
        } catch (err) { setPanier([]); }
    }, [USER_ID]);

    useEffect(() => {
        fetchArticles();
        loadSavedCart();
        checkInventoryLock();
        fetchPaymentMethods();
    }, [fetchArticles, loadSavedCart, checkInventoryLock, fetchPaymentMethods]);

    useEffect(() => {
        const rafraichirDonneesArticles = () => fetchArticles();

        if (socket) {
            socket.on('STOCK_UPDATED', rafraichirDonneesArticles);
            socket.on('REFRESH_STOCK', rafraichirDonneesArticles);
            socket.on('DATA_EVENT', (data) => {
                if (data.table === 'products' || data.table === 'sales') rafraichirDonneesArticles();
            });
        }

        const handleUpdate = (event) => {
            const { table, status, userId } = event.detail;

            if (
                table === 'products' || 
                table === 'all' || 
                table === 'temporary_carts' || 
                table === 'temporary_factures_carts'
            ) {
                fetchArticles();
            }

            if (table === 'carts' && String(userId) === String(USER_ID)) {
                loadSavedCart();
            }

            if (table === 'payment_methods') fetchPaymentMethods();

            if (table === 'inventory') {
                setIsLocked(status);
                if (status) setShowValidation(false);
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
    }, [USER_ID, fetchArticles, loadSavedCart, fetchPaymentMethods]);

    useEffect(() => {
        if (isSaving) return; 
        const saveCart = async () => {
            try {
                await API.post('/sales/temporary-cart', {
                    vendeur_id: USER_ID,
                    company_id: COMPANY_ID,
                    lignes: JSON.stringify(panier)
                });
                socket?.emit('cart_changed', { userId: USER_ID, companyId: COMPANY_ID });
            } catch (e) { console.error("Erreur sync panier"); }
        };
        const timer = setTimeout(saveCart, 800);
        return () => clearTimeout(timer);
    }, [panier, USER_ID, COMPANY_ID, isSaving]);

    useEffect(() => {
        if (searchBarCode.trim() !== '') {
            const art = articles.find(a => String(a.code_barre || a.codeBarre || '').trim() === searchBarCode.trim());
            if (art) { 
                setSelectedArt(art); 
                setSearchBarCode(''); 
            }
        }
    }, [searchBarCode, articles]);

    useEffect(() => {
        if (!showValidation || !moyenPaiement || paymentMethods.length === 0) return;
        
        const currentMethod = paymentMethods.find(m => m.code === moyenPaiement);
        const code = moyenPaiement.toUpperCase();
        const icone = (currentMethod?.icone_name || '').toLowerCase();

        const isCash = code.includes('CASH') || 
                       code.includes('ESPEC') || 
                       code.includes('CAISS') ||
                       icone === 'wallet' || 
                       icone === 'banknote' ||
                       icone === 'coins';

        const isDigital = code.includes('MOMO') || 
                          code.includes('OM') || 
                          code.includes('BITCOIN') || 
                          code.includes('CRYPTO') ||
                          icone === 'smartphone' || 
                          icone === 'card' || 
                          icone === 'crypto' || 
                          icone === 'qr';

        if (isCash) {
            setMontantRecu(''); 
        } else if (isDigital) {
            setMontantRecu(totalGeneral.toString());
        } else {
            setMontantRecu(totalGeneral.toString());
        }

        const timer = setTimeout(() => {
            const input = document.getElementById('montant-recu-input');
            if (input) {
                input.focus();
                if (isCash) input.select();
            }
        }, 100);

        return () => clearTimeout(timer);
    }, [moyenPaiement, showValidation, paymentMethods, totalGeneral]);

    useEffect(() => {
        const recu = parseFloat(montantRecu) || 0;
        const calculMonnaie = Number((recu - totalGeneral).toFixed(2));
        setMonnaieARendre(calculMonnaie < 0 ? 0 : calculMonnaie);
    }, [montantRecu, totalGeneral]);

    const handlePrint = useReactToPrint({
        content: () => printRef.current,
        documentTitle: `FACTURE_COMPTOIR_${currentLotId}`,
        onBeforeGetContent: () => {
            return new Promise((resolve) => {
                setTimeout(() => {
                    resolve();
                }, 150);
            });
        },
        onAfterPrint: () => {
            setPrintData(null);
        }
    });

    const handleAjouterAuPanier = () => {
        if (!selectedArt) return;

        const gClean = String(saisieGros || '0').replace(/-/g, '').replace(',', '.').trim();
        const dClean = String(saisieDetail || '0').replace(/-/g, '').replace(',', '.').trim();

        const valGros = Math.abs(parseFloat(gClean) || 0);
        const valDetail = Math.abs(parseFloat(dClean) || 0);

        if (valGros === 0 && valDetail === 0) {
            showToast("❌ Veuillez saisir une quantité (Gros ou Détail).", "error");
            return;
        }

        const coeffLogistique = Math.abs(Number(selectedArt.unit_coefficient || selectedArt.coefficient || selectedArt.unit_coeff || 1)) || 1;

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

        const piecesDemandeesAujourdhui = Math.round(valGros * coeffLogistique) + Math.round(valDetail);

        const indexExistant = panier.findIndex(item => item.product_id === selectedArt.id);
        let piecesDejaDansLePanier = 0;

        if (indexExistant !== -1) {
            const itemExistant = panier[indexExistant];
            const gExistant = Math.abs(parseFloat(itemExistant.saisie_gros || 0));
            const dExistant = Math.abs(parseFloat(itemExistant.saisie_detail || 0));
            piecesDejaDansLePanier = Math.round((gExistant * coeffLogistique) + dExistant);
        }

        const piecesDemandeesTotatles = piecesDejaDansLePanier + piecesDemandeesAujourdhui;

        if (piecesDemandeesTotatles > stockTotalDisponiblePieces) {
            const expressionDispoTxt = formaterStockPOS({ ...selectedArt, stock_actuel: stockTotalDisponiblePieces });
            showToast(`❌ Stock insuffisant ! Disponible en rayon : ${expressionDispoTxt}`, 'error');
            return; 
        }

        const qteEquivalentGrosPourTarification = piecesDemandeesTotatles / coeffLogistique;
        const calculs = PricingService.calculerLigne(selectedArt, qteEquivalentGrosPourTarification);
        
        const stockAvantGros = Number((stockTotalDisponiblePieces / coeffLogistique).toFixed(2));
        const stockApresGros = Number((Math.max(0, stockTotalDisponiblePieces - piecesDemandeesTotatles) / coeffLogistique).toFixed(2));

        const gFinal = indexExistant !== -1 ? (Math.abs(parseFloat(panier[indexExistant].saisie_gros || 0)) + valGros) : valGros;
        const dFinal = indexExistant !== -1 ? (Math.abs(parseFloat(panier[indexExistant].saisie_detail || 0)) + valDetail) : valDetail;

        let nouveauPanier = [...panier];

        const meta = ConversionStockService.getMetadata(selectedArt);
        const codeGrosNet = meta.codeGros || selectedArt.code || 'CS';
        const refDetailNet = meta.refDetail || selectedArt.unite_reference || 'BTS';

        const prixUnitaireAuDetailBrut = piecesDemandeesTotatles > 0
            ? (calculs.netAPayer / piecesDemandeesTotatles)
            : Math.abs(Number(selectedArt.prixVente || selectedArt.prix_vente || 0)) / coeffLogistique;

        const itemData = {
            product_id: selectedArt.id,
            nom_article_snap: selectedArt.nom.toUpperCase(),
            
            unite_libelle_snap: codeGrosNet, 
            unite_snap: refDetailNet,        
            
            unite_gros: codeGrosNet,
            unite_detail: refDetailNet,
            ratio_conversion: coeffLogistique,
            
            prix_vente_unitaire: Number(Number(prixUnitaireAuDetailBrut).toFixed(2)), 
            
            quantite: qteEquivalentGrosPourTarification, 
            saisie_gros: gFinal,
            saisie_detail: dFinal,
            
            qte_achetee: `${gFinal}+${dFinal}`,
            qte_vendue_formatee: `${piecesDemandeesTotatles} ${refDetailNet}`,
            
            remise_montant: Number(Number(calculs.remiseTotale || 0).toFixed(2)),
            type_remise_snap: calculs.typeRemise,
            montant_ht_ligne: Number(Number(calculs.montantHT || 0).toFixed(2)),
            taxe_taux_snap: Number(Number(calculs.taxeTaux || 0).toFixed(2)),
            taxe_montant: Number(Number(calculs.montantTaxe || 0).toFixed(2)),
            
            montant_ttc_ligne: Number(Number(calculs.netAPayer || 0).toFixed(2)),
            
            stock_avant_vente: stockAvantGros,
            stock_apres_vente: stockApresGros,
            id_lot: currentLotId,
            user_id: USER_ID,
            company_id: COMPANY_ID,
            statut: 'actif',
            
            article_complet: {
                ...selectedArt,
                id: selectedArt.id,
                nom: selectedArt.nom,
                coefficient: coeffLogistique,
                unit_coefficient: coeffLogistique,
                code: codeGrosNet,
                unit_code_gros: codeGrosNet,
                unite_reference: refDetailNet,
                unit_ref_detail: refDetailNet
            }
        };

        if (indexExistant !== -1) { 
            nouveauPanier[indexExistant] = itemData; 
        } else { 
            itemData.id = `LGN-V-${Date.now()}`; 
            nouveauPanier = [itemData, ...panier]; 
        }

        setPanier(nouveauPanier);
        
        setSelectedArt(null); 
        setSaisieGros('');
        setSaisieDetail('');
        setQteSaisie(1);
        setSearchTerm('');
    };

    const finaliserVente = async () => {
        if (panier.length === 0 || isSaving || isLocked) return false;

        const recu = Math.abs(parseFloat(montantRecu) || 0);
        const totalSecurise = Math.abs(totalGeneral);

        if (recu < totalSecurise) {
            showToast(`❌ Encaissement insuffisant ! Manque : ${(totalSecurise - recu).toLocaleString()} F`, "error");
            return false;
        }

        if (recu > 0 && !moyenPaiement) {
            showToast("Veuillez sélectionner un mode de paiement (Espèces, Moov, etc.)", "error");
            return false;
        }

        setIsSaving(true);
        try {
            const dataVente = { 
                lignes: panierTrie.map(item => ({ 
                    ...item, 
                    quantite: Math.abs(item.quantite || 0),
                    saisie_gros: Math.abs(item.saisie_gros !== undefined ? item.saisie_gros : 0),
                    saisie_detail: Math.abs(item.saisie_detail !== undefined ? item.saisie_detail : 0),
                    prix_vente_unitaire: Math.abs(item.prix_vente_unitaire || 0),
                    remise_montant: Math.abs(item.remise_montant || 0),
                    montant_ht: Math.abs(item.montant_ht_ligne || 0),
                    taxe_montant: Math.abs(item.taxe_montant || 0),
                    montant_ttc_ligne: Math.abs(item.montant_ttc_ligne || 0)
                })),
                staff_id: USER_ID, 
                staff_name: currentUser.username || "utilisateur",
                caissier_id: USER_ID,
                encaissement: {
                    lot_id: currentLotId, 
                    total: totalSecurise,
                    recu: recu, 
                    rendu: Math.max(0, monnaieARendre),
                    moyen_paiement: moyenPaiement, 
                    nom_client: "CLIENT AU COMPTANT"
                }
            };

            const response = await API.post('/sales', dataVente);
           
            if (response.data.success) {
                showToast(`✅ VENTE ${currentLotId} ENREGISTRÉE !`);
                setPanier([]); setMontantRecu(''); setShowValidation(false);
                setCurrentLotId(genererIdLot()); 
                await API.delete(`/sales/temporary-cart/${USER_ID}`);
                if (socket) {
                    socket.emit('cart_changed', { userId: USER_ID, companyId: COMPANY_ID });
                    socket.emit('STOCK_UPDATED');
                }
                await fetchArticles();
                return true;
            }
            return false;
        } catch (err) { 
            showToast(err.response?.data?.error || "Erreur lors de l'enregistrement", "error"); 
            return false;
        } finally { setIsSaving(false); }
    };

    const finaliserVenteAvecImpression = async (formatChoisi = 'A6') => {
        if (panier.length === 0 || isSaving || isLocked) return;

        const recu = Math.abs(parseFloat(montantRecu) || 0);
        const totalSecurise = Math.abs(totalGeneral);
        const renduMonnaie = Math.max(0, monnaieARendre);

        setFormatImpression(formatChoisi);

        const panierSauvegarde = panierTrie.map(item => ({
            ...item,
            quantite: Math.abs(item.quantite || 0),
            saisie_gros: Math.abs(item.saisie_gros || 0),
            saisie_detail: Math.abs(item.saisie_detail || 0),
            montant_ttc_ligne: Math.abs(item.montant_ttc_ligne || 0)
        }));

        setPrintData({
            panier: panierSauvegarde,
            venteInfo: {
                facture_no: currentLotId,
                date: new Date().toISOString(),
                client_nom: "CLIENT AU COMPTANT",
                mode_paiement: paymentMapping[moyenPaiement?.toUpperCase()] || 'Espèces',
                vendeur: currentUser.username || "Caissier",
                est_definitive: true, 
                montant_recu: recu > 0 ? recu : totalSecurise,
                reliquat: renduMonnaie,
                format: formatChoisi
            },
            company: { ...dynamiqueCompanyPrint },
            recapUnites: recapUnites
        });

        const succesVente = await finaliserVente();
        
        if (succesVente) {
            setTimeout(() => {
                setFormatImpression(formatChoisi);
                handlePrint();
            }, 350);
        }
    };

    const renderPaymentIcon = (iconName, code) => {
        if (iconName && PosIcons[iconName]) return PosIcons[iconName];
        const c = code.toUpperCase();
        if (c.includes('CASH') || c.includes('ESPECE')) return <Wallet size={16}/>;
        if (c.includes('MOMO') || c.includes('OM') || c.includes('MOBILE')) return <Smartphone size={16}/>;
        return <CreditCard size={16}/>;
    };

    return (
        <div style={layoutStyle}>
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
                    gap: '15px',
                    animation: 'slideDown 0.3s ease-out'
                }}>
                    <XCircle size={24} color="#EF4444" />
                    <div>
                        <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 'bold', color: '#991B1B' }}>
                            INVENTAIRE EN COURS
                        </h4>
                        <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#7F1D1D' }}>
                            L'accès à la caisse est restreint durant le comptage physique.
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
                            onClick={() => window.location.reload()} 
                            style={{ ...btnEnregistrer, padding: '4px 10px', fontSize: '12px', height: 'auto' }}
                        >
                            Actualiser
                        </button>
                    </div>
                </div>
            )}

            {alertMsg.text && (
                <div style={{ ...toastStyle, backgroundColor: alertMsg.type === 'error' ? '#EF4444' : '#1E40AF', border: '2px solid #fff' }}>
                    <CheckCircle size={18} /> {alertMsg.text}
                </div>
            )}

            <style>{`
                @keyframes blink-red { 0% { background-color: #FCA5A5; } 50% { background-color: #EF4444; } 100% { background-color: #FCA5A5; } }
                .blink-bg { animation: blink-red 0.8s infinite ease-in-out; }
                @keyframes slideDown { from { transform: translate(-50%, -100%); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
                
                @media print {
                    @media print {
                        @page { 
                            size: ${formatImpression === 'A5' ? 'A5 landscape' : 'auto'}; 
                            margin: ${formatImpression === 'A5' ? '10mm' : '0mm'}; 
                        }
                    }
                }
            `}</style>

            <Sidebar />
            <main style={mainStyle}>
                {showValidation && <div style={blockerOverlay} />}

                <div style={colGauche}>
                    <div style={searchSection}>
                        <div style={searchInputsRow}>
                            <div style={inputGroup}><label style={labelStyle}>NOM ARTICLE</label>
                                <div style={inputWithIcon}><Search size={14}/><input style={minimalInput} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div>
                            </div>
                            <div style={inputGroup}><label style={labelStyle}>CODE BARRE</label>
                                <div style={inputWithIcon}><ScanBarcode size={14}/><input style={minimalInput} value={searchBarCode} onChange={(e) => setSearchBarCode(e.target.value)} /></div>
                            </div>
                        </div>
                        <div style={tableWrapper}>
                            <table style={smallTable}>
                                <thead><tr><th style={thSmall}>ARTICLE</th><th style={thSmall}>STOCK</th><th style={thSmall}>PRIX</th></tr></thead>
                                <tbody>
                                    {articles.filter(a => a.nom.toLowerCase().includes(searchTerm.toLowerCase())).map(art => (
                                        <tr key={art.id} onClick={() => {
                                            setSelectedArt(art);
                                            setSaisieGros('');
                                            setSaisieDetail('');
                                        }} style={{...trSelect, background: selectedArt?.id === art.id ? '#fef9c3' : 'transparent'}}><td style={tdSmall}>{art.nom.toUpperCase()}</td><td style={{...tdSmall, color: (art.stock_actuel && !isNaN(Number(art.stock_actuel)) && Number(art.stock_actuel) <= 0) ? 'red' : 'inherit', fontWeight: (art.stock_actuel && !isNaN(Number(art.stock_actuel)) && Number(art.stock_actuel) <= 0) ? 'bold' : 'normal' }}><span style={{ background: '#F8FAFC', padding: '2px 6px', borderRadius: '4px', border: '1px solid #CBD5E1', fontSize: '11px', fontWeight: '700', display: 'inline-block' }}>{formaterStockPOS(art)}</span></td><td style={{...tdSmall, fontWeight: 'bold'}}>{Number(art.prixVente || art.prix_vente || 0).toLocaleString()} F</td></tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div style={colDroite}>
                    <div style={{...saisieSection, flex: 0.4, background: showValidation ? '#EFF6FF' : '#F0FDF4', border: showValidation ? '2px solid #1E40AF' : '1px solid #BBF7D0', zIndex: 1001}}>
                        {!showValidation ? (
                            <>
                                <div style={{display:'flex', justifyContent:'space-between', marginBottom:'10px'}}>
                                     <span style={{fontSize:'12px', fontWeight:'bold'}}>LOT : {currentLotId}</span>
                                     <div style={{display:'flex', gap:'8px'}}>
                                         <button type="button" style={btnAnnuler} onClick={() => setPanier([])}><Trash2 size={14}/> VIDER</button>
                                         <button type="button" disabled={panier.length === 0} style={btnEnregistrer} onClick={() => setShowValidation(true)}><Save size={14}/> VALIDER</button>
                                     </div>
                                </div>
                                <div style={formSaisie}>
                                    <label style={labelStyle}>SÉLECTION</label>
                                    <div style={inputDisabled}>{selectedArt ? `${selectedArt.nom.toUpperCase()} (${Number(selectedArt.prixVente || selectedArt.prix_vente || 0).toLocaleString()} F)` : 'AUCUN ARTICLE'}</div>
                                    
                                    <div style={{display:'flex', gap:'10px', marginTop:'15px'}}>
                                         
                                         {selectedArt && Number(selectedArt.unit_coefficient || selectedArt.coefficient || 1) > 1 && (
                                             <div style={{flex: 1, position: 'relative'}}>
                                                <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#64748b', display: 'block', marginBottom: '2px' }}>
                                                    EN GROS {`(${String(selectedArt.unit_code_gros || selectedArt.unite_code || selectedArt.code || 'CS').toUpperCase()})`}
                                                </span>
                                                <input 
                                                    type="number" 
                                                    min="0"
                                                    disabled={!selectedArt}
                                                    style={{ ...minimalInputSaisie, fontWeight: '900', background: 'white' }} 
                                                    value={saisieGros} 
                                                    onKeyDown={(e) => {
                                                        if (e.key === '-' || e.key === 'e' || e.key === 'E' || e.key === '+') {
                                                            e.preventDefault();
                                                        }
                                                    }}
                                                    onChange={(e) => {
                                                        const positiveVal = e.target.value.replace(/[^0-9.]/g, '');
                                                        setSaisieGros(positiveVal);
                                                    }} 
                                                    placeholder="0"
                                                />
                                             </div>
                                         )}

                                         <div style={{flex: 1, position: 'relative'}}>
                                            <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#64748b', display: 'block', marginBottom: '2px' }}>
                                                AU DÉTAIL {selectedArt ? `(${String(selectedArt.unit_ref_detail || selectedArt.unite_reference || 'UNITÉ').toUpperCase()})` : ''}
                                            </span>
                                            <input 
                                                type="number" 
                                                min="0"
                                                disabled={!selectedArt}
                                                style={{ ...minimalInputSaisie, fontWeight: '900' }} 
                                                value={saisieDetail} 
                                                onKeyDown={(e) => {
                                                    if (e.key === '-' || e.key === 'e' || e.key === 'E' || e.key === '+') {
                                                        e.preventDefault();
                                                    }
                                                }}
                                                onChange={(e) => {
                                                    const positiveVal = e.target.value.replace(/[^0-9.]/g, '');
                                                    setSaisieDetail(positiveVal);
                                                }} 
                                                placeholder="0"
                                            />
                                         </div>

                                         <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                                            <button 
                                                type="button" 
                                                style={{...btnAjouter, opacity: (!selectedArt || (saisieGros === '' && saisieDetail === '')) ? 0.5 : 1}} 
                                                onClick={handleAjouterAuPanier} 
                                                disabled={!selectedArt || (saisieGros === '' && saisieDetail === '')}
                                            >
                                                AJOUTER
                                            </button>
                                         </div>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div style={encaissementContainer}>
                                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px'}}>
                                    <label style={labelStyle}>ENCAISSEMENT</label>
                                    <button type="button" onClick={() => setShowValidation(false)} style={btnRetourAction}><ArrowLeft size={14}/> RETOUR</button>
                                </div>
                                
                                <div style={{...paymentToggleRow, flexWrap: 'wrap', gap: '8px', marginBottom: '15px'}}>
                                    {paymentMethods.map(method => (
                                        <button 
                                            type="button"
                                            key={method.id}
                                            onClick={() => setMoyenPaiement(method.code)} 
                                            style={moyenPaiement === method.code ? btnPayActive : btnPayInactive}
                                        >
                                            {renderPaymentIcon(method.icone_name, method.code)}
                                            <span style={{ marginLeft: '5px' }}>{method.libelle}</span>
                                        </button>
                                    ))}
                                </div>

                                <div style={{marginTop:'10px'}}>
                                    <label style={labelStyle}>MONTANT REÇU</label>
                                    <input 
                                        id="montant-recu-input"
                                        autoFocus 
                                        style={{
                                            ...inputRecuV2, 
                                            background: montantRecu === '' ? '#fff' : '#F1F5F9',
                                            fontWeight: '900',
                                            fontSize: '20px'
                                        }} 
                                        type="text" 
                                        placeholder="0"
                                        value={montantRecu} 
                                        readOnly={montantRecu === Math.abs(totalGeneral).toString() && moyenPaiement.toUpperCase().includes('ESPEC') === false} 
                                        onKeyDown={(e) => {
                                            if (e.key === '-' || e.key === 'e' || e.key === 'E' || e.key === '+') {
                                                e.preventDefault();
                                            }
                                        }}
                                        onChange={(e) => {
                                            const val = e.target.value.replace(/[^\d]/g, '');
                                            setMontantRecu(val);
                                        }} 
                                        onFocus={(e) => e.target.select()}
                                    />
                                </div>
                                <div style={monnaieStyleV2(monnaieARendre)}>MONNAIE : {monnaieARendre >= 0 ? Math.round(monnaieARendre).toLocaleString() : 0} F</div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '15px' }}>
                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        <button 
                                            type="button"
                                            disabled={isLocked || isSaving || !moyenPaiement || (Math.abs(parseFloat(montantRecu || 0)) < Math.abs(totalGeneral) && moyenPaiement.toUpperCase() === 'ESPECES')} 
                                            style={{
                                                ...btnFinalV2,
                                                flex: 1,
                                                backgroundColor: (isLocked || !moyenPaiement || (Math.abs(parseFloat(montantRecu || 0)) < Math.abs(totalGeneral) && moyenPaiement.toUpperCase() === 'ESPECES')) ? '#94a3b8' : '#16a34a',
                                                cursor: (isLocked || isSaving || !moyenPaiement) ? 'not-allowed' : 'pointer'
                                            }} 
                                            onClick={() => finaliserVenteAvecImpression('A6')}
                                        >
                                            {isSaving ? <Loader2 className="animate-spin" size={18}/> : <Printer size={18}/>}
                                            <span style={{marginLeft: '8px'}}>
                                                {isLocked ? "BLOQUÉ (INVENTAIRE)" : "VALIDER & IMPRIMER (A6)"}
                                            </span>
                                        </button>

                                        <button 
                                            type="button"
                                            disabled={isLocked || isSaving || !moyenPaiement || (Math.abs(parseFloat(montantRecu || 0)) < Math.abs(totalGeneral) && moyenPaiement.toUpperCase() === 'ESPECES')} 
                                            style={{
                                                ...btnFinalV2,
                                                flex: 1,
                                                backgroundColor: (isLocked || !moyenPaiement || (Math.abs(parseFloat(montantRecu || 0)) < Math.abs(totalGeneral) && moyenPaiement.toUpperCase() === 'ESPECES')) ? '#94a3b8' : '#2563eb',
                                                cursor: (isLocked || isSaving || !moyenPaiement) ? 'not-allowed' : 'pointer'
                                            }} 
                                            onClick={() => finaliserVenteAvecImpression('A5')}
                                        >
                                            {isSaving ? <Loader2 className="animate-spin" size={18}/> : <Printer size={18}/>}
                                            <span style={{marginLeft: '8px'}}>
                                                {isLocked ? "INVENTAIRE..." : "VALIDER & IMPRIMER (A5)"}
                                            </span>
                                        </button>
                                    </div>

                                    <button 
                                        type="button"
                                        disabled={isLocked || isSaving || !moyenPaiement || (Math.abs(parseFloat(montantRecu || 0)) < Math.abs(totalGeneral) && moyenPaiement.toUpperCase() === 'ESPECES')} 
                                        style={{
                                            ...btnFinalV2,
                                            backgroundColor: (isLocked || !moyenPaiement || (Math.abs(parseFloat(montantRecu || 0)) < Math.abs(totalGeneral) && moyenPaiement.toUpperCase() === 'ESPECES')) ? '#94a3b8' : '#166534',
                                            cursor: (isLocked || isSaving || !moyenPaiement) ? 'not-allowed' : 'pointer',
                                            width: '100%'
                                        }} 
                                        onClick={finaliserVente}
                                    >
                                        {isSaving ? <Loader2 className="animate-spin" size={18}/> : <CheckCircle size={18}/>}
                                        <span style={{marginLeft: '8px'}}>
                                            {isLocked ? 'ACCÈS RESTREINT (COMPTAGE EN COURS)' : !moyenPaiement ? 'CHOISIR MODE' : isSaving ? 'TRAITEMENT...' : 'CONFIRMER SANS TICKET'}
                                        </span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    <div style={{...panierSection, flex: 0.6, opacity: showValidation ? 0.6 : 1, pointerEvents: showValidation ? 'none' : 'auto'}}>
                        <div style={panierHeader}>LIGNES DE VENTE ACTIVES</div>
                        <div style={tableWrapper}>
                            <table style={fullTable}>
                                <thead>
                                    <tr>
                                        <th style={thMain}>DESIGNATION</th>
                                        <th style={{...thMain, textAlign: 'center'}}>QTE</th>
                                        <th style={thMain}>P.U</th>
                                        <th style={thMain}>REMISE</th>
                                        <th style={thMain}>TAXE</th>
                                        <th style={thMain}>TOTAL TTC</th>
                                        <th style={thMain}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {/* 🚀 RENDU DU PANIER UTILISANT LE PANIER TRIÉ PAR CATÉGORIE ET UNITÉ DE GROS */}
                                    {panierTrie.map((item, idx) => (
                                        <tr key={item.id || idx} style={trPanier}>
                                            <td style={{...tdMain, fontWeight: 'bold'}}>{item.nom_article_snap}</td>
                                            <td style={{ ...tdMain, textAlign: 'center' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                                    <span style={{ fontWeight: '900', fontSize: '14px', color: '#1E40AF', whiteSpace: 'nowrap' }}>
                                                        {(() => {
                                                            const g = Math.abs(parseFloat(item.saisie_gros || 0));
                                                            const d = Math.abs(parseFloat(item.saisie_detail || 0));
                                                            const artInfo = item.article_complet || {};
                                                            
                                                            const codeGros = String(item.unite_gros || artInfo.unit_code_gros || artInfo.unite_code || artInfo.code || item.unite_libelle_snap || 'CS').toUpperCase().trim();
                                                            const refDetail = String(item.unite_detail || artInfo.unit_ref_detail || artInfo.unite_reference || item.unite_snap || 'UNITÉ').replace(/\(s\)/g, '').toUpperCase().trim();

                                                            if (g > 0 && d > 0) {
                                                                return `${g} ${codeGros} + ${d} ${refDetail}`;
                                                            } else if (g > 0) {
                                                                return `${g} ${codeGros}`;
                                                            } else if (d > 0) {
                                                                return `${d} ${refDetail}`;
                                                            }
                                                            return `0 ${refDetail}`;
                                                        })()}
                                                    </span>

                                                   <span style={{ fontSize: '9px', color: '#94A3B8', fontWeight: 'bold', marginTop: '2px' }}>
                                                        Ratio Gros : {String(Number(Math.abs(item.quantite || 0)).toFixed(2)).replace('.', ',')}
                                                   </span>
                                                </div>
                                            </td>
                                            <td style={tdMain}>{Number(Math.abs(item.prix_vente_unitaire || 0)).toLocaleString()} F</td>
                                            <td style={{...tdMain, color: '#EF4444'}}>{item.remise_montant > 0 ? `-${Number(Math.abs(item.remise_montant)).toLocaleString()}` : '-'}</td>
                                            <td style={{...tdMain, color: '#64748B'}}>{Number(Math.abs(item.taxe_montant || 0)).toLocaleString()}</td>
                                            <td style={{...tdMain, fontWeight:'900', color: '#1E40AF'}}>{Number(Math.abs(item.montant_ttc_ligne || 0)).toLocaleString()} F</td>
                                            <td style={tdMain}>
                                                <button type="button" style={btnDel} onClick={() => setPanier(panier.filter(p => p.id !== item.id))}><Trash2 size={16}/></button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div style={totalContainer}>
                            <div style={totalLabel}>TOTAL À ENCAISSER</div>
                            <div style={{...totalValue, color: panier.length > 0 ? '#fff' : '#1E40AF'}} className={panier.length > 0 ? 'blink-bg' : ''}>{Math.abs(totalGeneral).toLocaleString()} F</div>
                        </div>
                    </div>
                </div>
            </main>

            {printData && (
                <div style={{ display: 'none' }}>
                    <ProvisoirPrint
                        ref={printRef}
                        panier={printData.panier}
                        venteInfo={printData.venteInfo}
                        company={printData.company}
                        format={formatImpression}
                        recapUnites={printData.recapUnites}
                    />
                </div>
            )}
        </div>
    );
};

// =========================================================================
// STYLES
// =========================================================================
const layoutStyle = { display: 'flex', height: '100vh', background: '#F8FAFC', fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' };
const mainStyle = { flex: 1, padding: '20px', display: 'flex', gap: '20px', overflow: 'hidden', position: 'relative' };
const colGauche = { flex: 1.1, display: 'flex', flexDirection: 'column' };
const colDroite = { flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' };
const searchSection = { flex: 1, background: '#ffffff', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '20px', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' };
const saisieSection = { borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', transition: 'all 0.3s ease' };
const panierSection = { background: '#ffffff', borderRadius: '12px', border: '1px solid #CBD5E1', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.05)' };
const toastStyle = { position: 'fixed', top: '25px', left: '50%', transform: 'translateX(-50%)', padding: '14px 35px', color: '#ffffff', borderRadius: '50px', zIndex: 9999, fontWeight: '700', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15)', animation: 'slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1)' };
const btnRetourAction = { display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 18px', background: '#DC2626', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', color: '#ffffff', boxShadow: '0 2px 4px rgba(220, 38, 38, 0.15)', transition: 'background 0.2s ease' };
const blockerOverlay = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(255, 255, 255, 0.4)', zIndex: 1000, cursor: 'not-allowed', backdropFilter: 'blur(1px)' };
const encaissementContainer = { display: 'flex', flexDirection: 'column', height: '100%' };
const paymentToggleRow = { display: 'flex', gap: '8px', marginTop: '8px' };
const btnPayActive = { flex: 1, background: '#4F46E5', color: '#ffffff', border: 'none', padding: '12px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', minWidth: '85px', boxShadow: '0 4px 6px -1px rgba(79, 70, 229, 0.2)', transition: 'all 0.2s ease' };
const btnPayInactive = { flex: 1, background: '#ffffff', color: '#475569', border: '1px solid #CBD5E1', padding: '12px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', minWidth: '85px', transition: 'all 0.15s ease' };
const inputRecuV2 = { width: '100%', padding: '12px', fontSize: '26px', fontWeight: '900', border: '2px solid #4F46E5', borderRadius: '10px', textAlign: 'center', color: '#0F172A', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.03)', outline: 'none', transition: 'border-color 0.2s ease' };
const monnaieStyleV2 = (m) => ({ padding: '12px', background: m >= 0 ? '#DCFCE7' : '#FEE2E2', color: m >= 0 ? '#15803D' : '#B91C1C', marginTop: '10px', borderRadius: '8px', fontWeight: '800', textAlign: 'center', fontSize: '15px', border: m >= 0 ? '1px solid #BBF7D0' : '1px solid #FCA5A5' });
const btnFinalV2 = { width: '100%', background: '#10B981', color: '#ffffff', border: 'none', padding: '14px', borderRadius: '8px', marginTop: 'auto', fontWeight: '700', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.2)', transition: 'background 0.2s ease' };
const searchInputsRow = { display: 'flex', gap: '12px', marginBottom: '18px' };
const inputGroup = { display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 };
const labelStyle = { fontSize: '11px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' };
const inputWithIcon = { display: 'flex', alignItems: 'center', gap: '10px', background: '#F8FAFC', padding: '10px 14px', borderRadius: '8px', border: '1px solid #CBD5E1', transition: 'all 0.2s ease', outline: 'none' };
const minimalInput = { border: 'none', background: 'transparent', outline: 'none', fontSize: '14px', color: '#1E293B', width: '100%', fontWeight: '500' };
const minimalInputSaisie = { border: '1px solid #94A3B8', background: '#ffffff', outline: 'none', fontSize: '18px', width: '100%', padding: '12px', borderRadius: '8px', fontWeight: '700', color: '#0F172A', textAlign: 'center', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)', transition: 'all 0.2s ease' };
const inputDisabled = { background: '#F1F5F9', padding: '14px', borderRadius: '8px', color: '#334155', fontWeight: '700', border: '1px solid #E2E8F0', fontSize: '14px', marginTop: '4px', letterSpacing: '0.02em' };
const formSaisie = { marginTop: '8px' };
const tableWrapper = { overflowY: 'auto', flex: 1, borderRadius: '8px', border: '1px solid #F1F5F9' };
const smallTable = { width: '100%', borderCollapse: 'separate', borderSpacing: 0 };
const thSmall = { textAlign: 'left', padding: '12px 14px', background: '#0F172A', color: '#ffffff', fontSize: '11px', fontWeight: '600', letterSpacing: '0.02em', position: 'sticky', top: 0, zIndex: 10 };
const tdSmall = { padding: '12px 14px', borderBottom: '1px solid #F1F5F9', fontSize: '13px', color: '#334155' };
const trSelect = { cursor: 'pointer', transition: 'background 0.15s ease' };
const btnEnregistrer = { background: '#10B981', color: '#ffffff', border: 'none', padding: '10px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 2px 4px rgba(16, 185, 129, 0.15)', transition: 'background 0.2s ease' };
const btnAnnuler = { background: '#ffffff', color: '#DC2626', border: '1px solid #FCA5A5', padding: '10px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s ease' };
const btnAjouter = { background: '#0F172A', color: '#ffffff', border: 'none', padding: '0 30px', borderRadius: '8px', fontWeight: '600', fontSize: '13px', cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(15, 23, 42, 0.15)', transition: 'background 0.2s ease', height: '40px' };
const panierHeader = { background: '#4F46E5', color: '#ffffff', padding: '14px 18px', fontWeight: '700', fontSize: '13px', letterSpacing: '0.03em' };
const fullTable = { width: '100%', borderCollapse: 'separate', borderSpacing: 0 };
const thMain = { background: '#F8FAFC', padding: '14px 16px', fontSize: '11px', fontWeight: '700', textAlign: 'left', color: '#475569', borderBottom: '2px solid #E2E8F0', letterSpacing: '0.02em' };
const trPanier = { borderBottom: '1px solid #F1F5F9', transition: 'background 0.15s ease' };
const tdMain = { padding: '12px 16px', fontSize: '13px', color: '#1E293B', verticalAlign: 'middle' };
const totalContainer = { display: 'flex', alignItems: 'center', borderTop: '2px solid #E2E8F0', background: '#F8FAFC' };
const totalLabel = { flex: 1, textAlign: 'right', padding: '20px 25px', fontWeight: '700', fontSize: '14px', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' };
const totalValue = { padding: '18px', fontWeight: '900', fontSize: '26px', minWidth: '180px', background: '#4F46E5', color: '#ffffff', textAlign: 'center', transition: 'all 0.3s ease' };
const btnDel = { color: '#EF4444', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px', borderRadius: '6px', transition: 'all 0.15s ease' };

export default NouvelleVente;