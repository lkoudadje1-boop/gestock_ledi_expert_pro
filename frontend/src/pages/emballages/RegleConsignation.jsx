import React, { useState, useEffect, useMemo } from 'react';
import { 
    Plus, ArrowLeft, Edit3, CheckCircle, Package, 
    X, AlertTriangle, Loader2, Save, Trash2, Scale, Trash,
    ChevronDown, ChevronUp
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../../components/Sidebar';
import { getUserPermissions } from '../../utils/permissions_utils'; // 🔑 IMPORTATION DU SÉCURISEUR
import API, { socket, joinCompanyRoom } from '../../services/api'; 
import '../Dashboard.css';

const RegleConsignation = () => {
  const navigate = useNavigate();
  
  // 🔑 EXTRACTION GRANULAIRE ET SOUPLITUDE DES TYPES (true, 1, 'true', '1') POUR TES 3 BOUTONS DE RÈGLES
  const userPerms = useMemo(() => getUserPermissions(), []);
  
  const canCreateRule = userPerms['emb_rule_btn_create'] === true || userPerms['emb_rule_btn_create'] === 1 || userPerms['emb_rule_btn_create'] === 'true' || userPerms['emb_rule_btn_create'] === '1';
  const canModifyRule = userPerms['emb_rule_btn_modify'] === true || userPerms['emb_rule_btn_modify'] === 1 || userPerms['emb_rule_btn_modify'] === 'true' || userPerms['emb_rule_btn_modify'] === '1';
  const canDeleteRule = userPerms['emb_rule_btn_delete'] === true || userPerms['emb_rule_btn_delete'] === 1 || userPerms['emb_rule_btn_delete'] === 'true' || userPerms['emb_rule_btn_delete'] === '1';

  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isInventoryActive, setIsInventoryActive] = useState(false);
  const [activeTab, setActiveTab] = useState('actifs'); 
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [expandedRows, setExpandedRows] = useState({});

  const initialForm = { 
    code_regle: '', 
    libelle: '', 
    tiers: [
      { jours_min: 0, jours_max: '', type_calcul: 'POURCENTAGE REPRISE (%)', valeur: 100 }
    ]
  };

  const [formData, setFormData] = useState(initialForm);
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 4000);
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const [invRes, rulesRes] = await Promise.all([
        API.get('/inventories/check-status').catch(() => ({ data: { en_cours: false } })),
        API.get('/emballages/rules/list') 
      ]);
      setIsInventoryActive(!!invRes.data.en_cours);
      setRules(rulesRes.data || []);
    } catch (err) {
      showToast("Erreur de connexion au serveur", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    if (socket) {
        joinCompanyRoom(); 
        socket.on('DATA_EVENT', (data) => {
            if (['packaging_rules', 'packaging_rule_tiers', 'inventory'].includes(data.table)) {
              fetchData();
            }
        });
    }
    return () => socket?.off('DATA_EVENT');
  }, [activeTab]);

  const toggleRow = (id) => {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleAddTier = () => {
    const lastTier = formData.tiers[formData.tiers.length - 1];
    const nextMin = lastTier && lastTier.jours_max ? parseInt(lastTier.jours_max, 10) + 1 : 0;
    
    setFormData({
      ...formData,
      tiers: [...formData.tiers, { jours_min: nextMin, jours_max: '', type_calcul: 'POURCENTAGE REPRISE (%)', valeur: 0 }]
    });
  };

  const handleRemoveTier = (index) => {
    setFormData({ ...formData, tiers: formData.tiers.filter((_, i) => i !== index) });
  };

  const handleTierChange = (index, field, value) => {
    const updatedTiers = [...formData.tiers];
    updatedTiers[index][field] = value;

    if (field === 'type_calcul' && value === 'CONSIDERE_VENDU') {
      updatedTiers[index]['valeur'] = 0;
    }
    
    setFormData({ ...formData, tiers: updatedTiers });
  };

  const handleEditClick = (item) => {
    // 🔑 SÉCURITÉ DE POSTE : Interdire la modification graphique si le droit est absent
    if (!canModifyRule) {
      return showToast("🛑 ACCÈS REFUSÉ : Privilège de modification manquant pour votre profil.", "error");
    }

    setEditingId(item.id);
    
    const mappedTiers = item.tiers.map(t => {
      let typeFormate = t.type_calcul;
      if (t.type_calcul === 'POURCENTAGE_REPRISE') typeFormate = 'POURCENTAGE REPRISE (%)';
      if (t.type_calcul === 'MONTANT_FIXE_PENALITE') typeFormate = 'MONTANT FIXE PENALITE (F)';
      if (t.type_calcul === 'CONSIDERE_VENDU' || (typeFormate === 'POURCENTAGE REPRISE (%)' && parseFloat(t.valeur) === 0)) {
        typeFormate = 'CONSIDERE_VENDU';
      }

      return {
        ...t,
        type_calcul: typeFormate
      };
    });

    setFormData({
      ...item,
      tiers: mappedTiers
    });
    setIsAdding(true); // Ouvre le formulaire d'édition visuellement
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isInventoryActive) return showToast("Inventaire en cours : Système gelé", "error");

    // 🔑 SÉCURITÉ DE REQUÊTE RÉSEAU : Validation stricte avant soumission au serveur
    if (editingId && !canModifyRule) {
      return showToast("🛑 ACCÈS REFUSÉ : Action de modification non autorisée.", "error");
    }
    if (!editingId && !canCreateRule) {
      return showToast("🛑 ACCÈS REFUSÉ : Action de création non autorisée.", "error");
    }

    if (!formData.tiers || formData.tiers.length === 0) return showToast("Une règle doit contenir au moins un palier.", "error");

    setLoading(true);
    try {
      const processedTiers = formData.tiers.map(tier => {
        const isVendu = tier.type_calcul === 'CONSIDERE_VENDU';
        return {
          jours_min: parseInt(tier.jours_min, 10),
          jours_max: tier.jours_max ? parseInt(tier.jours_max, 10) : null,
          type_calcul: isVendu ? 'CONSIDERE_VENDU' : tier.type_calcul,
          valeur: isVendu ? 0 : parseFloat(tier.valeur) || 0
        };
      });

      const dataToSend = { 
        code_regle: formData.code_regle.toUpperCase(),
        libelle: formData.libelle,
        tiers: processedTiers
      };

      if (editingId) {
        await API.put(`/emballages/rules/${editingId}`, dataToSend); 
        showToast("Règle mise à jour avec succès");
      } else {
        await API.post('/emballages/rules', dataToSend); 
        showToast("Nouvelle règle enregistrée");
      }
      closeForm();
      fetchData();
    } catch (err) {
      showToast(err.response?.data?.error || "Erreur d'enregistrement", "error");
    } finally {
      setLoading(false);
    }
  };

  const deleteRule = async (id) => {
    // 🔑 SÉCURITÉ DE POSTE : Bloquer l'exécution si la permission de suppression de bouton est absente
    if (!canDeleteRule) {
      return showToast("🛑 ACCÈS REFUSÉ : Privilège de suppression de règle manquant pour votre profil.", "error");
    }

    if (!window.confirm("Supprimer définitivement cette règle ?")) return;
    try {
        await API.delete(`/emballages/rules/${id}`); 
        showToast("Règle supprimée");
        fetchData();
    } catch (err) {
        showToast("Suppression impossible : Liée à des emballages actifs", "error");
    }
  };

  const closeForm = () => {
    setIsAdding(false);
    setEditingId(null);
    setFormData(initialForm);
  };

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar />
      <main style={{ flex: 1, overflowY: 'auto', background: '#f1f5f9' }}>
        
        {toast.show && (
          <div style={{...toastContainerStyle, background: toast.type === 'success' ? '#10b981' : '#ef4444'}}>
            {toast.type === 'success' ? <CheckCircle size={18}/> : <AlertTriangle size={18}/>}
            {toast.message}
          </div>
        )}

        <header style={headerStyle}>
          <div>
            <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '900' }}>RÈGLES DE CONSIGNATION</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontSize: '13px' }}>
                <Scale size={14} /> Configuration dynamique des tranches et barèmes d'emballages
            </div>
          </div>

          {/* 🔑 MAPPAGE DYNAMIQUE DU BOUTON PRINCIPAL + SUPPRESSION DU DISABLED STRICT POUR LES TOASTS */}
          <button 
            onClick={() => {
              if (isInventoryActive) {
                showToast("CRÉATION BLOQUÉE : Un inventaire général est en cours.", "error");
              } else if (!canCreateRule) {
                showToast("🛑 ACCÈS REFUSÉ : Privilège de création de règle manquant pour votre rôle.", "error");
              } else {
                setIsAdding(true);
              }
            }} 
            style={{
              ...btnPrimaryStyle, 
              background: (isInventoryActive || !canCreateRule || isAdding || editingId) ? '#cbd5e1' : '#2563eb',
              color: (isInventoryActive || !canCreateRule || isAdding || editingId) ? '#64748b' : 'white',
              cursor: (isInventoryActive || !canCreateRule || isAdding || editingId) ? 'not-allowed' : 'pointer',
              opacity: 1
            }}
          >
            <Plus size={18} /> {isInventoryActive ? 'Système Gelé' : 'Nouvelle Règle'}
          </button>
        </header>

        <div style={{ padding: '30px 40px' }}>
          <button onClick={() => navigate(-1)} style={backBtnStyle}><ArrowLeft size={16} /> Retour au menu</button>

          {/* FORMULAIRE */}
          {(isAdding || editingId) && (
            <div style={{ ...contentCardStyle, padding: '25px', marginBottom: '20px', borderLeft: '5px solid #2563eb' }}>
              <h3 style={{fontSize: '14px', marginBottom: '15px', fontWeight: '800'}}>
                {editingId ? 'MODIFICATION DE LA RÈGLE ET DES PALIERS' : 'CRÉATION D\'UNE RÈGLE MULTI-PALIERS'}
              </h3>
              <form onSubmit={handleSubmit}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '15px', marginBottom: '25px' }}>
                  <div>
                    <label style={labelStyle}>Code unique de la règle</label>
                    <input type="text" style={inputStyle} value={formData.code_regle || ''} onChange={(e) => setFormData({...formData, code_regle: e.target.value})} required disabled={!!editingId} />
                  </div>
                  <div>
                    <label style={labelStyle}>Libellé descriptif</label>
                    <input type="text" style={inputStyle} value={formData.libelle || ''} onChange={(e) => setFormData({...formData, libelle: e.target.value})} required />
                  </div>
                </div>

                <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h4 style={{ margin: 0, fontSize: '12px', fontWeight: '900', color: '#334155' }}>CONFIGURATIONS DES TRANCHES CHRONOLOGIQUES</h4>
                    <button type="button" onClick={handleAddTier} style={{ ...btnPrimaryStyle, padding: '6px 12px', fontSize: '12px', borderRadius: '6px' }}>
                      <Plus size={14} /> Ajouter un palier
                    </button>
                  </div>

                  {formData.tiers && formData.tiers.map((tier, index) => (
                    <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr 1.5fr auto', gap: '10px', alignItems: 'end', marginBottom: '10px', background: 'white', padding: '10px', borderRadius: '6px', border: '1px solid #f1f5f9' }}>
                      <div>
                        <label style={labelStyle}>Jour Min</label>
                        <input type="number" min="0" style={inputStyle} value={tier.jours_min} onChange={(e) => handleTierChange(index, 'jours_min', e.target.value)} required />
                      </div>
                      <div>
                        <label style={labelStyle}>Jour Max (Vide = ∞)</label>
                        <input type="number" min="0" placeholder="Infini" style={inputStyle} value={tier.jours_max || ''} onChange={(e) => handleTierChange(index, 'jours_max', e.target.value)} />
                      </div>
                      <div>
                        <label style={labelStyle}>Mode de calcul</label>
                        <select style={inputStyle} value={tier.type_calcul} onChange={(e) => handleTierChange(index, 'type_calcul', e.target.value)} required>
                          <option value="POURCENTAGE REPRISE (%)">POURCENTAGE REPRISE (%)</option>
                          <option value="MONTANT FIXE PENALITE (F)">MONTANT FIXE PENALITE (F)</option>
                          <option value="CONSIDERE_VENDU">⚠️ CONSIDÉRÉ COMME VENDU (0% REPRISE)</option>
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>Valeur appliquée</label>
                        <input 
                          type="number" 
                          min="0" 
                          step="any" 
                          style={{...inputStyle, background: tier.type_calcul === 'CONSIDERE_VENDU' ? '#f1f5f9' : 'white'}} 
                          value={tier.valeur} 
                          onChange={(e) => handleTierChange(index, 'valeur', e.target.value)} 
                          required 
                          disabled={tier.type_calcul === 'CONSIDERE_VENDU'} 
                        />
                      </div>
                      <div>
                        <button type="button" onClick={() => handleRemoveTier(index)} disabled={formData.tiers.length === 1} style={{ ...actionBtnStyle('#ef4444'), marginTop: '24px', padding: '10px' }}>
                          <Trash size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                    <button type="button" onClick={closeForm} style={btnCancelStyle}><X size={18}/> Annuler</button>
                    <button type="submit" disabled={loading} style={btnSubmitStyle}>
                        {loading ? <Loader2 className="animate-spin" size={18}/> : <><Save size={18}/> Enregistrer la règle</>}
                    </button>
                </div>
              </form>
            </div>
          )}
{/* TABLEAU */}
          <div style={{ display: 'flex', gap: '10px', overflowX: 'auto' }}>
            <button onClick={() => setActiveTab('actifs')} style={tabButtonStyle(activeTab === 'actifs', '#2563eb')}><Package size={16} /> Liste des Règles Règles</button>
          </div>

          <div style={{...contentCardStyle, borderRadius: '0 12px 12px 12px'}}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ ...thStyle, width: '40px', textAlign: 'center' }}></th>
                  <th style={thStyle}>Code & Désignation</th>
                  <th style={thStyle}>Nombre de paliers</th>
                  <th style={{ ...thStyle, textAlign: 'right', paddingRight: '30px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rules.length === 0 ? (
                    <tr><td colSpan="4" style={{padding: '40px', textAlign: 'center', color: '#94a3b8'}}>Aucune règle configurée</td></tr>
                ) : rules.map((item) => {
                    const isExpanded = !!expandedRows[item.id];
                    return (
                      <React.Fragment key={item.id}>
                        <tr style={{ borderBottom: isExpanded ? 'none' : '1px solid #f1f5f9', background: isExpanded ? '#f8fafc' : 'transparent' }}>
                          <td style={{ ...tdStyle, textAlign: 'center', padding: '12px 5px' }}>
                            <button type="button" onClick={() => toggleRow(item.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b' }}>
                              {isExpanded ? <ChevronUp size={18} style={{ color: '#2563eb' }} /> : <ChevronDown size={18} />}
                            </button>
                          </td>
                          <td style={{ ...tdStyle, cursor: 'pointer' }} onClick={() => toggleRow(item.id)}>
                            <div style={{fontWeight: '900', color: '#1e293b', fontSize: '14px'}}>{item.code_regle}</div>
                            <div style={{fontSize: '12px', color: '#64748b', marginTop: '4px'}}>{item.libelle}</div>
                          </td>
                          <td style={{ ...tdStyle, color: '#475569', fontWeight: '600' }} onClick={() => toggleRow(item.id)}>
                            <span style={{ background: '#e2e8f0', padding: '3px 8px', borderRadius: '12px', fontSize: '11px' }}>
                              {item.tiers ? item.tiers.length : 0} palier(s)
                            </span>
                          </td>
                          <td style={{ ...tdStyle, paddingRight: '30px' }}>
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}>
                              
                              {/* 🔑 MAPPAGE DU BOUTON MODIFIER : Masqué si non autorisé */}
                              {canModifyRule && (
                                <button onClick={() => handleEditClick(item)} style={actionBtnStyle('#2563eb')} title="Modifier cette règle">
                                  <Edit3 size={14}/>
                                </button>
                              )}

                              {/* 🔑 MAPPAGE DU BOUTON SUPPRIMER : Masqué si non autorisé */}
                              {canDeleteRule && (
                                <button onClick={() => deleteRule(item.id)} style={actionBtnStyle('#ef4444')} title="Supprimer définitivement">
                                  <Trash2 size={14}/>
                                </button>
                              )}

                              {/* 🔒 TEXTE ACCÈS RESTREINT : Affiché si aucun droit n'est attribué */}
                              {!canModifyRule && !canDeleteRule && (
                                <span style={{ fontSize: '12px', color: '#64748b', fontStyle: 'italic', fontWeight: '500' }}>
                                  Accès restreint
                                </span>
                              )}

                            </div>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr style={{ background: '#f8fafc' }}>
                            <td colSpan="4" style={{ padding: '0px 20px 16px 60px', borderBottom: '1px solid #e2e8f0' }}>
                              <div style={dropdownContainerStyle}>
                                <div style={{ fontSize: '11px', fontWeight: '800', color: '#64748b', marginBottom: '8px', textTransform: 'uppercase' }}>
                                  Détails chronologiques du barème :
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  {item.tiers && item.tiers.map((t, idx) => {
                                    const effectifVendu = t.type_calcul === 'CONSIDERE_VENDU' || (t.type_calcul === 'POURCENTAGE_REPRISE' && parseFloat(t.valeur) === 0);
                                    const isPenalite = t.type_calcul === 'MONTANT_FIXE_PENALITE' || t.type_calcul === 'MONTANT FIXE PENALITE (F)';
                                    
                                    return (
                                      <div key={t.id || idx} style={tierRowStyle}>
                                        <span style={{ fontWeight: '700', color: '#334155', minWidth: '110px' }}>
                                          Jour {t.jours_min} à {t.jours_max ? t.jours_max : '∞'} :
                                        </span>
                                        <span style={typeCalculBadgeStyle(effectifVendu ? 'CONSIDERE_VENDU' : isPenalite ? 'MONTANT_FIXE_PENALITE' : 'POURCENTAGE_REPRISE')}>
                                          {effectifVendu ? 'VENDU DÉFINITIF' : isPenalite ? 'PÉNALITÉ' : 'REPRISE'}
                                        </span>
                                        <span style={{ fontWeight: '800', color: effectifVendu ? '#ef4444' : '#2563eb', marginLeft: 'auto' }}>
                                          {effectifVendu ? 'CONSERVÉ PAR CLIENT' : `${t.valeur} ${isPenalite ? 'F' : '%'}`}
                                        </span>
                                      </div>
                                    );
                                  })}
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
          </div>
        </div>
      </main>
    </div>
  );
};


const typeCalculBadgeStyle = (type) => {
  let bg = '#f0fdf4', text = '#16a34a';
  if (type === 'MONTANT_FIXE_PENALITE' || type === 'MONTANT FIXE PENALITE (F)') { bg = '#fef2f2'; text = '#ef4444'; }
  if (type === 'CONSIDERE_VENDU') { bg = '#fef3c7'; text = '#d97706'; }

  return {
    background: bg,
    color: text,
    padding: '2px 8px',
    borderRadius: '4px',
    fontWeight: '800',
    fontSize: '10px',
    border: '1px solid currentColor',
    textTransform: 'uppercase'
  };
};

const dropdownContainerStyle = { background: 'white', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '12px 16px', maxWidth: '600px' };
const tierRowStyle = { display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', background: '#f8fafc', padding: '6px 12px', borderRadius: '6px', border: '1px solid #f1f5f9' };
const tabButtonStyle = (active, color) => ({ padding: '12px 20px', background: active ? 'white' : 'transparent', border: 'none', borderBottom: active ? `3px solid ${color}` : '3px solid transparent', color: active ? color : '#64748b', fontWeight: '800', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' });
const headerStyle = { background: 'white', padding: '20px 40px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
const contentCardStyle = { background: 'white', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' };
const btnPrimaryStyle = { background: '#2563eb', color: 'white', border: 'none', padding: '10px 22px', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', fontWeight: '700' };
const backBtnStyle = { background: 'none', border: 'none', color: '#64748b', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '20px', fontWeight: '700', fontSize: '13px' };
const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '14px', marginTop: '5px', boxSizing: 'border-box' };
const labelStyle = { fontSize: '11px', fontWeight: '900', color: '#475569', textTransform: 'uppercase' };
const thStyle = { padding: '15px 20px', fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: '800', textAlign: 'left', background: '#f8fafc' };
const tdStyle = { padding: '16px 20px', fontSize: '13px', color: '#334155', verticalAlign: 'middle' };
const btnSubmitStyle = { padding: '12px 24px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' };
const btnCancelStyle = { padding: '12px 24px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' };
const actionBtnStyle = (color) => ({ padding: '8px', borderRadius: '8px', border: `1px solid ${color}30`, background: `${color}10`, color: color, cursor: 'pointer', display: 'flex', alignItems: 'center' });
const toastContainerStyle = { position: 'fixed', top: '20px', right: '20px', zIndex: 9999, color: 'white', padding: '12px 24px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '10px', fontWeight: '800' }; 

export default RegleConsignation;