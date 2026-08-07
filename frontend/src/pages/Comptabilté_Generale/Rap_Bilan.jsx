import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'; // ✅ Ajout des Hooks manquants
import { Loader2, Printer, FileText, ArrowRight, Play } from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import API, { socket } from '../../services/api'; // ✅ Import du socket corrigé
import PassifTable from './passif'; 

const BORDEAUX = '#800020';

const Rap_Bilan = () => {
    const [loading, setLoading] = useState(false);
    const [exercices, setExercices] = useState([]);
    const [data, setData] = useState({ actif: [], passif: [] });
    const [exerciceId, setExerciceId] = useState('');
    const [years, setYears] = useState({ current: 'N', prev: 'N-1' });

    // 🚀 REF POUR LE TEMPS RÉEL : Empêche le rafraîchissement si aucun calcul n'a été fait
    const hasDataRef = useRef(false);

    // 🎯 INITIALISATION DES DONNÉES
    const init = useCallback(async () => {
        try {
            const res = await API.get('/plan-comptable/exercices/liste');
            const list = res.data.data || [];
            setExercices(list);
            
            // Sélection de l'exercice par défaut (OUVERT ou le premier de la liste)
            const activeEx = list.find(ex => ex.statut === 'OUVERT') || list[0];
            if (activeEx) {
                setExerciceId(activeEx.id);
                const yr = new Date(activeEx.date_debut).getFullYear();
                setYears({ current: yr, prev: yr - 1 });
            }
        } catch (err) { 
            console.error("Erreur init bilan:", err); 
        }
    }, []);

    useEffect(() => {
        init();

        // 📡 CONFIGURATION DU TEMPS RÉEL
        if (socket) {
            const handleAutoRefresh = () => {
                // On ne rafraîchit que si l'utilisateur a déjà généré un bilan à l'écran
                if (hasDataRef.current) {
                    console.log("📊 Mise à jour du bilan en temps réel...");
                    generateFullBilan();
                }
            };

            socket.on('REFRESH_COMPTA_DATA', handleAutoRefresh);
            socket.on('DATA_EVENT', (event) => {
                if (['journal_entries', 'lignes_ecritures'].includes(event.table)) {
                    handleAutoRefresh();
                }
            });

            return () => {
                socket.off('REFRESH_COMPTA_DATA');
                socket.off('DATA_EVENT');
            };
        }
    }, [init]);

    // Mise à jour de la ref de présence de données
    useEffect(() => {
        hasDataRef.current = data.actif.length > 0;
    }, [data]);

    const handleExerciceChange = (e) => {
        const id = e.target.value;
        setExerciceId(id);
        const selected = exercices.find(ex => String(ex.id) === String(id));
        if (selected) {
            const yr = new Date(selected.date_debut).getFullYear();
            setYears({ current: yr, prev: yr - 1 });
            // On vide les données quand on change d'exercice pour forcer une nouvelle génération
            setData({ actif: [], passif: [] });
        }
    };

    // 🎯 GÉNÈRE L'ACTIF ET LE PASSIF
    const generateFullBilan = async () => {
        if (!exerciceId) return alert("Sélectionnez un exercice");
        
        const selected = exercices.find(ex => String(ex.id) === String(exerciceId));
        if (!selected) return;

        setLoading(true);
        try {
            const params = { 
                exerciceId, 
                dateDebut: selected.date_debut.split('T')[0], 
                dateFin: selected.date_fin.split('T')[0] 
            };

            const [resActif, resPassif] = await Promise.all([
                API.get('/compta/rapports/bilan', { params }),
                API.get('/compta/rapports/bilan-passif', { params })
            ]);

            setData({
                actif: resActif.data.actif || [],
                passif: resPassif.data.passif || []
            });
        } catch (err) {
            console.error("Erreur génération bilan:", err);
            alert("Erreur lors de la génération du bilan. Vérifiez la connexion au serveur.");
        } finally {
            setLoading(false);
        }
    };

    const formatCur = (val) => val ? new Intl.NumberFormat('fr-FR').format(Math.round(val)) : '0';
    const isTotalRowActif = (code) => ['AD', 'AI', 'AP', 'AQ', 'AZ', 'BK', 'BT', 'BZ'].includes(code);

    return (
        <div style={layoutStyle}>
            <Sidebar />
            <main style={mainStyle}>
                <header style={headerStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div style={iconBox}><FileText color="white" size={24} /></div>
                        <div>
                            <h1 style={titleStyle}>BILAN ÉTAT FINANCIER</h1>
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

                        <button onClick={generateFullBilan} style={btnGenerate} disabled={loading}>
                            {loading ? <Loader2 className="animate-spin" size={18} /> : <Play size={18} fill="white" />}
                            <span style={{marginLeft: '10px'}}>GÉNÉRER LE BILAN</span>
                        </button>

                        <button onClick={() => window.print()} style={btnSecondary}>
                            <Printer size={18} />
                        </button>
                    </div>
                </header>

                <div style={contentStyle}>
                    <div style={dualViewContainer}>
                        
                        {/* --- BLOC ACTIF --- */}
                        <div style={tableSection}>
                            <div style={tableHeaderTitle}>FLUX DE L'ACTIF</div>
                            <div style={tableCard}>
                                <table style={tableStyle}>
                                    <thead style={stickyHeader}>
                                        <tr style={theadPrimary}>
                                            <th rowSpan="2" style={thRef}>REF</th>
                                            <th rowSpan="2" style={thLibHeader}>DESIGNATION ACTIF</th>
                                            <th colSpan="3" style={thExHeader}>EXERCICE {years.current}</th>
                                            <th style={thExHeader}>EXERCICE {years.prev}</th>
                                        </tr>
                                        <tr style={theadSecondary}>
                                            <th style={thSub}>BRUT</th>
                                            <th style={thSub}>AMORT</th>
                                            <th style={thSub}>NET</th>
                                            <th style={thSub}>NET</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {loading ? (
                                            <tr><td colSpan="6" style={{textAlign: 'center', padding: '50px'}}><Loader2 className="animate-spin" color={BORDEAUX} /></td></tr>
                                        ) : data.actif.length > 0 ? (
                                            data.actif.map((row, i) => (
                                                <tr key={`actif-${i}`} style={row.code === 'BZ' ? trGT : isTotalRowActif(row.code) ? trT : (i % 2 === 0 ? trEven : trNormal)}>
                                                    <td style={tdCode}>{row.code}</td>
                                                    <td style={tdLib}>{isTotalRowActif(row.code) && <ArrowRight size={10} style={{marginRight: '5px'}}/>}{row.libelle}</td>
                                                    <td style={tdMontant}>{formatCur(row.montant_brut)}</td>
                                                    <td style={tdMontant}>{formatCur(row.montant_amort)}</td>
                                                    <td style={row.code === 'BZ' ? tdNetGT : isTotalRowActif(row.code) ? tdNetBold : tdMontant}>{formatCur(row.montant_net)}</td>
                                                    <td style={tdMontant}>{formatCur(row.montant_prec)}</td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr><td colSpan="6" style={{textAlign: 'center', padding: '50px', color: '#64748b'}}>Aucune donnée. Sélectionnez un exercice et cliquez sur Générer.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* --- BLOC PASSIF --- */}
                        <div style={tableSection}>
                            <div style={tableHeaderTitle}>FLUX DU PASSIF</div>
                            <PassifTable passifData={data.passif} years={years} loading={loading} />
                        </div>

                    </div>
                </div>
            </main>
        </div>
    );
};

// --- STYLES (Conservés tels quels) ---
const layoutStyle = { display: 'flex', height: '100vh', background: '#f0f2f5', overflow: 'hidden' };
const mainStyle = { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' };
const headerStyle = { background: 'white', padding: '12px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `4px solid ${BORDEAUX}`, flexShrink: 0 };
const iconBox = { background: BORDEAUX, padding: '8px', borderRadius: '10px' };
const titleStyle = { margin: 0, fontSize: '18px', fontWeight: '900', color: BORDEAUX };
const filterGroup = { display: 'flex', flexDirection: 'column' };
const labelMini = { fontSize: '9px', fontWeight: '800', color: '#64748b', marginBottom: '2px' };
const selectSmall = { padding: '5px 10px', borderRadius: '5px', border: '1px solid #cbd5e1', fontSize: '11px', fontWeight: 'bold' };
const btnGenerate = { background: BORDEAUX, color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: '900', cursor: 'pointer', display: 'flex', alignItems: 'center', boxShadow: '0 4px 10px rgba(128, 0, 32, 0.2)' };
const btnSecondary = { background: 'white', color: BORDEAUX, border: `1px solid ${BORDEAUX}`, padding: '10px', borderRadius: '8px', cursor: 'pointer' };
const contentStyle = { padding: '20px', flex: 1, overflow: 'hidden', display: 'flex' };
const dualViewContainer = { display: 'flex', gap: '20px', flex: 1, height: '100%', overflow: 'hidden' };
const tableSection = { display: 'flex', flexDirection: 'column', flex: 1, height: '100%', overflow: 'hidden' };
const tableHeaderTitle = { background: BORDEAUX, color: 'white', textAlign: 'center', padding: '8px', fontWeight: '800', fontSize: '12px', borderRadius: '8px 8px 0 0' };
const tableCard = { background: 'white', borderRadius: '0 0 12px 12px', border: '1px solid #e2e8f0', overflowY: 'auto', flex: 1 };
const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: '10px' };
const stickyHeader = { position: 'sticky', top: 0, zIndex: 10, background: 'white' };
const thBase = { padding: '8px', border: '1px solid #e2e8f0', fontWeight: '800', textTransform: 'uppercase' };
const thRef = { ...thBase, width: '40px', background: '#f8fafc' };
const thLibHeader = { ...thBase, textAlign: 'left', background: '#f8fafc' };
const thExHeader = { ...thBase, background: '#f1f5f9', color: BORDEAUX };
const thSub = { ...thBase, background: '#f8fafc', fontSize: '8px' };
const theadPrimary = { background: 'white' };
const theadSecondary = { background: 'white' };
const trNormal = { height: '30px' };
const trEven = { background: '#fafbfc' };
const trT = { background: '#f1f5f9', fontWeight: '800' }; 
const trGT = { background: BORDEAUX, color: 'white', fontWeight: '900' };
const tdCode = { padding: '5px', border: '1px solid #e2e8f0', textAlign: 'center', fontWeight: '700' };
const tdLib = { padding: '5px 10px', border: '1px solid #e2e8f0', textAlign: 'left' };
const tdMontant = { padding: '5px 10px', border: '1px solid #e2e8f0', textAlign: 'right', fontFamily: 'monospace' };
const tdNetBold = { ...tdMontant, fontWeight: '700', color: BORDEAUX };
const tdNetGT = { ...tdMontant, color: 'white' };

export default Rap_Bilan;