// backend/controllers/Rap_tafir.controller.js
const TafirService = require('../services/Rap_tafir.service');
const { CloudExercice, CloudPlanComptable, CloudReportANouveau, CloudLigneEcriture, CloudJournal } = require('../models/cloud.model');

// --- COMPTE DE RÉSULTAT ---
exports.getCompteResultat = async (req, res) => {
    const companyId = req.user?.company_id || req.user?.companyId;
    const { exerciceId, dateDebut, dateFin } = req.query;

    try {
        if (!companyId) return res.status(401).json({ success: false, error: "Session invalide." });
        if (!exerciceId) return res.status(400).json({ success: false, error: "ID Exercice manquant" });

        const cid = companyId.toString();
        const exInfo = await CloudExercice.findOne({ localId: exerciceId.toString(), company_id: cid }).lean();
        if (!exInfo) return res.status(400).json({ success: false, error: "Exercice introuvable" });

        const prevEx = await CloudExercice.findOne({
            company_id: cid,
            date_debut: { $lt: exInfo.date_debut }
        }).sort({ date_debut: -1 }).lean();

        // Journaux à exclure (RAN)
        const ranJournaux = await CloudJournal.find({
            company_id: cid,
            $or: [{ type_journal: 'RAN' }, { code: 'RAN' }]
        }, { localId: 1 }).lean();
        const ranJournalIds = ranJournaux.map(j => j.localId);

        const rowsN = await CloudPlanComptable.aggregate([
            {
                $match: {
                    company_id: cid,
                    numero_compte: { $regex: /^[6-8]/ }
                }
            },
            {
                $lookup: {
                    from: 'cloud_report_a_nouveaus',
                    let: { cptNum: '$numero_compte', cid: cid, exId: exerciceId.toString() },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ['$exercice_id', '$$exId'] },
                                        { $eq: ['$num_compte', '$$cptNum'] },
                                        { $eq: ['$company_id', '$$cid'] }
                                    ]
                                }
                            }
                        },
                        {
                            $group: {
                                _id: null,
                                total: { $sum: { $subtract: ['$montant_debit', '$montant_credit'] } }
                            }
                        }
                    ],
                    as: 'ran'
                }
            },
            {
                $lookup: {
                    from: 'cloud_ligne_ecritures',
                    let: { 
                        cptNum: '$numero_compte', 
                        cid: cid, 
                        exId: exerciceId.toString(), 
                        dStart: new Date(dateDebut), 
                        dEnd: new Date(dateFin + 'T23:59:59.999Z'), 
                        excludedJournals: ranJournalIds 
                    },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ['$num_compte', '$$cptNum'] },
                                        { $eq: ['$company_id', '$$cid'] },
                                        { $eq: ['$exercice_id', '$$exId'] },
                                        { $ne: ['$is_deleted', 1] },
                                        { $gte: ['$date_ecriture', '$$dStart'] },
                                        { $lte: ['$date_ecriture', '$$dEnd'] },
                                        { $not: { $in: ['$journal_id', '$$excludedJournals'] } }
                                    ]
                                }
                            }
                        },
                        {
                            $group: {
                                _id: null,
                                mov_debit: { $sum: '$debit' },
                                mov_credit: { $sum: '$credit' }
                            }
                        }
                    ],
                    as: 'mouvements'
                }
            },
            {
                $project: {
                    _id: 0,
                    numero_compte: 1,
                    ran: { $ifNull: [{ $arrayElemAt: ['$ran.total', 0] }, 0] },
                    mov_debit: { $ifNull: [{ $arrayElemAt: ['$mouvements.mov_debit', 0] }, 0] },
                    mov_credit: { $ifNull: [{ $arrayElemAt: ['$mouvements.mov_credit', 0] }, 0] }
                }
            }
        ]);
        
        const soldesN = {};
        const soldesN1 = {};

        rowsN.forEach(row => {
            const num = row.numero_compte.toString().trim();
            soldesN[num] = (row.ran + (row.mov_debit - row.mov_credit));
        });

        if (prevEx) {
            const linesN1 = await CloudLigneEcriture.aggregate([
                {
                    $match: {
                        exercice_id: prevEx.localId,
                        company_id: cid,
                        is_deleted: { $ne: 1 },
                        num_compte: { $regex: /^[6-8]/ }
                    }
                },
                {
                    $group: {
                        _id: '$num_compte',
                        solde: { $sum: { $subtract: ['$debit', '$credit'] } }
                    }
                }
            ]);

            linesN1.forEach(r => {
                soldesN1[r._id.toString().trim()] = r.solde;
            });
        }

        const generateData = (soldes) => {
            const v = {};
            const prod = (p) => TafirService.calculerRubrique(soldes, p) * -1;
            const chrg = (p) => {
                const val = TafirService.calculerRubrique(soldes, p);
                return val === 0 ? 0 : -Math.abs(val);
            };
            const vstock = (p) => TafirService.calculerRubrique(soldes, p) * -1;

            v.TA = prod('701'); v.RA = chrg('601'); v.RB = vstock('6031');
            v.XA = v.TA + v.RA + v.RB;
            v.TB = prod(['702', '703', '704']); v.TC = prod(['705', '706']); v.TD = prod('707');
            v.XB = v.TA + v.TB + v.TC + v.TD;
            v.TE = prod('73'); v.TF = prod('72'); v.TG = prod('71'); v.TH = prod('75'); v.TI = prod('781');
            v.RC = chrg('602'); v.RD = vstock('6032'); v.RE = chrg(['604', '605', '608']); v.RF = vstock('6033');
            v.RG = chrg('61'); v.RH = chrg(['62', '63']); v.RI = chrg('64'); v.RJ = chrg('65');
            v.XC = v.XB + v.RA + v.RB + v.TE + v.TF + v.TG + v.TH + v.TI + v.RC + v.RD + v.RE + v.RF + v.RG + v.RH + v.RI + v.RJ;
            v.RK = chrg('66'); v.XD = v.XC + v.RK;
            v.TJ = prod(['791', '798', '799']); v.RL = chrg(['681', '691']); v.XE = v.XD + v.TJ + v.RL;
            v.TK = prod('77'); v.TL = prod('797'); v.TM = prod('787'); v.RM = chrg('67'); v.RN = chrg('697');
            v.XF = v.TK + v.TL + v.TM + v.RM + v.RN;
            v.XG = v.XE + v.XF;
            v.TN = prod('82'); v.TO = prod(['84', '86', '88']); v.RO = chrg('81'); v.RP = chrg(['83', '85']);
            v.XH = v.TN + v.TO + v.RO + v.RP;
            v.RQ = chrg('87'); v.RS = chrg('89'); v.XI = v.XG + v.XH + v.RQ + v.RS;
            return v;
        };

        const fN = generateData(soldesN);
        const fN1 = generateData(soldesN1);

        const fullMapping = [
            { code: 'TA', libelle: 'Ventes de marchandises', n: fN.TA, n1: fN1.TA },
            { code: 'RA', libelle: 'Achats de marchandises', n: fN.RA, n1: fN1.RA },
            { code: 'RB', libelle: 'Variation de stocks de marchandises', n: fN.RB, n1: fN1.RB },
            { code: 'XA', libelle: 'MARGE COMMERCIALE (I)', n: fN.XA, n1: fN1.XA },
            { code: 'TB', libelle: 'Ventes de produits fabriqués', n: fN.TB, n1: fN1.TB },
            { code: 'TC', libelle: 'Travaux, services vendus', n: fN.TC, n1: fN1.TC },
            { code: 'TD', libelle: 'Produits accessoires', n: fN.TD, n1: fN1.TD },
            { code: 'XB', libelle: "CHIFFRE D'AFFAIRES (A+B+C+D)", n: fN.XB, n1: fN1.XB },
            { code: 'TE', libelle: 'Production stockée (ou déstockage)', n: fN.TE, n1: fN1.TE },
            { code: 'TF', libelle: 'Production immobilisée', n: fN.TF, n1: fN1.TF },
            { code: 'TG', libelle: "Subventions d'exploitation reçues", n: fN.TG, n1: fN1.TG },
            { code: 'TH', libelle: "Autres produits d'exploitation", n: fN.TH, n1: fN1.TH },
            { code: 'TI', libelle: "Transferts de charges d'exploitation", n: fN.TI, n1: fN1.TI },
            { code: 'RC', libelle: 'Achats de matières premières et fournitures liées', n: fN.RC, n1: fN1.RC },
            { code: 'RD', libelle: 'Variation de stocks de matières premières', n: fN.RD, n1: fN1.RD },
            { code: 'RE', libelle: 'Autres achats et charges externes', n: fN.RE, n1: fN1.RE },
            { code: 'RF', libelle: "Variation de stocks d'autres approvisionnements", n: fN.RF, n1: fN1.RF },
            { code: 'RG', libelle: 'Transports', n: fN.RG, n1: fN1.RG },
            { code: 'RH', libelle: 'Services extérieurs', n: fN.RH, n1: fN1.RH },
            { code: 'RI', libelle: 'Impôts et taxes', n: fN.RI, n1: fN1.RI },
            { code: 'RJ', libelle: "Autres charges d'exploitation", n: fN.RJ, n1: fN1.RJ },
            { code: 'XC', libelle: 'VALEUR AJOUTÉE (XB + RA + RB + Somme TE à RJ)', n: fN.XC, n1: fN1.XC },
            { code: 'RK', libelle: 'Charges de personnel', n: fN.RK, n1: fN1.RK },
            { code: 'XD', libelle: "EXCÉDENT BRUT D'EXPLOITATION (XC + RK)", n: fN.XD, n1: fN1.XD },
            { code: 'TJ', libelle: "Reprises d'amortissements, provisions et dépréciations", n: fN.TJ, n1: fN1.TJ },
            { code: 'RL', libelle: 'Dotations aux amortissements, aux provisions et dépréciations', n: fN.RL, n1: fN1.RL },
            { code: 'XE', libelle: "RÉSULTAT D'EXPLOITATION (XD + TJ + RL)", n: fN.XE, n1: fN1.XE },
            { code: 'TK', libelle: 'Revenus financiers et assimilés', n: fN.TK, n1: fN1.TK },
            { code: 'TL', libelle: 'Reprises de provisions et dépréciations financières', n: fN.TL, n1: fN1.TL },
            { code: 'TM', libelle: 'Transferts de charges financières', n: fN.TM, n1: fN1.TM },
            { code: 'RM', libelle: 'Frais financiers et charges assimilées', n: fN.RM, n1: fN1.RM },
            { code: 'RN', libelle: 'Dotations aux provisions et aux dépréciations financières', n: fN.RN, n1: fN1.RN },
            { code: 'XF', libelle: 'RÉSULTAT FINANCIER (Somme TK à RN)', n: fN.XF, n1: fN1.XF },
            { code: 'XG', libelle: 'RÉSULTAT DES ACTIVITÉS ORDINAIRES (XE + XF)', n: fN.XG, n1: fN1.XG },
            { code: 'TN', libelle: "Produits des cessions d'immobilisations", n: fN.TN, n1: fN1.TN },
            { code: 'TO', libelle: 'Autres produits HAO', n: fN.TO, n1: fN1.TO },
            { code: 'RO', libelle: "Valeurs comptables des cessions d'immobilisations", n: fN.RO, n1: fN1.RO },
            { code: 'RP', libelle: 'Autres charges HAO', n: fN.RP, n1: fN1.RP },
            { code: 'XH', libelle: 'RÉSULTAT HORS ACTIVITÉS ORDINAIRES (VIII)', n: fN.XH, n1: fN1.XH },
            { code: 'RQ', libelle: 'Participation des travailleurs', n: fN.RQ, n1: fN1.RQ },
            { code: 'RS', libelle: 'Impôts sur le résultat', n: fN.RS, n1: fN1.RS },
            { code: 'XI', libelle: 'RÉSULTAT NET (IX)', n: fN.XI, n1: fN1.XI }
        ];

        res.json({ success: true, data: fullMapping.map(m => ({ code: m.code, libelle: m.libelle, montant_n: m.n, montant_prec: m.n1 }))});
    } catch (err) { 
        console.error("❌ Erreur getCompteResultat:", err.message);
        res.status(500).json({ success: false, error: err.message }); 
    }
};

