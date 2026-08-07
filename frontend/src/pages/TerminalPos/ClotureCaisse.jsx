import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { 
    Save, Loader2, CheckCircle, AlertTriangle, Landmark, Plus, Trash2, ShoppingBag, X, AlertCircle 
} from 'lucide-react';
import API from '../../services/api'; 
import Sidebar from '../../components/Sidebar';

const ClotureCaisse = () => {
    // --- ÉTATS ---
    const [summary, setSummary] = useState({ total: 0, count: 0 });
    const [moyensPaiementGroupes, setMoyensPaiementGroupes] = useState([]);
    
    const [selectedMode, setSelectedMode] = useState(null); 
    const [reelSaisi, setReelSaisi] = useState(""); 
    const [observations, setObservations] = useState("");
    const [panier, setPanier] = useState([]);

    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [alertMsg, setAlertMsg] = useState({ text: '', type: '' });
    
    const [showConfirmUI, setShowConfirmUI] = useState(false);

    const currentUser = useMemo(() => {
        try {
            return JSON.parse(localStorage.getItem('user') || '{}');
        } catch (e) { return {}; }
    }, []);

    const COMPANY_ID = currentUser.company_id || 'CPY-1';

    const showToast = useCallback((text, type = 'success') => {
        setAlertMsg({ text, type });
        setTimeout(() => setAlertMsg({ text: '', type: '' }), 3000);
    }, []);

    // --- CORRECTION DE LA RÉCUPÉRATION DES DONNÉES ---
  // --- CORRECTION DE LA RÉCUPÉRATION DES DONNÉES ---
 const fetchTodaysSales = useCallback(async () => {
        if (!currentUser.id) return;
        setIsLoading(true);
        try {
            const res = await API.get(`/sales/cloture-data?company_id=${COMPANY_ID}&user_id=${currentUser.id}`);
            const data = res.data?.success ? res.data.data : (Array.isArray(res.data) ? res.data : []);

            const groups = data.reduce((acc, v) => {
                const id = v.payment_method_id;
                const label = v.mode_paiement || 'Inconnu';
                const mt = Number(v.montant_total || 0);

                if (!acc[id]) {
                    acc[id] = { 
                        payment_method_id: id, 
                        mode: label, 
                        theorique: 0 
                    };
                }
                acc[id].theorique += mt;
                return acc;
            }, {});

            const listeMoyens = Object.values(groups);
            setMoyensPaiementGroupes(listeMoyens);

            setSummary({
                total: listeMoyens.reduce((sum, m) => sum + m.theorique, 0),
                count: data.length
            });

        } catch (err) {
            showToast("Erreur de chargement", "error");
        } finally { setIsLoading(false); }
    }, [COMPANY_ID, currentUser.id, showToast]);



    useEffect(() => { fetchTodaysSales(); }, [fetchTodaysSales]);

    const currentEcart = useMemo(() => {
        const reel = parseFloat(reelSaisi) || 0;
        return reel - (selectedMode?.theorique || 0);
    }, [reelSaisi, selectedMode]);

    const ajouterAuPanier = () => {
        if (!selectedMode) return showToast("Sélectionnez un mode", "error");
        
        if (currentEcart !== 0 && !observations.trim()) {
            return showToast("Justification obligatoire pour l'écart", "error");
        }

        const item = {
            payment_method_id: selectedMode.payment_method_id,
            mode: selectedMode.mode,
            montant_theorique: selectedMode.theorique,
            montant_reel: parseFloat(reelSaisi) || 0,
            ecart: currentEcart,
            justification: observations 
        };

        setPanier(prev => [...prev, item]);
        setMoyensPaiementGroupes(prev => prev.filter(m => m.payment_method_id !== selectedMode.payment_method_id));
        
        setSelectedMode(null);
        setReelSaisi("");
        setObservations("");
    };

    const retirerDuPanier = (item, index) => {
        setPanier(prev => prev.filter((_, i) => i !== index));
        setMoyensPaiementGroupes(prev => [...prev, { 
            mode: item.mode, 
            payment_method_id: item.payment_method_id,
            theorique: item.montant_theorique 
        }]);
    };

    const executerCloture = async () => {
        if (panier.length === 0) {
            showToast("Le panier est vide, veuillez ajouter un comptage.", "error");
            return;
        }

        setIsSaving(true);
        setShowConfirmUI(false);

        try {
            const totalReel = panier.reduce((sum, i) => sum + Number(i.montant_reel), 0);
            const totalTheo = panier.reduce((sum, i) => sum + Number(i.montant_theorique), 0);

            const payload = {
                id: `CLOT-${Date.now().toString().slice(-6)}`,
                total_theorique_global: totalTheo,
                total_reel_global: totalReel,
                observation: observations || "Clôture de session journalière",
                created_by: currentUser.id,
                company_id: COMPANY_ID, 
                
                details: panier.map(item => ({
                    payment_method_id: item.payment_method_id,
                    mode: item.mode, 
                    montant_theorique: item.montant_theorique,
                    montant_reel: item.montant_reel,
                    commentaire_detaille: item.justification || null
                })),

                explications: panier
                    .filter(item => item.ecart !== 0)
                    .map(item => ({
                        payment_method_id: item.payment_method_id,
                        methode_nom: item.mode,
                        montant: item.ecart,
                        categorie: item.ecart < 0 ? "MANQUANT" : "SURPLUS",
                        commentaire: item.justification
                    }))
            };

            const res = await API.post('/pos/clotures', payload);
            
            if (res.data.success) {
                showToast("Caisse clôturée et paiements verrouillés !");
                setPanier([]);
                setObservations(""); 
                fetchTodaysSales(); 
            }
        } catch (err) {
            console.error("Erreur Clôture:", err);
            showToast(err.response?.data?.error || "Erreur lors de l'enregistrement", "error");
        } finally { 
            setIsSaving(false); 
        }
    };

     const totalPanier = panier.reduce((sum, i) => sum + Number(i.montant_reel), 0);
  
  // Calcul rapide pour savoir si la session contient des remboursements (pour l'affichage d'un message d'aide)
  const aDesRemboursements = moyensPaiementGroupes.some(m => m.theorique < 0) || panier.some(p => p.montant_theorique < 0);

  return (
    <div style={layoutStyle}>
        {/* SYSTÈME DE TOAST */}
        {alertMsg.text && (
            <div style={{ ...toastStyle, background: alertMsg.type === 'error' ? '#EF4444' : '#10B981' }}>
                {alertMsg.type === 'error' ? <AlertCircle size={18}/> : <CheckCircle size={18}/>}
                {alertMsg.text}
            </div>
        )}

        <Sidebar />
        <main style={mainStyle}>
            
            {/* 1. LISTE DES ATTENDUS */}
            <section style={colZone}>
                <div style={cardHeader}>1. MODES UTILISÉS AUJOURD'HUI</div>
                <div style={listContainer}>
                    {isLoading ? (
                        <div style={{padding: '20px', textAlign: 'center'}}><Loader2 className="animate-spin" /></div>
                    ) : (
                        <>
                            <table style={fullTable}>
                                <thead>
                                    <tr>
                                        <th style={thMain}>MODE</th>
                                        <th style={{...thMain, textAlign: 'right'}}>THÉORIQUE (NET)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {moyensPaiementGroupes.length === 0 && panier.length === 0 && (
                                        <tr><td colSpan="2" style={{padding: '20px', textAlign: 'center', fontSize: '12px', color: '#94a3b8'}}>Aucune vente enregistrée.</td></tr>
                                    )}
                                    {moyensPaiementGroupes.map((m) => (
                                        <tr key={m.payment_method_id} 
                                            style={{
                                                cursor: 'pointer', 
                                                background: selectedMode?.payment_method_id === m.payment_method_id ? '#F1F5F9' : 'transparent'
                                            }}
                                            onClick={() => { 
                                                // ✅ FIX STRICT : On injecte le montant théorique ajusté des remboursements
                                                setSelectedMode(m); 
                                                setReelSaisi(m.theorique.toString()); 
                                            }}>
                                            <td style={tdMain}><strong>{m.mode}</strong></td>
                                            <td style={{...tdMain, textAlign: 'right', fontWeight: '600', color: m.theorique < 0 ? '#dc2626' : '#1e293b'}}>
                                                {m.theorique.toLocaleString()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            
                            {/* Message informatif contextuel si des remboursements impactent la caisse */}
                            {aDesRemboursements && (
                                <div style={{ margin: '15px', padding: '10px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', fontSize: '11px', color: '#1d4ed8', display: 'flex', gap: '6px', alignItems: 'center' }}>
                                    <AlertCircle size={14} />
                                    <span>Les montants théoriques intègrent les remboursements suite aux retours d'articles.</span>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </section>

            <div style={{ flex: 1.5, display: 'flex', flexDirection: 'column', gap: '15px' }}>
                
                {/* 2. COMPTAGE PHYSIQUE */}
                <section style={colZone}>
                    <div style={{...cardHeader, background: '#1e293b'}}>2. COMPTAGE PHYSIQUE</div>
                    <div style={{ padding: '20px' }}>
                        <label style={labelStyle}>RÉEL POUR : <span style={{color: '#3b82f6', fontWeight: 'bold'}}>{selectedMode ? selectedMode.mode : '---'}</span></label>
                        <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                            <input 
                                type="number" 
                                disabled={!selectedMode}
                                style={{ ...inputForm, fontSize: '20px', fontWeight: 'bold' }} 
                                value={reelSaisi} 
                                onChange={e => setReelSaisi(e.target.value)} 
                                placeholder="0"
                            />
                        </div>

                        <div style={{ 
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '12px', borderRadius: '8px', marginBottom: '15px',
                            background: currentEcart === 0 ? '#f0fdf4' : '#fef2f2',
                            border: `1px solid ${currentEcart === 0 ? '#bbf7d0' : '#fecaca'}`
                        }}>
                            <div>
                                <div style={{ fontSize: '10px', color: '#64748b' }}>Attendu (Déduit des retours): {selectedMode ? selectedMode.theorique.toLocaleString() : 0}</div>
                                <div style={{ fontSize: '15px', fontWeight: 'bold', color: currentEcart < 0 ? '#dc2626' : (currentEcart > 0 ? '#16a34a' : '#1e293b') }}>
                                    DIFF : {currentEcart.toLocaleString()}
                                </div>
                            </div>
                            <button onClick={ajouterAuPanier} disabled={!selectedMode} style={btnAjouter}>
                                <Plus size={16} /> AJOUTER
                            </button>
                        </div>

                        <label style={labelStyle}>JUSTIFICATIF (OBLIGATOIRE SI ÉCART)</label>
                        <textarea 
                            style={{ ...inputForm, height: '50px', resize: 'none' }}
                            placeholder="..."
                            value={observations}
                            onChange={e => setObservations(e.target.value)}
                        />

                        <div style={panierContainer}>
                            <div style={panierHeader}><ShoppingBag size={14}/> RÉCAPITULATIF ({panier.length})</div>
                            {panier.map((item, idx) => (
                                <div key={idx} style={panierRow}>
                                    <span style={{flex: 1.5}}><strong>{item.mode}</strong></span>
                                    <span style={{flex: 1, textAlign: 'right'}}>{item.montant_reel.toLocaleString()}</span>
                                    <span style={{flex: 1, textAlign: 'right', fontWeight: 'bold', color: item.ecart < 0 ? '#dc2626' : (item.ecart > 0 ? '#16a34a' : '#64748b')}}>
                                        {item.ecart > 0 ? '+' : ''}{item.ecart.toLocaleString()}
                                    </span>
                                    <button onClick={() => retirerDuPanier(item, idx)} style={btnTrash}><Trash2 size={14} /></button>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                  {/* 3. VALIDATION FINALE SÉCURISÉE AVEC BLOCAGE STRICT CONTRE LES OUBLIS */}
                    <section style={{ ...colZone, flex: 'none' }}>
                        <div style={footerValidation}>
                            {!showConfirmUI ? (
                                <>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '15px' }}>
                                        <div>
                                            <span style={labelStyle}>TOTAL ATTENDU (NET)</span>
                                            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#64748b' }}>{summary.total.toLocaleString()}</div>
                                        </div>
                                        <div>
                                            <span style={labelStyle}>TOTAL COMPTÉ</span>
                                            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#2563eb' }}>{totalPanier.toLocaleString()}</div>
                                        </div>
                                    </div>

                                    {/* 🔒 BLOCAGE COMPTABLE ABSOLU : Désactivé si un mode de gauche n'est pas inséré dans le panier */}
                                    <button 
                                        disabled={isSaving || panier.length === 0 || moyensPaiementGroupes.length > 0} 
                                        onClick={() => setShowConfirmUI(true)} 
                                        style={{ 
                                            ...btnFinal, 
                                            background: (isSaving || panier.length === 0 || moyensPaiementGroupes.length > 0) ? '#cbd5e1' : '#0F172A',
                                            color: (isSaving || panier.length === 0 || moyensPaiementGroupes.length > 0) ? '#64748b' : '#fff',
                                            cursor: (isSaving || panier.length === 0 || moyensPaiementGroupes.length > 0) ? 'not-allowed' : 'pointer'
                                        }}
                                    >
                                        {moyensPaiementGroupes.length > 0 
                                            ? `COMPTER TOUS LES MODES (${moyensPaiementGroupes.length} RESTANT)` 
                                            : "VALIDER LA CLÔTURE"
                                        }
                                    </button>
                                </>
                            ) : (
                                <div style={confirmBox}>
                                    <div style={{display:'flex', gap:'10px', alignItems:'start'}}>
                                        <AlertTriangle color="#f59e0b" size={24} />
                                        <div>
                                            <div style={{fontWeight:'bold', fontSize:'13px'}}>Confirmer la clôture ?</div>
                                            <div style={{fontSize:'11px', color:'#16a34a'}}>Tous les flux (ventes nets et remboursements) ont été audités.</div>
                                        </div>
                                    </div>
                                    <div style={{display:'flex', gap:'10px', marginTop:'15px'}}>
                                        <button onClick={() => setShowConfirmUI(false)} style={btnCancel}>ANNULER</button>
                                        <button onClick={executerCloture} style={isSaving ? { ...btnConfirmAction, opacity: 0.7 } : btnConfirmAction}>
                                            {isSaving ? <Loader2 className="animate-spin" size={16}/> : "OUI, CLÔTURER"}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </section>
                </div>
            </main>
        </div>
    );
};



const layoutStyle = { display: 'flex', height: '100vh', background: '#F8FAFC' };
const mainStyle = { flex: 1, padding: '15px', display: 'flex', gap: '15px', overflow: 'hidden' };
const colZone = { flex: 1, background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', overflow: 'hidden' };
const cardHeader = { padding: '10px', background: '#0F172A', color: '#fff', fontSize: '11px', fontWeight: 'bold', textAlign: 'center' };
const listContainer = { flex: 1, overflowY: 'auto' };
const fullTable = { width: '100%', borderCollapse: 'collapse' };
const thMain = { padding: '10px', background: '#F8FAFC', fontSize: '10px', color: '#64748b', borderBottom: '1px solid #E2E8F0' };
const tdMain = { padding: '10px', fontSize: '12px', borderBottom: '1px solid #F1F5F9' };
const inputForm = { width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #CBD5E1', outline: 'none' };
const labelStyle = { fontSize: '10px', fontWeight: 'bold', color: '#64748b', display: 'block', marginBottom: '4px' };
const btnAjouter = { display: 'flex', alignItems: 'center', gap: '5px', padding: '8px 15px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' };
const panierContainer = { border: '1px solid #E2E8F0', borderRadius: '8px', padding: '10px', background: '#F8FAFC', marginTop: '15px' };
const panierHeader = { fontSize: '10px', fontWeight: 'bold', color: '#475569', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '5px' };
const panierRow = { display: 'flex', alignItems: 'center', gap: '10px', padding: '5px 0', borderBottom: '1px dotted #CBD5E1', fontSize: '12px' };
const btnTrash = { background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' };
const footerValidation = { padding: '15px', borderTop: '2px solid #E2E8F0', minHeight: '120px' };
const btnFinal = { width: '100%', padding: '12px', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s' };

// Toast & Confirm UI Styles
const toastStyle = { 
    position: 'fixed', top: '20px', right: '20px', padding: '12px 20px', color: '#fff', 
    borderRadius: '8px', zIndex: 1000, display: 'flex', alignItems: 'center', gap: '10px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)', fontWeight: '500', animation: 'slideIn 0.3s ease'
};
const confirmBox = { background: '#FFFBEB', border: '1px solid #FDE68A', padding: '15px', borderRadius: '8px' };
const btnCancel = { flex: 1, padding: '8px', background: '#fff', border: '1px solid #CBD5E1', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' };
const btnConfirmAction = { flex: 2, padding: '8px', background: '#0F172A', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' };

export default ClotureCaisse;