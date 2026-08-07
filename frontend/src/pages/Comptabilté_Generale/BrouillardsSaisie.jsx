import React, { useState, useEffect, useCallback } from 'react';
import { 
    Wallet, Loader2, PencilLine, Landmark, 
    X, ArrowUpCircle, ArrowDownCircle, CheckCircle2, Clock, Save, Trash2, AlertCircle,
    Activity, History, Archive, ListFilter, Send
} from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import API, { socket, joinCompanyRoom } from '../../services/api';

const BrouillardsSaisie = () => {
    const [brouillards, setBrouillards] = useState([]);
    const [selectedB, setSelectedB] = useState(null); 
    const [operations, setOperations] = useState([]);
    const [soldes, setSoldes] = useState({ 
        reel: 0, 
        provisoire: 0, 
        attente_entree: 0, 
        attente_sortie: 0,
        attente_suppr_debit: 0,
        attente_suppr_credit: 0
    });
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [activeTab, setActiveTab] = useState('ACTIF'); 

    // 🎯 États pour l'annulation "sous la ligne"
    const [cancellingId, setCancellingId] = useState(null);
    const [motifAnnulation, setMotifAnnulation] = useState('');
    
    const [toast, setToast] = useState({ show: false, message: '', type: 'error', onConfirm: null });

    const [formData, setFormData] = useState({
        date_mouvement: new Date().toISOString().split('T')[0],
        libelle: '',
        piece_ref: '',
        montant: ''
    });

    const showToast = (message, type = 'error', onConfirm = null) => {
        setToast({ show: true, message, type, onConfirm });
        if (!onConfirm) {
            setTimeout(() => setToast({ show: false, message: '', type: 'error', onConfirm: null }), 4000);
        }
    };
// Stabilise fetchAccess pour qu'elle ne change pas à chaque rendu
const fetchAccess = useCallback(async () => {
    try {
        const res = await API.get('/treso/brouillards/mes-acces');
        setBrouillards(res.data || []);
    } catch (err) { console.error(err); } 
    finally { setLoading(false); }
}, []); 

// Stabilise fetchOps
const fetchOps = useCallback(async (id) => {
    if (!id) return;
    try {
        const res = await API.get(`/treso/operations/liste/${id}`);
        const ops = res.data.operations || [];
        
        const stats = ops.reduce((acc, op) => {
            if (op.statut === 'EN_ATTENTE' && op.type_flux === 'ENCAISSEMENT' && op.v1_statut !== 9) acc.attente_entree += op.montant;
            if (op.statut === 'EN_ATTENTE' && op.type_flux === 'DECAISSEMENT' && op.v1_statut !== 9) acc.attente_sortie += op.montant;
            if (op.statut === 'EN_ATTENTE' && op.type_flux === 'DECAISSEMENT' && op.v1_statut === 7) acc.attente_suppr_debit += op.montant;
            if (op.statut === 'EN_ATTENTE' && op.type_flux === 'ENCAISSEMENT' && op.v1_statut === 7) acc.attente_suppr_credit += op.montant;
            return acc;
        }, { attente_entree: 0, attente_sortie: 0, attente_suppr_debit: 0, attente_suppr_credit: 0 });

        setOperations(ops);
        setSoldes({ 
            reel: res.data.solde_reel || 0, 
            provisoire: res.data.solde_provisoire || 0,
            ...stats
        });
    } catch (err) { console.error("Erreur de chargement", err); }
}, []);

// A. Charger les accès une seule fois au montage
useEffect(() => {
    fetchAccess();
}, [fetchAccess]);

// B. Gérer les Sockets et le rafraîchissement
useEffect(() => {
    if (!socket) return;

    // Rejoindre la salle une seule fois quand le composant est prêt
    if (typeof joinCompanyRoom === 'function') joinCompanyRoom();

    const handleRefresh = () => {
        if (selectedB?.id) {
            console.log("⚡ Sync : Refresh pour", selectedB.libelle);
            fetchOps(selectedB.id);
        }
    };

    const handleDataEvent = (event) => {
        const impactTables = ['treasury_ops', 'brouillon_ecritures', 'analytic_details', 'plan_tiers', 'companies'];
        if (event && impactTables.includes(event.table)) {
            handleRefresh();
        }
    };

    socket.on('DATA_EVENT', handleDataEvent);
    socket.on('REFRESH_OP_TRESO', handleRefresh);
    socket.on('REFRESH_VENTILATION', handleRefresh);

    return () => {
        socket.off('DATA_EVENT', handleDataEvent);
        socket.off('REFRESH_OP_TRESO', handleRefresh);
        socket.off('REFRESH_VENTILATION', handleRefresh);
    };
}, [selectedB?.id, socket, fetchOps]); // fetchOps est maintenant stable grâce au useCallback
    const handleSelect = (b) => {
        setSelectedB(b);
        setEditingId(null);
        setCancellingId(null);
        setActiveTab('ACTIF');
        fetchOps(b.id);
    };

    const handleSaisieRapide = async (type) => {
        if (!selectedB) return showToast("Sélectionnez une caisse.");
        if (!formData.libelle || !formData.montant) return showToast("Libellé et montant requis.");

        setIsSubmitting(true);
        try {
            if (editingId) {
                await API.put(`/treso/operations/operation/modifier/${editingId}`, { ...formData });
                setEditingId(null);
            } else {
                await API.post('/treso/operations/operation/creer', {
                    ...formData,
                    type_flux: type,
                    brouillard_id: selectedB.id
                });
            }
            showToast("Opération enregistrée", "success");
            setFormData({ ...formData, libelle: '', piece_ref: '', montant: '' });
            fetchOps(selectedB.id);
        } catch (err) { 
            showToast(err.response?.data?.error || "Erreur serveur"); 
        } finally { setIsSubmitting(false); }
    };

    // 🎯 FONCTION D'ANNULATION AVEC MOTIF
    const handleAnnulerPiece = async (id) => {
        if (!motifAnnulation.trim()) return showToast("Le motif d'annulation est obligatoire.");
        
        setIsSubmitting(true);
        try {
            await API.delete(`/treso/operations/operation/supprimer/${id}`, {
                data: { motif: motifAnnulation } 
            });
            showToast("Demande d'annulation transmise", "success");
            setCancellingId(null);
            setMotifAnnulation('');
            fetchOps(selectedB.id);
        } catch (err) { 
            showToast(err.response?.data?.error || "Erreur"); 
        } finally { setIsSubmitting(false); }
    };

    const filteredOps = operations.filter(op => {
        const isArchive = op.statut === 'REJETE' || 
                         (op.libelle.includes("ANNUL") && op.statut === 'VALIDE') || 
                         (op.v1_statut === 9 && !operations.some(o => o.piece_comptable === op.piece_comptable && o.statut === 'EN_ATTENTE'));

        if (activeTab === 'ARCHIVE') return isArchive;
        return !isArchive;
    });

    const getRowStyle = (op) => {
        if (op.statut === 'REJETE') return { background: '#fff1f2', opacity: 0.7 };
        if (op.v1_statut === 9) return { background: '#f8fafc', color: '#94a3b8', textDecoration: 'line-through' };
        if (op.libelle.includes("ANNUL")) return { background: '#f0f9ff', color: '#0369a1', fontStyle: 'italic' };
        return {};
    };

    const getStatusBadge = (op) => {
        const base = { padding: '4px 8px', borderRadius: '6px', fontSize: '9px', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '4px', width: 'fit-content' };
        if (op.v1_statut === 9) return { ...base, background: '#e2e8f0', color: '#475569' }; 
        if (op.statut === 'VALIDE') return { ...base, background: '#dcfce7', color: '#15803d' };
        if (op.statut === 'EN_ATTENTE') return { ...base, background: '#fef9c3', color: '#854d0e' };
        if (op.statut === 'REJETE') return { ...base, background: '#fee2e2', color: '#b91c1c' };
        return { ...base, background: '#f1f5f9', color: '#475569' };
    };

    const BORDEAUX = '#800020';

    return (
        <div style={layoutStyle}>
            {toast.show && (
                <div style={{...toastStyle, background: toast.type === 'error' ? '#ef4444' : toast.type === 'warning' ? '#f59e0b' : '#10b981'}}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {toast.type === 'error' ? <AlertCircle size={18}/> : <CheckCircle2 size={18}/>}
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontWeight: '700' }}>{toast.message}</span>
                            {toast.onConfirm && (
                                <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                                    <button onClick={() => { toast.onConfirm(); setToast({...toast, show: false}); }} style={btnToastConfirm}>CONFIRMER</button>
                                    <button onClick={() => setToast({...toast, show: false})} style={btnToastCancel}>ANNULER</button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <Sidebar />
            <main style={mainStyle}>
                <header style={headerStyle}>
                    <div style={iconBox}><Wallet size={20} color="white" /></div>
                    <h1 style={titleStyle}>FLUX DE TRÉSORERIE</h1>
                </header>

                <div style={contentWrapper}>
                    <section style={sectionCaisse}>
                        <h2 style={sectionLabel}>CHOIX DU COMPTE</h2>
                        <div style={horizontalScroll}>
                            {loading ? <Loader2 className="animate-spin" size={20}/> : 
                             brouillards.map(b => (
                                <div key={b.id} onClick={() => handleSelect(b)} style={selectedB?.id === b.id ? cardActive : cardNormal}>
                                    <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                                        {b.type === 'BANQUE' ? <Landmark size={14}/> : <Wallet size={14}/>}
                                        <span style={{fontWeight:'900', fontSize:'12px'}}>{b.libelle}</span>
                                    </div>
                                    <div style={{fontSize:'10px', opacity:0.8}}>{b.compte_numero} | <b style={{color: BORDEAUX}}>{b.mode_fonctionnement}</b></div>
                                </div>
                            ))}
                        </div>
                    </section>

                    {selectedB ? (
                        <section style={sectionSaisie}>
                            <div style={toolbar}>
                                <div style={{display:'flex', flex: 1, gap:'15px', alignItems:'center'}}>
                                    <div style={tabGroup}>
                                        <button onClick={() => setActiveTab('ACTIF')} style={activeTab === 'ACTIF' ? tabActive : tabNormal}>
                                            <ListFilter size={14}/> BROUILLARD ACTIF
                                        </button>
                                        <button onClick={() => setActiveTab('ARCHIVE')} style={activeTab === 'ARCHIVE' ? tabArchiveActive : tabNormal}>
                                            <Archive size={14}/> ARCHIVES
                                        </button>
                                    </div>
                                    
                                    {selectedB.mode_fonctionnement === 'DEMANDE' && (
                                        <div style={statsContainer}>
                                            <div style={statItem}>
                                                <span style={statLabel}>ATTENTE ENTRÉE</span>
                                                <span style={{...statValue, color: '#10b981'}}>+{new Intl.NumberFormat().format(soldes.attente_entree)}</span>
                                            </div>
                                            <div style={statItem}>
                                                <span style={statLabel}>ATTENTE SORTIE</span>
                                                <span style={{...statValue, color: '#ef4444'}}>-{new Intl.NumberFormat().format(soldes.attente_sortie)}</span>
                                            </div>
                                            <div style={statItem}>
                                                <span style={statLabel}>SUPPR. DÉBIT</span>
                                                <span style={{...statValue, color: '#f59e0b'}}>-{new Intl.NumberFormat().format(soldes.attente_suppr_debit)}</span>
                                            </div>
                                            <div style={statItem}>
                                                <span style={statLabel}>SUPPR. CRÉDIT</span>
                                                <span style={{...statValue, color: '#0ea5e9'}}>+{new Intl.NumberFormat().format(soldes.attente_suppr_credit)}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div style={{display:'flex', gap:'20px', alignItems:'center'}}>
                                    <div style={soldeBlock}>
                                        <span style={soldeLabel}>SOLDE RÉEL</span>
                                        <b style={{...soldeValue, color: BORDEAUX}}>{new Intl.NumberFormat().format(soldes.reel)} F</b>
                                    </div>
                                    {selectedB.mode_fonctionnement === 'DEMANDE' && (
                                        <div style={soldeProvisoireBox}>
                                            <span style={soldeLabel}>SOLDE PROVISOIRE</span>
                                            <b style={{...soldeValue, color: '#64748b'}}>{new Intl.NumberFormat().format(soldes.provisoire)} F</b>
                                        </div>
                                    )}
                                    <button onClick={() => setSelectedB(null)} style={btnClose}><X size={18}/></button>
                                </div>
                            </div>

                            {activeTab === 'ACTIF' && (
                                <div style={editingId ? {...saisieRow, background:'#fff7ed'} : saisieRow}>
                                    <input type="date" style={{...inputSaisie, flex: 0.5}} value={formData.date_mouvement} disabled={editingId} onChange={e => setFormData({...formData, date_mouvement: e.target.value})} />
                                    <input placeholder="LIBELLÉ..." style={{...inputSaisie, flex: 2}} value={formData.libelle} onChange={e => setFormData({...formData, libelle: e.target.value.toUpperCase()})} />
                                    <input placeholder="REF" style={{...inputSaisie, flex: 0.8}} value={formData.piece_ref} onChange={e => setFormData({...formData, piece_ref: e.target.value})} />
                                    <input type="number" placeholder="0.00" style={{...inputSaisie, fontWeight:'900', color:BORDEAUX, flex: 1}} value={formData.montant} onChange={e => setFormData({...formData, montant: e.target.value})} />
                                    <div style={actionButtonsGroup}>
                                        {editingId ? (
                                            <div style={{display:'flex', gap:'5px'}}>
                                                <button onClick={handleSaisieRapide} disabled={isSubmitting} style={btnSaveEdit}><Save size={16}/> VALIDER</button>
                                                <button onClick={() => { setEditingId(null); setFormData({...formData, libelle: '', piece_ref: '', montant: ''}); }} style={btnCancelEdit}><X size={16}/></button>
                                            </div>
                                        ) : (
                                            <>
                                                <button onClick={() => handleSaisieRapide('ENCAISSEMENT')} disabled={isSubmitting} style={btnEncaisser}><ArrowUpCircle size={16}/> ENTRÉE</button>
                                                <button onClick={() => handleSaisieRapide('DECAISSEMENT')} disabled={isSubmitting} style={btnDecaisser}><ArrowDownCircle size={16}/> SORTIE</button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}

                            <div style={tableContainer}>
                                <table style={table}>
                                    <thead>
                                        <tr style={thRow}>
                                            <th style={th}>RÉFÉRENCE PIÈCE</th>
                                            <th style={th}>DATE</th>
                                            <th style={th}>LIBELLÉ</th>
                                            <th style={th} align="right">ENTRÉE</th>
                                            <th style={th} align="right">SORTIE</th>
                                            <th style={th}>STATUT</th>
                                            {activeTab === 'ACTIF' && <th style={th} align="center">ACTIONS</th>}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredOps.length === 0 ? (
                                            <tr><td colSpan="7" style={emptyRow}>Aucune opération.</td></tr>
                                        ) : filteredOps.map(op => (
                                            <React.Fragment key={op.id}>
                                                <tr style={{...tr, ...getRowStyle(op)}}>
                                                    <td style={{...td, fontWeight:'bold', color:BORDEAUX}}>{op.piece_comptable}</td>
                                                    <td style={td}>{op.date_mouvement}</td>
                                                    <td style={td}>
                                                        <div style={{fontWeight:'700'}}>{op.libelle}</div>
                                                        {op.piece_ref && <div style={{fontSize:'9px', color:'#94a3b8'}}>REF: {op.piece_ref}</div>}
                                                    </td>
                                                    <td style={{...td, color:'#10b981', fontWeight:'bold'}} align="right">
                                                        {op.type_flux === 'ENCAISSEMENT' ? new Intl.NumberFormat().format(op.montant) : '--'}
                                                    </td>
                                                    <td style={{...td, color:'#ef4444', fontWeight:'bold'}} align="right">
                                                        {op.type_flux === 'DECAISSEMENT' ? new Intl.NumberFormat().format(op.montant) : '--'}
                                                    </td>
                                                    <td style={td}>
                                                        <span style={getStatusBadge(op)}>
                                                            {op.v1_statut === 9 ? <History size={10}/> : op.statut === 'VALIDE' ? <CheckCircle2 size={10}/> : <Clock size={10}/>}
                                                            {op.v1_statut === 9 ? "EN ANNULATION" : op.statut}
                                                        </span>
                                                    </td>
                                                    {activeTab === 'ACTIF' && (
                                                        <td style={td} align="center">
                                                            <div style={{display:'flex', gap:'5px', justifyContent:'center'}}>
                                                                {(op.statut === 'BROUILLON' || op.statut === 'EN_ATTENTE') && op.v1_statut !== 9 && (
                                                                    <button onClick={() => { setEditingId(op.id); setFormData({ date_mouvement: op.date_mouvement, libelle: op.libelle, piece_ref: op.piece_ref || '', montant: op.montant }); }} style={btnMiniEdit} title="Modifier"><PencilLine size={12}/></button>
                                                                )}
                                                                {op.v1_statut !== 9 && op.statut !== 'REJETE' && (
                                                                    <button onClick={() => { setCancellingId(cancellingId === op.id ? null : op.id); setMotifAnnulation(''); }} style={cancellingId === op.id ? btnMiniDeleteActive : btnMiniDelete} title="Annuler"><Trash2 size={12}/></button>
                                                                )}
                                                            </div>
                                                        </td>
                                                    )}
                                                </tr>
                                                
                                                {/* 🎯 FORMULAIRE DE MOTIF SOUS LA LIGNE */}
                                                {cancellingId === op.id && (
                                                    <tr>
                                                        <td colSpan="7" style={cancelFormRow}>
                                                            <div style={cancelFormContainer}>
                                                                <div style={cancelFormHeader}>
                                                                    <AlertCircle size={14} color="#ef4444"/>
                                                                    <span>JUSTIFICATION DE L'ANNULATION POUR LA PIÈCE <b>{op.piece_comptable}</b></span>
                                                                </div>
                                                                <div style={cancelFormBody}>
                                                                    <input 
                                                                        autoFocus
                                                                        placeholder="POURQUOI VOULEZ-VOUS ANNULER CETTE PIÈCE ? (OBLIGATOIRE)" 
                                                                        style={inputMotif}
                                                                        value={motifAnnulation}
                                                                        onChange={e => setMotifAnnulation(e.target.value.toUpperCase())}
                                                                        onKeyDown={e => e.key === 'Enter' && handleAnnulerPiece(op.id)}
                                                                    />
                                                                    <div style={{display:'flex', gap:'8px'}}>
                                                                        <button onClick={() => handleAnnulerPiece(op.id)} disabled={isSubmitting} style={btnConfirmCancel}>
                                                                            {isSubmitting ? <Loader2 size={14} className="animate-spin"/> : <Send size={14}/>} ENVOYER
                                                                        </button>
                                                                        <button onClick={() => setCancellingId(null)} style={btnAbortCancel}><X size={14}/></button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    ) : (
                        <div style={placeholder}>
                            <Activity size={48} color="#cbd5e1" strokeWidth={1.5}/>
                            <p style={{marginTop:'15px', fontWeight:'500', color: '#64748b'}}>Sélectionnez un compte pour voir le brouillard.</p>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

// --- STYLES ADDITIONNELS (ANNULATION IN-LINE) ---
const cancelFormRow = { background: '#fef2f2', borderBottom: '2px solid #ef4444' };
const cancelFormContainer = { padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: '8px' };
const cancelFormHeader = { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '10px', fontWeight: '900', color: '#ef4444', textTransform: 'uppercase' };
const cancelFormBody = { display: 'flex', gap: '10px' };
const inputMotif = { flex: 1, padding: '8px 12px', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', outline: 'none', background: 'white' };
const btnConfirmCancel = { background: '#ef4444', color: 'white', border: 'none', padding: '0 15px', borderRadius: '6px', fontSize: '10px', fontWeight: '900', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' };
const btnAbortCancel = { background: '#94a3b8', color: 'white', border: 'none', padding: '0 10px', borderRadius: '6px', cursor: 'pointer' };
const btnMiniDeleteActive = { border:'none', background:'#ef4444', color:'white', padding:'6px', borderRadius:'4px', cursor:'pointer' };

// --- STYLES EXISTANTS ---
const statsContainer = { display: 'flex', gap: '15px', padding: '0 15px', borderLeft: '1px solid #e2e8f0', marginLeft: '10px' };
const statItem = { display: 'flex', flexDirection: 'column', alignItems: 'flex-start' };
const statLabel = { fontSize: '7px', fontWeight: '900', color: '#94a3b8', textTransform: 'uppercase' };
const statValue = { fontSize: '11px', fontWeight: '900' };
const tabGroup = { display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '8px', gap: '4px' };
const tabNormal = { border: 'none', background: 'transparent', padding: '6px 12px', borderRadius: '6px', fontSize: '10px', fontWeight: '900', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' };
const tabActive = { ...tabNormal, background: 'white', color: '#800020', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' };
const tabArchiveActive = { ...tabNormal, background: '#1e293b', color: 'white' };
const soldeProvisoireBox = { padding:'5px 15px', background:'#f1f5f9', borderRadius:'8px', border:'1px solid #e2e8f0' };
const layoutStyle = { display: 'flex', height: '100vh', background: '#f8fafc', overflow: 'hidden' };
const toastStyle = { position: 'fixed', top: '20px', right: '20px', padding: '15px 25px', borderRadius: '12px', color: 'white', zIndex: 9999, display: 'flex', alignItems: 'center', boxShadow: '0 10px 20px rgba(0,0,0,0.15)' };
const btnToastConfirm = { background: 'white', color: '#f59e0b', border: 'none', padding: '5px 12px', borderRadius: '4px', fontSize: '10px', fontWeight: '900', cursor: 'pointer' };
const btnToastCancel = { background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none', padding: '5px 12px', borderRadius: '4px', fontSize: '10px', fontWeight: '900', cursor: 'pointer' };
const mainStyle = { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' };
const headerStyle = { background: 'white', padding: '12px 30px', borderBottom: `3px solid #800020`, display: 'flex', alignItems: 'center', gap: '15px' };
const iconBox = { background: '#800020', padding: '8px', borderRadius: '8px' };
const titleStyle = { margin: 0, fontSize: '15px', fontWeight: '900' };
const contentWrapper = { padding: '20px', flex: 1, display: 'flex', flexDirection: 'column', gap: '15px', overflow:'hidden' };
const sectionCaisse = { background: 'white', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0' };
const sectionLabel = { fontSize: '9px', fontWeight: '900', color: '#94a3b8', marginBottom: '8px', textTransform: 'uppercase' };
const horizontalScroll = { display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '5px' };
const cardNormal = { minWidth: '180px', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', cursor: 'pointer', background: '#f8fafc' };
const cardActive = { ...cardNormal, borderColor: '#800020', background: '#fff1f2', color: '#800020' };
const sectionSaisie = { flex: 1, display: 'flex', flexDirection: 'column', background: 'white', borderRadius: '10px', border: '1px solid #e2e8f0', overflow: 'hidden' };
const toolbar = { background: 'white', padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9' };
const soldeBlock = { textAlign: 'right' };
const soldeLabel = { display: 'block', fontSize: '8px', fontWeight: '900', color: '#94a3b8' };
const soldeValue = { fontSize: '15px', fontWeight: '900' };
const btnClose = { border: 'none', background: '#f1f5f9', cursor: 'pointer', color: '#64748b', padding:'6px', borderRadius:'50%' };
const saisieRow = { display: 'flex', gap: '10px', padding: '15px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' };
const inputSaisie = { padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', fontWeight: '700', outline: 'none' };
const actionButtonsGroup = { display: 'flex', gap: '8px' };
const btnEncaisser = { background: '#10b981', color: 'white', border: 'none', padding: '0 15px', borderRadius: '6px', fontSize: '10px', fontWeight: '900', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' };
const btnDecaisser = { ...btnEncaisser, background: '#ef4444' };
const btnSaveEdit = { ...btnEncaisser, background: '#0369a1' };
const btnCancelEdit = { background: '#64748b', color: 'white', border: 'none', padding: '0 12px', borderRadius: '6px', cursor: 'pointer' };
const tableContainer = { flex: 1, overflowY: 'auto' };
const table = { width: '100%', borderCollapse: 'collapse' };
const thRow = { background: '#1e293b', position: 'sticky', top: 0, zIndex: 10 };
const th = { color: 'white', padding: '12px', fontSize: '10px', textAlign: 'left', fontWeight: '900', textTransform: 'uppercase' };
const tr = { borderBottom: '1px solid #f1f5f9' };
const td = { padding: '10px 12px', fontSize: '12px' };
const emptyRow = { padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' };
const btnMiniEdit = { border:'none', background:'#e0f2fe', color:'#0369a1', padding:'6px', borderRadius:'4px', cursor:'pointer' };
const btnMiniDelete = { border:'none', background:'#fee2e2', color:'#ef4444', padding:'6px', borderRadius:'4px', cursor:'pointer' };
const placeholder = { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' };

export default BrouillardsSaisie;