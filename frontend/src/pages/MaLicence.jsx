import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next'; // Importation du hook d'internationalisation
import { 
  ShieldCheck, Upload, Calendar, User, 
  CheckCircle, XCircle, RefreshCcw, Info, AlertTriangle, Cpu, Copy 
} from 'lucide-react';
import Sidebar from '../components/Sidebar';
import API from '../services/api';

const MaLicence = () => {
  const { t } = useTranslation(); // Initialisation de la fonction de traduction

  // --- 1. ÉTATS ---
  const [license, setLicense] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [modal, setModal] = useState({ show: false, title: '', message: '', type: 'info' });
  
  // 🛡️ ÉTATS AJOUTÉS POUR LA SÉCURITÉ MATÉRIELLE (MID) [vq3yx0, mtb7pq]
  const [machineId, setMachineId] = useState(t('license.loading_mid') || 'Analyse en cours...');
  const [copiedMid, setCopiedMid] = useState(false);

  // --- 2. RÉCUPÉRATION DES INFOS ---
  const fetchLicenseStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get(`/license/status?t=${Date.now()}`);
      setLicense(res.data);
    } catch (err) {
      console.error("❌ Erreur récupération licence:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLicenseStatus();
    
    // 🛡️ SÉCURITÉ DE SECOURS EN MODE DEV (Vérifie si on est dans Electron ou Chrome)
    if (window.electronAPI && typeof window.electronAPI.getMachineId === 'function') {
      window.electronAPI.getMachineId()
        .then(id => setMachineId(id))
        .catch(err => {
          console.error("Échec de la lecture du MID :", err);
          setMachineId(t('license.error_mid') || 'Erreur de capture matérielle');
        });
    } else {
      // Si on est dans Chrome, on affiche un code de simulation pour travailler tranquillement
      setMachineId('MID-SIMULE-DEV-MODE-CHROME-6290642E46BFC1A0');
    }
  }, [fetchLicenseStatus, t]);


  // --- 3. LOGIQUE DE MISE À JOUR ---
  const handleUpdateLicense = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.name !== 'metadata.dat') {
      setModal({ 
        show: true, 
        title: t('license.modal_invalid_title') || "Fichier invalide", 
        message: t('license.modal_invalid_message') || "Le fichier doit être nommé exactement 'metadata.dat'.", 
        type: 'alert' 
      });
      return;
    }

    setIsUploading(true);
    const reader = new FileReader();
    
    reader.onload = async (event) => {
      try {
        const content = event.target.result;
        const res = await API.post('/license/update', { 
          licenseData: content.trim() 
        });

        if (res.data.success) {
          if (res.data.newStatus) {
            setLicense(res.data.newStatus);
            localStorage.setItem('licenseStatus', JSON.stringify(res.data.newStatus));
          }

          setModal({ 
            show: true, 
            title: t('license.modal_success_title') || "Succès", 
            message: t('license.modal_success_message') || "Licence conforme et mise à jour avec succès !", 
            type: 'confirm' 
          });

          setTimeout(() => {
            window.location.reload(); 
          }, 2000);
        }
      } catch (err) {
        const errorMsg = err.response?.data?.error || t('license.modal_error_corrupted') || "Le fichier est corrompu ou la signature est invalide.";
        setModal({ 
          show: true, 
          title: t('license.modal_error_title') || "Échec de la mise à jour", 
          message: errorMsg, 
          type: 'alert' 
        });
      } finally {
        setIsUploading(false);
        e.target.value = '';
      }
    };
    
    reader.readAsText(file);
  };

  return (
    <div style={s.container}>
      <Sidebar />
      <main style={s.main}>
        
        {/* MODAL DE NOTIFICATION */}
        {modal.show && (
          <div style={s.modalOverlay}>
            <div style={s.modalCard}>
              <div style={s.modalHeader}>
                {modal.type === 'alert' ? <AlertTriangle color="#ef4444" /> : <ShieldCheck color="#2563eb" />}
                <h3 style={s.modalTitle}>{modal.title}</h3>
              </div>
              <p style={s.modalMessage}>{modal.message}</p>
              <div style={s.modalActions}>
                <button onClick={() => setModal({ ...modal, show: false })} style={s.btnModalConfirm}>OK</button>
              </div>
            </div>
          </div>
        )}

        <header style={s.header}>
          <div>
            <h1 style={s.headerTitle}>{t('license.page_title')}</h1>
            <p style={s.headerSubtitle}>{t('license.page_subtitle')}</p>
          </div>
          <button onClick={fetchLicenseStatus} style={s.btnRefresh} disabled={loading}>
            <RefreshCcw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </header>

        <div style={s.contentArea}>
          {/* ====================================================== */}
          {/* 🛡️ BANDEAU EXCLUSIF : AFFICHAGE DU MACHINE ID (MID)    */}
          {/* ====================================================== */}
          <div style={{ 
            background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', 
            padding: '20px', marginBottom: '25px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', textAlign: 'left' 
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <Cpu size={16} color="#4f46e5" />
              <label style={{ fontSize: '11px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {t('license.mid_label_title')}
              </label>
            </div>
            <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 14px 0', lineHeight: '1.4' }}>
              {t('license.mid_instructions')}
            </p>
            
            <div style={{ 
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
              background: '#f8fafc', border: '1px solid #e2e8f0', padding: '12px 16px', borderRadius: '10px', position: 'relative'
            }}>
              <span style={{ fontFamily: 'monospace', fontWeight: '700', color: '#1e293b', fontSize: '14px', wordBreak: 'break-all' }}>
                {machineId}
              </span>
              
              <button 
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(machineId);
                  setCopiedMid(true);
                  setTimeout(() => setCopiedMid(false), 2000);
                }}
                style={{ 
                  background: '#fff', border: '1px solid #cbd5e1', padding: '6px 12px', 
                  borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                  fontSize: '12px', fontWeight: '600', color: '#334155', transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#fff'}
              >
                <Copy size={14} /> {t('license.btn_copy_text')}
              </button>
              {copiedMid && <span style={{ position: 'absolute', top: '-25px', right: '12px', background: '#22c55e', color: 'white', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '700' }}>{t('license.copied_badge')}</span>}
            </div>
          </div>

          <div style={s.licenseGrid}>
            
            {/* CARTE INFO CLIENT */}
           <div style={s.infoCard}>
  <h3 style={s.cardTitle}><User size={18} /> {t('license.client_info_title')}</h3>
  <div style={s.dataRow}>
    <span style={s.label}>{t('license.client_holder')}</span>
    <span style={s.value}>{!license?.nom || license.nom.toUpperCase() === 'NON ENREGISTRÉ' ? t('license.not_registered') : license.nom}</span>
  </div>
  <div style={s.dataRow}>
    <span style={s.label}>{t('license.expiry_date_label')}</span>
    <span style={{...s.value, color: '#2563eb'}}><Calendar size={14} /> {!license?.exp || license.exp.toLowerCase().includes('aucune') ? t('license.no_license_fallback') : license.exp}</span>
  </div>
  <div style={s.dataRow}>
    <span style={s.label}>{t('license.state_label')}</span>
    {license?.valid ? <span style={s.statusActive}><CheckCircle size={12}/> {t('license.status_valid')}</span> : <span style={s.statusInactive}><XCircle size={12}/> {t('license.status_invalid_expired')}</span>}
  </div>
</div>


            {/* ZONE D'UPLOAD DU CERTIFICAT MATÉRIEL */}
            <div style={s.uploadCard}>
              <h3 style={{...s.cardTitle, color: '#1e40af'}}><Upload size={18} /> {t('license.upload_card_title')}</h3>
              <p style={s.uploadText}>
                {t('license.upload_card_desc')}
              </p>
              <label style={isUploading ? s.uploadZoneDisabled : s.uploadZone}>
                <Upload size={32} color="#3b82f6" />
                <span style={s.uploadLabel}>{isUploading ? t('license.processing_crypto') : t('license.import_cert')}</span>
                <input 
                    type="file" 
                    style={{ display: 'none' }} 
                    accept=".dat" 
                    onChange={handleUpdateLicense} 
                    disabled={isUploading} 
                />
              </label>
            </div>

          </div>

          {/* TABLEAU DES MODULES AUTORISÉS PAR LE MATÉRIEL */}
          <div style={s.moduleSection}>
            <h3 style={s.sectionTitle}><Info size={18} /> {t('license.activated_modules_title')}</h3>
            <div style={s.moduleGrid}>
              {license?.allowed_modules && license.allowed_modules.length > 0 ? (
                license.allowed_modules
                  // 🛡️ Filtre visuel : Masque le tag technique SYSTEM pour ne montrer que les options achetées
                  .filter(mod => mod.toUpperCase() !== 'SYSTEM')
                  .map((mod) => (
                    <div key={mod} style={s.moduleBadge}>
                      <CheckCircle size={12} color="#10b981" /> {mod.replace('_', ' ').toUpperCase()}
                    </div>
                  ))
              ) : (
                <p style={{ color: '#94a3b8', fontSize: '13px', fontStyle: 'italic' }}>
                    {t('license.no_modules_active')}
                </p>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

// --- STYLES EN OBJETS (Optimisés et stables pour le rendu React) ---
const s = {
  container: { display: 'flex', height: '100vh', width: '100vw', background: '#f8fafc', overflow: 'hidden' },
  main: { flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', overflowY: 'auto' },
  header: { background: 'white', padding: '20px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0' },
  headerTitle: { margin: 0, fontSize: '22px', fontWeight: '900', color: '#0f172a' },
  headerSubtitle: { margin: 0, color: '#64748b', fontSize: '13px' },
  btnRefresh: { background: 'none', border: '1px solid #e2e8f0', padding: '8px', borderRadius: '8px', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  contentArea: { padding: '25px 40px' },
  licenseGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '25px', marginBottom: '25px' },
  infoCard: { background: 'white', padding: '25px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', textAlign: 'left' },
  uploadCard: { background: '#eff6ff', padding: '25px', borderRadius: '12px', border: '1px solid #bfdbfe', textAlign: 'left' },
  cardTitle: { marginTop: 0, marginBottom: '20px', fontSize: '16px', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '10px' },
  dataRow: { display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #f1f5f9' },
  label: { fontSize: '13px', color: '#64748b', fontWeight: '600' },
  value: { fontSize: '14px', color: '#0f172a', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '6px' },
  statusActive: { padding: '4px 10px', borderRadius: '20px', background: '#dcfce7', color: '#166534', fontSize: '11px', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '5px' },
  statusInactive: { padding: '4px 10px', borderRadius: '20px', background: '#fee2e2', color: '#991b1b', fontSize: '11px', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '5px' },
  uploadText: { fontSize: '13px', color: '#1e40af', marginBottom: '20px', lineHeight: '1.5' },
  uploadZone: { height: '120px', border: '2px dashed #3b82f6', borderRadius: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: '#fff', transition: '0.2s' },
  uploadZoneDisabled: { height: '120px', border: '2px dashed #cbd5e1', borderRadius: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', opacity: 0.6 },
  uploadLabel: { marginTop: '10px', fontSize: '13px', fontWeight: '800', color: '#3b82f6' },
  moduleSection: { background: 'white', padding: '25px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', textAlign: 'left' },
  sectionTitle: { marginTop: 0, marginBottom: '15px', fontSize: '15px', fontWeight: '800', color: '#475569', display: 'flex', alignItems: 'center', gap: '10px' },
  moduleGrid: { display: 'flex', flexWrap: 'wrap', gap: '10px' },
  moduleBadge: { padding: '8px 15px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px', color: '#334155' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(15, 23, 42, 0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 },
  modalCard: { background: 'white', padding: '25px', borderRadius: '12px', width: '90%', maxWidth: '400px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' },
  modalHeader: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' },
  modalTitle: { margin: 0, fontSize: '16px', fontWeight: '900' },
  modalMessage: { color: '#64748b', fontSize: '14px', marginBottom: '20px' },
  modalActions: { display: 'flex', justifyContent: 'flex-end' },
  btnModalConfirm: { padding: '8px 20px', background: '#2563eb', border: 'none', borderRadius: '6px', color: 'white', fontWeight: '800', cursor: 'pointer', transition: 'background 0.2s' }
};

export default MaLicence;
