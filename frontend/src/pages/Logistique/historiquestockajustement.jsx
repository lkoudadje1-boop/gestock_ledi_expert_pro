import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'; 
import { 
    ClipboardList, RefreshCcw, Download, Calendar, 
    ListFilter, Eye, CheckCircle, Clock, Search, 
    Archive, Package, Printer, ArrowRightLeft, FileText, Trash2, XCircle
} from 'lucide-react';
import { useReactToPrint } from 'react-to-print';

import API from '../../services/api';
import Sidebar from '../../components/Sidebar';
import { exportToExcel } from '../../utils/excelHelper';

// 🚀 SERVICE LOGISTIQUE UNIQUE POUR L'EXPRESSION TEXTUELLE DES PHANTOMS DE STOCKS
import { ConversionStockService } from '../../utils/converisonstock'; 

// 🖨️ IMPORT DU TEMPLATE DE RENDU PAPIER SÉPARÉ
import StockAjustementPrint from './stockajustementprint';


// --- FORMATEUR FINANCIER GLOBAL DU LOGICIEL ---
const fmt = (valeur) => {
    if (valeur === undefined || valeur === null || isNaN(valeur)) return "0";
    return new Intl.NumberFormat('fr-FR', {
        style: 'decimal',
        minimumFractionDigits: 0
    }).format(valeur);
};

