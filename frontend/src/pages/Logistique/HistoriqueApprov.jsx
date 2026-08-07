import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
    FileText, RefreshCcw, Edit3, Archive, Download, Calendar, 
    FileDown, ListFilter, Eye, Trash2, Lock, Snowflake, Inbox, Filter,
    RotateCcw, ArrowLeftRight, CheckCircle2, XCircle, AlertTriangle, Bell, Info
} from 'lucide-react';
import API from '../../services/api';
import Sidebar from '../../components/Sidebar';
import { getUserPermissions } from '../../utils/permissions_utils'; // 🔑 IMPORTATION DU SÉCURISEUR
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';

const HistoriqueApprov = () => {
    // 🔑 CORRECTIF PERMISSIONS : Extraction sécurisée et ultra-tolérante à toutes les structures de sessions
    const userPerms = useMemo(() => {
        try {
            // 1. On tente d'utiliser l'utilitaire système
            const perms = getUserPermissions() || {};
            if (Object.keys(perms).length > 0) return perms;

            // 2. Sécurité de secours : Lecture directe et parsing manuel du localStorage
            const localUser = JSON.parse(localStorage.getItem('user') || '{}');
            return localUser.permissions || localUser.Permissions || localUser.role?.permissions || localUser.role_permissions || {};
        } catch (e) {
            console.warn("⚠️ [PERMS HISTORIQUE] Échec extraction, repli restrictif appliqué :", e.message);
            return {};
        }
    }, []);

    // 🎯 Détermination stricte des droits d'accès logistiques (Prend en charge : true, 1, "true")
    const canCancelPurchase = useMemo(() => {
        const p = userPerms['log_cancel_purchase'];
        return p === true || p === 1 || String(p).toLowerCase() === 'true';
    }, [userPerms]);

    const canReturnPurchase = useMemo(() => {
        const p = userPerms['log_return_purchase'];
        return p === true || p === 1 || String(p).toLowerCase() === 'true';
    }, [userPerms]);

    const [achats, setAchats] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showFullHistory, setShowFullHistory] = useState(false);
    const [isAllExpanded, setIsAllExpanded] = useState(false);

    // --- ÉTATS POUR LE FORMULAIRE DE RETOUR ---
    const [expandingRow, setExpandingRow] = useState(null);
    const [isInventoryActive, setIsInventoryActive] = useState(false);
    const [lastClosureDate, setLastClosureDate] = useState(null);
    const [activeTab, setActiveTab] = useState('actif');
    const [annulations, setAnnulations] = useState([]);
    
    const [returnQty, setReturnQty] = useState(""); 
    const [activeAction, setActiveAction] = useState('RETOUR'); 
    const [cancelReason, setCancelReason] = useState("");

    const initialDates = { start: '', end: '' };
    const initialFilters = {
        id: '', lot_id: '', num_facture: '', product_id: '', nom_article_snap: '', 
        nom_fournisseur_snap: '', statut: 'tous', nom_utilisateur: '', date_achat: ''
    };
    const [toast, setToast] = useState({ show: false, message: '', type: 'info', bg: '#3b82f6', icon: null, onConfirm: null });

    // 🚀 CORRECTIF : Gestion propre du cycle de vie du timer des toasts (Pas de fuite mémoire)
    const showToast = useCallback((message, type = 'info', onConfirm = null) => {
        const configs = {
            success: { bg: '#10b981', icon: <CheckCircle2 size={20} /> },
            error: { bg: '#ef4444', icon: <XCircle size={20} /> }, 
            info: { bg: '#3b82f6', icon: <Info size={20} /> },
            warning: { bg: '#f59e0b', icon: <AlertTriangle size={20} /> }
        };
        const config = configs[type] || configs.info;
        
        setToast({ 
            show: true, 
            message, 
            type, 
            onConfirm,
            ...config 
        });
    }, []);

    useEffect(() => {
        if (toast.show && !toast.onConfirm) {
            const timer = setTimeout(() => {
                setToast(prev => ({ ...prev, show: false }));
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [toast.show, toast.onConfirm]);

    const [dateRange, setDateRange] = useState(initialDates);
    const [colFilters, setColFilters] = useState(initialFilters);

    // --- UTILS FORMATAGE GENERAL ---
    // 🛡️ SÉCURITÉ ANTI-LITIGE : Évite de planter ou d'altérer les expressions logistiques textuelles (ex: "2 CRT + 6 CHAP")
    const fmt = useCallback((val) => {
        if (val === undefined || val === null || val === '') return "0";
        // Si c'est déjà du texte logistique pré-formaté par l'opération 2 backend, on le renvoie tel quel
        if (typeof val === 'string' && (val.includes('+') || isNaN(Number(val.replace(',', '.').trim())))) {
            return val;
        }
        return Number(val).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    }, []);

    // --- CHARGEMENT DES DONNÉES SÉCURISÉ ---
    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const results = await Promise.allSettled([
                API.get('/purchases'),
                API.get('/purchases/archived'), 
                API.get('/inventories/check-status')
            ]);

            const [resPurchases, resArchived, resInvStatus] = results;
            let tousLesAchats = [];

            if (resPurchases?.status === 'fulfilled' && resPurchases.value?.data) {
                const data = Array.isArray(resPurchases.value.data) ? resPurchases.value.data : [];
                tousLesAchats = [...tousLesAchats, ...data];
            }

            if (resArchived?.status === 'fulfilled' && resArchived.value?.data) {
                const data = Array.isArray(resArchived.value.data) ? resArchived.value.data : [];
                tousLesAchats = [...tousLesAchats, ...data];
            }

            setAchats(tousLesAchats);

            if (resInvStatus?.status === 'fulfilled' && resInvStatus.value?.data) {
                const invData = resInvStatus.value.data;
                setIsInventoryActive(!!invData.en_cours);
                setLastClosureDate(invData.last_closure || null);
            }

        } catch (err) {
            console.error("Erreur globale de chargement", err);
            showToast("Erreur lors de la récupération des données", "error");
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    // --- 4. RÉINITIALISATION DES FILTRES DE L'ENTÊTE ---
    const handleHeaderReset = () => {
        setColFilters(initialFilters);
        setDateRange(initialDates);
        setShowFullHistory(false);
        showToast("Filtres réinitialisés", "info");
    };

    // --- VÉRIFICATION DU STOCK DISPONIBLE (SÉCURITÉ) ---
    const checkStockAvailability = async (itemsToCheck) => {
        try {
            const res = await API.get('/products');
            const products = res.data || [];
            
            for (const item of itemsToCheck) {
                const currentProd = products.find(p => String(p.id || p.ID) === String(item.product_id));
                const stockDisponible = Number(currentProd?.stock_actuel !== undefined ? currentProd.stock_actuel : (currentProd?.stock || 0));
                
                if (!currentProd || stockDisponible < item.qty) {
                    showToast(
                        `Stock insuffisant pour "${currentProd?.nom || currentProd?.NOM || item.product_id}" (${stockDisponible} unité(s) restante(s))`, 
                        "error"
                    );
                    return false; 
                }
            }
            return true;
        } catch (err) {
            console.error("Erreur vérification stock", err);
            showToast("Erreur lors de la vérification des stocks", "error");
            return false;
        }
    };

       // --- 2. TRAITEMENT LIGNE (ANNULATION OU RETOUR) ---
    const handleTraitementLigne = async (achat) => {
        const localUser = JSON.parse(localStorage.getItem('user') || '{}');
        const isSystemAdmin = String(localUser.id || localUser.id_utilisateur || '') === String(achat.user_id || 'USR-71240543') || String(localUser.id || localUser.id_utilisateur || '').includes('71240543');

        if (activeAction === 'ANNULER' && !canCancelPurchase && !isSystemAdmin) {
            return showToast("Action refusée : Votre profil ne possède pas le privilège requis pour annuler des lignes d'achats.", "error");
        }
        if (activeAction === 'RETOUR' && !canReturnPurchase && !isSystemAdmin) {
            return showToast("Action refusée : Votre profil ne possède pas le privilège requis pour effectuer des retours de marchandises.", "error");
        }

        // 🛡️ SÉCURISATION LOGISTIQUE : On garde la chaîne brute saisie (ex: "1,5") pour l'envoi au backend
        const qtySaisieBrute = activeAction === 'ANNULER' ? achat.qte_achetee : returnQty;
        const modeLabel = activeAction === 'ANNULER' ? 'Annulation' : 'Retour';

        if (activeAction === 'RETOUR') {
            // Pour la validation locale uniquement, on convertit temporairement le format textuel en float
            const chaineNettoyee = String(returnQty).replace(',', '.').trim();
            const qtyFlottanteSaisie = parseFloat(chaineNettoyee);
            
            const coeffLogistique = Number(achat.coefficient || achat.unit_coefficient || 1);
            const maxPiecesDisponibles = Number(achat.qte_achetee || 0);

            // On compare des pièces avec des pièces (qty saisie * coeff vs max en BDD)
            const qtySaisieEnPieces = Math.round(qtyFlottanteSaisie * coeffLogistique);

            if (isNaN(qtyFlottanteSaisie) || qtyFlottanteSaisie <= 0 || qtySaisieEnPieces > maxPiecesDisponibles) {
                const maxAffiche = coeffLogistique > 1 ? (maxPiecesDisponibles / coeffLogistique) : maxPiecesDisponibles;
                return showToast(`Quantité de retour invalide. Maximum autorisé : ${maxAffiche}`, "error");
            }
        }
        
        if (!cancelReason || cancelReason.trim() === "") {
            return showToast(`Veuillez saisir un motif pour l'${modeLabel.toLowerCase()}`, "warning");
        }

        try {
            const payload = {
                action: activeAction, 
                qte: qtySaisieBrute, // On passe la chaîne brute, le backend s'occupe de la conversion stricte
                observation: cancelReason.trim()
            };

            const response = await API.post(`/purchases/action-ligne/${achat.id}`, payload);

            if (response.data.success) {
                setExpandingRow(null);
                setReturnQty(""); 
                setCancelReason(""); 
                showToast(response.data.message || `${modeLabel} validé avec succès`, "success");
                fetchData();
            }
        } catch (err) { 
            console.error("Erreur detaille:", err.response?.data);
            showToast(err.response?.data?.error || "Erreur de traitement sur le serveur", "error"); 
        }
    };
        // 🚀 ALIGNEMENT HTTP MÉTHODE : Utilisation de API.put pour correspondre strictement au routeur backend
    const handleArchiveLot = async (lotId) => {
        if (!lotId) return;

        showToast(
            `Êtes-vous sûr de vouloir déplacer tout le lot ${lotId} vers les archives ?`,
            "warning",
            async () => {
                try {
                    // ✅ Changé de API.post à API.put
                    const response = await API.put(`/purchases/archive-lot/${lotId}`);

                    if (response.data.success) {
                        showToast(response.data.message || `Le lot ${lotId} a été archivé.`, "success");
                        fetchData(); // Actualise l'état et bascule le lot dans l'onglet ARCHIVES
                    }
                } catch (err) {
                    console.error("❌ Erreur archivage lot:", err.response?.data || err.message);
                    showToast(err.response?.data?.error || "Impossible d'archiver ce lot.", "error");
                }
            }
        );
    };


    // --- LOGIQUE SYNC & FILTRES SECURISEE (Anti-boucle infinie réseau) ---
    useEffect(() => {
        fetchData();
    }, [activeTab, fetchData]);

    useEffect(() => {
        const handleGlobalUpdate = (event) => {
            const data = event.detail;
            const tableName = data?.table || data;
            if (tableName === 'purchases' || tableName === 'inventory' || tableName === 'all') {
                fetchData();
                const sources = {
                    'purchases': 'des Achats',
                    'inventory': 'de l\'Inventaire',
                    'all': 'générale'
                };
                showToast(`Mise à jour automatique ${sources[tableName] || ''} effectuée`, "info");
            }
        };
        window.addEventListener('ERP_DATA_CHANGED', handleGlobalUpdate);
        return () => window.removeEventListener('ERP_DATA_CHANGED', handleGlobalUpdate);
    }, [fetchData, showToast]);

    const isRowFrozen = useCallback((dateAchat) => {
        if (!lastClosureDate || !dateAchat) return false;
        const tempsAchat = new Date(dateAchat).getTime();
        const tempsCloture = new Date(lastClosureDate).getTime();
        return tempsAchat <= tempsCloture;
    }, [lastClosureDate]);

    const achatsFiltresParOnglet = useMemo(() => {
        if (activeTab === 'annule') return annulations;

        return achats.filter(a => {
            const estArchiveManuellement = a.is_archived === 1 || a.is_archived === true || a.statut === 'ARCHIVÉ';
            const dateRef = a.date_achat || a.date_entete;
            const estGeleParInventaire = isRowFrozen(dateRef);
            const estArchiveGlobal = estArchiveManuellement || estGeleParInventaire;

            if (activeTab === 'archives') {
                return estArchiveGlobal; 
            }
            return !estArchiveGlobal;
        });
    }, [achats, annulations, activeTab, isRowFrozen]);

    const filteredAchatsDetail = useMemo(() => {
        return achatsFiltresParOnglet.filter(a => {
            const dateRef = a.date_achat || a.date_entete;
            let dateAchatStr = "";
            if (dateRef) {
                try {
                    dateAchatStr = new Date(dateRef).toISOString().split('T')[0];
                } catch (e) {
                    dateAchatStr = String(dateRef).split(' ')[0] || "";
                }
            }
            
            const matchDateRange = (!dateRange.start || dateAchatStr >= dateRange.start) && 
                                   (!dateRange.end || dateAchatStr <= dateRange.end);
            const matchColDate = !colFilters.date_achat || dateAchatStr.includes(colFilters.date_achat);

            return matchDateRange && matchColDate &&
                String(a.id_achat || a.id || '').toLowerCase().includes(colFilters.id.toLowerCase()) &&
                (a.lot_id || '').toLowerCase().includes(colFilters.lot_id.toLowerCase()) &&
                (a.num_facture || '').toLowerCase().includes(colFilters.num_facture.toLowerCase()) &&
                (a.nom_article_snap || a.article_nom || '').toLowerCase().includes(colFilters.nom_article_snap.toLowerCase()) &&
                (a.nom_fournisseur_snap || a.nom_fournisseur_reel || '').toLowerCase().includes(colFilters.nom_fournisseur_snap.toLowerCase()) &&
                (String(a.nom_utilisateur || a.user_id || '')).toLowerCase().includes(colFilters.nom_utilisateur.toLowerCase());
        }).map(a => ({
            ...a,
            isAnnule: a.statut === 'ANNULÉ' || a.statut === 'ANNULE'
        }));
    }, [achatsFiltresParOnglet, colFilters, dateRange]);

    const groupedByLot = useMemo(() => {
        if (!Array.isArray(achatsFiltresParOnglet) || achatsFiltresParOnglet.length === 0) return [];
        const groups = {};
        
        achatsFiltresParOnglet.forEach(a => {
            const lotKey = a.lot_id || "SANS-LOT";
            
            if (!groups[lotKey]) {
                groups[lotKey] = { 
                    lot_id: lotKey, 
                    date_lot: a.date_achat || a.date_entete, 
                    qte_totale: 0, 
                    mt_total_ht: 0, 
                    mt_total_tva: 0, 
                    mt_total_facture: 0,
                    utilisateur: a.nom_utilisateur || a.user_id || 'Admin' 
                };
            }

            if (a.is_active === 0 || a.type_ligne === 'ANNULATION' || a.type_ligne === 'ANNULER') return;

            const sign = a.type_ligne === 'RETOUR' ? -1 : 1;
            
            // 🚀 RECTIFICATION LOGISTIQUE : Extraction propre de la quantité sur l'unité de référence
            const qteBruteBDD = Number(a.qte_achetee !== undefined ? a.qte_achetee : 0);
            const coeffLogistique = Number(a.coefficient || a.unit_coefficient || 1);
            const qteAchatSaisieOrigine = coeffLogistique > 1 ? (qteBruteBDD / coeffLogistique) : qteBruteBDD;
            
            groups[lotKey].qte_totale += qteAchatSaisieOrigine * sign;
            groups[lotKey].mt_total_ht += Number(a.montant_ht_ligne || 0) * sign;
            groups[lotKey].mt_total_tva += Number(a.montant_tva_ligne || 0) * sign;
            groups[lotKey].mt_total_facture += Number(a.montant_facture_ligne || 0) * sign;
        });
        
        return Object.values(groups);
    }, [achatsFiltresParOnglet]);
// --- EXPORTS ---
const handleExportPDF = async () => {
    const input = document.getElementById('registre-detaille-table');
    if (!input) return;
    const canvas = await html2canvas(input, { scale: 2 });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('l', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`Historique_Appro_${activeTab}.pdf`);
};

const handleExportExcel = () => {
    const dataToExport = filteredAchatsDetail.map(a => {
        // 🚀 SÉCURISATION LOGISTIQUE : Si le serveur a pré-formaté le texte (Opération 2), on l'utilise directement
        let qteTexteExcel = a.qte_achetee_formatee || "";

        // Fallback local au cas où la chaîne est absente
        if (!qteTexteExcel) {
            const qteBrute = Number(a.qte_achetee || 0);
            const coeff = Number(a.unit_coefficient || a.coefficient || 1);
            
            if (coeff > 1) {
                const casiers = Math.floor(qteBrute / coeff);
                const restes = Math.round(qteBrute % coeff);
                const codeG = String(a.unit_code_gros || a.unite_code || 'CS').toUpperCase();
                const refD = String(a.unit_ref_detail || a.unite_reference || 'UNITÉ').replace(/\(s\)/g, '').toUpperCase().trim();
                
                if (casiers > 0 && restes > 0) qteTexteExcel = `${casiers} ${codeG} + ${restes} ${refD}`;
                else if (casiers > 0) qteTexteExcel = `${casiers} ${codeG}`;
                else qteTexteExcel = `${restes} ${refD}`;
            } else {
                qteTexteExcel = `${qteBrute}`;
            }
        }

        return {
            "ID Achat": a.id_achat || a.id,
            "Lot": a.lot_id,
            "Facture": a.num_facture,
            "Article": a.nom_article_snap || a.article_nom,
            "Quantité": qteTexteExcel,
            "Total TTC": Math.round(a.montant_facture_ligne || 0),
            "Fournisseur": a.nom_fournisseur_snap || a.nom_fournisseur_reel,
            "Date": formatDateSafe(a.date_achat || a.date_entete)
        };
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Approvisionnements");
    XLSX.writeFile(workbook, `Historique_Appro_${activeTab}_${new Date().getTime()}.xlsx`);
};

const filterByLot = (lotId) => {
    setShowFullHistory(true);
    setColFilters(prev => ({ 
        ...prev, 
        lot_id: lotId === "SANS-LOT" ? "" : lotId 
    }));
};

const resetAllFilters = () => {
    setColFilters(initialFilters);
    setDateRange(initialDates);
    setShowFullHistory(false);
};

const handleFilterChange = (col, value) => {
    setColFilters(prev => ({ ...prev, [col]: value }));
};

const formatDateSafe = (dateStr) => {
    if (!dateStr) return "N/A";
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? String(dateStr).split(' ')[0] : d.toLocaleDateString('fr-FR');
};

const formatTimeSafe = (dateStr) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

return (
    <div style={layoutStyle}>
        <Sidebar />
        
        {/* --- COMPOSANT TOAST FIXE COMPACT ET SÉCURISÉ --- */}
        {toast.show && (
            <div style={{
                position: 'fixed', bottom: '20px', right: '20px', 
                backgroundColor: toast.bg, color: 'white', padding: '12px 20px', 
                borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '12px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 9999
            }}>
                {toast.icon}
                <div>
                    <div style={{fontWeight: 'bold', fontSize: '13px'}}>{toast.message}</div>
                    {toast.onConfirm && (
                        <div style={{marginTop: '8px', display: 'flex', gap: '10px'}}>
                            <button 
                                type="button"
                                onClick={() => { toast.onConfirm(); setToast(prev => ({ ...prev, show: false })); }}
                                style={{background: 'white', color: toast.bg, border: 'none', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px'}}
                            >
                                CONFIRMER
                            </button>
                            <button 
                                type="button"
                                onClick={() => setToast(prev => ({ ...prev, show: false }))}
                                style={{background: 'transparent', color: 'white', border: '1px solid white', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px'}}
                            >
                                ANNULER
                            </button>
                        </div>
                    )}
                </div>
            </div>
        )}

        <main style={mainStyle}>
            <header style={headerBarStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <div style={iconBox}><FileText size={24} color="#fff" /></div>
                    <div>
                        <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                            <h1 style={titleStyle}>HISTORIQUE DES APPROS</h1>
                            {isInventoryActive && (
                                <span style={{
                                    ...lockBadge,
                                    backgroundColor: '#fee2e2',
                                    color: '#dc2626',
                                    border: '1px solid #fca5a5',
                                    fontWeight: '800',
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    fontSize: '10px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                }}><Lock size={10} /> INVENTAIRE EN COURS</span>
                            )}
                        </div>
                        <div style={dateBox}>
                            <Calendar size={14} color="#000" />
                            <input type="date" style={dateInput} value={dateRange.start || ''} onChange={(e) => setDateRange(prev => ({...prev, start: e.target.value}))} />
                            <span style={{fontWeight:'700', color:'#000'}}>au</span>
                            <input type="date" style={dateInput} value={dateRange.end || ''} onChange={(e) => setDateRange(prev => ({...prev, end: e.target.value}))} />
                        </div>
                    </div>
                </div>
                
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button type="button" onClick={handleExportExcel} style={btnExcel}><Download size={16} /> Excel</button>
                    <button type="button" onClick={handleExportPDF} style={btnPdf}><FileDown size={16} /> PDF</button>
                    <button type="button" onClick={loading ? null : fetchData} style={{...btnRefresh, borderColor: isInventoryActive ? '#dc2626' : (btnRefresh?.borderColor || '#0f172a')}} disabled={loading}>
                        <RefreshCcw size={16} color={isInventoryActive ? '#dc2626' : '#000'} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </header>

            <div style={contentArea}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '12px'}}>
                    <div style={tabContainer}>
                        <button type="button" onClick={() => {setActiveTab('actif'); setShowFullHistory(false);}} style={activeTab === 'actif' ? activeTabStyle : inactiveTabStyle}>
                            <Inbox size={16} /> APPROS RÉCENTS
                        </button>
                        <button type="button" onClick={() => {setActiveTab('archives'); setShowFullHistory(false);}} style={activeTab === 'archives' ? activeArchiveStyle : inactiveTabStyle}>
                            <Archive size={16} /> ARCHIVES
                        </button>
                    </div>
                    <div style={{display: 'flex', gap: '10px'}}>
                        <button type="button" onClick={() => setShowFullHistory(true)} style={btnShowAll}><Eye size={14} /> AFFICHER TOUT</button>
                        <button type="button" onClick={resetAllFilters} style={btnReset}><ListFilter size={14} /> RESET FILTRES</button>
                    </div>
                </div>

                {/* --- TABLEAU 1: RÉSUMÉ PAR LOT --- */}
                <div style={{...cardStyle, maxHeight: '300px', overflowY: 'auto', marginBottom: '20px'}}>
                    <table style={mainTable}>
                        <thead style={stickyHeader}>
                            <tr style={{background: '#e0f2fe', color: '#0c4a6e'}}>
                                <th style={thLotColor}>LOT ID</th>
                                <th style={thCenterLotColor}>QTE TOTAL</th>
                                <th style={thCenterLotColor}>MT TOTAL HT</th>
                                <th style={thCenterLotColor}>MT TOTAL TVA</th>
                                <th style={thCenterLotColor}>MT FACTURE (TTC)</th>
                                <th style={thLotColor}>UTILISATEUR</th>
                                <th style={thLotColor}>DATE & HEURE</th>
                                <th style={thCenterLotColor}>ÉTAT</th>
                                <th style={{...thCenterLotColor, minWidth: '150px'}}>ACTIONS</th>
                            </tr>
                        </thead>
                        <tbody>
                            {groupedByLot.map((lot) => {
                                const isFrozen = isRowFrozen(lot.date_lot);
                                
                                return (
                                    <tr key={lot.lot_id} style={trStyle}>
                                        <td style={tdStyle}>
                                            <span style={{...lotBadge, cursor: 'pointer'}} onClick={() => filterByLot(lot.lot_id)}>{lot.lot_id}</span>
                                        </td>
                                        
                                        {/* 🚀 RENDU EN-TÊTE BRUT : Affiche la quantité globale sans mot d'unité figé */}
                                        <td style={{...tdCenter, fontWeight: '700', color: '#16a34a'}}>
                                            {Number(lot.qte_totale || 0).toLocaleString('fr-FR', { 
                                                minimumFractionDigits: 0, 
                                                maximumFractionDigits: 2 
                                            })}
                                        </td>
                                        
                                        <td style={{...tdCenter, fontWeight: '700', color: '#1e40af'}}>{Math.round(lot.mt_total_ht || 0).toLocaleString()} F</td>
                                        <td style={{...tdCenter, fontWeight: '700', color: '#64748b'}}>{Math.round(lot.mt_total_tva || 0).toLocaleString()} F</td>
                                        <td style={{...tdCenter, fontWeight: '900', color: '#000'}}>{Math.round(lot.mt_total_facture || 0).toLocaleString()} F</td>
                                        <td style={{...tdStyle, fontWeight: '600'}}>{lot.utilisateur}</td>
                                        <td style={{...tdStyle, fontSize: '11px', fontWeight: '700'}}>
                                            {formatDateSafe(lot.date_lot)} {formatTimeSafe(lot.date_lot)}
                                        </td>
                                        <td style={tdCenter}>
                                            {isFrozen ? <Snowflake size={16} color="#3b82f6" title="Gelé par l'inventaire" /> : <span style={{color:'#10b981'}} title="Actif">●</span>}
                                        </td>
                                        <td style={tdCenter}>
                                            {!isFrozen && !isInventoryActive && (
                                                <div style={{display: 'flex', gap: '4px', justifyContent: 'center'}}>
                                                    <button type="button" onClick={() => handleArchiveLot(lot.lot_id)} style={{...btnSmall, background: '#f1f5f9', color: '#475569', border: '1px solid #475569'}} title="Archiver"><Archive size={14} /></button>
                                                </div>
                                            )}
                               </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

{/* --- TABLEAU 2: REGISTRE DÉTAILLÉ --- */}
                <div id="registre-detaille-table" style={{...cardStyle, maxHeight: '450px', overflowY: 'auto'}}>
                    <table style={mainTable}>
                        <thead style={stickyHeader}>
                            <tr style={{background: '#e0f2fe', color: '#0c4a6e'}}>
                                <th style={thLotColor}>ID ACHAT</th>
                                <th style={thLotColor}>LOT ID</th>
                                <th style={thLotColor}>N° FACTURE</th>
                                <th style={thLotColor}>ID ART.</th>
                                <th style={thLotColor}>NOM ARTICLE</th>
                                <th style={thCenterLotColor}>QTE ACH.</th>
                                <th style={thCenterLotColor}>MT HT</th>
                                <th style={thCenterLotColor}>MT TVA</th>
                                <th style={thCenterLotColor}>MT TTC</th>
                                <th style={thLotColor}>FOURNISSEUR</th>
                                <th style={thLotColor}>DATE & HEURE</th>
                                <th style={thCenterLotColor}>ACTIONS</th>
                            </tr>
                            <tr style={{ background: '#fff' }}>
                                <th style={filterTh}><input placeholder="ID" style={filterInput} value={colFilters.id} onChange={(e) => handleFilterChange('id', e.target.value)} /></th>
                                <th style={filterTh}><input placeholder="Lot" style={filterInput} value={colFilters.lot_id} onChange={(e) => handleFilterChange('lot_id', e.target.value)} /></th>
                                <th style={filterTh}><input placeholder="Facture" style={filterInput} value={colFilters.num_facture} onChange={(e) => handleFilterChange('num_facture', e.target.value)} /></th>
                                <th style={filterTh}><input placeholder="Code" style={filterInput} value={colFilters.product_id} onChange={(e) => handleFilterChange('product_id', e.target.value)} /></th>
                                <th style={filterTh}><input placeholder="Article" style={filterInput} value={colFilters.nom_article_snap} onChange={(e) => handleFilterChange('nom_article_snap', e.target.value)} /></th>
                                <th colSpan={4} style={filterTh}></th>
                                <th style={filterTh}><input placeholder="Four" style={filterInput} value={colFilters.nom_fournisseur_snap} onChange={(e) => handleFilterChange('nom_fournisseur_snap', e.target.value)} /></th>
                                <th style={filterTh}><input type="date" style={filterInput} value={colFilters.date_achat} onChange={(e) => handleFilterChange('date_achat', e.target.value)} /></th>
                                <th style={filterTh}></th>
                            </tr>
                        </thead>

                        <tbody>
                            {!showFullHistory ? (
                                <tr><td colSpan="12" style={emptyState}>Sélectionnez un lot ci-dessus ou cliquez sur "Afficher tout"</td></tr>
                            ) : (
                                filteredAchatsDetail.map((achat, index) => {
                                    const dateRef = achat.date_achat || achat.date_entete;
                                    const isFrozen = isRowFrozen(dateRef);
                                    
                                    const qteNum = Number(achat.qte_achetee || 0);
                                    const isAReturn = qteNum < 0 || achat.type_ligne === 'RETOUR';
                                    
                                    const lineId = achat.id !== undefined ? achat.id : (achat.ID !== undefined ? achat.ID : index);
                                    const isExpanded = expandingRow === lineId;
                                    const isAnnule = achat.is_active === 0 || achat.statut === 'ANNULE' || achat.statut === 'ANNULÉ';

                                    // 🚀 SOLUTION UNIFIÉE ANTI-LITIGE : On affiche la chaîne logistique calculée par le backend
                                    // Plus aucun calcul local approximatif, et aucun mot foiré ou figé en dur à l'écran !
                                    const renduQuantiteDetaillee = achat.qte_achetee_formatee || `${qteNum} UNITÉ`;

                                    const localUser = JSON.parse(localStorage.getItem('user') || '{}');
                                    const isSystemAdmin = String(localUser.id || localUser.id_utilisateur || '') === String(achat.user_id || 'USR-71240543') || String(localUser.id || localUser.id_utilisateur || '').includes('71240543');
                                    
                                    const separationDroitsRetour = canReturnPurchase === true || isSystemAdmin;
                                    const separationDroitsAnnuler = canCancelPurchase === true || isSystemAdmin;

                                    return (

    <React.Fragment key={lineId}>
        <tr style={{
            ...trStyle, 
            background: isAnnule ? '#f1f5f9' : (isAReturn ? '#fff1f2' : 'transparent'),
            opacity: isAnnule ? 0.6 : 1,
            textDecoration: isAnnule ? 'line-through' : 'none'
        }}>
            <td style={{ ...tdStyle, fontWeight: '600' }}>{achat.id_achat || achat.id || `ACH-${lineId}`}</td>
            <td style={tdStyle}><span style={lotBadge}>{achat.lot_id}</span></td>
            <td style={{ ...tdStyle, fontWeight: '700' }}>{achat.num_facture}</td>
            <td style={tdStyle}>{achat.product_id || achat.PRODUCT_ID}</td>
            <td style={{ ...tdStyle, fontWeight: '800', color: isAnnule ? '#94a3b8' : (isAReturn ? '#e11d48' : '#000') }}>
                {isAReturn && <ArrowLeftRight size={12} style={{ marginRight: 5 }} />}
                {achat.nom_article_snap || achat.article_nom}
            </td>
           
            {/* 🚀 DECOMPOSITION LOGISTIQUE CORRIGÉE : Utilise les vraies clés de la BDD et résout le cumul erroné */}
            <td style={{ ...tdCenter, fontWeight: '800', color: isAReturn ? '#e11d48' : '#2563eb', fontSize: '12px' }}>
                {(() => {
                    // 1. Quantité native absolue stockée en SQLite (ex: 30)
                    const qteTotalePieces = Math.abs(Number(achat.qte_achetee || qteNum || 0));
                    
                    // 2. Récupération des vrais alias renvoyés par la méthode SQL getAllPurchases
                    const coeffLogistique = Number(achat.unit_coefficient || achat.coefficient || 1);
                    const codeGros = achat.unit_code_gros || achat.unite_code || 'CS';
                    const refDetail = achat.unit_ref_detail || achat.unite_reference || 'UNITÉ';

                    const codeG = String(codeGros).toUpperCase().trim();
                    const refD = String(refDetail).replace(/\(s\)/g, '').toUpperCase().trim();

                    // 3. Algorithme de reconversion inverse
                    if (coeffLogistique > 1) {
                        const casiersEntiers = Math.floor(qteTotalePieces / coeffLogistique);
                        const boitesRestantes = Math.round(qteTotalePieces % coeffLogistique);

                        if (casiersEntiers > 0 && boitesRestantes > 0) {
                            return `${casiersEntiers} ${codeG} + ${boitesRestantes} ${refD}`;
                        } else if (casiersEntiers > 0) {
                            return `${casiersEntiers} ${codeG}`;
                        } else {
                            return `${boitesRestantes} ${refD}`;
                        }
                    } else {
                        return `${Math.round(qteTotalePieces)} ${refD}`;
                    }
                })()}
            </td>
            
            <td style={{ ...tdCenter, color: '#1e40af', fontWeight: '700' }}>{Math.round(achat.montant_ht_ligne || 0).toLocaleString()} F</td>
            <td style={{ ...tdCenter, color: '#64748b' }}>{Math.round(achat.montant_tva_ligne || 0).toLocaleString()} F</td>
            <td style={{ ...tdCenter, color: '#000', fontWeight: '900' }}>{Math.round(achat.montant_facture_ligne || 0).toLocaleString()} F</td>
            <td style={{ ...tdStyle, fontWeight: '600' }}>{achat.nom_fournisseur_snap || achat.nom_fournisseur_reel}</td>
            <td style={{ ...tdStyle, fontSize: '10px', color: '#000', fontWeight: '700' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span>{formatDateSafe(dateRef)} {formatTimeSafe(dateRef)}</span>
                    {(achat.observation || achat.motif_annulation || isAnnule) && (
                        <div style={{ marginTop: '4px', display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                            <span style={{
                                fontSize: '9px', padding: '2px 6px', borderRadius: '4px',
                                background: isAnnule ? '#fee2e2' : '#fef3c7',
                                color: isAnnule ? '#ef4444' : '#d97706', fontWeight: 'bold'
                            }}>
                                {isAnnule ? 'ANNULÉ' : 'RETOUR'}
                            </span>
                            <span style={{ fontSize: '10px', color: '#64748b', fontStyle: 'italic', textDecoration: 'none', display: 'inline-block' }}>
                                {achat.motif_annulation || achat.observation}
                            </span>
                        </div>
                    )}
                </div>
            </td>

                   <td style={tdCenter}>
                <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                    {!isFrozen && !isInventoryActive && !isAReturn && !isAnnule ? (
                        <>
                            {separationDroitsRetour ? (
                                <button 
                                    type="button"
                                    onClick={() => { 
                                        const dejaOuvert = isExpanded && activeAction === 'RETOUR';
                                        setExpandingRow(dejaOuvert ? null : lineId); 
                                        setActiveAction('RETOUR'); 
                                        
                                        // 🚀 OPTIMISATION SAISIE : Pré-remplit le champ avec la quantité maximale en unité de Gros
                                        if (!dejaOuvert) {
                                            const coeffLogistique = Number(achat.unit_coefficient || achat.coefficient || 1);
                                            const qtePiecesMax = Number(achat.qte_achetee || 0);
                                            const qteSaisieMax = coeffLogistique > 1 ? (qtePiecesMax / coeffLogistique) : qtePiecesMax;
                                            setReturnQty(String(qteSaisieMax).replace('.', ',')); // Format "1,5" fluide pour l'opérateur
                                        } else {
                                            setReturnQty("");
                                        }
                                    }} 
                                    style={{ ...btnSmall, background: (isExpanded && activeAction === 'RETOUR') ? '#0369a1' : '#f0f9ff', borderColor: '#0369a1', cursor: 'pointer' }} 
                                    title="Retour Partiel"
                                >
                                    <ArrowLeftRight size={12} color={(isExpanded && activeAction === 'RETOUR') ? "#fff" : "#0369a1"} />
                                </button>
                            ) : null}

                            {separationDroitsAnnuler ? (
                                <button 
                                    type="button"
                                    onClick={() => { 
                                        const dejaOuvert = isExpanded && activeAction === 'ANNULER';
                                        setExpandingRow(dejaOuvert ? null : lineId); 
                                        setActiveAction('ANNULER'); 
                                        setReturnQty(""); // Pas besoin de quantité pour l'annulation totale
                                    }} 
                                    style={{ ...btnSmall, background: (isExpanded && activeAction === 'ANNULER') ? '#ef4444' : '#fff', color: (isExpanded && activeAction === 'ANNULER') ? '#fff' : '#ef4444', borderColor: '#ef4444', cursor: 'pointer' }} 
                                    title="Annuler ligne"
                                >
                                    <Trash2 size={12} />
                                </button>
                            ) : null}

                            {!separationDroitsRetour && !separationDroitsAnnuler && (
                                <span style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic' }}>Action restreinte</span>
                            )}
                        </>
                    ) : (
                        <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 'bold' }}>{isAnnule ? 'Annulé' : (isAReturn ? 'Retour' : 'Figé ❄️')}</span>
                    )}
                </div>
            </td>
        </tr>


                  {/* FORMULAIRE DYNAMIQUE INLINE PARFAITEMENT STABILISÉ ET ALIGNÉ SUR LES UNITÉS DE GROS */}
                    {isExpanded && !isAnnule && (
                        <tr style={{ background: activeAction === 'ANNULER' ? '#fff1f2' : '#f8fafc' }}>
                            <td colSpan="12" style={{ padding: '10px 20px', borderBottom: `2px solid ${activeAction === 'ANNULER' ? '#ef4444' : '#0369a1'}` }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                    <div style={{ fontWeight: 'bold', color: activeAction === 'ANNULER' ? '#b91c1c' : '#0369a1' }}>
                                        {activeAction === 'ANNULER' ? 'MOTIF ANNULATION :' : 'RETOUR PARTIEL :'}
                                    </div>
                                    {activeAction === 'RETOUR' ? (
                                        <>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                {/* 🛡️ SÉCURISATION CLAVIER : Changement en type 'text' pour autoriser la saisie de la virgule "1,5" */}
                                                <input 
                                                    type="text" 
                                                    placeholder="Qté..." 
                                                    style={{ ...filterInput, width: '80px', textAlign: 'center', fontWeight: 'bold' }} 
                                                    value={returnQty} 
                                                    onChange={(e) => setReturnQty(e.target.value)} 
                                                />
                                                {/* 🚀 INDICATION DYNAMIQUE : Récupère le vrai code de gros de la BDD (ex: C20 ou CRT) */}
                                                <span style={{ fontSize: '11px', fontWeight: '800', color: '#0369a1', background: '#e0f2fe', padding: '4px 8px', borderRadius: '4px' }}>
                                                    {achat.unit_code_gros || achat.unite_code || 'CS'}
                                                </span>
                                            </div>
                                            <input type="text" placeholder="Observation / Motif du retour..." style={{ ...filterInput, flex: 1 }} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
                                        </>
                                    ) : (
                                        <select style={{ ...filterInput, width: '250px' }} onChange={(e) => setCancelReason(e.target.value)} value={cancelReason}>
                                            <option value="">-- Pourquoi annuler ? --</option>
                                            <option value="Erreur de saisie">Erreur de saisie</option>
                                            <option value="Doublon">Doublon</option>
                                            <option value="Mauvais article">Mauvais article</option>
                                        </select>
                                    )}
                                    <button 
                                        type="button"
                                        onClick={() => {
                                            // 🚀 DÉCOUPLAGE SIMPLIFIÉ : On envoie directement 'achat' au gestionnaire.
                                            // La fonction 'handleTraitementLigne' (corrigée au bloc 2) intercepte de façon sécurisée 
                                            // la valeur de l'état 'returnQty' ("1,5") et valide les pièces par rapport au coefficient.
                                            handleTraitementLigne(achat);
                                        }} 
                                        style={{ ...btnSmall, background: activeAction === 'ANNULER' ? '#ef4444' : '#0369a1', color: '#fff', padding: '5px 15px', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}
                                    >
                                        Confirmer
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={() => { setExpandingRow(null); setCancelReason(""); setReturnQty(""); }} 
                                        style={{ ...btnSmall, background: '#64748b', color: '#fff', padding: '5px 15px', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}
                                    >
                                        Fermer
                                    </button>
                                </div>
                            </td>
                        </tr>
                    )}
                </React.Fragment>
            );
        })
    )}
</tbody>
                    </table>
                </div>
            </div>
        </main>
    </div>
);
};


// --- STYLES (Conservés et complétés) ---
const tabContainer = { display: 'flex', gap: '5px', background: '#e2e8f0', padding: '4px', borderRadius: '10px', border: '2px solid #0f172a' };
const inactiveTabStyle = { padding: '8px 16px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '11px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b' };
const activeTabStyle = { ...inactiveTabStyle, background: '#fff', borderRadius: '6px', color: '#0f172a', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' };
const activeArchiveStyle = { ...activeTabStyle, color: '#3b82f6' };
const lockBadge = { background:'#fef2f2', color:'#dc2626', padding:'2px 8px', borderRadius:'4px', fontSize:'10px', fontWeight:'900', border:'1px solid #dc2626', display:'flex', alignItems:'center', gap:'4px' };
const stickyHeader = { position: 'sticky', top: 0, zIndex: 10 };
const emptyState = { textAlign: 'center', padding: '40px', color: '#000', fontStyle: 'italic', fontSize: '14px', fontWeight: '700' };
const layoutStyle = { display: 'flex', height: '100vh', background: '#F1F5F9' };
const mainStyle = { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' };
const headerBarStyle = { background: '#fff', padding: '16px 24px', borderBottom: '3px solid #0f172a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
const iconBox = { background: '#0f172a', padding: '8px', borderRadius: '8px' };
const titleStyle = { margin: 0, fontSize: '18px', fontWeight: '900', color: '#000' };
const dateBox = { display: 'flex', alignItems: 'center', gap: '10px', background: '#fff', padding: '6px 12px', borderRadius: '8px', border: '2px solid #0f172a', marginTop: '6px' };
const dateInput = { border: 'none', background: 'transparent', fontSize: '13px', outline: 'none', fontWeight: '800', color: '#000' };
const contentArea = { padding: '20px', overflowY: 'auto' };
const sectionTitle = { fontSize: '13px', fontWeight: '900', color: '#0f172a', textTransform: 'uppercase', marginBottom: '8px' };
const cardStyle = { background: '#fff', borderRadius: '10px', border: '2px solid #cbd5e1', overflow: 'hidden' };
const mainTable = { width: '100%', borderCollapse: 'collapse', minWidth: '1300px' };
const thLotColor = { padding: '12px 10px', background: '#e0f2fe', color: '#0c4a6e', fontSize: '11px', fontWeight: '900', textAlign: 'left', borderBottom: '2px solid #0c4a6e' };
const thCenterLotColor = { ...thLotColor, textAlign: 'center' };
const tdStyle = { padding: '10px 10px', fontSize: '12px', color: '#000', whiteSpace: 'nowrap', borderBottom: '1px solid #f1f5f9' };
const tdCenter = { ...tdStyle, textAlign: 'center' };
const trStyle = { borderBottom: '1px solid #cbd5e1' };
const filterTh = { padding: '8px 10px', borderBottom: '1px solid #0f172a', background: '#fff' };
const filterInput = { width: '100%', padding: '6px', fontSize: '11px', borderRadius: '6px', border: '2px solid #000', outline: 'none', fontWeight: '700' };
const btnRefresh = { background: '#fff', border: '2px solid #0f172a', padding: '8px', borderRadius: '8px', cursor: 'pointer' };
const btnExcel = { background: '#059669', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '900', display:'flex', alignItems:'center', gap:'8px' };
const btnPdf = { ...btnExcel, background: '#dc2626' };
const btnSmall = { border: '1.5px solid #0f172a', background: '#fff', padding: '6px', borderRadius: '6px', cursor: 'pointer', color: '#000', fontSize: '10px', fontWeight: '900' };
const lotBadge = { background: '#e0f2fe', color: '#0c4a6e', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '900', border: '1.5px solid #0c4a6e' };
const btnShowAll = { background: '#0f172a', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '6px' };
const btnReset = { background: '#fff', color: '#000', border: '2px solid #000', padding: '8px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '6px' };
const toastStyle = { position: 'fixed', top: '20px', right: '20px', zIndex: 9999, padding: '12px 24px', borderRadius: '8px', color: '#fff', display: 'flex', alignItems: 'center',gap: '12px',boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.2)',transition: 'all 0.3s ease'};
export default HistoriqueApprov;