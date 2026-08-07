import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
    Loader2, Printer, RefreshCcw, ArrowLeft, 
    BookOpen, Search, Download, ChevronDown
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../../components/Sidebar';
import API, { socket } from '../../services/api';

const Rap_GrandLivreComptes = () => {
    const navigate = useNavigate();
    
    // --- ÉTATS ---
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState([]);
    const [exercices, setExercices] = useState([]);
    const [planComptable, setPlanComptable] = useState([]); 
    const [selectedExId, setSelectedExId] = useState('');
    
    // États pour gérer l'affichage des listes déroulantes personnalisées
    const [showDe, setShowDe] = useState(false);
    const [showA, setShowA] = useState(false);

    // Références pour détecter les clics à l'extérieur et fermer les listes
    const deRef = useRef(null);
    const aRef = useRef(null);
    
    const [filtres, setFiltres] = useState({
        deCompte: '', 
        aCompte: '',  
        dateDebut: '',
        dateFin: '',
        ecritures: 'TOUTES'
    });

    // --- FERMETURE DES DROPDOWNS AU CLIC EXTÉRIEUR ---
// 1. FERMETURE DES DROPDOWNS AU CLIC EXTÉRIEUR
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (deRef.current && !deRef.current.contains(event.target)) setShowDe(false);
            if (aRef.current && !aRef.current.contains(event.target)) setShowA(false);
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // 2. INITIALISATION DES DONNÉES (Exercices et Plan Comptable)
    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                const [resEx, resPC] = await Promise.all([
                    API.get('/plan-comptable/exercices/liste'), // ✅ Route corrigée
                    API.get('/plan-comptable/liste')
                ]);

                if (resEx.data.success) {
                    const listeEx = resEx.data.data;
                    setExercices(listeEx);
                    const exParDefaut = listeEx.find(e => e.statut === 'OUVERT') || listeEx[0];
                    if (exParDefaut) {
                        setSelectedExId(exParDefaut.id.toString());
                        setFiltres(f => ({ 
                            ...f, 
                            dateDebut: exParDefaut.date_debut.split('T')[0], 
                            dateFin: exParDefaut.date_fin.split('T')[0] 
                        }));
                    }
                }
                if (resPC.data.success) {
                    setPlanComptable(resPC.data.data || []);
                }
            } catch (err) { 
                console.error("Erreur Initialisation GL:", err); 
            }
        };
        fetchInitialData();
    }, []);

    // 3. SYNCHRONISATION TEMPS RÉEL (Socket)
    useEffect(() => {
        if (socket) {
            const handleRefresh = () => {
                // On ne rafraîchit que si des données sont déjà affichées à l'écran
                if (data.length > 0) {
                    console.log("🔄 Mise à jour du Grand Livre détectée...");
                    fetchGrandLivre();
                }
            };

            // Écoute les rafraîchissements globaux et les changements d'écritures
            socket.on('REFRESH_COMPTA_DATA', handleRefresh);
            socket.on('DATA_EVENT', (event) => {
                if (['journal_entries', 'lignes_ecritures'].includes(event.table)) {
                    handleRefresh();
                }
            });

            return () => {
                socket.off('REFRESH_COMPTA_DATA');
                socket.off('DATA_EVENT');
            };
        }
    }, [selectedExId, data.length]); // Dépendances pour garantir la fraîcheur des données

    // 🎯 LOGIQUE DE FILTRAGE DYNAMIQUE
    const suggestionsDe = useMemo(() => {
        if (!filtres.deCompte) return planComptable.slice(0, 50);
        return planComptable
            .filter(c => c.numero_compte.toString().startsWith(filtres.deCompte))
            .slice(0, 50);
    }, [filtres.deCompte, planComptable]);

    const suggestionsA = useMemo(() => {
        // La recherche "À Compte" doit être filtrée par la valeur de "De Compte"
        // On ne montre que les comptes >= au compte de départ
        const baseDe = filtres.deCompte;
        const baseA = filtres.aCompte;

        let liste = planComptable;

        if (baseDe) {
            // On ne garde que ce qui est supérieur ou égal au compte de début (Logique Grand Livre)
            liste = liste.filter(c => c.numero_compte.toString() >= baseDe);
        }

        if (baseA) {
            // Filtrage par saisie actuelle dans le champ "A"
            liste = liste.filter(c => c.numero_compte.toString().startsWith(baseA));
        }

        return liste.slice(0, 50);
    }, [filtres.aCompte, filtres.deCompte, planComptable]);

    const handleExerciceChange = (e) => {
        const val = e.target.value;
        setSelectedExId(val);
        const exTrouve = exercices.find(ex => ex.id.toString() === val);
        if (exTrouve) {
            setFiltres(prev => ({ 
                ...prev, 
                dateDebut: exTrouve.date_debut.split('T')[0], 
                dateFin: exTrouve.date_fin.split('T')[0] 
            }));
        }
    };

    const fetchGrandLivre = async () => {
        if (!selectedExId) return;
        setLoading(true);
        try {
            const params = {
                ...filtres,
                deCompte: filtres.deCompte || '100000',
                aCompte: filtres.aCompte || '899999',
                typeGL: 'GENERAL',
                exerciceId: selectedExId
            };

            const res = await API.get(`/rapports-comptables/grand-livre-dynamique`, { params });
            if (res.data.success) setData(res.data.data || []);
        } catch (err) { console.error("Erreur API:", err); }
        finally { setLoading(false); }
    };

    const allerVersSaisie = (l) => {
        if (!l.journal_id || !l.exercice_id) {
            alert("Erreur : Données de pièce incomplètes.");
            return;
        }
        const dateEcriture = new Date(l.date_ecriture);
        const moisNoms = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
        
        navigate('/compta/ecritures-saisie', { 
            state: { 
                journal: { 
                    id: l.journal_id, 
                    code: l.code_journal, 
                    type_journal: l.type_journal,
                    mode_numerotation: l.mode_numerotation || 'AUTO' 
                },
                exercice: { 
                    id: l.exercice_id, 
                    annee: dateEcriture.getFullYear().toString(), 
                    date_debut: l.date_debut_ex, 
                    date_fin: l.date_fin_ex, 
                    libelle: `EXERCICE ${dateEcriture.getFullYear()}` 
                },
                moisIdx: dateEcriture.getMonth(),
                mois: moisNoms[dateEcriture.getMonth()],
                targetLigneId: l.id 
            } 
        });
    };

    const formatCur = (v) => parseFloat(v || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 });

    const renderRows = () => {
        const rows = [];
        let currentAcc = null;
        let dAcc = 0; let cAcc = 0;

        data.forEach((l, i) => {
            if (currentAcc !== l.num_compte) {
                if (currentAcc) {
                    rows.push(
                        <tr key={`tot-${currentAcc}-${i}`} style={s.trTotal}>
                            <td colSpan={5} style={s.tdTotalLabel}>TOTAL COMPTE {currentAcc}</td>
                            <td style={s.tdTotalAmount}>{formatCur(dAcc)}</td>
                            <td style={s.tdTotalAmount}>{formatCur(cAcc)}</td>
                            <td style={s.tdTotalAmount}>{formatCur(dAcc - cAcc)}</td>
                        </tr>
                    );
                }
                currentAcc = l.num_compte; dAcc = 0; cAcc = 0;
                rows.push(
                    <tr key={`h-${l.num_compte}-${i}`} style={s.trAccountHeader}>
                        <td colSpan={8} style={s.tdAccountTitle}>
                            <BookOpen size={14} style={{marginRight: '10px'}}/>
                            {l.num_compte} - {l.intitule_compte}
                        </td>
                    </tr>
                );
            }
            dAcc += l.debit; cAcc += l.credit;
            rows.push(
                <tr key={`${l.id}-${i}`} style={s.trMain}>
                    <td style={s.tD}>{new Date(l.date_ecriture).toLocaleDateString()}</td>
                    <td style={s.tD}>{l.code_journal}</td>
                    <td 
                        style={s.tdPieceInteractive} 
                        onDoubleClick={() => allerVersSaisie(l)}
                        title="Double-cliquez pour ouvrir dans le journal"
                    >
                        {l.piece}
                    </td>
                    <td style={s.tD}>{l.facture || '-'}</td>
                    <td style={s.tD}>{l.libelle}</td>
                    <td style={s.tD_Green}>{formatCur(l.debit)}</td>
                    <td style={s.tD_Red}>{formatCur(l.credit)}</td>
                    <td style={s.tD_Solde}>{formatCur(l.solde_cumule)}</td>
                </tr>
            );
            if (i === data.length - 1) {
                rows.push(
                    <tr key={`tot-f-${currentAcc}-${i}`} style={s.trTotal}>
                        <td colSpan={5} style={s.tdTotalLabel}>TOTAL COMPTE {currentAcc}</td>
                        <td style={s.tdTotalAmount}>{formatCur(dAcc)}</td>
                        <td style={s.tdTotalAmount}>{formatCur(cAcc)}</td>
                        <td style={s.tdTotalAmount}>{formatCur(dAcc - cAcc)}</td>
                    </tr>
                );
            }
        });
        return rows;
    };

    return (
        <div style={s.layout}>
            <Sidebar />
            <main style={s.main}>
                <header style={s.header}>
                    <div style={{display:'flex', alignItems:'center', gap:'20px'}}>
                        <button onClick={() => navigate(-1)} style={s.btnBack}><ArrowLeft size={20}/></button>
                        <div>
                            <h2 style={s.title}>GRAND LIVRE GÉNÉRAL</h2>
                            <span style={s.subtitle}>SYSTÈME D'AUDIT COMPTABLE - EXPERT LÉDI</span>
                        </div>
                    </div>
                    <div style={{display:'flex', gap:'12px'}}>
                        <button style={s.btnWhite} onClick={fetchGrandLivre}><RefreshCcw size={16}/> CALCULER</button>
                        <button style={s.btnWhite} onClick={() => window.print()}><Printer size={16}/> IMPRIMER</button>
                    </div>
                </header>

                <section style={s.filterBar}>
                    <div style={s.filterGrid}>
                        
                        {/* --- DROPDOWN : COMPTE DE --- */}
                        <div style={s.fGroup} ref={deRef}>
                            <label style={s.fLabel}>Compte de</label>
                            <div style={s.inputWrapper}>
                                <input 
                                    style={s.fInput} 
                                    value={filtres.deCompte} 
                                    onFocus={() => setShowDe(true)}
                                    onChange={e => {
                                        const val = e.target.value.replace(/\D/g, '');
                                        // On réinitialise "A" si l'utilisateur change "De" pour forcer la cohérence
                                        setFiltres({...filtres, deCompte: val, aCompte: val});
                                        setShowDe(true);
                                    }} 
                                    placeholder="Ex: 22..."
                                />
                                <ChevronDown size={16} style={s.chevron} onClick={() => setShowDe(!showDe)}/>
                            </div>
                            {showDe && (
                                <div style={s.dropdownList}>
                                    {suggestionsDe.map(c => (
                                        <div 
                                            key={`de-${c.id}`} 
                                            style={s.dropdownItem}
                                            onClick={() => {
                                                setFiltres({...filtres, deCompte: c.numero_compte, aCompte: c.numero_compte});
                                                setShowDe(false);
                                            }}
                                        >
                                            <strong>{c.numero_compte}</strong> - {c.intitule}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* --- DROPDOWN : À COMPTE (Filtré par le premier champ) --- */}
                        <div style={s.fGroup} ref={aRef}>
                            <label style={s.fLabel}>À Compte</label>
                            <div style={s.inputWrapper}>
                                <input 
                                    style={s.fInput} 
                                    value={filtres.aCompte} 
                                    onFocus={() => setShowA(true)}
                                    onChange={e => {
                                        const val = e.target.value.replace(/\D/g, '');
                                        // Empêcher de saisir un compte plus petit que le début
                                        if (filtres.deCompte && val < filtres.deCompte && val.length >= filtres.deCompte.length) {
                                            return; 
                                        }
                                        setFiltres({...filtres, aCompte: val});
                                        setShowA(true);
                                    }} 
                                    placeholder="Ex: 22..."
                                />
                                <ChevronDown size={16} style={s.chevron} onClick={() => setShowA(!showA)}/>
                            </div>
                            {showA && (
                                <div style={s.dropdownList}>
                                    {suggestionsA.length > 0 ? suggestionsA.map(c => (
                                        <div 
                                            key={`a-${c.id}`} 
                                            style={s.dropdownItem}
                                            onClick={() => {
                                                setFiltres({...filtres, aCompte: c.numero_compte});
                                                setShowA(false);
                                            }}
                                        >
                                            <strong>{c.numero_compte}</strong> - {c.intitule}
                                        </div>
                                    )) : (
                                        <div style={{padding:'10px', fontSize:'11px', color:'#999'}}>Aucun compte supérieur à {filtres.deCompte}</div>
                                    )}
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
                        {loading ? (
                            <div style={s.load}><Loader2 className="animate-spin" size={50} color="#800020"/></div>
                        ) : (
                            <table style={s.table}>
                                <thead style={s.stickyHead}>
                                    <tr>
                                        <th style={s.tH}>Date</th>
                                        <th style={s.tH}>Jo.</th>
                                        <th style={s.tH}>N° Pièce</th>
                                        <th style={s.tH}>Facture</th>
                                        <th style={s.tH}>Libellé de l'écriture</th>
                                        <th style={s.tH_R}>Débit</th>
                                        <th style={s.tH_R}>Crédit</th>
                                        <th style={s.tH_R}>Solde Prog.</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.length > 0 ? renderRows() : (
                                        <tr><td colSpan={8} style={s.noData}>Cliquez sur CALCULER pour charger les données</td></tr>
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
    layout: { display: 'flex', height: '100vh', background: '#f0f2f5' },
    main: { flex: 1, display: 'flex', flexDirection: 'column', overflow:'hidden' },
    header: { background: '#800020', padding: '18px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color:'white', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' },
    title: { margin: 0, fontSize: '22px', fontWeight: '900', letterSpacing: '0.5px' },
    subtitle: { fontSize: '11px', color: '#ffcccc', fontWeight: '600', textTransform: 'uppercase' },
    filterBar: { background: 'white', padding: '25px 40px', borderBottom: '4px solid #80002015', position: 'relative', zIndex: 100 },
    filterGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '20px', alignItems: 'end' },
    fGroup: { display: 'flex', flexDirection: 'column', gap: '6px', position: 'relative' },
    fLabel: { fontSize: '11px', fontWeight: '800', color: '#800020', textTransform: 'uppercase' },
    fInput: { padding: '10px', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '13px', outline: 'none', width: '100%' },
    fSelect: { padding: '10px', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '13px', background:'white' },
    inputWrapper: { position: 'relative', display: 'flex', alignItems: 'center' },
    chevron: { position: 'absolute', right: '10px', color: '#800020', cursor: 'pointer' },
    dropdownList: { position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #ddd', borderRadius: '6px', maxHeight: '220px', overflowY: 'auto', zIndex: 1000, boxShadow: '0 10px 25px rgba(0,0,0,0.15)', marginTop: '5px' },
    dropdownItem: { padding: '10px 15px', fontSize: '12px', cursor: 'pointer', borderBottom: '1px solid #f5f5f5', transition: 'background 0.2s' },
    tableArea: { flex: 1, padding: '25px', overflow: 'hidden' },
    tableWrapper: { height: '100%', background: 'white', borderRadius: '10px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', overflow: 'auto', border: '1px solid #eee' },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' },
    stickyHead: { position: 'sticky', top: 0, background: '#fcfcfc', zIndex: 10, borderBottom: '3px solid #800020' },
    tH: { padding: '15px', textAlign: 'left', color: '#800020', fontWeight: 'bold' },
    tH_R: { padding: '15px', textAlign: 'right', color: '#800020', fontWeight: 'bold' },
    trAccountHeader: { background: '#80002005', borderLeft: '8px solid #800020' },
    tdAccountTitle: { padding: '15px 20px', fontWeight: '900', color: '#800020', fontSize: '14px' },
    trMain: { borderBottom: '1px solid #f5f5f5' },
    tD: { padding: '15px' },
    tdPieceInteractive: { padding: '15px', fontWeight: 'bold', color: '#2563eb', cursor: 'pointer', textDecoration: 'underline' },
    tD_Green: { padding: '15px', textAlign: 'right', color: '#2e7d32', fontWeight: 'bold' },
    tD_Red: { padding: '15px', textAlign: 'right', color: '#d32f2f', fontWeight: 'bold' },
    tD_Solde: { padding: '15px', textAlign: 'right', fontWeight: '900', background: '#fafafa', color: '#800020' },
    trTotal: { background: '#fdfdfd', borderTop: '2px solid #80002033' },
    tdTotalLabel: { textAlign: 'right', padding: '15px', color: '#800020', fontWeight: 'bold' },
    tdTotalAmount: { textAlign: 'right', padding: '15px', fontWeight: 'bold' },
    btnWhite: { background:'white', color:'#800020', border:'none', padding:'10px 20px', borderRadius:'8px', cursor:'pointer', fontWeight:'900', fontSize:'12px', display:'flex', alignItems:'center', gap:'10px' },
    btnBack: { background:'rgba(255,255,255,0.15)', border:'1px solid white', borderRadius:'50%', color:'white', width: '40px', height: '40px', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' },
    load: { display:'flex', justifyContent:'center', alignItems:'center', height:'100%' },
    noData: { textAlign: 'center', padding: '80px', color: '#bbb', fontSize: '15px', fontStyle: 'italic' }
};

export default Rap_GrandLivreComptes;