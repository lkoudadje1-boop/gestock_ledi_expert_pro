import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { 
    Search, Trash2, Loader2, RefreshCcw, ArrowRightCircle, RotateCcw 
} from 'lucide-react';
import API, { socket } from '../../services/api'; 
import Sidebar from '../../components/Sidebar';

const RetourFournisseur = () => {
    // --- ÉTATS ---
    const [allFactures, setAllFactures] = useState([]); 
    const [filterText, setFilterText] = useState(''); 
    const [factureOriginale, setFactureOriginale] = useState(null); 
    const [selectedItem, setSelectedItem] = useState(null); 
    const [panierRetour, setPanierRetour] = useState([]); 
    const [motif, setMotif] = useState('RETOUR_FOURNISSEUR'); 
    const [qteSaisie, setQteSaisie] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [alertMsg, setAlertMsg] = useState({ text: '', type: '' });

    const showToast = useCallback((text, type = 'success') => {
        setAlertMsg({ text, type });
        setTimeout(() => setAlertMsg({ text: '', type: '' }), 3000);
    }, []);

    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    const COMPANY_ID = currentUser.company_id || 'CPY-1';

    // --- FETCH : Liste des factures d'achat ---
    const fetchInitialPurchases = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await API.get(`/purchases/recent?company_id=${COMPANY_ID}`);
            setAllFactures(Array.isArray(res.data) ? res.data : []);
        } catch (err) {
            showToast("Erreur de chargement des factures", "error");
        } finally { 
            setIsLoading(false); 
        }
    }, [COMPANY_ID, showToast]);

    useEffect(() => {
        fetchInitialPurchases();
    }, [fetchInitialPurchases]);

    const filteredFactures = useMemo(() => {
        return allFactures.filter(f => 
            f.num_facture?.toLowerCase().includes(filterText.toLowerCase()) ||
            f.fournisseur?.toLowerCase().includes(filterText.toLowerCase())
        );
    }, [allFactures, filterText]);

    const handleSelectFacture = async (fac) => {
        setIsLoading(true);
        try {
            const res = await API.get(`/purchases/details/${fac.num_facture}`);
            setFactureOriginale({ ...fac, lignes: res.data.items });
            setSelectedItem(null);
            setPanierRetour([]);
        } catch (err) {
            showToast("Erreur lors de la récupération des détails", "error");
        } finally { 
            setIsLoading(false); 
        }
    };

    const validerVersRecap = () => {
        if (!selectedItem || qteSaisie <= 0 || qteSaisie > selectedItem.qte_achetee) {
            showToast("Quantité invalide (max: " + selectedItem.qte_achetee + ")", "error");
            return;
        }

        // Calcul du montant au prorata pour l'avoir
        const prixUnitaireCout = (Number(selectedItem.montant_facture_ligne) || 0) / selectedItem.qte_achetee;
        const mtAvoirLigne = prixUnitaireCout * qteSaisie;

        const nouvelleLigne = {
            ...selectedItem,
            motif_retour: motif,
            qte_a_retourner: qteSaisie,
            montant_avoir_ligne: mtAvoirLigne
        };

        setPanierRetour(prev => [
            ...prev.filter(i => i.id !== selectedItem.id), 
            nouvelleLigne
        ]);
        setSelectedItem(null);
        setQteSaisie(0);
    };

    const totalAvoir = panierRetour.reduce((sum, item) => sum + (Number(item.montant_avoir_ligne) || 0), 0);

    const finaliserRetour = async () => {
        if (panierRetour.length === 0 || isSaving) return;
        
        if (!window.confirm("Confirmer le retour de ces articles au fournisseur ?")) return;

        setIsSaving(true);
        try {
            const payload = {
                header: {
                    num_facture_origine: factureOriginale.num_facture,
                    id_fournisseur: factureOriginale.id_fournisseur,
                    motif: motif,
                    total_avoir: totalAvoir,
                    staff_id: currentUser.id,
                    company_id: COMPANY_ID
                },
                items: panierRetour
            };

            const res = await API.post('/approvisionnement/retour', payload);
            if (res.status === 200 || res.data.success) {
                showToast("Retour fournisseur enregistré avec succès !");
                setFactureOriginale(null);
                setPanierRetour([]);
                fetchInitialPurchases();
                socket?.emit('stock_changed', { companyId: COMPANY_ID });
            }
        } catch (err) {
            showToast(err.response?.data?.message || "Erreur d'enregistrement", "error");
        } finally { 
            setIsSaving(false); 
        }
    };

    return (
        <div style={layoutStyle}>
            {alertMsg.text && (
                <div style={{ ...toastStyle, background: alertMsg.type === 'error' ? '#EF4444' : '#0F172A' }}>
                    {alertMsg.text}
                </div>
            )}
            <Sidebar />
            <main style={mainStyle}>
                
                {/* ZONE 1 : FACTURES DISPONIBLES */}
                <section style={colZone}>
                    <div style={{...cardHeader, background: '#f59e0b'}}>1. ACHATS RÉCENTS</div>
                    <div style={searchBox}>
                        <Search size={14} color="#94a3b8" />
                        <input 
                            style={minimalInput} 
                            placeholder="N° Facture ou Fournisseur..." 
                            value={filterText} 
                            onChange={e => setFilterText(e.target.value)}
                        />
                    </div>
                    <div style={listContainer}>
                        {isLoading && <div style={{textAlign:'center', padding:'20px'}}><Loader2 className="animate-spin" /></div>}
                        {filteredFactures.map((f, idx) => (
                            <div 
                                key={idx} 
                                style={{ 
                                    ...itemLot, 
                                    background: factureOriginale?.num_facture === f.num_facture ? '#FFF7ED' : 'transparent' 
                                }} 
                                onClick={() => handleSelectFacture(f)}
                            >
                                <div style={{ fontWeight: 'bold', fontSize: '12px' }}>{f.num_facture}</div>
                                <div style={{ fontSize: '11px', color: '#64748b' }}>{f.fournisseur}</div>
                                <div style={{ fontSize: '10px', color: '#94a3b8' }}>{f.date}</div>
                            </div>
                        ))}
                    </div>
                </section>

                <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    {/* ZONE 2 : ARTICLES DE LA FACTURE ACHAT */}
                    <section style={colZone}>
                        <div style={{...cardHeader, background: '#f59e0b'}}>2. ARTICLES REÇUS : {factureOriginale?.num_facture || '---'}</div>
                        <div style={{ flex: 1, overflowY: 'auto' }}>
                            <table style={fullTable}>
                                <thead>
                                    <tr>
                                        <th style={thMain}>DESIGNATION</th>
                                        <th style={thMain}>QTE ACHETÉE</th>
                                        <th style={thMain}>MONTANT LIGNE</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {factureOriginale?.lignes?.map((l, idx) => (
                                        <tr key={idx} onClick={() => { setSelectedItem(l); setQteSaisie(l.qte_achetee); }} style={{cursor: 'pointer'}}>
                                            <td style={tdMain}>{l.nom_article_snap || l.nom_article}</td>
                                            <td style={tdMain}>{l.qte_achetee}</td>
                                            <td style={{...tdMain, textAlign: 'right', fontWeight: 'bold'}}>
                                                {Number(l.montant_facture_ligne || 0).toLocaleString()} F
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {selectedItem && (
                            <div style={{...actionPanel, borderTop: '2px solid #f59e0b'}}>
                                <div style={{ flex: 1 }}>
                                    <label style={labelStyle}>MOTIF DE RETOUR</label>
                                    <select style={inputForm} value={motif} onChange={e => setMotif(e.target.value)}>
                                        <option value="RETOUR_FOURNISSEUR">ERREUR LIVRAISON</option>
                                        <option value="CASSE">CASSE / AVARIE</option>
                                        <option value="PERIME">PRODUIT PÉRIMÉ</option>
                                    </select>
                                </div>
                                <div style={{ width: '100px' }}>
                                    <label style={labelStyle}>QTÉ RETOUR</label>
                                    <input type="number" style={inputForm} value={qteSaisie} onChange={e => setQteSaisie(Number(e.target.value))} />
                                </div>
                                <button onClick={validerVersRecap} style={{...btnAction, background: '#f59e0b'}}>
                                    RETOURNER <ArrowRightCircle size={16} />
                                </button>
                            </div>
                        )}
                    </section>

                    {/* ZONE 3 : RÉCAPITULATIF RETOURS */}
                    <section style={colZone}>
                        <div style={{...cardHeader, background: '#f59e0b'}}>3. RÉCAPITULATIF DES ARTICLES À RETOURNER</div>
                        <div style={{ flex: 1, overflowY: 'auto' }}>
                            <table style={fullTable}>
                                <thead>
                                    <tr>
                                        <th style={thMain}>DESIGNATION</th>
                                        <th style={thMain}>QTE</th>
                                        <th style={{...thMain, textAlign: 'right'}}>AVOIR ESTIMÉ</th>
                                        <th style={thMain}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {panierRetour.map((item, idx) => (
                                        <tr key={idx}>
                                            <td style={tdMain}>{item.nom_article_snap || item.nom_article}</td>
                                            <td style={tdMain}>{item.qte_a_retourner}</td>
                                            <td style={{...tdMain, textAlign: 'right', fontWeight: 'bold'}}>
                                                {Number(item.montant_avoir_ligne).toLocaleString()} F
                                            </td>
                                            <td style={tdMain}>
                                                <Trash2 size={14} color="#ef4444" onClick={() => setPanierRetour(p => p.filter((_,i)=> i!==idx))} style={{cursor:'pointer'}}/>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div style={footerValidation}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={labelStyle}>TOTAL AVOIR FOURNISSEUR :</span>
                                <div style={{...totalValue, color: '#f59e0b'}}>{totalAvoir.toLocaleString()} F</div>
                            </div>
                            <button 
                                disabled={panierRetour.length === 0 || isSaving} 
                                onClick={finaliserRetour} 
                                style={{...btnFinal, background: '#f59e0b'}}
                            >
                                {isSaving ? <Loader2 className="animate-spin" /> : "VALIDER LE RETOUR EN STOCK"}
                            </button>
                        </div>
                    </section>
                </div>
            </main>
        </div>
    );
};

// --- STYLES (Conservés pour la cohérence visuelle) ---
const layoutStyle = { display: 'flex', height: '100vh', background: '#F8FAFC' };
const mainStyle = { flex: 1, padding: '15px', display: 'flex', gap: '15px', overflow: 'hidden' };
const colZone = { flex: 1, background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', overflow: 'hidden' };
const cardHeader = { padding: '10px', color: '#fff', fontSize: '11px', fontWeight: 'bold', textAlign: 'center' };
const searchBox = { display: 'flex', padding: '10px', background: '#F1F5F9', alignItems: 'center', gap: '10px' };
const listContainer = { flex: 1, overflowY: 'auto' };
const itemLot = { padding: '10px', borderBottom: '1px solid #F1F5F9', cursor: 'pointer' };
const fullTable = { width: '100%', borderCollapse: 'collapse' };
const thMain = { padding: '10px', background: '#F8FAFC', fontSize: '10px', color: '#64748b', borderBottom: '1px solid #E2E8F0', textAlign: 'left' };
const tdMain = { padding: '10px', fontSize: '11px', borderBottom: '1px solid #F1F5F9' };
const actionPanel = { padding: '15px', background: '#F8FAFC', display: 'flex', gap: '10px', alignItems: 'flex-end' };
const inputForm = { width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #CBD5E1', fontSize: '12px' };
const btnAction = { padding: '10px 20px', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', gap: '8px', fontWeight: 'bold' };
const footerValidation = { padding: '15px', borderTop: '1px solid #E2E8F0', background: '#F8FAFC' };
const totalValue = { fontSize: '20px', fontWeight: 'bold' };
const btnFinal = { width: '100%', marginTop: '10px', padding: '12px', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' };
const labelStyle = { fontSize: '9px', fontWeight: 'bold', color: '#64748b', display: 'block', marginBottom: '4px' };
const minimalInput = { flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: '12px' };
const toastStyle = { position: 'fixed', top: '20px', right: '20px', padding: '12px 20px', color: '#fff', borderRadius: '4px', zIndex: 1000 };

export default RetourFournisseur;