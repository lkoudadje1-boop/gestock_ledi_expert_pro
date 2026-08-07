import React, { useState, useEffect, useRef } from 'react';
import { 
    ArrowLeft, Trash2, Loader2, Edit2, AlertCircle, CheckCircle, BookOpen, Settings 
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import Sidebar from '../../components/Sidebar';
import API, { socket } from '../../services/api';
import SaisiAnalytique from './SaisiAnalytique';

const Ecritures = () => {

    const jourInputRef = useRef(null);
    const location = useLocation();
    const navigate = useNavigate();
    const { journal, mois, moisIdx, exercice } = location.state || {};
    const [companySettings, setCompanySettings] = useState(null);
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
// 🚀 FONCTION POUR OUVRIR LE GRAND LIVRE (HISTORIQUE)
const ouvrirHistoriqueCompte = (num) => {
    if (!num) return;
    navigate(`/compta/historique-compte/${num}`);
};
const ouvrirHistoriqueTiers = (numTiers) => {
    if (!numTiers || !exercice?.id) return;
    // On redirige vers l'historique tiers en passant l'exercice actuel
    navigate(`/compta/historique-tiers/${numTiers}?exerciceId=${exercice.id}`);
};
    // Nouveaux états pour les mouvements calculés par le backend
    const [mvtDebitMois, setMvtDebitMois] = useState(0);
    const [mvtCreditMois, setMvtCreditMois] = useState(0);
    const [nouveauSoldeBackend, setNouveauSoldeBackend] = useState(0);

    const [selectedIds, setSelectedIds] = useState([]);

    const [currentLine, setCurrentLine] = useState({ 
        id: null,
        jour: new Date().getDate(), 
        piece: journal?.mode_numerotation === 'AUTO' ? journal.compteur_piece : '', 
        facture: '', 
        reference: '', 
        num_compte: '', 
        num_tiers: '', 
        libelle: '', 
        debit: '', 
        credit: '',
        date_echeance: '' 
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
            balances[l.piece] = (balances[l.piece] || 0) + (parseFloat(l.debit || 0) - parseFloat(l.credit || 0));
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

    const lignesDeLaPiece = safeLignes.filter(l => l.piece === currentLine.piece);
    const pieceDebit = lignesDeLaPiece.reduce((s, l) => s + parseFloat(l.debit || 0), 0);
    const pieceCredit = lignesDeLaPiece.reduce((s, l) => s + parseFloat(l.credit || 0), 0);
    const soldePiece = (pieceDebit - pieceCredit).toFixed(2);

    // 🎯 FONCTION : Calculer la date d'échéance à partir du jour et du délai
const calculerEcheanceAuto = (jourSaisi, delai) => {
    if (!exercice || !jourSaisi) return '';
    try {
        const annee = exercice.date_debut.split('-')[0];
        const moisStr = (moisIdx + 1).toString().padStart(2, '0');
        const jourStr = jourSaisi.toString().padStart(2, '0');
        
        // Créer la date d'écriture
        const dateEcriture = new Date(`${annee}-${moisStr}-${jourStr}`);
        if (isNaN(dateEcriture.getTime())) return '';

        // Ajouter le délai
        dateEcriture.setDate(dateEcriture.getDate() + (parseInt(delai) || 0));
        return dateEcriture.toISOString().split('T')[0]; // Format YYYY-MM-DD
    } catch (err) {
        return '';
    }
};
useEffect(() => {
    const auxiliaire = isAuxiliaire(currentLine.num_compte);

    // 1. Nettoyage forcé si on n'est pas sur un compte tiers
    if (!auxiliaire) {
        if (currentLine.num_tiers !== '' || currentLine.date_echeance !== '') {
            setCurrentLine(prev => ({ ...prev, num_tiers: '', date_echeance: '' }));
        }
        return;
    }

    // 2. Calcul auto si on a un tiers sélectionné
    if (currentLine.num_tiers && !currentLine.id) {
        const tiers = planTiers.find(t => t.numero_tiers.toString() === currentLine.num_tiers.toString());
        if (tiers && tiers.delai_paiement > 0) {
            const nouvelleEch = calculerEcheanceAuto(currentLine.jour, tiers.delai_paiement);
            if (currentLine.date_echeance !== nouvelleEch) {
                setCurrentLine(prev => ({ ...prev, date_echeance: nouvelleEch }));
            }
        }
    }
}, [currentLine.num_compte, currentLine.num_tiers, currentLine.jour]);
useEffect(() => {
    // 1. Sécurité et redirection
    if (!location.state || !journal || !exercice) { 
        navigate('/compta/gen'); 
        return; 
    }
    
    // 2. Chargement initial des données
    fetchInitialData();
    fetchJournaux();

    // 🚀 Chargement des lignes avec gestion de la modification ciblée
    fetchExistingLignes().then((dataFraiche) => {
        if (location.state?.targetLigneId && dataFraiche) {
            const ligneAModifier = dataFraiche.find(l => l.id === location.state.targetLigneId);
            if (ligneAModifier) {
                setTimeout(() => preparerModification(ligneAModifier), 100);
            }
        }
    });

    // 3. Initialisation de la ligne courante
    setCurrentLine(prev => {
        if (prev.id !== null || location.state?.targetLigneId) return prev;
        return {
            ...prev,
            id: null,
            piece: journal.mode_numerotation === 'AUTO' ? journal.compteur_piece : '',
            num_compte: '',
            num_tiers: '',
            debit: '',
            credit: '',
            libelle: prev.libelle || ''
        };
    });

    // 4. 🔥 ÉCOUTE DU TEMPS RÉEL (SIGNAL BACKEND)
    if (socket) {
        const handleRefresh = () => {
            console.log("⚡ Mise à jour temps réel des écritures...");
            fetchExistingLignes();
        };

        // Écoute les validations, suppressions et ventilations analytiques
        socket.on('REFRESH_JOURNAL_ENTRIES', handleRefresh);
        socket.on('DATA_EVENT', (event) => {
            // Si la table des écritures réelles ou de l'analytique change
            if (event.table === 'journal_entries' || event.table === 'analytic_entries') {
                handleRefresh();
            }
        });

        // Nettoyage des écouteurs au démontage
        return () => {
            socket.off('REFRESH_JOURNAL_ENTRIES', handleRefresh);
            socket.off('DATA_EVENT');
        };
    }
}, [journal?.id, moisIdx, exercice?.id, navigate, socket]); // ✅ Ajout de 'socket' et 'navigate'

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
            API.get('/company/settings') // 👈 Récupère les colonnes de ta table 'companies'
        ]);
        setPlanComptable(resPC.data.data || []);
        setPlanTiers(resPT.data.data || []);
        setCompanySettings(resSettings.data || null); // 🚀 Contient gestion_analytique
    } catch (err) { console.error(err); }
};
const fetchJournaux = async () => {
    try {
        // ✅ On passe l'exercice_id pour filtrer les journaux de l'année en cours
        const res = await API.get('/plan-comptable/ecritures/liste-journaux-statut', {
            params: { exercice_id: exercice?.id }
        });
        setJournauxDuMois(res.data.data || []);
    } catch (err) { 
        console.error("Erreur switch journaux:", err); 
    }
};
const fetchExistingLignes = async () => {
    if (!journal?.id || !exercice?.id) return; 

    try {
        setLoading(true);
        const res = await API.get('/plan-comptable/ecritures/lignes-periodiques', {
            params: { 
                journal_id: journal.id, 
                exercice_id: exercice.id, 
                moisIdx: moisIdx 
            }
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
            
            // 🚀 PROTECTION : On ne touche au formulaire que si on n'est PAS en mode modification
            setCurrentLine(prev => {
                if (prev.id !== null) return prev; // 🔒 STOP ! On est en train de modifier, on ne touche à rien.

                if (unbalanced) {
                    const balances = {};
                    lignesChargees.forEach(l => {
                        balances[l.piece] = (balances[l.piece] || 0) + (parseFloat(l.debit || 0) - parseFloat(l.credit || 0));
                    });
                    const firstUnbalancedPiece = Object.keys(balances).find(p => Math.abs(balances[p]) > 0.01);
                    const lastLineOfPiece = [...lignesChargees].reverse().find(l => l.piece === firstUnbalancedPiece);
                    
                    if (lastLineOfPiece) {
                        const ecart = balances[firstUnbalancedPiece];
                        const numCP = journal.compte_numero || journal.compte_contrepartie || '';
                        return {
                            ...prev,
                            id: null,
                            jour: lastLineOfPiece.jour,
                            piece: lastLineOfPiece.piece,
                            facture: lastLineOfPiece.facture || '',
                            reference: lastLineOfPiece.reference || '',
                            libelle: lastLineOfPiece.libelle || '',
                            num_compte: numCP, 
                            num_tiers: '',
                            debit: ecart < 0 ? Math.abs(ecart).toFixed(2) : '',
                            credit: ecart > 0 ? Math.abs(ecart).toFixed(2) : '',
                            date_echeance: lastLineOfPiece.date_echeance || ''
                        };
                    }
                } else if (lignesChargees.length > 0) {
                    const lastLine = lignesChargees[0]; 
                    return {
                        ...prev,
                        id: null,
                        jour: lastLine ? lastLine.jour : new Date().getDate(),
                        piece: '', 
                        facture: '',
                        reference: '',
                        num_compte: '',
                        num_tiers: '',
                        libelle: lastLine ? lastLine.libelle : '',
                        debit: '',
                        credit: '',
                        date_echeance: ''
                    };
                }
                return prev;
            });

            if (!unbalanced) setIsBlocked(false);
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
    const numericValue = val.replace(/\D/g, ''); 
    const auxiliaire = isAuxiliaire(numericValue);

    setCurrentLine(prev => ({ 
        ...prev, 
        num_compte: numericValue, 
        // 🚀 Si ce n'est plus un compte auxiliaire, on nettoie tout le reste
        num_tiers: auxiliaire ? prev.num_tiers : '',
        date_echeance: auxiliaire ? prev.date_echeance : '' 
    }));
    
    if (numericValue.trim().length >= 1) {
        setSuggestionsComptes(planComptable.filter(c => 
            c.numero_compte.toString().startsWith(numericValue)
        ).slice(0, 10));
    } else { 
        setSuggestionsComptes([]); 
    }
};

const handleTiersChange = (val) => {
    setCurrentLine(prev => ({ ...prev, num_tiers: val }));
    
    if (val.trim().length >= 1) {
        const filtered = planTiers.filter(t => 
            t.numero_tiers.toString().startsWith(val) || t.nom.toLowerCase().includes(val.toLowerCase())
        ).slice(0, 10);
        setSuggestionsTiers(filtered);

        // 🚀 Si on trouve une correspondance exacte, on applique le délai immédiatement
        const tiersExact = planTiers.find(t => t.numero_tiers.toString() === val.trim());
        if (tiersExact && tiersExact.delai_paiement > 0) {
            const nouvelleEch = calculerEcheanceAuto(currentLine.jour, tiersExact.delai_paiement);
            setCurrentLine(prev => ({ ...prev, date_echeance: nouvelleEch }));
        }
    } else { 
        setSuggestionsTiers([]); 
    }
};
const ajouterLigne = async () => {
    if (exercice.statut === 'CLOTURE') return;
    
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
            date_ecriture: `${annee}-${(moisIdx+1).toString().padStart(2,'0')}-${currentLine.jour.toString().padStart(2,'0')}`,
            ...currentLine,
            piece: isBlocked ? currentLine.piece : (currentLine.id ? currentLine.piece : ''), 
            compte_id: compteGeneral.id
        };

        const res = await API.post('/plan-comptable/ecritures/enregistrer-ligne', payload);
        
        if (res.data.success) {
            const idLigneGeneree = res.data.id; 
            const { numPieceFinale, soldePiece, contrepartie, prochainePiece } = res.data;
            const montantSaisi = parseFloat(currentLine.debit || currentLine.credit || 0);
            const ecart = parseFloat(soldePiece || 0);

            // --- 🎯 BLOC ANALYTIQUE CORRIGÉ ---
            // On vérifie les réglages société ET journal
           const isAnalytiqueActive = Number(companySettings?.gestion_analytique) === 1;
            if (isAnalytiqueActive && (numCompteActuel.startsWith('6') || numCompteActuel.startsWith('7')) && montantSaisi > 0) {
                try {
                    const resCheck = await API.get(`/analytique/saisie/check/${compteGeneral.id}`, {
                        params: { ligne_id: idLigneGeneree }
                    });
                    
                    const config = resCheck.data?.data;
                    
                    // Si mode AUTO : on ventile sans ouvrir le modal
                    if (config && config.mode_saisie === 'AUTO' && !resCheck.data.isUpdate) {
                        const repartitionsFinales = Object.entries(config.repartitions).map(([planId, info]) => ({
                            plan_analytique_id: planId,
                            departement_id: config.details_plans?.[planId]?.dept_id || 'DEPT-INCONNU',
                            montant: (montantSaisi * (parseFloat(info) / 100)).toFixed(2)
                        }));
                        await API.post('/analytique/saisie/ventiler', { ligne_id: idLigneGeneree, repartitions: repartitionsFinales });
                        showToast("Ventilation automatique appliquée !", "success");
                    } 
                    // Sinon : on prépare les params et on FORCE l'ouverture
                    else {
                        setAnalytiqueParams({ 
                            ligne_id: idLigneGeneree, 
                            compte_id: numCompteActuel, 
                            id_technique: compteGeneral.id, 
                            montant: montantSaisi 
                        });
                        setShowAnalytique(true); 
                    }
                } catch (errAnalytique) { 
                    console.error("Erreur analytique:", errAnalytique); 
                }
            }

            // --- 🔄 MISE À JOUR DE L'INTERFACE ---
            if (Math.abs(ecart) > 0.01) {
                // Pièce déséquilibrée : on reste sur la même pièce
                showToast(`Pièce ${numPieceFinale} déséquilibrée`, "warning");
                setCurrentLine(prev => ({ 
                    ...prev, 
                    id: null, 
                    piece: numPieceFinale, 
                    num_compte: contrepartie || '', 
                    debit: ecart < 0 ? Math.abs(ecart).toFixed(2) : '', 
                    credit: ecart > 0 ? Math.abs(ecart).toFixed(2) : '',
                    num_tiers: '' 
                }));
            } else {
                // Pièce équilibrée : on passe à la suite
                showToast(`Pièce ${numPieceFinale} enregistrée.`, "success");
                setCurrentLine({ 
                    id: null, 
                    jour: currentLine.jour, 
                    piece: prochainePiece || '', 
                    facture: '', 
                    reference: '', 
                    num_compte: '', 
                    num_tiers: '', 
                    libelle: currentLine.libelle, 
                    debit: '', 
                    credit: '', 
                    date_echeance: '' 
                });
                setTimeout(() => jourInputRef.current?.focus(), 100);
            }

            await fetchExistingLignes();
        }
    } catch (err) { 
        console.error(err);
        showToast("Erreur lors de l'enregistrement.", "error"); 
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
        // On envoie les IDs des lignes au backend
        const res = await API.post('/plan-comptable/ecritures/annuler-piece', { 
            ids: selectedIds 
        });

        if (res.data.success) {
            // 1. Rafraîchir la liste (le tableau du bas)
            await fetchExistingLignes(); 
            
            // 2. Vider la sélection (décocher les cases)
            setSelectedIds([]);

            // 🚀 3. LE FIX CRITIQUE : On réinitialise la ligne de saisie
            // Cela permet de libérer le numéro de pièce et d'enlever le blocage rouge
            setCurrentLine(prev => ({
                ...prev,
                id: null,
                piece: '', // 👈 On vide pour que le backend génère le prochain n° propre
                debit: '',
                credit: '',
                num_compte: '',
                num_tiers: ''
            }));

            // 4. On débloque l'interface (enlève l'alerte de déséquilibre)
            setIsBlocked(false);

            showToast("Écritures supprimées et numéro libéré", "success");
            
            // 5. On remet le focus sur le champ Jour pour la suite
            setTimeout(() => jourInputRef.current?.focus(), 100);
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
        ecriture_id: l.ecriture_id, // 👈 INDISPENSABLE : on garde le lien parent
        jour: l.jour,
        piece: l.piece,
        facture: l.facture || '',
        reference: l.reference || '',
        num_compte: l.num_compte,
        num_tiers: l.num_tiers || '',
        libelle: l.libelle,
        debit: l.debit || '',
        credit: l.credit || '',
        date_echeance: l.date_echeance || ''
    });

    // ✅ Zone critique : Préparer les paramètres ET OUVRIR le modal
    if (l.num_compte.toString().startsWith('6') || l.num_compte.toString().startsWith('7')) {
        setAnalytiqueParams({
            ligne_id: l.id,           
            compte_id: l.num_compte,   
            id_technique: l.compte_id, 
            montant: parseFloat(l.debit || l.credit || 0)
        });
        
        // 🚀 LIGNE À AJOUTER :
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
            setTimeout(() => setToast({ show: false, message: '', type: 'error', action: null }), 3000);
        }
    };

    const handleBack = () => {
        if (isBlocked) {
            showToast("🔒 Blocage : Équilibrez l'écriture avant de quitter.", "error");
            return;
        }
        navigate('/compta/gen');
    };

const handleSwitchJournal = (newJournalId) => {
    if (isBlocked) {
        showToast("🔒 Équilibrez d'abord la pièce !", "error");
        return;
    }

    // 1. On trouve le journal complet
    const selected = journauxDuMois.find(j => j.id === parseInt(newJournalId));
    
    if (selected) {
        // 2. On vide immédiatement les données affichées (Effet Loader)
        setLignes([]); 
        
        // 3. On remet à zéro les compteurs de solde (très important pour le bandeau rouge)
        setMvtDebitMois(0);
        setMvtCreditMois(0);
        setNouveauSoldeBackend(0);

        // 4. On réinitialise la ligne de saisie avec les paramètres du NOUVEAU journal
        setCurrentLine({
            id: null,
            jour: currentLine.jour,
            piece: selected.mode_numerotation === 'AUTO' ? selected.compteur_piece : '',
            facture: '', 
            reference: '', 
            num_compte: '', 
            num_tiers: '', 
            libelle: currentLine.libelle, // On garde le libellé pour la productivité
            debit: '', 
            credit: '', 
            date_echeance: ''
        });

        // 5. On déclenche la navigation
        navigate('/compta/ecritures-saisie', { 
            state: { 
                ...location.state, 
                journal: selected 
            },
            replace: true 
        });
        
        showToast(`Passage au journal : ${selected.code}`, "success");
    }
};
const handleSaveAnalytique = async (data) => {
    try {
        await API.post('/analytique/saisie/ventiler', data);
        
        setShowAnalytique(false);
        showToast("Ventilation enregistrée !", "success");
        
        // C'EST CETTE LIGNE QUI MET À JOUR LES VALEURS EN COMPTA GENE SUR VOTRE ÉCRAN
        await fetchExistingLignes(); 
    } catch (err) {
        showToast(err.response?.data?.message || "Erreur serveur", "error");
    }
};
// --- CALCULS POUR L'ALERTE VISUELLE ---
// 1. On filtre les lignes qui ont le même numéro de pièce que celle en cours de saisie
const lignesDeLaPieceEnCours = safeLignes.filter(l => l.piece.toString() === currentLine.piece.toString());

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
    // 🛡️ DOUBLE VÉRIFICATION
    const societeActive = companySettings?.gestion_analytique === 1;
    const journalActif = journal?.gestion_analytique == 1;

    if (!societeActive || !journalActif) return;

    const montant = parseFloat(currentLine.debit || currentLine.credit || 0);
    const num = currentLine.num_compte ? currentLine.num_compte.toString() : "";
    
    // Déclenchement sur charges (6) et produits (7)
    if (montant > 0 && (num.startsWith('6') || num.startsWith('7'))) {
        const compteGeneral = planComptable.find(c => c.numero_compte.toString() === num);
        
        setAnalytiqueParams(prev => ({
            ...prev,
            compte_id: num,
            id_technique: compteGeneral?.id,
            montant: montant
        }));
        setShowAnalytique(true);
    }
};

