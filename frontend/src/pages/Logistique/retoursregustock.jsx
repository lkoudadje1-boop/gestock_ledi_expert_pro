import React, { useState } from 'react';
import { 
    RotateCcw, Search, AlertTriangle, Save, RefreshCcw, 
    PackageX, ClipboardList, ArrowLeft
} from 'lucide-react';
import API from '../../services/api';
import Sidebar from '../../components/Sidebar';
import { toast } from 'react-toastify';

const RetoursReguStock = () => {
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedAchat, setSelectedAchat] = useState(null);
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [motif, setMotif] = useState("RETOUR_FOURNISSEUR");

    // --- RECHERCHE DE LA FACTURE ---
    const handleSearch = async () => {
        if (!searchQuery.trim()) return;
        setLoading(true);
        try {
            // Ajustement de l'URL pour correspondre à ton backend
            const res = await API.get(`/purchases/search?q=${searchQuery}`);
            if (res.data && res.data.items && res.data.items.length > 0) {
                setSelectedAchat(res.data.header);
                setItems(res.data.items.map(i => ({
                    ...i,
                    qte_retour: 0,
                    error: ""
                })));
            } else {
                toast.error("Aucun achat trouvé pour ce numéro.");
            }
        } catch (err) {
            toast.error("Erreur lors de la recherche de la facture.");
        } finally {
            setLoading(false);
        }
    };

    // --- GESTION DES QUANTITÉS (SÉCURITÉ CONTRÔLE DE GESTION) ---
    const updateQty = (id, val) => {
        const value = parseFloat(val) || 0;
        setItems(prev => prev.map(item => {
            if (item.id === id) {
                let error = "";
                if (value > item.qte_achetee) error = "Dépasse l'achat original";
                if (value > item.stock_actuel) error = "Dépasse le stock en rayon";
                if (value < 0) error = "Quantité invalide";
                return { ...item, qte_retour: value, error };
            }
            return item;
        }));
    };

    // --- VALIDATION FINALE ---
    const submitRetour = async () => {
        const toSubmit = items.filter(i => i.qte_retour > 0);
        
        if (toSubmit.length === 0) {
            return toast.warning("Veuillez saisir au moins une quantité à retourner.");
        }
        
        if (toSubmit.some(i => i.error)) {
            return toast.error("Veuillez corriger les erreurs de stock (quantités rouges) avant de valider.");
        }

        try {
            setLoading(true);
            await API.post('/approvisionnement/retour', {
                header: {
                    id_achat_original: selectedAchat.id,
                    supplier_id: selectedAchat.supplier_id,
                    motif: motif,
                    date_operation: new Date().toISOString()
                },
                items: toSubmit
            });
            
            toast.success("Retour validé ! Stock et compte fournisseur mis à jour.");
            // Reset
            setSelectedAchat(null);
            setItems([]);
            setSearchQuery("");
        } catch (err) {
            toast.error(err.response?.data?.error || "Erreur lors du traitement comptable.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={layoutStyle}>
            <Sidebar />
            <main style={mainStyle}>
                <header style={headerBarStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div style={iconBox}><RotateCcw size={24} color="#fff" /></div>
                        <div>
                            <h1 style={titleStyle}>RETOURS & RÉGULARISATIONS</h1>
                            <div style={infoLabel}>Module de gestion des retours marchandises</div>
                        </div>
                    </div>
                </header>

                <div style={contentArea}>
                    {/* BARRE DE RECHERCHE */}
                    <div style={searchCard}>
                        <div style={inputGroup}>
                            <Search size={18} color="#64748b" />
                            <input 
                                style={searchInput} 
                                placeholder="Scanner ou saisir N° Facture Achat..." 
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                            />
                        </div>
                        <button onClick={handleSearch} style={btnSearch} disabled={loading}>
                            {loading ? <RefreshCcw className="animate-spin" /> : "TROUVER L'ACHAT"}
                        </button>
                    </div>

                    {selectedAchat ? (
                        <div style={workspaceGrid}>
                            {/* LISTE DES ARTICLES */}
                            <div style={tableContainer}>
                                <div style={tableHeaderInfo}>
                                    <h3 style={sectionTitle}><ClipboardList size={16}/> ARTICLES DE LA FACTURE : {selectedAchat.num_facture}</h3>
                                    <span style={supplierBadge}>{selectedAchat.nom_fournisseur_snap}</span>
                                </div>
                                <table style={mainTable}>
                                    <thead>
                                        <tr style={thStyle}>
                                            <th style={thLeft}>ARTICLE</th>
                                            <th style={thCenter}>ACHETÉ</th>
                                            <th style={thCenter}>EN STOCK</th>
                                            <th style={thCenter}>À RETOURNER</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {items.map(item => (
                                            <tr key={item.id} style={trStyle}>
                                                <td style={tdStyle}>
                                                    <div style={{fontWeight: '900'}}>{item.nom_article_snap}</div>
                                                    <div style={{fontSize: '10px', color: '#64748b'}}>REF: {item.product_id}</div>
                                                </td>
                                                <td style={{...tdCenter, fontWeight: '800'}}>{item.qte_achetee}</td>
                                                <td style={tdCenter}>
                                                    <span style={item.stock_actuel < item.qte_retour ? stockBadgeError : stockBadgeOk}>
                                                        {item.stock_actuel}
                                                    </span>
                                                </td>
                                                <td style={tdCenter}>
                                                    <input 
                                                        type="number" 
                                                        style={item.error ? qtyInputError : qtyInput} 
                                                        value={item.qte_retour}
                                                        onChange={(e) => updateQty(item.id, e.target.value)}
                                                    />
                                                    {item.error && <div style={errorText}>{item.error}</div>}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* VALIDATION COMPTABLE */}
                            <div style={sidePanel}>
                                <h3 style={sectionTitle}>ACTION</h3>
                                <div style={formGroup}>
                                    <label style={labelStyle}>MOTIF DU RETOUR</label>
                                    <select style={selectStyle} value={motif} onChange={(e) => setMotif(e.target.value)}>
                                        <option value="RETOUR_FOURNISSEUR">Retour Fournisseur (Non-conforme)</option>
                                        <option value="CASSE">Casse / Avarie</option>
                                        <option value="PERIME">Produit Périmé</option>
                                        <option value="ERREUR_SAISIE">Correction d'inventaire</option>
                                    </select>
                                </div>

                                <div style={warningBox}>
                                    <AlertTriangle size={20} color="#9a3412" />
                                    <p style={{fontSize: '11px', color: '#9a3412', margin: 0}}>
                                        <b>Impact :</b> Le stock sera réduit et un avoir sera généré sur le compte fournisseur.
                                    </p>
                                </div>

                                <button onClick={submitRetour} style={btnSubmit} disabled={loading}>
                                    <Save size={18} /> VALIDER LE RETOUR
                                </button>
                                
                                <button onClick={() => setSelectedAchat(null)} style={btnCancel}>
                                    <ArrowLeft size={16} /> REFAIRE LA RECHERCHE
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div style={emptyState}>
                            <PackageX size={48} color="#cbd5e1" />
                            <p>Saisissez un numéro de facture pour gérer un retour.</p>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

// --- STYLES ---
const layoutStyle = { display: 'flex', height: '100vh', background: '#F1F5F9' };
const mainStyle = { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' };
const headerBarStyle = { background: '#fff', padding: '16px 24px', borderBottom: '3px solid #0f172a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
const iconBox = { background: '#f59e0b', padding: '8px', borderRadius: '8px', boxShadow: '0 4px 0 #92400e' };
const titleStyle = { margin: 0, fontSize: '18px', fontWeight: '900', color: '#000', textTransform: 'uppercase' };
const infoLabel = { fontSize: '12px', color: '#64748b', fontWeight: '700' };
const contentArea = { padding: '24px', overflowY: 'auto' };
const searchCard = { background: '#fff', padding: '20px', borderRadius: '12px', border: '2px solid #0f172a', marginBottom: '24px', display: 'flex', gap: '15px', alignItems: 'center', boxShadow: '4px 4px 0 #0f172a' };
const inputGroup = { flex: 1, display: 'flex', alignItems: 'center', gap: '10px', background: '#f1f5f9', padding: '10px 15px', borderRadius: '8px', border: '2px solid #cbd5e1' };
const searchInput = { border: 'none', background: 'transparent', outline: 'none', width: '100%', fontWeight: '800', fontSize: '14px' };
const btnSearch = { background: '#0f172a', color: '#fff', padding: '12px 24px', borderRadius: '8px', border: 'none', fontWeight: '900', cursor: 'pointer' };
const workspaceGrid = { display: 'grid', gridTemplateColumns: '1fr 320px', gap: '24px' };
const tableContainer = { background: '#fff', borderRadius: '12px', border: '2px solid #0f172a', overflow: 'hidden', boxShadow: '4px 4px 0 #cbd5e1' };
const tableHeaderInfo = { padding: '15px', borderBottom: '2px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' };
const supplierBadge = { background: '#0f172a', color: '#fff', padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: '800' };
const mainTable = { width: '100%', borderCollapse: 'collapse' };
const thStyle = { background: '#f1f5f9', borderBottom: '2px solid #0f172a' };
const thLeft = { padding: '12px', textAlign: 'left', fontSize: '11px', fontWeight: '900', textTransform: 'uppercase' };
const thCenter = { ...thLeft, textAlign: 'center' };
const trStyle = { borderBottom: '1px solid #f1f5f9' };
const tdStyle = { padding: '15px 12px', fontSize: '13px' };
const tdCenter = { ...tdStyle, textAlign: 'center' };
const qtyInput = { width: '80px', padding: '8px', borderRadius: '6px', border: '2px solid #0f172a', textAlign: 'center', fontWeight: '900' };
const qtyInputError = { ...qtyInput, border: '2px solid #ef4444', background: '#fef2f2' };
const errorText = { color: '#ef4444', fontSize: '10px', fontWeight: '800', marginTop: '4px' };
const sidePanel = { background: '#fff', padding: '24px', borderRadius: '12px', border: '2px solid #0f172a', height: 'fit-content', boxShadow: '6px 6px 0 #f59e0b' };
const sectionTitle = { fontSize: '13px', fontWeight: '900', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' };
const formGroup = { marginBottom: '20px' };
const labelStyle = { display: 'block', fontSize: '11px', fontWeight: '900', marginBottom: '8px', color: '#64748b' };
const selectStyle = { width: '100%', padding: '10px', borderRadius: '8px', border: '2px solid #cbd5e1', fontWeight: '800' };
const warningBox = { background: '#fff7ed', border: '1px dashed #f59e0b', padding: '12px', borderRadius: '8px', marginBottom: '20px' };
const btnSubmit = { width: '100%', background: '#f59e0b', color: '#fff', padding: '15px', borderRadius: '8px', border: 'none', fontWeight: '900', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', boxShadow: '0 4px 0 #92400e', marginBottom: '10px' };
const btnCancel = { width: '100%', background: '#f1f5f9', color: '#64748b', padding: '10px', borderRadius: '8px', border: 'none', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' };
const stockBadgeOk = { background: '#dcfce7', color: '#166534', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '800' };
const stockBadgeError = { background: '#fef2f2', color: '#991b1b', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '800' };
const emptyState = { textAlign: 'center', padding: '100px 0', color: '#94a3b8', fontWeight: '800' };

export default RetoursReguStock;