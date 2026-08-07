import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Lock, CheckCircle, AlertCircle, ArrowRight } from 'lucide-react';
import API from '../services/api'; // Utilisation de ton instance API configurée
import './Login.css'; 

const ResetPassword = () => {
    const { token } = useParams();
    const navigate = useNavigate();
    
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [status, setStatus] = useState({ type: '', msg: '' });
    const [loading, setLoading] = useState(false);

    const handleReset = async (e) => {
        e.preventDefault();
        
        if (password !== confirmPassword) {
            return setStatus({ type: 'error', msg: 'Les mots de passe ne correspondent pas.' });
        }

        setLoading(true);
        try {
            // Utilisation de l'instance API pour la cohérence (token dans l'URL, password dans le body)
            const res = await API.post('/auth/reset-password', {
                token,
                password
            });

            if (res.data.success) {
                setStatus({ type: 'success', msg: 'Mot de passe mis à jour ! Redirection vers la connexion...' });
                setTimeout(() => navigate('/login'), 3000);
            }
        } catch (err) {
            setStatus({ 
                type: 'error', 
                msg: err.response?.data?.error || 'Le lien a expiré ou est invalide.' 
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-page">
            <div className="auth-card">
                <div className="auth-header">
                    <h2>Nouveau mot de passe</h2>
                    <p>Sécurisez à nouveau votre accès ERP</p>
                </div>

                {status.msg && (
                    <div className={status.type === 'error' ? 'error-badge' : 'success-badge'} 
                         style={status.type === 'success' ? successStyle : {}}>
                        {status.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle size={18} />}
                        {status.msg}
                    </div>
                )}

                <form onSubmit={handleReset} className="auth-form">
                    <div className="input-group">
                        <Lock size={18} className="icon" />
                        <input 
                            type="password" 
                            placeholder="Nouveau mot de passe"
                            value={password}
                            onChange={(e) => {
                                if(status.msg) setStatus({type:'', msg:''});
                                setPassword(e.target.value);
                            }}
                            required
                            disabled={loading}
                        />
                    </div>

                    <div className="input-group">
                        <Lock size={18} className="icon" />
                        <input 
                            type="password" 
                            placeholder="Confirmer le mot de passe"
                            value={confirmPassword}
                            onChange={(e) => {
                                if(status.msg) setStatus({type:'', msg:''});
                                setConfirmPassword(e.target.value);
                            }}
                            required
                            disabled={loading}
                        />
                    </div>

                    <button type="submit" className="btn-primary" disabled={loading}>
                        {loading ? (
                            <span className="spinner"></span>
                        ) : (
                            <>
                                Valider le changement <ArrowRight size={18} />
                            </>
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
};

// Petit style rapide pour le badge de succès s'il n'est pas dans ton CSS
const successStyle = {
    background: '#f0fdf4',
    color: '#166534',
    padding: '12px',
    borderRadius: '10px',
    marginBottom: '20px',
    fontSize: '14px',
    textAlign: 'center',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    border: '1px solid #bbf7d0'
};

export default ResetPassword;