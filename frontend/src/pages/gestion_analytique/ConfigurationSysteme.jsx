import React, { useState, useEffect } from 'react';
import { Monitor, Copy, CheckCircle, RefreshCw } from 'lucide-react';
import API from '../../services/api';

const ConfigurationSysteme = () => {
    const [config, setConfig] = useState({ themeToken: '', version: '' });
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        fetchSystemConfig();
    }, []);

    const fetchSystemConfig = async () => {
        try {
            setLoading(true);
            // On appelle notre route camouflée
            const response = await API.get('/settings/ui-config');
            if (response.data.success) {
                setConfig(response.data.config);
            }
        } catch (err) {
            console.error("Erreur de récupération de la config");
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(config.themeToken);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="settings-card">
            <div className="settings-header">
                <h3><Monitor size={20} /> Configuration du Système</h3>
                <p>Informations relatives à votre instance locale de LEDI EXPERT PRO</p>
            </div>

            <div className="settings-body">
                <div className="info-box">
                    <label>Identifiant d'instance (Tag de préférence)</label>
                    <div className="id-display-container">
                        <code>{loading ? "Génération..." : config.themeToken}</code>
                        <button onClick={handleCopy} className="btn-icon" title="Copier l'identifiant">
                            {copied ? <CheckCircle size={18} color="#48bb78" /> : <Copy size={18} />}
                        </button>
                    </div>
                    <small>Veuillez transmettre ce code à votre administrateur pour l'activation des modules.</small>
                </div>

                <div className="status-section">
                    <div className="status-item">
                        <span>Version du logiciel :</span>
                        <strong>{config.version}</strong>
                    </div>
                    <div className="status-item">
                        <span>État de la licence :</span>
                        <span className="badge-expired">Vérification requise</span>
                    </div>
                </div>

                <div className="license-upload-zone">
                    <h4>Importer un fichier de configuration (.lic)</h4>
                    <input type="file" id="license-file" className="file-input" />
                    <label htmlFor="license-file" className="btn-secondary">
                        Choisir le fichier
                    </label>
                </div>
            </div>
        </div>
    );
};

export default ConfigurationSysteme;