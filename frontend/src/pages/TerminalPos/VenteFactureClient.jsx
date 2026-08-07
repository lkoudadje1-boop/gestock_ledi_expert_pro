import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    Search, Trash2, Plus, Minus, Printer, ArrowRight, Barcode, 
    User, CheckCircle, AlertCircle, Package, XCircle, Info, X 
} from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import API, { socket } from '../../services/api';
import { PricingService } from '../../services/pricing.service';
import { useReactToPrint } from 'react-to-print';
import InvoicePrint from './InvoicePrint';
// 🚀 AJOUT DE L'IMPORTATION LOGISTIQUE MANQUANTE
import { ConversionStockService } from '../../utils/converisonstock';

const VenteFactureClient = () => {
    const navigate = useNavigate();
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const vendeurId = user.id;

    const [printData, setPrintData] = useState(null);
    const [printFormat, setPrintFormat] = useState('A4');
    
    // --- ÉTATS ---
    const [settings, setSettings] = useState(null);
    const [paymentMethods, setPaymentMethods] = useState([]);
    const [articles, setArticles] = useState([]);
    const [customers, setCustomers] = useState([]); 
    const [panier, setPanier] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [barcodeSearch, setBarcodeSearch] = useState('');
    const [company, setCompany] = useState({ name: "LEDI EXPERT PRO", address: "", phone: "", nif_number: "", logo_data: "" });

    // 🚀 ALIGNEMENT POS CENTRALISÉ : Résolution définitive du tout CARTON et du problème AZS coupé
    const formaterStockPOS = useCallback((art) => {
        if (!art) return "-";
        
        // 1. Extraction tolérante de la valeur brute du stock physique
        const valeurStock = art.stock_actuel !== undefined ? art.stock_actuel : (art.stock || 0);
        
        // 2. 🛡️ VERROU ANTI-NaN : Si SQLite ou le serveur renvoie déjà du texte pré-formaté
        if (typeof valeurStock === 'string' && isNaN(Number(valeurStock.trim()))) {
            return valeurStock;
        }

        // 3. Délégation stricte au moteur unique anti-litige de l'application
        const qtePieces = Math.abs(Number(valeurStock)) || 0;
        return ConversionStockService.toExpressionTextuelle(qtePieces, art);
    }, []);
    

    const normalizeFormat = (format) => {
        switch (format) {
            case 'TICKET':
                return 'TICKET';
            case 'A6':
                return 'A6';
            case 'A5':
                return 'A5';
            case 'A4':
            default:
                return 'A4';
        }
    };

    // NOUVEAU SYSTÈME DE TOASTS
    const [toasts, setToasts] = useState([]);

    const showToast = (text, type = 'success') => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, text, type }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 4000);
    };

    const removeToast = (id) => setToasts(prev => prev.filter(t => t.id !== id));

    const [venteInfo, setVenteInfo] = useState({ 
        client_id: '', 
        client_nom: 'CLIENT AU COMPTANT', 
        type_vente: 'COMPTANT',
        mode_paiement: '',      
        montant_verse: 0,       
        facture_no: '' 
    });
    
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [saisieQte, setSaisieQte] = useState(1);
    
    // 🚀 ALIGNEMENT POS : Ajout des cases Gros et Détail pour l'interface de droite
    const [qteGrosSaisie, setQteGrosSaisie] = useState('');
    const [qteDetailSaisie, setQteDetailSaisie] = useState('');
    
    const [isSyncing, setIsSyncing] = useState(false);

    const componentRef = useRef(null);
    const barcodeInputRef = useRef(null);

    // 📊 LOGISTIQUE STRICTE : Calcul isolé par couple d'unités exact sans mélange (CS et CS2 restent séparés)
       // 📊 LOGISTIQUE STRICTE : Calcul isolé par couple d'unités exact sans mélange (CS et CS2 restent séparés)
    const recapUnites = useMemo(() => {
        const couplesLogistiques = {};

        panier.forEach(item => {
            const ratio = Math.abs(parseInt(item.ratio_conversion || item.ratio || 1));
            const gros = Math.abs(Number(item.saisie_gros || 0));
            const detail = Math.abs(Number(item.saisie_detail || 0));
            const qteTotal = Math.abs(Number(item.quantite || 0));

            // 🔒 SÉCURITÉ CRITIQUE : On prend l'unité de gros exacte sans couper le texte (CS, CS2, etc. restent séparés)
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

        // Reconstruction des chaînes textuelles rattachées prêtes pour le composant InvoicePrint
        return Object.keys(couplesLogistiques).map(cle => {
            const group = couplesLogistiques[cle];
            const cartonsFinaux = Math.floor(group.totalPieces / group.ratio);
            const bouteillesFinelles = Math.round(group.totalPieces % group.ratio);

            // 🎯 RECTIFICATION COMPTABLE MAJEURE : On force TOUJOURS l'écriture complète "Gros + Détail" 
            // pour empêcher le modèle InvoicePrint de mélanger ou d'omettre CS et CS2
            const expressionAssociee = `${cartonsFinaux} ${group.grosLabel} + ${bouteillesFinelles} ${group.detailLabel}`;

            return {
                unite: expressionAssociee,
                unite_gros: group.grosLabel,    // 🛡️ Propagé pour le découplage chirurgical à l'impression
                unite_detail: group.detailLabel, // 🛡️ Propagé pour le découplage chirurgical à l'impression
                totalQuantite: ""
            };
        });
    }, [panier]);


    const handlePrint = useReactToPrint({
        content: () => componentRef.current,
        documentTitle: venteInfo.facture_no || 'FACTURE',
        pageStyle: `
            @page {
                ${
                    printFormat === 'A6'
                        ? 'size: A6 portrait;'
                        : printFormat === 'A5'
                        ? 'size: A5 portrait;'
                        : 'size: A4 portrait;'
                }
                margin: 0;
            }
            @media print {
                html, body {
                    width: 100%;
                    height: 100%;
                    margin: 0 !important;
                    padding: 0 !important;
                    overflow: hidden;
                }
                body {
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }
            }
        `,
        onBeforeGetContent: async () => {
            if (!printData) {
                await new Promise((r) => setTimeout(r, 200));
            }
        }
    });

    // --- LOGIQUE D'IMPRESSION ELECTRON ---
    const executerImpressionElectron = (donneesVente, format) => {
        if (format === 'A4') {
            setVenteInfo(prev => ({ ...prev, facture_no: donneesVente.facture_no }));
            setTimeout(() => { handlePrint(); finaliserVente(); }, 500); 
            return;
        }


const activeCompany = company || {}; 
        const isSmall = format === 'ticket' || format === 'half-A5';
        const htmlContent = `
            <html>
                <head>
                    <style>
                        body { font-family: 'Segoe UI', sans-serif; margin: 0; padding: ${isSmall ? '2mm' : '10mm'}; color: #000; }
                        .header { text-align: center; margin-bottom: 15px; border-bottom: 1px solid #000; padding-bottom: 10px; }
                        .logo { max-height: 50px; margin-bottom: 5px; }
                        .company-name { margin:0; font-size: ${isSmall ? '16px' : '20px'}; font-weight: bold; }
                        .company-info { font-size: 10px; margin: 2px 0; }
                        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                        th { background: #f2f2f2; font-size: 10px; padding: 5px; border: 1px solid #ddd; text-align: left; }
                        td { font-size: 10px; padding: 5px; border: 1px solid #ddd; }
                        .recap-section { margin-top: 8px; padding: 4px; border-top: 1px dashed #000; border-bottom: 1px dashed #000; font-size: 9px; background-color: #fafafa; }
                        .recap-badge { display: inline-block; background: #e2e8f0; padding: 1px 4px; margin-right: 8px; font-weight: bold; border-radius: 3px; font-family: monospace; }
                        .total-section { margin-top: 15px; text-align: right; }
                        .grand-total { font-size: 14px; font-weight: bold; border-top: 2px solid #000; padding-top: 5px; }
                        .footer { margin-top: 20px; text-align: center; font-size: 9px; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        ${activeCompany.logo_data ? `<img src="${activeCompany.logo_data}" class="logo" />` : ''}
                        <h1 class="company-name">${activeCompany.name || "ENTREPRISE"}</h1>
                        <div class="company-info">${activeCompany.address || ""}</div>
                        <div class="company-info">Tél: ${activeCompany.phone || ""}</div>
                        <hr />
                        <p style="margin:5px 0; font-weight: bold;">REÇU N°: ${donneesVente.facture_no}</p>
                    </div>
                    <div style="font-size: 10px; margin-bottom: 10px;">
                        <div>Date: ${new Date().toLocaleString('fr-FR')}</div>
                        <div>Client: ${donneesVente.client_nom}</div>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>Désignation</th>
                                <th style="text-align:center">Qté</th>
                                <th style="text-align:right">Total TTC</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${donneesVente.lignes.map(item => `
                                <tr>
                                    <td>${item.nom_article_snap || item.nom || "Article"}</td>
                                    <!-- 🚀 MUTATION LOGISTIQUE EN HYDRO-HTML : Exploitation directe du format hybride textuel centralisé -->
                                    <td style="text-align:center; font-weight: bold;">
                                        ${item.texte_affichage || item.qte_vendue_formatee || item.quantite_formatee || item.qte_vendue || item.quantite || 0}
                                    </td>
                                    <td style="text-align:right">${Math.round(item.total_ttc || item.prix_total_ligne || 0).toLocaleString()} F</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>

                    <!-- 📊 🎯 RENDU INJECTÉ DU RÉCAPITULATIF DES UNITÉS STRICTES COUPLÉES DANS L'IMPRESSION ELECTRON -->
                    ${recapUnites && recapUnites.length > 0 ? `
                        <div class="recap-section">
                            <div style="font-weight: bold; text-transform: uppercase; margin-bottom: 2px;">Résumé Global des Quantités :</div>
                            ${recapUnites.map(uRow => `<span class="recap-badge">${uRow.unite}</span>`).join('')}
                        </div>
                    ` : ''}

                    <div class="total-section">
                        <div class="grand-total">TOTAL NET: ${Math.round(donneesVente.total || donneesVente.totalGeneral || (donneesVente.lignes || []).reduce((s, i) => s + Number(i.montant_ttc_ligne || i.total_ttc || 0), 0)).toLocaleString()} F</div>
                    </div>
                    <div class="footer"><p>Merci de votre confiance !</p></div>
                </body>
            </html>
        `;

        if (window.electronAPI && typeof window.electronAPI.printDocument === 'function') {
            window.electronAPI.printDocument(htmlContent, {
                silent: true,
                printBackground: true,
                landscape: false,
                pageSize: format 
            });
        } else {
            handlePrint(); 
        }
    };


    // --- SYNCHRONISATION TEMPS RÉEL (SOCKETS & EVENEMENTS) ---
    useEffect(() => {
        const rafraichirClients = async () => {
            try {
                const res = await API.get('/customers');
                setCustomers(res.data || []);
            } catch (err) { 
                console.error(err);
                showToast("Erreur lors du rechargement des clients", "error");
            }
        };

        const rafraichirArticles = async () => {
            try {
                const res = await API.get('/products');
                setArticles(res.data || []);
            } catch (err) { 
                console.error(err);
                showToast("Erreur lors du rechargement des articles", "error");
            }
        };

        const handleUpdate = (event) => {
            const { table } = event.detail;
            if (table === 'customers' || table === 'all') rafraichirClients();
            if (table === 'products' || table === 'sales' || table === 'all') rafraichirArticles();
        };

        // Écouteurs WebSockets natifs pour réagir instantanément après chaque encaissement
        if (socket) {
            socket.on('STOCK_UPDATED', rafraichirArticles);
            socket.on('REFRESH_STOCK', rafraichirArticles);
            socket.on('DATA_EVENT', (data) => {
                if (data.table === 'products' || data.table === 'sales') rafraichirArticles();
            });
        }

        window.addEventListener('ERP_DATA_CHANGED', handleUpdate);
        return () => {
            window.removeEventListener('ERP_DATA_CHANGED', handleUpdate);
            if (socket) {
                socket.off('STOCK_UPDATED', rafraichirArticles);
                socket.off('REFRESH_STOCK', rafraichirArticles);
                socket.off('DATA_EVENT');
            }
        };
    }, []);

useEffect(() => {
        const loadInitialData = async () => {
            try {
                const [art, cust, cart, comp, pm] = await Promise.all([
                    API.get('/products'),
                    API.get('/customers'),
                    API.get(`/sales/temporary-facture/${vendeurId}`),
                    API.get('/company/settings').catch(() => ({ data: null })),
                    API.get('/plan-comptable/paiements/methodes')
                ]);
                
                const articlesData = art.data || [];
                const customersData = cust.data || [];
                const paymentMethodsData = (pm.data?.data || pm.data || []).filter(m => String(m.is_pos) === '1' && m.code !== 'CREDIT' && m.code !== 'ACOMPTE');
                
                setArticles(articlesData);
                setCustomers(customersData);
                setPaymentMethods(paymentMethodsData);
                if (cart.data?.lignes) setPanier(cart.data.lignes);
                
                if (comp.data) {
                    setCompany(comp.data);
                    const defaultCust = customersData.find(c => c.id === comp.data.default_customer_id);
                    setVenteInfo(prev => ({
                        ...prev,
                        client_id: comp.data.default_customer_id || '',
                        client_nom: defaultCust ? defaultCust.nom : 'CLIENT AU COMPTANT',
                        staff_id: comp.data.default_staff_id || vendeurId
                    }));
                }
            } catch (err) { 
                console.error(err);
                showToast("Échec du chargement des données initiales POS", "error");
            }
        };
        loadInitialData();
        barcodeInputRef.current?.focus();
    }, [vendeurId]);

// Synchronisation panier silencieuse
    useEffect(() => {
        const syncCart = async () => {
            if (!panier || panier.length === 0) return; // 🛡️ SÉCURITÉ : Ne pas vider le panier distant au démarrage
            setIsSyncing(true);
            try {
                await API.post('/sales/temporary-facture', { 
                    vendeur_id: vendeurId, 
                    lignes: panier 
                });
            } catch (err) { 
                console.error(err); 
            }
            setTimeout(() => setIsSyncing(false), 500);
        };

        const timer = setTimeout(syncCart, 1000);
        return () => clearTimeout(timer);
    }, [panier, vendeurId]);

    const totalGeneral = useMemo(() => panier.reduce((acc, cur) => acc + (cur.total_ttc || cur.montant_ttc_ligne || 0), 0), [panier]);

    // SÉCURITÉ ANTI-FERMETURE SI VENTE EN COURS
    useEffect(() => {
        const handleBeforeUnload = (e) => {
            if (panier.length > 0) {
                const message = "Une opération est en cours. Si vous quittez, les modifications seront perdues.";
                e.returnValue = message;
                return message;
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [panier]);

    // --- GESTION DE LA VALIDATION SÉCURISÉE ---
      const handleValiderVente = async (shouldPrint = false, format = 'A4') => {
        if (panier.length === 0) {
            showToast("Le panier est vide !", "error");
            return;
        }

        let montantFinalRecu = 0;
        let modeFinal = venteInfo.mode_paiement;

        if (venteInfo.type_vente === 'CREDIT') {
            montantFinalRecu = 0;
            modeFinal = 'CREDIT'; 
        } 
        else if (venteInfo.type_vente === 'ACOMPTE') {
            const acompteSaisi = parseFloat(venteInfo.montant_verse || 0);
            if (acompteSaisi <= 0) { showToast("L'acompte doit être > 0.", "error"); return; }
            if (acompteSaisi >= totalGeneral) { showToast("L'acompte doit être < au total.", "error"); return; }
            if (!modeFinal) { showToast("Sélectionnez le mode de paiement de l'acompte.", "error"); return; }
            montantFinalRecu = acompteSaisi;
        } 
        else {
            montantFinalRecu = totalGeneral;
            if (!modeFinal) { 
                showToast("Veuillez sélectionner un moyen de paiement.", "error"); 
                return; 
            }
        }

try {
            const res = await API.post('/sales', {
                lignes: panier.map(item => ({ ...item })),
                encaissement: { 
                    total: montantFinalRecu, 
                    customer_id: venteInfo.client_id || null, 
                    nom_client: venteInfo.client_nom || 'CLIENT AU COMPTANT', 
                    moyen_paiement: modeFinal 
                },
                staff_id: venteInfo.staff_id || vendeurId, 
                staff_name: user.username,
                caissier_id: vendeurId
            });
            if (res.data.success) {
                const facture_generee = res.data.sale_id || res.data.lot_id || 'FAC-' + Date.now();
                showToast(`Vente ${facture_generee} validée !`, "success");

                if (shouldPrint) {
                    if (['A4', 'A5', 'A6'].includes(format)) {
                        setPrintFormat(format);

                        // 🚀 INTERCEPTION ET BLINDAGE LOGISTIQUE PAR RECHERCHE MULTI-CLEFS
                        const panierAjustePourImpression = panier.map(item => {
                            // Extraction de l'identifiant sous toutes ses formes possibles dans le panier
                            const targetId = item.id_article || item.article_id || item.product_id || item.id;
                            
                            // Recherche ultra-robuste dans votre catalogue d'articles (Vérifie "id" et "id_article")
                            const articleRef = (articles || []).find(a => 
                                (a.id_article && String(a.id_article) === String(targetId)) || 
                                (a.id && String(a.id) === String(targetId))
                            );

                            // Extraction forcée des vraies configurations de l'unité
                            const trueCoeff = Number(articleRef?.coefficient || articleRef?.unit_coefficient || articleRef?.coeff || item.ratio_conversion || 1);
                            const trueCodeGros = String(articleRef?.unit_code_gros || articleRef?.unite_code || articleRef?.code || articleRef?.code_gros || item.unite_gros || 'CARTON').toUpperCase().trim();
                            const trueRefDetail = String(articleRef?.unit_ref_detail || articleRef?.unite_reference || articleRef?.unite_detail || item.unite_detail || 'G').replace(/\(s\)/g, '').toUpperCase().trim();

                            // 🎯 HARMONISATION DE L'EXPRESSION TEXTUELLE POUR L'IMPRESSION FACTURE
                            const qteTotalBrute = Math.abs(Number(item.quantite || 0));
                            let grosCalcul = Number(item.saisie_gros) || 0;
                            let detailCalcul = Number(item.saisie_detail) || 0;

                            if (grosCalcul === 0 && detailCalcul === 0 && trueCoeff > 1) {
                                grosCalcul = Math.floor(qteTotalBrute / trueCoeff);
                                detailCalcul = Math.round(qteTotalBrute % trueCoeff);
                            }

                            let expressionFormattee = item.texte_affichage || "";
                            if (!expressionFormattee) {
                                if (grosCalcul > 0 && detailCalcul > 0) {
                                    expressionFormattee = `${grosCalcul} ${trueCodeGros} + ${detailCalcul} ${trueRefDetail}`;
                                } else if (grosCalcul > 0) {
                                    expressionFormattee = `${grosCalcul} ${trueCodeGros}`;
                                } else {
                                    expressionFormattee = `${detailCalcul > 0 ? detailCalcul : qteTotalBrute} ${trueRefDetail}`;
                                }
                            }

                            return {
                                ...item,
                                // Injection des propriétés requises pour InvoicePrint (Gros + Détail)
                                coefficient: trueCoeff,
                                unit_code_gros: trueCodeGros,
                                unit_ref_detail: trueRefDetail,
                                // Doublage sous forme d'alias pour une sécurité maximale
                                coeff: trueCoeff,
                                unite_code: trueCodeGros,
                                unite_reference: trueRefDetail,
                                // Ancrage strict exigé par le calculateur d'unités séparées
                                unite_gros: trueCodeGros,
                                unite_detail: trueRefDetail,
                                ratio_conversion: trueCoeff,
                                qte_vendue_formatee: expressionFormattee,
                                texte_affichage: expressionFormattee
                            };
                        });

                        const factureData = {
                            panier: panierAjustePourImpression, 
                            totalGeneral,
                            venteInfo: {
                                ...venteInfo,
                                facture_no: facture_generee
                            },
                            format,
                            // 🎯 INJECTION DU RÉCAPITULATIF DES UNITÉS ISOLÉES PAR COUPLES STRICTS SANS MÉLANGE
                            recapUnites: recapUnites
                        };

                        setPrintData(factureData);

                        setTimeout(() => {
                            handlePrint();
                            finaliserVente();
                        }, 300);

                    } else {
                        // Application du même blindage pour les tickets thermiques Electron
                        const panierElectronAjuste = panier.map(item => {
                            const targetId = item.id_article || item.article_id || item.product_id || item.id;
                            const articleRef = (articles || []).find(a => 
                                (a.id_article && String(a.id_article) === String(targetId)) || 
                                (a.id && String(a.id) === String(targetId))
                            );

                       return {
                                ...item,
                                coefficient: Number(articleRef?.coefficient || item.ratio_conversion || 1),
                                unit_code_gros: String(articleRef?.unite_code || item.unite_gros || 'CS'),
                                unit_ref_detail: String(articleRef?.unite_reference || item.unite_detail || 'UNITÉ'),
                                unite_gros: String(articleRef?.unite_code || item.unite_gros || 'CS'),
                                unite_detail: String(articleRef?.unite_reference || item.unite_detail || 'UNITÉ'),
                                ratio_conversion: Number(articleRef?.coefficient || item.ratio_conversion || 1)
                            };
                        });

                        executerImpressionElectron({
                            facture_no: facture_generee,
                            client_nom: venteInfo.client_nom,
                            lignes: panierElectronAjuste,
                            total: totalGeneral
                        }, format);

                        finaliserVente();
                    }
                } else {
                    finaliserVente();
                }
            }

        } catch (err) { 
            showToast(err.response?.data?.error || "Erreur de validation", "error"); 
        }
    };
// REMISE À ZÉRO COMPLÈTE APRÈS ENREGISTREMENT EN BASE (SQLite)
const finaliserVente = async () => {
    setPanier([]);
    setSelectedProduct(null);
    setQteGrosSaisie(''); // Réinitialisation des inputs découplés
    setQteDetailSaisie('');
    setVenteInfo(prev => ({ 
        ...prev, 
        type_vente: 'COMPTANT', 
        mode_paiement: '', 
        montant_verse: 0, 
        facture_no: '' 
    }));
    await API.post('/sales/temporary-facture', { vendeur_id: vendeurId, lignes: [] });
};

const ajouterAuPanier = (art, qte) => {
    if (!art) return;
    setPanier(current => {
        const existIndex = current.findIndex(item => item.product_id === art.id);
        const coeffLogistique = Math.abs(Number(art.coefficient || art.unit_coefficient || 1)) || 1;

        // 1. 🚀 LECTURE DE LA DOUBLE SAISIE COMPTOIR (Gros + Détail)
        const grosNettoye = String(qteGrosSaisie || '').replace(/-/g, '').replace(',', '.').trim();
        const detailNettoye = String(qteDetailSaisie || '').replace(/-/g, '').replace(',', '.').trim();
        const inputGros = Math.abs(parseFloat(grosNettoye) || 0);
        const inputDetail = Math.abs(parseFloat(detailNettoye) || 0);

        let piecesSaisiesActuelles = 0;
        
        // Si les deux champs sont vides, on applique la quantité brute par défaut (compatibilité scanner)
        if (inputGros === 0 && inputDetail === 0) {
            const chaineFallback = String(qte || '1').replace(/-/g, '').replace(',', '.').trim();
            const fallbackNum = Math.abs(parseFloat(chaineFallback) || 0);
            if (fallbackNum <= 0) {
                showToast("❌ Veuillez saisir une quantité valide.", "error");
                return current;
            }
            piecesSaisiesActuelles = Math.round(fallbackNum * coeffLogistique);
        } else {
            piecesSaisiesActuelles = Math.round(inputGros * coeffLogistique) + Math.round(inputDetail);
        }

        // Récupération des pièces déjà présentes dans le panier pour cet article
        let piecesDejaAuPanier = 0;
        if (existIndex > -1) {
            const itemEx = current[existIndex];
            // Si l'élément stocke déjà de la quantité décimale brute gros
            piecesDejaAuPanier = Math.round(Number(itemEx.quantite || 0) * coeffLogistique);
        }

        const piecesTotalesAccumulees = piecesDejaAuPanier + piecesSaisiesActuelles;

        // 2. 🛡️ DÉCODEUR DE STOCK BD UNIFIÉ (Pièces physiques absolues)
        const stockBrutBDD = art.stock_actuel !== undefined ? art.stock_actuel : (art.stock || 0);
        let stockTotalDisponiblePieces = 0;

        if (typeof stockBrutBDD === 'string' && stockBrutBDD.includes('+')) {
            const parties = stockBrutBDD.split('+');
            const grosEntiers = parseFloat(parties[0]) || 0;
            const detailRestants = parseFloat(parties[1]) || 0;
            stockTotalDisponiblePieces = (grosEntiers * coeffLogistique) + detailRestants;
        } else {
            const stockNumeriqueBrut = typeof stockBrutBDD === 'string' ? parseFloat(stockBrutBDD.replace(/-/g, '')) : Number(stockBrutBDD);
            stockTotalDisponiblePieces = Math.abs(stockNumeriqueBrut) || 0;
        }

        // 3. 🔒 COMPARISON DE PRÉCISION ET VERROU STRICT
        if (piecesTotalesAccumulees > stockTotalDisponiblePieces) {
            const dispoAffichageGros = Number((stockTotalDisponiblePieces / coeffLogistique).toFixed(2));
            showToast(`❌ Stock insuffisant ! Disponible : ${String(dispoAffichageGros).replace('.', ',')}`, 'error');
            return current;
        }

        // Extraction des vrais noms d'unités configurés dans l'ERP
        const trueCodeGros = String(art.unit_code_gros || art.unite_code || art.code || 'CARTON').toUpperCase().trim();
        const trueRefDetail = String(art.unit_ref_detail || art.unite_reference || art.unite_detail || 'G').replace(/\(s\)/g, '').toUpperCase().trim();

        // 4. 🚀 CALCUL DYNAMIQUE DE L'EXPRESSION DE QUANTITÉ HYBRIDE FIXE
        let expressionLogistiquePanier = "";
        const finalGrosAffichage = Math.floor(piecesTotalesAccumulees / coeffLogistique);
        const finalDetailAffichage = Math.round(piecesTotalesAccumulees % coeffLogistique);

        if (finalGrosAffichage > 0 && finalDetailAffichage > 0) {
            expressionLogistiquePanier = `${finalGrosAffichage} ${trueCodeGros} + ${finalDetailAffichage} ${trueRefDetail}`;
        } else if (finalGrosAffichage > 0) {
            expressionLogistiquePanier = `${finalGrosAffichage} ${trueCodeGros}`;
        } else {
            expressionLogistiquePanier = `${finalDetailAffichage} ${trueRefDetail}`;
        }

        // Conversion décimale gros exigée par le PricingService pour le calcul de ligne
        const nvelleQteGrosTotale = piecesTotalesAccumulees / coeffLogistique;
        const calculs = PricingService.calculerLigne(art, nvelleQteGrosTotale);
        
        const stockAvantGros = Number((stockTotalDisponiblePieces / coeffLogistique).toFixed(2));
        const stockApresGros = Number((Math.max(0, stockTotalDisponiblePieces - piecesTotalesAccumulees) / coeffLogistique).toFixed(2));

        // On ramène le prix unitaire HT de la ligne au prix d'une seule pièce physique
        const prixHTUnitaireDetail = coeffLogistique > 0 ? (calculs.prixHTUnitaire / coeffLogistique) : calculs.prixHTUnitaire;

        const data = {
            quantite: nvelleQteGrosTotale, // Quantité décimale stockée en gros
            prix_ht_unitaire: Math.round(prixHTUnitaireDetail * 100) / 100,
            remise_montant: calculs.remiseTotale,
            taxe_montant: calculs.montantTaxe,
            montant_ht: calculs.montantHT, 
            montant_ttc_ligne: calculs.netAPayer,
            total_ttc: calculs.netAPayer,
            stock_avant_vente: stockAvantGros,
            stock_apres_vente: stockApresGros,
            qte_vendue_formatee: expressionLogistiquePanier,
            texte_affichage: expressionLogistiquePanier, // 💡 Forcé pour le mappage du tableau de vente normalisée
            
            // 🎯 SÉCURISATION DU CALCUL DU RÉCAPITULATIF DES UNITÉS COUPLÉES SANS MÉLANGE
            unite_gros: trueCodeGros,
            unite_detail: trueRefDetail,
            ratio_conversion: coeffLogistique,
            saisie_gros: finalGrosAffichage,
            saisie_detail: finalDetailAffichage,

            coefficient: coeffLogistique,
            coeff: coeffLogistique,
            unit_code_gros: trueCodeGros,
            unite_code: trueCodeGros,
            unit_ref_detail: trueRefDetail,
            unite_reference: trueRefDetail
        };

let nouveau = [...current];
        const prixVenteBaseGros = Number(art.prixVente || art.prix_vente || 0);
        const prixVenteBaseDetail = coeffLogistique > 0 ? (prixVenteBaseGros / coeffLogistique) : prixVenteBaseGros;

        if (existIndex > -1) {
            nouveau[existIndex] = { ...nouveau[existIndex], ...data };
        } else {
            nouveau.push({ 
                product_id: art.id, 
                nom_article_snap: art.nom || art.designation, 
                prix_vente_unitaire: Math.round(prixVenteBaseDetail * 100) / 100, 
                stock_max: stockAvantGros, 
                article_complet: art, 
                ...data 
            });
        }
        
        showToast(`${art.nom || art.designation} ajouté au panier`);
        return nouveau;
    });
    barcodeInputRef.current?.focus();
};

const updateQteDirect = (idx, delta) => {
    setPanier(current => current.map((item, i) => {
        if (i === idx) {
            // Le pas (delta) s'applique par rapport à l'unité de mesure principale (Gros) configurée
            const nvelleQte = Math.max(0.01, Math.min(item.stock_max, item.quantite + delta));
            const coeffLogistique = Math.abs(Number(item.article_complet?.coefficient || item.article_complet?.unit_coefficient || 1)) || 1;
            
            // Calcul de la correspondance exacte en pièces natives
            const demandeTotalePieces = Math.round(nvelleQte * coeffLogistique);
            const calculs = PricingService.calculerLigne(item.article_complet, nvelleQte);

            const trueCodeGros = String(item.unit_code_gros || item.article_complet?.unit_code_gros || 'CARTON').toUpperCase().trim();
            const trueRefDetail = String(item.unit_ref_detail || item.article_complet?.unit_ref_detail || 'G').toUpperCase().trim();

            // 🚀 ACTUALISATION CRITIQUE DU TEXTE LOGISTIQUE HYBRIDE GROS + DÉTAIL
            let expressionLogistiquePanier = "";
            const finalGrosAffichage = Math.floor(demandeTotalePieces / coeffLogistique);
            const finalDetailAffichage = Math.round(demandeTotalePieces % coeffLogistique);

            if (finalGrosAffichage > 0 && finalDetailAffichage > 0) {
                expressionLogistiquePanier = `${finalGrosAffichage} ${trueCodeGros} + ${finalDetailAffichage} ${trueRefDetail}`;
            } else if (finalGrosAffichage > 0) {
                expressionLogistiquePanier = `${finalGrosAffichage} ${trueCodeGros}`;
            } else {
                expressionLogistiquePanier = `${finalDetailAffichage} ${trueRefDetail}`;
            }

            const nativeGrosInput = finalGrosAffichage > 0 ? finalGrosAffichage : '';
            const nativeDetailInput = finalDetailAffichage > 0 ? finalDetailAffichage : '';

            return { 
                ...item, 
                quantite: nvelleQte, 
                prix_ht_unitaire: calculs.prixHTUnitaire,
                remise_montant: calculs.remiseTotale,
                taxe_montant: calculs.montantTaxe,
                montant_ht: calculs.montantHT,
                total_ttc: calculs.netAPayer, 
                montant_ttc_ligne: calculs.netAPayer, 
                stock_apres_vente: Number((item.stock_max - nvelleQte).toFixed(2)),
                
                // 🎯 MAINTIEN SYNCHRONE DU COUPLAGE STRICT LORS DE L'INC-DEC À L'ÉCRAN
                unite_gros: trueCodeGros,
                unite_detail: trueRefDetail,
                ratio_conversion: coeffLogistique,
                saisie_gros: nativeGrosInput,
                saisie_detail: nativeDetailInput,
                
                qte_vendue_formatee: expressionLogistiquePanier,
                texte_affichage: expressionLogistiquePanier // 💡 Forcé pour la mise à jour visuelle immédiate du tableau
            };
        }
        return item;
    }));
};

const handleBarcodeSubmit = (e) => {
    e.preventDefault();
    // 🛡️ RECHERCHE ADAPTATIVE : Détecte le code-barre peu importe sa casse en BDD (code_barre ou codeBarre)
    const art = articles.find(a => String(a.code_barre || a.codeBarre || '').trim() === barcodeSearch.trim() || String(a.reference || '').trim() === barcodeSearch.trim());
    if (art) { 
        ajouterAuPanier(art, 1); 
        setBarcodeSearch(''); 
    } else { 
        showToast("Code-barre inconnu", "error"); 
        setBarcodeSearch(''); 
    }
};
const handleCustomerChange = (e) => {
    const id = e.target.value;
    const selected = customers.find(c => c.id === id);
    setVenteInfo(prev => ({ ...prev, client_id: id, client_nom: selected?.nom || 'CLIENT AU COMPTANT' }));
};

// --- STYLES ---
const thMain = { padding: '12px', background: '#1E3A8A', color: '#FFF', fontSize: '11px', textAlign: 'left', fontWeight: '900', textTransform: 'uppercase' };
const tdMain = { padding: '12px', borderBottom: '1px solid #CBD5E1', fontSize: '14px', color: '#000', fontWeight: '600' };
return (
    <div style={{ display: 'flex', height: '100vh', background: '#F1F5F9', position: 'relative' }}>
        <Sidebar />
        
        {/* --- SYSTÈME DE TOASTS FLOTTANTS --- */}
        <div style={{ 
            position: 'fixed', top: '20px', right: '20px', zIndex: 9999, 
            display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '350px' 
        }}>
            {toasts.map((toast) => (
                <div key={toast.id} style={{
                    display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', borderRadius: '12px',
                    background: toast.type === 'error' ? '#FEF2F2' : toast.type === 'info' ? '#EFF6FF' : '#F0FDF4',
                    border: `2px solid ${toast.type === 'error' ? '#EF4444' : toast.type === 'info' ? '#3B82F6' : '#10B981'}`,
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                    animation: 'slideIn 0.3s ease-out forwards'
                }}>
                    {toast.type === 'error' ? <XCircle color="#EF4444" size={24} /> : 
                     toast.type === 'info' ? <Info color="#3B82F6" size={24} /> : 
                     <CheckCircle color="#10B981" size={24} />}
                    
                    <div style={{ flex: 1 }}>
                        <p style={{ margin: 0, fontSize: '14px', fontWeight: '800', color: '#1E293B' }}>{toast.text}</p>
                    </div>
                    
                    <X size={18} color="#64748B" cursor="pointer" onClick={() => removeToast(toast.id)} />
                </div>
            ))}
        </div>

        <style>{`
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(-5px); }
                to { opacity: 1; transform: translateY(0); }
            }
        `}</style>

        {/* Zone technique isolée pour l'impression réactive via hooks */}
        <div
            style={{
                position: 'fixed',
                top: '-10000px',
                left: '-10000px',
            }}
        >
            <InvoicePrint
                ref={componentRef}
                /* 🚀 INTERCEPTION LOGISTIQUE : Auto-complétion dynamique des coefficients avant l'envoi à l'imprimante */
                panier={(printData?.panier || []).map(item => {
                    const produitOrigine = (articles || []).find(a => a.id === item.product_id);
                    
                    // Utilisation directe du service pour harmoniser l'état d'impression
                    const meta = ConversionStockService.getMetadata(produitOrigine || item);

                    return {
                        ...item,
                        coefficient: meta.coeff,
                        unite_code: meta.codeGros,
                        unite_reference: meta.refDetail,
                        // Ancrages requis pour le moteur d'unités séparées en cas de re-calcul
                        unite_gros: meta.codeGros,
                        unite_detail: meta.refDetail,
                        ratio_conversion: meta.coeff,
                        qte_vendue_formatee: item.texte_affichage || item.qte_vendue_formatee || item.unite_libelle_snap || item.quantite
                    };
                })}
                totalGeneral={printData?.totalGeneral || totalGeneral || 0}
                venteInfo={printData?.venteInfo || venteInfo}
                company={company}
                format={printFormat}
                // 🎯 TRANSMISSION SYNCHRONE DE LA STRUCTURE DE RÉCAPITULATIF REÇUE DEPUIS LA CAISSE COMPTOIR
                recapUnites={printData?.recapUnites || recapUnites}
            />
        </div>

<main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <header style={{ background: '#fff', padding: '15px 25px', borderBottom: '2px solid #1E3A8A', display: 'flex', gap: '15px', alignItems: 'center' }}>
                <div style={{ flex: 1, position: 'relative' }}>
                    <Search style={{ position: 'absolute', left: '12px', top: '10px', color: '#1E293B' }} size={18} />
                    <input style={{ width: '100%', padding: '10px 40px', borderRadius: '8px', border: '2px solid #64748B', fontWeight: '700' }} placeholder="Rechercher un produit..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                </div>
                <form onSubmit={handleBarcodeSubmit} style={{ flex: 1, position: 'relative' }}>
                    <Barcode style={{ position: 'absolute', left: '12px', top: '10px', color: '#059669' }} size={18} />
                    <input ref={barcodeInputRef} style={{ width: '100%', padding: '10px 40px', borderRadius: '8px', border: '2px solid #059669', background: '#ECFDF5', fontWeight: '800' }} placeholder="SCANNER CODE BARRE..." value={barcodeSearch} onChange={(e) => setSearchBarCode(e.target.value)} />
                </form>
                <div style={{ background: '#000', color: '#10B981', padding: '10px 25px', borderRadius: '8px', fontSize: '22px', fontWeight: '900', minWidth: '150px', textAlign: 'right' }}>
                    {parseFloat(Number(totalGeneral || 0).toFixed(2)).toLocaleString()} F
                </div>
            </header>

<div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '15px', gap: '15px', overflow: 'hidden' }}>
                        
                        {/* SECTION SELECTION PRODUITS : RÉDUITE HORIZONTALEMENT */}
                        <section style={{ 
                            flex: 1, 
                            background: '#fff', 
                            borderRadius: '10px', 
                            border: '2px solid #1E3A8A', 
                            overflowY: 'auto',
                            display: 'flex',
                            flexDirection: 'column'
                        }}>
                            {/* 🚀 TABLE LAYOUT FIXED + CONTROLE DES LARGEURS HORIZONTALES SUR UNE SEULE LIGNE STRICTE */}
                           <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                                <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                                    <tr>
                                        <th style={{ ...thMain, width: '45%' }}>DESIGNATION</th>
                                        <th style={{ ...thMain, textAlign: 'center', width: '22%' }}>PRIX VENTE</th>
                                        <th style={{ ...thMain, textAlign: 'center', width: '25%' }}>STOCK</th>
                                        <th style={{ ...thMain, width: '8%' }}></th>
                                    </tr>
                                </thead>



                           <tbody>
                                    {articles.filter(a => (a.nom || '').toLowerCase().includes((searchTerm || '').toLowerCase())).slice(0, 15).map(art => {
                                        // Détermination de l'état d'alerte sur le stock natif en pièces
                                        const stockBrut = Number(art.stock_actuel || 0);
                                        const seuilAlerte = Number(art.stockAlerte || 5);
                                        const sousSeuil = stockBrut <= seuilAlerte;

                                        return (
                                            <tr 
                                                key={art.id} 
                                                onClick={() => { 
                                                    setSelectedProduct(art); 
                                                    setSaisieQte(1); 
                                                    // 🚀 ALIGNEMENT SÉCURITÉ : Nettoyage immédiat des champs scindés lors du changement de produit
                                                    setQteGrosSaisie('');
                                                    setQteDetailSaisie('');
                                                }} 
                                                style={{ 
                                                    cursor: 'pointer', 
                                                    background: selectedProduct?.id === art.id ? '#DBEAFE' : 'transparent',
                                                    borderBottom: '1px solid #E2E8F0'
                                                }}
                                            >
                                                <td style={{ ...tdMain, width: '45%' }}>
                                                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        <strong>{art.nom}</strong>
                                                    </div>
                                                </td>
                                                <td style={{ ...tdMain, textAlign: 'center', width: '22%' }}>
                                                    {Number(art.prixVente || 0).toLocaleString()} F
                                                </td>

                                                
                                             <td style={{ ...tdMain, textAlign: 'center', width: '25%' }}>
                                                    <span style={{ 
                                                        fontWeight: 'bold', 
                                                        color: sousSeuil ? '#EF4444' : '#1E293B',
                                                        background: sousSeuil ? '#FEF2F2' : '#F8FAFC',
                                                        padding: '4px 10px',
                                                        borderRadius: '6px',
                                                        border: sousSeuil ? '1px solid #FCA5A5' : '1px solid #CBD5E1',
                                                        fontSize: '13px',
                                                        display: 'inline-block',
                                                        whiteSpace: 'nowrap'
                                                    }}>
                                                        {/* 🚀 FORMATEUR CENTRAL LOGISTIQUE EMBARQUÉ */}
                                                        {formaterStockPOS(art)}
                                                    </span>
                                                </td>
                                                <td style={{ ...tdMain, width: '8%', textAlign: 'center' }}>
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', marginTop: '3px' }}>➡️</span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </section>


{/* SECTION PANIER RECAPITULATIF : RÉDUITE HORIZONTALEMENT */}
                      <section style={{ flex: 1.2, background: '#fff', borderRadius: '10px', border: '2px solid #1E3A8A', overflowY: 'auto' }}>
    {/* 🚀 FIXED LAYOUT POUR VERROUILLAGE DU SERRAGE HORIZONTAL SUR UNE SEULE LIGNE REACT */}
    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr>
                <th style={{ ...thMain, width: '32%' }}>PANIER</th>
                <th style={{ ...thMain, textAlign: 'center', width: '24%' }}>QTE</th>
                <th style={{ ...thMain, width: '11%' }}>P.U HT</th>
                <th style={{ ...thMain, width: '11%' }}>REMISE</th>
                <th style={{ ...thMain, width: '9%' }}>TAXE</th>
                <th style={{ ...thMain, width: '10%' }}>TOTAL TTC</th>
                <th style={{ ...thMain, width: '3%' }}></th>
            </tr>
        </thead>

        <tbody>
            {panier.map((item, idx) => (
                <tr key={idx}>
                    <td style={{ ...tdMain, width: '32%', fontWeight: '800' }}>
                        {/* Évite que les longs noms forcent l'étalement horizontal */}
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {(item.nom_article_snap || "Article sans nom").toUpperCase()}
                        </div>
                    </td>
                    <td style={{ ...tdMain, width: '24%', textAlign: 'center' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Minus size={14} onClick={() => updateQteDirect(idx, -1)} cursor="pointer" />
                                
                                {/* 🚀 RENDU LOGISTIQUE MUTÉ : Respect absolu du découpage Gros + Détail */}
                                <span style={{ fontWeight: '900', fontSize: '13px', color: '#1E3A8A', whiteSpace: 'nowrap' }}>
                                    {item.texte_affichage || item.qte_vendue_formatee || (() => {
                                        const qteSaisieGros = Number(item.quantite || 0);
                                        const artInfo = item.article_complet || {};
                                        
                                        const coeffLogistique = Number(artInfo.coefficient || artInfo.unit_coefficient || item.ratio_conversion || 1);
                                        const codeGros = String(item.unite_gros || artInfo.unit_code_gros || artInfo.code || 'CARTON').toUpperCase().trim();
                                        const refDetail = String(item.unite_detail || artInfo.unit_ref_detail || artInfo.unite_reference || 'G').replace(/\(s\)/g, '').toUpperCase().trim();

                                        // Si la ligne provient d'une structure en pièces directes
                                        const totalPieces = item.isFromDatabase ? Math.round(qteSaisieGros) : Math.round(qteSaisieGros * coeffLogistique);

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

                                
                               <span onClick={() => updateQteDirect(idx, 1)} style={{ cursor: "pointer", display: "flex", alignItems: "center" }}>
                                    <Plus size={14} />
                                </span>
                            </div>
                            {/* Rappel en petit de la valeur décimale brute pour information */}
                            <span style={{ fontSize: '9px', color: '#94A3B8', fontWeight: 'bold' }}>
                                Saisie: {item.saisie_gros || item.saisie_detail ? `${item.saisie_gros || 0} + ${item.saisie_detail || 0}` : String(item.quantite).replace('.', ',')}
                            </span>
                        </div>
                    </td>
                    
                    <td style={{ ...tdMain, width: '11%' }}>
                        {Number(item.prix_ht_unitaire || item.prix_vente_unitaire || 0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ ...tdMain, width: '11%', color: '#EF4444' }}>
                        -{Number(item.remise_montant || 0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ ...tdMain, width: '9%' }}>
                        {Number(item.taxe_montant || 0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ ...tdMain, width: '10%', fontWeight: '900', color: '#1E3A8A' }}>
                        {Number(item.total_ttc || item.montant_ttc_ligne || 0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} F
                    </td>
                    
                    <td style={{ ...tdMain, width: '3%', textAlign: 'center' }}>
                        <Trash2 size={18} color="#EF4444" cursor="pointer" onClick={() => setPanier(panier.filter((_, i) => i !== idx))} />
                    </td>
                </tr>
            ))}
        </tbody>
    </table>
</section>
</div>


             {/* ASIDE : GESTION DE LA VENTE FIXÉE SANS SCROLL */}
                    <aside style={{ 
                        width: '380px', 
                        height: '100%', 
                        background: '#fff', 
                        borderLeft: '3px solid #1E3A8A', 
                        padding: '12px', 
                        display: 'flex', 
                        flexDirection: 'column', 
                        gap: '10px', 
                        overflow: 'hidden', 
                        boxSizing: 'border-box'
                    }}>
                        
                        {/* 🚀 MUTATION LOGISTIQUE : BLOC DOUBLE SAISIE AVEC UNITÉS DYNAMIQUES DE L'ERP */}
                        <div style={{ padding: '10px', background: '#F1F5F9', borderRadius: '10px', border: '2px solid #CBD5E1' }}>
                            <label style={{ fontSize: '11px', fontWeight: '900', color: '#1E3A8A', textTransform: 'uppercase' }}>
                                Paramètres des Quantités à vendre
                            </label>
                          {selectedProduct ? (
                               <div style={{ marginTop: '5px' }}>
                                    <div style={{ fontSize: '13px', fontWeight: '800', marginBottom: '8px', color: '#1E3A8A' }}>
                                        {selectedProduct.nom.toUpperCase()}
                                    </div>
                                    
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        
                                        {/* 🚀 CACHAGE DYNAMIQUE DU CHAMP EN GROS SI COEFF === 1 */}
                                        {ConversionStockService.getMetadata(selectedProduct).coeff > 1 && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, animation: 'fadeIn 0.2s ease' }}>
                                                <span style={{ fontSize: '10px', fontWeight: '800', color: '#64748B' }}>EN GROS :</span>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                    <input 
                                                        autoFocus 
                                                        type="text" 
                                                        value={qteGrosSaisie} 
                                                        onChange={(e) => {
                                                            // 🛡️ VERROU ANTI-LETTRES : Conserve uniquement les chiffres de 0 à 9
                                                            const valeurNettoyee = e.target.value.replace(/[^\d]/g, '');
                                                            setQteGrosSaisie(valeurNettoyee);
                                                        }} 
                                                        onKeyDown={(e) => e.key === 'Enter' && (ajouterAuPanier(selectedProduct, 1), setSelectedProduct(null))} 
                                                        style={{ flex: 1, padding: '8px', fontSize: '18px', fontWeight: '900', textAlign: 'center', borderRadius: '8px', border: '2px solid #1E3A8A' }} 
                                                        placeholder="0"
                                                    />
                                                    <span style={{
                                                        fontSize: '11px', fontWeight: '800', color: '#1E3A8A', minWidth: '85px', textAlign: 'center',
                                                        background: '#DBEAFE', padding: '12px 6px', borderRadius: '8px', border: '1px solid #BFDBFE', whiteSpace: 'nowrap'
                                                    }}>
                                                        {ConversionStockService.getMetadata(selectedProduct).codeGros}
                                                    </span>
                                                </div>
                                            </div>
                                        )}


                                      {/* CHAMP DE SAISIE AU DÉTAIL */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 }}>
                                            <span style={{ fontSize: '10px', fontWeight: '800', color: '#64748B' }}>AU DÉTAIL :</span>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                <input 
                                                    // 🚀 AUTOFOCUS ADAPTATIF : Si le gros est masqué (coeff === 1), le curseur cible directement le détail
                                                    autoFocus={ConversionStockService.getMetadata(selectedProduct).coeff === 1}
                                                    type="text" 
                                                    value={qteDetailSaisie} 
                                                    onChange={(e) => {
                                                        // 🛡️ VERROU ANTI-LETTRES : Conserve uniquement les chiffres de 0 à 9
                                                        const valeurNettoyee = e.target.value.replace(/[^\d]/g, '');
                                                        setQteDetailSaisie(valeurNettoyee);
                                                    }} 
                                                    onKeyDown={(e) => e.key === 'Enter' && (ajouterAuPanier(selectedProduct, 1), setSelectedProduct(null))} 
                                                    style={{ flex: 1, padding: '8px', fontSize: '18px', fontWeight: '900', textAlign: 'center', borderRadius: '8px', border: '2px solid #059669' }} 
                                                    placeholder="0"
                                                />
                                                <span style={{
                                                    fontSize: '11px', fontWeight: '800', color: '#065F46', minWidth: '85px', textAlign: 'center',
                                                    background: '#D1FAE5', padding: '12px 6px', borderRadius: '8px', border: '1px solid #A7F3D0', whiteSpace: 'nowrap'
                                                }}>
                                                    {ConversionStockService.getMetadata(selectedProduct).refDetail}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                            ) : (
                                <div style={{ textAlign: 'center', color: '#64748B', fontSize: '12px', padding: '15px' }}>
                                    Sélectionnez un article pour configurer le Gros / Détail
                                </div>
                            )}
                        </div>



                     <button 
                            type="button"
                            onClick={() => { ajouterAuPanier(selectedProduct, 1); setSelectedProduct(null); }} 
                            disabled={!selectedProduct} 
                            style={{ width: '100%', padding: '12px', background: selectedProduct ? '#1E3A8A' : '#CBD5E1', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '900', cursor: selectedProduct ? 'pointer' : 'not-allowed', fontSize: '13px', textTransform: 'uppercase' }}
                        >
                            AJOUTER AU PANIER
                        </button>
{/* --- GESTION DU TYPE DE VENTE ET PAIEMENT COMPACTE --- */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '2px solid #E2E8F0', paddingTop: '10px' }}>
                            <div>
                                <label style={{ fontSize: '11px', fontWeight: '800', color: '#1E3A8A' }}>CLIENT</label>
                                <select 
                                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '2px solid #1E3A8A', fontWeight: '700', fontSize: '13px' }} 
                                    value={venteInfo.client_id} 
                                    onChange={handleCustomerChange}
                                >
                                    <option value="">-- CLIENT AU COMPTANT --</option>
                                    {customers.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                                </select>
                            </div>

                            <div>
                                <label style={{ fontSize: '11px', fontWeight: '800', color: '#1E3A8A' }}>TYPE DE VENTE</label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '5px', marginTop: '3px' }}>
                                    {['COMPTANT', 'ACOMPTE', 'CREDIT'].map((type) => (
                                        <button
                                            key={type}
                                            type="button"
                                            onClick={() => setVenteInfo({ ...venteInfo, type_vente: type, mode_paiement: type === 'CREDIT' ? 'CREDIT' : '', montant_verse: 0 })}
                                            style={{
                                                padding: '8px 2px', fontSize: '10px', fontWeight: '800', borderRadius: '5px', cursor: 'pointer',
                                                border: venteInfo.type_vente === type ? '2px solid #1E3A8A' : '1px solid #CBD5E1',
                                                background: venteInfo.type_vente === type ? '#1E3A8A' : '#fff',
                                                color: venteInfo.type_vente === type ? '#fff' : '#64748B'
                                            }}
                                        >
                                            {type}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {venteInfo.type_vente === 'ACOMPTE' && (
                                <div style={{ animation: 'fadeIn 0.3s ease', background: '#ECFDF5', padding: '8px', borderRadius: '8px', border: '1px solid #10B981' }}>
                                    <label style={{ fontSize: '11px', fontWeight: '800', color: '#065F46' }}>MONTANT VERSÉ (AVANCE) *</label>
                                    <input 
                                        type="number" 
                                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '2px solid #10B981', fontWeight: '900', fontSize: '16px' }} 
                                        value={venteInfo.montant_verse} 
                                        onChange={e => setVenteInfo({...venteInfo, montant_verse: e.target.value})} 
                                        placeholder="0.00"
                                    />
                                </div>

                            )}
{venteInfo.type_vente !== 'CREDIT' && (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
        <label style={{ 
            fontSize: '11px', 
            fontWeight: '800', 
            color: '#1E3A8A',
            display: 'block',
            marginBottom: '10px' 
        }}>
            {venteInfo.type_vente === 'ACOMPTE' ? "MOYEN DE RÈGLEMENT DE L'AVANCE *" : "MOYEN DE RÈGLEMENT *"}
        </label>

            <select 
            style={{ 
                width: '100%', 
                padding: '12px', 
                borderRadius: '8px', 
                fontWeight: '700',
                border: venteInfo.mode_paiement ? '2px solid #1E3A8A' : '2px solid #EF4444', 
                background: venteInfo.mode_paiement ? '#fff' : '#FEF2F2'
            }} 
            value={venteInfo.mode_paiement} 
            onChange={(e) => setVenteInfo({ ...venteInfo, mode_paiement: e.target.value })}
        >
            <option value="">-- CHOISIR LE RÈGLEMENT --</option>
            {paymentMethods.map(m => (
                <option key={m.id} value={m.code}>{m.libelle.toUpperCase()}</option>
            ))}
        </select>
    </div>
)}
</div>

                   {/* ACTIONS DE VALIDATION */}
                        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <button type="button" onClick={() => handleValiderVente(false)} disabled={panier.length === 0} style={{ width: '100%', padding: '12px', background: '#334155', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '800', cursor: 'pointer' }}>
                                VALIDER (SANS REÇU)
                            </button>
                            
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                <button type="button" onClick={() => handleValiderVente(true, 'TICKET')} disabled={panier.length === 0} style={{ padding: '12px', background: '#059669', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '700', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', cursor: 'pointer' }}>
                                    <Printer size={16} /> TICKET 80mm
                                </button>
                                <button type="button" onClick={() => handleValiderVente(true, 'A6')} disabled={panier.length === 0} style={{ padding: '12px', background: '#0891B2', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '700', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', cursor: 'pointer' }}>
                                    <Printer size={16} /> REÇU A6
                                </button>
                            </div>
                            
                            <button
                                type="button"
                                onClick={() => handleValiderVente(true, 'A5')}
                                disabled={panier.length === 0}
                                style={{
                                    padding: '12px',
                                    background: '#7C3AED',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '8px',
                                    fontWeight: '700',
                                    fontSize: '12px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '5px',
                                    cursor: 'pointer'
                                }}
                            >
                                <Printer size={16} /> REÇU A5
                            </button>

                            <button type="button" onClick={() => handleValiderVente(true, 'A4')} disabled={panier.length === 0} style={{ width: '100%', padding: '15px', background: '#1E3A8A', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '900', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                                <Printer size={20} /> FACTURE A4
                            </button>
                        </div>
                    </aside>
                </div>
            </main>
        </div>
    );
};

export default VenteFactureClient;
