// backend/services/ran.service.js
const mongoose = require('mongoose');
const { 
    CloudExercice, 
    CloudReportANouveau, 
    CloudLigneEcriture, 
    CloudEcriture, 
    CloudPlanTiers, 
    CloudAuditLog 
} = require('../models/cloud.model');

class RanService {
    /**
     * Génère les reports à nouveau et l'exercice N+1
     */
    async genererRAN(data, user) {
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const companyId = user.companyId || user.company_id;
            const userId = user.userId || user.id;
            const userName = user.username || 'Système';
            const { exerciceACloturerId, compteResultatId, numCompteResultat, journalId, typeCloture } = data;

            // 1. Charger l'exercice source (N)
            const exSource = await CloudExercice.findOne({ localId: exerciceACloturerId, company_id: companyId.toString() }).session(session).lean();
            if (!exSource) throw new Error("Exercice source introuvable.");

            // 2. Gérer l'exercice suivant (N+1)
            const anneeN1 = new Date(exSource.date_fin).getFullYear() + 1;
            const libelleN1 = `EXERCICE ${anneeN1}`;
            
            let exSuivant = await CloudExercice.findOne({ libelle: libelleN1, company_id: companyId.toString() }).session(session).lean();
            let nouvelExId;

            if (exSuivant) {
                nouvelExId = exSuivant.localId;
            } else {
                nouvelExId = `EXE-N1-${Date.now()}`;
                await CloudExercice.create([{
                    localId: nouvelExId,
                    company_id: companyId.toString(),
                    libelle: libelleN1,
                    date_debut: `${anneeN1}-01-01`,
                    date_fin: `${anneeN1}-12-31`,
                    statut: 'OUVERT',
                    sync_status: 'synced',
                    updated_at: new Date()
                }], { session });
            }

            // 3. NETTOYAGE préalable
            const pieceRan = `RAN-${anneeN1}`;
            
            await CloudReportANouveau.deleteMany({ exercice_id: nouvelExId, company_id: companyId.toString() }).session(session);
            await CloudEcriture.deleteMany({ exercice_id: nouvelExId, journal_id: journalId, piece: pieceRan, company_id: companyId.toString() }).session(session);
            await CloudLigneEcriture.deleteMany({ exercice_id: nouvelExId, journal_id: journalId, piece: pieceRan, company_id: companyId.toString() }).session(session);

            // 4. CALCUL DES SOLDES (Comptes de bilan uniquement [1-5])
            // On utilise une agrégation Mongoose pour grouper par compte_id et num_tiers
            const soldes = await CloudLigneEcriture.aggregate([
                { 
                    $match: { 
                        exercice_id: exerciceACloturerId.toString(), 
                        company_id: companyId.toString(), 
                        is_deleted: { $ne: 1 }, 
                        num_compte: { $regex: /^[1-5]/ } 
                    } 
                },
                {
                    $group: {
                        _id: { compte_id: '$compte_id', num_tiers: '$num_tiers' },
                        num_compte: { $first: '$num_compte' },
                        solde_net: { $sum: { $subtract: ['$debit', '$credit'] } }
                    }
                },
                {
                    $match: {
                        $expr: { $gt: [{ $abs: '$solde_net' }, 0.001] }
                    }
                }
            ]).session(session);

            // 5. CRÉATION DE L'ÉCRITURE DE REPORT
            const ecritureId = `ECR-RAN-${Date.now()}`;
            await CloudEcriture.create([{
                localId: ecritureId,
                company_id: companyId.toString(),
                journal_id: journalId,
                exercice_id: nouvelExId,
                date_ecriture: new Date(`${anneeN1}-01-01`),
                piece: pieceRan,
                libelle: `REPORT A NOUVEAU ${typeCloture}`,
                user_saisie: userName,
                sync_status: 'synced',
                updated_at: new Date()
            }], { session });

            // 6. INSERTION DES LIGNES DÉTAILLÉES ET TABLES RAN
            let tDeb = 0, tCre = 0;
            const lignesToInsert = [];
            const ransToInsert = [];

            soldes.forEach((s, i) => {
                const lid = `LIG-RAN-${Date.now()}-${i}`;
                const d = s.solde_net > 0 ? s.solde_net : 0;
                const c = s.solde_net < 0 ? Math.abs(s.solde_net) : 0;
                tDeb += d; tCre += c;
                
                const compteIdVal = s._id.compte_id;
                const numTiersVal = s._id.num_tiers;

                lignesToInsert.push({
                    localId: lid,
                    company_id: companyId.toString(),
                    ecriture_id: ecritureId,
                    journal_id: journalId,
                    exercice_id: nouvelExId,
                    date_ecriture: new Date(`${anneeN1}-01-01`),
                    piece: pieceRan,
                    compte_id: compteIdVal,
                    num_compte: s.num_compte,
                    num_tiers: numTiersVal,
                    libelle: "SOLDE INITIAL",
                    debit: d,
                    credit: c,
                    sync_status: 'synced',
                    updated_at: new Date()
                });

                ransToInsert.push({
                    localId: lid,
                    company_id: companyId.toString(),
                    exercice_id: nouvelExId,
                    compte_id: compteIdVal,
                    num_compte: s.num_compte,
                    num_tiers: numTiersVal,
                    montant_debit: d,
                    montant_credit: c,
                    type_report: typeCloture,
                    user_name: userName,
                    sync_status: 'synced',
                    updated_at: new Date()
                });
            });

            // 7. ÉQUILIBRE PAR LE RÉSULTAT
            const diff = tDeb - tCre;
            if (Math.abs(diff) > 0.01) {
                const rid = `LIG-RES-${Date.now()}`;
                const rd = diff < 0 ? Math.abs(diff) : 0;
                const rc = diff > 0 ? diff : 0;

                lignesToInsert.push({
                    localId: rid,
                    company_id: companyId.toString(),
                    ecriture_id: ecritureId,
                    journal_id: journalId,
                    exercice_id: nouvelExId,
                    date_ecriture: new Date(`${anneeN1}-01-01`),
                    piece: pieceRan,
                    compte_id: compteResultatId,
                    num_compte: numCompteResultat,
                    num_tiers: null,
                    libelle: "RÉSULTAT NET REPORTÉ",
                    debit: rd,
                    credit: rc,
                    sync_status: 'synced',
                    updated_at: new Date()
                });

                ransToInsert.push({
                    localId: rid,
                    company_id: companyId.toString(),
                    exercice_id: nouvelExId,
                    compte_id: compteResultatId,
                    num_compte: numCompteResultat,
                    num_tiers: null,
                    montant_debit: rd,
                    montant_credit: rc,
                    type_report: typeCloture,
                    user_name: userName,
                    sync_status: 'synced',
                    updated_at: new Date()
                });
            }

            if (lignesToInsert.length > 0) {
                await CloudLigneEcriture.insertMany(lignesToInsert, { session });
            }
            if (ransToInsert.length > 0) {
                await CloudReportANouveau.insertMany(ransToInsert, { session });
            }

            // 8. MISE À JOUR DU STATUT DE L'EXERCICE CLÔTURÉ
            const nouveauStatut = (typeCloture === 'DEFINITIF') ? 'CLOTURE' : 'PRE_CLOTURE';
            await CloudExercice.updateOne(
                { localId: exerciceACloturerId, company_id: companyId.toString() },
                { $set: { statut: nouveauStatut, sync_status: 'synced', updated_at: new Date() } },
                { session }
            );

            // 9. JOURNAL D'AUDIT
            const logId = `LOG-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
            await CloudAuditLog.create([{
                localId: logId,
                user_id: userId,
                user_name: userName,
                action_type: 'GENERATE_RAN',
                table_concernee: 'exercices',
                reference_id: exerciceACloturerId,
                description: `Génération des reports à nouveau (${typeCloture}) pour l'${exSource.libelle}. Passage au statut: ${nouveauStatut}`,
                date_action: new Date(),
                company_id: companyId.toString(),
                sync_status: 'synced'
            }], { session });

            await session.commitTransaction();
            session.endSession();

            return { success: true };
        } catch (error) {
            await session.abortTransaction();
            session.endSession();
            throw error;
        }
    }

    async getBilanTiersData(exerciceId, companyId) {
        // Agrégation Mongoose pour simuler la requête de bilan par tiers
        const rows = await CloudLigneEcriture.aggregate([
            {
                $match: {
                    exercice_id: exerciceId.toString(),
                    company_id: companyId.toString(),
                    is_deleted: { $ne: 1 },
                    num_compte: { $regex: /^[1-5]/ }
                }
            },
            {
                $group: {
                    _id: { numero_compte: '$num_compte', num_tiers: '$num_tiers' },
                    total_debit: { $sum: '$debit' },
                    total_credit: { $sum: '$credit' }
                }
            },
            {
                $match: {
                    $expr: { $ne: [{ $subtract: ['$total_debit', '$total_credit'] }, 0] }
                }
            },
            {
                $lookup: {
                    from: 'cloud_plan_tiers',
                    let: { tierNum: '$_id.num_tiers', cid: companyId.toString() },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ['$numero_tiers', '$$tierNum'] },
                                        { $eq: ['$company_id', '$$cid'] }
                                    ]
                                }
                            }
                        }
                    ],
                    as: 'tier'
                }
            },
            { $unwind: { path: '$tier', preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    numero_compte: '$_id.numero_compte',
                    num_tiers: { $ifNull: ['$_id.num_tiers', ''] },
                    intitule_tiers: { $ifNull: ['$tier.nom', 'REPORT A NOUVEAU'] },
                    total_debit: 1,
                    total_credit: 1
                }
            },
            { $sort: { numero_compte: 1, num_tiers: 1 } }
        ]);

        return rows.map(row => {
            const solde = row.total_debit - row.total_credit;
            return {
                numero_compte: row.numero_compte,
                num_tiers: row.num_tiers || '',
                intitule_tiers: row.intitule_tiers || "REPORT A NOUVEAU",
                solde_cumule_debit: solde > 0 ? solde : 0,
                solde_cumule_credit: solde < 0 ? Math.abs(solde) : 0
            };
        });
    }
}

module.exports = new RanService();