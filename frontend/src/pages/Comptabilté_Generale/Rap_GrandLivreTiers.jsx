import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
    Loader2, Printer, RefreshCcw, ArrowLeft, 
    Users, ChevronDown
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../../components/Sidebar';
import API, { socket } from '../../services/api';

const Rap_GrandLivreTiers = () => {
    const navigate = useNavigate();
    
    // --- ÉTATS ---
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState([]);
    const [exercices, setExercices] = useState([]);
    const [planTiers, setPlanTiers] = useState([]); 
    const [selectedExId, setSelectedExId] = useState('');
    
    // États pour gérer l'affichage des listes déroulantes personnalisées
    const [showDe, setShowDe] = useState(false);
    const [showA, setShowA] = useState(false);

    // Références pour fermer les listes au clic extérieur
    const deRef = useRef(null);
    const aRef = useRef(null);
    
    const [filtres, setFiltres] = useState({
        deTiers: '',
        aTiers: '', // Initialisé vide pour la gestion dynamique
        dateDebut: '',
        dateFin: ''
    });

    // --- FERMETURE DES DROPDOWNS AU CLIC EXTÉRIEUR ---
// ✅ 1. FERMETURE DES DROPDOWNS AU CLIC EXTÉRIEUR
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (deRef.current && !deRef.current.contains(event.target)) setShowDe(false);
            if (aRef.current && !aRef.current.contains(event.target)) setShowA(false);
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // ✅ 2. CHARGEMENT INITIAL (Exercices et Plan Tiers)
    const fetchInitialData = useCallback(async () => {
        try {
            // Utilisation de la route harmonisée pour éviter l'erreur 404
            const resEx = await API.get('/plan-comptable/exercices/liste');
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
            
            // Récupération des tiers (Clients / Fournisseurs)
            const resTiers = await API.get('/compta/tiers'); 
            if (resTiers.data.success) {
                const sorted = (resTiers.data.data || []).sort((a, b) => 
                    (a.numero_tiers || "").localeCompare(b.numero_tiers || "")
                );
                setPlanTiers(sorted);
            }
        } catch (err) { 
            console.error("Erreur Initialisation GL Tiers:", err); 
        }
    }, []);

    useEffect(() => {
        fetchInitialData();
    }, [fetchInitialData]);

    // ✅ 3. SYNCHRONISATION TEMPS RÉEL (Socket.io)
    useEffect(() => {
        if (socket) {
            const handleRefresh = () => {
                // On ne rafraîchit que si des données sont déjà affichées (évite les appels inutiles)
                if (data.length > 0) {
                    console.log("🔄 Mise à jour du Grand Livre Tiers détectée...");
                    fetchTiers();
                }
            };

            // Écoute les signaux de rafraîchissement global
            socket.on('REFRESH_COMPTA_DATA', handleRefresh);
            
            // Écoute spécifique des changements sur les écritures comptables
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

    // 🎯 LOGIQUE DE FILTRAGE DYNAMIQUE (Identique au GL Général)
    const suggestionsDe = useMemo(() => {
        if (!filtres.deTiers) return planTiers.slice(0, 50);
        return planTiers
            .filter(t => t.numero_tiers.startsWith(filtres.deTiers.toUpperCase()))
            .slice(0, 50);
    }, [filtres.deTiers, planTiers]);

    const suggestionsA = useMemo(() => {
        // Le deuxième champ dépend du premier
        const baseDe = filtres.deTiers.toUpperCase();
        const baseA = filtres.aTiers.toUpperCase();

        let liste = planTiers;

        if (baseDe) {
            // On ne propose que des tiers dont le code est >= au code de début
            liste = liste.filter(t => t.numero_tiers >= baseDe);
        }

        if (baseA) {
            // Filtrage par ce que l'utilisateur tape dans le champ "À"
            liste = liste.filter(t => t.numero_tiers.startsWith(baseA));
        }

        return liste.slice(0, 50);
    }, [filtres.aTiers, filtres.deTiers, planTiers]);

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

    const fetchTiers = async () => {
        if (!selectedExId) return;
        setLoading(true);
        try {
            const params = { 
                ...filtres, 
                typeGL: 'TIERS', 
                exerciceId: selectedExId,
                deTiers: filtres.deTiers || '0',
                aTiers: filtres.aTiers || 'ZZZZZZZZ'
            };
            const res = await API.get(`/rapports-comptables/grand-livre-dynamique`, { params });
            if (res.data.success) {
                const sortedData = res.data.data.sort((a, b) => a.num_tiers.localeCompare(b.num_tiers));
                setData(sortedData || []);
            }
        } catch (err) { console.error("Erreur API:", err); }
        finally { setLoading(false); }
    };

const allerVersSaisie = (l) => {
    // 🎯 On utilise l'ID de la ligne. Dans le GL Tiers, c'est l.id
    const targetId = l.ligne_ecriture_id || l.id; 

    if (!targetId || !l.journal_id) {
        alert("Erreur : Données de pièce incomplètes (ID ou Journal manquant).");
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
            // 🎯 On envoie l'id au journal
            targetLigneId: targetId 
        } 
    });
};

    const formatCur = (v) => parseFloat(v || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 });

    const renderRows = () => {
        const rows = [];
        let currentTiers = null;
        let dT = 0; let cT = 0;

        data.forEach((l, i) => {
            if (currentTiers !== l.num_tiers) {
                if (currentTiers) {
                    rows.push(
                        <tr key={`tot-${currentTiers}-${i}`} style={s.trTotal}>
                            <td colSpan={6} style={s.tdTotalLabel}>TOTAL TIERS {currentTiers}</td>
                            <td style={s.tdTotalAmount}>{formatCur(dT)}</td>
                            <td style={s.tdTotalAmount}>{formatCur(cT)}</td>
                            <td style={s.tdTotalAmount}>{formatCur(dT - cT)}</td>
                        </tr>
                    );
                }
                currentTiers = l.num_tiers; dT = 0; cT = 0;
                rows.push(
                    <tr key={`h-${l.num_tiers}-${i}`} style={s.trTiersHeader}>
                        <td colSpan={9} style={s.tdTiersTitle}>
                            <Users size={14} style={{marginRight: '10px'}}/>
                            TIERS : {l.num_tiers} - {l.nom_tiers || 'COMPTE AUXILIAIRE'}
                        </td>
                    </tr>
                );
            }
            dT += (l.debit || 0); cT += (l.credit || 0);
            rows.push(
                <tr key={`${l.id}-${i}`} style={s.trMain}>
                    <td style={s.tD}>{l.date_ecriture ? new Date(l.date_ecriture).toLocaleDateString() : '-'}</td>
                    <td style={s.tD}>{l.code_journal}</td>
                    <td style={s.tdPieceInteractive} onDoubleClick={() => allerVersSaisie(l)} title="Double-cliquez pour modifier">
                        {l.piece}
                    </td>
                    <td style={s.tD}>{l.facture || '-'}</td>
                    <td style={s.tD}>{l.libelle}</td>
                    <td style={s.tD_Let}>{l.lettre || '-'}</td>
                    <td style={s.tD_Green}>{formatCur(l.debit)}</td>
                    <td style={s.tD_Red}>{formatCur(l.credit)}</td>
                    <td style={s.tD_Solde}>{formatCur(l.solde_cumule)}</td>
                </tr>
            );
            if (i === data.length - 1) {
                rows.push(
                    <tr key={`tot-f-${currentTiers}-${i}`} style={s.trTotal}>
                        <td colSpan={6} style={s.tdTotalLabel}>TOTAL TIERS {currentTiers}</td>
                        <td style={s.tdTotalAmount}>{formatCur(dT)}</td>
                        <td style={s.tdTotalAmount}>{formatCur(cT)}</td>
                        <td style={s.tdTotalAmount}>{formatCur(dT - cT)}</td>
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
                            <h2 style={s.title}>GRAND LIVRE DES TIERS</h2>
                            <span style={s.subtitle}>COMPTABILITÉ AUXILIAIRE - EXPERT LÉDI</span>
                        </div>
                    </div>
                    <div style={{display:'flex', gap:'10px'}}>
                        <button style={s.btnWhite} onClick={() => window.print()}><Printer size={16}/> IMPRIMER</button>
                    </div>
                </header>

                <section style={s.filterBar}>
                    <div style={s.filterGrid}>
                        
                        {/* 🔘 DROPDOWN : TIERS DE */}
                        <div style={s.fGroup} ref={deRef}>
                            <label style={s.fLabel}>Tiers de</label>
                            <div style={s.inputWrapper}>
                                <input 
                                    style={s.fInput} 
                                    value={filtres.deTiers} 
                                    onFocus={() => setShowDe(true)}
                                    onChange={e => {
                                        const val = e.target.value.toUpperCase();
                                        setFiltres({...filtres, deTiers: val, aTiers: val});
                                        setShowDe(true);
                                    }} 
                                    placeholder="Ex: 411..."
                                />
                                <ChevronDown size={16} style={s.chevron} onClick={() => setShowDe(!showDe)}/>
                            </div>
                            {showDe && (
                                <div style={s.dropdownList}>
                                    {suggestionsDe.map(t => (
                                        <div 
                                            key={`de-${t.id}`} 
                                            style={s.dropdownItem}
                                            onClick={() => {
                                                setFiltres({...filtres, deTiers: t.numero_tiers, aTiers: t.numero_tiers});
                                                setShowDe(false);
                                            }}
                                        >
                                            <span style={{fontWeight:'bold'}}>{t.numero_tiers}</span> - {t.nom}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* 🔘 DROPDOWN : À TIERS (Filtré dynamiquement) */}
                        <div style={s.fGroup} ref={aRef}>
                            <label style={s.fLabel}>À Tiers</label>
                            <div style={s.inputWrapper}>
                                <input 
                                    style={s.fInput} 
                                    value={filtres.aTiers} 
                                    onFocus={() => setShowA(true)}
                                    onChange={e => {
                                        const val = e.target.value.toUpperCase();
                                        // Empêche de choisir un code tiers "avant" le premier choisi
                                        if (filtres.deTiers && val < filtres.deTiers && val.length >= filtres.deTiers.length) return;
                                        setFiltres({...filtres, aTiers: val});
                                        setShowA(true);
                                    }} 
                                    placeholder="Ex: 411ZZZ"
                                />
                                <ChevronDown size={16} style={s.chevron} onClick={() => setShowA(!showA)}/>
                            </div>
                            {showA && (
                                <div style={s.dropdownList}>
                                    {suggestionsA.length > 0 ? suggestionsA.map(t => (
                                        <div 
                                            key={`a-${t.id}`} 
                                            style={s.dropdownItem}
                                            onClick={() => {
                                                setFiltres({...filtres, aTiers: t.numero_tiers});
                                                setShowA(false);
                                            }}
                                        >
                                            <span style={{fontWeight:'bold'}}>{t.numero_tiers}</span> - {t.nom}
                                        </div>
                                    )) : (
                                        <div style={{padding:'10px', fontSize:'11px', color:'#999'}}>Aucun tiers après {filtres.deTiers}</div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div style={s.fGroup}>
                            <label style={s.fLabel}>Exercice</label>
                            <select style={s.fSelect} value={selectedExId} onChange={handleExerciceChange}>
                                {exercices.map(ex=><option key={ex.id} value={ex.id}>{ex.libelle}</option>)}
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
                        <div style={{display: 'flex', alignItems: 'flex-end'}}>
                            <button style={s.btnCalc} onClick={fetchTiers}>
                                <RefreshCcw size={16} className={loading ? 'animate-spin' : ''}/> CALCULER
                            </button>
                        </div>
                    </div>
                </section>

                <div style={s.tableArea}>
                    <div style={s.tableWrapper}>
                        {loading ? <div style={s.load}><Loader2 className="animate-spin" size={50} color="#1a237e"/></div> : 
                        <table style={s.table}>
                            <thead style={s.stickyHead}>
                                <tr>
                                    <th style={s.tH}>Date</th>
                                    <th style={s.tH}>Jo.</th>
                                    <th style={s.tH}>Pièce</th>
                                    <th style={s.tH}>Facture</th>
                                    <th style={s.tH}>Libellé</th>
                                    <th style={s.tH}>Let.</th>
                                    <th style={s.tH_R}>Débit</th>
                                    <th style={s.tH_R}>Crédit</th>
                                    <th style={s.tH_R}>Solde</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.length > 0 ? renderRows() : <tr><td colSpan={9} style={s.noData}>Lancer le calcul</td></tr>}
                            </tbody>
                        </table>}
                    </div>
                </div>
            </main>
        </div>
    );
};

const s = {
    layout: { display: 'flex', height: '100vh', background: '#f0f4f8' },
    main: { flex: 1, display: 'flex', flexDirection: 'column', overflow:'hidden' },
    header: { background: '#1a237e', padding: '18px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color:'white' },
    title: { margin: 0, fontSize: '22px', fontWeight: '900' },
    subtitle: { fontSize: '11px', color: '#c5cae9' },
    filterBar: { background: 'white', padding: '20px 40px', borderBottom: '1px solid #ddd', position: 'relative', zIndex: 100 },
    filterGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px', alignItems: 'end' },
    fGroup: { display: 'flex', flexDirection: 'column', gap: '6px', position: 'relative' },
    fLabel: { fontSize: '11px', fontWeight: '800', color: '#1a237e', textTransform: 'uppercase' },
    fInput: { padding: '9px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '13px', outline: 'none', width: '100%' },
    fSelect: { padding: '9px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '13px', background: 'white' },
    inputWrapper: { position: 'relative', display: 'flex', alignItems: 'center' },
    chevron: { position: 'absolute', right: '10px', color: '#1a237e', cursor: 'pointer' },
    dropdownList: { 
        position: 'absolute', top: '100%', left: 0, right: 0, 
        background: 'white', border: '1px solid #ddd', borderRadius: '4px', 
        maxHeight: '220px', overflowY: 'auto', zIndex: 1000, 
        boxShadow: '0 10px 25px rgba(0,0,0,0.1)', marginTop: '5px' 
    },
    dropdownItem: { padding: '10px 15px', fontSize: '12px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0' },
    btnCalc: { background: '#1a237e', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' },
    btnWhite: { background: 'white', color: '#1a237e', border: 'none', padding: '10px 15px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' },
    btnBack: { background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: '35px', height: '35px', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' },
    tableArea: { flex: 1, padding: '20px', overflow: 'hidden' },
    tableWrapper: { height: '100%', background: 'white', borderRadius: '8px', overflow: 'auto', border: '1px solid #ddd' },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' },
    stickyHead: { position: 'sticky', top: 0, background: '#f8f9ff', borderBottom: '2px solid #1a237e', zIndex: 10 },
    tH: { padding: '12px', textAlign: 'left', color: '#1a237e', fontWeight: 'bold' },
    tH_R: { padding: '12px', textAlign: 'right', color: '#1a237e', fontWeight: 'bold' },
    trTiersHeader: { background: '#f0f2ff', fontWeight: 'bold' },
    tdTiersTitle: { padding: '10px 15px', color: '#1a237e' },
    trMain: { borderBottom: '1px solid #eee' },
    tD: { padding: '10px 12px' },
    tdPieceInteractive: { padding: '10px 12px', fontWeight: 'bold', color: '#2563eb', cursor: 'pointer', textDecoration: 'underline' },
    tD_Let: { padding: '10px 12px', textAlign: 'center', color: '#d32f2f', fontWeight: 'bold' },
    tD_Green: { padding: '10px 12px', textAlign: 'right', color: '#2e7d32' },
    tD_Red: { padding: '10px 12px', textAlign: 'right', color: '#c62828' },
    tD_Solde: { padding: '10px 12px', textAlign: 'right', fontWeight: 'bold', color: '#1a237e', background: '#f9f9f9' },
    trTotal: { background: '#fdfdfd', borderTop: '1px solid #ddd' },
    tdTotalLabel: { textAlign: 'right', padding: '10px', fontWeight: 'bold' },
    tdTotalAmount: { textAlign: 'right', padding: '10px', fontWeight: 'bold' },
    load: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' },
    noData: { textAlign: 'center', padding: '50px', color: '#999' }
};

export default Rap_GrandLivreTiers;