import React, { useState, useEffect, useMemo } from 'react';
import { UserPlus, X, Edit, Phone, Mail, MapPin, ShieldCheck, FileBadge, Archive, RotateCcw } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import { getUserPermissions } from '../utils/permissions_utils'; // 🔑 IMPORTATION DU SÉCURISEUR
import API from '../services/api';

const StaffManagement = () => {
  // 🔑 EXTRACTION COMPTABLE ET SOUPLITUDE DES TYPES (true, 1, 'true', '1') POUR TES 3 BOUTONS DE PERSONNEL
  const userPerms = useMemo(() => getUserPermissions(), []);
  
  const canCreateStaff = userPerms['staff_btn_create'] === true || userPerms['staff_btn_create'] === 1 || userPerms['staff_btn_create'] === 'true' || userPerms['staff_btn_create'] === '1';
  const canModifyStaff = userPerms['staff_btn_modify'] === true || userPerms['staff_btn_modify'] === 1 || userPerms['staff_btn_modify'] === 'true' || userPerms['staff_btn_modify'] === '1';
  const canArchiveStaff = userPerms['staff_btn_archive'] === true || userPerms['staff_btn_archive'] === 1 || userPerms['staff_btn_archive'] === 'true' || userPerms['staff_btn_archive'] === '1';

  const [staff, setStaff] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const initialStaffState = {
    name: '', phone: '', email: '', adresse: '',
    nif: '', cnss: '', fonction: 'Serveuse', is_active: 1
  };

  const [newStaff, setNewStaff] = useState(initialStaffState);

  useEffect(() => { fetchStaff(); }, []);

  const fetchStaff = async () => { 
    try { 
      const res = await API.get('/staff'); 
      setStaff(res.data); 
    } catch (err) { 
      console.error("Erreur staff:", err); 
    } 
  };

  const handleEditClick = (employee) => {
    // 🔑 SÉCURITÉ DE CLIC VISUEL : Bloquer l'affichage du formulaire si le droit de modification est absent
    if (!canModifyStaff) {
      return alert("🛑 ACCÈS REFUSÉ : Privilège de modification d'employé manquant pour votre profil.");
    }
    setNewStaff(employee);
    setIsEditing(true);
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // 🔑 SÉCURITÉ DOUBLE VÉROU NETWORKING BEFORE API CALL
    if (isEditing && !canModifyStaff) {
      return alert("🛑 ACCÈS REFUSÉ : Action de modification non autorisée pour votre profil.");
    }
    if (!isEditing && !canCreateStaff) {
      return alert("🛑 ACCÈS REFUSÉ : Action d'enregistrement de nouvel employé non autorisée.");
    }

    try {
      if (isEditing) { 
        await API.put(`/staff/${newStaff.id}`, newStaff); 
      } else { 
        await API.post('/staff', newStaff); 
      }
      setShowForm(false); 
      setIsEditing(false); 
      setNewStaff(initialStaffState);
      fetchStaff();
    } catch (err) { 
      alert("Erreur d'enregistrement"); 
    }
  };

  // FONCTION ARCHIVER (Désactivation logique sécurisée)
  const handleArchive = async (employee) => {
    // 🔑 SÉCURITÉ DE CLIC : Interdire l'archivage/réactivation réseau si la permission de bouton est absente
    if (!canArchiveStaff) {
      return alert("🛑 ACCÈS REFUSÉ : Privilège d'archivage d'employé manquant pour votre profil.");
    }

    const actionLabel = employee.is_active ? "archiver" : "réactiver";
    if (window.confirm(`Voulez-vous vraiment ${actionLabel} cet employé ?`)) {
      try {
        await API.put(`/staff/${employee.id}`, {
          ...employee,
          is_active: employee.is_active ? 0 : 1
        });
        fetchStaff();
      } catch (err) {
        alert("Erreur lors de l'opération");
      }
    }
  };


    return (
    <div style={{ display: 'flex', minHeight: '100vh', width: '100%', background: '#f8fafc' }}>
      <Sidebar />
      
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', width: '100%' }}>
        
        <header style={s.header}>
          <div>
            <h1 style={s.title}>Gestion du Personnel</h1>
            <p style={s.subtitle}>Identification et conformité administrative (NIF/CNSS)</p>
          </div>
          
          {/* 🔑 MAPPAGE DYNAMIQUE DU BOUTON PRINCIPAL + SUPPRESSION DU DISABLED STRICT POUR LES ALERTES */}
          <button 
            onClick={() => {
              if (showForm) {
                setIsEditing(false); 
                setNewStaff(initialStaffState);
                setShowForm(false);
              } else if (!canCreateStaff) {
                alert("🛑 ACCÈS REFUSÉ : Votre profil ne détient pas la permission d'ajouter un nouvel employé.");
              } else {
                setShowForm(true);
              }
            }} 
            style={showForm ? s.btnCancel : {
              ...s.btnAdd,
              background: canCreateStaff ? '#2563eb' : '#94a3b8',
              cursor: 'pointer'
            }}
          >
            {showForm ? <X size={20} /> : <UserPlus size={20} />}
            {showForm ? "ANNULER" : (canCreateStaff ? "AJOUTER UN EMPLOYÉ" : "Accès restreint")}
          </button>
        </header>

        <div style={s.contentArea}>
          
          {showForm && (
            <div style={s.formCard} className="fade-in">
              <h2 style={s.formTitle}>{isEditing ? "Modifier la fiche" : "Nouvelle Fiche Employé"}</h2>
              <form onSubmit={handleSubmit} style={s.formGrid}>
                <div style={s.inputBox}><label style={s.label}>Nom complet</label><input style={s.input} value={newStaff.name} onChange={e => setNewStaff({...newStaff, name: e.target.value})} required placeholder="Ex: Jean Dupont" /></div>
                <div style={s.inputBox}><label style={s.label}>Téléphone</label><input style={s.input} value={newStaff.phone} onChange={e => setNewStaff({...newStaff, phone: e.target.value})} /></div>
                <div style={s.inputBox}><label style={s.label}>NIF (Fiscal)</label><input style={s.input} value={newStaff.nif} onChange={e => setNewStaff({...newStaff, nif: e.target.value})} placeholder="000-000-0" /></div>
                <div style={s.inputBox}><label style={s.label}>CNSS (Social)</label><input style={s.input} value={newStaff.cnss} onChange={e => setNewStaff({...newStaff, cnss: e.target.value})} placeholder="X-0000000" /></div>
                
                <div style={s.inputBox}><label style={s.label}>Fonction</label><input style={s.input} value={newStaff.fonction} onChange={e => setNewStaff({...newStaff, fonction: e.target.value})} placeholder="Poste occupé" /></div>
                <div style={s.inputBox}><label style={s.label}>Email</label><input style={s.input} type="email" value={newStaff.email} onChange={e => setNewStaff({...newStaff, email: e.target.value})} placeholder="exemple@mail.com" /></div>
                <div style={{ ...s.inputBox, gridColumn: 'span 2' }}><label style={s.label}>Adresse Physique</label><input style={s.input} value={newStaff.adresse} onChange={e => setNewStaff({...newStaff, adresse: e.target.value})} /></div>
                
                <div style={{ gridColumn: 'span 4', textAlign: 'right', marginTop: '15px' }}>
                  <button type="submit" style={s.btnSubmit}>ENREGISTRER LES INFORMATIONS</button>
                </div>
              </form>
            </div>
          )}

          <div style={s.tableWrapper}>
            <table style={s.table}>
              <thead>
                <tr style={s.thead}>
                  <th style={s.th}>ID RÉEL</th>
                  <th style={s.th}>NOM DE L'EMPLOYÉ</th>
                  <th style={s.th}>CONTACT / EMAIL</th>
                  <th style={s.th}>NIF / CNSS</th>
                  <th style={s.th}>FONCTION</th>
                  <th style={s.th}>STATUT</th>
                  <th style={{ ...s.th, textAlign: 'center' }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((m) => {
                  // Vérification si l'utilisateur possède au moins une action unitaire autorisée sur la ligne
                  const hasRowAccess = canModifyStaff || canArchiveStaff;

                  return (
                    <tr key={m.id} style={s.tr}>
                      <td style={s.td}><span style={s.idTag}>{m.id}</span></td>
                      <td style={s.td}>
                        <div style={{ fontWeight: '800' }}>{m.name}</div>
                        <div style={s.subText}><MapPin size={10} /> {m.adresse || '---'}</div>
                      </td>
                      <td style={s.td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><Phone size={12} color="#64748b"/> {m.phone || '---'}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#2563eb', fontSize: '12px', marginTop: '4px' }}>
                          <Mail size={12}/> {m.email || '---'}
                        </div>
                      </td>
                      <td style={s.td}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                          <div style={s.docBadge}><ShieldCheck size={12} color="#3b82f6"/> {m.nif || 'NIF ---'}</div>
                          <div style={s.docBadge}><FileBadge size={12} color="#6366f1"/> {m.cnss || 'CNSS ---'}</div>
                        </div>
                      </td>
                      <td style={s.td}><span style={s.fonctionTag}>{m.fonction || 'Non défini'}</span></td>
                      <td style={s.td}>
                        <span style={m.is_active ? s.statusOn : s.statusOff}>
                          {m.is_active ? 'EN POSTE' : 'ARCHIVÉ'}
                        </span>
                      </td>
                      <td style={{ ...s.td, textAlign: 'center' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', alignItems: 'center' }}>
                          
                          {/* 🔑 MAPPAGE DU BOUTON MODIFIER : Affiché uniquement si autorisé */}
                          {canModifyStaff && (
                            <button 
                              onClick={() => handleEditClick(m)} 
                              style={s.editBtn} 
                              title="Modifier"
                            >
                              <Edit size={18}/>
                            </button>
                          )}
                          
                          {/* 🔑 MAPPAGE DU BOUTON ARCHIVER / RÉACTIVER : Affiché uniquement si autorisé */}
                          {canArchiveStaff && (
                            <button 
                              onClick={() => handleArchive(m)} 
                              style={m.is_active ? s.archiveBtn : s.reactivateBtn} 
                              title={m.is_active ? "Archiver" : "Réactiver"}
                            >
                              {m.is_active ? <Archive size={18}/> : <RotateCcw size={18}/>}
                            </button>
                          )}

                          {/* 🔒 SÉCURITÉ VISUELLE INTERNE : S'affiche si aucun droit n'est accordé sur cette ligne */}
                          {!hasRowAccess && (
                            <span style={{ fontSize: '12px', color: '#64748b', fontStyle: 'italic', fontWeight: '500' }}>
                              Accès restreint
                            </span>
                          )}

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
    </div>
  );
};

const s = {
  header: { background: 'white', padding: '25px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0' },
  title: { margin: 0, fontSize: '26px', fontWeight: '900', color: '#0f172a' },
  subtitle: { margin: 0, color: '#64748b', fontSize: '15px' },
  contentArea: { padding: '30px 40px' },
  formCard: { background: 'white', padding: '30px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '30px' },
  formTitle: { marginTop: 0, marginBottom: '25px', fontSize: '18px', borderLeft: '4px solid #2563eb', paddingLeft: '15px', fontWeight: '800' },
  formGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' },
  tableWrapper: { background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse' },
  thead: { background: '#f8fafc', borderBottom: '2px solid #e2e8f0' },
  th: { padding: '15px 20px', textAlign: 'left', fontSize: '11px', fontWeight: '800', color: '#475569', textTransform: 'uppercase' },
  td: { padding: '15px 20px', fontSize: '14px', borderBottom: '1px solid #f1f5f9' },
  tr: { transition: '0.2s' },
  inputBox: { display: 'flex', flexDirection: 'column', gap: '5px' },
  label: { fontSize: '11px', fontWeight: '800', color: '#475569' },
  input: { padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' },
  subText: { fontSize: '12px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' },
  docBadge: { display: 'flex', alignItems: 'center', gap: '5px', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: '700' },
  idTag: { background: '#334155', color: 'white', padding: '4px 8px', borderRadius: '4px', fontWeight: 'bold', fontSize: '10px', fontFamily: 'monospace' },
  fonctionTag: { background: '#eff6ff', color: '#2563eb', padding: '4px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: '700' },
  statusOn: { color: '#10b981', fontSize: '11px', fontWeight: '900' },
  statusOff: { color: '#f97316', fontSize: '11px', fontWeight: '900' },
  btnAdd: { background: '#2563eb', color: 'white', border: 'none', padding: '12px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' },
  btnCancel: { background: '#64748b', color: 'white', border: 'none', padding: '12px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' },
  btnSubmit: { background: '#2563eb', color: 'white', border: 'none', padding: '12px 25px', borderRadius: '8px', fontWeight: '900', cursor: 'pointer' },
  editBtn: { background: '#f1f5f9', border: 'none', color: '#2563eb', cursor: 'pointer', padding: '8px', borderRadius: '6px' },
  archiveBtn: { background: '#fff7ed', border: 'none', color: '#ea580c', cursor: 'pointer', padding: '8px', borderRadius: '6px' },
  reactivateBtn: { background: '#f0fdf4', border: 'none', color: '#16a34a', cursor: 'pointer', padding: '8px', borderRadius: '6px' }
};

export default StaffManagement;