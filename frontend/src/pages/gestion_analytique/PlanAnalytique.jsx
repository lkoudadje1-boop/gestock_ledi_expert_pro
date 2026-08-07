import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
    Layers, Plus, Search, Trash2, Edit, Loader2, X, Save, CheckCircle2, AlertCircle, 
    HelpCircle, Building2, GitBranch, Settings2, Download, UploadCloud // <-- Ajoute ici
} from 'lucide-react';
import { useNavigate } from 'react-router-dom'; // Import pour la redirection
import Sidebar from '../../components/Sidebar';
import API, { socket, joinCompanyRoom } from '../../services/api';

const PlanAnalytique = ({ user }) => {
    const navigate = useNavigate(); // Initialisation du hook de navigation
    const [activeTab, setActiveTab] = useState('dept'); 
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [grandCentres, setGrandCentres] = useState([]); 
    const [plans, setPlans] = useState([]); 
    const [products, setProducts] = useState([]); 
    const [accounts, setAccounts] = useState([]); 
    const [filteredAccounts, setFilteredAccounts] = useState([]);
    const [accountSearch, setAccountSearch] = useState('');
    const [showAccountList, setShowAccountList] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [currentId, setCurrentId] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [toast, setToast] = useState({ show: false, message: '', type: 'success', confirm: false, action: null });
    const [isExporting, setIsExporting] = useState(false);
const [isImporting, setIsImporting] = useState(false);
    const firstInputRef = useRef(null);

    const [formData, setFormData] = useState({
        nom: '', code_analytique: '',
        code: '', libelle: '', parent_dept_id: '',
        product_id: '', centre_cout_id: '', montant_base_theorique: 0, 
        qte_base_production: 1, compte_analytique: ''
    });

    const handleAlphaNumericInput = (e, field) => {
        const val = e.target.value.toUpperCase();
        const cleanVal = val.replace(/[^A-Z0-9]/g, '').slice(0, 8);
        setFormData({ ...formData, [field]: cleanVal });
    };

    const handlePureNumericInput = (e, field) => {
        const val = e.target.value;
        const cleanVal = val.replace(/\D/g, '').slice(0, 8);
        setFormData({ ...formData, [field]: cleanVal });
    };
    const handleExportCSV = async () => {
    setIsExporting(true);
    try {
        const url = activeTab === 'dept' ? '/analytique/departements/export' : '/analytique/plan/export';
        const fileName = activeTab === 'dept' ? 'Grands_Centres.csv' : 'Plan_Analytique.csv';
        
        const response = await API.get(url, { responseType: 'blob' });
        const blobUrl = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = blobUrl;
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        link.remove();
        showToast("✅ Exportation réussie");
    } catch (err) {
        showToast("❌ Erreur lors de l'exportation", "error");
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
        const url = activeTab === 'dept' ? '/analytique/departements/import' : '/analytique/plan/import';
        const res = await API.post(url, fData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        if (res.data.success) {
            showToast(`✅ ${res.data.message}`);
            fetchData();
        }
    } catch (err) {
        showToast(err.response?.data?.error || "Erreur d'importation", "error");
    } finally {
        setIsImporting(false);
        e.target.value = null; // Reset l'input file
    }
};
    const getBaseUrl = () => {
        if (activeTab === 'dept') return '/analytique/departements';
        if (activeTab === 'plan') return '/analytique/plan';
        return '/analytique/details';
    };


    const resetFormData = () => {
        setFormData({
            nom: '', code_analytique: '', 
            code: '', libelle: '', parent_dept_id: '',
            product_id: '', centre_cout_id: '', montant_base_theorique: 0, 
            qte_base_production: 1, compte_analytique: ''
        });
        setAccountSearch('');
        setTimeout(() => firstInputRef.current?.focus(), 100);
    };

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await API.get(`${getBaseUrl()}/liste`);
            setData(res.data.data || []);

            if (activeTab === 'plan') {
                const resDept = await API.get('/analytique/departements/liste');
                setGrandCentres(resDept.data.data || []);
            }

            if (activeTab === 'details') {
                const [resProd, resPSF, resPlan, resAcc] = await Promise.all([
                    API.get('/products'), 
                    API.get('/semi-finished-products'), 
                    API.get('/analytique/plan/liste'),
                    API.get('/plan-comptable/liste')
                ]);
                setProducts([...(resProd.data || []), ...(resPSF.data || [])]);
                setPlans(resPlan.data.data || []);
                const allAcc = resAcc.data.data || [];
                setAccounts(allAcc.filter(acc => acc.numero_compte.toString().startsWith('6') || acc.numero_compte.toString().startsWith('7')));
            }
        } catch (err) { 
            showToast("Erreur de chargement", "error");
        } finally { setLoading(false); }
    }, [activeTab]);
    useEffect(() => {
        // Nettoyage de l'interface au changement d'onglet
        setShowForm(false);
        setIsEditing(false);
        setAccountSearch('');
        setSearchTerm('');
        resetFormData();

        // Chargement des données
        fetchData();

        // Synchronisation temps réel (SNC)
        if (socket) {
            // ✅ Utilisation sécurisée de joinCompanyRoom
            if (typeof joinCompanyRoom === 'function') {
                joinCompanyRoom();
            }

            const handleAnalyticUpdate = (event) => {
                const analyticTables = ['analytic_departments', 'analytic_plans', 'analytic_details'];
                if (event && analyticTables.includes(event.table)) {
                    console.log("🔄 SNC Sync : Refresh Analytique auto");
                    fetchData();
                }
            };

            socket.on('DATA_EVENT', handleAnalyticUpdate);
            // Backup pour signal spécifique
            socket.on('REFRESH_PLAN_ANALYTIQUE', fetchData);

            return () => {
                socket.off('DATA_EVENT', handleAnalyticUpdate);
                socket.off('REFRESH_PLAN_ANALYTIQUE', fetchData);
            };
        }
    }, [activeTab, fetchData]);

    const handleAccountInput = (val) => {
        setAccountSearch(val);
        if (val.trim() !== '') {
            const searchVal = val.toLowerCase();
            const filtered = accounts.filter(acc => 
                acc.numero_compte.toString().startsWith(searchVal) || 
                acc.intitule.toLowerCase().includes(searchVal)
            );
            setFilteredAccounts(filtered);
            setShowAccountList(true);
        } else { setShowAccountList(false); }
    };

    const selectAccount = (acc) => {
        setFormData(prev => ({ ...prev, compte_analytique: acc.numero_compte }));
        setAccountSearch(`${acc.numero_compte} - ${acc.intitule}`);
        setShowAccountList(false);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        let payload = {};

        if (activeTab === 'dept') {
            payload = { nom: formData.nom, code_analytique: formData.code_analytique };
        } else if (activeTab === 'plan') {
            payload = { code: formData.code, libelle: formData.libelle, parent_dept_id: formData.parent_dept_id };
        } else {
            payload = {
                product_id: formData.product_id,
                plan_analytique_id: formData.centre_cout_id, 
                montant_base_theorique: formData.montant_base_theorique,
                qte_base_production: formData.qte_base_production,
                compte_analytique: formData.compte_analytique
            };
        }

        try {
            const endpoint = isEditing ? `${getBaseUrl()}/modifier/${currentId}` : `${getBaseUrl()}/creer`;
            const res = isEditing ? await API.put(endpoint, payload) : await API.post(endpoint, payload);

            if (res.data.success) {
                showToast(res.data.message || "Enregistré avec succès", 'success');
                if (!isEditing) resetFormData();
                fetchData();
            }
        } catch (err) { 
            showToast(err.response?.data?.error || "Erreur de contrainte", 'error'); 
        } finally { setIsSubmitting(false); }
    };

    const handleEdit = (item) => {
        setIsEditing(true); 
        setCurrentId(item.id); 
        setShowForm(true);
        setFormData({
            nom: item.nom || '',
            code_analytique: item.code_analytique || '',
            code: item.code || '',
            libelle: item.libelle || '',
            parent_dept_id: item.parent_dept_id || '',
            product_id: item.product_id || item.semi_fini_id || '', 
            centre_cout_id: item.plan_analytique_id || '',
            montant_base_theorique: item.montant_base_theorique || 0,
            qte_base_production: item.qte_base_production || 1,
            compte_analytique: item.compte_analytique || ''
        });
        if (activeTab === 'details') {
            const acc = accounts.find(a => a.numero_compte === item.compte_analytique);
            setAccountSearch(acc ? `${acc.numero_compte} - ${acc.intitule}` : item.compte_analytique || '');
        }
    };

    const confirmDelete = (id) => {
        showToast("Voulez-vous supprimer cet élément ?", "warning", true, () => executeDelete(id));
    };

    const executeDelete = async (id) => {
        try {
            const res = await API.delete(`${getBaseUrl()}/supprimer/${id}`);
            if(res.data.success) {
                showToast("Suppression réussie", 'success');
                fetchData();
            }
        } catch (err) { showToast(err.response?.data?.error || "Action impossible", 'error'); }
    };

    const showToast = (message, type = 'success', confirm = false, action = null) => {
        setToast({ show: true, message, type, confirm, action });
        if (!confirm) setTimeout(() => setToast(prev => ({ ...prev, show: false })), 3000);
    };

    const filteredItems = data.filter(item => 
        (item.nom || item.libelle || item.product_nom || item.code || item.code_analytique || "").toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div style={layoutStyle}>
            {toast.show && (
                <div style={{...toastStyle, background: toast.type === 'error' ? '#fee2e2' : toast.type === 'warning' ? '#fffbeb' : '#f0fdf4', border: `2px solid ${toast.type === 'error' ? '#ef4444' : toast.type === 'warning' ? '#f59e0b' : '#22c55e'}`}}>
                    <div style={{display:'flex', flexDirection:'column', gap:'10px'}}>
                        <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                            {toast.type === 'warning' ? <HelpCircle color="#f59e0b" /> : toast.type === 'error' ? <AlertCircle color="#ef4444" /> : <CheckCircle2 color="#22c55e" />}
                            <span style={{fontWeight: '900', fontSize: '13px', color:'#1e293b'}}>{toast.message}</span>
                        </div>
                        {toast.confirm && (
                            <div style={{display:'flex', gap:'10px', justifyContent:'flex-end'}}>
                                <button onClick={() => setToast({show:false})} style={btnSmallSec}>NON</button>
                                <button onClick={() => { toast.action(); setToast({show:false}); }} style={btnSmallDanger}>OUI, SUPPRIMER</button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <Sidebar />
            <main style={mainStyle}>
<header style={headerStyle}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
        <div style={iconBox}>{activeTab === 'dept' ? <Building2 size={24} color="white"/> : <GitBranch size={24} color="white"/>}</div>
        <div>
            <h1 style={titleStyle}>{activeTab === 'dept' ? 'GRANDS CENTRES' : activeTab === 'plan' ? 'SUBDIVISIONS' : 'DÉTAILS COÛTS'}</h1>
            <span style={subtitleStyle}>ORGANISATION ANALYTIQUE</span>
        </div>
    </div>
    
    <div style={{display:'flex', gap:'10px', alignItems: 'center'}}>
        {/* 🚀 AJOUT : Boutons Import/Export (Cachés pour l'onglet Détails Coûts) */}
        {activeTab !== 'details' && (
            <>
                <button onClick={handleExportCSV} disabled={isExporting} style={btnSecondary}>
                    {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} EXPORT
                </button>
                
                <label style={btnSuccess}>
                    {isImporting ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />} IMPORT
                    <input type="file" hidden onChange={handleImportCSV} accept=".csv" />
                </label>
            </>
        )}

        <button style={btnRepartition} onClick={() => navigate('/compta/repartitions/config')}>
            <Settings2 size={18} /> CONFIG. RÉPARTITIONS AUTO
        </button>
        
        <button style={showForm ? btnCancel : btnPrimary} onClick={() => { setShowForm(!showForm); setIsEditing(false); resetFormData(); }}>
            {showForm ? <X size={18} /> : <Plus size={18} />} {showForm ? 'FERMER' : 'AJOUTER'}
        </button>
    </div>
</header>

                <div style={tabContainer}>
                    <button style={activeTab === 'dept' ? tabActive : tabInactive} onClick={() => setActiveTab('dept')}>1. GRANDS CENTRES</button>
                    <button style={activeTab === 'plan' ? tabActive : tabInactive} onClick={() => setActiveTab('plan')}>2. SUBDIVISIONS</button>
                    <button style={activeTab === 'details' ? tabActive : tabInactive} onClick={() => setActiveTab('details')}>3. COÛTS FT</button>
                </div>

                <div style={contentBody}>
                    <div style={searchBar}>
                        <Search size={18} color="#64748b" />
                        <input placeholder="Rechercher..." style={searchInput} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}/>
                    </div>

                    {showForm && (
                        <div style={formContainer}>
                            <form onSubmit={handleSave} style={formStyle}>
                                {activeTab === 'dept' && (
                                    <>
                                        <div style={inputGrp}><label style={labelS}>Code</label><input ref={firstInputRef} style={inputS} placeholder="ADM2026" value={formData.code_analytique} onChange={(e) => handleAlphaNumericInput(e, 'code_analytique')} required/></div>
                                        <div style={inputGrp}><label style={labelS}>Nom du Centre</label><input style={inputS} placeholder="ADMINISTRATION" value={formData.nom} onChange={e => setFormData({...formData, nom: e.target.value.toUpperCase()})} required/></div>
                                    </>
                                )}
                                {activeTab === 'plan' && (
                                    <>
                                        <div style={inputGrp}><label style={labelS}>Grand Centre</label>
                                            <select ref={firstInputRef} style={inputS} value={formData.parent_dept_id} onChange={e => setFormData({...formData, parent_dept_id: e.target.value})} required>
                                                <option value="">-- Choisir --</option>
                                                {grandCentres.map(gc => <option key={gc.id} value={gc.id}>{gc.nom}</option>)}
                                            </select>
                                        </div>
                                        <div style={inputGrp}><label style={labelS}>Code Subdiv.</label><input style={inputS} value={formData.code} onChange={(e) => handlePureNumericInput(e, 'code')} required/></div>
                                        <div style={inputGrp}><label style={labelS}>Désignation</label><input style={inputS} value={formData.libelle} onChange={e => setFormData({...formData, libelle: e.target.value.toUpperCase()})} required/></div>
                                    </>
                                )}
                                {activeTab === 'details' && (
                                    <>
                                        <div style={inputGrp}><label style={labelS}>Produit / PSF</label>
                                            <select ref={firstInputRef} style={inputS} value={formData.product_id} onChange={e => setFormData({...formData, product_id: e.target.value})} required>
                                                <option value="">-- Choisir --</option>
                                                {products.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
                                            </select>
                                        </div>
                                        <div style={inputGrp}><label style={labelS}>Subdivision</label>
                                            <select style={inputS} value={formData.centre_cout_id} onChange={e => setFormData({...formData, centre_cout_id: e.target.value})} required>
                                                <option value="">-- Choisir --</option>
                                                {plans.map(s => <option key={s.id} value={s.id}>{s.libelle}</option>)}
                                            </select>
                                        </div>
                                        <div style={{...inputGrp, position: 'relative'}}>
                                            <label style={labelS}>Compte Liaison (6/7)</label>
                                            <input style={inputS} value={accountSearch} onChange={e => handleAccountInput(e.target.value)} onFocus={() => accountSearch.length > 0 && setShowAccountList(true)} onBlur={() => setTimeout(() => setShowAccountList(false), 200)} />
                                            {showAccountList && (
                                                <div style={suggestionBox}>
                                                    {filteredAccounts.map(acc => (
                                                        <div key={acc.id} style={suggestionItem} onMouseDown={() => selectAccount(acc)}><span style={{fontWeight: 900}}>{acc.numero_compte}</span> - {acc.intitule}</div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <div style={inputGrp}><label style={labelS}>Montant Total</label><input type="number" style={inputS} value={formData.montant_base_theorique} onChange={e => setFormData({...formData, montant_base_theorique: e.target.value})} /></div>
                                        <div style={inputGrp}><label style={labelS}>Qté Base</label><input type="number" style={inputS} value={formData.qte_base_production} onChange={e => setFormData({...formData, qte_base_production: e.target.value})} /></div>
                                    </>
                                )}
                                <button type="submit" style={btnSubmit} disabled={isSubmitting}>{isSubmitting ? <Loader2 className="animate-spin" size={16}/> : <Save size={16}/>} ENREGISTRER</button>
                            </form>
                        </div>
                    )}

                    <div style={tableWrapper}>
                        <table style={tableStyle}>
                            <thead style={theadStyle}>
                                <tr>
                                    <th style={thStyle}>{activeTab === 'details' ? 'COMPTE' : 'CODE'}</th>
                                    <th style={thStyle}>DÉSIGNATION / PRODUIT</th>
                                    {activeTab === 'details' ? (
                                        <>
                                            <th style={thStyle}>LIAISON COMPTE</th>
                                            <th style={thStyle}>MONTANT TOTAL</th>
                                            <th style={thStyle}>QTÉ BASE</th>
                                            <th style={thStyle}>COÛT UNITAIRE</th>
                                        </>
                                    ) : (
                                        <th style={thStyle}>RATTACHEMENT</th>
                                    )}
                                    <th style={{...thStyle, textAlign:'center'}}>ACTIONS</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan="7" style={{textAlign:'center', padding:'20px'}}><Loader2 className="animate-spin" /></td></tr>
                                ) : filteredItems.map(item => (
                                    <tr key={item.id} style={trStyle}>
                                        <td style={tdStyle}><span style={badgeCode}>{item.code || item.code_analytique || item.compte_analytique}</span></td>
                                        <td style={tdStyle}>
                                            <div style={{fontWeight: 800}}>{item.nom || item.libelle || item.product_nom}</div>
                                            {activeTab === 'details' && <div style={{fontSize: '10px', color: '#64748b'}}>Centre : {item.plan_libelle}</div>}
                                        </td>
                                        {activeTab === 'details' ? (
                                            <>
                                                <td style={tdStyle}>
                                                    <div style={{display: 'flex', flexDirection: 'column'}}>
                                                        <span style={{fontWeight: '900', color: '#2563eb', fontSize: '13px'}}>{item.compte_analytique || '-'}</span>
                                                        <span style={{fontSize: '10px', color: '#64748b', fontStyle: 'italic', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                                                            {item.compte_intitule || 'Libellé non chargé'}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td style={tdStyle}>{Number(item.montant_base_theorique).toLocaleString()} F</td>
                                                <td style={tdStyle}>{Number(item.qte_base_production).toLocaleString()}</td>
                                                <td style={tdStyle}><span style={badgeUnitaire}>{(item.montant_base_theorique / (item.qte_base_production || 1)).toFixed(2)} F</span></td>
                                            </>
                                        ) : (
                                            <td style={tdStyle}>{item.parent_dept_nom || '-'}</td>
                                        )}
                                        <td style={{...tdStyle, textAlign:'center'}}>
                                            <div style={{display:'flex', justifyContent:'center', gap:'15px'}}>
                                                <Edit size={16} color="#3b82f6" cursor="pointer" onClick={() => handleEdit(item)} />
                                                <Trash2 size={16} color="#ef4444" cursor="pointer" onClick={() => confirmDelete(item.id)} />
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>
        </div>
    );
};

// --- STYLES ---
const suggestionBox = { position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #cbd5e1', borderRadius: '8px', zIndex: 10000, maxHeight: '250px', overflowY: 'auto', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', marginTop: '5px' };
const suggestionItem = { padding: '12px 15px', fontSize: '12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' };
const layoutStyle = { display: 'flex', height: '100vh', background: '#f8fafc' };
const mainStyle = { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' };
const headerStyle = { background: 'white', padding: '15px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0' };
const iconBox = { background: '#0f172a', padding: '10px', borderRadius: '10px' };
const titleStyle = { margin: 0, fontSize: '18px', fontWeight: '900' };
const subtitleStyle = { fontSize: '11px', color: '#64748b', fontWeight: '800' };
const btnPrimary = { background: '#2563eb', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' };
const btnRepartition = { background: '#f1f5f9', color: '#0f172a', border: '1px solid #cbd5e1', padding: '10px 20px', borderRadius: '8px', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' };
const btnCancel = { background: '#64748b', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' };
const tabContainer = { display: 'flex', gap: '5px', padding: '10px 40px', background: 'white', borderBottom: '1px solid #e2e8f0' };
const tabActive = { padding: '12px 25px', border: 'none', borderRadius: '8px 8px 0 0', cursor: 'pointer', fontWeight: '900', fontSize: '11px', background: '#0f172a', color: 'white' };
const tabInactive = { padding: '12px 25px', border: 'none', borderRadius: '8px 8px 0 0', cursor: 'pointer', fontWeight: '800', fontSize: '11px', background: '#f1f5f9', color: '#64748b' };
const contentBody = { padding: '20px 40px', flex: 1, overflowY: 'auto' };
const formContainer = { background: 'white', padding: '20px', borderRadius: '12px', border: '2px solid #0f172a', marginBottom: '20px' };
const formStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '20px', alignItems: 'flex-end' };
const inputGrp = { display: 'flex', flexDirection: 'column', gap: '5px', position:'relative' };
const labelS = { fontSize: '10px', fontWeight: '900', color: '#1e293b', textTransform: 'uppercase' };
const inputS = { padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: '700', outline: 'none' };
const btnSubmit = { background: '#0f172a', color: 'white', border: 'none', padding: '12px', borderRadius: '8px', fontWeight: '900', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' };
const searchBar = { display: 'flex', alignItems: 'center', gap: '10px', background: 'white', padding: '10px 15px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '20px', width: '350px' };
const searchInput = { border: 'none', outline: 'none', width: '100%', fontWeight: '700' };
const tableWrapper = { background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' };
const tableStyle = { width: '100%', borderCollapse: 'collapse' };
const theadStyle = { background: '#f8fafc', borderBottom: '2px solid #e2e8f0' };
const thStyle = { padding: '15px', textAlign: 'left', fontSize: '11px', fontWeight: 900, color: '#64748b', textTransform: 'uppercase' };
const tdStyle = { padding: '15px', fontSize: '13px', borderBottom: '1px solid #f1f5f9' };
const trStyle = { borderBottom: '1px solid #f1f5f9' };
const badgeCode = { background: '#0f172a', color: 'white', padding: '4px 10px', borderRadius: '6px', fontWeight: 900, fontSize: '11px' };
const badgeUnitaire = { background: '#f0fdf4', color: '#166534', padding: '4px 8px', borderRadius: '4px', fontWeight: '900' };
const toastStyle = { position: 'fixed', top: '20px', right: '20px', padding: '20px', borderRadius: '12px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', zIndex: 9999, minWidth: '350px' };
const btnSmallSec = { background: '#94a3b8', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '6px', fontSize: '11px', fontWeight: '800', cursor: 'pointer' };
const btnSmallDanger = { background: '#ef4444', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '6px', fontSize: '11px', fontWeight: '900', cursor: 'pointer' };
const btnSecondary = { 
    background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', 
    padding: '10px 18px', borderRadius: '8px', fontWeight: '900', 
    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px' 
};

const btnSuccess = { 
    background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', 
    padding: '10px 18px', borderRadius: '8px', fontWeight: '900', 
    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px' 
};
export default PlanAnalytique;