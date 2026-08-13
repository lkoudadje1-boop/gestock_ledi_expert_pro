// backend/services/nouvellevente.service.js
const mongoose = require('mongoose');
const { 
    CloudSale, CloudSaleItem, CloudProduct, 
    CloudUnite, CloudPayment, CloudStockMovement, 
    CloudCompany, CloudAuditLog 
} = require('../models/cloud.model');
const { logAction } = require('../utils/auditHelper');
const conversestock = require('./conversestock');

function genererIdVente() {
    return `VTE-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`;
}

const createSale = async (data, userContext) => {
    const { 
        lignes = [], 
        encaissement = {}, 
        staff_id = null, 
        staff_name = null, 
        caissier_id = null 
    } = data;
    const { secureUserId, secureCompanyId, userName } = userContext;
    const companyStr = secureCompanyId.toString();

    if (lignes.length === 0) throw new Error("Le panier est vide.");

    const totalVente = lignes.reduce((sum, item) => sum + parseFloat(item.montant_ttc_ligne || 0), 0);
    let modeReglement = encaissement.moyen_paiement; 
    let montantRecu = parseFloat(encaissement.total || 0);

    if (modeReglement === 'CREDIT') {
        montantRecu = 0;
    } else if (modeReglement === 'ACOMPTE' && montantRecu <= 0) {
        modeReglement = 'CREDIT';
    }

    const resteAPayer = Math.max(0, totalVente - montantRecu);
    let paymentStatus = 'SOLDE'; 
    if (montantRecu <= 0) {
        paymentStatus = 'NON_PAYE';
    } else if (resteAPayer > 0.1) {
        paymentStatus = 'PARTIEL';
    }

    const saleId = genererIdVente(); 
    const dateVente = new Date();
    const lotId = (lignes[0] && lignes[0].id_lot) ? lignes[0].id_lot : `LOT-V-${Date.now().toString().slice(-6)}`;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const company = await CloudCompany.findOne({ 
            $or: [{ localId: companyStr }, { _id: mongoose.isValidObjectId(companyStr) ? companyStr : null }] 
        }).session(session).lean();

        const finalClientId = encaissement.customer_id || company?.default_customer_id;
        const nomClientFinal = encaissement.nom_client || 'CLIENT AU COMPTANT';

        await CloudSale.create([{
            localId: saleId,
            lot_id: lotId,
            customer_id: finalClientId,
            nom_client_snap: nomClientFinal,
            montant_total: totalVente,
            montant_paye: montantRecu,
            reste_a_payer: resteAPayer,
            payment_status: paymentStatus,
            mode_reglement: modeReglement,
            user_id: secureUserId,
            caissier_id: caissier_id || secureUserId,
            staff_id: staff_id || company?.default_staff_id,
            staff_name_snap: staff_name || userName,
            company_id: companyStr,
            statut_vente: 'VALIDEE',
            date_vente: dateVente,
            is_comptabilise: 0,
            sync_status: 'synced'
        }], { session });

        for (let index = 0; index < lignes.length; index++) {
            const item = lignes[index];
            const pId = item.product_id;

            const product = await CloudProduct.findOne({ 
                $or: [{ localId: pId }, { _id: mongoose.isValidObjectId(pId) ? pId : null }], 
                company_id: companyStr 
            }).session(session).lean();

            if (!product) throw new Error(`Produit introuvable : ${item.nom_article_snap}`);

            let unitCoefficient = 1;
            let unitCodeGros = 'CS';
            let unitRefDetail = 'PCS';

            if (product.unite_id) {
                const unite = await CloudUnite.findOne({ 
                    $or: [{ localId: product.unite_id }, { _id: mongoose.isValidObjectId(product.unite_id) ? product.unite_id : null }] 
                }).session(session).lean();
                if (unite) {
                    unitCoefficient = unite.coefficient || 1;
                    unitCodeGros = unite.code || 'CS';
                    unitRefDetail = unite.unite_reference || 'PCS';
                }
            }

            const qtePiecesVente = conversestock.calculerUnitesNativesSimples(item.quantite, unitCoefficient);
            if (qtePiecesVente <= 0) {
                throw new Error(`La quantité de vente saisie pour l'article "${product.nom}" est invalide ou nulle.`);
            }

            const stockAvant = Number(product.stock_actuel || 0);
            const stockApres = stockAvant - qtePiecesVente;

            if (stockApres < 0) {
                const stockDispoFormate = conversestock.formaterStockPourAffichage(stockAvant, unitCoefficient, unitCodeGros, unitRefDetail);
                const qteDemandeeFormatee = conversestock.formaterStockPourAffichage(qtePiecesVente, unitCoefficient, unitCodeGros, unitRefDetail);
                throw new Error(`Stock insuffisant pour l'article "${product.nom}". Disponible: ${stockDispoFormate}, Demandé: ${qteDemandeeFormatee}.`);
            }

            const mtTTCLigne = parseFloat(item.montant_ttc_ligne || 0);
            const puVentePieces = mtTTCLigne / qtePiecesVente;
            
            const puAchatPiecesSnap = Number(product.cmp || 0) / unitCoefficient;
            const mtAchatTotalLigneSnap = Math.round((qtePiecesVente * puAchatPiecesSnap) * 100) / 100;

            const itemId = `LIT-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}${index}`;

            await CloudSaleItem.create([{
                localId: itemId,
                lot_id: lotId,
                id_vente: saleId,
                customer_id: finalClientId,
                product_id: pId,
                nom_article_snap: item.nom_article_snap || product.nom,
                quantite: qtePiecesVente,
                prix_vente_unitaire: puVentePieces,
                prix_achat_unitaire_snap: puAchatPiecesSnap,
                montant_achat_total_snap: mtAchatTotalLigneSnap,
                remise_montant: item.remise_montant || 0,
                montant_ht: item.montant_ht || (qtePiecesVente * puVentePieces),
                taxe_montant: item.taxe_montant || 0,
                montant_ttc_ligne: mtTTCLigne,
                stock_avant_vente: stockAvant,
                stock_apres_vente: stockApres,
                user_id: secureUserId,
                company_id: companyStr,
                sync_status: 'synced'
            }], { session });

            await CloudProduct.updateOne(
                { _id: product._id },
                { $set: { stock_actuel: stockApres, updated_at: new Date() } }
            ).session(session);
        }

        if (montantRecu > 0) {
            const paymentId = `PAY-${Date.now().toString().slice(-7)}`;
            await CloudPayment.create([{
                localId: paymentId,
                lot_id: lotId,
                sale_id: saleId,
                customer_id: finalClientId,
                client_name: nomClientFinal,
                montant: montantRecu,
                recu: montantRecu,
                rendu: 0,
                moyen_paiement: modeReglement,
                company_id: companyStr,
                user_id: secureUserId,
                caissier_id: secureUserId,
                statut: 'VALIDEE',
                type_paiement: paymentStatus === 'PARTIEL' ? 'ACOMPTE' : 'COMPTANT',
                sync_status: 'synced'
            }], { session });
        }

        await logAction({
            userId: secureUserId, 
            userName: userName || 'user', 
            actionType: 'CREATE',
            tableConcernee: 'sales',
            referenceId: saleId, 
            description: `Vente POS validée. N° ${saleId} pour ${nomClientFinal}. Total : ${Number(totalVente).toFixed(2)} F.`,
            companyId: companyStr
        });

        await session.commitTransaction();
        session.endSession();

        return { 
            saleId, 
            lotId, 
            totalVente, 
            totalRecu: montantRecu, 
            reste: resteAPayer, 
            clientNameSnapshot: nomClientFinal
        };
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        throw err;
    }
};

