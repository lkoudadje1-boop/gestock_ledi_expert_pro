import React, { useState, useEffect, useMemo } from 'react';
import { 
    Loader2, Save, PlusCircle, X, BookOpen, Trash2, Edit,
    Wallet, ShieldCheck, Users, Search, Check, UserPlus, AlertTriangle, UserX
} from 'lucide-react';
import Sidebar from '../../components/Sidebar';
// ✅ Import corrigé
import API, { socket, joinCompanyRoom } from '../../services/api';

const BORDEAUX = '#800020';

// --- COMPOSANT DE SÉLECTION AVEC RECHERCHE ---
const SearchableSelect = ({ label, options, value, onChange, placeholder, displayKey, idKey = 'id', disabled = false }) => {
    const [search, setSearch] = useState('');
    const [isOpen, setIsOpen] = useState(false);

    const filtered = useMemo(() => {
        return options.filter(opt => 
            String(opt[displayKey] || '').toLowerCase().includes(search.toLowerCase()) ||
            String(opt.numero_compte || '').includes(search) ||
            String(opt.code || '').toLowerCase().includes(search.toLowerCase())
        );
    }, [options, search, displayKey]);

    const selectedLabel = options.find(o => o[idKey] === value)?.[displayKey] || '';

    return (
        <div style={{ marginBottom: '10px', position: 'relative' }}>
            {label && <label style={labelStyle}>{label}</label>}
            <div 
                onClick={() => !disabled && setIsOpen(!isOpen)}
                style={{ ...input, cursor: disabled ? 'not-allowed' : 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: disabled ? '#f1f5f9' : 'white' }}
            >
                <span style={{ color: value ? '#1e293b' : '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {selectedLabel || placeholder}
                </span>
                <Search size={14} color="#64748b" />
            </div>

            {isOpen && (
                <div style={dropdownList}>
                    <input autoFocus placeholder="Filtrer..." style={searchInput} value={search} onChange={(e) => setSearch(e.target.value)} onClick={(e) => e.stopPropagation()} />
                    <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                        {filtered.length > 0 ? filtered.map(opt => (
                            <div key={opt[idKey]} onClick={() => { onChange(opt[idKey]); setIsOpen(false); setSearch(''); }} style={dropdownItem}>
                                <span style={{ fontWeight: 700 }}>{opt.numero_compte ? `${opt.numero_compte} - ` : ''}{opt.code ? `${opt.code} - ` : ''}{opt[displayKey]}</span>
                                {value === opt[idKey] && <Check size={14} style={{ marginLeft: 'auto' }} color={BORDEAUX} />}
                            </div>
                        )) : <div style={{ padding: '10px', fontSize: '11px', color: '#94a3b8' }}>Aucun résultat</div>}
                    </div>
                </div>
            )}
        </div>
    );
};

const TypeBrouillards = () => {
    const [brouillards, setBrouillards] = useState([]);
    const [comptesPlan, setComptesPlan] = useState([]);
    const [journaux, setJournaux] = useState([]);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [showAssignForm, setShowAssignForm] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [toast, setToast] = useState({ show: false, message: '', type: 'success', action: null });
    
    const [currentBrouillard, setCurrentBrouillard] = useState(null);
    const [affectations, setAffectations] = useState([]);
    const [assignData, setAssignData] = useState({ user_id: '', peut_saisir: 1, peut_valider: 0 });

    const initialFormData = {
        id: '', libelle: '', type: 'CAISSE', 
        journal_unique_id: '', 
        destination_type: 'BROUILLON', 
        compte_treso_id: '', sortie_directe: 0, seuil_validation: 1,
        niv1_actif: 0, niv1_user_id: '', niv2_actif: 0, niv2_user_id: '',
        niv3_actif: 0, niv3_user_id: '', niv4_actif: 0, niv4_user_id: ''
    };

    const [formData, setFormData] = useState(initialFormData);

    const showToast = (message, type = 'success', action = null) => {
        setToast({ show: true, message, type, action });
        if (!action) setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 4000);
    };

const fetchInitialData = async (isSilent = false) => {
    // 🤫 Si c'est silencieux, on ne déclenche pas le loader central
    if (!isSilent) setLoading(true); 

    try {
        const [resB, resP, resJ, resU] = await Promise.all([
            API.get('/treso/brouillards/liste'),
            API.get('/plan-comptable/liste'),
            API.get('/plan-comptable/journaux/liste'),
            API.get('/auth/users/liste')
        ]);

        // ✅ Utilisation du chaînage optionnel ?. pour plus de sécurité
        setBrouillards(resB?.data || []);
        setComptesPlan(resP?.data?.data?.filter(c => c.numero_compte?.toString().startsWith('5')) || []);
        setJournaux(resJ?.data?.data || []);
        setUsers(resU?.data || []);

    } catch (err) {
        console.error("Détails de l'erreur API :", err);

        // 🛡️ Gestion spécifique de l'erreur 403 (Gatekeeper)
        if (err.response?.status === 403) {
            showToast("Accès refusé : Votre licence n'est pas activée.", "error");
        } else {
            showToast("Erreur lors du chargement des paramètres.", "error");
        }

        // On réinitialise les listes à vide pour éviter les erreurs de .map()
        setBrouillards([]);
        setComptesPlan([]);
        setJournaux([]);
        setUsers([]);

    } finally { 
        if (!isSilent) setLoading(false); 
    }
};

    const fetchAffectations = async (id) => {
        try {
            const res = await API.get(`/treso/brouillards/config/affectations/${id}`);
            setAffectations(res.data || []);
        } catch (err) { console.error(err); }
    };

  useEffect(() => {
    // 1. Premier chargement (visible)
    fetchInitialData();

    if (socket) {
        // 2. Rejoindre la salle de la société (Vital !)
        if (typeof joinCompanyRoom === 'function') {
            joinCompanyRoom();
        }

        const handleSncSync = (event) => {
            // Liste des tables qui impactent cette page
            const linkedTables = [
                'brouillards_treso', 
                'journals', 
                'plan_comptable', 
                'brouillard_affectations',
                'exercises'
            ];

            if (event && linkedTables.includes(event.table)) {
                console.log(`🌐 SNC Silencieux : Synchro ${event.table}`);
                // ✅ APPEL SILENCIEUX : Les données se mettent à jour sans Loader
                fetchInitialData(true); 
            }
        };

        // Écoute des signaux
        socket.on('DATA_EVENT', handleSncSync);
        socket.on('REFRESH_BROUILLARDS', () => fetchInitialData(true));

        return () => {
            socket.off('DATA_EVENT', handleSncSync);
            socket.off('REFRESH_BROUILLARDS');
        };
    }
}, []);

    const journauxValides = useMemo(() => journaux.filter(j => j.compte_contrepartie_id), [journaux]);

    const handleJournalChange = (id) => {
        const selected = journauxValides.find(j => j.id === id);
        setFormData({ ...formData, journal_unique_id: id, compte_treso_id: selected ? selected.compte_contrepartie_id : '' });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.journal_unique_id) return showToast("Veuillez choisir un journal", "error");
        setIsSubmitting(true);

        // --- PRÉPARATION FIDÈLE AU SCHÉMA SQL ---
        const dataToSend = { 
            ...formData, 
            mode_fonctionnement: parseInt(formData.sortie_directe) === 1 ? 'DIRECT' : 'DEMANDE',
            mode_ecriture: formData.destination_type === 'BROUILLON' ? 'BROUILLON' : 'DIRECT',
            sortie_directe: parseInt(formData.sortie_directe),
            seuil_validation: parseInt(formData.seuil_validation) || 1
        };

        // Dans ton SQL journal_id est NOT NULL. 
        // On utilise journal_unique_id pour les deux, mais on route selon destination_type
        if (formData.destination_type === 'BROUILLON') {
            dataToSend.journal_id = formData.journal_unique_id; // Toujours remplir car NOT NULL
            dataToSend.journal_brouillon_id = formData.journal_unique_id;
        } else {
            dataToSend.journal_id = formData.journal_unique_id;
            dataToSend.journal_brouillon_id = null;
        }

        try {
            if (isEditing) {
                await API.put(`/treso/brouillards/modifier/${formData.id}`, dataToSend);
                showToast("Mise à jour réussie !");
            } else {
                await API.post('/treso/brouillards/creer', dataToSend);
                showToast("Création réussie !");
            }
            setShowForm(false);
            setFormData(initialFormData);
            fetchInitialData();
        } catch (err) {
            showToast(err.response?.data?.error || "Erreur lors de l'enregistrement", "error");
        } finally { setIsSubmitting(false); }
    };

    const handleEdit = (b) => {
        const dest = b.mode_ecriture === 'DIRECT' ? 'PRINCIPAL' : 'BROUILLON';
        setFormData({ 
            ...b, 
            journal_unique_id: b.journal_brouillon_id || b.journal_id, 
            destination_type: dest 
        });
        setIsEditing(true);
        setShowAssignForm(false);
        setShowForm(true);
    };

    const handleAssign = async (e) => {
        e.preventDefault();
        if(!assignData.user_id) return showToast("Veuillez choisir un utilisateur", "error");
        try {
            await API.post('/treso/brouillards/config/assignation', { brouillard_id: currentBrouillard.id, ...assignData });
            showToast("Accès mis à jour !");
            setAssignData({ user_id: '', peut_saisir: 1, peut_valider: 0 });
            fetchAffectations(currentBrouillard.id);
        } catch (err) { showToast("Erreur d'affectation", "error"); }
    };

    const handleRevoke = async (userId) => {
        try {
            await API.delete(`/treso/brouillards/config/affectation/${currentBrouillard.id}/${userId}`);
            showToast("Accès révoqué");
            fetchAffectations(currentBrouillard.id);
        } catch (err) { showToast("Erreur lors de la révocation", "error"); }
    };

    const handleDelete = (id) => {
        const confirmDelete = async () => {
            try {
                await API.delete(`/treso/brouillards/supprimer/${id}`);
                showToast("Brouillard supprimé.");
                fetchInitialData();
            } catch (err) { showToast("Erreur suppression", "error"); }
        };
        showToast("Supprimer définitivement ce brouillard ?", "warning", confirmDelete);
    };

    const showValidation = parseInt(formData.sortie_directe) === 0;

    return (
        <div style={layoutStyle}>
            <Sidebar />
            <main style={mainStyle}>
                <header style={headerStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div style={iconBox}><Wallet size={24} color="white" /></div>
                        <div>
                            <h1 style={titleStyle}>PARAMÉTRAGE DES BROUILLARDS</h1>
                            <span style={subtitleStyle}>Gestion des flux, accès et quorum</span>
                        </div>
                    </div>
                    {!showForm && !showAssignForm && (
                        <button onClick={() => { setFormData(initialFormData); setIsEditing(false); setShowForm(true); }} style={btnPrimary}>
                            <PlusCircle size={18} /> NOUVELLE UNITÉ
                        </button>
                    )}
                </header>

                {showForm && (
                    <div style={formWrapper}>
                        <form onSubmit={handleSubmit} style={mainForm}>
                            <div style={formHeader}>
                                <h2 style={formTitle}>{isEditing ? "MODIFIER L'UNITÉ" : "NOUVELLE CONFIGURATION"}</h2>
                                <button type="button" onClick={() => setShowForm(false)} style={btnExit}><X size={20}/></button>
                            </div>
                            <div style={grid3}>
                                <div style={formCard}>
                                    <h3 style={cardTitle}><BookOpen size={16}/> IDENTITÉ</h3>
                                    <label style={labelStyle}>LIBELLÉ UNITÉ</label>
                                    <input required style={input} value={formData.libelle} onChange={e => setFormData({...formData, libelle: e.target.value.toUpperCase()})} />
                                    <label style={{...labelStyle, marginTop:'10px'}}>TYPE</label>
                                    <select style={input} value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})}>
                                        <option value="CAISSE">🏦 CAISSE</option>
                                        <option value="BANQUE">💳 BANQUE</option>
                                    </select>
                                </div>

                                <div style={formCard}>
                                    <h3 style={cardTitle}><ShieldCheck size={16}/> COMPTABILITÉ</h3>
                                    <SearchableSelect label="CODE JOURNAL" options={journauxValides} value={formData.journal_unique_id} onChange={handleJournalChange} displayKey="libelle" placeholder="Choisir journal..." />
                                    <div style={{marginTop:'10px'}}>
                                        <label style={labelStyle}>CONTREPARTIE AUTOMATIQUE</label>
                                        <div style={{ ...input, background: '#f8fafc', color: BORDEAUX, border: `1px solid ${BORDEAUX}`, fontWeight: 'bold' }}>
                                            {comptesPlan.find(c => c.id === formData.compte_treso_id)?.numero_compte || "SÉLECTIONNEZ UN JOURNAL"}
                                        </div>
                                    </div>
                                    <div style={{marginTop:'15px', padding:'10px', background:'#fff', borderRadius:'8px', border:'1px solid #cbd5e1'}}>
                                        <label style={labelStyle}>DESTINATION (CASA)</label>
                                        <div style={{display:'flex', gap:'5px', marginTop:'5px'}}>
                                            <button type="button" onClick={() => setFormData({...formData, destination_type: 'BROUILLON'})}
                                                style={{ flex:1, padding:'8px', fontSize:'9px', fontWeight:'bold', cursor:'pointer', border:'none', borderRadius:'6px',
                                                background: formData.destination_type === 'BROUILLON' ? BORDEAUX : '#cbd5e1',
                                                color: formData.destination_type === 'BROUILLON' ? 'white' : '#475569' }}>BROUILLON</button>
                                            <button type="button" onClick={() => setFormData({...formData, destination_type: 'PRINCIPAL'})}
                                                style={{ flex:1, padding:'8px', fontSize:'9px', fontWeight:'bold', cursor:'pointer', border:'none', borderRadius:'6px',
                                                background: formData.destination_type === 'PRINCIPAL' ? '#10b981' : '#cbd5e1',
                                                color: formData.destination_type === 'PRINCIPAL' ? 'white' : '#475569' }}>PRINCIPAL</button>
                                        </div>
                                    </div>
                                </div>

                                <div style={formCard}>
                                    <h3 style={cardTitle}><Users size={16}/> QUORUM</h3>
                                    <label style={labelStyle}>MODALITÉ SORTIE</label>
                                    <select style={input} value={formData.sortie_directe} onChange={e => setFormData({...formData, sortie_directe: parseInt(e.target.value)})}>
                                        <option value={1}>⚡ DIRECTE</option>
                                        <option value={0}>🔒 VISA OBLIGATOIRE</option>
                                    </select>
                                    <label style={{...labelStyle, marginTop:'10px'}}>NB SIGNATURES</label>
                                    <input type="number" min="1" max="4" disabled={!showValidation} style={inputSeuil} value={showValidation ? formData.seuil_validation : 1} onChange={e => setFormData({...formData, seuil_validation: e.target.value})} />
                                </div>
                            </div>

                            {showValidation && (
                                <div style={validationGrid}>
                                    {[1,2,3,4].map(n => (
                                        <div key={n} style={{...nivCard, border: formData[`niv${n}_actif`] ? `2px solid ${BORDEAUX}` : '1px solid #cbd5e1'}}>
                                            <div style={nivHeader}>
                                                <input type="checkbox" checked={formData[`niv${n}_actif`] === 1} onChange={e => setFormData({...formData, [`niv${n}_actif`]: e.target.checked ? 1 : 0})} />
                                                <span style={nivTitle}>VISA NIV. {n}</span>
                                            </div>
                                            <SearchableSelect options={users} value={formData[`niv${n}_user_id`]} onChange={(id) => setFormData({...formData, [`niv${n}_user_id`]: id})} displayKey="username" disabled={!formData[`niv${n}_actif`]} placeholder="Validateur..." />
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div style={footerForm}>
                                <button type="submit" disabled={isSubmitting} style={btnSaveFull}>
                                    {isSubmitting ? <Loader2 className="animate-spin" size={20}/> : <Save size={20}/>} {isEditing ? "METTRE À JOUR" : "ENREGISTRER L'UNITÉ"}
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {showAssignForm && currentBrouillard && (
                    <div style={formWrapper}>
                        <div style={{ ...mainForm, background: '#fff' }}>
                            <div style={formHeader}>
                                <h2 style={formTitle}><Users size={18} /> ACCÈS : {currentBrouillard.libelle}</h2>
                                <button onClick={() => setShowAssignForm(false)} style={btnExit}><X size={20}/></button>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '30px' }}>
                                <form onSubmit={handleAssign} style={{ borderRight: '1px solid #e2e8f0', paddingRight: '30px' }}>
                                    <h4 style={subPartTitle}>AJOUTER UN DROIT</h4>
                                    <SearchableSelect label="UTILISATEUR" options={users} value={assignData.user_id} onChange={(id) => setAssignData({...assignData, user_id: id})} displayKey="username" placeholder="Sélectionner..." />
                                    <div style={{ display: 'flex', gap: '20px', margin: '15px 0' }}>
                                        <label style={checkLabel}><input type="checkbox" checked={assignData.peut_saisir === 1} onChange={e => setAssignData({...assignData, peut_saisir: e.target.checked ? 1 : 0})} /> SAISIR</label>
                                        <label style={checkLabel}><input type="checkbox" checked={assignData.peut_valider === 1} onChange={e => setAssignData({...assignData, peut_valider: e.target.checked ? 1 : 0})} /> VALIDER</label>
                                    </div>
                                    <button type="submit" style={{ ...btnPrimary, width: '100%', justifyContent: 'center' }}><UserPlus size={18}/> DONNER L'ACCÈS</button>
                                </form>
                                <div>
                                    <h4 style={subPartTitle}>PERSONNES AUTORISÉES</h4>
                                    <div style={affectationListScroll}>
                                        {affectations.length === 0 ? <p style={emptyText}>Aucun accès configuré.</p> : affectations.map(aff => (
                                            <div key={aff.user_id} style={affectationItem}>
                                                <div>
                                                    <div style={{ fontWeight: 800 }}>{aff.username}</div>
                                                    <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                                                        {aff.peut_saisir ? <span style={miniBadgeSaisie}>Saisie</span> : null}
                                                        {aff.peut_valider ? <span style={miniBadgeValide}>Validation</span> : null}
                                                    </div>
                                                </div>
                                                <button onClick={() => handleRevoke(aff.user_id)} style={btnRevoke}><UserX size={16}/></button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <div style={contentStyle}>
                    {loading ? <div style={center}><Loader2 className="animate-spin" size={40} color={BORDEAUX} /></div> : (
                        <div style={tableWrapper}>
                            <table style={tableStyle}>
                                <thead>
                                    <tr style={{background: BORDEAUX, color:'white'}}>
                                        <th style={thStyle}>UNITÉ / TYPE</th>
                                        <th style={thStyle}>COMPTE / JOURNAL</th>
                                        <th style={thStyle}>DESTINATION</th>
                                        <th style={thStyle}>VISAS</th>
                                        <th style={thStyle}>ACTIONS</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {brouillards.map(b => (
                                        <tr key={b.id} style={trStyle}>
                                            <td style={tdStyle}>
                                                <div style={{fontWeight:900}}>{b.libelle}</div>
                                                <div style={{fontSize:'10px', color: BORDEAUX, fontWeight: 800}}>{b.type}</div>
                                            </td>
                                            <td style={tdStyle}>
                                                <div style={badgeCompte}>{b.compte_numero}</div>
                                                <div style={{fontSize:'10px', marginTop:'4px'}}>Code: <b>{b.journal_code || b.journal_brouillon_code}</b></div>
                                            </td>
                                            <td style={tdStyle}>
                                                {b.mode_ecriture === 'DIRECT' ? <span style={miniBadgeValide}>PRINCIPAL</span> : <span style={miniBadgeSaisie}>BROUILLON</span>}
                                            </td>
                                            <td style={tdStyle}>
                                                <div style={{display:'flex', gap:'5px', alignItems:'center'}}>
                                                    {[1,2,3,4].map(n => b[`niv${n}_actif`] ? <div key={n} style={dotActive}>{n}</div> : null)}
                                                </div>
                                            </td>
                                            <td style={tdStyle}>
                                                <div style={{display:'flex', gap:'15px'}}>
                                                    <UserPlus size={18} color="#10b981" cursor="pointer" title="Droits" onClick={() => { setCurrentBrouillard(b); setShowForm(false); setShowAssignForm(true); fetchAffectations(b.id); }} />
                                                    <Edit size={18} color="#3b82f6" cursor="pointer" title="Éditer" onClick={() => handleEdit(b)} />
                                                    <Trash2 size={18} color="#ef4444" cursor="pointer" title="Supprimer" onClick={() => handleDelete(b.id)} />
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </main>
            {toast.show && (
                <div style={{ ...toastStyle, background: toast.type === 'error' ? '#ef4444' : (toast.type === 'warning' ? '#f59e0b' : '#0f172a') }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <AlertTriangle size={18} />
                        <span style={{fontSize:'12px', fontWeight: 700}}>{toast.message}</span>
                        {toast.action && <button onClick={toast.action} style={btnToastPrimary}>CONFIRMER</button>}
                    </div>
                </div>
            )}
        </div>
    );
};

// --- STYLES ---
const labelStyle = { fontSize: '10px', fontWeight: '900', color: '#64748b', display: 'block', marginBottom: '5px' };
const input = { width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontWeight: '700', fontSize: '12px', outline: 'none' };
const dropdownList = { position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #cbd5e1', borderRadius: '8px', zIndex: 1000, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' };
const searchInput = { width: 'calc(100% - 20px)', margin: '10px', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '12px' };
const dropdownItem = { padding: '10px 15px', cursor: 'pointer', fontSize: '12px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between' };
const layoutStyle = { display: 'flex', height: '100vh', background: '#f1f5f9', overflow: 'hidden' };
const mainStyle = { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' };
const headerStyle = { background: 'white', padding: '15px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `4px solid ${BORDEAUX}` };
const iconBox = { background: BORDEAUX, padding: '10px', borderRadius: '12px' };
const titleStyle = { margin: 0, fontSize: '16px', fontWeight: '900' };
const subtitleStyle = { fontSize: '10px', color: '#64748b', fontWeight: 600 };
const btnPrimary = { background: BORDEAUX, color: 'white', border: 'none', padding: '10px 20px', borderRadius: '10px', fontWeight: '900', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize:'11px' };
const formWrapper = { padding: '20px 40px', background: 'white', borderBottom: '1px solid #e2e8f0' };
const mainForm = { background: '#f8fafc', padding: '20px', borderRadius: '15px', border: '1px solid #cbd5e1' };
const formHeader = { display: 'flex', justifyContent: 'space-between', marginBottom: '20px', alignItems: 'center' };
const formTitle = { margin: 0, fontSize: '13px', fontWeight: '900', color: BORDEAUX };
const subPartTitle = { fontSize: '11px', fontWeight: '900', color: '#64748b', marginBottom: '15px', textTransform: 'uppercase' };
const grid3 = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' };
const formCard = { background: 'white', padding: '15px', borderRadius: '12px', border: '1px solid #e2e8f0' };
const cardTitle = { margin: '0 0 15px 0', fontSize: '11px', fontWeight: '900', color: BORDEAUX, display: 'flex', alignItems: 'center', gap: '8px' };
const inputSeuil = { ...input, fontSize: '18px', textAlign: 'center', color: BORDEAUX };
const validationGrid = { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px', marginTop: '20px' };
const nivCard = { background: 'white', padding: '12px', borderRadius: '10px', border: '1px solid #cbd5e1' };
const nivHeader = { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' };
const nivTitle = { fontSize: '11px', fontWeight: '900' };
const footerForm = { marginTop: '20px', display: 'flex', justifyContent: 'flex-end' };
const btnSaveFull = { background: BORDEAUX, color: 'white', border: 'none', padding: '12px 30px', borderRadius: '10px', fontWeight: '900', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' };
const btnExit = { background: '#fee2e2', color: '#ef4444', border: 'none', padding: '5px', borderRadius: '8px', cursor: 'pointer' };
const contentStyle = { padding: '20px 40px', flex: 1, overflowY: 'auto' };
const tableWrapper = { background: 'white', borderRadius: '15px', overflow: 'hidden' };
const tableStyle = { width: '100%', borderCollapse: 'collapse' };
const thStyle = { padding: '15px', textAlign: 'left', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase' };
const trStyle = { borderBottom: '1px solid #f1f5f9' };
const tdStyle = { padding: '12px 15px', fontSize: '12px' };
const badgeCompte = { background: '#f1f5f9', color: '#475569', padding: '3px 8px', borderRadius: '5px', fontWeight: 800, fontSize: '10px' };
const dotActive = { width: '18px', height: '18px', borderRadius: '50%', background: BORDEAUX, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 900 };
const checkLabel = { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', fontWeight: 800, cursor: 'pointer' };
const affectationListScroll = { maxHeight: '200px', overflowY: 'auto', paddingRight: '5px' };
const affectationItem = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', borderBottom: '1px solid #f1f5f9' };
const emptyText = { fontSize: '11px', color: '#94a3b8', textAlign: 'center', marginTop: '20px' };
const miniBadgeSaisie = { background: '#e0f2fe', color: '#0369a1', padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 800 };
const miniBadgeValide = { background: '#dcfce7', color: '#15803d', padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 800 };
const btnRevoke = { background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '5px' };
const toastStyle = { position: 'fixed', bottom: '30px', left: '50%', transform: 'translateX(-50%)', padding: '15px 25px', borderRadius: '12px', color: 'white', zIndex: 9999, boxShadow: '0 10px 15px -3px rgba(0,0,0,0.2)' };
const btnToastPrimary = { background: 'white', color: BORDEAUX, border: 'none', padding: '5px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: '900', marginLeft: '10px', cursor: 'pointer' };
const center = { display: 'flex', justifyContent: 'center', padding: '100px' };

export default TypeBrouillards;