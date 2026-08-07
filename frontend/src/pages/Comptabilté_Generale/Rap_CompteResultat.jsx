import React, { useState, useEffect } from 'react';
import { Loader2, Printer, FileText, Play, ArrowRight } from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import API from '../../services/api';

const BORDEAUX = '#800020';

const Rap_CompteResultat = () => {
    const [loading, setLoading] = useState(false);
    const [exercices, setExercices] = useState([]);
    const [data, setData] = useState([]);
    const [exerciceId, setExerciceId] = useState('');
    const [years, setYears] = useState({ current: 'N', prev: 'N-1' });

    useEffect(() => {
        const init = async () => {
            try {
                const res = await API.get('/plan-comptable/exercices/liste');
                const list = res.data.data || [];
                setExercices(list);
                const activeEx = list.find(ex => ex.statut === 'OUVERT') || list[0];
                if (activeEx) {
                    setExerciceId(activeEx.id);
                    const yr = new Date(activeEx.date_debut).getFullYear();
                    setYears({ current: yr, prev: yr - 1 });
                }
            } catch (err) { console.error("Erreur init:", err); }
        };
        init();
    }, []);

    const handleExerciceChange = (e) => {
        const id = e.target.value;
        setExerciceId(id);
        const selected = exercices.find(ex => String(ex.id) === String(id));
        if (selected) {
            const yr = new Date(selected.date_debut).getFullYear();
            setYears({ current: yr, prev: yr - 1 });
        }
    };

    const generateCompteResultat = async () => {
        if (!exerciceId) return alert("Sélectionnez un exercice");
        setLoading(true);
        try {
            const res = await API.get('/compta/rapports/compte-resultat', { params: { exerciceId } });
            setData(res.data.data || []);
        } catch (err) {
            console.error("Erreur génération compte résultat:", err);
        } finally {
            setLoading(false);
        }
    };

    const formatCur = (val) => val ? new Intl.NumberFormat('fr-FR').format(Math.round(val)) : '0';
    
    // Détection des lignes de totaux (Masses X) selon ton image
    const isTotalRow = (code) => code.startsWith('X');

    return (
        <div style={layoutStyle}>
            <Sidebar />
            <main style={mainStyle}>
                <header style={headerStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div style={iconBox}><FileText color="white" size={24} /></div>
                        <div>
                            <h1 style={titleStyle}>COMPTE DE RÉSULTAT</h1>
                            <div style={{fontSize: '11px', color: '#64748b', fontWeight: '600'}}>SYSTÈME NORMAL • RÉFÉRENTIEL SYSCOHADA</div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                        <div style={filterGroup}>
                            <label style={labelMini}>EXERCICE COMPTABLE</label>
                            <select style={selectSmall} value={exerciceId} onChange={handleExerciceChange}>
                                {exercices.map(ex => <option key={ex.id} value={ex.id}>{ex.libelle}</option>)}
                            </select>
                        </div>

                        <button onClick={generateCompteResultat} style={btnGenerate} disabled={loading}>
                            {loading ? <Loader2 className="animate-spin" size={18} /> : <Play size={18} fill="white" />}
                            <span style={{marginLeft: '10px'}}>GÉNÉRER LE RAPPORT</span>
                        </button>

                        <button onClick={() => window.print()} style={btnSecondary}>
                            <Printer size={18} />
                        </button>
                    </div>
                </header>

                <div style={contentStyle}>
                    <div style={tableSection}>
                        <div style={tableHeaderTitle}>TABLEAU DU COMPTE DE RÉSULTAT</div>
                        <div style={tableCard}>
                            <table style={tableStyle}>
                                <thead style={stickyHeader}>
                                    <tr style={theadPrimary}>
                                        <th style={thRef}>REF</th>
                                        <th style={thLibHeader}>LIBELLÉS</th>
                                        <th style={thExHeader}>NET AU 31/12/{years.current}</th>
                                        <th style={thExHeader}>NET AU 31/12/{years.prev}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr><td colSpan="4" style={{textAlign: 'center', padding: '50px'}}><Loader2 className="animate-spin" color={BORDEAUX} /></td></tr>
                                    ) : data.length > 0 ? (
                                        data.map((row, i) => (
                                            <tr key={`cr-${i}`} style={isTotalRow(row.code) ? trT : (i % 2 === 0 ? trEven : trNormal)}>
                                                <td style={tdCode}>{row.code}</td>
                                                <td style={tdLib}>
                                                    {isTotalRow(row.code) && <ArrowRight size={10} style={{marginRight: '8px', color: BORDEAUX}}/>}
                                                    {row.libelle}
                                                </td>
                                                <td style={isTotalRow(row.code) ? tdNetBold : tdMontant}>{formatCur(row.montant_n)}</td>
                                                <td style={tdMontant}>{formatCur(row.montant_prec)}</td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr><td colSpan="4" style={{textAlign: 'center', padding: '100px', color: '#64748b'}}>Cliquez sur générer pour afficher les données</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

// --- STYLES (Identiques à ton Rap_Bilan pour la cohérence) ---
const layoutStyle = { display: 'flex', height: '100vh', background: '#f0f2f5', overflow: 'hidden' };
const mainStyle = { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' };
const headerStyle = { background: 'white', padding: '12px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `4px solid ${BORDEAUX}`, flexShrink: 0 };
const iconBox = { background: BORDEAUX, padding: '8px', borderRadius: '10px' };
const titleStyle = { margin: 0, fontSize: '18px', fontWeight: '900', color: BORDEAUX };
const filterGroup = { display: 'flex', flexDirection: 'column' };
const labelMini = { fontSize: '9px', fontWeight: '800', color: '#64748b', marginBottom: '2px' };
const selectSmall = { padding: '5px 10px', borderRadius: '5px', border: '1px solid #cbd5e1', fontSize: '11px', fontWeight: 'bold' };
const btnGenerate = { background: BORDEAUX, color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: '900', cursor: 'pointer', display: 'flex', alignItems: 'center' };
const btnSecondary = { background: 'white', color: BORDEAUX, border: `1px solid ${BORDEAUX}`, padding: '10px', borderRadius: '8px', cursor: 'pointer' };
const contentStyle = { padding: '20px', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' };
const tableSection = { display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' };
const tableHeaderTitle = { background: BORDEAUX, color: 'white', textAlign: 'center', padding: '8px', fontWeight: '800', fontSize: '12px', borderRadius: '8px 8px 0 0' };
const tableCard = { background: 'white', borderRadius: '0 0 12px 12px', border: '1px solid #e2e8f0', overflowY: 'auto', flex: 1 };
const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: '11px' };
const stickyHeader = { position: 'sticky', top: 0, zIndex: 10, background: 'white' };
const thBase = { padding: '10px', border: '1px solid #e2e8f0', fontWeight: '800', textTransform: 'uppercase' };
const thRef = { ...thBase, width: '60px', background: '#f8fafc' };
const thLibHeader = { ...thBase, textAlign: 'left', background: '#f8fafc' };
const thExHeader = { ...thBase, background: '#f1f5f9', color: BORDEAUX };
const theadPrimary = { background: 'white' };
const trNormal = { height: '32px' };
const trEven = { background: '#fafbfc' };
const trT = { background: '#fef2f2', fontWeight: '800', color: BORDEAUX }; 
const tdCode = { padding: '8px', border: '1px solid #e2e8f0', textAlign: 'center', fontWeight: '700', fontFamily: 'monospace' };
const tdLib = { padding: '8px 15px', border: '1px solid #e2e8f0', textAlign: 'left', textTransform: 'uppercase' };
const tdMontant = { padding: '8px 15px', border: '1px solid #e2e8f0', textAlign: 'right', fontFamily: 'monospace' };
const tdNetBold = { ...tdMontant, fontWeight: '800' };

export default Rap_CompteResultat;