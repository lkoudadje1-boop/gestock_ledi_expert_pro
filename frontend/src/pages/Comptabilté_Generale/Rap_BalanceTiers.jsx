import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
    Loader2, Printer, Download, Users, Search, RefreshCcw 
} from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import API, { socket } from '../../services/api';
import { useNavigate } from 'react-router-dom';

const Rap_BalanceTiers = () => {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState([]);
    const navigate = useNavigate();
    const [exercices, setExercices] = useState([]);
    
    const [params, setParams] = useState({
        exerciceId: '',
        typeBalance: '6', 
        dateDebut: '',
        dateFin: '',
        tiersDebut: '',
        tiersFin: '',
        inclureBrouillard: false
    });

    const [searchTerm, setSearchTerm] = useState('');
const paramsRef = useRef(params);
useEffect(() => { paramsRef.current = params; }, [params]);
    // --- 1. EN-TÊTES DYNAMIQUES (SAGE COMPATIBLE - MARINE THEME) ---
    const getDynamicHeaders = () => {
        const dateVeille = params.dateDebut 
            ? new Date(new Date(params.dateDebut) - 86400000).toLocaleDateString('fr-FR') 
            : '...';
        
        const types = {
            '4': [
                { label: 'Mouvements', span: 2 },
                { label: 'Soldes', span: 2 }
            ],
            '6': [
                { label: `Mouvements au ${dateVeille}`, span: 2 },
                { label: 'Mouvements', span: 2 },
                { label: 'Soldes cumulés', span: 2 }
            ],
            '8': [
                { label: `Mouvements au ${dateVeille}`, span: 2 },
                { label: 'Mouvements', span: 2 },
                { label: 'Soldes période', span: 2 },
                { label: 'Soldes cumulés', span: 2 }
            ]
        };
        return types[params.typeBalance] || types['6'];
    };

    const handleExerciceChange = (exId) => {
        const selectedEx = exercices.find(ex => ex.id === exId);
        if (selectedEx) {
            setParams(prev => ({
                ...prev,
                exerciceId: exId,
                dateDebut: selectedEx.date_debut?.split('T')[0],
                dateFin: selectedEx.date_fin?.split('T')[0]
            }));
        }
    };

    const ouvrirHistoriqueTiers = (num) => {
        if (!num || !params.exerciceId) return;
        navigate(`/compta/historique-tiers/${num}?exerciceId=${params.exerciceId}`);
    };

    const handleDateChange = (field, value) => {
        setParams(prev => ({ ...prev, [field]: value }));
    };

    const fetchInitialData = async () => {
        setLoading(true);
        try {
            const resEx = await API.get('/plan-comptable/exercices/liste');
            const listEx = resEx.data.data || [];
            setExercices(listEx);

            const activeEx = listEx.find(ex => ex.statut === 'OUVERT') || listEx[0];
            if (activeEx) {
                setParams(prev => ({ 
                    ...prev, 
                    exerciceId: activeEx.id,
                    dateDebut: activeEx.date_debut?.split('T')[0],
                    dateFin: activeEx.date_fin?.split('T')[0]
                }));
            }
        } catch (err) { console.error("Erreur initialisation:", err); }
        finally { setLoading(false); }
    };

    const fetchBalance = async () => {
        if (!params.exerciceId) return;
        setLoading(true);
        try {
            // On utilise la route spécifique pour la balance des tiers
            const res = await API.get('/compta/rapports/balance-tiers', { params });
            setData(res.data.data || []);
        } catch (err) { console.error("Erreur fetch balance tiers:", err); }
        finally { setLoading(false); }
    };

  useEffect(() => {
    fetchInitialData();

    if (socket) {
        const handleAutoRefresh = () => {
            console.log("🔄 Mise à jour de la balance tiers détectée...");
            fetchBalance();
        };

        // On écoute les rafraîchissements globaux et les changements de table
        socket.on('REFRESH_COMPTA_DATA', handleAutoRefresh);
        socket.on('DATA_EVENT', (event) => {
            // Un changement sur les écritures réelles impacte la balance des tiers
            if (['journal_entries', 'lignes_ecritures'].includes(event.table)) {
                handleAutoRefresh();
            }
        });

        return () => {
            socket.off('REFRESH_COMPTA_DATA', handleAutoRefresh);
            socket.off('DATA_EVENT');
        };
    }
}, []);

    const filteredData = useMemo(() => {
        return data.filter(item => 
            (item.num_tiers || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
            (item.nom_tiers || "").toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [data, searchTerm]);

    const formatCur = (val) => val ? new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0 }).format(val) : '';

    const totals = useMemo(() => {
        const t = { ant_d: 0, ant_c: 0, per_d: 0, per_c: 0, sol_per_d: 0, sol_per_c: 0, cum_d: 0, cum_c: 0 };
        filteredData.forEach(row => {
            t.ant_d += parseFloat(row.mouv_ant_debit || 0);
            t.ant_c += parseFloat(row.mouv_ant_credit || 0);
            t.per_d += parseFloat(row.mouv_periode_debit || 0);
            t.per_c += parseFloat(row.mouv_periode_credit || 0);
        });

        // Calcul des soldes totaux
        const diffPer = t.per_d - t.per_c;
        t.sol_per_d = diffPer > 0 ? diffPer : 0;
        t.sol_per_c = diffPer < 0 ? Math.abs(diffPer) : 0;

        const totalDebits = t.ant_d + t.per_d;
        const totalCredits = t.ant_c + t.per_c;
        const diffCumul = totalDebits - totalCredits;
        t.cum_d = diffCumul > 0 ? diffCumul : 0;
        t.cum_c = diffCumul < 0 ? Math.abs(diffCumul) : 0;

        return t;
    }, [filteredData]);

    const headers = getDynamicHeaders();

    return (
        <div style={layoutStyle}>
            <Sidebar />
            <main style={mainStyle}>
                <header style={headerStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div style={iconBox}><Users size={22} color="white" /></div>
                        <div>
                            <h1 style={titleStyle}>BALANCE DES TIERS</h1>
                            <div style={{fontSize: '11px', color: '#64748b'}}>
                                {params.dateDebut ? `Exercice ${new Date(params.dateDebut).getFullYear()} • Auxiliaire` : 'Chargement...'}
                            </div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => window.print()} style={btnSecondary}><Printer size={16} /> IMPRIMER</button>
                        <button style={btnPrimary}><Download size={16} /> EXCEL</button>
                    </div>
                </header>

                <section style={filterPanel}>
                    <div style={filterGrid}>
                        <div style={filterGroup}>
                            <label style={labelStyle}>TYPE DE BALANCE</label>
                            <select style={selectStyle} value={params.typeBalance} onChange={(e) => setParams({...params, typeBalance: e.target.value})}>
                                <option value="4">4 colonnes</option>
                                <option value="6">6 colonnes</option>
                                <option value="8">8 colonnes</option>
                            </select>
                        </div>
                        <div style={filterGroup}>
                            <label style={labelStyle}>EXERCICE CIBLE</label>
                            <select style={selectStyle} value={params.exerciceId} onChange={(e) => handleExerciceChange(e.target.value)}>
                                {exercices.map(ex => <option key={ex.id} value={ex.id}>{ex.libelle}</option>)}
                            </select>
                        </div>
                        <div style={filterGroup}>
                            <label style={labelStyle}>PÉRIODE DU</label>
                            <input type="date" style={inputStyle} value={params.dateDebut} onChange={(e) => handleDateChange('dateDebut', e.target.value)} />
                        </div>
                        <div style={filterGroup}>
                            <label style={labelStyle}>AU</label>
                            <input type="date" style={inputStyle} value={params.dateFin} onChange={(e) => handleDateChange('dateFin', e.target.value)} />
                        </div>
                    </div>
                    
                    <div style={searchBarContainer}>
                         <div style={{position:'relative'}}>
                            <Search size={14} style={searchIcon} />
                            <input type="text" placeholder="Rechercher tiers..." style={inputSearch} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                         </div>
                         <button style={btnRefresh} onClick={fetchBalance}>
                            <RefreshCcw size={16} className={loading ? "animate-spin" : ""} /> CALCULER LA BALANCE DES TIERS
                         </button>
                    </div>
                </section>

                <div style={contentStyle}>
                    {loading ? (
                        <div style={centerStyle}><Loader2 className="animate-spin" size={40} color="#1e3a8a" /></div>
                    ) : (
                        <div style={tableWrapper}>
                            <div style={scrollContainer}>
                                <table style={tableStyle}>
                                    <thead style={stickyHeader}>
                                        <tr>
                                            <th rowSpan="2" style={thFixed}>N° Tiers</th>
                                            <th rowSpan="2" style={thFixed}>Intitulé du Tiers</th>
                                            {headers.map((h, i) => (
                                                <th key={i} colSpan={h.span} style={thGroup}>{h.label}</th>
                                            ))}
                                        </tr>
                                        <tr>
                                            {headers.map((h, i) => (
                                                <React.Fragment key={i}>
                                                    <th style={thSub}>Débit</th>
                                                    <th style={thSub}>Crédit</th>
                                                </React.Fragment>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredData.length === 0 ? (
                                            <tr><td colSpan="12" style={{padding:'40px', textAlign:'center', color:'#94a3b8'}}>Aucun tiers trouvé.</td></tr>
                                        ) : filteredData.map((row, idx) => (
                                            <tr key={idx} style={trStyle}>
                                                <td 
                                                    style={{...tdCompte, cursor: 'pointer', color: '#2563eb', textDecoration: 'underline'}} 
                                                    onClick={() => ouvrirHistoriqueTiers(row.num_tiers)}
                                                    title="Voir l'historique de ce tiers"
                                                >
                                                    {row.num_tiers}
                                                </td>
                                                <td style={tdIntitule}>{row.nom_tiers}</td>
                                                {(params.typeBalance === '6' || params.typeBalance === '8') && (
                                                    <>
                                                        <td style={tdMontant}>{formatCur(row.mouv_ant_debit)}</td>
                                                        <td style={tdMontant}>{formatCur(row.mouv_ant_credit)}</td>
                                                    </>
                                                )}
                                                <td style={tdMontant}>{formatCur(row.mouv_periode_debit)}</td>
                                                <td style={tdMontant}>{formatCur(row.mouv_periode_credit)}</td>
                                                {params.typeBalance === '8' && (
                                                    <>
                                                        <td style={tdMontant}>{formatCur(row.solde_periode_debit)}</td>
                                                        <td style={tdMontant}>{formatCur(row.solde_periode_credit)}</td>
                                                    </>
                                                )}
                                                <td style={tdMontantBold}>{formatCur(row.solde_cumule_debit)}</td>
                                                <td style={tdMontantBold}>{formatCur(row.solde_cumule_credit)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot style={tfootStyle}>
                                        <tr style={trTotalGlobal}>
                                            <td colSpan="2" style={tdTotalLabelFinal}>TOTAUX BALANCE DES TIERS</td>
                                            {(params.typeBalance === '6' || params.typeBalance === '8') && (
                                                <>
                                                    <td style={tdTotalValFinalBold}>{formatCur(totals.ant_d)}</td>
                                                    <td style={tdTotalValFinalBold}>{formatCur(totals.ant_c)}</td>
                                                </>
                                            )}
                                            <td style={tdTotalValFinalBold}>{formatCur(totals.per_d)}</td>
                                            <td style={tdTotalValFinalBold}>{formatCur(totals.per_c)}</td>
                                            {params.typeBalance === '8' && (
                                                <>
                                                    <td style={tdTotalValFinalBold}>{formatCur(totals.sol_per_d)}</td>
                                                    <td style={tdTotalValFinalBold}>{formatCur(totals.sol_per_c)}</td>
                                                </>
                                            )}
                                            <td style={tdTotalValFinalBold}>{formatCur(totals.cum_d)}</td>
                                            <td style={tdTotalValFinalBold}>{formatCur(totals.cum_c)}</td>
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

// --- STYLES (THEME MARINE) ---
const layoutStyle = { display: 'flex', height: '100vh', background: '#f1f5f9', overflow: 'hidden' };
const mainStyle = { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' };
const headerStyle = { background: 'white', padding: '12px 30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0' };
const filterPanel = { background: 'white', padding: '15px 30px', borderBottom: '2px solid #1e3a8a' };
const filterGrid = { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' };
const filterGroup = { display: 'flex', flexDirection: 'column', gap: '3px' };
const labelStyle = { fontSize: '10px', fontWeight: '900', color: '#1e3a8a' };
const selectStyle = { padding: '5px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px', fontWeight: '700', background: 'white' };
const inputStyle = { ...selectStyle };
const searchBarContainer = { marginTop: '12px', display:'flex', justifyContent:'space-between', alignItems:'center' };
const inputSearch = { padding: '7px 7px 7px 30px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', width: '250px' };
const searchIcon = { position:'absolute', left:'10px', top:'9px', color:'#1e3a8a' };
const contentStyle = { padding: '15px', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' };
const tableWrapper = { flex: 1, background: 'white', borderRadius: '4px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'hidden' };
const scrollContainer = { flex: 1, overflowY: 'auto', overflowX: 'auto' };
const tableStyle = { width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '11px' };
const stickyHeader = { position: 'sticky', top: 0, zIndex: 10 };
const thFixed = { borderBottom: '1px solid #cbd5e1', borderRight: '1px solid #cbd5e1', padding: '10px', background: '#f8fafc', fontWeight: '900', textAlign: 'left', color: '#1e3a8a' };
const thGroup = { borderBottom: '1px solid #cbd5e1', borderRight: '1px solid #cbd5e1', padding: '6px', background: '#e8eaf6', fontWeight: '900', textAlign: 'center', color: '#1e3a8a' };
const thSub = { borderBottom: '1px solid #cbd5e1', borderRight: '1px solid #cbd5e1', padding: '6px', background: '#f1f5f9', fontWeight: '900', textAlign: 'center' };
const trStyle = { height: '32px' };
const tdCompte = { padding: '5px 10px', borderBottom: '1px solid #f1f5f9', borderRight: '1px solid #f1f5f9', fontWeight: '900' };
const tdIntitule = { padding: '5px 10px', borderBottom: '1px solid #f1f5f9', borderRight: '1px solid #f1f5f9', color: '#334155' };
const tdMontant = { padding: '5px 10px', borderBottom: '1px solid #f1f5f9', borderRight: '1px solid #f1f5f9', textAlign: 'right', fontFamily: 'monospace' };
const tdMontantBold = { ...tdMontant, fontWeight: 'bold', color: '#1e3a8a', background: '#f0f4ff' };
const btnPrimary = { background: '#1e3a8a', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px' };
const btnSecondary = { background: '#f8fafc', color: '#1e3a8a', border: '1px solid #1e3a8a', padding: '8px 16px', borderRadius: '6px', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px' };
const btnRefresh = { ...btnPrimary, background: '#1e3a8a' };
const iconBox = { background: '#1e3a8a', padding: '6px', borderRadius: '6px' };
const titleStyle = { margin: 0, fontSize: '14px', fontWeight: '900', color: '#1e3a8a' };
const centerStyle = { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' };

// --- FOOTER STYLES ---
const tfootStyle = { position: 'sticky', bottom: 0, zIndex: 5, background: 'white' };
const tdTotalLabelFinal = { padding: '8px 10px', fontWeight: '900', borderTop: '2px solid #1e3a8a', borderRight: '1px solid #cbd5e1', textAlign: 'right', textTransform: 'uppercase', background: '#e8eaf6', color: '#1e3a8a' };
const tdTotalValFinalBold = { padding: '8px 10px', borderTop: '2px solid #1e3a8a', borderRight: '1px solid #cbd5e1', textAlign: 'right', fontWeight: '900', fontFamily: 'monospace', fontSize: '12px', background: '#e8eaf6', color: '#1e3a8a' };
const trTotalGlobal = { background: '#f8fafc' };

export default Rap_BalanceTiers;