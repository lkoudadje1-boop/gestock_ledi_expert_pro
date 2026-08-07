import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
    Search, DollarSign, CreditCard, X, Check, 
    Loader2, AlertTriangle, ChevronDown, ChevronUp,
    History as HistoryIcon, Package, ArrowLeftRight, Printer, CheckCircle, AlertCircle
} from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import API from '../../services/api'; 
import { useReactToPrint } from 'react-to-print';
import RecupaiementPrint from './recupaiementPrint';

const CreanceClients = () => {
    // --- ÉTATS ---
    const [allData, setAllData] = useState([]); 
    const [activeTab, setActiveTab] = useState('creance'); 
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    
    const [paymentMethods, setPaymentMethods] = useState([]); 
    const [selectedMethod, setSelectedMethod] = useState(''); 
    const [showFormId, setShowFormId] = useState(null); // ID de la facture ouverte pour encaissement
    const [paymentAmount, setPaymentAmount] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [expandedRow, setExpandedRow] = useState(null); // ID du client déplié
    const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

    // --- ÉTATS POUR L'IMPRESSION DU DOUBLE REÇU / HISTORIQUE COMPTABLE ---
    const printRef = useRef(null);
    const [printData, setPrintData] = useState(null);

    // Extraction des paramètres de l'utilisateur connecté pour l'entête du reçu
    const currentUser = useMemo(() => JSON.parse(localStorage.getItem('user') || '{}'), []);
    const companyConfig = useMemo(() => ({
        name: currentUser.company_name || currentUser.companyName || "LEDI EXPERT PRO",
        address: currentUser.company_address || currentUser.companyAddress || "Adresse non renseignée",
        phone: currentUser.company_phone || currentUser.companyPhone || "Tél: N/A",
        email: currentUser.company_email || currentUser.companyEmail || "Email: N/A",
        logo_data: currentUser.company_logo || null
    }), [currentUser]);

    // =========================================================================
    // 🖨️ CONFIGURATION REACT-TO-PRINT ALIGNÉE SUR LE MODÈLE FONCTIONNEL
    // =========================================================================
    const handlePrint = useReactToPrint({
        content: () => printRef.current,
        documentTitle: `RECU_PAIEMENT_CREANCE`,
        pageStyle: `
            @page {
                size: portrait !important; 
                margin: 0 !important;
            }
            body {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
                margin: 0;
                padding: 0;
            }
        `,
        onAfterPrint: () => setPrintData(null)
    });

    // GESTIONNAIRE D'IMPRESSION DÉCOUPLÉ SYNCHRONISÉ AVEC LE TIMEOUT DE 180MS
    const declencherImpressionSynchronisee = useCallback((dataPourImpression) => {
        setPrintData(dataPourImpression);
        setTimeout(() => {
            handlePrint();
        }, 180);
    }, [handlePrint]);

    // --- CHARGEMENT INITIAL ---
    const fetchInitialData = async () => {
        setLoading(true);
        try {
            const resDebts = await API.get('/sales/debts');
            setAllData(resDebts.data?.data || resDebts.data || []);

            const resMethods = await API.get('/plan-comptable/paiements/methodes');
            const methods = resMethods.data?.data || resMethods.data || [];
            const activeMethods = methods.filter(m => Number(m.is_active) === 1);
            setPaymentMethods(activeMethods);

            if (activeMethods.length > 0) {
                setSelectedMethod(activeMethods[0].code || activeMethods[0].nom); 
            }
        } catch (err) {
            showToast("Erreur de connexion au serveur", "error");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchInitialData(); }, []);

    const showToast = (message, type = 'success') => {
        setToast({ show: true, message, type });
        setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3500);
    };

    const safeParse = (data) => {
        if (!data) return [];
        if (Array.isArray(data)) return data;
        try { return JSON.parse(data); } catch (e) { return []; }
    };

    // --- LOGIQUE DE CALCUL PAR LIGNE ---
    const processedData = useMemo(() => {
        const search = searchTerm.toLowerCase().trim();

        return allData.map(clientData => {
            const facturesBrutes = safeParse(clientData.detail_factures);

            const facturesAnalysees = facturesBrutes.map(f => {
                const paiements = safeParse(f.paiements);
                
                const totalPaye = paiements.reduce((sum, p) => {
                    const estRemboursement = p.type_operation && p.type_operation.trim().toUpperCase() === 'REMBOURSEMENT';
                    return sum + (estRemboursement ? -Number(p.montant || 0) : Number(p.montant || 0));
                }, 0);
                
                const calculReste = Number(f.montant_total || 0) - totalPaye;
                const resteReel = calculReste > 0.1 ? calculReste : 0;
                
                return {
                    ...f,
                    resteDynamique: resteReel,
                    totalPayeDynamique: totalPaye
                };
            });

            const facturesVisibles = facturesAnalysees.filter(f => 
                activeTab === 'creance' ? f.resteDynamique > 0 : f.resteDynamique <= 0
            );

            const matchesSearch = clientData.client?.toLowerCase().includes(search);
            if (facturesVisibles.length === 0 || (!matchesSearch && search !== '')) return null;

            return {
                ...clientData,
                client_id: clientData.customer_id || clientData.client, 
                facturesAffichees: facturesVisibles,
                total_du_global: facturesVisibles.reduce((sum, f) => sum + Number(f.montant_total), 0),
                reste_a_recouvrer_global: facturesVisibles.reduce((sum, f) => sum + f.resteDynamique, 0)
            };
        }).filter(Boolean);
    }, [allData, activeTab, searchTerm]);
    // =========================================================================
    // 🖨️ ACTION D'IMPRESSION 1 : Un Reçu de paiement unique/historique ciblé
    // =========================================================================
    const handlePrintSingleReceipt = (paiement, facture) => {
        // 🎯 CORRECTION CRITIQUE : Utilisation du déclencheur synchronisé pour lancer l'impression
        declencherImpressionSynchronisee({
            paiementInfo: {
                id: paiement.id || paiement.payment_id || `PAY-HIST`,
                montant: Number(paiement.montant),
                moyen_paiement: paiement.moyen_paiement || 'ESPECES',
                caissier_name: paiement.caissier_name || currentUser.name || 'Caisse Centrale',
                created_at: paiement.date || paiement.created_at || new Date().toISOString(),
                nouveauReste: Number(facture.resteDynamique) 
            },
            venteInfo: {
                id: facture.id,
                nom_client_snap: facture.nom_client_snap || "CLIENT EN COMPTE",
                montant_total: facture.montant_total,
                reste_a_payer: facture.resteDynamique
            },
            company: companyConfig
        });
    };

   // =========================================================================
