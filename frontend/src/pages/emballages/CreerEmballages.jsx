import React, { useState, useEffect, useRef } from 'react';
import { Plus, ArrowLeft, Edit3, Archive, CheckCircle, Package, Search, X, AlertCircle, Upload, Download } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../../components/Sidebar';

// IMPORTATION DIRECTE DU SOCKET & API SELON VOS STANDARDS
import API, { socket } from '../../services/api'; 

import * as XLSX from 'xlsx';
import '../Dashboard.css';

const CreerEmballages = () => {
    const navigate = useNavigate();
    const fileInputRef = useRef(null);
    
    // États
    const [packagings, setPackagings] = useState([]);
    const [unites, setUnites] = useState([]);
    const [rules, setRules] = useState([]); // ÉTAT POUR LES RÈGLES D'EMBALLAGE
    const [searchTerm, setSearchTerm] = useState('');
    
    const [formData, setFormData] = useState({ 
        nom: '', 
        unite_id: '', 
        rule_id: '', // RULE_ID DANS LE FORMULAIRE
        prix_consigne: 0, 
        prix_deconsigne: 0, 
        prix_achat: 0, 
        stock_alerte: 0 
    });
    
    const [editingId, setEditingId] = useState(null);
    const [isAdding, setIsAdding] = useState(false);
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    
    // État pour gérer la suppression sécurisée sans window.confirm ni modale
    const [deleteConfirmId, setDeleteConfirmId] = useState(null);

    // --- SYSTÈME DE TOAST ---
    const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
    const showToast = (message, type = 'success') => {
        setToast({ show: true, message, type });
        setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
    };

    // --- RÉCUPÉRATION DES EMBALLAGES ---
    const fetchPackagings = async () => {
        try {
            setLoading(true);
            const res = await API.get('/emballages');
            setPackagings(Array.isArray(res.data) ? res.data : []);
        } catch (err) {
            setErrorMessage("Erreur de chargement des données emballages.");
        } finally {
            setLoading(false);
        }
    };

    // --- RÉCUPÉRATION DES UNITÉS ---
    const fetchUnites = async () => {
        try {
            const res = await API.get('/unites');
            setUnites(Array.isArray(res.data) ? res.data : []);
        } catch (err) {
            console.error("Impossible de récupérer les unités de mesure");
        }
    };

    // --- RÉCUPÉRATION DES RÈGLES DE TARIFICATION ---
    const fetchRules = async () => {
        try {
            const res = await API.get('/emballages/rules/list');
            setRules(Array.isArray(res.data) ? res.data : []);
        } catch (err) {
            console.error("Impossible de récupérer les règles de tarification");
        }
    };

    // --- LOGIQUE TEMPS RÉEL (SOCKET) ---
    useEffect(() => {
        fetchPackagings();
        fetchUnites();
        fetchRules();

        const handleGlobalDataChange = (event) => {
            const tableName = event.detail.table; 
            if (tableName === 'packaging' || tableName === 'all') {
                console.log("⚡ Signal de mise à jour reçu pour les emballages");
                fetchPackagings();
            }
        };

        window.addEventListener('ERP_DATA_CHANGED', handleGlobalDataChange);
        return () => {
            window.removeEventListener('ERP_DATA_CHANGED', handleGlobalDataChange);
        };
    }, []);

    // --- FONCTIONS EXCEL ---
    const handleExport = () => {
        const dataToExport = getFilteredData().map(p => ({
            ID: p.id,
            NOM: p.nom,
            UNITE_ID: p.unite_id,
            RULE_ID: p.rule_id,
            PRIX_ACHAT: p.prix_achat,
            PRIX_CONSIGNE: p.prix_consigne,
            PRIX_DECONSIGNE: p.prix_deconsigne,
            STOCK_ACTUEL: p.stock_actuel || 0,
            STOCK_ALERTE: p.stock_alerte
        }));
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Emballages");
        XLSX.writeFile(workbook, `Liste_Emballages_${new Date().toLocaleDateString()}.xlsx`);
        showToast("Exportation réussie");
    };

    const handleImport = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (evt) => {
            const bstr = evt.target.result;
            const wb = XLSX.read(bstr, { type: 'binary' });
            const wsname = wb.SheetNames[0];
            const data = XLSX.utils.sheet_to_json(wb.Sheets[wsname]);
            
            showToast(`Importation de ${data.length} emballages en cours...`, 'info');
            try {
                for (const row of data) {
                    await API.post('/emballages', {
                        nom: row.NOM?.toUpperCase() || 'EMBALLAGE SANS NOM',
                        unite_id: row.UNITE_ID || '',
                        rule_id: row.RULE_ID || null,
                        prix_consigne: Number(row.PRIX_CONSIGNE) || 0,
                        prix_deconsigne: Number(row.PRIX_DECONSIGNE) || 0,
                        prix_achat: Number(row.PRIX_ACHAT) || 0,
                        stock_actuel: Number(row.STOCK_ACTUEL) || 0,
                        stock_alerte: Number(row.STOCK_ALERTE) || 0
                    });
                }
                showToast("Importation terminée avec succès");
                fetchPackagings();
            } catch (err) {
                showToast("Erreur lors de l'importation", "error");
            }
        };
        reader.readAsBinaryString(file);
    };

    // --- LOGIQUE MÉTIER ---
    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setErrorMessage('');
        try {
            const payload = { 
                ...formData, 
                nom: formData.nom.toUpperCase(),
                rule_id: formData.rule_id || null, 
                prix_consigne: Number(formData.prix_consigne) || 0,
                prix_deconsigne: Number(formData.prix_deconsigne) || 0,
                prix_achat: Number(formData.prix_achat) || 0,
                stock_alerte: Number(formData.stock_alerte) || 0
            };

            if (editingId) {
                await API.put(`/emballages/${editingId}`, payload);
                showToast("Emballage mis à jour");
            } else {
                await API.post('/emballages', payload);
                showToast("Emballage créé avec succès");
            }

            await fetchPackagings(); 
            closeForm();
        } catch (err) {
            setErrorMessage(err.response?.data?.error || "Erreur d'enregistrement");
            showToast("Erreur d'enregistrement", "error");
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id) => {
        try {
            await API.delete(`/emballages/${id}`);
            showToast("Emballage supprimé avec succès");
            setDeleteConfirmId(null);
            fetchPackagings();
        } catch (err) { 
            showToast("Erreur de suppression", "error");
        }
    };

    const handleEdit = (item) => {
        setFormData({
            nom: item.nom || '',
            unite_id: item.unite_id || '',
            rule_id: item.rule_id || '', 
            prix_consigne: item.prix_consigne || 0,
            prix_deconsigne: item.prix_deconsigne || 0,
            prix_achat: item.prix_achat || 0,
            stock_alerte: item.stock_alerte || 0
        });
        setEditingId(item.id);
        setIsAdding(true);
    };

    const closeForm = () => {
        setIsAdding(false);
        setEditingId(null);
        setErrorMessage('');
        setFormData({ nom: '', unite_id: '', rule_id: '', prix_consigne: 0, prix_deconsigne: 0, prix_achat: 0, stock_alerte: 0 });
    };

    const getFilteredData = () => {
        if (!Array.isArray(packagings)) return [];
        return packagings.filter(p => {
            const name = (p.nom || "").toLowerCase();
            const id = (p.id || "").toLowerCase();
            const search = searchTerm.toLowerCase();
            return name.includes(search) || id.includes(search);
        });
    };

    return (
        <div style={{ display: 'flex', height: '100vh', background: '#f1f5f9', position: 'relative' }}>
            <Sidebar />

            {/* --- COMPOSANT TOAST --- */}
            {toast.show && (
                <div style={{
                    position: 'fixed', top: '20px', right: '20px', zIndex: 9999,
                    backgroundColor: toast.type === 'error' ? '#ef4444' : toast.type === 'info' ? '#3b82f6' : '#10b981',
                    color: 'white', padding: '12px 20px', borderRadius: '8px', fontWeight: 'bold',
                    display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                }}>
                    {toast.type === 'error' ? <AlertCircle size={18}/> : <CheckCircle size={18}/>}
                    {toast.message}
                </div>
            )}

            <main style={{ flex: 1, overflowY: 'auto' }}>
                <header style={headerStyle}>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: '900', color: '#0f172a' }}>GESTOCK</h1>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontSize: '13px' }}>
                            <Package size={14} /> Gestion des Emballages & Consignes
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={() => fileInputRef.current.click()} style={btnSecondaryStyle} title="Importer Excel">
                            <Upload size={16} /> Importer
                        </button>
                        <input type="file" ref={fileInputRef} hidden accept=".xlsx, .xls" onChange={handleImport} />
                        
                        <button onClick={handleExport} style={btnSecondaryStyle} title="Exporter Excel">
                            <Download size={16} /> Exporter
                        </button>

                        <button onClick={() => setIsAdding(true)} style={btnPrimaryStyle}>
                            <Plus size={18} /> Nouvel Emballage
                        </button>
                    </div>
                </header>

                <div style={{ padding: '25px 40px' }}>
                    <button onClick={() => { isAdding ? closeForm() : navigate(-1) }} style={backBtnStyle}>
                        <ArrowLeft size={16} /> {isAdding ? 'Annuler et retourner à la liste' : 'Retour'}
                    </button>

                    {!isAdding && (
                        <div style={toolbarStyle}>
                            <div style={searchContainerStyle}>
                                <Search size={18} color="#94a3b8" />
                                <input 
                                    type="text" 
                                    placeholder="Rechercher un emballage (Code, Désignation)..." 
                                    style={searchInputStyle}
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                                {searchTerm && <X size={16} style={{cursor:'pointer'}} onClick={()=>setSearchTerm('')} />}
                            </div>
                        </div>
                    )}

                    <div style={containerStyle(isAdding)}>
                        {errorMessage && <div style={errorBannerStyle}>{errorMessage}</div>}

                        {isAdding && (
                            <form onSubmit={handleSubmit} style={{ padding: '20px' }}>
                                <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
                                    <div style={{ flex: 2 }}>
                                        <label style={labelStyle}>DÉSIGNATION DE L'EMBALLAGE *</label>
                                        <input 
                                            type="text" 
                                            style={{ ...inputStyle, textTransform: 'uppercase' }} 
                                            placeholder="Ex: CASIER BIERE 60CL"
                                            value={formData.nom} 
                                            onChange={(e) => setFormData({...formData, nom: e.target.value.toUpperCase()})} 
                                            required 
                                        />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label style={labelStyle}>UNITÉ DE MESURE *</label>
                                        <select 
                                            name="unite_id" 
                                            style={selectInputStyle} 
                                            value={formData.unite_id || ''} 
                                            onChange={(e) => setFormData({...formData, unite_id: e.target.value})}
                                            required
                                        >
                                            <option value="">Choisir...</option>
                                            {unites && unites.map(u => {
                                                const nomUnite = u.libelle || u.nom || `Unité n°${u.id}`;
                                                const codeUnite = u.code ? ` (${u.code})` : '';
                                                
                                                return (
                                                    <option key={u.id} value={u.id}>
                                                        {nomUnite}{codeUnite}
                                                    </option>
                                                );
                                            })}
                                        </select>
                                    </div>
                                    
                                    <div style={{ flex: 1 }}>
                                        <label style={labelStyle}>RÈGLE DE DECONSIGNE</label>
                                        <select
                                            style={selectInputStyle}
                                            value={formData.rule_id}
                                            onChange={(e) => setFormData({...formData, rule_id: e.target.value})}
                                        >
                                            <option value="">Aucune (Remboursement standard)</option>
                                            {rules.map(r => (
                                                <option key={r.id} value={r.id}>{r.libelle} ({r.code_regle})</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
                                    <div style={{ flex: 1 }}>
                                        <label style={labelStyle}>PRIX D'ACHAT FOURNISSEUR</label>
                                        <input 
                                            type="number" 
                                            style={inputStyle} 
                                            value={formData.prix_achat} 
                                            onChange={(e) => setFormData({...formData, prix_achat: e.target.value})} 
                                            min="0"
                                        />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label style={labelStyle}>PRIX CONSIGNE UTILISATEUR</label>
                                        <input 
                                            type="number" 
                                            style={inputStyle} 
                                            value={formData.prix_consigne} 
                                            onChange={(e) => setFormData({...formData, prix_consigne: e.target.value})} 
                                            min="0"
                                        />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label style={labelStyle}>PRIX DÉCONSIGNE (REMBOURSEMENT)</label>
                                        <input 
                                            type="number" 
                                            style={inputStyle} 
                                            value={formData.prix_deconsigne} 
                                            onChange={(e) => setFormData({...formData, prix_deconsigne: e.target.value})} 
                                            min="0"
                                        />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label style={labelStyle}>STOCK D'ALERTE</label>
                                        <input 
                                            type="number" 
                                            style={inputStyle} 
                                            value={formData.stock_alerte} 
                                            onChange={(e) => setFormData({...formData, stock_alerte: e.target.value})} 
                                            min="0"
                                        />
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                                    <button type="button" onClick={closeForm} style={btnCancelStyle}>Annuler</button>
                                    <button type="submit" style={btnSubmitStyle} disabled={loading}>
                                        <CheckCircle size={18}/> {editingId ? 'Mettre à jour' : 'Enregistrer l\'emballage'}
                                    </button>
                                </div>
                            </form>
                        )}

                        {!isAdding && (
                            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                        <th style={{ ...thStyle, width: '10%' }}>Code</th>
                                        <th style={{ ...thStyle, width: '20%' }}>Désignation</th>
                                        <th style={{ ...thStyle, width: '13%' }}>Régle Déconsigne</th>
                                        <th style={{ ...thStyle, width: '10%' }}>Prix Achat</th>
                                        <th style={{ ...thStyle, width: '10%' }}>Consigne</th>
                                        <th style={{ ...thStyle, width: '10%' }}>Déconsigne</th>
                                        <th style={{ ...thStyle, width: '9%' }}>Stock Actuel</th>
                                        <th style={{ ...thStyle, width: '8%' }}>Alerte</th>
                                        <th style={{ ...thStyle, width: '14%', textAlign: 'right' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {getFilteredData().length > 0 ? getFilteredData().map(item => {
                                        // Correction de la variable globale collée (Erreur constisAlerte corrigée ici)
                                        const isAlerte = (item.stock_actuel || 0) <= (item.stock_alerte || 0);
                                        const isConfirming = deleteConfirmId === item.id;

                                        return (
                                            <tr key={item.id} style={trStyle}>
                                                <td style={tdStyle}>
                                                    <div style={{ fontWeight: '800', color: '#1e293b' }}>#{item.id}</div>
                                                </td>
                                                <td style={{ ...tdStyle, fontWeight: '800', color: '#0f172a', textTransform: 'uppercase' }}>
                                                    {item.nom} {item.unite_nom ? `(${item.unite_nom})` : ''}
                                                </td>
                                               <td style={{ ...tdStyle, fontWeight: '600', color: item.rule_id ? '#2563eb' : '#64748b', fontSize: '12px' }}>
    {(() => {
        if (!item.rule_id) return 'STANDARD';
        // Recherche de la règle correspondante dans l'état local rules
        const matchingRule = rules.find(r => String(r.id) === String(item.rule_id));
        return matchingRule ? matchingRule.libelle.toUpperCase() : 'STANDARD';
    })()}
</td>
                                                <td style={{ ...tdStyle, fontWeight: '600' }}>{item.prix_achat} F</td>
                                                <td style={{ ...tdStyle, fontWeight: '600', color: '#16a34a' }}>{item.prix_consigne} F</td>
                                                <td style={{ ...tdStyle, fontWeight: '600', color: '#ea580c' }}>{item.prix_deconsigne} F</td>
                                                <td style={tdStyle}>
                                                    <span style={{
                                                        padding: '4px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: '900',
                                                        background: isAlerte ? '#fee2e2' : '#e2f5ea',
                                                        color: isAlerte ? '#b91c1c' : '#15803d'
                                                    }}>
                                                        {item.stock_actuel || 0}
                                                    </span>
                                                </td>
                                                <td style={tdStyle}>
                                                    <span style={item.stock_alerte > 0 ? badgeAlerteStyle : badgeStyle}>
                                                        {item.stock_alerte}
                                                    </span>
                                                </td>
                                                <td style={{ ...tdStyle, textAlign: 'right' }}>
                                                    <div style={{ display: 'flex', gap: '5px', justifyContent: 'flex-end', alignItems: 'center' }}>
                                                        {!isConfirming ? (
                                                            <>
                                                                <button onClick={() => handleEdit(item)} style={actionBtnStyle('#2563eb')} title="Modifier">
                                                                    <Edit3 size={14}/>
                                                                </button>
                                                                <button onClick={() => setDeleteConfirmId(item.id)} style={actionBtnStyle('#ef4444')} title="Supprimer">
                                                                    <Archive size={14}/>
                                                                </button>
                                                            </>
                                                        ) : (
                                                            // Système inline de confirmation à double clic / toast contextuel sans modale
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#fee2e2', padding: '2px 6px', borderRadius: '6px' }}>
                                                                <span style={{ fontSize: '10px', color: '#b91c1c', fontWeight: '800' }}>Confirmer ?</span>
                                                                <button onClick={() => handleDelete(item.id)} style={{ background: '#ef4444', color: 'white', border: 'none', padding: '3px 6px', borderRadius: '4px', fontSize: '10px', cursor: 'pointer', fontWeight: 'bold' }}>
                                                                    Oui
                                                                </button>
                                                                <button onClick={() => setDeleteConfirmId(null)} style={{ background: '#64748b', color: 'white', border: 'none', padding: '3px 6px', borderRadius: '4px', fontSize: '10px', cursor: 'pointer', fontWeight: 'bold' }}>
                                                                    Non
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    }) : (
                                        <tr>
                                            <td colSpan="9" style={{textAlign: 'center', padding: '20px', color: '#64748b'}}>Aucun emballage trouvé</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
};

// --- STYLES OBJECTS ---
const headerStyle = { background: 'white', padding: '15px 40px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 10 };
const toolbarStyle = { display: 'flex', justifyContent: 'space-between', marginBottom: '15px', gap: '20px' };
const searchContainerStyle = { flex: 1, display: 'flex', alignItems: 'center', gap: '10px', background: 'white', padding: '0 15px', borderRadius: '10px', border: '1px solid #e2e8f0' };
const searchInputStyle = { width: '100%', border: 'none', padding: '12px 0', outline: 'none', fontSize: '14px', fontWeight: '500' };
const containerStyle = (isForm) => ({ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' });
const thStyle = { padding: '15px 10px', fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: '800', textAlign: 'left' };
const tdStyle = { padding: '15px 10px', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
const trStyle = { borderBottom: '1px solid #f1f5f9', background: 'white', transition: '0.2s' };
const btnPrimaryStyle = { background: '#2563eb', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '700' };
const btnSecondaryStyle = { background: 'white', border: '1px solid #e2e8f0', padding: '10px 15px', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600', fontSize: '13px', color: '#475569' };
const backBtnStyle = { background: 'none', border: 'none', color: '#64748b', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '15px', fontWeight: '700', fontSize: '12px' };
const inputStyle = { width: '100%', padding: '11px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', marginTop: '5px' };
const selectInputStyle = { width: '100%', padding: '11px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', marginTop: '5px', background: 'white' };
const labelStyle = { fontSize: '10px', fontWeight: '900', color: '#475569', letterSpacing: '0.05em' };
const badgeStyle = { padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '900', background: '#f1f5f9', color: '#475569' };
const badgeAlerteStyle = { padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '900', background: '#fee2e2', color: '#b91c1c' };
const actionBtnStyle = (color) => ({ background: 'white', border: `1px solid ${color}33`, color: color, padding: '6px', borderRadius: '6px', cursor: 'pointer' });
const btnCancelStyle = { padding: '12px 25px', background: '#f1f5f9', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700' };
const btnSubmitStyle = { padding: '12px 25px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' };
const errorBannerStyle = { background: '#fee2e2', color: '#b91c1c', padding: '12px', textAlign: 'center', fontWeight: '700' };

export default CreerEmballages;