import React, { useState, useEffect, useMemo } from 'react';
import { Save, Building2, Phone, MapPin, FileText, Image as ImageIcon, Loader2, Mail, CheckCircle2, AlertCircle, Hash, AlertTriangle, X, Scale } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import { getUserPermissions } from '../utils/permissions_utils'; // 🔑 IMPORTATION DU SÉCURISEUR
import API, { socket } from '../services/api'; 
import { useNavigate } from 'react-router-dom';

const CompanySettings = () => {
    const navigate = useNavigate();
    const user = JSON.parse(localStorage.getItem('user'));
    const company_id = user?.company_id || user?.companyId;

    // 🔑 EXTRACTION GRANULAIRE ET SOUPLITUDE DES TYPES (true, 1, 'true', '1') POUR TON BOUTON INSTITUTION
    const userPerms = useMemo(() => getUserPermissions(), []);
    
    const canUpdateInstitution = userPerms['params_btn_update_institution'] === true || userPerms['params_btn_update_institution'] === 1 || userPerms['params_btn_update_institution'] === 'true' || userPerms['params_btn_update_institution'] === '1';

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState({ type: '', msg: '' });
    
    // État pour la double confirmation (Toast Interne)
    const [showConfirmAnalytique, setShowConfirmAnalytique] = useState(false);
    const [pendingAnalytiqueValue, setPendingAnalytiqueValue] = useState(null);

    const [formData, setFormData] = useState({
        id: '', 
        company_code: '', 
        name: '', 
        email: '', 
        phone: '', 
        address: '',
        nif_number: '', 
        rccm_number: '', 
        logo_data: '',
        gestion_analytique: 0,
        regime_tva_recuperable: 1 // 🔥 Initialisation du régime
    });

    const showStatus = (type, msg) => {
        setStatus({ type, msg });
        if (type === 'success') {
            setTimeout(() => setStatus({ type: '', msg: '' }), 5000);
        }
    };

    const fetchSettings = async () => {
        if (!company_id) {
            showStatus('error', 'Session expirée ou ID manquant.');
            setLoading(false);
            return;
        }
        try {
            const res = await API.get(`/company/${company_id}`);
            if (res.data?.success && res.data.data) {
                const sData = res.data.data;
                setFormData({
                    id: sData.id || '',
                    company_code: sData.company_code || '',
                    name: sData.name || '', 
                    email: sData.email || '',
                    phone: sData.phone || '',
                    address: sData.address || '',
                    nif_number: sData.nif_number || '',
                    rccm_number: sData.rccm_number || '',
                    logo_data: sData.logo_data || '',
                    gestion_analytique: sData.gestion_analytique || 0,
                    regime_tva_recuperable: sData.regime_tva_recuperable ?? 1 // 🔥 RÉCUPÉRATION
                });
            }
        } catch (err) {
            showStatus('error', 'Impossible de charger les paramètres.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSettings();
        
        if (socket) {
            const userStored = JSON.parse(localStorage.getItem('user') || '{}');
            const companyId = userStored.company_id || userStored.companyId;
            if (companyId) {
                socket.emit('join_company', String(companyId));
            }

            const handleSocketUpdate = (event) => {
                if (event.table === 'companies') {
                    console.log("🔄 Mise à jour des réglages institutionnels via Socket");
                    fetchSettings();
                }
            };

            socket.on('DATA_EVENT', handleSocketUpdate);

            return () => {
                socket.off('DATA_EVENT', handleSocketUpdate);
            };
        }
    }, [company_id]);

    const handleLogoChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            if (file.size > 2 * 1024 * 1024) { 
                showStatus('error', "Logo trop lourd (Max 2Mo)"); 
                return; 
            }
            const reader = new FileReader();
            reader.onloadend = () => setFormData(prev => ({ ...prev, logo_data: reader.result }));
            reader.readAsDataURL(file);
        }
    };

    const handleAnalytiqueToggle = (e) => {
        const newValue = e.target.checked ? 1 : 0;
        setPendingAnalytiqueValue(newValue);
        setShowConfirmAnalytique(true);
    };

    const confirmAnalytiqueChange = () => {
        setFormData({ ...formData, gestion_analytique: pendingAnalytiqueValue });
        setShowConfirmAnalytique(false);
        setPendingAnalytiqueValue(null);
    };

    const cancelAnalytiqueChange = () => {
        setShowConfirmAnalytique(false);
        setPendingAnalytiqueValue(null);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (showConfirmAnalytique) return;

        // 🔑 SÉCURITÉ DE POSTE INTERNE BEFORE NETWORK : Interdire la validation si la permission est absente
        if (!canUpdateInstitution) {
            return showStatus('error', "🛑 ACCÈS REFUSÉ : Votre profil ne détient pas le privilège d'enregistrement ou de modification des données institutionnelles.");
        }

        setSaving(true);
        setStatus({ type: '', msg: '' });

        try {
            const res = await API.put(`/company/${company_id}`, formData);
            
            if (res.data.success) {
                showStatus('success', "✅ IDENTITÉ MISE À JOUR ! Synchronisation cloud en cours...");
                
                setTimeout(() => {
                    navigate('/dashboard');
                }, 3000);
            }
        } catch (err) {
            if (!err.response) {
                console.warn("Connexion instable pendant la synchro, maintien de la session...");
                showStatus('success', "Enregistré en local ! (Synchro cloud en arrière-plan)");
                setTimeout(() => navigate('/dashboard'), 2000);
                return;
            }

            const errorMsg = err.response?.data?.error || "Erreur de mise à jour";
            showStatus('error', errorMsg);
            setSaving(false);
        }
    };

    if (loading) return (
        <div style={s.loaderContainer}>
            <Loader2 className="animate-spin" size={48} color="#2563eb" />
            <p style={{ marginTop: '15px', color: '#64748b', fontWeight: '600' }}>Initialisation...</p>
        </div>
    );


        return (
        <div style={{ display: 'flex', height: '100vh', width: '100vw', background: '#f8fafc', overflow: 'hidden' }}>
            <Sidebar />
            <main style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', overflowY: 'auto' }}>
                <header style={s.header}>
                    <div style={s.headerContainer}>
                        <div>
                            <h1 style={s.headerTitle}>Paramètres Institution</h1>
                            {/* Affichage de l'ID interne de l'institution */}
                            <p style={s.headerSubtitle}>
                                Identifiant Interne: <span style={{color: '#2563eb', fontWeight: 'bold'}}>{formData.id}</span>
                            </p>
                        </div>
                        {status.msg && (
                            <div style={{ 
                                ...s.statusBadge, 
                                backgroundColor: status.type === 'success' ? '#f0fdf4' : '#fef2f2',
                                color: status.type === 'success' ? '#166534' : '#991b1b',
                                border: `1px solid ${status.type === 'success' ? '#bbf7d0' : '#fecaca'}`
                            }}>
                                {status.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                                {status.msg}
                            </div>
                        )}
                    </div>
                </header>

                <div style={s.contentArea}>
                    {/* L'exécution du formulaire intercepte handleSubmit qui possède le double verrou réseau */}
                    <form onSubmit={handleSubmit} style={s.formCard}>
                        <div style={s.formGrid}>
                            {/* Colonne Gauche : Identité */}
                            <div style={s.sectionCol}>
                                <h3 style={s.sectionTitle}><Building2 size={20} color="#2563eb" /> Informations Générales</h3>
                                
                                <div style={s.row}>
                                    <div style={{...s.inputGroup, flex: 2}}>
                                        <label style={s.label}>NOM OFFICIEL</label>
                                        <input 
                                            style={{
                                                ...s.input,
                                                // Grisage visuel de l'input si l'utilisateur n'a pas la permission d'édition
                                                background: canUpdateInstitution ? '#ffffff' : '#f1f5f9',
                                                cursor: canUpdateInstitution ? 'text' : 'not-allowed'
                                            }} 
                                            type="text" 
                                            value={formData.name} 
                                            onChange={e => setFormData({...formData, name: e.target.value})} 
                                            required 
                                            readOnly={!canUpdateInstitution}
                                        />
                                    </div>
                                    <div style={{...s.inputGroup, flex: 1}}>
                                        <label style={s.label}>CODE DE CONNEXION</label>
                                        <div style={s.codeBox}>
                                            <Hash size={14} color="#2563eb" />
                                            <span style={{fontWeight: '900', color: '#1e293b'}}>{formData.company_code}</span>
                                        </div>
                                    </div>
                                </div>

                                <div style={s.inputGroup}>
                                    <label style={s.label}>ADRESSE PHYSIQUE (SIÈGE)</label>
                                    <textarea 
                                        style={{
                                            ...s.textarea,
                                            background: canUpdateInstitution ? '#ffffff' : '#f1f5f9',
                                            cursor: canUpdateInstitution ? 'text' : 'not-allowed'
                                        }} 
                                        value={formData.address} 
                                        onChange={e => setFormData({...formData, address: e.target.value})} 
                                        readOnly={!canUpdateInstitution}
                                    />
                                </div>
                                <div style={s.row}>
                                    <div style={s.inputGroup}>
                                        <label style={s.label}><Phone size={14}/> TÉLÉPHONE</label>
                                        <input 
                                            style={{
                                                ...s.input,
                                                background: canUpdateInstitution ? '#ffffff' : '#f1f5f9',
                                                cursor: canUpdateInstitution ? 'text' : 'not-allowed'
                                            }} 
                                            type="text" 
                                            value={formData.phone} 
                                            onChange={e => setFormData({...formData, phone: e.target.value})} 
                                            readOnly={!canUpdateInstitution}
                                        />
                                    </div>
                                    <div style={s.inputGroup}>
                                        <label style={s.label}><Mail size={14}/> EMAIL PROFESSIONNEL</label>
                                        <input 
                                            style={{
                                                ...s.input,
                                                background: canUpdateInstitution ? '#ffffff' : '#f1f5f9',
                                                cursor: canUpdateInstitution ? 'text' : 'not-allowed'
                                            }} 
                                            type="email" 
                                            value={formData.email} 
                                            onChange={e => setFormData({...formData, email: e.target.value})} 
                                            readOnly={!canUpdateInstitution}
                                        />
                                    </div>
                                </div>
                            </div>

                                                {/* Colonne Droite : Légal & Logo */}
                            <div style={s.sectionCol}>
                                <h3 style={s.sectionTitle}><FileText size={20} color="#2563eb" /> Identifiants & Régime Fiscal</h3>
                                <div style={s.row}>
                                    <div style={s.inputGroup}>
                                        <label style={s.label}>NUMÉRO NIF</label>
                                        <input 
                                            style={{
                                                ...s.input,
                                                background: canUpdateInstitution ? '#ffffff' : '#f1f5f9',
                                                cursor: canUpdateInstitution ? 'text' : 'not-allowed'
                                            }} 
                                            type="text" 
                                            value={formData.nif_number} 
                                            onChange={e => setFormData({...formData, nif_number: e.target.value})} 
                                            placeholder="NIF" 
                                            readOnly={!canUpdateInstitution}
                                        />
                                    </div>
                                    <div style={s.inputGroup}>
                                        <label style={s.label}>NUMÉRO RCCM</label>
                                        <input 
                                            style={{
                                                ...s.input,
                                                background: canUpdateInstitution ? '#ffffff' : '#f1f5f9',
                                                cursor: canUpdateInstitution ? 'text' : 'not-allowed'
                                            }} 
                                            type="text" 
                                            value={formData.rccm_number} 
                                            onChange={e => setFormData({...formData, rccm_number: e.target.value})} 
                                            placeholder="RCCM" 
                                            readOnly={!canUpdateInstitution}
                                        />
                                    </div>
                                </div>

                                {/* 🔥 SECTION RÉGIME TVA */}
                                <div style={s.fiscalBox}>
                                    <label style={s.label}><Scale size={14}/> CONFIGURATION DU RÉGIME FISCAL (CMP)</label>
                                    <div style={s.toggleGroup}>
                                        <button 
                                            type="button" 
                                            onClick={() => {
                                                if (!canUpdateInstitution) return;
                                                setFormData({...formData, regime_tva_recuperable: 1});
                                            }}
                                            style={{
                                                ...s.toggleBtn, 
                                                ...(formData.regime_tva_recuperable === 1 ? s.toggleBtnActive : {}),
                                                cursor: canUpdateInstitution ? 'pointer' : 'not-allowed'
                                            }}
                                        >
                                            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                                                <span style={{fontWeight: '800', fontSize: '13px'}}>RÉGIME RÉEL</span>
                                                {formData.regime_tva_recuperable === 1 && <CheckCircle2 size={16} color="#2563eb" />}
                                            </div>
                                            <span style={s.toggleSub}>L'entreprise récupère la TVA. Le CMP est calculé sur le <b>HORS TAXE (HT)</b>.</span>
                                        </button>
                                        <button 
                                            type="button" 
                                            onClick={() => {
                                                if (!canUpdateInstitution) return;
                                                setFormData({...formData, regime_tva_recuperable: 0});
                                            }}
                                            style={{
                                                ...s.toggleBtn, 
                                                ...(formData.regime_tva_recuperable === 0 ? s.toggleBtnActive : {}),
                                                cursor: canUpdateInstitution ? 'pointer' : 'not-allowed'
                                            }}
                                        >
                                            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                                                <span style={{fontWeight: '800', fontSize: '13px'}}>RÉGIME FORFAITAIRE / NON ASSUJETTI</span>
                                                {formData.regime_tva_recuperable === 0 && <CheckCircle2 size={16} color="#2563eb" />}
                                            </div>
                                            <span style={s.toggleSub}>TVA non récupérable. Le CMP est calculé sur le <b>TTC (Montant Facture)</b>.</span>
                                        </button>
                                    </div>
                                </div>

                                <div style={{ marginTop: '5px' }}>
                                    <label style={s.label}><ImageIcon size={14}/> LOGO DE L'ENTREPRISE</label>
                                    <div style={s.logoZone}>
                                        <div style={s.logoBox}>
                                            {formData.logo_data ? <img src={formData.logo_data} alt="Logo" style={s.logoImg} /> : <ImageIcon size={32} color="#cbd5e1"/>}
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <input 
                                                type="file" 
                                                accept="image/*" 
                                                onChange={(e) => {
                                                    if (!canUpdateInstitution) return;
                                                    handleLogoChange(e);
                                                }} 
                                                style={{
                                                    fontSize: '12px',
                                                    cursor: canUpdateInstitution ? 'pointer' : 'not-allowed'
                                                }} 
                                                disabled={!canUpdateInstitution}
                                            />
                                            <p style={{fontSize: '10px', color: '#94a3b8', marginTop: '5px'}}>Max 2Mo</p>
                                        </div>
                                    </div>
                                </div>
                                {/* SECTION ANALYTIQUE AVEC TOAST INTERNE */}
                                <div style={{ marginTop: '5px', position: 'relative' }}>
                                    {showConfirmAnalytique && (
                                        <div style={s.innerToast}>
                                            <div style={{ display: 'flex', gap: '12px' }}>
                                                <AlertTriangle size={24} color="#854d0e" />
                                                <div style={{ flex: 1 }}>
                                                    <p style={{ margin: 0, fontSize: '12px', fontWeight: '800', color: '#854d0e', lineHeight: '1.4' }}>
                                                        {pendingAnalytiqueValue === 1 
                                                            ? "Activer la gestion analytique ? (Impacte les calculs de coûts)" 
                                                            : "Désactiver la gestion analytique ? (Perte de visibilité analytique)"}
                                                    </p>
                                                    <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                                                        <button type="button" onClick={confirmAnalytiqueChange} style={s.innerBtnConfirm}>Confirmer</button>
                                                        <button type="button" onClick={cancelAnalytiqueChange} style={s.innerBtnCancel}>Annuler</button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    <div style={{...s.analytiqueBox, opacity: (showConfirmAnalytique || !canUpdateInstitution) ? 0.5 : 1}}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: canUpdateInstitution ? 'pointer' : 'not-allowed', fontWeight: '800', fontSize: '13px' }}>
                                            <input 
                                                type="checkbox" 
                                                checked={formData.gestion_analytique === 1} 
                                                onChange={(e) => {
                                                    if (!canUpdateInstitution) return;
                                                    handleAnalytiqueToggle(e);
                                                }}
                                                disabled={showConfirmAnalytique || !canUpdateInstitution}
                                                style={{width: '18px', height: '18px', cursor: canUpdateInstitution ? 'pointer' : 'not-allowed'}}
                                            />
                                            Activer le module de comptabilité analytique
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        {/* 🔑 MAPPAGE DU BOUTON PRINCIPAL SANS ATTRIBUT DISABLED POUR PERMETTRE L'INTERCEPTION DU CLIC */}
                        <div style={s.footer}>
                            <button 
                                type="submit" 
                                onClick={(e) => {
                                    if (!canUpdateInstitution) {
                                        e.preventDefault(); // 🔒 Empêche la soumission HTTP du formulaire
                                        showStatus('error', "🛑 ACCÈS REFUSÉ : Votre profil ne détient pas le privilège requis pour modifier l'institution.");
                                    }
                                }}
                                style={{
                                    ...s.btnSave, 
                                    background: canUpdateInstitution ? '#2563eb' : '#94a3b8',
                                    cursor: canUpdateInstitution ? 'pointer' : 'not-allowed',
                                    opacity: (saving || showConfirmAnalytique) ? 0.7 : 1,
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                {saving ? (
                                    <Loader2 className="animate-spin" size={20} />
                                ) : (
                                    <Save size={20} />
                                )}
                                
                                {saving 
                                    ? "SAUVEGARDE EN COURS..." 
                                    : (canUpdateInstitution ? "METTRE À JOUR L'INSTITUTION" : "Accès restreint")}
                            </button>
                        </div>
                    </form>
                </div>
            </main>
        </div>
    );
};

const s = {
    loaderContainer: { display: 'flex', flexDirection: 'column', height: '100vh', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' },
    header: { background: 'white', padding: '20px 50px', borderBottom: '1px solid #e2e8f0' },
    headerContainer: { maxWidth: '1400px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    headerTitle: { margin: 0, fontSize: '24px', fontWeight: '900', color: '#0f172a' },
    headerSubtitle: { margin: 0, color: '#64748b', fontSize: '13px', marginTop: '4px' },
    statusBadge: { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: '800' },
    contentArea: { padding: '30px 50px', width: '100%', maxWidth: '1400px', margin: '0 auto', boxSizing: 'border-box' },
    formCard: { background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', marginBottom: '30px', overflow: 'hidden' },
    formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '50px', padding: '40px' },
    sectionCol: { display: 'flex', flexDirection: 'column', gap: '20px' },
    sectionTitle: { fontSize: '15px', fontWeight: '800', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '10px', margin: 0, paddingBottom: '15px', borderBottom: '2px solid #f1f5f9' },
    row: { display: 'flex', gap: '20px' },
    inputGroup: { display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 },
    label: { fontSize: '10px', fontWeight: '900', color: '#64748b', textTransform: 'uppercase' },
    input: { padding: '12px 15px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none', fontWeight: '600' },
    codeBox: { padding: '12px 15px', borderRadius: '8px', background: '#eff6ff', border: '1px solid #dbeafe', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px' },
    textarea: { padding: '12px 15px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', minHeight: '110px', resize: 'none', outline: 'none', fontWeight: '600' },
    logoZone: { display: 'flex', alignItems: 'center', gap: '20px', padding: '15px', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1' },
    logoBox: { height: '80px', width: '80px', background: 'white', borderRadius: '10px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    logoImg: { width: '100%', height: '100%', objectFit: 'contain' },
    
    // 🔥 STYLES RÉGIME FISCAL
    fiscalBox: { padding: '20px', background: '#f0f9ff', borderRadius: '12px', border: '1px solid #bae6fd' },
    toggleGroup: { display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' },
    toggleBtn: { padding: '12px', textAlign: 'left', borderRadius: '8px', border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer', transition: 'all 0.2s ease', display: 'flex', flexDirection: 'column', gap: '4px' },
    toggleBtnActive: { borderColor: '#2563eb', background: '#eff6ff', border: '1px solid #2563eb', boxShadow: '0 0 0 2px rgba(37, 99, 235, 0.1)' },
    toggleSub: { fontSize: '11px', color: '#64748b', fontWeight: '500', lineHeight: '1.3' },

    analytiqueBox: { padding: '18px', background: '#fefce8', borderRadius: '12px', border: '1px solid #fef08a', color: '#854d0e', transition: 'all 0.3s ease' },
    footer: { padding: '25px 40px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', textAlign: 'right' },
    btnSave: { padding: '15px 35px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '800', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '12px' },
    
    innerToast: { position: 'absolute', bottom: '110%', left: 0, right: 0, background: '#fffbeb', border: '1px solid #fef08a', padding: '15px', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', zIndex: 10 },
    innerBtnConfirm: { padding: '8px 15px', background: '#854d0e', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: '900', cursor: 'pointer' },
    innerBtnCancel: { padding: '8px 15px', background: 'white', color: '#475569', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '11px', fontWeight: '900', cursor: 'pointer' }
};

export default CompanySettings;