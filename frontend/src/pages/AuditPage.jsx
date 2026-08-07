// frontend/src/pages/AuditPage.jsx
import React, { useState, useEffect } from 'react';
import { ArrowLeft, Search, Filter, Download, Activity, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar'; 
import API from '../services/api';
import { exportToExcel } from '../utils/excelHelper'; 
import './Dashboard.css'; 

const AuditPage = () => {
    const navigate = useNavigate();
    
    const [logs, setLogs] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterAction, setFilterAction] = useState('all'); 
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    useEffect(() => {
        fetchAuditLogs();
    }, []);

    const fetchAuditLogs = async () => {
        try {
            setLoading(true);
            setErrorMessage('');
            const res = await API.get('/audit'); 
            console.log("Données reçues brute:", res.data);
            
            // On s'assure de récupérer le tableau, qu'il soit dans res.data ou res.data.logs
            const data = Array.isArray(res.data) ? res.data : (res.data.logs || []);
            setLogs(data);
        } catch (err) {
            console.error("Erreur API Audit:", err);
            setErrorMessage("Erreur de chargement du journal d'audit.");
        } finally {
            setLoading(false);
        }
    };

    const handleExport = () => {
        const dataToExport = getFilteredData().map(log => ({
            "Date": formatDate(log.date_action || log.createdAt),
            "Utilisateur": log.user_name || "Système",
            "Type d'action": log.action_type,
            "Table concernée": log.table_concernee || "---",
            "Référence ID": log.reference_id || "---",
            "Description": log.description
        }));

        if (dataToExport.length === 0) {
            alert("Aucune donnée à exporter.");
            return;
        }

        const fileName = `Journal_Audit_${new Date().toISOString().slice(0,10)}`;
        exportToExcel(dataToExport, fileName);
    };

    const getFilteredData = () => {
        if (!logs) return [];
        
        return logs.filter(log => {
            const name = String(log.user_name || '').toLowerCase();
            const action = String(log.action_type || '').toLowerCase();
            const desc = String(log.description || '').toLowerCase();
            const search = searchTerm.toLowerCase();

            const matchesSearch = name.includes(search) || 
                                  action.includes(search) || 
                                  desc.includes(search);
            
            // Filtrage insensible à la casse pour le sélecteur
            const matchesFilter = filterAction === 'all' ? true : 
                                  String(log.action_type).toUpperCase() === filterAction.toUpperCase();
            
            return matchesSearch && matchesFilter;
        });
    };

    const formatDate = (dateString) => {
        if (!dateString) return '---';
        try {
            return new Date(dateString).toLocaleString('fr-FR', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
        } catch (e) { return dateString; }
    };

    const badgeStyle = (type) => {
        let background = '#e2e8f0';
        let color = '#475569';
        const t = String(type || '').toUpperCase();

        if (t === 'LOGIN' || t === 'SIGNUP') { background = '#dbeafe'; color = '#1e40af'; }
        if (t === 'INSERTION') { background = '#dcfce7'; color = '#15803d'; }
        if (t === 'MODIFICATION') { background = '#fef3c7'; color = '#92400e'; }
        if (t === 'SUPPRESSION') { background = '#fee2e2'; color = '#b91c1c'; }
        if (t === 'SYNCHRONISATION') { background = '#ede9fe'; color = '#5b21b6'; }
        if (t === 'ECHEC') { background = '#0f172a'; color = '#f1f5f9'; }
        
        return { padding: '4px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: '900', background, color, textTransform: 'uppercase' };
    };

    return (
        <div style={{ display: 'flex', height: '100vh', background: '#f1f5f9' }}>
            <Sidebar />
            <main style={{ flex: 1, overflowY: 'auto' }}>
                <header style={headerStyle}>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: '900', color: '#0f172a' }}>SYSTÈME</h1>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontSize: '13px' }}>
                            <Activity size={14} /> Journal des Actions (Audit)
                        </div>
                    </div>
                    <button onClick={handleExport} style={btnSecondaryStyle}>
                        <Download size={16} /> Exporter
                    </button>
                </header>

                <div style={{ padding: '25px 40px' }}>
                    <button onClick={() => navigate(-1)} style={backBtnStyle}>
                        <ArrowLeft size={16} /> Retour
                    </button>

                    <div style={toolbarStyle}>
                        <div style={searchContainerStyle}>
                            <Search size={18} color="#94a3b8" />
                            <input 
                                type="text" 
                                placeholder="Rechercher..." 
                                style={searchInputStyle}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <select 
                            style={selectStyle} 
                            value={filterAction}
                            onChange={(e) => setFilterAction(e.target.value)}
                        >
                            <option value="all">Toutes les actions</option>
                            <option value="SIGNUP">Inscriptions</option>
                            <option value="LOGIN">Connexions</option>
                            <option value="INSERTION">Créations</option>
                            <option value="MODIFICATION">Modifications</option>
                            <option value="SUPPRESSION">Suppressions</option>
                        </select>
                    </div>

                    <div style={containerStyle}>
                        {errorMessage && <div style={errorBannerStyle}>{errorMessage}</div>}
                        {loading && <div style={{padding: '20px', textAlign: 'center'}}>Chargement...</div>}

                        {!loading && !errorMessage && (
                            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                        <th style={{ ...thStyle, width: '15%' }}>Date / Heure</th>
                                        <th style={{ ...thStyle, width: '15%' }}>Utilisateur</th>
                                        <th style={{ ...thStyle, width: '12%' }}>Type</th>
                                        <th style={{ ...thStyle, width: '15%' }}>Table</th>
                                        <th style={{ ...thStyle, width: '10%' }}>Réf. ID</th>
                                        <th style={{ ...thStyle, width: '33%' }}>Description</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {getFilteredData().map((log, index) => (
                                        <tr key={log._id || log.id || index} style={trStyle}>
                                            <td style={{ ...tdStyle, color: '#64748b' }}>
                                                <div style={{display: 'flex', alignItems: 'center', gap: '5px'}}>
                                                    <Clock size={12}/> {formatDate(log.date_action || log.createdAt)}
                                                </div>
                                            </td>
                                            <td style={{ ...tdStyle, fontWeight: '700', color: '#0f172a' }}>
                                                {log.user_name || "Système"}
                                            </td>
                                            <td style={tdStyle}>
                                                <span style={badgeStyle(log.action_type)}>
                                                    {log.action_type || "ACTION"}
                                                </span>
                                            </td>
                                            <td style={{ ...tdStyle, color: '#475569' }}>
                                                {log.table_concernee || "---"}
                                            </td>
                                            <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '11px' }}>
                                                {log.reference_id || "---"}
                                            </td>
                                            <td style={{ ...tdStyle, color: '#64748b', fontSize: '12px' }}>
                                                {log.description}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                        {!loading && getFilteredData().length === 0 && !errorMessage && (
                            <div style={{padding: '40px', textAlign: 'center', color: '#64748b'}}>Aucun log trouvé.</div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
};

// --- STYLES (Inchangés pour garder votre design) ---
const headerStyle = { background: 'white', padding: '15px 40px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 10 };
const toolbarStyle = { display: 'flex', justifyContent: 'space-between', marginBottom: '15px', gap: '20px' };
const searchContainerStyle = { flex: 1, display: 'flex', alignItems: 'center', gap: '10px', background: 'white', padding: '0 15px', borderRadius: '10px', border: '1px solid #e2e8f0' };
const searchInputStyle = { width: '100%', border: 'none', padding: '12px 0', outline: 'none', fontSize: '14px', fontWeight: '500' };
const selectStyle = { padding: '10px', borderRadius: '10px', border: '1px solid #e2e8f0', outline: 'none', fontSize: '13px', fontWeight: '600', color: '#475569' };
const containerStyle = { background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' };
const thStyle = { padding: '15px 20px', fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: '800', textAlign: 'left' };
const tdStyle = { padding: '15px 20px', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
const trStyle = { borderBottom: '1px solid #f1f5f9', background: 'white', transition: '0.2s' };
const btnSecondaryStyle = { background: 'white', border: '1px solid #e2e8f0', padding: '10px 15px', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600', fontSize: '13px', color: '#475569' };
const backBtnStyle = { background: 'none', border: 'none', color: '#64748b', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '15px', fontWeight: '700', fontSize: '12px' };
const errorBannerStyle = { background: '#fee2e2', color: '#b91c1c', padding: '12px', textAlign: 'center', fontWeight: '700' };

export default AuditPage;