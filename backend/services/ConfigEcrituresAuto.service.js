// backend/services/ConfigEcrituresAuto.service.js
const mongoose = require('mongoose');
const { 
    CloudSale, CloudPurchase, CloudPurchaseMp, CloudInventory,
    CloudPaymentMethod, CloudConfigEcritureAuto, CloudJournal,
    CloudEcriture, CloudBrouillonEcriture, CloudExercice,
    CloudPlanComptable, CloudTiers, CloudSaleItem, CloudPurchaseItem,
    CloudPurchaseItemMp, CloudInventoryItem 
} = require('../models/cloud.model');

const genererIdLocal = (prefix) => {
    return `${prefix}-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`;
};

/**
 * GÉNÉRATEUR D'ÉCRITURES UNIVERSEL (VERSION CLOUD MONGODB / MONGOOSE)
 */
exports.genererEcritureExplicite = async (tableName, recordId, companyId) => {
    const modelMap = {
        'sales': CloudSale,
        'purchases': CloudPurchase,
        'purchases_mp': CloudPurchaseMp,
        'inventories': CloudInventory
    };

    const Model = modelMap[tableName];
    if (!Model) return null;

    const header = await Model.findOne({ localId: recordId, company_id: companyId.toString() }).lean();
    if (!header) return null;

    const referencePiece = header.lot_id || header.localId || header._id;

    // 2. Anti-doublon (Vérifie les écritures réelles et les brouillons)
    const dejaPresent = await CloudEcriture.findOne({ reference: referencePiece, company_id: companyId.toString() }).lean() ||
                        await CloudBrouillonEcriture.findOne({ reference: referencePiece, company_id: companyId.toString() }).lean();

    if (dejaPresent) {
        await Model.updateOne({ localId: recordId }, { $set: { is_comptabilise: 1 } });
        return dejaPresent.localId || dejaPresent._id;
    }

    // 3. Mapping des détails
    let detailField = tableName;
    if (tableName === 'sales') detailField = 'sale_items';
    else if (tableName === 'purchases') detailField = 'purchase_items';
    else if (tableName === 'purchases_mp') detailField = 'purchase_items_mp';
    else if (tableName === 'inventories') detailField = 'inventory_items';

    const allItems = header[detailField] || [];
    const itemsToProcess = allItems.length > 0 ? allItems : [header];

    // 4. Harmonisation du mode de règlement
    const pm = await CloudPaymentMethod.findOne({
        $or: [{ code: header.mode_reglement }, { libelle: header.mode_reglement }],
        company_id: companyId.toString()
    }).lean();

    const modeHarmonise = pm ? pm.libelle : (header.mode_reglement || '').toUpperCase().trim();

    // 5. Récupération de la configuration ACTIVE
    const config = await CloudConfigEcritureAuto.findOne({
        table_source: detailField,
        company_id: companyId.toString(),
        $or: [
            { condition_reglement: { $regex: new RegExp(`^${modeHarmonise}$`, 'i') } },
            { condition_reglement: 'TOUS' },
            { condition_reglement: '' },
            { condition_reglement: { $exists: false } }
        ],
        $or: [
            { type_operation: { $regex: new RegExp(`^${header.type_ligne || 'VENTE'}$`, 'i') } },
            { type_operation: 'TOUS' },
            { type_operation: { $exists: false } }
        ]
    }).sort({ condition_reglement: -1 }).lean();

    if (!config) return null;

    const exercice = await CloudExercice.findOne({ company_id: companyId.toString(), statut: 'OUVERT' }).lean();
    if (!exercice) throw new Error("Aucun exercice ouvert trouvé.");

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        let lastEcrId = null;
        const dateAction = new Date(header.date_vente || header.date_achat || header.closed_at || Date.now()).toISOString().split('T')[0];

        const schemaLignes = config.lignes || [];
        const isBrouillon = config.mode_ecriture === 'BROUILLON';

        // Groupement par journal
        const lignesParJournal = schemaLignes.reduce((acc, curr) => {
            if (!acc[curr.journal_id]) acc[curr.journal_id] = [];
            acc[curr.journal_id].push(curr);
            return acc;
        }, {});

        for (const jId in lignesParJournal) {
            const journal = await CloudJournal.findOne({ localId: jId, company_id: companyId.toString() }).session(session);
            if (!journal) continue;

            const colCompteur = isBrouillon ? 'compteur_brouillon' : 'compteur_piece';
            const prochainNumero = (journal[colCompteur] || 1);
            const ecrId = genererIdLocal(isBrouillon ? 'BR' : 'ECR');
            lastEcrId = ecrId;

            // --- INSERTION ENTÊTE ---
            if (isBrouillon) {
                await CloudBrouillonEcriture.create([{
                    localId: ecrId,
                    company_id: companyId.toString(),
                    journal_id: jId,
                    exercice_id: exercice.localId,
                    date_ecriture: dateAction,
                    piece_provisoire: prochainNumero.toString(),
                    reference: referencePiece,
                    libelle: config.libelle_evenement,
                    user_saisie: 'SYSTEM',
                    statut: 'EN_ATTENTE',
                    sync_status: 'synced'
                }], { session });
            } else {
                await CloudEcriture.create([{
                    localId: ecrId,
                    company_id: companyId.toString(),
                    journal_id: jId,
                    exercice_id: exercice.localId,
                    date_ecriture: dateAction,
                    piece: prochainNumero.toString(),
                    reference: referencePiece,
                    libelle: config.libelle_evenement,
                    user_saisie: 'SYSTEM',
                    sync_status: 'synced'
                }], { session });
            }

            // --- INSERTION LIGNES ---
            for (const s of lignesParJournal[jId]) {
                const filtered = itemsToProcess.filter(it => !s.filtre_colonne || String(it[s.filtre_colonne]) === String(s.filtre_valeur));
                const montant = Math.round(filtered.reduce((sum, it) => sum + Math.abs(Number(it[s.colonne_source] || 0)), 0) * 100) / 100;

                if (montant <= 0) continue;

                let finalCompteId = s.compte_id;
                let numTiers = null;

                if (s.is_tiers === 1) {
                    const refTiers = header.supplier_id || header.customer_id;
                    const t = await CloudTiers.findOne({ reference_id: refTiers, company_id: companyId.toString() }).lean();
                    if (t) {
                        numTiers = t.numero_tiers;
                        finalCompteId = t.compte_collectif_id;
                    }
                }

                const cpt = await CloudPlanComptable.findOne({ localId: finalCompteId, company_id: companyId.toString() }).lean();
                const numCpt = cpt?.numero_compte;

                const lignePayload = {
                    localId: genererIdLocal('LIG'),
                    company_id: companyId.toString(),
                    journal_id: jId,
                    exercice_id: exercice.localId,
                    date_ecriture: dateAction,
                    reference: referencePiece,
                    compte_id: finalCompteId,
                    num_compte: numCpt,
                    num_tiers: numTiers,
                    libelle: s.label_ligne || config.libelle_evenement,
                    debit: s.sens === 'DEBIT' ? montant : 0,
                    credit: s.sens === 'CREDIT' ? montant : 0,
                    sync_status: 'synced'
                };

                if (isBrouillon) {
                    lignePayload.brouillon_id = ecrId;
                    lignePayload.piece_provisoire = prochainNumero.toString();
                    lignePayload.statut = 'EN_ATTENTE';
                    // Insertion via modèle brouillon lignes si nécessaire, sinon adapté
                } else {
                    lignePayload.ecriture_id = ecrId;
                    lignePayload.piece = prochainNumero.toString();
                }
            }

            await CloudJournal.updateOne({ _id: journal._id }, { $inc: { [colCompteur]: 1 } }).session(session);
        }

        await Model.updateOne({ localId: recordId }, { $set: { is_comptabilise: 1 } }).session(session);

        await session.commitTransaction();
        session.endSession();
        return lastEcrId;
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        throw err;
    }
};

