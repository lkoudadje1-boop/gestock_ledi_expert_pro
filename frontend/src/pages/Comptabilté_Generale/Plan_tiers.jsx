import React, { useState, useEffect, useRef } from 'react';
import { 
    Plus, Users, Search, Loader2, Trash2, Save, X, Edit,
    ShoppingCart, UserRound, PlusCircle, Link as LinkIcon,
    CheckCircle2, AlertCircle, ChevronDown, Download, UploadCloud, UserPlus,
    Clock
} from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import API, { socket, joinCompanyRoom } from '../../services/api';

const PlanTiers = () => {
    const [tiers, setTiers] = useState([]);
    const [comptesCollectifs, setComptesCollectifs] = useState([]);
    const [operationalData, setOperationalData] = useState([]); 
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [isCreatingOther, setIsCreatingOther] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [searchProfile, setSearchProfile] = useState(""); // 🎯 Recherche pour le petit tableau
    const [status, setStatus] = useState({ type: '', msg: '' });
    const [activeTab, setActiveTab] = useState('CLIENT'); 
    const [editingId, setEditingId] = useState(null); // 🎯 État pour la modification
    
    const [newOther, setNewOther] = useState({ nom: '', nif: '', telephone: '', adresse: '' });
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [searchCpteGen, setSearchCpteGen] = useState("");
    const suggestionRef = useRef(null);

    const [formData, setFormData] = useState({
        numero_tiers: '',
        nom: '',
        type_tiers: 'CLIENT',
        compte_collectif_id: '',
        reference_id: '',
        delai_paiement: 0 
    });

    const tabs = [
        { id: 'CLIENT', label: 'Clients', icon: Users, color: '#2563eb' },
        { id: 'FOURNISSEUR', label: 'Fournisseurs', icon: ShoppingCart, color: '#dc2626' },
        { id: 'SALARIE', label: 'Personnel', icon: UserRound, color: '#059669' },
        { id: 'AUTRE', label: 'Autres', icon: PlusCircle, color: '#64748b' }
    ];

    const activeColor = tabs.find(t => t.id === activeTab)?.color || '#2563eb';

    const showStatus = (type, msg) => {
        setStatus({ type, msg });
        if (type === 'success') setTimeout(() => setStatus({ type: '', msg: '' }), 4000);
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            const [resTiers, resPlan] = await Promise.all([
                API.get(`/compta/tiers?type=${activeTab}`),
                API.get('/plan-comptable/liste?collectif=true')
            ]);
            if (resTiers.data.success) {
                setTiers(resTiers.data.data);
                setOperationalData(resTiers.data.available || []); 
            }
            if (resPlan.data.success) {
                setComptesCollectifs(resPlan.data.data);
            }
        } catch (err) {
            showStatus('error', "Erreur de chargement.");
        } finally {
            setLoading(false);
        }
    };

   useEffect(() => {
    // 1. Chargement initial
    fetchData();

    // 2. Activation du Temps Réel
    if (socket) {
        // Force l'entrée dans la salle de la société
        joinCompanyRoom();

        const handleSocketUpdate = (event) => {
    if (['analytic_departments', 'analytic_plans', 'companies'].includes(event.table)) {
                fetchData();
            }
        };

        socket.on('DATA_EVENT', handleSocketUpdate);
        socket.on('REFRESH_PLAN_TIERS', fetchData); // Compatibilité

        return () => {
            socket.off('DATA_EVENT', handleSocketUpdate);
            socket.off('REFRESH_JOURNAUX');
        };
    }
}, [activeTab]);

    const handleExportCSV = async () => {
        setIsExporting(true);
        try {
            const response = await API.get('/compta/tiers/export', { responseType: 'blob' });
            const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            const link_href = url;
            link.href = link_href;
            link.setAttribute('download', `Plan_Tiers_${activeTab}.csv`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            showStatus('success', "EXPORTATION RÉUSSIE");
        } catch (err) {
            showStatus('error', "L'export a échoué.");
        } finally {
            setIsExporting(false);
        }
    };

    const handleImportCSV = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setIsImporting(true);
        const fData = new FormData();
        fData.append('file', file);
        try {
            const res = await API.post('/compta/tiers/import', fData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            if (res.data.success) {
                showStatus('success', res.data.message);
                fetchData();
            }
        } catch (err) {
            showStatus('error', "Erreur d'importation.");
        } finally {
            setIsImporting(false);
            e.target.value = null;
        }
    };

    const handleCreateOtherEntry = async () => {
        if (!newOther.nom) return showStatus('error', "Le nom est obligatoire.");
        setSubmitting(true);
        try {
            const res = await API.post('/others-tiers', newOther);
            if (res.data.success) {
                showStatus('success', "TIERS ENREGISTRÉ !");
                setNewOther({ nom: '', nif: '', telephone: '', adresse: '' });
                setIsCreatingOther(false);
                fetchData();
            }
        } catch (err) {
            showStatus('error', "Erreur lors de la création.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleLinkSubmit = async (e) => {
        e.preventDefault();
        if (!formData.reference_id) return showStatus('error', "Sélectionnez un profil source.");
        setSubmitting(true);
        try {
            let res;
            if (editingId) {
                // 🎯 Logique de mise à jour si on est en mode édition
                res = await API.put(`/compta/tiers/${editingId}`, { ...formData, type_tiers: activeTab });
            } else {
                res = await API.post('/compta/tiers', { ...formData, type_tiers: activeTab });
            }

            if (res.data.success) {
                showStatus('success', editingId ? "MODIFICATION RÉUSSIE !" : "LIAISON COMPTABLE RÉUSSIE !");
                resetForm();
                fetchData();
            }
        } catch (err) {
            showStatus('error', "Erreur lors de l'enregistrement.");
        } finally {
            setSubmitting(false);
        }
    };

    const resetForm = () => {
        setFormData({ numero_tiers: '', nom: '', type_tiers: activeTab, compte_collectif_id: '', reference_id: '', delai_paiement: 0 });
        setSearchCpteGen("");
        setEditingId(null);
    };

    const handleSelectOperational = (item) => {
        const nouveauNom = (item.nom || item.name).toUpperCase();
        setFormData(prev => ({ ...prev, nom: nouveauNom, reference_id: item.id }));
        const currentCpte = comptesCollectifs.find(c => c.id === formData.compte_collectif_id);
        if (currentCpte) updateAuxiliarySuggestion(nouveauNom, currentCpte.numero_compte);
    };

    const updateAuxiliarySuggestion = (name, collectifCpte) => {
        const prefix = collectifCpte.toString().substring(0, 4);
        const cleanName = name.replace(/\s+/g, '').toUpperCase();
        const suggestion = (prefix + cleanName).substring(0, 14);
        setFormData(prev => ({ ...prev, numero_tiers: suggestion }));
    };

    const handleSelectCompte = (cpte) => {
        setFormData(prev => ({ ...prev, compte_collectif_id: cpte.id }));
        setSearchCpteGen(`${cpte.numero_compte} - ${cpte.intitule}`);
        setShowSuggestions(false);
        if (formData.nom) updateAuxiliarySuggestion(formData.nom, cpte.numero_compte);
    };

    const handleEdit = (t) => {
        // 🎯 Remplissage du formulaire pour modification
        setEditingId(t.id);
        setFormData({
            numero_tiers: t.numero_tiers,
            nom: t.nom,
            type_tiers: t.type_tiers,
            compte_collectif_id: t.compte_collectif_id,
            reference_id: t.reference_id,
            delai_paiement: t.delai_paiement || 0
        });
        setSearchCpteGen(t.collectif_numero ? `${t.collectif_numero}` : "");
    };

    const filteredSuggestions = comptesCollectifs.filter(c => 
        c.numero_compte.toString().includes(searchCpteGen) || 
        c.intitule.toLowerCase().includes(searchCpteGen.toLowerCase())
    ).slice(0, 8);

    const filteredProfiles = operationalData.filter(item => 
        (item.nom || item.name || "").toLowerCase().includes(searchProfile.toLowerCase())
    );

    const handleDeleteLink = async (id) => {
        if (!window.confirm("Supprimer ce lien tiers ?")) return;
        try {
            await API.delete(`/compta/tiers/${id}`);
            fetchData();
            showStatus('success', "Lien supprimé.");
        } catch (err) { showStatus('error', "Erreur."); }
    };

    return (
        <div style={{ display: 'flex', height: '100vh', width: '100vw', background: '#f8fafc', overflow: 'hidden' }}>
            <Sidebar />
            <main style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100vh' }}>
                <header style={s.header}>
                    <div style={s.headerContainer}>
                        <div>
                            <h1 style={s.headerTitle}>Plan des Tiers</h1>
                            <p style={s.headerSubtitle}>Création et Liaison des comptes auxiliaires</p>
                        </div>
                        
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                            <button onClick={handleExportCSV} disabled={isExporting} style={s.actionBtn('#f59e0b')}>
                                {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                                EXPORT CSV
                            </button>

                            <label style={s.actionBtn('#10b981')}>
                                {isImporting ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />}
                                IMPORT CSV
                                <input type="file" hidden onChange={handleImportCSV} accept=".csv" />
                            </label>

                            {status.msg && (
                                <div style={{ ...s.statusBadge, backgroundColor: status.type === 'success' ? '#f0fdf4' : '#fef2f2', color: status.type === 'success' ? '#166534' : '#991b1b' }}>
                                    {status.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                                    {status.msg}
                                </div>
                            )}
                        </div>
                    </div>
                </header>

                <div style={s.contentArea}>
                    <div style={s.tabContainer}>
                        {tabs.map(tab => (
                            <button key={tab.id} onClick={() => { setActiveTab(tab.id); resetForm(); }}
                                style={{ ...s.tabButton, color: activeTab === tab.id ? tab.color : '#64748b', borderBottom: activeTab === tab.id ? `3px solid ${tab.color}` : '3px solid transparent' }}>
                                <tab.icon size={18} /> {tab.label}
                                <span style={s.tabCount}>{tiers.filter(x => x.type_tiers === tab.id).length}</span>
                            </button>
                        ))}
                    </div>

                    <div style={s.mainGrid}>
                        <div style={s.formSide}>
                            {activeTab === 'AUTRE' && (
                                <div style={{...s.card, marginBottom: '20px', background: '#f0f9ff', borderColor: '#bae6fd'}}>
                                    <div style={{display:'flex', justifyContent:'space-between', marginBottom:'10px'}}>
                                        <h3 style={{...s.cardTitle, color: '#0369a1'}}><UserPlus size={16} /> 1. Créer le Profil Source</h3>
                                        <button onClick={() => setIsCreatingOther(!isCreatingOther)} style={s.btnToggle}>
                                            {isCreatingOther ? <X size={14}/> : <Plus size={14}/>}
                                        </button>
                                    </div>
                                    {isCreatingOther && (
                                        <div style={s.miniForm}>
                                            <input placeholder="NOM (Ex: BANQUE CENTRALE)" style={s.miniInput} value={newOther.nom} onChange={e => setNewOther({...newOther, nom: e.target.value.toUpperCase()})} />
                                            <input placeholder="NIF" style={s.miniInput} value={newOther.nif} onChange={e => setNewOther({...newOther, nif: e.target.value})} />
                                            <button onClick={handleCreateOtherEntry} disabled={submitting} style={s.btnQuickSave}>
                                                <Save size={14}/> ENREGISTRER
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div style={{...s.card, marginBottom: '20px', borderLeft: `4px solid ${activeColor}`}}>
                                <h3 style={s.cardTitle}><Search size={16} /> 2. Sélectionner Profil</h3>
                                {/* 🎯 Barre de recherche pour le petit tableau */}
                                <div style={{position: 'relative', marginBottom: '10px'}}>
                                    <Search size={14} style={{position: 'absolute', left: '10px', top: '10px', color: '#94a3b8'}} />
                                    <input 
                                        placeholder="Rechercher profil..." 
                                        style={{...s.miniInput, paddingLeft: '30px', width: '100%'}} 
                                        value={searchProfile} 
                                        onChange={(e) => setSearchProfile(e.target.value)} 
                                    />
                                </div>
                                <div style={s.scrollList}>
                                    {filteredProfiles.length > 0 ? filteredProfiles.map(item => (
                                        <div key={item.id} 
                                            style={{...s.scrollItem, background: formData.reference_id === item.id ? '#f1f5f9' : 'transparent', borderLeft: formData.reference_id === item.id ? `3px solid ${activeColor}` : '3px solid transparent'}}
                                            onClick={() => handleSelectOperational(item)}>
                                            {item.nom || item.name}
                                        </div>
                                    )) : <div style={{padding:'10px', color:'#94a3b8', fontSize:'11px'}}>Aucun profil trouvé.</div>}
                                </div>
                            </div>

                            <form onSubmit={handleLinkSubmit} style={{...s.card, overflow: 'visible'}}>
                                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                                    <h3 style={s.cardTitle}><LinkIcon size={16} /> 3. Liaison Comptable</h3>
                                    {editingId && <button onClick={resetForm} style={{fontSize:'10px', color:'#dc2626', fontWeight:'bold', cursor:'pointer', border:'none', background:'none'}}>ANNULER MODIF</button>}
                                </div>
                                <div style={s.inputGroup}>
                                    <label style={s.label}>NOM DU COMPTE</label>
                                    <input style={{...s.input, background:'#f8fafc'}} value={formData.nom} readOnly />
                                </div>
                                <div style={{...s.inputGroup, position: 'relative'}}>
                                    <label style={s.label}>COMPTE COLLECTIF</label>
                                    <input style={s.input} placeholder="Chercher 411, 401, etc..." value={searchCpteGen} onFocus={() => setShowSuggestions(true)} onChange={e => {setSearchCpteGen(e.target.value); setShowSuggestions(true);}} />
                                    {showSuggestions && searchCpteGen.length > 0 && (
                                        <div style={s.suggestionBox}>
                                            {filteredSuggestions.map(c => (
                                                <div key={c.id} style={s.suggestionItem} onClick={() => handleSelectCompte(c)}>
                                                    <strong>{c.numero_compte}</strong> - {c.intitule}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div style={s.inputGroup}>
                                    <label style={s.label}>N° AUXILIAIRE</label>
                                    <input style={{...s.input, fontWeight: '900', color: activeColor}} value={formData.numero_tiers} maxLength={14} onChange={e => setFormData({...formData, numero_tiers: e.target.value.toUpperCase()})} required />
                                </div>

                                <div style={s.inputGroup}>
                                    <label style={s.label}><Clock size={10} /> DÉLAI DE PAIEMENT (JOURS)</label>
                                    <input type="number" style={s.input} value={formData.delai_paiement} onChange={e => setFormData({...formData, delai_paiement: parseInt(e.target.value) || 0})} />
                                </div>

                                <button type="submit" disabled={submitting} style={{...s.btnSave, background: editingId ? '#f59e0b' : activeColor, marginTop: '10px'}}>
                                    <Save size={18} /> {editingId ? "METTRE À JOUR" : "RATTACHER AU PLAN"}
                                </button>
                            </form>
                        </div>

                        <div style={s.listSide}>
                            <div style={s.searchBar}><Search size={18} color="#94a3b8" /><input placeholder="Rechercher..." style={s.searchInput} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} /></div>
                            
                            <div style={s.tableScrollWrapper}>
                                <table style={s.table}>
                                    <thead style={s.theadSticky}>
                                        <tr>
                                            <th style={s.th}>AUXILIAIRE</th>
                                            <th style={s.th}>INTITULÉ</th>
                                            <th style={s.th}>DÉLAI</th>
                                            <th style={s.th}>COLLECTIF</th>
                                            <th style={s.th}>ACTIONS</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {tiers.filter(t => t.type_tiers === activeTab && (t.nom.toLowerCase().includes(searchTerm.toLowerCase()) || t.numero_tiers.includes(searchTerm))).map(t => (
                                            <tr key={t.id} style={s.tr}>
                                                <td style={{...s.td, fontWeight: '900', color: activeColor}}>{t.numero_tiers}</td>
                                                <td style={{...s.td, fontWeight: '700'}}>{t.nom}</td>
                                                <td style={s.td}>
                                                    <span style={{
                                                        padding: '2px 8px', borderRadius: '12px', fontSize: '10px', fontWeight: 'bold',
                                                        background: (t.delai_paiement > 0) ? '#dcfce7' : '#f1f5f9',
                                                        color: (t.delai_paiement > 0) ? '#166534' : '#64748b'
                                                    }}>{t.delai_paiement || 0} J</span>
                                                </td>
                                                <td style={{...s.td, color: '#64748b'}}>{t.collectif_numero}</td>
                                                <td style={{...s.td, display:'flex', gap:'5px'}}>
                                                    {/* 🎯 Bouton Modifier */}
                                                    <button onClick={() => handleEdit(t)} style={{...s.btnDel, background:'#fef3c7', color:'#d97706'}}><Edit size={14}/></button>
                                                    <button onClick={() => handleDeleteLink(t.id)} style={s.btnDel}><Trash2 size={14}/></button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

const s = {
    header: { background: 'white', padding: '15px 40px', borderBottom: '1px solid #e2e8f0' },
    headerContainer: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    headerTitle: { margin: 0, fontSize: '20px', fontWeight: '900' },
    headerSubtitle: { margin: 0, color: '#64748b', fontSize: '12px' },
    actionBtn: (color) => ({ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 15px', borderRadius: '8px', border: `1px solid ${color}30`, background: `${color}10`, color: color, fontSize: '11px', fontWeight: '900', cursor: 'pointer' }),
    statusBadge: { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 15px', borderRadius: '20px', fontSize: '11px', fontWeight: '800' },
    contentArea: { padding: '20px 40px', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' },
    tabContainer: { display: 'flex', gap: '5px', marginBottom: '20px', borderBottom: '1px solid #e2e8f0' },
    tabButton: { display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 20px', border: 'none', cursor: 'pointer', fontWeight: '800', fontSize: '12px' },
    tabCount: { background: '#f1f5f9', padding: '2px 6px', borderRadius: '6px', fontSize: '10px' },
    mainGrid: { display: 'grid', gridTemplateColumns: '360px 1fr', gap: '25px', flex: 1, overflow: 'hidden' },
    formSide: { overflowY: 'auto', paddingRight: '10px' },
    listSide: { display: 'flex', flexDirection: 'column', overflow: 'hidden' },
    tableScrollWrapper: { flex: 1, overflowY: 'auto', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' },
    theadSticky: { position: 'sticky', top: 0, background: '#f8fafc', zIndex: 5 },
    card: { background: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' },
    cardTitle: { margin: 0, fontSize: '13px', fontWeight: '900', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' },
    scrollList: { height: '140px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' },
    scrollItem: { padding: '10px 15px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' },
    miniForm: { display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' },
    miniInput: { padding: '10px', borderRadius: '6px', border: '1px solid #bae6fd', fontSize: '12px', outline: 'none' },
    btnQuickSave: { padding: '10px', background: '#0369a1', color: 'white', border: 'none', borderRadius: '6px', fontSize: '10px', fontWeight: '800', cursor: 'pointer', display: 'flex', justifyContent: 'center', gap: '8px' },
    btnToggle: { border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b' },
    inputGroup: { display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '15px' },
    label: { fontSize: '10px', fontWeight: '900', color: '#64748b' },
    input: { padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', width: '100%', outline: 'none' },
    suggestionBox: { position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', zIndex: 100, borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', maxHeight: '150px', overflowY: 'auto' },
    suggestionItem: { padding: '10px', cursor: 'pointer', fontSize: '12px', borderBottom: '1px solid #f8fafc' },
    btnSave: { width: '100%', padding: '14px', color: 'white', border: 'none', borderRadius: '10px', fontWeight: '800', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px' },
    searchBar: { background: 'white', padding: '10px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '15px' },
    searchInput: { border: 'none', outline: 'none', width: '100%', fontWeight: '600', fontSize: '13px' },
    table: { width: '100%', borderCollapse: 'collapse' },
    th: { padding: '12px 15px', fontSize: '10px', fontWeight: '900', color: '#64748b', textAlign: 'left', borderBottom: '1px solid #e2e8f0' },
    td: { padding: '12px 15px', fontSize: '12px', borderBottom: '1px solid #f1f5f9' },
    tr: { transition: 'background 0.2s' },
    btnDel: { padding: '6px', borderRadius: '6px', border: 'none', background: '#fef2f2', color: '#dc2626', cursor: 'pointer' }
};

export default PlanTiers;