const getAllSales = async (companyId) => {
    const companyStr = companyId.toString();
    const items = await CloudSaleItem.find({ company_id: companyStr }).lean();

    const result = [];
    for (const item of items) {
        const sale = await CloudSale.findOne({ 
            $or: [{ localId: item.id_vente }, { _id: mongoose.isValidObjectId(item.id_vente) ? item.id_vente : null }],
            company_id: companyStr,
            statut_vente: { $nin: ['ARCHIVEE', 'ANNULEE'] },
            is_archived: 0,
            is_active: 1
        }).lean();

        if (!sale) continue;

        let unitCoefficient = 1;
        let unitCodeGros = 'CS';
        let unitRefDetail = 'PCS';

        if (item.product_id) {
            const product = await CloudProduct.findOne({ 
                $or: [{ localId: item.product_id }, { _id: mongoose.isValidObjectId(item.product_id) ? item.product_id : null }] 
            }).lean();
            if (product && product.unite_id) {
                const unite = await CloudUnite.findOne({ 
                    $or: [{ localId: product.unite_id }, { _id: mongoose.isValidObjectId(product.unite_id) ? product.unite_id : null }] 
                }).lean();
                if (unite) {
                    unitCoefficient = unite.coefficient || 1;
                    unitCodeGros = unite.code || 'CS';
                    unitRefDetail = unite.unite_reference || 'PCS';
                }
            }
        }

        const qteBruteVentePieces = Math.abs(Number(item.quantite || 0));
        const expressionLogistique = conversestock.formaterStockPourAffichage(
            qteBruteVentePieces,
            unitCoefficient,
            unitCodeGros,
            unitRefDetail
        );

        result.push({
            ...item,
            id: item.localId || item._id.toString(),
            id_vente: sale.localId || sale._id.toString(),
            lot_id: sale.lot_id,
            nom_client_snap: sale.nom_client_snap,
            date_vente: sale.date_vente,
            moyen_paiement: sale.mode_reglement,
            statut_vente: sale.statut_vente,
            qte_vendue: item.quantite,
            qte_vendue_formatee: expressionLogistique
        });
    }

    return result.sort((a, b) => new Date(b.date_vente) - new Date(a.date_vente));
};

const getPerformanceDuJour = async (companyId) => {
    const companyStr = companyId.toString();
    const todayStr = new Date().toISOString().split('T')[0];

    const sales = await CloudSale.find({ 
        company_id: companyStr, 
        is_active: 1,
        date_vente: { 
            $gte: new Date(`${todayStr}T00:00:00.000Z`), 
            $lte: new Date(`${todayStr}T23:59:59.999Z`) 
        } 
    }).lean();

    const lotIds = [...new Set(sales.map(s => s.lot_id))];
    const items = await CloudSaleItem.find({ company_id: companyStr, lot_id: { $in: lotIds }, is_active: 1 }).lean();

    let caBrut = 0;
    let totalNeg = 0;

    for (const item of items) {
        const mt = Number(item.montant_ttc_ligne || 0);
        if (item.type_ligne === 'VENTE') {
            caBrut += mt;
        } else if (item.type_ligne === 'RETOUR' || item.type_ligne === 'ANNULEE') {
            totalNeg += Math.abs(mt);
        }
    }

    return {
        ca_brut: caBrut,
        total_negatifs: totalNeg,
        ca_net: caBrut - totalNeg,
        nombre_ventes: lotIds.length
    };
};