/**
 * Simule les écritures avec regroupement (Cloud)
 */
exports.simulerEcrituresSelectionnees = async (items, companyId) => {
    let accumulation = {};
    const modelMap = {
        'sales': CloudSale,
        'purchases': CloudPurchase,
        'purchases_mp': CloudPurchaseMp,
        'inventories': CloudInventory
    };

    for (const item of items) {
        const Model = modelMap[item.table_source];
        if (!Model) continue;

        const header = await Model.findOne({ localId: item.localId || item.id, company_id: companyId.toString() }).lean();
        if (!header) continue;

        let detailField = item.table_source;
        if (item.table_source === 'sales') detailField = 'sale_items';
        else if (item.table_source === 'purchases') detailField = 'purchase_items';
        else if (item.table_source === 'purchases_mp') detailField = 'purchase_items_mp';
        else if (item.table_source === 'inventories') detailField = 'inventory_items';

        const allDetails = header[detailField] || [];
        const mode = (header.mode_reglement || '').toUpperCase().trim();

        const config = await CloudConfigEcritureAuto.findOne({
            table_source: detailField,
            company_id: companyId.toString(),
            $or: [{ condition_reglement: mode }, { condition_reglement: '' }, { condition_reglement: { $exists: false } }, { condition_reglement: 'TOUS' }]
        }).sort({ condition_reglement: -1 }).lean();

        if (!config) continue;

        const schemaLignes = config.lignes || [];
        const dateOp = new Date(header.date_vente || header.date_achat || header.closed_at || Date.now()).toISOString().split('T')[0];

        for (const s of schemaLignes) {
            const subItems = allDetails.filter(si => !s.filtre_colonne || String(si[s.filtre_colonne]) === String(s.filtre_valeur));
            const montant = subItems.reduce((sum, si) => sum + Math.abs(Number(si[s.colonne_source] || 0)), 0);

            if (montant > 0) {
                let finalCompteId = s.compte_id;
                let numTiers = null;

                if (s.is_tiers === 1) {
                    const refTiers = header.supplier_id || header.customer_id;
                    const t = await CloudTiers.findOne({ reference_id: refTiers, company_id: companyId.toString() }).lean();
                    if (t) {
                        numTiers = t.numero_tiers;
                        finalCompteId = t.compte_collectif_id;
                    }
                }

                const cpt = await CloudPlanComptable.findOne({ localId: finalCompteId, company_id: companyId.toString() }).lean();
                const numeroCompte = cpt?.numero_compte || 'INCONNU';

                const key = `${dateOp}-${s.code_journal || 'OD'}-${numeroCompte}-${numTiers || 'SANS'}-${s.sens}`;

                if (!accumulation[key]) {
                    accumulation[key] = {
                        date: dateOp,
                        code_journal: s.code_journal || 'OD',
                        numero_compte: numeroCompte,
                        num_tiers: numTiers,
                        libelle: s.is_tiers === 1 ? `TIERS: ${numTiers}` : `CENTRALISATION ${config.libelle_evenement}`,
                        debit: 0,
                        credit: 0
                    };
                }

                if (s.sens === 'DEBIT') accumulation[key].debit += montant;
                else accumulation[key].credit += montant;
            }
        }
    }

    return Object.values(accumulation).map(l => ({
        ...l,
        debit: Math.round(l.debit * 100) / 100,
        credit: Math.round(l.credit * 100) / 100
    })).sort((a, b) => a.date.localeCompare(b.date));
};

