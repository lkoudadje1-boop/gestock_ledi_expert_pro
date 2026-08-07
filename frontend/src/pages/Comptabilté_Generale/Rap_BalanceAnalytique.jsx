import React, { useState, useEffect, useMemo, useRef } from 'react'; // ✅ Ajoutez useRef ici
import { 
    Loader2, Printer, Download, BarChart3, Search, RefreshCcw, PlayCircle
} from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import API, { socket } from '../../services/api';

const Rap_BalanceAnalytique = () => {
    const [loading, setLoading] = useState(false);
    const [hasCalculated, setHasCalculated] = useState(false);
    const [data, setData] = useState([]);
    const [exercices, setExercices] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const hasCalculatedRef = useRef(false);
    const [params, setParams] = useState({
        exerciceId: '',
        dateDebut: '',
        dateFin: '',
        inclureBrouillard: false
    });

    // 1. Initialisation des exercices (Une seule fois au montage)
    const fetchInitialData = async () => {
        try {
            const resEx = await API.get('/plan-comptable/exercices/liste');
            const listEx = resEx.data.data || [];
            setExercices(listEx);

            // 🚀 ON NE FORCE L'EXERCICE QUE SI VIDE
            if (!params.exerciceId) {
                const activeEx = listEx.find(ex => ex.statut === 'OUVERT') || listEx[0];
                if (activeEx) {
                    setParams({
                        exerciceId: activeEx.id,
                        dateDebut: activeEx.date_debut?.split('T')[0] || '',
                        dateFin: activeEx.date_fin?.split('T')[0] || '',
                        inclureBrouillard: false
                    });
                }
            }
        } catch (err) { console.error("Erreur initialisation:", err); }
    };

    // 2. Calcul déclenché par l'utilisateur
const fetchBalanceAnalytique = async () => {
    if (!params.exerciceId || !params.dateDebut || !params.dateFin) {
        showToast("Sélectionnez une période valide", "error");
        return;
    }
    
    setLoading(true);
    try {
        const res = await API.get('/compta/rapports/balance-analytique', { params });
        setData(res.data.data || []);
        setHasCalculated(true);
    } catch (err) {
        console.error("Erreur balance analytique:", err);
        showToast("Erreur lors du calcul analytique", "error");
    } finally {
        setLoading(false);
    }
};

useEffect(() => {
    fetchInitialData();

    if (socket) {
        const handleRefresh = () => {
            // ✅ On vérifie la ref pour savoir si on doit actualiser
            if (hasCalculatedRef.current) {
                console.log("⚡ Actualisation de la balance analytique...");
                fetchBalanceAnalytique();
            }
        };

        socket.on('REFRESH_COMPTA_DATA', handleRefresh);
        socket.on('DATA_EVENT', (event) => {
            // Si des ventilations analytiques sont modifiées
            if (event.table === 'lignes_analytiques' || event.table === 'analytic_entries') {
                handleRefresh();
            }
        });

        return () => {
            socket.off('REFRESH_COMPTA_DATA', handleRefresh);
            socket.off('DATA_EVENT');
        };
    }
}, []); 

// Mise à jour de la ref quand l'état change
useEffect(() => {
    hasCalculatedRef.current = hasCalculated;
}, [hasCalculated]);

    // 🎯 GESTION DU FILTRE : Figé pour éviter les sauts de date
    const handleExerciceChange = (exId) => {
        const selectedEx = exercices.find(ex => ex.id === exId);
        if (selectedEx) {
            setParams({
                ...params,
                exerciceId: exId,
                dateDebut: selectedEx.date_debut?.split('T')[0] || '',
                dateFin: selectedEx.date_fin?.split('T')[0] || ''
            });
            setHasCalculated(false); // On cache le tableau tant qu'on n'a pas recliqué
            setData([]); 
        }
    };

    const filteredData = useMemo(() => {
        return data.filter(item => 
            (item.code_section || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
            (item.intitule_section || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
            (item.num_compte || "").includes(searchTerm)
        );
    }, [data, searchTerm]);

    const formatCur = (val) => val ? new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0 }).format(val) : '-';

    const globalTotals = useMemo(() => {
        return data.filter(r => !r.is_total_section).reduce((acc, row) => ({
            debit: acc.debit + parseFloat(row.mouv_debit || 0),
            credit: acc.credit + parseFloat(row.mouv_credit || 0),
            solde: acc.solde + parseFloat(row.solde || 0)
        }), { debit: 0, credit: 0, solde: 0 });
    }, [data]);

    return (
        <div style={layoutStyle}>
            <Sidebar />
            <main style={mainStyle}>
                <header style={headerStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div style={iconBox}><BarChart3 size={22} color="white" /></div>
                        <div>
                            <h1 style={titleStyle}>BALANCE ANALYTIQUE</h1>
                            <div style={{fontSize: '11px', color: '#64748b'}}>Analyse OHADA • Centres de coûts et sections</div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => window.print()} disabled={!hasCalculated} style={hasCalculated ? btnSecondary : btnDisabled}><Printer size={16} /> IMPRIMER</button>
                        <button disabled={!hasCalculated} style={hasCalculated ? btnPrimary : btnDisabled}><Download size={16} /> EXCEL</button>
                    </div>
                </header>

                <section style={filterPanel}>
                    <div style={filterGrid}>
                        <div style={filterGroup}>
                            <label style={labelStyle}>EXERCICE COMPTABLE</label>
                            <select style={selectStyle} value={params.exerciceId} onChange={(e) => handleExerciceChange(e.target.value)}>
                                {exercices.map(ex => <option key={ex.id} value={ex.id}>{ex.libelle}</option>)}
                            </select>
                        </div>
                        <div style={filterGroup}>
                            <label style={labelStyle}>PÉRIODE DU</label>
                            <input type="date" style={inputStyle} value={params.dateDebut} onChange={(e) => { setParams({...params, dateDebut: e.target.value}); setHasCalculated(false); }} />
                        </div>
                        <div style={filterGroup}>
                            <label style={labelStyle}>AU</label>
                            <input type="date" style={inputStyle} value={params.dateFin} onChange={(e) => { setParams({...params, dateFin: e.target.value}); setHasCalculated(false); }} />
                        </div>
                        <div style={filterGroup}>
                             <label style={labelStyle}>RECHERCHE RAPIDE</label>
                             <div style={{position:'relative'}}>
                                <Search size={14} style={searchIcon} />
                                <input type="text" placeholder="Filtrer..." style={inputSearch} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                             </div>
                        </div>
                    </div>
                    <div style={{marginTop: '12px'}}>
                         <button style={btnRefresh} onClick={fetchBalanceAnalytique} disabled={loading}>
                            {loading ? <Loader2 className="animate-spin" size={16} /> : <RefreshCcw size={16} />} 
                            GÉNÉRER LE RAPPORT ANALYTIQUE
                         </button>
                    </div>
                </section>

                <div style={contentStyle}>
                    {!hasCalculated && !loading ? (
                        <div style={placeholderStyle}>
                            <PlayCircle size={48} color="#cbd5e1" />
                            <h2 style={{color:'#64748b', marginTop:'10px'}}>Prêt pour l'extraction</h2>
                            <p style={{color:'#94a3b8', fontSize:'12px'}}>Choisissez votre exercice et cliquez sur le bouton pour calculer.</p>
                        </div>
                    ) : loading ? (
                        <div style={centerStyle}><Loader2 className="animate-spin" size={40} color={BORDEAUX} /> <span style={{marginLeft:'15px', fontWeight:'bold', color: BORDEAUX}}>Extraction analytique en cours...</span></div>
                    ) : (
                        <div style={tableWrapper}>
                            <div style={scrollContainer}>
                                <table style={tableStyle}>
                                    <thead style={stickyHeader}>
                                        <tr>
                                            <th rowSpan="2" style={thFixed}>Section / Compte</th>
                                            <th rowSpan="2" style={thFixed}>Intitulé</th>
                                            <th colSpan="2" style={thGroup}>Mouvements</th>
                                            <th rowSpan="2" style={thGroup}>Soldes</th>
                                            <th rowSpan="2" style={thSub}>Ex. Précédent</th>
                                        </tr>
                                        <tr>
                                            <th style={thSub}>Débit</th>
                                            <th style={thSub}>Crédit</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredData.length === 0 ? (
                                            <tr><td colSpan="6" style={{textAlign:'center', padding:'40px', color:'#94a3b8'}}>Aucun mouvement pour cette période.</td></tr>
                                        ) : filteredData.map((row, idx) => (
                                            <tr key={idx} style={row.is_total_section ? trTotalSection : trStyle}>
                                                <td style={row.is_total_section ? tdSectionCode : tdCompte}>
                                                    {row.is_total_section ? `Total ${row.code_section}` : row.num_compte}
                                                </td>
                                                <td style={row.is_total_section ? tdSectionLibelle : tdIntitule}>
                                                    {row.is_total_section ? row.intitule_section : row.intitule_compte}
                                                </td>
                                                <td style={tdMontant}>{formatCur(row.mouv_debit)}</td>
                                                <td style={tdMontant}>{formatCur(row.mouv_credit)}</td>
                                                <td style={tdMontantBold}>{formatCur(row.solde)}</td>
                                                <td style={tdMontant}>{formatCur(row.solde_prec)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot style={tfootStyle}>
                                        <tr style={trTotalGlobal}>
                                            <td colSpan="2" style={tdTotalLabelFinal}>TOTAUX GÉNÉRAUX</td>
                                            <td style={tdTotalValFinalBold}>{formatCur(globalTotals.debit)}</td>
                                            <td style={tdTotalValFinalBold}>{formatCur(globalTotals.credit)}</td>
                                            <td style={tdTotalValFinalBold}>{formatCur(globalTotals.solde)}</td>
                                            <td style={tdTotalValFinalBold}>-</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

// --- CONFIGURATION ---
const BORDEAUX = '#800020';

const layoutStyle = { display: 'flex', height: '100vh', background: '#f8fafc', overflow: 'hidden' };
const mainStyle = { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' };
const headerStyle = { background: 'white', padding: '12px 30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `2px solid ${BORDEAUX}` };
const filterPanel = { background: 'white', padding: '15px 30px', borderBottom: '1px solid #e2e8f0' };
const filterGrid = { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' };
const filterGroup = { display: 'flex', flexDirection: 'column', gap: '3px' };
const labelStyle = { fontSize: '10px', fontWeight: '900', color: BORDEAUX };
const selectStyle = { padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px', fontWeight: '700' };
const inputStyle = { ...selectStyle };
const inputSearch = { padding: '7px 7px 7px 30px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', width: '100%' };
const searchIcon = { position:'absolute', left:'10px', top:'9px', color: BORDEAUX };
const contentStyle = { padding: '15px', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' };
const tableWrapper = { flex: 1, background: 'white', borderRadius: '4px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'hidden' };
const scrollContainer = { flex: 1, overflowY: 'auto', overflowX: 'auto' };
const tableStyle = { width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '11px' };
const stickyHeader = { position: 'sticky', top: 0, zIndex: 10 };
const thFixed = { borderBottom: '1px solid #cbd5e1', borderRight: '1px solid #cbd5e1', padding: '10px', background: '#f8fafc', fontWeight: '900', textAlign: 'left', color: BORDEAUX };
const thGroup = { borderBottom: '1px solid #cbd5e1', borderRight: '1px solid #cbd5e1', padding: '6px', background: '#fff1f2', fontWeight: '900', textAlign: 'center', color: BORDEAUX };
const thSub = { borderBottom: '1px solid #cbd5e1', borderRight: '1px solid #cbd5e1', padding: '6px', background: '#f1f5f9', fontWeight: '900', textAlign: 'center' };
const trStyle = { height: '32px' };
const trTotalSection = { background: '#fef2f2', height: '34px', fontWeight: 'bold' };
const tdCompte = { padding: '5px 10px', borderBottom: '1px solid #f1f5f9', borderRight: '1px solid #f1f5f9' };
const tdSectionCode = { ...tdCompte, fontWeight: '900', color: BORDEAUX };
const tdIntitule = { padding: '5px 10px', borderBottom: '1px solid #f1f5f9', borderRight: '1px solid #f1f5f9', color: '#475569' };
const tdSectionLibelle = { ...tdIntitule, fontWeight: '900', color: BORDEAUX, textTransform: 'uppercase' };
const tdMontant = { padding: '5px 10px', borderBottom: '1px solid #f1f5f9', borderRight: '1px solid #f1f5f9', textAlign: 'right', fontFamily: 'monospace' };
const tdMontantBold = { ...tdMontant, fontWeight: 'bold', color: BORDEAUX, background: '#fff1f2' };
const btnPrimary = { background: BORDEAUX, color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px' };
const btnSecondary = { background: 'white', color: BORDEAUX, border: `1px solid ${BORDEAUX}`, padding: '8px 16px', borderRadius: '6px', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px' };
const btnDisabled = { background: '#f1f5f9', color: '#cbd5e1', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'not-allowed', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px' };
const btnRefresh = { ...btnPrimary, width: 'fit-content' };
const iconBox = { background: BORDEAUX, padding: '6px', borderRadius: '6px' };
const titleStyle = { margin: 0, fontSize: '14px', fontWeight: '900', color: BORDEAUX };
const centerStyle = { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' };
const placeholderStyle = { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: 'white', borderRadius: '4px', border: '2px dashed #e2e8f0' };
const tfootStyle = { position: 'sticky', bottom: 0, zIndex: 5, background: 'white' };
const tdTotalLabelFinal = { padding: '10px', fontWeight: '900', borderTop: `2px solid ${BORDEAUX}`, borderRight: '1px solid #cbd5e1', textAlign: 'right', background: '#fff1f2', color: BORDEAUX };
const tdTotalValFinalBold = { padding: '10px', borderTop: `2px solid ${BORDEAUX}`, borderRight: '1px solid #cbd5e1', textAlign: 'right', fontWeight: '900', fontFamily: 'monospace', fontSize: '12px', background: '#fff1f2', color: BORDEAUX };
const trTotalGlobal = { background: '#fff1f2' };

export default Rap_BalanceAnalytique;