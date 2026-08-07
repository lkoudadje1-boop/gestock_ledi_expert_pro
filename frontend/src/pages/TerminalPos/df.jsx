import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, Barcode, User, CheckCircle, RefreshCw, Plus, Trash2 } from 'lucide-react';
import API from '../../services/api';
import Sidebar from '../../components/Sidebar';
import { ConversionStockService } from '../../utils/converisonstock';
import { useSearchParams } from 'react-router-dom';

const GrilleTourneeCommercialeUnique = () => {
    const currentUser = useMemo(() => JSON.parse(localStorage.getItem('user') || '{}'), []);
    const COMPANY_ID = currentUser.company_id || 'CPY-1';
    const USER_ID = currentUser.id || 'USR-1';

    const [searchParams] = useSearchParams();
    const lotIdAEditer = searchParams.get('edit'); // Détecte si on est en mode édition du soir

    // --- ÉTATS DONNÉES & FILTRES ---
    const [articles, setArticles] = useState([]);
    const [allStaff, setAllStaff] = useState([]);
    const [selectedStaffId, setSelectedStaffId] = useState('');
    
    // Filtres pour la zone de sélection du catalogue
    const [searchTerm, setSearchTerm] = useState('');
    const [searchBarCode, setSearchBarCode] = useState('');
    const [selectedArt, setSelectedArt] = useState(null);

    // Inputs temporaires pour l'ajout du matin
    const [qteGrosSaisie, setQteGrosSaisie] = useState('');
    const [qteDetailSaisie, setQteDetailSaisie] = useState('');

    // --- ÉTATS DE LA FEUILLE DE ROUTE DYNAMIQUE ---
    const [panierTournee, setPanierTournee] = useState([]); // Lignes actives du tableau
    const [saisiesRetour, setSaisiesRetour] = useState({});   // { prod_id: string } (Saisie du soir)
    
    const [currentTourId, setCurrentTourId] = useState(`TOUR-${Date.now().toString().slice(-6)}`);
    const [isModeEdition, setIsModeEdition] = useState(false);
    const [loading, setLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [alertMsg, setAlertMsg] = useState({ text: '', type: '' });

    const showToast = useCallback((text, type = 'success') => {
        setAlertMsg({ text, type });
        setTimeout(() => setAlertMsg({ text: '', type: '' }), 3000);
    }, []);

    // Chargement initial du catalogue
    const fetchCatalogue = useCallback(async () => {
        try {
            const res = await API.get('/products');
            setArticles(Array.isArray(res.data) ? res.data : []);
        } catch (err) {
            console.error("Erreur catalogue:", err);
        }
    }, []);
    // --- CHARGEMENT INITIAL GLOBAL (CATALOGUE + STAFF) ---
    useEffect(() => {
        const fetchInitialData = async () => {
            setLoading(true);
            try {
                await fetchCatalogue();
                const resStaff = await API.get('/staff');
                setAllStaff(Array.isArray(resStaff.data) ? resStaff.data : []);
            } catch (err) {
                console.error("Erreur chargement données:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchInitialData();
    }, [fetchCatalogue]);

    // --- LOGIQUE DE CHARGEMENT D'UNE TOURNÉE EXISTANTE (LE SOIR) ---
    const chargerTourneePourDecompte = useCallback(async (lotId) => {
        try {
            setLoading(true);
            // Récupération des lignes provisoires commerciales enregistrées le matin
            const res = await API.get(`/provisional-sales/provisional/${lotId}`);
            
            if (res.data && res.data.length > 0) {
                const lignesAdaptees = res.data.map(item => {
                    const trueCoeff = Math.abs(Number(item.unit_coefficient || item.coefficient || 1)) || 1;
                    const qtePiecesDepart = Math.abs(Number(item.quantite || 0)); // Pièces ramenées du matin

                    return {
                        id: item.id,
                        product_id: item.product_id,
                        nom: String(item.nom_article_snap || item.nom_article || '').toUpperCase(),
                        prix_vente: Math.abs(Number(item.prix_vente_unitaire || item.prix_unitaire || 0)),
                        coeff: trueCoeff,
                        qte_chargee_pieces: qtePiecesDepart,
                        expression_charge: ConversionStockService.toExpressionTextuelle(qtePiecesDepart, item),
                        isFromDatabase: true // Verrouille la ligne en mode "Soir / Retour"
                    };
                });

                setPanierTournee(lignesAdaptees);
                setCurrentTourId(lotId);
                setIsModeEdition(true);

                if (res.data[0]?.staff_id) setSelectedStaffId(res.data[0].staff_id);
                showToast(`Tournée du matin ${lotId} chargée pour décompte`, "success");
            } else {
                showToast("Fiche de tournée vide ou introuvable", "error");
            }
        } catch (err) {
            console.error("Erreur chargement tournée:", err);
            showToast("Impossible de charger la tournée", "error");
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    // Analyse du paramètre d'URL au montage
    useEffect(() => {
        if (lotIdAEditer) {
            chargerTourneePourDecompte(lotIdAEditer);
        } else {
            setPanierTournee([]);
            setIsModeEdition(false);
        }
    }, [lotIdAEditer, chargerTourneePourDecompte]);

    // --- MOTEUR FILTRE POUR LA SÉLECTION DU CATALOGUE ---
    const filteredArticles = useMemo(() => {
        return articles.filter(art => {
            const nom = (art.nom || '').toLowerCase();
            const code = (art.code_barre || art.barcode || '').toLowerCase();
            return nom.includes(searchTerm.toLowerCase()) && code.includes(searchBarCode.toLowerCase());
        });
    }, [articles, searchTerm, searchBarCode]);

    // --- ACTION : AJOUTER UNE LIGNE DE CHARGEMENT (LE MATIN) ---
    const handleAjouterAuChargement = () => {
        if (!selectedArt) return;

        const gros = parseFloat(qteGrosSaisie) || 0;
        const detail = parseFloat(qteDetailSaisie) || 0;
        const coeff = selectedArt.coefficient || selectedArt.unit_coefficient || 1;
        const totalPiecesChargees = Math.round(gros * coeff) + Math.round(detail);

        if (totalPiecesChargees <= 0) {
            showToast("❌ Veuillez saisir une quantité valide à charger.", "error");
            return;
        }

        const indexExistant = panierTournee.findIndex(item => item.product_id === selectedArt.id);
        if (indexExistant !== -1) {
            showToast("💡 Cet article est déjà dans la liste du départ.", "error");
            return;
        }

        const newItem = {
            product_id: selectedArt.id,
            nom: selectedArt.nom.toUpperCase(),
            prix_vente: Number(selectedArt.prixVente || selectedArt.prix_vente || 0),
            qte_chargee_pieces: totalPiecesChargees,
            coeff: coeff,
            expression_charge: ConversionStockService.toExpressionTextuelle(totalPiecesChargees, selectedArt),
            isFromDatabase: false
        };

        setPanierTournee([...panierTournee, newItem]);
        setSelectedArt(null);
        setQteGrosSaisie('');
        setQteDetailSaisie('');
        setSearchTerm('');
    };
    // --- 📊 CALCUL DYNAMIQUE DES 3 COLONNES EN TEMPS RÉEL ---
    const panierConsolide = useMemo(() => {
        return panierTournee.map(item => {
            const charge = item.qte_chargee_pieces;

            // Décodage de la chaîne de saisie du retour (ex: "1+4" ou "5") en pièces natives unitaires
            const retourPieces = ConversionStockService.toPieces(saisiesRetour[item.product_id] || '0', item);

            // Calcul de la Vente Définitive (Départ - Retour)
            // Sécurité : pas de vente négative si le retour saisi est supérieur au départ
            const venduPieces = charge > 0 ? Math.max(0, charge - retourPieces) : 0;
            const totalTtcLigne = venduPieces * item.prix_vente;

            return {
                ...item,
                venduPieces,
                totalTtcLigne,
                // Formatage textuel pour l'affichage logistique clair à l'écran
                retourText: saisiesRetour[item.product_id] || '',
                venduFormatee: venduPieces > 0 ? ConversionStockService.toExpressionTextuelle(venduPieces, item) : '0 UNITÉ'
            };
        });
    }, [panierTournee, saisiesRetour]);

    // Somme cumulée de la recette financière
    const recetteTotaleAEncaisser = useMemo(() => {
        return panierConsolide.reduce((sum, item) => sum + item.totalTtcLigne, 0);
    }, [panierConsolide]);

    // --- ACTION : BOUTON S'ADAPTANT AUTOMATIQUEMENT (SAUVEGARDE MATIN / VALIDATION SOIR) ---
    const handleActionPrincipaleGrille = async () => {
        if (panierTournee.length === 0 || isSaving) return;
        
        if (!selectedStaffId) {
            showToast("❌ Veuillez sélectionner un commercial.", "error");
            return;
        }

        setIsSaving(true);
        try {
            const staff = allStaff.find(s => String(s.id) === String(selectedStaffId));

            if (!isModeEdition) {
                // 🌅 LOGIQUE DU MATIN : Enregistrement PROVISOIRE du chargement
                const payloadMatin = {
                    staff_id: selectedStaffId,
                    staff_name: staff ? staff.name : "Commercial",
                    lot_id: currentTourId,
                    is_commercial_provisoire: true, // Marqueur pour le backend
                    lignes: panierTournee.map(item => ({
                        product_id: item.product_id,
                        nom_article_snap: item.nom,
                        quantite: item.qte_chargee_pieces, // On stocke la quantité de départ en pièces natives
                        prix_vente_unitaire: item.prix_vente,
                        montant_ttc_ligne: item.qte_chargee_pieces * item.prix_vente
                    }))
                };

                const res = await API.post('/provisional-sales', payloadMatin);
                if (res.data.success) {
                    showToast(`✅ Chargement du matin enregistré sous le numéro ${currentTourId}`, "success");
                    setPanierTournee([]);
                    setSelectedStaffId('');
                }
            } else {
                // 🌌 LOGIQUE DU SOIR : Clôture, déstockage réel et FACTURATION FINALE
                const payloadSoir = {
                    lot_id: currentTourId,
                    staff_id: selectedStaffId,
                    staff_name: staff ? staff.name : "Commercial",
                    lignes: panierConsolide.map(item => ({
                        product_id: item.product_id,
                        nom_article_snap: item.nom,
                        quantite: item.venduPieces, // Envoi des pièces réellement vendues pour déstockage SQLite
                        prix_vente_unitaire: item.prix_vente,
                        montant_ttc_ligne: item.totalTtcLigne
                    }))
                };

                const res = await API.post('/provisional-sales/validate-commercial', payloadSoir);
                if (res.data.success) {
                    showToast(`✅ Tournée validée ! Vente définitive enregistrée.`, "success");
                    setPanierTournee([]);
                    setSaisiesRetour({});
                    setSelectedStaffId('');
                    // Nettoyage de l'URL pour quitter le mode édition
                    window.history.replaceState(null, '', window.location.pathname);
                    setIsModeEdition(false);
                }
            }
        } catch (err) {
            showToast(`❌ Erreur: ${err.response?.data?.error || err.message}`, "error");
        } finally {
            setIsSaving(false);
        }
    };
    // --- STYLES DESIGN PROFESSIONAL SLATE (ZÉRO VERT CLASH) ---
    const tableHeaderStyle = { backgroundColor: '#0f172a', color: '#fff', padding: '12px 8px', fontSize: '13px', fontWeight: '600', position: 'sticky', top: 0, zIndex: 5 };
    const tdStyle = { padding: '10px 8px', borderBottom: '1px solid #e2e8f0', fontSize: '13px', color: '#334155', fontWeight: '500' };
    const inputStyle = { padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', width: '75px', textAlign: 'center', fontSize: '13px', outline: 'none' };

    return (
        <div className="dashboard-layout" style={{ display: 'flex' }}>
            <Sidebar />
            
            <main style={{ display: 'flex', flexDirection: 'column', flex: 1, height: '100vh', backgroundColor: '#ffffff', overflow: 'hidden' }}>
                
                {/* 1. EN-TÊTE FIXE DU HAUT AVEC IDENTIFICATION DU MODE ET DE L'EMPLOYÉ */}
                <header style={{ backgroundColor: '#0f172a', padding: '16px 30px', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h1 style={{ fontSize: '22px', margin: 0, fontWeight: '700' }}>
                            {isModeEdition ? "Feuille de Route : Décompte du Soir" : "Feuille de Route : Chargement du Matin"}
                        </h1>
                        <p style={{ fontSize: '13px', color: '#94a3b8', margin: '2px 0 0 0' }}>
                            {isModeEdition ? "Saisie des retours physiques pour validation de la vente réelle" : "Sélection et constitution du stock de départ du commercial"}
                        </p>
                    </div>

                    <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                        {/* Zone de choix du commercial */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#1e293b', padding: '6px 14px', borderRadius: '6px', border: '1px solid #334155' }}>
                            <User size={16} color="#94a3b8" />
                            <select 
                                value={selectedStaffId} 
                                disabled={isModeEdition} // Bloqué le soir pour sécuriser l'attribution du bon
                                onChange={(e) => setSelectedStaffId(e.target.value)}
                                style={{ border: 'none', backgroundColor: 'transparent', color: '#fff', fontSize: '14px', fontWeight: '600', outline: 'none', cursor: 'pointer' }}
                            >
                                <option value="" style={{backgroundColor: '#1e293b'}}>-- Choisir le Commercial --</option>
                                {allStaff.map(s => <option key={s.id} value={s.id} style={{backgroundColor: '#1e293b'}}>{s.name.toUpperCase()}</option>)}
                            </select>
                        </div>

                        <div style={{ backgroundColor: isModeEdition ? '#ef4444' : '#3b82f6', color: '#fff', padding: '6px 12px', borderRadius: '6px', fontSize: '13px', fontWeight: '700' }}>
                            {isModeEdition ? `ÉDITION : ${currentTourId}` : `NOUVEAU : ${currentTourId}`}
                        </div>
                    </div>
                </header>

                {alertMsg.text && (
                    <div style={{ padding: '12px', color: '#fff', fontWeight: 'bold', textAlign: 'center', backgroundColor: alertMsg.type === 'error' ? '#EF4444' : '#10B981' }}>
                        {alertMsg.text}
                    </div>
                )}

                {/* 2. ZONE DE SÉLECTION DU CATALOGUE (Masquée le soir car la liste est déjà figée) */}
                {!isModeEdition && (
                    <div style={{ padding: '15px 30px', backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ display: 'flex', gap: '15px' }}>
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px 12px' }}>
                                <Search size={16} color="#64748b" />
                                <input type="text" placeholder="Rechercher un article pour le départ..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ border: 'none', outline: 'none', width: '100%', fontSize: '13px' }} />
                            </div>
                            <div style={{ width: '220px', display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px 12px' }}>
                                <Barcode size={16} color="#64748b" />
                                <input type="text" placeholder="Scanner Code-barres..." value={searchBarCode} onChange={(e) => setSearchBarCode(e.target.value)} style={{ border: 'none', outline: 'none', width: '100%', fontSize: '13px' }} />
                            </div>
                        </div>

                        {/* Dropdown volant d'articles filtrés */}
                        {(searchTerm || searchBarCode) && filteredArticles.length > 0 && (
                            <div style={{ maxHeight: '150px', overflowY: 'auto', border: '1px solid #cbd5e1', borderRadius: '6px', backgroundColor: '#fff', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                                {filteredArticles.map(art => (
                                    <div 
                                        key={art.id} 
                                        onClick={() => { setSelectedArt(art); setSearchTerm(''); setSearchBarCode(''); }}
                                        style={{ padding: '8px 12px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}
                                        className="item-hover"
                                    >
                                        <span style={{ fontWeight: '600', color: '#1e293b' }}>{art.nom.toUpperCase()}</span>
                                        <span style={{ color: '#4f46e5', fontWeight: 'bold' }}>{art.prixVente || art.prix_vente} F</span>
                                    </div>
                                )) }
                            </div>
                        )}

                        {/* Zone d'ajustement des colisages du matin lors du clic sur un article */}
                        {selectedArt && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', backgroundColor: '#eff6ff', padding: '10px 15px', borderRadius: '6px', border: '1px solid #bfdbfe' }}>
                                <span style={{ fontSize: '13px', fontWeight: '700', color: '#1e40af', flex: 1 }}>Chargement de : {selectedArt.nom.toUpperCase()}</span>
                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                    <input type="number" placeholder="Gros" value={qteGrosSaisie} onChange={(e) => setQteGrosSaisie(e.target.value)} style={{ ...inputStyle, backgroundColor: '#fff' }} />
                                    <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748b' }}>+</span>
                                    <input type="number" placeholder="Détail" value={qteDetailSaisie} onChange={(e) => setQteDetailSaisie(e.target.value)} style={{ ...inputStyle, backgroundColor: '#fff' }} />
                                </div>
                                <button onClick={handleAjouterAuChargement} style={{ padding: '6px 16px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Plus size={14} /> AJOUTER AU BON
                                </button>
                            </div>
                        )}
                    </div>
                )}
                {/* 3. LE GRAND TABLEAU CENTRAL ET UNIQUE */}
                <div style={{ flex: 1, padding: '0 30px', overflowY: 'auto', marginTop: '15px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                        <thead>
                            <tr>
                                <th style={{ ...tableHeaderStyle, width: '25%', textAlign: 'left' }}>DÉSIGNATION ARTICLE</th>
                                <th style={{ ...tableHeaderStyle, width: '10%', textAlign: 'center' }}>P.U</th>
                                <th style={{ ...tableHeaderStyle, width: '20%', backgroundColor: '#1e3a8a', textAlign: 'center' }}>1. LE DÉPART (CHARGEMENT MORNING)</th>
                                <th style={{ ...tableHeaderStyle, width: '15%', backgroundColor: '#b91c1c', textAlign: 'center' }}>2. LE RETOUR (SOIR)</th>
                                <th style={{ ...tableHeaderStyle, width: '15%', backgroundColor: '#15803d', textAlign: 'center' }}>3. VENTE DÉFINITIVE</th>
                                <th style={{ ...tableHeaderStyle, width: '15%', textAlign: 'center' }}>TOTAL TTC NET</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan="6" style={{ ...tdStyle, textAlign: 'center', padding: '40px', color: '#64748b' }}>Chargement de la feuille de route...</td></tr>
                            ) : panierConsolide.length === 0 ? (
                                <tr><td colSpan="6" style={{ ...tdStyle, textAlign: 'center', padding: '40px', color: '#64748b' }}>Aucun produit sur cette feuille de route. Ajoutez des articles pour démarrer le chargement.</td></tr>
                            ) : (
                                panierConsolide.map((item, index) => (
                                    <tr key={item.product_id} style={{ backgroundColor: index % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                                        {/* Désignation */}
                                        <td style={{ ...tdStyle, textAlign: 'left', fontWeight: '700', color: '#0f172a' }}>{item.nom}</td>
                                        
                                        {/* Prix Unitaire */}
                                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: '600' }}>{item.prix_vente.toLocaleString()} F</td>
                                        
                                        {/* 1. LE DÉPART (Affichage dynamique ou suppression possible uniquement le matin) */}
                                        <td style={{ ...tdStyle, backgroundColor: '#eff6ff', textAlign: 'center' }}>
                                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', alignItems: 'center' }}>
                                                <span style={{ color: '#1e3a8a', fontWeight: '700' }}>{item.chargeText}</span>
                                                {!isModeEdition && (
                                                    <Trash2 
                                                        size={14} 
                                                        color="#ef4444" 
                                                        style={{ cursor: 'pointer' }} 
                                                        onClick={() => setPanierTournee(panierTournee.filter(p => p.product_id !== item.product_id))} 
                                                    />
                                                )}
                                            </div>
                                        </td>

                                        {/* 2. LE RETOUR (Champ actif uniquement le soir en mode édition) */}
                                        <td style={{ ...tdStyle, backgroundColor: '#fff5f5', textAlign: 'center' }}>
                                            <input 
                                                type="text" 
                                                placeholder={isModeEdition ? "Ex: 1+2 ou 4" : "Bloqué (Matin)"} 
                                                value={item.retourText} 
                                                disabled={!isModeEdition} // Verrouillé le matin, actif uniquement le soir
                                                onChange={(e) => setSaisiesRetour({ ...saisiesRetour, [item.product_id]: e.target.value })} 
                                                style={{ 
                                                    ...inputStyle, 
                                                    width: '85%', 
                                                    border: isModeEdition ? '1px solid #f87171' : '1px solid #cbd5e1', 
                                                    backgroundColor: isModeEdition ? '#fff' : '#e2e8f0',
                                                    cursor: isModeEdition ? 'text' : 'not-allowed',
                                                    fontWeight: '600'
                                                }} 
                                            />
                                        </td>

                                        {/* 3. LA VENTE DÉFINITIVE (Calcul automatique de l'écart) */}
                                        <td style={{ ...tdStyle, backgroundColor: '#f0fdf4', color: '#15803d', fontWeight: '850', textAlign: 'center' }}>
                                            {item.venduFormatee}
                                        </td>

                                        {/* TOTAL TTC NET ENCAISSÉ */}
                                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: '800', color: '#0f172a' }}>
                                            {Math.round(item.totalTtcLigne).toLocaleString()} F
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                {/* 3. LE GRAND TABLEAU CENTRAL ET UNIQUE */}
                <div style={{ flex: 1, padding: '0 30px', overflowY: 'auto', marginTop: '15px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                        <thead>
                            <tr>
                                <th style={{ ...tableHeaderStyle, width: '25%', textAlign: 'left' }}>DÉSIGNATION ARTICLE</th>
                                <th style={{ ...tableHeaderStyle, width: '10%', textAlign: 'center' }}>P.U</th>
                                <th style={{ ...tableHeaderStyle, width: '20%', backgroundColor: '#1e3a8a', textAlign: 'center' }}>1. LE DÉPART (CHARGEMENT MORNING)</th>
                                <th style={{ ...tableHeaderStyle, width: '15%', backgroundColor: '#b91c1c', textAlign: 'center' }}>2. LE RETOUR (SOIR)</th>
                                <th style={{ ...tableHeaderStyle, width: '15%', backgroundColor: '#15803d', textAlign: 'center' }}>3. VENTE DÉFINITIVE</th>
                                <th style={{ ...tableHeaderStyle, width: '15%', textAlign: 'center' }}>TOTAL TTC NET</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan="6" style={{ ...tdStyle, textAlign: 'center', padding: '40px', color: '#64748b' }}>Chargement de la feuille de route...</td></tr>
                            ) : panierConsolide.length === 0 ? (
                                <tr><td colSpan="6" style={{ ...tdStyle, textAlign: 'center', padding: '40px', color: '#64748b' }}>Aucun produit sur cette feuille de route. Ajoutez des articles pour démarrer le chargement.</td></tr>
                            ) : (
                                panierConsolide.map((item, index) => (
                                    <tr key={item.product_id} style={{ backgroundColor: index % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                                        {/* Désignation */}
                                        <td style={{ ...tdStyle, textAlign: 'left', fontWeight: '700', color: '#0f172a' }}>{item.nom}</td>
                                        
                                        {/* Prix Unitaire */}
                                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: '600' }}>{item.prix_vente.toLocaleString()} F</td>
                                        
                                        {/* 1. LE DÉPART (Affichage dynamique ou suppression possible uniquement le matin) */}
                                        <td style={{ ...tdStyle, backgroundColor: '#eff6ff', textAlign: 'center' }}>
                                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', alignItems: 'center' }}>
                                                <span style={{ color: '#1e3a8a', fontWeight: '700' }}>{item.chargeText}</span>
                                                {!isModeEdition && (
                                                    <Trash2 
                                                        size={14} 
                                                        color="#ef4444" 
                                                        style={{ cursor: 'pointer' }} 
                                                        onClick={() => setPanierTournee(panierTournee.filter(p => p.product_id !== item.product_id))} 
                                                    />
                                                )}
                                            </div>
                                        </td>

                                        {/* 2. LE RETOUR (Champ actif uniquement le soir en mode édition) */}
                                        <td style={{ ...tdStyle, backgroundColor: '#fff5f5', textAlign: 'center' }}>
                                            <input 
                                                type="text" 
                                                placeholder={isModeEdition ? "Ex: 1+2 ou 4" : "Bloqué (Matin)"} 
                                                value={item.retourText} 
                                                disabled={!isModeEdition} // Verrouillé le matin, actif uniquement le soir
                                                onChange={(e) => setSaisiesRetour({ ...saisiesRetour, [item.product_id]: e.target.value })} 
                                                style={{ 
                                                    ...inputStyle, 
                                                    width: '85%', 
                                                    border: isModeEdition ? '1px solid #f87171' : '1px solid #cbd5e1', 
                                                    backgroundColor: isModeEdition ? '#fff' : '#e2e8f0',
                                                    cursor: isModeEdition ? 'text' : 'not-allowed',
                                                    fontWeight: '600'
                                                }} 
                                            />
                                        </td>

                                        {/* 3. LA VENTE DÉFINITIVE (Calcul automatique de l'écart) */}
                                        <td style={{ ...tdStyle, backgroundColor: '#f0fdf4', color: '#15803d', fontWeight: '850', textAlign: 'center' }}>
                                            {item.venduFormatee}
                                        </td>

                                        {/* TOTAL TTC NET ENCAISSÉ */}
                                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: '800', color: '#0f172a' }}>
                                            {Math.round(item.totalTtcLigne).toLocaleString()} F
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                {/* 4. PIED DE PAGE FIXE ISOLÉ : RÉCAPITULATIF FINANCIER ET ACTIONS DYNAMIQUES */}
                {panierTournee.length > 0 && (
                    <footer style={{ backgroundColor: '#f1f5f9', padding: '16px 30px', borderTop: '2px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: '15px', fontWeight: '800', color: '#0f172a' }}>
                            {isModeEdition ? (
                                <>RECETTE NETTE À ENCAISSER : <span style={{ color: '#16a34a', fontSize: '20px' }}>{Math.round(recetteTotaleAEncaisser).toLocaleString()} F</span></>
                            ) : (
                                <><span style={{ color: '#475569' }}>CONSTITUTION DU CHARGEMENT EN COURS</span></>
                            )}
                        </div>
                        
                        <button 
                            onClick={handleActionPrincipaleGrille}
                            disabled={isSaving}
                            style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '8px', 
                                padding: '12px 28px', 
                                backgroundColor: isModeEdition ? '#10b981' : '#2563eb', 
                                color: '#fff', 
                                border: 'none', 
                                borderRadius: '6px', 
                                cursor: 'pointer', 
                                fontWeight: 'bold', 
                                fontSize: '14px' 
                            }}
                        >
                            <CheckCircle size={18} /> 
                            {isSaving ? "Traitement ERP..." : (isModeEdition ? "VALIDER LA VENTE DU SOIR" : "ENREGISTRER LE CHARGEMENT")}
                        </button>
                    </footer>
                )}
            </main>

            <style>{`
                .spin { animation: spin 1s linear infinite; }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                .item-hover:hover { background-color: #f1f5f9 !important; }
            `}</style>
        </div>
    );
};

export default GrilleTourneeCommercialeUnique;