exports.listByTable = async (table, companyId) => {
    return await CloudConfigEcritureAuto.find({ table_source: table, company_id: companyId.toString() }).lean();
};

exports.deleteConfig = async (id, companyId) => {
    await CloudConfigEcritureAuto.deleteOne({ localId: id, company_id: companyId.toString() });
};

exports.getTableColumns = async (tableName) => {
    const modelMapping = {
        'sales': CloudSaleItem,
        'purchases': CloudPurchaseItem,
        'purchases_mp': CloudPurchaseItemMp,
        'inventories': CloudInventoryItem
    };

    const targetModel = modelMapping[tableName] || CloudSaleItem;
    const sample = await targetModel.findOne().lean();
    if (!sample) return ['montant_total', 'montant_ttc_ligne'];

    return Object.keys(sample).filter(name => ![
        '_id', '__v', 'id', 'company_id', 'user_id', 'sync_status',
        'created_at', 'updated_at', 'is_active', 'is_archived',
        'lot_id', 'matiere_id', 'supplier_id'
    ].includes(name));
};

exports.saveSchemaDynamique = async (data, companyId) => {
    const cId = typeof companyId === 'object' ? companyId.companyId : companyId;
    const typeOp = data.type_operation || data.code_flux || 'VENTE';
    const codeEvt = data.code_evenement || 'EVT_AUTO';

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        let config = await CloudConfigEcritureAuto.findOne({
            code_evenement: codeEvt,
            company_id: cId.toString(),
            type_operation: typeOp,
            condition_reglement: data.condition_reglement || ''
        }).session(session);

        let configId;

        if (config) {
            configId = config.localId;
            await CloudConfigEcritureAuto.updateOne(
                { _id: config._id },
                {
                    $set: {
                        libelle_evenement: data.libelle_evenement,
                        table_source: data.table_source,
                        mode_ecriture: data.mode_ecriture || 'BROUILLON',
                        lignes: data.lignes || [],
                        updated_at: new Date()
                    }
                }
            ).session(session);
        } else {
            configId = genererIdLocal('CFG');
            await CloudConfigEcritureAuto.create([{
                localId: configId,
                company_id: cId.toString(),
                code_evenement: codeEvt,
                type_operation: typeOp,
                condition_reglement: data.condition_reglement || '',
                libelle_evenement: data.libelle_evenement,
                table_source: data.table_source,
                mode_ecriture: data.mode_ecriture || 'BROUILLON',
                lignes: data.lignes || [],
                sync_status: 'synced'
            }], { session });
        }

        await session.commitTransaction();
        session.endSession();
        return { success: true, id: configId };
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        throw err;
    }
};