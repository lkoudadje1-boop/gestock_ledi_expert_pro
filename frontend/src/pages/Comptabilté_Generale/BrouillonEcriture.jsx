import React, { useState, useEffect, useRef } from 'react';
import { 
    ArrowLeft, Trash2, Loader2, Edit2, AlertCircle, CheckCircle, BookOpen, Settings 
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import Sidebar from '../../components/Sidebar';
import API, { socket, joinCompanyRoom } from '../../services/api';
import SaisiAnalytiqueBrouillon from './SaisiAnalytiqueBrouillon';
const BrouillonEcritures = () => {

    const jourInputRef = useRef(null);
    const location = useLocation();
    const navigate = useNavigate();
    const { journal, mois, moisIdx, exercice } = location.state || {};
    
    const [loading, setLoading] = useState(false);
    const [planComptable, setPlanComptable] = useState([]);
    const [planTiers, setPlanTiers] = useState([]);
    const [lignes, setLignes] = useState([]);
    const [journauxDuMois, setJournauxDuMois] = useState([]);
    const [ancienSolde, setAncienSolde] = useState(0); 
    const [isBlocked, setIsBlocked] = useState(false); 
    const [showAnalytique, setShowAnalytique] = useState(false);
   const [analytiqueParams, setAnalytiqueParams] = useState({ 
    compte_id: null, 
    montant: 0, 
    ligne_id: null, 
    id_technique: null 
});
    // Nouveaux états pour les mouvements calculés par le backend
    const [mvtDebitMois, setMvtDebitMois] = useState(0);
    const [mvtCreditMois, setMvtCreditMois] = useState(0);
    const [nouveauSoldeBackend, setNouveauSoldeBackend] = useState(0);
    const [companySettings, setCompanySettings] = useState(null);

    const [selectedIds, setSelectedIds] = useState([]);
    const [analytiqueAlerte, setAnalytiqueAlerte] = useState(false);
// Vers la ligne 40, modifie la structure de currentLine
const [currentLine, setCurrentLine] = useState({ 
    id: null,
    jour: new Date().getDate(), 
    piece_provisoire: journal?.mode_numerotation === 'AUTO' 
        ? `BR-${(journal.compteur_brouillon || 1).toString().padStart(4, '0')}` 
        : '', 
    facture: '', 
    reference: '', 
    num_compte: '', 
    num_tiers: '', 
    libelle: '', 
    debit: '', 
    credit: '',
    date_echeance: '',
    // ✅ AJOUT DES CHAMPS DE STATUT
    statut: 'EN_ATTENTE',
    observation: ''
});
    
    const [suggestionsComptes, setSuggestionsComptes] = useState([]);
    const [suggestionsTiers, setSuggestionsTiers] = useState([]);
    
    // ✅ État Toast mis à jour pour supporter les actions (OUI/NON)
    const [toast, setToast] = useState({ show: false, message: '', type: 'error', action: null });

    const isTresorerie = journal?.type_journal === 'BANQUE' || journal?.type_journal === 'CAISSE' || journal?.type_journal === 'TRESORERIE';

    const checkGlobalBalance = (allLignes) => {
        if (!allLignes || allLignes.length === 0) return false;
        const balances = {};
        allLignes.forEach(l => {
            balances[l.piece_provisoire] = (balances[l.piece_provisoire] || 0) + (parseFloat(l.debit || 0) - parseFloat(l.credit || 0));
        });
        const hasUnbalanced = Object.values(balances).some(b => Math.abs(b) > 0.01);
        setIsBlocked(hasUnbalanced);
        return hasUnbalanced;
    };

    // --- CALCULS LOGIQUE COMPTABLE (MIS À JOUR AVEC BACKEND) ---
    const safeLignes = lignes || [];
    
    const displayAncienSolde = parseFloat(ancienSolde || 0);
    const displayMvtDebit = parseFloat(mvtDebitMois || 0);
    const displayMvtCredit = parseFloat(mvtCreditMois || 0);
    const displayNouveauSolde = parseFloat(nouveauSoldeBackend || 0);

    const totalJournalDebit = safeLignes.reduce((s, l) => s + parseFloat(l.debit || 0), 0);
    const totalJournalCredit = safeLignes.reduce((s, l) => s + parseFloat(l.credit || 0), 0);

    const lignesDeLaPiece = safeLignes.filter(l => (l.piece_provisoire || l.piece) === currentLine.piece_provisoire);    const pieceDebit = lignesDeLaPiece.reduce((s, l) => s + parseFloat(l.debit || 0), 0);
    const pieceCredit = lignesDeLaPiece.reduce((s, l) => s + parseFloat(l.credit || 0), 0);
    const soldePiece = (pieceDebit - pieceCredit).toFixed(2);
    // ✅ ÉCOUTE DES ÉVÉNEMENTS SOCKET (TEMPS RÉEL)
// ✅ 1. Déclare tes fonctions d'abord (fetchExistingLignes, etc.)
// ... (tes fonctions ici)

// ✅ 2. Place ton useEffect à la toute fin, juste avant le "return"
useEffect(() => {
    if (socket) {
        // 🔥 Correction ReferenceError (Image e764cb)
        // Vérifie que joinCompanyRoom est bien importé de ton api.js
        if (typeof joinCompanyRoom === 'function') {
            joinCompanyRoom();
        }

        const handleRefresh = (event) => {
            // 🔥 Correction : On définit impactTables ICI pour éviter l'erreur (Image f50c25)
            const impactTables = [
                'brouillon_ecritures', 
                'journal_entries', 
                'companies', 
                'analytic_plans'
            ];

            if (event && impactTables.includes(event.table)) {
                console.log("🤫 SNC Silencieux : Mise à jour croisée");
                // On appelle les fonctions sans 'setLoading(true)' pour le mode silencieux
                fetchExistingLignes(true); 
                fetchJournaux(true);
            }
        };

        socket.on('DATA_EVENT', handleRefresh);
        socket.on('REFRESH_VENTILATION', () => fetchExistingLignes(true));

        return () => {
            socket.off('DATA_EVENT', handleRefresh);
            socket.off('REFRESH_VENTILATION');
        };
    }
}, [journal?.id, socket]); // ✅ Ajoute socket en dépendance
useEffect(() => {
    if (!location.state || !journal) { navigate('/compta/brouillon-selection'); return; }
    
    fetchInitialData();
    fetchExistingLignes();
    fetchJournaux();

    setCurrentLine(prev => ({
        ...prev,
        // Correction ici : le nom doit être piece_provisoire
        piece_provisoire: journal?.mode_numerotation === 'AUTO' 
            ? `BR-${(journal.compteur_brouillon || 1).toString().padStart(4, '0')}` 
            : '',
        id: null, num_compte: '', facture: '', reference: '', num_tiers: '', libelle: '', debit: '', credit: '', date_echeance: ''
    }));
}, [journal?.id, navigate]);
useEffect(() => {
    const handleKeyDown = (e) => {
        // Validation avec Entrée
        if (e.key === 'Enter' && currentLine.num_compte) {
            const el = document.activeElement;
            if (el.placeholder === "Crédit" || el.placeholder === "Débit") {
                ajouterLigne();
            }
        }
        // Fermeture du modal analytique avec Echap
        if (e.key === 'Escape') {
            setShowAnalytique(false);
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
}, [currentLine, showAnalytique]);
const fetchInitialData = async () => {
    try {
        const [resPC, resPT, resSettings] = await Promise.all([
            API.get('/plan-comptable/liste'),
            API.get('/compta/tiers'),
            API.get('/company/settings') // 🚀 AJOUT : Récupère les réglages société
        ]);
        setPlanComptable(resPC.data.data || []);
        setPlanTiers(resPT.data.data || []);
        setCompanySettings(resSettings.data || null); // 🚀 AJOUT : Stocke les réglages
    } catch (err) { 
        console.error("Erreur initialisation:", err); 
    }
};

const fetchJournaux = async () => {
    try {
        const res = await API.get('/plan-comptable/ecritures/liste-journaux-statut');
        setJournauxDuMois(res.data.data || []);

        // ✅ Déclenchement du blocage si le backend renvoie l'alerte
        if (res.data.analytique_alerte) {
            setAnalytiqueAlerte(true);
        } else {
            setAnalytiqueAlerte(false);
        }
    } catch (err) { 
        console.error("Erreur switch journaux:", err); 
    }
};
const fetchExistingLignes = async () => {
    if (!journal?.id || !exercice?.id) return; 

    try {
        setLoading(true);
        const res = await API.get('/plan-comptable/ecritures-brouillon/lignes-periodiques', { 
            params: { journal_id: journal.id, exercice_id: exercice.id, moisIdx: moisIdx } 
        });
        

        if (res.data.success) {
            const dataFromApi = res.data.data || [];
            const lignesChargees = dataFromApi.map(l => ({
                ...l,
                jour: l.date_ecriture ? new Date(l.date_ecriture).getDate() : new Date().getDate()
            }));
            setLignes(lignesChargees);
            
            setAncienSolde(res.data.ancienSolde || 0);
            setMvtDebitMois(res.data.mouvementDebit || 0);
            setMvtCreditMois(res.data.mouvementCredit || 0);
            setNouveauSoldeBackend(res.data.nouveauSolde || 0);
            
            const unbalanced = checkGlobalBalance(lignesChargees);
            
            if (unbalanced) {
                // 1️⃣ CAS : PIÈCE DÉSÉQUILIBRÉE -> On charge la pièce à équilibrer
                const balances = {};
                lignesChargees.forEach(l => {
                    const p = l.piece_provisoire || l.piece;
                    balances[p] = (balances[p] || 0) + (parseFloat(l.debit || 0) - parseFloat(l.credit || 0));
                });
                const firstUnbalancedPiece = Object.keys(balances).find(p => Math.abs(balances[p]) > 0.01);
                const lastLineOfPiece = [...lignesChargees].reverse().find(l => (l.piece_provisoire || l.piece) === firstUnbalancedPiece);
                
                if (lastLineOfPiece) {
                    const ecart = balances[firstUnbalancedPiece];
                  setCurrentLine({
    id: null,
    jour: lastLineOfPiece.jour,
    piece_provisoire: firstUnbalancedPiece,
    // ✅ On garde les infos de la ligne précédente pour faciliter la contrepartie
    facture: lastLineOfPiece.facture || '', 
    reference: lastLineOfPiece.reference || '', 
    libelle: lastLineOfPiece.libelle || '', 
    num_compte: journal.compte_numero || journal.compte_contrepartie || '', 
    num_tiers: '',
    debit: ecart < 0 ? Math.abs(ecart).toFixed(2) : '',
    credit: ecart > 0 ? Math.abs(ecart).toFixed(2) : '',
    date_echeance: lastLineOfPiece.date_echeance || ''
});
                }
            } 
            else {
                // 2️⃣ CAS : TOUT EST ÉQUILIBRÉ -> INCRÉMENTATION AUTOMATIQUE IMMÉDIATE
                if (lignesChargees.length > 0) {
                    // On extrait tous les numéros de pièce BR-XXXX pour trouver le plus grand
                    const numPieces = lignesChargees.map(l => {
                        const p = l.piece_provisoire || l.piece || "";
                        if (p.includes('-')) return parseInt(p.split('-')[1]) || 0;
                        return parseInt(p) || 0;
                    });
                    
                    const maxPiece = Math.max(...numPieces);
                    const prochainePiece = `BR-${(maxPiece + 1).toString().padStart(4, '0')}`;

                    setCurrentLine({
                        id: null,
                        jour: lignesChargees[0].jour, // On garde le jour de la dernière saisie
                        piece_provisoire: prochainePiece, // 🚀 Voici ton numéro automatique !
                        facture: '', reference: '', num_compte: '', num_tiers: '', 
                        libelle: '', debit: '', credit: '', date_echeance: ''
                    });
                } else {
                    // Si le journal est totalement vide, on prend le compteur initial
                    setCurrentLine(prev => ({
                        ...prev,
                        piece_provisoire: journal?.mode_numerotation === 'AUTO' 
                            ? `BR-${(journal.compteur_brouillon || 1).toString().padStart(4, '0')}` 
                            : ''
                    }));
                }
            }
        }
    } catch (err) { 
        console.error("Erreur historique:", err); 
    } finally { 
        setLoading(false); 
    }
};

    const isAuxiliaire = (num) => {
        if (!num) return false;
        const compte = planComptable.find(c => c.numero_compte.toString() === num.toString());
        return compte?.compte_auxiliaire === 1 || /^(40|41|42|43|44)/.test(num);
    };
const handleCompteChange = (val) => {
    // 🚫 On utilise une Regex pour supprimer tout ce qui n'est pas un chiffre
    const numericValue = val.replace(/\D/g, ''); 

    setCurrentLine({ ...currentLine, num_compte: numericValue, num_tiers: '' });
    
    if (numericValue.trim().length >= 1) {
        setSuggestionsComptes(planComptable.filter(c => 
            c.numero_compte.toString().startsWith(numericValue)
        ).slice(0, 10));
    } else { 
        setSuggestionsComptes([]); 
    }
};
const ajouterLigne = async () => {
    // 1. Sécurités de base
    if (!exercice?.id || !journal?.id) {
        showToast("Erreur : Session ou Journal invalide. Veuillez re-sélectionner le journal.", "error");
        return;
    }

    if (exercice.statut === 'CLOTURE') return;

    if (analytiqueAlerte) {
        showToast("Saisie impossible : Configurez d'abord vos plans analytiques.", "error");
        return;
    }

    const numCompteActuel = currentLine.num_compte.toString();
    const compteGeneral = planComptable.find(c => c.numero_compte.toString() === numCompteActuel);

    if (!compteGeneral) {
        showToast("Compte général invalide.", "error");
        return;
    }

    try {
        setLoading(true);
        const annee = exercice.date_debut.split('-')[0];

        const payload = {
            journal_id: journal.id,
            exercice_id: exercice.id,
            date_ecriture: `${annee}-${(moisIdx + 1).toString().padStart(2, '0')}-${currentLine.jour.toString().padStart(2, '0')}`,
            ...currentLine,
            piece: currentLine.piece_provisoire,
            facture: currentLine.facture || '',
            reference: currentLine.reference || '',
            compte_id: compteGeneral.id,
            statut: currentLine.statut || 'EN_ATTENTE'
        };

        const res = await API.post('/plan-comptable/ecritures-brouillon/enregistrer-ligne', payload);

        if (res.data.success) {
            const idFixe = res.data.id;
            const { numPieceFinale, aEteIncremente, soldePiece, contrepartie } = res.data;

            // On rafraîchit la liste des écritures en arrière-plan
            await fetchExistingLignes();

            const montantSaisi = parseFloat(currentLine.debit || currentLine.credit || 0);
            const isAnalytiqueActive = Number(companySettings?.gestion_analytique) === 1;

            // --- BLOC ANALYTIQUE ---
            if (isAnalytiqueActive && (numCompteActuel.startsWith('6') || numCompteActuel.startsWith('7')) && montantSaisi > 0) {
                const paramsPrets = {
                    ligne_id: idFixe,
                    compte_id: numCompteActuel,
                    id_technique: compteGeneral.id,
                    montant: montantSaisi
                };
                setAnalytiqueParams(paramsPrets);
                setShowAnalytique(true);
                // Note : On ne bloque pas la suite, l'analytique s'ouvre en modal
            }

            // ✅ LOGIQUE DE FIN DE SAISIE CORRIGÉE (Utilisation de soldePiece)
            const soldeCourant = parseFloat(soldePiece || 0);

            if (Math.abs(soldeCourant) > 0.01) {
                // La pièce n'est pas équilibrée : on prépare la contrepartie
                showToast(`Pièce ${numPieceFinale} déséquilibrée`, "warning");
                
                setCurrentLine({
                    ...currentLine,
                    id: null,
                    piece_provisoire: numPieceFinale,
                    num_compte: contrepartie || '',
                    num_tiers: '',
                    // Si le solde est négatif (trop de crédit), on met l'écart au débit
                    debit: soldeCourant < 0 ? Math.abs(soldeCourant).toFixed(2) : '',
                    // Si le solde est positif (trop de débit), on met l'écart au crédit
                    credit: soldeCourant > 0 ? Math.abs(soldeCourant).toFixed(2) : ''
                });
            } else {
                // La pièce est équilibrée : on passe à la suivante
                let prochainePiece = numPieceFinale;

                if (aEteIncremente) {
                    if (numPieceFinale.includes('-')) {
                        const parties = numPieceFinale.split('-');
                        const prefixe = parties[0];
                        const numero = parseInt(parties[1]) || 0;
                        prochainePiece = `${prefixe}-${(numero + 1).toString().padStart(4, '0')}`;
                    } else {
                        prochainePiece = (parseInt(numPieceFinale) + 1).toString();
                    }
                }

                setCurrentLine({
                    id: null,
                    jour: currentLine.jour,
                    piece_provisoire: prochainePiece,
                    facture: '',
                    reference: '',
                    num_compte: '',
                    num_tiers: '',
                    libelle: '',
                    debit: '',
                    credit: '',
                    date_echeance: ''
                });

                // Focus sur le jour pour enchaîner
                setTimeout(() => jourInputRef.current?.focus(), 50);
            }
        }
    } catch (err) {
        console.error("Erreur Enregistrement:", err);
        showToast("Erreur lors de l'enregistrement : " + (err.response?.data?.error || err.message), "error");
    } finally {
        setLoading(false);
    }
};
    // ✅ REMPLACEMENT DE WINDOW.CONFIRM PAR UN TOAST INTERACTIF
    // ✅ NOUVELLE LOGIQUE D'ANNULATION PAR PIÈCE ENTIÈRE
    const supprimerSelection = async () => {
        // 1. Vérifications de base
        if (selectedIds.length === 0) return;

        // On récupère les lignes sélectionnées pour l'affichage
        const lignesASupprimer = safeLignes.filter(l => selectedIds.includes(l.id));
        const piecesUniques = [...new Set(lignesASupprimer.map(l => l.piece))];

        // Fonction d'annulation réelle
    const actionAnnuler = async () => {
    setToast({ show: false, message: '', type: 'error', action: null });
    try {
        setLoading(true);
        // On envoie les IDs des lignes, le backend via le CASCADE supprimera l'entête si besoin
      const res = await API.post('/plan-comptable/ecritures-brouillon/annuler-piece', { ids: selectedIds });

        if (res.data.success) {
            await fetchExistingLignes(); 
            setSelectedIds([]);
            showToast("Écritures supprimées", "success");
        }
    } catch (err) { 
        showToast("Erreur lors de la suppression"); 
    } finally { 
        setLoading(false); 
    }
};

        // Message de confirmation dynamique
        const message = piecesUniques.length > 1 
            ? `Annuler les pièces n° ${piecesUniques.join(', ')} ?`
            : `Annuler toute la pièce n° ${piecesUniques[0]} ?`;

        showToast(message, "warning", actionAnnuler);
    };
const preparerModification = (l) => {
    setCurrentLine({
        id: l.id,
        ecriture_id: l.ecriture_id, 
        jour: l.jour,
        piece_provisoire: l.piece_provisoire || l.piece || '', 
        facture: l.facture || '',
        reference: l.reference || '',
        num_compte: l.num_compte,
        num_tiers: l.num_tiers || '',
        libelle: l.libelle,
        debit: l.debit || '',
        credit: l.credit || '',
        date_echeance: l.date_echeance || '',
        // ✅ RÉCUPÉRER LE STATUT ET L'OBSERVATION EXISTANTS
        statut: l.statut || 'EN_ATTENTE',
        observation: l.observation || ''
    });

    // Gestion de l'analytique si nécessaire
    if (l.num_compte.toString().startsWith('6') || l.num_compte.toString().startsWith('7')) {
        setAnalytiqueParams({
            ligne_id: l.id,           
            compte_id: l.num_compte,   
            id_technique: l.compte_id, 
            montant: parseFloat(l.debit || l.credit || 0)
        });
        setShowAnalytique(true); 
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
};

    const handleSelectLine = (id) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
    };

    // ✅ FONCTION TOAST MISE À JOUR (PAS D'ALERT)
    const showToast = (message, type = 'error', action = null) => {
        setToast({ show: true, message, type, action });
        // Si ce n'est pas une confirmation, on ferme après 3s
        if (!action) {
            setTimeout(() => setToast({ show: false, message: '', type: 'error', action: null }), 10000);
        }
    };
const handleBack = () => {
    if (isBlocked) {
        showToast("🔒 Blocage : Équilibrez l'écriture avant de quitter.", "error");
        return;
    }
    // Change '/compta/gen' par ta route de sélection des brouillons
    navigate('/compta/brouillon-selection'); 
};

const handleSwitchJournal = (newJournalId) => {
    if (isBlocked) {
        showToast("🔒 Équilibrez d'abord la pièce !", "error");
        return;
    }

    const selected = journauxDuMois.find(j => j.id === parseInt(newJournalId));
    
    if (selected) {
        // ✅ On navigue sur place, la "key" du div fera le reste du travail
        navigate('/compta/ecritures-saisie', { 
            state: { ...location.state, journal: selected },
            replace: true 
        });
            // On réinitialise le formulaire pour le nouveau journal
            setCurrentLine({
                id: null,
                jour: currentLine.jour,
                piece: selected.mode_numerotation === 'AUTO' ? selected.compteur_piece : '',
                facture: '', reference: '', num_compte: '', num_tiers: '', 
                libelle: '', debit: '', credit: '', date_echeance: ''
            });
        }
    };
// --- DANS BrouillonEcritures.jsx ---
const handleSaveAnalytique = async (data) => {
    try {
        setLoading(true);
        // 🚀 FORCE l'utilisation de la route BROUILLON
        const payload = {
            ligne_id: data.ligne_id || analytiqueParams.ligne_id,
            repartitions: data.repartitions
        };

        if (!payload.ligne_id) {
            showToast("Erreur : L'ID de la ligne est introuvable.", "error");
            return;
        }

        // ✅ Utilisation de la route configurée dans ton server.js pour le brouillon
        await API.post('/analytique/saisie-brouillon/ventiler', payload);
        
        setShowAnalytique(false);
        showToast("Ventilation brouillon enregistrée !", "success");
        await fetchExistingLignes(); 
    } catch (err) {
        console.error("Erreur ventilation:", err);
        showToast("Erreur lors de la ventilation (Route ou Serveur)", "error");
    } finally {
        setLoading(false);
    }
};
// --- CALCULS POUR L'ALERTE VISUELLE ---
// 1. On filtre les lignes qui ont le même numéro de pièce que celle en cours de saisie
const lignesDeLaPieceEnCours = safeLignes.filter(l => (l.piece_provisoire || l.piece) === currentLine.piece_provisoire);
// 2. On vérifie si cette pièce est équilibrée (Débit - Crédit = 0)
const estPieceEquilibree = Math.abs(parseFloat(soldePiece)) < 0.01;

// 3. On définit la variable qui causait l'erreur
const afficherAlertePersistante = lignesDeLaPieceEnCours.length > 0 && !estPieceEquilibree;

// 4. Calcul des soldes par pièce pour l'effet bleu dans le tableau
const balancesParPiece = {};
safeLignes.forEach(l => {
    balancesParPiece[l.piece] = (balancesParPiece[l.piece] || 0) + (parseFloat(l.debit || 0) - parseFloat(l.credit || 0));
});

const verifierDeclenchementAnalytique = () => {
    // 🛡️ On vérifie si l'analytique est active au niveau de la SOCIÉTÉ
    const societeActive = Number(companySettings?.gestion_analytique) === 1;

    if (!societeActive) return;

    const montant = parseFloat(currentLine.debit || currentLine.credit || 0);
    const num = currentLine.num_compte ? currentLine.num_compte.toString() : "";
    
    // Déclenchement sur charges (6) et produits (7)
    if (montant > 0 && (num.startsWith('6') || num.startsWith('7'))) {
        const compteGeneral = planComptable.find(c => c.numero_compte.toString() === num);
        
        setAnalytiqueParams({
            compte_id: num,
            id_technique: compteGeneral?.id,
            montant: montant,
            ligne_id: currentLine.id // Pour les modifications
        });
        setShowAnalytique(true);
    }
};

    return (
<div key={journal?.id} style={layoutStyle}>
    <Sidebar />
    <main style={mainStyle}>
        <header style={headerSaisieStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <button onClick={handleBack} style={{ ...btnBack, opacity: isBlocked ? 0.5 : 1, cursor: isBlocked ? 'not-allowed' : 'pointer' }}>
                    <ArrowLeft size={16} /> Retour
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#fff', padding: '5px 15px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderRight: '1px solid #e2e8f0', paddingRight: '10px' }}>
                        <BookOpen size={18} color="#2563eb" />
                        <span style={{ fontSize: '13px', fontWeight: 800, color: '#1e293b' }}>
                            {journal?.code}
                        </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Settings size={14} color="#64748b" />
                        <select 
                            style={{ 
                                border: 'none', 
                                fontSize: '12px', 
                                fontWeight: 700, 
                                color: '#2563eb', 
                                background: 'transparent', 
                                outline: 'none',
                                cursor: isBlocked ? 'not-allowed' : 'pointer'
                            }}
                            value={journal?.id}
                            onChange={(e) => handleSwitchJournal(e.target.value)}
                        >
                            {journauxDuMois.map(j => (
                                <option key={j.id} value={j.id}>
                                    {j.type_journal} : {j.intitule}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>
                            {/* --- BANDEAU DE BLOCAGE ANALYTIQUE --- */}
{analytiqueAlerte && (
    <div style={{
        backgroundColor: '#fef2f2',
        borderBottom: '1px solid #fee2e2',
        padding: '10px 25px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        color: '#991b1b'
    }}>
        <AlertCircle size={20} />
        <div>
            <strong style={{ fontSize: '13px', display: 'block' }}>Saisie bloquée : Configuration Analytique manquante</strong>
            <span style={{ fontSize: '11px' }}>
                La gestion analytique est activée pour votre société, mais aucun plan n'a été créé. 
                Veuillez configurer vos plans analytiques avant de commencer la saisie.
            </span>
        </div>
    </div>
)}
            {/* 🚀 BANDEAU D'ALERTE PERSISTANT DANS LA ZONE ROUGE DE TON IMAGE */}
            {afficherAlertePersistante && (
                <div style={{
                    flex: 1,
                    margin: '0 30px',
                    backgroundColor: '#fff1f2',
                    border: '1px solid #f87171',
                    borderRadius: '6px',
                    padding: '8px 15px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '12px',
                    color: '#991b1b',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                }}>
                    <AlertCircle size={18} />
                    <span style={{ fontSize: '13px', fontWeight: 800 }}>
                        VOTRE JOURNAL EST DÉSÉQUILIBRÉ (PIÈCE N° {currentLine.piece}) : MANQUE {Math.abs(soldePiece).toLocaleString(undefined, {minimumFractionDigits:2})} F
                    </span>
                </div>
            )}
                    {isTresorerie && (
                        <div style={topSoldeBlock}>
                            <div style={{background:'#f1f5f9', padding:'4px 10px', fontSize:'10px', fontWeight:800, borderBottom:'1px solid #cbd5e1', display:'flex', justifyContent:'space-between'}}>
                                <span>RÉCAPITULATIF : COMPTE {journal?.compte_contrepartie}</span>
                                <span>DÉBIT</span>
                                <span>CRÉDIT</span>
                            </div>
                           <table style={{width:'100%', borderCollapse:'collapse', fontSize:'11px'}}>
                               <tbody>
                                   <tr style={{borderBottom:'1px solid #e2e8f0'}}>
                                       <td style={{padding:'2px 8px', color:'#0891b2'}}>Ancien solde</td>
                                       <td style={{padding:'2px 8px', textAlign:'right', fontWeight:700, borderLeft:'1px solid #e2e8f0', width:'100px'}}>
                                           {displayAncienSolde >= 0 ? displayAncienSolde.toLocaleString(undefined, {minimumFractionDigits:2}) : ""}
                                       </td>
                                       <td style={{padding:'2px 8px', textAlign:'right', fontWeight:700, borderLeft:'1px solid #e2e8f0', width:'100px'}}>
                                           {displayAncienSolde < 0 ? Math.abs(displayAncienSolde).toLocaleString(undefined, {minimumFractionDigits:2}) : ""}
                                       </td>
                                   </tr>
                                   <tr style={{borderBottom:'1px solid #e2e8f0'}}>
                                       <td style={{padding:'2px 8px'}}>Mouvements du mois</td>
                                       <td style={{padding:'2px 8px', textAlign:'right', fontWeight:700, borderLeft:'1px solid #e2e8f0', color:'#16a34a'}}>
                                           {displayMvtDebit > 0 ? displayMvtDebit.toLocaleString(undefined, {minimumFractionDigits:2}) : ""}
                                       </td>
                                       <td style={{padding:'2px 8px', textAlign:'right', fontWeight:700, borderLeft:'1px solid #e2e8f0', color:'#dc2626'}}>
                                           {displayMvtCredit > 0 ? displayMvtCredit.toLocaleString(undefined, {minimumFractionDigits:2}) : ""}
                                       </td>
                                   </tr>
                                   <tr>
                                       <td style={{padding:'2px 8px', fontWeight:800}}>Nouveau solde</td>
                                       <td style={{padding:'2px 8px', textAlign:'right', fontWeight:800, borderLeft:'1px solid #e2e8f0', background:'#f8fafc'}}>
                                           {displayNouveauSolde >= 0 ? displayNouveauSolde.toLocaleString(undefined, {minimumFractionDigits:2}) : ""}
                                       </td>
                                       <td style={{padding:'2px 8px', textAlign:'right', fontWeight:800, borderLeft:'1px solid #e2e8f0', background:'#f8fafc'}}>
                                           {displayNouveauSolde < 0 ? Math.abs(displayNouveauSolde).toLocaleString(undefined, {minimumFractionDigits:2}) : ""}
                                       </td>
                                   </tr>
                               </tbody>
                           </table>
                        </div>
                    )}
                </header>

                {/* Saisie Bar */}
                <div style={saisieBar}>
                    <input ref={jourInputRef} type="number" placeholder="Jo." style={{width:60, ...barInput}} value={currentLine.jour} onChange={e => setCurrentLine({...currentLine, jour: e.target.value})}/>
                    <input 
    placeholder="N° pièce" 
    style={{
        width: 100, // Augmenté un peu pour "BR-0000"
        ...barInput, 
        fontWeight: 'bold', 
        color: '#2563eb', // Couleur bleue pour bien voir le BR
        backgroundColor: isBlocked && !currentLine.id ? '#f1f5f9' : 'white'
    }} 
    // CORRECTION : On utilise piece_provisoire au lieu de piece
    value={currentLine.piece_provisoire || ''} 
    readOnly={isBlocked && !currentLine.id}
    onChange={e => setCurrentLine({...currentLine, piece_provisoire: e.target.value})}
/>
                    <input placeholder="N° facture" style={{width:80, ...barInput}} value={currentLine.facture} onChange={e => setCurrentLine({...currentLine, facture: e.target.value})}/>
                    <input placeholder="Référence" style={{width:80, ...barInput}} value={currentLine.reference} onChange={e => setCurrentLine({...currentLine, reference: e.target.value})}/>
                    <div style={{position:'relative'}}>
                        <input placeholder="N° compte g" style={{width:90, ...barInput}} value={currentLine.num_compte} onBlur={() => setTimeout(() => setSuggestionsComptes([]), 200)} onChange={e => handleCompteChange(e.target.value)}/>
{suggestionsComptes.length > 0 && (
    <div style={suggestionBox}>
        {suggestionsComptes.map(s => (
            <div 
                key={s.id} 
                style={suggestionItem}
                onMouseDown={(e) => {
                    e.preventDefault(); 
                    setCurrentLine({...currentLine, num_compte: s.numero_compte});
                    setSuggestionsComptes([]);
                }}
                onMouseEnter={(e) => e.target.style.background = '#dbeafe'}
                onMouseLeave={(e) => e.target.style.background = 'white'}
            >
                <strong style={{color: '#2563eb'}}>{s.numero_compte}</strong> - {s.intitule}
            </div>
        ))}
    </div>
)}
                    </div>
                    <div style={{position:'relative'}}>
                        <input placeholder="N° compte tiers" disabled={!isAuxiliaire(currentLine.num_compte)} style={{width:100, ...barInput, background: isAuxiliaire(currentLine.num_compte) ? 'white' : '#f8fafc'}} value={currentLine.num_tiers} onBlur={() => setTimeout(() => setSuggestionsTiers([]), 200)} onChange={e => handleTiersChange(e.target.value)} />
                        {suggestionsTiers.length > 0 && (
                            <div style={suggestionBox}>
                                {suggestionsTiers.map(s => <div key={s.id} style={suggestionItem} onMouseDown={() => {setCurrentLine({...currentLine, num_tiers: s.numero_tiers}); setSuggestionsTiers([])}}><strong>{s.numero_tiers}</strong> - {s.nom}</div>)}
                            </div>
                        )}
                    </div>
                    <input placeholder="Libellé écriture" style={{flex:1, ...barInput}} value={currentLine.libelle} onChange={e => setCurrentLine({...currentLine, libelle: e.target.value.toUpperCase()})}/>
                    <input type="date" title="Échéance" style={{width:115, ...barInput}} value={currentLine.date_echeance} onChange={e => setCurrentLine({...currentLine, date_echeance: e.target.value})}/>
                    <input 
    placeholder="Débit" 
    type="number" 
    style={{width:90, textAlign:'right', ...barInput}} 
    value={currentLine.debit} 
    onChange={e => setCurrentLine({...currentLine, debit: e.target.value, credit: ''})}
 // 🚀 AJOUT
/>

<input 
    placeholder="Crédit" 
    type="number" 
    style={{width:90, textAlign:'right', ...barInput}} 
    value={currentLine.credit} 
    onChange={e => setCurrentLine({...currentLine, credit: e.target.value, debit: ''})}
 // 🚀 AJOUT
/>
                    <div style={{display:'flex', gap:'5px', alignItems:'center'}}>
                        <button onClick={ajouterLigne} style={btnGreenSave} disabled={loading}>
                            {loading ? <Loader2 size={14} className="animate-spin"/> : (currentLine.id ? "Modifier" : "Enregistrer")}
                        </button>
                        {selectedIds.length > 0 && (
                            <button onClick={supprimerSelection} style={btnDeleteGroup} title="Supprimer la sélection">
                                <Trash2 size={16} />
                            </button>
                        )}
                    </div>
                </div>

                <div style={gridWrapper}>
                    <table style={gridTable}>
                        <thead>
                            <tr style={{background:'#2f2f33', color:'white'}}>
                                <th style={{...ghStyle, width:'30px'}}></th>
                                <th style={{...ghStyle, width:'25px', textAlign:'center'}} title="Analytique">A.</th>
                                <th style={{...ghStyle, width: '55px', textAlign: 'center'}}>Jo.</th><th style={ghStyle}>N° pièce</th><th style={ghStyle}>N° facture</th><th style={ghStyle}>Référence</th><th style={ghStyle}>N° compt...</th><th style={ghStyle}>N° compt...</th><th style={ghStyle}>Libellé écriture</th><th style={ghStyle}>Date échéa...</th><th style={ghStyle}>P...</th><th style={ghStyle}>Débit</th><th style={ghStyle}>Crédit</th><th style={ghStyle}>Actions</th>
                            </tr>
                        </thead>
<tbody>
    {safeLignes.map((l) => {
        const estDesequilibre = Math.abs(balancesParPiece[l.piece] || 0) > 0.01;
        const estEligibleAna = l.num_compte.toString().startsWith('6') || l.num_compte.toString().startsWith('7');
        const isRejete = l.statut === 'REJETE'; 

        // 🎨 LOGIQUE D'ALTERNANCE PAR PIÈCE
        // On récupère la liste des pièces uniques affichées
        const piecesUniques = [...new Set(safeLignes.map(item => item.piece))];
        // On trouve l'index de la pièce actuelle (0, 1, 2...)
        const pieceIndex = piecesUniques.indexOf(l.piece);
        // Si l'index est pair -> Gris clair (#f8fafc), sinon Blanc
        const rowBgColor = pieceIndex % 2 === 0 ? '#f8fafc' : '#ffffff';

        return (
            <tr 
                key={l.id} 
                style={{
                    ...gtStyle, 
                    backgroundColor: selectedIds.includes(l.id) ? '#8cc6ec' : 
                                     isRejete ? '#fff5f5' : 
                                     (currentLine.ecriture_id === l.ecriture_id && l.ecriture_id ? '#f0f9ff' : 
                                     (estDesequilibre ? '#fef2f2' : rowBgColor)), // <--- Utilisation de rowBgColor
                    borderLeft: isRejete ? '4px solid #ef4444' : 
                                estDesequilibre ? '4px solid #f87171' : 
                                (l.ecriture_id ? '4px solid #3b82f6' : '4px solid transparent'),
                }}
            >
                <td style={{...gdStyle, textAlign:'center'}}>
    <input 
        type="checkbox" 
        checked={selectedIds.includes(l.id)} 
        onChange={() => handleSelectLine(l.id)} 
        // 🔒 Empêche la sélection pour suppression si déjà traité
        disabled={l.statut === 'VALIDE' || l.statut === 'REJETE'}
        style={{
            cursor: (l.statut === 'VALIDE' || l.statut === 'REJETE') ? 'not-allowed' : 'pointer',
            opacity: (l.statut === 'VALIDE' || l.statut === 'REJETE') ? 0.3 : 1
        }} 
    />
</td>

                {/* MODIFICATION ICI : On change la condition d'affichage */}
  <td style={{...gdStyle, textAlign:'center', width: '25px'}}>
    {estEligibleAna && (
        <div 
            title={l.is_ventilated ? "Ventilation effectuée" : "Ventilation manquante"} 
            style={{
                width: '10px', 
                height: '10px', 
                borderRadius: '50%', 
                // ✅ VERT si is_ventilated est 1 (vrai)
                // 🔴 ROUGE si is_ventilated est 0 (faux)
                backgroundColor: l.is_ventilated ? '#10b981' : '#ef4444', 
                margin: '0 auto',
                boxShadow: l.is_ventilated ? '0 0 5px rgba(16, 185, 129, 0.6)' : 'none'
            }} 
        />
    )}
</td>


                <td style={{...gdStyle, width: '55px', textAlign: 'center'}}>{l.jour}</td>
                <td style={{...gdStyle, fontWeight:'bold', color: estDesequilibre ? '#2563eb' : 'inherit'}}>{l.piece}</td>
                <td style={gdStyle}>{l.facture}</td>
                <td style={gdStyle}>{l.reference}</td>
                <td style={gdStyle}>{l.num_compte}</td>
                <td style={gdStyle}>{l.num_tiers}</td>
                <td style={gdStyle}>{l.libelle}</td>
                <td style={gdStyle}>{l.date_echeance}</td>
                <td style={gdStyle}></td>
                <td style={{...gdStyle, textAlign:'right', fontWeight:700}}>{parseFloat(l.debit||0).toLocaleString(undefined, {minimumFractionDigits:2})}</td>
                <td style={{...gdStyle, textAlign:'right', fontWeight:700}}>{parseFloat(l.credit||0).toLocaleString(undefined, {minimumFractionDigits:2})}</td>
                <td style={gdStyle}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* 🔒 ÉDITION BLOQUÉE SI VALIDE OU REJETE */}
        <Edit2 
            size={14} 
            color={(l.statut === 'VALIDE' || l.statut === 'REJETE') ? "#94a3b8" : "#3b82f6"} 
            style={{ 
                cursor: (l.statut === 'VALIDE' || l.statut === 'REJETE') ? 'not-allowed' : 'pointer',
                opacity: (l.statut === 'VALIDE' || l.statut === 'REJETE') ? 0.5 : 1 
            }} 
            onClick={() => {
                if (l.statut === 'VALIDE') {
                    showToast("🔒 Cette écriture est validée et verrouillée.", "warning");
                } else if (l.statut === 'REJETE') {
                    showToast("⚠️ Lecture obligatoire : Cliquez sur l'icône rouge pour voir le motif du rejet.", "warning");
                } else {
                    preparerModification(l);
                }
            }}
        />

        {/* ✅ Icône de Validation - Toujours visible pour confirmation */}
        {l.statut === 'VALIDE' && (
            <CheckCircle size={14} color="#10b981" title="Écriture validée" />
        )}

        {/* ⚠️ Icône de Rejet - Reste cliquable pour lire la note */}
        {l.statut === 'REJETE' && (
            <AlertCircle 
                size={14} 
                color="#ef4444" 
                style={{ cursor: 'pointer' }}
                onClick={() => showToast(`MOTIF DU REJET : ${l.observation || 'Aucune précision'}`, "warning")}
                title="Cliquer pour lire le motif du rejet"
            />
        )}
    </div>
</td>
            </tr>
        );
    })}
</tbody>
            
                    </table>
                </div>

                <footer style={footerStyleDesign}>
                    <div style={footerLeftSection}>
                        <div style={footerInfoRow}>
                            <span style={fLabel}>Journal :</span>
                            <span style={fValue}>{journal?.code} - {journal?.intitule}</span>
                        </div>
                        <div style={footerInfoRow}>
                            <span style={fLabel}>Exercice :</span>
                            <span style={fValue}>{exercice?.annee} ({exercice?.libelle})</span>
                        </div>
                    </div>

                    <div style={footerSectionCenter}>
                        <div style={fCompteBox}>
                            <span style={fLabelCompte}>COMPTE :</span>
                            <span style={fValueCompte}>
                                {currentLine.num_compte} {planComptable.find(c => c.numero_compte.toString() === currentLine.num_compte.toString())?.intitule}
                            </span>
                        </div>
                        <div style={fEquilibreBox}>
                            <span style={fLabel}>SOLDE À ÉQUILIBRER :</span>
                            <span style={{...fSoldeBig, color: Math.abs(soldePiece) > 0.01 ? '#dc2626' : '#059669'}}>
                                {soldePiece}
                            </span>
                        </div>
                    </div>

                    <div style={footerRightSection}>
                        <div style={fTotalRow}>
                            <span style={fLabel}>TOTAL DÉBIT :</span> 
                            <span style={fTotalValGreen}>{totalJournalDebit.toLocaleString(undefined, {minimumFractionDigits:2})}</span>
                        </div>
                        <div style={fTotalRow}>
                            <span style={fLabel}>TOTAL CRÉDIT :</span> 
                            <span style={fTotalValRed}>{totalJournalCredit.toLocaleString(undefined, {minimumFractionDigits:2})}</span>
                        </div>
                    </div>
                </footer>
            </main>
{/* ✅ APPEL DU MODÈLE ANALYTIQUE CORRIGÉ */}
{showAnalytique && (
    <SaisiAnalytiqueBrouillon
        compte_id={analytiqueParams.compte_id}
        id_technique={analytiqueParams.id_technique}
        montant_journal={analytiqueParams.montant}
        ligne_id={analytiqueParams.ligne_id} 
        onClose={() => setShowAnalytique(false)}
        onSave={handleSaveAnalytique} 
    />
)}
            {/* ✅ TOAST INTEGRÉ AVEC OPTION DE CONFIRMATION (REMPLACE WINDOW.CONFIRM) */}
            {toast.show && (
                <div style={{
                    ...toastContainer, 
                    backgroundColor: toast.type === 'error' ? '#fee2e2' : (toast.type === 'warning' ? '#fff7ed' : '#dcfce7'), 
                    border: toast.type === 'error' ? '1px solid #fecaca' : (toast.type === 'warning' ? '1px solid #fed7aa' : '1px solid #bbf7d0'),
                    flexDirection: 'column', 
                    alignItems: 'flex-start',
                    minWidth: '300px'
                }}>
                    <div style={{display:'flex', alignItems:'center', gap:'10px', width: '100%'}}>
                         {toast.type === 'error' ? <AlertCircle size={18} color="#ef4444"/> : <CheckCircle size={18} color="#22c55e"/>}
                         <span style={{color: '#333', fontWeight: 700, fontSize: '12px'}}>{toast.message}</span>
                    </div>
                    {toast.action && (
                        <div style={{display:'flex', gap:'10px', marginTop: '10px', width: '100%', justifyContent: 'flex-end'}}>
                            <button 
                                onClick={() => setToast({show:false})} 
                                style={{background: '#f3f4f6', border: 'none', padding: '5px 12px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, cursor: 'pointer'}}
                            >
                                ANNULER
                            </button>
                            <button 
                                onClick={toast.action} 
                                style={{background: '#ef4444', color: 'white', border: 'none', padding: '5px 12px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, cursor: 'pointer'}}
                            >
                                CONFIRMER
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// --- STYLES CORRIGÉS (LIGNES HORIZONTALES) ---
const layoutStyle = { display: 'flex', height: '100vh', background: '#f8fafc', fontFamily: "'Inter', 'Segoe UI', sans-serif" };
const mainStyle = { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' };
const headerSaisieStyle = { background: '#ffffff', padding: '12px 25px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: '70px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' };
const topSoldeBlock = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', minWidth: '380px', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' };
const saisieBar = { display: 'flex', gap: '6px', padding: '12px 20px', background: '#ffffff', borderBottom: '2px solid #3b82f6', alignItems: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' };
const barInput = { padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', outline: 'none', background: '#f8fafc', transition: 'all 0.2s' };
const gridWrapper = { flex: 1, overflowY: 'auto', background: '#ffffff', margin: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' };
const gridTable = { width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '12px' };
const ghStyle = { padding: '12px 10px', textAlign: 'left', background: '#1e293b', color: '#f8fafc', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', position: 'sticky', top: 0, zIndex: 10 };
const gdStyle = { padding: '10px', borderBottom: '1px solid #f1f5f9', borderRight: '1px solid #f1f5f9', color: '#334155' };
const footerStyleDesign = { background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)', borderTop: '3px solid #3b82f6', padding: '10px 30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '90px', boxShadow: '0 -4px 15px rgba(0,0,0,0.05)' };
const fCompteBox = { background: '#ffffff', border: '1px solid #bfdbfe', padding: '8px 20px', borderRadius: '10px', minWidth: '350px', textAlign: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' };
const fLabelCompte = { fontSize: '10px', fontWeight: 800, color: '#3b82f6', letterSpacing: '0.05em', marginBottom: '2px', display: 'block' };
const fValueCompte = { fontSize: '13px', fontWeight: 700, color: '#1e293b' };
const fSoldeBig = { fontSize: '24px', fontWeight: 900, fontFamily: "'Courier New', monospace", display: 'block' };
const fLabel = { fontSize: '10px', fontWeight: 800, color: '#166534', textTransform: 'uppercase' };
const fValue = { fontSize: '11px', fontWeight: 600, color: '#334155' };
const fEquilibreBox = { textAlign: 'center' };
const fTotalRow = { display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #bbf7d0' };
const fTotalValGreen = { fontSize: '13px', fontWeight: 800, color: '#15803d' };
const fTotalValRed = { fontSize: '13px', fontWeight: 800, color: '#b91c1c' };
const footerInfoRow = { display: 'flex', gap: '8px' };
const footerLeftSection = { display: 'flex', flexDirection: 'column', gap: '5px' };
const footerSectionCenter = { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px' };
const footerRightSection = { display: 'flex', flexDirection: 'column', gap: '5px', minWidth: '220px' };
const btnGreenSave = { background: '#10b981', color: 'white', border: 'none', padding: '8px 18px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 2px 4px rgba(16, 185, 129, 0.3)' };
const btnDeleteGroup = { background: '#ef4444', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', boxShadow: '0 2px 4px rgba(239, 68, 68, 0.3)' };
const btnBack = { background: 'white', border: '1px solid #cbd5e1', padding: '6px 15px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' };
const suggestionBox = { position: 'absolute', top: '105%', left: 0, width: '350px', background: 'white', border: '1px solid #e2e8f0', zIndex: 1000, maxHeight: '250px', overflowY: 'auto', borderRadius: '8px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' };
const suggestionItem = { padding: '10px 15px', borderBottom: '1px solid #f8fafc', cursor: 'pointer', fontSize: '12px', display: 'flex', flexDirection: 'column', transition: 'background 0.2s' };
const toastContainer = { position: 'fixed', top: '20px', right: '20px', padding: '12px 20px', borderRadius: '8px', display: 'flex', zIndex: 1000, boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' };
// ✅ Ajoute ces deux lignes dans ta section des styles en bas du fichier
const gtStyle = { transition: 'all 0.2s ease', cursor: 'default' };
const tableRowStyle = { borderBottom: '1px solid #f1f5f9' }; // Optionnel, selon tes besoins


export default BrouillonEcritures;