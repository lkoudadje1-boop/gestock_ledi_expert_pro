import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
    ClipboardList, RefreshCcw, Download, Calendar, 
    ListFilter, Eye, CheckCircle, Clock, Search, 
    Archive, Package 
} from 'lucide-react';
import API from '../../services/api';
import Sidebar from '../../components/Sidebar';
import { exportToExcel } from '../../utils/excelHelper';

const HistoriqueInventaire = () => {
    const [sessions, setSessions] = useState([]); 
    const [details, setDetails] = useState([]);   
    const [loading, setLoading] = useState(true);
    const [archivingId, setArchivingId] = useState(null);
    const [showFullHistory, setShowFullHistory] = useState(false);
    const [selectedSessionId, setSelectedSessionId] = useState(null);
    const [activeTab, setActiveTab] = useState('actif'); 

    const initialDates = { start: '', end: '' };
    const initialFilters = { article: '', sessionId: '', typeEcart: 'tous' };

    const [dateRange, setDateRange] = useState(initialDates);
    const [colFilters, setColFilters] = useState(initialFilters);

    const countArchives = useMemo(() => sessions.filter(s => s.statut === 'archive' || s.archived === 1).length, [sessions]);
    const countActifs = useMemo(() => sessions.filter(s => s.statut !== 'archive' && s.archived !== 1).length, [sessions]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const response = await API.get('/inventaireemb/historique-flux'); 
            
            if (response.data && response.data.success) {
                const rawData = response.data.data || [];
                
                const uniqueSessionsMap = new Map();
                rawData.forEach(item => {
                    if (!uniqueSessionsMap.has(item.inventaire_id)) {
                        uniqueSessionsMap.set(item.inventaire_id, {
                            id: item.inventaire_id,
                            libelle: item.libelle,
                            date_cloture: item.closed_at,
                            created_at: item.closed_at,
                            statut: 'valide', 
                            nom_utilisateur: item.nom_utilisateur,
                            archived: 0
                        });
                    }
                });
                
                setSessions(Array.from(uniqueSessionsMap.values()));
                setDetails(rawData);
            } else {
                setSessions([]);
                setDetails([]);
            }
        } catch (err) {
            console.error("Erreur chargement emballages:", err);
            setSessions([]);
            setDetails([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
        const handleGlobalUpdate = (event) => {
            if (event.detail === 'inventory' || event.detail === 'all') fetchData();
        };
        window.addEventListener('ERP_DATA_CHANGED', handleGlobalUpdate);
        return () => window.removeEventListener('ERP_DATA_CHANGED', handleGlobalUpdate);
    }, [fetchData]);

    const handleArchiveSession = async (id) => {
        setArchivingId(id); 
        try {
            const user = JSON.parse(localStorage.getItem('user')); 
            await API.post(`/inventaireemb/cancel`, { id, company_id: user?.company_id || user?.companyId });
            fetchData();
        } catch (err) {
            console.error("Erreur archivage:", err);
        } finally {
            setArchivingId(null);
        }
    };

    const handleSelectSession = (id) => {
        setSelectedSessionId(id);
        setShowFullHistory(false); 
        document.getElementById('titre-registre')?.scrollIntoView({ behavior: 'smooth' });
    };

    const resetAllFilters = () => {
        setSelectedSessionId(null);
        setShowFullHistory(false);
        setDateRange(initialDates);
        setColFilters(initialFilters);
    };

    const sessionsFiltrees = useMemo(() => {
        return sessions.filter(s => {
            const isArchived = s.statut === 'archive' || s.archived === 1;
            if (activeTab === 'actif' && isArchived) return false;
            if (activeTab === 'archive' && !isArchived) return false;
            if (!dateRange.start && !dateRange.end) return true;
            const dCloture = new Date(s.date_cloture || s.created_at).toISOString().split('T')[0];
            return (!dateRange.start || dCloture >= dateRange.start) && (!dateRange.end || dCloture <= dateRange.end);
        });
    }, [sessions, dateRange, activeTab]);

    const detailsFiltres = useMemo(() => {
        return details.filter((d) => {
            const matchSession = !selectedSessionId || String(d.inventaire_id) === String(selectedSessionId);
            const nomArticle = d.nom_emballage_snap || d.nom_article_snap || '';
            const matchArticle = nomArticle.toLowerCase().includes((colFilters.article || '').toLowerCase());
            const ecart = Number(d.ecart || 0);
            
            let matchEcart = true;
            if (colFilters.typeEcart === 'manquant') matchEcart = ecart < 0;
            if (colFilters.typeEcart === 'surplus') matchEcart = ecart > 0;
            return matchSession && matchArticle && matchEcart;
        });
    }, [details, selectedSessionId, colFilters]);

    const handleExportExcel = async () => {
        try {
            const response = await API.get('/inventaireemb/export-historique', { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `Historique_Flux_Emballage_${new Date().toLocaleDateString()}.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (error) {
            const dataToExport = detailsFiltres.map(d => ({ 
                'EMBALLAGE': d.nom_emballage_snap || d.nom_article_snap, 
                'STOCK THÉORIQUE': d.stock_theorique, 
                'STOCK RÉEL': d.stock_reel, 
                'ÉCART': d.ecart,
                'PRIX UNITAIRE': d.prix_unitaire,
                'VALEUR ÉCART': d.valeur_ecart
            }));
            exportToExcel(dataToExport, `Inventaire_Emballages_${activeTab}_${new Date().toLocaleDateString()}`);
        }
    };

    return (
        <div style={layoutStyle}>
            <Sidebar />
            <main style={mainStyle}>
                <header style={headerBarStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div style={iconBox}><ClipboardList size={24} color="#fff" /></div>
                        <div>
                            <h1 style={titleStyle}>HISTORIQUE DES INVENTAIRES</h1>
                            <div style={dateBox}>
                                <Calendar size={14} color="#800020" />
                                <input type="date" style={dateInput} value={dateRange.start} onChange={(e) => setDateRange({...dateRange, start: e.target.value})} />
                                <span style={{fontWeight:'900', color: '#800020'}}>au</span>
                                <input type="date" style={dateInput} value={dateRange.end} onChange={(e) => setDateRange({...dateRange, end: e.target.value})} />
                            </div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={handleExportExcel} style={btnExcel}><Download size={16} /> Export Excel</button>
                        <button onClick={fetchData} style={{...btnRefresh, border: '1px solid #800020', color: '#800020'}} disabled={loading}>
                            <RefreshCcw size={16} className={loading ? 'animate-spin' : ''} />
                        </button>
                    </div>
                </header>

                <div style={contentArea}>
                    <div style={tabContainer}>
                        <button 
                            style={activeTab === 'actif' ? tabActive : tabInactive} 
                            onClick={() => { setActiveTab('actif'); setSelectedSessionId(null); }}
                        >
                            <Package size={16} /> Sessions Actives ({countActifs})
                        </button>
                        <button 
                            style={activeTab === 'archive' ? tabActive : tabInactive} 
                            onClick={() => { setActiveTab('archive'); setSelectedSessionId(null); }}
                        >
                            <Archive size={16} /> Archives ({countArchives})
                        </button>
                    </div>

                    <h3 style={sectionTitle}>LISTE DES SESSIONS ({activeTab.toUpperCase()})</h3>
                    <div style={{...cardStyle, maxHeight: '300px', overflowY: 'auto', marginBottom: '25px'}}>
                        <table style={mainTable}>
                            <thead style={stickyHeaderStyle}>
                                <tr style={{background: '#800020', color: '#fff'}}>
                                    <th style={thStyleWhite}>REF SESSION</th>
                                    <th style={thStyleWhite}>UTILISATEUR</th>
                                    <th style={thCenterWhite}>STATUT</th>
                                    <th style={thCenterWhite}>NB ARTICLES</th>
                                    <th style={thCenterWhite}>VALEUR AJUST.</th>
                                    <th style={thStyleWhite}>DATE CLÔTURE</th>
                                    <th style={thCenterWhite}>ACTIONS</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sessionsFiltrees.length === 0 ? (
                                    <tr><td colSpan="7" style={emptyState}>Aucune session trouvée</td></tr>
                                ) : (
                                    sessionsFiltrees.map((s) => {
                                        const lignesSession = details.filter(d => d.inventaire_id === s.id);
                                        const nbArticles = lignesSession.length;
                                        const valeurAjustement = lignesSession.reduce((sum, current) => sum + Number(current.valeur_ecart || 0), 0);
                                        return (
                                            <tr key={s.id} style={trStyle}>
                                                <td style={tdStyle}>
                                                    <span style={invBadge} onClick={() => handleSelectSession(s.id)}>
                                                        {s.id.toString().startsWith('INV-') ? s.id : `INV-${s.id}`}
                                                    </span>
                                                </td>
                                                <td style={{...tdStyle, fontWeight: '600'}}>{s.nom_utilisateur || '---'}</td>
                                                <td style={tdCenter}>
                                                    <span style={s.statut === 'valide' || s.statut === 'archive' ? statusClosed : statusOpen}>
                                                        {s.statut === 'valide' || s.statut === 'archive' ? <CheckCircle size={12}/> : <Clock size={12}/>}
                                                        {s.statut}
                                                    </span>
                                                </td>
                                                <td style={tdCenter}>{nbArticles}</td>
                                                <td style={{...tdCenter, color: valeurAjustement >= 0 ? '#16a34a' : '#dc2626', fontWeight:'900'}}>
                                                    {Math.round(valeurAjustement).toLocaleString()} F
                                                </td>
                                                <td style={{...tdStyle, fontSize: '11px', fontWeight:'700'}}>
                                                    {s.date_cloture ? new Date(s.date_cloture).toLocaleString() : '---'}
                                                </td>
                                                <td style={tdCenter}>
                                                    <div style={{display:'flex', gap:'8px', justifyContent:'center'}}>
                                                        <button style={btnSmall} onClick={() => handleSelectSession(s.id)}><Eye size={14} /></button>
                                                        {activeTab === 'actif' && (
                                                            <button style={btnArchive} onClick={() => handleArchiveSession(s.id)} disabled={archivingId === s.id}>
                                                                {archivingId === s.id ? <RefreshCcw size={14} className="animate-spin" /> : <Archive size={14} />}
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px'}}>
                        <h3 id="titre-registre" style={sectionTitle}>
                            {selectedSessionId ? `ÉCARTS SESSION ${selectedSessionId}` : "REGISTRE DÉTAILLÉ"}
                        </h3>
                        <div style={{display: 'flex', gap: '10px'}}>
                            <button onClick={() => {setShowFullHistory(true); setSelectedSessionId(null);}} style={btnShowAll}>TOUT L'HISTORIQUE</button>
                            <button onClick={resetAllFilters} style={btnReset}><ListFilter size={14} /> RESET</button>
                        </div>
                    </div>

                    <div style={{...cardStyle, maxHeight: '450px', overflowY: 'auto'}}>
                        <table style={mainTable}>
                            <thead style={stickyHeaderStyle}>
                                <tr style={{background: '#f8fafc', borderBottom: '2px solid #e2e8f0'}}>
                                    <th style={thStyle}>ARTICLE</th>
                                    <th style={thCenter}>STK THÉO</th>
                                    <th style={thCenter}>STK RÉEL</th>
                                    <th style={thCenter}>ÉCART</th>
                                    <th style={thCenter}>PRIX UNIT.</th>
                                    <th style={thCenter}>VALEUR ÉCART</th>
                                    <th style={thStyle}>REF SESSION</th>
                                </tr>
                                <tr style={{ background: '#fff' }}>
                                    <th style={filterTh}>
                                        <div style={{position:'relative'}}>
                                            <Search size={12} style={{position:'absolute', left:'8px', top:'50%', transform:'translateY(-50%)', color:'#800020'}}/>
                                            <input placeholder="Filtrer..." style={{...filterInput, paddingLeft:'25px'}} value={colFilters.article} onChange={(e) => setColFilters({...colFilters, article: e.target.value})} />
                                        </div>
                                    </th>
                                    <th colSpan={2} style={filterTh}></th>
                                    <th style={filterTh}>
                                        <select style={filterInput} value={colFilters.typeEcart} onChange={(e) => setColFilters({...colFilters, typeEcart: e.target.value})}>
                                            <option value="tous">Tous</option>
                                            <option value="manquant">(-) Manquant</option>
                                            <option value="surplus">(+) Surplus</option>
                                        </select>
                                    </th>
                                    <th colSpan={3} style={filterTh}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {detailsFiltres.map((d, index) => {
                                    const ecart = Number(d.ecart || 0);
                                    return (
                                        <tr key={index} style={trStyle}>
                                            <td style={{...tdStyle, fontWeight: '800'}}>{d.nom_emballage_snap || 'Inconnu'}</td>
                                            <td style={tdCenter}>{d.stock_theorique}</td>
                                            <td style={{...tdCenter, fontWeight: 'bold', color: '#800020'}}>{d.stock_reel}</td>
                                            <td style={tdCenter}>
                                                <span style={{background: ecart === 0 ? '#f1f5f9' : ecart > 0 ? '#dcfce7' : '#fee2e2', color: ecart === 0 ? '#64748b' : ecart > 0 ? '#16a34a' : '#dc2626', padding: '4px 8px', borderRadius: '4px', fontWeight: '900'}}>
                                                    {ecart > 0 ? '+' : ''}{ecart}
                                                </span>
                                            </td>
                                            <td style={tdCenter}>{Math.round(d.prix_unitaire || 0).toLocaleString()} F</td>
                                            <td style={{...tdCenter, fontWeight: '900', color: ecart < 0 ? '#dc2626' : ecart > 0 ? '#16a34a' : '#1e293b'}}>
                                                {Math.round(d.valeur_ecart || 0).toLocaleString()} F
                                            </td>
                                            <td style={tdStyle}>
                                                <span style={invBadge}>{d.inventaire_id?.toString().startsWith('INV-') ? d.inventaire_id : `INV-${d.inventaire_id}`}</span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>
        </div>
    );
};

// --- STYLES ---
const layoutStyle = { display: 'flex', height: '100vh', background: '#F8FAFC' };
const mainStyle = { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' };
const headerBarStyle = { background: '#fff', padding: '16px 24px', borderBottom: '3px solid #800020', display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
const iconBox = { background: '#800020', padding: '8px', borderRadius: '8px' };
const titleStyle = { margin: 0, fontSize: '18px', fontWeight: '900', color: '#1e293b' };
const dateBox = { display: 'flex', alignItems: 'center', gap: '10px', background: '#fff', padding: '6px 12px', borderRadius: '8px', border: '2px solid #800020', marginTop: '6px' };
const dateInput = { border: 'none', background: 'transparent', fontSize: '13px', outline: 'none', fontWeight: '800', color: '#800020' };
const contentArea = { padding: '20px', overflowY: 'auto' };
const tabContainer = { display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '1px solid #cbd5e1', paddingBottom: '10px' };
const tabInactive = { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', background: '#f1f5f9', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', color: '#64748b' };
const tabActive = { ...tabInactive, background: '#800020', color: '#fff' };
const sectionTitle = { fontSize: '12px', fontWeight: '900', color: '#800020', textTransform: 'uppercase', marginBottom: '8px' };
const cardStyle = { background: '#fff', borderRadius: '10px', border: '2px solid #cbd5e1', overflow: 'hidden' };
const mainTable = { width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: '1000px' };
const stickyHeaderStyle = { position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#fff' }; 
const thStyle = { padding: '12px 10px', background: '#f8fafc', color: '#1e293b', fontSize: '11px', fontWeight: '900', textAlign: 'left', borderBottom: '2px solid #800020' };
const thStyleWhite = { ...thStyle, background: '#800020', color: '#fff' };
const thCenter = { ...thStyle, textAlign: 'center' };
const thCenterWhite = { ...thCenter, background: '#800020', color: '#fff' };
const tdStyle = { padding: '12px 10px', fontSize: '12px', color: '#334155', borderBottom: '1px solid #f1f5f9' };
const tdCenter = { ...tdStyle, textAlign: 'center' };
const trStyle = { borderBottom: '1px solid #e2e8f0' };
const filterTh = { padding: '8px 10px', borderBottom: '2px solid #800020', background: '#fff', position: 'sticky', top: '35px', zIndex: 5 };
const filterInput = { width: '100%', padding: '6px', fontSize: '11px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontWeight: '600' };
const btnRefresh = { background: '#fff', border: '2px solid #800020', padding: '8px', borderRadius: '8px', cursor: 'pointer', color: '#800020' };
const btnExcel = { background: '#059669', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '900', display:'flex', alignItems:'center', gap:'8px' };
const btnSmall = { border: '1.5px solid #800020', background: '#fdf2f4', padding: '6px', borderRadius: '6px', cursor: 'pointer', color: '#800020' };
const btnArchive = { border: '1.5px solid #64748b', background: '#fff', padding: '6px', borderRadius: '6px', cursor: 'pointer', color: '#64748b' };
const invBadge = { background: '#fdf2f4', color: '#800020', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '900', border: '1.5px solid #ca9ea7', cursor:'pointer' };
const statusClosed = { background: '#dcfce7', color: '#166534', padding: '4px 8px', borderRadius: '12px', fontSize: '10px', fontWeight: '900', display: 'inline-flex', alignItems: 'center', gap: '4px' };
const statusOpen = { ...statusClosed, background: '#fef9c3', color: '#854d0e' };
const btnShowAll = { background: '#800020', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: '900' };
const btnReset = { background: '#fff', color: '#800020', border: '2px solid #800020', padding: '8px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '6px' };
const emptyState = { textAlign: 'center', padding: '40px', color: '#64748b', fontStyle: 'italic', fontSize: '14px' };

export default HistoriqueInventaire;