import React, { useState, useEffect, useRef } from 'react';
import { Plus, ArrowLeft, Edit3, Archive, CheckCircle, Users, MapPin, Search, Filter, Download, Upload, X, Phone, Mail, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../../components/Sidebar';

// IMPORTATION DIRECTE DU SOCKET
import API, { socket } from '../../services/api'; 

import * as XLSX from 'xlsx';
import '../Dashboard.css';

const Clients = () => {
    const navigate = useNavigate();
    const fileInputRef = useRef(null);
    
    // États
    const [customers, setCustomers] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('all'); 
    const [formData, setFormData] = useState({ nom: '', nif: '', telephone: '', email: '', adresse: '' });
    const [editingId, setEditingId] = useState(null);
    const [isAdding, setIsAdding] = useState(false);
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    // --- SYSTÈME DE TOAST ---
    const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
    const showToast = (message, type = 'success') => {
        setToast({ show: true, message, type });
        setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
    };

    // --- RÉCUPÉRATION DES DONNÉES ---
    const fetchCustomers = async () => {
        try {
            setLoading(true);
            const res = await API.get('/customers');
            setCustomers(Array.isArray(res.data) ? res.data : []);
        } catch (err) {
            setErrorMessage("Erreur de chargement des données clients.");
        } finally {
            setLoading(false);
        }
    };

    // --- LOGIQUE TEMPS RÉEL (SOCKET) ---
    useEffect(() => {
        fetchCustomers();

        const handleGlobalDataChange = (event) => {
            const tableName = event.detail.table; 
            if (tableName === 'customers' || tableName === 'all') {
                console.log("⚡ Signal de mise à jour reçu pour les clients");
                fetchCustomers();
            }
        };

        window.addEventListener('ERP_DATA_CHANGED', handleGlobalDataChange);
        return () => {
            window.removeEventListener('ERP_DATA_CHANGED', handleGlobalDataChange);
        };
    }, []);

    // --- Fonctions Excel ---
    const handleExport = () => {
        const dataToExport = getFilteredData().map(c => ({
            ID: c.id,
            NOM: c.nom,
            NIF: c.nif,
            TELEPHONE: c.telephone,
            EMAIL: c.email,
            ADRESSE: c.adresse,
            STATUT: Number(c.is_active) === 1 ? 'ACTIF' : 'ARCHIVÉ'
        }));
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Clients");
        XLSX.writeFile(workbook, `Liste_Clients_${new Date().toLocaleDateString()}.xlsx`);
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
            
            // Remplacement du window.confirm par un toast d'info (L'import démarre)
            showToast(`Importation de ${data.length} clients en cours...`, 'info');
            try {
                for (const row of data) {
                    await API.post('/customers', {
                        nom: row.NOM?.toUpperCase() || 'CLIENT SANS NOM',
                        nif: row.NIF || '',
                        telephone: row.TELEPHONE || '',
                        email: row.EMAIL || '',
                        adresse: row.ADRESSE || '',
                        is_active: 1
                    });
                }
                showToast("Importation terminée avec succès");
                fetchCustomers();
            } catch (err) {
                showToast("Erreur lors de l'importation", "error");
            }
        };
        reader.readAsBinaryString(file);
    };

    // --- Logique Métier ---
    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setErrorMessage('');
        try {
            const payload = { 
                ...formData, 
                nom: formData.nom.toUpperCase(), 
                is_active: 1 
            };

            if (editingId) {
                await API.put(`/customers/${editingId}`, payload);
                showToast("Client mis à jour");
            } else {
                await API.post('/customers', payload);
                showToast("Client créé avec succès");
            }

            await fetchCustomers(); 
            closeForm();
        } catch (err) {
            setErrorMessage(err.response?.data?.error || "Erreur d'enregistrement");
            showToast("Erreur d'enregistrement", "error");
        } finally {
            setLoading(false);
        }
    };

    const handleArchive = async (id, currentStatus) => {
        try {
            await API.patch(`/customers/${id}/status`, { is_active: Number(currentStatus) === 1 ? 0 : 1 });
            showToast("Statut modifié");
            fetchCustomers();
        } catch (err) { 
            showToast("Erreur de modification", "error");
        }
    };

    const handleEdit = (item) => {
        setFormData({
            nom: item.nom || '',
            nif: item.nif || '',
            telephone: item.telephone || '',
            email: item.email || '',
            adresse: item.adresse || ''
        });
        setEditingId(item.id);
        setIsAdding(true);
    };

    const closeForm = () => {
        setIsAdding(false);
        setEditingId(null);
        setErrorMessage('');
        setFormData({ nom: '', nif: '', telephone: '', email: '', adresse: '' });
    };

    const getFilteredData = () => {
        if (!Array.isArray(customers)) return [];
        return customers.filter(c => {
            const name = (c.nom || "").toLowerCase();
            const email = (c.email || "").toLowerCase();
            const phone = (c.telephone || "");
            const search = searchTerm.toLowerCase();
            const matchesSearch = name.includes(search) || email.includes(search) || phone.includes(searchTerm);
            const matchesFilter = filterStatus === 'all' ? true : 
                                 filterStatus === 'active' ? Number(c.is_active) === 1 : 
                                 Number(c.is_active) === 0;
            return matchesSearch && matchesFilter;
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
                    display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    animation: 'slideIn 0.3s ease-out'
                }}>
                    {toast.type === 'error' ? <AlertCircle size={18}/> : <CheckCircle size={18}/>}
                    {toast.message}
                </div>
            )}

            <main style={{ flex: 1, overflowY: 'auto' }}>
                <header style={headerStyle}>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: '900', color: '#0f172a' }}>COMMERCIAL</h1>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontSize: '13px' }}>
                            <Users size={14} /> Gestion du Portefeuille Clients
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
                            <Plus size={18} /> Nouveau Client
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
                                    placeholder="Rechercher un client (Nom, Email, Tel)..." 
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
                                    <option value="active">Actifs</option>
                                    <option value="archived">Archives</option>
                                </select>
                            </div>
                        </div>
                    )}

                    <div style={containerStyle(isAdding)}>
                        {errorMessage && <div style={errorBannerStyle}>{errorMessage}</div>}

                        {isAdding && (
                            <form onSubmit={handleSubmit} style={{ padding: '20px' }}>
                                <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
                                    <div style={{ flex: 2 }}>
                                        <label style={labelStyle}>NOM DU CLIENT / RAISON SOCIALE</label>
                                        <input 
                                            type="text" 
                                            style={inputStyle} 
                                            placeholder="Ex: Jean Dupont ou SARL ECO"
                                            value={formData.nom} 
                                            onChange={(e) => setFormData({...formData, nom: e.target.value})} 
                                            required 
                                        />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label style={labelStyle}>NIF / NUMÉRO FISCAL</label>
                                        <input 
                                            type="text" 
                                            style={inputStyle} 
                                            placeholder="Numéro fiscal"
                                            value={formData.nif} 
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
                                            placeholder="Numéro de contact"
                                            value={formData.telephone} 
                                            onChange={(e) => setFormData({...formData, telephone: e.target.value})} 
                                        />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label style={labelStyle}>EMAIL</label>
                                        <input 
                                            type="email" 
                                            style={inputStyle} 
                                            placeholder="client@domaine.com"
                                            value={formData.email} 
                                            onChange={(e) => setFormData({...formData, email: e.target.value})} 
                                        />
                                    </div>
                                    <div style={{ flex: 2 }}>
                                        <label style={labelStyle}>ADRESSE DE LIVRAISON / FACTURATION</label>
                                        <input 
                                            type="text" 
                                            style={inputStyle} 
                                            placeholder="Ville, Quartier, Rue"
                                            value={formData.adresse} 
                                            onChange={(e) => setFormData({...formData, adresse: e.target.value})} 
                                        />
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                                    <button type="button" onClick={closeForm} style={btnCancelStyle}>Annuler</button>
                                    <button type="submit" style={btnSubmitStyle} disabled={loading}>
                                        <CheckCircle size={18}/> {editingId ? 'Mettre à jour' : 'Enregistrer le client'}
                                    </button>
                                </div>
                            </form>
                        )}

                        {!isAdding && (
                            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                        <th style={{ ...thStyle, width: '12%' }}>ID / NIF</th>
                                        <th style={{ ...thStyle, width: '22%' }}>Client</th>
                                        <th style={{ ...thStyle, width: '15%' }}>Téléphone</th>
                                        <th style={{ ...thStyle, width: '18%' }}>Email</th>
                                        <th style={{ ...thStyle, width: '15%' }}>Localisation</th>
                                        <th style={{ ...thStyle, width: '8%' }}>État</th>
                                        <th style={{ ...thStyle, width: '10%', textAlign: 'right' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {getFilteredData().length > 0 ? getFilteredData().map(item => (
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
                                                    <button onClick={() => handleEdit(item)} style={actionBtnStyle('#2563eb')} title="Modifier">
                                                        <Edit3 size={14}/>
                                                    </button>
                                                    <button onClick={() => handleArchive(item.id, item.is_active)} style={actionBtnStyle(Number(item.is_active) === 1 ? '#94a3b8' : '#10b981')} title={Number(item.is_active) === 1 ? 'Archiver' : 'Activer'}>
                                                        <Archive size={14}/>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan="7" style={{textAlign: 'center', padding: '20px', color: '#64748b'}}>Aucun client trouvé</td>
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

// --- STYLES (Conservés à l'identique) ---
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

export default Clients;