// --- TABLEAU DES FLUX DE TRÉSORERIE (TFT) ---
exports.getTFT = async (req, res) => {
    const companyId = req.user?.company_id || req.user?.companyId;
    const { exerciceId, dateDebut, dateFin } = req.query;

    try {
        if (!companyId) return res.status(401).json({ success: false, error: "Session invalide." });
        if (!exerciceId) return res.status(400).json({ success: false, error: "ID Exercice manquant" });

        const cid = companyId.toString();

        const ranJournaux = await CloudJournal.find({
            company_id: cid,
            $or: [{ type_journal: 'RAN' }, { code: 'RAN' }]
        }, { localId: 1 }).lean();
        const ranJournalIds = ranJournaux.map(j => j.localId);

        const fetchBalanceForEx = async (exId, dStart, dEnd) => {
            return await CloudPlanComptable.aggregate([
                { $match: { company_id: cid } },
                {
                    $lookup: {
                        from: 'cloud_report_a_nouveaus',
                        let: { cptNum: '$numero_compte', cid: cid, exId: exId.toString() },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ['$exercice_id', '$$exId'] },
                                            { $eq: ['$num_compte', '$$cptNum'] },
                                            { $eq: ['$company_id', '$$cid'] }
                                        ]
                                    }
                                }
                            },
                            {
                                $group: {
                                    _id: null,
                                    total: { $sum: { $subtract: ['$montant_debit', '$montant_credit'] } }
                                }
                            }
                        ],
                        as: 'ran'
                    }
                },
                ...(dStart && dEnd ? [{
                    $lookup: {
                        from: 'cloud_ligne_ecritures',
                        let: { cptNum: '$numero_compte', cid: cid, exId: exId.toString(), startDate: new Date(dStart), endDate: new Date(dEnd + 'T23:59:59.999Z'), excludedJournals: ranJournalIds },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ['$num_compte', '$$cptNum'] },
                                            { $eq: ['$company_id', '$$cid'] },
                                            { $eq: ['$exercice_id', '$$exId'] },
                                            { $ne: ['$is_deleted', 1] },
                                            { $gte: ['$date_ecriture', '$$startDate'] },
                                            { $lte: ['$date_ecriture', '$$endDate'] },
                                            { $not: { $in: ['$journal_id', '$$excludedJournals'] } }
                                        ]
                                    }
                                }
                            },
                            {
                                $group: {
                                    _id: null,
                                    mov_debit: { $sum: '$debit' },
                                    mov_credit: { $sum: '$credit' }
                                }
                            }
                        ],
                        as: 'mouvements'
                    }
                }] : [{
                    $lookup: {
                        from: 'cloud_ligne_ecritures',
                        let: { cptNum: '$numero_compte', cid: cid, exId: exId.toString(), excludedJournals: ranJournalIds },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ['$num_compte', '$$cptNum'] },
                                            { $eq: ['$company_id', '$$cid'] },
                                            { $eq: ['$exercice_id', '$$exId'] },
                                            { $ne: ['$is_deleted', 1] },
                                            { $not: { $in: ['$journal_id', '$$excludedJournals'] } }
                                        ]
                                    }
                                }
                            },
                            {
                                $group: {
                                    _id: null,
                                    mov_debit: { $sum: '$debit' },
                                    mov_credit: { $sum: '$credit' }
                                }
                            }
                        ],
                        as: 'mouvements'
                    }
                }]),
                {
                    $project: {
                        _id: 0,
                        numero_compte: 1,
                        ran: { $ifNull: [{ $arrayElemAt: ['$ran.total', 0] }, 0] },
                        mov_debit: { $ifNull: [{ $arrayElemAt: ['$mouvements.mov_debit', 0] }, 0] },
                        mov_credit: { $ifNull: [{ $arrayElemAt: ['$mouvements.mov_credit', 0] }, 0] }
                    }
                }
            ]);
        };

        const rows = await fetchBalanceForEx(exerciceId, dateDebut, dateFin);
        
        const sN = {}; const sN1 = {};
        rows.forEach(r => {
            const num = r.numero_compte.trim();
            sN[num] = (r.ran + (r.mov_debit - r.mov_credit)); 
            sN1[num] = r.ran; 
        });

        let sN_prec = {}; let sN1_prec = {}; let rowsPrec = []; 
        try {
            const currentEx = await CloudExercice.findOne({ localId: exerciceId.toString(), company_id: cid }).lean();
            if (currentEx) {
                const prevEx = await CloudExercice.findOne({
                    company_id: cid,
                    date_debut: { $lt: currentEx.date_debut }
                }).sort({ date_debut: -1 }).lean();

                if (prevEx) {
                    rowsPrec = await fetchBalanceForEx(prevEx.localId, null, null);
                    rowsPrec.forEach(rp => {
                        const numP = rp.numero_compte.trim();
                        sN_prec[numP] = (rp.ran + (rp.mov_debit - rp.mov_credit));
                        sN1_prec[numP] = rp.ran;
                    });
                }
            }
        } catch (e) { console.error("Erreur import N-1 TFT:", e.message); }

        const fN = TafirService.generateTFTData(sN, sN1, rows);
        const fN1 = rowsPrec.length > 0 ? TafirService.generateTFTData(sN_prec, sN1_prec, rowsPrec) : {};

        const mapping = [
            { code: 'ZA', libelle: 'Trésorerie nette au 1er Janvier', n: fN.ZA, n1: fN1.ZA || 0 },
            { code: 'FA', libelle: "Capacité d'Autofinancement", n: fN.FA, n1: fN1.FA || 0 },
            { code: 'FB', libelle: '- Actif circulant HAO', n: fN.FB, n1: fN1.FB || 0 },
            { code: 'FC', libelle: '- Variation des stocks', n: fN.FC, n1: fN1.FC || 0 },
            { code: 'FD', libelle: '- Variation des créances', n: fN.FD, n1: fN1.FD || 0 },
            { code: 'FE', libelle: '+ Variation du passif circulant', n: fN.FE, n1: fN1.FE || 0 },
            { code: 'BFR', libelle: 'Variation du BFR opérationnel', n: fN.BFR, n1: fN1.BFR || 0 },
            { code: 'ZB', libelle: 'Flux de trésorerie des activités opérationnelles (A)', n: fN.ZB, n1: fN1.ZB || 0 },
            { code: 'FF', libelle: "- Acquisitions d'immobilisations incorporelles", n: fN.FF, n1: fN1.FF || 0 },
            { code: 'FG', libelle: "- Acquisitions d'immobilisations corporelles", n: fN.FG, n1: fN1.FG || 0 },
            { code: 'FI', libelle: "+ Cessions d'immobilisations", n: fN.FI, n1: fN1.FI || 0 },
            { code: 'ZC', libelle: "Flux de trésorerie des opérations d'investissements (B)", n: fN.ZC, n1: fN1.ZC || 0 },
            { code: 'FK', libelle: '+ Augmentations de capital', n: fN.FK, n1: fN1.FK || 0 },
            { code: 'FL', libelle: "+ Subventions d'investissement reçues", n: fN.FL, n1: fN1.FL || 0 },
            { code: 'FM', libelle: '- Prélèvements sur le capital', n: fN.FM, n1: fN1.FM || 0 },
            { code: 'FN', libelle: '- Dividendes versés', n: fN.FN, n1: fN1.FN || 0 },
            { code: 'ZD', libelle: 'Flux de trésorerie des capitaux propres (D)', n: fN.ZD, n1: fN1.ZD || 0 },
            { code: 'FO', libelle: '+ Emprunts nouveaux', n: fN.FO, n1: fN1.FO || 0 },
            { code: 'FQ', libelle: "- Remboursements d'emprunts", n: fN.FQ, n1: fN1.FQ || 0 },
            { code: 'ZE', libelle: 'Flux de trésorerie des capitaux étrangers (E)', n: fN.ZE, n1: fN1.ZE || 0 },
            { code: 'ZF', libelle: 'Flux de trésorerie des financements (C=D+E)', n: fN.ZF, n1: fN1.ZF || 0 },
            { code: 'ZG', libelle: 'VARIATION DE LA TRESORERIE NETTE (A+B+C)', n: fN.ZG, n1: fN1.ZG || 0 },
            { code: 'ZH', libelle: 'Trésorerie nette au 31 Décembre (ZA+ZG)', n: fN.ZH, n1: fN1.ZH || 0 }
        ];

        res.json({ success: true, data: mapping.map(m => ({ code: m.code, libelle: m.libelle, montant_n: m.n, montant_prec: m.n1 })) });
    } catch (err) { 
        console.error("❌ Erreur getTFT:", err.message);
        res.status(500).json({ success: false, error: err.message }); 
    }
};