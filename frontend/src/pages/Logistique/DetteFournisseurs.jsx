import React, { useState, useEffect, useMemo } from 'react';
import { 
    Search, Wallet, CreditCard, X, Check, 
    Loader2, AlertTriangle, ChevronDown, ChevronUp,
    History as HistoryIcon, Truck, Banknote
} from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import API from '../../services/api'; 

const DetteFournisseurs = () => {
    // --- ÉTATS ---
    const [allData, setAllData] = useState([]); 
    const [activeTab, setActiveTab] = useState('dette'); 
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    
    const [paymentMethods, setPaymentMethods] = useState([]); 
    const [selectedMethod, setSelectedMethod] = useState(''); 
    const [showFormId, setShowFormId] = useState(null); 
    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentReference, setPaymentReference] = useState(''); // ✅ AJOUTÉ : État pour la référence
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [expandedRow, setExpandedRow] = useState(null); 
    const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

    // --- CHARGEMENT INITIAL ---
    const fetchInitialData = async () => {
        setLoading(true);
        try {
            const endpoint = activeTab === 'dette' ? '/purchases/debts' : '/purchases/sold-history';
            
            const resData = await API.get(endpoint);
            setAllData(resData.data?.data || resData.data || []);

            if (paymentMethods.length === 0) {
                const resMethods = await API.get('/plan-comptable/paiements/methodes');
                const methods = resMethods.data?.data || resMethods.data || [];
                const activeMethods = methods.filter(m => Number(m.is_active) === 1);
                setPaymentMethods(activeMethods);
                if (activeMethods.length > 0) {
                    setSelectedMethod(activeMethods[0].code || activeMethods[0].nom); 
                }
            }
        } catch (err) {
            showToast("Erreur de récupération des données", "error");
        } finally {
            setLoading(false);
        }
    };

    // Un seul useEffect synchronisé sur activeTab pour éviter les doubles appels
    useEffect(() => { 
        fetchInitialData(); 
    }, [activeTab]);

    const showToast = (message, type = 'success') => {
        setToast({ show: true, message, type });
        setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3500);
    };

    const safeParse = (data) => {
        if (!data) return [];
        if (Array.isArray(data)) return data;
        try { return JSON.parse(data); } catch (e) { return []; }
    };

    // --- LOGIQUE DE CALCUL DYNAMIQUE NETTOYÉE ---
    const processedData = useMemo(() => {
        const search = searchTerm.toLowerCase().trim();

        return allData.map(providerData => {
            const facturesBrutes = safeParse(providerData.detail_achats);

            const facturesAnalysees = facturesBrutes.map(f => {
                const paiements = safeParse(f.paiements);
                
                // 🔑 ALIGNEMENT COMPTABLE SÉCURISÉ : Soustraire les retours d'avoirs ou annulations gérés positivement
                const totalPaye = paiements.reduce((sum, p) => {
                    const refTexte = String(p.reference_paiement || '').toUpperCase().trim();
                    const statutTexte = String(p.statut || '').toUpperCase().trim();
                    
                    const isAnnulation = statutTexte === 'ANNULEE' || refTexte === 'ANNULER';
                    const isRemboursement = refTexte === 'REMBOURSEMENT' || refTexte === 'AVOIR';

                    if (isAnnulation || isRemboursement) {
                        // On soustrait le montant de l'avoir ou de l'annulation pour corriger le payé net global
                        return sum - Number(p.montant || 0); 
                    } else {
                        return sum + Number(p.montant || 0);
                    }
                }, 0);
                
                const resteReel = Number(f.montant_total || 0) - totalPaye;
                
                return {
                    ...f,
                    resteDynamique: resteReel > 0.1 ? resteReel : 0,
                    totalPayeDynamique: totalPaye
                };
            });

            const matchesSearch = providerData.fournisseur?.toLowerCase().includes(search);
            if (facturesAnalysees.length === 0 || (!matchesSearch && search !== '')) return null;

            return {
                ...providerData,
                facturesAffichees: facturesAnalysees,
                total_du_global: facturesAnalysees.reduce((sum, f) => sum + Number(f.montant_total), 0),
                reste_a_payer_global: facturesAnalysees.reduce((sum, f) => sum + f.resteDynamique, 0)
            };
        }).filter(Boolean);
    }, [allData, searchTerm]);


    // --- ACTION DE RÈGLEMENT CORRIGÉE ---
    const handlePaymentSubmit = async (e, achat) => {
        e.preventDefault();
        const montant = parseFloat(paymentAmount);
        
        if (isNaN(montant) || montant <= 0) {
            return showToast("Veuillez saisir un montant valide", "error");
        }
        
        if (montant > (achat.resteDynamique + 0.1)) {
            return showToast(`Le montant dépasse la dette (${achat.resteDynamique.toLocaleString()} F)`, "error");
        }

        setIsSubmitting(true);
        try {
            // 🔑 ALIGNEMENT SÉCURISÉ : Envoi vers recordDebtPayment avec type_paiement standardisé à 'REGLEMENT'
            await API.post('/purchases/pay-debt', { 
                purchase_id: achat.id,
                montant: montant,
                moyen_paiement: selectedMethod,
                type_paiement: 'REGLEMENT',          // Injection comptable automatique pour le backend
                reference_paiement: paymentReference || 'REGLEMENT', // Maintien de votre référence textuelle
                date_paiement: new Date().toISOString(),
                fournisseur_id: achat.supplier_id 
            });

            showToast("Paiement enregistré et dette mise à jour !", "success");
            setShowFormId(null);
            setPaymentAmount('');
            setPaymentReference(''); // ✅ Nettoyage du champ référence après succès
            
            fetchInitialData();
        } catch (err) {
            const msg = err.response?.data?.message || "Erreur lors du traitement du paiement.";
            showToast(msg, "error");
        } finally {
            setIsSubmitting(false);
        }
    };


        return (
        <div style={layoutStyle}>
            <Sidebar />
            <main style={mainStyle}>
                
                {/* TOAST NOTIFICATION */}
                {toast.show && (
                    <div style={{
                        ...toastContainer, 
                        background: toast.type === 'success' ? '#059669' : '#dc2626',
                    }}>
                        {toast.type === 'success' ? <Check size={18} /> : <AlertTriangle size={18} />}
                        <div style={{fontWeight: '600'}}>{toast.message}</div>
                    </div>
                )}

                {/* ENTÊTE DE LA PAGE */}
                <header style={headerStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div style={iconBox}><Banknote size={24} color="white" /></div>
                        <div>
                            <h1 style={titleStyle}>RÈGLEMENT FOURNISSEURS</h1>
                            <span style={subtitleStyle}>Gestion des sorties de caisse et suivi des paiements</span>
                        </div>
                    </div>

                    {/* ONGLETS DE NAVIGATION */}
                    <div style={tabContainer}>
                        <button onClick={() => { setActiveTab('dette'); setExpandedRow(null); }} 
                                style={activeTab === 'dette' ? activeTabStyle : tabStyle}>
                            <AlertTriangle size={14} /> DETTES EN COURS
                        </button>
                        <button onClick={() => { setActiveTab('solder'); setExpandedRow(null); }} 
                                style={activeTab === 'solder' ? activeTabStyle : tabStyle}>
                            <Check size={14} /> ACHATS SOLDÉS
                        </button>
                    </div>
                </header>

                {/* ZONE DE RECHERCHE ET TABLEAU */}
                <div style={contentStyle}>
                    <div style={searchWrapper}>
                        <Search size={18} color="#64748b" />
                        <input type="text" 
                               placeholder="Rechercher par nom de fournisseur..." 
                               style={searchInput} 
                               value={searchTerm} 
                               onChange={(e) => { setSearchTerm(e.target.value); setExpandedRow(null); }} />
                    </div>

                    {loading ? (
                        <div style={center}><Loader2 className="animate-spin" size={40} color="#ef4444" /></div>
                    ) : (
                        <div style={tableWrapper}>
                            <table style={tableStyle}>
                                <thead>
                                    <tr>
                                        <th style={thStyle}>FOURNISSEUR</th>
                                        <th style={thStyle}>NOMBRE D'ACHATS</th>
                                        <th style={thStyle}>MONTANT TOTAL</th>
                                        <th style={thStyle}>{activeTab === 'dette' ? 'RESTE À PAYER' : 'STATUT'}</th>
                                        <th style={{...thStyle, textAlign:'center'}}>DÉTAILS</th>
                                    </tr>
                                </thead>
                                <tbody>
                            {processedData.length > 0 ? processedData.map(providerData => (
                                    <React.Fragment key={providerData.supplier_id || providerData.fournisseur}>
                                        {/* LIGNE PRINCIPALE DU FOURNISSEUR */}
                                        <tr style={{...trStyle, cursor: 'pointer', background: expandedRow === providerData.fournisseur ? '#fff1f2' : 'transparent'}} 
                                            onClick={() => setExpandedRow(expandedRow === providerData.fournisseur ? null : providerData.fournisseur)}>
                                            <td style={{...tdStyle, fontWeight:700, color:'#1e293b'}}>{providerData.fournisseur}</td>
                                            <td style={tdStyle}><span style={badgeCount}>{providerData.facturesAffichees?.length || 0} facture(s)</span></td>
                                            <td style={tdStyle}>{Number(providerData.total_du_global).toLocaleString()} F</td>
                                            <td style={tdStyle}>
                                                <span style={activeTab === 'dette' ? badgeDebt : badgeSuccess}>
                                                    {activeTab === 'dette' ? `${Number(providerData.reste_a_payer_global).toLocaleString()} F` : 'INTÉGRALEMENT PAYÉ'}
                                                </span>
                                            </td>
                                            <td style={{...tdStyle, textAlign:'center'}}>
                                                {expandedRow === providerData.fournisseur ? <ChevronUp size={18} color="#ef4444"/> : <ChevronDown size={18}/>}
                                            </td>
                                        </tr>
                                                                                      {/* Détails des factures pour ce fournisseur */}
                                            {expandedRow === providerData.fournisseur && (
                                                <tr>
                                                    <td colSpan="5" style={{background: '#fcfcfc', padding: '20px', borderBottom: '2px solid #fee2e2'}}>
                                                        <div style={horizontalScrollWrapper}>
                                                            {providerData.facturesAffichees.map(achat => (
                                                                <div key={achat.id} style={lotCardInline}>
                                                                   <div style={lotHeader}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Truck size={14} color="#ef4444" />
            <span style={{ fontWeight: 800, fontSize: '11px', textTransform: 'uppercase' }}>
                {/* Affiche le lot_id s'il existe, sinon le num_facture */}
                LOT: {achat.lot_id || achat.num_facture}
            </span>
        </div>
        
        {/* Date d'achat juste en dessous */}
        <span style={{ 
            fontSize: '10px', 
            color: '#64748b', 
            marginLeft: '22px', 
            fontWeight: '600' 
        }}>
            {achat.date_achat ? new Date(achat.date_achat).toLocaleDateString() : '---'}
        </span>
    </div>

    <span style={achat.resteDynamique > 0 ? lotResteBadge : lotSolderBadge}>
        {achat.resteDynamique > 0 ? `${achat.resteDynamique.toLocaleString()} F` : 'PAYÉ'}
    </span>
</div>

                                                                    <div style={paymentHistory}>
                                                                        <div style={paymentHistory}>
    <div style={miniTitle}><HistoryIcon size={10}/> Historique paiements</div>
    <div style={scrollHistoryBox}>
        {safeParse(achat.paiements).length > 0 ? (
            safeParse(achat.paiements).map((p, idx) => {
                const refTexte = String(p.reference_paiement || '').toUpperCase().trim();
                const statutTexte = String(p.statut || '').toUpperCase().trim();
                const modeTexte = String(p.mode_reglement || '').toUpperCase().trim();
                
                // 🔑 DÉTECTION COMPTABLE CORRIGÉE : Alignée sur les nouveaux types textuels
                const isAnnule = statutTexte === 'ANNULEE' || refTexte === 'ANNULER' || modeTexte.includes('ANNUL');
                const isAvoir = !isAnnule && (refTexte === 'REMBOURSEMENT' || refTexte === 'AVOIR' || modeTexte.includes('AVOIR') || Number(p.montant) < 0);

                // Application des styles de fond
                let fondCouleur = 'transparent';
                let texteCouleur = '#1e293b';

                if (isAnnule) {
                    fondCouleur = '#fee2e2'; // Rouge
                    texteCouleur = '#991b1b';
                } else if (isAvoir) {
                    fondCouleur = '#dbeafe'; // Bleu
                    texteCouleur = '#1e40af';
                } else if (statutTexte === 'VALIDEE') {
                    fondCouleur = '#d1fae5'; // Vert
                    texteCouleur = '#065f46';
                }

                return (
                    <div key={idx} style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '6px 8px',
                        borderRadius: '4px',
                        marginBottom: '3px',
                        background: fondCouleur,
                        width: '100%'
                    }}>
                        <span style={{ color: texteCouleur, fontSize: '11px' }}>
                            {new Date(p.date || p.date_reglement || p.created_at).toLocaleDateString()} - {' '}
                            <span style={{ fontWeight: 700, color: texteCouleur }}>{p.mode_reglement || 'Espèce'}</span>{' '}
                            {p.reference_paiement ? `(${p.reference_paiement})` : ''}
                        </span>
                        {/* Math.abs permet d'afficher proprement "20 000 F" au lieu de "-20 000 F" pour l'avoir bleu */}
                        <span style={{ fontWeight: 700, color: texteCouleur, fontSize: '11px', whiteSpace: 'nowrap' }}>
                            {Number(Math.abs(p.montant)).toLocaleString()} F
                        </span>
                    </div>
                );
            })
        ) : <p style={emptyText}>Aucun versement effectué</p>}
    </div>
</div>
                                                                </div>

                                                                    {achat.resteDynamique > 0 && (
                                                                        <div style={{marginTop:'12px'}}>
                                                                            {showFormId === achat.id ? (
                                                                                <form onSubmit={(e) => handlePaymentSubmit(e, achat)} style={inlineActionFormColumn}>
                                                                                    <select style={smallSelect} value={selectedMethod} onChange={(e) => setSelectedMethod(e.target.value)}>
                                                                                        {paymentMethods.map(m => (
                                                                                            <option key={m.id} value={m.code || m.nom}>{m.libelle || m.nom}</option>
                                                                                        ))}
                                                                                    </select>
                                                                                    <div style={{display:'flex', gap:'4px'}}>
                                                                                        <input 
                                                                                            type="number" step="0.01" autoFocus style={smallInput}
                                                                                            placeholder="Montant..." value={paymentAmount}
                                                                                            onChange={e => setPaymentAmount(e.target.value)}
                                                                                            required
                                                                                        />
                                                                                        <button type="submit" disabled={isSubmitting} style={btnCheck}>
                                                                                            {isSubmitting ? <Loader2 className="animate-spin" size={14}/> : <Check size={14}/>}
                                                                                        </button>
                                                                                        <button type="button" onClick={() => {setShowFormId(null); setPaymentAmount('');}} style={btnX}><X size={14}/></button>
                                                                                    </div>
                                                                                </form>
                                                                            ) : (
                                                                                <button onClick={(e) => { e.stopPropagation(); setShowFormId(achat.id); setPaymentAmount(achat.resteDynamique); }} style={btnPayLot}>
                                                                                    <CreditCard size={14}/> ENREGISTRER PAIEMENT
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    )) : (
                                        <tr>
                                            <td colSpan="5" style={{padding:'60px', textAlign:'center', color:'#64748b'}}>
                                                <Truck size={40} style={{margin:'0 auto 10px', opacity:0.3}}/>
                                                <p>Aucun dossier trouvé dans cette catégorie.</p>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};


// --- STYLES MIS À JOUR (Thème Rouge/Gris pour les Sorties) ---
const toastContainer = { position: 'fixed', top: '30px', right: '30px', padding: '16px 24px', borderRadius: '12px', color: 'white', zIndex: 10000, display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.2)', fontSize: '14px' };
const horizontalScrollWrapper = { display: 'flex', flexWrap: 'wrap', gap: '15px', width: '100%' };
const lotCardInline = { minWidth: '260px', background: 'white', padding: '15px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' };
const scrollHistoryBox = { maxHeight: '100px', overflowY: 'auto' };
const inlineActionFormColumn = { display: 'flex', flexDirection: 'column', gap: '8px' };
const smallSelect = { padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none' };
const layoutStyle = { display: 'flex', height: '100vh', background: '#f8fafc', overflow: 'hidden' };
const mainStyle = { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' };
const headerStyle = { background: 'white', padding: '15px 30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0' };
const titleStyle = { margin: 0, fontSize: '18px', fontWeight: '900', color: '#1e293b' };
const subtitleStyle = { fontSize: '11px', color: '#64748b' };
const iconBox = { background: '#ef4444', padding: '10px', borderRadius: '10px' };
const contentStyle = { padding: '25px 30px', flex: 1, overflowY: 'auto' };
const tableWrapper = { background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' };
const tableStyle = { width: '100%', borderCollapse: 'collapse' };
const thStyle = { background: '#f8fafc', padding: '15px 12px', textAlign: 'left', fontSize: '11px', fontWeight: 900, color: '#64748b', textTransform: 'uppercase' };
const trStyle = { borderBottom: '1px solid #f1f5f9', transition: 'background 0.2s' };
const tdStyle = { padding: '15px 12px', fontSize: '13px' };
const lotHeader = { display: 'flex', justifyContent: 'space-between', marginBottom: '12px', alignItems: 'center' };
const lotResteBadge = { background: '#fee2e2', color: '#b91c1c', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 800 };
const lotSolderBadge = { background: '#dcfce7', color: '#15803d', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 800 };
const paymentHistory = { background: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #f1f5f9' };
const miniTitle = { fontSize: '10px', fontWeight: 800, color: '#94a3b8', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '5px' };
const paymentRow = { display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '5px 0', borderBottom: '1px solid #e2e8f0' };
const btnPayLot = { width:'100%', background: '#ef4444', color: 'white', border: 'none', padding: '10px', borderRadius: '8px', cursor: 'pointer', fontSize: '11px', fontWeight: '800', display:'flex', alignItems:'center', justifyContent:'center', gap: '8px' };
const smallInput = { flex: 1, padding: '8px', borderRadius: '6px', border: '2px solid #ef4444', fontSize: '12px', outline: 'none' };
const btnCheck = { background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', padding: '0 12px', cursor: 'pointer' };
const btnX = { background: '#64748b', color: 'white', border: 'none', borderRadius: '6px', padding: '0 12px', cursor: 'pointer' };
const badgeCount = { background: '#f1f5f9', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', color: '#475569' };
const badgeDebt = { background: '#fef2f2', color: '#dc2626', padding: '5px 10px', borderRadius: '8px', fontWeight: 800, fontSize: '12px' };
const badgeSuccess = { background: '#f0fdf4', color: '#16a34a', padding: '5px 10px', borderRadius: '8px', fontWeight: 800, fontSize: '12px' };
const searchWrapper = { display: 'flex', alignItems: 'center', gap: '12px', background: 'white', padding: '12px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' };
const searchInput = { border: 'none', outline: 'none', width: '100%', fontSize: '14px' };
const tabContainer = { display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '10px' };
const tabStyle = { border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '11px', fontWeight: '800', color: '#64748b', background: 'transparent', display:'flex', alignItems:'center', gap:'6px', transition: 'all 0.2s' };
const activeTabStyle = { ...tabStyle, background: 'white', color: '#ef4444', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' };
const center = { display: 'flex', justifyContent: 'center', padding: '60px' };
const emptyText = { fontSize:'11px', fontStyle:'italic', margin:0, color: '#94a3b8', textAlign: 'center' };

export default DetteFournisseurs;