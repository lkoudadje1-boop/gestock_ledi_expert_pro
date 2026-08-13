// backend/services/clotureJournalier.service.js
const mongoose = require('mongoose');
const { 
    CloudSale, CloudPurchase, CloudPurchaseMp, CloudInventory,
    CloudPaymentMethod, CloudConfigEcritureAuto, CloudJournal,
    CloudEcriture, CloudLigneEcriture, CloudSyncQueue, CloudExercice,
    CloudPlanComptable, CloudTiers
} = require('../models/cloud.model');

const generateUID = (prefix) => `${prefix}-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`;

/**
 * RÉCUPÉRATION DES DONNÉES EN ATTENTE (Cloud)
 */
exports.getPendingData = async (companyId, startDate, endDate) => {
    const sources = [
        { model: CloudSale, detailField: 'sale_items', dateCol: 'date_vente', labelCol: 'nom_client_snap', name: 'sales' },
        { model: CloudPurchase, detailField: 'purchase_items', dateCol: 'date_achat', labelCol: 'nom_fournisseur_snap', name: 'purchases' },
        { model: CloudPurchaseMp, detailField: 'purchase_items_mp', dateCol: 'date_achat', labelCol: 'nom_fournisseur_snap', name: 'purchases_mp' },
        { model: CloudInventory, detailField: 'inventory_items', dateCol: 'closed_at', labelCol: 'libelle', name: 'inventories' }
    ];

    let ready = [];
    let orphans = [];

    for (const src of sources) {
        let query = { company_id: companyId.toString(), is_comptabilise: { $ne: 1 }, is_active: 1 };
        if (startDate && endDate) {
            query[src.dateCol] = { $gte: new Date(startDate), $lte: new Date(endDate) };
        }

        const docs = await src.model.find(query).lean();

        for (const row of docs) {
            const pm = await CloudPaymentMethod.findOne({ 
                $or: [{ code: row.mode_reglement }, { libelle: row.mode_reglement }], 
                company_id: companyId 
            }).lean();
            
            const modeFinal = pm ? pm.libelle : (row.mode_reglement || '').toUpperCase().trim();
            
            const details = row[src.detailField] || [];
            const typesPresents = [...new Set(details.map(d => d.type_ligne))];
            const typesToProcess = typesPresents.length > 0 ? typesPresents : [src.name === 'sales' ? 'VENTE' : 'ACHAT'];

            for (const currentType of typesToProcess) {
                const finalRow = { ...row, table_source: src.name, type: currentType, mode_reglement: modeFinal };
                
                const hasConfig = await CloudConfigEcritureAuto.findOne({
                    table_source: src.detailField,
                    company_id: companyId,
                    $or: [{ condition_reglement: modeFinal }, { condition_reglement: 'TOUS' }, { condition_reglement: { $exists: false } }],
                    $or: [{ type_operation: currentType }, { type_operation: 'TOUS' }, { type_operation: { $exists: false } }]
                }).lean();

                if (hasConfig) ready.push(finalRow);
                else orphans.push(finalRow);
            }
        }
    }
    return { ready, orphans };
};

/**
 * SIMULATION DES ÉCRITURES (Cloud)
 */
exports.simulerEcrituresSelectionnees = async (items, companyId) => {
    let accumulation = {};

    for (const item of items) {
        const modelMap = { 'sales': CloudSale, 'purchases': CloudPurchase, 'purchases_mp': CloudPurchaseMp, 'inventories': CloudInventory };
        const Model = modelMap[item.table_source];
        const doc = await Model.findOne({ localId: item.localId || item.id, company_id: companyId }).lean();
        
        if (!doc) continue;

        const config = await CloudConfigEcritureAuto.findOne({
            table_source: item.table_source === 'sales' ? 'sale_items' : 'purchase_items',
            company_id: companyId,
            condition_reglement: doc.mode_reglement,
            type_operation: item.type
        }).lean();

        if (!config) continue;

        const schemaLignes = config.lignes || [];
        const dateOp = new Date(doc[item.dateCol] || Date.now()).toISOString().split('T')[0];

        for (const s of schemaLignes) {
            const details = (doc[item.detailField] || []).filter(si => !s.filtre_colonne || String(si[s.filtre_colonne]) === String(s.filtre_valeur));
            const montant = details.reduce((sum, si) => sum + Math.abs(Number(si[s.colonne_source] || 0)), 0);

            if (montant > 0) {
                let numeroCompte = s.numero_compte;
                let intitule = s.intitule;
                let numTiers = null;

                if (s.is_tiers) {
                    const tiers = await CloudTiers.findOne({ reference_id: doc.supplier_id || doc.customer_id, company_id: companyId }).lean();
                    if (tiers) {
                        numTiers = tiers.numero_tiers;
                        intitule = tiers.nom;
                    }
                }

                const key = `${dateOp}-${s.code_journal}-${numeroCompte}-${numTiers || 'SANS'}-${s.sens}`;
                if (!accumulation[key]) {
                    accumulation[key] = { date: dateOp, code_journal: s.code_journal, numero_compte: numeroCompte, num_tiers: numTiers, intitule, libelle: `${item.type} - ${config.libelle_evenement}`, debit: 0, credit: 0 };
                }
                if (s.sens === 'DEBIT') accumulation[key].debit += montant;
                else accumulation[key].credit += montant;
            }
        }
    }
    return Object.values(accumulation);
};

/**
 * VALIDE ET ENREGISTRE LA CENTRALISATION EN BASE (Cloud)
 */
exports.enregistrerCentralisation = async (lignesGroupees, itemsSource, companyId) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const exercice = await CloudExercice.findOne({ company_id: companyId, statut: 'OUVERT' }).session(session);
        
        const groupes = [...new Set(lignesGroupees.map(l => `${l.date}|${l.code_journal}`))];
        for (const key of groupes) {
            const [date, codeJ] = key.split('|');
            const journal = await CloudJournal.findOne({ code: codeJ, company_id: companyId }).session(session);
            
            const pieceNum = (Number(journal.compteur_piece) || 0) + 1;
            const ecrId = generateUID('ECR-CENT');

            await CloudEcriture.create([{
                localId: ecrId, company_id: companyId, journal_id: journal.localId, 
                exercice_id: exercice.localId, date_ecriture: date, piece: pieceNum.toString(),
                libelle: "CENTRALISATION", sync_status: 'synced'
            }], { session });

            const lignes = lignesGroupees.filter(l => l.date === date && l.code_journal === codeJ);
            for (const l of lignes) {
                await CloudLigneEcriture.create([{
                    localId: generateUID('LIG'), company_id: companyId, ecriture_id: ecrId,
                    num_compte: l.numero_compte, num_tiers: l.num_tiers, libelle: l.libelle,
                    debit: l.debit, credit: l.credit, sync_status: 'synced'
                }], { session });
            }
            await CloudJournal.updateOne({ _id: journal._id }, { $set: { compteur_piece: pieceNum } }, { session });
        }

        // Marquer comme comptabilisé
        for (const item of itemsSource) {
            const modelMap = { 'sales': CloudSale, 'purchases': CloudPurchase };
            await modelMap[item.table_source].updateOne({ localId: item.localId }, { $set: { is_comptabilise: 1 } }, { session });
        }

        await session.commitTransaction();
        session.endSession();
        return { success: true };
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        throw err;
    }
};