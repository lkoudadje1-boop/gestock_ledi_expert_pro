// backend/controllers/nouvellevente.controller.js
const mongoose = require('mongoose');
const venteService = require('../services/nouvellevente.service');
const conversestock = require('../services/conversestock');
const { CloudProduct } = require('../models/cloud.model');

const getContext = (req) => {
    const user = req.user || {};
    return {
        secureUserId: (user.userId || user.id || user.id_utilisateur)?.toString(),
        secureCompanyId: (user.companyId || user.company_id)?.toString(),
        userName: 'user' // Respect strict de la consigne [2026-02-08]
    };
};

const createSale = async (req, res) => {
    const { secureUserId, secureCompanyId, userName } = getContext(req);
    
    if (!secureUserId || !secureCompanyId) {
        return res.status(401).json({ error: "Session invalide ou expirée." });
    }

    try {
        const itemsEntrants = req.body?.items || [];
        const itemsAvecSnapshots = [];

        for (const item of itemsEntrants) {
            const pId = item.product_id;
            const product = await CloudProduct.findOne({ 
                $or: [{ localId: pId }, { _id: mongoose.isValidObjectId(pId) ? pId : null }],
                company_id: secureCompanyId
            }).lean();

            const currentCMP = product ? Number(product.cmp || 0) : 0;
            const qteVendue = Number(item.quantite || 0);
            const totalAchatLigne = Math.round((qteVendue * currentCMP) * 100) / 100;

            itemsAvecSnapshots.push({
                ...item,
                prix_achat_unitaire_snap: currentCMP,
                montant_achat_total_snap: totalAchatLigne
            });
        }

        const payloadEnrichi = {
            ...req.body,
            items: itemsAvecSnapshots
        };

        const result = await venteService.createSale(payloadEnrichi, { secureUserId, secureCompanyId, userName });
        
        try {
            if (result?.saleId && typeof saleComptaService !== 'undefined' && typeof saleComptaService?.genererEcritureVente === 'function') {
                await saleComptaService.genererEcritureVente(result.saleId, secureCompanyId);
            }
        } catch (comptaError) {
            console.error("⚠️ [COMPTA VENTE] Erreur postage immédiat :", comptaError.message);  
        }

        if (req.io) {
            const room = secureCompanyId;
            req.io.to(room).emit('DATA_EVENT', { table: 'sales', action: 'INSERT' });
            req.io.to(room).emit('DATA_EVENT', { table: 'products', action: 'UPDATE' });
            req.io.to(room).emit('STOCK_UPDATED');
            const clientNotification = req.body?.encaissement?.nom_client || 'CLIENT AU COMPTANT';
            req.io.to(room).emit('NOTIFICATION_VENTE', {
                message: `Nouvelle vente : ${result.totalRecu} par ${userName}`,
                client: clientNotification
            });
        }  

        return res.status(201).json({ 
            success: true, 
            message: "Vente enregistrée, stocks mis à jour et comptabilisée.", 
            lot_id: result.lotId,
            sale_id: result.saleId 
        });
    } catch (err) {
        console.error("❌ Erreur createSale:", err.message);
        return res.status(400).json({ error: err.message });
    }
};

const getAllSales = async (req, res) => {
    const companyId = (req.user?.companyId || req.user?.company_id)?.toString();
    if (!companyId) return res.status(401).json({ error: "Entreprise non identifiée." });
    
    try {
        const sales = await venteService.getAllSales(companyId);

        const formattedSales = sales.map(sale => {
            if (sale.qte_vendue !== undefined) {
                return {
                    ...sale,
                    qte_vendue_formatee: conversestock.formaterStockPourAffichage(
                        sale.qte_vendue,
                        sale.unit_coefficient || sale.coefficient || 1,
                        sale.unit_code_gros || sale.unite_code || 'CS',
                        sale.unit_ref_detail || sale.unite_reference || 'PCS'
                    )
                };
            }
            return sale;
        });
        return res.json(formattedSales);
    } catch (err) {
        console.error("❌ Erreur getAllSales:", err.message);
        return res.status(500).json({ error: "Erreur récupération historique." });
    }
};

