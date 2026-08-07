import React, { useState, useEffect, useMemo } from 'react';
import { 
    Loader2, Printer, Download, BarChart3, Search, RefreshCcw 
} from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import API, { socket } from '../../services/api';
import { useLocation, useNavigate } from 'react-router-dom';

const Rap_BalanceComptes = ({ user }) => {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState([]);
    const navigate = useNavigate();
    const [exercices, setExercices] = useState([]);
    const [journaux, setJournaux] = useState([]);
    
    const [params, setParams] = useState({
        exerciceId: '',
        typeBalance: '6', 
        dateDebut: '',
        dateFin: '',
        compteDebut: '',
        compteFin: '',
        journalDebut: '',
        journalFin: '',
        inclureBrouillard: false
    });

    const [searchTerm, setSearchTerm] = useState('');

    // --- 1. EN-TÊTES DYNAMIQUES (SAGE COMPATIBLE) ---
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
    // Vers la ligne 80 environ
// ✅ CORRECTION : On ajoute l'exerciceId pour éviter l'erreur 400
const ouvrirHistoriqueCompte = (num) => {
    if (!num || !params.exerciceId) return;
    
    // On passe le numéro de compte ET l'ID de l'exercice sélectionné dans la balance
    navigate(`/compta/historique-compte/${num}?exerciceId=${params.exerciceId}`);
};
    const handleDateChange = (field, value) => {
        setParams(prev => ({ ...prev, [field]: value }));
    };

    const fetchInitialData = async () => {
        setLoading(true);
        try {
            const [resEx, resJr] = await Promise.all([
                API.get('/plan-comptable/exercices/liste'),
                API.get('/plan-comptable/journaux/liste')
            ]);
            
            const listEx = resEx.data.data || [];
            setExercices(listEx);
            setJournaux(resJr.data.data || []);

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
            const res = await API.get('/compta/rapports/balance', { params });
            setData(res.data.data || []);
        } catch (err) { console.error("Erreur fetch balance:", err); }
        finally { setLoading(false); }
    };

useEffect(() => {
    fetchInitialData();

    if (socket) {
        // Rafraîchissement manuel déclenché par le backend
        socket.on('REFRESH_COMPTA_DATA', fetchBalance);

        // Écoute universelle des changements de tables comptables
        socket.on('DATA_EVENT', (event) => {
            if (['journal_entries', 'lignes_ecritures', 'brouillon_ecritures'].includes(event.table)) {
                console.log("📊 Mise à jour de la balance détectée...");
                fetchBalance();
            }
        });

        return () => {
            socket.off('REFRESH_COMPTA_DATA');
            socket.off('DATA_EVENT');
        };
    }
}, [params.exerciceId]); // Se réinitialise si on change d'exercice
    const filteredData = useMemo(() => {
        return data.filter(item => 
            item.numero_compte.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.intitule.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [data, searchTerm]);

    const formatCur = (val) => val ? new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0 }).format(val) : '';

const totals = useMemo(() => {
    const init = { ant_d: 0, ant_c: 0, per_d: 0, per_c: 0, sol_per_d: 0, sol_per_c: 0, cum_d: 0, cum_c: 0 };
    const bilan = { ...init };
    const gestion = { ...init };

    filteredData.forEach(row => {
        const isCompteResultat = row.numero_compte.startsWith('120') || row.numero_compte.startsWith('129');
        const firstChar = row.numero_compte.charAt(0);
        
        const target = ((firstChar >= '1' && firstChar <= '5') || isCompteResultat) ? bilan : 
                       (firstChar >= '6' && firstChar <= '8') ? gestion : null;
        
        if (target) {
            target.ant_d += parseFloat(row.mouv_ant_debit || 0);
            target.ant_c += parseFloat(row.mouv_ant_credit || 0);
            target.per_d += parseFloat(row.mouv_periode_debit || 0);
            target.per_c += parseFloat(row.mouv_periode_credit || 0);
        }
    });

    const calculerSoldeNet = (obj) => {
        const diffPer = obj.per_d - obj.per_c;
        obj.sol_per_d = diffPer > 0 ? diffPer : 0;
        obj.sol_per_c = diffPer < 0 ? Math.abs(diffPer) : 0;

        const totalDebits = obj.ant_d + obj.per_d;
        const totalCredits = obj.ant_c + obj.per_c;
        const diffCumul = totalDebits - totalCredits;
        obj.cum_d = diffCumul > 0 ? diffCumul : 0;
        obj.cum_c = diffCumul < 0 ? Math.abs(diffCumul) : 0;
    };

    calculerSoldeNet(bilan);
    calculerSoldeNet(gestion);

    // 🏆 TOTAL GLOBAL : On garde les mouvements mais on VIDE les soldes
    const global = {
        ant_d: bilan.ant_d + gestion.ant_d,
        ant_c: bilan.ant_c + gestion.ant_c,
        per_d: bilan.per_d + gestion.per_d,
        per_c: bilan.per_c + gestion.per_c,
        // 🗑️ On force à 0 pour laisser les cases vides sur l'image
        sol_per_d: 0, 
        sol_per_c: 0, 
        cum_d: 0, 
        cum_c: 0
    };

    return { bilan, gestion, global };
}, [filteredData]);

    const headers = getDynamicHeaders();

    return (
        <div style={layoutStyle}>
            <Sidebar />
            <main style={mainStyle}>
                <header style={headerStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div style={iconBox}><BarChart3 size={22} color="white" /></div>
                        <div>
                            <h1 style={titleStyle}>BALANCE DES COMPTES</h1>
                            <div style={{fontSize: '11px', color: '#64748b'}}>
                                {params.dateDebut ? `Exercice ${new Date(params.dateDebut).getFullYear()} • ${params.typeBalance} colonnes` : 'Chargement...'}
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
                            <input type="text" placeholder="Rechercher..." style={inputSearch} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                         </div>
                         <button style={btnRefresh} onClick={fetchBalance}>
                            <RefreshCcw size={16} className={loading ? "animate-spin" : ""} /> CALCULER LA BALANCE
                         </button>
                    </div>
                </section>

                <div style={contentStyle}>
                    {loading ? (
                        <div style={centerStyle}><Loader2 className="animate-spin" size={40} color="#0f172a" /></div>
                    ) : (
                        <div style={tableWrapper}>
                            <div style={scrollContainer}>
                                <table style={tableStyle}>
                                    <thead style={stickyHeader}>
                                        <tr>
                                            <th rowSpan="2" style={thFixed}>Numéro</th>
                                            <th rowSpan="2" style={thFixed}>Intitulé des comptes</th>
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
                                            <tr><td colSpan="12" style={{padding:'40px', textAlign:'center', color:'#94a3b8'}}>Aucune donnée.</td></tr>
                                        ) : filteredData.map((row, idx) => (
                                            <tr key={idx} style={trStyle}>
                                            

<td 
    style={{
        ...tdCompte, 
        cursor: 'pointer', 
        color: '#2563eb', 
        textDecoration: 'underline'
    }} 
    onClick={() => ouvrirHistoriqueCompte(row.numero_compte)} // 👈 C'EST CET APPEL QUI ÉTAIT FAUX
    title={`Voir l'historique du compte ${row.numero_compte}`}
>
    {row.numero_compte}
</td>
                                                <td style={tdIntitule}>{row.intitule}</td>
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
    {/* --- LIGNE TOTAL BILAN --- */}
    <tr style={trTotalBilan}>
        <td colSpan="2" style={tdTotalLabel}>Totaux comptes de bilan</td>
        
        {/* Colonnes Antérieures (si 6 ou 8) */}
        {(params.typeBalance === '6' || params.typeBalance === '8') && (
            <>
                <td style={tdTotalVal}>{formatCur(totals.bilan.ant_d)}</td>
                <td style={tdTotalVal}>{formatCur(totals.bilan.ant_c)}</td>
            </>
        )}

        {/* Colonnes Période (Toujours présentes) */}
        <td style={tdTotalVal}>{formatCur(totals.bilan.per_d)}</td>
        <td style={tdTotalVal}>{formatCur(totals.bilan.per_c)}</td>

        {/* Colonnes Solde Période (uniquement si 8) */}
        {params.typeBalance === '8' && (
            <>
                <td style={tdTotalVal}>{formatCur(totals.bilan.sol_per_d)}</td>
                <td style={tdTotalVal}>{formatCur(totals.bilan.sol_per_c)}</td>
            </>
        )}

        {/* Colonnes Soldes Cumulés (Toujours présentes) */}
        <td style={tdTotalValBold}>{formatCur(totals.bilan.cum_d)}</td>
        <td style={tdTotalValBold}>{formatCur(totals.bilan.cum_c)}</td>
    </tr>

    {/* --- LIGNE TOTAL GESTION --- */}
    <tr style={trTotalGestion}>
        <td colSpan="2" style={tdTotalLabel}>Totaux comptes de gestion</td>
        {(params.typeBalance === '6' || params.typeBalance === '8') && (
            <>
                <td style={tdTotalVal}>{formatCur(totals.gestion.ant_d)}</td>
                <td style={tdTotalVal}>{formatCur(totals.gestion.ant_c)}</td>
            </>
        )}
        <td style={tdTotalVal}>{formatCur(totals.gestion.per_d)}</td>
        <td style={tdTotalVal}>{formatCur(totals.gestion.per_c)}</td>
        {params.typeBalance === '8' && (
            <>
                <td style={tdTotalVal}>{formatCur(totals.gestion.sol_per_d)}</td>
                <td style={tdTotalVal}>{formatCur(totals.gestion.sol_per_c)}</td>
            </>
        )}
        <td style={tdTotalValBold}>{formatCur(totals.gestion.cum_d)}</td>
        <td style={tdTotalValBold}>{formatCur(totals.gestion.cum_c)}</td>
    </tr>

    {/* --- LIGNE TOTAL BALANCE --- */}
    <tr style={trTotalGlobal}>
        <td colSpan="2" style={tdTotalLabelFinal}>Totaux de la balance</td>
        {(params.typeBalance === '6' || params.typeBalance === '8') && (
            <>
                <td style={tdTotalValFinalBold}>{formatCur(totals.global.ant_d)}</td>
                <td style={tdTotalValFinalBold}>{formatCur(totals.global.ant_c)}</td>
            </>
        )}
        <td style={tdTotalValFinalBold}>{formatCur(totals.global.per_d)}</td>
        <td style={tdTotalValFinalBold}>{formatCur(totals.global.per_c)}</td>
        {params.typeBalance === '8' && (
            <>
                <td style={tdTotalValFinalBold}>{formatCur(totals.global.sol_per_d)}</td>
                <td style={tdTotalValFinalBold}>{formatCur(totals.global.sol_per_c)}</td>
            </>
        )}
        <td style={tdTotalValFinalBold}>{formatCur(totals.global.cum_d)}</td>
        <td style={tdTotalValFinalBold}>{formatCur(totals.global.cum_c)}</td>
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

// --- STYLES ---
const layoutStyle = { display: 'flex', height: '100vh', background: '#f1f5f9', overflow: 'hidden' };
const mainStyle = { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' };
const headerStyle = { background: 'white', padding: '12px 30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0' };
const filterPanel = { background: 'white', padding: '15px 30px', borderBottom: '2px solid #cbd5e1' };
const filterGrid = { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' };
const filterGroup = { display: 'flex', flexDirection: 'column', gap: '3px' };
const labelStyle = { fontSize: '10px', fontWeight: '900', color: '#475569' };
const selectStyle = { padding: '5px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px', fontWeight: '700', background: 'white' };
const inputStyle = { ...selectStyle };
const searchBarContainer = { marginTop: '12px', display:'flex', justifyContent:'space-between', alignItems:'center' };
const inputSearch = { padding: '7px 7px 7px 30px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', width: '250px' };
const searchIcon = { position:'absolute', left:'10px', top:'9px', color:'#64748b' };
const contentStyle = { padding: '15px', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' };
const tableWrapper = { flex: 1, background: 'white', borderRadius: '4px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'hidden' };
const scrollContainer = { flex: 1, overflowY: 'auto', overflowX: 'auto' };
const tableStyle = { width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '11px' };
const stickyHeader = { position: 'sticky', top: 0, zIndex: 10 };
const thFixed = { borderBottom: '1px solid #cbd5e1', borderRight: '1px solid #cbd5e1', padding: '10px', background: '#f8fafc', fontWeight: '900', textAlign: 'left' };
const thGroup = { borderBottom: '1px solid #cbd5e1', borderRight: '1px solid #cbd5e1', padding: '6px', background: '#e2e8f0', fontWeight: '900', textAlign: 'center' };
const thSub = { borderBottom: '1px solid #cbd5e1', borderRight: '1px solid #cbd5e1', padding: '6px', background: '#f1f5f9', fontWeight: '900', textAlign: 'center' };
const trStyle = { height: '32px' };
const tdCompte = { padding: '5px 10px', borderBottom: '1px solid #f1f5f9', borderRight: '1px solid #f1f5f9', fontWeight: '900' };
const tdIntitule = { padding: '5px 10px', borderBottom: '1px solid #f1f5f9', borderRight: '1px solid #f1f5f9', color: '#334155' };
const tdMontant = { padding: '5px 10px', borderBottom: '1px solid #f1f5f9', borderRight: '1px solid #f1f5f9', textAlign: 'right', fontFamily: 'monospace' };
const tdMontantBold = { ...tdMontant, fontWeight: 'bold', color: '#0f172a' };
const btnPrimary = { background: '#0f172a', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px' };
const btnSecondary = { background: '#f8fafc', color: '#0f172a', border: '1px solid #cbd5e1', padding: '8px 16px', borderRadius: '6px', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px' };
const btnRefresh = { ...btnPrimary, background: '#2563eb' };
const iconBox = { background: '#0f172a', padding: '6px', borderRadius: '6px' };
const titleStyle = { margin: 0, fontSize: '14px', fontWeight: '900', color: '#0f172a' };
const centerStyle = { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' };

// --- FOOTER STYLES ---
const tfootStyle = { position: 'sticky', bottom: 0, zIndex: 5, background: 'white' };
const tdTotalLabel = { padding: '8px 10px', fontWeight: '900', borderTop: '2px solid #0f172a', borderRight: '1px solid #cbd5e1', textAlign: 'right', textTransform: 'uppercase' };
const tdTotalLabelFinal = { ...tdTotalLabel, background: '#f8fafc', color: '#2563eb' };
const tdTotalVal = { padding: '8px 10px', borderTop: '2px solid #0f172a', borderRight: '1px solid #cbd5e1', textAlign: 'right', fontWeight: '700', fontFamily: 'monospace' };
const tdTotalValBold = { ...tdTotalVal, background: '#f1f5f9', fontWeight: '900' };
const tdTotalValFinal = { ...tdTotalVal, background: '#f8fafc', borderTop: '2px solid #2563eb', color: '#2563eb' };
const tdTotalValFinalBold = { ...tdTotalValFinal, fontWeight: '900', fontSize: '12px' };
const trTotalBilan = { background: '#ffffff' };
const trTotalGestion = { background: '#ffffff' };
const trTotalGlobal = { background: '#f8fafc' };

export default Rap_BalanceComptes;