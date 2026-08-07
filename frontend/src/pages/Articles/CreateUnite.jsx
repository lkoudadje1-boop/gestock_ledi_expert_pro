import React, { useState, useEffect, useRef } from 'react';
import { 
    Plus, ArrowLeft, Edit3, Trash2, CheckCircle, Ruler, 
    RotateCcw, AlertTriangle, Loader2 
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../../components/Sidebar';
import API, { socket, joinCompanyRoom } from '../../services/api'; 
import '../Dashboard.css';

const UnitesPage = () => {
  const navigate = useNavigate();
  
  const [unites, setUnites] = useState([]);
  const [isInventoryActive, setIsInventoryActive] = useState(false);
  // Initialisation complète et propre de l'état du formulaire
  const [formData, setFormData] = useState({ 
    code: '', 
    libelle: '', 
    coefficient: 1, 
    unite_reference: 'Bouteille' 
  });
  const [editingId, setEditingId] = useState(null);
  const [isAdding, setIsAdding] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  const [modalConfig, setModalConfig] = useState({ show: false, action: null, message: '', id: null });

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

      // 2. CHARGEMENT DES UNITÉS
      const res = await API.get('/unites');
      setUnites(res.data || []);

    } catch (err) {
      console.error("Erreur fetchData:", err);
      showToast("Erreur de chargement des unités", "error");
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
            const relevantTables = ['unites', 'inventory', 'all'];
            
            if (relevantTables.includes(tableName)) {
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
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isInventoryActive) {
      showToast("🛑 ACTION IMPOSSIBLE : Inventaire en cours.", "error");
      return;
    }

    if (!formData.code || !formData.libelle || !formData.unite_reference || formData.coefficient === '') return;

    setLoading(true);
    try {
      const payload = { 
        code: formData.code.toUpperCase().trim(),
        libelle: formData.libelle.trim(),
        unite_reference: formData.unite_reference.trim(),
        // Conversion forcée en nombre absolu pour la base de données
        coefficient: Number(formData.coefficient) || 1
      };

      if (editingId) {
        await API.put(`/unites/${editingId}`, payload);
        showToast("Unité mise à jour");
      } else {
        await API.post('/unites', payload);
        showToast("Unité créée");
      }
      closeForm();
      fetchData(); 
    } catch (err) {
      showToast(err.response?.data?.error || "Erreur d'enregistrement", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (unite) => {
    if (isInventoryActive) {
      showToast("🛑 ACTION IMPOSSIBLE : Inventaire en cours.", "error");
      return;
    }
    setEditingId(unite.id || unite.ID);
    setIsAdding(true);
    
    // Extraction sécurisée du coefficient (Prise en compte stricte de toutes les casses BDD)
    const dbCoefficient = unite.coefficient !== undefined ? unite.coefficient : unite.COEFFICIENT;

    setFormData({
      code: unite.code || unite.CODE || '',
      libelle: unite.libelle || unite.LIBELLE || '',
      // Si la valeur existe et est valide en BDD, on la prend numériquement, sinon 1 par défaut
      coefficient: dbCoefficient !== undefined && dbCoefficient !== null ? Number(dbCoefficient) : 1,
      unite_reference: unite.unite_reference || unite.UNITE_REFERENCE || 'Bouteille'
    });
  };

  const handleDeleteClick = (id) => {
    if (isInventoryActive) {
      showToast("🛑 SYSTÈME GELÉ : Suppression impossible.", "error");
      return;
    }

    setModalConfig({
      show: true,
      action: () => executeDelete(id),
      message: "Voulez-vous supprimer définitivement cette unité ? Elle ne doit pas être liée à des articles.",
      id
    });
  };

  const executeDelete = async (id) => {
    setLoading(true);
    try {
      await API.delete(`/unites/${id}`);
      showToast("Unité supprimée");
      setModalConfig({ show: false, action: null, message: '', id: null });
      fetchData();
    } catch (err) {
      showToast(err.response?.data?.error || "Erreur lors de la suppression.", "error");
    } finally {
      setLoading(false);
    }
  };

  const closeForm = () => {
    setIsAdding(false);
    setEditingId(null);
    setFormData({ code: '', libelle: '', coefficient: 1, unite_reference: 'Bouteille' });
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
            <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '900' }}>UNITÉS DE MESURE</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: isInventoryActive ? '#ef4444' : '#64748b', fontSize: '13px', fontWeight: isInventoryActive ? '800' : '400' }}>
               <Ruler size={14} /> {isInventoryActive ? "⚠️ MODIFICATIONS DÉSACTIVÉES (INVENTAIRE)" : "Gestion des conversions d'unités"}
            </div>
          </div>
          <div>
            {!isAdding && !editingId && (
              <button 
                onClick={() => !isInventoryActive && setIsAdding(true)} 
                disabled={isInventoryActive}
                style={{...btnPrimaryStyle, background: isInventoryActive ? '#cbd5e1' : '#2563eb', cursor: isInventoryActive ? 'not-allowed' : 'pointer'}}
              >
                <Plus size={18} /> {isInventoryActive ? 'Système Gelé' : 'Nouvelle Unité'}
              </button>
            )}
          </div>
        </header>

        <div style={{ padding: '30px 40px' }}>
          <button onClick={() => navigate(-1)} style={backBtnStyle}><ArrowLeft size={16} /> Retour</button>

          {(isAdding || editingId) && (
            <div style={{ ...contentCardStyle, padding: '25px', marginBottom: '20px' }}>
              <h3 style={{fontSize: '14px', marginBottom: '15px'}}>{editingId ? 'Modifier' : 'Ajouter'} une règle de conversion</h3>
              <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '15px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                
                <div style={{ flex: '1 1 120px' }}>
                  <label style={labelStyle}>CODE (ex: CAS12, BTL)</label>
                  <input type="text" style={inputStyle} value={formData.code} onChange={(e) => setFormData({...formData, code: e.target.value})} required placeholder="Ex: CAS12" />
                </div>

                <div style={{ flex: '2 1 200px' }}>
                  <label style={labelStyle}>LIBELLÉ DE CONVERSION</label>
                  <input type="text" style={inputStyle} value={formData.libelle} onChange={(e) => setFormData({...formData, libelle: e.target.value})} required placeholder="Ex: CASIER" />
                </div>

                {/* 1️⃣ CHAMP COEFFICIENT DE CONVERSION STRICT */}
                <div style={{ flex: '1 1 140px' }}>
                  <label style={labelStyle}>COEFFICIENT (Nb de btl)</label>
                  <input 
                    type="number" 
                    min="1" 
                    step="1" 
                    style={{
                      ...inputStyle, 
                      backgroundColor: formData.coefficient === 1 && formData.code.toUpperCase() === 'BTL' ? '#f1f5f9' : 'white'
                    }} 
                    disabled={formData.coefficient === 1 && formData.code.toUpperCase() === 'BTL'}
                    value={formData.coefficient} 
                    onChange={(e) => setFormData({...formData, coefficient: e.target.value})} 
                    required 
                    placeholder="Ex: 12" 
                  />
                </div>

                {/* 2️⃣ CHAMP LIBELLÉ UNITÉ DE RÉFÉRENCE DE BASE */}
                <div style={{ flex: '1 1 180px' }}>
                  <label style={labelStyle}>UNITÉ DE RÉFÉRENCE (BASE)</label>
                  <input 
                    type="text" 
                    style={inputStyle} 
                    value={formData.unite_reference} 
                    onChange={(e) => setFormData({...formData, unite_reference: e.target.value})} 
                    required 
                    placeholder="Ex: Bouteille" 
                  />
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button type="submit" disabled={loading} style={btnSubmitStyle}>{loading ? '...' : 'Valider'}</button>
                  <button type="button" onClick={closeForm} style={btnCancelStyle}>Annuler</button>
                </div>
              </form>
              
              <div style={{marginTop: '15px', background: '#f8fafc', padding: '12px', borderRadius: '8px', fontSize: '12px', color: '#475569', border: '1px dashed #cbd5e1'}}>
                💡 <strong>Règle logique :</strong> 1 {formData.libelle || '...'} correspondra à <strong>{formData.coefficient || '1'}</strong> {formData.unite_reference || '...'} dans le calcul automatique de vos stocks de liquide.
              </div>
            </div>
          )}


          <div style={contentCardStyle}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={thStyle}>ID</th>
                  <th style={thStyle}>Code</th>
                  <th style={thStyle}>Libellé complet</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Formule d'Équivalence Logistique</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {unites.map((item) => {
                  const id = item.id || item.ID;
                  const itemCoeff = item.coefficient || item.COEFFICIENT || 1;
                  const itemRef = item.unite_reference || item.UNITE_REFERENCE || 'Bouteille';
                  const itemLib = item.libelle || item.LIBELLE;
                  return (
                    <tr key={id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={tdStyle}><code style={codeStyle}>{id}</code></td>
                      <td style={{ ...tdStyle, fontWeight: '800', color: '#2563eb' }}>{item.code || item.CODE}</td>
                      <td style={tdStyle}>{itemLib}</td>
                      
                      {/* Affichage dynamique de la correspondance liquide basée sur votre nouvelle table */}
                      <td style={{ ...tdStyle, textAlign: 'center', fontWeight: '700', color: '#0f172a' }}>
                        <span style={{background: '#e0f2fe', color: '#0369a1', padding: '4px 10px', borderRadius: '6px', fontSize: '12px'}}>
                          1 {itemLib} = {itemCoeff} {itemRef}(s)
                        </span>
                      </td>

                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                          <button 
                            onClick={() => {
                              if (isInventoryActive) return showToast("Édition bloquée", "error");
                              handleEditClick(item);
                            }} 
                            style={{...actionBtnStyle(isInventoryActive ? '#94a3b8' : '#2563eb'), cursor: isInventoryActive ? 'not-allowed' : 'pointer'}}
                          >
                            <Edit3 size={14}/>
                          </button>
                          
                          <button onClick={() => handleDeleteClick(id)} style={actionBtnStyle('#ef4444')}>
                            <Trash2 size={14}/>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {unites.length === 0 && !loading && (
                  <tr>
                    <td colSpan="5" style={{...tdStyle, textAlign: 'center', padding: '40px', color: '#64748b'}}>
                      Aucune unité de conversion enregistrée.
                    </td>
                  </tr>
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
              <button onClick={() => setModalConfig({ show: false, action: null, message: '', id: null })} style={btnSecondaryStyle}>Annuler</button>
              <button onClick={modalConfig.action} style={btnDangerStyle}>
                {loading ? '...' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes slideInToast { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>
    </div>
  );
};



// --- STYLES (Repris de votre exemple pour la cohérence visuelle) ---
const headerStyle = { background: 'white', padding: '20px 40px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
const contentCardStyle = { background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', overflow: 'hidden' };
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
const toastContainerStyle = { position: 'fixed', top: '20px', right: '20px', zIndex: 9999, color: 'white', padding: '12px 24px', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.2)', display: 'flex', alignItems: 'center', gap: '10px', fontWeight: '800', animation: 'slideInToast 0.3s ease-out' };
const modalOverlayStyle = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 };
const modalContentStyle = { background: 'white', padding: '30px', borderRadius: '12px', width: '400px', maxWidth: '90%', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' };
const btnDangerStyle = { background: '#ef4444', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: '700' };

export default UnitesPage;