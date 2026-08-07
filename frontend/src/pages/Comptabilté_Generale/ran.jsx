import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, CheckCircle2, RefreshCw, ScrollText, XCircle } from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import API, { socket } from '../../services/api';

const Ran = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { exerciceACloturerId } = location.state || {};

    const [loading, setLoading] = useState(false); // État pour la validation finale
    const [calculating, setCalculating] = useState(false);
    const [planComptable, setPlanComptable] = useState([]);
    const [journaux, setJournaux] = useState([]);
    const [bilanPreview, setBilanPreview] = useState([]);
    const [exerciceSuivant, setExerciceSuivant] = useState(null);
    const [isGenerated, setIsGenerated] = useState(false); 
    
    const [selectedJournal, setSelectedJournal] = useState('');
    const [selectedCompteResultat, setSelectedCompteResultat] = useState('');
    const [errorMsg, setErrorMsg] = useState('');

    const totaux = bilanPreview.reduce((acc, row) => ({
        debit: acc.debit + (parseFloat(row.solde_cumule_debit) || 0),
        credit: acc.credit + (parseFloat(row.solde_cumule_credit) || 0)
    }), { debit: 0, credit: 0 });

const fetchData = useCallback(async () => {
    try {
        const [resEx, resPlan, resJournaux] = await Promise.all([
            // 🎯 CORRECTION DES ROUTES (Règle l'erreur 404)
            API.get('/plan-comptable/exercices/liste'), 
            API.get('/plan-comptable/liste'),
            API.get('/plan-comptable/journaux/liste')
        ]);
        
        setPlanComptable(resPlan.data?.data || []);
        setJournaux(resJournaux.data?.data || []);
        
        if (exerciceACloturerId) {
            const liste = resEx.data?.data || [];
            const ex = liste.find(e => e.id === exerciceACloturerId);
            if (ex) {
                const anneeSuivante = new Date(ex.date_fin).getFullYear() + 1;
                setExerciceSuivant({ libelle: `EXERCICE ${anneeSuivante}`, annee: anneeSuivante });
            }
        }
    } catch (err) { 
        console.error("Erreur chargement données RAN:", err); 
    }
}, [exerciceACloturerId]);

useEffect(() => {
    fetchData();
    
    // 📡 TEMPS RÉEL
    if (socket) {
        socket.on('REFRESH_EXERCICES', fetchData);
        return () => socket.off('REFRESH_EXERCICES', fetchData);
    }
}, [fetchData]);

    const handleSimulerPiece = async () => {
        if (!selectedJournal || !selectedCompteResultat) return;
        setCalculating(true);
        setErrorMsg('');
        try {
            const res = await API.get('/compta/ran/bilan-tiers', { params: { exerciceId: exerciceACloturerId } });
            let rows = res.data.data || [];

            let diff = rows.reduce((acc, r) => acc + (r.solde_cumule_debit - r.solde_cumule_credit), 0);
            const compSel = planComptable.find(c => c.id === selectedCompteResultat);

            const ligneEquilibre = {
                numero_compte: compSel?.numero_compte,
                num_tiers: '',
                intitule_tiers: `RÉSULTAT NET À REPORTER (${diff > 0 ? 'SOLDE DÉBITEUR' : 'SOLDE CRÉDITEUR'})`,
                solde_cumule_debit: diff < 0 ? Math.abs(diff) : 0,
                solde_cumule_credit: diff > 0 ? diff : 0
            };

            setBilanPreview([...rows, ligneEquilibre]);
            setIsGenerated(true);
        } catch (err) { 
            setErrorMsg("Erreur lors de la simulation des soldes.");
        } finally { 
            setCalculating(false); 
        }
    };

    const handleAnnuler = () => {
        setIsGenerated(false);
        setBilanPreview([]);
    };
