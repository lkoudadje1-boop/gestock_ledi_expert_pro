import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Loader2, Plus, History, TrendingUp, TrendingDown } from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import API, { socket } from '../../services/api';

const SaisieOperations = () => {
    const { id } = useParams();
    const { state } = useLocation();
    const navigate = useNavigate();
    const brouillard = state?.brouillard;

    const [operations, setOperations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [formData, setFormData] = useState({
        date_mouvement: new Date().toISOString().split('T')[0],
        libelle: '',
        piece_ref: '',
        type_flux: 'ENCAISSEMENT',
        montant: ''
    });

    const fetchOperations = async () => {
        try {
            const res = await API.get(`/treso/operations/liste/${id}`);
            setOperations(res.data || []);
        } catch (err) { console.error(err); } 
        finally { setLoading(false); }
    };

 useEffect(() => {
    // 1. Chargement initial
    fetchOperations();
    
    // 2. Connexion à la room de la société
    joinCompanyRoom();

    if (!socket) return;

    const handleUpdate = (event) => {
        // On écoute le signal spécifique de trésorerie OU le signal universel des brouillons
        // (car un rejet au brouillon impacte la trésorerie)
        if (
            event === 'REFRESH_OP_TRESO' || 
            event.table === 'brouillon_ecritures' || 
            event.table === 'journal_entries'
        ) {
            console.log("🔄 Mise à jour Trésorerie détectée");
            fetchOperations();
        }
    };

    // Écoute des différents canaux
    socket.on('REFRESH_OP_TRESO', fetchOperations);
    socket.on('DATA_EVENT', handleUpdate);

    return () => {
        socket.off('REFRESH_OP_TRESO', fetchOperations);
        socket.off('DATA_EVENT', handleUpdate);
    };
}, [id]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            await API.post('/treso/operations/operation/creer', { ...formData, brouillard_id: id });
            setFormData({ ...formData, libelle: '', piece_ref: '', montant: '' });
            fetchOperations();
        } catch (err) { alert("Erreur lors de l'enregistrement"); }
        finally { setIsSubmitting(false); }
    };

    const soldeSession = useMemo(() => {
        return operations.reduce((acc, curr) => 
            curr.type_flux === 'ENCAISSEMENT' ? acc + curr.montant : acc - curr.montant, 0);
    }, [operations]);

    const BORDEAUX = '#800020';

    return (
        <div style={layoutStyle}>
            <Sidebar />
            <main style={mainStyle}>
                <header style={headerStyle}>
                    <button onClick={() => navigate(-1)} style={btnBack}><ArrowLeft size={18}/></button>
                    <div style={{ flex: 1, marginLeft: '20px' }}>
                        <h1 style={titleStyle}>{brouillard?.libelle || "Saisie"}</h1>
                        <span style={subtitleStyle}>Journal: {brouillard?.journal_code} | Compte: {brouillard?.compte_numero}</span>
                    </div>
                    <div style={soldeBox}>
                        <span style={soldeLabel}>SOLDE SESSION</span>
                        <span style={{...soldeValue, color: soldeSession >= 0 ? '#10b981' : '#ef4444'}}>
                            {new Intl.NumberFormat().format(soldeSession)} XAF
                        </span>
                    </div>
                </header>

                <div style={contentStyle}>
                    <div style={mainGrid}>
                        <div style={formCard}>
                            <h2 style={sectionTitle}><Plus size={16}/> NOUVELLE ÉCRITURE</h2>
                            <form onSubmit={handleSubmit}>
                                <div style={inputGroup}>
                                    <label style={labelMini}>DATE</label>
                                    <input type="date" style={input} value={formData.date_mouvement} onChange={e => setFormData({...formData, date_mouvement: e.target.value})} required/>
                                </div>
                                <div style={fluxToggle}>
                                    <button type="button" onClick={() => setFormData({...formData, type_flux: 'ENCAISSEMENT'})} style={formData.type_flux === 'ENCAISSEMENT' ? btnEncActive : btnFluxIn}>ENCAISSEMENT</button>
                                    <button type="button" onClick={() => setFormData({...formData, type_flux: 'DECAISSEMENT'})} style={formData.type_flux === 'DECAISSEMENT' ? btnDecActive : btnFluxIn}>DÉCAISSEMENT</button>
                                </div>
                                <div style={inputGroup}>
                                    <label style={labelMini}>LIBELLÉ</label>
                                    <input placeholder="Libellé..." style={input} value={formData.libelle} onChange={e => setFormData({...formData, libelle: e.target.value.toUpperCase()})} required/>
                                </div>
                                <div style={inputGroup}>
                                    <label style={labelMini}>MONTANT</label>
                                    <input type="number" step="0.01" style={{...input, fontSize: '20px', color: BORDEAUX}} value={formData.montant} onChange={e => setFormData({...formData, montant: e.target.value})} required/>
                                </div>
                                <button type="submit" disabled={isSubmitting} style={btnSubmit}>
                                    {isSubmitting ? <Loader2 className="animate-spin" size={18}/> : <Save size={18}/>} ENREGISTRER
                                </button>
                            </form>
                        </div>
                        <div style={listCard}>
                            <h2 style={sectionTitle}><History size={16}/> HISTORIQUE</h2>
                            <table style={table}>
                                <thead><tr style={thRow}><th style={th}>DATE</th><th style={th}>LIBELLÉ</th><th style={th} align="right">ENTRÉE</th><th style={th} align="right">SORTIE</th></tr></thead>
                                <tbody>
                                    {operations.map(op => (
                                        <tr key={op.id} style={tr}>
                                            <td style={td}>{op.date_mouvement}</td>
                                            <td style={td}><b>{op.libelle}</b></td>
                                            <td style={{...td, color: '#10b981'}} align="right">{op.type_flux === 'ENCAISSEMENT' ? op.montant : ''}</td>
                                            <td style={{...td, color: '#ef4444'}} align="right">{op.type_flux === 'DECAISSEMENT' ? op.montant : ''}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

// Styles (identiques à ceux utilisés précédemment)
const BORDEAUX = '#800020';
const layoutStyle = { display: 'flex', height: '100vh', background: '#f1f5f9' };
const mainStyle = { flex: 1, display: 'flex', flexDirection: 'column' };
const headerStyle = { background: 'white', padding: '15px 40px', borderBottom: `4px solid ${BORDEAUX}`, display: 'flex', alignItems: 'center' };
const btnBack = { border: 'none', background: '#f1f5f9', padding: '10px', borderRadius: '12px', cursor: 'pointer' };
const titleStyle = { margin: 0, fontSize: '18px', fontWeight: '900' };
const subtitleStyle = { fontSize: '11px', color: '#64748b' };
const soldeBox = { textAlign: 'right', background: '#f8fafc', padding: '10px 20px', borderRadius: '12px', border: '1px solid #e2e8f0' };
const soldeLabel = { display: 'block', fontSize: '9px', fontWeight: '900', color: '#64748b' };
const soldeValue = { fontSize: '18px', fontWeight: '900' };
const contentStyle = { padding: '30px 40px', flex: 1, overflowY: 'auto' };
const mainGrid = { display: 'grid', gridTemplateColumns: '400px 1fr', gap: '30px' };
const formCard = { background: 'white', padding: '25px', borderRadius: '20px', border: '1px solid #e2e8f0' };
const sectionTitle = { fontSize: '12px', fontWeight: '900', color: BORDEAUX, marginBottom: '20px', display: 'flex', gap: '8px' };
const inputGroup = { marginBottom: '15px' };
const labelMini = { fontSize: '10px', fontWeight: '900', color: '#94a3b8', display: 'block', marginBottom: '5px' };
const input = { width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontWeight: '700', fontSize: '13px' };
const fluxToggle = { display: 'flex', gap: '10px', marginBottom: '15px' };
const btnFluxIn = { flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', background: 'white', fontSize: '10px', fontWeight: '800', cursor: 'pointer' };
const btnEncActive = { ...btnFluxIn, background: '#dcfce7', color: '#15803d', border: '1px solid #22c55e' };
const btnDecActive = { ...btnFluxIn, background: '#fee2e2', color: '#b91c1c', border: '1px solid #ef4444' };
const btnSubmit = { width: '100%', marginTop: '10px', background: BORDEAUX, color: 'white', border: 'none', padding: '15px', borderRadius: '10px', fontWeight: '900', cursor: 'pointer', display: 'flex', justifyContent: 'center', gap: '10px' };
const listCard = { background: 'white', padding: '25px', borderRadius: '20px', border: '1px solid #e2e8f0' };
const table = { width: '100%', borderCollapse: 'collapse' };
const thRow = { borderBottom: '2px solid #f1f5f9' };
const th = { padding: '12px', textAlign: 'left', fontSize: '10px', color: '#64748b' };
const tr = { borderBottom: '1px solid #f1f5f9' };
const td = { padding: '15px 12px', fontSize: '13px' };

export default SaisieOperations;