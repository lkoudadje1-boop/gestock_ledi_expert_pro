import React, { useState, useEffect } from 'react';
import { 
    FileSpreadsheet, FolderOpen, CheckCircle, 
    AlertTriangle, Loader2, ArrowRight, ShieldCheck, 
    UploadCloud, Download, Lock
} from 'lucide-react';
import API, { socket } from '../../services/api';

const SetupPlanComptable = ({ user, onFinished }) => {
    const [source, setSource] = useState('standard'); 
    const [typePlan, setTypePlan] = useState('ohada_mini');
    const [file, setFile] = useState(null);
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState('idle'); 
    const [message, setMessage] = useState('');
    const [isExporting, setIsExporting] = useState(false);
    
    // NOUVEAU : État de verrouillage si le plan n'est pas vide
    const [isLocked, setIsLocked] = useState(false);
    const [checkingPlan, setCheckingPlan] = useState(true);

    // 1. Vérifier si un plan existe déjà au chargement
    useEffect(() => {
        const checkExistingPlan = async () => {
            try {
                const res = await API.get('/plan-comptable/liste');
                if (res.data.success && res.data.data.length > 0) {
                    setIsLocked(true);
                    setStatus('success');
                    setMessage("Le plan comptable est déjà initialisé et verrouillé.");
                }
            } catch (err) {
                console.error("Erreur vérification plan:", err);
            } finally {
                setCheckingPlan(false);
            }
        };

        checkExistingPlan();

        if (socket) {
            socket.on('INITIALISATION_PROGRESS', (data) => {
                setProgress(data.percent);
                setStatus('loading');
            });

            socket.on('PLAN_COMPTABLE_PRET', (data) => {
                setStatus('success');
                setMessage(data.message);
                setProgress(100);
                setIsLocked(true); // Verrouiller après succès
                if (onFinished) setTimeout(onFinished, 2000);
            });

            return () => {
                socket.off('INITIALISATION_PROGRESS');
                socket.off('PLAN_COMPTABLE_PRET');
            };
        }
    }, [onFinished]);

/**
 * 1. EXPORT EN CSV (Protection contre la corruption binaire)
 */
const handleExport = async () => {
    setIsExporting(true);
    try {
        const response = await API.get('/plan-comptable/export', { responseType: 'blob' });
        
        // On force le type MIME en text/csv pour la sécurité
        const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        // Extension .csv pour une ouverture propre
        link.setAttribute('download', `Modele_Plan_Comptable.csv`); 
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        setStatus('success');
        setMessage("Modèle CSV exporté avec succès.");
    } catch (err) {
        console.error("Erreur export:", err);
        setStatus('error');
        setMessage("Erreur lors de la génération du CSV.");
    } finally {
        setIsExporting(false);
    }
};

/**
 * 2. INITIALISATION / IMPORTATION
 */
const handleInitialiser = async () => {
    if (isLocked) return; 
    setStatus('loading');
    setProgress(0);
    
    const formData = new FormData();
    formData.append('source', source); 
    formData.append('typePlan', typePlan); 
    
    if (source === 'upload') {
        if (!file) {
            setStatus('error');
            setMessage("Veuillez sélectionner un fichier CSV ou Excel.");
            return;
        }
        formData.append('file', file);
    }

    try {
        const res = await API.post('/plan-comptable/initialiser', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });

        if (res.data.success) {
            setStatus('success');
            setMessage(res.data.message);
            setProgress(100);
            setIsLocked(true);
            if (onFinished) setTimeout(onFinished, 1500);
        }
    } catch (err) {
        setStatus('error');
        // Affiche l'erreur du backend (ex: Problème de colonnes ou de verrous)
        setMessage(err.response?.data?.error || "Erreur lors de la configuration.");
    }
};
    if (checkingPlan) {
        return (
            <div style={{ textAlign: 'center', padding: '50px' }}>
                <Loader2 className="animate-spin" size={40} color="#2563eb" />
                <p style={{ fontWeight: '800', color: '#64748b', marginTop: '10px' }}>Vérification du référentiel...</p>
            </div>
        );
    }

    return (
        <div style={containerWrapperStyle}>
            <div style={cardStyle}>
                <div style={headerStyle}>
                    <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {isLocked ? <Lock color="#10b981" /> : <ShieldCheck color="#60a5fa" />} 
                        {isLocked ? "RÉFÉRENTIEL INITIALISÉ" : "INITIALISATION DU RÉFÉRENTIEL"}
                    </h2>
                    <p style={{ margin: '5px 0 0 0', fontSize: '13px', color: '#94a3b8', fontWeight: '600' }}>
                        {isLocked ? "Le plan est configuré. Pour le modifier, videz-le depuis la liste." : "Choisissez une méthode pour configurer vos comptes."}
                    </p>
                </div>

                <div style={{ padding: '30px', opacity: isLocked ? 0.7 : 1 }}>
                    {/* --- LES 3 BOUTONS ALIGNÉS --- */}
                    <div style={{ display: 'flex', gap: '12px', marginBottom: '30px' }}>
                        <button 
                            disabled={isLocked}
                            onClick={() => setSource('standard')}
                            style={source === 'standard' ? sourceBtnActiveStyle('#2563eb') : sourceBtnStyle}
                        >
                            <FolderOpen size={24} />
                            <span style={btnTextStyle}>MODÈLES STANDARDS</span>
                        </button>

                        <button 
                            disabled={isLocked}
                            onClick={() => setSource('upload')}
                            style={source === 'upload' ? sourceBtnActiveStyle('#10b981') : sourceBtnStyle}
                        >
                            <UploadCloud size={24} />
                            <span style={btnTextStyle}>IMPORTER EXCEL</span>
                        </button>

                        <button 
                            onClick={handleExport}
                            disabled={isExporting}
                            style={isExporting ? { ...sourceBtnStyle, opacity: 0.6 } : sourceBtnStyle}
                        >
                            {isExporting ? <Loader2 size={24} className="animate-spin" /> : <Download size={24} color="#f59e0b" />}
                            <span style={{ ...btnTextStyle, color: '#b45309' }}>EXPORTER / MODÈLE</span>
                        </button>
                    </div>

                    <div style={{ minHeight: '140px' }}>
                        {source === 'standard' ? (
                            <div style={{ marginBottom: '25px' }}>
                                <label style={labelStyle}>RÉFÉRENTIEL SÉLECTIONNÉ</label>
                                <select 
                                    disabled={isLocked} 
                                    value={typePlan} 
                                    onChange={(e) => setTypePlan(e.target.value)} 
                                    style={selectStyle}
                                >
                                    <option value="ohada_mini">SYSCOHADA (PME/PMI)</option>
                                    <option value="syscohada">SYSCOHADA RÉVISÉ (COMPLET)</option>
                                    <option value="france">PCG FRANCE</option>
                                    <option value="ifrs">NORMES INTERNATIONALES (IFRS)</option>
                                    <option value="us_gaap">US GAAP (USA)</option>
                                </select>
                            </div>
                        ) : (
                            <div style={{ ...dropZoneStyle, opacity: isLocked ? 0.5 : 1 }}>
                                <input 
                                    disabled={isLocked}
                                    type="file" 
                                    style={fileInputStyle} 
                                    onChange={(e) => setFile(e.target.files[0])}
                                    accept=".xlsx, .xls, .csv"
                                />
                                <FileSpreadsheet size={32} color={file ? '#10b981' : '#cbd5e1'} />
                                <div style={{ marginTop: '10px', fontWeight: '700', color: file ? '#065f46' : '#64748b', fontSize: '13px' }}>
                                    {file ? file.name : "Glissez ou cliquez pour charger votre fichier"}
                                </div>
                            </div>
                        )}
                    </div>

                    {status === 'loading' && (
                        <div style={progressContainerStyle}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <span style={{ fontSize: '11px', fontWeight: '900', color: '#2563eb' }}>TRAITEMENT...</span>
                                <span style={{ fontSize: '11px', fontWeight: '900', color: '#2563eb' }}>{progress}%</span>
                            </div>
                            <div style={progressBaseStyle}>
                                <div style={{ ...progressFillStyle, width: `${progress}%` }}></div>
                            </div>
                        </div>
                    )}

                    {status === 'success' && <div style={statusBannerStyle('#dcfce7', '#166534')}><CheckCircle size={18} /> {message}</div>}
                    {status === 'error' && <div style={statusBannerStyle('#fee2e2', '#991b1b')}><AlertTriangle size={18} /> {message}</div>}

                    <button 
                        onClick={handleInitialiser}
                        disabled={isLocked || status === 'loading' || (source === 'upload' && !file)}
                        style={{
                            ...submitBtnStyle, 
                            background: isLocked ? '#64748b' : '#0f172a',
                            opacity: (isLocked || status === 'loading') ? 0.6 : 1,
                            cursor: isLocked ? 'not-allowed' : 'pointer'
                        }}
                    >
                        {status === 'loading' ? <Loader2 className="animate-spin" /> : (isLocked ? <CheckCircle size={20} /> : <ArrowRight size={20} />)}
                        {status === 'loading' ? 'INITIALISATION...' : (isLocked ? 'RÉFÉRENTIEL DÉJÀ PRÊT' : 'CONFIRMER LA CONFIGURATION')}
                    </button>
                </div>
            </div>
        </div>
    );
};