const cancelSale = async (lotId, companyId, userContext, observation) => {
    const companyStr = companyId.toString();
    const activeUserId = (userContext?.userId || userContext?.id || 'SYSTEM').toString();
    const finalObservation = (observation && observation.trim().length > 0) ? observation.trim() : `Annulation Lot ${lotId}`;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const vente = await CloudSale.findOne({ lot_id: lotId, company_id: companyStr, is_active: 1 }).session(session);
        if (!vente) throw new Error("Vente introuvable, déjà annulée ou archivée.");

        if (vente.is_comptabilise === 1 || vente.is_comptabilise === '1' || vente.is_comptabilise === true) {
            throw new Error("Action impossible : cette vente globale est déjà clôturée ou comptabilisée.");
        }

        const items = await CloudSaleItem.find({ id_vente: vente.localId || vente._id.toString(), is_active: 1 }).session(session);

        for (const item of items) {
            const product = await CloudProduct.findOne({ 
                $or: [{ localId: item.product_id }, { _id: mongoose.isValidObjectId(item.product_id) ? item.product_id : null }] 
            }).session(session);

            if (!product) continue;

            const stockAvant = Number(product.stock_actuel || 0);
            const qteAnnuleeVentePieces = Math.abs(Number(item.quantite || 0));
            const stockApres = Math.round(stockAvant + qteAnnuleeVentePieces);

            await CloudProduct.updateOne({ _id: product._id }, { $set: { stock_actuel: stockApres } }).session(session);

            const moveId = `MOV-CAN-${Date.now()}-${item.localId || item._id}`;
            await CloudStockMovement.create([{
                localId: moveId,
                product_id: item.product_id,
                type_mouvement: 'ANNULATION_VENTE',
                reference_id: vente.localId || vente._id.toString(),
                quantite: qteAnnuleeVentePieces,
                stock_avant: stockAvant,
                stock_apres: stockApres,
                prix_operation: item.prix_vente_unitaire,
                cmp_resultat: product.cmp || 0,
                user_id: activeUserId,
                company_id: companyStr,
                sync_status: 'synced'
            }], { session });

            await CloudSaleItem.updateOne(
                { _id: item._id },
                { $set: { is_active: 0, type_ligne: 'ANNULEE', observation: finalObservation } }
            ).session(session);
        }

        await CloudPayment.updateMany(
            { sale_id: vente.localId || vente._id.toString() },
            { $set: { is_active: 0, statut: 'ANNULEE' } }
        ).session(session);

        await CloudSale.updateOne(
            { _id: vente._id },
            { $set: { statut_vente: 'ANNULEE', is_active: 0, observation: finalObservation } }
        ).session(session);

        await session.commitTransaction();
        session.endSession();

        return {
            success: true,
            message: "La vente a été entièrement annulée, les règlements annulés et les stocks réintégrés."
        };
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        throw err;
    }
};

const cancelSaleItem = async (saleItemId, companyId, userContext, observation) => {
    const companyStr = companyId.toString();
    const activeUserId = (userContext?.userId || userContext?.secureUserId || 'SYSTEM').toString();
    const finalObservation = (observation && observation.trim().length > 0) ? observation.trim() : `Correction saisie : Annulation ligne ${saleItemId}`;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const item = await CloudSaleItem.findOne({ 
            $or: [{ localId: saleItemId }, { _id: mongoose.isValidObjectId(saleItemId) ? saleItemId : null }], 
            company_id: companyStr, 
            is_active: 1 
        }).session(session);

        if (!item) throw new Error("Ligne introuvable ou déjà traitée.");
        if (item.is_comptabilise === 1 || item.is_comptabilise === '1') throw new Error("Action impossible : cette ligne d'article est déjà comptabilisée.");

        const vente = await CloudSale.findOne({ 
            $or: [{ localId: item.id_vente }, { _id: mongoose.isValidObjectId(item.id_vente) ? item.id_vente : null }], 
            company_id: companyStr 
        }).session(session);

        if (!vente) throw new Error("Vente parente introuvable.");
        if (vente.is_comptabilise === 1 || vente.is_comptabilise === '1') throw new Error("Action impossible : vente globale déjà clôturée.");

        const product = await CloudProduct.findOne({ 
            $or: [{ localId: item.product_id }, { _id: mongoose.isValidObjectId(item.product_id) ? item.product_id : null }] 
        }).session(session);

        const qteLignePieces = Math.abs(Number(item.quantite || 0));
        let unitCoefficient = 1;
        let unitCodeGros = 'CS';
        let unitRefDetail = 'PCS';

        if (product) {
            const stockAvant = Number(product.stock_actuel || 0);
            const stockApres = Math.round(stockAvant + qteLignePieces);

            await CloudProduct.updateOne({ _id: product._id }, { $set: { stock_actuel: stockApres } }).session(session);

            if (product.unite_id) {
                const unite = await CloudUnite.findOne({ 
                    $or: [{ localId: product.unite_id }, { _id: mongoose.isValidObjectId(product.unite_id) ? product.unite_id : null }] 
                }).session(session).lean();
                if (unite) {
                    unitCoefficient = unite.coefficient || 1;
                    unitCodeGros = unite.code || 'CS';
                    unitRefDetail = unite.unite_reference || 'PCS';
                }
            }

            const moveId = `MOV-CORR-${Date.now()}-${item.localId || item._id}`;
            await CloudStockMovement.create([{
                localId: moveId,
                product_id: item.product_id,
                type_mouvement: 'CORRECTION_SAISIE',
                reference_id: vente.localId || vente._id.toString(),
                quantite: qteLignePieces,
                stock_avant: stockAvant,
                stock_apres: stockApres,
                prix_operation: item.prix_vente_unitaire,
                cmp_resultat: product.cmp || 0,
                user_id: activeUserId,
                company_id: companyStr,
                sync_status: 'synced'
            }], { session });
        }

        await CloudSaleItem.updateOne(
            { _id: item._id },
            { $set: { is_active: 0, type_ligne: 'ANNULEE', observation: finalObservation } }
        ).session(session);

        const activeItems = await CloudSaleItem.find({ id_vente: item.id_vente, is_active: 1 }).session(session);
        const nouveauTotal = activeItems.reduce((sum, it) => sum + Number(it.montant_ttc_ligne || 0), 0);

        await CloudPayment.updateMany(
            { sale_id: item.id_vente },
            { $set: { montant: nouveauTotal, recu: nouveauTotal, rendu: 0 } }
        ).session(session);

        await CloudSale.updateOne(
            { _id: vente._id },
            { $set: { montant_total: nouveauTotal, montant_paye: nouveauTotal, reste_a_payer: 0 } }
        ).session(session);

        await session.commitTransaction();
        session.endSession();

        return {
            success: true,
            qte_mouvementee: qteLignePieces,
            coefficient: unitCoefficient,
            unit_code_gros: unitCodeGros,
            unit_ref_detail: unitRefDetail
        };
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        throw err;
    }
};

