import React, { useState, useEffect, useRef } from 'react';
import { 
    Plus, ArrowLeft, Edit3, Archive, CheckCircle, LayoutGrid, 
    RotateCcw, X, AlertTriangle, Download, UploadCloud, Loader2 
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../../components/Sidebar';
import API, { socket, joinCompanyRoom } from '../../services/api'; 
import '../Dashboard.css';

const CategoriesPage = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  
  const [familles, setFamilles] = useState([]);
  const [categories, setCategories] = useState([]);
  const [groups, setGroups] = useState([]);
  const [isInventoryActive, setIsInventoryActive] = useState(false);
  const [activeTab, setActiveTab] = useState('familles');
  const [showArchived, setShowArchived] = useState(true);
  const [formData, setFormData] = useState({ nom: '', parentId: '' });
  const [editingId, setEditingId] = useState(null);
  const [isAdding, setIsAdding] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  const [modalConfig, setModalConfig] = useState({ show: false, action: null, message: '', id: null, status: null });

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // 🛡️ 1. VÉRIFICATION DU VERROU INVENTAIRE
      const invRes = await API.get('/inventories/check-status').catch(() => ({ data: { en_cours: false } }));
      const active = !!invRes.data.en_cours;
      setIsInventoryActive(active);

      if (active) {
        setErrorMessage("⚠️ SYSTÈME EN LECTURE SEULE : Un inventaire est en cours.");
      } else {
        setErrorMessage('');
      }

      // 2. CHARGEMENT DES DONNÉES DE STRUCTURE (URL préfixées par /articles)
      const [resF, resC, resG] = await Promise.all([
        API.get('/articles/familles').catch(() => ({ data: [] })),
        API.get('/articles/categories').catch(() => ({ data: [] })),
        API.get('/articles/groups').catch(() => ({ data: [] })) 
      ]);

      setFamilles(resF.data || []);
      setCategories(resC.data || []);
      setGroups(resG.data || []);

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
            const relevantTables = ['products_structure', 'inventory', 'all'];
            
            if (relevantTables.includes(tableName)) {
                console.log(`🔄 Signal reçu pour ${tableName} : Actualisation structure...`);
                fetchData();
            }
        };

        socket.on('DATA_EVENT', handleGlobalUpdate);
        window.addEventListener('ERP_DATA_CHANGED', handleGlobalUpdate);

        return () => {
            socket.off('DATA_EVENT', handleGlobalUpdate);
            window.removeEventListener('ERP_DATA_CHANGED', handleGlobalUpdate);
        };
    }
  }, [activeTab]);

  // --- ACTIONS ---

  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      // 💥 URL corrigée : ajout du préfixe /articles
      const response = await API.get(`/articles/csv/export/${activeTab}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Catalogue_${activeTab}_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      showToast("Exportation réussie");
    } catch (err) {
      showToast("L'exportation a échoué", "error");
    } finally {
      setIsExporting(false);
    }
  };

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
      // 💥 URL corrigée : ajout du préfixe /articles
      const res = await API.post(`/articles/csv/import/${activeTab}`, fData);
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

    if (!formData.nom) return;
    if (activeTab !== 'familles' && !formData.parentId) {
      showToast("Sélection du parent obligatoire", "error");
      return;
    }
    
    setLoading(true);
    try {
      // Endpoint générique configuré avec le préfixe /articles rattaché à votre routeur
      const endpoint = `/articles/${activeTab}`;
      const payload = { nom: formData.nom.toUpperCase().trim() };
      
      if (activeTab === 'categories') payload.famille_id = formData.parentId;
      else if (activeTab === 'groups') payload.category_id = formData.parentId;

      if (editingId) {
        // ✅ RECTIFICATION DE LA METHODE HTTP : Passage obligatoire de PUT à PATCH
        // pour correspondre au routeur : router.patch('/:type/:id')
        await API.patch(`${endpoint}/${editingId}`, payload);
        showToast("Élément mis à jour avec succès");
      } else {
        // Reste en POST pour la création pure
        await API.post(endpoint, payload);
        showToast("Élément créé avec succès");
      }
      
      closeForm();
      fetchData(); 
    } catch (err) {
      console.error("Erreur enregistrement structure :", err);
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

    const statusVal = Number(currentStatus !== undefined ? currentStatus : 1);
    const isActivating = statusVal === 0;

    setModalConfig({
      show: true,
      action: () => executeArchive(id, isActivating),
      message: isActivating 
        ? "Voulez-vous restaurer cet élément ?"
        : "Voulez-vous archiver cet élément ?",
      id,
      status: isActivating
    });
  };

  const executeArchive = async (id, isActivating) => {
    setLoading(true);
    try {
        const newValue = isActivating ? 1 : 0;
        // 💥 URL corrigée : ajout du préfixe /articles
        const res = await API.patch(`/articles/status/${activeTab}/${id}`, { 
            is_active: newValue 
        });
        
        if (res.data.success) {
            await fetchData();
            showToast(isActivating ? "Élément restauré" : "Élément archivé");
            setModalConfig({ show: false, action: null, message: '', id: null, status: null });
        }
    } catch (err) {
        const msg = err.response?.data?.error || "Erreur de statut.";
        showToast(msg, "error");
    } finally {
        setLoading(false);
    }
  };

  const closeForm = () => {
    setIsAdding(false);
    setEditingId(null);
    setFormData({ nom: '', parentId: '' });
  };

  const getFilteredData = () => {
    const data = activeTab === 'familles' ? familles : activeTab === 'categories' ? categories : groups;
    if (showArchived) return data;
    return data.filter(item => Number(item.is_active || item.IS_ACTIVE) === 1);
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
            <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '900' }}>STRUCTURE CATALOGUE</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: isInventoryActive ? '#ef4444' : '#64748b', fontSize: '13px', fontWeight: isInventoryActive ? '800' : '400' }}>
               <LayoutGrid size={14} /> {isInventoryActive ? "⚠️ MODIFICATIONS DÉSACTIVÉES (INVENTAIRE)" : "Architecture des articles"}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            {/* Bouton Export */}
            <button 
              onClick={handleExportCSV}
              disabled={isExporting}
              style={{...actionBtnStyle('#2563eb'), cursor: 'pointer'}}
            >
              {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} EXPORT
            </button>

            {/* Bouton Import */}
            <label style={{...actionBtnStyle(isInventoryActive ? '#94a3b8' : '#10b981'), cursor: isInventoryActive ? 'not-allowed' : 'pointer'}}>
              <UploadCloud size={16} /> IMPORT
              {!isInventoryActive && <input type="file" hidden ref={fileInputRef} onChange={handleImportCSV} accept=".csv" />}
            </label>
            
            {/* Bouton Nouveau */}
            {!isAdding && !editingId && (
              <button 
                onClick={() => !isInventoryActive && setIsAdding(true)} 
                disabled={isInventoryActive}
                style={{...btnPrimaryStyle, background: isInventoryActive ? '#cbd5e1' : '#2563eb', cursor: isInventoryActive ? 'not-allowed' : 'pointer'}}
              >
                <Plus size={18} /> {isInventoryActive ? 'Système Gelé' : `Nouveau ${activeTab.slice(0,-1)}`}
              </button>
            )}
          </div>
        </header>

        <div style={{ padding: '30px 40px' }}>
          <button onClick={() => navigate(-1)} style={backBtnStyle}><ArrowLeft size={16} /> Retour</button>

          <div style={tabContainerStyle}>
            {['familles', 'categories', 'groups'].map((t, idx) => (
              <div key={t} onClick={() => { setActiveTab(t); closeForm(); }} style={tabStyle(activeTab === t)}>
                {idx + 1}. {t.toUpperCase()}
              </div>
            ))}
          </div>

          {(isAdding || editingId) && (
            <div style={{ ...contentCardStyle, padding: '25px', marginBottom: '20px' }}>
              <h3 style={{fontSize: '14px', marginBottom: '15px'}}>{editingId ? 'Modifier' : 'Ajouter'} {activeTab}</h3>
              <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '20px', alignItems: 'flex-end' }}>
                <div style={{ flex: 2 }}>
                  <label style={labelStyle}>NOM</label>
                  <input type="text" style={inputStyle} value={formData.nom} onChange={(e) => setFormData({...formData, nom: e.target.value})} required />
                </div>
                {activeTab !== 'familles' && (
                  <div style={{ flex: 1.5 }}>
                    <label style={labelStyle}>PARENT</label>
                    <select style={inputStyle} value={formData.parentId} onChange={(e) => setFormData({...formData, parentId: e.target.value})} required>
                      <option value="">-- Choisir --</option>
                      {(activeTab === 'categories' ? familles : categories).map((item) => (
                          <option key={item.id || item.ID} value={item.id || item.ID}>{item.nom || item.NOM}</option>
                      ))}
                    </select>
                  </div>
                )}
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
                  <th style={thStyle}>Désignation</th>
                  {activeTab !== 'familles' && <th style={thStyle}>Rattachement</th>}
                  <th style={thStyle}>État</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {getFilteredData().map((item) => {
                  const id = item.id || item.ID; 
                  const status = Number(item.is_active !== undefined ? item.is_active : item.IS_ACTIVE);
                  return (
                    <tr key={id} style={{ borderBottom: '1px solid #f1f5f9', opacity: status === 0 ? 0.6 : 1 }}>
                      <td style={tdStyle}><code style={codeStyle}>{id}</code></td>
                      <td style={{ ...tdStyle, fontWeight: '800' }}>{item.nom || item.NOM}</td>
                      {activeTab !== 'familles' && (
                        <td style={tdStyle}>
                          <span style={parentBadgeStyle}>{item.famille_nom || item.category_nom || item.FAMILLE_NOM || item.CATEGORY_NOM || '---'}</span>
                        </td>
                      )}
                      <td style={tdStyle}>
                        <span style={badgeStyle(status === 1)}>{status === 1 ? 'ACTIF' : 'ARCHIVÉ'}</span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                          <button 
                            onClick={() => {
                              if (isInventoryActive) return showToast("Édition bloquée", "error");
                              setEditingId(id); 
                              setFormData({ nom: item.nom || item.NOM, parentId: item.famille_id || item.category_id || item.FAMILLE_ID || item.CATEGORY_ID || '' }); 
                            }} 
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
                })}
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

// --- STYLES ---
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

export default CategoriesPage;