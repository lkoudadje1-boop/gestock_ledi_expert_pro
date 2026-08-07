import React, { useState, useEffect, useMemo } from 'react';
import { 
    Loader2, Printer, Download, Calendar, Search, RefreshCcw, Users, PlayCircle
} from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import API, { socket } from '../../services/api';

const Rap_BalanceAgee = () => {
    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    const [hasCalculated, setHasCalculated] = useState(false); // 🚀 Pour bloquer l'affichage auto
    const [data, setData] = useState([]);
    const [exercices, setExercices] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    
    const [params, setParams] = useState({
        exerciceId: '',
        typeTiers: 'TOUT',
        datePivot: new Date().toISOString().split('T')[0], 
        inclureBrouillard: false
    });

    // 1. Charge uniquement les exercices au démarrage
const fetchInitialData = async () => {
    try {
        setInitialLoading(true);
        // ✅ URL corrigée avec le préfixe complet
        const resEx = await API.get('/plan-comptable/exercices/liste');
        const listEx = resEx.data.data || [];
        setExercices(listEx);

        const activeEx = listEx.find(ex => ex.statut === 'OUVERT') || listEx[0];
        if (activeEx) {
            setParams(prev => ({ ...prev, exerciceId: activeEx.id }));
        }
    } catch (err) { 
        console.error("Erreur initialisation Balance Âgée:", err); 
    } finally { 
        setInitialLoading(false); 
    }
};

    // 2. La fonction de calcul (appelée uniquement via le bouton)
    const fetchBalanceAgee = async () => {
        if (!params.exerciceId) return;
        setLoading(true);
        try {
            const res = await API.get('/plan-comptable/rapports/balance-agee', { params });
            setData(res.data.data || []);
            setHasCalculated(true); // ✅ On autorise l'affichage du tableau
        } catch (err) { 
            console.error("Erreur fetch balance âgée:", err); 
        } finally { 
            setLoading(false); 
        }
    };

  useEffect(() => {
    fetchInitialData();

    if (socket) {
        const handleDataChange = (event) => {
            // Si des écritures sont validées ou des tiers lettrés
            if (['lignes_ecritures', 'journal_entries'].includes(event.table)) {
                // On pourrait mettre un état "isOutdated" à true pour afficher un petit warning
                console.log("⚠️ Les données de la balance âgée pourraient avoir changé.");
            }
        };

        socket.on('DATA_EVENT', handleDataChange);
        return () => socket.off('DATA_EVENT', handleDataChange);
    }
}, []);
    // 🚀 Suppression du useEffect qui surveillait params.typeTiers et params.exerciceId
    // L'utilisateur DOIT cliquer sur le bouton maintenant.

    const filteredData = useMemo(() => {
        return data.filter(item => 
            (item.num_tiers || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
            (item.nom_tiers || "").toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [data, searchTerm]);

    const formatCur = (val) => val ? new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0 }).format(val) : '-';

    const totals = useMemo(() => {
        return filteredData.reduce((acc, row) => ({
            solde: acc.solde + parseFloat(row.solde || 0),
            non_echu: acc.non_echu + parseFloat(row.non_echu || 0),
            t1: acc.t1 + parseFloat(row.tranche_1_30 || 0),
            t2: acc.t2 + parseFloat(row.tranche_31_45 || 0),
            t3: acc.t3 + parseFloat(row.tranche_46_60 || 0),
            t4: acc.t4 + parseFloat(row.tranche_plus_61 || 0),
        }), { solde: 0, non_echu: 0, t1: 0, t2: 0, t3: 0, t4: 0 });
    }, [filteredData]);

    return (
        <div style={layoutStyle}>
            <Sidebar />
            <main style={mainStyle}>
                <header style={headerStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div style={iconBox}><Users size={22} color="white" /></div>
                        <div>
                            <h1 style={titleStyle}>
                                BALANCE ÂGÉE {params.typeTiers === 'TOUT' ? 'GLOBALE' : `DES ${params.typeTiers}S`}
                            </h1>
                            <div style={{fontSize: '11px', color: '#64748b'}}>
                                Analyse des retards • {params.typeTiers === 'TOUT' ? 'Tous les comptes tiers' : params.typeTiers}
                            </div>
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
                            <label style={labelStyle}>CATÉGORIE DE TIERS</label>
                            <select style={selectStyle} value={params.typeTiers} onChange={(e) => { setParams({...params, typeTiers: e.target.value}); setHasCalculated(false); }}>
                                <option value="TOUT">--- TOUT AFFICHER ---</option>
                                <option value="FOURNISSEUR">FOURNISSEURS</option>
                                <option value="CLIENT">CLIENTS</option>
                                <option value="SALARIE">SALARIÉS</option>
                                <option value="AUTRE">AUTRES TIERS</option>
                            </select>
                        </div>
                        <div style={filterGroup}>
                            <label style={labelStyle}>EXERCICE CIBLE</label>
                            <select style={selectStyle} value={params.exerciceId} onChange={(e) => { setParams({...params, exerciceId: e.target.value}); setHasCalculated(false); }}>
                                {exercices.map(ex => <option key={ex.id} value={ex.id}>{ex.libelle}</option>)}
                            </select>
                        </div>
                        <div style={filterGroup}>
                            <label style={labelStyle}>DATE D'ARRÊTÉ</label>
                            <input type="date" style={inputStyle} value={params.datePivot} onChange={(e) => { setParams({...params, datePivot: e.target.value}); setHasCalculated(false); }} />
                        </div>
                        <div style={filterGroup}>
                             <label style={labelStyle}>RECHERCHE</label>
                             <div style={{position:'relative'}}>
                                <Search size={14} style={searchIcon} />
                                <input type="text" placeholder="Filtrer..." style={inputSearch} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                             </div>
                        </div>
                    </div>
                    <div style={{marginTop: '12px'}}>
                         <button style={btnRefresh} onClick={fetchBalanceAgee} disabled={loading}>
                            {loading ? <Loader2 className="animate-spin" size={16} /> : <RefreshCcw size={16} />} 
                            LANCER LE CALCUL DU RAPPORT
                         </button>
                    </div>
                </section>

                <div style={contentStyle}>
                    {!hasCalculated && !loading ? (
                        // 🟢 Message d'attente quand aucun calcul n'a été fait
                        <div style={placeholderStyle}>
                            <PlayCircle size={48} color="#cbd5e1" />
                            <h2 style={{color:'#64748b', marginTop:'10px'}}>Prêt pour le calcul</h2>
                            <p style={{color:'#94a3b8', fontSize:'12px'}}>Sélectionnez vos filtres et cliquez sur le bouton bleu pour générer la balance âgée.</p>
                        </div>
                    ) : loading ? (
                        <div style={centerStyle}><Loader2 className="animate-spin" size={40} color="#1e3a8a" /> <span style={{marginLeft:'10px', fontWeight:'bold'}}>Calcul des échéances en cours...</span></div>
                    ) : (
                        <div style={tableWrapper}>
                            <div style={scrollContainer}>
                                <table style={tableStyle}>
                                    <thead style={stickyHeader}>
                                        <tr>
                                            <th rowSpan="2" style={thFixed}>N° Tiers</th>
                                            <th rowSpan="2" style={thFixed}>Intitulé du Tiers</th>
                                            <th rowSpan="2" style={thGroup}>Solde</th>
                                            <th rowSpan="2" style={thSub}>Non échu</th>
                                            <th colSpan="4" style={thGroup}>Tranches de retard (en jours)</th>
                                        </tr>
                                        <tr>
                                            <th style={thSub}>1 - 30 j</th>
                                            <th style={thSub}>31 - 45 j</th>
                                            <th style={thSub}>46 - 60 j</th>
                                            <th style={thSub}>+ 61 j</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredData.length === 0 ? (
                                            <tr><td colSpan="8" style={{textAlign:'center', padding:'30px', color:'#94a3b8'}}>Aucune donnée trouvée pour ces critères.</td></tr>
                                        ) : filteredData.map((row, idx) => (
                                            <tr key={idx} style={trStyle}>
                                                <td style={tdCompte}>{row.num_tiers}</td>
                                                <td style={tdIntitule}>{row.nom_tiers}</td>
                                                <td style={tdMontantBold}>{formatCur(row.solde)}</td>
                                                <td style={{...tdMontant, color:'#059669'}}>{formatCur(row.non_echu)}</td>
                                                <td style={tdMontant}>{formatCur(row.tranche_1_30)}</td>
                                                <td style={tdMontant}>{formatCur(row.tranche_31_45)}</td>
                                                <td style={tdMontant}>{formatCur(row.tranche_46_60)}</td>
                                                <td style={{...tdMontant, fontWeight:'bold', color: row.tranche_plus_61 > 0 ? '#dc2626' : 'inherit'}}>
                                                    {formatCur(row.tranche_plus_61)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot style={tfootStyle}>
                                        <tr style={trTotalGlobal}>
                                            <td colSpan="2" style={tdTotalLabelFinal}>TOTAUX GÉNÉRAUX</td>
                                            <td style={tdTotalValFinalBold}>{formatCur(totals.solde)}</td>
                                            <td style={tdTotalValFinalBold}>{formatCur(totals.non_echu)}</td>
                                            <td style={tdTotalValFinalBold}>{formatCur(totals.t1)}</td>
                                            <td style={tdTotalValFinalBold}>{formatCur(totals.t2)}</td>
                                            <td style={tdTotalValFinalBold}>{formatCur(totals.t3)}</td>
                                            <td style={tdTotalValFinalBold}>{formatCur(totals.t4)}</td>
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

// --- STYLES ADDITIONNELS ---
const placeholderStyle = { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: 'white', borderRadius: '4px', border: '2px dashed #e2e8f0' };
const btnDisabled = { background: '#f1f5f9', color: '#cbd5e1', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: '800', cursor: 'not-allowed', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px' };

// --- STYLES PRÉCÉDENTS (CONSERVÉS) ---
const layoutStyle = { display: 'flex', height: '100vh', background: '#f1f5f9', overflow: 'hidden' };
const mainStyle = { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' };
const headerStyle = { background: 'white', padding: '12px 30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0' };
const filterPanel = { background: 'white', padding: '15px 30px', borderBottom: '2px solid #1e3a8a' };
const filterGrid = { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' };
const filterGroup = { display: 'flex', flexDirection: 'column', gap: '3px' };
const labelStyle = { fontSize: '10px', fontWeight: '900', color: '#1e3a8a' };
const selectStyle = { padding: '5px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px', fontWeight: '700', background: 'white' };
const inputStyle = { ...selectStyle };
const inputSearch = { padding: '7px 7px 7px 30px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', width: '100%' };
const searchIcon = { position:'absolute', left:'10px', top:'9px', color:'#1e3a8a' };
const contentStyle = { padding: '15px', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' };
const tableWrapper = { flex: 1, background: 'white', borderRadius: '4px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'hidden' };
const scrollContainer = { flex: 1, overflowY: 'auto', overflowX: 'auto' };
const tableStyle = { width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '10.5px' };
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
const tfootStyle = { position: 'sticky', bottom: 0, zIndex: 5, background: 'white' };
const tdTotalLabelFinal = { padding: '8px 10px', fontWeight: '900', borderTop: '2px solid #1e3a8a', borderRight: '1px solid #cbd5e1', textAlign: 'right', textTransform: 'uppercase', background: '#e8eaf6', color: '#1e3a8a' };
const tdTotalValFinalBold = { padding: '8px 10px', borderTop: '2px solid #1e3a8a', borderRight: '1px solid #cbd5e1', textAlign: 'right', fontWeight: '900', fontFamily: 'monospace', fontSize: '11.5px', background: '#e8eaf6', color: '#1e3a8a' };
const trTotalGlobal = { background: '#f8fafc' };

export default Rap_BalanceAgee;