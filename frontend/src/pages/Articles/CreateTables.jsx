import React, { useState, useEffect, useRef } from 'react';
import { 
    Plus, ArrowLeft, Edit3, Archive, CheckCircle, LayoutGrid, 
    RotateCcw, AlertTriangle, UploadCloud, Loader2 
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../../components/Sidebar';
import API, { socket, joinCompanyRoom } from '../../services/api'; 
import '../Dashboard.css';

const CreateTablesPage = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  
  const [tables, setTables] = useState([]);
  const [isInventoryActive, setIsInventoryActive] = useState(false);
  const [showArchived, setShowArchived] = useState(true);
  
  // Alignement strict sur les colonnes SQLite : name, numero, zone
  const [formData, setFormData] = useState({ name: '', numero: '', zone: '' });
  const [editingId, setEditingId] = useState(null);
  const [isAdding, setIsAdding] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  const [modalConfig, setModalConfig] = useState({ show: false, action: null, message: '', id: null, status: null });

  // Nom exact de la table gérée de manière dynamique par votre routeur
  const TARGET_TABLE = 'restaurant_tables';

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // 1. VÉRIFICATION DU VERROU INVENTAIRE
      const invRes = await API.get('/inventories/check-status').catch(() => ({ data: { en_cours: false } }));
      const active = !!invRes.data.en_cours;
      setIsInventoryActive(active);

      if (active) {
        setErrorMessage("⚠️ SYSTÈME EN LECTURE SEULE : Un inventaire est en cours.");
      } else {
        setErrorMessage('');
      }

      // 2. CHARGEMENT DEPUIS VOTRE ROUTE CONFIGURÉE DANS SERVER.JS
      // ✅ Mis à jour avec le préfixe : /gestion-tables
      const res = await API.get(`/gestion-tables/${TARGET_TABLE}`);
      setTables(res.data || []);

    } catch (err) {
      console.error("Erreur fetchData:", err);
      setErrorMessage("Erreur de chargement des données.");
      showToast("Erreur de chargement", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    
    if (socket) {
        joinCompanyRoom(); 
        
        const handleGlobalUpdate = (event) => {
            const tableName = event?.table || event?.detail?.table || event;
            const relevantTables = [TARGET_TABLE, 'inventory', 'all'];
            
            if (relevantTables.includes(tableName)) {
                console.log(`🔄 Signal reçu pour ${tableName} : Actualisation tables...`);
                fetchData();
            }
        };

        // Écoute de l'événement personnalisé envoyé par votre TableController backend (REFRESH_RESTAURANT_TABLES)
        socket.on('DATA_EVENT', handleGlobalUpdate);
        socket.on(`REFRESH_${TARGET_TABLE.toUpperCase()}`, fetchData);
        window.addEventListener('ERP_DATA_CHANGED', handleGlobalUpdate);

        return () => {
            socket.off('DATA_EVENT', handleGlobalUpdate);
            socket.off(`REFRESH_${TARGET_TABLE.toUpperCase()}`, fetchData);
            window.removeEventListener('ERP_DATA_CHANGED', handleGlobalUpdate);
        };
    }
  }, []);

  // --- ACTIONS ---

  const handleImportCSV = async (e) => {
    if (isInventoryActive) {
      showToast("🛑 IMPORTATION BLOQUÉE : Un inventaire est en cours.", "error");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const file = e.target.files[0];
    if (!file) return;
    setIsImporting(true);
    const fData = new FormData();
    fData.append('file', file);
    try {
      const res = await API.post(`/csv/import/${TARGET_TABLE}`, fData);
      if (res.data.success) {
        fetchData();
        showToast(res.data.message || "Importation réussie");
      }
    } catch (err) {
      showToast(err.response?.data?.error || "Erreur d'importation", "error");
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isInventoryActive) {
      showToast("🛑 ACTION IMPOSSIBLE : Inventaire en cours.", "error");
      return;
    }

    if (!formData.name) return;

    setLoading(true);
    try {
      // ✅ Mis à jour avec le préfixe : /gestion-tables
      const endpoint = `/gestion-tables/${TARGET_TABLE}`;
      const payload = { 
        name: formData.name.toUpperCase().trim(),
        numero: formData.numero ? Number(formData.numero) : null,
        zone: formData.zone ? formData.zone.toUpperCase().trim() : 'SALLE',
        is_active: 1 // S'assure que la table créée est active par défaut
      };

      if (editingId) {
        await API.put(`${endpoint}/${editingId}`, payload);
        showToast("Table mise à jour");
      } else {
        await API.post(endpoint, payload);
        showToast("Table créée avec succès");
      }
      closeForm();
      fetchData(); 
    } catch (err) {
      showToast(err.response?.data?.error || "Erreur d'enregistrement", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleArchiveClick = (id, currentStatus) => {
    if (isInventoryActive) {
      showToast("🛑 SYSTÈME GELÉ : Archivage impossible pendant l'inventaire.", "error");
      return;
    }

    const isActivating = Number(currentStatus) === 0;

    setModalConfig({
      show: true,
      action: () => executeArchive(id, isActivating),
      message: isActivating 
        ? "Voulez-vous restaurer cette table ?"
        : "Voulez-vous archiver cette table (Désactiver) ?",
      id,
      status: isActivating
    });
  };

  const executeArchive = async (id, isActivating) => {
    setLoading(true);
    try {
        const newValue = isActivating ? 1 : 0;
        
        // ✅ Mis à jour avec le préfixe : /gestion-tables
        const res = await API.put(`/gestion-tables/${TARGET_TABLE}/${id}`, { 
            is_active: newValue 
        });
        
        if (res.data.success) {
            await fetchData();
            showToast(isActivating ? "Table restaurée" : "Table archivée");
            setModalConfig({ show: false, action: null, message: '', id: null, status: null });
        }
    } catch (err) {
        showToast(err.response?.data?.error || "Erreur de changement de statut.", "error");
    } finally {
        setLoading(false);
    }
  };

  const closeForm = () => {
    setIsAdding(false);
    setEditingId(null);
    setFormData({ name: '', numero: '', zone: '' });
  };

  const getFilteredData = () => {
    if (showArchived) return tables;
    return tables.filter(item => Number(item.is_active) === 1);
  };

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar />
      <main style={{ flex: 1, overflowY: 'auto', background: '#f1f5f9', position: 'relative' }}>
        
        {toast.show && (
          <div style={{...toastContainerStyle, background: toast.type === 'success' ? '#10b981' : '#ef4444'}}>
            {toast.type === 'success' ? <CheckCircle size={18}/> : <AlertTriangle size={18}/>}
            {toast.message}
          </div>
        )}

        <header style={headerStyle}>
          <div>
            <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '900' }}>GESTION DES TABLES</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: isInventoryActive ? '#ef4444' : '#64748b', fontSize: '13px', fontWeight: isInventoryActive ? '800' : '400' }}>
               <LayoutGrid size={14} /> {isInventoryActive ? "⚠️ MODIFICATIONS DÉSACTIVÉES (INVENTAIRE)" : "Configuration et affectation des tables"}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <label style={{...actionBtnStyle(isInventoryActive ? '#94a3b8' : '#10b981'), cursor: isInventoryActive ? 'not-allowed' : 'pointer'}}>
              {isImporting ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />} IMPORT
              {!isInventoryActive && <input type="file" hidden ref={fileInputRef} onChange={handleImportCSV} accept=".csv" />}
            </label>
            
            {!isAdding && !editingId && (
              <button 
                onClick={() => !isInventoryActive && setIsAdding(true)} 
                disabled={isInventoryActive}
                style={{...btnPrimaryStyle, background: isInventoryActive ? '#cbd5e1' : '#2563eb', cursor: isInventoryActive ? 'not-allowed' : 'pointer'}}
              >
                <Plus size={18} /> {isInventoryActive ? 'Système Gelé' : 'Nouvelle Table'}
              </button>
            )}
          </div>
        </header>

        <div style={{ padding: '30px 40px' }}>
          {errorMessage && <div style={{ background: '#fef2f2', color: '#b91c1c', padding: '12px', borderRadius: '8px', marginBottom: '15px', fontSize: '13px', fontWeight: 'bold' }}>{errorMessage}</div>}
          
          <button onClick={() => navigate(-1)} style={backBtnStyle}><ArrowLeft size={16} /> Retour</button>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '10px' }}>
            <div style={tabContainerStyle}>
              <div style={tabStyle(true)}>1. TABLES PHYSIQUES</div>
            </div>
            <label style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: '700' }}>
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              Afficher les tables archivées
            </label>
          </div>

          {(isAdding || editingId) && (
            <div style={{ ...contentCardStyle, padding: '25px', marginBottom: '20px' }}>
              <h3 style={{fontSize: '14px', marginBottom: '15px'}}>{editingId ? 'Modifier la Table' : 'Ajouter une Table'}</h3>
              <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '20px', alignItems: 'flex-end' }}>
                <div style={{ flex: 2 }}>
                  <label style={labelStyle}>NOM DE LA TABLE (ex: Table 1, VIP A)</label>
                  <input type="text" style={inputStyle} value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} required />
                </div>
                
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>NUMÉRO (Tri)</label>
                  <input type="number" style={inputStyle} value={formData.numero} onChange={(e) => setFormData({...formData, numero: e.target.value})} />
                </div>

                <div style={{ flex: 1.5 }}>
                  <label style={labelStyle}>ZONE / EMPLACEMENT</label>
                  <input type="text" placeholder="Ex: Terrasse, Salle" style={inputStyle} value={formData.zone} onChange={(e) => setFormData({...formData, zone: e.target.value})} />
                </div>

                <button type="submit" disabled={loading} style={btnSubmitStyle}>{loading ? '...' : 'Valider'}</button>
                <button type="button" onClick={closeForm} style={btnCancelStyle}>Annuler</button>
              </form>
            </div>
          )}

          <div style={contentCardStyle}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={thStyle}>ID</th>
                  <th style={thStyle}>Nom de la table</th>
                  <th style={thStyle}>Numéro</th>
                  <th style={thStyle}>Zone / Emplacement</th>
                  <th style={thStyle}>État Restaurant</th>
                  <th style={thStyle}>Statut</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && tables.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>Chargement des tables...</td>
                  </tr>
                ) : getFilteredData().length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>Aucune table enregistrée.</td>
                  </tr>
                ) : (
                  getFilteredData().map((item) => {
                    const id = item.id; 
                    const status = item.is_active !== undefined ? Number(item.is_active) : 1;
                    const tableStatus = item.statut || 'LIBRE';
                    
                    return (
                      <tr key={id} style={{ borderBottom: '1px solid #f1f5f9', opacity: status === 0 ? 0.6 : 1 }}>
                        <td style={tdStyle}><code style={codeStyle}>{id}</code></td>
                        <td style={{ ...tdStyle, fontWeight: '800' }}>{item.name}</td>
                        <td style={tdStyle}>{item.numero || '---'}</td>
                        <td style={tdStyle}>
                          <span style={parentBadgeStyle}>{item.zone || 'SANS ZONE'}</span>
                        </td>
                        <td style={tdStyle}>
                          <span style={{
                            ...parentBadgeStyle, 
                            background: tableStatus === 'LIBRE' ? '#dcfce7' : tableStatus === 'OCCUPEE' ? '#fee2e2' : '#fef9c3',
                            color: tableStatus === 'LIBRE' ? '#16a34a' : tableStatus === 'OCCUPEE' ? '#dc2626' : '#ca8a04',
                            fontWeight: 'bold'
                          }}>
                            {tableStatus}
                          </span>
                        </td>
                        <td style={tdStyle}>
                          <span style={badgeStyle(status === 1)}>{status === 1 ? 'ACTIF' : 'ARCHIVÉ'}</span>
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button 
                              onClick={() => {
                                if (isInventoryActive) return showToast("Édition bloquée", "error");
                                setEditingId(id); 
                                setFormData({ 
                                  name: item.name, 
                                  numero: item.numero || '', 
                                  zone: item.zone || '' 
                                }); 
                              }} 
                              disabled={isInventoryActive}
                              style={{...actionBtnStyle(isInventoryActive ? '#94a3b8' : '#2563eb'), cursor: isInventoryActive ? 'not-allowed' : 'pointer'}}
                            >
                              <Edit3 size={14}/>
                            </button>
                            
                            <button onClick={() => handleArchiveClick(id, status)} style={actionBtnStyle(status === 1 ? '#ef4444' : '#10b981')}>
                              {status === 1 ? <Archive size={14}/> : <RotateCcw size={14}/>}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {modalConfig.show && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '20px' }}>
              <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '10px', borderRadius: '50%' }}><AlertTriangle size={24} /></div>
              <h2 style={{ margin: 0, fontSize: '18px' }}>Confirmation</h2>
            </div>
            <p style={{ color: '#475569', marginBottom: '30px' }}>{modalConfig.message}</p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setModalConfig({ show: false, action: null, message: '', id: null, status: null })} style={btnSecondaryStyle}>Annuler</button>
              <button onClick={modalConfig.action} style={modalConfig.status ? btnSuccessStyle : btnDangerStyle}>
                {loading ? '...' : (modalConfig.status ? 'Restaurer' : 'Archiver')}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes slideInToast { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>
    </div>
  );
};