return (
    <div key={`${journal?.id}-${moisIdx}`} style={layoutStyle}> 
        <Sidebar />
        <main style={mainStyle}>
 <header style={headerSaisieStyle}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        <button onClick={handleBack} style={{ ...btnBack, opacity: isBlocked ? 0.5 : 1, cursor: isBlocked ? 'not-allowed' : 'pointer' }}>
            <ArrowLeft size={16} /> Retour
        </button>

        {/* --- CONTENEUR SÉLECTEUR JOURNAL + MOIS --- */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#fff', padding: '5px 15px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
            
            {/* 1. Le Journal avec son Code */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderRight: '1px solid #e2e8f0', paddingRight: '10px' }}>
                <BookOpen size={18} color="#2563eb" />
                <span style={{ fontSize: '13px', fontWeight: 800, color: '#1e293b' }}>
                    {journal?.code}
                </span>
            </div>

            {/* 2. La Liste Déroulante pour basculer rapidement */}
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
    value={journal?.id || ""} // 👈 S'assure que la valeur affichée est la bonne
    onChange={(e) => handleSwitchJournal(e.target.value)}
    disabled={isBlocked}
>
    {journauxDuMois.map(j => (
        <option key={j.id} value={j.id}>
            {j.code} - {j.intitule}
        </option>
    ))}
</select>
            </div>

            {/* 3. 🚀 AFFICHAGE DU MOIS DE SAISIE (NOUVEAU) */}
            <div style={{
                marginLeft: '15px',
                padding: '3px 10px',
                backgroundColor: '#eff6ff', // Bleu très clair
                border: '1px solid #bfdbfe',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
            }}>
                <span style={{ fontSize: '10px', fontWeight: 800, color: '#1e40af' }}>PÉRIODE :</span>
                <span style={{ fontSize: '12px', fontWeight: 900, color: '#1e3a8a', textTransform: 'uppercase' }}>
                    {mois} {exercice?.annee}
                </span>
            </div>
        </div>
    </div>

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
                    <input ref={jourInputRef} type="number" placeholder="Jo." style={{width:40, ...barInput}} value={currentLine.jour} onChange={e => setCurrentLine({...currentLine, jour: e.target.value})}/>
<input 
    placeholder="Auto" // 🚀 Change le placeholder pour indiquer que c'est géré par le système
    style={{
        width:70, 
        ...barInput, 
        fontWeight:'bold', 
        backgroundColor: isBlocked ? '#f1f5f9' : 'white',
        color: isBlocked ? '#2563eb' : '#334155'
    }} 
    value={currentLine.piece} 
    readOnly={isBlocked} // 🚀 Bloqué SEULEMENT si on doit équilibrer
    onChange={e => setCurrentLine({...currentLine, piece: e.target.value})}
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
                       {/* Cherche ce bloc dans ton JSX et remplace-le */}
{suggestionsTiers.length > 0 && (
    <div style={suggestionBox}>
        {suggestionsTiers.map(s => (
            <div 
                key={s.id} 
                style={suggestionItem} 
                onMouseDown={() => {
                    // 🎯 Vérification : Le compte est-il un compte tiers (ex: 401, 411) ?
                    const auxiliaireValide = isAuxiliaire(currentLine.num_compte);

                    // 🚀 Logique intelligente :
                    // On ne calcule l'échéance QUE si le compte saisi est un compte auxiliaire
                    const nouvelleEch = (auxiliaireValide && s.delai_paiement > 0) 
                        ? calculerEcheanceAuto(currentLine.jour, s.delai_paiement) 
                        : ''; // Sinon, on force à vide

                    setCurrentLine({
                        ...currentLine, 
                        // Si le compte n'est pas auxiliaire, on ne met pas de tiers non plus
                        num_tiers: auxiliaireValide ? s.numero_tiers : '',
                        date_echeance: nouvelleEch
                    }); 
                    
                    setSuggestionsTiers([]);
                }}
                onMouseEnter={(e) => e.target.style.background = '#f0f9ff'}
                onMouseLeave={(e) => e.target.style.background = 'white'}
            >
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span><strong>{s.numero_tiers}</strong> - {s.nom}</span>
                    {s.delai_paiement > 0 && (
                        <span style={{ fontSize: '10px', color: '#16a34a' }}>
                            Délai paramétré : {s.delai_paiement} jours
                        </span>
                    )}
                </div>
                {s.delai_paiement > 0 && (
                    <CheckCircle size={14} color="#16a34a" style={{ marginLeft: 'auto' }} />
                )}
            </div>
        ))}
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
    onBlur={verifierDeclenchementAnalytique} // 🚀 LIGNE À AJOUTER
/>

<input 
    placeholder="Crédit" 
    type="number" 
    style={{width:90, textAlign:'right', ...barInput}} 
    value={currentLine.credit} 
    onChange={e => setCurrentLine({...currentLine, credit: e.target.value, debit: ''})}
    onBlur={verifierDeclenchementAnalytique} // 🚀 LIGNE À AJOUTER
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
                                <th style={ghStyle}>Jo...</th><th style={ghStyle}>N° pièce</th><th style={ghStyle}>N° facture</th><th style={ghStyle}>Référence</th><th style={ghStyle}>N° compt...</th><th style={ghStyle}>N° compt...</th><th style={ghStyle}>Libellé écriture</th><th style={ghStyle}>Date échéa...</th><th style={ghStyle}>P...</th><th style={ghStyle}>Débit</th><th style={ghStyle}>Crédit</th><th style={ghStyle}>Actions</th>
                            </tr>
                        </thead>

<tbody>
    {safeLignes.map((l) => {
        // 1. On calcule si la pièce est équilibrée
        const estDesequilibre = Math.abs(balancesParPiece[l.piece] || 0) > 0.01;
        
        // 2. Logique pour alterner les couleurs par "bloc de pièce"
        const piecesUniques = [...new Set(safeLignes.map(item => item.piece))];
        const pieceIndex = piecesUniques.indexOf(l.piece);
        const rowBgColor = pieceIndex % 2 === 0 ? '#f8fafc' : '#ffffff';

        // 3. Vérification analytique (Comptes 6 et 7)
        const estEligibleAna = l.num_compte.toString().startsWith('6') || l.num_compte.toString().startsWith('7');

        // 🔒 4. VERROU COMPTABLE : Est-ce que la ligne est lettrée ?
        const estLettree = l.lettre && l.lettre !== "";

        return (
            <tr 
                key={l.id} 
                style={{
                    ...gtStyle, 
                    backgroundColor: selectedIds.includes(l.id) ? '#8cc6ec' : 
                                     (currentLine.id === l.id ? '#f0f9ff' : 
                                     (estDesequilibre ? '#fef2f2' : rowBgColor)),
                    borderLeft: estDesequilibre ? '4px solid #ef4444' : (l.ecriture_id ? '4px solid #3b82f6' : '4px solid transparent'),
                    opacity: estLettree ? 0.8 : 1
                }}
            >
                <td style={{...gdStyle, textAlign:'center'}}>
                    {/* On empêche de sélectionner une ligne lettrée pour suppression */}
                    <input 
                        type="checkbox" 
                        disabled={estLettree}
                        checked={selectedIds.includes(l.id)} 
                        onChange={() => handleSelectLine(l.id)} 
                        style={{cursor: estLettree ? 'not-allowed' : 'pointer'}} 
                    />
                </td>

                <td style={{...gdStyle, textAlign:'center', width: '25px'}}>
                    {estEligibleAna && (
                        <div 
                            title={l.is_ventilated ? "Ventilation effectuée" : "Ventilation manquante"} 
                            style={{
                                width: '10px', height: '10px', borderRadius: '50%', 
                                backgroundColor: l.is_ventilated ? '#10b981' : '#ef4444', 
                                margin: '0 auto'
                            }} 
                        />
                    )}
                </td>

                <td style={gdStyle}>{l.jour}</td>
                <td style={{...gdStyle, fontWeight:'bold', color: estDesequilibre ? '#2563eb' : 'inherit'}}>{l.piece}</td>
                <td style={gdStyle}>{l.facture}</td>
                <td style={gdStyle}>{l.reference}</td>
                <td 
    style={{...gdStyle, cursor: 'pointer', color: '#2563eb', fontWeight: 'bold', textDecoration: 'underline'}} 
    onDoubleClick={() => ouvrirHistoriqueCompte(l.num_compte)}
    title="Double-cliquez pour voir le Grand Livre"
>
    {l.num_compte}
</td>

{/* --- COMPTE TIERS (DOUBLE CLIC) --- */}
<td 
    style={{
        ...gdStyle, 
        cursor: l.num_tiers ? 'pointer' : 'default', 
        color: l.num_tiers ? '#2563eb' : 'inherit', 
        fontWeight: l.num_tiers ? 'bold' : 'normal', 
        textDecoration: l.num_tiers ? 'underline' : 'none'
    }} 
    onDoubleClick={() => l.num_tiers && ouvrirHistoriqueTiers(l.num_tiers)}
    title={l.num_tiers ? "Double-cliquez pour voir le Grand Livre Tiers" : ""}
>
    {l.num_tiers}
</td>
                <td style={gdStyle}>{l.libelle}</td>
                <td style={gdStyle}>{l.date_echeance}</td>
                
                {/* On affiche la lettre si elle existe */}
                <td style={{...gdStyle, fontWeight: 'bold', color: '#2563eb', textAlign: 'center'}}>
                    {l.lettre || ''}
                </td>

                <td style={{...gdStyle, textAlign:'right', fontWeight:700}}>
                    {parseFloat(l.debit||0).toLocaleString(undefined, {minimumFractionDigits:2})}
                </td>
                <td style={{...gdStyle, textAlign:'right', fontWeight:700}}>
                    {parseFloat(l.credit||0).toLocaleString(undefined, {minimumFractionDigits:2})}
                </td>

                <td style={gdStyle}>
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                        {/* 🚀 MODIFICATION ICI : On cache le bouton si estLettree est vrai */}
                        {!estLettree ? (
                            <Edit2 
                                size={13} 
                                color="#3b82f6" 
                                cursor="pointer" 
                                onClick={() => preparerModification(l)}
                            />
                        ) : (
                            <Settings size={13} color="#94a3b8" title="Écriture lettrée (Verrouillée)" />
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
    <SaisiAnalytique 
        compte_id={analytiqueParams.compte_id}
        id_technique={analytiqueParams.id_technique}
        montant_journal={analytiqueParams.montant}
        ligne_id={analytiqueParams.ligne_id} // 👈 TRÈS IMPORTANT : Ajoute cette ligne
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

// --- STYLES ---
const layoutStyle = { display: 'flex', height: '100vh', background: '#f1f5f9', fontFamily: 'Segoe UI, sans-serif' };
const mainStyle = { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' };
const headerSaisieStyle = { background: '#f8fafc', padding: '10px 20px', borderBottom: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: '60px' };
const topSoldeBlock = { background: '#fff', border: '1px solid #94a3b8', borderRadius: '4px', minWidth: '350px', overflow:'hidden' };
const saisieBar = { display: 'flex', gap: '3px', padding: '8px 15px', background: '#e2e8f0', borderBottom: '1px solid #cbd5e1', alignItems: 'center' };
const barInput = { padding: '5px', border: '1px solid #94a3b8', fontSize: '11px', outline: 'none' };
const gridWrapper = { flex: 1, overflowY: 'auto', background: 'white' };
const gridTable = { width: '100%', borderCollapse: 'collapse', fontSize: '11px' };
const ghStyle = { padding: '8px', textAlign: 'left', borderRight: '1px solid #666', fontWeight: 400 };
const gtStyle = { borderBottom: '1px solid #f1f5f9' };
const gdStyle = { padding: '6px 8px', borderRight: '1px solid #f1f5f9' };
const footerStyleDesign = { background: '#dcfce7', borderTop: '2px solid #3b82f6', padding: '8px 25px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '80px' };
const footerLeftSection = { display: 'flex', flexDirection: 'column', gap: '5px' };
const footerSectionCenter = { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px' };
const footerRightSection = { display: 'flex', flexDirection: 'column', gap: '5px', minWidth: '220px' };
const fLabel = { fontSize: '10px', fontWeight: 800, color: '#166534', textTransform: 'uppercase' };
const fValue = { fontSize: '11px', fontWeight: 600, color: '#334155' };
const fCompteBox = { background: '#fff', border: '1px solid #3b82f6', padding: '4px 15px', borderRadius: '4px', minWidth: '300px', textAlign: 'center' };
const fLabelCompte = { fontSize: '9px', fontWeight: 800, color: '#3b82f6', display: 'block' };
const fValueCompte = { fontSize: '12px', fontWeight: 700, color: '#1e293b' };
const fEquilibreBox = { textAlign: 'center' };
const fSoldeBig = { fontSize: '18px', fontWeight: 900, display: 'block' };
const fTotalRow = { display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #bbf7d0' };
const fTotalValGreen = { fontSize: '13px', fontWeight: 800, color: '#15803d' };
const fTotalValRed = { fontSize: '13px', fontWeight: 800, color: '#b91c1c' };
const footerInfoRow = { display: 'flex', gap: '8px' };
const btnGreenSave = { background: '#16a34a', color: 'white', border: 'none', padding: '5px 15px', borderRadius: '2px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' };
const btnDeleteGroup = { background: '#ef4444', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '2px', cursor: 'pointer', display: 'flex', alignItems: 'center' };
const btnBack = { background: 'white', border: '1px solid #94a3b8', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' };
const suggestionBox = { position: 'absolute', top: '100%', left: 0, width: '320px', background: 'white', border: '1px solid #cbd5e1', zIndex: 1000, maxHeight: '200px', overflowY: 'auto', borderRadius: '6px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' };
const suggestionItem = { padding: '5px 5px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', transition: 'background 0.2s ease' };
const toastContainer = { position: 'fixed', top: '20px', right: '20px', padding: '12px 20px', borderRadius: '8px', display: 'flex', zIndex: 1000, boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' };
const moisBadgeStyle = {
    fontSize: '11px',
    fontWeight: '900',
    color: '#1e40af',
    background: '#dbeafe',
    padding: '3px 10px',
    borderRadius: '12px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    border: '1px solid #bfdbfe'
};
export default Ecritures;