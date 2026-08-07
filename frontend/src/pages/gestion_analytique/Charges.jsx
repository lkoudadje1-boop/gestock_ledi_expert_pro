import React, { useState, useEffect } from 'react';
import { Plus, Trash2, PieChart, Activity, Save, Loader2, AlertCircle, CheckCircle2, Search } from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import API, { socket } from '../../services/api';

const Charges = () => {
    const [rubriques, setRubriques] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [status, setStatus] = useState({ type: '', msg: '' });

    // État du formulaire
    const [newRubrique, setNewRubrique] = useState({
        nom: '',
        type_calcul: 'VARIABLE'
    });

    const showStatus = (type, msg) => {
        setStatus({ type, msg });
        if (type === 'success') setTimeout(() => setStatus({ type: '', msg: '' }), 4000);
    };

    const fetchRubriques = async () => {
        try {
            const res = await API.get('/charges/rubriques');
            if (res.data.success) setRubriques(res.data.data);
        } catch (err) {
            showStatus('error', "Erreur de chargement des rubriques.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRubriques();
        if (socket) {
            socket.on('REFRESH_UI', (data) => {
                if (data.module === 'CHARGES') fetchRubriques();
            });
            return () => socket.off('REFRESH_UI');
        }
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!newRubrique.nom) return;
        setSubmitting(true);
        try {
            const res = await API.post('/charges/rubriques', newRubrique);
            if (res.data.success) {
                showStatus('success', "RUBRIQUE AJOUTÉE !");
                setNewRubrique({ nom: '', type_calcul: 'VARIABLE' });
                fetchRubriques();
            }
        } catch (err) {
            showStatus('error', err.response?.data?.error || "Erreur de création.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Supprimer cette rubrique ?")) return;
        try {
            await API.delete(`/charges/rubriques/${id}`);
            showStatus('success', "RUBRIQUE SUPPRIMÉE");
            fetchRubriques();
        } catch (err) {
            showStatus('error', "Erreur lors de la suppression.");
        }
    };

    const filteredRubriques = rubriques.filter(r => 
        r.nom.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div style={{ display: 'flex', height: '100vh', width: '100vw', background: '#f8fafc', overflow: 'hidden' }}>
            <Sidebar />
            <main style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', overflowY: 'auto' }}>
                
                {/* HEADER */}
                <header style={s.header}>
                    <div style={s.headerContainer}>
                        <div>
                            <h1 style={s.headerTitle}>Gestion des Charges</h1>
                            <p style={s.headerSubtitle}>Définition des rubriques analytiques (Fixes & Variables)</p>
                        </div>
                        {status.msg && (
                            <div style={{ ...s.statusBadge, 
                                backgroundColor: status.type === 'success' ? '#f0fdf4' : '#fef2f2',
                                color: status.type === 'success' ? '#166534' : '#991b1b' }}>
                                {status.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                                {status.msg}
                            </div>
                        )}
                    </div>
                </header>

                <div style={s.contentArea}>
                    <div style={s.mainGrid}>
                        
                        {/* FORMULAIRE D'AJOUT */}
                        <div style={s.formSide}>
                            <form onSubmit={handleSubmit} style={s.card}>
                                <h3 style={s.cardTitle}><Plus size={18} /> Nouvelle Rubrique</h3>
                                <div style={s.inputGroup}>
                                    <label style={s.label}>NOM DE LA CHARGE</label>
                                    <input 
                                        style={s.input} 
                                        type="text" 
                                        placeholder="Ex: LOYER, ÉLECTRICITÉ..." 
                                        value={newRubrique.nom}
                                        onChange={e => setNewRubrique({...newRubrique, nom: e.target.value})}
                                        required
                                    />
                                </div>
                                <div style={s.inputGroup}>
                                    <label style={s.label}>TYPE DE CALCUL</label>
                                    <select 
                                        style={s.input}
                                        value={newRubrique.type_calcul}
                                        onChange={e => setNewRubrique({...newRubrique, type_calcul: e.target.value})}
                                    >
                                        <option value="VARIABLE">🔴 CHARGE VARIABLE (Liée au volume)</option>
                                        <option value="FIXE">🔵 CHARGE FIXE (Structurelle)</option>
                                    </select>
                                </div>
                                <button type="submit" disabled={submitting} style={s.btnSave}>
                                    {submitting ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                                    {submitting ? "ENREGISTREMENT..." : "AJOUTER LA RUBRIQUE"}
                                </button>
                            </form>

                            {/* RÉSUMÉ RAPIDE */}
                            <div style={s.statsCard}>
                                <div style={s.statItem}>
                                    <span style={{color: '#64748b', fontSize: '12px', fontWeight: '700'}}>TOTAL RUBRIQUES</span>
                                    <span style={{fontSize: '24px', fontWeight: '900'}}>{rubriques.length}</span>
                                </div>
                            </div>
                        </div>

                        {/* LISTE DES RUBRIQUES */}
                        <div style={s.listSide}>
                            <div style={s.searchBar}>
                                <Search size={18} color="#94a3b8" />
                                <input 
                                    type="text" 
                                    placeholder="Rechercher une charge..." 
                                    style={s.searchInput}
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                />
                            </div>

                            <div style={s.listContainer}>
                                {loading ? (
                                    <div style={{textAlign: 'center', padding: '50px'}}><Loader2 className="animate-spin" size={32} color="#2563eb" /></div>
                                ) : filteredRubriques.length === 0 ? (
                                    <div style={s.emptyState}>Aucune rubrique trouvée.</div>
                                ) : (
                                    <table style={s.table}>
                                        <thead>
                                            <tr>
                                                <th style={s.th}>RUBRIQUE</th>
                                                <th style={s.th}>TYPE</th>
                                                <th style={s.th}>DATE CRÉATION</th>
                                                <th style={s.th}>ACTION</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredRubriques.map(rub => (
                                                <tr key={rub.id} style={s.tr}>
                                                    <td style={{...s.td, fontWeight: '800'}}>{rub.nom}</td>
                                                    <td style={s.td}>
                                                        <span style={{
                                                            ...s.badge,
                                                            backgroundColor: rub.type_calcul === 'FIXE' ? '#eff6ff' : '#fff1f2',
                                                            color: rub.type_calcul === 'FIXE' ? '#2563eb' : '#e11d48'
                                                        }}>
                                                            {rub.type_calcul}
                                                        </span>
                                                    </td>
                                                    <td style={{...s.td, color: '#64748b', fontSize: '12px'}}>
                                                        {new Date(rub.created_at).toLocaleDateString()}
                                                    </td>
                                                    <td style={s.td}>
                                                        <button onClick={() => handleDelete(rub.id)} style={s.btnDelete}>
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </div>

                    </div>
                </div>
            </main>
        </div>
    );
};

const s = {
    header: { background: 'white', padding: '20px 40px', borderBottom: '1px solid #e2e8f0' },
    headerContainer: { maxWidth: '1400px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    headerTitle: { margin: 0, fontSize: '22px', fontWeight: '900', color: '#0f172a' },
    headerSubtitle: { margin: 0, color: '#64748b', fontSize: '13px' },
    statusBadge: { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '20px', fontSize: '12px', fontWeight: '800' },
    contentArea: { padding: '30px 40px', maxWidth: '1400px', margin: '0 auto', width: '100%', boxSizing: 'border-box' },
    mainGrid: { display: 'grid', gridTemplateColumns: '350px 1fr', gap: '30px' },
    card: { background: 'white', padding: '25px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
    cardTitle: { margin: '0 0 20px 0', fontSize: '16px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '10px' },
    inputGroup: { display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' },
    label: { fontSize: '10px', fontWeight: '900', color: '#64748b' },
    input: { padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none', fontWeight: '600' },
    btnSave: { width: '100%', padding: '12px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '800', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px' },
    statsCard: { marginTop: '20px', background: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' },
    statItem: { display: 'flex', flexDirection: 'column', gap: '5px' },
    listSide: { display: 'flex', flexDirection: 'column', gap: '20px' },
    searchBar: { background: 'white', padding: '12px 20px', borderRadius: '10px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '12px' },
    searchInput: { border: 'none', outline: 'none', width: '100%', fontWeight: '600', fontSize: '14px' },
    listContainer: { background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' },
    table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left' },
    th: { padding: '15px 20px', background: '#f8fafc', fontSize: '11px', fontWeight: '900', color: '#64748b', borderBottom: '1px solid #e2e8f0', textTransform: 'uppercase' },
    tr: { borderBottom: '1px solid #f1f5f9' },
    td: { padding: '15px 20px', fontSize: '14px' },
    badge: { padding: '4px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: '900' },
    btnDelete: { background: '#fff1f2', color: '#e11d48', border: 'none', padding: '8px', borderRadius: '6px', cursor: 'pointer' },
    emptyState: { padding: '50px', textAlign: 'center', color: '#64748b', fontWeight: '600' }
};

export default Charges;