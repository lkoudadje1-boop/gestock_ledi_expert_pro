import React, { useState, useEffect } from 'react';
import { 
    Calendar, ArrowUpDown, Filter, ChevronRight, CheckCircle, 
    ShoppingCart, Wallet, BadgeEuro, FileText, Circle, Edit3
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../../components/Sidebar';
import API, { socket } from '../../services/api';

const JournalSelectionBrouillon = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [journaux, setJournaux] = useState([]);
    const [exercices, setExercices] = useState([]);
    const [selectedExerciceId, setSelectedExerciceId] = useState(''); 
    const [sortConfig, setSortConfig] = useState({ key: 'moisIdx', direction: 'asc' });
    
    const moisAnnee = ["janv", "févr", "mars", "avr", "mai", "juin", "juil", "août", "sept", "oct", "nov", "déc"];

    useEffect(() => {
        fetchInitialData();

        if (socket) {
            const handleRefresh = () => {
                console.log("🔄 Mise à jour des statuts de brouillon...");
                fetchInitialData();
            };

            socket.on('DATA_EVENT', (event) => {
                if (event.table === 'brouillon_ecritures' || event.table === 'journaux') {
                    handleRefresh();
                }
            });

            return () => {
                if (socket) socket.off('DATA_EVENT');
            };
        }
    }, [selectedExerciceId]);

    const fetchInitialData = async () => {
        setLoading(true);
        try {
            // ✅ CORRECTION DEFINITIVE : On appelle la route du BrouillonController
            // et non plus celle de l'écriture réelle.
            const [resJ, resE] = await Promise.all([
    API.get(`/plan-comptable/ecritures-brouillon/liste-journaux-brouillon?exercice_id=${selectedExerciceId || ''}`), 
    API.get('/plan-comptable/exercices/liste')
]);
            if (resJ.data.success && resE.data.success) {
                const journauxData = resJ.data.data || [];
                const exData = resE.data.data || [];

                setJournaux(journauxData);
                setExercices(exData);
                
                if (exData.length > 0 && !selectedExerciceId) {
                    const encours = exData.find(ex => ex.statut === 'OUVERT') || exData[0];
                    setSelectedExerciceId(encours.id);
                }
            }
        } catch (err) { 
            console.error("❌ Erreur de chargement BrouillonSelection:", err);
        } finally { 
            setLoading(false); 
        }
    };

    const getJournalIcon = (type) => {
        switch(type) {
            case 'ACHAT': return <ShoppingCart size={18} style={{ color: '#f59e0b' }} />;
            case 'VENTE': return <BadgeEuro size={18} style={{ color: '#2563eb' }} />;
            case 'BANQUE':
            case 'CAISSE': return <Wallet size={18} style={{ color: '#10b981' }} />;
            default: return <FileText size={18} style={{ color: '#64748b' }} />;
        }
    };

    const requestSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
        setSortConfig({ key, direction });
    };

   const getFilteredAndSortedData = () => {
    let flatData = [];
    const ex = exercices.find(e => e.id.toString() === selectedExerciceId.toString());
    
    if (ex) {
        moisAnnee.forEach((m, mIdx) => {
            journaux.forEach(j => {
                // ✅ LOGIQUE ROBUSTE : Comparaison numérique des mois saisis
                const moisSaisisArr = j.mois_saisis ? j.mois_saisis.split(',') : [];
                const hasData = moisSaisisArr.some(val => Number(val) === mIdx);

                flatData.push({
                    id: `${ex.id}-${mIdx}-${j.id}`,
                    periode: `${m}. ${ex.date_debut.split('-')[0].slice(-2)}`,
                    moisIdx: mIdx,
                    code: j.code,
                    libelle: j.libelle,
                    type: j.type_journal,
                    statutEx: ex.statut, 
                    hasData: hasData, 
                    originalJournal: j,
                    originalEx: ex
                });
            });
        });
    }
        flatData.sort((a, b) => {
            if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
            if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
        return flatData;
    };

    const ouvrirBrouillon = (row) => {
        if (row.statutEx === 'CLOTURE') {
            alert("Cet exercice est clôturé. Vous ne pouvez pas saisir de brouillon.");
            return;
        }
        
        navigate('/compta/brouillon', { 
            state: { 
                journal: row.originalJournal, 
                mois: moisAnnee[row.moisIdx],
                moisIdx: row.moisIdx,
                exercice: row.originalEx
            } 
        });
    };

    const sortedRows = getFilteredAndSortedData();

    return (
        <div style={layoutStyle}>
            <Sidebar />
            <main style={mainStyle}>
                <header style={headerStyle}>
                    <div style={{display:'flex', alignItems:'center', gap:'15px'}}>
                        <div style={iconBox}><Edit3 size={22} color="white"/></div>
                        <div>
                            <h1 style={titleStyle}>SAISIE ASSISTANT (BROUILLONS)</h1>
                            <p style={{fontSize:'12px', color:'#64748b', margin:0}}>Sélectionnez une période pour vos saisies provisoires</p>
                        </div>
                    </div>
                    <div style={filterBox}>
                        <Filter size={16} color="#f59e0b" />
                        <select style={selectFilter} value={selectedExerciceId} onChange={(e) => setSelectedExerciceId(e.target.value)}>
                            {exercices.map(ex => (
                                <option key={ex.id} value={ex.id}>EX {ex.date_debut.split('-')[0]} ({ex.statut})</option>
                            ))}
                        </select>
                    </div>
                </header>

                <div style={contentBody}>
                    <div style={tableWrapper}>
                        <table style={tableStyle}>
                            <thead style={theadStyle}>
                                <tr>
                                    <th style={thSortable} onClick={() => requestSort('moisIdx')}>Période <ArrowUpDown size={12}/></th>
                                    <th style={thSortable} onClick={() => requestSort('code')}>Journal <ArrowUpDown size={12}/></th>
                                    <th style={thSortable} onClick={() => requestSort('libelle')}>Libellé <ArrowUpDown size={12}/></th>
                                    <th style={{...thStyle, textAlign:'center'}}>Action</th>
                                </tr>
                            </thead>
                           <tbody>
    {sortedRows.map(row => (
        <tr key={row.id} style={trStyle}>
            <td style={tdStyle}>{row.periode}</td>
            <td style={tdStyle}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {getJournalIcon(row.type)}
                        <span style={badgeCode}>{row.code}</span>
                    </div>

                    {row.hasData && (
                        <div style={badgeEnCours}>
                            <Circle size={8} fill="#10b981" color="#10b981" />
                            <span>SAISIE EN COURS</span>
                        </div>
                    )}
                </div>
            </td>
            <td style={{ ...tdStyle, fontWeight: 700 }}>{row.libelle}</td>
            <td style={{ ...tdStyle, textAlign: 'center' }}>
                <button
                    onClick={() => ouvrirBrouillon(row)}
                    style={row.statutEx === 'CLOTURE' ? btnDisabled : btnOuvrirBrouillon}
                >
                    {row.hasData ? "Continuer Brouillon" : "Saisir Brouillon"} <ChevronRight size={14} />
                </button>
            </td>
        </tr>
    ))}
</tbody>
                        </table>
                        {loading && (
                            <div style={{padding: 20, textAlign: 'center', color: '#64748b'}}>Chargement des périodes...</div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
};

// --- STYLES (Inchangés) ---
const layoutStyle = { display: 'flex', height: '100vh', background: '#f1f5f9' };
const mainStyle = { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' };
const headerStyle = { background: 'white', padding: '15px 40px', borderBottom: '2px solid #f59e0b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
const filterBox = { display: 'flex', alignItems: 'center', gap: '8px', background: '#fffbeb', padding: '6px 15px', borderRadius: '8px', border: '1px solid #fcd34d' };
const selectFilter = { border: 'none', background: 'transparent', outline: 'none', fontSize: '13px', fontWeight: '800', cursor: 'pointer', color: '#92400e' };
const iconBox = { background: '#f59e0b', padding: '10px', borderRadius: '10px' };
const titleStyle = { margin: 0, fontSize: '18px', fontWeight: '900', color: '#451a03' };
const badgeCode = { background: '#451a03', color: 'white', padding: '3px 7px', borderRadius: '5px', fontWeight: 900, fontSize: '10px' };
const btnDisabled = { background: '#cbd5e1', color: '#94a3b8', border: 'none', padding: '6px 15px', borderRadius: '6px', cursor: 'not-allowed', display:'flex', alignItems:'center', gap: 5, fontWeight: 700 };
const contentBody = { padding: '20px 40px', flex: 1, overflowY: 'auto' };
const tableWrapper = { background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' };
const tableStyle = { width: '100%', borderCollapse: 'collapse' };
const theadStyle = { background: '#fffbeb', borderBottom: '2px solid #fcd34d' };
const thStyle = { padding: '12px 15px', textAlign: 'left', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', color: '#92400e' };
const thSortable = { ...thStyle, cursor: 'pointer' };
const tdStyle = { padding: '12px 15px', fontSize: '13px', borderBottom: '1px solid #f1f5f9' };
const trStyle = { borderBottom: '1px solid #f1f5f9' };
const badgeEnCours = {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    background: '#dcfce7',
    color: '#15803d',
    padding: '3px 10px',
    borderRadius: '12px',
    fontSize: '9px',
    fontWeight: '900',
    border: '1px solid #bbf7d0',
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
};
const btnOuvrirBrouillon = { 
    background: '#f59e0b', 
    color: 'white', 
    border: 'none', 
    padding: '6px 15px', 
    borderRadius: '6px', 
    cursor: 'pointer', 
    display: 'flex', 
    alignItems: 'center', 
    gap: 5, 
    fontWeight: 700,
    fontSize: '12px',
    transition: 'background 0.2s'
};

export default JournalSelectionBrouillon;