// Styles (identiques au précédent avec quelques ajouts de confort)
const containerWrapperStyle = { maxWidth: '750px', margin: '20px auto' };
const cardStyle = { background: 'white', borderRadius: '20px', border: '1px solid #e2e8f0', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', overflow: 'hidden' };
const headerStyle = { background: '#0f172a', padding: '25px 30px', color: 'white' };
const sourceBtnStyle = { flex: 1, padding: '20px 10px', borderRadius: '16px', border: '2px solid #f1f5f9', background: 'white', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', color: '#64748b', transition: 'all 0.2s ease' };
const sourceBtnActiveStyle = (color) => ({ ...sourceBtnStyle, border: `2px solid ${color}`, background: `${color}05`, color: color, boxShadow: `0 4px 12px ${color}15` });
const btnTextStyle = { fontWeight: '800', fontSize: '12px' };
const labelStyle = { fontSize: '10px', fontWeight: '900', color: '#94a3b8', letterSpacing: '0.05em', marginBottom: '10px', display: 'block' };
const selectStyle = { width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none', fontWeight: '700', color: '#1e293b', fontSize: '14px', background: '#f8fafc' };
const dropZoneStyle = { border: '2px dashed #e2e8f0', borderRadius: '15px', padding: '25px', textAlign: 'center', position: 'relative', background: '#f8fafc' };
const fileInputStyle = { position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' };
const progressContainerStyle = { marginBottom: '20px', padding: '15px', background: '#eff6ff', borderRadius: '12px', border: '1px solid #dbeafe' };
const progressBaseStyle = { width: '100%', height: '6px', background: '#dbeafe', borderRadius: '10px', overflow: 'hidden' };
const progressFillStyle = { height: '100%', background: '#2563eb', transition: '0.3s ease' };
const statusBannerStyle = (bg, color) => ({ padding: '15px', borderRadius: '12px', background: bg, color: color, fontWeight: '800', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' });
const submitBtnStyle = { width: '100%', padding: '16px', color: 'white', border: 'none', borderRadius: '15px', fontWeight: '800', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px' };

export default SetupPlanComptable;