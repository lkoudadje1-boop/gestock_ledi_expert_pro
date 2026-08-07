import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
    ShieldCheck, Calendar, PlusCircle, X, Save, Loader2, 
    AlertTriangle, CheckCircle2, Lock, Unlock, ArrowRightCircle, Edit3, Trash2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom'; 
import Sidebar from '../../components/Sidebar';
import { getUserPermissions } from '../../utils/permissions_utils'; // 🔑 IMPORTATION DU SÉCURISEUR
import API, { socket } from '../../services/api';

const ExerciceComptable = ({ user }) => {
    const navigate = useNavigate(); 

    // 🔑 EXTRACTION COMPTABLE ET SOUPLITUDE DES TYPES (true, 1, 'true', '1') POUR LES BOUTONS D'EXERCICES
    const userPerms = useMemo(() => getUserPermissions(), []);
    
    const canOpenNextEx = userPerms['compta_ex_btn_open_next'] === true || userPerms['compta_ex_btn_open_next'] === 1 || userPerms['compta_ex_btn_open_next'] === 'true' || userPerms['compta_ex_btn_open_next'] === '1';
    const canModifyEx = userPerms['compta_ex_btn_modify'] === true || userPerms['compta_ex_btn_modify'] === 1 || userPerms['compta_ex_btn_modify'] === 'true' || userPerms['compta_ex_btn_modify'] === '1';
    const canDeleteEx = userPerms['compta_ex_btn_delete'] === true || userPerms['compta_ex_btn_delete'] === 1 || userPerms['compta_ex_btn_delete'] === 'true' || userPerms['compta_ex_btn_delete'] === '1';

    const [exercices, setExercices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    
    const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
    const [confirmAction, setConfirmAction] = useState({ show: false, id: null, type: null, message: '', data: null });

    const [formData, setFormData] = useState({
        id: null,
        libelle: `EXERCICE ${new Date().getFullYear()}`,
        date_debut: `${new Date().getFullYear()}-01-01`,
        date_fin: `${new Date().getFullYear()}-12-31`,
        genererRAN: false 
    });

    const showToast = (message, type = 'success') => {
        setToast({ show: true, message, type });
        setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 5000);
    };

    const fetchExercices = useCallback(async () => {
        setLoading(true);
        try {
            const res = await API.get('/plan-comptable/exercices/liste');
            if (res.data.success) {
                const liste = res.data.data;
                setExercices(liste);
                
                const exOuvert = liste.find(ex => ex.statut === 'OUVERT') || liste[0];
                if (exOuvert) {
                    localStorage.setItem('currentExerciceId', exOuvert.id);
                    localStorage.setItem('currentExerciceDates', JSON.stringify({
                        debut: exOuvert.date_debut,
                        fin: exOuvert.date_fin
                    }));
                }
            }
        } catch (err) {
            showToast("Erreur de chargement", "error");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchExercices();

        if (socket && user?.company_id) {
            const room = String(user.company_id);
            socket.emit('join_company', room);
            socket.on('REFRESH_EXERCICES', fetchExercices);
            socket.on('DATA_EVENT', (event) => {
                if (event.table === 'exercises') {
                    console.log("🔄 Mise à jour des exercices détectée via Sync...");
                    fetchExercices();
                }
            });
        }

        return () => {
            if (socket) {
                socket.off('REFRESH_EXERCICES', fetchExercices);
                socket.off('DATA_EVENT');
            }
        };
    }, [user?.company_id, socket, fetchExercices]);

    const startEdit = (ex) => {
        // 🔑 SÉCURITÉ DE SELECTION VISUELLE : Bloquer si la permission de modification est absente
        if (!canModifyEx) {
            return showToast("🛑 ACCÈS REFUSÉ : Privilège de modification d'exercice manquant.", "error");
        }
        setFormData({
            id: ex.id,
            libelle: ex.libelle,
            date_debut: ex.date_debut,
            date_fin: ex.date_fin,
            genererRAN: false
        });
        setIsEditing(true);
        setShowForm(true);
    };

    const resetForm = () => {
        setShowForm(false);
        setIsEditing(false);
        setFormData({
            id: null,
            libelle: `EXERCICE ${new Date().getFullYear()}`,
            date_debut: `${new Date().getFullYear()}-01-01`,
            date_fin: `${new Date().getFullYear()}-12-31`,
            genererRAN: false 
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // 🔑 SÉCURITÉ DOUBLE VÉROU NETWORKING BEFORE API CALL
        if (isEditing && !canModifyEx) {
            return showToast("🛑 ACCÈS REFUSÉ : Action de modification non autorisée.", "error");
        }
        if (!isEditing && !canOpenNextEx) {
            return showToast("🛑 ACCÈS REFUSÉ : Action d'ouverture d'un nouvel exercice non autorisée.", "error");
        }

        const debut = new Date(formData.date_debut);
        const fin = new Date(formData.date_fin);
        const diffMois = (fin.getFullYear() - debut.getFullYear()) * 12 + (fin.getMonth() - debut.getMonth());

        if (diffMois >= 12) {
            showToast("Erreur : La durée d'un exercice ne peut pas dépasser 12 mois.", "error");
            return;
        }

        if (fin <= debut) {
            showToast("Erreur : La date de fin doit être après la date de début.", "error");
            return;
        }

        setActionLoading(true);
        try {
            if (isEditing) {
                await API.put(`/plan-comptable/exercices/${formData.id}`, formData);
                showToast("Exercice mis à jour avec succès.");
            } else {
                await API.post('/plan-comptable/exercices/creer', formData);
                showToast("Nouvel exercice ouvert.");
            }
            resetForm();
            fetchExercices();
        } catch (err) {
            showToast(err.response?.data?.error || "Une erreur est survenue", "error");
        } finally {
            setActionLoading(false);
        }
    };

    const askDelete = (id) => {
        // 🔑 SÉCURITÉ DE SELECTION : Bloquer si la permission de suppression est absente
        if (!canDeleteEx) {
            return showToast("🛑 ACCÈS REFUSÉ : Privilège de suppression d'exercice manquant.", "error");
        }
        setConfirmAction({
            show: true, id, type: 'DELETE',
            message: "Confirmer la suppression ? Cela ne marchera que si l'exercice est vide."
        });
    };

    const askToggleStatus = (ex, nextStatus) => {
        const isDefinitif = nextStatus === 'CLOTURE';
        const msg = isDefinitif 
            ? `Voulez-vous procéder à la CLÔTURE DÉFINITIVE de ${ex.libelle} ? Vous allez être redirigé vers la génération du RAN final.` 
            : `Voulez-vous générer un REPORT À NOUVEAU PROVISOIRE pour ${ex.libelle} ?`;
            
        setConfirmAction({
            show: true, 
            id: ex.id, 
            type: 'GOTO_RAN', 
            data: { 
                statut: nextStatus, 
                libelle: ex.libelle 
            }, 
            message: msg
        });
    };

    // 🚀 NOUVELLE FONCTION : Demander la réouverture
    const askReopen = (ex) => {
        setConfirmAction({
            show: true,
            id: ex.id,
            type: 'STATUS',
            data: 'OUVERT',
            message: `Voulez-vous RÉOUVRIR l'exercice ${ex.libelle} ? Vous pourrez à nouveau modifier les écritures.`
        });
    };

    const processConfirm = async () => {
        const { id, type, data } = confirmAction;
        setConfirmAction({ show: false });

        if (type === 'GOTO_RAN') {
            navigate('/compta/ran', { 
                state: { 
                    exerciceACloturerId: id, 
                    libelleSource: data.libelle,
                    typeCloture: data.statut === 'CLOTURE' ? 'DEFINITIF' : 'PROVISOIRE'
                } 
            });
            return;
        }

        setActionLoading(true);
        try {
            if (type === 'DELETE') {
                const res = await API.delete(`/plan-comptable/exercices/${id}`);
                showToast(res.data.message);
            } else if (type === 'STATUS') {
                await API.put(`/plan-comptable/exercices/statut/${id}`, { statut: data });
                
                // ✅ AJOUT ICI : Si on vient d'ouvrir cet exercice, on le met à jour comme exercice courant
                if (data === 'OUVERT') {
                    localStorage.setItem('currentExerciceId', id);
                }
                
                showToast(`Exercice ${data === 'OUVERT' ? 'réouvert' : 'mis à jour'} avec succès.`);
            }
            fetchExercices();
        } catch (err) {
            showToast(err.response?.data?.error || "Action refusée", "error");
        } finally {
            setActionLoading(false);
        }
    };

    return (
        <div style={layoutStyle}>
            <Sidebar />
            <main style={mainStyle}>
                <header style={headerStyle}>
                    <div style={titleContainer}>
                        <div style={iconBoxStyle}><ShieldCheck size={22} color="white" /></div>
                        <div>
                            <h1 style={titleStyle}>{isEditing ? "MODIFIER L'EXERCICE" : "PÉRIODES COMPTABLES"}</h1>
                            <div style={subtitleStyle}><Calendar size={14} /> Gestion des exercices</div>
                        </div>
                    </div>

                    {/* 🔑 MAPPAGE DYNAMIQUE DU BOUTON PRINCIPAL SANS ATTRIBUT DISABLED POUR EMPECHÉ LE BLOCAGE MUET */}
                    <button 
                        onClick={() => {
                            if (showForm) {
                                resetForm();
                            } else if (!canOpenNextEx) {
                                showToast("🛑 ACCÈS REFUSÉ : Votre profil ne détient pas la permission d'ouvrir un nouvel exercice (N+1).", "error");
                            } else {
                                setShowForm(true);
                            }
                        }} 
                        style={showForm ? btnCancel : {
                            ...btnAdd,
                            background: canOpenNextEx ? '#1e3a8a' : '#cbd5e1',
                            color: canOpenNextEx ? '#ffffff' : '#64748b',
                            cursor: 'pointer'
                        }}
                    >
                        {showForm ? <><X size={18} /> ANNULER</> : <><PlusCircle size={18} /> {canOpenNextEx ? "OUVRIR N+1" : "Accès restreint"}</>}
                    </button>
                </header>

              {showForm && (
    <div style={formWrapper}>
        <form onSubmit={handleSubmit} style={inlineForm}>
            {/* CHAMP DATE DÉBUT */}
            <div style={inputGroup}>
                <label style={labelStyle}>DATE DÉBUT</label>
                <input 
                    type="date" 
                    style={inputStyle} 
                    required 
                    value={formData.date_debut}
                    onChange={(e) => {
                        const dateSaisie = e.target.value; 
                        const debut = new Date(dateSaisie);
                        
                        if (!isNaN(debut.getTime())) {
                            const fin = new Date(debut.getFullYear() + 1, debut.getMonth(), debut.getDate() - 1);
                            const dateFinAuto = fin.toISOString().split('T')[0];
                            const year = dateSaisie.split('-')[0];

                            setFormData({
                                ...formData, 
                                date_debut: dateSaisie, 
                                date_fin: dateFinAuto,
                                libelle: isEditing ? formData.libelle : `EXERCICE ${year}`
                            });
                        }
                    }}
                />
            </div>

            {/* CHAMP DATE FIN (AUTO) */}
            <div style={inputGroup}>
                <label style={labelStyle}>DATE FIN (AUTO)</label>
                <input 
                    type="date" 
                    style={{...inputStyle, backgroundColor: '#f8fafc'}} 
                    required 
                    value={formData.date_fin}
                    onChange={(e) => setFormData({...formData, date_fin: e.target.value})} 
                />
            </div>

            {/* CHAMP LIBELLÉ */}
            <div style={inputGroup}>
                <label style={labelStyle}>LIBELLÉ</label>
                <input 
                    style={inputStyle} 
                    value={formData.libelle} 
                    onChange={(e) => setFormData({...formData, libelle: e.target.value})} 
                />
            </div>

            {!isEditing && (
                <div style={checkGroup}>
                    <input 
                        type="checkbox" 
                        id="ran" 
                        checked={formData.genererRAN} 
                        onChange={(e)=>setFormData({...formData, genererRAN: e.target.checked})} 
                    />
                    <label htmlFor="ran" style={checkLabel}>GÉNÉRER RAN</label>
                </div>
            )}

            <button type="submit" disabled={actionLoading} style={btnSubmit}>
                {actionLoading ? <Loader2 className="animate-spin" /> : (isEditing ? "ENREGISTRER" : "VALIDER")}
            </button>
        </form>
    </div>
)}


        <div style={tableWrapper}>
                    {loading ? (
                        <div style={centerStyle}><Loader2 className="animate-spin" size={40} color="#2563eb" /></div>
                    ) : (
                        <table style={tableStyle}>
                            <thead>
                                <tr>
                                    <th style={thStyle}>EXERCICE</th>
                                    <th style={thStyle}>PÉRIODE</th>
                                    <th style={thStyle}>STATUT</th>
                                    <th style={thStyle}>ACTIONS DE CLÔTURE</th>
                                    <th style={thStyle}>MODIF / SUPPR</th>
                                </tr>
                            </thead>
                            <tbody>
                                {exercices.map(ex => {
                                    // Vérification si l'utilisateur possède au moins un droit sur les actions unitaires de la ligne
                                    const hasRowAccess = canModifyEx || canDeleteEx;

                                    return (
                                        <tr key={ex.id} style={trStyle}>
                                            <td style={tdStyle}><strong>{ex.libelle}</strong></td>
                                            <td style={tdStyle}>{ex.date_debut} ⮕ {ex.date_fin}</td>
                                            <td style={tdStyle}><span style={badgeStyle(ex.statut)}>{ex.statut}</span></td>
                                            <td style={tdStyle}>
                                                <div style={{display:'flex', gap:'10px'}}>
                                                    {/* 🚀 BOUTON RÉOUVRIR : Uniquement en PRE_CLOTURE */}
                                                    {ex.statut === 'PRE_CLOTURE' && (
                                                        <button onClick={() => askReopen(ex)} style={btnStatusReopen}>
                                                            <Unlock size={14} /> RÉOUVRIR
                                                        </button>
                                                    )}

                                                    {ex.statut === 'OUVERT' && (
                                                        <button onClick={() => askToggleStatus(ex, 'PRE_CLOTURE')} style={btnStatusProv}>
                                                            PROVISOIRE
                                                        </button>
                                                    )}
                                                    {ex.statut !== 'CLOTURE' && (
                                                        <button onClick={() => askToggleStatus(ex, 'CLOTURE')} style={btnStatusDef}>
                                                            DÉFINITIVE
                                                        </button>
                                                    )}
                                                    {ex.statut === 'CLOTURE' && (
                                                        <span style={textLocked}><Lock size={14}/> SCELLÉ</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td style={tdStyle}>
                                                <div style={{display:'flex', gap:'12px', alignItems: 'center'}}>
                                                    
                                                    {/* 🔑 MAPPAGE DU BOUTON MODIFIER : Masqué si non autorisé */}
                                                    {canModifyEx && (
                                                        <button onClick={() => startEdit(ex)} style={btnEdit} title="Modifier l'exercice">
                                                            <Edit3 size={18} />
                                                        </button>
                                                    )}

                                                    {/* 🔑 MAPPAGE DU BOUTON SUPPRIMER : Masqué si non autorisé */}
                                                    {canDeleteEx && (
                                                        <button onClick={() => askDelete(ex.id)} style={btnDelete} title="Supprimer définitivement">
                                                            <Trash2 size={18} />
                                                        </button>
                                                    )}

                                                    {/* 🔒 SÉCURITÉ INFORMATIVE VISUELLE : S'affiche si aucun droit n'est accordé à l'utilisateur */}
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
                    )}
                </div>

                {confirmAction.show && (
                    <div style={confirmToastStyle}>
                        <div style={{display:'flex', alignItems:'center', gap:'12px', flex: 1}}>
                            <div style={warnIcon}><AlertTriangle size={20} color="white"/></div>
                            <span style={confirmText}>{confirmAction.message}</span>
                        </div>
                        <div style={{display:'flex', gap:'10px'}}>
                            <button onClick={()=>setConfirmAction({show:false})} style={btnToastCancel}>ANNULER</button>
                            <button onClick={processConfirm} style={btnToastConfirm}>CONFIRMER</button>
                        </div>
                    </div>
                )}

                {toast.show && (
                    <div style={{...toastStyle, background: toast.type === 'success' ? '#0f172a' : '#dc2626'}}>
                        {toast.type === 'success' ? <CheckCircle2 size={18} color="#10b981" /> : <AlertTriangle size={18} color="white" />}
                        {toast.message}
                    </div>
                )}
            </main>
        </div>
    );
};

// --- STYLES ---

const layoutStyle = { display: 'flex', height: '100vh', background: '#f8fafc', overflow: 'hidden' };
const mainStyle = { flex: 1, display: 'flex', flexDirection: 'column' };
const headerStyle = { background: 'white', padding: '20px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0' };
const titleContainer = { display: 'flex', alignItems: 'center', gap: '15px' };
const titleStyle = { margin: 0, fontSize: '18px', fontWeight: '900', color: '#0f172a' };
const subtitleStyle = { fontSize: '12px', color: '#64748b', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '5px' };
const iconBoxStyle = { background: '#2563eb', padding: '10px', borderRadius: '12px' };
const tableWrapper = { padding: '20px 40px', flex: 1, overflowY: 'auto' };
const tableStyle = { width: '100%', borderCollapse: 'separate', borderSpacing: '0 10px' };
const thStyle = { textAlign: 'left', padding: '10px', fontSize: '11px', color: '#64748b', fontWeight: '800', textTransform: 'uppercase' };
const trStyle = { background: 'white', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' };
const tdStyle = { padding: '15px 10px', borderTop: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9', fontSize: '13px' };
const btnEdit = { background: '#fefce8', border: 'none', color: '#a16207', padding: '8px', borderRadius: '8px', cursor: 'pointer' };
const btnDelete = { background: '#fef2f2', border: 'none', color: '#dc2626', padding: '8px', borderRadius: '8px', cursor: 'pointer' };
const btnStatusProv = { background: '#fffbeb', color: '#d97706', border: '1px solid #fef3c7', padding: '6px 15px', borderRadius: '8px', fontWeight: '800', fontSize: '11px', cursor: 'pointer' };
const btnStatusDef = { background: '#0f172a', color: 'white', border: 'none', padding: '7px 15px', borderRadius: '8px', fontWeight: '800', fontSize: '11px', cursor: 'pointer' };

// 🚀 STYLE DU BOUTON RÉOUVRIR
const btnStatusReopen = { 
    background: '#ecfdf5', 
    color: '#059669', 
    border: '1px solid #d1fae5', 
    padding: '6px 15px', 
    borderRadius: '8px', 
    fontWeight: '800', 
    fontSize: '11px', 
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '5px'
};

const badgeStyle = (s) => ({
    background: s === 'OUVERT' ? '#dcfce7' : s === 'PRE_CLOTURE' ? '#fef3c7' : '#f1f5f9',
    color: s === 'OUVERT' ? '#166534' : s === 'PRE_CLOTURE' ? '#92400e' : '#475569',
    padding: '4px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: '900'
});
const confirmToastStyle = { position: 'fixed', bottom: '30px', left: '50%', transform: 'translateX(-50%)', background: 'white', padding: '15px 25px', borderRadius: '20px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', minWidth: '500px', zIndex: 9999, border: '2px solid #e2e8f0' };
const warnIcon = { background: '#f59e0b', padding: '8px', borderRadius: '12px' };
const confirmText = { fontWeight: '800', color: '#0f172a', fontSize: '13px' };
const btnToastConfirm = { background: '#0f172a', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '12px', fontWeight: '800', cursor: 'pointer' };
const btnToastCancel = { background: '#f1f5f9', color: '#64748b', border: 'none', padding: '10px 20px', borderRadius: '12px', fontWeight: '800', cursor: 'pointer' };
const btnAdd = { background: '#0f172a', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '10px', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' };
const btnCancel = { ...btnAdd, background: '#fee2e2', color: '#dc2626' };
const formWrapper = { background: 'white', padding: '15px 40px', borderBottom: '1px solid #e2e8f0' };
const inlineForm = { display: 'flex', alignItems: 'flex-end', gap: '20px' };
const inputGroup = { display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 };
const labelStyle = { fontSize: '10px', fontWeight: '900', color: '#64748b' };
const inputStyle = { padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontWeight: '700', fontSize: '13px', width: '100%' };
const checkGroup = { display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '10px' };
const checkLabel = { fontSize: '11px', fontWeight: '800', color: '#2563eb' };
const btnSubmit = { background: '#2563eb', color: 'white', border: 'none', padding: '11px 25px', borderRadius: '10px', fontWeight: '800', cursor: 'pointer' };
const textLocked = { color: '#94a3b8', fontSize: '12px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' };
const toastStyle = { position: 'fixed', top: '20px', right: '20px', padding: '15px 30px', borderRadius: '12px', color: 'white', display: 'flex', alignItems: 'center', gap: '12px', zIndex: 9999, fontWeight: '700' };
const centerStyle = { display: 'flex', justifyContent: 'center', padding: '100px' };

export default ExerciceComptable;