// --- STYLES (Inchangés) ---
const headerStyle = { background: 'white', padding: '20px 40px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
const tabContainerStyle = { display: 'flex', background: 'white', borderRadius: '12px 12px 0 0', border: '1px solid #e2e8f0', width: 'fit-content', borderBottom: 'none' };
const contentCardStyle = { background: 'white', borderRadius: '0 12px 12px 12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', overflow: 'hidden' };
const tabStyle = (active) => ({ padding: '14px 25px', cursor: 'pointer', borderBottom: active ? '3px solid #2563eb' : '3px solid transparent', color: active ? '#2563eb' : '#64748b', fontWeight: '800', fontSize: '14px' });
const btnPrimaryStyle = { background: '#2563eb', color: 'white', border: 'none', padding: '10px 22px', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', fontWeight: '700' };
const btnSecondaryStyle = { border: '1px solid #e2e8f0', padding: '10px 15px', borderRadius: '10px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', color: '#475569', background: 'white' };
const backBtnStyle = { background: 'none', border: 'none', color: '#64748b', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '20px', fontWeight: '700', fontSize: '13px' };
const inputStyle = { width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '14px', marginTop: '5px' };
const labelStyle = { fontSize: '11px', fontWeight: '900', color: '#475569' };
const thStyle = { padding: '15px 20px', fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: '800', textAlign: 'left' };
const tdStyle = { padding: '12px 20px', fontSize: '13px', color: '#334155' };
const codeStyle = { fontSize: '11px', background: '#f1f5f9', padding: '2px 4px', borderRadius: '4px' };
const btnSubmitStyle = { padding: '0 25px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', height: '45px' };
const btnCancelStyle = { padding: '0 20px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', height: '45px' };
const actionBtnStyle = (color) => ({ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 15px', borderRadius: '8px', border: `1px solid ${color}30`, background: `${color}10`, color: color, fontSize: '11px', fontWeight: '900', cursor: 'pointer' });
const badgeStyle = (active) => ({ padding: '4px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: '900', background: active ? '#dcfce7' : '#fee2e2', color: active ? '#15803d' : '#b91c1c' });
const parentBadgeStyle = { background: '#f1f5f9', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600', color: '#475569' };
const toastContainerStyle = { position: 'fixed', top: '20px', right: '20px', zIndex: 9999, color: 'white', padding: '12px 24px', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.2)', display: 'flex', alignItems: 'center', gap: '10px', fontWeight: '800', animation: 'slideInToast 0.3s ease-out' };
const modalOverlayStyle = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 };
const modalContentStyle = { background: 'white', padding: '30px', borderRadius: '12px', width: '400px', maxWidth: '90%', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' };
const btnDangerStyle = { background: '#ef4444', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: '700' };
const btnSuccessStyle = { background: '#10b981', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: '700' };

export default CreateTablesPage;