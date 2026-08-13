// backend/services/importexportEcriture.service.js
const mongoose = require('mongoose');
const { 
    CloudLigneEcriture, CloudEcriture, CloudJournal, 
    CloudPlanComptable, CloudPlanAnalytique, CloudLigneAnalytique, 
    CloudExercice 
} = require('../models/cloud.model');

/**
 * Logique de formatage des dates
 */
const formatToDate = (dateStr) => {
    if (!dateStr || dateStr === "null" || dateStr === "") return null;
    const s = dateStr.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s);
    if (s.includes('/')) {
        const p = s.split('/');
        if (p.length === 3) return new Date(`${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`);
    }
    return new Date(s);
};

// --- LOGIQUE D'EXPORTATION ---
exports.getExportData = async (queryParams, companyId) => {
    const { exercice_id, journal_id, date_debut, date_fin, statut } = queryParams;

    const matchQuery = { company_id: companyId.toString(), exercice_id: exercice_id };

    if (journal_id && journal_id !== 'ALL') matchQuery.journal_id = journal_id;
    if (date_debut && date_fin) matchQuery.date_ecriture = { $gte: new Date(date_debut), $lte: new Date(date_fin) };
    if (statut === 'NORMAL') matchQuery.is_deleted = 0;
    else if (statut === 'DELETED') matchQuery.is_deleted = 1;

    const lignes = await CloudLigneEcriture.find(matchQuery)
        .populate('journal_id', 'code')
        .sort({ date_ecriture: 1, piece: 1 })
        .lean();

    const result = [];
    for (const l of lignes) {
        const ventilations = await CloudLigneAnalytique.find({ ligne_ecriture_id: l.localId || l._id.toString() })
            .populate('plan_analytique_id', 'code')
            .lean();
        
        result.push({
            ...l,
            journal_code: l.journal_id?.code,
            ventilations: ventilations.map(v => ({
                ana_code: v.plan_analytique_id?.code,
                montant: v.montant
            }))
        });
    }
    return result;
};

// --- LOGIQUE D'IMPORTATION ---
exports.processMassiveImport = async (fileBuffer, exercice_id, companyId) => {
    const exercice = await CloudExercice.findOne({ localId: exercice_id, company_id: companyId.toString() }).lean();
    if (!exercice) throw new Error("Exercice cible introuvable.");

    const csvRaw = fileBuffer.toString('utf8').replace(/^\ufeff/, '');
    const lines = csvRaw.split(/\r?\n/).filter(line => line.trim() !== "").slice(1);
    if (lines.length === 0) throw new Error("Le fichier est vide.");

    const piecesGroupes = {};
    const rowsParsed = lines.map((line, index) => {
        const cols = line.split(';').map(c => c.trim().replace(/^"|"$/g, ''));
        if (cols.length < 12) return null;

        const [dateRaw, , type, , piece, , , , , , debit, credit] = cols;
        if (!piece) return null;

        const dateObj = formatToDate(dateRaw);
        if (!dateObj || dateObj < exercice.date_debut || dateObj > exercice.date_fin) {
            throw new Error(`LIGNE ${index + 2} : La date '${dateRaw}' est hors limites pour l'exercice.`);
        }

        if (!piecesGroupes[piece]) piecesGroupes[piece] = { soldeGeneral: 0 };
        if (type === 'G') {
            piecesGroupes[piece].soldeGeneral += (parseFloat(debit.replace(',', '.') || 0) - parseFloat(credit.replace(',', '.') || 0));
        }
        return cols;
    }).filter(r => r !== null);

    for (const [numPiece, data] of Object.entries(piecesGroupes)) {
        if (Math.abs(data.soldeGeneral) > 0.01) throw new Error(`ERREUR ÉQUILIBRE : La pièce n° ${numPiece} est déséquilibrée.`);
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        let lastEcritureId = null;
        let lastLigneId = null;
        let lastLigneMontant = 0;
        let cumulAna = 0;
        let currentPiece = null;

        for (const cols of rowsParsed) {
            const [dateRaw, echRaw, type, jCode, piece, facture, ref, numG, numT, libelle, debit, credit, anaSec] = cols;
            const dateSQL = formatToDate(dateRaw);
            const echSQL = formatToDate(echRaw);
            const dNum = parseFloat(debit.replace(',', '.') || 0);
            const cNum = parseFloat(credit.replace(',', '.') || 0);

            const journal = await CloudJournal.findOne({ code: jCode, company_id: companyId.toString() }).session(session);
            if (!journal) throw new Error(`Journal ${jCode} inconnu.`);

            if (type === 'G') {
                if (Math.abs(cumulAna - lastLigneMontant) > 0.01 && lastLigneId) throw new Error(`ERREUR ANALYTIQUE.`);
                
                if (piece !== currentPiece) {
                    lastEcritureId = `ECR-IMP-${Date.now()}-${piece}`;
                    await CloudEcriture.create([{
                        localId: lastEcritureId,
                        company_id: companyId.toString(),
                        journal_id: journal._id,
                        exercice_id: exercice_id,
                        date_ecriture: dateSQL,
                        piece: piece,
                        libelle: libelle.toUpperCase(),
                        sync_status: 'synced'
                    }], { session });
                    currentPiece = piece;
                }

                const compte = await CloudPlanComptable.findOne({ numero_compte: numG, company_id: companyId.toString() }).session(session);
                if (!compte) throw new Error(`Compte ${numG} introuvable.`);

                lastLigneId = `LIG-IMP-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
                lastLigneMontant = dNum || cNum;
                cumulAna = 0;

                await CloudLigneEcriture.create([{
                    localId: lastLigneId,
                    company_id: companyId.toString(),
                    ecriture_id: lastEcritureId,
                    journal_id: journal._id,
                    exercice_id: exercice_id,
                    date_ecriture: dateSQL,
                    date_echeance: echSQL,
                    piece: piece,
                    facture: facture || null,
                    reference: ref || null,
                    compte_id: compte._id,
                    num_compte: numG,
                    num_tiers: numT || null,
                    libelle: libelle.toUpperCase(),
                    debit: dNum,
                    credit: cNum,
                    sync_status: 'synced'
                }], { session });
            
            } else if (type === 'A') {
                const montantAna = dNum || cNum;
                cumulAna += montantAna;
                const section = await CloudPlanAnalytique.findOne({ code: anaSec, company_id: companyId.toString() }).session(session);
                
                if (section && lastLigneId) {
                    await CloudLigneAnalytique.create([{
                        company_id: companyId.toString(),
                        ligne_ecriture_id: lastLigneId,
                        plan_analytique_id: section._id,
                        departement_id: section.parent_dept_id,
                        num_compte: numG,
                        montant: montantAna,
                        sync_status: 'synced'
                    }], { session });
                }
            }
        }
        await session.commitTransaction();
        session.endSession();
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        throw err;
    }
};