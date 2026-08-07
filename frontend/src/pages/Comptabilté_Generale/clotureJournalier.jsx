import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
    Loader2, CheckCircle2, RefreshCw, AlertTriangle, ShieldCheck, 
    Calendar, CheckSquare, Square, XCircle, ArrowRight, RotateCcw,
    Info, Bell, TriangleAlert
} from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import API from '../../services/api';

/**
 * COMPOSANT : ClotureJournalier
 * Flux ERP centralisé avec Toast System et Dialogues intégrés.
 */
const ClotureJournalier = () => {
    // --- ÉTATS SYSTÈME (TOAST & MODALES) ---
    const [toast, setToast] = useState(null);
    const [confirmDialog, setConfirmDialog] = useState({ show: false, message: '', action: null });

    // --- ÉTATS DE NAVIGATION ET CHARGEMENT ---
    const [activeTab, setActiveTab] = useState('READY'); 
    const [loading, setLoading] = useState(false);
    const [scanning, setScanning] = useState(true);
    
    // --- ÉTATS DES DONNÉES ---
    const [readyQueue, setReadyQueue] = useState([]); 
    const [orphanQueue, setOrphanQueue] = useState([]); 
    const [selectedIds, setSelectedIds] = useState([]); 
    const [ecrituresPreview, setEcrituresPreview] = useState([]); 

    const [readyFilters, setReadyFilters] = useState({ start: '', end: '', type: 'ALL' });
    const [manualFilters, setManualFilters] = useState({ start: '', end: '', type: 'ALL' });

    const tablesERP = [
        { id: 'sales', label: 'VENTES ARTICLES (PF)', type: 'VENTE' },
        { id: 'purchases', label: 'ACHATS ARTICLES (PF)', type: 'ACHAT PF' },
        { id: 'purchases_mp', label: 'ACHATS MATIÈRES P.', type: 'ACHAT MP' },
        { id: 'inventories', label: 'INVENTAIRE ARTICLES (PF)', type: 'INV PF' },
        { id: 'inventories_mp', label: 'INVENTAIRE MATIÈRES P.', type: 'INV MP' },
        { id: 'inventories_psf', label: 'INVENTAIRE SEMI-FINIS', type: 'INV PSF' },
        { id: 'stock_operations_pf', label: 'OP. STOCK PRODUITS F.', type: 'STOCK PF' },
        { id: 'stock_operations_mp', label: 'OP. STOCK MATIÈRES P.', type: 'STOCK MP' },
        { id: 'stock_operations_psf', label: 'OP. STOCK SEMI-FINIS', type: 'STOCK PSF' },
        { id: 'production_needs', label: 'PRODUCTION (BESOINS)', type: 'PROD' },
    ];

    // --- LOGIQUE TOAST ---
    const showMessage = (msg, type = 'info') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 4000);
    };

    // --- RÉCUPÉRATION DES DONNÉES ---
    const fetchList = useCallback(async (tab) => {
        setScanning(true);
        const filters = tab === 'READY' ? readyFilters : manualFilters;
        try {
            const params = new URLSearchParams();
            if (filters.start) params.append('start', filters.start);
            if (filters.end) params.append('end', filters.end);

            const res = await API.get(`/compta/cloture/pending-sync?${params.toString()}`);
            
            if (tab === 'READY') {
                setReadyQueue(res.data.list?.ready || []);
                setSelectedIds([]); 
            } else {
                setOrphanQueue(res.data.list?.orphans || []);
            }
        } catch (err) {
            showMessage("Erreur de connexion au serveur", "error");
        } finally {
            setScanning(false);
        }
    }, [readyFilters, manualFilters]);

    useEffect(() => {
        fetchList(activeTab);
    }, [activeTab, fetchList]);

    const currentFilters = activeTab === 'READY' ? readyFilters : manualFilters;

    const updateFilter = (key, value) => {
        if (activeTab === 'READY') setReadyFilters(prev => ({ ...prev, [key]: value }));
        else setManualFilters(prev => ({ ...prev, [key]: value }));
    };

    const handleReset = () => {
        const resetValues = { start: '', end: '', type: 'ALL' };
        if (activeTab === 'READY') setReadyFilters(resetValues);
        else setManualFilters(resetValues);
        setTimeout(() => fetchList(activeTab), 10);
    };

    const centralizeLignes = (lignes) => {
        const acc = {};
        lignes.forEach(l => {
            const key = `${l.date}-${l.code_journal}-${l.numero_compte}-${l.num_tiers || 'SANS'}`;
            if (!acc[key]) {
                acc[key] = { ...l, debit: 0, credit: 0 };
            }
            acc[key].debit += (l.debit || 0);
            acc[key].credit += (l.credit || 0);
        });
        return Object.values(acc).map(l => ({
            ...l,
            debit: Math.round(l.debit * 100) / 100,
            credit: Math.round(l.credit * 100) / 100
        })).sort((a, b) => a.date.localeCompare(b.date) || a.code_journal.localeCompare(b.code_journal));
    };

    const handleSimulerEcritures = async () => {
        if (selectedIds.length === 0) return;
        setLoading(true);
        try {
            const itemsToSimulate = readyQueue.filter(i => selectedIds.includes(i.id));
            const res = await API.post('/compta/cloture/simuler', { items: itemsToSimulate });
            setEcrituresPreview(centralizeLignes(res.data.lignes || []));
            showMessage("Simulation générée avec succès", "success");
        } catch (err) { 
            showMessage("Erreur lors de la simulation", "error"); 
        } finally { 
            setLoading(false); 
        }
    };

    const handleValiderCloture = () => {
        setConfirmDialog({
            show: true,
            message: `Voulez-vous vraiment injecter ces ${selectedIds.length} écritures en comptabilité ?`,
            action: executeCloture
        });
    };

    const executeCloture = async () => {
        setLoading(true);
        setConfirmDialog({ ...confirmDialog, show: false });
        try {
            await API.post('/compta/cloture/executer', { items: readyQueue.filter(i => selectedIds.includes(i.id)) });
            showMessage("Centralisation terminée avec succès !", "success");
            fetchList('READY');
            setEcrituresPreview([]);
        } catch (err) { 
            showMessage("Erreur critique lors de l'injection", "error"); 
        } finally { 
            setLoading(false); 
        }
    };

    const filteredData = useMemo(() => {
        const list = activeTab === 'READY' ? readyQueue : orphanQueue;
        const typeFilter = activeTab === 'READY' ? readyFilters.type : manualFilters.type;
        return list.filter(item => typeFilter === 'ALL' || item.type === typeFilter);
    }, [activeTab, readyQueue, orphanQueue, readyFilters.type, manualFilters.type]);

    return (
        <div style={layoutStyle}>
            <Sidebar />
            <main style={mainStyle}>
                {/* --- SYSTÈME DE TOAST --- */}
                {toast && (
                    <div style={{...toastContainer, backgroundColor: toast.type === 'error' ? '#fee2e2' : '#dcfce7', border: `1px solid ${toast.type === 'error' ? '#ef4444' : '#10b981'}`}}>
                        {toast.type === 'error' ? <AlertTriangle size={18} color="#ef4444"/> : <CheckCircle2 size={18} color="#10b981"/>}
                        <span style={{color: toast.type === 'error' ? '#991b1b' : '#166534', fontSize:'13px', fontWeight:'500'}}>{toast.msg}</span>
                    </div>
                )}

                {/* --- MODALE DE CONFIRMATION --- */}
                {confirmDialog.show && (
                    <div style={overlayStyle}>
                        <div style={modalStyle}>
                            <Bell size={32} color="#3b82f6" style={{marginBottom:'10px'}}/>
                            <h3 style={{margin:'0 0 10px 0', fontSize:'16px'}}>Confirmation</h3>
                            <p style={{fontSize:'14px', color:'#64748b', textAlign:'center', margin:'0 0 20px 0'}}>{confirmDialog.message}</p>
                            <div style={{display:'flex', gap:'10px', width:'100%'}}>
                                <button onClick={() => setConfirmDialog({...confirmDialog, show:false})} style={btnCancelModal}>Annuler</button>
                                <button onClick={confirmDialog.action} style={btnConfirmModal}>Confirmer</button>
                            </div>
                        </div>
                    </div>
                )}

                <header style={headerStyle}>
                    <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                        <ShieldCheck size={24} color="#10b981" />
                        <h1 style={titleStyle}>CENTRALISATION COMPTABLE</h1>
                    </div>
                    <div style={dateSelector}>
                        <Calendar size={16} color="#64748b" />
                        <input type="date" value={currentFilters.start} onChange={(e) => updateFilter('start', e.target.value)} style={dateInput} />
                        <span style={{color:'#cbd5e1'}}>au</span>
                        <input type="date" value={currentFilters.end} onChange={(e) => updateFilter('end', e.target.value)} style={dateInput} />
                        <button onClick={() => fetchList(activeTab)} style={refreshBtn} title="Appliquer le filtre">
                            <RefreshCw size={14} className={scanning ? "animate-spin" : ""} />
                        </button>
                        <button onClick={handleReset} style={resetBtn} title="Vider les filtres">
                            <RotateCcw size={14} />
                        </button>
                    </div>
                </header>

                <div style={container}>
                    <div style={tabContainer}>
                        <button onClick={() => { setActiveTab('READY'); setEcrituresPreview([]); }} style={activeTab === 'READY' ? tabActive : tabInactive}>
                            <CheckCircle2 size={16} /> AUTOMATISABLE ({readyQueue.length})
                        </button>
                        <button onClick={() => { setActiveTab('MANUAL'); setEcrituresPreview([]); }} style={activeTab === 'MANUAL' ? tabActiveManual : tabInactive}>
                            <AlertTriangle size={16} /> SAISIE MANUELLE ({orphanQueue.length})
                        </button>
                    </div>

                    <div style={sectionCard}>
                        <div style={sectionHeader}>
                            <span>LISTE DES OPÉRATIONS ({filteredData.length})</span>
                            <select style={selectStyle} value={currentFilters.type} onChange={(e) => updateFilter('type', e.target.value)}>
                                <option value="ALL">Tous les modules ERP</option>
                                {tablesERP.map(t => <option key={t.id} value={t.type}>{t.label}</option>)}
                            </select>
                        </div>
                        <div style={tableWrapper}>
                            <table style={tableStyle}>
                                <thead>
                                    <tr>
                                        {activeTab === 'READY' && (
                                            <th style={thCenter} onClick={() => setSelectedIds(selectedIds.length === filteredData.length ? [] : filteredData.map(i => i.id))}>
                                                {selectedIds.length === filteredData.length && filteredData.length > 0 ? <CheckSquare size={16} color="#10b981" /> : <Square size={16} color="#cbd5e1" />}
                                            </th>
                                        )}
                                        <th style={thStyle}>DATE</th>
                                        <th style={thStyle}>MODULE</th>
                                        <th style={thStyle}>REF / LOT</th>
                                        <th style={thStyle}>LIBELLÉ SOURCE</th>
                                        <th style={thStyle}>MONTANT</th>
                                        <th style={thStyle}>MODE</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {scanning ? (
                                        <tr><td colSpan="7" style={emptyState}><Loader2 className="animate-spin" /> Scan en cours...</td></tr>
                                    ) : filteredData.length === 0 ? (
                                        <tr><td colSpan="7" style={emptyState}>Aucune donnée trouvée.</td></tr>
                                    ) : filteredData.map((item) => (
                                        <tr key={item.id} onClick={() => activeTab === 'READY' && setSelectedIds(prev => prev.includes(item.id) ? prev.filter(id => id !== item.id) : [...prev, item.id])} style={{cursor: activeTab === 'READY' ? 'pointer' : 'default', background: selectedIds.includes(item.id) ? '#f0fdf4' : '#fff'}}>
                                            {activeTab === 'READY' && <td style={tdCenter}>{selectedIds.includes(item.id) ? <CheckSquare size={16} color="#10b981"/> : <Square size={16} color="#cbd5e1"/>}</td>}
                                            <td style={tdStyle}>{new Date(item.date).toLocaleDateString('fr-FR')}</td>
                                            <td style={tdStyle}><span style={item.type.includes('VENTE') ? badgeVente : badgeAchat}>{item.type}</span></td>
                                            <td style={tdStyle}><b>{item.lot_id}</b></td>
                                            <td style={tdStyle}>{item.label}</td>
                                            <td style={tdMontant}>{item.amount?.toLocaleString('fr-FR')}</td>
                                            <td style={{...tdStyle, color: activeTab === 'MANUAL' ? '#ef4444' : '#64748b', fontWeight:'bold'}}>{item.mode_reglement || 'N/A'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                                        </div>

                    {/* Zone des boutons d'actions principaux (Simuler et Valider côte à côte) */}
                    {activeTab === 'READY' && (
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '15px', margin: '20px 0' }}>
                            <button 
                                onClick={handleSimulerEcritures} 
                                disabled={selectedIds.length === 0 || loading} 
                                style={selectedIds.length > 0 ? btnSimul : btnDisabled}
                            >
                                {loading ? <Loader2 className="animate-spin" /> : "SIMULER L'ÉCRITURE COMPTABLE"}
                            </button>

                            {/* Le bouton vert s'affiche ici uniquement si la simulation est générée */}
                            {ecrituresPreview.length > 0 && (
                                <button 
                                    onClick={handleValiderCloture} 
                                    style={{ ...btnFinal, margin: 0 }} // Annulation des marges bloquantes éventuelles du style d'origine
                                >
                                    VALIDER LA CENTRALISATION
                                </button>
                            )}
                        </div>
                    )}

                    {/* Tableau du brouillard de prévisualisation (Simulation en dessous) */}
                    {activeTab === 'READY' && ecrituresPreview.length > 0 && (
                        <div style={{...sectionCard, borderTop:'4px solid #3b82f6', marginTop:'10px'}}>
                            <div style={sectionHeader}>
                                <span>BROUILLARD DE PRÉVISUALISATION (CENTRALISÉ)</span>
                                <button onClick={() => setEcrituresPreview([])} style={btnSmallCancelStyle}><XCircle size={14}/> Annuler</button>
                            </div>
                            <div style={tableWrapper}>
                                <table style={tableStyle}>
                                    <thead>
                                        <tr style={{background: '#f8fafc'}}>
                                            <th style={thStyle}>DATE</th>
                                            <th style={thStyle}>JOURNAL</th>
                                            <th style={thStyle}>COMPTE</th>
                                            <th style={thStyle}>TIERS</th>
                                            <th style={thStyle}>LIBELLÉ</th>
                                            <th style={{...thStyle, textAlign:'right'}}>DÉBIT</th>
                                            <th style={{...thStyle, textAlign:'right'}}>CRÉDIT</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {ecrituresPreview.map((row, i) => (
                                            <tr key={i} style={{borderBottom:'1px solid #f1f5f9'}}>
                                                <td style={tdStyle}>{row.date ? new Date(row.date).toLocaleDateString('fr-FR') : '-'}</td>
                                                <td style={tdStyle}>{row.code_journal || '-'}</td>
                                                <td style={tdStyle}><b>{row.numero_compte}</b></td>
                                                <td style={tdStyle}>{row.num_tiers || '-'}</td>
                                                <td style={tdStyle}>{row.libelle}</td>
                                                <td style={tdMontant}>{row.debit > 0 ? row.debit.toLocaleString('fr-FR') : ''}</td>
                                                <td style={tdMontant}>{row.credit > 0 ? row.credit.toLocaleString('fr-FR') : ''}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot style={{background: '#1e293b', color: 'white'}}>
                                        <tr>
                                            <td colSpan="5" style={{textAlign: 'right', fontWeight: 'bold', padding:'10px'}}>TOTAUX :</td>
                                            <td style={tdMontant}>{ecrituresPreview.reduce((sum, r) => sum + (r.debit || 0), 0).toLocaleString('fr-FR')}</td>
                                            <td style={tdMontant}>{ecrituresPreview.reduce((sum, r) => sum + (r.credit || 0), 0).toLocaleString('fr-FR')}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                            {/* L'ancienne actionZone a été nettoyée d'ici pour éviter les doublons */}
                        </div>
                    )}
                </div>

            </main>
        </div>
    );
};

// --- STYLES ADDITIONNELS (TOAST & MODALE) ---
const toastContainer = {
    position: 'fixed', top: '20px', right: '20px', 
    padding: '12px 20px', borderRadius: '8px',
    display: 'flex', alignItems: 'center', gap: '12px',
    zIndex: 9999, boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
    animation: 'slideIn 0.3s ease-out'
};

const overlayStyle = {
    position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
    backgroundColor: 'rgba(15, 23, 42, 0.5)', display: 'flex',
    justifyContent: 'center', alignItems: 'center', zIndex: 10000,
    backdropFilter: 'blur(2px)'
};

const modalStyle = {
    background: 'white', padding: '30px', borderRadius: '16px',
    width: '350px', display: 'flex', flexDirection: 'column',
    alignItems: 'center', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)'
};

const btnConfirmModal = {
    flex: 1, padding: '10px', background: '#3b82f6', color: 'white',
    border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer'
};

const btnCancelModal = {
    flex: 1, padding: '10px', background: '#f1f5f9', color: '#64748b',
    border: '1px solid #e2e8f0', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer'
};

// --- STYLES EXISTANTS ---
const layoutStyle = { display: 'flex', height: '100vh', background: '#f1f5f9' };
const mainStyle = { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position:'relative' };
const headerStyle = { background: 'white', padding: '12px 30px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '15px' };
const titleStyle = { fontSize: '14px', fontWeight: 'bold', margin: 0, color:'#1e293b' };
const container = { padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px', overflowY: 'auto' };
const dateSelector = { display:'flex', alignItems:'center', gap:'10px', background:'#f8fafc', padding:'5px 12px', borderRadius:'8px', border:'1px solid #e2e8f0', marginLeft:'auto' };
const dateInput = { border:'none', background:'transparent', fontSize:'12px', fontWeight:'bold', outline:'none', cursor:'pointer' };
const refreshBtn = { background:'#3b82f6', color:'white', border:'none', borderRadius:'4px', padding:'4px', cursor:'pointer', display:'flex' };
const resetBtn = { background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '4px', cursor: 'pointer', display: 'flex' };
const tabContainer = { display: 'flex', gap: '5px', marginBottom:'-1px' };
const tabInactive = { padding: '10px 20px', background: '#e2e8f0', border: '1px solid transparent', borderBottom: 'none', borderRadius: '8px 8px 0 0', cursor: 'pointer', fontSize: '11px', color:'#64748b' };
const tabActive = { ...tabInactive, background: 'white', border: '1px solid #e2e8f0', borderBottom: '2px solid #10b981', color: '#10b981', fontWeight: 'bold' };
const tabActiveManual = { ...tabActive, borderBottom: '2px solid #f59e0b', color: '#f59e0b' };
const sectionCard = { background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' };
const sectionHeader = { padding: '10px 15px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems:'center', fontSize: '12px', fontWeight:'bold' };
const tableWrapper = { maxHeight: '35vh', overflowY: 'auto' };
const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: '11px' };
const thStyle = { padding: '10px', textAlign: 'left', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color:'#64748b' };
const thCenter = { ...thStyle, textAlign: 'center' };
const tdStyle = { padding: '8px 10px', borderBottom: '1px solid #f1f5f9' };
const tdCenter = { ...tdStyle, textAlign: 'center' }; 
const tdMontant = { ...tdStyle, textAlign: 'right', fontWeight: 'bold' };
const selectStyle = { padding: '4px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '11px' };
const badgeVente = { background: '#dbeafe', color: '#1e40af', padding: '2px 5px', borderRadius: '4px', fontWeight:'bold' };
const badgeAchat = { background: '#dcfce7', color: '#15803d', padding: '2px 5px', borderRadius: '4px', fontWeight:'bold' };
const btnSimul = { background: '#2563eb', color: 'white', border: 'none', padding: '12px 25px', borderRadius: '8px', cursor: 'pointer', fontWeight:'bold', margin:'0 auto' };
const btnDisabled = { ...btnSimul, background: '#cbd5e1', cursor: 'not-allowed' };
const actionZone = { padding: '20px', textAlign: 'center', background: '#f8fafc' };
const btnFinal = { background: '#10b981', color: 'white', border: 'none', padding: '15px 40px', borderRadius: '50px', fontWeight: 'bold', cursor: 'pointer', margin: '0 auto' };
const emptyState = { textAlign: 'center', padding: '40px', color: '#94a3b8' };
const btnSmallCancelStyle = { background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px' };

export default ClotureJournalier;