// 🖨️ RELEVÉ CHRONOLOGIQUE : Liste des factures, dettes et règlements
// =========================================================================
const handlePrintClientStatement = (clientData) => {
    
    // 1. On parcourt chaque facture pour extraire la dette et parser ses règlements
    const historiqueChronologique = clientData.facturesAffichees.map(facture => {
        
        // On extrait et convertit proprement les paiements JSON de cette facture
        const listePaiementsFormates = safeParse(facture.paiements).map(p => ({
            id_paiement: p.id || p.payment_id || 'N/A',
            date: p.date || p.created_at,
            montant: Number(p.montant),
            moyen_paiement: p.moyen_paiement || 'ESPECES',
            caissier: p.caissier_name || 'Caisse',
            isRemboursement: p.type_operation && p.type_operation.trim().toUpperCase() === 'REMBOURSEMENT'
        }));

        // On trie les paiements de cette facture du plus ancien au plus récent
        listePaiementsFormates.sort((a, b) => new Date(a.date) - new Date(b.date));

        return {
            facture_id: facture.id,
            date_facture: facture.date_vente || facture.created_at,
            montant_initial: Number(facture.montant_total),
            reste_a_payer: Number(facture.resteDynamique),
            total_deja_paye: Number(facture.totalPayeDynamique),
            // On associe la liste des règlements parsés et triés à cette facture
            reglements: listePaiementsFormates 
        };
    });

    // 2. On trie également les factures globales par date pour respecter la chronologie
    historiqueChronologique.sort((a, b) => new Date(a.date_facture) - new Date(b.date_facture));

    // 3. On envoie cet historique propre à votre container RecupaiementPrint
    declencherImpressionSynchronisee({
        isStatement: true,
        client: clientData.client,
        totalGlobal: Number(clientData.total_du_global),
        resteGlobal: Number(clientData.reste_a_recouvrer_global),
        // 🎯 On remplace le tableau brut par notre tableau chronologique entièrement parsé
        factures: historiqueChronologique, 
        company: companyConfig,
        paiementInfo: {},
        venteInfo: {}
    });
};


    // --- SOUMISSION STRICTE DU PAIEMENT (SANS IMPRESSION AUTOMATIQUE) ---
    const handlePaymentSubmit = async (e, facture) => {
        e.preventDefault();
        const montant = parseFloat(paymentAmount);
        
        if (isNaN(montant) || montant <= 0) {
            return showToast("Veuillez saisir un montant valide", "error");
        }
        
        if (montant > (facture.resteDynamique + 0.1)) {
            return showToast(`Montant trop élevé ! Reste : ${facture.resteDynamique.toLocaleString()} F`, "error");
        }

        setIsSubmitting(true);
        try {
            await API.post('/sales/pay-debt', { 
                saleId: facture.id, 
                montant: montant,
                moyen_paiement: selectedMethod 
            });

            showToast("Opération enregistrée avec succès", "success");
            setShowFormId(null);
            setPaymentAmount('');
            fetchInitialData(); 
        } catch (err) {
            const msg = err.response?.data?.message || "Échec de l'opération.";
            showToast(msg, "error");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div style={layoutStyle}>
            <Sidebar />
            <main style={mainStyle}>
                
                {toast.show && (
                    <div style={{
                        ...toastContainer, 
                        background: toast.type === 'success' ? '#059669' : '#dc2626',
                    }}>
                        {toast.type === 'success' ? <Check size={18} /> : <AlertTriangle size={18} />}
                        <div style={{fontWeight: '600'}}>{toast.message}</div>
                    </div>
                )}

                <header style={headerStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div style={iconBox}><DollarSign size={24} color="white" /></div>
                        <div>
                            <h1 style={titleStyle}>RECOUVREMENT CLIENTS</h1>
                            <span style={subtitleStyle}>Gestion des paiements et retours</span>
                        </div>
                    </div>

                    <div style={tabContainer}>
                        <button onClick={() => {setActiveTab('creance'); setExpandedRow(null);}} 
                                style={activeTab === 'creance' ? activeTabStyle : tabStyle}>
                            <AlertTriangle size={14} /> IMPAYÉS
                        </button>
                        <button onClick={() => {setActiveTab('solder'); setExpandedRow(null);}} 
                                style={activeTab === 'solder' ? activeTabStyle : tabStyle}>
                            <Check size={14} /> SOLDÉS
                        </button>
                    </div>
                </header>


                              <div style={contentStyle}>
                    <div style={searchWrapper}>
                        <Search size={18} color="#64748b" />
                        <input type="text" placeholder="Rechercher un client..." style={searchInput} 
                               value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                    </div>

                    {loading ? (
                        <div style={center}><Loader2 className="animate-spin" size={40} color="#2563eb" /></div>
                    ) : (
                        <div style={tableWrapper}>
                            <table style={tableStyle}>
                                <thead>
                                    <tr>
                                        <th style={thStyle}>NOM DU CLIENT</th>
                                        <th style={thStyle}>FACTURES</th>
                                        <th style={thStyle}>TOTAL FACTURÉ</th>
                                        <th style={thStyle}>RESTE À PERCEVOIR</th>
                                        <th style={{...thStyle, textAlign:'center'}}>ACTIONS</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {processedData.length > 0 ? processedData.map(clientData => (
                                        <React.Fragment key={clientData.client}>
                                            {/* Ligne principale du client avec double action : dépliage ou impression globale */}
                                            <tr style={{...trStyle, cursor: 'pointer', background: expandedRow === clientData.client ? '#f1f5f9' : 'transparent'}} 
                                                onClick={() => setExpandedRow(expandedRow === clientData.client ? null : clientData.client)}>
                                                <td style={{...tdStyle, fontWeight:700, color:'#1e293b'}}>{clientData.client}</td>
                                                <td style={tdStyle}><span style={badgeCount}>{clientData.facturesAffichees.length} facture(s)</span></td>
                                                <td style={tdStyle}>{Number(clientData.total_du_global).toLocaleString()} F</td>
                                                <td style={tdStyle}>
                                                    <span style={activeTab === 'creance' ? badgeDebt : badgeSuccess}>
                                                        {activeTab === 'creance' ? `${clientData.reste_a_recouvrer_global.toLocaleString()} F` : 'SOLDÉ'}
                                                    </span>
                                                </td>
                                                <td style={{...tdStyle, textAlign:'center'}}>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                                                        {/* 🖨️ BOUTON D'IMPRESSION DE L'HISTORIQUE DE TOUS LES PAIEMENTS DU CLIENT 
                                                        <button
                                                            title="Imprimer l'état de compte global du client"
                                                            onClick={(e) => {
                                                                e.stopPropagation(); // Évite de déplier la ligne au clic sur l'imprimante
                                                                handlePrintClientStatement(clientData);
                                                            }}
                                                            style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '5px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                        >
                                                            <Printer size={14} color="#475569" />
                                                        </button> */}
                                                        
                                                        {/* Icône de dépliage standard */}
                                                        {expandedRow === clientData.client ? <ChevronUp size={18} color="#2563eb"/> : <ChevronDown size={18}/>} 
                                                    </div>
                                                </td>
                                            </tr>
                                            
                                            {/* Sous-tableau des factures dépliées */}
                                            {expandedRow === clientData.client && (
                                                <tr>
                                                    <td colSpan="5" style={{ background: '#f8fafc', padding: '15px', borderBottom: '2px solid #e2e8f0' }}>
                                                        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', backgroundColor: '#ffffff', overflow: 'hidden' }}>
                                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                                                <thead style={{ backgroundColor: '#cbd5e1', color: '#334155', fontWeight: 'bold' }}>
                                                                    <tr>
                                                                        <th style={{ padding: '10px', textAlign: 'left' }}>RÉFÉRENCE FACTURE</th>
                                                                        <th style={{ padding: '10px', textAlign: 'left' }}>MONTANT TOTAL</th>
                                                                        <th style={{ padding: '10px', textAlign: 'left' }}>RESTE À PAYER</th>
                                                                        <th style={{ padding: '10px', textAlign: 'left' }}>HISTORIQUE (PAIEMENTS & RETOURS)</th>
                                                                        <th style={{ padding: '10px', textAlign: 'center' }}>ACTION</th>
                                                                    </tr>
                                                                </thead>

                                                                                                                               <tbody>
                                                                    {clientData.facturesAffichees.map(facture => (
                                                                        <React.Fragment key={facture.id}>
                                                                            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                                                                                <td style={{ padding: '10px', fontWeight: '600', color: '#2563eb' }}>
                                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                                        <Package size={14} color="#2563eb" />
                                                                                        <span>REF: {facture.id}</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td style={{ padding: '10px' }}>{Number(facture.montant_total).toLocaleString()} F</td>
                                                                                <td style={{ padding: '10px' }}>
                                                                                    <span style={facture.resteDynamique > 0 ? lotResteBadge : lotSolderBadge}>
                                                                                        {facture.resteDynamique > 0 ? `${facture.resteDynamique.toLocaleString()} F` : 'PAYÉ'}
                                                                                    </span>
                                                                                </td>
                                                                                <td style={{ padding: '10px', width: '40%' }}>
                                                                                    <div style={{ ...paymentHistory, margin: 0, padding: 0 }}>
                                                                                        <div style={scrollHistoryBox}>
                                                                                            {safeParse(facture.paiements).length > 0 ? (
                                                                                                safeParse(facture.paiements).map((p, idx) => {
                                                                                                    const isRetour = p.type_operation && p.type_operation.trim().toUpperCase() === 'REMBOURSEMENT';
                                                                                                    return (
                                                                                                        <div key={idx} style={{
                                                                                                            ...paymentRow,
                                                                                                            color: isRetour ? '#dc2626' : '#1e293b',
                                                                                                            background: isRetour ? '#fef2f2' : 'transparent',
                                                                                                            borderLeft: isRetour ? '3px solid #dc2626' : 'none',
                                                                                                            padding: '4px 8px',
                                                                                                            margin: '2px 0',
                                                                                                            borderRadius: '4px',
                                                                                                            display: 'flex',
                                                                                                            alignItems: 'center',
                                                                                                            justifyContent: 'space-between',
                                                                                                            gap: '8px'
                                                                                                        }}>
                                                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, justifyContent: 'space-between' }}>
                                                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                                                                    {isRetour ? <ArrowLeftRight size={10} /> : <Check size={10} color="#10b981" />}
                                                                                                                    <span>{new Date(p.date || p.created_at).toLocaleDateString()}</span>
                                                                                                                </div>
                                                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                                                                                    {isRetour && <span style={retourLabel}>RETOUR</span>}
                                                                                                                    <span style={{ fontWeight: 800 }}>
                                                                                                                        {isRetour ? '-' : '+'}{Number(p.montant).toLocaleString()} F
                                                                                                                    </span>
                                                                                                                </div>
                                                                                                            </div>
                                                                                                         {!isRetour && (
                                                                                                                <button
                                                                                                                    type="button"
                                                                                                                    title="Imprimer ce reçu de règlement"
                                                                                                                    onClick={(e) => {
                                                                                                                        e.stopPropagation();
                                                                                                                        handlePrintSingleReceipt(p, facture);
                                                                                                                    }}
                                                                                                                    style={{ background: 'none', border: 'none', padding: '2px', cursor: 'pointer', display: 'flex', alignItems: 'center', marginLeft: '6px' }}
                                                                                                                >
                                                                                                                    <Printer size={11} color="#2563eb" className="hover:text-blue-800" />
                                                                                                                </button>
                                                                                                            )}
                                                                                                        </div>
                                                                                                    );
                                                                                                })
                                                                                            ) : <p style={emptyText}>Aucun versement</p>}
                                                                                        </div>
                                                                                    </div>
                                                                                </td>

                                                                                                                   {/* 🌟 NOUVELLE CELLULE D'ACTION DANS LA LIGNE DU SOUS-TABLEAU */}
                                                                                              <td style={{ padding: '10px', textAlign: 'center', verticalAlign: 'middle', width: '25%' }}>
                                                    {facture.resteDynamique > 0 && (
                                                        <div>
                                                            {showFormId === facture.id ? (
                                                                <form onSubmit={(e) => handlePaymentSubmit(e, facture)} style={{ ...inlineActionFormColumn, display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'center' }}>
                                                                    <select style={{ ...smallSelect, width: '100%', boxSizing: 'border-box' }} value={selectedMethod} onChange={(e) => setSelectedMethod(e.target.value)}>
                                                                        {paymentMethods.map(m => (
                                                                            <option key={m.id} value={m.code || m.nom}>{m.libelle || m.nom}</option>
                                                                        ))}
                                                                    </select>
                                                                    <div style={{ display: 'flex', gap: '4px', width: '100%' }}>
                                                                        <input 
                                                                            type="number" step="0.01" autoFocus style={{ ...smallInput, flex: 1 }}
                                                                            placeholder="Montant..." value={paymentAmount}
                                                                            onChange={e => setPaymentAmount(e.target.value)}
                                                                            required
                                                                        />
                                                                        {/* Soumission pure pour enregistrement en base SQL */}
                                                                        <button type="submit" disabled={isSubmitting} style={btnCheck}>
                                                                            {isSubmitting ? <Loader2 className="animate-spin" size={14}/> : <Check size={14}/>}
                                                                        </button>
                                                                        <button type="button" onClick={() => { setShowFormId(null); setPaymentAmount(''); }} style={btnX}><X size={14}/></button>
                                                                    </div>
                                                                </form>
                                                            ) : (
                                                                <button onClick={(e) => { e.stopPropagation(); setShowFormId(facture.id); setPaymentAmount(facture.resteDynamique); }} style={btnPayLot}>
                                                                    <CreditCard size={14}/> ENCAISSER
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        </React.Fragment>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </td>
                </tr>
            )}
        </React.Fragment>
    )) : (
        <tr>
            <td colSpan="5" style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>
                <Package size={40} style={{ margin: '0 auto 10px', opacity: 0.3 }} />
                <p>Aucun dossier trouvé.</p>
            </td>
        </tr>
    )}
</tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* 🔒 CONTAINER INVISIBLE SÉCURISÉ POUR L'IMPRESSION VIA LE CONTROLLER (HORS-ÉCRAN) */}
                <div style={{ position: 'absolute', top: '-9999px', left: '-9999px', width: '0', height: '0', overflow: 'hidden' }}>
                    {printData && (
                        <RecupaiementPrint 
                            ref={printRef} 
                            isStatement={printData.isStatement || false}
                            client={printData.client}
                            totalGlobal={printData.totalGlobal}
                            resteGlobal={printData.resteGlobal}
                            factures={printData.factures}
                            paiementInfo={printData.paiementInfo || {}} 
                            venteInfo={printData.venteInfo || {}} 
                            company={printData.company || companyConfig}
                        />
                    )}
                </div>

            </main>
        </div>
    );
};


// --- STYLES COMPLÉMENTAIRES ---
const retourLabel = {
    background: '#dc2626',
    color: 'white',
    fontSize: '8px',
    padding: '1px 4px',
    borderRadius: '3px',
    fontWeight: '900'
};


const toastContainer = { position: 'fixed', top: '30px', right: '30px', padding: '16px 24px', borderRadius: '12px', color: 'white', zIndex: 10000, display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.2)', fontSize: '14px' };
const horizontalScrollWrapper = { display: 'flex', flexWrap: 'wrap', gap: '15px', width: '100%' };
const lotCardInline = { minWidth: '300px', background: 'white', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' };
const scrollHistoryBox = { maxHeight: '150px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' };
const inlineActionFormColumn = { display: 'flex', flexDirection: 'column', gap: '6px' };
const smallSelect = { padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '11px' };
const layoutStyle = { display: 'flex', height: '100vh', background: '#f8fafc', overflow: 'hidden' };
const mainStyle = { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' };
const headerStyle = { background: 'white', padding: '12px 30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0' };
const titleStyle = { margin: 0, fontSize: '16px', fontWeight: '900' };
const subtitleStyle = { fontSize: '10px', color: '#64748b' };
const iconBox = { background: '#2563eb', padding: '8px', borderRadius: '8px' };
const contentStyle = { padding: '20px 30px', flex: 1, overflowY: 'auto' };
const tableWrapper = { background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' };
const tableStyle = { width: '100%', borderCollapse: 'collapse' };
const thStyle = { background: '#f8fafc', padding: '12px', textAlign: 'left', fontSize: '10px', fontWeight: 900, color: '#64748b', textTransform: 'uppercase' };
const trStyle = { borderBottom: '1px solid #f1f5f9' };
const tdStyle = { padding: '12px', fontSize: '13px' };
const lotHeader = { display: 'flex', justifyContent: 'space-between', marginBottom: '10px' };
const lotResteBadge = { background: '#fee2e2', color: '#b91c1c', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 800 };
const lotSolderBadge = { background: '#dcfce7', color: '#15803d', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 800 };
const paymentHistory = { background: '#f8fafc', padding: '8px', borderRadius: '6px' };
const miniTitle = { fontSize: '9px', fontWeight: 800, color: '#94a3b8', marginBottom: '5px', display: 'flex', alignItems: 'center', gap: '4px' };
const paymentRow = { display: 'flex', justifyContent: 'space-between', fontSize: '10px', alignItems: 'center' };
const btnPayLot = { width:'100%', background: '#2563eb', color: 'white', border: 'none', padding: '8px', borderRadius: '6px', cursor: 'pointer', fontSize: '10px', fontWeight: '800', display:'flex', alignItems:'center', justifyContent:'center', gap: '5px' };
const smallInput = { flex: 1, padding: '6px', borderRadius: '4px', border: '1px solid #2563eb', fontSize: '11px' };
const btnCheck = { background: '#10b981', color: 'white', border: 'none', borderRadius: '4px', padding: '0 8px', cursor: 'pointer' };
const btnX = { background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', padding: '0 8px', cursor: 'pointer' };
const badgeCount = { background: '#f1f5f9', padding: '3px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: '600' };
const badgeDebt = { background: '#fef2f2', color: '#dc2626', padding: '4px 8px', borderRadius: '6px', fontWeight: 800 };
const badgeSuccess = { background: '#f0fdf4', color: '#16a34a', padding: '4px 8px', borderRadius: '6px', fontWeight: 800 };
const searchWrapper = { display: 'flex', alignItems: 'center', gap: '10px', background: 'white', padding: '10px 15px', borderRadius: '10px', border: '1px solid #e2e8f0', marginBottom: '15px' };
const searchInput = { border: 'none', outline: 'none', width: '100%', fontSize: '13px' };
const tabContainer = { display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '8px' };
const tabStyle = { border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '10px', fontWeight: '800', color: '#64748b', background: 'transparent', display:'flex', alignItems:'center', gap:'5px' };
const activeTabStyle = { ...tabStyle, background: 'white', color: '#2563eb', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' };
const center = { display: 'flex', justifyContent: 'center', padding: '50px' };
const emptyText = { fontSize:'10px', fontStyle:'italic', margin:0, color: '#94a3b8' };

export default CreanceClients;