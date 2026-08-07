import React, { useState, useEffect } from 'react';
import { 
    CheckCircle2, Trash2, Search, BookOpen, AlertTriangle, PieChart, 
    Info, MessageSquare, XCircle, Clock, CheckSquare, XSquare, ExternalLink
} from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import API from '../../services/api';

const ValidationEcritures = () => {
    // --- ÉTATS ---
    const [loading, setLoading] = useState(false);
    const [piecesGroupées, setPiecesGroupées] = useState([]); 
    const [selectedPiece, setSelectedPiece] = useState(null); 
    const [selectedLigne, setSelectedLigne] = useState(null); 
    const [analytiqueDetail, setAnalytiqueDetail] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState('EN_ATTENTE');
    const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [motifRejet, setMotifRejet] = useState('');

    useEffect(() => { fetchBrouillons(); }, []);

    // --- RÉCUPÉRATION ET GROUPAGE DES DONNÉES ---
    const fetchBrouillons = async () => {
        try {
            setLoading(true);
            const res = await API.get('/plan-comptable/ecritures-brouillon/lignes-periodiques', {
                params: { journal_id: 'ALL', exercice_id: 'ALL', moisIdx: new Date().getMonth() }
            }); 
            if (res.data.success) {
                const allLines = res.data.data || [];
                const grouped = allLines.reduce((acc, line) => {
                    const refPiece = line.piece_provisoire || line.piece || 'SANS-PIECE';
                    const journalId = line.journal_id;
                    const groupKey = `${journalId}-${refPiece}`;
                    
                    if (!acc[groupKey]) {
                        acc[groupKey] = {
                            id: groupKey, 
                            journal_id: journalId,
                            journal_code: line.journal_code || '??',
                            piece_provisoire: refPiece, 
                            date_ecriture: line.date_ecriture,
                            facture: line.facture || '', 
                            reference: line.reference || '', // Le lot_id d'origine
                            libelle: line.libelle, 
                            statut: line.statut || 'EN_ATTENTE',
                            observation: line.observation || '',
                            total_debit: 0, 
                            total_credit: 0, 
                            lignes: []
                        };
                    }
                    acc[groupKey].lignes.push(line);
                    acc[groupKey].total_debit += parseFloat(line.debit || 0);
                    acc[groupKey].total_credit += parseFloat(line.credit || 0);
                    return acc;
                }, {});
                setPiecesGroupées(Object.values(grouped));
            }
        } catch (err) { showToast("Erreur de récupération", "error"); }
        finally { setLoading(false); }
    };

    // --- ACTIONS ---
    const handleSelectPiece = (piece) => {
        setSelectedPiece(piece);
        setShowRejectModal(false);
        setMotifRejet('');
        if (piece.lignes && piece.lignes.length > 0) {
            // Sélection automatique de la première ligne ventilée ou la première ligne tout court
            const ligneAVentiler = piece.lignes.find(l => l.is_ventilated === 1) || piece.lignes[0];
            fetchAnalytiqueDetail(ligneAVentiler);
        } else {
            setAnalytiqueDetail([]);
        }
    };

    const fetchAnalytiqueDetail = async (ligne) => {
        setSelectedLigne(ligne);
        setAnalytiqueDetail([]);
        if (!ligne.is_ventilated) return;
        try {
            const res = await API.get(`/analytique/saisie-brouillon/details/${ligne.id}`);
            if (res.data.success) setAnalytiqueDetail(res.data.data || []);
        } catch (err) { console.error("Erreur analytique:", err); }
    };

    const validerPiece = async () => {
        if (!selectedPiece) return;
        if (Math.abs(selectedPiece.total_debit - selectedPiece.total_credit) > 0.01) {
            showToast("La pièce est déséquilibrée", "error"); return;
        }
        try {
            setLoading(true);
            const res = await API.post('/plan-comptable/ecritures-brouillon/valider-piece', { 
                piece_provisoire: selectedPiece.piece_provisoire,
                journal_id: selectedPiece.journal_id 
            });
            if (res.data.success) {
                showToast(`Pièce ${selectedPiece.piece_provisoire} validée avec succès !`, "success");
                resetStatesAfterAction();
                fetchBrouillons();
            }
        } catch (err) { showToast(err.response?.data?.error || "Erreur validation", "error"); }
        finally { setLoading(false); }
    };

    const confirmerRejet = async () => {
        if (!motifRejet.trim()) {
            showToast("Veuillez saisir un motif pour le rejet", "error"); return;
        }
        try {
            setLoading(true);
            const res = await API.post('/plan-comptable/ecritures-brouillon/rejeter-piece', { 
                piece_provisoire: selectedPiece.piece_provisoire,
                journal_id: selectedPiece.journal_id,
                observation: motifRejet
            });
            if (res.data.success) {
                showToast("Pièce rejetée et libérée", "warning");
                resetStatesAfterAction();
                fetchBrouillons();
            }
        } catch (err) { showToast("Erreur lors du rejet", "error"); }
        finally { setLoading(false); }
    };

    const resetStatesAfterAction = () => {
        setSelectedPiece(null);
        setSelectedLigne(null);
        setAnalytiqueDetail([]);
        setShowRejectModal(false);
        setMotifRejet('');
    };

    const showToast = (message, type = 'success') => {
        setToast({ show: true, message, type });
        setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 4000);
    };

    // --- FILTRAGE ---
    const filtrées = piecesGroupées.filter(p => 
        p.statut === activeTab && (
            p.piece_provisoire.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.journal_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.libelle.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.reference.toLowerCase().includes(searchTerm.toLowerCase())
        )
    );

    const countByStatut = (statut) => piecesGroupées.filter(p => p.statut === statut).length;

    return (
        <div style={layoutStyle}>
            <Sidebar />
            <main style={mainStyle}>
                <header style={headerStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                        <h2 style={{ fontSize: '18px', fontWeight: 900, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <BookOpen size={20} color="#2563eb" /> VALIDATION DES BROUILLARDS
                        </h2>
                        <div style={tabContainer}>
                            <button style={activeTab === 'EN_ATTENTE' ? tabActive : tabStyle} onClick={() => {setActiveTab('EN_ATTENTE'); resetStatesAfterAction();}}>
                                <Clock size={14} /> EN ATTENTE ({countByStatut('EN_ATTENTE')})
                            </button>
                            <button style={activeTab === 'VALIDE' ? tabActiveSuccess : tabStyle} onClick={() => {setActiveTab('VALIDE'); resetStatesAfterAction();}}>
                                <CheckSquare size={14} /> VALIDÉES ({countByStatut('VALIDE')})
                            </button>
                            <button style={activeTab === 'REJETE' ? tabActiveDanger : tabStyle} onClick={() => {setActiveTab('REJETE'); resetStatesAfterAction();}}>
                                <XSquare size={14} /> REJETÉES ({countByStatut('REJETE')})
                            </button>
                        </div>
                    </div>
                    <div style={searchBar}>
                        <Search size={16} color="#94a3b8" />
                        <input type="text" placeholder="Rechercher une pièce, un lot..." style={searchInput} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                    </div>
                </header>

                <div style={contentArea}>
                    {/* 1. SECTION GAUCHE : LISTE DES PIÈCES */}
                    <div style={{ flex: '0 0 42%', display: 'flex', flexDirection: 'column', marginBottom: '12px' }}>
                        <h3 style={sectionTitle}>1. RÉCAPITULATIF DES PIÈCES</h3>
                        <div style={{ ...cardStyle, flex: 1, overflowY: 'auto' }}>
                            <table style={mainTable}>
                                <thead style={stickyHeader}>
                                    <tr style={{ background: '#0f172a', color: '#fff' }}>
                                        <th style={thStyleWhite}>DATE</th>
                                        <th style={thStyleWhite}>JRN</th>
                                        <th style={thStyleWhite}>PIÈCE</th>
                                        <th style={thStyleWhite}>LOT / RÉF.</th>
                                        <th style={thStyleWhite}>LIBELLÉ GÉNÉRAL</th>
                                        <th style={thCenterWhite}>DÉBIT</th>
                                        <th style={thCenterWhite}>CRÉDIT</th>
                                        <th style={thCenterWhite}>OK</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtrées.map((b) => (
                                        <tr key={b.id} 
                                            style={{ ...trStyle, background: selectedPiece?.id === b.id ? '#eff6ff' : 'transparent', cursor: 'pointer' }}
                                            onClick={() => handleSelectPiece(b)}
                                        >
                                            <td style={tdStyle}>{new Date(b.date_ecriture).toLocaleDateString()}</td>
                                            <td style={{ ...tdStyle, fontWeight: 900, color: '#64748b' }}>{b.journal_code}</td>
                                            <td style={{ ...tdStyle, fontWeight: 800, color: '#2563eb' }}>{b.piece_provisoire}</td>
                                            <td style={{ ...tdStyle, fontSize: '10px', color: '#6366f1', fontWeight: 700 }}>{b.reference || '-'}</td>
                                            <td style={{ ...tdStyle, fontWeight: 600, color: '#334155' }}>{b.libelle}</td>
                                            <td style={{ ...tdCenter, fontWeight: 700 }}>{b.total_debit.toLocaleString()}</td>
                                            <td style={{ ...tdCenter, fontWeight: 700 }}>{b.total_credit.toLocaleString()}</td>
                                            <td style={tdCenter}>
                                                {Math.abs(b.total_debit - b.total_credit) < 0.01 ? <CheckCircle2 size={16} color="#10b981" /> : <AlertTriangle size={16} color="#ef4444" />}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* 2. SECTION DROITE : DÉTAILS ET ANALYTIQUE */}
                    <div style={{ flex: 1, display: 'flex', gap: '15px', overflow: 'hidden' }}>
                        <div style={{ flex: '0 0 68%', display: 'flex', flexDirection: 'column' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                                <h3 style={sectionTitle}>2. DÉTAILS COMPTABLES (ÉCHÉANCES & TIERS)</h3>
                                {selectedPiece && selectedPiece.statut === 'EN_ATTENTE' && (
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button onClick={() => setShowRejectModal(true)} style={btnReject}><Trash2 size={14}/> REJETER</button>
                                        <button onClick={validerPiece} style={btnValidate} disabled={loading}>
                                            <CheckCircle2 size={14}/> {loading ? 'POSTAGE...' : 'VALIDER & TRANSFÉRER'}
                                        </button>
                                    </div>
                                )}
                            </div>

                            {showRejectModal && (
                                <div style={rejectPanel}>
                                    <div style={{display:'flex', justifyContent:'space-between', marginBottom:'5px'}}>
                                        <label style={{fontSize:'11px', fontWeight:900, color:'#991b1b'}}>MOTIF DU REJET :</label>
                                        <XCircle size={16} color="#94a3b8" cursor="pointer" onClick={() => setShowRejectModal(false)} />
                                    </div>
                                    <textarea style={textAreaStyle} placeholder="Expliquez pourquoi cette pièce est rejetée..." value={motifRejet} onChange={(e) => setMotifRejet(e.target.value)} />
                                    <button onClick={confirmerRejet} style={{...btnReject, width:'100%', marginTop:'5px', justifyContent:'center'}}>CONFIRMER LE REJET</button>
                                </div>
                            )}

                            <div style={{ ...cardStyle, flex: 1, overflowY: 'auto' }}>
                                <table style={mainTable}>
                                    <thead style={stickyHeader}>
                                        <tr style={{ background: '#f8fafc' }}>
                                            <th style={thStyleBlue}>COMPTE</th>
                                            <th style={thStyleBlue}>TIERS</th>
                                            <th style={thStyleBlue}>LIBELLÉ LIGNE</th>
                                            <th style={thStyleBlue}>ÉCHÉANCE</th>
                                            <th style={thCenterBlue}>DÉBIT</th>
                                            <th style={thCenterBlue}>CRÉDIT</th>
                                            <th style={thCenterBlue}>ANA.</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {selectedPiece ? (
                                            selectedPiece.lignes.map((l, idx) => (
                                                <tr key={idx} 
                                                    style={{ ...trStyle, background: selectedLigne?.id === l.id ? '#f0fdf4' : 'transparent', cursor: 'pointer' }} 
                                                    onClick={() => fetchAnalytiqueDetail(l)}
                                                >
                                                    <td style={{ ...tdStyle, fontWeight: 700 }}>{l.num_compte}</td>
                                                    <td style={{ ...tdStyle, color: '#2563eb', fontWeight: 800 }}>{l.num_tiers || '-'}</td>
                                                    <td style={tdStyle}>{l.libelle}</td>
                                                    <td style={{ ...tdStyle, color: '#64748b', fontSize: '10px' }}>
                                                        {l.date_echeance ? new Date(l.date_echeance).toLocaleDateString() : '-'}
                                                    </td>
                                                    <td style={{ ...tdCenter, fontWeight: 700, color: '#16a34a' }}>{parseFloat(l.debit || 0).toLocaleString()}</td>
                                                    <td style={{ ...tdCenter, fontWeight: 700, color: '#dc2626' }}>{parseFloat(l.credit || 0).toLocaleString()}</td>
                                                    <td style={tdCenter}>{l.is_ventilated ? <PieChart size={14} color="#10b981" /> : '-'}</td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr><td colSpan="7" style={emptyState}>Sélectionnez une pièce à gauche</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {selectedPiece?.observation && (
                                <div style={obsCard}>
                                    <div style={{display:'flex', alignItems:'center', gap:'5px', color:'#9a3412', marginBottom:'4px'}}>
                                        <MessageSquare size={14} /> <span style={{fontSize:'10px', fontWeight:900}}>NOTE DE REJET / OBSERVATION :</span>
                                    </div>
                                    <p style={{fontSize:'11px', color:'#475569', fontStyle:'italic'}}>{selectedPiece.observation}</p>
                                </div>
                            )}

                            <h3 style={{ ...sectionTitle, borderLeftColor: '#10b981' }}>3. RÉPARTITION ANALYTIQUE</h3>
                            <div style={{ ...cardStyle, flex: 1, overflowY: 'auto', background: '#fdfdfd' }}>
                                {analytiqueDetail.length > 0 ? (
                                    <table style={mainTable}>
                                        <thead style={stickyHeader}>
                                            <tr style={{background:'#ecfdf5'}}>
                                                <th style={thStyleBlue}>SECTION</th>
                                                <th style={thCenterBlue}>MONTANT</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {analytiqueDetail.map((ana, idx) => (
                                                <tr key={idx} style={trStyle}>
                                                    <td style={tdStyle}>
                                                        <div style={{ fontWeight: 800 }}>{ana.plan_nom}</div>
                                                        <div style={{ fontSize: '9px', color: '#059669' }}>{ana.dept_nom}</div>
                                                    </td>
                                                    <td style={tdCenter}>{parseFloat(ana.montant).toLocaleString()}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                ) : (
                                    <div style={emptyState}>
                                        <Info size={20}/>
                                        <p>{selectedLigne?.is_ventilated ? 'Chargement...' : 'Aucune ventilation sur cette ligne'}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
                {/* TOAST NOTIFICATION */}
                {toast.show && (
                    <div style={{ 
                        ...toastStyle, 
                        backgroundColor: toast.type === 'error' ? '#fee2e2' : (toast.type === 'warning' ? '#fff7ed' : '#dcfce7'), 
                        color: toast.type === 'error' ? '#991b1b' : (toast.type === 'warning' ? '#9a3412' : '#166534'),
                        border: `1px solid ${toast.type === 'error' ? '#fecaca' : (toast.type === 'warning' ? '#ffedd5' : '#bbf7d0')}`
                    }}>
                        {toast.message}
                    </div>
                )}
            </main>
        </div>
    );
};

// --- STYLES (Optimisés pour 100vh) ---
const layoutStyle = { display: 'flex', height: '100vh', background: '#f8fafc', fontFamily: "'Inter', sans-serif" };
const mainStyle = { flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' };
const headerStyle = { padding: '10px 25px', background: 'white', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
const tabContainer = { display: 'flex', gap: '5px', background: '#f1f5f9', padding: '3px', borderRadius: '8px' };
const tabStyle = { padding: '6px 12px', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', color: '#64748b', background: 'transparent' };
const tabActive = { ...tabStyle, background: 'white', color: '#2563eb', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' };
const tabActiveSuccess = { ...tabStyle, background: '#dcfce7', color: '#166534', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' };
const tabActiveDanger = { ...tabStyle, background: '#fee2e2', color: '#991b1b', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' };
const searchBar = { display: 'flex', alignItems: 'center', background: '#f1f5f9', padding: '5px 12px', borderRadius: '8px', gap: '8px', width: '280px' };
const searchInput = { background: 'transparent', border: 'none', outline: 'none', fontSize: '12px', width: '100%' };
const contentArea = { padding: '15px', display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' };
const sectionTitle = { fontSize: '10px', fontWeight: '900', color: '#1e293b', textTransform: 'uppercase', marginBottom: '5px', borderLeft: '4px solid #2563eb', paddingLeft: '8px' };
const cardStyle = { background: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' };
const mainTable = { width: '100%', borderCollapse: 'collapse' };
const stickyHeader = { position: 'sticky', top: 0, zIndex: 10 };
const thStyleWhite = { padding: '8px', background: '#0f172a', color: '#fff', fontSize: '9px', fontWeight: '800', textAlign: 'left' };
const thCenterWhite = { ...thStyleWhite, textAlign: 'center' };
const thStyleBlue = { padding: '8px', background: '#f8fafc', color: '#475569', fontSize: '9px', fontWeight: '800', textAlign: 'left', borderBottom: '2px solid #e2e8f0' };
const thCenterBlue = { ...thStyleBlue, textAlign: 'center' };
const tdStyle = { padding: '6px 10px', fontSize: '11px', color: '#334155', borderBottom: '1px solid #f1f5f9' };
const tdCenter = { ...tdStyle, textAlign: 'center' };
const trStyle = { borderBottom: '1px solid #f1f5f9' };
const btnValidate = { background: '#10b981', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', fontWeight: 800, fontSize: '10px', cursor: 'pointer', display: 'flex', gap: '5px' };
const btnReject = { background: '#ef4444', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', fontWeight: 800, fontSize: '10px', cursor: 'pointer', display: 'flex', gap: '5px' };
const rejectPanel = { background: '#fff1f2', padding: '10px', borderRadius: '8px', border: '1px solid #fecaca', marginBottom: '10px' };
const textAreaStyle = { width: '100%', height: '50px', borderRadius: '4px', border: '1px solid #fca5a5', padding: '8px', fontSize: '11px', outline: 'none', resize: 'none' };
const obsCard = { background: '#fff7ed', padding: '10px', borderRadius: '8px', border: '1px solid #ffedd5' };
const emptyState = { padding: '30px', textAlign: 'center', color: '#94a3b8', fontSize: '11px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' };
const toastStyle = { position: 'fixed', bottom: '20px', right: '20px', padding: '12px 24px', borderRadius: '8px', fontWeight: 700, zIndex: 1000, fontSize: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' };

export default ValidationEcritures;