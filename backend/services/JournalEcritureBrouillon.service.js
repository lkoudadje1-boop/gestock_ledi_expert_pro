// backend/services/JournalEcritureBrouillon.service.js
const mongoose = require('mongoose');
const { 
    CloudBrouillonEcriture, CloudBrouillonLigne, CloudJournal, 
    CloudPlanComptable, CloudExercice, CloudEcriture, 
    CloudLigneEcriture, CloudBrouillonLigneAnalytique, 
    CloudLigneAnalytique, CloudBrouillardLignesTreso, CloudAuditLog 
} = require('../models/cloud.model');
const { logAction } = require('../utils/auditHelper');

class JournalEcritureBrouillonService {
    // 1. Créer une écriture groupée
    async creerEcritureBrouillon({ companyId, userId, userName = 'user', body }) {
        const { journal_id, exercice_id, date_ecriture, libelle_general, piece_manuelle, lignes } = body;
        const companyStr = companyId.toString();

        const totalDebit = lignes.reduce((sum, l) => sum + parseFloat(l.debit || 0), 0);
        const totalCredit = lignes.reduce((sum, l) => sum + parseFloat(l.credit || 0), 0);

        if (Math.abs(totalDebit - totalCredit) > 0.001) {
            throw new Error("L'écriture brouillon n'est pas équilibrée.");
        }

        const journal = await CloudJournal.findOne({ 
            $or: [{ localId: journal_id }, { _id: mongoose.isValidObjectId(journal_id) ? journal_id : null }], 
            company_id: companyStr 
        }).lean();
        if (!journal) throw new Error("Journal introuvable.");

        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            let numeroPiece = piece_manuelle;
            if (journal.mode_numerotation === 'AUTO') {
                const compteur = journal.compteur_brouillon || 1;
                const sequence = compteur.toString().padStart(journal.longueur_compteur || 1, '0');
                numeroPiece = `BR-${sequence}`;
                
                await CloudJournal.updateOne(
                    { _id: journal._id },
                    { $inc: { compteur_brouillon: 1 } }
                ).session(session);
            }

            const ecritureId = `BR-ECR-${Date.now()}`;
            const dateObj = new Date(date_ecriture);

            await CloudBrouillonEcriture.create([{
                localId: ecritureId,
                company_id: companyStr,
                journal_id,
                exercice_id,
                date_ecriture: dateObj,
                piece_provisoire: numeroPiece.toString(),
                libelle: libelle_general.toUpperCase(),
                user_saisie: userName,
                statut: 'EN_ATTENTE',
                sync_status: 'synced'
            }], { session });

            for (let index = 0; index < lignes.length; index++) {
                const lig = lignes[index];
                const ligneId = `BRLIG-${Date.now()}-${index}`;

                const compte = await CloudPlanComptable.findOne({ 
                    $or: [{ localId: lig.compte_id }, { _id: mongoose.isValidObjectId(lig.compte_id) ? lig.compte_id : null }] 
                }).lean();

                await CloudBrouillonLigne.create([{
                    localId: ligneId,
                    company_id: companyStr,
                    brouillon_id: ecritureId,
                    journal_id,
                    exercice_id,
                    date_ecriture: dateObj,
                    piece_provisoire: numeroPiece.toString(),
                    facture: lig.facture || '',
                    reference: lig.reference || '',
                    compte_id: lig.compte_id,
                    num_compte: compte?.numero_compte || '',
                    libelle: lig.libelle.toUpperCase(),
                    debit: lig.debit || 0,
                    credit: lig.credit || 0,
                    statut: 'EN_ATTENTE',
                    sync_status: 'synced'
                }], { session });
            }

            await session.commitTransaction();
            session.endSession();
            return { id: ecritureId };
        } catch (err) {
            await session.abortTransaction();
            session.endSession();
            throw err;
        }
    }

    // 2. Saisie individuelle (Kilométrique)
    async enregistrerLigneBrouillonIndividuelle({ companyId, userName = 'user', body }) {
        const { id, journal_id, exercice_id, date_ecriture, date_echeance, piece, facture, reference, num_compte, num_tiers, libelle, debit, credit, compte_id } = body;
        const companyStr = companyId.toString();

        const journal = await CloudJournal.findOne({ 
            $or: [{ localId: journal_id }, { _id: mongoose.isValidObjectId(journal_id) ? journal_id : null }], 
            company_id: companyStr 
        }).lean();
        if (!journal) throw new Error("Journal introuvable");

        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            let pieceDeTravail = piece ? piece.toString() : '';
            const dateObj = new Date(date_ecriture);

            if (!id && journal.mode_numerotation === 'AUTO' && !piece) {
                const inachevee = await CloudBrouillonLigne.aggregate([
                    { $match: { journal_id: journal_id, exercice_id: exercice_id, company_id: companyStr } },
                    { $group: { _id: '$piece_provisoire', solde: { $sum: { $subtract: ['$debit', '$credit'] } } } },
                    { $match: { solde: { $ne: 0 } } },
                    { $limit: 1 }
                ]).session(session);

                if (inachevee && inachevee.length > 0) {
                    pieceDeTravail = inachevee[0]._id.toString();
                } else {
                    const compteur = journal.compteur_brouillon || 1;
                    pieceDeTravail = `BR-${compteur.toString().padStart(4, '0')}`;
                }
            }

            let entete = await CloudBrouillonEcriture.findOne({ 
                piece_provisoire: pieceDeTravail, 
                journal_id, 
                company_id: companyStr 
            }).session(session);

            let ecriture_id;
            const finalLibelle = libelle ? libelle.toUpperCase() : '';

            if (!entete) {
                ecriture_id = `BR-ECR-${Date.now()}`;
                await CloudBrouillonEcriture.create([{
                    localId: ecriture_id,
                    company_id: companyStr,
                    journal_id,
                    exercice_id,
                    date_ecriture: dateObj,
                    piece_provisoire: pieceDeTravail,
                    libelle: finalLibelle,
                    user_saisie: userName,
                    statut: 'EN_ATTENTE',
                    sync_status: 'synced'
                }], { session });
            } else {
                ecriture_id = entete.localId || entete._id.toString();
            }

            const ligneId = id || `BRLIG-${Date.now()}`;
            const finalEcheance = date_echeance ? new Date(date_echeance) : null;
            let aEteIncremente = false;

            if (id) {
                await CloudBrouillonLigne.updateOne(
                    { localId: id, company_id: companyStr },
                    {
                        $set: {
                            piece_provisoire: pieceDeTravail,
                            facture: facture || '',
                            reference: reference || '',
                            num_compte,
                            num_tiers: num_tiers || null,
                            libelle: finalLibelle,
                            debit: parseFloat(debit || 0),
                            credit: parseFloat(credit || 0),
                            date_echeance: finalEcheance,
                            updated_at: new Date(),
                            sync_status: 'synced'
                        }
                    }
                ).session(session);

                await CloudBrouillonLigne.updateMany(
                    { piece_provisoire: pieceDeTravail, journal_id, company_id: companyStr },
                    { $set: { libelle: finalLibelle, reference: reference || '', facture: facture || '', sync_status: 'synced' } }
                ).session(session);

                await CloudBrouillonEcriture.updateOne(
                    { localId: ecriture_id },
                    { $set: { libelle: finalLibelle, sync_status: 'synced' } }
                ).session(session);
            } else {
                await CloudBrouillonLigne.create([{
                    localId: ligneId,
                    company_id: companyStr,
                    brouillon_id: ecriture_id,
                    journal_id,
                    exercice_id,
                    date_ecriture: dateObj,
                    piece_provisoire: pieceDeTravail,
                    facture: facture || '',
                    reference: reference || '',
                    compte_id,
                    num_compte,
                    num_tiers: num_tiers || null,
                    libelle: finalLibelle,
                    debit: parseFloat(debit || 0),
                    credit: parseFloat(credit || 0),
                    date_echeance: finalEcheance,
                    statut: 'EN_ATTENTE',
                    sync_status: 'synced'
                }], { session });
            }

            const soldeAgg = await CloudBrouillonLigne.aggregate([
                { $match: { piece_provisoire: pieceDeTravail, journal_id, company_id: companyStr } },
                { $group: { _id: null, reste: { $sum: { $subtract: ['$debit', '$credit'] } } } }
            ]).session(session);

            const soldePiece = soldeAgg.length > 0 ? soldeAgg[0].reste : 0;

            if (journal.mode_numerotation === 'AUTO' && Math.abs(soldePiece) < 0.01) {
                await CloudJournal.updateOne({ _id: journal._id }, { $inc: { compteur_brouillon: 1 } }).session(session);
                aEteIncremente = true;
            }

            let contrepartieNum = null;
            if (journal.compte_contrepartie_id) {
                const cpte = await CloudPlanComptable.findOne({ 
                    $or: [{ localId: journal.compte_contrepartie_id }, { _id: mongoose.isValidObjectId(journal.compte_contrepartie_id) ? journal.compte_contrepartie_id : null }] 
                }).lean();
                contrepartieNum = cpte?.numero_compte || null;
            }

            await session.commitTransaction();
            session.endSession();
            return { id: ligneId, ecriture_id, numPieceFinale: pieceDeTravail, aEteIncremente, soldePiece, contrepartie: contrepartieNum };
        } catch (err) {
            await session.abortTransaction();
            session.endSession();
            throw err;
        }
    }

    // 3. Récupération périodique
    async getLignesBrouillonParPeriode({ journal_id, exercice_id, moisIdx, companyId }) {
        const companyStr = companyId.toString();
        let patternDate = ''; 
        let ancienSolde = 0, mvtDebitMois = 0, mvtCreditMois = 0;

        if (exercice_id && exercice_id !== 'ALL' && exercice_id !== 'undefined') {
            const exercice = await CloudExercice.findOne({ localId: exercice_id, company_id: companyStr }).lean();
            if (exercice) {
                const annee = new Date(exercice.date_debut).getFullYear();
                const moisNum = (parseInt(moisIdx) + 1).toString().padStart(2, '0');
                patternDate = `${annee}-${moisNum}-`;
                const dateDebutMois = `${annee}-${moisNum}-01`;

                if (journal_id && journal_id !== 'ALL') {
                    const journal = await CloudJournal.findOne({ 
                        $or: [{ localId: journal_id }, { _id: mongoose.isValidObjectId(journal_id) ? journal_id : null }], 
                        company_id: companyStr 
                    }).lean();

                    if (journal?.compte_contrepartie_id) {
                        const compte = await CloudPlanComptable.findOne({ 
                            $or: [{ localId: journal.compte_contrepartie_id }, { _id: mongoose.isValidObjectId(journal.compte_contrepartie_id) ? journal.compte_contrepartie_id : null }] 
                        }).lean();

                        if (compte) {
                            const ancienAgg = await CloudLigneEcriture.aggregate([
                                { $match: { num_compte: compte.numero_compte, company_id: companyStr, date_ecriture: { $lt: new Date(dateDebutMois) }, is_deleted: 0 } },
                                { $group: { _id: null, solde: { $sum: { $subtract: ['$debit', '$credit'] } } } }
                            ]);
                            ancienSolde = ancienAgg.length > 0 ? ancienAgg[0].solde : 0;

                            const mvtsAgg = await CloudBrouillonLigne.aggregate([
                                { 
                                    $match: { 
                                        num_compte: compte.numero_compte, 
                                        company_id: companyStr, 
                                        date_ecriture: { 
                                            $gte: new Date(`${annee}-${moisNum}-01`), 
                                            $lte: new Date(`${annee}-${moisNum}-31`) 
                                        } 
                                    } 
                                },
                                { $group: { _id: null, debits: { $sum: '$debit' }, credits: { $sum: '$credit' } } }
                            ]);
                            mvtDebitMois = mvtsAgg.length > 0 ? mvtsAgg[0].debits : 0;
                            mvtCreditMois = mvtsAgg.length > 0 ? mvtsAgg[0].credits : 0;
                        }
                    }
                }
            }
        }

        const matchQuery = { company_id: companyStr };
        if (journal_id && journal_id !== 'ALL' && journal_id !== 'undefined') matchQuery.journal_id = journal_id;
        if (exercice_id && exercice_id !== 'ALL' && exercice_id !== 'undefined') matchQuery.exercice_id = exercice_id;
        if (patternDate) {
            matchQuery.date_ecriture = { $regex: new RegExp(`^${patternDate}`) };
        }

        const lignes = await CloudBrouillonLigne.find(matchQuery)
            .populate('journal_id', 'code')
            .sort({ created_at: -1, _id: -1 })
            .lean();

        const data = [];
        for (const l of lignes) {
            const hasAna = await CloudBrouillonLigneAnalytique.exists({ ligne_brouillon_id: l.localId || l._id.toString() });
            data.push({
                ...l,
                piece: l.piece_provisoire,
                journal_code: l.journal_id?.code,
                is_ventilated: !!hasAna
            });
        }

        return { 
            data, 
            ancienSolde: parseFloat(ancienSolde), 
            mouvementDebit: parseFloat(mvtDebitMois), 
            mouvementCredit: parseFloat(mvtCreditMois), 
            nouveauSolde: parseFloat(ancienSolde + mvtDebitMois - mvtCreditMois) 
        };
    }

    // 4. Suppression
    async supprimerPieceBrouillon(ids, companyId) {
        const companyStr = companyId.toString();
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const lignes = await CloudBrouillonLigne.find({ localId: { $in: ids }, company_id: companyStr }).session(session);
            const brouillonIds = [...new Set(lignes.map(l => l.brouillon_id))];

            await CloudBrouillonLigne.deleteMany({ localId: { $in: ids }, company_id: companyStr }).session(session);

            for (const bId of brouillonIds) {
                const reste = await CloudBrouillonLigne.countDocuments({ brouillon_id: bId }).session(session);
                if (reste === 0) {
                    await CloudBrouillonEcriture.deleteOne({ localId: bId }).session(session);
                }
            }

            await session.commitTransaction();
            session.endSession();
        } catch (err) {
            await session.abortTransaction();
            session.endSession();
            throw err;
        }
    }

    // 5. Récupérer journaux
    async getJournauxPourBrouillon(exercice_id, companyId) {
        const companyStr = companyId.toString();
        const nbPlans = await CloudPlanAnalytique.countDocuments({ company_id: companyStr, is_deleted: 0 });
        const company = await CloudCompany.findOne({ $or: [{ localId: companyStr }, { _id: mongoose.isValidObjectId(companyStr) ? companyStr : null }] }).lean();
        const analytiqueBloque = company?.gestion_analytique === 1 && nbPlans === 0;

        const journaux = await CloudJournal.find({ company_id: companyStr }).lean();
        const data = [];

        for (const j of journaux) {
            let compte = null;
            if (j.compte_contrepartie_id) {
                compte = await CloudPlanComptable.findOne({ 
                    $or: [{ localId: j.compte_contrepartie_id }, { _id: mongoose.isValidObjectId(j.compte_contrepartie_id) ? j.compte_contrepartie_id : null }] 
                }).lean();
            }

            data.push({
                ...j,
                compte_numero: compte?.numero_compte || '',
                compte_libelle: compte?.intitule || ''
            });
        }

        return { data, analytique_alerte: analytiqueBloque };
    }

    // 6. Validation finale vers Grand Livre
    async validerPieceBrouillon({ piece_provisoire, journal_id, companyId, userName = 'user' }) {
        const companyStr = companyId.toString();
        if (!journal_id) throw new Error("Le journal_id est requis pour valider cette pièce.");

        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const lignesBrouillon = await CloudBrouillonLigne.find({
                piece_provisoire,
                journal_id,
                company_id: companyStr,
                statut: 'EN_ATTENTE'
            }).session(session);

            if (lignesBrouillon.length === 0) {
                throw new Error("Cette pièce est déjà validée ou n'existe plus dans ce journal.");
            }

            const first = lignesBrouillon[0];

            const existeDeja = await CloudEcriture.findOne({
                piece: piece_provisoire,
                journal_id,
                exercice_id: first.exercice_id,
                company_id: companyStr
            }).session(session);

            if (existeDeja) throw new Error(`La pièce ${piece_provisoire} existe déjà au Grand Livre.`);

            const journal = await CloudJournal.findOne({ 
                $or: [{ localId: journal_id }, { _id: mongoose.isValidObjectId(journal_id) ? journal_id : null }], 
                company_id: companyStr 
            }).session(session);

            if (journal?.mode_numerotation === 'AUTO') {
                await CloudJournal.updateOne({ _id: journal._id }, { $inc: { compteur_piece: 1 } }).session(session);
            }

            const ecritureIdReel = `ECR-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
            await CloudEcriture.create([{
                localId: ecritureIdReel,
                company_id: companyStr,
                journal_id,
                exercice_id: first.exercice_id,
                date_ecriture: first.date_ecriture,
                piece: piece_provisoire,
                reference: first.reference,
                ref_brouillon: piece_provisoire,
                libelle: first.libelle,
                user_saisie: userName,
                sync_status: 'synced'
            }], { session });

            for (const lb of lignesBrouillon) {
                const ligneIdReelle = `LIG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                
                await CloudLigneEcriture.create([{
                    localId: ligneIdReelle,
                    company_id: companyStr,
                    ecriture_id: ecritureIdReel,
                    journal_id,
                    exercice_id: lb.exercice_id,
                    date_ecriture: lb.date_ecriture,
                    date_echeance: lb.date_echeance,
                    piece: piece_provisoire,
                    facture: lb.facture,
                    reference: lb.reference,
                    compte_id: lb.compte_id,
                    num_compte: lb.num_compte,
                    num_tiers: lb.num_tiers,
                    libelle: lb.libelle,
                    debit: lb.debit,
                    credit: lb.credit,
                    sync_status: 'synced'
                }], { session });

                const anaBrouillon = await CloudBrouillonLigneAnalytique.find({ ligne_brouillon_id: lb.localId || lb._id.toString() }).session(session);
                for (let idx = 0; idx < anaBrouillon.length; idx++) {
                    const ana = anaBrouillon[idx];
                    const anaIdReel = `LANA-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 5)}`;
                    await CloudLigneAnalytique.create([{
                        localId: anaIdReel,
                        company_id: companyStr,
                        ligne_ecriture_id: ligneIdReelle,
                        plan_analytique_id: ana.plan_analytique_id,
                        departement_id: ana.departement_id,
                        num_compte: lb.num_compte,
                        montant: ana.montant,
                        sync_status: 'synced'
                    }], { session });
                }
            }

            await CloudBrouillonLigne.updateMany(
                { piece_provisoire, journal_id, company_id: companyStr },
                { $set: { statut: 'VALIDE', observation: `Transféré le ${new Date().toISOString()}` } }
            ).session(session);

            await CloudBrouillonEcriture.updateMany(
                { piece_provisoire, journal_id, company_id: companyStr },
                { $set: { statut: 'VALIDE' } }
            ).session(session);

            if (lignesBrouillon.some(l => l.libelle?.includes('EXTOURNE'))) {
                await CloudBrouillardLignesTreso.updateMany(
                    { piece_comptable: piece_provisoire.replace('BR-', ''), journal_id, company_id: companyStr, v1_statut: 9 },
                    { $set: { statut: 'REJETE', v1_statut: 0, motif_annulation: 'Annulation confirmée par extourne' } }
                ).session(session);
            }

            await session.commitTransaction();
            session.endSession();
        } catch (err) {
            await session.abortTransaction();
            session.endSession();
            throw err;
        }
    }

    // 7. Rejet et Libération Trésorerie
    async rejeterPieceBrouillon({ piece_provisoire, journal_id, observation, companyId }) {
        const companyStr = companyId.toString();
        if (!journal_id) throw new Error("Le journal_id est requis pour rejeter cette pièce.");

        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            await CloudBrouillonLigne.updateMany(
                { piece_provisoire, journal_id, company_id: companyStr },
                { $set: { statut: 'REJETE', observation } }
            ).session(session);

            await CloudBrouillonEcriture.updateMany(
                { piece_provisoire, journal_id, company_id: companyStr },
                { $set: { statut: 'REJETE' } }
            ).session(session);

            const refOriginale = piece_provisoire.replace('BR-', '');
            await CloudBrouillardLignesTreso.updateMany(
                { piece_comptable: refOriginale, journal_id, company_id: companyStr },
                { $set: { comptabilise: 0, brouillon_ecriture_id: null } }
            ).session(session);

            await session.commitTransaction();
            session.endSession();
        } catch (err) {
            await session.abortTransaction();
            session.endSession();
            throw err;
        }
    }
}

module.exports = new JournalEcritureBrouillonService();