const handleReturnSaleItem = async (saleItemId, companyId, userContext) => {
    const companyStr = companyId.toString();
    const activeUserId = (userContext?.userId || userContext?.secureUserId || 'user').toString();

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const item = await CloudSaleItem.findOne({ 
            $or: [{ localId: saleItemId }, { _id: mongoose.isValidObjectId(saleItemId) ? saleItemId : null }], 
            company_id: companyStr 
        }).session(session).lean();

        if (!item) throw new Error("Article introuvable.");
        if (item.is_active === 0 || item.type_ligne === 'RETOUR') throw new Error("Cette ligne a déjà été retournée ou annulée.");

        const vente = await CloudSale.findOne({ 
            $or: [{ localId: item.id_vente }, { _id: mongoose.isValidObjectId(item.id_vente) ? item.id_vente : null }], 
            company_id: companyStr 
        }).session(session).lean();

        if (!vente) throw new Error("Vente parente introuvable.");
        if (item.is_comptabilise === 1 || vente.is_comptabilise === 1) throw new Error("Action impossible sur une vente comptabilisée.");

        const product = await CloudProduct.findOne({ 
            $or: [{ localId: item.product_id }, { _id: mongoose.isValidObjectId(item.product_id) ? item.product_id : null }] 
        }).session(session);

        const qteLignePieces = Math.abs(Number(item.quantite || 0));
        let unitCoefficient = 1;
        let unitCodeGros = 'CS';
        let unitRefDetail = 'PCS';

        if (product) {
            const stockAvant = Number(product.stock_actuel || 0);
            const stockApres = stockAvant + qteLignePieces;

            await CloudProduct.updateOne({ _id: product._id }, { $set: { stock_actuel: stockApres } }).session(session);

            if (product.unite_id) {
                const unite = await CloudUnite.findOne({ 
                    $or: [{ localId: product.unite_id }, { _id: mongoose.isValidObjectId(product.unite_id) ? product.unite_id : null }] 
                }).session(session).lean();
                if (unite) {
                    unitCoefficient = unite.coefficient || 1;
                    unitCodeGros = unite.code || 'CS';
                    unitRefDetail = unite.unite_reference || 'PCS';
                }
            }

            const moveId = `MOV-RET-${Date.now().toString().slice(-6)}`;
            await CloudStockMovement.create([{
                localId: moveId,
                product_id: item.product_id,
                type_mouvement: 'RETOUR_VENTE',
                reference_id: item.id_vente,
                quantite: qteLignePieces,
                stock_avant: stockAvant,
                stock_apres: stockApres,
                prix_operation: item.prix_vente_unitaire,
                cmp_resultat: product.cmp || 0,
                user_id: activeUserId,
                company_id: companyStr,
                sync_status: 'synced'
            }], { session });
        }

        const returnId = `LIT-RET-${Date.now().toString().slice(-6)}`;
        await CloudSaleItem.create([{
            localId: returnId,
            lot_id: item.lot_id,
            id_vente: item.id_vente,
            customer_id: vente.customer_id,
            type_ligne: 'RETOUR',
            product_id: item.product_id,
            nom_article_snap: item.nom_article_snap,
            quantite: qteLignePieces,
            prix_vente_unitaire: item.prix_vente_unitaire,
            remise_montant: item.remise_montant,
            montant_ht: item.montant_ht,
            taxe_montant: item.taxe_montant,
            montant_ttc_ligne: item.montant_ttc_ligne,
            is_active: 1,
            user_id: activeUserId,
            company_id: companyStr,
            sync_status: 'synced'
        }], { session });

        await CloudSaleItem.updateOne(
            { _id: item._id },
            { $set: { is_active: 0 } }
        ).session(session);

        const paymentReturnId = `PAY-RET-${Date.now().toString().slice(-6)}`;
        await CloudPayment.create([{
            localId: paymentReturnId,
            lot_id: item.lot_id,
            sale_id: item.id_vente,
            customer_id: vente.customer_id,
            client_name: vente.nom_client_snap,
            caissier_id: vente.caissier_id,
            montant: item.montant_ttc_ligne,
            moyen_paiement: vente.mode_reglement,
            statut: 'VALIDEE',
            type_paiement: 'REMBOURSEMENT',
            user_id: activeUserId,
            company_id: companyStr,
            sync_status: 'synced'
        }], { session });

        const allItems = await CloudSaleItem.find({ id_vente: item.id_vente }).session(session);
        let totalInitial = 0;
        let totalRetours = 0;
        let countActiveVente = 0;

        for (const it of allItems) {
            if (it.type_ligne === 'VENTE' && it.is_active === 1) {
                totalInitial += Number(it.montant_ttc_ligne || 0);
                countActiveVente++;
            } else if (it.type_ligne === 'RETOUR') {
                totalRetours += Number(it.montant_ttc_ligne || 0);
            }
        }

        const nouveauMontantVente = totalInitial - totalRetours;

        const allPayments = await CloudPayment.find({ sale_id: item.id_vente, is_active: 1, statut: 'VALIDEE' }).session(session);
        let totalEncaisse = 0;
        let totalRembourse = 0;

        for (const pay of allPayments) {
            if (pay.type_paiement !== 'REMBOURSEMENT') {
                totalEncaisse += Number(pay.montant || 0);
            } else {
                totalRembourse += Number(pay.montant || 0);
            }
        }

        const nouveauMontantPaye = totalEncaisse - totalRembourse;
        const nouveauReste = Math.max(0, nouveauMontantVente - nouveauMontantPaye);

        let nouveauStatutPaiement = 'PARTIEL';
        if (nouveauReste <= 0.1) nouveauStatutPaiement = 'SOLDE';
        if (nouveauMontantPaye <= 0) nouveauStatutPaiement = 'NON_PAYE';

        await CloudSale.updateOne(
            { _id: vente._id },
            {
                $set: {
                    montant_total: Math.max(0, nouveauMontantVente),
                    montant_paye: Math.max(0, nouveauMontantPaye),
                    reste_a_payer: nouveauReste,
                    payment_status: nouveauStatutPaiement,
                    statut_vente: countActiveVente === 0 ? 'RETOUR' : vente.statut_vente,
                    updated_at: new Date()
                }
            }
        ).session(session);

        await session.commitTransaction();
        session.endSession();

        return { 
            success: true, 
            saleId: item.id_vente, 
            nouveauReste,
            qte_mouvementee: qteLignePieces,
            coefficient: unitCoefficient,
            unit_code_gros: unitCodeGros,
            unit_ref_detail: unitRefDetail
        };
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        throw err;
    }
};

