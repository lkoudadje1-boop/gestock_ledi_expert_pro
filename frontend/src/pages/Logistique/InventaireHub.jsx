import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, History, FileText, ArrowLeft, Loader2, XCircle, ChevronRight, AlertTriangle, CheckCircle } from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import { getUserPermissions } from '../../utils/permissions_utils'; // 🔑 IMPORTATION DU SÉCURISEUR

const InventaireHub = () => {
    const navigate = useNavigate();
    
    // 🔑 CONVERSION DU SÉCURISEUR : EXTRACTION COHÉRENTE DES DROITS DE BOUTONS SANS CRASH
    const userPerms = useMemo(() => getUserPermissions(), []);
    
    const canCreateInventory = userPerms['log_inventory_create'] === true || userPerms['log_inventory_create'] === 1 || userPerms['log_inventory_create'] === 'true' || userPerms['log_inventory_create'] === '1';
    const canCancelInventory = userPerms['log_inventory_cancel'] === true || userPerms['log_inventory_cancel'] === 1 || userPerms['log_inventory_cancel'] === 'true' || userPerms['log_inventory_cancel'] === '1';

    // 🛡️ ANCRE DE SÉCURITÉ POUR LES STYLES COMPOSANTS EN BAS DE PAGE
    const localUserJson = localStorage.getItem('user') || localStorage.getItem('currentUser');
    const connectedUser = localUserJson ? JSON.parse(localUserJson) : null;
    const isAdmin = connectedUser?.role?.toUpperCase() === 'ADMIN'; 

    const [activeInventory, setActiveInventory] = useState(null);
    const [loading, setLoading] = useState(true);

    // État pour le Modal personnalisé
    const [modal, setModal] = useState({
        show: false,
        title: '',
        message: '',
        onConfirm: null,
        type: 'confirm' // 'confirm', 'success' ou 'error'
    });

   const checkActiveInventory = useCallback(async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('http://localhost:3030/api/inventories/active', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success && data.inventory) {
                setActiveInventory(data.inventory);
            } else {
                setActiveInventory(null);
            }
        } catch (err) {
            console.error("Erreur de vérification:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    // ✅ LOGIQUE SYNC TEMPS RÉEL (SNC)
    useEffect(() => {
        // Chargement initial
        checkActiveInventory();

        const handleGlobalUpdate = (event) => {
            const data = event.detail;
            const tableName = data?.table || data;

            // Si un inventaire est ouvert, annulé ou validé ailleurs
            if (tableName === 'inventory' || tableName === 'all') {
                console.log("⚡ [HUB-INVENTAIRE] Mise à jour de l'état actif...");
                checkActiveInventory();
            }
        };

        window.addEventListener('ERP_DATA_CHANGED', handleGlobalUpdate);

        return () => {
            window.removeEventListener('ERP_DATA_CHANGED', handleGlobalUpdate);
        };
    }, [checkActiveInventory]);

    // Fonction pour ouvrir le modal au lieu de window.confirm/alert
    const showAlert = (title, message, onConfirm, type = 'confirm') => {
        setModal({ show: true, title, message, onConfirm, type });
    };

    const closeExal = () => setModal({ ...modal, show: false });

    const handleAnnulerInventaire = (e) => {
        e.stopPropagation();
        
        // 🔑 SÉCURITÉ COMPTABLE : Seul le profil détenant log_inventory_cancel peut annuler
        if (!canCancelInventory) {
            return showAlert("Accès Refusé", "⚠️ Droits insuffisants. Votre profil ne possède pas l'autorisation d'annuler un inventaire général en cours.", null, 'error');
        }

        showAlert(
            "Annulation d'inventaire", 
            "⚠️ ATTENTION : Voulez-vous vraiment annuler l'inventaire en cours ? Les données seront dégelées.",
            confirmAnnulation
        );
    };

    const confirmAnnulation = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('http://localhost:3030/api/inventories/cancel', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify({ inventory_id: activeInventory.id })
            });
            const data = await res.json();
            if (data.success) {
                setActiveInventory(null);
                closeExal();
                showAlert("Succès", "L'inventaire a été annulé avec succès.", null, 'success');
            }
        } catch (err) {
            showAlert("Erreur", "Une erreur est survenue lors de l'annulation.", null, 'error');
        }
    };

    const handleDemarrerOuContinuer = () => {
        if (activeInventory) {
            // Si l'inventaire est actif, on vérifie si l'utilisateur a le droit de continuer la saisie
            if (!canCreateInventory) {
                return showAlert("Accès Refusé", "⚠️ Droits insuffisants. Vous ne possédez pas l'autorisation d'accéder à la saisie de l'inventaire actif.", null, 'error');
            }
            navigate('/logistique/inventaire/saisie');
            return;
        }

        // 🔑 SÉCURITÉ DE DEMARRAGE STRICTE : Seul le profil détenant log_inventory_create peut démarrer
        if (!canCreateInventory) {
            return showAlert("Accès Refusé", "⚠️ Droits insuffisants. Vous devez posséder le privilège requis pour ouvrir une session d'inventaire générale et geler les opérations de la société.", null, 'error');
        }

        showAlert(
            "Nouvel Inventaire", 
            "Démarrer un nouvel inventaire ? Cela gèlera les modifications de données (ventes, stocks, etc.).",
            confirmCreation
        );
    };

    const confirmCreation = async () => {
        try {
            const token = localStorage.getItem('token');
            const user = JSON.parse(localStorage.getItem('user'));
            const newInventoryId = `INV-${Date.now()}`;

            const res = await fetch('http://localhost:3030/api/inventories/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    id: newInventoryId,
                    libelle: `Inventaire du ${new Date().toLocaleDateString()}`,
                    type_inventaire: 'GENERAL',
                    user_id: user.id,
                    company_id: user.company_id
                })
            });

            const data = await res.json();
            
            if (data.success) {
                navigate('/logistique/inventaire/saisie');
            } else {
                showAlert(
                    "Action Refusée", 
                    data.message || "Impossible de démarrer l'inventaire, veuillez clôturer vos ventes en cours.", 
                    null, 
                    'error'
                );
            }
        } catch (err) {
            console.error(err);
            showAlert(
                "Erreur", 
                "Une erreur réseau est survenue lors de la création de l'inventaire.", 
                null, 
                'error'
            );
        }
    };

   return (
        <div style={{ display: 'flex', height: '100vh', background: '#0f172a' }}>
            <Sidebar />
            <main style={{ flex: 1, background: '#f1f5f9', padding: '30px', overflowY: 'auto' }}>
                
                {/* MODAL PERSONNALISÉ */}
                {modal.show && (
                    <div style={modalOverlayStyle}>
                        <div style={modalContentStyle}>
                            <div style={{ 
                                marginBottom: '15px', 
                                color: modal.type === 'confirm' ? '#f59e0b' : modal.type === 'success' ? '#22c55e' : '#dc2626' 
                            }}>
                                {modal.type === 'confirm' && <AlertTriangle size={48} />}
                                {modal.type === 'success' && <CheckCircle size={48} />}
                                {modal.type === 'error' && <XCircle size={48} />}
                            </div>
                            <h3 style={{ margin: '0 0 10px 0', color: modal.type === 'error' ? '#991b1b' : '#1e293b' }}>{modal.title}</h3>
                            <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '25px', whiteSpace: 'pre-line' }}>{modal.message}</p>
                            <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                                {modal.type === 'confirm' ? (
                                    <>
                                        <button onClick={closeExal} style={btnCancelStyle}>Annuler</button>
                                        <button onClick={modal.onConfirm} style={btnConfirmStyle}>Confirmer</button>
                                    </>
                                ) : (
                                    <button 
                                        onClick={closeExal} 
                                        style={{ 
                                            ...btnConfirmStyle, 
                                            background: modal.type === 'error' ? '#dc2626' : '#1e293b' 
                                        }}
                                    >
                                        D'accord
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                <div style={{ marginBottom: '30px', display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <button onClick={() => navigate(-1)} style={backBtnStyle}><ArrowLeft size={20} /></button>
                    <h2 style={{ margin: 0, color: '#1e293b', fontWeight: '800' }}>Gestion de l'Inventaire</h2>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '25px' }}>
                    
                    {/* CARTE DE DÉMARRAGE / SAISIE INVENTAIRE SÉCURISÉE PAR BOUTON GRANULAIRE */}
                    <div 
                        style={{ 
                            ...cardStyle, 
                            border: activeInventory ? '2px solid #22c55e' : '1px solid #e2e8f0',
                            // 🔑 GRISAGE GRAPHIQUE COMPTABLE : Basé sur le privilège de création/saisie de bouton
                            opacity: (!canCreateInventory && !activeInventory) ? 0.6 : 1,
                            cursor: (!canCreateInventory && !activeInventory) ? 'not-allowed' : 'pointer'
                        }} 
                        onClick={handleDemarrerOuContinuer}
                    >
                        {loading ? <Loader2 className="animate-spin" size={32} /> : (
                            <>
                                <div style={{ 
                                    ...iconCircle, 
                                    background: activeInventory ? '#dcfce7' : ((!canCreateInventory && !activeInventory) ? '#f8fafc' : '#f1f5f9'), 
                                    color: activeInventory ? '#16a34a' : '#64748b' 
                                }}>
                                    <Play size={32} fill={activeInventory ? "#16a34a" : "none"} />
                                </div>
                                <h3 style={cardTitle}>
                                    {activeInventory ? "Inventaire en cours" : (!canCreateInventory ? "Démarrer (Restreint)" : "Démarrer un inventaire")}
                                </h3>
                                <p style={cardDesc}>
                                    {activeInventory 
                                        ? `Ouvert le ${new Date(activeInventory.created_at).toLocaleDateString()}. Système gelé.`
                                        : (!canCreateInventory ? "Permissions requises pour lancer un contrôle de stock." : "Geler les opérations pour compter les articles.")}
                                </p>
                                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    <button 
                                        style={{ 
                                            ...btnActionStyle, 
                                            background: (!canCreateInventory && !activeInventory) ? '#94a3b8' : '#22c55e',
                                            cursor: (!canCreateInventory && !activeInventory) ? 'not-allowed' : 'pointer'
                                        }}
                                        disabled={!canCreateInventory && !activeInventory}
                                    >
                                        {activeInventory ? "Continuer la saisie" : "Lancer la saisie"} <ChevronRight size={18} />
                                    </button>
                                    
                                    {/* 🔑 MASQUAGE DYNAMIQUE DU BOUTON D'ANNULATION : Soumis à son propre droit log_inventory_cancel */}
                                    {activeInventory && canCancelInventory && (
                                        <button onClick={handleAnnulerInventaire} style={btnAnnulerStyle}>
                                            <XCircle size={16} /> Annuler l'inventaire
                                        </button>
                                    )}
                                </div>
                            </>
                        )}
                    </div>

                    <div style={cardStyle} onClick={() => navigate('/logistique/historique-inventaire')}>
                        <div style={{ ...iconCircle, background: '#dbeafe', color: '#2563eb' }}><History size={32} /></div>
                        <h3 style={cardTitle}>Historique & Rapports</h3>
                        <p style={cardDesc}>Consulter les anciens inventaires et les écarts.</p>
                        <button style={{ ...btnActionStyle, background: '#3b82f6' }}>Voir les archives</button>
                    </div>

                    <div style={cardStyle} onClick={() => navigate('/admin/articles/list')}>
                        <div style={{ ...iconCircle, background: '#fef3c7', color: '#d97706' }}><FileText size={32} /></div>
                        <h3 style={cardTitle}>État des Stocks</h3>
                        <p style={cardDesc}>Visualiser les quantités théoriques actuelles.</p>
                        <button style={{ ...btnActionStyle, background: '#f59e0b' }}>Consulter</button>
                    </div>
                </div>
            </main>
        </div>
    );
};


// Styles pour le Modal et la page
const modalOverlayStyle = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(4px)' };
const modalContentStyle = { background: 'white', padding: '30px', borderRadius: '20px', width: '100%', maxWidth: '400px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' };
const btnConfirmStyle = { flex: 1, padding: '12px', border: 'none', borderRadius: '10px', background: '#1e293b', color: 'white', fontWeight: 'bold', cursor: 'pointer' };
const btnCancelStyle = { flex: 1, padding: '12px', border: '1px solid #e2e8f0', borderRadius: '10px', background: 'white', color: '#64748b', fontWeight: 'bold', cursor: 'pointer' };

const cardStyle = { background: 'white', padding: '30px', borderRadius: '20px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', cursor: 'pointer', transition: 'transform 0.2s' };
const iconCircle = { width: '70px', height: '70px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' };
const cardTitle = { margin: '0 0 10px 0', fontSize: '18px', color: '#1e293b', fontWeight: '700' };
const cardDesc = { fontSize: '13px', color: '#64748b', marginBottom: '25px', minHeight: '40px' };
const btnActionStyle = { border: 'none', color: 'white', padding: '12px', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' };
const btnAnnulerStyle = { background: 'white', color: '#dc2626', border: '1px solid #dc2626', padding: '10px', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' };
const backBtnStyle = { border: 'none', background: 'white', padding: '8px', borderRadius: '8px', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' };

export default InventaireHub;
