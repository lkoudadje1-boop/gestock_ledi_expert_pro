import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ShoppingBag, RefreshCcw, Calendar, FileDown, Printer, Archive, Lock, XCircle, AlertTriangle, Trash2, CheckCircle, Repeat, AlertCircle   } from 'lucide-react';

// IMPORTATION DIRECTE DU SOCKET ET DES PERMISSIONS
import API, { socket } from '../../services/api'; 
import { getUserPermissions } from '../../utils/permissions_utils';
import Sidebar from '../../components/Sidebar';
import { exportToExcel } from '../../utils/excelHelper';
import { useReactToPrint } from 'react-to-print';
import InvoicePrintt from './InvoicePrintt'; 
import '../Dashboard.css';

// 🚀 IMPORTER LE SERVICE DE CONVERSION LOGISTIQUE ALIGNÉ SUR LE SCHÉMA SQLITE
import { ConversionStockService } from '../../utils/converisonstock';

const HistoriqueVentes = () => {
    // 🔑 CONVERSION DU SÉCURISEUR COMPTABLE : AJOUT D'UNE VALIDATION SOUPLE DU TYPE DE DONNÉE
    const userPerms = useMemo(() => getUserPermissions(), []);

    const canCancelSale = userPerms['pos_cancel_sale'] === true || userPerms['pos_cancel_sale'] === 1 || userPerms['pos_cancel_sale'] === 'true'; 
    const canReturnItem = userPerms['pos_return_item'] === true || userPerms['pos_return_item'] === 1 || userPerms['pos_return_item'] === 'true'; 
    const canArchiveSale = userPerms['pos_history'] === true || userPerms['pos_history'] === 1 || userPerms['pos_history'] === 'true';

    // --- 1. ÉTATS & REFS ---
    const [ventes, setVentes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isInventoryActive, setIsInventoryActive] = useState(false);
    const [lastClosureDate, setLastClosureDate] = useState(null);
    const [showFullHistory, setShowFullHistory] = useState(false);
    const [activeTab, setActiveTab] = useState('active'); 

    const [selectedLotId, setSelectedLotId] = useState(null); 
    const [selectedDetailId, setSelectedDetailId] = useState(null); 
    
    // Structure d'impression calquée fidèlement sur ValiderVente
    const printRef = useRef(null);
    const [printData, setPrintData] = useState(null);
    const [printFormat, setPrintFormat] = useState('A5'); // 'A5' ou 'A6'

    // 🚀 LECTURE DU LOCALSTORAGE POUR HYDRATER LE LOGO ET LA COMPAGNIE EN TEMPS RÉEL
    const currentUser = useMemo(() => JSON.parse(localStorage.getItem('user') || '{}'), []);
    
    const [dynamiqueCompanyPrint, setDynamiqueCompanyPrint] = useState({
        name: currentUser.company_name || currentUser.companyName || "LEDI EXPERT PRO",
        address: currentUser.company_address || currentUser.companyAddress || "Adresse non renseignée",
        phone: currentUser.company_phone || currentUser.companyPhone || "Tél: N/A",
        email: currentUser.company_email || currentUser.companyEmail || "Email: N/A",
        logo_data: currentUser.company_logo || currentUser.logo_data || currentUser.logo || null
    });

    // 🚀 EFFET POUR CHARGER LES PARAMÈTRES SI NON PRÉSENTS DANS LE LOCALSTORAGE
    useEffect(() => {
        const fetchCompanySettings = async () => {
            try {
                const res = await API.get('/company/settings'); 
                if (res.data) {
                    const data = res.data.success && res.data.data ? res.data.data : res.data;
                    setDynamiqueCompanyPrint({
                        name: data.name || data.nom || data.raison_sociale || currentUser.company_name || "LEDI EXPERT PRO",
                        address: data.address || data.adresse || currentUser.company_address || "Adresse non renseignée",
                        phone: data.phone || data.telephone || currentUser.company_phone || "Tél: N/A",
                        email: data.email || currentUser.company_email || "Email: N/A",
                        logo_data: data.logo_data || data.logo || data.logo_url || currentUser.company_logo || null
                    });
                }
            } catch (err) {
                console.error("Erreur lors du chargement des paramètres de l'entreprise:", err);
            }
        };
        fetchCompanySettings();
    }, [currentUser]);

    const [selectedVenteForPrint, setSelectedVenteForPrint] = useState(null);
    const [activeActionRow, setActiveActionRow] = useState(null); // { id: 123, type: 'RETOUR' }
    const [actionMotif, setActionMotif] = useState('');
    
    // Assurez-vous que le nom du setter correspond exactement : setConfirmModal
    const [confirmModal, setConfirmModal] = useState({
        isOpen: false,
        message: '',
        onConfirm: () => {},
        isAlert: false
    });
    const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

    // 🚀 FORMATEUR LOGISTIQUE EMBARQUÉ CENTRAL : Convertit les pièces de l'historique en casiers/colis fluides sans bug de NaN
    const formaterStockPOS = useCallback((art) => {
        if (!art) return "-";
        
        // ⚡ OPTIMISATION : Si le backend fournit déjà la chaîne formatée prête à l'emploi
        if (art.qte_vendue_formatee) {
            return art.qte_vendue_formatee;
        }
        
        // Extraction de la quantité vendue ou du stock de la ligne d'historique (Fallback)
        const valeurStock = art.qte_vendue !== undefined ? art.qte_vendue : (art.quantite || art.stock_actuel || 0);
        
        // 🛡️ VERROU ANTI-NaN : Si SQLite renvoie déjà du texte formaté
        if (typeof valeurStock === 'string' && isNaN(Number(valeurStock.trim()))) {
            return valeurStock;
        }

        const qtePieces = Math.abs(Number(valeurStock));
        if (isNaN(qtePieces)) return "0 U";

        try {
            return ConversionStockService.toExpressionTextuelle(qtePieces, art.article_complet || art);
        } catch (error) {
            return `${qtePieces} U`;
        }
    }, []);

    // 📊 🎯 RENDU DU CONVERTISSEUR COMPTABLE RECAPITULATIF POUR LE COMPOSANT D'IMPRESSION HISTORIQUE
    const genererRecapUnitesDepuisVente = useCallback((panierArticles) => {
        if (!Array.isArray(panierArticles) || panierArticles.length === 0) return [];
        
        const couplesLogistiques = {};

        panierArticles.forEach(item => {
            const ratio = Math.abs(parseInt(item.ratio_conversion || item.ratio || 1));
            const gros = Math.abs(Number(item.saisie_gros || item.quantite_gros || 0));
            const detail = Math.abs(Number(item.saisie_detail || item.quantite_detail || 0));
            const qteTotal = Math.abs(Number(item.quantite || item.qte_achetee || item.qte_vendue || 0));

            // 🔒 SÉCURITÉ CRITIQUE COMPTABLE : Protection absolue des labels d'origine (CS, CS2, CRT...)
            const labelGros = String(item.unite_gros || item.unite_libelle_snap || item.libelle_gros_final || 'CS').toUpperCase().trim();
            const labelDetail = String(item.unite_detail || item.unite_snap || item.libelle_detail_final || item.unite_reference || 'BTS').toUpperCase().trim();

            const cleCouple = `${labelGros}-${labelDetail}`;

            let piecesLigne = 0;
            if (gros > 0 || detail > 0) {
                piecesLigne = (gros * ratio) + detail;
            } else {
                piecesLigne = qteTotal;
            }

            if (!couplesLogistiques[cleCouple]) {
                couplesLogistiques[cleCouple] = {
                    totalPieces: 0,
                    ratio: ratio,
                    grosLabel: labelGros,
                    detailLabel: labelDetail
                };
            }
            couplesLogistiques[cleCouple].totalPieces += piecesLigne;
        });

        return Object.keys(couplesLogistiques).map(cle => {
            const group = couplesLogistiques[cle];
            const cartonsFinaux = Math.floor(group.totalPieces / group.ratio);
            const bouteillesFinelles = Math.round(group.totalPieces % group.ratio);

            // 🎯 LOGIQUE COMPTABLE PARFAITE : Maintient le format "Gros + Détail" complet sans omettre le gros à 0
            const expressionAssociee = `${cartonsFinaux} ${group.grosLabel} + ${bouteillesFinelles} ${group.detailLabel}`;

            return {
                unite: expressionAssociee,
                unite_gros: group.grosLabel,
                unite_detail: group.detailLabel
            };
        });
    }, []);

    // Fonction utilitaire pour afficher le toast
    const showNotification = (message, type = 'success') => {
        setToast({ show: true, message, type });
        setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 4000);
    };
    const initialDates = { start: '', end: '' };
    const initialFilters = {
        id_vente: '', lot_id: '', client: '', product_id: '', nom_article: '', 
        nom_utilisateur: '', date_vente: ''
    };

    const [dateRange, setDateRange] = useState(initialDates);
    const [colFilters, setColFilters] = useState(initialFilters);

    // --- 2. CHARGEMENT DES DONNÉES ---
    const fetchSales = useCallback(async () => {
        setLoading(true);
        try {
            let endpoint = '/sales';
            if (activeTab === 'deleted') endpoint = '/sales/deleted';
            if (activeTab === 'archived') endpoint = '/sales/archived';

            const res = await API.get(endpoint); 
            setVentes(Array.isArray(res.data) ? res.data : []);
        } catch (err) {
            console.error("Erreur chargement ventes:", err);
            setVentes([]);
        } finally {
            setLoading(false);
        }
    }, [activeTab]);


    const checkInventoryStatus = useCallback(async () => {
        try {
            const res = await API.get('/inventories/check-status');
            setIsInventoryActive(!!res.data.en_cours);
            setLastClosureDate(res.data.last_closure);
        } catch (err) {
            console.error("Erreur vérification inventaire:", err);
        }
    }, []);

    // --- 3. LOGIQUE TEMPS RÉEL (SOCKET) ---
    useEffect(() => {
        fetchSales();
        checkInventoryStatus();

        // Ajout des écouteurs Sockets natifs pour synchroniser l'historique
        if (socket) {
            socket.on('STOCK_UPDATED', fetchSales);
            socket.on('REFRESH_STOCK', fetchSales);
        }

        const handleUpdate = (event) => {
            const { table } = event.detail;
            if (table === 'sales' || table === 'inventory' || table === 'all') {
                fetchSales();
                checkInventoryStatus();
            }
        };

        window.addEventListener('ERP_DATA_CHANGED', handleUpdate);
        return () => {
            window.removeEventListener('ERP_DATA_CHANGED', handleUpdate);
            if (socket) {
                socket.off('STOCK_UPDATED', fetchSales);
                socket.off('REFRESH_STOCK', fetchSales);
            }
        };
    }, [activeTab, fetchSales, checkInventoryStatus]);

    // --- 4. LOGIQUE D'IMPRESSION SUR ÉTUDES DE PAGES ALIGNÉE SUR VALIDERVENTE ---
    const handlePrint = useReactToPrint({
        content: () => printRef.current,
        documentTitle: `FACTURE_HISTORIQUE`,
        pageStyle: `
            @page {
                size: ${printFormat === 'A6' ? 'A6 portrait' : 'A5 portrait'} !important; 
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

    // GESTIONNAIRE D'IMPRESSION DÉCOUPLÉ SYNCHRONISÉ AVEC LE SETTIMEOUT DE 180MS
    const declencherImpressionSynchronisee = useCallback((dataPourImpression, formatChoisi = 'A5') => {
        setPrintFormat(formatChoisi);
        setPrintData(dataPourImpression);
        setTimeout(() => {
            handlePrint();
        }, 180);
    }, [handlePrint]);
    // --- 5. LOGIQUE MÉTIER ---
    const checkIsLocked = (dateVente) => {
        if (isInventoryActive) return { isLocked: true, reason: 'INVENTAIRE_EN_COURS' };
        if (lastClosureDate && dateVente) {
            const dateV = new Date(dateVente);
            const dateC = new Date(lastClosureDate);
            if (dateV <= dateC) return { isLocked: true, reason: 'ARCHIVE_GELEE' };
        }
        return { isLocked: false, reason: null };
    };

    // --- LOGIQUE D'IMPRESSION MISE À ZONE SÉCURISÉE (DYNAMIQUE A5/A6 ALIGNÉE SUR VALIDERVENTE) ---
    const preparePrint = (lotId, formatChoisi = 'A5') => {
        const lignesDuLot = ventes.filter(v => v.lot_id === lotId);
        
        if (lignesDuLot.length === 0) {
            showNotification("Vente non trouvée ou vide", "error");
            return;
        }
        const totalLot = lignesDuLot.reduce((sum, ligne) => sum + Number(ligne.prix_total_ligne || 0), 0);
        const firstLine = lignesDuLot[0];

        // 🚀 HYDRATATION LOGISTIQUE POUR L'IMPRESSION DE FACTURE ANCIENNE
        // Permet au ticket InvoicePrint d'extraire les conditionnements réels à l'impression
      // À l'intérieur de la fonction .map de lignesHydratees dans HistoriqueVente.jsx :
const lignesHydratees = lignesDuLot.map(ligne => {
    const currentCoeff = Number(ligne.unit_coefficient ?? ligne.coefficient ?? 1);
    const currentCodeGros = ligne.unit_code_gros ?? ligne.code ?? 'CS';
    const currentRefDetail = ligne.unit_ref_detail ?? ligne.unite_reference ?? 'UNITÉ';

    return {
        ...ligne,
        nom_article_snap: ligne.nom_article_snap || ligne.nom_article || 'Article',
        
        // 🎯 CORRECTION DES PRIX ET REMISES DEPUIS SQLITE :
        prix_vente_unitaire: Math.abs(Number(ligne.prix_unitaire_snap || ligne.prix_vente_unitaire || ligne.prix_unitaire || 0)),
        remise_montant: Math.abs(Number(ligne.remise_ligne || ligne.remise_montant || ligne.remise || 0)),
        
        montant_ttc_ligne: ligne.prix_total_ligne || ligne.total_ttc || 0,
        quantite: Math.abs(Number(ligne.quantite || ligne.qte_vendue || 0)),
        
        // 🎯 FORCE LE SQUELETTE D'UNITÉ INITIAL (BTS / C12)
        qte_vendue_formatee: ligne.qte_vendue_formatee || formaterStockPOS(ligne),
        article_complet: {
            id: ligne.product_id,
            nom: ligne.nom_article_snap,
            coefficient: currentCoeff,
            unit_coefficient: currentCoeff,
            code: currentCodeGros,
            unit_code_gros: currentCodeGros,
            unite_reference: currentRefDetail,
            unit_ref_detail: currentRefDetail
        }
    };
});


        // 🔒 ADÉQUATION DU PAYLOAD SÉCURISÉ ET DÉCLENCHEMENT SYNCHRONISÉ FLUIDE
        const payloadImpression = {
            panier: lignesHydratees, 
            venteInfo: {
                provisoir_no: lotId,
                facture_no: firstLine.facture_no || firstLine.id_vente || lotId,
                date: firstLine.date_vente || new Date().toISOString(),
                client_nom: firstLine.nom_client_snap || firstLine.client || 'CLIENT AU COMPTANT',
                mode_paiement: firstLine.mode_paiement || firstLine.moyen_paiement || "Espèces",
                vendeur: firstLine.nom_utilisateur || firstLine.nom_caissier || 'Caissier',
                staff_name_snap: firstLine.staff_name || 'Caissier',
                table_name_snap: firstLine.table_number || 'Non assignée',
                total_ht: totalLot,
                total_ttc: totalLot,
                montant_recu: Number(firstLine.montant_recu || totalLot),
                reliquat: Math.max(0, Number(firstLine.monnaie_rendue || 0)),
                est_definitive: true,
                format: formatChoisi
            },
            // 🚀 CORRECTION INJECTION : Transmission explicite de l'objet de l'entreprise
            company: { ...dynamiqueCompanyPrint },
            // 📊 INJECTION DU RÉSUMÉ TRAITÉ SPÉCIFIQUEMENT SUR LE PANIER ACTUEL SÉLECTIONNÉ
            recapUnites: genererRecapUnitesDepuisVente(lignesHydratees)
        };

        // Appel du gestionnaire d'impression découplé synchrone stabilisé
        declencherImpressionSynchronisee(payloadImpression, formatChoisi);
    };
    const handleActionClick = (actionFn, id, dateVente) => {
        if (activeTab !== 'active') return;

        const lockStatus = checkIsLocked(dateVente);
        if (lockStatus.isLocked) {
            const message = lockStatus.reason === 'INVENTAIRE_EN_COURS'
                ? "⚠️ ACTION BLOQUÉE : Un inventaire est en cours."
                : "⚠️ DONNÉE GELÉE : Cette vente appartient à un exercice clôturé.";
            
            setConfirmModal({
                isOpen: true,
                message: message,
                onConfirm: () => setConfirmModal({isOpen: false, message: '', onConfirm: () => {}, isAlert: false}),
                isAlert: true
            });
            return;
        }
        actionFn(id);
    };

    const handleCancelSale = async (lotId) => {
        // Validation granulaire pour l'annulation globale de lot
        if (!canCancelSale) {
            showNotification("Action refusée : Votre profil ne possède pas le privilège d'annulation.", "error");
            return;
        }


        setConfirmModal({
            isOpen: true,
            message: `Voulez-vous vraiment ANNULER tout le lot ${lotId} ? Cette action est irréversible et recréditera les stocks.`,
            isAlert: false,
            onConfirm: async () => {
                try {
                    await API.post(`/sales/cancel/${lotId}`);
                    showNotification(`Le lot ${lotId} a été annulé avec succès.`, 'success');
                    fetchSales(); 
                } catch (err) {
                    const errorMessage = err.response?.data?.error || err.message;
                    showNotification(`Erreur lors de l'annulation : ${errorMessage}`, 'error');
                    console.error("Erreur annulation lot:", err);
                }
            }
        });
    };

    // Remplacez vos appels dans le JSX par handleActionWithMotif
    const handleActionWithMotif = (type, item) => {
        if (activeTab !== 'active') return;

        // 🔑 SÉCURITÉ DE POSTE INTERNE : Interdire le traitement si le privilège granulaire est absent
        if (type === 'ANNULATION' && !canCancelSale) {
            showNotification("Action refusée : Votre profil ne possède pas le privilège d'annulation.", "error");
            return;
        }
        if (type === 'RETOUR' && !canReturnItem) {
            showNotification("Action refusée : Votre profil ne possède pas le privilège de retour article.", "error");
            return;
        }

        const lockStatus = checkIsLocked(item.date_vente);
        if (lockStatus.isLocked) {
            setConfirmModal({
                isOpen: true,
                message: lockStatus.reason === 'INVENTAIRE_EN_COURS'
                    ? "⚠️ ACTION BLOQUÉE : Un inventaire est en cours."
                    : "⚠️ DONNÉE GELÉE : Cette vente appartient à un exercice clôturé.",
                onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
                isAlert: true
            });
            return;
        }

        setConfirmModal({
            isOpen: true,
            message: `Justification obligatoire pour ${type === 'RETOUR' ? 'le retour' : "l'annulation"} de : ${item.nom_article_snap || item.nom_article}`,
            showInput: true,
            motif: '',
            isAlert: false,
            onConfirm: async (motifSaisi) => {
                if (!motifSaisi || motifSaisi.trim().length < 3) {
                    showNotification("Le motif est obligatoire (minimum 3 caractères).", "error");
                    return;
                }
                try {
                    // Utilisation des bons endpoints basés sur le type
                    const endpoint = type === 'RETOUR' 
                        ? `/sales/return-item/${item.id}` 
                        : `/sales/cancel-item/${item.id}`;
                    
                    // 🛡️ RECALCUL LOGISTIQUE POUR LA RESTAURATION DES COMPTES DE STOCK SANS CONFLIT CS/CS2
                    const currentCoeff = Number(item.unit_coefficient ?? item.coefficient ?? 1);
                    const qteBrute = Math.abs(Number(item.quantite || item.qte_vendue || 0));

                    await API.post(endpoint, { 
                        motif: motifSaisi,
                        observation: motifSaisi,
                        // Transmission sécurisée des variables d'unités de l'historique SQLite
                        quantite: qteBrute,
                        coefficient: currentCoeff,
                        unite_gros: item.unite_gros || item.unit_code_gros || 'CS',
                        unite_detail: item.unite_detail || item.unit_ref_detail || 'BTS'
                    });
                    
                    setConfirmModal({ isOpen: false, message: '', onConfirm: () => {}, isAlert: false, showInput: false, motif: '' });
                    fetchSales(); 
                    showNotification("Opération effectuée avec succès.", "success");
                } catch (err) {
                    showNotification("Erreur: " + (err.response?.data?.error || err.message), "error");
                }
            }
        });
    };
