import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
    Loader2, Printer, Download, Search, RefreshCcw, ArrowLeft, 
    Settings, BookOpen, ChevronDown, XCircle, CheckCircle, Calendar
} from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Sidebar from '../../components/Sidebar';
import API, { socket } from '../../services/api';

const HistoriqueEcriture = () => {
    const { num_compte } = useParams();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    
    // --- ÉTATS DE BASE ---
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState([]);
    const [planComptable, setPlanComptable] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    
    // --- ÉTATS POUR LE FILTRE EXERCICE ---
    const [exercices, setExercices] = useState([]);
    const [selectedExId, setSelectedExId] = useState('');

    // --- ÉTATS POUR LE LETTRAGE ---
    const [selectedIds, setSelectedIds] = useState([]); 
    const [lettreCode, setLettreCode] = useState('A');
    const [viewFilter, setViewFilter] = useState('TOUTES');

    // --- ÉTATS POUR LE SÉLECTEUR DE COMPTE ---
    const [accountInput, setAccountInput] = useState(num_compte || '');
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const suggestionRef = useRef(null);

    // --- ÉTAT POUR LES TOASTS (Notifications) ---
    const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

    const showToast = (message, type = 'success') => {
        setToast({ show: true, message, type });
        setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
    };

    // 1. 🚀 Charger le plan comptable ET les exercices au démarrage (Priorité URL corrigée)
useEffect(() => {
        if (socket) {
            const handleRefresh = () => {
                console.log("🔄 Mise à jour du Grand Livre détectée...");
                fetchHistorique();
            };

            // On écoute les modifications sur les écritures réelles et le lettrage
            socket.on('REFRESH_JOURNAL_ENTRIES', handleRefresh);
            socket.on('DATA_EVENT', (event) => {
                // Si la table des écritures réelles change
                if (event.table === 'journal_entries' || event.table === 'lignes_ecritures') {
                    handleRefresh();
                }
            });

            return () => {
                socket.off('REFRESH_JOURNAL_ENTRIES', handleRefresh);
                socket.off('DATA_EVENT');
            };
        }
    }, [num_compte, selectedExId, socket]); // On rafraîchit si le contexte change

    // 2. 🚀 Charger le plan comptable ET les exercices (Optimisé)
    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                const [resPlan, resEx] = await Promise.all([
                    API.get('/plan-comptable/liste'),
                    API.get('/plan-comptable/exercices/liste')
                ]);

                if (resPlan.data.success) setPlanComptable(resPlan.data.data || []);
                
                if (resEx.data.success) {
                    const exData = resEx.data.data || [];
                    setExercices(exData);
                    
                    const idFromUrl = searchParams.get('exerciceId');
                    if (idFromUrl && idFromUrl !== 'undefined' && idFromUrl !== 'null') {
                        setSelectedExId(idFromUrl);
                    } else {
                        // On cherche l'exercice OUVERT en priorité
                        const enCours = exData.find(ex => ex.statut === 'OUVERT') || exData[0];
                        if (enCours) setSelectedExId(enCours.id);
                    }
                }
            } catch (err) { console.error("Erreur initialisation:", err); }
        };
        fetchInitialData();
        
        // 🔥 SIGNAL : Rejoindre la room de l'entreprise pour le temps réel
        if (socket && exercices.length > 0) {
            // On suppose que l'user est disponible via un contexte ou stocké
            // socket.emit('join_company', user.companyId); 
        }
    }, [searchParams]);

    // 2. Charger l'historique (Grand Livre) du compte filtré par EXERCICE
    const fetchHistorique = async () => {
        if (!num_compte) return; 
        setLoading(true);
        try {
            // Si selectedExId est 'ALL', on passe une chaîne vide pour que le backend ignore le filtre
            const res = await API.get(`/plan-comptable/ecritures/historique-compte/${num_compte}`, {
                params: { exerciceId: selectedExId === 'ALL' ? '' : selectedExId } 
            });
            if (res.data.success) {
                setData(res.data.data || []);
            }
        } catch (err) {
            showToast("Erreur lors du chargement des données", "error");
        } finally {
            setLoading(false);
        }
    };

    // 🚀 Se déclenche si le compte change OU si l'exercice sélectionné change
    useEffect(() => {
        fetchHistorique();
        setAccountInput(num_compte || '');
        setSelectedIds([]); 
    }, [num_compte, selectedExId]);

    // Fermer les suggestions au clic extérieur
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (suggestionRef.current && !suggestionRef.current.contains(e.target)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleAccountInputChange = (val) => {
        setAccountInput(val);
        if (val.trim().length > 0) {
            const filtered = planComptable.filter(c => 
                c.numero_compte.toString().startsWith(val) || 
                c.intitule.toLowerCase().includes(val.toLowerCase())
            ).slice(0, 10);
            setSuggestions(filtered);
            setShowSuggestions(true);
        } else {
            setShowSuggestions(false);
        }
    };

const selectCompte = (num) => {
        setShowSuggestions(false);
        // On s'assure que selectedExId est bien passé pour ne pas perdre le filtre
        const exParam = selectedExId ? `?exerciceId=${selectedExId}` : '';
        navigate(`/compta/historique-compte/${num}${exParam}`);
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
                lettre: lettreCode
            });
            if (res.data.success) {
                showToast("Lettrage validé avec succès");
                setSelectedIds([]);
                fetchHistorique();
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
                fetchHistorique();
            }
        } catch (err) { showToast("Échec du délettrage", "error"); }
    };

    // --- FILTRAGE ET CALCULS ---
    const filteredData = useMemo(() => {
        return data.filter(item => {
            const matchesSearch = 
                item.libelle?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                item.piece?.toString().includes(searchTerm) ||
                item.num_tiers?.toString().includes(searchTerm);
            
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
                <div style={{...toastContainer, backgroundColor: toast.type === 'error' ? '#fee2e2' : '#dcfce7', border: `1px solid ${toast.type === 'error' ? '#ef4444' : '#22c55e'}`}}>
                    {toast.type === 'error' ? <XCircle color="#ef4444" size={20}/> : <CheckCircle color="#22c55e" size={20}/>}
                    <span style={{color: toast.type === 'error' ? '#991b1b' : '#166534', fontWeight: '600'}}>{toast.message}</span>
                </div>
            )}

            <main style={mainStyle}>
                <header style={headerStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <button onClick={() => navigate(-1)} style={btnBackStyle}><ArrowLeft size={20} /></button>
                        
                        {/* SELECTEUR DE COMPTE */}
                        <div style={{ position: 'relative' }} ref={suggestionRef}>
                            <div style={accountSelectorBox}>
                                <BookOpen size={18} color="#2563eb" />
                                <div style={{display: 'flex', flexDirection: 'column'}}>
                                    <span style={labelMini}>COMPTE GÉNÉRAL</span>
                                    <input 
                                        style={inputAccountHeader}
                                        value={accountInput}
                                        onChange={(e) => handleAccountInputChange(e.target.value)}
                                        onFocus={() => accountInput && setShowSuggestions(true)}
                                        placeholder="Saisir n° ou nom..."
                                    />
                                </div>
                                <ChevronDown size={14} color="#64748b" />
                            </div>
                            {showSuggestions && suggestions.length > 0 && (
                                <div style={suggestionDropdown}>
                                    {suggestions.map(s => (
                                        <div key={s.id} style={suggestionItem} onClick={() => selectCompte(s.numero_compte)}>
                                            <strong style={{color: '#2563eb'}}>{s.numero_compte}</strong>
                                            <span style={{fontSize: '11px', color: '#1e293b'}}>{s.intitule}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* SELECTEUR D'EXERCICE AVEC OPTION "TOUS" */}
                        <div style={accountSelectorBox}>
                            <Calendar size={18} color="#10b981" />
                            <div style={{display: 'flex', flexDirection: 'column'}}>
                                <span style={labelMini}>EXERCICE</span>
                                <select 
                                    style={selectExerciceHeader}
                                    value={selectedExId}
                                    onChange={(e) => setSelectedExId(e.target.value)}
                                >
                                    <option value="ALL" style={{fontWeight: 'bold', color: '#2563eb'}}>--- TOUS LES EXERCICES ---</option>
                                    {exercices.map(ex => (
                                        <option key={ex.id} value={ex.id}>
                                            EX {ex.date_debut.split('-')[0]} ({ex.statut})
                                        </option>
                                    ))}
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
                                <label style={labelStyle}>TRAITEMENT</label>
                                <select style={selectModern}><option>Lettrage manuel</option></select>
                            </div>
                            <div style={inputWrapper}>
                                <label style={labelStyle}>LETTRE</label>
                                <input style={inputSmall} value={lettreCode} onChange={(e) => setLettreCode(e.target.value.toUpperCase())} />
                            </div>
                            <button style={{...btnLettrer, opacity: selectedIds.length > 0 ? 1 : 0.5}} onClick={handleLettrer} disabled={selectedIds.length === 0}>LETTRER</button>
                            <button style={{...btnLettrer, background: '#ef4444', opacity: selectedIds.length > 0 ? 1 : 0.5}} onClick={handleDelettrer} disabled={selectedIds.length === 0}>DÉLETTRER</button>
                            <div style={soldeLettrageBox}>
                                <span>SOLDE SÉLECTION :</span>
                                <strong style={{color: Math.abs(soldeSelection) > 0.01 ? '#ef4444' : '#22c55e'}}>{formatCur(soldeSelection)}</strong>
                            </div>
                        </div>
                        <div style={searchGroup}>
                            <Search size={18} style={searchIcon} />
                            <input type="text" placeholder="Rechercher..." style={inputSearch} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                            <button style={btnRefresh} onClick={fetchHistorique}><RefreshCcw size={16} className={loading ? "animate-spin" : ""} /></button>
                        </div>
                    </section>

                    <div style={tableContainer}>
                        {loading ? (
                            <div style={centerStyle}><Loader2 className="animate-spin" size={40} color="#2563eb" /></div>
                        ) : (
                            <table style={tableStyle}>
                                <thead style={stickyHeader}>
                                    <tr style={{background:'#1e293b', color:'white'}}>
                                        <th style={thStyle}></th>
                                        <th style={thStyle}>L.</th>
                                        <th style={thStyle}>Jo.</th>
                                        <th style={thStyle}>Date</th>
                                        <th style={thStyle}>N° pièce</th>
                                        <th style={thStyle}>Référence</th>
                                        <th style={thStyle}>Compte Tiers</th>
                                        <th style={thStyle}>Libellé écriture</th>
                                        <th style={thMontantHeader}>Débit</th>
                                        <th style={thMontantHeader}>Crédit</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredData.length > 0 ? filteredData.map((l, idx) => (
                                        <tr key={l.id} style={{...trStyle, backgroundColor: selectedIds.includes(l.id) ? '#e0f2fe' : (idx % 2 === 0 ? '#f8fafc' : '#ffffff')}}>
                                            <td style={tdStyle}><input type="checkbox" checked={selectedIds.includes(l.id)} onChange={() => toggleSelect(l.id)} /></td>
                                            <td style={{...tdStyle, fontWeight: '800', color: '#2563eb'}}>{l.lettre || ''}</td>
                                            <td style={tdStyle}>{l.code_journal}</td>
                                            <td style={tdStyle}>{new Date(l.date_ecriture).toLocaleDateString('fr-FR')}</td>
                                            <td 
                                                style={{...tdStyle, fontWeight: 'bold', color: '#2563eb', cursor: 'pointer', userSelect: 'none'}}
                                                onDoubleClick={() => {
    const dateEcriture = new Date(l.date_ecriture);
    const moisNoms = [
        "Janvier", "Février", "Mars", "Avril", "Mai", "Juin", 
        "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
    ];

    const journalComplet = { 
        id: l.journal_id, 
        code: l.code_journal, 
        type_journal: l.type_journal,
        mode_numerotation: l.mode_numerotation || 'AUTO',
        compteur_piece: l.compteur_piece
    };

    const exerciceComplet = { 
        id: l.exercice_id, 
        annee: dateEcriture.getFullYear().toString(),
        // 🎯 FIX CRITIQUE : On passe les dates récupérées du backend
        date_debut: l.date_debut_ex, 
        date_fin: l.date_fin_ex,
        libelle: `EXERCICE ${dateEcriture.getFullYear()}`
    };

    navigate('/compta/ecritures-saisie', { 
        state: { 
            journal: journalComplet, 
            exercice: exerciceComplet, 
            moisIdx: dateEcriture.getMonth(), 
            mois: moisNoms[dateEcriture.getMonth()],
            targetLigneId: l.id 
        } 
    });
}}
                                            >
                                                {l.piece}
                                            </td>
                                            <td style={tdStyle}>{l.reference || '-'}</td>
                                            <td style={{...tdStyle, fontWeight: '600'}}>{l.num_tiers || '-'}</td>
                                            <td style={tdStyle}>{l.libelle}</td>
                                            <td style={tdDebit}>{formatCur(l.debit)}</td>
                                            <td style={tdCredit}>{formatCur(l.credit)}</td>
                                        </tr>
                                    )) : (
                                        <tr><td colSpan="10" style={{padding: '40px', textAlign:'center', color: '#64748b', fontWeight: 600}}>Aucune écriture trouvée pour ce compte.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        )}
                    </div>

                    <footer style={bottomSummary}>
                        <div style={typeFilterBox}>
                            <h4 style={subTitle}>FILTRAGE AFFICHAGE</h4>
                            <div style={radioGroup}>
                                <label style={radioLabel}><input type="radio" name="view" checked={viewFilter === 'NON_LETTREES'} onChange={() => setViewFilter('NON_LETTREES')} /> Non lettrées</label>
                                <label style={radioLabel}><input type="radio" name="view" checked={viewFilter === 'LETTREES'} onChange={() => setViewFilter('LETTREES')} /> Lettrées</label>
                                <label style={radioLabel}><input type="radio" name="view" checked={viewFilter === 'TOUTES'} onChange={() => setViewFilter('TOUTES')} /> Toutes</label>
                            </div>
                        </div>
                        <div style={totalsCardModern}>
                            <div style={totalsGrid}>
                                <div style={totalRow}>
                                    <span>CUMUL DÉBIT / CRÉDIT</span>
                                    <span style={valNormal}>{formatCur(totals.debit)}</span>
                                    <span style={valNormal}>{formatCur(totals.credit)}</span>
                                </div>
                                <div style={soldeRow}>
                                    <span>SOLDE DU COMPTE {num_compte}</span>
                                    <span style={{ color: totals.solde >= 0 ? '#60a5fa' : '#f87171' }}>
                                        {formatCur(Math.abs(totals.solde))} {totals.solde >= 0 ? '(DÉBITEUR)' : '(CRÉDITEUR)'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </footer>
                </div>
            </main>
        </div>
    );
};

// --- STYLES ---
const selectExerciceHeader = { border: 'none', background: 'transparent', outline: 'none', fontSize: '13px', fontWeight: 800, color: '#10b981', cursor: 'pointer' };
const toastContainer = { position: 'fixed', top: '20px', right: '20px', padding: '12px 20px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '10px', zIndex: 9999, boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' };
const layoutStyle = { display: 'flex', height: '100vh', background: '#f1f5f9' };
const mainStyle = { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' };
const headerStyle = { background: 'white', padding: '10px 30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0' };
const accountSelectorBox = { display: 'flex', alignItems: 'center', gap: '12px', background: '#fff', padding: '5px 15px', borderRadius: '8px', border: '1px solid #cbd5e1' };
const inputAccountHeader = { border: 'none', background: 'transparent', outline: 'none', fontSize: '13px', fontWeight: 800, color: '#2563eb', width: '220px' };
const labelMini = { fontSize: '9px', fontWeight: 800, color: '#64748b' };
const suggestionDropdown = { position: 'absolute', top: '105%', left: 0, width: '100%', background: 'white', border: '1px solid #cbd5e1', borderRadius: '8px', zIndex: 1000, maxHeight: '250px', overflowY: 'auto' };
const suggestionItem = { padding: '10px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', display: 'flex', gap: '10px' };
const contentWrapper = { flex: 1, padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px', overflow: 'hidden' };
const controlPanel = { background: 'white', padding: '15px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
const lettrageGroup = { display: 'flex', alignItems: 'center', gap: '15px' };
const inputWrapper = { display: 'flex', flexDirection: 'column', gap: '4px' };
const labelStyle = { fontSize: '10px', fontWeight: '800', color: '#64748b' };
const selectModern = { padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' };
const inputSmall = { width: '50px', padding: '6px', textAlign: 'center', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 'bold' };
const btnLettrer = { background: '#1e293b', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '6px', fontWeight: '700', cursor: 'pointer' };
const soldeLettrageBox = { padding: '10px 20px', background: '#f1f5f9', borderRadius: '8px', fontSize: '13px', display: 'flex', gap: '10px' };
const searchGroup = { position: 'relative', display: 'flex', gap: '8px' };
const inputSearch = { padding: '10px 10px 10px 40px', borderRadius: '8px', border: '1px solid #cbd5e1', width: '280px' };
const searchIcon = { position: 'absolute', left: '12px', top: '12px', color: '#94a3b8' };
const tableContainer = { flex: 1, background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'auto' };
const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: '12px' };
const thStyle = { background: '#1e293b', color: 'white', padding: '12px', textAlign: 'left', fontWeight: 'normal' };
const thMontantHeader = { ...thStyle, textAlign: 'right' };
const trStyle = { borderBottom: '1px solid #f1f5f9' };
const tdStyle = { padding: '10px', borderRight: '1px solid #f1f5f9' };
const tdDebit = { ...tdStyle, textAlign: 'right', fontWeight: '700', color: '#2563eb' };
const tdCredit = { ...tdStyle, textAlign: 'right', fontWeight: '700', color: '#ef4444' };
const bottomSummary = { display: 'flex', gap: '20px', minHeight: '140px' };
const typeFilterBox = { width: '250px', background: 'white', borderRadius: '12px', padding: '15px', border: '1px solid #e2e8f0' };
const subTitle = { margin: '0 0 10px 0', fontSize: '11px', color: '#64748b', fontWeight: '900' };
const radioGroup = { display: 'flex', flexDirection: 'column', gap: '8px' };
const radioLabel = { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' };
const totalsCardModern = { flex: 1, background: '#1e293b', color: 'white', borderRadius: '12px', padding: '15px', display: 'flex', flexDirection: 'column' };
const totalsGrid = { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '10px' };
const totalRow = { display: 'grid', gridTemplateColumns: '1fr 150px 150px', fontWeight: '700' };
const soldeRow = { display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #334155', paddingTop: '10px', fontWeight: '900', fontSize: '18px' };
const valNormal = { textAlign: 'right' };
const btnActionPrimary = { background: '#2563eb', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: '700', cursor: 'pointer' };
const btnActionSecondary = { background: 'white', color: '#4b78c0', border: '1px solid #e2e8f0', padding: '8px 16px', borderRadius: '8px', fontWeight: '700', cursor: 'pointer' };
const btnBackStyle = { background: '#f1f5f9', border: 'none', padding: '8px', borderRadius: '50%', cursor: 'pointer' };
const btnRefresh = { background: '#f1f5f9', border: 'none', padding: '10px', borderRadius: '8px', cursor: 'pointer' };
const centerStyle = { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' };
const stickyHeader = { position: 'sticky', top: 0, zIndex: 10 };

export default HistoriqueEcriture;