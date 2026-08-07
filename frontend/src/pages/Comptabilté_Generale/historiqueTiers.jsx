import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
    Loader2, Printer, Download, Search, RefreshCcw, ArrowLeft, 
    Users, ChevronDown, XCircle, CheckCircle, Calendar, BookOpen
} from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Sidebar from '../../components/Sidebar';
import API, { socket } from '../../services/api';

const HistoriqueTiers = () => {
    const { num_tiers } = useParams();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    
    // --- ÉTATS DE BASE ---
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState([]);
    const [listeTiers, setListeTiers] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    
    // --- ÉTATS FILTRES ---
    const [exercices, setExercices] = useState([]);
    const [selectedExId, setSelectedExId] = useState('');
    const [viewFilter, setViewFilter] = useState('TOUTES');

    // --- ÉTATS POUR LE LETTRAGE ---
    const [selectedIds, setSelectedIds] = useState([]); 
    const [lettreCode, setLettreCode] = useState('A');

    // --- ÉTATS SÉLECTEUR DE TIERS ---
    const [tiersInput, setTiersInput] = useState(num_tiers || '');
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const suggestionRef = useRef(null);

    const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

    const showToast = (message, type = 'success') => {
        setToast({ show: true, message, type });
        setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
    };

    // 1. Initialisation : Liste des tiers et exercices
    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                const [resTiers, resEx] = await Promise.all([
                    API.get('/compta/tiers'),
                    API.get('/plan-comptable/exercices/liste')
                ]);

                if (resTiers.data.success) setListeTiers(resTiers.data.data || []);
                
                if (resEx.data.success) {
                    const exData = resEx.data.data || [];
                    setExercices(exData);
                    const idFromUrl = searchParams.get('exerciceId');
                    if (idFromUrl && idFromUrl !== 'undefined' && idFromUrl !== 'null') {
                        setSelectedExId(idFromUrl);
                    } else {
                        const enCours = exData.find(ex => ex.statut === 'OUVERT') || exData[0];
                        if (enCours) setSelectedExId(enCours.id);
                    }
                }
            } catch (err) { console.error("Erreur init tiers:", err); }
        };
        fetchInitialData();
    }, [searchParams]);

    // 2. Charger l'historique du tiers
   const fetchHistorique = async () => {
    if (!num_tiers || !selectedExId) return;
    setLoading(true);
    try {
        // 1. On charge les écritures du tableau
        const res = await API.get(`/plan-comptable/ecritures/historique-tiers/${num_tiers}`, {
            params: { exerciceId: selectedExId === 'ALL' ? '' : selectedExId }
        });
        
        if (res.data.success) {
            setData(res.data.data || []);

            // 🔥 2. L'AUTOMATISATION EST ICI : 
            // On demande au serveur la lettre suivante disponible pour CE tiers
            const resLettre = await API.get(`/plan-comptable/ecritures/prochaine-lettre`, {
                params: { num_tiers: num_tiers } // On précise bien pour quel tiers
            });

            if (resLettre.data.success) {
                // On met à jour l'état de la lettre : l'input changera tout seul !
                setLettreCode(resLettre.data.prochaineLettre); 
            }
        }
    } catch (err) {
        showToast("Erreur lors du chargement", "error");
    } finally {
        setLoading(false);
    }
};

 useEffect(() => {
    // 🚀 1. CHARGEMENT INITIAL (C'est ce qui manquait !)
    if (num_tiers && selectedExId) {
        fetchHistorique();
    }

    // 🔄 2. LOGIQUE TEMPS RÉEL (Socket)
    if (socket) {
        const handleRefresh = () => {
            console.log("🔄 Mise à jour tiers détectée via Socket...");
            fetchHistorique();
        };

        socket.on('REFRESH_JOURNAL_ENTRIES', handleRefresh);
        socket.on('DATA_EVENT', (event) => {
            if (event.table === 'lignes_ecritures' || event.table === 'journal_entries') {
                handleRefresh();
            }
        });

        return () => {
            socket.off('REFRESH_JOURNAL_ENTRIES', handleRefresh);
            socket.off('DATA_EVENT');
        };
    }
}, [num_tiers, selectedExId]); 