const handleSubmitAction = async (item) => {
    if (!actionMotif || actionMotif.trim().length < 3) {
        showNotification("Le motif est obligatoire (min. 3 caractères)", "error");
        return;
    }

    // 🔑 SÉCURITÉ DE POSTE INTERNE : Interdire la validation si le privilège granulaire est absent
    const typeAction = activeActionRow?.type;
    if (typeAction === 'ANNULATION' && !canCancelSale) {
        showNotification("Action refusée : Privilège d'annulation manquant.", "error");
        return;
    }
    if (typeAction === 'RETOUR' && !canReturnItem) {
        showNotification("Action refusée : Privilège de retour article manquant.", "error");
        return;
    }

    try {
        const targetItem = item || activeActionRow?.item;
        if (!targetItem?.id) {
            showNotification("Aucun article sélectionné pour cette action.", "error");
            return;
        }

        const endpoint = typeAction === 'RETOUR' 
            ? `/sales/return-item/${targetItem.id}` 
            : `/sales/cancel-item/${targetItem.id}`;

        // 🛡️ RECALCUL LOGISTIQUE POUR LA RESTAURATION DES COMPTES DE STOCK SANS CONFLIT CS/CS2
        const currentCoeff = Number(targetItem.unit_coefficient ?? targetItem.coefficient ?? 1);
        const qteBrute = Math.abs(Number(targetItem.quantite || targetItem.qte_vendue || 0));

        // ENVOI DU MOTIF ET DES COMPOSANTS COMPTABLES AU SERVEUR
        await API.post(endpoint, { 
            observation: actionMotif.trim(),
            motif: actionMotif.trim(),
            // Transmission sécurisée des variables d'unités de l'historique SQLite
            quantite: qteBrute,
            coefficient: currentCoeff,
            unite_gros: targetItem.unite_gros || targetItem.unit_code_gros || 'CS',
            unite_detail: targetItem.unite_detail || targetItem.unit_ref_detail || 'BTS'
        });

        showNotification(`${typeAction === 'RETOUR' ? 'Retour' : 'Annulation'} validé avec succès`, "success");
        setActiveActionRow(null);
        setActionMotif('');
        fetchSales(); 
    } catch (err) {
        const errorMsg = err.response?.data?.error || "Une erreur est survenue.";
        showNotification(errorMsg, "error");
    }
};
const handleArchive = (id) => {
    // 🔑 SÉCURITÉ DE POSTE INTERNE : Interdire l'archivage si le privilège est absent
    if (!canArchiveSale) {
        showNotification("Action refusée : Vous n'avez pas le droit d'archiver ces enregistrements.", "error");
        return;
    }

    setConfirmModal({
        isOpen: true,
        message: "Voulez-vous vraiment archiver cet élément ?",
        isAlert: false,
        onConfirm: async () => {
            try {
                await API.post(`/sales/archive/${id}`);
                showNotification("Élément archivé avec succès.", "success");
                fetchSales(); 
                setConfirmModal({isOpen: false, message: '', onConfirm: () => {}, isAlert: false});
            } catch (err) {
                showNotification("Erreur lors de l'archivage", "error");
            }
        }
    });
};

