import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
    Loader2, Save, PlusCircle, X, BookOpen, Settings, Link as LinkIcon, Trash2, Edit,
    Wallet, ShoppingCart, BadgeEuro, FileText, RefreshCw, AlertTriangle, CheckCircle,
    Download, UploadCloud
} from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import { getUserPermissions } from '../../utils/permissions_utils'; // 🔑 IMPORTATION DU SÉCURISEUR
import API, { socket } from '../../services/api';

const CodeJournal = ({ user }) => {
    // 🔑 EXTRACTION COMPTABLE ET SOUPLITUDE DES TYPES (true, 1, 'true', '1') POUR LES 5 BOUTONS DE JOURNAUX
    const userPerms = useMemo(() => getUserPermissions(), []);
    
    const canCreateJournal = userPerms['compta_jr_btn_create'] === true || userPerms['compta_jr_btn_create'] === 1 || userPerms['compta_jr_btn_create'] === 'true' || userPerms['compta_jr_btn_create'] === '1';
    const canExportJournal = userPerms['compta_jr_btn_export'] === true || userPerms['compta_jr_btn_export'] === 1 || userPerms['compta_jr_btn_export'] === 'true' || userPerms['compta_jr_btn_export'] === '1';
    const canImportJournal = userPerms['compta_jr_btn_import'] === true || userPerms['compta_jr_btn_import'] === 1 || userPerms['compta_jr_btn_import'] === 'true' || userPerms['compta_jr_btn_import'] === '1';
    const canModifyJournal = userPerms['compta_jr_btn_modify'] === true || userPerms['compta_jr_btn_modify'] === 1 || userPerms['compta_jr_btn_modify'] === 'true' || userPerms['compta_jr_btn_modify'] === '1';
    const canDeleteJournal = userPerms['compta_jr_btn_delete'] === true || userPerms['compta_jr_btn_delete'] === 1 || userPerms['compta_jr_btn_delete'] === 'true' || userPerms['compta_jr_btn_delete'] === '1';

    const [journaux, setJournaux] = useState([]);
    const [comptesPlan, setComptesPlan] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [hasOpenExercice, setHasOpenExercice] = useState(true);
    const [isEditing, setIsEditing] = useState(false);

    const [toast, setToast] = useState({ show: false, message: '', type: 'success', action: null });

    const initialFormData = {
        id: '', 
        code: '', 
        libelle: '', 
        type_journal: 'GENERAL', 
        mode_numerotation: 'AUTO',
        compte_contrepartie_id: '',
        contrepartie_auto: 0,
        has_entries: 0 
    };

    const [formData, setFormData] = useState(initialFormData);

    const showToast = (message, type = 'success', action = null) => {
        setToast({ show: true, message, type, action });
        if (!action) {
            setTimeout(() => setToast({ show: false, message: '', type: 'success', action: null }), 4000);
        }
    };

    // --- LOGIQUE IMPORT / EXPORT CSV SÉCURISÉE ---
    const handleExportCSV = async () => {
        if (!canExportJournal) {
            return showToast("🛑 ACCÈS REFUSÉ : Votre profil ne détient pas la permission d'exporter le fichier CSV.", "error");
        }
        setIsExporting(true);
        try {
            const response = await API.get('/plan-comptable/journaux/export', { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'Codes_Journaux_Compta.csv');
            document.body.appendChild(link);
            link.click();
            link.remove();
            showToast("✅ Modèle CSV exporté avec succès.");
        } catch (err) {
            showToast("❌ Erreur lors de l'exportation.", "error");
        } finally {
            setIsExporting(false);
        }
    };

    const handleImportCSV = async (e) => {
        if (!canImportJournal) {
            e.target.value = null;
            return showToast("🛑 ACCÈS REFUSÉ : Votre profil ne détient pas la permission d'importer le fichier CSV.", "error");
        }
        const file = e.target.files[0];
        if (!file) return;

        setIsImporting(true);
        const fData = new FormData();
        fData.append('file', file);

        try {
            const res = await API.post('/plan-comptable/journaux/import', fData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            if (res.data.success) {
                showToast(`✅ ${res.data.message}`);
                fetchInitialData();
            }
        } catch (err) {
            showToast(err.response?.data?.error || "Erreur lors de l'importation.", "error");
        } finally {
            setIsImporting(false);
            e.target.value = null;
        }
    };

    const fetchInitialData = async () => {
        setLoading(true);
        try {
            const [resJ, resP, resE] = await Promise.all([
                API.get('/plan-comptable/journaux/liste'), 
                API.get('/plan-comptable/liste'),
                API.get('/plan-comptable/exercices/liste') 
            ]);
            setJournaux(resJ.data.data || []);
            const ouvert = (resE.data.data || []).some(ex => ex.statut === 'OUVERT');
            setHasOpenExercice(ouvert);
            setComptesPlan(resP.data.data?.filter(c => c.numero_compte?.toString().startsWith('5')) || []);
        } catch (err) { console.error(err); } 
        finally { setLoading(false); }
    };

    useEffect(() => {
        fetchInitialData();
        if (socket) {
            const userStored = JSON.parse(localStorage.getItem('user') || '{}');
            const companyId = userStored.company_id || userStored.companyId;
            if (companyId) socket.emit('join_company', String(companyId));
            socket.on('REFRESH_JOURNAUX', fetchInitialData);
            socket.on('DATA_EVENT', (event) => {
                if (event.table === 'journals' || event.table === 'exercises') {
                    console.log("🔄 Mise à jour des codes journaux détectée...");
                    fetchInitialData();
                }
            });
            return () => {
                socket.off('REFRESH_JOURNAUX');
                socket.off('DATA_EVENT');
            };
        }
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // 🔑 SÉCURITÉ DOUBLE VÉROU NETWORKING BEFORE API CALL
        if (isEditing && !canModifyJournal) {
            return showToast("🛑 ACCÈS REFUSÉ : Action de modification de journal non autorisée.", "error");
        }
        if (!isEditing && !canCreateJournal) {
            return showToast("🛑 ACCÈS REFUSÉ : Action de création de journal non autorisée.", "error");
        }

        if (formData.type_journal === 'TRESORERIE' && !formData.compte_contrepartie_id) {
            showToast("Veuillez lier un compte de trésorerie (Classe 5)", "error");
            return;
        }

        setIsSubmitting(true);
        try {
            if (isEditing) {
                await API.put(`/plan-comptable/journaux/modifier/${formData.id}`, formData);
                showToast("Journal mis à jour !");
            } else {
                await API.post('/plan-comptable/journaux/creer', formData);
                showToast("Nouveau journal créé !");
            }
            setShowForm(false);
            setIsEditing(false);
            fetchInitialData();
            setFormData(initialFormData);
        } catch (err) {
            showToast(err.response?.data?.error || "Erreur de traitement", "error");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = (id, hasEntries) => {
        // 🔑 SÉCURITÉ DE CLIC DE SUPPRESSION
        if (!canDeleteJournal) {
            return showToast("🛑 ACCÈS REFUSÉ : Privilège de suppression de journal manquant pour votre profil.", "error");
        }

        if (hasEntries > 0) {
            showToast(`🚫 IMPOSSIBLE DE SUPPRIMER : Ce journal contient déjà des écritures comptables.`, "error");
            return;
        }

        const confirmDelete = async () => {
            setToast({ ...toast, show: false });
            try {
                const res = await API.delete(`/plan-comptable/journaux/supprimer/${id}`);
                if (res.data.success) {
                    showToast("✅ Code journal supprimé.");
                    fetchInitialData();
                }
            } catch (err) {
                showToast("Erreur serveur lors de la suppression.", "error");
            }
        };

        showToast("Confirmez-vous la suppression de ce code journal ?", "warning", confirmDelete);
    };

    const getTypeIcon = (type) => {
        switch(type) {
            case 'TRESORERIE': return <Wallet size={16} color="#10b981" />;
            case 'VENTE': return <BadgeEuro size={16} color="#2563eb" />;
            case 'ACHAT': return <ShoppingCart size={16} color="#f59e0b" />;
            default: return <FileText size={16} color="#64748b" />;
        }
    };

    const handleEdit = (j) => {
        // 🔑 SÉCURITÉ DE SELECTION GRAPHIQUE : Bloquer si la permission de modification est absente
        if (!canModifyJournal) {
            return showToast("🛑 ACCÈS REFUSÉ : Privilège de modification de journal manquant.", "error");
        }
        setFormData({
            id: j.id, code: j.code, libelle: j.libelle, type_journal: j.type_journal,
            mode_numerotation: j.mode_numerotation,
            compte_contrepartie_id: j.compte_contrepartie_id || '',
            contrepartie_auto: j.contrepartie_auto || 0,
            has_entries: j.has_entries || 0 
        });
        setIsEditing(true);
        setShowForm(true);
    };

    return (
        <div style={layoutStyle}>
            <Sidebar />
            <main style={mainStyle}>
                <header style={headerStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div style={iconBox}><BookOpen size={24} color="white" /></div>
                        <div>
                            <h1 style={titleStyle}>CODES JOURNAUX</h1>
                            <span style={subtitleStyle}>Configuration des journaux et numérotation séquentielle</span>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        {/* 🔑 MAPPAGE DU BOUTON EXPORT SANS BLOCAGE MUET */}
                        <button 
                            onClick={() => {
                                if (!canExportJournal) {
                                    showToast("🛑 ACCÈS REFUSÉ : Votre profil ne détient pas la permission d'exporter les codes journaux.", "error");
                                } else {
                                    handleExportCSV();
                                }
                            }} 
                            style={{
                                ...btnAction(canExportJournal ? '#f59e0b' : '#cbd5e1'),
                                color: canExportJournal ? '#ffffff' : '#64748b',
                                cursor: 'pointer'
                            }}
                        >
                            {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} EXPORT
                        </button>
                        
                        {/* 🔑 MAPPAGE DU BOUTON IMPORT SANS BLOCAGE MUET */}
                        <label 
                            onClick={(e) => {
                                if (!canImportJournal) {
                                    e.preventDefault();
                                    showToast("🛑 ACCÈS REFUSÉ : Votre profil ne détient pas la permission d'importer des fichiers.", "error");
                                }
                            }}
                            style={{
                                ...btnAction(canImportJournal ? '#10b981' : '#cbd5e1'),
                                color: canImportJournal ? '#ffffff' : '#64748b',
                                cursor: canImportJournal ? 'pointer' : 'not-allowed'
                            }}
                        >
                            {isImporting ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />} IMPORT
                            <input type="file" hidden={!canImportJournal} onChange={handleImportCSV} accept=".csv" disabled={!canImportJournal} />
                        </label>

                        {/* 🔑 MAPPAGE DU BOUTON NOUVEAU JOURNAL SANS BLOCAGE MUET */}
                        {!showForm && hasOpenExercice && (
                            <button 
                                onClick={() => {
                                    if (!canCreateJournal) {
                                        showToast("🛑 ACCÈS REFUSÉ : Votre profil ne détient pas la permission de créer un nouveau journal.", "error");
                                    } else {
                                        setFormData(initialFormData); 
                                        setIsEditing(false); 
                                        setShowForm(true);
                                    }
                                }} 
                                style={{
                                    ...btnPrimary,
                                    background: canCreateJournal ? '#2563eb' : '#cbd5e1',
                                    color: canCreateJournal ? '#ffffff' : '#64748b',
                                    cursor: 'pointer'
                                }}
                            >
                                <PlusCircle size={18} /> {canCreateJournal ? "NOUVEAU JOURNAL" : "Accès restreint"}
                            </button>
                        )}
                    </div>
                </header>

                {showForm && (
                    <div style={inlineFormContainer}>
                        <form onSubmit={handleSubmit} style={inlineForm}>
                            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'15px'}}>
                                <h2 style={{margin:0, fontSize:'14px', fontWeight:900, color:'#2563eb'}}>
                                    {isEditing ? `MODIFICATION JOURNAL : ${formData.code}` : "PARAMÉTRAGE JOURNAL"}
                                </h2>
                                <button type="button" onClick={() => {setShowForm(false); setIsEditing(false);}} style={btnSmallCancel}><X size={16}/></button>
                            </div>
                            <div style={formRow}>
                                <div style={{width:'80px'}}>
                                    <label style={label}>CODE</label>
                                    <input required style={{...input, background: isEditing ? '#f1f5f9' : 'white'}} readOnly={isEditing} maxLength={6} value={formData.code} onChange={e => setFormData({...formData, code: e.target.value.toUpperCase().trim()})} />
                                </div>
                                <div style={{flex:1.5}}>
                                    <label style={label}>LIBELLÉ DU JOURNAL</label>
                                    <input required style={input} value={formData.libelle} onChange={e => setFormData({...formData, libelle: e.target.value.toUpperCase()})} />
                                </div>
                                <div style={{width:'150px'}}>
                                    <label style={label}>TYPE</label>
                                    <select style={input} disabled={formData.has_entries > 0} value={formData.type_journal} onChange={e => setFormData({...formData, type_journal: e.target.value, compte_contrepartie_id: '', contrepartie_auto: 0})}>
                                        <option value="GENERAL">GÉNÉRAL / OD</option>
                                        <option value="ACHAT">ACHATS</option>
                                        <option value="VENTE">VENTES</option>
                                        <option value="TRESORERIE">TRÉSORERIE</option>
                                    </select>
                                </div>
                                {formData.type_journal === 'TRESORERIE' && (
                                    <div style={tresoSection}>
                                        <div style={{flex: 1}}>
                                            <label style={{...label, color: '#059669'}}>COMPTE RATTACHÉ {formData.has_entries > 0 && "🔒"}</label>
                                            <select required style={inputTreso} disabled={formData.has_entries > 0} value={formData.compte_contrepartie_id} onChange={e => setFormData({...formData, compte_contrepartie_id: e.target.value})}>
                                                <option value="">-- CHOISIR --</option>
                                                {comptesPlan.map(c => <option key={c.id} value={c.id}>{c.numero_compte} - {c.intitule}</option>)}
                                            </select>
                                        </div>
                                        <div style={checkboxWrapper}>
                                            <input type="checkbox" id="cp_auto" disabled={formData.has_entries > 0} checked={formData.contrepartie_auto === 1} onChange={e => setFormData({...formData, contrepartie_auto: e.target.checked ? 1 : 0})} />
                                            <label htmlFor="cp_auto" style={checkboxLabel}>Contrepartie Auto.</label>
                                        </div>
                                    </div>
                                )}

                                                            <div style={{width:'130px'}}>
                                    <label style={label}>NUMÉROTATION</label>
                                    <select style={input} value={formData.mode_numerotation} onChange={e => setFormData({...formData, mode_numerotation: e.target.value})}>
                                        <option value="AUTO">AUTO (1, 2, 3...)</option>
                                        <option value="MANUEL">MANUELLE</option>
                                    </select>
                                </div>
                                <div style={{alignSelf:'flex-end'}}>
                                    <button type="submit" disabled={isSubmitting} style={btnSubmitInline}>
                                        {isSubmitting ? <Loader2 className="animate-spin" size={16}/> : (isEditing ? <CheckCircle size={16}/> : <Save size={16}/>)}
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                )}

                <div style={contentStyle}>
                    {loading ? ( <div style={center}><Loader2 className="animate-spin" size={40} color="#2563eb" /></div> ) : (
                        <div style={tableWrapper}>
                            <table style={tableStyle}>
                                <thead>
                                    <tr>
                                        <th style={{...thStyle, width:'50px', textAlign:'center'}}>Type</th>
                                        <th style={thStyle}>Code</th>
                                        <th style={thStyle}>Libellé</th>
                                        <th style={thStyle}>Numérotation</th>
                                        <th style={thStyle}>Rattaché / Mode</th>
                                        <th style={thStyle}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {journaux.map(j => {
                                        // Vérification si l'utilisateur possède au moins un droit d'action sur la ligne
                                        const hasRowAccess = canModifyJournal || canDeleteJournal;

                                        return (
                                            <tr key={j.id} style={trStyle}>
                                                <td style={{...tdStyle, textAlign:'center'}}>{getTypeIcon(j.type_journal)}</td>
                                                <td style={tdStyle}><span style={badgeCode}>{j.code}</span></td>
                                                <td style={{...tdStyle, fontWeight:700, color:'#1e293b'}}>{j.libelle}</td>
                                                <td style={tdStyle}>
                                                    <span style={{fontSize: '11px', fontWeight: 800, color: j.mode_numerotation === 'AUTO' ? '#2563eb' : '#64748b'}}>
                                                        {j.mode_numerotation === 'AUTO' ? '🔢 AUTOMATIQUE' : '⌨️ MANUELLE'}
                                                    </span>
                                                </td>
                                                <td style={tdStyle}>
                                                    {j.type_journal === 'TRESORERIE' ? (
                                                        <div style={{display:'flex', flexDirection:'column', gap:'4px'}}>
                                                            <span style={badgeTreso}><LinkIcon size={12}/> {j.compte_numero || "Lié"}</span>
                                                            {j.contrepartie_auto === 1 && <span style={badgeAutoCP}><RefreshCw size={10}/> CONTREPARTIE AUTO</span>}
                                                        </div>
                                                    ) : <span style={{color:'#cbd5e1'}}>—</span>}
                                                </td>
                                                <td style={tdStyle}>
                                                    <div style={{display:'flex', gap:'15px', alignItems: 'center'}}>
                                                        
                                                        {/* 🔑 MAPPAGE DU BOUTON MODIFIER : Affiché uniquement si autorisé */}
                                                        {canModifyJournal && (
                                                            <Edit 
                                                                size={16} 
                                                                color="#3b82f6" 
                                                                style={{ cursor: 'pointer' }} 
                                                                onClick={() => handleEdit(j)} 
                                                                title="Modifier la configuration"
                                                            />
                                                        )}

                                                        {/* 🔑 MAPPAGE DU BOUTON SUPPRIMER : Affiché uniquement si autorisé */}
                                                        {canDeleteJournal && (
                                                            <Trash2 
                                                                size={16} 
                                                                color={j.has_entries > 0 ? "#cbd5e1" : "#ef4444"} 
                                                                style={{ cursor: j.has_entries > 0 ? "not-allowed" : "pointer" }} 
                                                                onClick={() => handleDelete(j.id, j.has_entries)} 
                                                                title={j.has_entries > 0 ? "Bouton bloqué (Écritures existantes)" : "Supprimer définitivement"}
                                                            />
                                                        )}

                                                        {/* 🔒 SÉCURITÉ INFORMATIVE VISUELLE : Affiché si aucun droit n'est accordé */}
                                                        {!hasRowAccess && (
                                                            <span style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic', fontWeight: '500' }}>
                                                                Accès restreint
                                                            </span>
                                                        )}

                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </main>

            {toast.show && (
                <div style={{ ...toastStyle, background: toast.type === 'warning' ? '#f59e0b' : (toast.type === 'error' ? '#ef4444' : '#0f172a') }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            {toast.type === 'warning' && <AlertTriangle size={18} />}
                            <span style={{fontSize:'12px'}}>{toast.message}</span>
                        </div>
                        {toast.action && (
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                <button onClick={() => setToast({ ...toast, show: false })} style={btnToastSecondary}>NON</button>
                                <button onClick={toast.action} style={btnToastPrimary}>OUI, CONFIRMER</button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};


// --- STYLES ---
const btnAction = (color) => ({
    display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px',
    borderRadius: '10px', border: `1px solid ${color}30`, background: `${color}10`,
    color: color, fontSize: '11px', fontWeight: '900', cursor: 'pointer', transition: 'all 0.2s'
});

const toastStyle = { position: 'fixed', bottom: '30px', left: '50%', transform: 'translateX(-50%)', padding: '15px 25px', borderRadius: '12px', color: 'white', fontWeight: '800', zIndex: 9999, boxShadow: '0 10px 15px -3px rgba(0,0,0,0.3)', minWidth: '320px' };
const btnToastPrimary = { background: 'white', color: '#f59e0b', border: 'none', padding: '5px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: '900', cursor: 'pointer' };
const btnToastSecondary = { background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none', padding: '5px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: '900', cursor: 'pointer' };
const tresoSection = { flex: 1.5, display: 'flex', gap: '10px', alignItems: 'flex-end', background: '#ecfdf5', padding: '8px', borderRadius: '10px', border: '1px solid #10b981' };
const checkboxWrapper = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', paddingBottom: '5px' };
const checkboxLabel = { fontSize: '9px', fontWeight: '900', color: '#047857', textTransform: 'uppercase' };
const badgeAutoCP = { fontSize: '9px', fontWeight: '900', color: '#1d4ed8', background: '#dbeafe', padding: '2px 6px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '3px' };
const layoutStyle = { display: 'flex', height: '100vh', background: '#f8fafc', overflow: 'hidden' };
const mainStyle = { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' };
const headerStyle = { background: 'white', padding: '15px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0' };
const iconBox = { background: '#0f172a', padding: '10px', borderRadius: '10px' };
const titleStyle = { margin: 0, fontSize: '18px', fontWeight: '900', color: '#0f172a' };
const subtitleStyle = { fontSize: '11px', color: '#64748b', fontWeight: '700' };
const btnPrimary = { background: '#2563eb', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '10px', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize:'13px' };
const inlineFormContainer = { background: 'white', borderBottom: '1px solid #e2e8f0', padding: '15px 40px' };
const inlineForm = { background: '#f1f5f9', padding: '15px', borderRadius: '12px', border: '1px solid #cbd5e1' };
const formRow = { display: 'flex', gap: '15px', alignItems: 'flex-start' };
const contentStyle = { padding: '20px 40px', flex: 1, overflowY: 'auto' };
const tableWrapper = { background: 'white', borderRadius: '15px', border: '1px solid #e2e8f0', overflow: 'hidden' };
const tableStyle = { width: '100%', borderCollapse: 'collapse' };
const thStyle = { background: '#f8fafc', padding: '12px 15px', textAlign: 'left', fontSize: '11px', fontWeight: 900, color: '#64748b', borderBottom: '1px solid #e2e8f0' };
const trStyle = { borderBottom: '1px solid #f1f5f9' };
const tdStyle = { padding: '12px 15px', fontSize: '13px', color: '#475569' };
const badgeCode = { background: '#0f172a', color: 'white', padding: '3px 7px', borderRadius: '6px', fontWeight: 900, fontSize: '10px' };
const badgeTreso = { background: '#dcfce7', color: '#166534', padding: '4px 8px', borderRadius: '6px', fontWeight: 800, fontSize: '10px', display:'inline-flex', alignItems:'center', gap:'4px' };
const label = { fontSize: '10px', fontWeight: '900', color: '#64748b', display: 'block', marginBottom: '5px' };
const input = { width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontWeight: '700', outline: 'none', fontSize:'13px' };
const inputTreso = { ...input, border: '1px solid #10b981' };
const btnSubmitInline = { background: '#2563eb', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '8px', cursor: 'pointer' };
const btnSmallCancel = { background: '#fee2e2', color: '#dc2626', border: 'none', padding: '3px', borderRadius: '6px', cursor: 'pointer' };
const center = { display: 'flex', justifyContent: 'center', padding: '100px' };

export default CodeJournal;