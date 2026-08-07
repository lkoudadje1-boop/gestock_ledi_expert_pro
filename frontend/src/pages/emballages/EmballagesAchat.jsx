import React, { useState, useEffect, useMemo } from 'react';
import { Edit2, Trash2, Archive, Save } from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import API from '../../services/api';
import { getUserPermissions } from '../../utils/permissions_utils'; // 🔑 IMPORTATION DU SÉCURISEUR
import '../Dashboard.css';

const EmballagesAchat = () => {
    // 🔑 EXTRACTION COMPTABLE ET SOUPLITUDE DES TYPES (true, 1, 'true', '1') POUR TES 3 BOUTONS
    const userPerms = useMemo(() => getUserPermissions(), []);
    
    const canModifyEmb = userPerms['emb_btn_modify'] === true || userPerms['emb_btn_modify'] === 1 || userPerms['emb_btn_modify'] === 'true' || userPerms['emb_btn_modify'] === '1';
    const canArchiveEmb = userPerms['emb_btn_archive'] === true || userPerms['emb_btn_archive'] === 1 || userPerms['emb_btn_archive'] === 'true' || userPerms['emb_btn_archive'] === '1';
    const canDeleteEmb = userPerms['emb_btn_delete'] === true || userPerms['emb_btn_delete'] === 1 || userPerms['emb_btn_delete'] === 'true' || userPerms['emb_btn_delete'] === '1';

    const [packagings, setPackagings] = useState([]);
    const [achats, setAchats] = useState([]);
    const [fournisseurs, setFournisseurs] = useState([]);
    const [view, setView] = useState('ACTIVE');
    
    const [selectedItem, setSelectedItem] = useState(null);
    const [editingAchat, setEditingAchat] = useState(null);
    const [formData, setFormData] = useState({ 
        supplier_id: '', 
        quantite: '', 
        montant_facture: '', 
        facture_ref: '' 
    });

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        try {
            const [resP, resA, resS] = await Promise.all([
                API.get('/emballages'),
                API.get('/achats-emballages'),
                API.get('/suppliers')
            ]);
            setPackagings(resP.data);
            setAchats(resA.data);
            setFournisseurs(resS.data);
        } catch (err) { console.error("Erreur chargement", err); }
    };

    const handleAction = async (id, action) => {
        // 🔑 SÉCURITÉ GRANULAIRE DES BOUTONS DE TRAITEMENT (ARCHIVE VS SUPPRESSION DEFINITIVE)
        if (action === 'ARCHIVE' && !canArchiveEmb) {
            return alert("🛑 ACCÈS REFUSÉ : Votre profil ne détient pas le privilège d'archivage.");
        }
        if (action === 'DELETE' && !canDeleteEmb) {
            return alert("🛑 ACCÈS REFUSÉ : Votre profil ne détient pas le privilège de suppression définitive.");
        }

        if (!window.confirm(`Confirmer l'action : ${action} ?`)) return;
        try {
            await API.post(`/achats-emballages/${id}/action`, { action });
            loadData();
        } catch (err) { alert("Erreur lors de l'exécution de l'action"); }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // 🔑 SÉCURITÉ DE POSTE INTERNE : Interdire la validation si le droit de modification/création est manquant
        if (editingAchat && !canModifyEmb) {
            return alert("🛑 ACCÈS REFUSÉ : Action de modification non autorisée pour votre profil.");
        }
        if (!editingAchat && !canModifyEmb) {
            // Si tu considères la création liée à l'achat d'emballage sous le même interrupteur ou emb_create :
            return alert("🛑 ACCÈS REFUSÉ : Action d'enregistrement non autorisée pour votre profil.");
        }

        try {
            const payload = { 
                ...formData, 
                packaging_id: selectedItem.id,
                montant_total: Number(formData.montant_facture)
            };
            
            if (editingAchat) {
                await API.put(`/achats-emballages/${editingAchat.id}`, payload);
            } else {
                await API.post('/achats-emballages', payload);
            }
            setFormData({ supplier_id: '', quantite: '', montant_facture: '', facture_ref: '' });
            setSelectedItem(null);
            setEditingAchat(null);
            loadData();
        } catch (err) { alert("Erreur lors de l'enregistrement"); }
    };

    const startEdit = (achat) => {
        // 🔑 SÉCURITÉ AVANT MODIFICATION VISUELLE
        if (!canModifyEmb) {
            return alert("🛑 ACCÈS REFUSÉ : Privilège de modification manquant.");
        }
        setEditingAchat(achat);
        setSelectedItem(packagings.find(p => p.id === achat.packaging_id));
        setFormData({ 
            supplier_id: achat.supplier_id, 
            quantite: achat.quantite, 
            montant_facture: achat.montant_total,
            facture_ref: achat.facture_ref 
        });
    };

    const filteredAchats = achats.filter(a => view === 'ACTIVE' ? a.is_active === 1 : a.is_archive === 1);

    return (
        <div style={{ display: 'flex', height: '100vh', background: '#f1f5f9' }}>
            <Sidebar />
            <main style={{ flex: 1, padding: '25px 40px', overflowY: 'auto' }}>
                <h1 style={{ fontSize: '22px', fontWeight: '900', color: '#0f172a', marginBottom: '20px' }}>GESTION DES ACHATS EMBALLAGES</h1>

                <div style={{ display: 'flex', gap: '20px', marginBottom: '20px', height: '400px' }}>
                    <div style={containerStyle}>
                        <div style={{ padding: '15px', borderBottom: '1px solid #e2e8f0', fontWeight: '800' }}>Sélectionner un article</div>
                        <div style={{ overflowY: 'auto', height: '340px' }}>
                            {packagings.map(item => (
                                <div key={item.id} onClick={() => {setSelectedItem(item); setEditingAchat(null);}} style={{ padding: '12px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', background: selectedItem?.id === item.id ? '#eff6ff' : 'white' }}>
                                    <div style={{ fontWeight: '700' }}>{item.nom}</div>
                                    <div style={{ fontSize: '12px', color: '#64748b' }}>Stock: {item.stock_actuel || 0}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div style={containerStyle}>
                        <div style={{ padding: '15px', borderBottom: '1px solid #e2e8f0', fontWeight: '800' }}>
                            {editingAchat ? 'Modifier Achat' : selectedItem ? `Achat : ${selectedItem.nom}` : 'Sélectionnez un article'}
                        </div>
                        {(selectedItem || editingAchat) && (
                            <form onSubmit={handleSubmit} style={{ padding: '20px' }}>
                                <select style={selectInputStyle} required value={formData.supplier_id} onChange={e => setFormData({...formData, supplier_id: e.target.value})}>
                                    <option value="">Choisir un fournisseur</option>
                                    {fournisseurs.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
                                </select>
                                <input type="number" placeholder="Quantité" style={inputStyle} value={formData.quantite} onChange={e => setFormData({...formData, quantite: e.target.value})} />
                                <input type="number" placeholder="Montant Total Facture" style={inputStyle} value={formData.montant_facture} onChange={e => setFormData({...formData, montant_facture: e.target.value})} />
                                <input type="text" placeholder="Réf Facture" style={inputStyle} value={formData.facture_ref} onChange={e => setFormData({...formData, facture_ref: e.target.value})} />
                                <button type="submit" style={btnSubmitStyle}>{editingAchat ? <Save size={18}/> : 'Valider'}</button>
                            </form>
                        )}
                    </div>
                </div>


<div style={containerStyle}>
                    <div style={{ padding: '15px', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '20px' }}>
                        <button onClick={() => setView('ACTIVE')} style={{ fontWeight: view === 'ACTIVE' ? 'bold' : 'normal', border: 'none', background: 'none', cursor: 'pointer' }}>Actifs</button>
                        <button onClick={() => setView('ARCHIVED')} style={{ fontWeight: view === 'ARCHIVED' ? 'bold' : 'normal', border: 'none', background: 'none', cursor: 'pointer' }}>Archivés</button>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: '#1e3a8a' }}>
                                <th style={thHeaderStyle}>Date</th>
                                <th style={thHeaderStyle}>Article</th>
                                <th style={thHeaderStyle}>Qté</th>
                                <th style={thHeaderStyle}>Montant Facture</th>
                                <th style={thHeaderStyle}>CMP</th>
                                <th style={thHeaderStyle}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredAchats.length === 0 ? (
                                <tr>
                                    <td colSpan="6" style={{ textAlign: 'center', padding: '30px', color: '#64748b', fontStyle: 'italic', fontSize: '13px' }}>
                                        Aucun enregistrement d'achat trouvé...
                                    </td>
                                </tr>
                            ) : (
                                filteredAchats.map(a => (
                                    <tr key={a.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={tdStyle}>{new Date(a.created_at).toLocaleDateString()}</td>
                                        <td style={tdStyle}>{a.emballage_nom}</td>
                                        <td style={tdStyle}>{a.quantite}</td>
                                        <td style={tdStyle}>{Number(a.montant_total).toLocaleString()} F</td>
                                        <td style={{...tdStyle, fontWeight: 'bold', color: '#1e3a8a'}}>{a.cmp_actuel ? `${Number(a.cmp_actuel).toFixed(2)} F` : '-'}</td>
                                        <td style={tdStyle}>
                                            <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                                                
                                                {/* 🔑 MAPPAGE DU BOUTON MODIFIER : Affiché uniquement si autorisé */}
                                                {canModifyEmb && (
                                                    <Edit2 
                                                        size={16} 
                                                        onClick={() => startEdit(a)} 
                                                        style={{ cursor: 'pointer', color: '#2563eb' }} 
                                                        title="Modifier l'achat"
                                                    />
                                                )}

                                                {/* 🔑 MAPPAGE DU BOUTON SUPPRIMER DÉFINITIVEMENT : Affiché uniquement si autorisé */}
                                                {canDeleteEmb && (
                                                    <Trash2 
                                                        size={16} 
                                                        onClick={() => handleAction(a.id, 'DELETE')} 
                                                        style={{ cursor: 'pointer', color: '#dc2626' }} 
                                                        title="Supprimer définitivement"
                                                    />
                                                )}

                                                {/* 🔑 MAPPAGE DU BOUTON ARCHIVER : Affiché uniquement si autorisé */}
                                                {canArchiveEmb && (
                                                    <Archive 
                                                        size={16} 
                                                        onClick={() => handleAction(a.id, 'ARCHIVE')} 
                                                        style={{ cursor: 'pointer', color: '#64748b' }} 
                                                        title="Archiver l'enregistrement"
                                                    />
                                                )}

                                                {/* 🔒 SÉCURITÉ INFORMATIVE : Affiché si aucun droit n'est accordé */}
                                                {!canModifyEmb && !canDeleteEmb && !canArchiveEmb && (
                                                    <span style={{ fontSize: '12px', color: '#64748b', fontStyle: 'italic', fontWeight: '500' }}>
                                                        Accès restreint
                                                    </span>
                                                )}

                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </main>
        </div>
    );
};


const containerStyle = { background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', flex: 1, overflow: 'hidden' };
const inputStyle = { width: '100%', padding: '11px', borderRadius: '8px', border: '1px solid #cbd5e1', marginTop: '10px' };
const selectInputStyle = { width: '100%', padding: '11px', borderRadius: '8px', border: '1px solid #cbd5e1', marginTop: '10px', background: 'white' };
const btnSubmitStyle = { width: '100%', padding: '12px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', marginTop: '20px', cursor: 'pointer', fontWeight: '700' };
const thHeaderStyle = { padding: '12px', textAlign: 'left', fontSize: '11px', color: '#ffffff', textTransform: 'uppercase' };
const tdStyle = { padding: '12px', fontSize: '13px' };

export default EmballagesAchat;