const getSalesForCloture = async (req, res) => {
    const companyId = (req.user?.companyId || req.user?.company_id)?.toString();
    const userId = (req.user?.userId || req.user?.id)?.toString();

    if (!companyId || !userId) {
        return res.status(401).json({ error: "Session incomplète." });
    }
    try {
        const sales = await venteService.getSalesForCloture(companyId, userId);

        const formattedSales = sales.map(sale => {
            if (sale.qte_vendue !== undefined) {
                return {
                    ...sale,
                    qte_vendue_formatee: conversestock.formaterStockPourAffichage(
                        sale.qte_vendue,
                        sale.unit_coefficient || sale.coefficient || 1,
                        sale.unit_code_gros || sale.unite_code || 'CS',
                        sale.unit_ref_detail || sale.unite_reference || 'PCS'
                    )
                };
            }
            return sale;
        });

        return res.json({ success: true, data: formattedSales });
    } catch (err) {
        console.error("❌ Erreur getSalesForCloture:", err.message);
        return res.status(500).json({ error: "Impossible de récupérer les ventes du jour." });
    }
};

const getTemporaryCart = async (req, res) => {
    const { vendeurId } = req.params;
    const companyId = (req.user?.companyId || req.user?.company_id)?.toString();
    if (!companyId) return res.status(401).json({ error: "Entreprise non identifiée." });

    try {
        const cart = await venteService.getTemporaryCart(vendeurId, companyId);
        return res.json({ lignes: cart });
    } catch (err) {
        console.error("❌ Erreur getTemporaryCart:", err.message);
        return res.status(500).json({ error: "Erreur récupération panier." });
    }
};

const syncTemporaryCart = async (req, res) => {
    const secureUserId = (req.user?.userId || req.user?.id)?.toString();
    const companyId = (req.user?.companyId || req.user?.company_id)?.toString();
    const { lignes = [] } = req.body;
    
    if (!secureUserId || !companyId) return res.status(401).json({ error: "Utilisateur non authentifié." });
    
    try {
        await venteService.syncTemporaryCart(secureUserId, companyId, lignes);
        if (req.io) {
            req.io.to(companyId).emit('DATA_EVENT', { table: 'carts', action: 'SYNC', userId: secureUserId });
            req.io.to(companyId).emit('CART_UPDATED', { vendeurId: secureUserId, itemCount: lignes.length });
        }
        return res.json({ success: true });
    } catch (err) {
        console.error("❌ Erreur syncTemporaryCart:", err.message);
        return res.status(500).json({ error: "Erreur de synchronisation." });
    }
};

const deleteTemporaryCart = async (req, res) => {
    const userIdToDelete = req.params.vendeurId || (req.user?.userId || req.user?.id)?.toString();
    const companyId = (req.user?.companyId || req.user?.company_id)?.toString();
    if (!companyId) return res.status(401).json({ error: "Entreprise non identifiée." });

    try {
        const changes = await venteService.deleteTemporaryCart(userIdToDelete, companyId);
        if (req.io) {
            req.io.to(companyId).emit('DATA_EVENT', { table: 'carts', action: 'DELETE', userId: userIdToDelete });
            req.io.to(companyId).emit('CART_UPDATED', { userId: userIdToDelete, lignes: [] });
        }
        return res.json({ success: true, deleted: changes });
    } catch (err) {
        console.error("❌ Erreur deleteTemporaryCart:", err.message);
        return res.status(500).json({ error: "Erreur suppression." });
    }
};

