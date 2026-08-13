// backend/services/CodeJournal.service.js
const mongoose = require('mongoose');
const { CloudJournal, CloudEcriture, CloudExercice, CloudPlanComptable, CloudAuditLog } = require('../models/cloud.model');
const { logAction } = require('../utils/auditHelper');

/**
 * Récupère la liste des journaux avec une agrégation pour vérifier les écritures
 */
exports.findAllJournaux = async (companyId) => {
    // Pipeline d'agrégation pour remplacer la jointure et le count SQL
    return await CloudJournal.aggregate([
        { $match: { company_id: companyId.toString() } },
        {
            $lookup: {
                from: 'plan_comptable',
                localField: 'compte_contrepartie_id',
                foreignField: 'localId',
                as: 'compte'
            }
        },
        { $unwind: { path: '$compte', preserveNullAndEmptyArrays: true } },
        {
            $lookup: {
                from: 'ecritures',
                localField: 'localId',
                foreignField: 'journal_id',
                as: 'ecritures'
            }
        },
        {
            $project: {
                _id: 1,
                localId: 1,
                code: 1,
                libelle: 1,
                type_journal: 1,
                mode_numerotation: 1,
                compte_numero: '$compte.numero_compte',
                compte_libelle: '$compte.intitule',
                has_entries: { $gt: [{ $size: '$ecritures' }, 0] }
            }
        },
        { $sort: { type_journal: 1, code: 1 } }
    ]);
};

/**
 * Logique de création d'un journal (Cloud)
 */
exports.createJournal = async (data, user) => {
    const { code, libelle, type_journal, mode_numerotation, compte_contrepartie_id, contrepartie_auto } = data;
    const { companyId, userId, userName } = user;
    const codePropre = code.toUpperCase().trim();

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const exerciceOuvert = await CloudExercice.findOne({ company_id: companyId.toString(), statut: 'OUVERT' }).session(session);
        if (!exerciceOuvert) throw new Error("Aucun exercice OUVERT. Action impossible.");

        const existe = await CloudJournal.findOne({ company_id: companyId.toString(), code: codePropre }).session(session);
        if (existe) throw new Error(`Le code journal "${codePropre}" existe déjà.`);

        const journalId = `JR-${Date.now()}`;
        
        await CloudJournal.create([{
            localId: journalId,
            company_id: companyId.toString(),
            code: codePropre,
            libelle: libelle.toUpperCase(),
            type_journal,
            mode_numerotation: mode_numerotation || 'AUTO',
            compte_contrepartie_id: compte_contrepartie_id || null,
            contrepartie_auto: contrepartie_auto || 0,
            sync_status: 'synced'
        }], { session });

        await logAction({
            userId, userName, actionType: 'INSERTION', tableConcernee: 'journaux',
            referenceId: journalId, description: `Création journal : ${codePropre}`, companyId
        });

        await session.commitTransaction();
        session.endSession();
        return journalId;
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        throw err;
    }
};

/**
 * Logique de modification sécurisée
 */
exports.updateJournal = async (id, data, user) => {
    const { libelle, mode_numerotation, compte_contrepartie_id, contrepartie_auto } = data;
    const { companyId } = user;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const journal = await CloudJournal.findOne({ $or: [{ localId: id }, { _id: mongoose.isValidObjectId(id) ? id : null }], company_id: companyId.toString() }).session(session);
        if (!journal) throw new Error("Journal introuvable.");

        const hasEntries = await CloudEcriture.exists({ journal_id: journal.localId || journal._id.toString() }).session(session);

        const updateData = hasEntries 
            ? { libelle: libelle.toUpperCase(), mode_numerotation, sync_status: 'synced', updated_at: new Date() }
            : { libelle: libelle.toUpperCase(), mode_numerotation, compte_contrepartie_id: compte_contrepartie_id || null, contrepartie_auto: contrepartie_auto || 0, sync_status: 'synced', updated_at: new Date() };

        await CloudJournal.updateOne({ _id: journal._id }, { $set: updateData }).session(session);

        await session.commitTransaction();
        session.endSession();
        return hasEntries;
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        throw err;
    }
};

/**
 * Logique de suppression
 */
exports.deleteJournal = async (id, companyId) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const journal = await CloudJournal.findOne({ $or: [{ localId: id }, { _id: mongoose.isValidObjectId(id) ? id : null }], company_id: companyId.toString() }).session(session);
        if (!journal) throw new Error("Journal introuvable.");

        const hasEntries = await CloudEcriture.exists({ journal_id: journal.localId || journal._id.toString() }).session(session);
        if (hasEntries) throw new Error("🔒 Impossible : ce journal contient des écritures comptables.");

        await CloudJournal.deleteOne({ _id: journal._id }).session(session);
        
        await session.commitTransaction();
        session.endSession();
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        throw err;
    }
};

/**
 * Importation massive
 */
exports.importJournauxBatch = async (journaux, user) => {
    const { companyId, userId, userName } = user;
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        for (const j of journaux) {
            await CloudJournal.updateOne(
                { code: j.code, company_id: companyId.toString() },
                { 
                    $set: { 
                        libelle: j.libelle.toUpperCase(), 
                        type_journal: j.type, 
                        sync_status: 'synced', 
                        updated_at: new Date() 
                    } 
                },
                { upsert: true, session }
            );
        }

        await logAction({
            userId, userName, actionType: 'IMPORTATION', tableConcernee: 'journaux',
            description: `Importation massive de ${journaux.length} journaux`, companyId
        });

        await session.commitTransaction();
        session.endSession();
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        throw err;
    }
};