const resetHistory = () => {
    setColFilters(initialFilters);
    setShowFullHistory(true);
    setSelectedLotId(null);
    setSelectedDetailId(null);
};

const handleFullRefresh = async () => {
    setLoading(true);
    setDateRange(initialDates);
    setColFilters(initialFilters);
    setShowFullHistory(false);
    setSelectedLotId(null);
    setSelectedDetailId(null);
    await Promise.all([fetchSales(), checkInventoryStatus()]);
};

const formatDateSafe = (dStr) => {
    if (!dStr) return "N/A";
    const d = new Date(dStr);
    return isNaN(d.getTime()) ? "N/A" : d.toLocaleDateString();
};

const formatTimeSafe = (dStr) => {
    if (!dStr) return "";
    const d = new Date(dStr);
    return isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const handleExport = () => {
    // Note : s'assurer que filteredVentesDetail est accessible ici (généralement calculé via useMemo plus bas)
    const itemsToExport = typeof filteredVentesDetail !== 'undefined' ? filteredVentesDetail : ventes;
    
    if (itemsToExport.length === 0) {
        showNotification("Aucune donnée à exporter", "error");
        return;
    }
    
    const dataToExport = itemsToExport.map(v => ({
        "ID Vente": v.id_vente,
        "Lot ID": v.lot_id,
        "Article": v.nom_article_snap || v.nom_article,
        "Quantité Brute (Pièces)": v.qte_vendue,
        "Quantité Logistique": v.qte_vendue_formatee || formaterStockPOS(v), // 🚀 Export avec le formatage exact converti
        "Total TTC": v.prix_total_ligne,
        "Client": v.nom_client_snap || 'CLIENT AU COMPTANT',
        "Utilisateur": v.nom_utilisateur || v.nom_caissier || 'Inconnu',
        "Date": `${formatDateSafe(v.date_vente)} ${formatTimeSafe(v.date_vente)}`
    }));
    
    exportToExcel(
        dataToExport, 
        `Export_Ventes_${activeTab}_${new Date().toISOString().split('T')[0]}`,
        'sales', // tableConcernee
        `Export des ventes (${activeTab})` // description
    );
};
const submitLotCancellation = async (lotId) => {
        if (!actionMotif.trim()) {
            return showNotification("Le motif est obligatoire", 'error');
        }

        // 🔑 SÉCURITÉ DE POSTE INTERNE : Bloquer l'annulation complète du lot si la permission est absente
        if (!canCancelSale) {
            showNotification("Action refusée : Votre profil ne possède pas le privilège requis pour annuler un lot complet de factures.", "error");
            return;
        }

        try {
            // On envoie 'observation' pour correspondre au paramètre attendu par le Backend
            await API.post(`/sales/cancel/${lotId}`, { 
                observation: actionMotif.trim(), 
                motif: actionMotif.trim() // On garde motif par précaution
            });
            
            showNotification(`Lot ${lotId} annulé avec succès`, 'success');
            setActiveActionRow(null); 
            setActionMotif(''); // Vider le champ après succès
            fetchSales(); 
        } catch (err) {
            showNotification("Erreur lors de l'annulation : " + (err.response?.data?.error || err.message), 'error');
        }
    };

    // --- 7. MEMOS FILTRES EN PIECES NATIVES ---
    const ventesFiltréesParDate = useMemo(() => {
        return ventes.filter(v => {
            if (!v.date_vente) return false;
            let dv = new Date(v.date_vente).toISOString().split('T')[0];
            return (!dateRange.start || dv >= dateRange.start) && (!dateRange.end || dv <= dateRange.end);
        });
    }, [ventes, dateRange]);

    const filteredVentesDetail = useMemo(() => {
        return ventesFiltréesParDate.filter(v => {
            const dv = v.date_vente ? new Date(v.date_vente).toISOString().split('T')[0] : '';
            const matchDate = !colFilters.date_vente || dv.includes(colFilters.date_vente);
            const nomArticle = (v.nom_article_snap || v.nom_article || '').toLowerCase();
            const nomClient = (v.nom_client_snap || v.client || 'CLIENT AU COMPTANT').toLowerCase();

            return (
                matchDate &&
                String(v.id_vente || '').toLowerCase().includes((colFilters.id_vente || '').toLowerCase()) &&
                String(v.lot_id || '').toLowerCase().includes((colFilters.lot_id || '').toLowerCase()) &&
                nomClient.includes((colFilters.client || '').toLowerCase()) &&
                nomArticle.includes((colFilters.nom_article || '').toLowerCase())
            );
        });
    }, [ventesFiltréesParDate, colFilters]);

const groupedByLot = useMemo(() => {
    if (!Array.isArray(ventesFiltréesParDate) || ventesFiltréesParDate.length === 0) return [];
    const groups = {};
    
    ventesFiltréesParDate.forEach(v => {
        const lotKey = v.lot_id || "SANS-LOT";
        if (!groups[lotKey]) {
            groups[lotKey] = { 
                lot_id: lotKey, 
                date_vente: v.date_vente, 
                qte_totale: 0, // Conservé pour la rétrocompatibilité des totalisateurs numériques
                qte_totale_textuelle: "", // 🎯 NOUVEAU : Contient le résumé logistique propre (ex: "2 CS + 1 CS2")
                total_ttc: 0, 
                utilisateur: v.nom_utilisateur || v.user_name || 'Inconnu', 
                staff: v.nom_staff || v.staff_name || '-',
                caissier: v.nom_caissier || v.caissier_name || '-', 
                client: v.nom_client_snap || v.nom_client || 'CLIENT AU COMPTANT',
                statut_lot: v.statut_vente,
                _dicUnites: {} // Dictionnaire de regroupement interne temporaire
            };
        }

        // --- EXCLUSION DES LIGNES COMPTABLES INACTIVES ---
        const estActif = v.type_ligne !== 'ANNULEE' && v.type_ligne !== 'RETOUR' && v.is_active !== 0;
        
        if (estActif) {
            const sign = v.type_ligne === 'RETOUR' ? -1 : 1;
            
            // 🚀 RECTIFICATION LOGISTIQUE : Extraction et conversion inverse à la volée
            const qteBrutePieces = Number(v.qte_vendue !== undefined ? v.qte_vendue : 0);
            const coeffLogistique = Number(v.unit_coefficient || v.coefficient || 1);
            
            // On divise par le coefficient pour réobtenir l'unité de gros
            const qteSaisieOrigine = coeffLogistique > 1 ? (qteBrutePieces / coeffLogistique) : qteBrutePieces;
            
            groups[lotKey].qte_totale += qteSaisieOrigine * sign;
            groups[lotKey].total_ttc += Number(v.prix_total_ligne || 0) * sign;

            // 🎯 REGROUPEMENT COMPTABLE COMPACT PAR COUPLE D'UNITÉS POUR LE LIBELLÉ DU LOT
            const labelGros = String(v.unite_gros || 'CS').toUpperCase().trim();
            const labelDetail = String(v.unite_detail || v.unite || 'BTS').toUpperCase().trim();
            const cleCouple = `${labelGros}-${labelDetail}`;

            if (!groups[lotKey]._dicUnites[cleCouple]) {
                groups[lotKey]._dicUnites[cleCouple] = { pieces: 0, ratio: coeffLogistique, gros: labelGros, detail: labelDetail };
            }
            groups[lotKey]._dicUnites[cleCouple].pieces += qteBrutePieces * sign;
        }
    });

    // Étape finale : Conversion des dictionnaires internes en chaînes de caractères lisibles
    Object.values(groups).forEach(g => {
        const chainesBadges = [];
        Object.values(g._dicUnites).forEach(u => {
            if (u.pieces === 0) return;
            const cartons = Math.floor(Math.abs(u.pieces) / u.ratio) * (u.pieces < 0 ? -1 : 1);
            const bouteilles = Math.round(Math.abs(u.pieces) % u.ratio) * (u.pieces < 0 ? -1 : 1);

            if (cartons !== 0 && bouteilles !== 0) {
                chainesBadges.push(`${cartons} ${u.gros} + ${bouteilles} ${u.detail}`);
            } else if (cartons !== 0) {
                chainesBadges.push(`${cartons} ${u.gros}`);
            } else if (bouteilles !== 0) {
                chainesBadges.push(`${bouteilles} ${u.detail}`);
            }
        });
        g.qte_totale_textuelle = chainesBadges.join(' | ') || "0 U";
        delete g._dicUnites; // Purge de sécurité de la variable de travail
    });

    return Object.values(groups);
}, [ventesFiltréesParDate]);


const filterByLot = (lotId) => {
    setShowFullHistory(true);
    setSelectedLotId(lotId); 
    setColFilters({ ...initialFilters, lot_id: lotId === "SANS-LOT" ? "" : lotId });
};
// --- COMPOSANT ONGLETS ---
const TabButton = ({ id, label, icon: Icon }) => (
    <button 
        type="button"
        onClick={() => setActiveTab(id)}
        style={{
            ...tabStyle,
            ...(activeTab === id ? activeTabStyle : {}),
            color: activeTab === id ? '#3b82f6' : '#64748b'
        }}
    >
        <Icon size={16} />
        {label}
    </button>
);
const getRowStyle = (v) => {
    // 1. Gestion des ANNULATIONS (Ligne barrée et rouge)
    const isAnnulee = v.statut_vente === 'ANNULEE' || v.type_ligne === 'ANNULEE' || v.is_active === 0;
    
    if (isAnnulee) {
        return { 
            backgroundColor: '#fff1f2', 
            color: '#e11d48', 
            textDecoration: 'line-through', 
            opacity: 0.8,
            fontStyle: 'italic'
        };
    }
    
    // 2. Gestion des RETOURS (Ligne orange/jaune)
    if (v.statut_vente === 'RETOUR' || v.type_ligne === 'RETOUR') {
        return { 
            backgroundColor: '#fffbeb', 
            color: '#d97706',
            fontWeight: '500' 
        };
    }

    return {}; // Style normal
};
return (
    <div style={layoutStyle}>
        <Sidebar />
        <main style={mainStyle}>
            <header style={headerBarStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <div style={iconBox}><ShoppingBag size={24} color="#fff" /></div>
                    <div>
                        <h1 style={titleStyle}>HISTORIQUE DES VENTES</h1>
                        {isInventoryActive && (
                            <div style={{color: '#f87171', fontSize: '11px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px', marginTop: '4px'}}>
                                <Lock size={12} /> SYSTÈME GELÉ (INVENTAIRE EN COURS)
                            </div>
                        )}
                    </div>
                </div>


              <div style={{display: 'flex', gap: '15px', alignItems: 'center'}}>
                    <div style={dateBox}>
                        <Calendar size={14} color="#1e293b" />
                        <input type="date" style={dateInput} value={dateRange.start} onChange={(e) => setDateRange({...dateRange, start: e.target.value})} />
                        <span style={{fontWeight: 'bold', color: '#1e293b'}}>au</span>
                        <input type="date" style={dateInput} value={dateRange.end} onChange={(e) => setDateRange({...dateRange, end: e.target.value})} />
                    </div>
                    <button type="button" onClick={handleFullRefresh} style={btnRefresh}>
                        <RefreshCcw size={18} color="#fff" style={{ transform: loading ? 'rotate(360deg)' : 'none', transition: loading ? 'transform 1s linear infinite' : 'none' }} className={loading ? "spinning-icon" : ""} />
                    </button>
                </div>
            </header>

            <div style={contentArea}>
                {/* --- BARRE D'ONGLETS --- */}
                <div style={tabContainerStyle}>
                    <TabButton id="active" label="Ventes Actives" icon={CheckCircle} />
                    <TabButton id="deleted" label="Factures Supprimées" icon={Trash2} />
                    <TabButton id="archived" label="Factures Archivées" icon={Archive} />
                </div>

               <h3 style={sectionTitle}>RÉSUMÉ DES SENTES PAR LOT</h3>
                <div style={{...cardStyle, maxHeight: '250px', overflowY: 'auto', marginBottom: '20px'}}>
                    <table style={mainTable}>
                        {/* 🎯 CORRECTIF CHIRURGICAL : Plus aucun espace blanc fantôme dans la structure du tr de l'en-tête */}
                        <thead style={stickyHeader}><tr><th style={thStyleWhite}>LOT ID</th><th style={thCenterWhite}>QTE TOTAL</th><th style={thCenterWhite}>MONTANT TOTAL</th><th style={thStyleWhite}>CLIENT</th><th style={thStyleWhite}>ÉMIS PAR</th><th style={thStyleWhite}>SERVICE</th><th style={thStyleWhite}>ENCAISSEMENT</th><th style={thStyleWhite}>DATE & HEURE</th><th style={thCenterWhite}>ACTIONS</th></tr></thead>
                        <tbody>
                            {groupedByLot.map((lot) => {
                                const { isLocked, reason } = checkIsLocked(lot.date_vente);
                                const isSelected = selectedLotId === lot.lot_id;
                                const isCancelled = lot.statut_lot?.toUpperCase() === 'ANNULEE' || lot.statut_lot?.toUpperCase() === 'ANNULE';
                                const isCancellingThisLot = activeActionRow?.id === lot.lot_id && activeActionRow?.type === 'ANNULATION_LOT';

                                // Style dynamique de la ligne de lot
                                const rowLotStyle = {
                                    opacity: isCancelled ? 0.5 : 1,
                                    textDecoration: isCancelled ? 'line-through' : 'none',
                                    backgroundColor: isCancelled ? '#f8d7da' : isSelected ? '#f1f5f9' : 'transparent',
                                    cursor: isCancelled ? 'not-allowed' : 'pointer'
                                };

                                // 🚀 RECLASSEMENT DE VOS CLÉS DE BASE SÉCURISÉES SANS CRASH UNITAIRE
                                // On utilise .toFixed(2) pour forcer le même alignement décimal rigide et professionnel des colonnes
                                const volumeTotalLot = Number(lot.qte_totale || 0).toFixed(2);
                                const argentTotalLot = Number(lot.total_ttc || 0).toFixed(2);

                             return (
                                    <React.Fragment key={lot.lot_id}>
                                        <tr 
                                            style={{...trStyle, ...rowLotStyle}}
                                            onClick={() => !isCancelled && setSelectedLotId(lot.lot_id)}
                                        >
                                            <td style={tdStyle}>
                                                <div style={{display: 'flex', flexDirection: 'column', gap: '4px'}}>
                                                    <span style={{...lotBadge, cursor: 'pointer'}} onClick={(e) => { e.stopPropagation(); filterByLot(lot.lot_id); }}>
                                                        {lot.lot_id}
                                                    </span>
                                                    {isCancelled && <span style={{fontSize: '9px', color: '#ef4444', fontWeight: 'bold'}}>● ANNULÉ</span>}
                                                </div>
                                            </td>
                                            
                                            {/* 🚀 QUANTITÉ DU LOT ALIGNÉE AVEC EXACTITUDE GÉOMÉTRIQUE */}
                                            <td style={{...tdCenter, fontWeight: 'bold', color: isCancelled ? '#94a3b8' : '#3b82f6', fontFamily: 'monospace'}}>
                                                {parseFloat(volumeTotalLot).toLocaleString('fr-FR')}
                                            </td>

                                            {/* 🚀 MONTANT TOTAL ALIGNÉ EN RANG POUR ENRAYER LE FORMAT PARASITE */}
                                            <td style={{...tdCenter, fontWeight: '800', textDecoration: isCancelled ? 'line-through' : 'none', fontFamily: 'monospace'}}>
                                                {parseFloat(argentTotalLot).toLocaleString('fr-FR')} F
                                            </td>
                                            
                                            <td style={{...tdStyle, fontWeight: '700'}}>{lot.client}</td>
                                            <td style={tdStyle}><span style={{fontSize: '11px'}}>📝 {lot.utilisateur}</span></td>
                                            <td style={tdStyle}><span style={{color: isCancelled ? '#94a3b8' : '#1e40af', fontWeight: 'bold', fontSize: '11px'}}>🏃 {lot.staff}</span></td>
                                            <td style={tdStyle}><span style={{color: isCancelled ? '#94a3b8' : '#047857', fontWeight: 'bold', fontSize: '11px'}}>💰 {lot.caissier}</span></td>
                                            <td style={{...tdStyle, fontSize: '11px', fontWeight: '700'}}>{formatDateSafe(lot.date_vente)} {formatTimeSafe(lot.date_vente)}</td>
                                            <td style={tdCenter}>
                                                <div style={{display: 'flex', gap: '8px', justifyContent: 'center'}}>
                                                    {activeTab === 'active' && !isCancelled ? (
                                                        <>
                                                            {/* 🖨️ UTRE D'IMPRESSION COMPACTE DIRECTE : FORMAT A5 */}
                                                            <button
                                                                type="button"
                                                                title="Imprimer au format A5"
                                                                onClick={(e) => { e.stopPropagation(); preparePrint(lot.lot_id, 'A5'); }}
                                                                style={{
                                                                    backgroundColor: '#10b981',
                                                                    color: '#fff',
                                                                    border: 'none',
                                                                    borderRadius: '4px',
                                                                    padding: '4px 8px',
                                                                    fontSize: '11px',
                                                                    fontWeight: 'bold',
                                                                    cursor: 'pointer',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '4px'
                                                                }}
                                                            >
                                                                <Printer size={12} /> A5
                                                            </button>

                                                            {/* 🖨️ UTRE D'IMPRESSION COMPACTE DIRECTE : FORMAT A6 */}
                                                            <button
                                                                type="button"
                                                                title="Imprimer au format A6"
                                                                onClick={(e) => { e.stopPropagation(); preparePrint(lot.lot_id, 'A6'); }}
                                                                style={{
                                                                    backgroundColor: '#8b5cf6',
                                                                    color: '#fff',
                                                                    border: 'none',
                                                                    borderRadius: '4px',
                                                                    padding: '4px 8px',
                                                                    fontSize: '11px',
                                                                    fontWeight: 'bold',
                                                                    cursor: 'pointer',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '4px'
                                                                }}
                                                            >
                                                                <Printer size={12} /> A6
                                                            </button>

                                                            {/* 🔑 MAPPAGE DYNAMIQUE : Le bouton s'affiche si la permission d'annulation est active pour ce rôle */}
                                                            {canCancelSale && (
                                                                <button 
                                                                    title="Annuler tout le lot" 
                                                                    onClick={(e) => { 
                                                                        e.stopPropagation(); 
                                                                        if(isLocked) {
                                                                            const msgLock = reason === 'INVENTAIRE_EN_COURS' ? "Un inventaire est en cours." : "Exercice clôturé.";
                                                                            return showNotification(`Action Bloquée : ${msgLock}`, 'error');
                                                                        }
                                                                        setActiveActionRow({ id: lot.lot_id, type: 'ANNULATION_LOT' });
                                                                        setActionMotif('');
                                                                    }}
                                                                    style={isLocked ? btnActionDisabled : btnActionBlack}
                                                                >
                                                                    <XCircle size={14}/>
                                                                </button>
                                                            )}


                                                                                                                      {/* 🔑 MAPPAGE DYNAMIQUE : Le bouton s'affiche si la permission d'archivage/historique est active */}
                                                            {canArchiveSale && (
                                                                <button title="Archiver" onClick={(e) => { e.stopPropagation(); handleActionClick(() => handleArchive(lot.lot_id), lot.lot_id, lot.date_vente); }} style={isLocked ? btnActionDisabled : btnActionRed}>
                                                                    <Archive size={14}/>
                                                                </button>
                                                            )}

                                                            {/* Message informatif si l'utilisateur n'a aucun de ces droits */}
                                                            {!canCancelSale && !canArchiveSale && (
                                                                <span style={{fontSize: '11px', color: '#64748b', fontStyle: 'italic', fontWeight: '500'}}>Lecture seule</span>
                                                            )}
                                                        </>
                                                    ) : isCancelled ? (
                                                        <span style={{fontSize: '10px', color: '#94a3b8', fontStyle: 'italic'}}>Annulé</span>
                                                    ) : null}
                                                </div>
                                                   </td>
                                        </tr>

                                     {/* FORMULAIRE D'ANNULATION DU LOT */}
                                        {isCancellingThisLot && (
                                            <tr style={{ background: '#fff1f2' }}>
                                                <td colSpan="9" style={{ padding: '15px', borderBottom: '2px solid #e11d48' }}>
                                                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                                        <input 
                                                            autoFocus
                                                            placeholder="Motif obligatoire pour annuler tout le lot..."
                                                            value={actionMotif}
                                                            onChange={(e) => setActionMotif(e.target.value)}
                                                            style={{ flex: 1, padding: '10px', borderRadius: '4px', border: '2px solid #fda4af' }}
                                                        />
                                                        <button onClick={() => setActiveActionRow(null)} style={{ padding: '8px 15px', background: '#94a3b8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Fermer</button>
                                                        <button 
                                                            onClick={() => submitLotCancellation(lot.lot_id)} 
                                                            style={{ padding: '8px 15px', background: '#e11d48', color: 'white', fontWeight: 'bold', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                                        >
                                                            Confirmer l'annulation
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>


                              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px'}}>
                    <h3 style={sectionTitle}>DÉTAIL DES ARTICLES VENDUS</h3>
                    <div style={{display: 'flex', gap: '10px'}}>
                        <button type="button" onClick={handleExport} style={btnExport}><FileDown size={14} /> EXPORTER EXCEL</button>
                        <button type="button" onClick={resetHistory} style={btnShowAll}>AFFICHER TOUT L'HISTORIQUE</button>
                    </div>
                </div>

                <div style={{...cardStyle, maxHeight: '400px', overflowY: 'auto'}}>
                    <table style={mainTable}>
                        <thead style={stickyHeader}>
                            <tr style={{background: '#f8fafc'}}>
                                <th style={thStyleBlue}>ID</th>
                                <th style={thStyleBlue}>ARTICLE</th>
                                <th style={thCenterBlue}>QTE</th>
                                <th style={thCenterBlue}>P.U</th>
                                <th style={thCenterBlue}>M. HT</th>
                                <th style={thCenterBlue}>REMISE</th>
                                <th style={thCenterBlue}>TAXE</th>
                                <th style={thCenterBlue}>TOTAL TTC</th>
                                <th style={thStyleBlue}>DATE & HEURE</th>
                                <th style={thCenterBlue}>ACTIONS</th>
                            </tr>
                        </thead>
                        <tbody>
                            {!showFullHistory && !selectedLotId ? (
                                <tr>
                                    <td colSpan="10" style={{textAlign: 'center', padding: '40px', color: '#64748b', fontStyle: 'italic', fontSize: '13px'}}>
                                        Sélectionnez un lot ci-dessus ou cliquez sur "Afficher tout"...
                                    </td>
                                </tr>
                            ) : (
                                filteredVentesDetail.map((v, i) => {
                                    const { isLocked, reason } = checkIsLocked(v.date_vente);
                                    const isSelected = selectedDetailId === v.id;
                                    const isEditing = activeActionRow?.id === v.id;
                                    
                                    // 1. Alignement strict sur la propriété 'statut_lot' générée par votre hook corrigé
                                    const parentLot = groupedByLot.find(l => l.lot_id === v.lot_id);
                                    const isParentCancelled = parentLot?.statut_lot?.toUpperCase() === 'ANNULEE' || parentLot?.statut_lot?.toUpperCase() === 'ANNULE';

                                    // 2. Une ligne est "marquée" si elle est annulée individuellement OU si son lot parent est annulé
                                    const itemCancelled = 
                                        v.is_active === 0 ||
                                        v.type_ligne === 'ANNULEE' ||
                                        v.statut_vente === 'ANNULEE' ||
                                        isParentCancelled;

                                    const itemRetour = 
                                        v.type_ligne === 'RETOUR' ||
                                        v.statut_vente === 'RETOUR';

                                    let itemRowStyle = {
                                        transition: 'all 0.3s ease',
                                        backgroundColor: isSelected ? '#f1f5f9' : 'transparent',
                                        color: 'inherit',
                                        cursor: itemCancelled ? 'not-allowed' : 'pointer'
                                    };

                                    if (itemRetour) {
                                        itemRowStyle = { 
                                            ...itemRowStyle,
                                            backgroundColor: '#fffbeb', 
                                            borderLeft: '4px solid #f59e0b',
                                            color: '#92400e'
                                        };
                                    } else if (itemCancelled) {
                                        itemRowStyle = { 
                                            ...itemRowStyle,
                                            backgroundColor: '#f3f4f6', 
                                            color: '#9ca3af',
                                            textDecoration: 'line-through'
                                        };
                                    }

                                                                      // ==============================================================================
                                    // 🎯 RESPECT DE LA BASE DE DONNÉES : LECTURE DIRECTE DES COLONNES SQLITE
                                    // ==============================================================================
                                    // On extrait textuellement la chaîne exacte enregistrée par le panier (ex: "1 BTS")
                                    const chaineQuantiteAffichee = v.qte_vendue_formatee || v.expression_logistique || `${v.quantite || 0} U`;

                                    // Lecture brute et directe des valeurs monétaires réelles stockées en base
                                    const prixUnitaireBrut = Number(v.prix_unitaire_snap || v.prix_vente_unitaire || v.prix_unitaire || 0);
                                    const montantHTBrut = Number(v.montant_ht_ligne || v.montant_ht || 0);
                                    const remiseBrute = Number(v.remise_ligne || v.remise_montant || 0);
                                    const taxeBrute = Number(v.taxe_ligne || v.taxe_montant || 0);
                                    const totalTTCBrut = Number(v.prix_total_ligne || v.montant_ttc_ligne || 0);



    // -----------------------

                                  return (
    <React.Fragment key={v.id || i}>
        <tr 
            style={itemRowStyle}
            onClick={() => !itemCancelled && setSelectedDetailId(v.id)}
        >
            <td style={tdStyle}>
                {v.id_vente}
                {itemRetour && <div style={{color: '#d97706', fontSize: '9px', fontWeight: '900'}}>RETOUR</div>}
            </td>
  
            <td style={{...tdStyle, fontWeight: '800'}}>
                {v.nom_article_snap || v.nom_article}

                {/* Si c'est annulé ET que ce n'est pas un retour */}
                {itemCancelled && !itemRetour && (
                    <div style={{ color: '#dc2626', fontSize: '10px', fontWeight: 'bold' }}>
                        ANNULÉ
                    </div>
                )}

                {/* Si c'est un retour */}
                {itemRetour && (
                    <div style={{ color: '#d97706', fontSize: '10px', fontWeight: 'bold' }}>
                        RETOUR
                    </div>
                )}
            </td>

            {/* 🚀 CELLULE DE QUANTITÉ LOGISTIQUE DIRECTE DE LA BASE (SANS CALCUL ET SANS BRUIT) */}
            <td style={{ ...tdCenter, minWidth: '130px' }}>
                <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    gap: '4px' 
                }}>
                    <span style={{ 
                        fontWeight: '800', 
                        fontSize: '13px',
                        color: itemCancelled ? '#9ca3af' : '#2563eb',
                        background: itemCancelled ? '#e5e7eb' : '#eff6ff',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        boxShadow: itemCancelled ? 'none' : '0 1px 2px rgba(37, 99, 235, 0.05)'
                    }}>
                        {chaineQuantiteAffichee}
                    </span>
                </div>
            </td>

            {/* 📊 AJOUT DU SÉPARATEUR DE MILLIERS (Format de type : 1 250.00 F) */}
            <td style={{ ...tdCenter, textAlign: 'right', fontFamily: 'monospace', paddingRight: '12px' }}>
                {new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(prixUnitaireBrut)} F
            </td>
            <td style={{ ...tdCenter, textAlign: 'right', fontFamily: 'monospace', paddingRight: '12px' }}>
                {new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(montantHTBrut)} F
            </td>
            <td style={{ ...tdCenter, color: '#dc2626', fontWeight: 'bold', textAlign: 'right', fontFamily: 'monospace', paddingRight: '12px' }}>
                {remiseBrute > 0 ? `-${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(remiseBrute)}` : '0.00'} F
            </td>
            <td style={{ ...tdCenter, textAlign: 'right', fontFamily: 'monospace', paddingRight: '12px' }}>
                {new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(taxeBrute)} F
            </td>
            <td style={{ ...tdCenter, fontWeight: '900', color: itemCancelled ? '#94a3b8' : '#047857', textAlign: 'right', fontFamily: 'monospace', paddingRight: '12px' }}>
                {new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(totalTTCBrut)} F
            </td>
            
            <td style={{...tdStyle, fontSize: '11px', fontWeight: '700'}}>{formatDateSafe(v.date_vente)} {formatTimeSafe(v.date_vente)}</td>
            <td style={tdCenter}>
               <div style={{display: 'flex', gap: '5px', justifyContent: 'center'}}>
{activeTab === 'active' && !itemCancelled && !itemRetour && (
    <>
        {/* 🔑 MAPPAGE DYNAMIQUE : Affichage conditionnel selon la sous-permission d'annulation */}
        {canCancelSale ? (
            <button 
                type="button"
                title="Annuler uniquement cet article"
                onClick={(e) => { 
                    e.stopPropagation(); 
                    if(isLocked) {
                        const msg = reason === 'INVENTAIRE_EN_COURS' ? "Un inventaire est en cours." : "Exercice clôturé.";
                        return showNotification(`Action Bloquée : ${msg}`, 'error');
                    }
                    setActiveActionRow({ id: v.id, type: 'ANNULATION', item: v });
                    setActionMotif('');
                }}
                style={isLocked ? btnActionDisabled : btnActionBlack}
            >
                <XCircle size={12}/>
            </button>
        ) : null}

        {/* 🔑 MAPPAGE DYNAMIQUE : Affichage conditionnel selon la sous-permission de retour */}
        {canReturnItem ? (
            <button 
                type="button"
                title="Effectuer un retour sur cet article"
                onClick={(e) => { 
                    e.stopPropagation(); 
                    if(isLocked) {
                        const msg = reason === 'INVENTAIRE_EN_COURS' ? "Un inventaire est en cours." : "Exercice clôturé.";
                        return showNotification(`Action Bloquée : ${msg}`, 'error');
                    }
                    setActiveActionRow({ id: v.id, type: 'RETOUR', item: v });
                    setActionMotif('');
                }}
                style={isLocked ? btnActionDisabled : {...btnActionBlack, backgroundColor: '#d97706', borderColor: '#b45309'}}
            >
                <Repeat size={12}/>
            </button>
        ) : null}

        {!canCancelSale && !canReturnItem && (
            <span style={{fontSize: '11px', color: '#64748b', fontStyle: 'italic'}}>Aucune action</span>
        )}
    </>
)}
{itemCancelled && <span style={{fontSize: '10px', color: '#94a3b8', fontStyle: 'italic'}}>Désactivé</span>}
</div>
            </td>
        </tr>
 




                                           {/* FORMULAIRE INLINE ARTICLES */}
                                            {isEditing && (
                                                <tr style={{ background: '#fffbeb' }}>
                                                    <td colSpan="10" style={{ padding: '15px', borderBottom: '2px solid #f59e0b' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                                            <div style={{ flex: 1 }}>
                                                                <label style={{ display: 'block', fontSize: '10px', fontWeight: '900', color: '#92400e', marginBottom: '4px', textTransform: 'uppercase' }}>
                                                                    Justification pour : {activeActionRow.type} ({v.nom_article_snap || v.nom_article})
                                                                </label>
                                                                <input 
                                                                    autoFocus
                                                                    type="text"
                                                                    placeholder="Motif requis (min. 3 caractères)..."
                                                                    value={actionMotif}
                                                                    onChange={(e) => setActionMotif(e.target.value)}
                                                                    style={{ width: '100%', padding: '10px', border: '2px solid #fcd34d', borderRadius: '6px' }}
                                                                />
                                                            </div>
                                                            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                                                                <button type="button" onClick={(e) => { e.stopPropagation(); setActiveActionRow(null); }} style={btnCancelMini}>Fermer</button>
                                                                <button 
                                                                    type="button"
                                                                    onClick={(e) => { e.stopPropagation(); handleSubmitAction(v); }} 
                                                                    style={{ ...btnConfirmMini, background: activeActionRow.type === 'RETOUR' ? '#d97706' : '#0f172a' }}
                                                                >
                                                                    Confirmer {activeActionRow.type === 'RETOUR' ? 'le Retour' : "l'Annulation"}
                                                                </button>
                                                            </div>
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


            {/* SYSTÈME TOAST */}
            {toast.show && (
                <div style={{
                    position: 'fixed', bottom: '20px', right: '20px', padding: '12px 25px',
                    backgroundColor: toast.type === 'success' ? '#059669' : '#dc2626',
                    color: 'white', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    zIndex: 9999, display: 'flex', alignItems: 'center', gap: '10px',
                    animation: 'slideIn 0.3s ease-out'
                }}>
                    {toast.type === 'success' ? <CheckCircle size={18}/> : <AlertCircle size={18}/>}
                    <span style={{fontWeight: '500', fontSize: '14px'}}>{toast.message}</span>
                </div>
            )}

           {/* 🔒 CONTAINER INVISIBLE RACCORDÉ POUR L'IMPRESSION VIA CONTROLLER */}
<div style={{ display: 'none' }}>
    {printData && (
        <InvoicePrintt 
            ref={printRef} 
            panier={printData.panier} 
            venteInfo={printData.venteInfo} 
            format={printFormat} 
           company={printData.company}
        />
    )}
</div>

        </main>
    </div>
);
};



// --- STYLES (Inchangés) ---
const layoutStyle = { display: 'flex', height: '100vh', background: '#0f172a' };
const mainStyle = { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f8fafc' };
const headerBarStyle = { background: '#1e293b', padding: '16px 24px', borderBottom: '4px solid #3b82f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
const iconBox = { background: '#3b82f6', padding: '8px', borderRadius: '8px' };
const titleStyle = { margin: 0, fontSize: '18px', fontWeight: '900', color: '#fff' };
const dateBox = { display: 'flex', alignItems: 'center', gap: '10px', background: '#fff', padding: '6px 12px', borderRadius: '8px', border: '2px solid #3b82f6' };
const dateInput = { border: 'none', background: 'transparent', fontSize: '13px', outline: 'none', fontWeight: '800', color: '#1e293b' };
const contentArea = { padding: '20px', overflowY: 'auto' };
const sectionTitle = { fontSize: '12px', fontWeight: '900', color: '#1e293b', textTransform: 'uppercase', marginBottom: '8px', borderLeft: '4px solid #3b82f6', paddingLeft: '8px' };
const cardStyle = { background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' };
const mainTable = { width: '100%', borderCollapse: 'collapse', minWidth: '600px' };
const stickyHeader = { position: 'sticky', top: 0, zIndex: 10 };
const thStyleWhite = { padding: '12px 10px', background: '#0f172a', color: '#fff', fontSize: '11px', fontWeight: '900', textAlign: 'left' };
const thCenterWhite = { ...thStyleWhite, textAlign: 'center' };
const thStyleBlue = { padding: '12px 10px', background: '#f1f5f9', color: '#1e293b', fontSize: '11px', fontWeight: '900', textAlign: 'left', borderBottom: '2px solid #3b82f6' };
const thCenterBlue = { ...thStyleBlue, textAlign: 'center' };
const tdStyle = { padding: '10px 10px', fontSize: '12px', color: '#1e293b', whiteSpace: 'nowrap' };
const tdCenter = { ...tdStyle, textAlign: 'center' };
const trStyle = { borderBottom: '1px solid #e2e8f0', cursor: 'pointer' }; 
const trSelectedStyle = { background: '#dbeafe' }; 
const lotBadge = { background: '#eff6ff', color: '#1e40af', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '900', border: '1.5px solid #3b82f6' };
const btnActionBlue = { background: '#3b82f6', color: '#fff', border: 'none', padding: '6px', borderRadius: '4px', cursor: 'pointer' };
const btnActionBlack = { background: '#1e293b', color: '#fff', border: 'none', padding: '6px', borderRadius: '4px', cursor: 'pointer' };
const btnActionRed = { background: '#dc2626', color: '#fff', border: 'none', padding: '6px', borderRadius: '4px', cursor: 'pointer' };
const btnActionDisabled = { ...btnActionBlack, background: '#cbd5e1', cursor: 'not-allowed', opacity: 0.6 };
const btnShowAll = { background: '#1e293b', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: '900' };
const btnExport = { background: '#16a34a', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '5px' };
const btnRefresh = { background: '#3b82f6', border: 'none', padding: '10px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' };

// --- STYLES ONGLETS ---
const tabContainerStyle = { display: 'flex', gap: '5px', marginBottom: '15px' };
const tabStyle = { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px 8px 0 0', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', transition: 'all 0.2s' };
const activeTabStyle = { background: '#eff6ff', border: '1px solid #3b82f6', borderBottom: '2px solid #3b82f6' };

// --- STYLES MODAL ---
const modalOverlay = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 };
const modalContent = { background: '#fff', borderRadius: '10px', width: '90%', maxWidth: '700px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' };
const modalHeader = { padding: '15px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' };
const modalFooter = { padding: '15px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '10px' };
const btnCancel = { padding: '8px 16px', borderRadius: '6px', border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' };
const btnConfirm = { padding: '8px 16px', borderRadius: '6px', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' };
const btnCancelMini = {
    padding: '8px 15px',
    background: '#e2e8f0',
    color: '#475569',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: 'bold',
    transition: 'all 0.2s'
};

const btnConfirmMini = {
    padding: '8px 15px',
    background: '#0f172a',
    color: '#ffffff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: 'bold',
    transition: 'all 0.2s'
};
export default HistoriqueVentes;