import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Save, ArrowLeft, AlertCircle, Loader2, RefreshCw, Image as ImageIcon } from 'lucide-react';
import API from '../../services/api';
import socket from '../../services/socket'; 
import Sidebar from '../../components/Sidebar';

const ArticleEdit = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [formData, setFormData] = useState(null);
    const [isOutdated, setIsOutdated] = useState(false); 

    // 1. Récupération des données
    const fetchArticle = async () => {
        try {
            setLoading(true);
            const response = await API.get(`/products/${id}`);
            setFormData(response.data);
            setIsOutdated(false);
            setError(null);
        } catch (err) {
            setError("Impossible de charger les données.");
        } finally {
            setLoading(false);
        }
    };

   useEffect(() => {
    if (id) fetchArticle();

    const handleUpdate = (event) => {
        const { table, id: impactedId } = event.detail;
        // Si l'article en cours d'édition est modifié par quelqu'un d'autre
        if (table === 'products' && String(impactedId) === String(id)) {
            setIsOutdated(true); 
            showToast("Cet article a été modifié ailleurs", "info");
        }
    };

    window.addEventListener('ERP_DATA_CHANGED', handleUpdate);
    return () => window.removeEventListener('ERP_DATA_CHANGED', handleUpdate);
}, [id]);

    // 3. Calcul automatique
    const handlePriceUpdate = (field, value) => {
        const val = parseFloat(value) || 0;
        let newFormData = { ...formData, [field]: val };

        if (field === 'cmp' || field === 'margeTaux') {
            const nouveauPrix = newFormData.cmp * (1 + (newFormData.margeTaux / 100));
            newFormData.prixVente = Math.round(nouveauPrix);
        } else if (field === 'prixVente') {
            if (newFormData.cmp > 0) {
                newFormData.margeTaux = ((val - newFormData.cmp) / newFormData.cmp) * 100;
            }
        }
        setFormData(newFormData);
    };

    // 4. Sauvegarde
    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            await API.put(`/products/${id}`, {
                ...formData,
                nom: formData.nom.toUpperCase(),
                sync_status: 'pending'
            });
            socket.emit('ARTICLE_UPDATED', { id, nom: formData.nom });
            
            alert("Article mis à jour !");
            navigate('/admin/articles');
        } catch (err) {
            alert("Erreur lors de la mise à jour");
        }
    };

    if (loading) return <div style={{display:'flex', justifyContent:'center', alignItems:'center', height:'100vh', background:'#f1f5f9'}}><Loader2 className="animate-spin" /> <span style={{marginLeft:'10px', fontWeight:'800'}}>Chargement...</span></div>;
    if (error) return <div style={{color:'red', padding:'20px', display:'flex', alignItems:'center', gap:'10px'}}><AlertCircle /> {error}</div>;

    return (
        <div style={{ display: 'flex', height: '100vh', background: '#f1f5f9' }}>
            <Sidebar />
            <main style={{ flex: 1, padding: '40px', overflowY: 'auto' }}>
                
                {/* Alerte si modification externe */}
                {isOutdated && (
                    <div style={s.outdatedAlert}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <RefreshCw size={20} className="animate-spin" />
                            <span>Cet article a été modifié par un autre utilisateur ou le système.</span>
                        </div>
                        <button onClick={fetchArticle} style={s.refreshBtn}>Actualiser les données</button>
                    </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '30px' }}>
                    <button onClick={() => navigate(-1)} style={s.backBtn}><ArrowLeft size={20} /></button>
                    <h1 style={s.title}>Modifier l'article : <span style={{color: '#2563eb'}}>{formData.nom}</span></h1>
                </div>

                <form onSubmit={handleSubmit} style={s.card}>
                    <div style={s.grid}>
                        
                        {/* Section Image */}
                        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '20px', alignItems: 'center', background: '#f8fafc', padding: '20px', borderRadius: '12px', marginBottom: '10px' }}>
                            <div style={s.imagePreview}>
                                {formData.image_url ? (
                                    <img src={formData.image_url} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                    <ImageIcon size={40} color="#cbd5e1" />
                                )}
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={s.label}>URL DE L'IMAGE</label>
                                <input 
                                    style={s.input} 
                                    placeholder="https://exemple.com/image.jpg"
                                    value={formData.image_url || ''} 
                                    onChange={e => setFormData({...formData, image_url: e.target.value})}
                                />
                            </div>
                        </div>

                        <div style={{ gridColumn: '1 / -1' }}>
                            <label style={s.label}>DÉSIGNATION</label>
                            <input 
                                style={s.input} 
                                value={formData.nom} 
                                onChange={e => setFormData({...formData, nom: e.target.value})}
                                required 
                            />
                        </div>

                        <div>
                            <label style={s.label}>PRIX ACHAT (CMP)</label>
                            <input 
                                type="number" 
                                style={s.input} 
                                value={formData.cmp} 
                                onChange={e => handlePriceUpdate('cmp', e.target.value)} 
                            />
                        </div>

                        <div>
                            <label style={s.label}>MARGE (%)</label>
                            <input 
                                type="number" 
                                style={s.input} 
                                value={formData.margeTaux} 
                                onChange={e => handlePriceUpdate('margeTaux', e.target.value)} 
                            />
                        </div>

                        <div style={{ background: '#f0f9ff', padding: '15px', borderRadius: '8px' }}>
                            <label style={{...s.label, color: '#0369a1'}}>PRIX DE VENTE PUBLIC</label>
                            <input 
                                type="number" 
                                style={{...s.input, borderColor: '#bae6fd', fontSize: '20px', fontWeight: '900', color: '#0369a1'}} 
                                value={formData.prixVente} 
                                onChange={e => handlePriceUpdate('prixVente', e.target.value)} 
                            />
                        </div>

                        <div>
                            <label style={s.label}>FAMILLE / CATÉGORIE</label>
                            <input 
                                style={s.input} 
                                value={formData.famille || ''} 
                                onChange={e => setFormData({...formData, famille: e.target.value})} 
                            />
                        </div>

                        <div>
                            <label style={s.label}>CONDITIONNEMENT</label>
                            <input 
                                style={s.input} 
                                value={formData.conditionnement || ''} 
                                onChange={e => setFormData({...formData, conditionnement: e.target.value})} 
                            />
                        </div>

                        <div>
                            <label style={s.label}>STOCK ALERTE</label>
                            <input 
                                type="number"
                                style={s.input} 
                                value={formData.stock_alerte || 0} 
                                onChange={e => setFormData({...formData, stock_alerte: e.target.value})} 
                            />
                        </div>
                    </div>

                    <div style={{ marginTop: '30px', display: 'flex', justifyContent: 'flex-end' }}>
                        <button type="submit" style={s.saveBtn}>
                            <Save size={18} /> Enregistrer les modifications
                        </button>
                    </div>
                </form>
            </main>
        </div>
    );
};

const s = {
    title: { margin: 0, fontSize: '24px', fontWeight: '900' },
    card: { background: 'white', padding: '30px', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', maxWidth: '900px' },
    grid: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' },
    label: { display: 'block', fontSize: '11px', fontWeight: '800', color: '#64748b', marginBottom: '8px' },
    input: { width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px', fontWeight: '600' },
    backBtn: { border: 'none', background: 'white', padding: '10px', borderRadius: '10px', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' },
    saveBtn: { display: 'flex', alignItems: 'center', gap: '10px', padding: '15px 30px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '10px', fontWeight: '800', cursor: 'pointer' },
    imagePreview: { width: '100px', height: '100px', borderRadius: '12px', background: 'white', border: '2px dashed #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    outdatedAlert: { background: '#fff7ed', color: '#9a3412', padding: '15px 20px', borderRadius: '12px', border: '1px solid #ffedd5', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: '700', fontSize: '14px' },
    refreshBtn: { background: '#9a3412', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '12px' }
};

export default ArticleEdit;