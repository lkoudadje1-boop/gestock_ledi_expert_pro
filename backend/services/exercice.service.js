// backend/services/exercice.service.js
const mongoose = require('mongoose');
const { 
    CloudExercice, CloudEcriture, CloudLigneEcriture, 
    CloudBrouillonLigne, CloudReportANouveau, CloudAuditLog 
} = require('../models/cloud.model');
const { logAction } = require('../utils/auditHelper');

/**
 * UTILITAIRE : Valide que la durée de l'exercice est cohérente (max 12 mois)
 */
const validerPeriodeComptable = (libelle, date_debut, date_fin) => {
    const debut = new Date(date_debut);
    const fin = new Date(date_fin);

    if (isNaN(debut.getTime()) || isNaN(fin.getTime())) {
        throw new Error("Les dates fournies sont invalides.");
    }

    if (fin <= debut) {
        throw new Error(`Pour l'exercice ${libelle}, la date de fin doit être postérieure à la date de début.`);
    }

    const diffMois = (fin.getFullYear() - debut.getFullYear()) * 12 + (fin.getMonth() - debut.getMonth());
    if (diffMois >= 12) {
        throw new Error(`Incohérence sur ${libelle} : La durée d'un exercice ne peut pas dépasser 12 mois.`);
    }
};

/**
 * Récupère la liste des exercices
 */
exports.getAll = async (companyId) => {
    return await CloudExercice.find({ company_id: companyId.toString() }).sort({ date_debut: -1 }).lean();
};

/**
 * Logique de création d'un exercice
 */
exports.create = async (data, user) => {
    const { libelle, date_debut, date_fin, genererRAN } = data;
    const { companyId, userId, userName } = user;

    validerPeriodeComptable(libelle, date_debut, date_fin);

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const dernierEx = await CloudExercice.findOne({ company_id: companyId.toString() })
            .sort({ date_debut: -1 })
            .session(session);

        if (dernierEx && dernierEx.statut === 'OUVERT') {
            throw new Error(`L'exercice ${dernierEx.libelle} doit être au moins en clôture provisoire.`);
        }

        const id = `EX-${Date.now()}`;
        await CloudExercice.create([{
            localId: id,
            company_id: companyId.toString(),
            libelle: libelle.toUpperCase(),
            date_debut: new Date(date_debut),
            date_fin: new Date(date_fin),
            statut: 'OUVERT',
            sync_status: 'synced'
        }], { session });

        await logAction({
            userId, userName,
            actionType: 'INSERTION',
            tableConcernee: 'exercices',
            referenceId: id,
            description: `Ouverture exercice ${libelle} (RAN: ${genererRAN ? 'OUI' : 'NON'})`,
            companyId: companyId.toString()
        });

        await session.commitTransaction();
        session.endSession();
        return id;
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        throw err;
    }
};

/**
 * Mise à jour du statut
 */
exports.updateStatus = async (id, statut, user) => {
    const { companyId, userName, userId } = user;
    const dateCloture = statut === 'CLOTURE' ? new Date() : null;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const updateQuery = {
            $set: {
                statut: statut,
                updated_at: new Date(),
                sync_status: 'synced'
            }
        };
        if (dateCloture) {
            updateQuery.$set.date_cloture = dateCloture;
            updateQuery.$set.user_cloture = userName;
        }

        const result = await CloudExercice.updateOne(
            { $or: [{ localId: id }, { _id: mongoose.isValidObjectId(id) ? id : null }], company_id: companyId.toString() },
            updateQuery
        ).session(session);

        if (result.matchedCount === 0) throw new Error("Exercice introuvable.");

        let descAudit = statut === 'PRE_CLOTURE' ? `Clôture provisoire de l'exercice` 
                        : statut === 'CLOTURE' ? `Clôture DÉFINITIVE de l'exercice` 
                        : `Réouverture de l'exercice`;

        await logAction({
            userId, userName,
            actionType: 'MODIFICATION',
            tableConcernee: 'exercices',
            referenceId: id,
            description: descAudit,
            companyId: companyId.toString()
        });

        await session.commitTransaction();
        session.endSession();
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        throw err;
    }
};

/**
 * Modification sécurisée
 */
exports.update = async (id, data, companyId) => {
    const { libelle, date_debut, date_fin } = data;
    validerPeriodeComptable(libelle, date_debut, date_fin);

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const ex = await CloudExercice.findOne({ $or: [{ localId: id }, { _id: mongoose.isValidObjectId(id) ? id : null }], company_id: companyId.toString() }).session(session);
        if (!ex) throw new Error("Exercice introuvable.");

        const aDeLActivite = await CloudEcriture.exists({ exercice_id: ex.localId, company_id: companyId.toString() }) ||
                            await CloudLigneEcriture.exists({ exercice_id: ex.localId, company_id: companyId.toString() }) ||
                            await CloudBrouillonLigne.exists({ exercice_id: ex.localId, company_id: companyId.toString() });

        if (aDeLActivite) {
            if (new Date(date_debut).getTime() !== new Date(ex.date_debut).getTime() || 
                new Date(date_fin).getTime() !== new Date(ex.date_fin).getTime()) {
                throw new Error(`🔒 Verrouillé : Cet exercice contient déjà des écritures. Modification des dates impossible.`);
            }
            await CloudExercice.updateOne({ _id: ex._id }, { $set: { libelle: libelle.toUpperCase(), updated_at: new Date() } }).session(session);
        } else {
            await CloudExercice.updateOne({ _id: ex._id }, { 
                $set: { 
                    libelle: libelle.toUpperCase(), 
                    date_debut: new Date(date_debut), 
                    date_fin: new Date(date_fin), 
                    updated_at: new Date() 
                } 
            }).session(session);
        }

        await session.commitTransaction();
        session.endSession();
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        throw err;
    }
};

/**
 * Suppression
 */
exports.remove = async (id, companyId) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const ex = await CloudExercice.findOne({ $or: [{ localId: id }, { _id: mongoose.isValidObjectId(id) ? id : null }], company_id: companyId.toString() }).session(session);
        if (!ex) throw new Error("Exercice introuvable.");

        const aDeLActivite = await CloudEcriture.exists({ exercice_id: ex.localId }) || 
                             await CloudLigneEcriture.exists({ exercice_id: ex.localId });

        if (aDeLActivite) {
            throw new Error(`🔒 Suppression impossible : des enregistrements sont rattachés à cet exercice.`);
        }

        await CloudReportANouveau.deleteMany({ exercice_id: ex.localId }).session(session);
        await CloudExercice.deleteOne({ _id: ex._id }).session(session);

        await session.commitTransaction();
        session.endSession();
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        throw err;
    }
};