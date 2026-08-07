import React, { useState, useEffect, useRef } from 'react';
import { 
    ArrowRightLeft, Search, Plus, Trash2, 
    ChevronDown, ChevronUp, PieChart, AlertCircle, CheckCircle
} from 'lucide-react';
import API, { socket, joinCompanyRoom } from '../../services/api';
import Sidebar from '../../components/Sidebar';
import SaisiAnalytique from '../Comptabilté_Generale/SaisiAnalytique';

const BORDEAUX = '#800020';

// --- COMPOSANT SELECTEUR DE COMPTE (AVEC RECHERCHE ET OPTIMISATION) ---
const CompteSelector = ({ planComptable, value, numValue, onChange, placeholder }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState(numValue || '');
    const wrapperRef = useRef(null);

    useEffect(() => { setSearch(numValue || ''); }, [numValue]);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setIsOpen(false);
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const filtered = planComptable.filter(c => 
        String(c.numero_compte).toLowerCase().includes(search.toLowerCase()) || 
        c.intitule.toLowerCase().includes(search.toLowerCase())
    ).slice(0, 50);

    return (
        <div ref={wrapperRef} style={{ position: 'relative', flex: 2 }}>
            <div style={customSelectTrigger}>
                <input 
                    style={{ border: 'none', outline: 'none', width: '100%', fontSize: '12px', fontWeight: 'bold' }}
                    placeholder={placeholder}
                    value={search}
                    onFocus={() => setIsOpen(true)}
                    onChange={(e) => {
                        setSearch(e.target.value);
                        setIsOpen(true);
                        const match = planComptable.find(c => c.numero_compte === e.target.value);
                        if (match) onChange(match);
                    }}
                />
                <ChevronDown size={14} style={{ marginLeft: 'auto', cursor: 'pointer' }} onClick={() => setIsOpen(!isOpen)} />
            </div>
            {isOpen && (
                <div style={dropdownContainer}>
                    <div style={optionsList}>
                        {filtered.map(c => (
                            <div key={c.id} style={optionItem} onClick={() => { 
                                onChange(c); 
                                setSearch(c.numero_compte);
                                setIsOpen(false); 
                            }}>
                                <span style={{ color: BORDEAUX, fontWeight: 'bold' }}>{c.numero_compte}</span> - {c.intitule}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

const VentilationBrouillard = () => {
    const [operations, setOperations] = useState([]);
    const [planComptable, setPlanComptable] = useState([]);
    const [planTiers, setPlanTiers] = useState([]); 
    const [companySettings, setCompanySettings] = useState(null);
    const [loading, setLoading] = useState(true);
    const [expandedOp, setExpandedOp] = useState(null);
    const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
    
    const [tempLine, setTempLine] = useState({ compte_id: '', num_compte: '', num_tiers: '', montant: '' });
    const [ventilations, setVentilations] = useState({}); 
    const [showAnalytique, setShowAnalytique] = useState(false);
    const [anaContext, setAnaContext] = useState(null); 

    const showToast = (message, type = 'success') => {
        setToast({ show: true, message, type });
        setTimeout(() => setToast(prev => ({ ...prev, show: false })), 3000);
    };

    const isAuxiliaire = (num) => /^(40|41|42|43|44)/.test(num);

// ✅ 1. fetchData avec option silencieuse
const fetchData = async (isSilent = false) => {
    try {
        if (!isSilent) setLoading(true); // Loader uniquement au premier chargement
        const [resOps, resPlan, resTiers, resSettings] = await Promise.all([
            API.get('/treso/operations/a-ventiler'), 
            API.get('/plan-comptable'),
            API.get('/compta/tiers'),
            API.get('/company/settings')
        ]);
        
        setOperations(Array.isArray(resOps.data) ? resOps.data : []);
        setPlanComptable(resPlan.data?.success ? resPlan.data.data : []);
        setPlanTiers(resTiers.data?.data || []);
        setCompanySettings(resSettings.data);
        
        // On ne réinitialise le tableau de ventilation que si l'opération n'existe plus
        setVentilations(prev => {
            const newVent = { ...prev };
            (resOps.data || []).forEach(op => {
                if (!newVent[op.id]) newVent[op.id] = [];
            });
            return newVent;
        });
    } catch (err) { 
        showToast("Erreur de synchronisation", "error"); 
    } finally { 
        if (!isSilent) setLoading(false); 
    }
};

// ✅ 2. useEffect avec joinCompanyRoom et rafraîchissement muet
useEffect(() => { 
    fetchData();

    if (socket) {
        // Importe bien joinCompanyRoom en haut du fichier !
        socket.emit('join_company'); 

        const handleSync = (event) => {
            // Tables qui impactent la ventilation
            const tablesImpact = ['treasury_ops', 'plan_comptable', 'analytic_plans'];
            if (event && tablesImpact.includes(event.table)) {
                console.log("🤫 SNC Silencieux : Mise à jour en arrière-plan");
                fetchData(true); // Rafraîchissement SANS loader
            }
        };

        socket.on('DATA_EVENT', handleSync);
        socket.on('REFRESH_OP_TRESO', () => fetchData(true));
        socket.on('REFRESH_VENTILATION', () => fetchData(true));

        return () => {
            socket.off('DATA_EVENT', handleSync);
            socket.off('REFRESH_OP_TRESO');
            socket.off('REFRESH_VENTILATION');
        };
    }
}, []);

    const currentFilteredTiers = planTiers.filter(t => t.compte_collectif_id === tempLine.compte_id);

const handleAddLine = async () => {
    if (!tempLine.compte_id || !tempLine.montant) return showToast("Veuillez saisir un compte et un montant", "error");
    
    // 🛡️ SÉCURITÉ : Calcul du reste à ventiler
    const op = operations.find(o => o.id === expandedOp);
    const linesAdded = ventilations[expandedOp] || [];
    const totalDejaVentile = linesAdded.reduce((sum, l) => sum + parseFloat(l.montant || 0), 0);
    const montantSaisi = parseFloat(tempLine.montant);
    const resteAVentiler = op.montant - totalDejaVentile;

    // 🔥 BLOCAGE STRICT
    if (montantSaisi > (resteAVentiler + 0.01)) {
        return showToast(`Dépassement ! Il ne reste que ${resteAVentiler.toLocaleString()} F à ventiler.`, "error");
    }

    if (isAuxiliaire(tempLine.num_compte) && !tempLine.num_tiers) {
        return showToast("Le numéro de tiers est obligatoire pour ce compte", "error");
    }

    const montantLine = montantSaisi;
    const analytiqueActive = companySettings?.gestion_analytique === 1;
    const estCompteChargeProduit = tempLine.num_compte.startsWith('6') || tempLine.num_compte.startsWith('7');

    if (analytiqueActive && estCompteChargeProduit && montantLine > 0) {
        try {
            const resCheck = await API.get(`/analytique/saisie/check/${tempLine.compte_id}`);
            const config = resCheck.data?.data;

            if (config && config.mode_saisie === 'AUTO') {
                const repartitionsFinales = Object.entries(config.repartitions).map(([planId, info]) => {
                    const d_id = config.details_plans?.[planId]?.dept_id || config.details_plans?.[planId]?.departement_id;
                    return {
                        plan_analytique_id: planId,
                        departement_id: d_id,
                        dept_id: d_id,
                        libelle: config.details_plans?.[planId]?.libelle || 'Analytique',
                        montant: (montantLine * (parseFloat(info) / 100)).toFixed(2),
                        pourcentage: info
                    };
                });

                if (!repartitionsFinales.some(r => !r.departement_id)) {
                    const newLine = { 
                        ...tempLine,
                        montant: montantLine, 
                        is_analytique: true,
                        repartitions: repartitionsFinales 
                    };
                    setVentilations(prev => ({ ...prev, [expandedOp]: [...(prev[expandedOp] || []), newLine] }));
                    setTempLine({ compte_id: '', num_compte: '', num_tiers: '', montant: '' });
                    showToast("Ventilation automatique appliquée ✓", "success");
                    return;
                }
            }
        } catch (err) { console.error("Erreur check analytique auto:", err); }
    }

    // --- OUVERTURE MODAL SI PAS AUTO ---
    if (analytiqueActive && estCompteChargeProduit) {
        setAnaContext({ opId: expandedOp, lineData: { ...tempLine, montant: montantLine } });
        setShowAnalytique(true);
    } else {
        const newLine = { ...tempLine, montant: montantLine, is_analytique: false, repartitions: [] };
        setVentilations(prev => ({ ...prev, [expandedOp]: [...(prev[expandedOp] || []), newLine] }));
        setTempLine({ compte_id: '', num_compte: '', num_tiers: '', montant: '' });
    }
};
    const saveAnalytiqueData = (data) => {
        const { opId, lineData } = anaContext;
        const completeLine = { ...lineData, is_analytique: true, repartitions: data.repartitions };
        setVentilations(prev => ({ ...prev, [opId]: [...prev[opId], completeLine] }));
        setTempLine({ compte_id: '', num_compte: '', num_tiers: '', montant: '' });
        setShowAnalytique(false);
        showToast("Ligne analytique ajoutée");
    };

const handleVentilerFinal = async (opId, extourneLines = null) => {
    const lines = extourneLines || ventilations[opId];
    const op = operations.find(o => o.id === opId);
    
    if (!lines || lines.length === 0) return showToast("Aucune donnée à comptabiliser", "error");

    // ✅ CORRECTION : Calcul intelligent pour l'extourne
    let totalAComparer;
    if (extourneLines) {
        // On vérifie que Débit = Crédit et on compare UN SEUL côté au montant de l'opération
        const totalDebit = lines.filter(l => l.type === 'DEBIT').reduce((sum, l) => sum + parseFloat(l.montant || 0), 0);
        const totalCredit = lines.filter(l => l.type === 'CREDIT').reduce((sum, l) => sum + parseFloat(l.montant || 0), 0);
        
        if (Math.abs(totalDebit - totalCredit) > 0.01) return showToast("Déséquilibre Débit/Crédit", "error");
        totalAComparer = totalDebit; // On prend 100 F (un côté) au lieu de 200 F (les deux)
    } else {
        totalAComparer = lines.reduce((sum, l) => sum + parseFloat(l.montant || 0), 0);
    }

    if (Math.abs(totalAComparer - op.montant) > 0.01) {
        return showToast(`Déséquilibre : ${totalAComparer.toLocaleString()} F vs ${op.montant.toLocaleString()} F`, "error");
    }

    setLoading(true);
    try {
        await API.post('/treso/operations/ventiler', { 
            operation_id: opId, 
            lignes: lines,
            mode_ecriture: op.mode_ecriture,
            is_extourne: !!extourneLines 
        });
        showToast(extourneLines ? "Extourne validée !" : "Ventilation enregistrée !");
        fetchData();
        setExpandedOp(null);
    } catch (err) { 
        showToast(err.response?.data?.error || "Erreur", "error"); 
    } finally { 
        setLoading(false); 
    }
};
    return (
        <div style={layoutStyle}>
            {toast.show && <div style={{...toastStyle, background: toast.type === 'error' ? '#ef4444' : '#10b981'}}>{toast.message}</div>}
            <Sidebar />

            <main style={mainStyle}>
                <header style={headerStyle}>
                    <div style={iconBox}><ArrowRightLeft size={20} color="white" /></div>
                    <div>
                        <h1 style={titleStyle}>VENTILATION COMPTABLE & ANALYTIQUE</h1>
                        <p style={{margin:0, fontSize:'11px', color:'#64748b'}}>
                            Paramétrage : {companySettings?.gestion_analytique === 1 ? 'Analytique Activé' : 'Standard'}
                        </p>
                    </div>
                </header>

                <div style={contentWrapper}>
                    <div style={tableContainer}>
                        <table style={table}>
                            <thead>
                                <tr style={{background:'#1e293b', color:'white'}}>
                                    <th style={th}>RÉFÉRENCE</th>
                                    <th style={th}>LIBELLÉ / MOTIF DE REJET</th>
                                    <th style={th} align="right">MONTANT</th>
                                    <th style={th} align="center">ETAT</th>
                                </tr>
                            </thead>
                            <tbody>
                                {operations.map(op => {
                                    const linesAdded = ventilations[op.id] || [];
                                    const totalAdded = linesAdded.reduce((s, l) => s + l.montant, 0);
                                    const diff = op.montant - totalAdded;

                                    return (
                                        <React.Fragment key={op.id}>
                                            <tr onClick={() => setExpandedOp(expandedOp === op.id ? null : op.id)} style={{...tr, cursor:'pointer', background: expandedOp === op.id ? '#f1f5f9' : 'white'}}>
                                                <td style={td}>
                                                    <div style={{fontWeight:800}}>{op.piece_comptable}</div>
                                                    <div style={{fontSize:'10px', color:BORDEAUX, fontWeight:'bold'}}>{op.mode_ecriture}</div>
                                                </td>
                                                <td style={td}>
                                                    <div style={{fontWeight:'500'}}>{op.libelle}</div>
                                                    <div style={{fontSize:'10px', color:'#64748b'}}>{op.brouillard_libelle}</div>
                                                    
                                                    {/* AFFICHAGE DU MOTIF DE REJET DU CHEF COMPTABLE */}
                                                    {op.motif_annulation && op.motif_annulation.includes('REJET') && (
                                                        <div style={rejetBoxStyle}>
                                                            <AlertCircle size={12} /> {op.motif_annulation}
                                                        </div>
                                                    )}
                                                </td>
                                                <td style={{...td, fontWeight:'900'}} align="right">{op.montant.toLocaleString()} F</td>
                                                <td style={td} align="center">{expandedOp === op.id ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}</td>
                                            </tr>

{expandedOp === op.id && (
    <tr>
        <td colSpan="4" style={{padding:'20px', background:'#f8fafc'}}>
            <div style={ventilationForm}>
                
                {/* 🔍 BLOC CONSULTATION : AFFICHÉ UNIQUEMENT POUR LES ANNULATIONS */}
                {op.id.includes('ANNUL') && op.lignes_originales && (
                    <div style={historiqueBoxStyle}>
                        <div style={{display:'flex', alignItems:'center', gap:'8px', marginBottom:'10px'}}>
                            <AlertCircle size={14} color={BORDEAUX} />
                            <span style={{fontSize:'11px', fontWeight:'800', color:BORDEAUX}}>
                                RAPPEL ÉCRITURE INITIALE (PIÈCE : {op.piece_comptable})
                            </span>
                        </div>
                        <div style={miniTableContainer}>
                            <table style={{...miniTable, opacity: 0.8}}>
                                <thead>
                                    <tr style={{background:'#f1f5f9'}}>
                                        <th style={mth}>Compte</th>
                                        <th style={mth}>Tiers</th>
                                        <th style={mth} align="right">Débit (Ancien)</th>
                                        <th style={mth} align="right">Crédit (Ancien)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {op.lignes_originales.map((old, idx) => (
                                        <tr key={idx} style={mtr}>
                                            <td style={mtd}><b>{old.num_compte}</b></td>
                                            <td style={mtd}>{old.num_tiers || '-'}</td>
                                            <td style={mtd} align="right">{old.debit > 0 ? `${old.debit.toLocaleString()} F` : '-'}</td>
                                            <td style={mtd} align="right">{old.credit > 0 ? `${old.credit.toLocaleString()} F` : '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div style={{fontSize: '10px', color: '#ef4444', fontWeight: 'bold', marginTop: '5px'}}>
                            MOTIF D'ANNULATION : {op.motif_annulation}
                        </div>
                    </div>
                )}

                {/* 📝 FORMULAIRE DE SAISIE UNIQUE (Pour tout le monde) */}
                <div style={saisieBar}>
                    <CompteSelector 
                        planComptable={planComptable} 
                        value={tempLine.compte_id}
                        numValue={tempLine.num_compte}
                        placeholder="N° Compte (ex: 601...)"
                        onChange={(c) => setTempLine({...tempLine, compte_id: c.id, num_compte: c.numero_compte, num_tiers: ''})}
                    />
                    {isAuxiliaire(tempLine.num_compte) ? (
                        <select style={barInputTiers} value={tempLine.num_tiers} onChange={(e) => setTempLine({...tempLine, num_tiers: e.target.value})}>
                            <option value="">-- Choisir Tiers --</option>
                            {currentFilteredTiers.map(t => <option key={t.id} value={t.numero_tiers}>{t.numero_tiers} - {t.nom}</option>)}
                        </select>
                    ) : (
                        <div style={tierPlaceholder}>Général uniquement</div>
                    )}
                    <input type="number" placeholder="Montant" style={inputMontant} value={tempLine.montant} onChange={(e) => setTempLine({...tempLine, montant: e.target.value})} />
                    <button onClick={handleAddLine} style={btnAjouter}><Plus size={14} /> AJOUTER</button>
                </div>

                {/* TABLEAU DES LIGNES EN COURS DE SAISIE */}
                {linesAdded.length > 0 && (
                    <div style={miniTableContainer}>
                        <table style={miniTable}>
                            <thead>
                                <tr style={{background:'#f1f5f9'}}>
                                    <th style={mth}>Compte</th>
                                    <th style={mth}>Tiers</th>
                                    <th style={mth} align="right">Montant</th>
                                    <th style={mth} align="center">Ana.</th>
                                    <th style={mth} align="right">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {linesAdded.map((l, i) => (
                                    <tr key={i} style={mtr}>
                                        <td style={mtd}>{l.num_compte}</td>
                                        <td style={mtd}>{l.num_tiers || '-'}</td>
                                        <td style={mtd} align="right">{parseFloat(l.montant).toLocaleString()}</td>
                                        <td style={mtd} align="center">{l.is_analytique ? <PieChart size={12} color={BORDEAUX}/> : '-'}</td>
                                        <td style={mtd} align="right">
                                            <button style={btnTrash} onClick={() => {
                                                const copy = [...linesAdded]; copy.splice(i, 1);
                                                setVentilations({...ventilations, [op.id]: copy});
                                            }}><Trash2 size={14}/></button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* BARRE D'ACTIONS FINALE */}
                <div style={{...footerAction, borderTop: diff === 0 ? '2px solid #10b981' : '2px solid #ef4444'}}>
                    <div style={{fontWeight:'800', fontSize:'12px', color: diff === 0 ? '#10b981' : '#ef4444'}}>
                        {diff === 0 ? '✓ VENTILATION ÉQUILIBRÉE' : `⚠ RESTE À VENTILER : ${diff.toLocaleString()} F`}
                    </div>
                    <button 
                        onClick={() => handleVentilerFinal(op.id)} 
                        disabled={Math.abs(diff) > 0.01} 
                        style={{...btnValider, opacity: diff === 0 ? 1 : 0.5}}
                    >
                        VALIDER & COMPTABILISER
                    </button>
                </div>
            </div>
        </td>
    </tr>
)}
                                        </React.Fragment>
                                    );
                                })}
                                {operations.length === 0 && !loading && <tr><td colSpan="4" style={{padding:'40px', textAlign:'center', color:'#64748b'}}>Aucune opération en attente de ventilation.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>

                {showAnalytique && anaContext && (
                    <SaisiAnalytique 
                        compte_id={anaContext.lineData.num_compte}
                        id_technique={anaContext.lineData.compte_id}
                        montant_journal={anaContext.lineData.montant}
                        ligne_id={`V-TEMP-${Date.now()}`}
                        onSave={saveAnalytiqueData}
                        onClose={() => setShowAnalytique(false)}
                    />
                )}
            </main>
        </div>
    );
};

// --- STYLES ---
const rejetBoxStyle = { 
    marginTop: '6px', 
    padding: '6px 10px', 
    background: '#fee2e2', 
    borderLeft: '4px solid #ef4444', 
    color: '#b91c1c', 
    fontSize: '10px', 
    fontWeight: 'bold', 
    display: 'flex', 
    alignItems: 'center', 
    gap: '6px', 
    borderRadius: '4px' 
};
const annulHeaderStyle = { 
    display: 'flex', 
    alignItems: 'center', 
    gap: '12px', 
    padding: '12px', 
    background: '#fee2e2', 
    borderRadius: '6px', 
    border: '1px solid #fecaca',
    marginBottom: '10px'
};
const saisieBar = { display: 'flex', gap: '8px', marginBottom: '15px', background: '#e2e8f0', padding: '10px', borderRadius: '4px' };
const barInputTiers = { flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none' };
const tierPlaceholder = { flex: 1, padding: '8px', background: '#f1f5f9', border: '1px dashed #cbd5e1', borderRadius: '4px', fontSize: '11px', color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const btnAjouter = { background: '#1e293b', color: 'white', border: 'none', padding: '0 15px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '11px' };
const miniTableContainer = { background: 'white', borderRadius: '4px', border: '1px solid #e2e8f0', marginBottom: '10px', overflow: 'hidden' };
const miniTable = { width: '100%', borderCollapse: 'collapse', fontSize: '11px' };
const mth = { padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: 'bold' };
const mtd = { padding: '8px 12px', borderBottom: '1px solid #f1f5f9' };
const mtr = { transition: 'background 0.2s' };
const footerAction = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '15px', marginTop:'10px' };
const btnValider = { background: BORDEAUX, color: 'white', border: 'none', padding: '10px 25px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '11px' };
const btnTrash = { color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' };
const layoutStyle = { display: 'flex', height: '100vh', background: '#f1f5f9', overflow: 'hidden' };
const mainStyle = { flex: 1, display: 'flex', flexDirection: 'column' };
const headerStyle = { background: 'white', padding: '15px 30px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '15px' };
const iconBox = { background: BORDEAUX, padding: '10px', borderRadius: '8px' };
const titleStyle = { margin: 0, fontSize: '15px', fontWeight: '900', color: '#1e293b' };
const contentWrapper = { padding: '20px', flex: 1, overflowY: 'auto' };
const tableContainer = { background: 'white', borderRadius: '10px', border: '1px solid #e2e8f0' };
const table = { width: '100%', borderCollapse: 'collapse' };
const th = { padding: '12px 15px', fontSize: '11px', textAlign: 'left' };
const tr = { borderBottom: '1px solid #f1f5f9' };
const td = { padding: '12px 15px', fontSize: '12px' };
const ventilationForm = { background: 'white', padding: '15px', borderRadius: '6px', border: '1px solid #e2e8f0' };
const inputMontant = { width: '120px', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontWeight: 'bold', textAlign: 'right', outline: 'none' };
const toastStyle = { position: 'fixed', top: '20px', right: '20px', padding: '12px 25px', borderRadius: '8px', color: 'white', fontWeight: 'bold', zIndex: 10000 };
const customSelectTrigger = { flex: 2, padding: '8px 12px', background: 'white', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', minHeight: '35px' };
const dropdownContainer = { position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #cbd5e1', borderRadius: '4px', marginTop: '4px', zIndex: 1000, boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' };
const optionsList = { maxHeight: '180px', overflowY: 'auto' };
const optionItem = { padding: '8px 12px', fontSize: '11px', cursor: 'pointer', borderBottom: '1px solid #f8fafc' };
const historiqueBoxStyle = {
    marginBottom: '20px',
    padding: '12px',
    background: '#ffffff',
    border: '1px dashed #cbd5e1',
    borderRadius: '6px'
};
export default VentilationBrouillard;