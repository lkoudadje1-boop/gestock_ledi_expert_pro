import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'; 
import { 
    ClipboardList, RefreshCcw, Download, Calendar, 
    ListFilter, Eye, CheckCircle, Clock, Search, 
    Archive, Package, Printer 
} from 'lucide-react';
import { useReactToPrint } from 'react-to-print'; 

import API from '../../services/api';
import Sidebar from '../../components/Sidebar';
import { exportToExcel } from '../../utils/excelHelper';

// 🚀 RECTIFICATION DU CHEMIN ET LEVIER ANTI-NaN : Correspondance exacte avec votre fichier disque
import { ConversionStockService } from '../../utils/converisonstock'; 

// --- IMPORTS DES COMPOSANTS TECHNIQUES ---
import InventairePrint from './inventaireprint'; 

/**
 * Composant HistoriqueInventaire
 * Gère l'affichage des sessions passées et le détail des écarts de stock.
 */
const HistoriqueInventaire = () => {
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

    // --- ÉTATS ---
    const [sessions, setSessions] = useState([]); 
    const [details, setDetails] = useState([]);   
    const [loading, setLoading] = useState(true);
    const [archivingId, setArchivingId] = useState(null); 
    const [showFullHistory, setShowFullHistory] = useState(false);
    const [selectedSessionId, setSelectedSessionId] = useState(null);
    const [activeTab, setActiveTab] = useState('actif'); 

    const initialDates = { start: '', end: '' };
    const initialFilters = { article: '', sessionId: '', typeEcart: 'tous' };

    const [dateRange, setDateRange] = useState(initialDates);
    const [colFilters, setColFilters] = useState(initialFilters);

    // --- 🚀 CONFIGURATION DU SYSTEME TECHNIQUE D'IMPRESSION SANS TRONCATURES ---
    const printRef = useRef(); 
    const [printData, setPrintData] = useState(null); 
    const [articlesAImprimer, setArticlesAImprimer] = useState([]); 
    const [formatImpression, setFormatImpression] = useState('A4'); 

    const [dynamiqueCompanyPrint, setDynamiqueCompanyPrint] = useState({
        name: currentUser.company_name || currentUser.companyName || "LEDI EXPERT PRO",
        address: currentUser.company_address || currentUser.companyAddress || "Adresse non renseignée",
        phone: currentUser.company_phone || currentUser.companyPhone || "Tél: N/A",
        email: currentUser.company_email || currentUser.companyEmail || "Email: N/A",
        logo_data: currentUser.company_logo || currentUser.logo_data || currentUser.logo || null
    });

    // --- 🚀 CONFIGURATION DU GESTIONNAIRE D'IMPRESSION SANS DÉCALAGE DE RENDU COMPTABLE ---
    const handlePrintTrigger = useReactToPrint({
        content: () => printRef.current, 
        documentTitle: `Inventaire_Session_${printData?.id || 'Rapport'}`,
        
        onBeforeGetContent: () => {
            return new Promise((resolve) => {
                console.log("🖨️ [REACT-TO-PRINT] Gel de la capture pour hydratation des lignes d'inventaire...");
                setTimeout(() => {
                    resolve();
                }, 350);
            });
        },
        
        onAfterPrint: () => {
            console.log("✅ Fenêtre d'impression fermée.");
        }
    });

    // --- 🚀 FIXATION MAÎTRESSE DES UNITÉS NATIVES (ANTI-"UNITÉ" VISUEL) ---
    const formaterStockPOS = useCallback((valeurStock, itemContexte) => {
        if (valeurStock === undefined || valeurStock === null || valeurStock === '') return "—";
        
        if (typeof valeurStock === 'string' && isNaN(Number(valeurStock.trim()))) {
            return valeurStock.trim();
        }

        // 🛡️ RE-STRUCTURATION DES CLÉS AVANT TRANSITION POUR GARANTIR LE DÉCODAGE DES VRAIES UNITÉS (BTS, PCS...)
        const contexteHarmonise = {
            ...itemContexte,
            unit_coefficient: Number(itemContexte?.unit_coefficient || itemContexte?.coefficient || 1),
            unit_code_gros: String(itemContexte?.unit_code_gros || itemContexte?.unite_code || itemContexte?.code || 'CS').trim(),
            unit_ref_detail: String(itemContexte?.unit_ref_detail || itemContexte?.unite_reference || 'UNITÉ').trim()
        };

        // Appel délégué sécurisé à votre utilitaire partagé
        return ConversionStockService.toExpressionTextuelle(valeurStock, contexteHarmonise);
    }, []);

    // --- CALCULS MEMOÏSÉS ---
    const countArchives = useMemo(() => {
        return sessions.filter(s => s.statut === 'archive' || s.archived === 1).length;
    }, [sessions]);

    const countActifs = useMemo(() => {
        return sessions.filter(s => s.statut !== 'archive' && s.archived !== 1).length;
    }, [sessions]);

    // Chargement asynchrone des coordonnées à jour de votre structure
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

    // --- CHARGEMENT DES DONNÉES SÉCURISÉ (MÉMOÏSÉ) ---
    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [resSessions, resDetails] = await Promise.all([
                API.get('/inventories/sessions'),
                API.get('/inventories/details')
            ]);

            const sessionsData = resSessions.data.success ? resSessions.data.data : [];
            const detailsData = resDetails.data.success ? resDetails.data.data : [];

            // Enrichissement mathématique et financier systématique des lignes de l'historique figé
            const detailsEnrichis = detailsData.map(l => {
                const coef = Number(l.unit_coefficient || l.coefficient || 1) || 1;
                
                // 1. Branche Achat (CMP)
                const prixUnitaireAchatPiece = Number(l.prix_unitaire_snap || l.prix_achat_snap || 0) / coef;
                const valeurTheoriqueAchat = Math.round(Number(l.stock_theorique || 0) * prixUnitaireAchatPiece);
                const valeurReelleAchat = Math.round(Number(l.stock_reel || 0) * prixUnitaireAchatPiece);

                // 2. Branche Vente (Figeage historique total de votre nouvelle colonne)
                const prixUnitaireVentePiece = Number(l.prixVente_snap || 0) / coef;
                const valeurTheoriqueVente = Math.round(Number(l.stock_theorique || 0) * prixUnitaireVentePiece);
                const valeurReelleVente = Math.round(Number(l.stock_reel || 0) * prixUnitaireVentePiece);
                const ecartPieces = Number(l.stock_reel || 0) - Number(l.stock_theorique || 0);
                const valeurEcartVenteFige = Math.round(ecartPieces * prixUnitaireVentePiece);

                return {
                    ...l,
                    valeur_theorique_net: valeurTheoriqueAchat,
                    valeur_reel_net: valeurReelleAchat,
                    
                    // 🚀 EXPÉDITION DES CLÉS DE VENTE FIGÉES COMPATIBLES AVEC LE RENDU JSX :
                    valeur_theo_vente_net: valeurTheoriqueVente,
                    valeur_reel_vente_net: valeurReelleVente,
                    valeur_ecart_vente_net: valeurEcartVenteFige
                };
            });

            setSessions(sessionsData);
            setDetails(detailsEnrichis);
        } catch (err) {
            console.error("Erreur de chargement des inventaires", err);
        } finally {
            setLoading(false);
        }
    }, []);
    // Action de préparation à l'impression d'une session spécifique
    const preparerImpressionSession = useCallback((session, tousLesDetails) => {
        setPrintData(session);
        // Filtrer les détails liés à cette session précise
        const lignesSession = tousLesDetails.filter(d => String(d.inventory_session_id) === String(session.id));
        setArticlesAImprimer(lignesSession);
        
        // Déclenche le cycle d'impression securisé
        setTimeout(() => {
            handlePrintTrigger();
        }, 100);
    }, [handlePrintTrigger]);

    // --- LOGIQUE SYNC TEMPS RÉEL (SNC) ---
    useEffect(() => {
        fetchData();

        const handleGlobalUpdate = (event) => {
            const data = event.detail;
            const tableName = data?.table || data;

            if (tableName === 'inventory' || tableName === 'all') {
                console.log("⚡ [SYNC-HISTO-INV] Mise à jour des sessions détectée");
                fetchData();
            }
        };

        window.addEventListener('ERP_DATA_CHANGED', handleGlobalUpdate);

        return () => {
            window.removeEventListener('ERP_DATA_CHANGED', handleGlobalUpdate);
        };
    }, [fetchData]);

    // --- ACTIONS ---
    const handleArchiveSession = async (id) => {
        setArchivingId(id); 
        try {
            const user = JSON.parse(localStorage.getItem('user')); 
            const companyId = user?.company_id || user?.companyId;

            const response = await API.put(`/inventories/sessions/${id}/archive`, {
                company_id: companyId 
            });
            
            if (response.data.success) {
                console.log(`✅ Session ${id} archivée avec succès`);
                fetchData(); 
            }
        } catch (err) {
            console.error("Erreur archivage:", err);
        } finally {
            setArchivingId(null);
        }
    };
    const handleSelectSession = (id) => {
        const idPur = String(id).replace('INV-', '').trim();
        setSelectedSessionId(idPur);
        setShowFullHistory(false); 
        const element = document.getElementById('titre-registre');
        if (element) element.scrollIntoView({ behavior: 'smooth' });
    };

    const resetAllFilters = () => {
        setSelectedSessionId(null);
        setShowFullHistory(false);
        setDateRange(initialDates);
        setColFilters(initialFilters);
    };

    // --- FILTRAGE DES DONNÉES SESSIONS ---
    const sessionsFiltrees = useMemo(() => {
        return sessions.filter(s => {
            const isArchived = s.statut === 'archive' || s.archived === 1;
            
            if (activeTab === 'actif' && isArchived) return false;
            if (activeTab === 'archive' && !isArchived) return false;

            if (!dateRange.start && !dateRange.end) return true;
            const dCloture = new Date(s.date_cloture || s.closed_at || s.created_at).toISOString().split('T')[0];
            return (!dateRange.start || dCloture >= dateRange.start) && 
                   (!dateRange.end || dCloture <= dateRange.end);
        });
    }, [sessions, dateRange, activeTab]);

    // --- 🚀 FILTRAGE DES LIGNES PARFAITEMENT ALIGNÉ ET EXTRÊMEMENT FIABLE ---
    const detailsFiltres = useMemo(() => {
        return details.map(d => {
            const valeurEcartSQL = Number(d.valeur_ecart_net !== undefined ? d.valeur_ecart_net : (d.valeur_ecart ?? d.ecart_valeur ?? d.montant ?? 0));
            const ecartPiecesNum = Number(d.ecart || 0);

            // 🛡️ ENCAPSULATION LOGISTIQUE POUR INTERDIRE LE MOT "UNITÉ" SI LE SELECTIONNEUR D'ORIGINE MANQUE
            const contexteSecurisé = {
                ...d,
                unit_coefficient: Number(d.unit_coefficient || d.coefficient || 1),
                unit_code_gros: String(d.unit_code_gros || d.unite_code || d.code || 'CS').trim(),
                unit_ref_detail: String(d.unit_ref_detail || d.unite_reference || 'UNITÉ').trim()
            };

            const txtTheorique = d.stock_theorique_formate || ConversionStockService.toExpressionTextuelle(d.stock_theorique || 0, contexteSecurisé);
            const txtReel = d.stock_reel_formate || ConversionStockService.toExpressionTextuelle(d.stock_reel || 0, contexteSecurisé);
            
            // Évite le signe + devant un écart nul pour garder l'interface propre
            const signePrefixe = ecartPiecesNum > 0 ? '+' : '';
            const txtEcart = d.ecart_formate || `${signePrefixe}${ConversionStockService.toExpressionTextuelle(ecartPiecesNum, contexteSecurisé)}`;

            return {
                ...d,
                stock_theorique_net: txtTheorique,
                stock_reel_net: txtReel,
                ecart_net: txtEcart,
                valeur_theorique_net: Math.round(Number(d.valeur_theorique_net || 0)),
                valeur_reel_net: Math.round(Number(d.valeur_reel_net || 0)),
                valeur_ecart_net: Math.round(valeurEcartSQL),
                
                // 🚀 PERSISTANCE DE LA VALEUR D'ÉCART VENTE FIGÉE POUR LA NOUVELLE COLONNE RENDU
                valeur_ecart_vente_net: Math.round(Number(d.valeur_ecart_vente_net || 0))
            };
        }).filter(d => {
            const currentSessionId = String(selectedSessionId || '').replace('INV-', '').trim();
            const itemSessionId = String(d.id_inventaire || d.inventory_session_id || '').replace('INV-', '').trim();
            
            const matchSession = !selectedSessionId || itemSessionId === currentSessionId;
            
            const nomArticle = d.nom_article_snap || d.nom_article || "";
            const matchArticle = nomArticle.toLowerCase().includes(colFilters.article.toLowerCase());
            
            let matchEcart = true;
            if (colFilters.typeEcart === 'manquant') matchEcart = d.valeur_ecart_net < 0;
            if (colFilters.typeEcart === 'surplus') matchEcart = d.valeur_ecart_net > 0;

            return matchSession && matchArticle && matchEcart;
        });
    }, [details, selectedSessionId, colFilters]);


       const handleActionImprimerSession = useCallback((session, formatCible = 'A4') => {
        if (!session) return;
        
        // Extraction propre des ID sous forme de chaînes de caractères épurées
        const sessionPurId = String(session.id || '').replace(/INV-/g, '').trim();
        
        // 1. On extrait et on calcule à la volée directement depuis l'état brut global 'details'
        const articlesAssocies = details
            .filter(det => {
                const itemSessionId = String(det.id_inventaire ?? det.inventory_session_id ?? '').replace(/INV-/g, '').trim();
                return itemSessionId === sessionPurId;
            })
            .map(d => {
                // Récupération rigoureuse de la valeur de l'écart SQL brute
                const valeurEcartSQL = Number(d.valeur_ecart_net !== undefined ? d.valeur_ecart_net : (d.valeur_ecart || d.ecart_valeur || 0));
                const ecartPiecesNum = Number(d.ecart || (Number(d.stock_reel || 0) - Number(d.stock_theorique || 0)));

                // 🎯 RECALCUL FINANCIER PAR LIGNE ALIGNÉ SUR LE BLOC 1
                const coef = Number(d.unit_coefficient || d.coefficient || 1) || 1;
                const prixUnitairePiece = Number(d.prix_unitaire_snap || d.prix_achat_snap || d.prix_unitaire || 0) / coef;
                
                const valeurTheorique = Math.round(Number(d.stock_theorique || 0) * prixUnitairePiece);
                const valeurReelle = Math.round(Number(d.stock_reel || 0) * prixUnitairePiece);

                // 🛡️ RE-STRUCTURATION DES CLÉS LOGISTIQUES POUR EMPÊCHER LE MOT "UNITÉ" À L'IMPRESSION
                const contexteImpressionSecurise = {
                    ...d,
                    unit_coefficient: Number(d.unit_coefficient || d.coefficient || 1),
                    unit_code_gros: String(d.unit_code_gros || d.unite_code || d.code || 'CS').trim(),
                    unit_ref_detail: String(d.unit_ref_detail || d.unite_reference || 'UNITÉ').trim()
                };

                // Extraction des expressions textuelles de vos stocks basées sur le contexte blindé
                const txtTheorique = d.stock_theorique_formate || ConversionStockService.toExpressionTextuelle(d.stock_theorique || 0, contexteImpressionSecurise);
                const txtReel = d.stock_reel_formate || ConversionStockService.toExpressionTextuelle(d.stock_reel || 0, contexteImpressionSecurise);
                
                const signePrefixe = ecartPiecesNum > 0 ? '+' : '';
                const txtEcart = d.ecart_formate || `${signePrefixe}${ConversionStockService.toExpressionTextuelle(ecartPiecesNum, contexteImpressionSecurise)}`;

                return {
                    ...d,
                    stock_theorique_net: txtTheorique,
                    stock_reel_net: txtReel,
                    ecart_net: txtEcart,
                    valeur_theorique_net: valeurTheorique, // 🖨️ Injecté pour la page d'impression
                    valeur_reel_net: valeurReelle,         // 🖨️ Injecté pour la page d'impression
                    valeur_ecart_net: Math.round(valeurEcartSQL),
                    valeur_ecart_vente_net: Math.round(Number(d.valeur_ecart_vente_net || 0)) // 🖨️ Injecté pour l'impression
                };
            });

        // 2. 🔒 EN-TÊTE DE LA SESSION EN COURS D'IMPRESSION
        const totalTheoSession = articlesAssocies.reduce((sum, a) => sum + a.valeur_theorique_net, 0);
        const totalReelSession = articlesAssocies.reduce((sum, a) => sum + a.valeur_reel_net, 0);
        const totalEcartSession = articlesAssocies.reduce((sum, a) => sum + a.valeur_ecart_net, 0);

        let sessionFormattee = {
            ...session,
            valeur_theo_totale: session.valeur_theo_totale || session.valeur_theo || totalTheoSession,
            valeur_reel_totale: session.valeur_reel_totale || session.valeur_reel || totalReelSession,
            valeur_ecart_totale: session.valeur_ecart_totale || session.valeur_ecart || totalEcartSession
        };

        console.log("🖨️ [ENVOI-IMPRESSION-SOUS-TOTAL-ASSURÉ]", {
            id: sessionPurId,
            articlesTrouves: articlesAssocies.length,
            theoTotal: sessionFormattee.valeur_theo_totale,
            reelTotal: sessionFormattee.valeur_reel_totale
        });

        setFormatImpression(formatCible);
        setPrintData(sessionFormattee); 
        setArticlesAImprimer(articlesAssocies);
        
        setTimeout(() => {
            handlePrintTrigger();
        }, 400);
    }, [details, handlePrintTrigger]);



    // --- 🚀 LOGIQUE EXPORT EXCEL SÉCURISÉE COMPTABLEMENT ---
    const handleExportExcel = () => {
        const dataToExport = (showFullHistory || selectedSessionId) 
            ? detailsFiltres.map(d => ({
                'ARTICLE': d.nom_article_snap || d.nom_article,
                'STOCK THÉORIQUE': d.stock_theorique_net,
                'VALEUR THÉORIQUE': `${d.valeur_theorique_net} F`, 
                'STOCK RÉEL': d.stock_reel_net,
                'VALEUR RÉELLE': `${d.valeur_reel_net} F`,         
                'ÉCART LOGISTIQUE': d.ecart_net,
                'VALEUR FINANCIÈRE ÉCART': d.valeur_ecart_net,
                'ÉCART VALEUR VENTE': d.valeur_ecart_vente_net, // 🚀 AJOUTÉ À L'EXPORT EXCEL POUR VOS RAPPORTS
                'REF SESSION': `INV-${d.id_inventaire || d.inventory_session_id}`
            }))
            : sessionsFiltrees.map(s => {
                const totalAjustementReelExcel = details
                    .filter(d => String(d.id_inventaire || d.inventory_session_id || '').replace('INV-', '').trim() === String(s.id).trim())
                    .reduce((sum, item) => {
                        const val = Number(item.ecart_valeur !== undefined ? item.ecart_valeur : (item.valeur_ecart || item.montant || 0));
                        return sum + Math.round(val); 
                    }, 0);

                return {
                    'REF': `INV-${s.id}`,
                    'UTILISATEUR': s.nom_utilisateur || s.user_name || 'Système',
                    'VALEUR AJUSTEMENT GLOBALE': totalAjustementReelExcel,
                    'DATE CLÔTURE': s.closed_at || s.date_cloture ? new Date(s.closed_at || s.date_cloture).toLocaleString() : 'En cours'
                };
            });
        
        exportToExcel(dataToExport, `Inventaire_${activeTab}_${new Date().toLocaleDateString()}`);
    };

    return (
        <div style={layoutStyle}>
            <Sidebar />
            <main style={mainStyle}>
                {/* 🖨️ BLOC TECHNIQUE PERMANENT ET ASSAINI : Toujours monté dans le DOM pour réagir instantanément au clic */}
                <div style={{ display: 'none' }}>
                    <InventairePrint
                        ref={printRef}
                        session={printData || {}} // 🎯 Évite tout crash ou freeze si null au premier affichage
                        articles={articlesAImprimer || []} // 🎯 Reçoit maintenant l'extrait arrondi exact avec la valeur d'écart de vente figée
                        company={dynamiqueCompanyPrint}
                        format={formatImpression}
                    />
                </div>

                {/* HEADER */}
                <header style={headerBarStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div style={iconBox}><ClipboardList size={24} color="#fff" /></div>
                        <div>
                            <h1 style={titleStyle}>HISTORIQUE DES INVENTAIRES</h1>
                            <div style={dateBox}>
                                <Calendar size={14} color="#2563eb" />
                                <input type="date" style={dateInput} value={dateRange.start} onChange={(e) => setDateRange({...dateRange, start: e.target.value})} />
                                <span style={{fontWeight:'900', color: '#2563eb'}}>au</span>
                                <input type="date" style={dateInput} value={dateRange.end} onChange={(e) => setDateRange({...dateRange, end: e.target.value})} />
                            </div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={handleExportExcel} style={btnExcel}><Download size={16} /> Export Excel</button>
                        <button onClick={fetchData} style={btnRefresh} disabled={loading}>
                            <RefreshCcw size={16} className={loading ? 'animate-spin' : ''} />
                        </button>
                    </div>
                </header>

<div style={contentArea}>
                    {/* TABS CONTROLS */}
                    <div style={tabContainer}>
                        <button style={activeTab === 'actif' ? tabActive : tabInactive} onClick={() => { setActiveTab('actif'); setSelectedSessionId(null); }}>
                            <Package size={16} /> Sessions Actives ({countActifs})
                        </button>
                        <button style={activeTab === 'archive' ? tabActive : tabInactive} onClick={() => { setActiveTab('archive'); setSelectedSessionId(null); }}>
                            <Archive size={16} /> Archives ({countArchives})
                        </button>
                    </div>
                    {/* TABLEAU 1 : SESSIONS CONFIGURÉ AVEC DOUBLE VALORISATION GLOBALISÉE */}
                    <h3 style={sectionTitle}>LISTE DES SESSIONS ({activeTab.toUpperCase()})</h3>
                    <div style={{...cardStyle, maxHeight: '300px', overflowY: 'auto', marginBottom: '25px'}}>
                        <table style={mainTable}>
                            <thead style={stickyHeader}>
                                <tr style={{background: '#2563eb', color: '#fff'}}>
                                    <th style={thStyleWhite}>REF SESSION</th>
                                    <th style={thStyleWhite}>UTILISATEUR</th>
                                    <th style={thCenterWhite}>STATUT</th>
                                    <th style={thCenterWhite}>NB ARTICLES</th>
                                    <th style={thCenterWhite}>VALEUR AJUST. (ACHAT)</th>
                                    {/* 🚀 AJOUT DE L'EN-TÊTE GLOBAL POUR LA VALEUR DE VENTE */}
                                    <th style={{...thCenterWhite, color: '#fef08a'}}>VALEUR AJUST. (VENTE)</th>
                                    <th style={thStyleWhite}>DATE CLÔTURE</th>
                                    <th style={thCenterWhite}>ACTIONS</th>
                                </tr>
                            </thead>
                            <tbody>

                              {sessionsFiltrees.length === 0 ? (
                                    /* 🚀 Le colSpan passe à 8 pour englober la nouvelle colonne sans casser la grille */
                                    <tr><td colSpan="8" style={emptyState}>Aucune session trouvée</td></tr>
                                ) : (
                                    sessionsFiltrees.map((s) => {
                                        const dateCloture = s.date_cloture || s.closed_at;
                                        const estSessionValide = s.statut === 'valide' || s.statut === 'archive';

                                        // 🎯 1. SOUS-TOTAL FIXE DE L'ÉCART À L'ACHAT (Existant)
                                        const valeurAjustementAchatReelle = details
                                            .filter(d => {
                                                const currentSessionId = String(s.id || '').replace(/INV-/g, '').trim();
                                                const itemSessionId = String(d.id_inventaire || d.inventory_session_id || '').replace(/INV-/g, '').trim();
                                                return itemSessionId === currentSessionId;
                                            })
                                            .reduce((sum, item) => {
                                                const montantBrutLigne = Number(item.valeur_ecart_net !== undefined ? item.valeur_ecart_net : (item.valeur_ecart || item.montant || 0));
                                                return sum + Math.round(montantBrutLigne);
                                            }, 0);

                                        // 🎯 2. 🚀 AJOUT : SOUS-TOTAL COMPTABLE DE L'ÉCART DE VENTE TOTALISÉ PAR LIGNE FIGÉE
                                        const valeurAjustementVenteReelle = details
                                            .filter(d => {
                                                const currentSessionId = String(s.id || '').replace(/INV-/g, '').trim();
                                                const itemSessionId = String(d.id_inventaire || d.inventory_session_id || '').replace(/INV-/g, '').trim();
                                                return itemSessionId === currentSessionId;
                                            })
                                            .reduce((sum, item) => {
                                                return sum + Math.round(Number(item.valeur_ecart_vente_net || 0));
                                            }, 0);

                                        return (
                                            <tr key={s.id} style={trStyle}>
                                                <td style={tdStyle}>
                                                    <span style={invBadge} onClick={() => handleSelectSession(s.id)}>INV-{s.id}</span>
                                                </td>
                                                <td style={{...tdStyle, fontWeight: '600'}}>{s.nom_utilisateur || s.user_name || 'Utilisateur'}</td>
                                                <td style={tdCenter}>
                                                    <span style={estSessionValide ? statusClosed : statusOpen}>
                                                        {estSessionValide ? <CheckCircle size={12}/> : <Clock size={12}/>}
                                                        {s.statut ? String(s.statut).toUpperCase() : 'EN_COURS'}
                                                    </span>
                                                </td>
                                                <td style={tdCenter}>{s.total_articles || 0}</td>
                                                
                                                {/* ÉCART TOTAL À L'ACHAT (CMP) */}
                                                <td style={{...tdCenter, color: Number(valeurAjustementAchatReelle) >= 0 ? '#16a34a' : '#dc2626', fontWeight:'900'}}>
                                                    {Number(valeurAjustementAchatReelle).toLocaleString()} F
                                                </td>

                                                {/* 🚀 NOUVELLE CELLULE VISUELLE : ÉCART TOTAL AU PRIX DE VENTE FIGÉ */}
                                                <td style={{...tdCenter, color: Number(valeurAjustementVenteReelle) >= 0 ? '#16a34a' : '#dc2626', fontWeight:'900', background: '#f8fafc'}}>
                                                    {Number(valeurAjustementVenteReelle) > 0 ? '+' : ''}{Number(valeurAjustementVenteReelle).toLocaleString()} F
                                                </td>

                                                <td style={{...tdStyle, fontSize: '11px', fontWeight:'700'}}>
                                                    {dateCloture ? new Date(dateCloture).toLocaleString() : '---'}
                                                </td>
                                                <td style={tdCenter}>
                                                    <div style={{display:'flex', gap:'8px', justifyContent:'center'}}>


                                                    {/* 🚀 BOUTON CRITIQUE D'IMPRESSION DIRECTE EN FORMAT A4 AJOUTÉ SUR LA LIGNE */}
                                                        <button 
                                                            style={{
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                padding: '6px',
                                                                background: '#1E3A8A',
                                                                color: '#ffffff',
                                                                border: 'none',
                                                                borderRadius: '6px',
                                                                cursor: 'pointer',
                                                                transition: 'all 0.2s'
                                                            }} 
                                                            onClick={() => handleActionImprimerSession(s, 'A4')} 
                                                            title="Imprimer l'état de stock"
                                                        >
                                                            <Printer size={14} />
                                                        </button>

                                                        <button style={btnSmall} onClick={() => handleSelectSession(s.id)} title="Voir détails">
                                                            <Eye size={14} />
                                                        </button>

                                                        {activeTab === 'actif' && (
                                                            <button 
                                                                style={archivingId === s.id ? {...btnArchive, opacity: 0.5} : btnArchive} 
                                                                onClick={() => handleArchiveSession(s.id)} 
                                                                disabled={archivingId === s.id}
                                                                title="Archiver"
                                                            >
                                                                {archivingId === s.id ? (
                                                                    <RefreshCcw size={14} className="animate-spin" />
                                                                ) : (
                                                                    <Archive size={14} />
                                                                )}
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
{/* TABLEAU 2 : DÉTAILS ÉCARTS */}
<div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px'}}>
    <h3 id="titre-registre" style={sectionTitle}>
        {selectedSessionId ? `ÉCARTS DE LA SESSION INV-${selectedSessionId}` : "REGISTRE DÉTAILLÉ DES ÉCARTS"}
    </h3>
    <div style={{display: 'flex', gap: '10px'}}>
        <button onClick={() => {setShowFullHistory(true); setSelectedSessionId(null);}} style={btnShowAll}>TOUT L'HISTORIQUE</button>
        <button onClick={resetAllFilters} style={btnReset}><ListFilter size={14} /> RESET</button>
    </div>
</div>

<div style={{...cardStyle, maxHeight: '450px', overflowY: 'auto'}}>
    <table style={mainTable}>
        <thead style={stickyHeader}>
            <tr style={{background: '#f1f5f9'}}>
                <th style={thStyle}>ARTICLE</th>
                <th style={thCenter}>STK THÉO</th>
                <th style={thCenter}>VALEUR THÉO</th>
                <th style={thCenter}>STK RÉEL</th>
                <th style={thCenter}>VALEUR RÉEL</th>
                <th style={thCenter}>ÉCART</th>
                <th style={thCenter}>PRIX UNIT.</th>
                <th style={thCenter}>VALEUR ÉCART</th>
                {/* 🚀 AJOUT DE LA COLONNE ÉCART VENTE DANS L'EN-TÊTE COMPTABLE */}
                <th style={{...thCenter, color: '#2563eb', fontWeight: '900'}}>VALEUR ÉCART VENTE</th>
                <th style={thStyle}>REF SESSION</th>
            </tr>
            <tr style={{background: '#fff'}}>
                <th style={filterTh}>
                    <div style={{position:'relative'}}>
                        <Search size={12} style={{position:'absolute', left:'8px', top:'50%', transform:'translateY(-50%)', color:'#2563eb'}}/>
                        <input 
                            placeholder="Filtrer..." 
                            style={{...filterInput, paddingLeft:'25px'}} 
                            value={colFilters.article} 
                            onChange={(e) => setColFilters({...colFilters, article: e.target.value})} 
                        />
                    </div>
                </th>
                <th style={filterTh}></th>
                <th style={filterTh}></th>
                <th style={filterTh}></th>
                <th style={filterTh}></th>
                <th style={filterTh}>
                    <select 
                        style={filterInput} 
                        value={colFilters.typeEcart}
                        onChange={(e) => setColFilters({...colFilters, typeEcart: e.target.value})}
                    >
                        <option value="tous">Tous</option>
                        <option value="manquant">(-) Manquant</option>
                        <option value="surplus">(+) Surplus</option>
                    </select>
                </th>
                <th style={filterTh}></th>
                <th style={filterTh}></th>
                {/* 🚀 CASE VIDE POUR COMPENSER ET DÉCALER CORRECTEMENT LA COLONNE REF SESSION */}
                <th style={filterTh}></th>
                <th style={filterTh}></th>
            </tr>
        </thead>

<tbody>
{!showFullHistory && !selectedSessionId ? (
                                    /* 🚀 CORRECTIF : colSpan passe à 10 pour intégrer la nouvelle colonne sans décalage graphique */
                                    <tr><td colSpan="10" style={emptyState}>Sélectionnez une session ci-dessus ou cliquez sur "Tout l'historique"</td></tr>
                                ) : (
                                    detailsFiltres.map((d, index) => {
                                        // 🎯 FIXATION COMPTABLE : On passe d.stock_theorique et d.stock_reel (nombres de pièces bruts du SQL)
                                        // pour alimenter formaterStockPOS sans conflit avec d.stock_theorique_net
                                        const expressionTheorique = formaterStockPOS(d.stock_theorique, d);
                                        const expressionReelle = formaterStockPOS(d.stock_reel, d);
                                        
                                        // 🚀 ENTRAÎNEMENT CHIRURGICAL ET ANTI-"UNITÉ" : Lecture dynamique de la mesure d'époque
                                        const ecartNum = d.ecart !== undefined ? Number(d.ecart) : (Number(d.stock_reel || 0) - Number(d.stock_theorique || 0));
                                        let expressionEcart = formaterStockPOS(0, d); // Génère proprement "0 BTS", "0 PCS", etc.
                                        
                                        if (ecartNum > 0) expressionEcart = `+${formaterStockPOS(ecartNum, d)}`;
                                        if (ecartNum < 0) expressionEcart = formaterStockPOS(ecartNum, d);

                                        // LECTURE DU MONTANT COMPTABLE FIGÉ EN BASE DE DONNÉES SÉCURISÉ (ZÉRO CALCUL DÉCALÉ)
                                        const valeurFinanciereEcart = Number(d.valeur_ecart || d.montant || d.valeur_ecart_net || 0);
                                        const valeurEcartVenteFige = Number(d.valeur_ecart_vente_net || 0);

                                        // Extraction sécurisée des valeurs financières théoriques et réelles calculées au Bloc 1 & 2
                                        const vTheo = Number(d.valeur_theorique_net || 0);
                                        const vReel = Number(d.valeur_reel_net || 0);

                                        return (
                                            <tr key={index} style={trStyle}>
                                                <td style={{...tdStyle, fontWeight: '800', fontSize: '12px', color: '#0f172a'}}>
                                                    {/* 🎯 SÉCURISATION ALIAS : nom_article_snap fourni par ton modèle backend centralisé */}
                                                    {(d.nom_article_snap || d.nom_article || 'Article sans nom').toUpperCase()}
                                                </td>
                                                
                                                {/* STK THÉO : Quantité physique uniquement */}
                                                <td style={{...tdCenter, fontSize: '11px', color: '#475569', fontWeight: '700'}}>
                                                    {expressionTheorique}
                                                </td>

                                                {/* VALEUR THÉO : Colonne financière dédiée */}
                                                <td style={{...tdCenter, fontSize: '11px', color: '#64748b', fontWeight: '600'}}>
                                                    {vTheo.toLocaleString('fr-FR')} F
                                                </td>

                                                {/* STK RÉEL : Quantité physique uniquement */}
                                                <td style={{...tdCenter, fontSize: '11px', fontWeight: '900', color: '#2563eb'}}>
                                                    {expressionReelle}
                                                </td>

                                                {/* VALEUR RÉEL : Colonne financière dédiée */}
                                                <td style={{...tdCenter, fontSize: '11px', color: '#64748b', fontWeight: '600'}}>
                                                    {vReel.toLocaleString('fr-FR')} F
                                                </td>
                                                
                                                <td style={tdCenter}>
                                                    <span style={{
                                                        background: ecartNum === 0 ? '#f1f5f9' : ecartNum > 0 ? '#dcfce7' : '#fee2e2',
                                                        color: ecartNum === 0 ? '#64748b' : ecartNum > 0 ? '#16a34a' : '#dc2626',
                                                        padding: '4px 8px', borderRadius: '4px', fontWeight: '900', fontSize: '11px'
                                                    }}>
                                                        {expressionEcart}
                                                    </span>
                                                </td>
                                                
                                                {/* 🎯 ALIGNEMENT STRICT : Remplacement de Math.round par le formateur linguistique fluide */}
                                                <td style={tdCenter}>
                                                    {Number(d.prix_unitaire_snap || d.prix_achat_snap || d.prix_unitaire || 0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} F
                                                </td>
                                                
                                                <td style={{...tdCenter, fontWeight: '900', color: valeurFinanciereEcart < 0 ? '#dc2626' : valeurFinanciereEcart > 0 ? '#16a34a' : '#1e293b'}}>
                                                    {valeurFinanciereEcart.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} F
                                                </td>
                                                
                                                {/* 🚀 NOUVELLE CELLULE GRAPHIQUE : Affichage de la valeur d'écart au Prix de Vente Figé */}
                                                <td style={{...tdCenter, fontWeight: '900', color: valeurEcartVenteFige < 0 ? '#dc2626' : valeurEcartVenteFige > 0 ? '#16a34a' : '#1e293b'}}>
                                                    {valeurEcartVenteFige > 0 ? '+' : ''}{valeurEcartVenteFige.toLocaleString('fr-FR')} F
                                                </td>
                                                
                                                <td style={tdStyle}>
                                                    <span style={invBadge}>INV-{d.inventory_session_id || d.id_inventaire}</span>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>

            <div style={{ display: 'none' }}>
                <InventairePrint
                    ref={printRef}
                    session={printData || {}} // 🎯 Reste monté de façon stable même si printData est null au départ
                    articles={articlesAImprimer || []} // 🎯 Reçoit maintenant les lignes enrichies et autonomes de l'historique
                    company={dynamiqueCompanyPrint}
                    format={formatImpression}
                />
            </div>

        </div>
    );
};


// --- STYLES ---
const layoutStyle = { display: 'flex', height: '100vh', background: '#F8FAFC' };
const mainStyle = { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' };
const headerBarStyle = { background: '#fff', padding: '16px 24px', borderBottom: '3px solid #2563eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
const iconBox = { background: '#2563eb', padding: '8px', borderRadius: '8px' };
const titleStyle = { margin: 0, fontSize: '18px', fontWeight: '900', color: '#1e293b' };
const dateBox = { display: 'flex', alignItems: 'center', gap: '10px', background: '#fff', padding: '6px 12px', borderRadius: '8px', border: '2px solid #2563eb', marginTop: '6px' };
const dateInput = { border: 'none', background: 'transparent', fontSize: '13px', outline: 'none', fontWeight: '800', color: '#2563eb' };
const contentArea = { padding: '20px', overflowY: 'auto' };
const tabContainer = { display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '1px solid #cbd5e1', paddingBottom: '10px' };
const tabInactive = { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', background: '#f1f5f9', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', color: '#64748b' };
const tabActive = { ...tabInactive, background: '#2563eb', color: '#fff' };
const sectionTitle = { fontSize: '12px', fontWeight: '900', color: '#2563eb', textTransform: 'uppercase', marginBottom: '8px' };
const cardStyle = { background: '#fff', borderRadius: '10px', border: '2px solid #cbd5e1', overflow: 'hidden' };
const mainTable = { width: '100%', borderCollapse: 'collapse', minWidth: '1000px' };
const stickyHeader = { position: 'sticky', top: 0, zIndex: 10 };
const thStyle = { padding: '12px 10px', background: '#f8fafc', color: '#1e293b', fontSize: '11px', fontWeight: '900', textAlign: 'left', borderBottom: '2px solid #2563eb' };
const thStyleWhite = { ...thStyle, background: '#2563eb', color: '#fff', borderBottom: 'none' };
const thCenter = { ...thStyle, textAlign: 'center' };
const thCenterWhite = { ...thCenter, background: '#2563eb', color: '#fff', borderBottom: 'none' };
const tdStyle = { padding: '12px 10px', fontSize: '12px', color: '#334155', borderBottom: '1px solid #f1f5f9' };
const tdCenter = { ...tdStyle, textAlign: 'center' };
const trStyle = { borderBottom: '1px solid #e2e8f0' };
const filterTh = { padding: '8px 10px', borderBottom: '1px solid #2563eb', background: '#fff' };
const filterInput = { width: '100%', padding: '6px', fontSize: '11px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontWeight: '600' };
const btnRefresh = { background: '#fff', border: '2px solid #2563eb', padding: '8px', borderRadius: '8px', cursor: 'pointer', color: '#2563eb' };
const btnExcel = { background: '#059669', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '900', display:'flex', alignItems:'center', gap:'8px' };
const btnSmall = { border: '1.5px solid #2563eb', background: '#eff6ff', padding: '6px', borderRadius: '6px', cursor: 'pointer', color: '#2563eb' };
const btnArchive = { border: '1.5px solid #64748b', background: '#fff', padding: '6px', borderRadius: '6px', cursor: 'pointer', color: '#64748b' };
const invBadge = { background: '#eff6ff', color: '#2563eb', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '900', border: '1.5px solid #2563eb', cursor:'pointer' };
const statusClosed = { background: '#dcfce7', color: '#166534', padding: '4px 8px', borderRadius: '12px', fontSize: '10px', fontWeight: '900', display: 'inline-flex', alignItems: 'center', gap: '4px' };
const statusOpen = { ...statusClosed, background: '#fef9c3', color: '#854d0e' };
const btnShowAll = { background: '#2563eb', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: '900' };
const btnReset = { background: '#fff', color: '#2563eb', border: '2px solid #2563eb', padding: '8px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '6px' };
const emptyState = { textAlign: 'center', padding: '40px', color: '#64748b', fontStyle: 'italic', fontSize: '14px' };

export default HistoriqueInventaire;