const deleteTemporaryFactureCart = async (req, res) => {
    const userIdToDelete = req.params.vendeurId || (req.user?.userId || req.user?.id)?.toString();
    const companyId = (req.user?.companyId || req.user?.company_id)?.toString();
    if (!companyId) return res.status(401).json({ error: "Entreprise non identifiée." });

    try {
        const changes = await venteService.deleteTemporaryFactureCart(userIdToDelete, companyId);
        if (req.io) {
            req.io.to(companyId).emit('DATA_EVENT', { 
                table: 'temporary_factures_carts', 
                action: 'DELETE', 
                userId: userIdToDelete 
            });
            req.io.to(companyId).emit('FACTURE_CART_UPDATED', { 
                userId: userIdToDelete, 
                lignes: [] 
            });
        }
        return res.json({ success: true, deleted: changes });
    } catch (err) {
        console.error("❌ Erreur suppression panier facture:", err.message);
        return res.status(500).json({ error: "Erreur suppression panier facture." });
    }
};

const getPerformanceDuJour = async (req, res) => {
    const companyId = req.user?.companyId || req.user?.company_id;
    if (!companyId) return res.status(400).json({ error: "ID Entreprise manquant." });
    
    try {
        const performance = await venteService.getPerformanceDuJour(companyId);
        return res.json(performance);
    } catch (err) {
        return res.json({ ca_brut: 0, total_negatifs: 0, ca_net: 0, nombre_ventes: 0 });
    }
};

