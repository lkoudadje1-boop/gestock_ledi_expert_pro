// backend/services/Brouillard.saisie.service.js
const mongoose = require('mongoose');

// --- CONFIGURATION MODÈLES CLOUD ---
const cloudSchema = new mongoose.Schema({}, { strict: false });
const CloudBrouillardLigneTreso = mongoose.models.CloudBrouillardLigneTreso || mongoose.model('CloudBrouillardLigneTreso', cloudSchema, 'brouillard_lignes_treso');
const CloudBrouillardTreso = mongoose.models.CloudBrouillardTreso || mongoose.model('CloudBrouillardTreso', cloudSchema, 'brouillards_treso');
const CloudJournal = mongoose.models.CloudJournal || mongoose.model('CloudJournal', cloudSchema, 'journaux');
const CloudExercice = mongoose.models.CloudExercice || mongoose.model('CloudExercice', cloudSchema, 'exercices');
const CloudBrouillardAffectation = mongoose.models.CloudBrouillardAffectation || mongoose.model('CloudBrouillardAffectation', cloudSchema, 'brouillard_affectations');
const CloudPlanComptable = mongoose.models.CloudPlanComptable || mongoose.model('CloudPlanComptable', cloudSchema, 'plan_comptable');
const CloudBrouillonEcriture = mongoose.models.CloudBrouillonEcriture || mongoose.model('CloudBrouillonEcriture', cloudSchema, 'brouillon_ecritures');
const CloudBrouillonLigne = mongoose.models.CloudBrouillonLigne || mongoose.model('CloudBrouillonLigne', cloudSchema, 'brouillon_lignes');
const CloudBrouillonLigneAnalytique = mongoose.models.CloudBrouillonLigneAnalytique || mongoose.model('CloudBrouillonLigneAnalytique', cloudSchema, 'brouillon_lignes_analytiques');
const CloudEcriture = mongoose.models.CloudEcriture || mongoose.model('CloudEcriture', cloudSchema, 'ecritures');
const CloudLigneEcriture = mongoose.models.CloudLigneEcriture || mongoose.model('CloudLigneEcriture', cloudSchema, 'lignes_ecritures');
const CloudLigneAnalytique = mongoose.models.CloudLigneAnalytique || mongoose.model('CloudLigneAnalytique', cloudSchema, 'lignes_analytiques');
const CloudAuditLog = mongoose.models.CloudAuditLog || mongoose.model('CloudAuditLog', cloudSchema, 'audit_log');

