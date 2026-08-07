import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'; // ✅ Tous les hooks React nécessaires déclarés ici
import { useNavigate } from 'react-router-dom';
import { 
  Search, Download, Eye, RefreshCw, CheckCircle, 
  AlertTriangle, Lock, Archive, ChevronDown, ChevronUp, Printer 
} from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import API from '../../services/api';
import * as XLSX from 'xlsx';
import { useReactToPrint } from 'react-to-print';
import CloturePrint from './clotureprint'; // 🖨️ Importation du composant de reçu d'Arrestation A5

const HistoriqueCloture = () => {
    const navigate = useNavigate();
    
    // --- ÉTATS ---
    const [clotures, setClotures] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterDate, setFilterDate] = useState('');
    const [activeTab, setActiveTab] = useState('cloturer'); 
    const [expandedRow, setExpandedRow] = useState(null);

    // 🚀 STABILISATION COMPTABLE DE L'INFRASTRUCTURE D'IMPRESSION REACT-TO-PRINT
    const printRef = useRef(null);
    const [printData, setPrintData] = useState(null);

    // 🚀 HYDRATATION SÉCURISÉE DES PARAMS DE L'ENTREPRISE VIA LOCALSTORAGE & API
    const currentUser = useMemo(() => JSON.parse(localStorage.getItem('user') || '{}'), []);
    const [dynamiqueCompanyPrint, setDynamiqueCompanyPrint] = useState({
        name: currentUser.company_name || currentUser.companyName || "LEDI EXPERT PRO",
        address: currentUser.company_address || currentUser.companyAddress || "Adresse non renseignée",
        phone: currentUser.company_phone || currentUser.companyPhone || "Tél: N/A",
        email: currentUser.company_email || currentUser.companyEmail || "Email: N/A",
        logo_data: currentUser.company_logo || currentUser.logo_data || currentUser.logo || null
    });

    useEffect(() => {
        const fetchCompanySettings = async () => {
            try {
                const res = await API.get('/company/settings'); 
                if (res.data) {
                    const data = res.data.success && res.data.data ? res.data.data : res.data;
                    setDynamiqueCompanyPrint({
                        name: data.name || data.nom || data.raison_sociale || currentUser.company_name || "LEDI EXPERT PRO",
                        address: data.address || data.adresse || currentUser.company_address || "Adresse non renseignée",
                        phone: data.phone || data.telephone || currentUser.company_phone || "Tél: N/A",
                        email: data.email || currentUser.company_email || "Email: N/A",
                        logo_data: data.logo_data || data.logo || data.logo_url || currentUser.company_logo || null
                    });
                }
            } catch (err) {
                console.error("Erreur chargement paramètres entreprise pour reçu:", err);
            }
        };
        fetchCompanySettings();
    }, [currentUser]);

    // --- RÉCUPÉRATION DES SESSIONS DE CAISSE ---
    const fetchHistorique = async () => {
        try {
            setLoading(true);
            const res = await API.get('/pos/clotures/history');

            if (res.data && res.data.success) {
                setClotures(res.data.data || []);
            } else {
                setClotures([]);
            }
        } catch (err) {
            console.error("Erreur lors du chargement de l'historique", err);
            setClotures([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchHistorique();
    }, [activeTab]);

    // --- 🖨️ CONFIGURATION ET DÉCLENCHEMENT DE L'IMPRESSION FINALE A5 PORTRAIT ---
    const handlePrint = useReactToPrint({
        content: () => printRef.current,
        documentTitle: `BILAN_SESSION_CAISSE`,
        pageStyle: `
            @page {
                size: A5 portrait !important; 
                margin: 0 !important;
            }
            body {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
                margin: 0;
                padding: 0;
            }
        `,
        onAfterPrint: () => setPrintData(null)
    });

    // Émetteur asynchrone raccordé avec le micro-délai d'hydratation de 180ms
      // --- 🖨️ CONFIGURATION ET DÉCLENCHEMENT DE L'IMPRESSION FINALE A5 PORTRAIT ---
    const preparePrintCloture = (clotureRow) => {
        if (!clotureRow) return;

        // ✅ INJECTION MAJEURE ANTI-MANQUE : On force la capture du tableau "tous_details" du sous-panneau
        const payloadImpression = {
            clotureInfo: {
                id: clotureRow.session_id || clotureRow.id || '---',
                DATE_CLÔTURE: clotureRow.date_cloture ? new Date(clotureRow.date_cloture).toLocaleString('fr-FR') : new Date().toLocaleDateString('fr-FR'),
                UTILISATEUR: (clotureRow.utilisateur || 'user').toUpperCase(),
                THEORIQUE: Number(clotureRow.montant_attendu || clotureRow.attendu || 0),
                REEL: Number(clotureRow.montant_reel || clotureRow.reel || 0),
                ÉCART: Number(clotureRow.ecart !== undefined ? clotureRow.ecart : (Number(clotureRow.montant_reel || 0) - Number(clotureRow.montant_attendu || 0))),
                mode_reglement: clotureRow.mode_reglement || "Espèces / Multi-paiements",
                
                // 🎯 TRANSMISSION CRITIQUE DES LIGNES COMPTABLES (CRC, CRC 2 M, etc.)
                tous_details: clotureRow.tous_details || [] 
            },
            company: { ...dynamiqueCompanyPrint },
            userName: clotureRow.utilisateur || 'user'
        };

        setPrintData(payloadImpression);
        setTimeout(() => {
            handlePrint();
        }, 180);
    };


    // --- ACTION ARCHIVER ---
    const handleArchive = async (e, id) => {
        e.stopPropagation();
        if(!window.confirm("Voulez-vous vraiment archiver cette session ?")) return;
        try {
            await API.put(`/pos/clotures/archive/${id}`);
            fetchHistorique();
        } catch (err) {
            console.error("Erreur lors de l'archivage", err);
        }
    };

    // --- LOGIQUE DE FILTRAGE ---
    const filteredClotures = clotures.filter(c => {
        const isArchived = Number(c.is_archived) === 1;
        const isClosed = c.date_cloture !== null && c.date_cloture !== undefined;

        if (activeTab === 'cloturer' && (!isClosed || isArchived)) return false;
        if (activeTab === 'archive' && !isArchived) return false;

        const searchLower = searchTerm.toLowerCase();
        const matchesSearch = 
            (c.utilisateur || "user").toLowerCase().includes(searchLower) || 
            (c.session_id || c.id || "").toString().includes(searchLower);

        const matchesDate = filterDate ? (c.date_cloture || c.date_ouverture)?.includes(filterDate) : true;

        return matchesSearch && matchesDate;
    });

    const toggleRow = (id) => {
        setExpandedRow(expandedRow === id ? null : id);
    };

    // --- EXPORTATION EXCEL (CONSERVÉE STRICTEMENT ICI AVEC LE BON NOM DE FONCTION) ---
    const handleExport = () => {
        if (filteredClotures.length === 0) return alert("Aucune donnée à exporter");

        const data = filteredClotures.map(c => {
            const row = {
                'SESSION ID': c.session_id || c.id,
                'UTILISATEUR': (c.utilisateur || 'user').toUpperCase(),
                'DATE CLÔTURE': c.date_cloture ? new Date(c.date_cloture).toLocaleString('fr-FR') : 'OUVERTE',
                'TOTAL ATTENDU': Number(c.montant_attendu || c.attendu || 0),
                'TOTAL RÉEL': Number(c.montant_reel || c.reel || 0),
                'ÉCART GLOBAL': Number(c.ecart || 0),
                'OBSERVATION GÉNÉRALE': c.note_cloture || c.observation || ''
            };

            if (c.tous_details) {
                c.tous_details.forEach(det => {
                    const label = det.methode.toUpperCase();
                    row[`${label} (Théorique)`] = Number(det.theorique || det.attendu || 0);
                    row[`${label} (Réel)`] = Number(det.reel || 0);
                    row[`${label} (Observation)`] = det.commentaire || det.observation || '';
                });
            }
            return row;
        });

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Rapport_Clotures");
        XLSX.writeFile(wb, `Export_Compta_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    return (
        <div style={{ display: 'flex', height: '100vh', background: '#f8fafc' }}>
            <Sidebar />
            
            <main style={{ flex: 1, overflowY: 'auto' }}>
                <style>{`
                    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                    .spin { animation: spin 1s linear infinite; }
                    .detail-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                    .detail-table th { text-align: left; font-size: 10px; color: #94a3b8; padding: 8px; border-bottom: 1px solid #e2e8f0; text-transform: uppercase; }
                    .detail-table td { padding: 10px 8px; font-size: 12px; color: #1e293b; border-bottom: 1px solid #f1f5f9; }
                `}</style>

                <header style={headerStyle}>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '18px', fontWeight: '900', color: '#1e293b' }}>HISTORIQUE DES SESSIONS</h1>
                        <span style={{ color: '#64748b', fontSize: '12px' }}>Analyse des écarts et flux financiers</span>
                    </div>
                    {/* ✅ Cible correctement handleExport sans plus jamais provoquer d'erreur */}
                    <button onClick={handleExport} style={btnExportStyle}>
                        <Download size={16} /> Exporter Excel
                    </button>
                </header>

                <div style={{ padding: '20px 40px' }}>
                    <div style={tabContainerStyle}>
                        <button onClick={() => setActiveTab('cloturer')} style={tabStyle(activeTab === 'cloturer', '#10b981')}>
                            <Lock size={16} /> Clôturées
                        </button>
                        <button onClick={() => setActiveTab('archive')} style={tabStyle(activeTab === 'archive', '#64748b')}>
                            <Archive size={16} /> Archivées
                        </button>
                    </div>

                    <div style={filterBarStyle}>
                        <div style={inputGroupStyle}>
                            <Search size={16} color="#94a3b8" />
                            <input 
                                type="text" 
                                placeholder="Rechercher par utilisateur ou ID..." 
                                style={innerInputStyle}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <input 
                            type="date" 
                            style={dateInputStyle} 
                            value={filterDate} 
                            onChange={(e) => setFilterDate(e.target.value)} 
                        />
                        <button onClick={fetchHistorique} style={btnRefreshStyle} disabled={loading}>
                            <RefreshCw size={16} className={loading ? 'spin' : ''} />
                        </button>
                    </div>

                    <div style={tableContainerStyle}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: '#f1f5f9' }}>
                                    <th style={{ width: '50px', ...thStyle }}></th>
                                    <th style={thStyle}>ID</th>
                                    <th style={thStyle}>UTILISATEUR</th>
                                    <th style={thStyle}>DATE CLÔTURE</th>
                                    <th style={thStyle}>THÉORIQUE</th>
                                    <th style={thStyle}>RÉEL</th>
                                    <th style={thStyle}>ÉCART</th>
                                    <th style={thStyle}>SYNC</th>
                                    <th style={{ ...thStyle, textAlign: 'right' }}>ACTIONS</th>
                                </tr>
                            </thead>

                                                       <tbody>
                                {filteredClotures.map((cloture) => {
                                    const valAttendu = Number(cloture.montant_attendu || cloture.attendu || 0);
                                    const valReel = Number(cloture.montant_reel || cloture.reel || 0);
                                    const valEcart = Number(cloture.ecart !== undefined ? cloture.ecart : (valReel - valAttendu));
                                    const isExpanded = expandedRow === cloture.id;

                                    return (
                                        <React.Fragment key={cloture.id}>
                                            <tr 
                                                style={{ ...trStyle, background: isExpanded ? '#f8fafc' : 'white' }}
                                                onClick={() => toggleRow(cloture.id)}
                                            >
                                                <td style={tdStyle}>
                                                    {isExpanded ? <ChevronUp size={16} color="#3b82f6"/> : <ChevronDown size={16} color="#94a3b8"/>}
                                                </td>
                                                <td style={tdStyle}><b>#{ (cloture.session_id || cloture.id).toString().substring(0,8) }</b></td>
                                                <td style={{ ...tdStyle, textTransform: 'uppercase' }}>{cloture.utilisateur || 'utilisateur'}</td>
                                                <td style={tdStyle}>
                                                    {cloture.date_cloture ? new Date(cloture.date_cloture).toLocaleString('fr-FR') : '---'}
                                                </td>
                                                <td style={tdStyle}>{valAttendu.toLocaleString()} F</td>
                                                <td style={tdStyle}>{valReel.toLocaleString()} F</td>
                                                <td style={tdStyle}>
                                                    <span style={ecartStyle(valEcart)}>
                                                        {valEcart > 0 ? '+' : ''}{valEcart.toLocaleString()} F
                                                    </span>
                                                </td>
                                                <td style={tdStyle}>
                                                    {cloture.is_synced ? <CheckCircle size={16} color="#10b981" /> : <AlertTriangle size={16} color="#f59e0b" />}
                                                </td>
                                                <td style={{ ...tdStyle, textAlign: 'right', display: 'flex', gap: '5px', justifyContent: 'flex-end', alignItems: 'center' }}>
                                                    {/* 🚀 ACTION COMPTABLE DIRECTE : Lancement instantané du relevé de session A5 */}
                                                    <button 
                                                        style={{ ...btnViewStyle, color: '#1e40af' }} 
                                                        title="Imprimer le relevé A5" 
                                                        onClick={(e) => { 
                                                            e.stopPropagation(); 
                                                            preparePrintCloture(cloture); 
                                                        }}
                                                    >
                                                        <Printer size={14} />
                                                    </button>
                                                    <button style={btnViewStyle} title="Voir détails" onClick={(e) => { 
                                                        e.stopPropagation(); 
                                                        navigate(`/pos/cloture/${cloture.id}`); 
                                                    }}>
                                                        <Eye size={14} />
                                                    </button>
                                                    {activeTab === 'cloturer' && (
                                                        <button style={{...btnViewStyle, color: '#64748b'}} title="Archiver" onClick={(e) => handleArchive(e, cloture.id)}>
                                                            <Archive size={14} />
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>


                                                                                      {isExpanded && (
                                                <tr>
                                                    <td colSpan="9" style={{ background: '#f8fafc', padding: '10px 50px 30px 50px' }}>
                                                        <div style={detailContainerStyle}>
                                                            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 0.5fr', gap: '30px' }}>
                                                                <div>
                                                                    <p style={detailLabelStyle}>Détails par méthode de paiement</p>
                                                                    <table className="detail-table">
                                                                        <thead>
                                                                            <tr>
                                                                                <th>Méthode</th>
                                                                                <th>Attendu</th>
                                                                                <th>Réel</th>
                                                                                <th>Écart</th>
                                                                                <th>Observation</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody>
                                                                            {cloture.tous_details?.map((det, idx) => (
                                                                                <tr key={idx}>
                                                                                    <td><b>{det.methode}</b></td>
                                                                                    <td>{Number(det.theorique || det.attendu || 0).toLocaleString()} F</td>
                                                                                    <td>{Number(det.reel || 0).toLocaleString()} F</td>
                                                                                    <td style={{ 
                                                                                        color: det.ecart < 0 ? '#ef4444' : det.ecart > 0 ? '#10b981' : '#64748b',
                                                                                        fontWeight: 'bold' 
                                                                                    }}>
                                                                                        {det.ecart > 0 ? '+' : ''}{Number(det.ecart || 0).toLocaleString()}
                                                                                    </td>
                                                                                    <td style={{ color: '#64748b', fontStyle: 'italic', fontSize: '0.9em' }}>
                                                                                        {det.commentaire || det.observation || '---'}
                                                                                    </td>
                                                                                </tr>
                                                                            ))}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                                <div style={{ borderLeft: '2px solid #f1f5f9', paddingLeft: '20px' }}>
                                                                    <p style={detailLabelStyle}>Note Générale</p>
                                                                    <div style={noteContainerStyle}>
                                                                        {cloture.note_cloture || cloture.observation || "Aucune observation enregistrée."}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                        {filteredClotures.length === 0 && !loading && (
                            <div style={emptyStateStyle}>Aucun résultat trouvé.</div>
                        )}
                    </div>
                </div>

                {/* 🔒 INJECTION DU FLUX IMPRESSION INVISIBLE POUR NOTRE RELEVÉ COMPTABLE CLOTUREPRINT */}
                <div style={{ display: 'none' }}>
                    {printData && (
                        <CloturePrint 
                            ref={printRef} 
                            clotureInfo={printData.clotureInfo} 
                            company={printData.company} 
                            format="A5"
                            userName={printData.userName}
                        />
                    )}
                </div>
            </main>
        </div>
    );
};

// ==============================================================================
// 💎 DICTIONNAIRE DE STYLES GRAPHISME POUR L'HISTORIQUE DES CLÔTURES DE CAISSE
// ==============================================================================
const headerStyle = { background: 'white', padding: '15px 40px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
const btnExportStyle = { background: '#1e293b', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: '600' };
const tabContainerStyle = { display: 'flex', gap: '5px', marginBottom: '20px', background: '#e2e8f0', padding: '4px', borderRadius: '10px', width: 'fit-content' };
const tabStyle = (isActive, activeColor) => ({
    padding: '8px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 'bold',
    transition: 'all 0.2s', background: isActive ? 'white' : 'transparent', color: isActive ? activeColor : '#64748b'
});
const filterBarStyle = { display: 'flex', marginBottom: '20px', gap: '15px' };
const inputGroupStyle = { background: 'white', border: '1px solid #e2e8f0', padding: '8px 12px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '10px', flex: 1 };
const innerInputStyle = { border: 'none', outline: 'none', width: '100%', fontSize: '13px' };
const dateInputStyle = { border: '1px solid #e2e8f0', padding: '8px', borderRadius: '8px', outline: 'none', fontSize: '13px' };
const btnRefreshStyle = { background: 'white', border: '1px solid #e2e8f0', padding: '10px', borderRadius: '8px', cursor: 'pointer' };
const tableContainerStyle = { background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' };
const thStyle = { padding: '12px 15px', textAlign: 'left', fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' };
const tdStyle = { padding: '14px 15px', fontSize: '13px', borderBottom: '1px solid #f1f5f9' };
const trStyle = { transition: 'background 0.2s', cursor: 'pointer' };
const ecartStyle = (val) => ({ fontWeight: 'bold', color: val < 0 ? '#ef4444' : val > 0 ? '#10b981' : '#64748b' });
const btnViewStyle = { background: 'none', border: '1px solid #e2e8f0', padding: '6px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const detailContainerStyle = { background: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: 'inset 0 2px 4px 0 rgba(0,0,0,0.05)' };
const detailLabelStyle = { margin: '0 0 10px 0', fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '800' };
const noteContainerStyle = { background: '#f8fafc', padding: '15px', borderRadius: '8px', color: '#475569', fontSize: '13px', lineHeight: '1.5', minHeight: '60px' };
const emptyStateStyle = { padding: '60px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' };

export default HistoriqueCloture;
