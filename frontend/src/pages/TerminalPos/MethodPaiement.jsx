import React, { useState, useEffect } from 'react';
import { 
    Loader2, PlusCircle, X, CreditCard, Trash2, Edit,
    CheckCircle, AlertTriangle, Link as LinkIcon, Settings,
    Wallet, Smartphone, Banknote, Landmark, Coins, Monitor,
    HandCoins, Receipt, Building2, QrCode, Ticket, CircleEllipsis,
    ArrowRightLeft, PiggyBank, Briefcase, Bitcoin
} from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import API, { socket } from '../../services/api';

// ✅ 1. DICTIONNAIRE COMPLET (Assure le lien entre String et Composant)
const IconComponents = {
    wallet: <Wallet size={16} />,
    crypto: <Bitcoin size={16} />,
    smartphone: <Smartphone size={16} />,
    card: <CreditCard size={16} />,
    banknote: <Banknote size={16} />,
    landmark: <Landmark size={16} />,
    coins: <Coins size={16} />,
    hand: <HandCoins size={16} />,
    receipt: <Receipt size={16} />,
    building: <Building2 size={16} />,
    qr: <QrCode size={16} />,
    ticket: <Ticket size={16} />,
    transfer: <ArrowRightLeft size={16} />,
    piggy: <PiggyBank size={16} />,
    business: <Briefcase size={16} />,
    other: <CircleEllipsis size={16} />
};