class BrouillardSaisieService {
    // 1. Créer une nouvelle opération
    async creerOperation({ companyId, userId, body }) {
        const { brouillard_id, date_mouvement, libelle, piece_ref, type_flux, montant } = body;
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const affectation = await CloudBrouillardAffectation.findOne({
                brouillard_id: brouillard_id,
                user_id: userId,
                company_id: companyId
            }).session(session).lean();

            if (!affectation || affectation.peut_saisir !== 1) {
                throw new Error("Accès refusé : Vous n'avez pas le droit de saisie sur ce brouillard.");
            }

            const exercice = await CloudExercice.findOne({ company_id: companyId, statut: 'OUVERT' }).session(session).lean();
            if (!exercice) throw new Error("Aucun exercice comptable OUVERT trouvé.");

            const brouillard = await CloudBrouillardTreso.findOne({ localId: brouillard_id, company_id: companyId }).session(session).lean()
                || await CloudBrouillardTreso.findOne({ _id: mongoose.isValidObjectId(brouillard_id) ? brouillard_id : null }).session(session).lean();

            if (!brouillard) throw new Error("Brouillard de trésorerie introuvable.");

            const journal = await CloudJournal.findOne({ localId: brouillard.journal_id, company_id: companyId }).session(session).lean()
                || await CloudJournal.findOne({ _id: mongoose.isValidObjectId(brouillard.journal_id) ? brouillard.journal_id : null }).session(session).lean();

            if (!journal) throw new Error("Journal associé introuvable.");

            const montantNum = parseFloat(montant) || 0;

            const lignesValides = await CloudBrouillardLigneTreso.find({
                brouillard_id: brouillard_id,
                company_id: companyId,
                statut: 'VALIDE',
                $or: [{ v1_statut: { $exists: false } }, { v1_statut: null }, { v1_statut: { $ne: 9 } }]
            }).session(session).lean();

            let sumReel = 0;
            lignesValides.forEach(l => {
                sumReel += (l.type_flux === 'ENCAISSEMENT' ? Number(l.montant || 0) : -Number(l.montant || 0));
            });

            const soldeReel = (Number(brouillard.solde_initial) || 0) + sumReel;

            let statutInitial = 'VALIDE';
            if (type_flux === 'DECAISSEMENT') {
                if (brouillard.mode_fonctionnement === 'DEMANDE') {
                    statutInitial = 'EN_ATTENTE';
                } else if (montantNum > soldeReel) {
                    throw new Error(`Solde insuffisant (${soldeReel} F). Sortie de ${montantNum} impossible.`);
                }
            }

            const compteurPiece = Number(journal.compteur_piece || 1);
            const longueurCompteur = Number(journal.longueur_compteur || 4);
            const sequence = String(compteurPiece).padStart(longueurCompteur, '0');
            const pieceChrono = `${journal.prefixe_piece || journal.code}-${sequence}`;
            
            // Mise à jour du compteur journal
            await CloudJournal.updateOne(
                { _id: journal._id },
                { $inc: { compteur_piece: 1 }, $set: { sync_status: 'synced', updated_at: new Date() } },
                { session }
            );

            const id = `OPTR-${Date.now()}`;
            await CloudBrouillardLigneTreso.create([{
                localId: id,
                id: id,
                company_id: companyId,
                brouillard_id: brouillard_id,
                journal_id: brouillard.journal_id,
                exercice_id: exercice.localId || exercice._id.toString(),
                user_id: userId,
                date_mouvement: date_mouvement,
                libelle: libelle ? libelle.toUpperCase() : '',
                piece_ref: piece_ref || null,
                piece_comptable: pieceChrono,
                type_flux: type_flux,
                montant: montantNum,
                statut: statutInitial,
                v1_statut: 0,
                v2_statut: 0,
                v3_statut: 0,
                v4_statut: 0,
                sync_status: 'synced'
            }], { session });

            // ─── AUDIT DE CRÉATION ───────────────────────────────────────────
            await CloudAuditLog.create([{
                localId: `LOG-${Date.now()}`,
                user_id: userId,
                user_name: "user",
                action_type: 'CREATION',
                table_concernee: 'brouillard_lignes_treso',
                reference_id: id,
                description: `Création opération de trésorerie (${type_flux}) - Pièce ${pieceChrono} - Montant : ${montantNum} F - Statut : ${statutInitial}`,
                company_id: companyId,
                sync_status: 'synced'
            }], { session });

            await session.commitTransaction();
            session.endSession();
            return { id, pieceChrono, statutInitial };
        } catch (err) {
            await session.abortTransaction();
            session.endSession();
            throw err;
        }
    }

    // 2. Modifier une opération
    async modifierOperation(id, { libelle, piece_ref, montant, userId, companyId }) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const op = await CloudBrouillardLigneTreso.findOne({ $or: [{ localId: id }, { id: id }], company_id: companyId }).session(session).lean();
            if (!op) throw new Error("Opération introuvable.");

            if (!['BROUILLON', 'EN_ATTENTE'].includes(op.statut)) {
                throw new Error("Modification interdite : opération déjà validée.");
            }

            const nouveauMontant = parseFloat(montant) || 0;

            await CloudBrouillardLigneTreso.updateOne(
                { _id: op._id },
                { 
                    $set: { 
                        libelle: libelle ? libelle.toUpperCase() : '', 
                        piece_ref: piece_ref, 
                        montant: nouveauMontant, 
                        sync_status: 'synced', 
                        updated_at: new Date() 
                    } 
                },
                { session }
            );
            
            // ─── AUDIT DE MODIFICATION ───────────────────────────────────────
            await CloudAuditLog.create([{
                localId: `LOG-${Date.now()}`,
                user_id: userId,
                user_name: "user",
                action_type: 'MODIFICATION',
                table_concernee: 'brouillard_lignes_treso',
                reference_id: id,
                description: `Modification opé. ${op.piece_comptable}. Ancien montant: ${op.montant} F -> Nouveau: ${nouveauMontant} F`,
                company_id: companyId,
                sync_status: 'synced'
            }], { session });

            await session.commitTransaction();
            session.endSession();
            return { success: true };
        } catch (err) {
            await session.abortTransaction();
            session.endSession();
            throw err;
        }
    }

    // 3. Supprimer / Annuler
    async supprimerOperation(id, motif, userId, companyId) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const op = await CloudBrouillardLigneTreso.findOne({ $or: [{ localId: id }, { id: id }], company_id: companyId }).session(session).lean();
            if (!op) throw new Error("Opération introuvable.");

            if (op.comptabilise === 1) {
                throw new Error("Action impossible : Cette opération a déjà été ventilée en comptabilité.");
            }

            const affectation = await CloudBrouillardAffectation.findOne({
                brouillard_id: op.brouillard_id,
                user_id: userId,
                company_id: companyId
            }).session(session).lean();

            if (!affectation || affectation.peut_saisir !== 1) {
                throw new Error("Accès refusé : Vous n'avez pas le droit de modifier ce brouillard.");
            }

            const brouillard = await CloudBrouillardTreso.findOne({ localId: op.brouillard_id, company_id: companyId }).session(session).lean()
                || await CloudBrouillardTreso.findOne({ _id: mongoose.isValidObjectId(op.brouillard_id) ? op.brouillard_id : null }).session(session).lean();

            if (['BROUILLON', 'EN_ATTENTE', 'APPROUVE'].includes(op.statut)) {
                if (op.id?.includes('ANNUL') || op.localId?.includes('ANNUL')) {
                    await CloudBrouillardLigneTreso.updateMany(
                        { piece_comptable: op.piece_comptable, company_id: companyId, v1_statut: 9 },
                        { $set: { v1_statut: null, sync_status: 'synced' } },
                        { session }
                    );
                }
                
                await CloudBrouillardLigneTreso.deleteOne({ _id: op._id }).session(session);

                // ─── AUDIT DE SUPPRESSION PHYSIQUE ───────────────────────────
                await CloudAuditLog.create([{
                    localId: `LOG-${Date.now()}`,
                    user_id: userId,
                    user_name: "user",
                    action_type: 'SUPPRESSION',
                    table_concernee: 'brouillard_lignes_treso',
                    reference_id: id,
                    description: `Suppression définitive de la ligne d'opération en statut ${op.statut} (Pièce: ${op.piece_comptable})`,
                    company_id: companyId,
                    sync_status: 'synced'
                }], { session });

                await session.commitTransaction();
                session.endSession();
                return { deleted: true };
            }

            if (op.statut === 'VALIDE') {
                if (!motif) throw new Error("Le motif d'annulation est obligatoire.");

                const idAnnul = `OPTR-ANNUL-${Date.now()}`;
                const fluxInverse = op.type_flux === 'ENCAISSEMENT' ? 'DECAISSEMENT' : 'ENCAISSEMENT';
                const aBesoinDeValidation = brouillard && brouillard.seuil_validation > 0 && brouillard.niv1_user_id !== null && brouillard.niv1_user_id !== undefined;
                const statutAnnulation = aBesoinDeValidation ? 'EN_ATTENTE' : 'VALIDE';

                await CloudBrouillardLigneTreso.create([{
                    localId: idAnnul,
                    id: idAnnul,
                    company_id: companyId,
                    brouillard_id: op.brouillard_id,
                    journal_id: op.journal_id,
                    exercice_id: op.exercice_id,
                    user_id: userId,
                    date_mouvement: op.date_mouvement,
                    libelle: `ANNULATION PIECE ${op.piece_comptable}`.toUpperCase(),
                    piece_ref: op.piece_ref,
                    piece_comptable: op.piece_comptable,
                    type_flux: fluxInverse,
                    montant: op.montant,
                    statut: statutAnnulation,
                    motif_annulation: motif.toUpperCase(),
                    v1_statut: 0,
                    v2_statut: 0,
                    v3_statut: 0,
                    v4_statut: 0,
                    sync_status: 'synced'
                }], { session });

                await CloudBrouillardLigneTreso.updateOne(
                    { _id: op._id },
                    { $set: { v1_statut: 9, sync_status: 'synced' } },
                    { session }
                );

                // ─── AUDIT DE GÉNÉRATION D'ANNULATION ────────────────────────
                await CloudAuditLog.create([{
                    localId: `LOG-${Date.now()}`,
                    user_id: userId,
                    user_name: "user",
                    action_type: 'ANNULATION',
                    table_concernee: 'brouillard_lignes_treso',
                    reference_id: idAnnul,
                    description: `Demande d'annulation pour la pièce ${op.piece_comptable}. Motif : ${motif.toUpperCase()}. Statut généré : ${statutAnnulation}`,
                    company_id: companyId,
                    sync_status: 'synced'
                }], { session });

                await session.commitTransaction();
                session.endSession();
                return { 
                    cancelled: true, 
                    message: aBesoinDeValidation ? "Demande d'annulation créée (en attente)." : "Opération annulée immédiatement." 
                };
            }

            await session.commitTransaction();
            session.endSession();
            return { success: true };
        } catch (err) {
            await session.abortTransaction();
            session.endSession();
            throw err;
        }
    }

    // 4. Liste + Soldes
    async getOperationsBrouillard(brouillardId, companyId) {
        const rows = await CloudBrouillardLigneTreso.aggregate([
            { $match: { brouillard_id: brouillardId.toString(), company_id: companyId.toString() } },
            {
                $lookup: {
                    from: 'utilisateurs du cloud',
                    localField: 'user_id',
                    foreignField: 'localId',
                    as: 'auteurObj'
                }
            },
            { $unwind: { path: '$auteurObj', preserveNullAndEmptyArrays: true } },
            {
                $addFields: {
                    auteur: '$auteurObj.username'
                }
            },
            { $sort: { createdAt: -1, date_mouvement: -1 } },
            { $limit: 100 }
        ]);

        const brouillard = await CloudBrouillardTreso.findOne({ localId: brouillardId, company_id: companyId }).lean()
            || await CloudBrouillardTreso.findOne({ _id: mongoose.isValidObjectId(brouillardId) ? brouillardId : null }).lean();

        const allLignes = await CloudBrouillardLigneTreso.find({ brouillard_id: brouillardId.toString(), company_id: companyId.toString() }).lean();

        let totalFlux = 0;
        let totalProvisoire = 0;

        allLignes.forEach(l => {
            const mnt = Number(l.montant || 0);
            const fluxVal = l.type_flux === 'ENCAISSEMENT' ? mnt : -mnt;
            if (l.statut === 'VALIDE') {
                totalFlux += fluxVal;
            }
            if (['VALIDE', 'EN_ATTENTE', 'APPROUVE'].includes(l.statut)) {
                totalProvisoire += fluxVal;
            }
        });

        const soldeInitial = brouillard ? (Number(brouillard.solde_initial) || 0) : 0;

        return {
            operations: rows,
            solde_reel: soldeInitial + totalFlux,
            solde_provisoire: soldeInitial + totalProvisoire
        };
    }

    // 5. Liste Centre Validation
    async getOperationsAValider(companyId) {
        const rows = await CloudBrouillardLigneTreso.aggregate([
            { $match: { company_id: companyId.toString(), statut: { $in: ['EN_ATTENTE', 'APPROUVE', 'VALIDE', 'REJETE'] } } },
            {
                $lookup: {
                    from: 'utilisateurs du cloud',
                    localField: 'user_id',
                    foreignField: 'localId',
                    as: 'userObj'
                }
            },
            { $unwind: { path: '$userObj', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'brouillards_treso',
                    localField: 'brouillard_id',
                    foreignField: 'localId',
                    as: 'brouillardObj'
                }
            },
            { $unwind: { path: '$brouillardObj', preserveNullAndEmptyArrays: true } },
            {
                $addFields: {
                    username: '$userObj.username',
                    brouillard_libelle: '$brouillardObj.libelle',
                    brouillard_type: '$brouillardObj.type',
                    solde_initial: '$brouillardObj.solde_initial',
                    seuil_validation: '$brouillardObj.seuil_validation',
                    niv1_user_id: '$brouillardObj.niv1_user_id'
                }
            },
            {
                $match: {
                    $expr: {
                        $or: [
                            { $not: { $regexMatch: { input: '$id', regex: '^OPTR-ANNUL-' } } },
                            {
                                $and: [
                                    { $gt: [{ $ifNull: ['$seuil_validation', 0] }, 0] },
                                    { $ne: ['$niv1_user_id', null] }
                                ]
                            }
                        ]
                    }
                }
            },
            { $sort: { createdAt: -1 } },
            { $limit: 200 }
        ]);

        return rows;
    }

    // 6. Décider (APPROUVER/REJETER)
    async deciderOperation(id, action, userId, companyId) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const op = await CloudBrouillardLigneTreso.findOne({ $or: [{ localId: id }, { id: id }], company_id: companyId }).session(session).lean();
            if (!op) throw new Error("Opération introuvable.");

            const brouillard = await CloudBrouillardTreso.findOne({ localId: op.brouillard_id, company_id: companyId }).session(session).lean()
                || await CloudBrouillardTreso.findOne({ _id: mongoose.isValidObjectId(op.brouillard_id) ? op.brouillard_id : null }).session(session).lean();

            const affectation = await CloudBrouillardAffectation.findOne({
                brouillard_id: op.brouillard_id,
                user_id: userId,
                company_id: companyId
            }).session(session).lean();

            if (!affectation || affectation.peut_valider !== 1) throw new Error("Accès refusé : Droits de validation insuffisants.");
            if (op.statut === 'VALIDE') throw new Error("Déjà validée.");

            if (action === 'REJETER') {
                await CloudBrouillardLigneTreso.updateOne(
                    { _id: op._id },
                    { $set: { statut: 'REJETE', sync_status: 'synced', updated_at: new Date() } },
                    { session }
                );

                if (op.id?.includes('ANNUL') || op.localId?.includes('ANNUL')) {
                    await CloudBrouillardLigneTreso.updateMany(
                        { piece_comptable: op.piece_comptable, company_id: companyId, v1_statut: 9 },
                        { $set: { v1_statut: null, sync_status: 'synced' } },
                        { session }
                    );
                }

                // ─── AUDIT DE REJET ──────────────────────────────────────────
                await CloudAuditLog.create([{
                    localId: `LOG-${Date.now()}`,
                    user_id: userId,
                    user_name: "user",
                    action_type: 'VALIDATION_REJET',
                    table_concernee: 'brouillard_lignes_treso',
                    reference_id: id,
                    description: `Rejet de l'opération (Pièce: ${op.piece_comptable}, Montant: ${op.montant} F)`,
                    company_id: companyId,
                    sync_status: 'synced'
                }], { session });

                await session.commitTransaction();
                session.endSession();
                return { success: true };
            }

            let visaColumn = null;
            if (brouillard) {
                if (userId === brouillard.niv1_user_id) visaColumn = 'v1';
                else if (userId === brouillard.niv2_user_id) visaColumn = 'v2';
                else if (userId === brouillard.niv3_user_id) visaColumn = 'v3';
                else if (userId === brouillard.niv4_user_id) visaColumn = 'v4';
            }

            if (!visaColumn) throw new Error("Vous n'êtes pas dans le circuit de signature.");
            if (op[`${visaColumn}_statut`] === 1) throw new Error("Déjà signé.");

            const updateVisa = {
                [`${visaColumn}_statut`]: 1,
                [`${visaColumn}_date`]: new Date(),
                [`${visaColumn}_user_id`]: userId,
                sync_status: 'synced',
                updated_at: new Date()
            };

            await CloudBrouillardLigneTreso.updateOne({ _id: op._id }, { $set: updateVisa }, { session });

            const updatedOp = await CloudBrouillardLigneTreso.findById(op._id).session(session).lean();
            const totalVisas = (updatedOp.v1_statut || 0) + (updatedOp.v2_statut || 0) + (updatedOp.v3_statut || 0) + (updatedOp.v4_statut || 0);
            const seuil = brouillard ? (Number(brouillard.seuil_validation) || 1) : 1;

            const nouveauStatut = totalVisas >= seuil ? 'VALIDE' : 'APPROUVE';
            await CloudBrouillardLigneTreso.updateOne(
                { _id: op._id },
                { $set: { statut: nouveauStatut, updated_at: new Date() } },
                { session }
            );

            // ─── AUDIT D'APPROBATION / VISA ──────────────────────────────────
            await CloudAuditLog.create([{
                localId: `LOG-${Date.now()}`,
                user_id: userId,
                user_name: "user",
                action_type: 'VALIDATION_APPROBATION',
                table_concernee: 'brouillard_lignes_treso',
                reference_id: id,
                description: `Signature niveau (${visaColumn.toUpperCase()}) appliquée sur la pièce ${op.piece_comptable}. Statut actuel passe à : ${nouveauStatut}`,
                company_id: companyId,
                sync_status: 'synced'
            }], { session });

            await session.commitTransaction();
            session.endSession();
            return { success: true };
        } catch (err) {
            await session.abortTransaction();
            session.endSession();
            throw err;
        }
    }

    // 7. Ventilation (Analytique et Comptable)
    async getDepensesAVentiler(companyId) {
        const rows = await CloudBrouillardLigneTreso.aggregate([
            {
                $match: {
                    company_id: companyId.toString(),
                    statut: 'VALIDE',
                    type_flux: 'DECAISSEMENT',
                    comptabilise: { $ne: 1 },
                    $or: [{ v1_statut: { $exists: false } }, { v1_statut: null }, { v1_statut: { $ne: 9 } }],
                    id: { $not: /^OPTR-ANNUL-/ }
                }
            },
            {
                $lookup: {
                    from: 'brouillards_treso',
                    localField: 'brouillard_id',
                    foreignField: 'localId',
                    as: 'brouillardObj'
                }
            },
            { $unwind: { path: '$brouillardObj', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'journaux',
                    localField: 'journal_id',
                    foreignField: 'localId',
                    as: 'journalObj'
                }
            },
            { $unwind: { path: '$journalObj', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'utilisateurs du cloud',
                    localField: 'user_id',
                    foreignField: 'localId',
                    as: 'userObj'
                }
            },
            { $unwind: { path: '$userObj', preserveNullAndEmptyArrays: true } },
            {
                $addFields: {
                    brouillard_libelle: '$brouillardObj.libelle',
                    compte_treso_id: '$journalObj.compte_treso_id',
                    auteur: '$userObj.username'
                }
            },
            { $sort: { date_mouvement: -1 } }
        ]);
        return rows;
    }

    async ventilerOperation({ operation_id, lignes, companyId, userId }) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const userName = 'utilisateurs_systeme';
            const totalVentile = lignes.reduce((sum, l) => sum + parseFloat(l.montant || 0), 0);
            
            const opCheck = await CloudBrouillardLigneTreso.findOne({ $or: [{ localId: operation_id }, { id: operation_id }], company_id: companyId }).session(session).lean();
            if (!opCheck) throw new Error("Opération introuvable.");

            if (opCheck.v1_statut === 9) throw new Error("Ventilation impossible : Une demande d'annulation est en cours.");
            if (Math.abs(totalVentile - Number(opCheck.montant || 0)) > 0.01) throw new Error("Déséquilibre montant.");

            const op = await CloudBrouillardLigneTreso.findOne({ $or: [{ localId: operation_id }, { id: operation_id }], company_id: companyId }).session(session).lean();
            if (!op || op.comptabilise === 1) throw new Error("Déjà comptabilisée.");

            const brouillard = await CloudBrouillardTreso.findOne({ localId: op.brouillard_id, company_id: companyId }).session(session).lean()
                || await CloudBrouillardTreso.findOne({ _id: mongoose.isValidObjectId(op.brouillard_id) ? op.brouillard_id : null }).session(session).lean();

            const journal = await CloudJournal.findOne({ localId: op.journal_id, company_id: companyId }).session(session).lean()
                || await CloudJournal.findOne({ _id: mongoose.isValidObjectId(op.journal_id) ? op.journal_id : null }).session(session).lean();

            const sourceId = journal?.compte_treso_id || journal?.compte_contrepartie_id;
            const compteCaisse = await CloudPlanComptable.findOne({ localId: sourceId, company_id: companyId }).session(session).lean()
                || await CloudPlanComptable.findOne({ _id: mongoose.isValidObjectId(sourceId) ? sourceId : null }).session(session).lean();

            const dateRef = Date.now();
            const pieceRef = op.piece_comptable || `T-${dateRef.toString().slice(-6)}`;
            const pieceProvisoire = `BR-${pieceRef}`;
            const modeEcriture = brouillard?.mode_ecriture || 'BROUILLON';

            if (modeEcriture === 'BROUILLON') {
                await CloudBrouillonLigne.deleteMany({ piece_provisoire: pieceProvisoire, company_id: companyId }).session(session);
                await CloudBrouillonEcriture.deleteMany({ piece_provisoire: pieceProvisoire, company_id: companyId }).session(session);

                const brId = `BR-ECR-${dateRef}`;
                await CloudBrouillonEcriture.create([{
                    localId: brId,
                    id: brId,
                    company_id: companyId,
                    journal_id: op.journal_id,
                    exercice_id: op.exercice_id,
                    date_ecriture: op.date_mouvement,
                    piece_provisoire: pieceProvisoire,
                    libelle: op.libelle,
                    user_saisie: userName,
                    statut: 'EN_ATTENTE',
                    sync_status: 'synced'
                }], { session });

                // Ligne Trésorerie (Crédit)
                const ligTrId = `BRLIG-${dateRef}-C`;
                await CloudBrouillonLigne.create([{
                    localId: ligTrId,
                    id: ligTrId,
                    company_id: companyId,
                    brouillon_id: brId,
                    journal_id: op.journal_id,
                    exercice_id: op.exercice_id,
                    date_ecriture: op.date_mouvement,
                    piece_provisoire: pieceProvisoire,
                    compte_id: sourceId,
                    num_compte: compteCaisse?.numero_compte || '',
                    num_tiers: null,
                    libelle: op.libelle,
                    debit: 0,
                    credit: op.montant,
                    statut: 'EN_ATTENTE',
                    sync_status: 'synced'
                }], { session });

                for (let idx = 0; idx < lignes.length; idx++) {
                    const l = lignes[idx];
                    const ligId = `BRLIG-${dateRef}-D${idx}`;
                    const cpteInfo = await CloudPlanComptable.findOne({ localId: l.compte_id, company_id: companyId }).session(session).lean()
                        || await CloudPlanComptable.findOne({ _id: mongoose.isValidObjectId(l.compte_id) ? l.compte_id : null }).session(session).lean();

                    await CloudBrouillonLigne.create([{
                        localId: ligId,
                        id: ligId,
                        company_id: companyId,
                        brouillon_id: brId,
                        journal_id: op.journal_id,
                        exercice_id: op.exercice_id,
                        date_ecriture: op.date_mouvement,
                        piece_provisoire: pieceProvisoire,
                        compte_id: l.compte_id,
                        num_compte: cpteInfo?.numero_compte || '',
                        num_tiers: l.num_tiers || null,
                        libelle: op.libelle,
                        debit: l.montant,
                        credit: 0,
                        statut: 'EN_ATTENTE',
                        sync_status: 'synced'
                    }], { session });

                    if (l.is_analytique && l.repartitions) {
                        for (let rIdx = 0; rIdx < l.repartitions.length; rIdx++) {
                            const rep = l.repartitions[rIdx];
                            const anaId = `BRANA-${dateRef}-${idx}-${rIdx}`;
                            await CloudBrouillonLigneAnalytique.create([{
                                localId: anaId,
                                id: anaId,
                                company_id: companyId,
                                ligne_brouillon_id: ligId,
                                plan_analytique_id: rep.plan_analytique_id,
                                departement_id: rep.dept_id || rep.departement_id,
                                num_compte: cpteInfo?.numero_compte || '',
                                montant: rep.montant,
                                sync_status: 'synced'
                            }], { session });
                        }
                    }
                }

                await CloudBrouillardLigneTreso.updateOne(
                    { _id: op._id },
                    { $set: { comptabilise: 1, brouillon_ecriture_id: brId, sync_status: 'synced', updated_at: new Date() } },
                    { session }
                );
            } else {
                // Écriture directe Grand Livre
                const ecrId = `ECR-${dateRef}`;
                await CloudEcriture.create([{
                    localId: ecrId,
                    id: ecrId,
                    company_id: companyId,
                    journal_id: op.journal_id,
                    exercice_id: op.exercice_id,
                    date_ecriture: op.date_mouvement,
                    piece: pieceRef,
                    libelle: op.libelle,
                    user_saisie: userName,
                    sync_status: 'synced'
                }], { session });

                const ligTrId = `LIG-${dateRef}-C`;
                await CloudLigneEcriture.create([{
                    localId: ligTrId,
                    id: ligTrId,
                    company_id: companyId,
                    ecriture_id: ecrId,
                    journal_id: op.journal_id,
                    exercice_id: op.exercice_id,
                    date_ecriture: op.date_mouvement,
                    piece: pieceRef,
                    compte_id: sourceId,
                    num_compte: compteCaisse?.numero_compte || '',
                    num_tiers: null,
                    libelle: op.libelle,
                    debit: 0,
                    credit: op.montant,
                    sync_status: 'synced'
                }], { session });

                for (let idx = 0; idx < lignes.length; idx++) {
                    const l = lignes[idx];
                    const ligId = `LIG-${dateRef}-D${idx}`;
                    const cpteInfo = await CloudPlanComptable.findOne({ localId: l.compte_id, company_id: companyId }).session(session).lean()
                        || await CloudPlanComptable.findOne({ _id: mongoose.isValidObjectId(l.compte_id) ? l.compte_id : null }).session(session).lean();

                    await CloudLigneEcriture.create([{
                        localId: ligId,
                        id: ligId,
                        company_id: companyId,
                        ecriture_id: ecrId,
                        journal_id: op.journal_id,
                        exercice_id: op.exercice_id,
                        date_ecriture: op.date_mouvement,
                        piece: pieceRef,
                        compte_id: l.compte_id,
                        num_compte: cpteInfo?.numero_compte || '',
                        num_tiers: l.num_tiers || null,
                        libelle: op.libelle,
                        debit: l.montant,
                        credit: 0,
                        sync_status: 'synced'
                    }], { session });

                    if (l.is_analytique && l.repartitions) {
                        for (let rIdx = 0; rIdx < l.repartitions.length; rIdx++) {
                            const rep = l.repartitions[rIdx];
                            const anaId = `ANA-${dateRef}-${idx}-${rIdx}`;
                            await CloudLigneAnalytique.create([{
                                localId: anaId,
                                id: anaId,
                                company_id: companyId,
                                ligne_ecriture_id: ligId,
                                plan_analytique_id: rep.plan_analytique_id,
                                departement_id: rep.dept_id || rep.departement_id,
                                num_compte: cpteInfo?.numero_compte || '',
                                montant: rep.montant,
                                sync_status: 'synced'
                            }], { session });
                        }
                        await CloudLigneEcriture.updateOne({ _id: ligId }, { $set: { is_ventilated: 1 } }, { session });
                    }
                }

                await CloudBrouillardLigneTreso.updateOne(
                    { _id: op._id },
                    { $set: { comptabilise: 1, ecriture_id: ecrId, sync_status: 'synced', updated_at: new Date() } },
                    { session }
                );
            }

            // ─── AUDIT DE VENTILATION ────────────────────────────────────────
            await CloudAuditLog.create([{
                localId: `LOG-${Date.now()}`,
                user_id: userId,
                user_name: "user",
                action_type: 'VENTILATION',
                table_concernee: 'brouillard_lignes_treso',
                reference_id: operation_id,
                description: `Ventilation de la pièce ${op.piece_comptable} en comptabilité (Mode: ${modeEcriture}). Éclatée en ${lignes.length} imputation(s) de charges.`,
                company_id: companyId,
                sync_status: 'synced'
            }], { session });

            await session.commitTransaction();
            session.endSession();
            return { success: true };
        } catch (err) {
            await session.abortTransaction();
            session.endSession();
            throw err;
        }
    }
}

module.exports = new BrouillardSaisieService();