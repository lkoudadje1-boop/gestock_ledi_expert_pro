import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Barcode, User, CheckCircle, RefreshCw, Plus, Trash2, Calendar, Tag, Edit3, CheckSquare } from 'lucide-react';
import API from '../../services/api';
import Sidebar from '../../components/Sidebar';

const ListeTourneesCommerciales = () => {
    const navigate = useNavigate();
    const currentUser = useMemo(() => JSON.parse(localStorage.getItem('user') || '{}'), []);
    const COMPANY_ID = currentUser.company_id || 'CPY-1';

    // --- ÉTATS ---
    const [tournees, setTournees] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [alertMsg, setAlertMsg] = useState({ text: '', type: '' });
    
    // 🎯 État central pour contrôler l'ouverture et la fermeture du pop-up de suppression
    const [lotAAnnuler, setLotAAnnuler] = useState(null);

    // --- 🚀 ÉTATS POUR LE SYSTÈME DE DÉROULEMENT ---
    const [expandedTourId, setExpandedTourId] = useState(null); 
    const [detailsCache, setDetailsCache] = useState({});       
    const [loadingDetails, setLoadingDetails] = useState(false);

    // Toast de notification natif (Remplaçant des alert() systèmes)
    const showToast = useCallback((text, type = 'success') => {
        setAlertMsg({ text, type });
        setTimeout(() => setAlertMsg({ text: '', type: '' }), 3000);
    }, []);

    // --- 🎯 CHARGEMENT DES TOURNÉES COMMERCIALES ---
    const fetchTournees = useCallback(async () => {
        setLoading(true);
        try {
            const res = await API.get('/provisional-sales/commercial/list');
            if (Array.isArray(res.data)) {
                setTournees(res.data);
            } else {
                setTournees([]);
            }
        } catch (err) {
            console.error("Erreur chargement tournées:", err);
            showToast("Impossible de charger la liste des tournées", "error");
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    useEffect(() => {
        fetchTournees();
    }, [fetchTournees]);
    

    // --- 🔍 FILTRAGE DU TABLEAU EN TEMPS RÉEL ---
    const tourneesFiltrees = useMemo(() => {
        return tournees.filter(t => {
            const matchLot = String(t.lot_id || '').toLowerCase().includes(searchTerm.toLowerCase());
            const matchStaff = String(t.staff_name_snap || '').toLowerCase().includes(searchTerm.toLowerCase());
            return matchLot || matchStaff;
        });
    }, [tournees, searchTerm]);
 
    // Fonction de déroulement du contenu du camion
    const handleToggleLigneDetails = async (lotId) => {
        if (expandedTourId === lotId) {
            setExpandedTourId(null);
            return;
        }

        setExpandedTourId(lotId);

        if (detailsCache[lotId]) return;

        setLoadingDetails(true);
        try {
            const res = await API.get(`/provisional-sales/commercial/details/${lotId}`);
            if (Array.isArray(res.data)) {
                setDetailsCache(prev => ({ ...prev, [lotId]: res.data }));
            }
        } catch (err) {
            console.error("❌ Erreur chargement détails de la tournée :", err);
            showToast("Impossible de charger les détails du chargement", "error");
        } finally {
            setLoadingDetails(false);
        }
    };

    // 🎯 REQUÊTE AXIOS DE SUPPRESSION DÉFINITIVE (Déclenchée uniquement depuis le Pop-up)
   const handleAnnulerTourneeComplete = async (lotId) => {
    try {
        const res = await API.delete(`/provisional-sales/validate-commercial/cancel/${lotId}`);
        if (res.data.success) {
            showToast(`✅ La tournée ${lotId} a été annulée et les stocks ont été restaurés.`, "success");
            
            // 🎯 CORRECTIF DIRECT : On retire immédiatement la ligne de l'écran
            setTournees(prevTournees => prevTournees.filter(t => t.lot_id !== lotId));
        }
    } catch (err) {
        console.error("Erreur annulation lot:", err);
        showToast("❌ Erreur : " + (err.response?.data?.error || err.message), "error");
    } finally {
        setLotAAnnuler(null); // Ferme la boîte de dialogue
    }
};


    // --- 🚀 NAVIGATION VERS LA GRILLE D'ÉDITION ---
    const handleEditerMatin = (lotId) => {
        navigate(`/pos/commerciale-clients?edit=${lotId}&type=morning`);
    };

    const handleSaisirRetoursSoir = (lotId) => {
        navigate(`/pos/commerciale-clients?edit=${lotId}&mode=evening`);
    };

    // --- CONFIGURATION DES STYLES EN LIGNE ---
    const tableHeaderStyle = { backgroundColor: '#0f172a', color: '#fff', padding: '14px 12px', fontSize: '13px', fontWeight: '600', textAlign: 'left' };
    const tdStyle = { padding: '12px', borderBottom: '1px solid #e2e8f0', fontSize: '13px', color: '#334155', fontWeight: '500' };
    const btnActionStyle = { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '4px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', border: 'none', transition: 'all 0.2s' };

    return (
        <div style={{ display: 'flex', height: '100vh', backgroundColor: '#f8fafc', overflow: 'hidden' }}>
            <Sidebar />
            
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                
                {/* 🔔 Toast de Notification unique */}
                {alertMsg.text && (
                    <div style={{
                        position: 'fixed', top: '20px', right: '20px', zIndex: 9999, padding: '12px 24px', borderRadius: '6px',
                        backgroundColor: alertMsg.type === 'error' ? '#ef4444' : '#22c55e', color: '#fff', fontWeight: '700', boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                    }}>
                        {alertMsg.text}
                    </div>
                )}

                {/* 🌅 En-tête de Page */}
                <div style={{ backgroundColor: '#1e3a8a', padding: '20px 30px', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '800', letterSpacing: '0.5px' }}>
                            Suivi & Clôture des Tournées Commerciales
                        </h1>
                        <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#93c5fd', fontWeight: '500' }}>
                            Gérer les chargements du matin et valider les retours d'inventaires du soir.
                        </p>
                    </div>
                    <button onClick={fetchTournees} disabled={loading} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '8px 16px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: '600' }}>
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                        Rafraîchir
                    </button>
                </div>



                 {/* 🔍 Barre de Recherche */}
                <div style={{ padding: '20px 30px', backgroundColor: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '15px' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                        <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                        <input
                            type="text"
                            placeholder="Rechercher par N° de Tournée ou par Commercial..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ width: '100%', padding: '10px 10px 10px 38px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none' }}
                        />
                    </div>
                </div>

                {/* 📊 Tableau Principal */}
                <div style={{ flex: 1, padding: '30px', overflowY: 'auto' }}>
                    <div style={{ backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    <th style={tableHeaderStyle}>N° TOURNÉE / BON</th>
                                    <th style={tableHeaderStyle}>COMMERCIAL</th>
                                    <th style={tableHeaderStyle}>DATE DE DÉPART</th>
                                    <th style={{ ...tableHeaderStyle, textAlign: 'center' }}>VALEUR CHARGÉE</th>
                                    <th style={{ ...tableHeaderStyle, textAlign: 'center' }}>ACTIONS DE SUIVI DE FLUX</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan="5" style={{ ...tdStyle, textAlign: 'center', padding: '40px', color: '#64748b', fontStyle: 'italic' }}>
                                            Chargement des tournées en cours...
                                        </td>
                                    </tr>
                                ) : tourneesFiltrees.length === 0 ? (
                                    <tr>
                                        <td colSpan="5" style={{ ...tdStyle, textAlign: 'center', padding: '40px', color: '#64748b', fontStyle: 'italic' }}>
                                            Aucune tournée commerciale active trouvée.
                                        </td>
                                    </tr>
                                ) : (
                                    tourneesFiltrees.map((tournee, idx) => {
                                        const estDeployee = expandedTourId === tournee.lot_id;
                                        const lignesDetails = detailsCache[tournee.lot_id] || [];

                                        return (
                                            <React.Fragment key={tournee.lot_id}>
                                                {/* 🛒 LIGNE PRINCIPALE DE LA TOURNÉE */}
                                                <tr 
                                                    onClick={() => handleToggleLigneDetails(tournee.lot_id)}
                                                    style={{ 
                                                        backgroundColor: estDeployee ? '#f1f5f9' : (idx % 2 === 0 ? '#ffffff' : '#f8fafc'),
                                                        cursor: 'pointer',
                                                        borderLeft: estDeployee ? '4px solid #1e3a8a' : '4px solid transparent',
                                                        transition: 'all 0.15s ease'
                                                    }}
                                                >
                                                    <td style={{ ...tdStyle, fontWeight: '700', color: '#1e3a8a' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <Tag size={14} color="#64748b" />
                                                            {tournee.lot_id}
                                                        </div>
                                                    </td>
                                                    <td style={{ ...tdStyle, fontWeight: '600', color: '#0f172a' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <User size={14} color="#64748b" />
                                                            {tournee.staff_name_snap}
                                                        </div>
                                                    </td>
                                                    <td style={{ ...tdStyle, color: '#64748b' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <Calendar size={14} />
                                                            {tournee.date_tri ? new Date(tournee.date_tri).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                                                        </div>
                                                    </td>
                                                    <td style={{ ...tdStyle, textAlign: 'center', fontWeight: '700', color: '#0f172a' }}>
                                                        {Number(tournee.total || 0).toLocaleString()} F
                                                    </td>
                                                    <td style={{ ...tdStyle, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                                                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', alignItems: 'center' }}>
                                                            {/* 🌅 ACTION 1 : ÉDITER LE CHARGEMENT (MATIN) */}
                                                            <button
                                                                onClick={() => handleEditerMatin(tournee.lot_id)}
                                                                style={{ ...btnActionStyle, backgroundColor: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}
                                                                title="Ajouter ou modifier des articles au départ ce matin"
                                                            >
                                                                <Edit3 size={14} />
                                                                ÉDITER CHARGEMENT
                                                            </button>

                                                            {/* 🌌 ACTION 2 : COMPTABILISER LES RETOURS (SOIR) */}
                                                            <button
                                                                onClick={() => handleSaisirRetoursSoir(tournee.lot_id)}
                                                                style={{ ...btnActionStyle, backgroundColor: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' }}
                                                                title="Saisir les invendus du soir et valider le décompte financier"
                                                            >
                                                                <CheckSquare size={14} />
                                                                COMPTABILISER RETOURS
                                                            </button>

                                                            {/* ❌ ACTION 3 [NOUVEAU] : ANNULER ET SUPPRIMER INTÉGRALEMENT LE LOT */}
                                                            <button
                                                                onClick={() => setLotAAnnuler(tournee.lot_id)} // 🎯 Ouvre la boîte de dialogue interne
                                                                style={{ 
                                                                    ...btnActionStyle, 
                                                                    backgroundColor: '#fef2f2', 
                                                                    color: '#b91c1c', 
                                                                    border: '1px solid #fca5a5' 
                                                                }}
                                                                title="Annuler définitivement ce bon et recréditer tous les stocks au dépôt"
                                                            >
                                                                <Trash2 size={14} />
                                                                SUPPRIMER TOURNÉE
                                                            </button>
                                                        </div>
                                                    </td>


                                                </tr>
                                                {/* 🚀 SOUS-TABLEAU DÉROULANT : CONTENU DU VEHICULE */}
                                                {estDeployee && (
                                                    <tr>
                                                        <td colSpan="5" style={{ padding: '0px', backgroundColor: '#f8fafc', borderBottom: '1px solid #cbd5e1' }}>
                                                            <div style={{ padding: '15px 30px', borderLeft: '4px solid #1e3a8a' }}>
                                                                <p style={{ margin: '0 0 10px 0', fontSize: '12px', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                                    📦 Articles actuellement chargés dans le véhicule ({lignesDetails.length}) :
                                                                </p>
                                                                
                                                                {loadingDetails && lignesDetails.length === 0 ? (
                                                                    <p style={{ margin: 0, fontSize: '13px', color: '#64748b', fontStyle: 'italic' }}>Récupération des données du camion...</p>
                                                                ) : lignesDetails.length === 0 ? (
                                                                    <p style={{ margin: 0, fontSize: '13px', color: '#ef4444', fontStyle: 'italic' }}>Aucun article trouvé dans ce chargement.</p>
                                                                ) : (
                                                                    <div style={{ overflowX: 'auto', borderRadius: '6px', border: '1px solid #e2e8f0', backgroundColor: '#fff' }}>
                                                                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                                                            <thead>
                                                                                <tr style={{ backgroundColor: '#f1f5f9' }}>
                                                                                    <th style={{ padding: '8px 12px', fontSize: '11px', fontWeight: '700', color: '#475569', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>DÉSIGNATION PRODUIT</th>
                                                                                    <th style={{ padding: '8px 12px', fontSize: '11px', fontWeight: '700', color: '#475569', textAlign: 'center', borderBottom: '1px solid #e2e8f0' }}>QUANTITÉ INITIALE</th>
                                                                                    <th style={{ padding: '8px 12px', fontSize: '11px', fontWeight: '700', color: '#475569', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>P.U DÉTAIL</th>
                                                                                    <th style={{ padding: '8px 12px', fontSize: '11px', fontWeight: '700', color: '#475569', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>TOTAL TTC NET</th>
                                                                                </tr>
                                                                            </thead>
                                                                            <tbody>
                                                                                {lignesDetails.map((item, keyIdx) => {
                                                                                    const affichageQuantite = item.quantite_formatee || item.qte_formatee || `${item.quantite || 0} PCS`;
                                                                                    const designationProduit = item.nom_article_snap || item.nom || "Article inconnu";

                                                                                    return (
                                                                                        <tr key={item.id || keyIdx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                                                            <td style={{ padding: '8px 12px', fontSize: '12px', color: '#334155', fontWeight: '600' }}>
                                                                                                {designationProduit}
                                                                                            </td>
                                                                                            <td style={{ padding: '8px 12px', fontSize: '12px', color: '#1e3a8a', fontWeight: '700', textAlign: 'center' }}>
                                                                                                {affichageQuantite}
                                                                                            </td>
                                                                                            <td style={{ padding: '8px 12px', fontSize: '12px', color: '#475569', textAlign: 'right' }}>
                                                                                                {Math.round(item.prix_vente_unitaire || item.prix_unitaire || 0).toLocaleString()} F
                                                                                            </td>
                                                                                            <td style={{ padding: '8px 12px', fontSize: '12px', color: '#0f172a', fontWeight: '700', textAlign: 'right' }}>
                                                                                                {Math.round(item.montant_ttc_ligne || 0).toLocaleString()} F
                                                                                            </td>
                                                                                        </tr>
                                                                                    );
                                                                                })}
                                                                            </tbody>
                                                                        </table>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* 🎯 POP-UP DE CONFIRMATION DE SUPPRESSION FLUTÉ INTEGREE (ZÉRO WINDOW.ALERT) */}
            {lotAAnnuler && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(15, 23, 42, 0.6)', 
                    backdropFilter: 'blur(4px)', 
                    display: 'flex', justifyContent: 'center', alignItems: 'center',
                    zIndex: 9999
                }}>
                    <div style={{
                        backgroundColor: '#ffffff', padding: '24px 30px', borderRadius: '12px',
                        width: '450px', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.15), 0 10px 10px -5px rgb(0 0 0 / 0.04)',
                        border: '1px solid #e2e8f0', textAlign: 'center'
                    }}>
                        <div style={{
                            backgroundColor: '#fef2f2', width: '50px', height: '50px', borderRadius: '50%',
                            display: 'flex', justifyContent: 'center', alignItems: 'center', margin: '0 auto 16px auto',
                            border: '1px solid #fee2e2'
                        }}>
                            <Trash2 size={24} color="#ef4444" />
                        </div>

                        <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', margin: '0 0 8px 0' }}>
                            Attention, Action Critique !
                        </h3>
                        
                        <p style={{ fontSize: '14px', color: '#475569', margin: '0 0 24px 0', lineHeight: '1.5' }}>
                            Voulez-vous vraiment supprimer définitivement la tournée <strong style={{color: '#0f172a'}}>{lotAAnnuler}</strong> ? <br />
                            <span style={{color: '#dc2626', fontWeight: '600'}}>Cette action va recréditer automatiquement toutes les marchandises au dépôt.</span>
                        </p>

                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                            <button
                                onClick={() => setLotAAnnuler(null)} 
                                style={{
                                    padding: '10px 20px', backgroundColor: '#f1f5f9', color: '#334155',
                                    border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer',
                                    fontWeight: '600', fontSize: '13px'
                                }}
                            >
                                CONSERVER LA TOURNÉE
                            </button>
                                                        <button
                                onClick={() => handleAnnulerTourneeComplete(lotAAnnuler)} 
                                style={{
                                    padding: '10px 20px', 
                                    backgroundColor: '#dc2626', 
                                    color: '#ffffff',
                                    border: 'none', 
                                    borderRadius: '6px', 
                                    cursor: 'pointer',
                                    fontWeight: '700', 
                                    fontSize: '13px',
                                    boxShadow: '0 4px 6px -1px rgb(220 38 38 / 0.2)'
                                }}
                            >
                                OUI, SUPPRIMER LE LOT
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ListeTourneesCommerciales;