const getTemporaryCart = async (vendeurId, companyId) => {
    return [];
};

const syncTemporaryCart = async (vendeurId, companyId, lignes) => {
    return true;
};

const deleteTemporaryCart = async (vendeurId, companyId) => {
    return 1;
};

const deleteTemporaryFactureCart = async (vendeurId, companyId) => {
    return 1;
};

const getTemporaryFactureCart = async (vendeurId, companyId) => {
    return [];
};
const syncTemporaryFactureCart = async (vendeurId, companyId, lignes) => {
    return true;
};

const getSaleByLotId = async (lotId, companyId) => {
    const companyStr = companyId.toString();
    const paiement = await CloudPayment.findOne({ lot_id: lotId, company_id: companyStr }).lean();
    if (!paiement) throw new Error("Lot non trouvé.");

    const articles = await CloudSaleItem.find({ lot_id: lotId, company_id: companyStr, is_active: 1 }).lean();

    const articlesHydrates = [];
    for (const item of articles) {
        let unitCoefficient = 1;
        let unitCodeGros = 'CS';
        let unitRefDetail = 'PCS';

        if (item.product_id) {
            const product = await CloudProduct.findOne({ 
                $or: [{ localId: item.product_id }, { _id: mongoose.isValidObjectId(item.product_id) ? item.product_id : null }] 
            }).lean();
            if (product && product.unite_id) {
                const unite = await CloudUnite.findOne({ 
                    $or: [{ localId: product.unite_id }, { _id: mongoose.isValidObjectId(product.unite_id) ? product.unite_id : null }] 
                }).lean();
                if (unite) {
                    unitCoefficient = unite.coefficient || 1;
                    unitCodeGros = unite.code || 'CS';
                    unitRefDetail = unite.unite_reference || 'PCS';
                }
            }
        }

        const qteBrute = Math.abs(Number(item.quantite || 0));
        const expressionFormatee = conversestock.formaterStockPourAffichage(
            qteBrute,
            unitCoefficient,
            unitCodeGros,
            unitRefDetail
        );

        articlesHydrates.push({
            ...item,
            id: item.localId || item._id.toString(),
            qte_vendue_formatee: expressionFormatee,
            quantite_formatee: expressionFormatee
        });
    }

    return { paiement, articles: articlesHydrates };
};

const getSalesForCloture = async (companyId, userId) => {
    const companyStr = companyId.toString();
    const payments = await CloudPayment.find({ 
        company_id: companyStr, 
        $or: [{ caissier_id: userId }, { user_id: userId }],
        is_cloture: 0,
        is_active: 1
    }).lean();

    const grouped = {};
    for (const p of payments) {
        const sale = await CloudSale.findOne({ 
            $or: [{ localId: p.sale_id }, { _id: mongoose.isValidObjectId(p.sale_id) ? p.sale_id : null }] 
        }).lean();

        if (sale && sale.statut_vente === 'ANNULEE') continue;

        const key = p.moyen_paiement || 'AUTRE';
        if (!grouped[key]) grouped[key] = 0;

        const montant = Number(p.montant || 0);
        if (p.type_paiement && p.type_paiement.toUpperCase() === 'REMBOURSEMENT') {
            grouped[key] -= montant;
        } else {
            grouped[key] += montant;
        }
    }

    return Object.keys(grouped).map(mode => ({
        payment_method_id: mode,
        mode_paiement: mode,
        montant_total: grouped[mode]
    }));
};

