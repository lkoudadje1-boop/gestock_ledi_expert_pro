import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next'; // Hook de traduction global
import { User, Mail, Lock, Building, ArrowRight, CheckCircle, AlertCircle, Copy, Eye, EyeOff, ShieldCheck, Home } from 'lucide-react';
import API from '../services/api';
import './Login.css'; 

const Signup = () => {
  const navigate = useNavigate();
  const { t } = useTranslation(); // Initialisation de la fonction de traduction t()
  
  const [formData, setFormData] = useState({
      username: '',
      email: '',
      password: '',
      companyName: '',
      plan_precision: 8,
      machine_mid: '' // Conteneur pour l'empreinte matérielle physique
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successCode, setSuccessCode] = useState(null);
  const [copied, setCopied] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [companyId, setCompanyId] = useState(null);
  
  // État du système de Toast intégré
  const [toastMsg, setToastMsg] = useState({ text: '', type: '' });

  // Utilitaire d'affichage des notifications Toast
  const triggerToast = (text, type = 'success') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg({ text: '', type: '' }), 3000);
  };

  // Synchronisation du thème dès le chargement du composant d'inscription
  useEffect(() => {
    const savedTheme = localStorage.getItem('erp_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
  }, []);

  // Capture automatique du MID dès le chargement de l'écran d'inscription
  useEffect(() => {
    if (window.electronAPI && window.electronAPI.getMachineId) {
      window.electronAPI.getMachineId().then(mid => {
        setFormData(prev => ({ ...prev, machine_mid: mid }));
      }).catch(err => console.error("Impossible de capturer le matériel", err));
    }
  }, []);

  const handleChange = (e) => {
    if(error) setError('');
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
      e.preventDefault();
      setLoading(true);
      setError('');

      try {
        const response = await API.post('/auth/signup', formData);

        if (response.data.success) {
          const generatedCode = response.data.companyCode;
          const generatedId = response.data.companyId;

          localStorage.setItem('lastCompanyCode', generatedCode);
          
          if (window.electronAPI && window.electronAPI.secureStorage) {
              await window.electronAPI.secureStorage.set('lastCompanyCode', generatedCode);
              await window.electronAPI.secureStorage.set('registeredCompanyId', generatedId);
          }
          
          setSuccessCode(generatedCode);
          setCompanyId(generatedId);
          triggerToast(t('signup.success_toast', 'Compte et entreprise créés avec succès !'), "success");
        }
      } catch (err) {
        console.error("Erreur inscription:", err);
        const errMsg = err.response?.data?.error || t('signup.error_fallback', "Impossible de finaliser l'inscription.");
        setError(errMsg);
        triggerToast(errMsg, "error");
      } finally {
        setLoading(false);
      }
  };

  // --- VUE SUCCÈS SÉCURISÉE (Post-Inscription) ---
  if (successCode) {
    return (
      <div className="auth-page">
        <button 
          className="back-home-btn" 
          onClick={() => navigate('/')} 
          aria-label={t('welcome.back_home', 'Retour à l\'accueil')}
          title={t('welcome.back_home', 'Retour à l\'accueil')}
        >
          <Home size={18} />
          <span>{t('back_home_btn', 'Accueil')}</span>
        </button>

        {/* ✂️ TOAST SUPPRIMÉ D'ICI POUR ÉVITER TOUT DÉCALAGE DU FORMULAIRE */}

        <div className="auth-card" style={{ textAlign: 'center', maxWidth: '500px' }}>
          <CheckCircle size={60} color="#22c55e" style={{ marginBottom: '20px', marginLeft: 'auto', marginRight: 'auto' }} />
          <h2 style={{ color: '#1b2559' }}>{t('signup.success_title', 'Inscription réussie !')}</h2>
          <p style={{ color: '#64748b', fontSize: '14px' }}>
            {t('signup.success_subtitle', 'Votre compte a été créé. Veuillez noter vos identifiants uniques.')}
          </p>

          {/* SECTION ID SYSTÈME */}
          <div style={{ marginTop: '20px', textAlign: 'left' }}>
            <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#4a5568', marginLeft: '5px' }}>
              {t('signup.system_id_label', 'ID SYSTÈME (Référence interne)')}
            </label>
            <div 
              className="id-display-box"
              style={{ 
                background: '#f8fafc', padding: '12px 16px', borderRadius: '10px', 
                border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '5px'
              }}
            >
              <span style={{ fontFamily: 'monospace', fontWeight: 'bold', color: '#2d3748', fontSize: '16px' }}>
                {companyId}
              </span>
              <button 
                type="button"
                onClick={() => { 
                  navigator.clipboard.writeText(companyId); 
                  setCopiedId(true);
                  triggerToast(t('signup.copied_id', 'ID Système copié !'), "success");
                  setTimeout(() => setCopiedId(false), 2000);
                }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4318ff', position: 'relative' }}
              >
                <Copy size={16} />
                {copiedId && <span style={{ position: 'absolute', top: '-25px', right: '0', background: '#22c55e', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '9px', whiteSpace: 'nowrap' }}>{t('copied_tag', 'Copié !')}</span>}
              </button>
            </div>
          </div>


                   {/* SECTION CODE ENTREPRISE */}
          <div style={{ marginTop: '20px', textAlign: 'left', marginBottom: '25px' }}>
            <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#4a5568', marginLeft: '5px' }}>
              {t('signup.company_code_label', 'CODE ENTREPRISE (Pour connexion cloud)')}
            </label>
            <div 
              onClick={() => {
                navigator.clipboard.writeText(successCode);
                setCopied(true);
                triggerToast(t('signup.copied_code', 'Code Entreprise copié !'), "success");
                setTimeout(() => setCopied(false), 2000);
              }}
              style={{ 
                background: '#eff6ff', padding: '20px', borderRadius: '12px', 
                border: '2px dashed #3b82f6', textAlign: 'center', cursor: 'pointer', marginTop: '5px', position: 'relative'
              }}
            >
              <span style={{ fontSize: '24px', fontWeight: '800', color: '#1e40af', letterSpacing: '2px' }}>
                {successCode}
              </span>
              {copied && <span style={{ position: 'absolute', top: '-10px', right: '10px', background: '#22c55e', color: 'white', padding: '2px 8px', borderRadius: '4px', fontSize: '10px' }}>{t('copied_tag', 'Copié !')}</span>}
            </div>
          </div>
          
          <button 
            onClick={() => navigate('/login', { 
              state: { email: formData.email, companyCode: successCode } 
            })} 
            className="btn-primary" 
            style={{ width: '100%' }}
          >
            {t('signup.go_to_login', 'Aller à la connexion')} <ArrowRight size={18} />
          </button>
      </div> {/* Fin de auth-card */}
      
      {toastMsg.text && (
        <div className={`toast-notification ${toastMsg.type}`}>
           {/* Contenu du toast */}
        </div>
      )}
    </div> // Fin de auth-page
    );
  }

  // --- VUE FORMULAIRE D'INSCRIPTION STANDARD ---
  return (
    <div className="auth-page">
      {/* ✅ Bouton Retour Accueil Premium localisé positionné en haut à droite */}
      <button 
        className="back-home-btn" 
        onClick={() => navigate('/')} 
        aria-label={t('welcome.back_home', "Retour à l'accueil")}
        title={t('welcome.back_home', "Retour à l'accueil")}
      >
        <Home size={18} />
        <span>{t('back_home_btn', 'Accueil')}</span>
      </button>

      <div className="auth-card">
        <div className="auth-header">
          <h2>{t('signup.title', 'Créer ma Société')}</h2>
          <p>{t('signup.subtitle', 'Initialisez votre instance ERP Local-First')}</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && (
            <div className="error-badge" onClick={() => setError('')} style={{ cursor: 'pointer' }}>
              {error}
            </div>
          )}

          <div className="input-group">
            <Building size={18} className="icon" />
            <input 
              type="text" 
              name="companyName"
              placeholder={t('signup.placeholder_company', "Nom de l'entreprise ou raison sociale")} 
              required 
              value={formData.companyName}
              onChange={handleChange} 
            />
          </div>

          <div className="input-group">
            <User size={18} className="icon" />
            <input 
              type="text" 
              name="username"
              placeholder={t('signup.placeholder_username', 'Nom complet du super-administrateur')} 
              required 
              value={formData.username}
              onChange={handleChange} 
            />
          </div>

          <div className="input-group">
            <Mail size={18} className="icon" />
            <input 
              type="email" 
              name="email"
              placeholder={t('signup.placeholder_email', 'Email professionnel de gestion')} 
              required 
              value={formData.email}
              onChange={handleChange} 
            />
          </div>

          <div className="input-group">
            <Lock size={18} className="icon" />
            <input 
              type={showPassword ? "text" : "password"} 
              name="password"
              placeholder={t('signup.placeholder_password', "Mot de passe d'accès racine")} 
              required 
              value={formData.password}
              onChange={handleChange} 
            />
            <button 
                type="button"
                className="toggle-password"
                onClick={() => setShowPassword(!showPassword)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            >
                {showPassword ? <EyeOff size={18} color="#a3b2cb" /> : <Eye size={18} color="#a3b2cb" />}
            </button>
          </div>

          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? (
              <span className="spinner"></span>
            ) : (
              <>
                {t('signup.submit_btn', "Créer l'instance ERP")} <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            {t('signup.already_registered', 'Déjà inscrit ?')}{' '}
            <Link to="/login">{t('signup.login_link', 'Ouvrir ma session')}</Link>
          </p>
        </div>
      </div>

      {/* ✅ Isolé : Toast positionné en bas à la racine de la structure .auth-page de saisie */}
      {toastMsg.text && (
        <div className={`toast-notification ${toastMsg.type}`}>
          {toastMsg.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle size={18} />}
          <span>{toastMsg.text}</span>
        </div>
      )}
    </div>
  );
};

export default Signup;
