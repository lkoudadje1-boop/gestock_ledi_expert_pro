import React, { useState, useEffect } from 'react';
import { 
    Calendar, ArrowUpDown, Filter, ChevronRight, CheckCircle, 
    ShoppingCart, Wallet, BadgeEuro, FileText, Circle, AlertTriangle,
    UploadCloud, Download, Loader2, XCircle, DownloadCloud, X, ChevronDown, ChevronUp
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../../components/Sidebar';
import API, { socket } from '../../services/api';

const JournalEcriture = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [journaux, setJournaux] = useState([]);
    const [exercices, setExercices] = useState([]);
    const [selectedExerciceId, setSelectedExerciceId] = useState(''); 
    const [sortConfig, setSortConfig] = useState({ key: 'moisIdx', direction: 'asc' });
    const [isProcessing, setIsProcessing] = useState(false); // ✅ Corrigé : bien déclaré ici
    const [analytiqueError, setAnalytiqueError] = useState(null);
    
    const [showExportPanel, setShowExportPanel] = useState(false);
    const [exportParams, setExportParams] = useState({
        journal_id: 'ALL',
        date_debut: '',
        date_fin: '',
        statut: 'NORMAL' 
    });
    
    const [toast, setToast] = useState({ show: false, message: '', type: 'info', onConfirm: null });

    const moisAnnee = ["janv", "févr", "mars", "avr", "mai", "juin", "juil", "août", "sept", "oct", "nov", "déc"];

   useEffect(() => {
    fetchInitialData();

    // ✅ ÉCOUTE DU TEMPS RÉEL
    if (socket) {
        const handleRefresh = () => {
            console.log("🔄 Mise à jour des journaux détectée...");
            fetchInitialData();
        };

        // On écoute les changements sur les écritures réelles et les brouillons
        socket.on('REFRESH_JOURNAL_ENTRIES', handleRefresh);
        socket.on('DATA_EVENT', (event) => {
            // Si une table de compta ou de tréso est modifiée, on rafraîchit les compteurs du tableau
            if (['journal_entries', 'brouillon_ecritures', 'treasury_ops'].includes(event.table)) {
                handleRefresh();
            }
        });

        return () => {
            socket.off('REFRESH_JOURNAL_ENTRIES', handleRefresh);
            socket.off('DATA_EVENT');
        };
    }
}, [selectedExerciceId, socket]);

    useEffect(() => {
        if (showExportPanel && exercices.length > 0) {
            const ex = exercices.find(e => e.id.toString() === selectedExerciceId.toString());
            if (ex) {
                setExportParams(prev => ({
                    ...prev,
                    date_debut: ex.date_debut,
                    date_fin: ex.date_fin
                }));
            }
        }
    }, [showExportPanel, selectedExerciceId, exercices]);

const fetchInitialData = async () => {
    setLoading(true);
    setAnalytiqueError(null);
    try {
        // Chargement des exercices si pas encore fait
        if (exercices.length === 0) {
            const resE = await API.get('/plan-comptable/exercices/liste');
            const exData = resE.data.data || [];
            setExercices(exData);
            
            if (exData.length > 0 && !selectedExerciceId) {
                const encours = exData.find(ex => ex.statut === 'OUVERT') || exData[0];
                setSelectedExerciceId(encours.id);
                return; // Le useEffect relancera fetchInitialData avec le bon ID
            }
        }

        // Chargement des statistiques des journaux
        if (selectedExerciceId) {
            const resJ = await API.get('/plan-comptable/ecritures/liste-journaux-statut', {
                params: { exercice_id: selectedExerciceId }
            });
            setJournaux(resJ.data.data || []);
            
            if (resJ.data.analytique_alerte) {
                setAnalytiqueError(resJ.data.message || "Plan analytique requis.");
            }
        }
    } catch (err) {
        console.error("Erreur de chargement JournalEcriture:", err);
    } finally {
        setLoading(false);
    }
};

    const showConfirm = (message, onConfirm) => {
        setToast({ show: true, message, type: 'confirm', onConfirm });
    };

    const showNotify = (message, type = 'success') => {
        setToast({ show: true, message, type, onConfirm: null });
        setTimeout(() => setToast(prev => ({ ...prev, show: false })), 4000);
    };

    const handleExecuteExport = async () => {
        setIsProcessing(true);
        try {
            const response = await API.get('/compta/export-massif', {
                params: { 
                    exercice_id: selectedExerciceId,
                    journal_id: exportParams.journal_id,
                    date_debut: exportParams.date_debut,
                    date_fin: exportParams.date_fin,
                    statut: exportParams.statut
                },
                responseType: 'blob'
            });

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            const journalLabel = exportParams.journal_id === 'ALL' ? 'TOUS' : journaux.find(j => j.id.toString() === exportParams.journal_id.toString())?.code;
            link.setAttribute('download', `EXPORT_${journalLabel}_${Date.now()}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            showNotify("Exportation réussie !");
            setShowExportPanel(false);
            
            // Réinitialisation après export
            const ex = exercices.find(e => e.id.toString() === selectedExerciceId.toString());
            setExportParams({
                journal_id: 'ALL',
                date_debut: ex ? ex.date_debut : '',
                date_fin: ex ? ex.date_fin : '',
                statut: 'NORMAL'
            });

        } catch (err) {
            showNotify("Erreur lors de l'exportation", "error");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleImportClick = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const exLibelle = exercices.find(ex => ex.id.toString() === selectedExerciceId.toString())?.date_debut.split('-')[0];
        showConfirm(`Confirmer l'importation (Pièces équilibrées requises) dans l'exercice ${exLibelle} ?`, () => executeImport(file));
        e.target.value = null; // ✅ Permet de ré-importer le même fichier
    };

 const executeImport = async (file) => {
    setIsProcessing(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('exercice_id', selectedExerciceId);
    
    try {
        const res = await API.post('/compta/import-massif', formData, {
            headers: {
                'Content-Type': 'multipart/form-data'
            }
        });
        showNotify(res.data.message);
        fetchInitialData();
    } catch (err) {
        showNotify(err.response?.data?.error || "Erreur d'importation", "error");
    } finally {
        setIsProcessing(false);
    }
};
    const getJournalIcon = (type) => {
        switch(type) {
            case 'ACHAT': return <ShoppingCart size={18} style={{ color: '#f59e0b' }} />;
            case 'VENTE': return <BadgeEuro size={18} style={{ color: '#2563eb' }} />;
            case 'TRESORERIE':
            case 'BANQUE':
            case 'CAISSE': return <Wallet size={18} style={{ color: '#10b981' }} />;
            default: return <FileText size={18} style={{ color: '#64748b' }} />;
        }
    };

    const sortedRows = getFilteredAndSortedData(exercices, selectedExerciceId, moisAnnee, journaux, sortConfig);

    return (
        <div style={layoutStyle}>
            <Sidebar />
            <main style={mainStyle}>
                <header style={headerStyle}>
                    <div style={{display:'flex', alignItems:'center', gap:'15px'}}>
                        <div style={iconBox}><Calendar size={22} color="white"/></div>
                        <h1 style={titleStyle}>JOURNAUX DE SAISIE</h1>
                    </div>

                    <div style={{ display: 'flex', gap: '10px' }}>
                        <label style={btnActionStyle}>
                            {isProcessing ? <Loader2 className="animate-spin" size={16}/> : <UploadCloud size={16}/>}
                            IMPORT CSV
                            <input type="file" hidden onChange={handleImportClick} accept=".csv" disabled={isProcessing}/>
                        </label>

                        <button 
                            onClick={() => setShowExportPanel(!showExportPanel)} 
                            style={{...btnActionStyle, background: showExportPanel ? '#2563eb' : '#f1f5f9', color: showExportPanel ? 'white' : '#1e293b'}}
                        >
                            <Download size={16}/> EXPORT {showExportPanel ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                        </button>

                        <div style={filterBox}>
                            <Filter size={16} color="#2563eb" />
                            <select style={selectFilter} value={selectedExerciceId} onChange={(e) => setSelectedExerciceId(e.target.value)}>
                                {exercices.map(ex => (
                                    <option key={ex.id} value={ex.id}>EX {ex.date_debut.split('-')[0]} ({ex.statut})</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </header>

                <div style={contentBody}>
                    {showExportPanel && (
                        <div style={exportPanelStyle}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
                                <DownloadCloud size={18} color="#2563eb" />
                                <span style={{ fontWeight: 900, fontSize: '13px', color: '#1e293b' }}>FILTRER L'EXPORTATION</span>
                            </div>
                            
                            <div style={exportGrid}>
                                <div style={inputGroup}>
                                    <label style={labelStyleSmall}>Journal</label>
                                    <select style={inputStyleSmall} value={exportParams.journal_id} onChange={(e) => setExportParams({...exportParams, journal_id: e.target.value})}>
                                        <option value="ALL">Tous les journaux</option>
                                        {journaux.map(j => <option key={j.id} value={j.id}>[{j.code}] {j.libelle}</option>)}
                                    </select>
                                </div>

                                <div style={inputGroup}>
                                    <label style={labelStyleSmall}>Période (Du / Au)</label>
                                    <div style={{ display: 'flex', gap: '5px' }}>
                                        <input type="date" style={inputStyleSmall} value={exportParams.date_debut} onChange={(e) => setExportParams({...exportParams, date_debut: e.target.value})} />
                                        <input type="date" style={inputStyleSmall} value={exportParams.date_fin} onChange={(e) => setExportParams({...exportParams, date_fin: e.target.value})} />
                                    </div>
                                </div>

                                <div style={inputGroup}>
                                    <label style={labelStyleSmall}>Statut écritures</label>
                                    <div style={{ display: 'flex', gap: '5px' }}>
                                        {['NORMAL', 'DELETED', 'ALL'].map(mode => (
                                            <button key={mode} onClick={() => setExportParams({...exportParams, statut: mode})} style={{...miniRadio, background: exportParams.statut === mode ? '#0f172a' : '#f1f5f9', color: exportParams.statut === mode ? 'white' : '#64748b'}}>
                                                {mode === 'NORMAL' ? 'Valides' : mode === 'DELETED' ? 'Annulées' : 'Toutes'}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '15px' }}>
                                    <button onClick={handleExecuteExport} style={btnExecuteExport} disabled={isProcessing}>
                                        {isProcessing ? <Loader2 className="animate-spin" size={14}/> : <Download size={14}/>} 
                                        LANCER L'EXPORT
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {analytiqueError && (
                        <div style={errorAlertBox}>
                            <AlertTriangle size={32} color="#9a3412" />
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 900, fontSize: '15px', textTransform: 'uppercase' }}>Configuration Obligatoire</div>
                                <div style={{ fontSize: '13px', marginTop: '4px', fontWeight: 600 }}>{analytiqueError}</div>
                            </div>
                            <button onClick={() => navigate('/analytique/plan')} style={btnFixAnalytique}>CONFIGURER</button>
                        </div>
                    )}

                    <div style={{ ...tableWrapper, opacity: analytiqueError ? 0.6 : 1 }}>
                        <table style={tableStyle}>
                            <thead style={theadStyle}>
                                <tr>
                                    <th style={thStyle}>Période</th>
                                    <th style={thStyle}>Journal</th>
                                    <th style={thStyle}>Libellé</th>
                                    <th style={{...thStyle, textAlign:'center'}}>État</th>
                                    <th style={{...thStyle, textAlign:'center'}}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedRows.map(row => (
                                    <tr key={row.id} style={trStyle}>
                                        <td style={tdStyle}>{row.periode}</td>
                                        <td style={tdStyle}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                {getJournalIcon(row.type)}
                                                <span style={badgeCode}>{row.code}</span>
                                            </div>
                                        </td>
                                        <td style={{...tdStyle, fontWeight:700}}>{row.libelle}</td>
                                        <td style={{...tdStyle, textAlign:'center'}}>
                                            {row.dejaSaisi ? <span style={saisiMarker}>UTILISÉ</span> : <span style={{color: '#94a3b8', fontSize: '10px'}}>VIERGE</span>}
                                        </td>
                                        <td style={{...tdStyle, textAlign:'center'}}>
                                            <button 
                                                onClick={() => navigate('/compta/ecritures-saisie', { state: { journal: row.originalJournal, mois: row.periode, moisIdx: row.moisIdx, exercice: row.originalEx, tousLesJournaux: journaux } })} 
                                                style={row.statutEx === 'CLOTURE' ? btnConsulter : btnOuvrirPeriod}
                                            >
                                                Ouvrir <ChevronRight size={14}/>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {toast.show && (
                    <div style={toastContainer}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <AlertTriangle color="#2563eb" size={18}/>
                            <span style={{ fontSize: '13px', fontWeight: 700 }}>{toast.message}</span>
                        </div>
                        {toast.type === 'confirm' && (
                            <div style={{ display: 'flex', gap: '8px', marginTop: '10px', justifyContent: 'flex-end' }}>
                                <button onClick={() => setToast({ ...toast, show: false })} style={btnToastCancel}>Annuler</button>
                                <button onClick={toast.onConfirm} style={btnToastConfirm}>Confirmer</button>
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
};

const getFilteredAndSortedData = (exercices, selectedExerciceId, moisAnnee, journaux, sortConfig) => {
    let flatData = [];
    const ex = exercices.find(e => e.id.toString() === selectedExerciceId.toString());
    if (ex) {
        moisAnnee.forEach((m, mIdx) => {
            journaux.forEach(j => {
                const moisSaisisArr = j.mois_saisis ? j.mois_saisis.split(',') : [];
                flatData.push({
                    id: `${ex.id}-${mIdx}-${j.id}`,
                    periode: `${m}. ${ex.date_debut.split('-')[0].slice(-2)}`,
                    moisIdx: mIdx, code: j.code, libelle: j.libelle, type: j.type_journal,
                    dejaSaisi: moisSaisisArr.includes(mIdx.toString()), 
                    statutEx: ex.statut, originalJournal: j, originalEx: ex
                });
            });
        });
    }
    return flatData.sort((a, b) => {
        if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
        if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
    });
};

const layoutStyle = { display: 'flex', height: '100vh', background: '#f1f5f9' };
const mainStyle = { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' };
const headerStyle = { background: 'white', padding: '15px 40px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 };
const contentBody = { padding: '20px 40px', flex: 1, overflowY: 'auto' };
const exportPanelStyle = { background: 'white', padding: '20px', borderRadius: '12px', marginBottom: '20px', border: '2px solid #2563eb', boxShadow: '0 10px 15px -3px rgba(37, 99, 235, 0.1)' };
const exportGrid = { display: 'grid', gridTemplateColumns: '1.5fr 1.5fr 1.5fr 1fr', gap: '20px' };
const inputGroup = { display: 'flex', flexDirection: 'column', gap: '5px' };
const labelStyleSmall = { fontSize: '10px', fontWeight: 900, color: '#64748b', textTransform: 'uppercase' };
const inputStyleSmall = { padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '12px', outline: 'none', background: '#f8fafc' };
const miniRadio = { padding: '8px', border: 'none', borderRadius: '6px', fontSize: '10px', fontWeight: 700, cursor: 'pointer' };
const btnExecuteExport = { background: '#0f172a', color: 'white', border: 'none', padding: '10px', borderRadius: '8px', fontWeight: 700, fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' };
const filterBox = { display: 'flex', alignItems: 'center', gap: '8px', background: '#f8fafc', padding: '6px 15px', borderRadius: '8px', border: '1px solid #e2e8f0' };
const selectFilter = { border: 'none', background: 'transparent', outline: 'none', fontSize: '13px', fontWeight: '800', color: '#1e40af' };
const iconBox = { background: '#0f172a', padding: '10px', borderRadius: '10px' };
const titleStyle = { margin: 0, fontSize: '18px', fontWeight: '900' };
const badgeCode = { background: '#0f172a', color: 'white', padding: '3px 7px', borderRadius: '5px', fontWeight: 900, fontSize: '10px' };
const btnActionStyle = { display: 'flex', alignItems: 'center', gap: '8px', background: '#0f172a', color: 'white', padding: '8px 16px', borderRadius: '8px', fontSize: '11px', fontWeight: 900, cursor: 'pointer', border: 'none' };
const saisiMarker = { display: 'inline-flex', alignItems: 'center', background: '#22c55e', color: 'white', padding: '4px 12px', borderRadius: '4px', fontSize: '10px', fontWeight: 800 };
const btnOuvrirPeriod = { background: '#10b981', color: 'white', border: 'none', padding: '5px 15px', borderRadius: '6px', cursor: 'pointer', fontWeight: 700, fontSize: '12px' };
const btnConsulter = { background: '#64748b', color: 'white', border: 'none', padding: '5px 15px', borderRadius: '6px', cursor: 'pointer', fontWeight: 700, fontSize: '12px' };
const tableWrapper = { background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' };
const tableStyle = { width: '100%', borderCollapse: 'collapse' };
const theadStyle = { background: '#f8fafc', borderBottom: '1px solid #e2e8f0' };
const thStyle = { padding: '12px 15px', textAlign: 'left', fontSize: '11px', fontWeight: 900, color: '#64748b', textTransform: 'uppercase' };
const tdStyle = { padding: '12px 15px', fontSize: '13px', borderBottom: '1px solid #f1f5f9' };
const trStyle = { borderBottom: '1px solid #f1f5f9' };
const errorAlertBox = { display: 'flex', alignItems: 'center', gap: '20px', background: '#fff7ed', border: '2px solid #ea580c', padding: '15px', borderRadius: '12px', marginBottom: '20px', color: '#9a3412' };
const btnFixAnalytique = { background: '#ea580c', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '8px', fontWeight: 900, fontSize: '11px', cursor: 'pointer' };
const toastContainer = { position: 'fixed', top: '20px', right: '20px', background: 'white', padding: '15px', borderRadius: '10px', boxShadow: '0 10px 15px rgba(0,0,0,0.1)', zIndex: 3000, border: '1px solid #e2e8f0' };
const btnToastCancel = { background: '#f1f5f9', border: 'none', padding: '5px 10px', borderRadius: '5px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' };
const btnToastConfirm = { background: '#0f172a', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '5px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' };

export default JournalEcriture;