const getArchivedSales = async (companyId, filters = {}) => {
    const companyStr = companyId.toString();
    const { search, startDate, endDate } = filters;

    const salesQuery = { company_id: companyStr, is_archived: 1 };
    if (startDate && endDate) {
        salesQuery.date_vente = { 
            $gte: new Date(`${startDate}T00:00:00.000Z`), 
            $lte: new Date(`${endDate}T23:59:59.999Z`) 
        };
    }

    const sales = await CloudSale.find(salesQuery).lean();
    const saleIds = sales.map(s => s.localId || s._id.toString());

    const itemsQuery = { company_id: companyStr, id_vente: { $in: saleIds } };
    const items = await CloudSaleItem.find(itemsQuery).lean();

    const result = [];
    for (const item of items) {
        const sale = sales.find(s => (s.localId || s._id.toString()) === item.id_vente);
        if (!sale) continue;

        if (search) {
            const matchSearch = sale.lot_id.includes(search) || 
                                sale.nom_client_snap.includes(search) || 
                                item.nom_article_snap.includes(search);
            if (!matchSearch) continue;
        }

        let unitCoefficient = 1;
        let unitCodeGros = 'CS';
        let unitRefDetail = 'UNITÉ';

        if (item.product_id) {
            const product = await CloudProduct.findOne({ 
                $or: [{ localId: item.product_id }, { _id: mongoose.isValidObjectId(item.product_id) ? item.product_id : null }] 
            }).lean();
            if (product && product.unite_id) {
                const unite = await CloudUnite.findOne({ 
                    $or: [{ localId: product.unite_id }, { _id: mongoose.isValidObjectId(product.unite_id) ? product.unite_id : null }] 
                }).lean();
                if (unite) {
                    unitCoefficient = unite.coefficient || 1;
                    unitCodeGros = unite.code || 'CS';
                    unitRefDetail = unite.unite_reference || 'UNITÉ';
                }
            }
        }

        const qteBruteVentePieces = Math.abs(Number(item.quantite || 0));
        const expressionLogistique = conversestock.formaterStockPourAffichage(
            qteBruteVentePieces,
            unitCoefficient,
            unitCodeGros,
            unitRefDetail
        );

        result.push({
            ...item,
            id: item.localId || item._id.toString(),
            id_vente: sale.localId || sale._id.toString(),
            lot_id: sale.lot_id,
            nom_client_snap: sale.nom_client_snap,
            date_vente: sale.date_vente,
            moyen_paiement: sale.mode_reglement,
            statut_vente: sale.statut_vente,
            qte_vendue: item.quantite,
            qte_vendue_formatee: expressionLogistique
        });
    }

    return result.sort((a, b) => new Date(b.date_vente) - new Date(a.date_vente));
};

const getDeletedSales = async (companyId, filters = {}) => {
    const companyStr = companyId.toString();
    const { search } = filters;

    const sales = await CloudSale.find({ 
        company_id: companyStr, 
        $or: [{ statut_vente: 'ANNULEE' }] 
    }).lean();

    const saleIds = sales.map(s => s.localId || s._id.toString());
    const items = await CloudSaleItem.find({ 
        company_id: companyStr, 
        $or: [{ id_vente: { $in: saleIds } }, { type_ligne: 'RETOUR' }] 
    }).lean();

    const result = [];
    for (const item of items) {
        const sale = sales.find(s => (s.localId || s._id.toString()) === item.id_vente) || await CloudSale.findOne({ 
            $or: [{ localId: item.id_vente }, { _id: mongoose.isValidObjectId(item.id_vente) ? item.id_vente : null }] 
        }).lean();

        if (!sale) continue;

        if (search) {
            const matchSearch = sale.lot_id.includes(search) || sale.nom_client_snap.includes(search);
            if (!matchSearch) continue;
        }

        let unitCoefficient = 1;
        let unitCodeGros = 'CS';
        let unitRefDetail = 'PCS';

        if (item.product_id) {
            const product = await CloudProduct.findOne({ 
                $or: [{ localId: item.product_id }, { _id: mongoose.isValidObjectId(item.product_id) ? item.product_id : null }] 
            }).lean();
            if (product && product.unite_id) {
                const unite = await CloudUnite.findOne({ 
                    $or: [{ localId: product.unite_id }, { _id: mongoose.isValidObjectId(product.unite_id) ? product.unite_id : null }] 
                }).lean();
                if (unite) {
                    unitCoefficient = unite.coefficient || 1;
                    unitCodeGros = unite.code || 'CS';
                    unitRefDetail = unite.unite_reference || 'PCS';
                }
            }
        }

        const qteBruteVentePieces = Math.abs(Number(item.quantite || 0));
        const expressionLogistique = conversestock.formaterStockPourAffichage(
            qteBruteVentePieces,
            unitCoefficient,
            unitCodeGros,
            unitRefDetail
        );

        result.push({
            ...item,
            id: item.localId || item._id.toString(),
            id_vente: sale.localId || sale._id.toString(),
            lot_id: sale.lot_id,
            nom_client_snap: sale.nom_client_snap,
            date_vente: sale.date_vente,
            moyen_paiement: sale.mode_reglement,
            statut_vente: sale.statut_vente,
            qte_vendue: item.quantite,
            qte_vendue_formatee: expressionLogistique
        });
    }

    return result.sort((a, b) => new Date(b.date_vente) - new Date(a.date_vente));
};