const MethodPaiement = () => {
    const [methods, setMethods] = useState([]);
    const [comptesPlan, setComptesPlan] = useState([]);
    const [journaux, setJournaux] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [toast, setToast] = useState({ show: false, message: '', type: 'success', action: null });

    // ✅ 2. LISTE DES OPTIONS POUR LE SELECT
    const availableIcons = [
        { id: '', label: '--- AUCUNE ICÔNE ---' },
        { id: 'wallet', label: 'Espèces (Portefeuille)' },
        { id: 'crypto', label: 'Crypto-monnaie (Bitcoin/USDT)' },
        { id: 'smartphone', label: 'Mobile Money (Momo/Orange)' },
        { id: 'card', label: 'Carte Bancaire' },
        { id: 'banknote', label: 'Billets / Cash' },
        { id: 'landmark', label: 'Banque / Virement' },
        { id: 'receipt', label: 'Chèque / Reçu' },
        { id: 'coins', label: 'Pièces de monnaie' },
        { id: 'hand', label: 'Main à main / Manuel' },
        { id: 'qr', label: 'Paiement QR Code' },
        { id: 'transfer', label: 'Transfert de fonds' },
        { id: 'piggy', label: 'Épargne / Tirelire' },
        { id: 'ticket', label: 'Ticket / Bon / Voucher' },
        { id: 'business', label: 'Affaires / Business' },
        { id: 'other', label: 'Autre icône' },

    ];

    const initialFormData = {
        id: '',
        code: '',
        libelle: '',
        compte_comptable_id: '',
        journal_id: '',
        is_active: 1,
        is_pos: 1,
        icone_name: '' 
    };

    const [formData, setFormData] = useState(initialFormData);

    const showToast = (message, type = 'success', action = null) => {
        setToast({ show: true, message, type, action });
        if (!action) {
            setTimeout(() => setToast({ show: false, message: '', type: 'success', action: null }), 4000);
        }
    };

    const fetchInitialData = async () => {
        setLoading(true);
        try {
            const [resM, resP, resJ] = await Promise.all([
                API.get('/plan-comptable/paiements/methodes'),
                API.get('/plan-comptable/liste'),
                API.get('/plan-comptable/journaux/liste')
            ]);
            setMethods(resM.data.data || []);
            setComptesPlan(resP.data.data || []);
            setJournaux(resJ.data.data?.filter(j => ['TRESORERIE', 'BANQUE', 'CAISSE'].includes(j.type_journal)) || []);
        } catch (err) {
            showToast("Erreur lors du chargement des données", "error");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchInitialData();
        if (socket) {
            const userStored = JSON.parse(localStorage.getItem('user') || '{}');
            const companyId = userStored.company_id || userStored.companyId;
            if (companyId) socket.emit('join_company', String(companyId));
            socket.on('DATA_EVENT', (event) => {
                if (event.table === 'payment_methods') fetchInitialData();
            });
            return () => socket.off('DATA_EVENT');
        }
    }, []);

   const handleJournalChange = (journalId) => {
        if (!journalId) {
            setFormData({ ...formData, journal_id: '', compte_comptable_id: '' });
            return;
        }
        const selectedJournal = journaux.find(j => j.id === journalId);
        if (selectedJournal && selectedJournal.compte_contrepartie_id) {
            setFormData({
                ...formData,
                journal_id: journalId,
                compte_comptable_id: selectedJournal.compte_contrepartie_id
            });
        } else {
            setFormData({ ...formData, journal_id: journalId });
        }
    };

    const handleCompteChange = (compteId) => {
        if (!compteId) {
            setFormData({ ...formData, compte_comptable_id: '' });
            return;
        }
        const selectedCompte = comptesPlan.find(c => c.id === compteId);
        if (selectedCompte && !selectedCompte.numero_compte.toString().startsWith('5')) {
            showToast("Comptes de classe 5 uniquement.", "error");
            setFormData({ ...formData, compte_comptable_id: '' });
            return;
        }
        setFormData({ ...formData, compte_comptable_id: compteId });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            if (isEditing) {
                await API.put(`/plan-comptable/paiements/modifier/${formData.id}`, formData);
                showToast("Mise à jour réussie !");
            } else {
                await API.post('/plan-comptable/paiements/creer', formData);
                showToast("Enregistrement réussi !");
            }
            setShowForm(false);
            setIsEditing(false);
            fetchInitialData();
            setFormData(initialFormData);
        } catch (err) {
            showToast(err.response?.data?.error || "Erreur serveur", "error");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = (id) => {
        const confirmDelete = async () => {
            setToast({ ...toast, show: false });
            try {
                await API.delete(`/plan-comptable/paiements/supprimer/${id}`);
                showToast("Supprimé.");
                fetchInitialData();
            } catch (err) { showToast("Action impossible", "error"); }
        };
        showToast("Confirmer la suppression ?", "warning", confirmDelete);
    };

    const handleEdit = (m) => {
        setFormData({ ...m });
        setIsEditing(true);
        setShowForm(true);
    };

    // ✅ 3. FONCTION DE RENDU DYNAMIQUE CORRIGÉE
    const renderTableIcon = (iconName) => {
        if (!iconName) return null; // Retourne vide si pas d'icône
        return IconComponents[iconName] || null; // Retourne l'icône du dictionnaire ou rien
    };

    return (
        <div style={layoutStyle}>
            <Sidebar />
            <main style={mainStyle}>
                <header style={headerStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div style={iconBox}><CreditCard size={24} color="white" /></div>
                        <div>
                            <h1 style={titleStyle}>MOYENS DE PAIEMENT</h1>
                            <span style={subtitleStyle}>Gestion des encaissements et terminaux POS</span>
                        </div>
                    </div>
                    {!showForm && (
                        <button onClick={() => { setFormData(initialFormData); setIsEditing(false); setShowForm(true); }} style={btnPrimary}>
                            <PlusCircle size={18} /> NOUVEAU
                        </button>
                    )}
                </header>

                {showForm && (
                    <div style={inlineFormContainer}>
                        <form onSubmit={handleSubmit} style={inlineForm}>
                            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'15px'}}>
                                <h2 style={{margin:0, fontSize:'14px', fontWeight:900, color:'#2563eb'}}>
                                    {isEditing ? `EDITION : ${formData.code}` : "NOUVELLE MÉTHODE"}
                                </h2>
                                <button type="button" onClick={() => {setShowForm(false); setIsEditing(false);}} style={btnSmallCancel}><X size={16}/></button>
                            </div>
                            
                            <div style={{...formRow, marginBottom: '15px'}}>
                                <div style={{width:'100px'}}>
                                    <label style={label}>CODE</label>
                                    <input required style={input} value={formData.code} onChange={e => setFormData({...formData, code: e.target.value.toUpperCase().trim()})} />
                                </div>
                                <div style={{flex:1}}>
                                    <label style={label}>LIBELLÉ</label>
                                    <input required style={input} value={formData.libelle} onChange={e => setFormData({...formData, libelle: e.target.value.toUpperCase()})} />
                                </div>
                                {/* ✅ MODIFICATION : JOURNAL (Retrait de required) */}
                                <div style={{flex:1}}>
                                    <label style={label}>JOURNAL (OPTIONNEL)</label>
                                    <select style={input} value={formData.journal_id} onChange={e => handleJournalChange(e.target.value)}>
                                        <option value="">-- NON DÉFINI --</option>
                                        {journaux.map(j => <option key={j.id} value={j.id}>{j.code} - {j.libelle}</option>)}
                                    </select>
                                </div>

                                {/* ✅ MODIFICATION : COMPTE (Retrait de required) */}
                                <div style={{flex:1.5}}>
                                    <label style={label}>COMPTE COMPTABLE (OPTIONNEL)</label>
                                    <select style={input} value={formData.compte_comptable_id} onChange={e => handleCompteChange(e.target.value)}>
                                        <option value="">-- NON DÉFINI --</option>
                                        {comptesPlan.filter(c => c.numero_compte.toString().startsWith('5')).map(c => (
                                            <option key={c.id} value={c.id}>{c.numero_compte} - {c.intitule}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div style={{...formRow, background: '#e2e8f0', padding: '10px', borderRadius: '8px', alignItems: 'center'}}>
                                <div style={{display: 'flex', alignItems: 'center', gap: '10px', flex: 1}}>
                                    <input 
                                        type="checkbox" 
                                        id="is_pos"
                                        checked={formData.is_pos === 1}
                                        onChange={e => setFormData({...formData, is_pos: e.target.checked ? 1 : 0})}
                                        style={{width: '18px', height: '18px', cursor: 'pointer'}}
                                    />
                                    <label htmlFor="is_pos" style={{fontSize: '12px', fontWeight: '800', cursor: 'pointer', color: '#1e293b'}}>
                                        AFFICHER SUR LE TERMINAL DE VENTE (POS)
                                    </label>
                                </div>

                                <div style={{flex: 1, display: 'flex', alignItems: 'center', gap: '10px'}}>
                                    <label style={{...label, marginBottom: 0}}>ICÔNE :</label>
                                    <select 
                                        style={{...input, width: 'auto', flex: 1}} 
                                        value={formData.icone_name} 
                                        onChange={e => setFormData({...formData, icone_name: e.target.value})}
                                    >
                                        {availableIcons.map(icon => (
                                            <option key={icon.id} value={icon.id}>{icon.label}</option>
                                        ))}
                                    </select>
                                    {/* ✅ APERÇU DYNAMIQUE DANS LE FORMULAIRE */}
                                    <div style={{background: '#fff', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', minWidth:'34px', minHeight:'34px', display:'flex', alignItems:'center', justifyContent:'center'}}>
                                        {IconComponents[formData.icone_name] || null}
                                    </div>
                                </div>

                                <button type="submit" disabled={isSubmitting} style={{...btnSubmitInline, marginLeft: '10px'}}>
                                    {isSubmitting ? <Loader2 className="animate-spin" size={16}/> : <CheckCircle size={16}/>} 
                                    <span style={{marginLeft: '8px'}}>ENREGISTRER</span>
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                <div style={contentStyle}>
                    {loading ? ( <div style={center}><Loader2 className="animate-spin" size={40} color="#2563eb" /></div> ) : (
                        <div style={tableWrapper}>
                            <table style={tableStyle}>
                                <thead>
                                    <tr>
                                        <th style={thStyle}>Code</th>
                                        <th style={{...thStyle, textAlign:'center'}}>Icône</th>
                                        <th style={thStyle}>Libellé</th>
                                        <th style={thStyle}>Compte</th>
                                        <th style={thStyle}>Journal</th>
                                        <th style={{...thStyle, textAlign:'center'}}>POS</th>
                                        <th style={{...thStyle, textAlign:'center'}}>Actif</th>
                                        <th style={thStyle}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {methods.map(m => (
                                        <tr key={m.id} style={trStyle}>
                                            <td style={tdStyle}><span style={badgeCode}>{m.code}</span></td>
                                            {/* ✅ AFFICHAGE DYNAMIQUE DANS LE TABLEAU */}
                                            <td style={{...tdStyle, textAlign:'center', color:'#2563eb'}}>
                                                {renderTableIcon(m.icone_name)}
                                            </td>
                                            <td style={{...tdStyle, fontWeight:700}}>{m.libelle}</td>
                                            <td style={tdStyle}><div style={badgeAccount}><LinkIcon size={12}/> {m.num_compte}</div></td>
                                            <td style={tdStyle}><div style={badgeJournal}><Settings size={12}/> {m.journal_code}</div></td>
                                            <td style={{...tdStyle, textAlign:'center'}}>
                                                {m.is_pos ? <Monitor size={16} color="#3b82f6" /> : <Monitor size={16} color="#cbd5e1" opacity={0.3}/>}
                                            </td>
                                            <td style={{...tdStyle, textAlign:'center'}}>
                                                {m.is_active ? <CheckCircle size={16} color="#10b981"/> : <X size={16} color="#ef4444"/>}
                                            </td>
                                            <td style={tdStyle}>
                                                <div style={{display:'flex', gap:'15px'}}>
                                                    <Edit size={16} color="#3b82f6" cursor="pointer" onClick={() => handleEdit(m)} />
                                                    <Trash2 size={16} color="#ef4444" cursor="pointer" onClick={() => handleDelete(m.id)} />
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </main>

            {toast.show && (
                <div style={{ ...toastStyle, background: toast.type === 'warning' ? '#f59e0b' : (toast.type === 'error' ? '#ef4444' : '#0f172a') }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            {toast.type === 'warning' && <AlertTriangle size={18} />}
                            <span style={{fontSize:'12px'}}>{toast.message}</span>
                        </div>
                        {toast.action && (
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                <button onClick={() => setToast({ ...toast, show: false })} style={btnToastSecondary}>ANNULER</button>
                                <button onClick={toast.action} style={btnToastPrimary}>CONFIRMER</button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

// --- STYLES (Identiques pour la cohérence visuelle) ---
const layoutStyle = { display: 'flex', height: '100vh', background: '#f8fafc', overflow: 'hidden' };
const mainStyle = { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' };
const headerStyle = { background: 'white', padding: '15px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0' };
const iconBox = { background: '#2563eb', padding: '10px', borderRadius: '10px' };
const titleStyle = { margin: 0, fontSize: '18px', fontWeight: '900', color: '#0f172a' };
const subtitleStyle = { fontSize: '11px', color: '#64748b', fontWeight: '700' };
const btnPrimary = { background: '#2563eb', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '10px', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize:'13px' };
const inlineFormContainer = { background: 'white', borderBottom: '1px solid #e2e8f0', padding: '15px 40px' };
const inlineForm = { background: '#f1f5f9', padding: '15px', borderRadius: '12px', border: '1px solid #cbd5e1' };
const formRow = { display: 'flex', gap: '15px', alignItems: 'flex-start' };
const contentStyle = { padding: '20px 40px', flex: 1, overflowY: 'auto' };
const tableWrapper = { background: 'white', borderRadius: '15px', border: '1px solid #e2e8f0', overflow: 'hidden' };
const tableStyle = { width: '100%', borderCollapse: 'collapse' };
const thStyle = { background: '#f8fafc', padding: '12px 15px', textAlign: 'left', fontSize: '11px', fontWeight: 900, color: '#64748b', borderBottom: '1px solid #e2e8f0' };
const trStyle = { borderBottom: '1px solid #f1f5f9' };
const tdStyle = { padding: '12px 15px', fontSize: '13px', color: '#475569' };
const badgeCode = { background: '#0f172a', color: 'white', padding: '3px 7px', borderRadius: '6px', fontWeight: 900, fontSize: '10px' };
const badgeAccount = { background: '#ecfdf5', color: '#047857', padding: '4px 8px', borderRadius: '6px', fontWeight: 800, fontSize: '10px', display:'inline-flex', alignItems:'center', gap:'5px' };
const badgeJournal = { background: '#eff6ff', color: '#1e40af', padding: '4px 8px', borderRadius: '6px', fontWeight: 800, fontSize: '10px', display:'inline-flex', alignItems:'center', gap:'5px' };
const label = { fontSize: '10px', fontWeight: '900', color: '#64748b', display: 'block', marginBottom: '5px' };
const input = { width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontWeight: '700', outline: 'none', fontSize:'13px' };
const btnSubmitInline = { background: '#2563eb', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '8px', cursor: 'pointer', display:'flex', alignItems:'center', fontWeight: '900', fontSize: '11px' };
const btnSmallCancel = { background: '#fee2e2', color: '#dc2626', border: 'none', padding: '3px', borderRadius: '6px', cursor: 'pointer' };
const toastStyle = { position: 'fixed', bottom: '30px', left: '50%', transform: 'translateX(-50%)', padding: '15px 25px', borderRadius: '12px', color: 'white', fontWeight: '800', zIndex: 9999, minWidth: '320px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' };
const btnToastPrimary = { background: 'white', color: '#f59e0b', border: 'none', padding: '5px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: '900', cursor: 'pointer' };
const btnToastSecondary = { background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none', padding: '5px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: '900', cursor: 'pointer' };
const center = { display: 'flex', justifyContent: 'center', padding: '100px' };

export default MethodPaiement;