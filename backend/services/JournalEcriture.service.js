// backend/services/JournalEcriture.service.js
const mongoose = require('mongoose');
const { 
    CloudLigneEcriture, CloudEcriture, CloudJournal, 
    CloudExercice, CloudLigneAnalytique, CloudPlanComptable, 
    CloudCompany, CloudAuditLog 
} = require('../models/cloud.model');
const { logAction } = require('../utils/auditHelper');

class JournalEcritureService {
    // --- UTILS ---
    async trouverPieceLibre(journal_id, exercice_id, companyId, numeroPiece) {
        let pieceValide = numeroPiece;
        let existe = await CloudEcriture.findOne({ 
            piece: pieceValide, 
            journal_id: journal_id, 
            exercice_id: exercice_id, 
            company_id: companyId, 
            is_deleted: 0 
        }).lean();
        
        let index = 1;
        while (existe) {
            pieceValide = `${numeroPiece}-${index}`;
            existe = await CloudEcriture.findOne({ 
                piece: pieceValide, 
                journal_id: journal_id, 
                exercice_id: exercice_id, 
                company_id: companyId, 
                is_deleted: 0 
            }).lean();
            index++;
        }
        return pieceValide;
    }

    // --- LOGIQUE D'ÉCRITURE ---
    async creerEcritureGroupée(data, companyId, userName = 'user') {
        const { journal_id, exercice_id, date_ecriture, libelle_general, piece_manuelle, lignes } = data;
        const companyStr = companyId.toString();

        const exercice = await CloudExercice.findOne({ localId: exercice_id, company_id: companyStr }).lean();
        if (!exercice) throw new Error("Exercice introuvable.");

        const dateObj = new Date(date_ecriture);
        if (dateObj < exercice.date_debut || dateObj > exercice.date_fin) {
            throw new Error(`Date hors limites (${exercice.date_debut} à ${exercice.date_fin})`);
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
            if (journal.mode_numerotation === 'AUTO' && !piece_manuelle) {
                const lastLigne = await CloudLigneEcriture.findOne({ 
                    journal_id: journal_id, 
                    exercice_id: exercice_id, 
                    company_id: companyStr, 
                    is_deleted: 0 
                }).sort({ piece: -1 }).lean();

                const prochainNumero = lastLigne && !isNaN(lastLigne.piece) ? (parseInt(lastLigne.piece) + 1) : 1;
                const sequence = prochainNumero.toString().padStart(journal.longueur_compteur || 1, '0');
                const prefixe = journal.prefixe_piece || journal.code;
                numeroPiece = `${prefixe}-${sequence}`;
            }

            const pieceGeneree = await this.trouverPieceLibre(journal_id, exercice_id, companyStr, numeroPiece || "1");
            const ecritureId = `ECR-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

            await CloudEcriture.create([{
                localId: ecritureId,
                company_id: companyStr,
                journal_id: journal_id,
                exercice_id: exercice_id,
                date_ecriture: dateObj,
                piece: pieceGeneree.toString(),
                libelle: libelle_general.toUpperCase(),
                user_saisie: userName,
                sync_status: 'synced'
            }], { session });

            for (let index = 0; index < lignes.length; index++) {
                const lig = lignes[index];
                const ligneId = `LIG-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 4)}`;
                const echeance = lig.date_echeance ? new Date(lig.date_echeance) : dateObj;

                const compte = await CloudPlanComptable.findOne({ 
                    $or: [{ localId: lig.compte_id }, { _id: mongoose.isValidObjectId(lig.compte_id) ? lig.compte_id : null }] 
                }).lean();

                await CloudLigneEcriture.create([{
                    localId: ligneId,
                    company_id: companyStr,
                    ecriture_id: ecritureId,
                    journal_id: journal_id,
                    exercice_id: exercice_id,
                    date_ecriture: dateObj,
                    date_echeance: echeance,
                    piece: pieceGeneree.toString(),
                    compte_id: lig.compte_id,
                    num_compte: compte?.numero_compte || '',
                    libelle: lig.libelle.toUpperCase(),
                    debit: lig.debit || 0,
                    credit: lig.credit || 0,
                    sync_status: 'synced'
                }], { session });
            }

            await logAction({
                userId: 'system',
                userName: userName || 'user',
                actionType: 'CREATION_ECRITURE_GROUPEE',
                tableConcernee: 'ecritures',
                referenceId: ecritureId,
                description: `Création d'une écriture groupée - Pièce : ${pieceGeneree} (${lignes.length} lignes)`,
                companyId: companyStr
            });

            await session.commitTransaction();
            session.endSession();
            return { ecritureId, pieceGeneree };
        } catch (err) {
            await session.abortTransaction();
            session.endSession();
            throw err;
        }
    }

    async enregistrerLigneUnique(body, companyId, userName = 'user') {
        const { id, journal_id, exercice_id, date_ecriture, date_echeance, piece, facture, reference, num_compte, num_tiers, libelle, debit, credit, compte_id } = body;
        const companyStr = companyId.toString();

        const journal = await CloudJournal.findOne({ 
            $or: [{ localId: journal_id }, { _id: mongoose.isValidObjectId(journal_id) ? journal_id : null }], 
            company_id: companyStr 
        }).lean();
        if (!journal) throw new Error("Journal introuvable");

        let pieceDeTravail = piece ? piece.toString().split('.')[0] : '';
        const dateObj = new Date(date_ecriture);

        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            if (!id && !piece) {
                const pieceInachevee = await CloudLigneEcriture.aggregate([
                    { $match: { journal_id: journal_id, exercice_id: exercice_id, company_id: companyStr, is_deleted: 0 } },
                    { $group: { _id: '$piece', solde: { $sum: { $subtract: ['$debit', '$credit'] } } } },
                    { $match: { solde: { $ne: 0 } } },
                    { $limit: 1 }
                ]);
                
                if (pieceInachevee && pieceInachevee.length > 0) {
                    pieceDeTravail = pieceInachevee[0]._id.toString();
                } else if (journal.mode_numerotation === 'AUTO') {
                    const lastLigne = await CloudLigneEcriture.findOne({ 
                        journal_id: journal_id, 
                        exercice_id: exercice_id, 
                        company_id: companyStr, 
                        is_deleted: 0 
                    }).sort({ piece: -1 }).lean();
                    pieceDeTravail = lastLigne && !isNaN(lastLigne.piece) ? (parseInt(lastLigne.piece) + 1).toString() : "1";
                }
            }

            if (!pieceDeTravail && !id) throw new Error("Veuillez saisir un numéro de pièce.");

            const finalLibelle = libelle ? libelle.toUpperCase() : '';
            let entete = await CloudEcriture.findOne({ 
                piece: pieceDeTravail, 
                journal_id: journal_id, 
                exercice_id: exercice_id, 
                company_id: companyStr, 
                is_deleted: 0 
            }).session(session);

            let ecriture_id;
            if (!entete) {
                ecriture_id = `ECR-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
                await CloudEcriture.create([{
                    localId: ecriture_id,
                    company_id: companyStr,
                    journal_id: journal_id,
                    exercice_id: exercice_id,
                    date_ecriture: dateObj,
                    piece: pieceDeTravail,
                    libelle: finalLibelle,
                    user_saisie: userName,
                    sync_status: 'synced'
                }], { session });
            } else {
                ecriture_id = entete.localId || entete._id.toString();
            }

            const ligneId = id || `LIG-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
            const finalEcheance = num_tiers && date_echeance ? new Date(date_echeance) : null;
            const isUpdate = !!id;

            if (isUpdate) {
                await CloudLigneEcriture.updateOne(
                    { localId: id, company_id: companyStr },
                    {
                        $set: {
                            ecriture_id,
                            date_ecriture: dateObj,
                            date_echeance: finalEcheance,
                            piece: pieceDeTravail,
                            facture: facture || null,
                            reference: reference || null,
                            compte_id,
                            num_compte,
                            num_tiers: num_tiers || null,
                            libelle: finalLibelle,
                            debit: parseFloat(debit || 0),
                            credit: parseFloat(credit || 0),
                            updated_at: new Date(),
                            sync_status: 'synced'
                        }
                    }
                ).session(session);
            } else {
                await CloudLigneEcriture.create([{
                    localId: ligneId,
                    company_id: companyStr,
                    ecriture_id,
                    journal_id,
                    exercice_id,
                    date_ecriture: dateObj,
                    date_echeance: finalEcheance,
                    piece: pieceDeTravail,
                    facture: facture || null,
                    reference: reference || null,
                    compte_id,
                    num_compte,
                    num_tiers: num_tiers || null,
                    libelle: finalLibelle,
                    debit: parseFloat(debit || 0),
                    credit: parseFloat(credit || 0),
                    sync_status: 'synced'
                }], { session });
            }

            const soldeAgg = await CloudLigneEcriture.aggregate([
                { $match: { piece: pieceDeTravail, journal_id: journal_id, exercice_id: exercice_id, company_id: companyStr, is_deleted: 0 } },
                { $group: { _id: null, total: { $sum: { $subtract: ['$debit', '$credit'] } } } }
            ]).session(session);

            const soldeFinal = soldeAgg.length > 0 ? soldeAgg[0].total : 0;
            let prochainePiece = pieceDeTravail;
            if (Math.abs(soldeFinal) < 0.01 && journal.mode_numerotation === 'AUTO') {
                prochainePiece = !isNaN(pieceDeTravail) ? (parseInt(pieceDeTravail) + 1).toString() : pieceDeTravail;
            }

            await logAction({
                userId: 'system',
                userName: userName || 'user',
                actionType: isUpdate ? 'UPDATE_LIGNE_BROUILLARD' : 'INSERT_LIGNE_BROUILLARD',
                tableConcernee: 'lignes_ecritures',
                referenceId: ligneId,
                description: `${isUpdate ? 'Modification' : 'Ajout'} de la ligne ${num_compte} sur pièce ${pieceDeTravail}`,
                companyId: companyStr
            });

            await session.commitTransaction();
            session.endSession();
            return { id: ligneId, ecriture_id, numPieceFinale: pieceDeTravail, prochainePiece, soldePiece: soldeFinal, contrepartie: journal.compte_contrepartie };
        } catch (err) {
            await session.abortTransaction();
            session.endSession();
            throw err;
        }
    }

    async getEcrituresByJournal({ journal_id, exercice_id, patternDate, companyId }) {
        const companyStr = companyId.toString();
        const query = { journal_id, exercice_id, company_id: companyStr, is_deleted: 0 };
        if (patternDate) {
            query.date_ecriture = { $regex: new RegExp(`^${patternDate.replace('%', '.*')}`) };
        }

        const lignes = await CloudLigneEcriture.find(query).sort({ created_at: -1, _id: -1 }).lean();
        const result = [];
        for (const l of lignes) {
            const hasAna = await CloudLigneAnalytique.exists({ ligne_ecriture_id: l.localId || l._id.toString() });
            result.push({
                ...l,
                is_ventilated: !!hasAna
            });
        }
        return result;
    }

    async getLignesParPeriode({ journal_id, exercice_id, moisIdx, companyId }) {
        const companyStr = companyId.toString();
        const exercice = await CloudExercice.findOne({ localId: exercice_id, company_id: companyStr }).lean();
        if (!exercice) throw new Error("Exercice introuvable");

        const journal = await CloudJournal.findOne({ 
            $or: [{ localId: journal_id }, { _id: mongoose.isValidObjectId(journal_id) ? journal_id : null }], 
            company_id: companyStr 
        }).lean();

        const annee = new Date(exercice.date_debut).getFullYear();
        const moisNum = (parseInt(moisIdx) + 1).toString().padStart(2, '0');
        const dateDebutMois = `${annee}-${moisNum}-01`;

        let ancienSolde = 0, mvtDebitMois = 0, mvtCreditMois = 0;

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

                const mvtsAgg = await CloudLigneEcriture.aggregate([
                    { 
                        $match: { 
                            num_compte: compte.numero_compte, 
                            company_id: companyStr, 
                            date_ecriture: { 
                                $gte: new Date(`${annee}-${moisNum}-01`), 
                                $lte: new Date(`${annee}-${moisNum}-31`) 
                            }, 
                            is_deleted: 0 
                        } 
                    },
                    { $group: { _id: null, debits: { $sum: '$debit' }, credits: { $sum: '$credit' } } }
                ]);
                mvtDebitMois = mvtsAgg.length > 0 ? mvtsAgg[0].debits : 0;
                mvtCreditMois = mvtsAgg.length > 0 ? mvtsAgg[0].credits : 0;
            }
        }

        const data = await this.getEcrituresByJournal({
            journal_id,
            exercice_id,
            patternDate: `${annee}-${moisNum}-`,
            companyId: companyStr
        });

        return {
            data,
            ancienSolde,
            mouvementDebit: mvtDebitMois,
            mouvementCredit: mvtCreditMois,
            nouveauSolde: (ancienSolde + mvtDebitMois - mvtCreditMois)
        };
    }

    async annulerPieceComplete(ids, companyId, userName = 'user') {
        const companyStr = companyId.toString();
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const lignes = await CloudLigneEcriture.find({ localId: { $in: ids }, company_id: companyStr }).session(session);
            const ecritureIds = [...new Set(lignes.map(l => l.ecriture_id))];

            for (const eId of ecritureIds) {
                const soldeAgg = await CloudLigneEcriture.aggregate([
                    { $match: { ecriture_id: eId, is_deleted: 0 } },
                    { $group: { _id: null, reste: { $sum: { $subtract: ['$debit', '$credit'] } } } }
                ]).session(session);

                const reste = soldeAgg.length > 0 ? soldeAgg[0].reste : 0;

                if (Math.abs(reste) > 0.01) {
                    await CloudLigneAnalytique.deleteMany({ ligne_ecriture_id: { $in: (await CloudLigneEcriture.find({ ecriture_id: eId })).map(l => l.localId || l._id.toString()) } }).session(session);
                    await CloudLigneEcriture.deleteMany({ ecriture_id: eId }).session(session);
                    await CloudEcriture.deleteOne({ localId: eId }).session(session);
                } else {
                    await CloudEcriture.updateOne({ localId: eId }, { $set: { is_deleted: 1 } }).session(session);
                    await CloudLigneEcriture.updateMany({ ecriture_id: eId }, { $set: { is_deleted: 1 } }).session(session);
                }
            }

            await session.commitTransaction();
            session.endSession();
            return true;
        } catch (err) {
            await session.abortTransaction();
            session.endSession();
            throw err;
        }
    }

    async getJournauxPourSaisie(companyId, exercice_id) {
        const companyStr = companyId.toString();
        let currentExId = exercice_id;

        if (!currentExId || currentExId === 'undefined') {
            const currentEx = await CloudExercice.findOne({ company_id: companyStr, statut: 'OUVERT' }).lean();
            currentExId = currentEx?.localId || currentEx?._id?.toString() || null;
        }

        const company = await CloudCompany.findOne({ $or: [{ localId: companyStr }, { _id: mongoose.isValidObjectId(companyStr) ? companyStr : null }] }).lean();
        const nbPlans = await CloudPlanAnalytique.countDocuments({ company_id: companyStr, is_deleted: 0 });
        const analytiqueBloque = company?.gestion_analytique === 1 && nbPlans === 0;

        const journaux = await CloudJournal.find({ company_id: companyStr }).sort({ type_journal: 1, code: 1 }).lean();
        const result = [];

        for (const j of journaux) {
            let compte = null;
            if (j.compte_contrepartie_id) {
                compte = await CloudPlanComptable.findOne({ 
                    $or: [{ localId: j.compte_contrepartie_id }, { _id: mongoose.isValidObjectId(j.compte_contrepartie_id) ? j.compte_contrepartie_id : null }] 
                }).lean();
            }

            result.push({
                ...j,
                compte_numero: compte?.numero_compte || '',
                compte_libelle: compte?.intitule || ''
            });
        }

        return { data: result, analytique_alerte: analytiqueBloque };
    }

    async getHistoriqueParCompte(num_compte, exercice_id, companyId) {
        const companyStr = companyId.toString();
        const query = { num_compte, company_id: companyStr, is_deleted: 0 };
        if (exercice_id && exercice_id !== 'ALL') query.exercice_id = exercice_id;

        return await CloudLigneEcriture.find(query).sort({ date_ecriture: 1 }).lean();
    }

    async getHistoriqueParTiers(num_tiers, exercice_id, companyId) {
        const companyStr = companyId.toString();
        const query = { num_tiers, company_id: companyStr, is_deleted: 0 };
        if (exercice_id && exercice_id !== 'ALL') query.exercice_id = exercice_id;

        return await CloudLigneEcriture.find(query).sort({ date_ecriture: 1 }).lean();
    }

    async lettrerEcritures(ids, lettre, companyId) {
        const companyStr = companyId.toString();
        const lettreUpper = lettre.trim().toUpperCase();

        const firstLigne = await CloudLigneEcriture.findOne({ localId: { $in: ids }, company_id: companyStr }).lean();
        if (!firstLigne) throw new Error("Lignes introuvables.");

        const tiers = firstLigne.num_tiers;
        const compte = firstLigne.num_compte;

        const existeDeja = await CloudLigneEcriture.countDocuments({
            lettre: lettreUpper,
            $or: [{ num_tiers: tiers }, { num_tiers: null, num_compte: compte }],
            company_id: companyStr,
            is_deleted: 0
        });

        if (existeDeja > 0) throw new Error(`La lettre "${lettreUpper}" est déjà utilisée.`);

        const lignes = await CloudLigneEcriture.find({ localId: { $in: ids }, company_id: companyStr }).lean();
        const solde = lignes.reduce((acc, l) => acc + (l.debit || 0) - (l.credit || 0), 0);

        if (Math.abs(solde) > 0.01) throw new Error(`Déséquilibre de ${solde}. Le lettrage doit être nul.`);

        await CloudLigneEcriture.updateMany(
            { localId: { $in: ids }, company_id: companyStr },
            { $set: { lettre: lettreUpper, date_lettrage: new Date() } }
        );
        return true;
    }

    async delettrerEcritures(ids, companyId) {
        await CloudLigneEcriture.updateMany(
            { localId: { $in: ids }, company_id: companyId.toString() },
            { $set: { lettre: null, date_lettrage: null } }
        );
        return true;
    }

    async calculerProchaineLettre(companyId, numTiers, numCompte) {
        const companyStr = companyId.toString();
        const lastLigne = await CloudLigneEcriture.findOne({
            company_id: companyStr,
            $or: [{ num_tiers: numTiers }, { num_tiers: null, num_compte: numCompte }],
            lettre: { $ne: null, $ne: '' },
            is_deleted: 0
        }).sort({ lettre: -1 }).lean();

        if (!lastLigne || !lastLigne.lettre) return 'A';

        const last = lastLigne.lettre;
        let chars = last.split('');
        let i = chars.length - 1;

        while (i >= 0) {
            if (chars[i] !== 'Z') {
                chars[i] = String.fromCharCode(chars[i].charCodeAt(0) + 1);
                return chars.join('');
            }
            chars[i] = 'A';
            i--;
        }
        return 'A' + chars.join('');
    }
}

module.exports = new JournalEcritureService();