import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    Search, Plus, Loader2, RefreshCcw, BookOpen, 
    ArrowLeft, X, Trash2, Edit, Save, Check, Hash, AlertTriangle, Activity
} from 'lucide-react';

import Sidebar from '../../components/Sidebar'; 
import { getUserPermissions } from '../../utils/permissions_utils'; // 🔑 IMPORTATION DU SÉCURISEUR
import API, { socket, joinCompanyRoom } from '../../services/api';
import SetupPlanComptable from './SetupPlanComptable'; 

const PlanComptable = ({ user }) => {
    const navigate = useNavigate();

    // 🔑 EXTRACTION COMPTABLE ET SOUPLITUDE DES TYPES (true, 1, 'true', '1') POUR LES 4 BOUTONS DU PLAN
    const userPerms = useMemo(() => getUserPermissions(), []);
    
    const canCreateAccount = userPerms['compta_plan_btn_create'] === true || userPerms['compta_plan_btn_create'] === 1 || userPerms['compta_plan_btn_create'] === 'true' || userPerms['compta_plan_btn_create'] === '1';
    const canPurgePlan = userPerms['compta_plan_btn_purge'] === true || userPerms['compta_plan_btn_purge'] === 1 || userPerms['compta_plan_btn_purge'] === 'true' || userPerms['compta_plan_btn_purge'] === '1';
    const canModifyAccount = userPerms['compta_plan_btn_modify'] === true || userPerms['compta_plan_btn_modify'] === 1 || userPerms['compta_plan_btn_modify'] === 'true' || userPerms['compta_plan_btn_modify'] === '1';
    const canDeleteAccount = userPerms['compta_plan_btn_delete'] === true || userPerms['compta_plan_btn_delete'] === 1 || userPerms['compta_plan_btn_delete'] === 'true' || userPerms['compta_plan_btn_delete'] === '1';

    const [activeTab, setActiveTab] = useState('liste'); 
    const [comptes, setComptes] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    
    // --- ÉTATS DES PARAMÈTRES (Synchronisés via API & Socket) ---
    const getInitialUser = () => JSON.parse(localStorage.getItem('user')) || user;
    const [displayDigits, setDisplayDigits] = useState(getInitialUser()?.plan_precision || 8); 
    const [isAnalytique, setIsAnalytique] = useState(getInitialUser()?.gestion_analytique === 1);

    const [showAddForm, setShowAddForm] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [newCompte, setNewCompte] = useState({ numero_compte: '', intitule: '', type_compte: 'ACTIF' });

    // ✅ SYSTÈME DE TOAST AVEC ACTIONS INTÉGRÉES
    const [toast, setToast] = useState({ show: false, message: '', type: 'success', action: null });

    const showToast = (message, type = 'success', action = null) => {
        setToast({ show: true, message, type, action });
        if (!action) {
            setTimeout(() => setToast({ show: false, message: '', type: 'success', action: null }), 4000);
        }
    };

    // --- LOGIQUE DE RÉCUPÉRATION ---

    const fetchSettings = async () => {
        try {
            const res = await API.get('/company/settings'); 
            if (res.data) {
                setDisplayDigits(res.data.plan_precision || 8);
                setIsAnalytique(res.data.gestion_analytique === 1);
                
                const storedUser = JSON.parse(localStorage.getItem('user'));
                if (storedUser) {
                    storedUser.plan_precision = res.data.plan_precision;
                    storedUser.gestion_analytique = res.data.gestion_analytique;
                    localStorage.setItem('user', JSON.stringify(storedUser));
                }
            }
        } catch (err) {
            console.error("Erreur sync settings:", err);
        }
    };

    const fetchComptes = useCallback(async () => {
        setLoading(true);
        try {
            const res = await API.get(`/plan-comptable/liste?t=${Date.now()}`); 
            setComptes(res.data.success ? res.data.data : []);
        } catch (err) {
            showToast("Erreur de chargement", "error");
        } finally {
            setLoading(false);
        }
    }, []);

    // --- EFFETS ET SOCKET ---
    useEffect(() => {
        fetchComptes();
        fetchSettings(); 

        if (socket) {
            joinCompanyRoom();

            const handleRefresh = (event) => {
                console.log("🔄 Signal reçu table:", event?.table);
                if (
                    !event || 
                    event.table === 'plan_comptable' || 
                    event.table === 'companies' || 
                    event.table === 'journals'
                ) {
                    console.log("⚡ Mise à jour déclenchée !");
                    fetchComptes();
                    fetchSettings();
                }
            };

            socket.on('DATA_EVENT', handleRefresh);
            
            socket.on('REFRESH_UI', (data) => {
                if (['COMPANY', 'ACCOUNTING', 'PLAN_COMPTABLE'].includes(data?.module)) {
                    fetchComptes();
                    fetchSettings();
                }
            });

            return () => {
                socket.off('DATA_EVENT', handleRefresh);
                socket.off('REFRESH_UI');
            };
        }
    }, [fetchComptes]);

    // --- ACTIONS MÉTIER MÉTIER ---

    const handleViderPlan = () => {
        // 🔑 SÉCURITÉ DE CLIC AVANT CONFIRMATION
        if (!canPurgePlan) {
            return showToast("🛑 ACCÈS REFUSÉ : Privilège de purge complète du plan comptable manquant.", "error");
        }

        showToast(
            "Vider tout le plan comptable ?", 
            "warning", 
            async () => {
                setActionLoading(true);
                setToast({ ...toast, show: false });
                try {
                    const res = await API.delete('/plan-comptable/vider');
                    if (res.data.success) {
                        showToast("Plan comptable vidé avec succès");
                        setComptes([]);
                    }
                } catch (err) {
                    showToast("Erreur lors de la suppression", "error");
                } finally {
                    setActionLoading(false);
                }
            }
        );
    };

    const handleDeleteLine = (id) => {
        // 🔑 SÉCURITÉ DE POSTE INTERNE : Interdire l'exécution si le privilège du bouton supprimer est absent
        if (!canDeleteAccount) {
            return showToast("🛑 ACCÈS REFUSÉ : Privilège de suppression de compte manquant.", "error");
        }

        const confirmDelete = async () => {
            setToast({ show: false, message: '', type: 'success', action: null });
            try {
                const res = await API.delete(`/plan-comptable/supprimer/${id}`);
                if (res.data.success) {
                    showToast("Compte supprimé avec succès");
                    fetchComptes(); 
                }
            } catch (err) {
                showToast("Erreur lors de la suppression", "error");
            }
        };
        showToast("Supprimer ce compte ?", "warning", confirmDelete);
    };

    const updateSystemSetting = async (field, value) => {
        const targetCompanyId = getInitialUser()?.company_id || getInitialUser()?.companyId;
        if (!targetCompanyId) return;
        setActionLoading(true);
        try {
            const updatePayload = field === 'precision' ? { plan_precision: value } : { gestion_analytique: value ? 1 : 0 };
            const res = await API.patch(`/company/${targetCompanyId}/precision`, updatePayload);
            if (res.data.success) {
                if (field === 'precision') {
                    setDisplayDigits(value);
                    fetchComptes();
                } else {
                    setIsAnalytique(value);
                }
                showToast(`Paramètre mis à jour.`);
            }
        } catch (err) {
            showToast("Erreur sauvegarde", "error");
        } finally {
            setActionLoading(false);
        }
    };

    const handleAddCompte = async (e) => {
        e.preventDefault();
        if (isDuplicate) return;

        // 🔑 SÉCURITÉ DE POSTE INTERNE : Interdire la validation si le privilège de création est absent
        if (!canCreateAccount) {
            return showToast("🛑 ACCÈS REFUSÉ : Action d'enregistrement de compte non autorisée.", "error");
        }

        setActionLoading(true);
        try {
            const finalNum = newCompte.numero_compte.toString().padEnd(displayDigits, '0');
            const res = await API.post('/plan-comptable/ajouter', { ...newCompte, numero_compte: finalNum });
            
            if (res.data.success) {
                showToast("Compte enregistré !");
                setNewCompte({ numero_compte: '', intitule: '', type_compte: 'ACTIF' });
                setShowAddForm(false);
                setSearchTerm(''); 
                
                await fetchComptes(); 
                
                if (socket) {
                    socket.emit('DATA_EVENT', { table: 'plan_comptable', action: 'INSERT' });
                }
            }
        } catch (err) {
            showToast("Erreur d'ajout", "error");
        } finally {
            setActionLoading(false);
        }
    };

    // --- FILTRES ET CALCULS ---

    const isDuplicate = useMemo(() => {
        if (!newCompte.numero_compte) return false;
        const simplifiedNew = newCompte.numero_compte.toString().padEnd(displayDigits, '0').substring(0, displayDigits);
        return comptes.some(c => c.numero_compte.toString().substring(0, displayDigits) === simplifiedNew);
    }, [newCompte.numero_compte, comptes, displayDigits]);

    const filteredComptes = useMemo(() => {
        const sorted = [...comptes].sort((a, b) => 
            a.numero_compte.toString().localeCompare(b.numero_compte.toString())
        );

        return sorted.filter(c => 
            (c.numero_compte || "").includes(searchTerm) || 
            (c.intitule || "").toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [comptes, searchTerm]); 

    const getTypeBadge = (type) => {
        const t = (type || 'ACTIF').toUpperCase(); 
        const styles = { 
            'ACTIF': { bg: '#dbeafe', text: '#1e40af' }, 
            'PASSIF': { bg: '#f3e8ff', text: '#6b21a8' }, 
            'CHARGE': { bg: '#fee2e2', text: '#991b1b' }, 
            'PRODUIT': { bg: '#dcfce7', text: '#166534' } 
        };
        const s = styles[t] || styles['ACTIF'];
        return { ...badgeBaseStyle, background: s.bg, color: s.text };
    };

    return (
        <div style={{ display: 'flex', height: '100vh', background: '#f1f5f9', overflow: 'hidden' }}>
            <Sidebar />
            <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <header style={headerStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div style={iconBoxStyle}><BookOpen size={22} color="white" /></div>
                        <div>
                            <h1 style={{ margin: 0, fontSize: '18px', fontWeight: '900' }}>COMPTABILITÉ</h1>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                
                                {/* 🔒 CONFIGURATION DE LA PRÉCISION : Sécurisée et bridée selon les habilitations */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Hash size={12} color="#64748b" />
                                    <select 
                                        value={displayDigits} 
                                        disabled={actionLoading || !canModifyAccount} 
                                        onChange={(e) => updateSystemSetting('precision', parseInt(e.target.value))} 
                                        style={{
                                            ...miniSelectStyle,
                                            background: canModifyAccount ? '#ffffff' : '#e2e8f0',
                                            cursor: canModifyAccount ? 'pointer' : 'not-allowed'
                                        }}
                                    >
                                        <option value={6}>6 chiffres</option>
                                        <option value={8}>8 chiffres</option>
                                        <option value={10}>10 chiffres</option>
                                    </select>
                                </div>

                                {/* 🔒 CONFIGURATION DU MODULE ANALYTIQUE : Sécurisée et bridée selon les habilitations */}
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: canModifyAccount ? 'pointer' : 'not-allowed' }}>
                                    <input 
                                        type="checkbox" 
                                        checked={isAnalytique} 
                                        disabled={actionLoading || !canModifyAccount} 
                                        onChange={(e) => updateSystemSetting('analytique', e.target.checked)} 
                                        style={{ cursor: canModifyAccount ? 'pointer' : 'not-allowed' }}
                                    />
                                    <Activity size={12} color={isAnalytique ? "#2563eb" : "#64748b"} />
                                    <span style={{ fontSize: '11px', fontWeight: '800', color: isAnalytique ? "#2563eb" : "#64748b" }}>ANALYTIQUE</span>
                                </label>

                            </div>
                        </div>
                    </div>
                    <div style={tabSwitcherStyle}>
                        <button onClick={() => setActiveTab('liste')} style={activeTab === 'liste' ? tabActiveStyle : tabInactiveStyle}>LISTE</button>
                        <button onClick={() => setActiveTab('setup')} style={activeTab === 'setup' ? tabActiveStyle : tabInactiveStyle}>IMPORT</button>
                    </div>
                </header>
                <div style={{ flex: 1, overflowY: 'auto', padding: '20px 40px' }}>
                    {activeTab === 'liste' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            {showAddForm && (
                                <div style={{...inlineFormContainerStyle, borderColor: isDuplicate ? '#ef4444' : '#2563eb'}}>
                                    <div style={{display:'flex', justifyContent:'space-between', marginBottom:'10px'}}>
                                        <h3 style={{margin:0, fontSize:'12px', color: isDuplicate ? '#ef4444' : '#2563eb', fontWeight: '900'}}>{isDuplicate ? "⚠️ DOUBLON" : "NOUVEAU COMPTE"}</h3>
                                        <button onClick={() => setShowAddForm(false)} style={btnCloseFormStyle}><X size={14}/></button>
                                    </div>
                                    <form onSubmit={handleAddCompte} style={{ display: 'flex', gap: '15px', alignItems: 'flex-end' }}>
                                        <div style={{ flex: 1 }}>
                                            <label style={inputLabelStyle}>NUMÉRO</label>
                                            <input type="text" required style={inlineInputStyle} value={newCompte.numero_compte} onChange={(e) => {
                                                const val = e.target.value.replace(/\D/g, '').substring(0, displayDigits);
                                                const nat = (v) => { const f = v.charAt(0); if (['6', '8'].includes(f)) return 'CHARGE'; if (f === '7') return 'PRODUIT'; if (['1', '4'].includes(f)) return 'PASSIF'; return 'ACTIF'; };
                                                setNewCompte({...newCompte, numero_compte: val, type_compte: nat(val)});
                                            }} />
                                        </div>
                                        <div style={{ flex: 2 }}>
                                            <label style={inputLabelStyle}>INTITULÉ DU COMPTE</label>
                                            <input type="text" required style={inlineInputStyle} value={newCompte.intitule} onChange={(e) => setNewCompte({...newCompte, intitule: e.target.value.toUpperCase()})} />
                                        </div>
                                        <button type="submit" disabled={isDuplicate || actionLoading} style={btnSaveInlineStyle}>
                                            {actionLoading ? <Loader2 className="animate-spin" size={18}/> : <Save size={18}/>}
                                        </button>
                                    </form>
                                </div>
                            )}

                            <div style={toolbarStyle}>
                                <div style={searchContainerStyle}>
                                    <Search size={18} color="#94a3b8" />
                                    <input type="text" placeholder="Rechercher un compte ou libellé..." style={searchInputStyle} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                                </div>
                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                    
                                    {/* 🔑 MAPPAGE DU BOUTON VIDER : Supprimé le disabled strict pour intercepter le clic */}
                                    <button 
                                        onClick={() => {
                                            if (!canPurgePlan) {
                                                showToast("🛑 ACCÈS REFUSÉ : Votre profil ne détient pas la permission de purger le plan comptable.", "error");
                                            } else {
                                                handleViderPlan();
                                            }
                                        }} 
                                        disabled={comptes.length === 0 || actionLoading} 
                                        style={{
                                            ...btnViderStyle,
                                            background: canPurgePlan ? '#dc2626' : '#cbd5e1',
                                            color: canPurgePlan ? '#ffffff' : '#64748b',
                                            cursor: (comptes.length === 0 || actionLoading) ? 'not-allowed' : 'pointer'
                                        }}
                                    >
                                        <Trash2 size={18} /> VIDER
                                    </button>

                                    {/* 🔑 MAPPAGE DU BOUTON AJOUTER : Gère l'alerte si non autorisé */}
                                    <button 
                                        onClick={() => {
                                            if (!canCreateAccount) {
                                                showToast("🛑 ACCÈS REFUSÉ : Votre profil ne détient pas la permission d'ajouter un nouveau compte.", "error");
                                            } else {
                                                setShowAddForm(!showAddForm);
                                            }
                                        }} 
                                        style={{
                                            ...btnAddStyle,
                                            background: canCreateAccount ? '#2563eb' : '#cbd5e1',
                                            color: canCreateAccount ? '#ffffff' : '#64748b',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <Plus size={18} /> {canCreateAccount ? "AJOUTER" : "Accès restreint"}
                                    </button>

                                </div>
                            </div>

                            <div style={cardStyle}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                            <th style={thStyle}>Compte</th>
                                            <th style={thStyle}>Intitulé</th>
                                            <th style={{ ...thStyle, textAlign: 'center' }}>Nature</th>
                                            {isAnalytique && <th style={{ ...thStyle, textAlign: 'center' }}>Section</th>}
                                            <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {loading ? (
                                            <tr><td colSpan={isAnalytique ? "5" : "4"} style={{textAlign:'center', padding:'40px'}}><Loader2 className="animate-spin" color="#2563eb"/></td></tr>
                                        ) : filteredComptes.map(item => (
                                            <tr key={item.id} style={trStyle}>
                                                <td style={tdStyle}><span style={codeStyle}>{item.numero_compte}</span></td>
                                                <td style={{ ...tdStyle, fontWeight: '700' }}>{item.intitule}</td>
                                                <td style={{ ...tdStyle, textAlign: 'center' }}><span style={getTypeBadge(item.type_compte)}>{item.type_compte}</span></td>
                                                {isAnalytique && <td style={{ ...tdStyle, textAlign: 'center', color: '#64748b', fontSize: '11px' }}>{item.section_analytique || '-'}</td>}
                                                <td style={{ ...tdStyle, textAlign: 'right' }}>
                                                    <div style={{display:'flex', gap:'10px', justifyContent:'flex-end', alignItems: 'center'}}>
                                                        
                                                        {/* 🔑 MAPPAGE DU BOUTON SUPPRIMER UNITAIRE : Masqué si non autorisé */}
                                                        {canDeleteAccount ? (
                                                            <Trash2 
                                                                size={16} 
                                                                color="#ef4444" 
                                                                style={{ cursor: 'pointer' }} 
                                                                onClick={() => handleDeleteLine(item.id)} 
                                                                title="Supprimer ce compte"
                                                            />
                                                        ) : (
                                                            /* 🔒 SÉCURITÉ INFORMATIVE : Affiché si aucun droit n'est accordé */
                                                            <span style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic', fontWeight: '500' }}>
                                                                Accès restreint
                                                            </span>
                                                        )}

                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                    ) : (
                        <SetupPlanComptable user={user} onFinished={() => { fetchComptes(); setActiveTab('liste'); }} />
                    )}
                </div>
            </main>

                    {/* ✅ TOAST INTERACTIF */}
            {toast.show && (
                <div style={{ 
                    ...toastStyle, 
                    background: toast.type === 'warning' ? '#f59e0b' : (toast.type === 'success' ? '#0f172a' : '#ef4444'),
                    minWidth: '350px'
                }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            {toast.type === 'warning' ? <AlertTriangle size={18} /> : <Check size={18} />}
                            <span style={{fontSize: '13px'}}>{toast.message}</span>
                        </div>
                        
                        {toast.action && (
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                <button 
                                    onClick={() => setToast({ ...toast, show: false })}
                                    style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', padding: '6px 15px', borderRadius: '6px', fontSize: '11px', fontWeight: '900', cursor: 'pointer' }}
                                >
                                    NON
                                </button>
                                <button 
                                    onClick={() => {
                                        toast.action();
                                    }} 
                                    style={{ background: 'white', border: 'none', color: toast.type === 'warning' ? '#f59e0b' : '#0f172a', padding: '6px 15px', borderRadius: '6px', fontSize: '11px', fontWeight: '900', cursor: 'pointer' }}
                                >
                                    OUI, CONFIRMER
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};



// --- STYLES ---
const headerStyle = { background: 'white', padding: '15px 40px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
const miniSelectStyle = { background: '#eff6ff', border: '1px solid #dbeafe', borderRadius: '6px', fontSize: '11px', fontWeight: '800', color: '#2563eb', padding: '4px 8px', cursor: 'pointer', outline: 'none' };
const iconBoxStyle = { background: '#2563eb', padding: '10px', borderRadius: '12px' };
const tabSwitcherStyle = { display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '12px' };
const toolbarStyle = { display: 'flex', gap: '15px', alignItems: 'center' };
const searchContainerStyle = { flex: 1, display: 'flex', alignItems: 'center', gap: '12px', background: 'white', padding: '0 18px', borderRadius: '15px', border: '1px solid #e2e8f0' };
const searchInputStyle = { border: 'none', outline: 'none', width: '100%', padding: '12px 0', fontWeight: '600', fontSize:'13px' };
const inlineFormContainerStyle = { background: 'white', padding: '20px', borderRadius: '15px', border: '2px solid #2563eb', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' };
const inlineInputStyle = { width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#f8fafc', fontWeight: '700', outline: 'none' };
const btnSaveInlineStyle = { background: '#0f172a', color: 'white', border: 'none', padding: '12px 25px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const btnAddStyle = { background: '#2563eb', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '12px', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' };
const btnViderStyle = { background: '#fee2e2', color: '#ef4444', border: '1px solid #fecaca', padding: '10px 20px', borderRadius: '12px', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' };
const cardStyle = { background: 'white', borderRadius: '20px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' };
const thStyle = { padding: '15px 20px', fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '900', textAlign: 'left' };
const tdStyle = { padding: '15px 20px', borderBottom: '1px solid #f1f5f9', fontSize: '13px' };
const trStyle = { transition: '0.2s', cursor: 'default' };
const codeStyle = { background: '#f1f5f9', padding: '4px 8px', borderRadius: '6px', fontWeight: '900', color: '#2563eb', fontFamily: 'monospace' };
const badgeBaseStyle = { padding: '4px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: '900' };
const inputLabelStyle = { fontSize: '10px', fontWeight: '900', color: '#64748b', marginBottom: '8px', display: 'block' };
const btnCloseFormStyle = { background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' };
const tabActiveStyle = { padding: '8px 20px', borderRadius: '8px', background: 'white', border: 'none', fontWeight: '800', color: '#2563eb', cursor: 'pointer', fontSize: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' };
const tabInactiveStyle = { padding: '8px 20px', borderRadius: '8px', background: 'none', border: 'none', fontWeight: '700', color: '#64748b', cursor: 'pointer', fontSize: '12px' };
const toastStyle = { position: 'fixed', bottom: '30px', left: '50%', transform: 'translateX(-50%)', padding: '15px 30px', borderRadius: '15px', color: 'white', fontWeight: '800', zIndex: 4000, boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)' };

export default PlanComptable;