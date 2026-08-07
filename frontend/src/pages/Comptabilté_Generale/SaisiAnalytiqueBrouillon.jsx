import React, { useState, useEffect, useCallback } from 'react';
import { Save, X, Plus, Trash2, AlertCircle, CheckCircle2, Grid, Search } from 'lucide-react';
import API, { socket } from '../../services/api'; 

const SaisiAnalytiqueBrouillon = ({ compte_id, id_technique, montant_journal, onSave, onClose, ligne_id }) => {
    const [loading, setLoading] = useState(false);
    const [plansDisponibles, setPlansDisponibles] = useState([]);
    const [repartitions, setRepartitions] = useState([]); 
    const [filtrePlan, setFiltrePlan] = useState("");
    const [messageAuto, setMessageAuto] = useState(null);

    // --- 1. CHARGEMENT DU PLAN ANALYTIQUE (ENDPOINT BROUILLON) ---
    const fetchPlans = useCallback(async () => {
        try {
            setLoading(true);
            const res = await API.get('/analytique/saisie-brouillon/plan'); 
            if (res.data && res.data.success) {
                setPlansDisponibles(res.data.data || []);
            }
        } catch (err) { 
            console.error("Erreur chargement plans:", err); 
        } finally {
            setLoading(false);
        }
    }, []);

    // --- 2. DÉTECTION DU MODÈLE OU RÉCUPÉRATION DU BROUILLON EXISTANT ---
    const detecterConfigAuto = useCallback(async () => {
        const targetId = id_technique || compte_id;
        if (!targetId) return;

        try {
            // Appelle le check spécial brouillon
            const res = await API.get(`/analytique/saisie-brouillon/check/${targetId}`, {
                params: { ligne_id: ligne_id } 
            });
            
            const { data, isUpdate } = res.data;

            if (data) {
                const isModeAuto = data.mode_saisie === 'AUTO' && !isUpdate;
                const lignes = [];

                // On gère les deux clés possibles renvoyées par le controller (repartitions ou repartitions_existantes)
                const sourceRepart = data.repartitions || data.repartitions_existantes;

                if (sourceRepart) {
                    for (const [planId, info] of Object.entries(sourceRepart)) {
                        lignes.push({
                            plan_analytique_id: planId,
                            libelle: data.details_plans?.[planId]?.libelle || "Section",
                            departement_id: data.details_plans?.[planId]?.dept_id || 'DEPT-INCONNU',
                            montant: isModeAuto 
                                ? ((parseFloat(montant_journal) * parseFloat(info.pourcentage || info)) / 100).toFixed(2) 
                                : parseFloat(info.montant_fixe || info || 0).toFixed(2)
                        });
                    }
                    setRepartitions(lignes);
                    
                    if (isUpdate) {
                        setMessageAuto("Ancienne ventilation brouillon récupérée");
                    } else {
                        setMessageAuto(isModeAuto ? "Modèle (%) appliqué au brouillon" : "Modèle fixe chargé");
                    }
                }
            }
        } catch (err) {
            console.log("Saisie manuelle brouillon : aucune configuration trouvée.");
        }
    }, [compte_id, id_technique, montant_journal, ligne_id]);

// ✅ 1. INITIALISATION ET SOCKET
    useEffect(() => {
        let isMounted = true;

        const loadAnalytique = async () => {
            setLoading(true);
            try {
                // On charge le plan et la config en parallèle pour gagner du temps
                await Promise.all([fetchPlans(), detecterConfigAuto()]);
            } catch (err) {
                console.error("Échec du chargement analytique:", err);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        loadAnalytique();

        // 📡 CONFIGURATION TEMPS RÉEL (Socket)
        if (socket) {
            const handleRefresh = () => {
                console.log("🔄 Rafraîchissement analytique via Socket...");
                fetchPlans();
            };

            // Écoute les modifications de structure (Plan ou Départements)
            socket.on('DATA_EVENT', (event) => {
                if (['plan_analytique', 'departements'].includes(event.table)) {
                    handleRefresh();
                }
            });

            return () => {
                isMounted = false;
                socket.off('DATA_EVENT', handleRefresh);
            };
        }

        return () => { isMounted = false; };
    }, [fetchPlans, detecterConfigAuto]); // 🎯 Dépendances stabilisées par useCallback
    // --- 3. CALCULS D'ÉQUILIBRE ---
    const totalImpute = repartitions.reduce((sum, r) => sum + parseFloat(r.montant || 0), 0);
    const resteAImputer = parseFloat(montant_journal) - totalImpute;
    const estEquilibre = Math.abs(resteAImputer) < 0.01;

    // --- 4. ACTIONS ---
    const ajouterLigne = (plan) => {
        if (repartitions.find(r => r.plan_analytique_id === plan.id)) return;
        setRepartitions([...repartitions, { 
            plan_analytique_id: plan.id, 
            libelle: plan.libelle,
            departement_id: plan.departement_id,
            montant: Math.max(0, resteAImputer).toFixed(2) 
        }]);
    };

   // --- DANS SaisiAnalytiqueBrouillon.jsx ---
const handleSave = () => {
    if (!estEquilibre) return;
    onSave({
        ligne_id: ligne_id,
        repartitions: repartitions.map(r => ({
            plan_analytique_id: r.plan_analytique_id,
            departement_id: r.departement_id,
            montant: r.montant
        }))
    });
};
    return (
        <div style={modalOverlay}>
            <div style={windowContainer}>
                <header style={titleBar}>
                    <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
                        <Grid size={14} />
                        <span style={{fontWeight:700, textTransform: 'uppercase'}}>
                            BROUILLON ANALYTIQUE : {compte_id}
                        </span>
                    </div>
                    <div style={{fontSize:'10px', color:'#94a3b8'}}>MODE PROVISOIRE</div>
                    <X size={18} style={{cursor:'pointer'}} onClick={onClose} />
                </header>

                <div style={toolBar}>
                    <div style={infoGrid}>
                        <div style={infoCell}>
                            <label style={infoLabel}>MONTANT BROUILLON</label>
                            <div style={valNum}>{parseFloat(montant_journal).toLocaleString(undefined, {minimumFractionDigits:2})}</div>
                        </div>
                        <div style={infoCell}>
                            <label style={infoLabel}>TOTAL VENTILÉ</label>
                            <div style={{...valNum, color:'#2563eb'}}>{totalImpute.toLocaleString(undefined, {minimumFractionDigits:2})}</div>
                        </div>
                        <div style={{...infoCell, border:0, background: estEquilibre ? '#f0fdf4' : '#fff1f2'}}>
                            <label style={infoLabel}>ÉCART (SOLDE)</label>
                            <div style={{...valNum, color: estEquilibre ? '#10b981' : '#ef4444'}}>
                                {resteAImputer.toFixed(2)}
                            </div>
                        </div>
                    </div>
                    {messageAuto && <div style={badgeAuto}>{messageAuto}</div>}
                </div>

                <div style={mainContent}>
                    <aside style={leftPane}>
                        <div style={paneHeader}>SECTIONS DISPONIBLES</div>
                        <div style={searchBox}>
                            <div style={{display:'flex', alignItems:'center', border:'1px solid #cbd5e1', borderRadius:'4px', padding:'0 8px'}}>
                                <Search size={14} color="#64748b" />
                                <input 
                                    style={{...searchInp, border:'none'}} 
                                    placeholder="Filtrer le plan..." 
                                    onChange={e => setFiltrePlan(e.target.value)} 
                                />
                            </div>
                        </div>
                        <div style={listArea}>
                            {plansDisponibles
                                .filter(p => p.libelle.toLowerCase().includes(filtrePlan.toLowerCase()) || p.code.includes(filtrePlan))
                                .map(p => (
                                <div key={p.id} style={planItem} onClick={() => ajouterLigne(p)}>
                                    <div>
                                        <div style={{fontSize:'10px', color:'#64748b'}}>{p.code}</div>
                                        <div style={{fontWeight:600}}>{p.libelle}</div>
                                    </div>
                                    <Plus size={14} color="#2563eb" />
                                </div>
                            ))}
                        </div>
                    </aside>

                    <section style={rightPane}>
                        <div style={paneHeader}>RÉPARTITION BROUILLON</div>
                        <div style={{flex:1, overflowY:'auto'}}>
                            <table style={saisieTable}>
                                <thead>
                                    <tr style={thRow}>
                                        <th style={thCol}>SECTION / AXE</th>
                                        <th style={{...thCol, textAlign:'right', width:'150px'}}>MONTANT</th>
                                        <th style={{...thCol, width:40}}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {repartitions.map((line, idx) => (
                                        <tr key={idx} style={trRow}>
                                            <td style={tdCol}>
                                                <div style={{fontWeight:700, color:'#1e293b'}}>{line.libelle}</div>
                                                <div style={{fontSize:'10px', color:'#64748b'}}>{line.departement_id}</div>
                                            </td>
                                            <td style={tdCol}>
                                                <input 
                                                    type="number" 
                                                    style={valInput} 
                                                    value={line.montant} 
                                                    step="0.01"
                                                    onChange={e => {
                                                        const copy = [...repartitions];
                                                        copy[idx].montant = e.target.value;
                                                        setRepartitions(copy);
                                                    }}
                                                />
                                            </td>
                                            <td style={tdCol}>
                                                <Trash2 size={14} color="#ef4444" cursor="pointer" onClick={() => setRepartitions(repartitions.filter((_, i) => i !== idx))} />
                                            </td>
                                        </tr>
                                    ))}
                                    {repartitions.length === 0 && (
                                        <tr>
                                            <td colSpan="3" style={{padding:'40px', textAlign:'center', color:'#94a3b8', fontSize:'12px'}}>
                                                Aucune ventilation saisie pour ce brouillon.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </div>

                <footer style={erpFooter}>
                    {!estEquilibre ? (
                        <div style={errorMsg}>
                            <AlertCircle size={16}/> 
                            <span>ÉCART DE {resteAImputer.toFixed(2)} F À RÉPARTIR</span>
                        </div>
                    ) : (
                        <div style={{...errorMsg, color:'#059669'}}>
                            <CheckCircle2 size={16}/> 
                            <span>VENTILATION ÉQUILIBRÉE</span>
                        </div>
                    )}
                    
                    <div style={{display:'flex', gap:10, marginLeft:'auto'}}>
                        <button style={btnAnnuler} onClick={onClose}>ABANDONNER</button>
                        <button 
                            style={{
                                ...btnEnregistrer, 
                                opacity: estEquilibre ? 1 : 0.4,
                                cursor: estEquilibre ? 'pointer' : 'not-allowed'
                            }} 
                            disabled={!estEquilibre || loading} 
                            onClick={handleSave}
                        >
                            {loading ? "TRAITEMENT..." : "ENREGISTRER BROUILLON"}
                        </button>
                    </div>
                </footer>
            </div>
        </div>
    );
};

// --- STYLES (Identiques à la version réelle pour garder l'aspect ERP) ---
const modalOverlay = { position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(4px)' };
const windowContainer = { background: '#fff', width: '1000px', height: '650px', border: '2px solid #1e293b', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', borderRadius:'4px' };
const titleBar = { background: '#1e293b', color: 'white', padding: '10px 15px', display: 'flex', justifyContent: 'space-between', fontSize: '12px', alignItems:'center' };
const toolBar = { padding: '15px 20px', background: '#f8fafc', borderBottom: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
const infoGrid = { display: 'flex', border: '1px solid #cbd5e1', borderRadius: '4px', overflow: 'hidden', background:'#fff' };
const infoCell = { padding: '8px 25px', borderRight: '1px solid #cbd5e1', textAlign: 'center' };
const infoLabel = { fontSize: '9px', fontWeight: 800, color: '#64748b', display: 'block', marginBottom:'2px' };
const valNum = { fontWeight: 900, fontSize: '16px', fontFamily:'monospace' };
const badgeAuto = { background: '#dcfce7', color: '#166534', padding: '5px 15px', borderRadius: '4px', fontSize: '11px', fontWeight: 800, border: '1px solid #bbf7d0' };
const mainContent = { flex: 1, display: 'flex', overflow: 'hidden' };
const leftPane = { width: '350px', borderRight: '1px solid #cbd5e1', display: 'flex', flexDirection: 'column', background: '#f8fafc' };
const rightPane = { flex: 1, display: 'flex', flexDirection: 'column', background:'#fff' };
const paneHeader = { background: '#475569', color: '#fff', padding: '8px 12px', fontSize: '11px', fontWeight: 800, letterSpacing:'0.5px' };
const searchBox = { padding: '12px', borderBottom: '1px solid #cbd5e1', background:'#fff' };
const searchInp = { width: '100%', padding: '8px 12px', fontSize: '13px', outline:'none' };
const listArea = { flex: 1, overflowY: 'auto' };
const planItem = { padding: '12px 15px', borderBottom: '1px solid #e2e8f0', cursor: 'pointer', fontSize: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff' };
const saisieTable = { width: '100%', borderCollapse: 'collapse' };
const thRow = { background: '#f1f5f9', borderBottom: '2px solid #cbd5e1' };
const thCol = { padding: '12px', fontSize: '11px', fontWeight: 800, color: '#475569', textAlign: 'left' };
const tdCol = { padding: '12px', borderBottom: '1px solid #f1f5f9' };
const trRow = { verticalAlign: 'middle' };
const valInput = { width: '100%', textAlign: 'right', border: '2px solid #3b82f6', padding: '8px', fontWeight: 900, color: '#1d4ed8', borderRadius: '4px', fontSize:'14px', outline:'none' };
const erpFooter = { padding: '20px', background: '#f8fafc', borderTop: '2px solid #cbd5e1', display: 'flex', alignItems: 'center' };
const btnEnregistrer = { background: '#059669', color: '#fff', border: 'none', padding: '12px 30px', fontWeight: 800, fontSize: '13px', borderRadius: '4px' };
const btnAnnuler = { background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', padding: '12px 20px', fontWeight: 800, fontSize: '13px', borderRadius: '4px', cursor:'pointer' };
const errorMsg = { color: '#dc2626', fontSize: '13px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 };

export default SaisiAnalytiqueBrouillon;