import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next'; // Hook de traduction global
import { Mail, Lock, Building2, ArrowRight, HelpCircle, Eye, EyeOff, AlertTriangle, Home } from 'lucide-react';
import API from '../services/api';
import './Login.css'; 

const Login = () => {
  const navigate = useNavigate();
  const { t } = useTranslation(); // Initialisation de la fonction de traduction t()
  
  const [formData, setFormData] = useState({ 
    email: '', 
    password: '',
    companyCode: localStorage.getItem('lastCompanyCode') || '' 
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Force l'application immédiate du thème graphique actif dès l'ouverture de l'écran
  useEffect(() => {
    const savedTheme = localStorage.getItem('erp_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await API.post('/auth/login', formData);
      
      if (response.data.success) {
        const { token, user, license } = response.data;

        // 1. Stockage complet des informations
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user)); 
        localStorage.setItem('companyId', user.company_id);
        localStorage.setItem('companyName', user.companyName || 'Ma Société');
        localStorage.setItem('userName', user.username);
        localStorage.setItem('lastCompanyCode', formData.companyCode);
        if (license) {
          localStorage.setItem('licenseStatus', JSON.stringify(license));
        }

        // 2. Détermination de la route cible selon le rôle
        let targetPath = '/admin/dashboard';
        if (user.role !== 'admin' && user.role !== 'super_admin' && user.branch_id) {
          targetPath = `/branch/${user.branch_id}/dashboard`;
        }

        // 3. Redirection immédiate
        navigate(targetPath);
      }
    } catch (err) {
      console.error("Erreur login reçue :", err);
      
      const statusHttp = err.response?.status;
      const messageServeur = err.response?.data?.error || err.response?.data?.message;

      if (statusHttp === 401) {
        setError(messageServeur || t('login.error_unauthorized', 'Identifiants incorrects. Veuillez réessayer.'));
      } else if (statusHttp === 404) {
        setError(t('login.error_not_found', 'Code entreprise introuvable ou incorrect.'));
      } else {
        setError(messageServeur || t('login.error_fallback', 'Mot de passe erroné ou erreur interne d\'authentification.'));
      }

    } finally {
      setLoading(false);
    }
  };

 return (
    <div className="auth-page">
      
      {/* ✅ Bouton Retour Accueil Premium internationalisé positionné en haut à droite */}
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
          <h2>{t('login.title', 'Connexion ERP')}</h2>
          <p>{t('login.subtitle', 'Accédez à votre espace de gestion')}</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && (
            <div className="error-badge" onClick={() => setError('')} style={{ cursor: 'pointer' }}>
              {error}
            </div>
          )}

          <div className="input-group">
            <Building2 size={18} className="icon" />
            <input 
              type="text" 
              placeholder={t('login.company_code', 'Code Entreprise (ex: AB12CD34)')} 
              required 
              value={formData.companyCode}
              onChange={e => {
                if(error) setError('');
                setFormData({...formData, companyCode: e.target.value.toUpperCase().trim()});
              }} 
            />
          </div>

          <div className="input-group">
            <Mail size={18} className="icon" />
            <input 
              type="email" 
              placeholder={t('login.email', 'Email professionnel')} 
              required 
              value={formData.email}
              onChange={e => {
                if(error) setError('');
                setFormData({...formData, email: e.target.value.trim()});
              }} 
            />
          </div>

          <div className="input-group">
            <Lock size={18} className="icon" />
            <input 
              type={showPassword ? "text" : "password"} 
              placeholder={t('login.password', 'Mot de passe')} 
              required 
              value={formData.password}
              onChange={e => {
                if(error) setError('');
                setFormData({...formData, password: e.target.value});
              }} 
            />
            <button 
                type="button"
                className="toggle-password"
                onClick={() => setShowPassword(!showPassword)}
            >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          <div className="forgot-password-container">
            <Link to="/forgot-password" title={t('login.forgot_password', 'Mot de passe oublié ?')}>
              <HelpCircle size={14} /> {t('login.forgot_password', 'Mot de passe oublié ?')}
            </Link>
          </div>

          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? (
              <span className="spinner"></span>
            ) : (
              <>
                {t('login.submit', 'Se connecter')} <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            {t('login.new_user', 'Nouvel utilisateur ?')}{' '}
            <Link to="/signup">{t('login.create_company', 'Créer une entreprise')}</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;