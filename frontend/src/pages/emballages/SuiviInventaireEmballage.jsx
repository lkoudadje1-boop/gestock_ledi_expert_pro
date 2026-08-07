import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, History, FileText, ArrowLeft, Loader2, XCircle, ChevronRight, AlertTriangle, CheckCircle } from 'lucide-react';
import Sidebar from '../../components/Sidebar';

const SuiviInventaireEmballage = () => {
    const navigate = useNavigate();
    const [activeInventory, setActiveInventory] = useState(null);
    const [loading, setLoading] = useState(true);

    const [modal, setModal] = useState({
        show: false,
        title: '',
        message: '',
        onConfirm: null,
        type: 'confirm'
    });

    const checkActiveInventory = useCallback(async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('http://localhost:3030/api/inventaireemb/active', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                const data = await res.json();
                setActiveInventory(data.success ? data.inventory : null);
            }
        } catch (err) {
            console.error("Erreur chargement inventaire:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        checkActiveInventory();
    }, [checkActiveInventory]);

    const showAlert = (title, message, onConfirm, type = 'confirm') => {
        setModal({ show: true, title, message, onConfirm, type });
    };

    const closeExal = () => setModal({ ...modal, show: false });

   const confirmAnnulation = async () => {
    // Vérification de sécurité avant l'appel
    if (!activeInventory || !activeInventory.id) {
        showAlert("Erreur", "Aucun inventaire actif détecté pour l'annulation.", null, 'success');
        return;
    }

    try {
        const res = await fetch('http://localhost:3030/api/inventaireemb/cancel', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}` 
            },
            body: JSON.stringify({ 
                inventory_id: activeInventory.id // Assurez-vous que cette valeur existe
            })
        });
        
        const data = await res.json();
        
        if (data.success) {
            setActiveInventory(null);
            closeExal();
            showAlert("Succès", "L'inventaire emballages a été annulé.", null, 'success');
        } else {
            // Afficher l'erreur retournée par le serveur
            console.error("Réponse serveur:", data);
            showAlert("Erreur", data.error || "Impossible d'annuler.", null, 'success');
        }
    } catch (err) {
        console.error("Erreur réseau:", err);
        showAlert("Erreur", "Erreur de communication avec le serveur.", null, 'success');
    }
};

    const confirmCreation = async () => {
        try {
            const user = JSON.parse(localStorage.getItem('user'));
            const res = await fetch('http://localhost:3030/api/inventaireemb/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({
                    id: `INV-EMB-${Date.now()}`,
                    libelle: `Inventaire Emballages du ${new Date().toLocaleDateString()}`,
                    user_id: user.id,
                    company_id: user.company_id
                })
            });
            const data = await res.json();
            if (data.success) {
                navigate('/emballages/inventaire/saisie');
            }
        } catch (err) {
            showAlert("Erreur", "Impossible de créer l'inventaire.", null, 'success');
        }
    };

    const handleDemarrerOuContinuer = () => {
        if (activeInventory) {
            navigate('/emballages/inventaire/saisie');
        } else {
            showAlert(
                "Nouvel Inventaire Emballages", 
                "Démarrer un nouvel inventaire des emballages ? Cela gèlera les mouvements de contenants.",
                confirmCreation
            );
        }
    };

    return (
        <div style={{ display: 'flex', height: '100vh', background: '#1e293b' }}>
            <Sidebar />
            <main style={{ flex: 1, background: '#f8fafc', padding: '30px', overflowY: 'auto' }}>
                {modal.show && (
                    <div style={modalOverlayStyle}>
                        <div style={modalContentStyle}>
                            <div style={{ marginBottom: '15px', color: modal.type === 'confirm' ? '#f59e0b' : '#0d9488' }}>
                                {modal.type === 'confirm' ? <AlertTriangle size={48} /> : <CheckCircle size={48} />}
                            </div>
                            <h3 style={{ margin: '0 0 10px 0', color: '#0f172a' }}>{modal.title}</h3>
                            <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '25px' }}>{modal.message}</p>
                            <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                                {modal.type === 'confirm' ? (
                                    <>
                                        <button onClick={closeExal} style={btnCancelStyle}>Annuler</button>
                                        <button onClick={modal.onConfirm} style={btnConfirmStyle}>Confirmer</button>
                                    </>
                                ) : (
                                    <button onClick={closeExal} style={btnConfirmStyle}>D'accord</button>
                                )}
                            </div>
                        </div>
                    </div>
                )}
                
                <div style={{ marginBottom: '30px', display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <button onClick={() => navigate(-1)} style={backBtnStyle}><ArrowLeft size={20} /></button>
                    <h2 style={{ margin: 0, color: '#0f172a', fontWeight: '800' }}>Suivi des Inventaires Emballages</h2>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '25px' }}>
                    <div style={{ ...cardStyle, border: activeInventory ? '2px solid #0d9488' : '1px solid #e2e8f0' }} onClick={handleDemarrerOuContinuer}>
                        {loading ? <Loader2 className="animate-spin" size={32} /> : (
                            <>
                                <div style={{ ...iconCircle, background: activeInventory ? '#ccfbf1' : '#f1f5f9', color: activeInventory ? '#0d9488' : '#64748b' }}>
                                    <Play size={32} fill={activeInventory ? "#0d9488" : "none"} />
                                </div>
                                <h3 style={cardTitle}>{activeInventory ? "Saisie Emballages en cours" : "Lancer un inventaire"}</h3>
                                <p style={cardDesc}>
                                    {activeInventory 
                                        ? `Ouvert le ${new Date(activeInventory.created_at).toLocaleDateString()}.`
                                        : "Faire le point physique sur les palettes et casiers."}
                                </p>
                                <button style={{ ...btnActionStyle, background: '#0d9488' }}>
                                    {activeInventory ? "Continuer la saisie" : "Lancer la saisie"} <ChevronRight size={18} />
                                </button>
                                {activeInventory && (
                                    <button onClick={(e) => { e.stopPropagation(); showAlert("Annuler ?", "Voulez-vous vraiment annuler ?", confirmAnnulation); }} style={btnAnnulerStyle}>
                                        <XCircle size={16} /> Annuler l'inventaire
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
};

// --- STYLES ---
const modalOverlayStyle = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(4px)' };
const modalContentStyle = { background: 'white', padding: '30px', borderRadius: '20px', width: '100%', maxWidth: '400px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' };
const btnConfirmStyle = { flex: 1, padding: '12px', border: 'none', borderRadius: '10px', background: '#0f172a', color: 'white', fontWeight: 'bold', cursor: 'pointer' };
const btnCancelStyle = { flex: 1, padding: '12px', border: '1px solid #e2e8f0', borderRadius: '10px', background: 'white', color: '#64748b', fontWeight: 'bold', cursor: 'pointer' };
const cardStyle = { background: 'white', padding: '30px', borderRadius: '20px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', cursor: 'pointer' };
const iconCircle = { width: '70px', height: '70px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' };
const cardTitle = { margin: '0 0 10px 0', fontSize: '18px', color: '#0f172a', fontWeight: '700' };
const cardDesc = { fontSize: '13px', color: '#64748b', marginBottom: '25px' };
const btnActionStyle = { border: 'none', color: 'white', padding: '12px', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' };
const btnAnnulerStyle = { marginTop: '10px', background: 'white', color: '#dc2626', border: '1px solid #dc2626', padding: '10px', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' };
const backBtnStyle = { border: 'none', background: 'white', padding: '8px', borderRadius: '8px', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' };

export default SuiviInventaireEmballage;