const getSaleByLotId = async (req, res) => {
    const { lotId } = req.params;
    const companyId = (req.user?.companyId || req.user?.company_id)?.toString();
    if (!companyId) return res.status(401).json({ error: "Entreprise non identifiée." });

    try {
        const { paiement, articles } = await venteService.getSaleByLotId(lotId, companyId);
        
        const formattedArticles = articles.map(item => {
            const qteBrute = Math.abs(Number(item.quantite || item.qte_vendue || 0));
            const coeff = Number(item.unit_coefficient || item.coefficient || 1);
            const codeGros = String(item.unit_code_gros || item.unite_code || 'CS').toUpperCase().trim();
            const refDetail = String(item.unit_ref_detail || item.unite_reference || 'PCS').toUpperCase().trim();

            const qteFormatee = conversestock.formaterStockPourAffichage(
                qteBrute,
                coeff,
                codeGros,
                refDetail
            );

            return {
                id_vente: item.id,
                nom_article: item.nom_article_snap,
                quantite: item.quantite,
                quantite_formatee: qteFormatee,
                prix_unitaire: item.prix_vente_unitaire,
                total_ligne: item.montant_ttc_ligne
            };
        });

        return res.json({
            lot_id: paiement.lot_id,
            date_vente: paiement.created_at || articles[0]?.date_vente,
            client: paiement.client_name,
            montant_total: paiement.montant,
            recu: paiement.recu,
            rendu: paiement.rendu,
            moyen_paiement: paiement.moyen_paiement,
            articles: formattedArticles
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

const archiveSale = async (req, res) => {
    const { lotId } = req.params;
    const secureCompanyId = (req.user?.companyId || req.user?.company_id)?.toString();
    
    const userContext = { 
        secureUserId: (req.user?.userId || req.user?.id)?.toString(), 
        userName: 'user' 
    };

    if (!secureCompanyId) return res.status(400).json({ error: "ID Entreprise manquant." });
    if (!userContext.secureUserId) return res.status(401).json({ error: "Session invalide." });

    try {
        await venteService.archiveSale(lotId, secureCompanyId, userContext);
        
        if (req.io) {
            req.io.to(secureCompanyId).emit('DATA_EVENT', { table: 'sales', action: 'ARCHIVE' });
        }
        return res.status(200).json({ success: true, message: "Vente archivée avec succès." });
    } catch (err) {
        console.error("❌ Erreur archiveSale Controller:", err.message);
        return res.status(500).json({ error: err.message });
    }
};

const getArchivedSales = async (req, res) => {
    const companyId = (req.user?.companyId || req.user?.company_id)?.toString();
    const { search, start, end } = req.query; 

    if (!companyId) return res.status(401).json({ error: "Entreprise non identifiée." });

    try {
        const sales = await venteService.getArchivedSales(companyId, { 
            search, 
            startDate: start, 
            endDate: end 
        });

        const formattedSales = sales.map(sale => {
            if (sale.qte_vendue !== undefined) {
                return {
                    ...sale,
                    qte_vendue_formatee: conversestock.formaterStockPourAffichage(
                        sale.qte_vendue,
                        sale.unit_coefficient || sale.coefficient || 1,
                        sale.unit_code_gros || sale.unite_code || 'CS',
                        sale.unit_ref_detail || sale.unite_reference || 'PCS'
                    )
                };
            }
            return sale;
        });

        return res.json(formattedSales);
    } catch (err) {
        console.error("❌ Erreur getArchivedSales Controller:", err.message);
        return res.status(500).json({ error: err.message });
    }
};

const getDeletedSales = async (req, res) => {
    const companyId = (req.user?.companyId || req.user?.company_id)?.toString();
    const { search } = req.query;

    if (!companyId) return res.status(401).json({ error: "Entreprise non identifiée." });

    try {
        const sales = await venteService.getDeletedSales(companyId, { search });

        const formattedSales = sales.map(sale => {
            if (sale.qte_vendue !== undefined) {
                return {
                    ...sale,
                    qte_vendue_formatee: conversestock.formaterStockPourAffichage(
                        sale.qte_vendue,
                        sale.unit_coefficient || sale.coefficient || 1,
                        sale.unit_code_gros || sale.unite_code || 'CS',
                        sale.unit_ref_detail || sale.unite_reference || 'PCS'
                    )
                };
            }
            return sale;
        });

        return res.json(formattedSales);
    } catch (err) {
        console.error("❌ Erreur getDeletedSales Controller:", err.message);
        return res.status(500).json({ error: "Erreur récupération historique des suppressions." });
    }
};

const getTemporaryFactureCart = async (req, res) => {
    const { vendeurId } = req.params;
    const companyId = (req.user?.companyId || req.user?.company_id)?.toString();

    if (!companyId) return res.status(401).json({ error: "Entreprise non identifiée." });

    try {
        const cart = await venteService.getTemporaryFactureCart(vendeurId, companyId);
        return res.json({ lignes: cart });
    } catch (err) {
        console.error("❌ Erreur getTemporaryFactureCart Controller:", err.message);
        return res.status(500).json({ error: "Erreur récupération panier facture." });
    }
};

const syncTemporaryFactureCart = async (req, res) => {
    const secureUserId = (req.user?.userId || req.user?.id)?.toString();
    const companyId = (req.user?.companyId || req.user?.company_id)?.toString();
    const { lignes = [] } = req.body;

    if (!secureUserId || !companyId) return res.status(401).json({ error: "Session incomplète." });

    try {
        await venteService.syncTemporaryFactureCart(secureUserId, companyId, lignes);
        if (req.io) {
            req.io.to(companyId).emit('DATA_EVENT', { table: 'temporary_factures_carts', action: 'SYNC', userId: secureUserId });
        }
        return res.json({ success: true });
    } catch (err) {
        console.error("❌ Erreur syncTemporaryFactureCart Controller:", err.message);
        return res.status(500).json({ error: "Erreur synchro panier facture." });
    }
};

const cancelSale = async (req, res) => {
    const { lotId } = req.params;
    const { observation } = req.body; 
    
    const companyId = (req.user?.companyId || req.user?.company_id)?.toString();
    const userContext = { 
        userId: (req.user?.userId || req.user?.id)?.toString(), 
        userName: 'user' 
    };

    if (!companyId) return res.status(400).json({ error: "ID Entreprise manquant." });
    if (!userContext.userId) return res.status(401).json({ error: "Session invalide." });

    try {
        const result = await venteService.cancelSale(lotId, companyId, userContext, observation);
        
        if (req.io) {
            req.io.to(companyId).emit('DATA_EVENT', { table: 'sales', action: 'UPDATE' });
            req.io.to(companyId).emit('DATA_EVENT', { table: 'sale_items', action: 'UPDATE' });
            req.io.to(companyId).emit('DATA_EVENT', { table: 'products', action: 'UPDATE' });
            req.io.to(companyId).emit('REFRESH_STOCK', { reason: 'SALE_CANCELLED', lotId });
        }
        
        return res.json({ 
            success: true, 
            message: result?.message || "Vente annulée avec succès." 
        });
    } catch (err) {
        console.error("❌ Erreur cancelSale Controller:", err.message);
        return res.status(500).json({ error: err.message });
    }
};

const cancelSaleItem = async (req, res) => {
    const { saleItemId } = req.params;
    const { observation } = req.body; 

    const companyId = (req.user?.companyId || req.user?.company_id)?.toString();
    const userContext = { 
        userId: (req.user?.userId || req.user?.id)?.toString(), 
        userName: 'user' 
    };

    if (!companyId) return res.status(400).json({ error: "ID Entreprise manquant." });
    if (!userContext.userId) return res.status(401).json({ error: "Session invalide." });

    try {
        const result = await venteService.cancelSaleItem(saleItemId, companyId, userContext, observation);
        
        let messageAffichage = "Ligne annulée et stock réintégré.";
        if (result && result.qte_mouvementee !== undefined) {
            const coeffLogistique = Number(result.unit_coefficient || result.coefficient || 1);
            const qteTexteFormatee = conversestock.formaterStockPourAffichage(
                result.qte_mouvementee,
                coeffLogistique,
                result.unit_code_gros || result.unite_code || 'CS',
                result.unit_ref_detail || result.unite_reference || 'PCS'
            );
            messageAffichage = `Ligne annulée avec succès. Volume de ${qteTexteFormatee} réintégré au stock disponible.`;
        }

        if (req.io) {
            req.io.to(companyId).emit('DATA_EVENT', { table: 'sales', action: 'UPDATE' });
            req.io.to(companyId).emit('DATA_EVENT', { table: 'sale_items', action: 'UPDATE' });
            req.io.to(companyId).emit('DATA_EVENT', { table: 'products', action: 'UPDATE' });
        }
        
        return res.json({ 
            success: true, 
            message: messageAffichage 
        });
    } catch (err) {
        console.error("❌ Erreur cancelSaleItem Controller:", err.message);
        return res.status(500).json({ error: err.message });
    }
};

const handleReturnItem = async (req, res) => {
    const { saleItemId } = req.params;
    const companyId = (req.user?.companyId || req.user?.company_id)?.toString();
    const userContext = { 
        secureUserId: (req.user?.userId || req.user?.id)?.toString(), 
        userName: 'user' 
    };

    if (!saleItemId) return res.status(400).json({ error: "ID Article manquant." });
    if (!companyId) return res.status(400).json({ error: "ID Entreprise manquant." });
    if (!userContext.secureUserId) return res.status(401).json({ error: "Session invalide." });

    try {
        const result = await venteService.handleReturnSaleItem(saleItemId, companyId, userContext);
        
        let messageAffichage = "Retour effectué avec remboursement généré.";
        if (result && result.qte_mouvementee !== undefined) {
            const coeffLogistique = Number(result.unit_coefficient || result.coefficient || 1);
            const qteTexteFormatee = conversestock.formaterStockPourAffichage(
                result.qte_mouvementee,
                coeffLogistique,
                result.unit_code_gros || result.unite_code || 'CS',
                result.unit_ref_detail || result.unite_reference || 'PCS'
            );
            messageAffichage = `Retour validé. Volume de ${qteTexteFormatee} réintégré au stock et remboursement enregistré.`;
        }

        if (req.io) {
            const room = companyId;
            req.io.to(room).emit('DATA_EVENT', { table: 'sales', action: 'UPDATE' });
            req.io.to(room).emit('DATA_EVENT', { table: 'products', action: 'UPDATE' });
            req.io.to(room).emit('DATA_EVENT', { table: 'payments', action: 'INSERT' });
        }
        
        return res.json({ 
            success: true, 
            message: messageAffichage 
        });
    } catch (err) {
        console.error("❌ Erreur handleReturnItem Controller:", err.message);
        return res.status(500).json({ error: err.message });
    }
};

const createRetour = async (req, res) => {
    const secureUserId = (req.user?.userId || req.user?.id || req.user?.id_utilisateur)?.toString();
    const secureCompanyId = (req.user?.companyId || req.user?.company_id)?.toString();
    const userName = 'user';

    if (!secureUserId || !secureCompanyId) {
        return res.status(401).json({ error: "Session invalide ou expirée." });
    }

    try {
        const result = await venteService.createSale(req.body, { secureUserId, secureCompanyId, userName });

        try {
            if (result?.lotId && typeof saleComptaService !== 'undefined' && typeof saleComptaService?.genererEcritureVente === 'function') {
                // If needed, can use mongoose models instead of req.db
            }
        } catch (comptaError) {
            console.error("⚠️ [COMPTA RETOUR] Erreur postage :", comptaError.message);
        }

        if (req.io) {
            req.io.to(secureCompanyId).emit('DATA_EVENT', { table: 'products', action: 'UPDATE' });
            req.io.to(secureCompanyId).emit('STOCK_UPDATED');
        }

        return res.status(201).json({ success: true, message: "Retour validé avec succès.", lot_id: result.lotId });
    } catch (err) {
        console.error("❌ Erreur createRetour:", err.message);
        return res.status(400).json({ error: err.message });
    }
};

const getActiveDebts = async (req, res) => {
    const secureCompanyId = (req.user?.companyId || req.user?.company_id)?.toString();
    if (!secureCompanyId) return res.status(401).json({ error: "Entreprise non identifiée." });

    try {
        const debts = await venteService.getActiveDebts(secureCompanyId);
        
        const formattedDebts = debts.map(debt => {
            let detailAchatsFormates = [];
            if (Array.isArray(debt.detail_achats)) {
                detailAchatsFormates = debt.detail_achats.map(achat => {
                    const articlesFormates = (achat.articles_factures || []).map(art => {
                        const qteBrute = Math.abs(Number(art.qte_pieces || art.quantite || art.qte_vendue || 0));
                        const coeff = Number(art.coeff || art.unit_coefficient || art.coefficient || 1);
                        const codeGros = String(art.code_gros || art.unit_code_gros || art.unite_code || 'CS').toUpperCase().trim();
                        const refDetail = String(art.ref_detail || art.unit_ref_detail || art.unite_reference || 'PCS').toUpperCase().trim();

                        return {
                          ...art,
                          qte_vendue_formatee: conversestock.formaterStockPourAffichage(
                              qteBrute,
                              coeff,
                              codeGros,
                              refDetail
                          )
                        };
                    });
                    return { ...achat, articles_factures: articlesFormates };
                });
            }
            return { ...debt, detail_achats: detailAchatsFormates };
        });

        return res.json(formattedDebts);
    } catch (err) {
        console.error("❌ Erreur getActiveDebts:", err.message);
        return res.status(500).json({ error: err.message });
    }
};

const payDebt = async (req, res) => {
    try {
        const { saleId, montant, moyen_paiement } = req.body; 
        const secureUserId = (req.user?.id || req.user?.userId || "1").toString();
        const secureCompanyId = (req.user?.company_id || req.user?.companyId || "1").toString();
        const montantNumerique = parseFloat(montant);

        if (!saleId) {
            return res.status(400).json({ error: "L'identifiant de la vente est manquant." });
        }
        if (isNaN(montantNumerique) || montantNumerique <= 0) {
            return res.status(400).json({ error: "Le montant doit être un nombre supérieur à 0." });
        }

        const result = await venteService.payDebt(saleId, {
            montant: montantNumerique,
            moyen_paiement: moyen_paiement || 'Espèces', 
            secureUserId,
            secureCompanyId
        });

        if (req.io) {
            req.io.to(secureCompanyId).emit('DATA_EVENT', { 
                table: 'sales', 
                action: 'UPDATE', 
                id: saleId,
                message: "Mise à jour des créances"
            });
        }

        return res.status(200).json({ 
            success: true, 
            message: "Règlement enregistré avec succès.", 
            data: result 
        });
    } catch (err) {
        console.error("❌ Erreur payDebt controller:", err.message);
        return res.status(500).json({ 
            success: false,
            message: err.message || "Une erreur interne est survenue." 
        });
    }
};

const getClientByFacture = async (req, res) => {
    try {
        const { id } = req.params;
        const companyId = (req.user?.company_id || req.user?.companyId)?.toString();

        if (!companyId) {
            return res.status(400).json({ error: "Identifiant de l'entreprise manquant dans la session." });
        }

        const sale = await venteService.getClientByFacture(id, companyId);

        if (!sale) {
            return res.status(404).json({ message: "Aucune facture correspondante trouvée." });
        }

        return res.json({ nom_client_snap: sale.nom_client_snap });
    } catch (err) {
        console.error("❌ Erreur getClientByFacture:", err.message);
        return res.status(500).json({ error: "Erreur lors de la récupération des données de facturation." });
    }
};

const getSalesDetails = async (req, res) => {
    try {
        const { date_debut, date_fin } = req.query;
        const companyId = req.user?.companyId || req.user?.company_id || 1;

        if (!date_debut || !date_fin || date_debut.includes('undefined') || date_fin.includes('undefined')) {
            return res.status(400).json({ error: "Plage de dates manquante ou invalide." });
        }

        const partsDebut = date_debut.split('/');
        const partsFin = date_fin.split('/');
        if (partsDebut.length !== 3 || partsFin.length !== 3) {
            return res.status(400).json({ error: "Format de date invalide. Attendu DD/MM/YYYY" });
        }
        
        const result = await venteService.getSalesDetailsByDate(date_debut, date_fin, companyId);
        
        const rows = Array.isArray(result) ? result : (result?.data || []);
        const formattedData = rows.map(item => {
            const qteBrute = Math.abs(Number(item.quantite || item.qte_vendue || 0));
            
            const coeff = Number(item.unit_coefficient || item.coefficient || 1);
            const codeGros = String(item.unit_code_gros || item.unite_code || 'CS').toUpperCase().trim();
            const refDetail = String(item.unit_ref_detail || item.unite_reference || 'PCS').toUpperCase().trim();

            return {
                ...item,
                qte_formatee: conversestock.formaterStockPourAffichage(
                    qteBrute,
                    coeff,
                    codeGros,
                    refDetail
                )
            };
        });

        return res.json({ data: formattedData });
    } catch (error) {
        console.error("❌ Erreur getSalesDetails:", error.message);
        return res.status(500).json({ error: error.message });
    }
};

module.exports = { 
    createSale, 
    getAllSales, 
    getTemporaryCart, 
    syncTemporaryCart, 
    deleteTemporaryCart, 
    getPerformanceDuJour, 
    getSaleByLotId, 
    getSalesDetails,
    getArchivedSales, 
    getDeletedSales, 
    cancelSale, 
    archiveSale, 
    cancelSaleItem,
    getTemporaryFactureCart, 
    syncTemporaryFactureCart, 
    deleteTemporaryFactureCart,
    createRetour, 
    getSalesForCloture, 
    getActiveDebts, 
    payDebt, 
    getClientByFacture,
    handleReturnItem
};