const archiveSale = async (lotId, companyId, userContext) => {
    const companyStr = companyId.toString();
    const { secureUserId, userName } = userContext;

    const result = await CloudSale.updateOne(
        { lot_id: lotId, company_id: companyStr },
        { $set: { is_archived: 1 } }
    );

    if (result.matchedCount === 0) throw new Error("Lot introuvable");

    try {
        await logAction({ 
            userId: secureUserId, 
            userName: userName || 'user', 
            actionType: 'ARCHIVAGE', 
            tableConcernee: 'sales', 
            referenceId: lotId, 
            description: `Archivage du lot : ${lotId}`, 
            companyId: companyStr 
        });
    } catch (auditError) {
        console.error("Erreur Audit:", auditError.message);
    }
    return true;
};

const getActiveDebts = async (companyId) => {
    const companyStr = companyId.toString();
    const sales = await CloudSale.find({ 
        company_id: companyStr, 
        statut_vente: { $in: ['VALIDEE', 'RETOUR'] }, 
        is_active: 1 
    }).lean();

    const clientMap = {};

    for (const s of sales) {
        const clientName = s.nom_client_snap || 'CLIENT AU COMPTANT';
        if (!clientMap[clientName]) {
            clientMap[clientName] = {
                client: clientName,
                nombre_factures: 0,
                total_du_global: 0,
                total_encaisse_global: 0,
                detail_factures: []
            };
        }

        const saleIdStr = s.localId || s._id.toString();
        const payments = await CloudPayment.find({ sale_id: saleIdStr, is_active: 1, statut: 'VALIDEE' }).lean();

        let dejaPaye = 0;
        const paiementsDetails = payments.map(p => {
            const montant = Number(p.montant || 0);
            if (p.type_paiement && p.type_paiement.toUpperCase() === 'REMBOURSEMENT') {
                dejaPaye -= montant;
            } else {
                dejaPaye += montant;
            }
            return {
                id: p.localId || p._id.toString(),
                date: p.created_at,
                montant: p.montant,
                moyen_paiement: p.moyen_paiement,
                type_operation: p.type_paiement
            };
        });

        const totalTotal = Number(s.montant_total || 0);
        const resteAPayer = Math.max(0, totalTotal - dejaPaye);

        clientMap[clientName].nombre_factures += 1;
        clientMap[clientName].total_du_global += totalTotal;
        clientMap[clientName].total_encaisse_global += dejaPaye;

        const items = await CloudSaleItem.find({ id_vente: saleIdStr, $or: [{ is_active: 1 }, { type_ligne: 'RETOUR' }] }).lean();
        const articlesFactures = [];

        for (const pi of items) {
            let coeff = 1;
            let codeGros = 'CS';
            let refDetail = 'PCS';

            if (pi.product_id) {
                const prod = await CloudProduct.findOne({ 
                    $or: [{ localId: pi.product_id }, { _id: mongoose.isValidObjectId(pi.product_id) ? pi.product_id : null }] 
                }).lean();
                if (prod && prod.unite_id) {
                    const un = await CloudUnite.findOne({ 
                        $or: [{ localId: prod.unite_id }, { _id: mongoose.isValidObjectId(prod.unite_id) ? prod.unite_id : null }] 
                    }).lean();
                    if (un) {
                        coeff = un.coefficient || 1;
                        codeGros = un.code || 'CS';
                        refDetail = un.unite_reference || 'PCS';
                    }
                }
            }

            articlesFactures.push({
                product_id: pi.product_id,
                nom_article: pi.nom_article_snap,
                qte_pieces: pi.quantite,
                coeff,
                code_gros: codeGros,
                ref_detail: refDetail
            });
        }

        clientMap[clientName].detail_factures.push({
            id: saleIdStr,
            lot_id: s.lot_id,
            date_vente: s.date_vente,
            statut_vente: s.statut_vente,
            montant_total: totalTotal,
            deja_paye: Number(dejaPaye.toFixed(2)),
            reste_a_payer: Number(resteAPayer.toFixed(2)),
            articles_factures: articlesFactures,
            paiements: paiementsDetails
        });
    }

    return Object.values(clientMap).sort((a, b) => a.client.localeCompare(b.client));
};

const payDebt = async (saleId, paymentData) => {
    const { 
        montant, 
        payment_method_id, 
        moyen_paiement,       
        secureUserId, 
        secureCompanyId, 
        type_paiement = 'REGLEMENT' 
    } = paymentData;
    const companyStr = secureCompanyId.toString();

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const vente = await CloudSale.findOne({ 
            $or: [{ localId: saleId }, { _id: mongoose.isValidObjectId(saleId) ? saleId : null }], 
            company_id: companyStr, 
            is_active: 1, 
            statut_vente: { $in: ['VALIDEE', 'RETOUR'] } 
        }).session(session);

        if (!vente) throw new Error("Facture introuvable.");

        const saleIdStr = vente.localId || vente._id.toString();
        const payments = await CloudPayment.find({ sale_id: saleIdStr, is_active: 1, statut: 'VALIDEE' }).session(session);

        let dejaPayeNet = 0;
        for (const p of payments) {
            const m = Number(p.montant || 0);
            if (p.type_paiement && p.type_paiement.toUpperCase() === 'REMBOURSEMENT') {
                dejaPayeNet -= m;
            } else {
                dejaPayeNet += m;
            }
        }

        const totalFacture = parseFloat(vente.montant_total || 0);
        const resteReel = Math.max(0, totalFacture - dejaPayeNet);

        if (resteReel <= 0.01) throw new Error("Cette facture est déjà soldée.");

        const montantAEncaisser = Math.min(parseFloat(montant), resteReel);
        const nouveauMontantPayeEntete = dejaPayeNet + montantAEncaisser;
        const nouveauResteEntete = Math.max(0, Number((totalFacture - nouveauMontantPayeEntete).toFixed(2)));
        const nouveauStatutPaiement = nouveauResteEntete <= 0.1 ? 'SOLDE' : 'PARTIEL';

        const paymentId = `PAY-${Date.now().toString().slice(-8)}`;

        await CloudPayment.create([{
            localId: paymentId,
            lot_id: vente.lot_id,
            sale_id: saleIdStr,
            customer_id: vente.customer_id,
            client_name: vente.nom_client_snap,
            montant: montantAEncaisser,
            payment_method_id,
            moyen_paiement,
            user_id: secureUserId,
            caissier_id: secureUserId,
            company_id: companyStr,
            statut: 'VALIDEE',
            type_paiement,
            sync_status: 'synced'
        }], { session });

        await CloudSale.updateOne(
            { _id: vente._id },
            { 
                $set: { 
                    montant_paye: nouveauMontantPayeEntete, 
                    reste_a_payer: nouveauResteEntete, 
                    payment_status: nouveauStatutPaiement, 
                    updated_at: new Date() 
                } 
            }
        ).session(session);

        await session.commitTransaction();
        session.endSession();

        return { success: true, paymentId, nouveauReste: nouveauResteEntete };
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        throw err;
    }
};

