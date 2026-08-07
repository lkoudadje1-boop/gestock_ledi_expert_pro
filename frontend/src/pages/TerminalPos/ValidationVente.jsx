import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
    RefreshCcw, Clock, Eye, CreditCard, User, Tag, Trash2, X, 
    DollarSign, AlertTriangle, Wallet, Smartphone, Banknote, 
    Landmark, Coins, HandCoins, Receipt, Building2, QrCode, 
    Ticket, CircleEllipsis, ArrowRightLeft, PiggyBank, Briefcase, 
    Bitcoin, CheckCircle, Loader2, Info, Edit2, Printer, CheckSquare, Square, Split
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useReactToPrint } from 'react-to-print';
import API from '../../services/api';
import Sidebar from '../../components/Sidebar';
import ProvisoirPrinttt from './provisoirprinttt';
import { ConversionStockService } from '../../utils/converisonstock';

const ValiderVente = () => {
    // --- ÉTATS PRINCIPAUX ---
    const [bons, setBons] = useState([]); 
    const [paymentMethods, setPaymentMethods] = useState([]);
    const [loading, setLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedLot, setSelectedLot] = useState(null);
    const [detailsSelection, setDetailsSelection] = useState([]);

    // --- ÉTATS POUR L'ENCAISSEMENT PARTIEL / ÉCHELONNÉ ---
    const [isModeEchelonne, setIsModeEchelonne] = useState(false);
    const [selectedLinesForPayment, setSelectedLinesForPayment] = useState({});

    // --- ÉTAT POUR LE FRACTIONNEMENT DE LIGNE ---
    const [splitModal, setSplitModal] = useState({ 
        isOpen: false, 
        item: null, 
        grosInput: '',
        detailInput: ''
    });

    // --- ÉTATS POUR L'ENCAISSEMENT INLINE ---
    const [activeEncaissement, setActiveEncaissement] = useState(null); 
    const [moyenPaiement, setMoyenPaiement] = useState('');
    const [montantRecu, setMontantRecu] = useState('');
     
    // --- ÉTATS POUR LES TOASTS ---
    const [toast, setToast] = useState({ show: false, message: '', type: 'info' });

    // --- ÉTATS IMPRESSION A5/A6 ---
    const printRef = useRef();
    const [printData, setPrintData] = useState(null);
    const [printFormat, setPrintFormat] = useState('A5'); 

    const [dynamiqueCompanyPrint, setDynamiqueCompanyPrint] = useState({
        name: "LEDI EXPERT PRO",
        address: "Adresse non renseignée",
        phone: "Tél: N/A",
        email: "Email: N/A",
        logo_data: null
    });

    const navigate = useNavigate();

    const showToast = useCallback((message, type = 'info') => {
        setToast({ show: true, message, type });
        setTimeout(() => setToast({ show: false, message: '', type: 'info' }), 4000);
    }, []);

    const [confirmModal, setConfirmModal] = useState({ isOpen: false, message: '', onConfirm: null });

    const USER_ID = localStorage.getItem('userId'); 

    const IconComponents = {
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
        crypto: <Bitcoin size={16} />,
        other: <CircleEllipsis size={16} />
    };

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
                console.error("Erreur chargement entreprise:", err);
            }
        };
        fetchCompanySettings();
    }, []); 
     
    const fetchBons = useCallback(async () => {
        setLoading(true);
        try {
            const res = await API.get('/provisional-sales/provisional'); 
            const ordonnes = Array.isArray(res.data) ? res.data : [];
            setBons(ordonnes);
        } catch (err) { 
            console.error("Erreur bons:", err); 
            setBons([]); 
        } finally { 
            setLoading(false); 
        }
    }, []);

    const fetchPaymentMethods = useCallback(async () => {
        try {
            const res = await API.get('/plan-comptable/paiements/methodes');
            if (res.data && res.data.success) {
                const actives = res.data.data.filter(m => m.is_active === 1 && m.is_pos === 1);
                setPaymentMethods(actives);
            }
        } catch (err) { 
            console.error("Erreur méthodes:", err); 
        }
    }, []);

    useEffect(() => {
        fetchBons();
        fetchPaymentMethods();
    }, [fetchBons, fetchPaymentMethods]);

    useEffect(() => {
        const handleUpdate = (event) => {
            const { table } = event.detail;
            if (table === 'provisional_sales' || table === 'products' || table === 'all') {
                fetchBons();
            }
        };

        window.addEventListener('ERP_DATA_CHANGED', handleUpdate);
        return () => {
            window.removeEventListener('ERP_DATA_CHANGED', handleUpdate);
        };
    }, [fetchBons]);

    const loadDetails = async (lotId, forceModeEchelonne = false) => {
        if (!lotId) return;
        setSelectedLot(lotId);
        setDetailsSelection([]);
        try {
            const res = await API.get(`/provisional-sales/provisional/${lotId}`);
            const data = Array.isArray(res.data) ? res.data : [];
            setDetailsSelection(data);
            
            const initialSelection = {};
            data.forEach(item => {
                initialSelection[item.id] = forceModeEchelonne ? false : true;
            });
            setSelectedLinesForPayment(initialSelection);
        } catch (err) { 
            console.error("Erreur détails:", err); 
        }
    };

    const totalAEncaisser = useMemo(() => {
        if (!detailsSelection.length) return 0;
        return detailsSelection.reduce((sum, item) => {
            const isChecked = isModeEchelonne ? (selectedLinesForPayment[item.id] === true) : true;
            if (isChecked) {
                return sum + Math.abs(Number(item.montant_ttc_ligne || item.total_ttc || 0));
            }
            return sum;
        }, 0);
    }, [detailsSelection, selectedLinesForPayment, isModeEchelonne]);

    const handleActionEncaissement = (lotId) => {
        if (!lotId) return;
        if (activeEncaissement === lotId) {
            setActiveEncaissement(null);
            setIsModeEchelonne(false);
        } else {
            setActiveEncaissement(lotId);
            setIsModeEchelonne(false);
            setMontantRecu(''); // Vidage explicite du montant reçu à l'ouverture
            loadDetails(lotId, false);

            if (paymentMethods.length > 0) {
                const especes = paymentMethods.find(m => 
                    m.libelle.toLowerCase().includes('espèce') || 
                    m.code.toLowerCase().includes('cash')
                );
                const defaultCode = especes ? especes.code : (paymentMethods[0]?.code || 'CASH');
                setMoyenPaiement(defaultCode);
            }
        }
    };

    const toggleLineSelection = (lineId) => {
        setSelectedLinesForPayment(prev => {
            const nextState = { ...prev, [lineId]: !prev[lineId] };
            // CORRECTION : Empêcher le recalcul automatique ou la synchronisation automatique du montant reçu sur le total.
            // On laisse le champ montantRecu intact tel que saisi par l'utilisateur (ou vide).
            return nextState;
        });
    };

    const openSplitModal = (item) => {
        const { coeff } = ConversionStockService.getMetadata(item);
        setSplitModal({
            isOpen: true,
            item,
            grosInput: '',
            detailInput: ''
        });
    };

    const handleConfirmSplitLine = async () => {
        const { item, grosInput, detailInput } = splitModal;
        if (!item) return;

        const { coeff } = ConversionStockService.getMetadata(item);
        let chaineSaisie = coeff > 1 ? `${grosInput || '0'}+${detailInput || '0'}` : `${detailInput || '0'}`;
        const qtePayeePieces = ConversionStockService.toPieces(chaineSaisie, item);

        if (qtePayeePieces <= 0) {
            showToast("Veuillez saisir une quantité valide à payer.", "error");
            return;
        }

        try {
            const res = await API.post(`/provisional-sales/split-item/${item.id}`, { qtePayee: qtePayeePieces });
            if (res.data.success) {
                showToast("Ligne scindée avec succès !", "info");
                setIsModeEchelonne(true);
                setMontantRecu(''); // Vidage du montant reçu après scission
                await loadDetails(selectedLot, true);
                await fetchBons();
            }
        } catch (err) {
            const qteTotalBrute = Math.abs(Number(item.quantite || 0));
            const qteRestanteBrute = qteTotalBrute - qtePayeePieces;

            if (qteRestanteBrute <= 0) {
                showToast("La quantité à payer doit être strictement inférieure à la quantité totale.", "error");
                return;
            }

            const totalLigneTTC = Math.abs(Number(item.montant_ttc_ligne || item.total_ttc || 0));
            const puExactDetail = qteTotalBrute > 0 ? (totalLigneTTC / qteTotalBrute) : Number(item.prix_vente_unitaire || item.prix_unitaire || item.prix || 0);

            const montantPayeTTC = Number((qtePayeePieces * puExactDetail).toFixed(2));
            const montantRestantTTC = Number((qteRestanteBrute * puExactDetail).toFixed(2));

            const expPayee = ConversionStockService.toExpressionTextuelle(qtePayeePieces, item);
            const expRestante = ConversionStockService.toExpressionTextuelle(qteRestanteBrute, item);

            const idPayee = `${item.id}_p1_${Date.now()}`;
            const idRestante = `${item.id}_p2_${Date.now()}`;

            const lignePayee = {
                ...item,
                id: idPayee,
                quantite: qtePayeePieces,
                prix_vente_unitaire: puExactDetail,
                prix_unitaire: puExactDetail,
                expression_logistique: expPayee,
                montant_ht: montantPayeTTC,
                montant_ttc_ligne: montantPayeTTC,
                total_ttc: montantPayeTTC
            };

            const ligneRestante = {
                ...item,
                id: idRestante,
                quantite: qteRestanteBrute,
                prix_vente_unitaire: puExactDetail,
                prix_unitaire: puExactDetail,
                expression_logistique: expRestante,
                montant_ht: montantRestantTTC,
                montant_ttc_ligne: montantRestantTTC,
                total_ttc: montantRestantTTC
            };

            setDetailsSelection(prev => {
                const index = prev.findIndex(l => l.id === item.id);
                const copy = [...prev];
                copy.splice(index, 1, lignePayee, ligneRestante);
                return copy;
            });

            setIsModeEchelonne(true);

            setSelectedLinesForPayment(prev => ({
                ...prev,
                [idPayee]: true,
                [idRestante]: false
            }));

            setMontantRecu(''); // Vidage du montant reçu après scission
            showToast(`Scission effectuée : ${expPayee} extrait(e)s avec succès.`, "info");
        } finally {
            setSplitModal({ isOpen: false, item: null, grosInput: '', detailInput: '' });
        }
    };

    const handlePrint = useReactToPrint({
        content: () => printRef.current,
        documentTitle: `FACTURE_VALIDEE`,
        pageStyle: `
            @page {
                size: ${printFormat === 'A6' ? 'A6 portrait' : 'A5 portrait'} !important; 
                margin: 0 !important;
            }
            body {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
                margin: 0;
                padding: 0;
            }
        `,
        onAfterPrint: () => setPrintData(null)
    });

    const declencherImpressionSynchronisee = useCallback((dataPourImpression, formatChoisi = 'A5') => {
        setPrintFormat(formatChoisi);
        setPrintData(dataPourImpression);
        setTimeout(() => {
            handlePrint();
        }, 180);
    }, [handlePrint]);

    const handleFinalValidation = async (lotId) => {
        if (!lotId) return false;
         
        const total = Math.round(totalAEncaisser);
        const recu = Math.abs(parseFloat(montantRecu) || 0);

        const itemIdsToPay = isModeEchelonne 
            ? Object.keys(selectedLinesForPayment).filter(id => selectedLinesForPayment[id] === true)
            : detailsSelection.map(d => d.id);

        if (itemIdsToPay.length === 0) {
            showToast("Veuillez cocher au moins un article à encaisser !", "error");
            return false;
        }
         
        if (recu < total) {
            showToast(`Encaissement insuffisant ! Manque : ${(total - recu).toLocaleString()} F`, 'error');
            return false; 
        }

        if (isSubmitting) return false; 

        setIsSubmitting(true);
        try {
            const monnaieRendueCalculee = Math.max(0, Number((recu - total).toFixed(2)));
            const isPartialValidation = isModeEchelonne || itemIdsToPay.length < detailsSelection.length;

            const payload = {
                caissier_id: USER_ID,
                moyen_paiement: moyenPaiement,
                montant_total: total,
                montant_recu: recu,
                monnaie_rendue: monnaieRendueCalculee,
                is_partial: isPartialValidation,
                item_ids: itemIdsToPay
            };

            const response = await API.post(`/provisional-sales/validate/${lotId}`, payload);
             
            if (response.data.success) {
                showToast(isPartialValidation ? "Encaissement partiel validé avec succès !" : "Vente complète validée !", "info");
                
                // CORRECTION : Vider systématiquement le montant reçu après validation réussie
                setMontantRecu('');
                 
                await fetchBons();
                if (isPartialValidation) {
                    await loadDetails(lotId, true);
                } else {
                    setSelectedLot(null);
                    setDetailsSelection([]);
                    setActiveEncaissement(null);
                    setIsModeEchelonne(false);
                }
                return response.data.id || true; 
            }
            return false;
        } catch (err) {
            showToast(`Erreur: ${err.response?.data?.error || 'Serveur injoignable'}`, 'error');
            return false;
        } finally { 
            setIsSubmitting(false); 
        }
    };

    const handleFinalValidationWithPrint = async (lotId, formatChoisi = 'A5') => {
        const bon = bons.find(b => b.lot_id === lotId);
        if (!bon) return;

        const total = Math.round(totalAEncaisser);
        const recu = Math.abs(parseFloat(montantRecu) || 0);
         
        if (recu < total) {
            showToast(`Encaissement insuffisant ! Manque : ${(total - recu).toLocaleString()} F`, 'error');
            return;
        }

        let lignesPanier = detailsSelection.filter(item => isModeEchelonne ? selectedLinesForPayment[item.id] === true : true);

        const panierSauvegardePourImpression = lignesPanier.map(item => {
            const infoArticle = item.article_complet || item.product || item.article || item || {};
            const { coeff, codeGros, refDetail } = ConversionStockService.getMetadata(item);
            const pu = Math.abs(Number(item.prix_vente_unitaire || item.prix_unitaire || item.prix || 0));
            const net = Math.abs(Number(item.montant_ttc_ligne || item.total_ttc || item.montant_ht || 0));
            const qteNumeriquePure = pu > 0 ? Math.round(net / pu) : Math.abs(Number(item.quantite || 0));

            return {
                ...item,
                article_complet: {
                    ...infoArticle,
                    coefficient: coeff,
                    unit_coefficient: coeff,
                    unit_code_gros: codeGros,
                    unit_ref_detail: refDetail
                },
                nom_article_snap: item.nom_article_snap || item.designation || item.nom || 'Article',
                prix_vente_unitaire: pu,
                remise_montant: Math.abs(Number(item.remise_montant || item.remise || 0)),
                montant_ttc_ligne: net,
                quantite: qteNumeriquePure,
                unit_code_gros: codeGros,
                unit_ref_detail: refDetail
            };
        });

        const reliquat = Math.max(0, Number((recu - total).toFixed(2)));
        const succesValidation = await handleFinalValidation(lotId);
         
        if (succesValidation) {
            const currentMethod = paymentMethods.find(m => m.code === moyenPaiement);

            const payloadImpression = {
                panier: panierSauvegardePourImpression, 
                venteInfo: {
                    provisoir_no: lotId,
                    facture_no: typeof succesValidation === 'string' ? succesValidation : (bon.facture_no || bon.numero || lotId),
                    date: new Date().toISOString(),
                    client_nom: bon.nom_client_snap || bon.client || 'CLIENT AU COMPTANT',
                    mode_paiement: currentMethod ? currentMethod.libelle : "Espèces",
                    vendedor: bon.username_createur || bon.staff_name || 'Caissier',
                    staff_name_snap: bon.staff_name || bon.username_createur || 'Caissier',
                    table_name_snap: bon.table_number || bon.table_number_snap || 'Non assignée',
                    total_ht: total,
                    total_ttc: total,
                    montant_recu: recu > 0 ? recu : total,
                    reliquat: reliquat,
                    est_definitive: true,
                    format: formatChoisi
                },
                company: { ...dynamiqueCompanyPrint }
            };

            declencherImpressionSynchronisee(payloadImpression, formatChoisi);
        }
    };

    const handleRejectSale = (lotId) => {
        if (!lotId) return;
        setConfirmModal({
            isOpen: true,
            message: `Voulez-vous annuler définitivement le bon ${lotId} et restituer le stock ?`,
            onConfirm: async () => {
                try {
                    const response = await API.post(`/provisional-sales/reject-lot/${lotId}`);
                    if (response.data.success || response.status === 200) {
                        setBons(prev => prev.filter(b => b.lot_id !== lotId));
                        if (selectedLot === lotId) { 
                            setSelectedLot(null); 
                            setDetailsSelection([]); 
                        }
                        showToast(`Le bon ${lotId} a été annulé et le stock restitué.`, "info");
                    }
                } catch (err) { 
                    console.error("Erreur rejet:", err);
                    setConfirmModal({ isOpen: false, message: '', onConfirm: null });
                    showToast("Erreur serveur : impossible de rejeter la vente.", "error"); 
                }
            }
        });
    };

    const handleDeleteLine = (lineId, lotId) => {
        if (!lineId || !lotId) return;
        setConfirmModal({
            isOpen: true,
            message: `Supprimer cet article de la vente ?`,
            onConfirm: async () => {
                try {
                    await API.delete(`/provisional-sales/item/${lineId}`);
                    loadDetails(lotId, isModeEchelonne);
                    fetchBons();
                    showToast("Article supprimé", "info");
                } catch (err) { 
                    showToast("Erreur lors de la suppression", "error"); 
                }
            }
        });
    };

    const handleEditSale = (lotId) => {
        if (!lotId) return;
        navigate(`/pos/add?edit=${lotId}`);
    };

    return (
        <div style={layoutStyle}>
            <style>{`
                @keyframes custom-spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
            <Sidebar />

            {toast.show && (
                <div style={{...toastContainer, background: toast.type === 'error' ? '#FEF2F2' : '#DCFCE7', borderColor: toast.type === 'error' ? '#EF4444' : '#10B981', borderStyle: 'solid', borderWidth: '1px'}}>
                    {toast.type === 'error' ? <AlertTriangle size={18} color="#EF4444" /> : <CheckCircle size={18} color="#10B981" />}
                    <span style={{color: toast.type === 'error' ? '#991B1B' : '#065F46', fontSize: '13px', fontWeight: 'bold'}}>{toast.message}</span>
                    <button onClick={() => setToast({show: false, message: '', type: 'info'})} style={{background: 'none', border: 'none', cursor: 'pointer', marginLeft: '10px', display: 'flex', alignItems: 'center'}}><X size={14} color={toast.type === 'error' ? '#991B1B' : '#065F46'}/></button>
                </div>
            )}

            <main style={mainStyle}>
                <header style={headerBarStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div style={iconBox}><CreditCard size={24} color="#ffffff" /></div>
                        <div>
                            <h1 style={titleStyle}>TERMINAL POINT DE VENTE : VALIDATION</h1>
                            <div style={statusBadgeHeader}><Clock size={12} /> {bons.length} BON(S) EN ATTENTE</div>
                        </div>
                    </div>
                    <button onClick={fetchBons} style={btnRefresh} disabled={loading}>
                        <RefreshCcw size={18} color="#ffffff" style={{ animation: loading ? 'custom-spin 1s linear infinite' : 'none' }} />
                    </button>
                </header>

                <div style={contentArea}>
                    <h3 style={sectionTitle}>BONS EN ATTENTE (TRAÇABILITÉ COMPLÈTE)</h3>
                    <div
                        style={{
                            ...cardStyle,
                            maxHeight: '295px',
                            overflowY: 'auto',
                            overflowX: 'hidden'
                        }}
                    >
                        <table style={mainTable}>
                            <thead style={stickyHeader}>
                                <tr style={{background: '#0F172A', color: '#ffffff'}}>
                                    <th style={thStyleWhite}>N° BON (LOT)</th>
                                    <th style={thStyleWhite}>CLIENT</th>
                                    <th style={thStyleWhite}>VENDEUR (STAFF)</th>
                                    <th style={thStyleWhite}>TABLE SERVIE</th>
                                    <th style={thStyleWhite}>UTILISATEUR (SAISIE)</th>
                                    <th style={thStyleWhite}>TOTAL TTC</th>
                                    <th style={thCenterWhite}>ACTIONS</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan="7" style={emptyState}>Chargement...</td></tr>
                                ) : bons.length === 0 ? (
                                    <tr><td colSpan="7" style={emptyState}>Aucun bon en attente.</td></tr>
                                ) : (
                                    bons.map((bon) => (
                                        <React.Fragment key={bon.lot_id}>
                                            <tr style={{...trStyle, background: selectedLot === bon.lot_id ? '#f0fdf4' : 'transparent'}}>
                                                <td style={tdStyle}><span style={lotBadge}>{bon.lot_id}</span></td>
                                                <td style={{...tdStyle, fontWeight: '700'}}>{bon.nom_client_snap || 'CLIENT AU COMPTANT'}</td>
                                                <td style={tdStyle}><Tag size={12} color="#10b981" /> {bon.staff_name_snap}</td>
                                                <td style={tdStyle}>
                                                    <span style={{ background: '#F1F5F9', padding: '2px 6px', borderRadius: '4px', border: '1px solid #E2E8F0', fontSize: '11px', fontWeight: '700' }}>
                                                        {bon.table_number_snap || '---'}
                                                    </span>
                                                </td>
                                                <td style={tdStyle}><User size={12} color="#64748b" /> {bon.username_createur}</td>
                                                <td style={{...tdCenter, fontWeight: '900', color: '#16a34a', fontFamily: 'monospace', textAlign: 'right', paddingRight: '12px'}}>
                                                    {Number(Math.abs(bon.total || 0)).toFixed(2)} F
                                                </td>
                                                <td style={tdCenter}>
                                                    <div style={{display: 'flex', gap: '8px', justifyContent: 'center'}}>
                                                        <button onClick={() => loadDetails(bon.lot_id, isModeEchelonne)} style={btnVerify}><Eye size={14}/> VÉRIFIER</button>
                                                        <button onClick={() => handleEditSale(bon.lot_id)} style={btnVerify}><Edit2 size={14}/> ÉDITER</button>
                                                        <button 
                                                            onClick={() => handleActionEncaissement(bon.lot_id)} 
                                                            style={activeEncaissement === bon.lot_id ? btnCancelInline : btnCashActionInline}
                                                        >
                                                            {activeEncaissement === bon.lot_id ? <X size={14}/> : <DollarSign size={14}/>}
                                                            {activeEncaissement === bon.lot_id ? "ANNULER" : "ENCAISSER"}
                                                        </button>
                                                        <button 
                                                            onClick={() => handleRejectSale(bon.lot_id)} 
                                                            style={btnTrashAction}
                                                            title="Annuler et restituer le stock"
                                                        >
                                                            <Trash2 size={14}/>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>

                                            {activeEncaissement === bon.lot_id && (
                                                <tr>
                                                    <td colSpan="7" style={inlineTdStyle}>
                                                        <div style={inlineContainer}>
                                                            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: '16px'}}>
                                                                <div style={formHeaderInline}>FORMULAIRE DE PAIEMENT : {bon.lot_id}</div>
                                                                
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        const newMode = !isModeEchelonne;
                                                                        setIsModeEchelonne(newMode);
                                                                        setMontantRecu(''); // Vider le montant reçu lors du changement de mode
                                                                        if (newMode && detailsSelection.length > 0) {
                                                                            const resetSel = {};
                                                                            detailsSelection.forEach(d => { resetSel[d.id] = false; });
                                                                            setSelectedLinesForPayment(resetSel);
                                                                        }
                                                                    }}
                                                                    style={{
                                                                        background: isModeEchelonne ? '#ea580c' : '#ffffff',
                                                                        color: isModeEchelonne ? '#ffffff' : '#ea580c',
                                                                        border: '1px solid #ea580c',
                                                                        padding: '6px 14px',
                                                                        borderRadius: '8px',
                                                                        fontSize: '12px',
                                                                        fontWeight: '800',
                                                                        cursor: 'pointer',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        gap: '6px'
                                                                    }}
                                                                >
                                                                    <Split size={14} />
                                                                    {isModeEchelonne ? 'MODE PARTIEL ACTIF (DECOCHEZ CI-DESSOUS)' : 'ENCAISSEMENT ÉCHELONNÉ / PARTIEL'}
                                                                </button>
                                                            </div>

                                                            <div style={formRowInline}>
                                                                <div style={{flex: 1}}>
                                                                    <label style={inlineLabel}>CHOISIR LE MODE</label>
                                                                    <div style={inlineMethodsGrid}>
                                                                        {paymentMethods.map(m => (
                                                                            <button 
                                                                                type="button"
                                                                                key={m.id} 
                                                                                onClick={() => {
                                                                                    setMoyenPaiement(m.code);
                                                                                    setMontantRecu(''); // Vider le montant reçu lors du changement de méthode
                                                                                }}
                                                                                style={moyenPaiement === m.code ? payMethodActive : payMethodInactive}
                                                                            >
                                                                                {IconComponents[m.icone_name] || <CreditCard size={14}/>} {m.libelle}
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                </div>

                                                                <div style={{width: '200px'}}>
                                                                    <label style={inlineLabel}>À PAYER ({isModeEchelonne ? 'Sélection' : 'Total'})</label>
                                                                    <div style={{
                                                                        ...inlineInput, 
                                                                        backgroundColor: '#F8FAFC', 
                                                                        color: '#16a34a', 
                                                                        display: 'flex', 
                                                                        alignItems: 'center', 
                                                                        justifyContent: 'center',
                                                                        fontSize: '18px'
                                                                    }}>
                                                                        {Math.round(totalAEncaisser).toLocaleString()} F
                                                                    </div>
                                                                </div>

                                                                <div style={{width: '220px'}}>
                                                                    <label style={inlineLabel}>
                                                                        MONTANT REÇU {isModeEchelonne ? '(SÉLECTION)' : ''}
                                                                    </label>
                                                                    <input 
                                                                        id="recu-inline-input"
                                                                        type="text" 
                                                                        style={{ ...inlineInput, fontWeight: '900', fontSize: '18px' }}
                                                                        value={montantRecu}
                                                                        onKeyDown={(e) => {
                                                                            if (e.key === '-' || e.key === 'e' || e.key === 'E' || e.key === '+') {
                                                                                e.preventDefault();
                                                                            }
                                                                        }}
                                                                        onChange={(e) => {
                                                                            const val = e.target.value.replace(/[^\d]/g, '');
                                                                            setMontantRecu(val);
                                                                        }}
                                                                        placeholder="0"
                                                                    />
                                                                    <div style={monnaieRendreStyle}>
                                                                        RELIQUAT : {(() => {
                                                                            const recuSaisi = parseFloat(montantRecu) || 0;
                                                                            return Math.max(0, Math.round(recuSaisi - Math.round(totalAEncaisser))).toLocaleString();
                                                                        })()} F
                                                                    </div>
                                                                </div>

                                                                <div style={{display: 'flex', alignItems: 'flex-end', gap: '8px', flexWrap: 'wrap'}}>
                                                                    <button 
                                                                        type="button"
                                                                        onClick={() => handleFinalValidationWithPrint(bon.lot_id, 'A5')}
                                                                        disabled={isSubmitting}
                                                                        style={{
                                                                            ...btnConfirmFinal,
                                                                            backgroundColor: '#10b981',
                                                                            borderColor: '#059669',
                                                                            cursor: 'pointer',
                                                                            gap: '4px'
                                                                        }}
                                                                    >
                                                                        {isSubmitting ? <Loader2 style={{animation: 'custom-spin 1s linear infinite'}} size={14}/> : <Printer size={14}/>}
                                                                        IMPRIMER A5
                                                                    </button>

                                                                    <button 
                                                                        type="button"
                                                                        onClick={() => handleFinalValidationWithPrint(bon.lot_id, 'A6')}
                                                                        disabled={isSubmitting}
                                                                        style={{
                                                                            ...btnConfirmFinal,
                                                                            backgroundColor: '#4f46e5',
                                                                            borderColor: '#4338ca',
                                                                            cursor: 'pointer',
                                                                            gap: '4px'
                                                                        }}
                                                                    >
                                                                        {isSubmitting ? <Loader2 style={{animation: 'custom-spin 1s linear infinite'}} size={14}/> : <Printer size={14}/>}
                                                                        IMPRIMER A6
                                                                    </button>

                                                                    <button 
                                                                        type="button"
                                                                        onClick={() => handleFinalValidation(bon.lot_id)}
                                                                        disabled={isSubmitting}
                                                                        style={{ ...btnConfirmFinal, cursor: 'pointer', gap: '4px', backgroundColor: isModeEchelonne ? '#ea580c' : '#10B981' }}
                                                                    >
                                                                        {isSubmitting ? <Loader2 style={{animation: 'custom-spin 1s linear infinite'}} size={14}/> : <CheckCircle size={14}/>}
                                                                        {isModeEchelonne ? `ENCAISSER PARTIEL (${detailsSelection.filter(item => selectedLinesForPayment[item.id] === true).length} ART.)` : "VALIDER L'ENCAISSEMENT"}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    <h3 style={sectionTitle}>
                        DÉTAILS DU BON SÉLECTIONNÉ : {selectedLot || '---'}
                        {isModeEchelonne && <span style={{color:'#ea580c', marginLeft:'10px', fontSize:'11px'}}>(MODE ÉCHELONNÉ : COCHEZ LES ARTICLES À RÉGLER)</span>}
                    </h3>
                     
                    <div
                        style={{
                            ...cardStyle,
                            maxHeight: '270px',
                            overflowY: 'auto',
                            overflowX: 'hidden'
                        }}
                    >
                        <table style={mainTable}>
                            <thead>
                                <tr style={{ background: '#f1f5f9' }}>
                                    {isModeEchelonne && <th style={{ ...thCenterBlue, width: '40px' }}>PAYER</th>}
                                    <th style={thStyleBlue}>ID</th>
                                    <th style={thStyleBlue}>ARTICLE</th>
                                    <th style={thCenterBlue}>QTE</th>
                                    <th style={thCenterBlue}>P.U</th>
                                    <th style={thCenterBlue}>M. HT</th>
                                    <th style={thCenterBlue}>REMISE</th>
                                    <th style={thCenterBlue}>TAXE</th>
                                    <th style={thCenterBlue}>TOTAL TTC</th>
                                    <th style={thStyleBlue}>DATE & HEURE</th>
                                    <th style={thCenterBlue}>ACTIONS</th>
                                </tr>
                            </thead>
                            <tbody>
                                {detailsSelection.length === 0 ? (
                                    <tr><td colSpan={isModeEchelonne ? 11 : 10} style={emptyState}>Aucun article sélectionné ou chargé.</td></tr>
                                ) : (
                                    detailsSelection.map((item, idx) => {
                                        const expressionQuantiteAffichee = item.expression_logistique || item.qte_vendue_formatee || item.qte_formatee || `${item.quantite || 0} U`;

                                        const qtePure = Math.abs(Number(item.quantite || 0));
                                        const puVal = Number(item.prix_vente_unitaire || item.prix_unitaire || item.prix || 0).toFixed(2);
                                        const htVal = Number(item.montant_ht || item.montant_ht_ligne || 0).toFixed(2);
                                        const remVal = Number(item.remise_montant || item.remise || 0).toFixed(2);
                                        const taxVal = Number(item.taxe_montant || 0).toFixed(2);
                                        const ttcVal = Number(item.montant_ttc_ligne || item.total_ttc || 0).toFixed(2);
                                        const isChecked = selectedLinesForPayment[item.id] === true;

                                        return (
                                            <tr key={idx} style={{ ...trStyle, opacity: (isModeEchelonne && !isChecked) ? 0.4 : 1, background: (isModeEchelonne && isChecked) ? '#fff7ed' : 'transparent' }}>
                                                {isModeEchelonne && (
                                                    <td style={{ ...tdCenter, width: '40px' }}>
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleLineSelection(item.id)}
                                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: isChecked ? '#ea580c' : '#94a3b8' }}
                                                        >
                                                            {isChecked ? <CheckSquare size={18} /> : <Square size={18} />}
                                                        </button>
                                                    </td>
                                                )}
                                                <td style={tdStyle}>
                                                    {item.product_id || item.id_article ? String(item.product_id || item.id_article).slice(-6) : '---'}
                                                </td>
                                                <td style={{ ...tdStyle, fontWeight: '700' }}>{item.nom_article_snap}</td>
                                                <td style={{ ...tdCenter, fontWeight: '800', color: '#1e40af', whiteSpace: 'nowrap' }}>
                                                    {expressionQuantiteAffichee}
                                                </td>
                                                <td style={{ ...tdCenter, textAlign: 'right', fontFamily: 'monospace' }}>
                                                    {puVal} F
                                                </td>
                                                <td style={{ ...tdCenter, textAlign: 'right', fontFamily: 'monospace' }}>
                                                    {htVal} F
                                                </td>
                                                <td style={{ ...tdCenter, textAlign: 'right', color: '#ef4444', fontFamily: 'monospace' }}>
                                                    {Number(remVal) > 0 ? `-${remVal}` : '0.00'}
                                                </td>
                                                <td style={{ ...tdCenter, textAlign: 'right', fontFamily: 'monospace' }}>
                                                    {Number(taxVal) > 0 ? `+${taxVal}` : '0.00'}
                                                </td>
                                                <td style={{ ...tdCenter, textAlign: 'right', fontWeight: '900', color: '#059669', fontFamily: 'monospace' }}>
                                                    {ttcVal} F
                                                </td>
                                                <td style={tdStyle}>
                                                    {item.date_vente || item.created_at ? new Date(item.date_vente || item.created_at).toLocaleString('fr-FR') : new Date().toLocaleString('fr-FR')}
                                                </td>
                                                <td style={tdCenter}>
                                                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                                        {qtePure > 1 && (
                                                            <button
                                                                type="button"
                                                                title="Scinder la ligne"
                                                                onClick={() => openSplitModal(item)}
                                                                style={{ ...btnTrashLine, borderColor: '#f97316', color: '#f97316' }}
                                                            >
                                                                <Split size={14} />
                                                            </button>
                                                        )}
                                                        <button type="button" onClick={() => handleDeleteLine(item.id, item.lot_id)} style={btnTrashLine} title="Supprimer la ligne">
                                                            <Trash2 size={14} />
                                                        </button>
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
            </main>

            {/* MODAL DE SCISSION */}
            {splitModal.isOpen && splitModal.item && (() => {
                const { coeff, codeGros, refDetail } = ConversionStockService.getMetadata(splitModal.item);
                const hasDetail = coeff > 1;

                return (
                    <div style={modalOverlay}>
                        <div style={modalContent}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
                                <Split size={24} color="#ea580c" />
                                <h2 style={{ margin: 0, fontSize: '16px', color: '#1E293B' }}>Scinder la ligne (Colisage)</h2>
                            </div>
                             
                            <p style={{ fontSize: '13px', color: '#475569', marginBottom: '15px' }}>
                                Article : <strong>{splitModal.item.nom_article_snap}</strong><br />
                                Disponible : <strong>{splitModal.item.expression_logistique || ConversionStockService.toExpressionTextuelle(splitModal.item.quantite, splitModal.item)}</strong>
                            </p>

                            {hasDetail ? (
                                <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ display: 'block', fontSize: '11px', fontWeight: '800', color: '#1E3A8A', marginBottom: '6px' }}>
                                            {codeGros} (Gros) :
                                        </label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={splitModal.grosInput}
                                            placeholder="0"
                                            onChange={(e) => setSplitModal(prev => ({ ...prev, grosInput: e.target.value }))}
                                            style={{
                                                width: '100%',
                                                padding: '10px',
                                                borderRadius: '8px',
                                                border: '2px solid #ea580c',
                                                fontSize: '16px',
                                                fontWeight: '900',
                                                textAlign: 'center',
                                                outline: 'none'
                                            }}
                                        />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ display: 'block', fontSize: '11px', fontWeight: '800', color: '#1E3A8A', marginBottom: '6px' }}>
                                            {refDetail} (Détail) :
                                        </label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={splitModal.detailInput}
                                            placeholder="0"
                                            onChange={(e) => setSplitModal(prev => ({ ...prev, detailInput: e.target.value }))}
                                            style={{
                                                width: '100%',
                                                padding: '10px',
                                                borderRadius: '8px',
                                                border: '2px solid #ea580c',
                                                fontSize: '16px',
                                                fontWeight: '900',
                                                textAlign: 'center',
                                                outline: 'none'
                                            }}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div style={{ marginBottom: '20px' }}>
                                    <label style={{ display: 'block', fontSize: '11px', fontWeight: '800', color: '#1E3A8A', marginBottom: '6px' }}>
                                        Quantité à payer ({refDetail}) :
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={splitModal.detailInput}
                                        placeholder="0"
                                        onChange={(e) => setSplitModal(prev => ({ ...prev, detailInput: e.target.value }))}
                                        style={{
                                            width: '100%',
                                            padding: '10px',
                                            borderRadius: '8px',
                                            border: '2px solid #ea580c',
                                            fontSize: '18px',
                                            fontWeight: '900',
                                            textAlign: 'center',
                                            outline: 'none'
                                        }}
                                    />
                                </div>
                            )}

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button type="button" onClick={() => setSplitModal({ isOpen: false, item: null, grosInput: '', detailInput: '' })} style={btnCancel}>Annuler</button>
                                <button type="button" onClick={handleConfirmSplitLine} style={{ ...btnConfirm, backgroundColor: '#ea580c' }}>Valider la Scission</button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {confirmModal.isOpen && (
                <div style={modalOverlay}>
                    <div style={modalContent}>
                        <div style={{display:'flex', alignItems:'center', gap:'10px', marginBottom:'15px'}}>
                            <Info size={24} color="#3b82f6" />
                            <h2 style={{margin:0, fontSize:'16px'}}>Confirmation requise</h2>
                        </div>
                        <p style={{fontSize:'14px', color:'#475569', marginBottom:'20px'}}>{confirmModal.message}</p>
                        <div style={{display:'flex', justifyContent:'flex-end', gap:'10px'}}>
                            <button type="button" onClick={() => setConfirmModal({isOpen:false, message:'', onConfirm:null})} style={btnCancel}>Annuler</button>
                            <button type="button" onClick={() => { confirmModal.onConfirm(); setConfirmModal({isOpen:false, message:'', onConfirm:null}); }} style={btnConfirm}>Confirmer</button>
                        </div>
                    </div>
                </div>
            )}

            {printData && (
                <div style={{ display: 'none' }}>
                    <ProvisoirPrinttt
                        ref={printRef}
                        panier={printData.panier}
                        venteInfo={printData.venteInfo}
                        company={printData.company}
                    />
                </div>
            )}
        </div>
    );
};

const layoutStyle = { display: 'flex', height: '100vh', background: '#F8FAFC', fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' };
const mainStyle = { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#F8FAFC' };
const toastContainer = { position: 'fixed', top: '25px', right: '25px', zIndex: 9999, padding: '14px 24px', borderRadius: '10px', borderWidth: '1px', borderStyle: 'solid', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15)', animation: 'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards' };
const headerBarStyle = { background: '#0F172A', padding: '18px 24px', borderBottomWidth: '4px', borderBottomStyle: 'solid', borderBottomColor: '#10B981', display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
const iconBox = { background: '#10B981', padding: '8px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const titleStyle = { margin: 0, fontSize: '18px', fontWeight: '900', color: '#ffffff', letterSpacing: '0.02em' };
const statusBadgeHeader = { color: '#10B981', fontSize: '12px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' };
const contentArea = { padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' };
const sectionTitle = { fontSize: '12px', fontWeight: '900', color: '#1E293B', textTransform: 'uppercase', marginBottom: '4px', borderLeftWidth: '4px', borderLeftStyle: 'solid', borderLeftColor: '#4F46E5', paddingLeft: '10px', letterSpacing: '0.05em' };
const cardStyle = { background: '#ffffff', borderRadius: '12px', borderWidth: '1px', borderStyle: 'solid', borderColor: '#E2E8F0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', overflow: 'hidden' };
const mainTable = { width: '100%', borderCollapse: 'separate', borderSpacing: 0 };
const stickyHeader = { position: 'sticky', top: 0, zIndex: 10, maxHeight: '420px' };
const thStyleWhite = { padding: '14px 16px', background: '#0F172A', color: '#ffffff', fontSize: '11px', fontWeight: '700', textAlign: 'left', letterSpacing: '0.02em' };
const thCenterWhite = { ...thStyleWhite, textAlign: 'center' };
const thStyleBlue = { padding: '12px 16px', background: '#F8FAFC', color: '#475569', fontSize: '11px', fontWeight: '700', textAlign: 'left', borderBottomWidth: '2px', borderBottomStyle: 'solid', borderBottomColor: '#CBD5E1', letterSpacing: '0.02em' };
const thCenterBlue = { ...thStyleBlue, textAlign: 'center' };
const tdStyle = { padding: '12px 16px', fontSize: '13px', color: '#334155', borderBottomWidth: '1px', borderBottomStyle: 'solid', borderBottomColor: '#F1F5F9', verticalAlign: 'middle' };
const tdCenter = { ...tdStyle, textAlign: 'center' };
const trStyle = { transition: 'background 0.15s ease' };
const lotBadge = { background: '#E0F2FE', color: '#0369A1', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '800', borderWidth: '1px', borderStyle: 'solid', borderColor: '#BAE6FD' };
const btnRefresh = { background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const btnVerify = { background: '#ffffff', color: '#475569', borderWidth: '1px', borderStyle: 'solid', borderColor: '#CBD5E1', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', transition: 'all 0.2s ease', display: 'flex', alignItems: 'center', gap: '6px' };
const btnCashActionInline = { background: '#10B981', color: '#ffffff', border: 'none', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 2px 4px rgba(16, 185, 129, 0.15)', transition: 'background 0.2s ease' };
const btnCancelInline = { background: '#DC2626', color: '#ffffff', border: 'none', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px', transition: 'background 0.2s ease' };
const emptyState = { textAlign: 'center', padding: '48px', color: '#94A3B8', fontSize: '14px', fontWeight: '500' };
const btnTrashAction = { background: '#ffffff', borderWidth: '1px', borderStyle: 'solid', borderColor: '#FCA5A5', color: '#DC2626', borderRadius: '6px', padding: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s ease' };
const btnTrashLine = { ...btnTrashAction, borderColor: '#E2E8F0', color: '#94a3b8' };
const inlineTdStyle = { padding: '0', background: '#F8FAFC' };
const inlineContainer = { padding: '24px', background: '#EFF6FF', borderBottomWidth: '3px', borderBottomStyle: 'solid', borderBottomColor: '#4F46E5', boxShadow: 'inset 0 4px 6px -4px rgba(0,0,0,0.05)' };
const formHeaderInline = { fontSize: '12px', fontWeight: '900', color: '#1E40AF', textTransform: 'uppercase', letterSpacing: '0.05em' };
const formRowInline = { display: 'flex', gap: '24px', alignItems: 'flex-start' };
const inlineLabel = { display: 'block', fontSize: '11px', fontWeight: '700', color: '#1E3A8A', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.03em' };
const inlineMethodsGrid = { display: 'flex', flexWrap: 'wrap', gap: '8px' };
const payMethodInactive = { padding: '10px 14px', background: '#ffffff', borderWidth: '1px', borderStyle: 'solid', borderColor: '#CBD5E1', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', color: '#475569', transition: 'all 0.15s ease' };
const payMethodActive = { ...payMethodInactive, background: '#4F46E5', color: '#ffffff', borderColor: '#4F46E5', boxShadow: '0 4px 6px -1px rgba(79, 70, 229, 0.2)' };
const inlineInput = { width: '100%', padding: '12px', borderRadius: '8px', borderWidth: '2px', borderStyle: 'solid', borderColor: '#4F46E5', fontSize: '22px', fontWeight: '900', textAlign: 'center', color: '#0F172A', outline: 'none', background: '#ffffff', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)' };
const monnaieRendreStyle = { marginTop: '10px', padding: '6px', background: '#FEE2E2', color: '#991B1B', borderRadius: '6px', fontSize: '12px', fontWeight: '800', textAlign: 'center', border: '1px solid #FCA5A5' };
const btnConfirmFinal = { background: '#10B981', color: '#ffffff', border: 'none', padding: '12px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.15)', transition: 'background 0.2s ease' };
const modalOverlay = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' };
const modalContent = { background: '#ffffff', padding: '30px', borderRadius: '16px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', width: '380px', border: '1px solid #E2E8F0' };
const btnCancel = { padding: '10px 18px', borderRadius: '8px', borderWidth: '1px', borderStyle: 'solid', borderColor: '#CBD5E1', background: '#ffffff', cursor: 'pointer', fontSize: '13px', fontWeight: '600', color: '#475569', transition: 'all 0.15s ease' };
const btnConfirm = { padding: '10px 18px', borderRadius: '8px', border: 'none', background: '#4F46E5', color: 'ffffff', cursor: 'pointer', fontWeight: '700', fontSize: '13px', boxShadow: '0 2px 4px rgba(79, 70, 229, 0.15)', transition: 'background 0.2s ease' };

export default ValiderVente;