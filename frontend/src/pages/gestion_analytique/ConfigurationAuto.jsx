import React, { useState, useEffect, useCallback } from 'react';
import { 
    Settings2, Save, ArrowLeft, Loader2, CheckCircle2, AlertCircle, Percent, Search, GitBranch, Building2, Banknote, X, Trash2, ListFilter, Edit3, MessageSquare
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../../components/Sidebar';
import API, { socket } from '../../services/api';

const ConfigurationAuto = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [accounts, setAccounts] = useState([]);
    const [subdivisions, setSubdivisions] = useState([]); 
    const [filteredAccounts, setFilteredAccounts] = useState([]);
    const [existingRules, setExistingRules] = useState([]); 
    
    // --- ÉTATS DE SAISIE ---
    const [selectedAccount, setSelectedAccount] = useState(null);
    const [accountSearch, setAccountSearch] = useState('');
    const [showAccountList, setShowAccountList] = useState(false);
    const [modeSaisie, setModeSaisie] = useState('AUTO'); 
    const [montantGlobal, setMontantGlobal] = useState(0); 
    const [description, setDescription] = useState(''); // 🚀 NOUVEAU : État pour la description
    const [repartitionGrille, setRepartitionGrille] = useState({}); 
    const [editingRuleId, setEditingRuleId] = useState(null); 
    const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

    // --- CHARGEMENT DES DONNÉES ---
    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [resAcc, resPlan, resRules] = await Promise.all([
                API.get('/plan-comptable/liste'),
                API.get('/analytique/plan/liste'),
                API.get('/analytique/repartitions/liste'),
            ]);
            
            const allAcc = resAcc.data.data || [];
            setAccounts(allAcc.filter(acc => acc.numero_compte.toString().startsWith('6') || acc.numero_compte.toString().startsWith('7')));
            setSubdivisions(resPlan.data.data || []);
            setExistingRules(resRules.data.data || []); 
        } catch (err) {
            console.error("Erreur chargement données:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
        if (socket) {
            socket.on('REFRESH_UI', (data) => {
                if (data.url.includes('/analytique/repartitions')) fetchData();
            });
        }
        return () => { if (socket) socket.off('REFRESH_UI'); };
    }, [fetchData]);

    const showToast = (message, type = 'success') => {
        setToast({ show: true, message, type });
        setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
    };

    // --- LOGIQUE DE RECHERCHE COMPTE ---
    const handleAccountSearch = (val) => {
        setAccountSearch(val);
        if (val.trim() === '') {
            setShowAccountList(false);
            return;
        }
        const filtered = accounts.filter(acc => 
            acc.numero_compte.toString().includes(val) || 
            acc.intitule.toLowerCase().includes(val.toLowerCase())
        );
        setFilteredAccounts(filtered);
        setShowAccountList(filtered.length > 0);
    };

    const selectAccount = (acc) => {
        setSelectedAccount(acc);
        setAccountSearch(`${acc.numero_compte} - ${acc.intitule}`);
        setShowAccountList(false);
    };

    const handleValueChange = (id, val) => {
        const value = parseFloat(val) || 0;
        setRepartitionGrille(prev => ({ ...prev, [id]: value }));
    };

    const calculateTotal = () => {
        return Object.values(repartitionGrille).reduce((sum, val) => sum + val, 0);
    };

    // --- ENREGISTREMENT ---
    const handleSave = async () => {
        if (!selectedAccount) return showToast("Sélectionnez un compte général", "error");
        
        const totalVentile = calculateTotal();
        
        if (modeSaisie === 'AUTO' && Math.abs(totalVentile - 100) > 0.01) {
            return showToast(`Le modèle (%) doit totaliser 100% (Actuel: ${totalVentile}%)`, "error");
        }

        if (modeSaisie === 'MANUEL') {
            if (montantGlobal <= 0) return showToast("Définissez le montant du modèle", "error");
            if (Math.abs(totalVentile - montantGlobal) > 0.01) {
                return showToast(`La ventilation (${totalVentile}) doit égaler la base (${montantGlobal})`, "error");
            }
        }

        setIsSubmitting(true);
        try {
            const payload = {
                compte_general_id: selectedAccount.numero_compte,
                mode_saisie: modeSaisie,
                montant_base: modeSaisie === 'MANUEL' ? montantGlobal : null,
                description: description, // 🚀 ENVOI DE LA DESCRIPTION AU BACKEND
                repartitions: repartitionGrille 
            };

            const url = editingRuleId 
                ? `/analytique/repartitions/modifier/${editingRuleId}` 
                : '/analytique/repartitions/creer';
            
            const res = await (editingRuleId ? API.put(url, payload) : API.post(url, payload));

            if (res.data.success) {
                showToast(editingRuleId ? "Modèle mis à jour !" : "Modèle enregistré !", "success");
                resetForm();
                fetchData(); 
            }
        } catch (err) {
            showToast(err.response?.data?.error || "Erreur d'enregistrement", "error");
        } finally {
            setIsSubmitting(false);
        }
    };

    const resetForm = () => {
        setRepartitionGrille({});
        setMontantGlobal(0);
        setDescription(''); // 🚀 Reset description
        setSelectedAccount(null);
        setAccountSearch('');
        setEditingRuleId(null);
    };

    const loadForEdit = (rule) => {
        setEditingRuleId(rule.id);
        setModeSaisie(rule.mode_saisie);
        setMontantGlobal(rule.montant_base || 0);
        setDescription(rule.description || ''); // 🚀 Chargement description pour édit
        setAccountSearch(`${rule.compte_general_id} - ${rule.compte_intitule}`);
        setSelectedAccount({ numero_compte: rule.compte_general_id });
        setRepartitionGrille(rule.repartitions || {});
        showToast("Édition du modèle activée", "info");
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Supprimer ce modèle ?")) return;
        try {
            await API.delete(`/analytique/repartitions/supprimer/${id}`);
            showToast("Modèle supprimé");
            fetchData();
        } catch (err) { showToast("Erreur suppression", "error"); }
    };

    const totalCalculé = calculateTotal();

    return (
        <div style={layoutStyle}>
            <Sidebar />
            <div style={mainWrapper}>
                {toast.show && (
                    <div style={{...toastStyle, background: toast.type === 'error' ? '#fee2e2' : '#f0fdf4', border: `2px solid ${toast.type === 'error' ? '#ef4444' : '#22c55e'}`}}>
                        {toast.type === 'error' ? <AlertCircle size={18} color="#ef4444" /> : <CheckCircle2 size={18} color="#22c55e" />}
                        <span style={{fontWeight: '800', fontSize: '14px'}}>{toast.message}</span>
                    </div>
                )}

                <header style={headerStyle}>
                    <div style={{display:'flex', alignItems:'center', gap:'15px'}}>
                        <button onClick={() => navigate(-1)} style={btnBackStyle}><ArrowLeft size={20}/></button>
                        <div>
                            <h1 style={titleStyle}>CONFIGURATEUR ANALYTIQUE AUTOMATIQUE</h1>
                            <p style={subtitleStyle}>Créez vos modèles de répartition pré-enregistrés</p>
                        </div>
                    </div>
                    <div style={{display:'flex', gap:'10px'}}>
                        {editingRuleId && <button onClick={resetForm} style={{...btnPrimary, background:'#64748b'}}>ANNULER</button>}
                        <button onClick={handleSave} style={btnPrimary} disabled={isSubmitting}>
                            {isSubmitting ? <Loader2 className="animate-spin" size={18}/> : <Save size={18}/>} 
                            {editingRuleId ? "MODIFIER LE MODÈLE" : "ENREGISTRER LE MODÈLE"}
                        </button>
                    </div>
                </header>

                <main style={mainContent}>
                    <div style={topArea}>
                        <div style={inputRow}>
                            {/* SECTION 1 : COMPTE */}
                            <section style={{...sectionCard, flex: 1.5, position: 'relative', overflow: 'visible'}}>
                                <div style={sectionHeader}><Search size={16} color="#2563eb" /><h2 style={sectionTitle}>1. COMPTE À PARAMÉTRER</h2></div>
                                <div style={{position: 'relative', marginTop: '5px'}}>
                                    <input style={inputSearch} placeholder="Rechercher le compte..." value={accountSearch} onChange={(e) => handleAccountSearch(e.target.value)} onFocus={() => accountSearch.length > 0 && setShowAccountList(true)} onBlur={() => setTimeout(() => setShowAccountList(false), 250)} />
                                    {showAccountList && filteredAccounts.length > 0 && (
                                        <div style={suggestionBox}>
                                            {filteredAccounts.map(acc => (
                                                <div key={acc.id} style={suggestionItem} onMouseDown={() => selectAccount(acc)}>
                                                    <b>{acc.numero_compte}</b> - {acc.intitule}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                {/* 🚀 AJOUT DU CHAMP DESCRIPTION ICI */}
                                <div style={{marginTop: '15px'}}>
                                    <label style={{fontSize: '9px', fontWeight: '900', color: '#64748b', marginBottom: '4px', display: 'block'}}>NOTE / DESCRIPTION DU MODÈLE</label>
                                    <input 
                                        style={inputSearch} 
                                        placeholder="Ex: Ventilation frais communs..." 
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                    />
                                </div>
                            </section>

                            {/* SECTION 2 : TYPE ET MONTANT */}
                            <section style={{...sectionCard, flex: 1}}>
                                <div style={sectionHeader}><Settings2 size={16} color="#2563eb" /><h2 style={sectionTitle}>2. TYPE DE MODÈLE</h2></div>
                                <div style={toggleContainer}>
                                    <button onClick={() => setModeSaisie('AUTO')} style={modeSaisie === 'AUTO' ? btnToggleActive : btnToggle}>POURCENTAGE (%)</button>
                                    <button onClick={() => setModeSaisie('MANUEL')} style={modeSaisie === 'MANUEL' ? btnToggleActive : btnToggle}>MONTANT FIXE</button>
                                </div>
                                {modeSaisie === 'MANUEL' && (
                                    <div style={{marginTop: '15px'}}>
                                        <label style={{fontSize: '9px', fontWeight: '900', color: '#64748b', marginBottom: '4px', display: 'block'}}>MONTANT GLOBAL DU MODÈLE</label>
                                        <input type="number" style={inputSearch} value={montantGlobal} onChange={(e) => setMontantGlobal(parseFloat(e.target.value) || 0)} />
                                    </div>
                                )}
                            </section>
                        </div>

                        {/* SECTION 3 : GRILLE */}
                        <section style={{...sectionCard, flex: 1.5, minHeight: '0'}}>
                            <div style={sectionHeader}>
                                <Building2 size={16} color="#2563eb" />
                                <h2 style={sectionTitle}>3. GRILLE DE RÉPARTITION</h2>
                                <div style={{marginLeft: 'auto'}}><span style={{...totalBadge, background: (totalCalculé > 0 ? '#22c55e' : '#64748b')}}>{totalCalculé.toLocaleString()} {modeSaisie === 'AUTO' ? '%' : ''}</span></div>
                            </div>
                            <div style={scrollContainer}>
                                <div style={gridContainer}>
                                    {subdivisions.map(sub => (
                                        <div key={sub.id} style={repartitionRow}>
                                            <div style={planInfo}><span style={planLibelle}>{sub.libelle}</span><span style={planParent}><GitBranch size={10} /> {sub.parent_dept_nom}</span></div>
                                            <div style={inputContainer}><input type="number" style={inputTaux} value={repartitionGrille[sub.id] || ''} onChange={(e) => handleValueChange(sub.id, e.target.value)} /><span style={percentSymbol}>{modeSaisie === 'AUTO' ? '%' : ''}</span></div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </section>
                    </div>

                    {/* SECTION 4 : HISTORIQUE */}
                    <section style={{...sectionCard, flex: 1, minHeight: '0'}}>
                        <div style={sectionHeader}><ListFilter size={16} color="#2563eb" /><h2 style={sectionTitle}>4. HISTORIQUE DES MODÈLES</h2></div>
                        <div style={tableWrapper}>
                            <table style={tableStyle}>
                                <thead style={theadStyle}>
                                    <tr>
                                        <th style={thStyle}>Compte Général / Note</th>
                                        <th style={thStyle}>Type</th>
                                        <th style={thStyle}>Statut</th>
                                        <th style={{...thStyle, textAlign: 'center'}}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {existingRules.map(rule => (
                                        <tr key={rule.id} style={trRow}>
                                            <td style={tdStyle}>
                                                <div style={{fontWeight: 'bold'}}>{rule.compte_general_id} - {rule.compte_intitule}</div>
                                                {/* 🚀 AFFICHAGE DE LA DESCRIPTION DANS LE TABLEAU */}
                                                {rule.description && <div style={{fontSize: '10px', color: '#2563eb', fontStyle: 'italic'}}>📝 {rule.description}</div>}
                                            </td>
                                            <td style={tdStyle}><span style={badgeStyle}>{rule.mode_saisie}</span></td>
                                            <td style={tdStyle}>{Object.keys(rule.repartitions || {}).length} centres affectés</td>
                                            <td style={{...tdStyle, textAlign: 'center'}}>
                                                <div style={{display:'flex', gap:'15px', justifyContent:'center'}}>
                                                    <Edit3 size={16} color="#2563eb" style={{cursor:'pointer'}} onClick={() => loadForEdit(rule)} />
                                                    <Trash2 size={16} color="#ef4444" style={{cursor:'pointer'}} onClick={() => handleDelete(rule.id)} />
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </main>
            </div>
        </div>
    );
};

// --- STYLES (Conservés et ajustés) ---
const layoutStyle = { display: 'flex', height: '100vh', background: '#f8fafc', overflow: 'hidden' };
const mainWrapper = { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' };
const headerStyle = { background: '#fff', padding: '10px 40px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
const mainContent = { padding: '20px 40px', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px', overflow: 'hidden' };
const topArea = { display: 'flex', flexDirection: 'column', height: '60%', gap: '15px', minHeight: '0' };
const inputRow = { display: 'flex', gap: '15px' };
const sectionCard = { background: '#fff', borderRadius: '12px', padding: '15px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' };
const sectionHeader = { display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px', marginBottom: '10px' };
const sectionTitle = { fontSize: '10px', fontWeight: '900', color: '#1e293b', margin: 0, textTransform: 'uppercase' };
const scrollContainer = { flex: 1, overflowY: 'auto' };
const gridContainer = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' };
const repartitionRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' };
const suggestionBox = { position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', zIndex: 9999, maxHeight: '200px', overflowY: 'auto', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.2)' };
const suggestionItem = { padding: '12px', fontSize: '12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' };
const tableWrapper = { flex: 1, overflowY: 'auto' };
const tableStyle = { width: '100%', borderCollapse: 'collapse' };
const theadStyle = { background: '#f8fafc', position: 'sticky', top: 0, zIndex: 10 };
const thStyle = { padding: '12px', textAlign: 'left', fontSize: '10px', fontWeight: '900', color: '#64748b', borderBottom: '2px solid #e2e8f0' };
const tdStyle = { padding: '12px', fontSize: '12px', borderBottom: '1px solid #f1f5f9' };
const inputSearch = { width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', fontWeight: '700', outline: 'none' };
const toggleContainer = { display: 'flex', gap: '8px' };
const btnToggle = { flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', fontSize: '9px', fontWeight: '800' };
const btnToggleActive = { ...btnToggle, background: '#0f172a', color: '#fff' };
const inputTaux = { width: '80px', padding: '6px', borderRadius: '6px', border: '1px solid #cbd5e1', textAlign: 'right', fontWeight: '900' };
const totalBadge = { color: '#fff', padding: '4px 10px', borderRadius: '15px', fontSize: '11px', fontWeight: '900' };
const btnBackStyle = { background: '#f1f5f9', border: 'none', padding: '8px', borderRadius: '8px', cursor: 'pointer' };
const btnPrimary = { background: '#0f172a', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: '900', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' };
const planInfo = { display: 'flex', flexDirection: 'column' };
const planLibelle = { fontSize: '11px', fontWeight: '800' };
const planParent = { fontSize: '9px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '3px' };
const inputContainer = { display: 'flex', alignItems: 'center' };
const percentSymbol = { fontWeight: '900', color: '#64748b', fontSize: '12px', marginLeft: '4px' };
const titleStyle = { margin: 0, fontSize: '18px', fontWeight: '900', color: '#0f172a' };
const subtitleStyle = { margin: 0, fontSize: '12px', color: '#64748b', fontWeight: '700' };
const badgeStyle = { padding: '2px 8px', borderRadius: '4px', background: '#eff6ff', color: '#1e40af', fontSize: '10px', fontWeight: 'bold' };
const trRow = { transition: '0.2s' };
const toastStyle = { position: 'fixed', top: '20px', right: '20px', padding: '15px', borderRadius: '10px', zIndex: 1000, display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' };

export default ConfigurationAuto;