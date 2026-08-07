import React, { useState, useEffect } from 'react';
import { 
    CheckCircle2, XCircle, Search, Trash2, Loader2, Landmark, Wallet, 
    RefreshCw, ChevronDown, ChevronUp, AlertTriangle, UserCheck
} from 'lucide-react';
import API, { socket } from '../../services/api';
import Sidebar from '../../components/Sidebar';

const ValiderBrouillard = () => {
    const [demandes, setDemandes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('EN_ATTENTE'); 
    const [searchTerm, setSearchTerm] = useState('');
    const [processingId, setProcessingId] = useState(null);
    const [expandedId, setExpandedId] = useState(null); 
    const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

    const showToast = (message, type = 'success') => {
        setToast({ show: true, message, type });
        setTimeout(() => setToast(prev => ({ ...prev, show: false })), 3000);
    };

    const fetchDemandes = async () => {
        try {
            setLoading(true);
            const res = await API.get('/treso/operations/attente-validation');
            setDemandes(res.data || []);
        } catch (err) {
            showToast("Erreur de chargement", "error");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDemandes();
        socket.on('REFRESH_OP_TRESO', fetchDemandes);
        return () => socket.off('REFRESH_OP_TRESO');
    }, []);

    const handleAction = async (id, action) => {
        setProcessingId(id);
        try {
            await API.post(`/treso/operations/decider/${id}`, { action });
            showToast(`Opération ${action === 'APPROUVER' ? 'enregistrée' : 'rejetée'}`);
            setExpandedId(null);
            fetchDemandes(); 
        } catch (err) {
            showToast(err.response?.data?.error || "Erreur", "error");
        } finally {
            setProcessingId(null);
        }
    };

    // 🎯 CALCUL DES SOLDES RÉELS PAR JOURNAL (Uniquement VALIDE définitif)
    const soldesParJournal = demandes.reduce((acc, op) => {
        if (op.statut === 'VALIDE' && op.v1_statut !== 9) {
            const montant = op.type_flux === 'ENCAISSEMENT' ? op.montant : -op.montant;
            acc[op.brouillard_libelle] = (acc[op.brouillard_libelle] || 0) + montant;
        }
        return acc;
    }, {});

    // 🎯 LOGIQUE DE FILTRAGE MISE À JOUR (INCLUSION DU STATUT APPROUVE)
    const filteredData = demandes.filter(op => {
        const matchSearch = op.libelle.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           op.piece_comptable.toLowerCase().includes(searchTerm.toLowerCase());
        
        if (!matchSearch) return false;

        if (filter === 'ANNULATION') return [7, 8, 9].includes(op.v1_statut);
        
        // 🔥 CRITIQUE : 'EN_ATTENTE' (0 visa) ET 'APPROUVE' (1+ visa mais < seuil) restent ici
        if (filter === 'EN_ATTENTE') {
            return (op.statut === 'EN_ATTENTE' || op.statut === 'APPROUVE') && op.v1_statut !== 7;
        }
        
        if (filter === 'VALIDER') {
            return op.statut === 'VALIDE' && 
                   op.type_flux === 'DECAISSEMENT' && 
                   ![7, 8, 9].includes(op.v1_statut);
        }

        if (filter === 'REJETER') return op.statut === 'REJETE' && op.v1_statut !== 7;
        
        return true; 
    });

    const BORDEAUX = '#800020';

    const getStatutBadge = (statut) => {
        const base = { padding: '4px 8px', borderRadius: '4px', fontSize: '9px', fontWeight: '900', display:'inline-flex', alignItems:'center', gap:'4px' };
        if (statut === 'VALIDE') return { ...base, background: '#dcfce7', color: '#15803d' };
        if (statut === 'REJETE') return { ...base, background: '#fee2e2', color: '#b91c1c' };
        // 🟠 Badge Orange pour les signatures en cours
        if (statut === 'APPROUVE') return { ...base, background: '#ffedd5', color: '#9a3412', border:'1px solid #fed7aa' };
        return { ...base, background: '#f1f5f9', color: '#475569' };
    };

    return (
        <div style={layoutStyle}>
            {toast.show && (
                <div style={{...toastStyle, background: toast.type === 'error' ? '#ef4444' : '#10b981'}}>
                    {toast.message}
                </div>
            )}

            <Sidebar />
            <main style={mainStyle}>
                <header style={headerStyle}>
                    <div style={iconBox}><CheckCircle2 size={20} color="white" /></div>
                    <div>
                        <h1 style={titleStyle}>CENTRE DE VALIDATION TRÉSORERIE</h1>
                        <p style={{margin:0, fontSize:'11px', color:'#64748b'}}>Contrôlez les liquidités et validez les visas (Système de double signature).</p>
                    </div>
                </header>

                <div style={statsBar}>
                    {Object.entries(soldesParJournal).map(([label, solde]) => (
                        <div key={label} style={statCard}>
                            <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
                                <div style={{...dot, background: solde < 0 ? '#ef4444' : '#10b981'}}></div>
                                <span style={statLabel}>{label.toUpperCase()}</span>
                            </div>
                            <div style={{...statValue, color: solde < 0 ? '#ef4444' : '#0f172a'}}>
                                {new Intl.NumberFormat().format(solde)} <span style={{fontSize:'10px'}}>F</span>
                            </div>
                        </div>
                    ))}
                </div>

                <div style={toolbar}>
                    <div style={tabGroup}>
                        <button onClick={() => setFilter('EN_ATTENTE')} style={filter === 'EN_ATTENTE' ? tabActive : tabNormal}>
                            FLUX À VALIDER ({demandes.filter(d => (d.statut === 'EN_ATTENTE' || d.statut === 'APPROUVE') && d.v1_statut !== 7).length})
                        </button>
                        <button onClick={() => setFilter('VALIDER')} style={filter === 'VALIDER' ? tabActive : tabNormal}>
                            DÉPENSES SORTIES ({demandes.filter(d => d.statut === 'VALIDE' && d.type_flux === 'DECAISSEMENT' && ![7,8,9].includes(d.v1_statut)).length})
                        </button>
                        <button onClick={() => setFilter('REJETER')} style={filter === 'REJETER' ? tabActive : tabNormal}>
                            REJETÉES ({demandes.filter(d => d.statut === 'REJETE' && d.v1_statut !== 7).length})
                        </button>
                        <button onClick={() => setFilter('ANNULATION')} style={filter === 'ANNULATION' ? tabArchiveActive : tabNormal}>
                            ANNULATIONS ({demandes.filter(d => [7,8,9].includes(d.v1_statut)).length})
                        </button>
                    </div>
                    <div style={searchBox}>
                        <Search size={14} color="#94a3b8" />
                        <input placeholder="Rechercher une pièce..." style={searchInput} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                        <button onClick={fetchDemandes} style={btnRefresh}><RefreshCw size={14}/></button>
                    </div>
                </div>

                <div style={contentWrapper}>
                    {loading ? (
                        <div style={loaderBox}><Loader2 className="animate-spin" size={30} color={BORDEAUX} /></div>
                    ) : (
                        <div style={tableContainer}>
                            <table style={table}>
                                <thead>
                                    <tr>
                                        <th style={th}>COMPTE / UNITÉ</th>
                                        <th style={th}>N° PIÈCE</th>
                                        <th style={th}>DÉTAILS / AUTEUR</th>
                                        <th style={th} align="right">MONTANT</th>
                                        <th style={th}>STATUT ACTUEL</th>
                                        <th style={th} align="center">VOTRE DÉCISION</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredData.length === 0 ? (
                                        <tr><td colSpan="6" style={emptyRow}>Aucune opération en attente pour le moment.</td></tr>
                                    ) : filteredData.map(op => {
                                        const isProcedureAnnul = [7, 8, 9].includes(op.v1_statut);
                                        const impactPositif = op.type_flux === 'ENCAISSEMENT';
                                        
                                        return (
                                            <React.Fragment key={op.id}>
                                                <tr 
                                                    onClick={() => isProcedureAnnul && setExpandedId(expandedId === op.id ? null : op.id)}
                                                    style={{
                                                        ...tr, 
                                                        background: op.statut === 'APPROUVE' ? '#fffbeb' : (expandedId === op.id ? '#fff1f2' : 'white'),
                                                        cursor: isProcedureAnnul ? 'pointer' : 'default',
                                                        borderLeft: op.statut === 'APPROUVE' ? '4px solid #f59e0b' : (isProcedureAnnul ? `4px solid ${BORDEAUX}` : 'none')
                                                    }}
                                                >
                                                    <td style={td}>
                                                        <div style={caisseLabel}>
                                                            {op.brouillard_type === 'BANQUE' ? <Landmark size={12}/> : <Wallet size={12}/>}
                                                            {op.brouillard_libelle}
                                                        </div>
                                                    </td>
                                                    <td style={{...td, fontWeight:'bold', color:BORDEAUX}}>{op.piece_comptable}</td>
                                                    <td style={td}>
                                                        <div style={{fontWeight:'700', fontSize:'11px', display:'flex', alignItems:'center', gap:'8px'}}>
                                                            {isProcedureAnnul && <Trash2 size={12} color="#e11d48"/>}
                                                            {op.libelle}
                                                        </div>
                                                        <div style={{fontSize:'10px', color:'#64748b'}}>Saisi par : <b>{op.username}</b></div>
                                                    </td>
                                                    <td style={{...td, fontWeight:'900'}} align="right">
                                                        {new Intl.NumberFormat().format(op.montant)} F
                                                    </td>
                                                    <td style={td}>
                                                        <span style={getStatutBadge(op.statut)}>
                                                            {op.statut === 'APPROUVE' && <UserCheck size={10}/>}
                                                            {op.statut === 'APPROUVE' ? 'PARTIELLEMENT SIGNÉ' : op.statut}
                                                        </span>
                                                    </td>
                                                    <td style={td} align="center">
                                                        {(op.statut === 'EN_ATTENTE' || op.statut === 'APPROUVE') ? (
                                                            op.v1_statut !== 7 ? (
                                                                <div style={{display:'flex', gap:'5px', justifyContent:'center'}}>
                                                                    <button 
                                                                        disabled={processingId === op.id} 
                                                                        onClick={(e) => { e.stopPropagation(); handleAction(op.id, 'APPROUVER'); }} 
                                                                        style={btnApproveSmall}
                                                                    >
                                                                        {processingId === op.id ? '...' : 'SIGNER'}
                                                                    </button>
                                                                    <button 
                                                                        disabled={processingId === op.id} 
                                                                        onClick={(e) => { e.stopPropagation(); handleAction(op.id, 'REJETER'); }} 
                                                                        style={btnRejectSmall}
                                                                    >
                                                                        REJETER
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <span style={{fontSize:'9px', fontWeight:'900', color:BORDEAUX, cursor:'pointer'}} onClick={() => setExpandedId(expandedId === op.id ? null : op.id)}>
                                                                    {expandedId === op.id ? <ChevronUp size={14}/> : <ChevronDown size={14}/>} DÉTAILS ANNULATION
                                                                </span>
                                                            )
                                                        ) : (
                                                            <div style={{fontSize:'10px', color:'#94a3b8', fontStyle:'italic'}}>
                                                                {op.v1_statut === 9 ? 'Annulation validée' : 'Terminé'}
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>

                                                {expandedId === op.id && (
                                                    <tr>
                                                        <td colSpan="6" style={detailRow}>
                                                            <div style={detailContainer}>
                                                                <div style={detailGrid}>
                                                                    <div style={detailInfo}>
                                                                        <div style={detailHeader}>
                                                                            <AlertTriangle size={14} style={{marginRight:5}}/> 
                                                                            RAISON DE LA DEMANDE D'ANNULATION
                                                                        </div>
                                                                        <p style={detailText}>"{op.motif_annulation || "Aucun motif."}"</p>
                                                                    </div>
                                                                    <div style={impactSummary}>
                                                                        <div style={impactCard}>
                                                                            <span style={impactLabel}>IMPACT FINANCIER</span>
                                                                            <div style={{fontSize:'13px', fontWeight:'bold', marginTop:'5px', color: impactPositif ? '#10b981' : '#ef4444'}}>
                                                                                {impactPositif ? "REMBOURSEMENT (+)" : "ANNULATION DÉCAISSEMENT (-)"}
                                                                            </div>
                                                                            <div style={{fontSize:'12px', fontWeight:'900'}}>
                                                                                {new Intl.NumberFormat().format(op.montant)} F
                                                                            </div>
                                                                        </div>
                                                                        <div style={detailActions}>
                                                                            {op.statut === 'EN_ATTENTE' && (
                                                                                <>
                                                                                    <button disabled={processingId === op.id} onClick={() => handleAction(op.id, 'REJETER')} style={btnRejectLarge}>REFUSER</button>
                                                                                    <button disabled={processingId === op.id} onClick={() => handleAction(op.id, 'APPROUVER')} style={btnApproveLarge}>ACCEPTER L'ANNULATION</button>
                                                                                </>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

// --- STYLES (Identiques à votre demande avec ajouts badges) ---
const statsBar = { display: 'flex', gap: '15px', padding: '15px 30px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' };
const statCard = { background: 'white', padding: '10px 15px', borderRadius: '8px', border: '1px solid #e2e8f0', minWidth: '180px' };
const statLabel = { fontSize: '9px', fontWeight: '900', color: '#64748b' };
const statValue = { fontSize: '15px', fontWeight: '900', marginTop: '4px' };
const dot = { width: '6px', height: '6px', borderRadius: '50%' };
const layoutStyle = { display: 'flex', height: '100vh', background: '#f8fafc', overflow: 'hidden' };
const mainStyle = { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' };
const headerStyle = { background: 'white', padding: '12px 30px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '15px' };
const iconBox = { background: '#800020', padding: '10px', borderRadius: '10px' };
const titleStyle = { margin: 0, fontSize: '15px', fontWeight: '900' };
const toolbar = { padding: '10px 30px', background: 'white', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
const tabGroup = { display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '8px', gap: '4px' };
const tabNormal = { border: 'none', background: 'transparent', padding: '6px 15px', borderRadius: '6px', fontSize: '10px', fontWeight: '900', color: '#64748b', cursor: 'pointer' };
const tabActive = { ...tabNormal, background: 'white', color: '#800020', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' };
const tabArchiveActive = { ...tabNormal, background: '#1e293b', color: 'white' };
const searchBox = { display: 'flex', alignItems: 'center', gap: '10px', background: '#f1f5f9', padding: '6px 12px', borderRadius: '8px', width: '280px' };
const searchInput = { border: 'none', background: 'transparent', outline: 'none', fontSize: '11px', flex: 1 };
const btnRefresh = { border: 'none', background: 'none', cursor: 'pointer', color: '#64748b' };
const contentWrapper = { padding: '20px', flex: 1, display: 'flex', flexDirection: 'column' };
const tableContainer = { background: 'white', borderRadius: '10px', border: '1px solid #e2e8f0', overflowY: 'auto', flex: 1 };
const table = { width: '100%', borderCollapse: 'collapse' };
const th = { background: '#1e293b', padding: '12px', fontSize: '10px', color: 'white', textAlign: 'left', fontWeight: '900', position: 'sticky', top: 0, zIndex:10 };
const tr = { borderBottom: '1px solid #f1f5f9', transition: 'all 0.2s' };
const td = { padding: '10px 12px', fontSize: '11px' };
const caisseLabel = { display: 'flex', alignItems: 'center', gap: '6px', background: '#f1f5f9', padding: '3px 8px', borderRadius: '4px', fontWeight: '700', fontSize: '10px' };
const btnApproveSmall = { background:'#10b981', color:'white', border:'none', padding:'6px 12px', borderRadius:'4px', fontSize:'9px', fontWeight:'900', cursor:'pointer' };
const btnRejectSmall = { background:'#fee2e2', color:'#ef4444', border:'none', padding:'6px 12px', borderRadius:'4px', fontSize:'9px', fontWeight:'900', cursor:'pointer' };
const detailRow = { background: '#fff1f2' };
const detailContainer = { padding: '20px 30px' };
const detailGrid = { display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '25px' };
const detailInfo = { background: 'white', padding: '18px', borderRadius: '10px', border: '1px solid #fecaca' };
const detailHeader = { fontSize: '10px', fontWeight: '900', color: '#e11d48', marginBottom: '12px' };
const detailText = { margin: 0, fontSize: '13px', color: '#0f172a' };
const impactSummary = { display: 'flex', flexDirection: 'column', gap: '15px' };
const impactCard = { background: 'white', padding: '15px', borderRadius: '10px', border: '1px solid #e2e8f0' };
const impactLabel = { fontSize: '8px', fontWeight: '900', color: '#94a3b8' };
const detailActions = { display: 'flex', gap: '10px' };
const btnApproveLarge = { flex: 1.5, background: '#10b981', color: 'white', border: 'none', padding: '12px', borderRadius: '8px', fontWeight: '900', cursor: 'pointer' };
const btnRejectLarge = { flex: 1, background: '#ef4444', color: 'white', border: 'none', padding: '12px', borderRadius: '8px', fontWeight: '900', cursor: 'pointer' };
const emptyRow = { padding: '50px', textAlign: 'center', color: '#94a3b8' };
const loaderBox = { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' };
const toastStyle = { position: 'fixed', top: '20px', right: '20px', padding: '12px 25px', borderRadius: '8px', color: 'white', fontWeight: '900', zIndex: 1000 };

export default ValiderBrouillard;