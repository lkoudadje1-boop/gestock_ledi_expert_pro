import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, ArrowLeft, Edit3, Archive, CheckCircle, Truck, MapPin, Search, Filter, Download, Upload, X, Phone, Mail } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../../components/Sidebar';
// Utilisation de l'instance API et du socket centralisé
import API, { socket } from '../../services/api'; 
import * as XLSX from 'xlsx';
import '../Dashboard.css';

const Fournisseurs = () => {
    const navigate = useNavigate();
    const fileInputRef = useRef(null);
    
    // Récupération des infos utilisateur pour le Socket
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    const COMPANY_ID = currentUser.company_id || currentUser.companyId || 'CPY-1';
    
    // États
    const [suppliers, setSuppliers] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('all'); 
    const [formData, setFormData] = useState({ nom: '', nif: '', telephone: '', email: '', adresse: '' });
    const [editingId, setEditingId] = useState(null);
    const [isAdding, setIsAdding] = useState(false);
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    // --- Fetch Data (Mémorisé pour le socket) ---
    const fetchSuppliers = useCallback(async () => {
        try {
            setLoading(true);
            const res = await API.get('/suppliers');
            setSuppliers(Array.isArray(res.data) ? res.data : []);
        } catch (err) {
            setErrorMessage("Erreur de chargement des données.");
        } finally {
            setLoading(false);
        }
    }, []);

    // --- LOGIQUE SOCKET ---
// --- LOGIQUE SOCKET ---
useEffect(() => {
    // 1. Chargement initial des données
    fetchSuppliers();

    // 2. LOGIQUE SYNC TEMPS RÉEL (SNC)
    const handleGlobalUpdate = (event) => {
        // On récupère les infos du signal universel
        const data = event.detail;
        const tableName = data?.table || data; 
        
        // On rafraîchit si le signal concerne les fournisseurs
        if (tableName === 'suppliers' || tableName === 'fournisseurs' || tableName === 'all') {
            console.log("📡 [SYNC] Mise à jour de la liste des fournisseurs détectée");
            fetchSuppliers();
        }
    };

    // On s'abonne au canal universel de ton application
    window.addEventListener('ERP_DATA_CHANGED', handleGlobalUpdate);

    // Nettoyage de l'écouteur au démontage du composant
    return () => {
        window.removeEventListener('ERP_DATA_CHANGED', handleGlobalUpdate);
    };
}, [fetchSuppliers]); // fetchSuppliers doit être stable (useCallback)

    useEffect(() => {
        fetchSuppliers();
    }, [fetchSuppliers]);

    // --- Fonctions Excel ---
    const handleExport = () => {
        const dataToExport = getFilteredData().map(s => ({
            ID: s.id,
            NOM: s.nom,
            NIF: s.nif,
            TELEPHONE: s.telephone,
            EMAIL: s.email,
            ADRESSE: s.adresse,
            STATUT: Number(s.is_active) === 1 ? 'ACTIF' : 'ARCHIVÉ'
        }));
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Fournisseurs");
        XLSX.writeFile(workbook, `Liste_Fournisseurs_${new Date().toLocaleDateString()}.xlsx`);
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
            
            if (window.confirm(`Importer ${data.length} fournisseurs ?`)) {
                try {
                    for (const row of data) {
                        await API.post('/suppliers', {
                            nom: row.NOM?.toUpperCase() || 'SANS NOM',
                            nif: row.NIF || 0,
                            telephone: row.TELEPHONE || '',
                            email: row.EMAIL || '',
                            adresse: row.ADRESSE || '',
                            is_active: 1
                        });
                    }
                    socket?.emit('SUPPLIERS_UPDATED', { companyId: COMPANY_ID });
                    fetchSuppliers();
                } catch (err) {
                    alert("Erreur lors de l'importation.");
                }
            }
        };
        reader.readAsBinaryString(file);
    };

    // --- Logique Métier ---
    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const payload = { 
                ...formData, 
                nom: formData.nom.toUpperCase(), 
                nif: parseFloat(formData.nif) || 0, 
                is_active: 1 
            };
            
            if (editingId) {
                await API.put(`/suppliers/${editingId}`, payload);
            } else {
                await API.post('/suppliers', payload);
            }

            // Signal Socket pour avertir les autres écrans
            socket?.emit('SUPPLIERS_UPDATED', { companyId: COMPANY_ID });
            
            closeForm();
            fetchSuppliers();
        } catch (err) {
            setErrorMessage(err.response?.data?.error || "Erreur d'enregistrement");
        } finally {
            setLoading(false);
        }
    };

    const handleArchive = async (id, currentStatus) => {
        if (window.confirm("Changer le statut de ce fournisseur ?")) {
            try {
                await API.patch(`/suppliers/${id}/status`, { is_active: Number(currentStatus) === 1 ? 0 : 1 });
                socket?.emit('SUPPLIERS_UPDATED', { companyId: COMPANY_ID });
                fetchSuppliers();
            } catch (err) { alert("Erreur d'archivage."); }
        }
    };

    const closeForm = () => {
        setIsAdding(false);
        setEditingId(null);
        setFormData({ nom: '', nif: '', telephone: '', email: '', adresse: '' });
        setErrorMessage('');
    };

    const getFilteredData = () => {
        return suppliers.filter(s => {
            const nameMatch = s.nom?.toLowerCase() || "";
            const emailMatch = s.email?.toLowerCase() || "";
            const matchesSearch = nameMatch.includes(searchTerm.toLowerCase()) || 
                                 emailMatch.includes(searchTerm.toLowerCase());
            
            const matchesFilter = filterStatus === 'all' ? true : 
                                 filterStatus === 'active' ? Number(s.is_active) === 1 : 
                                 Number(s.is_active) === 0;
            return matchesSearch && matchesFilter;
        });
    };

    return (
        <div style={{ display: 'flex', height: '100vh', background: '#f1f5f9' }}>
            <Sidebar />
            <main style={{ flex: 1, overflowY: 'auto' }}>
                <header style={headerStyle}>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: '900', color: '#0f172a' }}>LOGISTIQUE</h1>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontSize: '13px' }}>
                            <Truck size={14} /> Gestion des Fournisseurs
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
                            <Plus size={18} /> Nouveau Fournisseur
                        </button>
                    </div>
                </header>

                <div style={{ padding: '25px 40px' }}>
                    <button onClick={() => navigate(-1)} style={backBtnStyle}>
                        <ArrowLeft size={16} /> Retour au tableau de bord
                    </button>

                    {!isAdding && !editingId && (
                        <div style={toolbarStyle}>
                            <div style={searchContainerStyle}>
                                <Search size={18} color="#94a3b8" />
                                <input 
                                    type="text" 
                                    placeholder="Rechercher un fournisseur..." 
                                    style={searchInputStyle}
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                                {searchTerm && <X size={16} style={{cursor:'pointer'}} onClick={()=>setSearchTerm('')} />}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Filter size={18} color="#64748b" />
                                <select 
                                    style={selectStyle} 
                                    value={filterStatus}
                                    onChange={(e) => setFilterStatus(e.target.value)}
                                >
                                    <option value="all">Tous les statuts</option>
                                    <option value="active">Actifs uniquement</option>
                                    <option value="archived">Archives</option>
                                </select>
                            </div>
                        </div>
                    )}

                    <div style={containerStyle(isAdding || editingId)}>
                        {errorMessage && <div style={errorBannerStyle}>{errorMessage}</div>}

                        {/* FORMULAIRE AVEC INDICATEURS (PLACEHOLDERS) */}
                        {(isAdding || editingId) && (
                            <form onSubmit={handleSubmit} style={{ padding: '20px' }}>
                                <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
                                    <div style={{ flex: 2 }}>
                                        <label style={labelStyle}>NOM DU FOURNISSEUR</label>
                                      <input 
    type="text" 
    style={inputStyle} 
    placeholder="Entrez le nom complet du fournisseur"
    value={formData.nom || ''} // MODIFICATION ICI
    onChange={(e) => setFormData({...formData, nom: e.target.value})} 
    required 
/>
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label style={labelStyle}>NIF</label>
                                        <input 
    type="number" 
    style={inputStyle} 
    placeholder="Numéro d'Identification Fiscale"
    value={formData.nif || ''} // MODIFICATION ICI
    onChange={(e) => setFormData({...formData, nif: e.target.value})} 
/>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
                                    <div style={{ flex: 1 }}>
                                        <label style={labelStyle}>TÉLÉPHONE</label>
                                        <input 
    type="text" 
    style={inputStyle} 
    placeholder="+228 XX XX XX XX"
    value={formData.telephone || ''} // MODIFICATION ICI
    onChange={(e) => setFormData({...formData, telephone: e.target.value})} 
/>
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label style={labelStyle}>EMAIL</label>
                                       <input 
    type="email" 
    style={inputStyle} 
    placeholder="contact@fournisseur.com"
    value={formData.email || ''} // MODIFICATION ICI
    onChange={(e) => setFormData({...formData, email: e.target.value})} 
/>
                                    </div>
                                    <div style={{ flex: 2 }}>
                                        <label style={labelStyle}>ADRESSE</label>
                                      <input 
    type="text" 
    style={inputStyle} 
    placeholder="Quartier, Rue, Ville"
    value={formData.adresse || ''} // MODIFICATION ICI
    onChange={(e) => setFormData({...formData, adresse: e.target.value})} 
/>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                                    <button type="button" onClick={closeForm} style={btnCancelStyle}>Annuler</button>
                                    <button type="submit" style={btnSubmitStyle}><CheckCircle size={18}/> {editingId ? 'Mettre à jour' : 'Valider'}</button>
                                </div>
                            </form>
                        )}

                        {/* TABLEAU */}
                        {!isAdding && !editingId && (
                            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                        <th style={{ ...thStyle, width: '12%' }}>ID / NIF</th>
                                        <th style={{ ...thStyle, width: '22%' }}>Fournisseur</th>
                                        <th style={{ ...thStyle, width: '15%' }}>Téléphone</th>
                                        <th style={{ ...thStyle, width: '18%' }}>Email</th>
                                        <th style={{ ...thStyle, width: '15%' }}>Localisation</th>
                                        <th style={{ ...thStyle, width: '8%' }}>État</th>
                                        <th style={{ ...thStyle, width: '10%', textAlign: 'right' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {getFilteredData().map(item => (
                                        <tr key={item.id} style={trStyle(item.is_active)}>
                                            <td style={tdStyle}>
                                                <div style={{ fontWeight: '800', color: '#1e293b' }}>#{item.id}</div>
                                                <div style={{ fontSize: '10px', color: '#94a3b8' }}>NIF: {item.nif || '---'}</div>
                                            </td>
                                            <td style={{ ...tdStyle, fontWeight: '800', color: '#0f172a', textTransform: 'uppercase' }}>{item.nom}</td>
                                            <td style={tdStyle}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '600' }}>
                                                    <Phone size={13} color="#2563eb" /> {item.telephone || '---'}
                                                </div>
                                            </td>
                                            <td style={tdStyle}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#64748b' }}>
                                                    <Mail size={13} /> {item.email || '---'}
                                                </div>
                                            </td>
                                            <td style={tdStyle}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}>
                                                    <MapPin size={12} /> {item.adresse || '---'}
                                                </div>
                                            </td>
                                            <td style={tdStyle}><span style={badgeStyle(item.is_active)}>{Number(item.is_active) === 1 ? 'ACTIF' : 'ARCHIVÉ'}</span></td>
                                            <td style={{ ...tdStyle, textAlign: 'right' }}>
                                                <div style={{ display: 'flex', gap: '5px', justifyContent: 'flex-end' }}>
                                                    <button onClick={() => { setEditingId(item.id); setFormData(item); }} style={actionBtnStyle('#2563eb')}><Edit3 size={14}/></button>
                                                    <button onClick={() => handleArchive(item.id, item.is_active)} style={actionBtnStyle(Number(item.is_active) === 1 ? '#94a3b8' : '#10b981')}><Archive size={14}/></button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
};

// --- STYLES ---
const headerStyle = { background: 'white', padding: '15px 40px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 10 };
const toolbarStyle = { display: 'flex', justifyContent: 'space-between', marginBottom: '15px', gap: '20px' };
const searchContainerStyle = { flex: 1, display: 'flex', alignItems: 'center', gap: '10px', background: 'white', padding: '0 15px', borderRadius: '10px', border: '1px solid #e2e8f0' };
const searchInputStyle = { width: '100%', border: 'none', padding: '12px 0', outline: 'none', fontSize: '14px', fontWeight: '500' };
const selectStyle = { padding: '10px', borderRadius: '10px', border: '1px solid #e2e8f0', outline: 'none', fontSize: '13px', fontWeight: '600', color: '#475569' };
const containerStyle = (isForm) => ({ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' });
const thStyle = { padding: '15px 20px', fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: '800', textAlign: 'left' };
const tdStyle = { padding: '15px 20px', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
const trStyle = (active) => ({ borderBottom: '1px solid #f1f5f9', background: Number(active) === 0 ? '#f8fafc' : 'white', transition: '0.2s' });
const btnPrimaryStyle = { background: '#2563eb', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '700' };
const btnSecondaryStyle = { background: 'white', border: '1px solid #e2e8f0', padding: '10px 15px', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600', fontSize: '13px', color: '#475569' };
const backBtnStyle = { background: 'none', border: 'none', color: '#64748b', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '15px', fontWeight: '700', fontSize: '12px' };
const inputStyle = { width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', marginTop: '5px' };
const labelStyle = { fontSize: '10px', fontWeight: '900', color: '#475569', letterSpacing: '0.05em' };
const badgeStyle = (active) => ({ padding: '4px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: '900', background: Number(active) === 1 ? '#dcfce7' : '#fee2e2', color: Number(active) === 1 ? '#15803d' : '#b91c1c' });
const actionBtnStyle = (color) => ({ background: 'white', border: `1px solid ${color}33`, color: color, padding: '6px', borderRadius: '6px', cursor: 'pointer' });
const btnCancelStyle = { padding: '12px 25px', background: '#f1f5f9', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700' };
const btnSubmitStyle = { padding: '12px 25px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' };
const errorBannerStyle = { background: '#fee2e2', color: '#b91c1c', padding: '12px', textAlign: 'center', fontWeight: '700' };

export default Fournisseurs;