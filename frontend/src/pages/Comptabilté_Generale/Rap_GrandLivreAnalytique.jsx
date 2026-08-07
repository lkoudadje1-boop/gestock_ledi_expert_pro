import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'; // ✅ Ajout de useCallback
import { 
    Loader2, Printer, RefreshCcw, ArrowLeft, 
    BookOpen, ChevronDown, Layers, FileText
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../../components/Sidebar';
import API, { socket } from '../../services/api';

const Rap_GrandLivreAnalytique = () => {
    const navigate = useNavigate();
    
    // --- ÉTATS ---
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState([]);
    const [exercices, setExercices] = useState([]);
    const [sectionsList, setSectionsList] = useState([]);
    const [selectedExId, setSelectedExId] = useState('');
    
    const [showDe, setShowDe] = useState(false);
    const [showA, setShowA] = useState(false);

    const deRef = useRef(null);
    const aRef = useRef(null);
    
    const [filtres, setFiltres] = useState({
        deSection: '', 
        aSection: '',  
        dateDebut: '',
        dateFin: '',
        ecritures: 'TOUTES'
    });

    // 1. Initialisation des données
 const fetchInit = useCallback(async () => {
        try {
            const [resEx, resSec] = await Promise.all([
                API.get('/plan-comptable/exercices/liste'), // ✅ Route corrigée (harmonisée)
                API.get('/analytique/plan/liste') 
            ]);

            if (resEx.data.success) {
                const liste = resEx.data.data;
                setExercices(liste);
                
                // Sélection automatique de l'exercice ouvert
                const ex = liste.find(e => e.statut === 'OUVERT') || liste[0];
                if (ex) {
                    setSelectedExId(ex.id.toString());
                    setFiltres(f => ({ 
                        ...f, 
                        dateDebut: ex.date_debut.split('T')[0], 
                        dateFin: ex.date_fin.split('T')[0] 
                    }));
                }
            }
            if (resSec.data.success) {
                setSectionsList(resSec.data.data || []);
            }
        } catch (err) { 
            console.error("Erreur Initialisation GL Analytique:", err); 
        }
    }, []);

    useEffect(() => {
        fetchInit();

        // 📡 CONFIGURATION TEMPS RÉEL (Socket)
        if (socket) {
            const handleRefresh = () => {
                // On ne rafraîchit que si l'utilisateur a déjà lancé un calcul
                if (data.length > 0) {
                    console.log("🔄 Mise à jour du Grand Livre Analytique détectée...");
                    fetchAnalytique();
                }
            };

            // Écoute les changements sur l'analytique et les écritures réelles
            socket.on('REFRESH_COMPTA_DATA', handleRefresh);
            socket.on('DATA_EVENT', (event) => {
                if (['lignes_analytiques', 'analytic_entries', 'journal_entries'].includes(event.table)) {
                    handleRefresh();
                }
            });

            return () => {
                socket.off('REFRESH_COMPTA_DATA', handleRefresh);
                socket.off('DATA_EVENT');
            };
        }
    }, [fetchInit, data.length]);

    const handleExerciceChange = (e) => {
        const val = e.target.value;
        setSelectedExId(val);
        const exTrouve = exercices.find(ex => ex.id.toString() === val.toString());
        if (exTrouve) {
            setFiltres(prev => ({ 
                ...prev, 
                dateDebut: exTrouve.date_debut.split('T')[0], 
                dateFin: exTrouve.date_fin.split('T')[0] 
            }));
        }
    };

    const fetchAnalytique = async () => {
        if (!selectedExId) return;
        setLoading(true);
        try {
            const res = await API.get(`/rapports-comptables/grand-livre-analytique`, { 
                params: { ...filtres, exerciceId: selectedExId } 
            });
            if (res.data.success) setData(res.data.data || []);
        } catch (err) { console.error("Erreur Calcul:", err); }
        finally { setLoading(false); }
    };

    // 🚀 REDIRECTION VERS LE JOURNAL (CORRIGÉ POUR Ecritures.jsx)
    const allerVersSaisie = (l) => {
        if (!l.piece) return;
        const d = new Date(l.date_ecriture);
        const moisNoms = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

        // On construit l'objet EXACTEMENT comme le veut ton Ecritures.jsx
        navigate('/compta/ecritures-saisie', { 
            state: { 
                journal: { 
                    id: l.journal_id, 
                    code: l.code_journal,
                    mode_numerotation: 'AUTO' // Par défaut
                },
                exercice: { 
                    id: l.exercice_id, 
                    annee: d.getFullYear().toString(),
                    date_debut: l.date_debut_ex, // Nécessaire pour fetchExistingLignes
                    date_fin: l.date_fin_ex
                },
                moisIdx: d.getMonth(),
                mois: moisNoms[d.getMonth()],
                targetLigneId: l.ligne_ecriture_id // 🎯 C'est cette clé qui active la modif dans ton Ecritures.jsx
            } 
        });
    };

    const formatCur = (v) => {
        if (v === undefined || v === null || v === 0) return "";
        return parseFloat(v).toLocaleString('fr-FR', { minimumFractionDigits: 2 });
    };

    const renderRows = () => {
    const rows = [];
    let currentSec = null; 
    let currentAcc = null;
    
    let totDebAcc = 0; let totCreAcc = 0;
    let totDebSec = 0; let totCreSec = 0;

    // 🎯 TOTAL GÉNÉRAL TOUTES SECTIONS
    let totalGlobalDeb = 0;
    let totalGlobalCre = 0;

    data.forEach((l, i) => {
        const d = l.montant > 0 ? l.montant : 0;
        const c = l.montant < 0 ? Math.abs(l.montant) : 0;

        // --- 1. RUPTURE : CHANGEMENT DE COMPTE OU DE SECTION ---
        // Si on change de compte (ou de section), on ferme le compte précédent
        if (currentAcc !== null && (currentAcc !== l.num_compte || currentSec !== l.code_section)) {
            rows.push(
                <tr key={`tot-acc-${i}`} style={s.trTotAcc}>
                    <td colSpan={6} style={s.tdTotAccL}>Total mouvements compte {currentAcc}</td>
                    <td style={s.tdTotV}>{formatCur(totDebAcc)}</td>
                    <td style={s.tdTotV}>{formatCur(totCreAcc)}</td>
                    <td style={s.tdTotV}>{totDebAcc > totCreAcc ? formatCur(totDebAcc - totCreAcc) : ''}</td>
                    <td style={s.tdTotV}>{totCreAcc > totDebAcc ? formatCur(totCreAcc - totDebAcc) : ''}</td>
                </tr>
            );
            totDebAcc = 0; totCreAcc = 0;
        }

        // --- 2. RUPTURE : CHANGEMENT DE SECTION ---
        // Si on change de section, on ferme la section précédente (après le dernier compte)
        if (currentSec !== null && currentSec !== l.code_section) {
            rows.push(
                <tr key={`tot-sec-${i}`} style={s.trTotSec}>
                    <td colSpan={6} style={s.tdTotSecL}>TOTAL GÉNÉRAL SECTION {currentSec}</td>
                    <td style={s.tdTotSecV}>{formatCur(totDebSec)}</td>
                    <td style={s.tdTotSecV}>{formatCur(totCreSec)}</td>
                    <td style={s.tdTotSecV} colSpan={2}>Solde : {formatCur(totDebSec - totCreSec)}</td>
                </tr>
            );
            totDebSec = 0; totCreSec = 0;
        }

        // --- 3. EN-TÊTE : NOUVELLE SECTION ---
        if (currentSec !== l.code_section) {
            currentSec = l.code_section;
            rows.push(
                <tr key={`sec-${i}`} style={s.trSecH}>
                    <td colSpan={10} style={s.tdSecT}>
                        <Layers size={16} style={{marginRight:10}}/> 
                        SECTION : {l.code_section} — {l.libelle_section}
                    </td>
                </tr>
            );
        }

        // --- 4. EN-TÊTE : NOUVEAU COMPTE ---
        if (currentAcc !== l.num_compte || rows[rows.length-1]?.key?.startsWith('sec-')) {
            currentAcc = l.num_compte;
            rows.push(
                <tr key={`acc-${i}`} style={s.trAccH}>
                    <td colSpan={10} style={s.tdAccT}>
                        <BookOpen size={14} color="#008000" style={{marginRight:8}}/> 
                        {l.num_compte} — {l.intitule_compte}
                    </td>
                </tr>
            );
        }

        // --- 5. CUMULS ---
        totDebAcc += d; totCreAcc += c;
        totDebSec += d; totCreSec += c;
        totalGlobalDeb += d; totalGlobalCre += c;

        // --- 6. LIGNE DE SAISIE ---
        rows.push(
            <tr key={`l-${i}`} style={s.trMain}>
                <td style={s.tD}>{new Date(l.date_ecriture).toLocaleDateString()}</td>
                <td style={s.tD}><span style={s.journalTag}>{l.code_journal}</span></td>
                <td style={s.pieceInteractive} onDoubleClick={() => allerVersSaisie(l)} title="Double-clic pour voir dans le journal">
                    {l.piece}
                </td>
                <td style={s.tD}>{l.reference || '-'}</td>
                <td style={s.tD}>{l.facture || '-'}</td>
                <td style={s.tD_Lib}>{l.libelle_ecriture}</td>
                <td style={s.tD_Amt}>{formatCur(d)}</td>
                <td style={s.tD_Amt}>{formatCur(c)}</td>
                <td style={s.tD_Solde}>{l.solde_cumule > 0 ? formatCur(l.solde_cumule) : ''}</td>
                <td style={s.tD_Solde}>{l.solde_cumule < 0 ? formatCur(Math.abs(l.solde_cumule)) : ''}</td>
            </tr>
        );

        // --- 7. PIED DE TABLEAU (FIN DE BOUCLE) ---
        if (i === data.length - 1) {
            // Total du dernier compte
            rows.push(
                <tr key={`last-acc-${i}`} style={s.trTotAcc}>
                    <td colSpan={6} style={s.tdTotAccL}>Total mouvements compte {currentAcc}</td>
                    <td style={s.tdTotV}>{formatCur(totDebAcc)}</td>
                    <td style={s.tdTotV}>{formatCur(totCreAcc)}</td>
                    <td style={s.tdTotV} colSpan={2}>{formatCur(totDebAcc - totCreAcc)}</td>
                </tr>
            );
            // Total de la dernière section
            rows.push(
                <tr key={`last-sec-${i}`} style={s.trTotSec}>
                    <td colSpan={6} style={s.tdTotSecL}>TOTAL GÉNÉRAL SECTION {currentSec}</td>
                    <td style={s.tdTotSecV}>{formatCur(totDebSec)}</td>
                    <td style={s.tdTotSecV}>{formatCur(totCreSec)}</td>
                    <td style={s.tdTotSecV} colSpan={2}>Solde : {formatCur(totDebSec - totCreSec)}</td>
                </tr>
            );
            // 🎯 TOTAL GÉNÉRAL GLOBAL FINAL
            rows.push(
                <tr key={`global-final`} style={s.trGlobal}>
                    <td colSpan={6} style={s.tdGlobalL}>TOTAL GÉNÉRAL DU RAPPORT (TOUTES SECTIONS)</td>
                    <td style={s.tdGlobalV}>{formatCur(totalGlobalDeb)}</td>
                    <td style={s.tdGlobalV}>{formatCur(totalGlobalCre)}</td>
                    <td style={s.tdGlobalV} colSpan={2}>
                        SOLDE GLOBAL : {formatCur(totalGlobalDeb - totalGlobalCre)}
                    </td>
                </tr>
            );
        }
    });

        return rows;
    };

    // Suggestions sections
    const suggDe = useMemo(() => {
        if (!filtres.deSection) return sectionsList.slice(0, 50);
        return sectionsList.filter(s => s.code.startsWith(filtres.deSection)).slice(0, 50);
    }, [filtres.deSection, sectionsList]);

    const suggA = useMemo(() => {
        let list = sectionsList;
        if (filtres.deSection) list = list.filter(s => s.code >= filtres.deSection);
        if (filtres.aSection) list = list.filter(s => s.code.startsWith(filtres.aSection));
        return list.slice(0, 50);
    }, [filtres.aSection, filtres.deSection, sectionsList]);

    return (
        <div style={s.layout} onClick={() => { setShowDe(false); setShowA(false); }}>
            <Sidebar />
            <main style={s.main}>
                <header style={s.header}>
                    <div style={s.headerLeft}>
                        <button onClick={() => navigate(-1)} style={s.btnBack}><ArrowLeft size={20} /></button>
                        <div style={s.titleContainer}>
                            <h2 style={s.title}>Grand Livre Analytique</h2>
                            <div style={s.subtitleContainer}>
                                <span style={s.statusDot}></span>
                                <span style={s.subtitle}>Expert Lédi • Consolidation Analytique</span>
                            </div>
                        </div>
                    </div>
                    <div style={s.headerRight}>
                        <button style={s.btnAction} onClick={fetchAnalytique}>
                            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCcw size={16} />} CALCULER
                        </button>
                        <button style={s.btnIconOnly} onClick={() => window.print()}><Printer size={20} /></button>
                    </div>
                </header>

                <section style={s.filterBar}>
                    <div style={s.filterGrid}>
                        <div style={s.fGroup} ref={deRef} onClick={e => e.stopPropagation()}>
                            <label style={s.fLabel}>Section de</label>
                            <div style={s.inputWrapper}>
                                <input style={s.fInput} value={filtres.deSection} onFocus={()=>setShowDe(true)} onChange={e=>setFiltres({...filtres, deSection:e.target.value.toUpperCase()})} />
                                <ChevronDown size={16} style={s.chevron}/>
                            </div>
                            {showDe && (
                                <div style={s.dropdownList}>
                                    {suggDe.map(sec=>(
                                        <div key={sec.id} style={s.dropdownItem} onClick={()=>{setFiltres({...filtres, deSection:sec.code}); setShowDe(false);}}>
                                            <strong>{sec.code}</strong> - {sec.libelle}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div style={s.fGroup} ref={aRef} onClick={e => e.stopPropagation()}>
                            <label style={s.fLabel}>À la section</label>
                            <div style={s.inputWrapper}>
                                <input style={s.fInput} value={filtres.aSection} onFocus={()=>setShowA(true)} onChange={e=>setFiltres({...filtres, aSection:e.target.value.toUpperCase()})} />
                                <ChevronDown size={16} style={s.chevron}/>
                            </div>
                            {showA && (
                                <div style={s.dropdownList}>
                                    {suggA.map(sec=>(
                                        <div key={sec.id} style={s.dropdownItem} onClick={()=>{setFiltres({...filtres, aSection:sec.code}); setShowA(false);}}>
                                            <strong>{sec.code}</strong> - {sec.libelle}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div style={s.fGroup}>
                            <label style={s.fLabel}>Exercice</label>
                            <select style={s.fSelect} value={selectedExId} onChange={handleExerciceChange}>
                                {exercices.map(ex => <option key={ex.id} value={ex.id}>{ex.libelle}</option>)}
                            </select>
                        </div>
                        <div style={s.fGroup}>
                            <label style={s.fLabel}>Du</label>
                            <input type="date" style={s.fInput} value={filtres.dateDebut} onChange={e=>setFiltres({...filtres, dateDebut:e.target.value})}/>
                        </div>
                        <div style={s.fGroup}>
                            <label style={s.fLabel}>Au</label>
                            <input type="date" style={s.fInput} value={filtres.dateFin} onChange={e=>setFiltres({...filtres, dateFin:e.target.value})}/>
                        </div>
                    </div>
                </section>

                <div style={s.tableArea}>
                    <div style={s.tableWrapper}>
                        {loading ? <div style={s.load}><Loader2 className="animate-spin" size={50} color="#008000"/></div> : (
                            <table style={s.table}>
                                <thead style={s.thead}>
                                    <tr style={s.trHMain}>
                                        <th style={s.th}>DATE</th>
                                        <th style={s.th}>JNL</th>
                                        <th style={s.th}>N° PIÈCE</th>
                                        <th style={s.th}>RÉF.</th>
                                        <th style={s.th}>FACT.</th>
                                        <th style={s.th}>LIBELLÉ ÉCRITURE</th>
                                        <th style={s.thR}>DÉBIT</th>
                                        <th style={s.thR}>CRÉDIT</th>
                                        <th style={s.thR}>DÉBITEUR</th>
                                        <th style={s.thR}>CRÉDITEUR</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.length > 0 ? renderRows() : (
                                        <tr><td colSpan={10} style={s.noData}><FileText size={40}/><p>Lancez le calcul pour générer le rapport</p></td></tr>
                                    )}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
};

const s = {
    layout: { display: 'flex', height: '100vh', background: '#f8fafc' },
    main: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
    header: { background: '#008000', padding: '15px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'white' },
    headerLeft: { display: 'flex', alignItems: 'center', gap: '20px' },
    titleContainer: { display: 'flex', flexDirection: 'column' },
    title: { margin: 0, fontSize: '18px', fontWeight: '900' },
    subtitle: { fontSize: '11px', color: '#e8f5e9' },
    headerRight: { display: 'flex', alignItems: 'center', gap: '12px' },
    btnBack: { background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '10px', color: 'white', padding: '8px', cursor: 'pointer' },
    btnAction: { background: 'white', color: '#008000', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' },
    btnIconOnly: { background: 'rgba(255,255,255,0.15)', color: 'white', border: 'none', padding: '10px', borderRadius: '8px', cursor: 'pointer' },
    filterBar: { background: 'white', padding: '20px 40px', borderBottom: '1px solid #e2e8f0' },
    filterGrid: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '15px' },
    fGroup: { display: 'flex', flexDirection: 'column', gap: '4px', position: 'relative' },
    fLabel: { fontSize: '10px', fontWeight: 'bold', color: '#008000' },
    fInput: { padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' },
    fSelect: { padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', background:'white' },
    inputWrapper: { position: 'relative', display: 'flex', alignItems: 'center' },
    chevron: { position: 'absolute', right: '8px' },
    dropdownList: { position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #ddd', borderRadius: '6px', maxHeight: '200px', overflowY: 'auto', zIndex: 1000 },
    dropdownItem: { padding: '10px', fontSize: '11px', cursor: 'pointer', borderBottom: '1px solid #eee' },
    tableArea: { flex: 1, padding: '20px', overflow: 'hidden' },
    tableWrapper: { height: '100%', background: 'white', borderRadius: '10px', overflow: 'auto', border: '1px solid #e2e8f0' },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: '11px' },
    thead: { position: 'sticky', top: 0, background: 'white', zIndex: 10 },
    trHMain: { borderBottom: '2px solid #008000' },
    th: { padding: '12px', textAlign: 'left', color: '#008000', fontWeight: 'bold' },
    thR: { padding: '12px', textAlign: 'right', color: '#008000', fontWeight: 'bold' },
    trSecH: { background: '#008000', color: 'white' },
    tdSecT: { padding: '10px 20px', fontWeight: 'bold' },
    trAccH: { background: '#f0fff4' },
    tdAccT: { padding: '8px 20px', fontWeight: 'bold', color: '#008000' },
    trMain: { borderBottom: '1px solid #f1f5f9' },
    tD: { padding: '10px 15px' },
    tD_Lib: { padding: '10px 15px', width: '25%' },
    pieceInteractive: { padding: '10px 15px', fontWeight: 'bold', color: '#2563eb', cursor: 'pointer', textDecoration: 'underline' },
    journalTag: { background: '#f1f5f9', padding: '2px 4px', borderRadius: '4px', fontSize: '10px' },
    tD_Amt: { textAlign: 'right', padding: '10px 15px' },
    tD_Solde: { textAlign: 'right', fontWeight: 'bold', background: '#f8fafc', padding: '10px 15px' },
    trTotAcc: { background: '#fdfdfd', borderTop: '1px solid #eee' },
    tdTotAccL: { textAlign: 'right', padding: '10px', color: '#64748b', fontWeight: 'bold' },
    tdTotV: { textAlign: 'right', padding: '10px', fontWeight: 'bold' },
    trTotSec: { background: '#f0fff4', borderTop: '2px double #008000', fontWeight: '900' },
    tdTotSecL: { textAlign: 'right', padding: '12px', color: '#008000' },
    tdTotSecV: { textAlign: 'right', padding: '12px', color: '#008000' },
    // 🎯 Styles pour le Total Global en fin de rapport
    trGlobal: { background: '#004d40', color: 'white', fontWeight: '900', borderTop: '4px solid #000' },
    tdGlobalL: { textAlign: 'right', padding: '15px', fontSize: '12px' },
    tdGlobalV: { textAlign: 'right', padding: '15px', fontSize: '14px' },
    load: { display: 'flex', justifyContent: 'center', padding: '50px' },
    noData: { textAlign: 'center', padding: '50px', color: '#94a3b8' }
};

export default Rap_GrandLivreAnalytique;