// Se redéclenche si on change de tiers ou d'exercice
    // --- 🚀 LOGIQUE DE NAVIGATION VERS JOURNAL (CORRIGÉE) ---
const allerAuJournal = (l) => {
    if (!l.journal_id) {
        showToast("Erreur : ID du journal manquant", "error");
        return;
    }

    const dateEcr = new Date(l.date_ecriture);
    const moisNoms = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

    const journalComplet = { 
        id: l.journal_id, 
        code: l.code_journal, 
        type_journal: l.type_journal || 'OD',
        mode_numerotation: l.mode_numerotation || 'AUTO',
        compteur_piece: l.compteur_piece || 0
    };

    const exerciceComplet = { 
        id: l.exercice_id, 
        annee: dateEcr.getFullYear().toString(),
        // 🎯 FIX : On s'assure que ces dates existent pour le payload de saisie
        date_debut: l.date_debut_ex || `${dateEcr.getFullYear()}-01-01`, 
        date_fin: l.date_fin_ex || `${dateEcr.getFullYear()}-12-31`,
        libelle: `EXERCICE ${dateEcr.getFullYear()}`,
        statut: 'OUVERT' // On assume ouvert si on peut y aller
    };

    navigate('/compta/ecritures-saisie', { 
        state: { 
            journal: journalComplet, 
            exercice: exerciceComplet, 
            moisIdx: dateEcr.getMonth(), 
            mois: moisNoms[dateEcr.getMonth()],
            targetLigneId: l.id 
        } 
    });
};
    // --- LOGIQUE DE LETTRAGE / DÉLETTRAGE ---
    const toggleSelect = (id) => {
        setSelectedIds(prev => 
            prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
        );
    };

    const soldeSelection = useMemo(() => {
        const selectedLines = data.filter(l => selectedIds.includes(l.id));
        const deb = selectedLines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
        const cre = selectedLines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
        return (deb - cre).toFixed(2);
    }, [selectedIds, data]);

  const handleLettrer = async () => {
    if (Math.abs(soldeSelection) > 0.01) {
        showToast(`Déséquilibre de ${soldeSelection}.`, "error");
        return;
    }
    
    try {
        const res = await API.post('/plan-comptable/ecritures/lettrer', {
            ids: selectedIds,
            lettre: lettreCode,
            num_tiers: num_tiers // On envoie le tiers pour isoler le lettrage
        });

        if (res.data.success) {
            showToast(`Lettrage ${lettreCode} validé`);
            setSelectedIds([]);

            // 🔄 1. On rafraîchit la liste des écritures
            fetchHistorique();

            // 🆕 2. On demande IMMÉDIATEMENT la lettre suivante pour ce tiers
            const resLettre = await API.get(`/plan-comptable/ecritures/prochaine-lettre?num_tiers=${num_tiers}`);
            if (resLettre.data.success) {
                setLettreCode(resLettre.data.prochaineLettre); // C'est ici que la lettre change !
            }
        }
    } catch (err) { 
        showToast(err.response?.data?.error || "Erreur de lettrage", "error"); 
    }
};

   const handleDelettrer = async () => {
    if (selectedIds.length === 0) return;
    try {
        const res = await API.post('/plan-comptable/ecritures/delettrer', { ids: selectedIds });
        if (res.data.success) {
            showToast("Lettrage supprimé");
            setSelectedIds([]);
            
            // 🔄 On rafraîchit TOUT : les lignes ET la lettre disponible
            fetchHistorique(); 

            // 🆕 On vérifie si la prochaine lettre disponible a changé
            const resLettre = await API.get(`/plan-comptable/ecritures/prochaine-lettre?num_tiers=${num_tiers}`);
            if (resLettre.data.success) {
                setLettreCode(resLettre.data.prochaineLettre);
            }
        }
    } catch (err) { 
        showToast("Échec du délettrage", "error"); 
    }
};

    const handleTiersInputChange = (val) => {
        setTiersInput(val);
        if (val.trim().length > 0) {
            const filtered = listeTiers.filter(t => 
                t.numero_tiers.toLowerCase().includes(val.toLowerCase()) || 
                t.nom.toLowerCase().includes(val.toLowerCase())
            ).slice(0, 10);
            setSuggestions(filtered);
            setShowSuggestions(true);
        } else { setShowSuggestions(false); }
    };

  const selectTiers = (num) => {
    setShowSuggestions(false);
    // On conserve le selectedExId dans l'URL pour la persistance
    const exParam = selectedExId ? `?exerciceId=${selectedExId}` : '';
    navigate(`/compta/historique-tiers/${num}${exParam}`);
};

    // --- FILTRAGE ET CALCULS ---
    const filteredData = useMemo(() => {
        return data.filter(item => {
            const matchesSearch = 
                item.libelle?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                item.piece?.toString().includes(searchTerm) ||
                item.num_compte?.toString().includes(searchTerm);
            
            if (viewFilter === 'NON_LETTREES') return matchesSearch && !item.lettre;
            if (viewFilter === 'LETTREES') return matchesSearch && item.lettre;
            return matchesSearch;
        });
    }, [data, searchTerm, viewFilter]);

    const totals = useMemo(() => {
        const tDebit = filteredData.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
        const tCredit = filteredData.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
        return { debit: tDebit, credit: tCredit, solde: tDebit - tCredit };
    }, [filteredData]);

    const formatCur = (val) => parseFloat(val || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 });

    return (
        <div style={layoutStyle}>
            <Sidebar />

            {toast.show && (
                <div style={{...toastContainer, backgroundColor: toast.type === 'error' ? '#fee2e2' : '#f5f3ff', border: `1px solid ${toast.type === 'error' ? '#ef4444' : '#7c3aed'}`}}>
                    {toast.type === 'error' ? <XCircle color="#ef4444" size={20}/> : <CheckCircle color="#7c3aed" size={20}/>}
                    <span style={{color: toast.type === 'error' ? '#991b1b' : '#4c1d95', fontWeight: '600'}}>{toast.message}</span>
                </div>
            )}

            <main style={mainStyle}>
                <header style={headerStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <button onClick={() => navigate(-1)} style={btnBackStyle}><ArrowLeft size={20} /></button>
                        
                        <div style={{ position: 'relative' }} ref={suggestionRef}>
                            <div style={tiersSelectorBox}>
                                <Users size={18} color="#7c3aed" />
                                <div style={{display: 'flex', flexDirection: 'column'}}>
                                    <span style={labelMini}>COMPTE TIERS (AUXILIAIRE)</span>
                                    <input 
                                        style={inputTiersHeader}
                                        value={tiersInput}
                                        onChange={(e) => handleTiersInputChange(e.target.value)}
                                        onFocus={() => tiersInput && setShowSuggestions(true)}
                                        placeholder="Chercher tiers..."
                                    />
                                </div>
                                <ChevronDown size={14} color="#64748b" />
                            </div>
                            {showSuggestions && suggestions.length > 0 && (
                                <div style={suggestionDropdown}>
                                    {suggestions.map(s => (
                                        <div key={s.id} style={suggestionItem} onClick={() => selectTiers(s.numero_tiers)}>
                                            <strong style={{color: '#7c3aed'}}>{s.numero_tiers}</strong>
                                            <span style={{fontSize: '11px', color: '#1e293b'}}>{s.nom}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div style={exerciceBox}>
                            <Calendar size={18} color="#db2777" />
                            <div style={{display: 'flex', flexDirection: 'column'}}>
                                <span style={labelMini}>EXERCICE</span>
                                <select style={selectEx} value={selectedExId} onChange={(e) => setSelectedExId(e.target.value)}>
                                    <option value="ALL">TOUS</option>
                                    {exercices.map(ex => <option key={ex.id} value={ex.id}>EX {ex.date_debut.split('-')[0]}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button style={btnActionSecondary} onClick={() => window.print()}><Printer size={16} /> IMPRIMER</button>
                        <button style={btnActionPrimary}><Download size={16} /> EXPORT EXCEL</button>
                    </div>
                </header>

                <div style={contentWrapper}>
                    <section style={controlPanel}>
                        <div style={lettrageGroup}>
                            <div style={inputWrapper}>
                                <label style={labelStyle}>ACTION</label>
                                <select style={selectModern}><option>Lettrage Tiers</option></select>
                            </div>
                            <div style={inputWrapper}>
                                <label style={labelStyle}>CODE</label>
                                <input style={inputSmall} value={lettreCode} onChange={(e) => setLettreCode(e.target.value.toUpperCase())} />
                            </div>
                            <button style={{...btnLettrer, opacity: selectedIds.length > 0 ? 1 : 0.5}} onClick={handleLettrer} disabled={selectedIds.length === 0}>LETTRER</button>
                            <button style={{...btnLettrer, background: '#ef4444', opacity: selectedIds.length > 0 ? 1 : 0.5}} onClick={handleDelettrer} disabled={selectedIds.length === 0}>DÉLETTRER</button>
                            <div style={soldeLettrageBox}>
                                <span style={{fontSize: '10px', fontWeight:800}}>ÉCART SÉLECTION :</span>
                                <strong style={{color: Math.abs(soldeSelection) > 0.01 ? '#ef4444' : '#22c55e'}}>{formatCur(soldeSelection)}</strong>
                            </div>
                        </div>

                        <div style={searchGroup}>
                            <Search size={18} style={searchIcon} />
                            <input type="text" placeholder="Filtrer..." style={inputSearch} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                            <button style={btnRefresh} onClick={fetchHistorique}><RefreshCcw size={16} className={loading ? "animate-spin" : ""} /></button>
                        </div>
                    </section>

                    <div style={tableContainer}>
                        {loading ? (
                            <div style={centerStyle}><Loader2 className="animate-spin" size={40} color="#7c3aed" /></div>
                        ) : (
                            <table style={tableStyle}>
                                <thead style={stickyHeader}>
                                    <tr style={{background:'#4c1d95', color:'white'}}>
                                        <th style={{...thStyle, width: '30px'}}></th>
                                        <th style={{...thStyle, width: '40px'}}>L.</th>
                                        <th style={thStyle}>Jo.</th>
                                        <th style={thStyle}>Date</th>
                                        <th style={thStyle}>N° pièce</th>
                                        <th style={thStyle}>Compte G.</th>
                                        <th style={thStyle}>Libellé écriture</th>
                                        <th style={thMontantHeader}>Débit</th>
                                        <th style={thMontantHeader}>Crédit</th>
                                        <th style={thMontantHeader}>Solde Prog.</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredData.length > 0 ? filteredData.map((l, idx) => {
                                        const soldeProg = filteredData.slice(0, idx + 1).reduce((acc, curr) => 
                                            acc + (parseFloat(curr.debit || 0) - parseFloat(curr.credit || 0)), 0);
                                        
                                        return (
                                            <tr key={l.id} style={{...trStyle, backgroundColor: selectedIds.includes(l.id) ? '#f5f3ff' : (idx % 2 === 0 ? '#fdfaff' : '#ffffff')}}>
                                                <td style={tdStyle}><input type="checkbox" checked={selectedIds.includes(l.id)} onChange={() => toggleSelect(l.id)} /></td>
                                                <td style={{...tdStyle, fontWeight: '800', color: '#db2777'}}>{l.lettre || ''}</td>
                                                <td style={tdStyle}>{l.code_journal}</td>
                                                <td style={tdStyle}>{new Date(l.date_ecriture).toLocaleDateString('fr-FR')}</td>
                                                
                                                <td 
                                                    style={{...tdStyle, fontWeight: 'bold', color: '#7c3aed', cursor:'pointer'}}
                                                    onDoubleClick={() => allerAuJournal(l)}
                                                    title="Double-cliquez pour voir la pièce"
                                                >
                                                    {l.piece}
                                                </td>

                                                <td style={tdStyle}>{l.num_compte}</td>
                                                <td style={tdStyle}>{l.libelle}</td>
                                                <td style={tdDebit}>{formatCur(l.debit)}</td>
                                                <td style={tdCredit}>{formatCur(l.credit)}</td>
                                                <td style={tdSoldeProg}>{formatCur(soldeProg)}</td>
                                            </tr>
                                        );
                                    }) : (
                                        <tr><td colSpan="10" style={noDataText}>Aucune écriture trouvée.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        )}
                    </div>

                    <footer style={bottomSummary}>
                        <div style={typeFilterBox}>
                            <h4 style={subTitle}>FILTRE AFFICHAGE</h4>
                            <div style={radioGroup}>
                                <label style={radioLabel}><input type="radio" name="v" checked={viewFilter === 'NON_LETTREES'} onChange={() => setViewFilter('NON_LETTREES')} /> Non lettrées</label>
                                <label style={radioLabel}><input type="radio" name="v" checked={viewFilter === 'LETTREES'} onChange={() => setViewFilter('LETTREES')} /> Lettrées</label>
                                <label style={radioLabel}><input type="radio" name="v" checked={viewFilter === 'TOUTES'} onChange={() => setViewFilter('TOUTES')} /> Toutes</label>
                            </div>
                        </div>
                        <div style={totalsCardModern}>
                            <div style={totalRow}>
                                <span>CUMUL DÉBIT / CRÉDIT</span>
                                <span style={valNormal}>{formatCur(totals.debit)}</span>
                                <span style={valNormal}>{formatCur(totals.credit)}</span>
                            </div>
                            <div style={soldeFinalRow}>
                                <span>SOLDE FINAL DU TIERS</span>
                                <span style={{ color: totals.solde >= 0 ? '#a78bfa' : '#f472b6' }}>
                                    {formatCur(Math.abs(totals.solde))} {totals.solde >= 0 ? '(DÉBITEUR)' : '(CRÉDITEUR)'}
                                </span>
                            </div>
                        </div>
                    </footer>
                </div>
            </main>
        </div>
    );
};

// --- STYLES ---
const layoutStyle = { display: 'flex', height: '100vh', background: '#f5f3ff' };
const mainStyle = { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' };
const headerStyle = { background: 'white', padding: '10px 30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #ddd6fe' };
const tiersSelectorBox = { display: 'flex', alignItems: 'center', gap: '12px', background: '#fff', padding: '5px 15px', borderRadius: '8px', border: '1px solid #7c3aed' };
const inputTiersHeader = { border: 'none', background: 'transparent', outline: 'none', fontSize: '13px', fontWeight: 800, color: '#4c1d95', width: '220px' };
const labelMini = { fontSize: '9px', fontWeight: 800, color: '#6d28d9' };
const suggestionDropdown = { position: 'absolute', top: '105%', left: 0, width: '100%', background: 'white', border: '1px solid #ddd6fe', borderRadius: '8px', zIndex: 1000, maxHeight: '250px', overflowY: 'auto' };
const suggestionItem = { padding: '10px', borderBottom: '1px solid #f5f3ff', cursor: 'pointer', display: 'flex', gap: '10px' };
const contentWrapper = { flex: 1, padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px', overflow: 'hidden' };
const controlPanel = { background: 'white', padding: '12px 20px', borderRadius: '12px', border: '1px solid #ddd6fe', display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
const lettrageGroup = { display: 'flex', alignItems: 'center', gap: '15px' };
const inputWrapper = { display: 'flex', flexDirection: 'column', gap: '4px' };
const labelStyle = { fontSize: '10px', fontWeight: '800', color: '#64748b' };
const selectModern = { padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' };
const inputSmall = { width: '40px', padding: '6px', textAlign: 'center', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 'bold' };
const btnLettrer = { background: '#4c1d95', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '6px', fontWeight: '700', cursor: 'pointer', fontSize:'11px' };
const soldeLettrageBox = { padding: '8px 15px', background: '#f5f3ff', borderRadius: '8px', display: 'flex', gap: '8px', alignItems:'center' };
const searchGroup = { position: 'relative', display: 'flex', gap: '8px' };
const inputSearch = { padding: '8px 10px 8px 40px', borderRadius: '8px', border: '1px solid #ddd6fe', width: '220px', fontSize: '12px' };
const searchIcon = { position: 'absolute', left: '12px', top: '10px', color: '#7c3aed' };
const tableContainer = { flex: 1, background: 'white', borderRadius: '12px', border: '1px solid #ddd6fe', overflow: 'auto' };
const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: '12px' };
const thStyle = { padding: '12px', textAlign: 'left', fontWeight: '800', textTransform: 'uppercase', fontSize: '11px' };
const thMontantHeader = { ...thStyle, textAlign: 'right' };
const trStyle = { borderBottom: '1px solid #f5f3ff' };
const tdStyle = { padding: '10px', borderRight: '1px solid #f5f3ff' };
const tdDebit = { ...tdStyle, textAlign: 'right', fontWeight: '700', color: '#10b981' };
const tdCredit = { ...tdStyle, textAlign: 'right', fontWeight: '700', color: '#ef4444' };
const tdSoldeProg = { ...tdStyle, textAlign: 'right', fontWeight: '800', color: '#4c1d95', background: '#f5f3ff' };
const bottomSummary = { display: 'flex', gap: '20px', minHeight: '120px' };
const typeFilterBox = { width: '220px', background: 'white', borderRadius: '12px', padding: '15px', border: '1px solid #ddd6fe' };
const subTitle = { margin: '0 0 10px 0', fontSize: '10px', color: '#64748b', fontWeight: '900' };
const radioGroup = { display: 'flex', flexDirection: 'column', gap: '8px' };
const radioLabel = { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' };
const totalsCardModern = { flex: 1, background: '#4c1d95', color: 'white', borderRadius: '12px', padding: '15px', display: 'flex', flexDirection: 'column', justifyContent: 'center' };
const totalRow = { display: 'grid', gridTemplateColumns: '1fr 130px 130px', fontWeight: '700', fontSize: '13px', marginBottom: '10px' };
const soldeFinalRow = { display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #6d28d9', paddingTop: '10px', fontWeight: '900', fontSize: '18px' };
const valNormal = { textAlign: 'right' };
const btnActionPrimary = { background: '#7c3aed', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: '700', cursor: 'pointer' };
const btnActionSecondary = { background: 'white', color: '#7c3aed', border: '1px solid #7c3aed', padding: '8px 16px', borderRadius: '8px', fontWeight: '700', cursor: 'pointer' };
const stickyHeader = { position: 'sticky', top: 0, zIndex: 10 };
const btnBackStyle = { background: '#f5f3ff', border: 'none', padding: '8px', borderRadius: '50%', cursor: 'pointer', color: '#7c3aed' };
const btnRefresh = { background: '#f5f3ff', border: 'none', padding: '8px', borderRadius: '8px', cursor: 'pointer', color: '#7c3aed' };
const exerciceBox = { display: 'flex', alignItems: 'center', gap: '10px', background: '#fff1f2', padding: '5px 15px', borderRadius: '8px', border: '1px solid #db2777' };
const selectEx = { border: 'none', background: 'transparent', outline: 'none', fontWeight: '800', color: '#db2777', cursor: 'pointer' };
const toastContainer = { position: 'fixed', top: '20px', right: '20px', padding: '12px 20px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '10px', zIndex: 9999, boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' };
const centerStyle = { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' };
const noDataText = { padding: '40px', textAlign: 'center', color: '#64748b', fontWeight: 600 };

export default HistoriqueTiers;