const HistoriqueStockAjustement = () => {
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    const COMPANY_ID = currentUser.company_id || currentUser.companyId || 'CPY-1';

    // --- ÉTATS (STATES) ---
    const [ajustements, setAjustements] = useState([]); 
    const [details, setDetails] = useState([]);   
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false); // 🎯 FOCUS : Évite le double-clic sur les annulations en production
    const [selectedAjustementId, setSelectedAjustementId] = useState(null);
    const [activeTab, setActiveTab] = useState('tous'); // 'tous', 'AVARIE', 'BRISE', 'TRANSFERT'

    // 🔒 VERROU LOGISTIQUE D'INVENTAIRE ET SYSTÈME DE TOAST INTELLIGENT
    const [isInventoryLocked, setIsInventoryLocked] = useState(false);
    const [toast, setToast] = useState(null); 
    // Structure du toast : { message: '', type: 'success'|'error'|'confirm', onConfirm: fn, timeoutId: id }

    // --- FILTRES DE RECHERCHE ---
    const [searchTerm, setSearchTerm] = useState('');
    const [dateRange, setDateRange] = useState({ start: '', end: '' });

    // --- CONFIGURATION TECHNIQUE D'IMPRESSION COMPTABLE ---
    const printRef = useRef(); 
    const [printData, setPrintData] = useState(null); 
    const [formatImpression, setFormatImpression] = useState('A4'); 
    const [dynamiqueCompanyPrint, setDynamiqueCompanyPrint] = useState({
        name: currentUser.company_name || currentUser.companyName || "LEDI EXPERT PRO",
        address: currentUser.company_address || currentUser.companyAddress || "Adresse non renseignée",
        phone: currentUser.company_phone || currentUser.companyPhone || "Tél: N/A",
        email: currentUser.company_email || currentUser.companyEmail || "Email: N/A",
        logo_data: currentUser.company_logo || currentUser.logo_data || currentUser.logo || null
    });

    // --- DISPATCHER DE TOAST APPLICATIF (Simple notification ou Boîte de confirmation) ---
    const afficherToast = useCallback((message, type = 'success', onConfirm = null) => {
        // Nettoyer le timeout précédent si existant
        setToast(prev => {
            if (prev?.timeoutId) clearTimeout(prev.timeoutId);
            return null;
        });

        let tId = null;
        // Si c'est un toast d'information (success/error), il s'efface tout seul après 4s
        if (type !== 'confirm') {
            tId = setTimeout(() => setToast(null), 4000);
        }

        setToast({ message, type, onConfirm, timeoutId: tId });
    }, []);

    // --- VÉRIFICATEUR COMPTABLE DU STATUT DE L'INVENTAIRE ---
    const verifierInventaire = useCallback(async () => {
        try {
            const res = await API.get('/inventories/check-status'); 
            if (res.data && res.data.en_cours) {
                setIsInventoryLocked(true);
                afficherToast("⚠️ Un inventaire général est en cours. Les actions d'annulation sont bloquées.", "error");
            } else {
                setIsInventoryLocked(false);
            }
        } catch (err) { 
            console.error("Erreur check inventaire historique:", err); 
        }
    }, [afficherToast]);

    // --- GESTIONNAIRE D'IMPRESSION SANS DÉCALAGE ---
    const handlePrintTrigger = useReactToPrint({
        content: () => printRef.current,
        documentTitle: `Ajustement_Stock_${printData?.id || 'Rapport'}`,
        onBeforeGetContent: () => {
            return new Promise((resolve) => {
                console.log("🖨️ [REACT-TO-PRINT] Hydratation des lignes du bordereau d'ajustement...");
                setTimeout(() => resolve(), 350);
            });
        },
        onAfterPrint: () => {
            console.log("✅ Fenêtre d'impression de l'ajustement fermée.");
        }
    });

    // --- MISE EN CORRESPONDANCE TEXTUELLE DES COMPTAGES MAGASIN ---
    const formaterStockPOS = useCallback((valeurStock, itemContexte) => {
        if (valeurStock === undefined || valeurStock === null || valeurStock === '') return "—";
        return ConversionStockService.toExpressionTextuelle(valeurStock, itemContexte);
    }, []);

    // --- CHARGEMENT DES COORDONNÉES DE LA SOCIÉTÉ ---
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

    // --- 🚀 CHARGEMENT COMPTABLE DES FLUX SECURE ALIGNÉ SUR LE ROUTEUR EXPRESS ---
    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const resAjustements = await API.get(`/stock-adjustments/history?companyId=${COMPANY_ID}`);
            const masterData = resAjustements.data.success ? resAjustements.data.data : (Array.isArray(resAjustements.data) ? resAjustements.data : []);
            setAjustements(masterData);

            if (selectedAjustementId) {
                const resDetails = await API.get(`/stock-adjustments/details/${selectedAjustementId}?companyId=${COMPANY_ID}`);
                const linesData = resDetails.data.success ? resDetails.data.data : (Array.isArray(resDetails.data) ? resDetails.data : []);
                setDetails(linesData);
            }
        } catch (err) {
            console.error("❌ Erreur chargement historique ajustements:", err);
        } finally {
            setLoading(false);
        }
    }, [COMPANY_ID, selectedAjustementId]);

    // Au premier démarrage
    useEffect(() => {
        fetchData();
        verifierInventaire();
    }, [COMPANY_ID, verifierInventaire]);

    // ==========================================
    // ⚡ LOGIQUE DE SYNCHRONISATION EN TEMPS RÉEL (SYNC)
    // ==========================================
    useEffect(() => {
        const rafraichirHistorique = () => {
            fetchData();
            verifierInventaire();
        };

        window.addEventListener('ERP_DATA_CHANGED', rafraichirHistorique);
        return () => {
            window.removeEventListener('ERP_DATA_CHANGED', rafraichirHistorique);
        };
    }, [fetchData, verifierInventaire]);

        // ==========================================
    // ⚙️ GESTIONNAIRES D'ACTIONS ET RECHERCHES ASYNCHRONES
    // ==========================================
    
    // Chargement ciblé des lignes enfants au clic sur un en-tête d'ajustement
    const handleSelectAjustement = async (id) => {
        setSelectedAjustementId(id);
        try {
            // 🎯 APPEL ROUTE EXPRESS DÉDIÉE : router.get('/details/:id')
            const resDetails = await API.get(`/stock-adjustments/details/${id}?companyId=${COMPANY_ID}`);
            const linesData = resDetails.data.success ? resDetails.data.data : (Array.isArray(resDetails.data) ? resDetails.data : []);
            setDetails(linesData);
        } catch (err) {
            console.error(`❌ Échec de chargement des détails pour l'ajustement ${id}:`, err);
        }
    };

    // 🛑 1. DECLENCHEUR DU TOAST INTERACTIF DE SÉCURITÉ (ANNULATION GLOBALE)
    const handleTriggerCancelGlobal = (id) => {
        if (isInventoryLocked) {
            afficherToast("Opération impossible : Les mouvements de stocks sont gelés durant l'inventaire.", "error");
            return;
        }
        afficherToast(
            "Êtes-vous sûr de vouloir annuler l'intégralité de ce bon d'ajustement ? Les stocks seront réajustés.",
            "confirm",
            () => executeCancelAjustementGlobal(id)
        );
    };

    // 🛑 1.B EXECUTION TECHNIQUE DE L'ANNULATION COMPTABLE GLOBALE CORRIGÉE
    const executeCancelAjustementGlobal = async (id) => {
        if (actionLoading) return;
        setActionLoading(true);
        setToast(null); // Ferme le toast de confirmation à l'exécution

        try {
            const res = await API.put(`/stock-adjustments/cancel/${id}`, { companyId: COMPANY_ID });
            if (res.data.success) {
                afficherToast("Le bon d'ajustement a été annulé avec succès.", "success");
                await fetchData(); 
            } else {
                afficherToast(res.data.message || "Erreur lors de l'annulation globale.", "error");
            }
        } catch (err) {
            console.error("Erreur annulation bon d'ajustement:", err);
            
            // 🚀 EXTRACTION DU VERROU ANTI-LITIGE GLOBAL
            const messageServeur = err.response?.data?.error || err.response?.data?.message;
            if (messageServeur) {
                afficherToast(messageServeur, "error");
            } else {
                afficherToast("Impossible de joindre le serveur pour traiter l'annulation.", "error");
            }
        } finally {
            setActionLoading(false);
        }
    };

    // ❌ 2. DECLENCHEUR DU TOAST INTERACTIF DE SÉCURITÉ (ANNULATION UNITAIRE DE LIGNE)
    const handleTriggerCancelLigne = (ligneId, ajustementId) => {
        if (isInventoryLocked) {
            afficherToast("Opération impossible : Les mouvements de stocks sont gelés durant l'inventaire.", "error");
            return;
        }
        afficherToast(
            "Voulez-vous annuler uniquement cet article ? Son stock initial sera restauré.",
            "confirm",
            () => executeCancelLigneAjustement(ligneId, ajustementId)
        );
    };

    // ❌ 2.B EXECUTION TECHNIQUE DE L'ANNULATION UNITAIRE DE LIGNE CORRIGÉE
    const executeCancelLigneAjustement = async (ligneId, ajustementId) => {
        if (actionLoading) return;
        setActionLoading(true);
        setToast(null); // Ferme le toast de confirmation à l'exécution

        try {
            const res = await API.put(`/stock-adjustments/cancel/${ajustementId}/items/${ligneId}`, { 
                companyId: COMPANY_ID 
            });

            if (res.data.success) {
                afficherToast("L'article a été retiré et son stock initial réajusté avec succès.", "success");
                await fetchData();
            } else {
                afficherToast(res.data.message || "Erreur lors de l'annulation de la ligne.", "error");
            }
        } catch (err) {
            console.error("Erreur annulation ligne d'ajustement:", err);
            
            // 🚀 EXTRACTION DU VERROU ANTI-LITIGE DE LIGNE
            const messageServeur = err.response?.data?.error || err.response?.data?.message;
            if (messageServeur) {
                afficherToast(messageServeur, "error");
            } else {
                afficherToast("Erreur réseau lors de la suppression de l'article.", "error");
            }
        } finally {
            setActionLoading(false);
        }
    };


    // Action d'impression à la volée depuis la grille des historiques
    const handleActionImprimerSession = async (ajustement, formatCible = 'A4') => {
        if (!ajustement) return;
        setFormatImpression(formatCible);

        try {
            // Récupération de sécurité des lignes de cet ajustement précis
            const resDetails = await API.get(`/stock-adjustments/details/${ajustement.id}?companyId=${COMPANY_ID}`);
            const linesData = resDetails.data.success ? resDetails.data.data : (Array.isArray(resDetails.data) ? resDetails.data : []);
            
            // Formatage des lignes à chaud pour l'imprimante
            const articlesAssocies = linesData.map(d => {
                // Focus : Détecte si la ligne individuelle ou la session parente est annulée
                const estLigneAnnulée = d.is_line_cancelled === 1 || String(d.unite_snap || '').toUpperCase().includes('(ANNULÉ)');
                const estSessionAnnulée = ajustement.statut === 'ANNULE';

                return {
                    ...d,
                    stock_theorique_net: formaterStockPOS(d.stock_avant, d),
                    stock_reel_net: formaterStockPOS(d.stock_apres, d),
                    // Indication propre pour le document imprimé
                    ecart_net: estLigneAnnulée ? "Ligne Annulée" : (estSessionAnnulée ? "Session Annulée" : `-${formaterStockPOS(d.quantite, d)}`), 
                    valeur_ecart_net: estLigneAnnulée || estSessionAnnulée ? 0 : Math.round(Number(d.valeur_ligne || d.montant || 0))
                };
            });

            setPrintData({
                ...ajustement,
                items: articlesAssocies
            });
            
            // Laisse le temps au DOM de s'hydrater avant de lever la boîte de dialogue d'impression
            setTimeout(() => {
                handlePrintTrigger();
            }, 250);
        } catch (err) {
            console.error("❌ Erreur lors de la préparation de l'impression :", err);
        }
    };

    const réinitialiserFiltres = () => {
        setSearchTerm('');
        setSelectedAjustementId(null);
        setDetails([]);
        setDateRange({ start: '', end: '' });
    };

       // ==========================================
    // 🔍 ENGINS DE FILTRAGE DES DONNÉES FINANCIÈRES
    // ==========================================
    
    // Filtrage des en-têtes parents (Ajustements généraux)
    const ajustementsFiltrés = useMemo(() => {
        return ajustements.filter(aj => {
            // Onglet actif (AVARIE, BRISE, TRANSFERT ou tous)
            if (activeTab !== 'tous' && aj.type_ajustement !== activeTab) return false;

            // Plage de dates
            if (dateRange.start || dateRange.end) {
                const dateAj = aj.created_at ? aj.created_at.split('T')[0] : '';
                if (dateRange.start && dateAj < dateRange.start) return false;
                if (dateRange.end && dateAj > dateRange.end) return false;
            }

            // Moteur de recherche textuel
            const txt = searchTerm.trim().toLowerCase();
            if (!txt) return true;

            return (aj.id || '').toLowerCase().includes(txt) ||
                   (aj.libelle || '').toLowerCase().includes(txt) ||
                   (aj.motif || '').toLowerCase().includes(txt) ||
                   (aj.statut || '').toLowerCase().includes(txt); // 🎯 FOCUS : Permet de filtrer par le mot clé "ANNULE" dans la barre de recherche
        });
    }, [ajustements, activeTab, dateRange, searchTerm]);

    // Filtrage et enrichment à la volée des lignes d'articles sélectionnées
    // =========================================================================
    // 🎯 FIX DE CONFORMITÉ COMPTABLE : AFFICHAGE COMPACT ET STRICT DES COLONNES BRUTES
    // =========================================================================
    const detailsFiltres = useMemo(() => {
        // On récupère le statut global de la session sélectionnée actuellement
        const sessionParente = ajustements.find(a => a.id === selectedAjustementId);
        const estSessionAnnulée = sessionParente?.statut === 'ANNULE';

        return details.map(d => {
            // Lecture stricte des expressions textuelles de stocks avant/après
            const txtAvant = d.stock_theorique_formate || (d.stock_avant !== undefined ? `${d.stock_avant}` : '—');
            const txtApres = d.stock_reel_formate || (d.stock_apres !== undefined ? `${d.stock_apres}` : '—');

            // 🚀 FOCUS ANNULATION LIGNE : Détecte l'état individuel ET l'état global du document parent
            const estLigneAnnulée = estSessionAnnulée || d.is_line_cancelled === 1 || String(d.unite_snap || '').toUpperCase().includes('(ANNULÉ)');

            const expressionSortieBrute = d.unite_snap ? String(d.unite_snap).toUpperCase() : `${d.quantite || 0} PCS`;

            return {
                ...d,
                is_line_cancelled: estLigneAnnulée ? 1 : 0, // Uniformisation de l'indicateur
                stock_theorique_net: txtAvant,
                stock_reel_net: estLigneAnnulée ? txtAvant : txtApres, // Si annulé, le stock réel redevient le stock théorique de départ
                
                // C'est cette variable qui alimente la cellule <span style={{...}}>{d.ecart_net}</span>
                ecart_net: estLigneAnnulée ? (estSessionAnnulée ? "SESSION ANNULÉE" : "ANNULÉ") : `-${expressionSortieBrute}`,
                
                // 🚀 FIX MONTANT SANS SUR-CALCUL : Forcé à 0 si la ligne ou la session est détruite comptablement
                valeur_ecart_net: estLigneAnnulée ? 0 : Number(d.valeur_ligne !== undefined ? d.valeur_ligne : (d.montant || 0))
            };
        });
    }, [details, selectedAjustementId, ajustements]);


    // --- COMPTEURS COMPTABLES D'ONGLETS ---
    const countAvaries = useMemo(() => ajustements.filter(a => a.type_ajustement === 'AVARIE').length, [ajustements]);
    const countBrises = useMemo(() => ajustements.filter(a => a.type_ajustement === 'BRISE').length, [ajustements]);
    const countTransferts = useMemo(() => ajustements.filter(a => a.type_ajustement === 'TRANSFERT').length, [ajustements]);
    
    // ==========================================
    // 📑 EXPORTATION DES FLUX COMPTABLES EXCEL
    // ==========================================
    const handleExportExcel = () => {
        const dataToExport = selectedAjustementId
            ? detailsFiltres.map(d => ({
                'ARTICLE / DESIGNATION': d.nom_article_snap || d.nom_article,
                'STOCK AVANT': d.stock_theorique_net,
                'STOCK APRÈS': d.stock_reel_net,
                'QUANTITÉ RETIRÉE': d.ecart_net,
                'VALEUR FINANCIÈRE DE LA PERTE': d.is_line_cancelled ? '0 F (Annulé)' : `${d.valeur_ecart_net} F`,
                'RÉFÉRENCE DE L\'OPÉRATION': `ADJ-${d.adjustment_id}`
            }))
            : ajustementsFiltrés.map(aj => ({
                'RÉFÉRENCE SÉCURISÉE': aj.id,
                'LIBELLÉ OPÉRATION': aj.libelle,
                'TYPE LOGISTIQUE': aj.type_ajustement,
                'STATUT COMPTABLE': aj.statut === 'ANNULE' ? 'ANNULÉ / RECRÉDITÉ' : aj.statut,
                'MOTIF D\'AUDIT': aj.motif || 'Non renseigné',
                'VALEUR GLOBALE DU PREJUDICE': aj.statut === 'ANNULE' ? '0 F' : `${Math.round(Number(aj.valeur_totale || 0))} F`,
                'DATE ENREGISTREMENT': aj.created_at ? new Date(aj.created_at).toLocaleString('fr-FR') : ''
            }));
        
        exportToExcel(dataToExport, `Historique_Ajustements_Stock_${activeTab}_${new Date().toLocaleDateString()}`);
    };

   return (
        <div style={layoutStyle}>
            <Sidebar activeMenu="logistique" />
            
            <main style={mainStyle}>
                {/* 🔒 ALERTE INVENTAIRE COMPTABLE */}
                {isInventoryLocked && (
                    <div style={{
                        background: '#EF4444',
                        color: '#FFFFFF',
                        padding: '10px 24px',
                        fontSize: '13px',
                        fontWeight: '800',
                        textAlign: 'center',
                        display: 'flex',
                        alignItems: 'center',
                        justify: 'center',
                        gap: '10px',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                    }}>
                        <span>⚠️</span> MOUVEMENTS DE STOCKS GELÉS : UN INVENTAIRE GÉNÉRAL EST EN COURS. LES ACTIONS D'ANNULATION SONT BLOQUÉES.
                    </div>
                )}

                {/* 🖨️ BLOC TECHNIQUE PERMANENT MASQUÉ D'EDITION PAPIER INCORPORÉ */}
                <div style={{ display: 'none' }}>
                    <StockAjustementPrint
                        ref={printRef}
                        ajustement={printData || {}} 
                        company={dynamiqueCompanyPrint}
                        format={formatImpression}
                    />
                </div>

                {/* HEADER DE LA PAGE */}
                <header style={headerBarStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div style={iconBox}><ClipboardList size={24} color="#fff" /></div>
                        <div>
                            <h1 style={titleStyle}>HISTORIQUE DES AJUSTEMENTS</h1>
                            <div style={dateBox}>
                                <Calendar size={14} color="#DC2626" />
                                <input 
                                    type="date" 
                                    style={dateInput} 
                                    value={dateRange.start} 
                                    onChange={(e) => setDateRange({...dateRange, start: e.target.value})} 
                                />
                                <span style={{ fontWeight: '900', color: '#DC2626' }}>au</span>
                                <input 
                                    type="date" 
                                    style={dateInput} 
                                    value={dateRange.end} 
                                    onChange={(e) => setDateRange({...dateRange, end: e.target.value})} 
                                />
                            </div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={handleExportExcel} style={btnExcel}><Download size={16} /> Export Excel</button>
                        <button onClick={fetchData} style={btnRefresh} disabled={loading || actionLoading}>
                            <RefreshCcw size={16} className={loading ? 'animate-spin' : ''} />
                        </button>
                    </div>
                </header>

                {/* ZONE DE FILTRAGE PAR RECHERCHE TEXTUELLE */}
                <div style={{ background: '#ffffff', padding: '12px 24px', borderBottom: '1px solid #E2E8F0', display: 'flex', gap: '16px', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#F1F5F9', padding: '6px 12px', borderRadius: '8px', flex: 1, border: '1px solid #CBD5E1' }}>
                        <Search size={16} color="#64748B" />
                        <input
                            type="text"
                            placeholder="Rechercher par référence, libellé de session, motif d'audit ou statut (ex: ANNULE)..."
                            style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '13px', width: '100%', color: '#0F172A', fontWeight: '600' }}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <button 
                        onClick={réinitialiserFiltres}
                        style={{ background: '#F1F5F9', border: '1px solid #CBD5E1', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '700', color: '#475569', cursor: 'pointer' }}
                    >
                        Réinitialiser
                    </button>
                </div>

               {/* SYSTÈME DE NAVIGATION PAR ONGLET LOGISTIQUE D'AJUSTEMENT */}
                <div style={{ bg: '#fff', background: '#ffffff', borderBottom: '1px solid #E2E8F0', display: 'flex', items: 'center', justify: 'space-between', px: '24px', padding: '0 24px', height: '42px', minHeight: '42px' }}>
                    <div style={{ display: 'flex', gap: '4px', height: '100%', alignItems: 'end' }}>
                        {[
                            { id: 'tous', label: 'Tous les mouvements', count: ajustements.length },
                            { id: 'AVARIE', label: '⚠️ Avaries', count: countAvaries },
                            { id: 'BRISE', label: '💥 Brises / Casse', count: countBrises },
                            { id: 'TRANSFERT', label: '🔄 Transferts Interne', count: countTransferts }
                        ].map(tab => {
                            const estActif = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => { setActiveTab(tab.id); setSelectedAjustementId(null); setDetails([]); }}
                                    style={{
                                        padding: '0 16px 8px 16px',
                                        fontSize: '13px',
                                        fontWeight: '800',
                                        border: 'none',
                                        background: 'transparent',
                                        borderBottom: estActif ? '3px solid #DC2626' : '3px solid transparent',
                                        color: estActif ? '#DC2626' : '#64748B',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        transition: 'all 0.15s'
                                    }}
                                >
                                    {tab.label}
                                    <span style={{ background: estActif ? '#FEE2E2' : '#F1F5F9', color: estActif ? '#991B1B' : '#475569', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontFamily: 'monospace' }}>
                                        {tab.count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>


                    
                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <label style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: '800', color: '#64748B' }}>Format Bordereau :</label>
                        <select 
                            value={formatImpression} 
                            onChange={(e) => setFormatImpression(e.target.value)}
                            style={{ padding: '3px 8px', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '11px', fontWeight: '700', outline: 'none', background: '#FFF' }}
                        >
                            <option value="A4">Standard A4</option>
                            <option value="80MM">Ticket Caisse 80mm</option>
                        </select>
                    </div>
                </div>

                {/* ZONE DE TRAVAIL DIVISÉE EN DEUX COLONNES DE COMPTABILITÉ */}
                <div style={{ flex: 1, display: 'flex', gap: '20px', padding: '20px', overflow: 'hidden', minHeight: 0 }}>
                    
                    {/* TABLEAU GAUCHE : SESSIONS ET EN-TÊTES D'AJUSTEMENTS */}
                    <div style={{ flex: 0.5, bg: '#fff', background: '#ffffff', borderRadius: '12px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                        <div style={{ padding: '12px 16px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', fontWeight: '800', fontSize: '11px', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Registre des ajustements enregistrés ({ajustementsFiltrés.length})
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ background: '#F1F5F9', borderBottom: '1px solid #CBD5E1', height: '35px' }}>
                                        <th style={{ ...thMain, width: '15%' }}>RÉFÉRENCE</th>
                                        <th style={{ ...thMain, width: '30%' }}>LIBELLÉ OPÉRATION</th>
                                        <th style={{ ...thMain, width: '18%', textAlign: 'center' }}>TYPE</th>
                                        <th style={{ ...thMain, width: '17%', textAlign: 'right' }}>VALEUR PERTE</th>
                                        <th style={{ ...thMain, width: '20%', textAlign: 'center' }}>ACTIONS</th>
                                    </tr>
                                </thead>

                                                              <tbody>
                                    {ajustementsFiltrés.length === 0 ? (
                                        <tr><td colSpan="5" style={emptyState}>Aucun ajustement trouvé</td></tr>
                                    ) : (
                                        ajustementsFiltrés.map((aj) => {
                                            const dateCloture = aj.created_at || aj.closed_at;
                                            const estSelectionne = selectedAjustementId === aj.id;
                                            const estAnnule = aj.statut === 'ANNULE';

                                            return (
                                                <tr 
                                                    key={aj.id} 
                                                    style={{ 
                                                        ...trStyle, 
                                                        background: estSelectionne ? '#FEF2F2' : 'transparent', 
                                                        cursor: 'pointer',
                                                        opacity: estAnnule ? 0.75 : 1
                                                    }}
                                                    onClick={() => handleSelectAjustement(aj.id)}
                                                >
                                                    <td style={tdStyle}>
                                                        <span style={invBadge}>ADJ-{aj.id}</span>
                                                    </td>
                                                    <td style={{ ...tdStyle, fontWeight: '700', color: '#0F172A' }}>
                                                        <div 
                                                            className="truncate" 
                                                            style={{ 
                                                                maxWidth: '180px',
                                                                textDecoration: estAnnule ? 'line-through' : 'none',
                                                                color: estAnnule ? '#94A3B8' : '#0F172A'
                                                            }}
                                                        >
                                                            {aj.libelle?.toUpperCase()}
                                                        </div>
                                                        {aj.motif && <div style={{ fontSize: '10px', color: '#64748B', fontWeight: '500', fontStyle: 'italic' }}>📝 {aj.motif}</div>}
                                                    </td>
                                                    <td style={tdCenter}>
                                                        <span style={{
                                                            ...statusClosed,
                                                            backgroundColor: aj.type_ajustement === 'AVARIE' ? '#FEF2F2' : aj.type_ajustement === 'BRISE' ? '#FFF7ED' : '#EFF6FF',
                                                            color: aj.type_ajustement === 'AVARIE' ? '#991B1B' : aj.type_ajustement === 'BRISE' ? '#C2410C' : '#1E40AF',
                                                            border: `1px solid ${aj.type_ajustement === 'AVARIE' ? '#FCA5A5' : aj.type_ajustement === 'BRISE' ? '#FDBA74' : '#93C5FD'}`
                                                        }}>
                                                            {aj.type_ajustement}
                                                        </span>
                                                    </td>
                                                    <td style={{ 
                                                        ...tdStyle, 
                                                        textAlign: 'right', 
                                                        color: estAnnule ? '#94A3B8' : '#DC2626', 
                                                        fontWeight: '900', 
                                                        fontFamily: 'monospace',
                                                        textDecoration: estAnnule ? 'line-through' : 'none'
                                                    }}>
                                                        {estAnnule ? "0 F" : `-${fmt(aj.valeur_totale)} F`}
                                                    </td>
                                                    <td style={tdCenter} onClick={(e) => e.stopPropagation()}>
                                                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', alignItems: 'center' }}>
                                                            <button 
                                                                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '5px', background: '#DC2626', color: '#ffffff', border: 'none', borderRadius: '6px', cursor: 'pointer' }} 
                                                                onClick={() => handleActionImprimerSession(aj, 'A4')} 
                                                                title="Imprimer le bordereau A4"
                                                            >
                                                                <Printer size={12} />
                                                            </button>
                                                            <button 
                                                                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '5px', background: '#475569', color: '#ffffff', border: 'none', borderRadius: '6px', cursor: 'pointer' }} 
                                                                onClick={() => handleActionImprimerSession(aj, '80MM')} 
                                                                title="Imprimer le ticket 80mm"
                                                            >
                                                                <FileText size={12} />
                                                            </button>

                                                            {/* 🚨 BLOC INTERACTIF D'ANNULATION RELIÉ AU SYSTEM TOAST SANS WINDOW MODAL */}
                                                            {estAnnule ? (
                                                                <span style={{ fontSize: '10px', fontWeight: '800', color: '#EF4444', background: '#FEE2E2', padding: '3px 6px', borderRadius: '4px' }}>
                                                                    ANNULÉ
                                                                </span>
                                                            ) : isInventoryLocked ? (
                                                                <span style={{ fontSize: '10px', fontWeight: '800', color: '#64748B', background: '#E2E8F0', padding: '3px 6px', borderRadius: '4px' }} title="Mouvements gelés (Inventaire)">
                                                                    🔒 GELÉ
                                                                </span>
                                                            ) : (
                                                                <button 
                                                                    style={{ 
                                                                        display: 'inline-flex', 
                                                                        alignItems: 'center', 
                                                                        justify: 'center', 
                                                                        padding: '5px', 
                                                                        background: '#EF4444', 
                                                                        color: '#ffffff', 
                                                                        border: 'none', 
                                                                        borderRadius: '6px', 
                                                                        cursor: actionLoading ? 'not-allowed' : 'pointer' 
                                                                    }} 
                                                                    disabled={actionLoading}
                                                                    onClick={() => handleTriggerCancelGlobal(aj.id)} 
                                                                    title="Annuler entièrement cet ajustement (Restaure les stocks)"
                                                                >
                                                                    <XCircle size={12} />
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
                    </div>

                    {/* TABLEAU DROITE : AUDIT DU DÉTAIL DES ARTICLES DE L'AJUSTEMENT SÉLECTIONNÉ */}
                    <div style={{ flex: 0.5, bg: '#fff', background: '#ffffff', borderRadius: '12px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                        <div style={{ padding: '12px 16px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', fontWeight: '800', fontSize: '11px', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Articles impactés par ce mouvement correcteur ({detailsFiltres.length})
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', background: '#F8FAFC/40' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ background: '#F1F5F9', borderBottom: '1px solid #CBD5E1', height: '35px' }}>
                                        <th style={{ ...thMain, width: '35%' }}>DESIGNATION PRODUIT</th>
                                        <th style={{ ...thMain, width: '15%', textAlign: 'center' }}>AVANT</th>
                                        <th style={{ ...thMain, width: '15%', textAlign: 'center' }}>SORTIE</th>
                                        <th style={{ ...thMain, width: '18%', textAlign: 'right' }}>VALEUR PERTE</th>
                                        <th style={{ ...thMain, width: '17%', textAlign: 'center' }}>ACTIONS</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {selectedAjustementId ? (
                                        detailsFiltres.map((d, index) => {
                                            const estLigneAnnulee = d.is_line_cancelled === 1;
                                            
                                            // On vérifie également si la session globale parente est annulée
                                            const sessionParente = ajustements.find(a => a.id === selectedAjustementId);
                                            const estSessionAnnulee = sessionParente?.statut === 'ANNULE';

                                            return (
                                                <tr 
                                                    key={index} 
                                                    style={{ 
                                                        borderBottom: '1px solid #E2E8F0', 
                                                        height: '40px', 
                                                        background: '#FFF',
                                                        opacity: estLigneAnnulee ? 0.6 : 1 
                                                    }}
                                                >
                                                    <td style={{ 
                                                        ...tdStyle, 
                                                        fontWeight: '800', 
                                                        color: estLigneAnnulee ? '#94A3B8' : '#0F172A', 
                                                        fontSize: '12px',
                                                        textDecoration: estLigneAnnulee ? 'line-through' : 'none'
                                                    }}>
                                                        {d.nom_article_snap?.toUpperCase()}
                                                    </td>
                                                    <td style={{ ...tdCenter, fontSize: '11px', color: '#64748B', fontWeight: '700' }}>
                                                        {d.stock_theorique_net}
                                                    </td>
                                                    <td style={tdCenter}>
                                                        <span style={{ 
                                                            background: estLigneAnnulee ? '#F1F5F9' : '#FEE2E2', 
                                                            color: estLigneAnnulee ? '#64748B' : '#991B1B', 
                                                            padding: '2px 6px', 
                                                            borderRadius: '4px', 
                                                            fontWeight: '900', 
                                                            fontSize: '11px' 
                                                        }}>
                                                            {d.ecart_net}
                                                        </span>
                                                    </td>
                                                    <td style={{ 
                                                        ...tdStyle, 
                                                        textAlign: 'right', 
                                                        fontWeight: '900', 
                                                        color: estLigneAnnulee ? '#94A3B8' : '#DC2626', 
                                                        fontFamily: 'monospace',
                                                        textDecoration: estLigneAnnulee ? 'line-through' : 'none'
                                                    }}>
                                                        {fmt(d.valeur_ecart_net)} F
                                                    </td>

                                                                                                        <td style={tdCenter}>
                                                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                                                            {estLigneAnnulee ? (
                                                                <span style={{ fontSize: '9px', fontWeight: '800', color: '#64748B', background: '#E2E8F0', padding: '2px 5px', borderRadius: '4px' }}>
                                                                    RETIRÉ
                                                                </span>
                                                            ) : estSessionAnnulee ? (
                                                                <span style={{ fontSize: '9px', fontWeight: '800', color: '#EF4444', background: '#FEE2E2', padding: '2px 5px', borderRadius: '4px' }}>
                                                                    BLOQUÉ
                                                                </span>
                                                            ) : isInventoryLocked ? (
                                                                <span style={{ fontSize: '9px', fontWeight: '800', color: '#475569', background: '#E2E8F0', padding: '2px 5px', borderRadius: '4px' }}>
                                                                    🔒 GELÉ
                                                                </span>
                                                            ) : (
                                                                <button
                                                                    style={{ 
                                                                        display: 'inline-flex', 
                                                                        alignItems: 'center', 
                                                                        justify: 'center', 
                                                                        padding: '4px', 
                                                                        background: '#EF4444', 
                                                                        color: '#ffffff', 
                                                                        border: 'none', 
                                                                        borderRadius: '4px', 
                                                                        cursor: actionLoading ? 'not-allowed' : 'pointer' 
                                                                    }}
                                                                    disabled={actionLoading}
                                                                    onClick={() => handleTriggerCancelLigne(d.id, d.adjustment_id || selectedAjustementId)}
                                                                    title="Annuler cette ligne d'article uniquement"
                                                                >
                                                                    <Trash2 size={12} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    ) : (
                                        <tr>
                                            <td colSpan="5" style={{ padding: '60px 20px', textAlign: 'center', color: '#64748B', fontSize: '13px', fontStyle: 'italic', fontWeight: '600' }}>
                                                ⚠️ Sélectionnez une ligne d'ajustement à gauche pour inspecter le détail de ses articles.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                </div>
                {/* 🥞 COMPOSANT TOAST INTERACTIF ET SÉCURISÉ INTÉGRÉ AU DOM */}
                {toast && (
                    <div style={{
                        position: 'fixed',
                        bottom: '24px',
                        right: '24px',
                        backgroundColor: toast.type === 'confirm' ? '#1E293B' : toast.type === 'success' ? '#065F46' : '#991B1B',
                        color: '#FFFFFF',
                        padding: '16px 20px',
                        borderRadius: '12px',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                        fontSize: '13px',
                        fontWeight: '700',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                        zIndex: 9999,
                        maxWidth: '350px',
                        border: toast.type === 'confirm' ? '2px solid #475569' : 'none'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'start', gap: '8px', lineHeight: '1.4' }}>
                            <span>{toast.type === 'confirm' ? '❓' : toast.type === 'success' ? '✅' : '❌'}</span>
                            <div>{toast.message}</div>
                        </div>
                        
                        {/* Affichage des boutons d'action si le toast attend une confirmation */}
                        {toast.type === 'confirm' && (
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'end', marginTop: '4px' }}>
                                <button
                                    onClick={() => setToast(null)}
                                    style={{ background: '#475569', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: '800', cursor: 'pointer' }}
                                >
                                    Annuler
                                </button>
                                <button
                                    onClick={toast.onConfirm}
                                    style={{ background: '#EF4444', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: '800', cursor: 'pointer' }}
                                >
                                    Confirmer
                                </button>
                            </div>
                        )}
                    </div>
                )}

            </main>
        </div>
    );
};

// ==========================================
// 🛡️ DÉFINITIONS SÉMANTIQUES DES STYLES EN LIGNE
// ==========================================
const layoutStyle = { display: 'flex', height: '100vh', background: '#F8FAFC', overflow: 'hidden' };
const mainStyle = { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' };
const headerBarStyle = { background: '#fff', padding: '16px 24px', borderBottom: '3px solid #DC2626', display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
const iconBox = { background: '#DC2626', padding: '8px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const titleStyle = { margin: 0, fontSize: '18px', fontWeight: '900', color: '#1e293b' };
const dateBox = { display: 'flex', alignItems: 'center', gap: '10px', background: '#fff', padding: '6px 12px', borderRadius: '8px', border: '2px solid #CBD5E1', marginTop: '6px' };
const dateInput = { border: 'none', background: 'transparent', fontSize: '13px', outline: 'none', fontWeight: '800', color: '#475569' };
const btnExcel = { display: 'flex', alignItems: 'center', gap: '8px', background: '#10B981', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', transition: 'all 0.2s' };
const btnRefresh = { display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F1F5F9', border: '1px solid #CBD5E1', padding: '8px', borderRadius: '8px', color: '#475569', cursor: 'pointer' };
const thMain = { padding: '8px 12px', fontSize: '11px', color: '#475569', fontWeight: '800', textAlign: 'left', textTransform: 'uppercase', borderBottom: '1px solid #CBD5E1' };
const trStyle = { borderBottom: '1px solid #E2E8F0', height: '45px', transition: 'all 0.15s' };
const tdStyle = { padding: '8px 12px', fontSize: '13px', color: '#334155' };
const tdCenter = { padding: '8px 12px', fontSize: '13px', textAlign: 'center', color: '#334155' };
const emptyState = { padding: '40px 0', textAlign: 'center', color: '#94A3B8', fontStyle: 'italic', fontSize: '13px' };
const invBadge = { background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', padding: '2px 8px', borderRadius: '4px', fontFamily: 'monospace', fontWeight: '800', fontSize: '12px' };
const statusClosed = { display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase' };

export default HistoriqueStockAjustement;
