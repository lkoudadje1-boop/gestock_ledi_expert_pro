const approService = require('../services/approvisionnement.service');
// ✅ Import du nouveau service spécialisé
const annulRetourService = require('../services/annulationretourApprov.service'); 
const configComptaService = require('../services/ConfigEcrituresAuto.service');
const conversestock = require('../services/conversestock'); // 🚀 IMPORTATION DU MODULE LOGISTIQUE CENTRALISÉ

/**
 * Contrôleur pour enregistrer un approvisionnement (Achat fournisseur)
 * Gère les types : COMPTANT, ACOMPTE, CREDIT
 */
const saveApprovisionnement = async (req, res) => {
    try {
        // ✅ 1. Récupération du contexte utilisateur
        const companyId = req.user?.company_id || req.user?.companyId;
        const userId = req.user?.userId || req.user?.id;
        
        if (!companyId) {
            return res.status(401).json({ error: "Session invalide ou expirée." });
        }

        // On extrait les données du corps de la requête avec repli sécurisé pour header
        const { items, header = {}, typeAchat: typeAchatBrut } = req.body;
        const typeAchat = typeAchatBrut ? String(typeAchatBrut).toUpperCase().trim() : '';

        // --- VALIDATIONS DE SÉCURITÉ ---
        if (!items || items.length === 0) {
            return res.status(400).json({ error: "Le panier est vide." });
        }
        if (!header.fournisseurId || !header.numFacture) {
            return res.status(400).json({ error: "Données fournisseur ou N° Facture manquants." });
        }

        // 🛡️ Validation du moyen de règlement (Obligatoire sauf pour CREDIT)
        if (typeAchat !== 'CREDIT') {
            if (!header.modeReglement || header.modeReglement.trim() === "") {
                return res.status(400).json({ 
                    error: "Veuillez sélectionner un moyen de règlement (Caisse, Banque, etc.)." 
                });
            }
        }

        // --- 🧮 PRÉPARATION DES MONTANTS (LOGIQUE MÉTIER) ---
        let montantFinal = 0;
        const totalFactureTTC = parseFloat(header.totalFacture || header.mtFac) || 0;
        
        switch (typeAchat) {
            case 'ACOMPTE':
                // On prend la valeur saisie comme avance
                montantFinal = parseFloat(header.montantAvance || header.montantPaye) || 0;
                if (montantFinal <= 0 || montantFinal >= totalFactureTTC) {
                    return res.status(400).json({ error: "Le montant de l'acompte est invalide." });
                }
                break;

            case 'COMPTANT':
                // Le montant payé est égal au total de la facture
                montantFinal = totalFactureTTC;
                break;

            case 'CREDIT':
                // Aucun paiement immédiat
                montantFinal = 0;
                header.modeReglement = 'CREDIT'; 
                break;

            default:
                return res.status(400).json({ error: "Type d'achat non reconnu." });
        }

        // 🚀 CONSTRUCTION DU PAYLOAD FINAL POUR LE SERVICE
        // On laisse les items intacts (les quantités brutes "1,5" ou 10 seront converties dans le service)
        const payloadFinal = {
            header: {
                ...header,
                typeAchat: typeAchat,
                montantAvance: montantFinal, // Utilisé par le service pour l'acompte
                montantPaye: montantFinal,   // Utilisé pour l'insertion SQL
                totalFacture: totalFactureTTC
            },
            items: items
        };

        // ✅ 2. APPEL AU SERVICE MÉTIER (Gestion Transactionnelle)
        const idAchat = await approService.saveApprovisionnement(payloadFinal, req.user);

        // 🔥 3. COMPTABILITÉ AUTOMATIQUE (Postage des écritures)
        try {
            if (configComptaService && typeof configComptaService.genererEcritureExplicite === 'function') {
                await configComptaService.genererEcritureExplicite('purchases', idAchat, companyId);
            }
        } catch (comptaError) {
            console.error("⚠️ [COMPTA AUTO] Erreur de postage :", comptaError.message);
        }

        // 🔥 4. NOTIFICATIONS TEMPS RÉEL (Socket.io)
        if (req.io) {
            const room = companyId.toString();
            req.io.to(room).emit('DATA_EVENT', { table: 'purchases', action: 'INSERT' });
            req.io.to(room).emit('DATA_EVENT', { table: 'products', action: 'UPDATE' });
            req.io.to(room).emit('DATA_EVENT', { table: 'suppliers', action: 'UPDATE' });
            req.io.to(room).emit('STOCK_UPDATED');
            
            req.io.to(userId.toString()).emit('PURCHASE_SUCCESS_SYNC', { idAchat });
        }

        // 🏁 RÉPONSE FINALE
        return res.status(201).json({ 
            success: true, 
            id_achat: idAchat, 
            message: "Approvisionnement enregistré avec succès." 
        });

    } catch (error) {
        console.error("❌ Erreur saveApprovisionnement:", error.message);
        return res.status(500).json({ error: error.message });
    }
};

