import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, CheckCircle, AlertCircle, Building2 } from 'lucide-react';
import API from '../services/api';
import './Login.css';

const ForgotPassword = () => {
  // Gestion de l'email et du code entreprise
  const [formData, setFormData] = useState({
    email: '',
    companyCode: localStorage.getItem('lastCompanyCode') || '' // Auto-remplissage pour l'expérience utilisateur
  });
  
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ type: '', message: '' });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setStatus({ type: '', message: '' });

    try {
      // Envoi des données au point d'accès API
      const response = await API.post('/auth/forgot-password', formData);
      
      if (response.data.success) {
        setStatus({ 
          type: 'success', 
          message: 'Si ces informations correspondent à un compte actif, un lien de réinitialisation vous sera envoyé sous peu.' 
        });
        
        // Mémorisation du code entreprise pour faciliter les futures connexions
        localStorage.setItem('lastCompanyCode', formData.companyCode);
      }
    } catch (err) {
      setStatus({ 
        type: 'error', 
        message: err.response?.data?.error || 'Une erreur est survenue lors de la vérification.' 
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <Link to="/login" className="back-link" style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#64748b', textDecoration: 'none', fontSize: '14px', marginBottom: '10px' }}>
            <ArrowLeft size={16} /> Retour à la connexion
          </Link>
          <h2>Récupération</h2>
          <p>Identifiez votre compte professionnel</p>
        </div>

        {status.type === 'success' ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ background: '#f0fdf4', color: '#166534', padding: '25px', borderRadius: '12px', marginBottom: '20px' }}>
              <CheckCircle size={40} style={{ marginBottom: '10px' }} />
              <p style={{ fontWeight: '500', fontSize: '15px' }}>{status.message}</p>
            </div>
            <Link to="/login" className="btn-primary" style={{ textDecoration: 'none', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              Retour au Login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="auth-form">
            {status.type === 'error' && (
              <div className="error-badge" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '15px' }}>
                <AlertCircle size={18} /> {status.message}
              </div>
            )}

            {/* CHAMP CODE ENTREPRISE */}
            <div className="input-group">
              <Building2 size={18} className="icon" />
              <input 
                type="text" 
                placeholder="Code Entreprise (ex: BC90CF15)" 
                required 
                value={formData.companyCode}
                onChange={e => {
                  if(status.type) setStatus({type:'', message:''}); 
                  setFormData({...formData, companyCode: e.target.value.toUpperCase()})
                }}
                disabled={loading}
              />
            </div>

            {/* CHAMP EMAIL */}
            <div className="input-group">
              <Mail size={18} className="icon" />
              <input 
                type="email" 
                placeholder="Email professionnel" 
                required 
                value={formData.email}
                onChange={e => {
                    if(status.type) setStatus({type:'', message:''});
                    setFormData({...formData, email: e.target.value})
                }}
                disabled={loading}
              />
            </div>

            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? <span className="spinner"></span> : 'Récupérer mon accès'}
            </button>
          </form>
        )}

        <div className="auth-footer" style={{ marginTop: '25px', borderTop: '1px solid #f1f5f9', paddingTop: '15px' }}>
          <p style={{ fontSize: '12px', color: '#94a3b8', lineHeight: '1.5', textAlign: 'center' }}>
            <strong>Note de sécurité :</strong> Le code entreprise garantit que la demande provient bien de votre instance dédiée.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;