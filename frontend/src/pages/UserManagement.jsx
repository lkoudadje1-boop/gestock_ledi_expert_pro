import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  UserPlus, Shield, User, Lock, Mail, 
  Briefcase, X, Edit, CheckCircle, Power, AlertTriangle, EyeOff
} from 'lucide-react';
import { getFilteredStructureForManager } from '../utils/permissions_utils';
import { getUserPermissions } from '../utils/permissions_utils'; // 🔑 IMPORTATION DU SÉCURISEUR
import Sidebar from '../components/Sidebar';
import API, { socket } from '../services/api';

const UserManagement = () => {
  const navigate = useNavigate();
  
  // 🔑 EXTRACTION GRANULAIRE ET SOUPLITUDE DES TYPES ALIGNÉE SUR TES NOUVELLES CLÉS DE BOUTONS GLOBALISEES
  const userPerms = useMemo(() => getUserPermissions(), []);
  
  const canCreateUser = userPerms['user_btn_create_submit'] === true || userPerms['user_btn_create_submit'] === 1 || userPerms['user_btn_create_submit'] === 'true' || userPerms['user_btn_create_submit'] === '1';
  const canManageStaff = userPerms['user_btn_edit_submit'] === true || userPerms['user_btn_edit_submit'] === 1 || userPerms['user_btn_edit_submit'] === 'true' || userPerms['user_btn_edit_submit'] === '1';

  // --- 1. INFOS UTILISATEUR ---
  const currentUser = useMemo(() => JSON.parse(localStorage.getItem('user') || '{}'), []);
  const currentUserId = currentUser.id || currentUser.userId;
  const isPowerUser = useMemo(() => {
    const role = (currentUser.role || 'user').toLowerCase();
    return role === 'admin' || role === 'super_admin';
  }, [currentUser.role]);

  const displayStructure = useMemo(() => getFilteredStructureForManager(currentUser.role), [currentUser.role]);

  // --- 2. ÉTATS ---
  const [users, setUsers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('all'); 
  const [modal, setModal] = useState({ show: false, title: '', message: '', type: 'confirm', onConfirm: null });

  // --- 3. RÉCUPÉRATION (Optimisée) ---
  const fetchUsers = useCallback(async () => {
    try {
      const res = await API.get(`/auth/users?t=${Date.now()}`); 
      setUsers(res.data);
    } catch (err) {
      console.error("❌ Erreur récupération:", err);
    }
  }, []);

  // --- 4. CHARGEMENT INITIAL ---
  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // --- 5. LOGIQUE SOCKET (VERSION RÉACTIVE) ---
  useEffect(() => {
    if (!socket) return;

    const companyId = currentUser.company_id || currentUser.companyId || localStorage.getItem('companyId');
    
    if (companyId) socket.emit('join_company', String(companyId));
    if (currentUserId) socket.emit('join_self', String(currentUserId));

    const handleSocketRefresh = (data) => {
        console.log("⚡ [SOCKET] Signal de mise à jour reçu:", data);
        setTimeout(() => fetchUsers(), 200); 
    };

    socket.on('USER_REGISTRY_CHANGED', handleSocketRefresh);
    socket.on('REFRESH_UI', (data) => { 
        if (data && data.module === 'USERS') handleSocketRefresh(data);
    });
    
    socket.on('ACCOUNT_DEACTIVATED', (data) => {
        const msg = data?.message || "Accès suspendu";
        alert(msg);
        localStorage.clear();
        sessionStorage.clear();
        window.location.href = '/login'; 
    });

    return () => {
      socket.off('USER_REGISTRY_CHANGED', handleSocketRefresh);
      socket.off('REFRESH_UI');
      socket.off('ACCOUNT_DEACTIVATED');
    };
  }, [fetchUsers, currentUserId, currentUser.company_id, currentUser.companyId]);

  // --- 6. LOGIQUE DE FILTRAGE ---
  const visibleUsers = useMemo(() => {
    return users.filter(u => {
      const targetRole = (u.role || 'user').toLowerCase();
      const isTargetAdmin = targetRole === 'admin' || targetRole === 'super_admin';
      if (isTargetAdmin && !isPowerUser) return false;
      return true;
    });
  }, [users, isPowerUser]);

  const counts = useMemo(() => ({
    all: visibleUsers.length,
    active: visibleUsers.filter(u => u.is_active === 1).length,
    suspended: visibleUsers.filter(u => u.is_active === 0).length
  }), [visibleUsers]);

  const filteredUsers = useMemo(() => {
    if (activeTab === 'active') return visibleUsers.filter(u => u.is_active === 1);
    if (activeTab === 'suspended') return visibleUsers.filter(u => u.is_active === 0);
    return visibleUsers;
  }, [visibleUsers, activeTab]);

  // --- 7. ACTIONS ---
  const initialUserState = useMemo(() => ({
    username: '', email: '', password: '', role: 'user',
    company_id: currentUser.company_id || currentUser.companyId, 
    fonction: '', nif: '', cnss: '',
    adresse: '', permissions: {}, is_temp_password: 1, is_active: 1
  }), [currentUser]);

  const [newUser, setNewUser] = useState(initialUserState);

  const closeForm = () => {
    setShowForm(false);
    setIsEditing(false);
    setNewUser(initialUserState);
  };

  const handleEditClick = (user) => {
    if (!canManageStaff) {
      setModal({ show: true, title: "Accès Refusé", message: "🛑 Votre profil ne détient pas la permission de modifier un collaborateur.", type: 'alert' });
      return;
    }
    setNewUser(user);
    setIsEditing(true);
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return; 

    // 🔑 SÉCURITÉ DOUBLE VÉROU NETWORKING BASÉE SUR LES NOUVELLES CLÉS
    if (isEditing && !canManageStaff) {
      setModal({ show: true, title: "Accès Refusé", message: "🛑 Action non autorisée pour votre rôle (Modification bloquée).", type: 'alert' });
      return;
    }
    if (!isEditing && !canCreateUser) {
      setModal({ show: true, title: "Accès Refusé", message: "🛑 Action non autorisée pour votre rôle (Création bloquée).", type: 'alert' });
      return;
    }

    setLoading(true);

    try {
      let perms = newUser.permissions;
      if (typeof perms === 'string') {
          try { perms = JSON.parse(perms); } catch(e) { perms = {}; }
      }

      const payload = { ...newUser, permissions: perms };

      if (isEditing) {
        await API.put(`/auth/users/${newUser.id}`, payload);
      } else {
        await API.post('/auth/create-user', payload);
      }
      
      closeForm(); 
      setTimeout(() => fetchUsers(), 300);

    } catch (err) {
      const errorMsg = err.response?.data?.error || "Erreur de connexion au serveur.";
      setModal({ show: true, title: "Erreur", message: errorMsg, type: 'alert' });
    } finally { 
      setLoading(false); 
    }
  };

  const toggleUserStatus = async (user) => {
    if (!canManageStaff) {
      setModal({ show: true, title: "Accès Refusé", message: "🛑 Privilège de gestion des statuts du personnel manquant.", type: 'alert' });
      return;
    }

    const newStatus = user.is_active === 1 ? 0 : 1;
    setModal({
      show: true,
      title: "Confirmation",
      message: `Voulez-vous vraiment ${newStatus === 1 ? 'réactiver' : 'suspendre'} ${user.username} ?`,
      type: 'confirm',
      onConfirm: async () => {
        try {
          await API.patch(`/auth/users/${user.id}/status`, { is_active: newStatus });
          if (newStatus === 0 && socket) socket.emit('force_logout_user', user.id);
          
          setModal(prev => ({ ...prev, show: false }));
          setTimeout(() => fetchUsers(), 300);
        } catch (err) { 
            setModal({ show: true, title: "Erreur", message: "Échec du changement de statut.", type: 'alert' }); 
        }
      }
    });
  };

  const handleEdit = (user) => {
    if (!canManageStaff) {
      setModal({ show: true, title: "Accès Refusé", message: "🛑 Votre profil ne détient pas la permission de modifier un collaborateur.", type: 'alert' });
      return;
    }
    let perms = {};
    try { perms = typeof user.permissions === 'string' ? JSON.parse(user.permissions) : (user.permissions || {}); } catch (e) { perms = {}; }
    setNewUser({ ...user, permissions: perms });
    setIsEditing(true);
    setShowForm(true); // 💡 CORRECTION DU CRASH DE COUPE TEXTE
  };


  return (
    <div style={s.container}>
      <Sidebar />
      <main style={s.main}>
        {modal.show && (
          <div style={s.modalOverlay}>
            <div style={s.modalCard}>
              <div style={s.modalHeader}>
                <AlertTriangle size={24} color={modal.type === 'confirm' ? '#f59e0b' : '#ef4444'} />
                <h3 style={s.modalTitle}>{modal.title}</h3>
              </div>
              <p style={s.modalMessage}>{modal.message}</p>
              <div style={s.modalActions}>
                {modal.type === 'confirm' && <button onClick={() => setModal({ ...modal, show: false })} style={s.btnModalCancel}>ANNULER</button>}
                <button onClick={modal.type === 'confirm' ? modal.onConfirm : () => setModal({ ...modal, show: false })} style={s.btnModalConfirm}>OK</button>
              </div>
            </div>
          </div>
        )}

        <header style={s.header}>
          <div>
            <h1 style={s.headerTitle}>Collaborateurs</h1>
            <p style={s.headerSubtitle}>Gestion des accès {isPowerUser ? "(Mode Admin)" : "(Mode Utilisateur)"}</p>
          </div>

          {/* 🔑 MAPPAGE DYNAMIQUE DU BOUTON PRINCIPAL SANS ATTRIBUT DISABLED POUR INTERCEPTER LE CLIC */}
          <button 
            onClick={() => {
              if (showForm) {
                closeForm();
              } else if (!canCreateUser) {
                setModal({ show: true, title: "Accès Refusé", message: "🛑 Votre profil ne détient pas la permission de créer un nouveau collaborateur.", type: 'alert' });
              } else {
                setShowForm(true);
              }
            }} 
            style={showForm ? s.btnCancel : {
              ...s.btnAdd,
              background: canCreateUser ? '#2563eb' : '#94a3b8',
              cursor: 'pointer'
            }}
          >
            {showForm ? <X size={20} /> : <UserPlus size={20} />}
            {showForm ? "ANNULER" : (canCreateUser ? "NOUVEAU" : "Accès restreint")}
          </button>
        </header>

        <div style={s.contentArea}>
          {showForm && (
            <div style={s.formCard}>
                <h3 style={s.formTitle}>{isEditing ? `Modifier : ${newUser.username}` : "Nouveau compte"}</h3>
                <form onSubmit={handleSubmit}>
                    <div style={s.formGrid}>
                        <div style={s.inputBox}><label style={s.label}><User size={14}/> NOM D'UTILISATEUR</label>
                            <input style={s.input} type="text" required value={newUser.username} onChange={(e) => setNewUser({...newUser, username: e.target.value})} readOnly={isEditing && !canManageStaff} />
                        </div>
                        <div style={s.inputBox}><label style={s.label}><Mail size={14}/> EMAIL</label>
                            <input style={s.input} type="email" required value={newUser.email} onChange={(e) => setNewUser({...newUser, email: e.target.value})} readOnly={isEditing && !canManageStaff} />
                        </div>
                        {!isEditing && (
                            <div style={s.inputBox}><label style={s.label}><Lock size={14}/> MOT DE PASSE</label>
                            <input style={s.input} type="password" required value={newUser.password} onChange={(e) => setNewUser({...newUser, password: e.target.value})} />
                            </div>
                        )}
                        <div style={s.inputBox}><label style={s.label}><Briefcase size={14}/> FONCTION</label>
                            <input style={s.input} type="text" value={newUser.fonction} onChange={(e) => setNewUser({...newUser, fonction: e.target.value})} readOnly={isEditing && !canManageStaff} />
                        </div>
                    </div>

                    <h3 style={s.sectionDivider}><Shield size={18} color="#2563eb" /> Permissions</h3>
                    <div style={s.permGrid}>
                        {displayStructure.map(group => {
                            const isParentActive = !!(newUser.permissions || {})[group.id];
                            return (
                                <div key={group.id} style={{ ...s.permCard, background: isParentActive ? '#f0f7ff' : '#f8fafc', borderColor: isParentActive ? '#bfdbfe' : '#e2e8f0' }}>
                                    <div style={s.permHeader}>
                                        <input type="checkbox" id={group.id} checked={isParentActive} disabled={isEditing && !canManageStaff} onChange={() => {
                                            if (isEditing && !canManageStaff) return;
                                            const up = { ...newUser.permissions };
                                            const val = !up[group.id];
                                            up[group.id] = val;
                                            if (!val) group.subs.forEach(sub => up[sub.id] = false);
                                            setNewUser({...newUser, permissions: up});
                                        }} />
                                        <label htmlFor={group.id} style={{ fontWeight: '700', cursor: (isEditing && !canManageStaff) ? 'not-allowed' : 'pointer' }}>{group.label}</label>
                                    </div>
                                    <div style={{ paddingLeft: '25px', display: 'flex', flexDirection: 'column', gap: '6px', opacity: isParentActive ? 1 : 0.4 }}>
                                        {group.subs.map(sub => (
                                            <label key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.8rem' }}>
                                                <input type="checkbox" disabled={!isParentActive || (isEditing && !canManageStaff)} checked={!!(newUser.permissions || {})[sub.id]} onChange={() => {
                                                    if (isEditing && !canManageStaff) return;
                                                    const up = { ...newUser.permissions };
                                                    up[sub.id] = !up[sub.id];
                                                    if (up[sub.id]) up[group.id] = true;
                                                    setNewUser({...newUser, permissions: up});
                                                }} />
                                                {sub.label}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <div style={s.formActions}>
                        <button type="submit" disabled={loading} style={{...s.btnSubmit, background: (isEditing ? (canManageStaff ? '#2563eb' : '#94a3b8') : (canCreateUser ? '#2563eb' : '#94a3b8'))}}>
                            {loading ? "EN COURS..." : isEditing ? (canManageStaff ? "MODIFIER" : "Accès restreint") : (canCreateUser ? "CRÉER" : "Accès restreint")}
                        </button>
                    </div>
                </form>
            </div>
          )}

          <div style={s.tabContainer}>
            {/* 💡 CORRECTION DU CONFLIT SHORTHAND CSS POUR EXPULSER L'ERREUR DE LA CONSOLE */}
            <button onClick={() => setActiveTab('all')} style={activeTab === 'all' ? s.tabActive : s.tab}>
              Tous <span style={s.tabBadge}>{counts.all}</span>
            </button>
            <button onClick={() => setActiveTab('active')} style={activeTab === 'active' ? s.tabActive : s.tab}>
              Actifs <span style={{...s.tabBadge, background: '#dcfce7', color: '#166534'}}>{counts.active}</span>
            </button>
            <button onClick={() => setActiveTab('suspended')} style={activeTab === 'suspended' ? s.tabActive : s.tab}>
              Suspendus <span style={{...s.tabBadge, background: '#fee2e2', color: '#991b1b'}}>{counts.suspended}</span>
            </button>
          </div>

          <div style={s.tableContainer}>
            <table style={s.table}>
              <thead style={s.thead}>
                <tr>
                  <th style={s.th}>Collaborateur</th>
                  <th style={s.th}>Statut</th>
                  <th style={s.th}>Modules</th>
                  <th style={{ ...s.th, textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>

                         {filteredUsers.map(u => {
                  const isSelf = String(u.id) === String(currentUserId);
                  
                  // Vérification si l'utilisateur possède au moins un droit d'action sur la ligne
                  const hasRowAccess = canManageStaff || isSelf;

                  return (
                    <tr key={u.id} style={{ ...s.tr, background: u.is_active === 0 ? '#fff1f2' : 'white' }}>
                      <td style={s.td}>
                        <div style={{ fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {u.username} {isSelf && <span style={s.selfBadge}>MOI</span>}
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>{u.email}</div>
                      </td>
                      <td style={s.td}>
                        <span style={u.is_active === 1 ? s.statusActive : s.statusInactive}>
                          {u.is_active === 1 ? 'ACTIF' : 'SUSPENDU'}
                        </span>
                      </td>
                      <td style={s.td}>
                         <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 'bold' }}>
                            <Shield size={14} color="#2563eb" />
                            {Object.values(typeof u.permissions === 'string' ? JSON.parse(u.permissions) : (u.permissions || {})).filter(v => v === true).length}
                         </div>
                      </td>
                      <td style={{ ...s.td, textAlign: 'center' }}>
                        <div style={s.actionRow}>
                          
                          {/* 🔑 MAPPAGE DU BOUTON MODIFIER : Affiché si le profil détient la permission ou si c'est sa propre ligne */}
                          {canManageStaff && (
                            <button onClick={() => handleEdit(u)} style={s.iconBtnEdit} title="Modifier">
                              <Edit size={18}/>
                            </button>
                          )}

                          {/* 🔑 MAPPAGE DU BOUTON ACTION SUSPENDRE / ACTIVER : Affiché si autorisé et s'il ne s'agit pas de soi-même */}
                          {canManageStaff && !isSelf && (
                            <button 
                              onClick={() => toggleUserStatus(u)} 
                              style={u.is_active === 1 ? s.iconBtnBlock : s.iconBtnUnblock}
                              title={u.is_active === 1 ? "Suspendre" : "Activer"}
                            >
                              {u.is_active === 1 ? <Power size={18}/> : <CheckCircle size={18}/>}
                            </button>
                          )}

                          {/* 🔒 SÉCURITÉ INFORMATIVE : Affiché si aucun droit n'est accordé à l'utilisateur actuel sur cette ligne */}
                          {!hasRowAccess && (
                            <span style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic', fontWeight: '500' }}>
                              Accès restreint
                            </span>
                          )}

                          {/* Cas particulier : si l'admin regarde sa propre ligne, on désactive simplement l'icône de suspension */}
                          {canManageStaff && isSelf && (
                            <button 
                              disabled={true}
                              style={{ ...(u.is_active === 1 ? s.iconBtnBlock : s.iconBtnUnblock), opacity: 0.2, cursor: 'not-allowed' }}
                              title="Vous ne pouvez pas suspendre votre propre compte"
                            >
                              <Power size={18}/>
                            </button>
                          )}

                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredUsers.length === 0 && (
              <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>
                <EyeOff size={48} style={{ margin: '0 auto 15px', opacity: 0.3 }} />
                <p style={{ fontWeight: '600' }}>Aucun collaborateur visible ici.</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

// Styles optimisés
const s = {
  container: { display: 'flex', height: '100vh', width: '100vw', background: '#f8fafc', overflow: 'hidden' },
  main: { flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', overflowY: 'auto' },
  header: { background: 'white', padding: '20px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0' },
  headerTitle: { margin: 0, fontSize: '22px', fontWeight: '900', color: '#0f172a' },
  headerSubtitle: { margin: 0, color: '#64748b', fontSize: '13px' },
  contentArea: { padding: '25px 40px' },
  formCard: { background: 'white', borderRadius: '12px', padding: '25px', border: '1px solid #e2e8f0', marginBottom: '25px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' },
  formTitle: { marginTop: 0, marginBottom: '20px', fontSize: '16px', fontWeight: '800', color: '#2563eb' },
  formGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px', marginBottom: '20px' },
  inputBox: { display: 'flex', flexDirection: 'column', gap: '5px' },
  label: { fontSize: '10px', fontWeight: '800', color: '#475569', textTransform: 'uppercase' },
  input: { padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' },
  sectionDivider: { fontSize: '14px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', marginBottom: '20px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' },
  permGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' },
  permCard: { padding: '12px', borderRadius: '8px', border: '1px solid' },
  permHeader: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' },
  formActions: { display: 'flex', marginTop: '20px' },
  btnSubmit: { flex: 1, padding: '12px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', fontWeight: '800', cursor: 'pointer' },
  tabContainer: { display: 'flex', gap: '10px', marginBottom: '15px' },
  tab: { padding: '10px 20px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', transition: '0.2s' },
  tabActive: { background: '#2563eb', color: 'white', borderColor: '#2563eb' },
  tabBadge: { padding: '2px 8px', borderRadius: '10px', background: '#f1f5f9', color: '#475569', fontSize: '11px' },
  tableContainer: { background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse' },
  thead: { background: '#f8fafc' },
  th: { padding: '12px 20px', textAlign: 'left', color: '#64748b', fontSize: '11px', fontWeight: '900', textTransform: 'uppercase' },
  td: { padding: '12px 20px', fontSize: '14px', borderBottom: '1px solid #f1f5f9' },
  tr: { transition: '0.2s' },
  statusActive: { padding: '3px 8px', borderRadius: '12px', fontSize: '10px', fontWeight: '900', background: '#dcfce7', color: '#166534' },
  statusInactive: { padding: '3px 8px', borderRadius: '12px', fontSize: '10px', fontWeight: '900', background: '#fee2e2', color: '#991b1b' },
  selfBadge: { fontSize: '9px', background: '#2563eb', padding: '2px 6px', borderRadius: '4px', color: 'white' },
  actionRow: { display: 'flex', justifyContent: 'center', gap: '12px' },
  iconBtnEdit: { color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer' },
  iconBtnBlock: { color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' },
  iconBtnUnblock: { color: '#10b981', background: 'none', border: 'none', cursor: 'pointer' },
  btnAdd: { background: '#2563eb', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' },
  btnCancel: { background: '#64748b', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', fontWeight: '800' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(15, 23, 42, 0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 },
  modalCard: { background: 'white', padding: '25px', borderRadius: '12px', width: '90%', maxWidth: '400px' },
  modalHeader: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' },
  modalTitle: { margin: 0, fontSize: '16px', fontWeight: '900' },
  modalMessage: { color: '#64748b', fontSize: '14px', marginBottom: '20px' },
  modalActions: { display: 'flex', gap: '10px', justifyContent: 'flex-end' },
  btnModalCancel: { padding: '8px 16px', background: '#f1f5f9', border: 'none', borderRadius: '6px', fontWeight: '800', cursor: 'pointer' },
  btnModalConfirm: { padding: '8px 16px', background: '#2563eb', border: 'none', borderRadius: '6px', color: 'white', fontWeight: '800', cursor: 'pointer' }
};

export default UserManagement;