const getAllPurchases = async (req, res) => {
    try {
        // ✅ Récupération sécurisée du contexte entreprise
        const companyId = req.user?.company_id || req.user?.companyId;
        
        if (!companyId) {
            return res.status(400).json({ error: "ID Entreprise manquant dans la session." });
        }

        const rows = await approService.getAllPurchases(companyId);

        // 🚀 HYDRATATION LOGISTIQUE INVERSE CENTRALISÉE DES ACHATS :
        // Si le service ramène l'historique brut des achats avec les jointures d'unités,
        // on génère instantanément la version textuelle pour le tableau d'historique du Frontend
        const formattedRows = rows.map(row => {
            if (row.qte_achetee !== undefined) {
                return {
                    ...row,
                    qte_achetee_formatee: conversestock.formaterStockPourAffichage(
                        row.qte_achetee,
                        row.unite_coefficient || row.coefficient || 1,
                        row.unite_code || row.unit_code_gros || 'CS',
                        row.unite_reference || row.unit_ref_detail || 'BTL'
                    )
                };
            }
            return row;
        });

        return res.json(formattedRows);
    } catch (error) {
        console.error("Erreur getAllPurchases:", error);
        return res.status(500).json({ error: error.message });
    }
};

const getTemporaryPurchase = async (req, res) => {
    try {
        const userId = req.user?.userId || req.user?.id;
        const companyId = req.user?.companyId || req.user?.company_id;
        const items = await approService.getTemporaryCart(userId, companyId);
        return res.json({ items });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

const syncTemporaryPurchase = async (req, res) => {
    try {
        const userId = req.user?.userId || req.user?.id;
        const companyId = req.user?.companyId || req.user?.company_id;
        await approService.syncTemporaryCart(req.body.items, userId, companyId);
        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

const deleteTemporaryPurchase = async (req, res) => {
    try {
        const userId = req.user?.userId || req.user?.id;
        const companyId = req.user?.companyId || req.user?.company_id;
        await approService.clearTemporaryCart(userId, companyId);
        return res.json({ success: true, message: "Panier temporaire vidé." });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};
const traiterActionLigne = async (req, res) => {
    try {
        const companyId = req.user?.companyId || req.user?.company_id;
        const { itemId } = req.params;
        const { action: actionBrute, qte, observation } = req.body; 

        if (!itemId) return res.status(400).json({ error: "ID de ligne manquant." });

        const action = actionBrute ? String(actionBrute).toUpperCase().trim() : '';
        let result;

        if (action === 'ANNULER') {
            result = await annulRetourService.annulerLigneAchat(
                itemId, 
                req.user, 
                observation || "Annulation erreur de saisie"
            );
        } 
        else if (action === 'RETOUR') {
            // 🛡️ SÉCURITÉ ANTI-LITIGE : Validation rigoureuse de la chaîne de saisie
            if (qte === undefined || qte === null || String(qte).trim() === "") {
                return res.status(400).json({ error: "Quantité de retour obligatoire." });
            }
            // ⚠️ Pas de parseFloat ! Envoi de la chaîne brute ("1+5" ou "12") au service transactionnel
            result = await annulRetourService.retournerLigneAchat(
                itemId, 
                req.user, 
                qte, 
                observation || ''
            );
        } 
        else {
            return res.status(400).json({ error: "Action non reconnue (doit être ANNULER ou RETOUR)." });
        }

        // --- GESTION COMPTABILITÉ ---
        try {
            const typeEcriture = action === 'ANNULER' ? 'purchase_line_cancel' : 'purchase_line_return';
            await configComptaService.genererEcritureExplicite(typeEcriture, itemId, companyId);
        } catch (e) {
            console.error("⚠️ [COMPTA ERROR] :", e.message);
        }

        // 🚀 HYDRATATION LOGISTIQUE DE LA RÉPONSE POUR L'INTERFACE :
        // Si le service renvoie les volumes modifiés (ex: result.qte_mouvementee), 
        // on génère dynamiquement sa traduction textuelle pour que le pop-up React affiche un message parfait.
        let messageAffichage = result.message;
        if (result && result.qte_mouvementee !== undefined && result.coefficient) {
            const qteTexteFormatee = conversestock.formaterStockPourAffichage(
                result.qte_mouvementee,
                result.coefficient,
                result.unit_code_gros || 'CS',
                result.unit_ref_detail || 'BTL'
            );
            messageAffichage = `${action === 'ANNULER' ? 'Annulation' : 'Retour'} validé avec succès pour un volume de : ${qteTexteFormatee}.`;
        }

        // --- NOTIFICATION TEMPS RÉEL ---
        if (req.io) {
            const room = String(companyId);
            req.io.to(room).emit('STOCK_UPDATED');
            req.io.to(room).emit('DATA_EVENT', { table: 'products', action: 'UPDATE' });
            req.io.to(room).emit('DATA_EVENT', { table: 'purchases', action: 'UPDATE' });
        }

        return res.json({ 
            success: true, 
            message: messageAffichage,
            qte_brute_pieces: result?.qte_mouvementee || 0 
        });

    } catch (error) {
        console.error("❌ Erreur traiterActionLigne:", error.message);
        return res.status(500).json({ error: error.message });
    }
};

const archivePurchase = async (req, res) => {
    try {
        const { id } = req.params; 
        const companyId = req.user?.company_id || req.user?.companyId;
        const userContext = {
            secureUserId: req.user?.userId || req.user?.id,
            userName: req.user?.username || "utilisateur"
        };

        await approService.archivePurchase(id, companyId, userContext);

        if (req.io) {
            req.io.to(String(companyId)).emit('DATA_EVENT', { table: 'purchases', action: 'ARCHIVE' });
        }

        return res.json({ success: true, message: "Achat déplacé vers les archives." });
    } catch (error) {
        console.error("❌ Erreur archivage:", error.message);
        return res.status(500).json({ error: error.message });
    }
};
const archiveLot = async (req, res) => {
    try {
        const { lotId } = req.params;
        const companyId = req.user?.company_id || req.user?.companyId;
        const userContext = {
            secureUserId: req.user?.userId || req.user?.id,
            userName: req.user?.username || "utilisateur"
        };

        if (!companyId) {
            return res.status(400).json({ error: "ID Entreprise manquant." });
        }

        // Appel de la méthode dédiée du service logistique
        await approService.archiveLot(lotId, companyId, userContext);

        if (req.io) {
            req.io.to(String(companyId)).emit('DATA_EVENT', { table: 'purchases', action: 'ARCHIVE' });
        }

        return res.json({ success: true, message: `Le lot ${lotId} a été archivé.` });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};

const getArchivedPurchases = async (req, res) => {
    try {
        const companyId = req.user?.company_id || req.user?.companyId;
        if (!companyId) return res.status(400).json({ error: "ID Entreprise manquant." });

        const rows = await approService.getArchivedPurchases(companyId);

        // 🚀 HYDRATATION LOGISTIQUE INVERSE DES ARCHIVES (ANTI-LITIGE VISUEL)
        const formattedRows = rows.map(row => {
            if (row.qte_achetee !== undefined) {
                return {
                    ...row,
                    qte_achetee_formatee: conversestock.formaterStockPourAffichage(
                        row.qte_achetee,
                        row.unite_coefficient || row.coefficient || 1,
                        row.unite_code || row.unit_code_gros || 'CS',
                        row.unite_reference || row.unit_ref_detail || 'BTL'
                    )
                };
            }
            return row;
        });

        return res.json(formattedRows);
    } catch (error) {
        console.error("Erreur getArchivedPurchases:", error);
        return res.status(500).json({ error: error.message });
    }
};

/**
 * Récupère la liste des dettes impayées groupées par fournisseur
 */
const getDebts = async (req, res) => {
    try {
        const companyId = req.user?.company_id || req.user?.companyId;
        
        if (!companyId) {
            return res.status(400).json({ error: "ID Entreprise manquant." });
        }

        const debts = await approService.getSupplierDebts(companyId);
        return res.json({ success: true, data: debts });
    } catch (error) {
        console.error("❌ Erreur getDebts:", error.message);
        return res.status(500).json({ error: error.message });
    }
};

/**
 * Enregistre un paiement pour solder tout ou partie d'une dette sur un achat
 */
const postPayment = async (req, res) => {
    try {
        const companyId = req.user?.company_id || req.user?.companyId;
        const { purchase_id, montant, moyen_paiement, fournisseur_id } = req.body;

        // Validation financière de sécurité
        if (!purchase_id || !montant || parseFloat(montant) <= 0) {
            return res.status(400).json({ error: "Données de paiement invalides." });
        }

        // 1. Mise à jour de la base de données via la couche service
        const result = await approService.recordDebtPayment(req.body, req.user);

        // 2. Comptabilité automatique découplée
        try {
            if (configComptaService && typeof configComptaService.genererEcritureExplicite === 'function') {
                await configComptaService.genererEcritureExplicite('purchase_payments', result.payId, companyId);
            }
        } catch (comptaError) {
            console.error("⚠️ [COMPTA] Erreur lors du règlement de dette :", comptaError.message);
        }

        // 3. Notifications Temps Réel (Sockets)
        if (req.io) {
            const room = companyId.toString();
            req.io.to(room).emit('DATA_EVENT', { table: 'purchases', action: 'UPDATE' });
            req.io.to(room).emit('DATA_EVENT', { table: 'suppliers', action: 'UPDATE' });
            req.io.to(room).emit('DEBT_PAYMENT_SUCCESS', { purchase_id });
        }

        return res.json({ 
            success: true, 
            message: "Paiement enregistré avec succès.",
            payId: result.payId 
        });

    } catch (error) {
        console.error("❌ Erreur postPayment:", error.message);
        return res.status(500).json({ error: error.message });
    }
};

/**
 * Récupère l'historique des achats entièrement réglés
 */
const getSoldHistory = async (req, res) => {
    try {
        const companyId = req.user?.company_id || req.user?.companyId;
        
        if (!companyId) {
            return res.status(400).json({ error: "ID Entreprise manquant." });
        }

        const history = await approService.getSoldPurchases(companyId);

        // 🚀 HYDRATATION LOGISTIQUE INVERSE DE L'HISTORIQUE DES ACHATS SOLDÉS
        const formattedHistory = history.map(row => {
            if (row.qte_achetee !== undefined) {
                return {
                    ...row,
                    qte_achetee_formatee: conversestock.formaterStockPourAffichage(
                        row.qte_achetee,
                        row.unite_coefficient || row.coefficient || 1,
                        row.unite_code || row.unit_code_gros || 'CS',
                        row.unite_reference || row.unit_ref_detail || 'BTL'
                    )
                };
            }
            return row;
        });

        return res.json({ success: true, data: formattedHistory });
    } catch (error) {
        console.error("❌ Erreur getSoldHistory:", error.message);
        return res.status(500).json({ error: error.message });
    }
};

// ✅ EXPORTATION FINALE ET COHÉRENTE DU CONTRÔLEUR
module.exports = { 
    saveApprovisionnement, 
    getAllPurchases, 
    getSoldHistory,
    traiterActionLigne,
    getTemporaryPurchase,
    archivePurchase,
    getArchivedPurchases,
    archiveLot, 
    getDebts,
    postPayment,
    syncTemporaryPurchase,
    clearTemporaryPurchase: deleteTemporaryPurchase // Mappe correctement sur la fonction du bloc 2
};