const getClientByFacture = async (id, companyId) => {
    const companyStr = companyId.toString();
    return await CloudSale.findOne({ 
        $or: [{ localId: id }, { _id: mongoose.isValidObjectId(id) ? id : null }], 
        company_id: companyStr 
    }).select('nom_client_snap').lean();
};

const getVraiesFacturesConsignation = async (companyId) => {
    const companyStr = companyId.toString();
    const sales = await CloudSale.find({ company_id: companyStr, statut_vente: 'VALIDEE' }).sort({ date_vente: -1 }).lean();
    return sales.map(s => ({
        id: s.localId || s._id.toString(),
        lot_id: s.lot_id,
        nom_client_snap: s.nom_client_snap
    }));
};

const getSalesDetailsByDate = async (startDate, endDate, companyId) => {
    const companyStr = companyId.toString();
    const [sDay, sMonth, sYear] = startDate.split('/');
    const isoStartDate = new Date(`${sYear}-${sMonth}-${sDay}T00:00:00.000Z`);
    
    const [eDay, eMonth, eYear] = endDate.split('/');
    const isoEndDate = new Date(`${eYear}-${eMonth}-${eDay}T23:59:59.999Z`);

    const sales = await CloudSale.find({ 
        company_id: companyStr, 
        statut_vente: 'VALIDEE',
        date_vente: { $gte: isoStartDate, $lte: isoEndDate }
    }).lean();

    const saleIds = sales.map(s => s.localId || s._id.toString());
    const items = await CloudSaleItem.find({ company_id: companyStr, id_vente: { $in: saleIds }, is_active: 1 }).lean();

    const groupedMap = {};

    for (const item of items) {
        const sale = sales.find(s => (s.localId || s._id.toString()) === item.id_vente);
        if (!sale) continue;

        const key = `${item.product_id}_${item.prix_vente_unitaire}_${item.prix_achat_unitaire_snap}_${sale.customer_id}`;
        if (!groupedMap[key]) {
            let unitCoefficient = 1;
            let unitCodeGros = 'CS';
            let unitRefDetail = 'PCS';
            let uniteLibelle = 'Unité';

            if (item.product_id) {
                const prod = await CloudProduct.findOne({ 
                    $or: [{ localId: item.product_id }, { _id: mongoose.isValidObjectId(item.product_id) ? item.product_id : null }] 
                }).lean();
                if (prod && prod.unite_id) {
                    const un = await CloudUnite.findOne({ 
                        $or: [{ localId: prod.unite_id }, { _id: mongoose.isValidObjectId(prod.unite_id) ? prod.unite_id : null }] 
                    }).lean();
                    if (un) {
                        unitCoefficient = un.coefficient || 1;
                        unitCodeGros = un.code || 'CS';
                        unitRefDetail = un.unite_reference || 'PCS';
                        uniteLibelle = un.libelle || 'Unité';
                    }
                }
            }

            groupedMap[key] = {
                id_article: item.product_id,
                nom_article: item.nom_article_snap,
                quantite: 0,
                prix_achat: item.prix_achat_unitaire_snap,
                total_achat_facture: 0,
                prix_unitaire: item.prix_vente_unitaire,
                total_vente_facture: 0,
                unite_libelle: uniteLibelle,
                unit_coefficient: unitCoefficient,
                unit_code_gros: unitCodeGros,
                unit_ref_detail: unitRefDetail,
                customer_id: sale.customer_id,
                client_nom: sale.nom_client_snap || 'CLIENT AU COMPTANT'
            };
        }

        groupedMap[key].quantite += Number(item.quantite || 0);
        groupedMap[key].total_achat_facture += Number(item.montant_achat_total_snap || 0);
        groupedMap[key].total_vente_facture += Number(item.montant_ttc_ligne || 0);
    }

    return Object.values(groupedMap).sort((a, b) => a.nom_article.localeCompare(b.nom_article));
};

module.exports = { 
    createSale, 
    getAllSales, 
    getTemporaryCart, 
    syncTemporaryCart, 
    getSalesForCloture,
    deleteTemporaryCart, 
    getPerformanceDuJour, 
    getSaleByLotId, 
    cancelSaleItem, 
    handleReturnSaleItem, 
    getSalesDetailsByDate,
    getTemporaryFactureCart, 
    syncTemporaryFactureCart, 
    deleteTemporaryFactureCart, 
    payDebt, 
    getClientByFacture,
    getDeletedSales, 
    getArchivedSales, 
    cancelSale, 
    archiveSale, 
    getActiveDebts, 
    getVraiesFacturesConsignation 
};