const handleLancementGlobal = async (typeSelectionne) => {
    setLoading(true);
    try {
        const compSel = planComptable.find(c => c.id === selectedCompteResultat);
        const res = await API.post('/compta/ran/generer', {
            exerciceACloturerId, 
            compteResultatId: compSel.id,
            numCompteResultat: compSel.numero_compte,
            journalId: selectedJournal,
            typeCloture: typeSelectionne 
        });

        if (res.data.success) {
            // 🔥 SIGNAL : On informe tout le monde que les exercices et les écritures ont changé
            if (socket) {
                socket.emit('DATA_EVENT', { table: 'exercises', action: 'UPDATE' });
                socket.emit('REFRESH_EXERCICES');
                socket.emit('REFRESH_JOURNAL_ENTRIES');
            }
            navigate('/compta/exercices');
        }
    } catch (err) {
        alert(err.response?.data?.error || "Erreur lors de la génération du RAN");
    } finally {
        setLoading(false);
    }
};
    return (
        <div style={layoutStyle}>
            <Sidebar />
            <main style={mainStyle}>
                <header style={headerStyle}>
                    <button onClick={() => navigate(-1)} style={btnBack}><ArrowLeft size={16} /> RETOUR</button>
                    <h1 style={titleStyle}>PIÈCE COMPTABLE DE RÉOUVERTURE - {exerciceSuivant?.libelle}</h1>
                </header>

                <div style={container}>
                    {errorMsg && (
                        <div style={{background:'#fee2e2', color:'#b91c1c', padding:'12px', borderRadius:'8px', border:'1px solid #fca5a5', fontSize:'13px', fontWeight:'bold'}}>
                            ⚠️ {errorMsg}
                        </div>
                    )}

                    <div style={topBar}>
                        <div style={inputGroup}>
                            <label style={labelStyle}>1. JOURNAL DE REPORT</label>
                            <select 
                                style={selectStyle} 
                                value={selectedJournal} 
                                onChange={(e) => setSelectedJournal(e.target.value)}
                                disabled={isGenerated || loading}
                            >
                                <option value="">-- Choisir le journal --</option>
                                {journaux.map(j => <option key={j.id} value={j.id}>{j.code} - {j.libelle}</option>)}
                            </select>
                        </div>

                        <div style={inputGroup}>
                            <label style={labelStyle}>2. COMPTE DE RÉSULTAT (120 / 129)</label>
                            <select 
                                style={selectStyle} 
                                value={selectedCompteResultat} 
                                onChange={(e) => setSelectedCompteResultat(e.target.value)}
                                disabled={isGenerated || loading}
                            >
                                <option value="">-- Sélectionner dans le plan --</option>
                                {planComptable.map(c => (
                                    <option key={c.id} value={c.id}>{c.numero_compte} - {c.intitule}</option>
                                ))}
                            </select>
                        </div>

                        {!isGenerated ? (
                            <button 
                                onClick={handleSimulerPiece} 
                                disabled={calculating || !selectedJournal || !selectedCompteResultat} 
                                style={(!selectedJournal || !selectedCompteResultat) ? btnDisabled : btnSimul}
                            >
                                {calculating ? <Loader2 className="animate-spin" /> : <><RefreshCw size={16}/> SIMULER L'ÉCRITURE</>}
                            </button>
                        ) : (
                            <button onClick={handleAnnuler} disabled={loading} style={btnCancel}>
                                <XCircle size={16} /> RECTIFIER LES PARAMÈTRES
                            </button>
                        )}
                    </div>

                    <div style={journalCard}>
                        <div style={journalHeader}>
                            <ScrollText size={18} /> <span>DÉTAIL DE LA PIÈCE DE RÉOUVERTURE AU 01/01/{exerciceSuivant?.annee}</span>
                        </div>
                        <div style={tableWrapper}>
                            <table style={tableStyle}>
                                <thead>
                                    <tr style={thRow}>
                                        <th style={thStyle}>Compte G.</th>
                                        <th style={thStyle}>Tiers</th>
                                        <th style={thStyle}>Libellé de l'opération</th>
                                        <th style={thStyle}>Débit</th>
                                        <th style={thStyle}>Crédit</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {!isGenerated ? (
                                        <tr><td colSpan="5" style={{padding:'40px', textAlign:'center', color:'#94a3b8'}}>Sélectionnez les options ci-dessus pour prévisualiser l'écriture.</td></tr>
                                    ) : (
                                        bilanPreview.map((row, i) => (
                                            <tr key={i} style={row.num_tiers ? rowTiers : rowNormal}>
                                                <td style={tdStyle}>{row.numero_compte}</td>
                                                <td style={tdStyle}>{row.num_tiers || '-'}</td>
                                                <td style={tdStyle}>{row.intitule_tiers}</td>
                                                <td style={tdMontant}>{row.solde_cumule_debit > 0 ? new Intl.NumberFormat('fr-FR').format(row.solde_cumule_debit) : ''}</td>
                                                <td style={tdMontant}>{row.solde_cumule_credit > 0 ? new Intl.NumberFormat('fr-FR').format(row.solde_cumule_credit) : ''}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                                {isGenerated && (
                                    <tfoot>
                                        <tr style={footerRow}>
                                            <td colSpan="3" style={{padding:'12px', textAlign:'right', fontWeight:'900'}}>TOTAUX ÉQUILIBRÉS :</td>
                                            <td style={tdMontant}>{new Intl.NumberFormat('fr-FR').format(totaux.debit)}</td>
                                            <td style={tdMontant}>{new Intl.NumberFormat('fr-FR').format(totaux.credit)}</td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                    </div>

                    {isGenerated && (
                        <div style={actionZone}>
                           <div style={{ display: 'flex', gap: '20px' }}>
    {/* BOUTON PROVISOIRE */}
    <button 
        onClick={() => handleLancementGlobal('PROVISOIRE')} 
        disabled={loading} 
        style={loading ? btnDisabled : { ...btnFinal, background: '#3b82f6' }}
    >
        {loading ? <Loader2 className="animate-spin" /> : <><RefreshCw size={18} /> CLÔTURE PROVISOIRE (MODIFIABLE)</>}
    </button>

    {/* BOUTON DÉFINITIF */}
    <button 
        onClick={() => {
            if(window.confirm("Attention : La clôture définitive verrouille l'exercice N-1. Continuer ?")) {
                handleLancementGlobal('DEFINITIF');
            }
        }} 
        disabled={loading} 
        style={loading ? btnDisabled : btnFinal}
    >
        {loading ? <Loader2 className="animate-spin" /> : <><CheckCircle2 size={18} /> CLÔTURE DÉFINITIVE (VERROUILLÉE)</>}
    </button>
</div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

// Styles
const layoutStyle = { display: 'flex', height: '100vh', background: '#f1f5f9' };
const mainStyle = { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' };
const headerStyle = { background: '#1e293b', color: 'white', padding: '15px 30px', display: 'flex', alignItems: 'center', gap: '20px' };
const titleStyle = { fontSize: '15px', fontWeight: 'bold', margin: 0 };
const btnBack = { background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', padding: '8px 15px', borderRadius: '5px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' };
const container = { padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto' };
const topBar = { background: 'white', padding: '15px', borderRadius: '8px', display: 'flex', alignItems: 'flex-end', gap: '15px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' };
const inputGroup = { display: 'flex', flexDirection: 'column', gap: '5px' };
const labelStyle = { fontSize: '10px', fontWeight: '900', color: '#64748b', textTransform:'uppercase' };
const selectStyle = { padding: '8px', borderRadius: '5px', border: '1px solid #cbd5e1', width: '250px', fontSize:'12px', fontWeight:'bold' };
const btnSimul = { background: '#2563eb', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' };
const btnDisabled = { ...btnSimul, background: '#cbd5e1', cursor: 'not-allowed', opacity: 0.7 };
const btnCancel = { background: '#ef4444', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' };
const journalCard = { background: 'white', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', overflow: 'hidden' };
const journalHeader = { background: '#334155', color: 'white', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', fontWeight:'bold' };
const tableWrapper = { maxHeight: '55vh', overflowY: 'auto' };
const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: '11px' };
const thRow = { background: '#f8fafc', borderBottom: '2px solid #e2e8f0' };
const thStyle = { padding: '10px', textAlign: 'left', color: '#475569', fontWeight: 'bold' };
const tdStyle = { padding: '8px 10px', borderBottom: '1px solid #f1f5f9' };
const tdMontant = { ...tdStyle, textAlign: 'right', fontWeight: 'bold', width: '120px' };
const rowNormal = { background: 'white' };
const rowTiers = { background: '#f0f9ff' };
const footerRow = { background: '#0f172a', color: 'white' };
const actionZone = { display: 'flex', justifyContent: 'center', paddingBottom: '20px' };
const btnFinal = { background: '#10b981', color: 'white', border: 'none', padding: '15px 40px', borderRadius: '50px', fontWeight: '900', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 10px 15px rgba(16,185,129,0.2)' };

export default Ran;