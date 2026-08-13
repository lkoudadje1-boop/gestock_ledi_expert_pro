// backend/controllers/Rap_Bilan.controller.js
const BilanService = require('../services/Rap_Bilan.service');
const { CloudRubriqueEtat } = require('../models/cloud.model');

// --- RÉCUPÉRATION DU BILAN (ACTIF) ---
exports.getBilan = async (req, res) => {
    const companyId = req.user?.company_id || req.user?.companyId;
    const { exerciceId, dateDebut, dateFin } = req.query;

    try {
        if (!companyId) return res.status(401).json({ success: false, error: "Session invalide." });
        if (!exerciceId) return res.status(400).json({ success: false, error: "ID Exercice manquant" });

        const rows = await BilanService.getRawBalance(exerciceId, companyId, dateDebut, dateFin);
        const prevValues = await BilanService.getPrevYearValues(exerciceId, companyId);
        const rubValues = {};

        rows.forEach(row => {
            const numStr = row.numero_compte.toString().trim();
            const n = parseInt(numStr.padEnd(8, '0'));
            const soldeTotal = (row.ran || 0) + (row.mov_debit - row.mov_credit);
            const isAmortOuProv = numStr.startsWith('28') || numStr.startsWith('29') || numStr.startsWith('39') || numStr.startsWith('49');

            function getRubrique(numStr, n, solde) {
                if (numStr.startsWith('211') || numStr.startsWith('2811')) return 'AE';
                if (numStr.startsWith('212') || numStr.startsWith('2812')) return 'AF';
                if (numStr.startsWith('22')) return 'AJ';
                if (numStr.startsWith('234') || numStr.startsWith('2834') || numStr.startsWith('23')) return 'AK';
                if (numStr.startsWith('241') || numStr.startsWith('2841')) return 'AM';
                if (numStr.startsWith('245') || numStr.startsWith('2845')) return 'AN';

                if (solde > 0 || isAmortOuProv) {
                    if (numStr.startsWith('25') || numStr.startsWith('295')) return 'AP';
                    if (numStr.startsWith('26') || numStr.startsWith('27')) return 'AQ';
                    if (numStr.startsWith('3') || numStr.startsWith('39')) return 'BB';
                    if (numStr.startsWith('411') || numStr.startsWith('491')) return 'BI';
                    if (numStr.startsWith('5')) return 'BS';
                    if (numStr.startsWith('4') && !numStr.startsWith('40')) return 'BJ';
                } else {
                    if (numStr.startsWith('10')) return 'CA';
                    if (numStr.startsWith('11')) return 'CF';
                    if (numStr.startsWith('12')) return 'CH';
                    if (numStr.startsWith('13')) return 'CJ';
                    if (numStr.startsWith('16')) return 'DA';
                    if (numStr.startsWith('401')) return 'DJ';
                    if (numStr.startsWith('419')) return 'DP';
                    if (numStr.startsWith('16')) return 'DQ';
                }
                return null;
            }

            let rub = getRubrique(numStr, n, soldeTotal); 
            if (!rub) return;
            if (!rubValues[rub]) rubValues[rub] = { brut: 0, amort: 0, n_1: 0 };

            if (isAmortOuProv) rubValues[rub].amort += Math.abs(soldeTotal);
            else rubValues[rub].brut += soldeTotal;
            
            if (prevValues[numStr] !== undefined) rubValues[rub].n_1 += prevValues[numStr];
        });

        const calculate = (code) => {
            let res = { brut: 0, amort: 0, n_1: 0 };
            const add = (list) => list.forEach(c => { 
                const v = calculate(c); res.brut += v.brut; res.amort += v.amort; res.n_1 += v.n_1;
            });
            switch(code) {
                case 'AD': add(['AE', 'AF', 'AG', 'AH']); break;
                case 'AI': add(['AJ', 'AK', 'AL', 'AM', 'AN']); break;
                case 'AQ': add(['AR', 'AS']); break;
                case 'AZ': add(['AD', 'AI', 'AP', 'AQ']); break;
                case 'BG': add(['BH', 'BI', 'BJ']); break;
                case 'BK': add(['BA', 'BB', 'BG']); break;
                case 'BT': add(['BQ', 'BR', 'BS']); break;
                case 'BZ': add(['AZ', 'BK', 'BT', 'BU']); break;
                case 'DZ': add(['CP', 'DF', 'DQ', 'DR', 'DS']); break;
                default: res = rubValues[code] || { brut: 0, amort: 0, n_1: 0 };
            }
            return res;
        };

        const structure = await CloudRubriqueEtat.find({ company_id: companyId.toString() }).sort({ ordre: 1 }).lean();
        const results = structure.map(r => {
            const v = calculate(r.code);
            return {
                ...r,
                montant_brut: v.brut, montant_amort: v.amort,
                montant_net: v.brut - v.amort, montant_prec: Math.abs(v.n_1)
            };
        });

        res.json({ 
            actif: results.filter(x => x.type_etat === 'BILAN'), 
            passif: results.filter(x => x.type_etat === 'PASSIF') 
        });

    } catch (err) { 
        console.error("❌ Erreur getBilan:", err.message);
        res.status(500).json({ success: false, error: err.message }); 
    }
};

// --- RÉCUPÉRATION DU PASSIF DÉTAILLÉ ---
exports.getPassif = async (req, res) => {
    const companyId = req.user?.company_id || req.user?.companyId;
    const { exerciceId, dateDebut, dateFin } = req.query;

    try {
        if (!companyId) return res.status(401).json({ success: false, error: "Session invalide." });
        if (!exerciceId) return res.status(400).json({ success: false, error: "ID Exercice manquant" });

        // 1. RESULTAT NET N
        const resN = await BilanService.getCalculResultatNetN(exerciceId, companyId, dateDebut, dateFin);
        const resultatNetN = (resN || 0) * -1;

        // 2. RESULTAT NET N-1
        const resN1 = await BilanService.getCalculResultatNetN1(exerciceId, companyId);
        const resultatNetN1 = (resN1 || 0) * -1;

        // 3. COMPTES DE BILAN
        const rows = await BilanService.getRawBalance(exerciceId, companyId, dateDebut, dateFin);

        const vN = {}; const vN1 = {};
        const codes = ['CA','CB','CD','CE','CF','CG','CH','CI','CJ','CL','CM','DA','DB','DC','DH','DI','DJ','DK','DM','DN','DQ','DR','DV'];
        codes.forEach(c => { vN[c] = 0; vN1[c] = 0; });

        vN['CJ'] = resultatNetN;
        vN1['CJ'] = resultatNetN1;

        rows.forEach(row => {
            const num8 = row.numero_compte.toString().trim().padEnd(8, '0');
            const soldeBrutN = (row.ran || 0) + (row.mov_debit - row.mov_credit);
            const soldeBrutN1 = (row.ran || 0);

            const process = (code, valN, valN1) => {
                if (valN < 0 || num8.startsWith('1')) vN[code] += (valN * -1);
                if (valN1 < 0 || num8.startsWith('1')) vN1[code] += (valN1 * -1);
            };

            if (num8 >= '10100000' && num8 <= '10480000') process('CA', soldeBrutN, soldeBrutN1);
            else if (num8.startsWith('109')) process('CB', soldeBrutN, soldeBrutN1);
            else if (num8.startsWith('105')) process('CD', soldeBrutN, soldeBrutN1);
            else if (num8.startsWith('106')) process('CE', soldeBrutN, soldeBrutN1);
            else if (num8 >= '11100000' && num8 <= '11380000') process('CF', soldeBrutN, soldeBrutN1);
            else if (num8.startsWith('118')) process('CG', soldeBrutN, soldeBrutN1);
            else if (num8.startsWith('12')) process('CH', soldeBrutN, soldeBrutN1);
            else if (num8.startsWith('14')) process('CL', soldeBrutN, soldeBrutN1);
            else if (num8.startsWith('15')) process('CM', soldeBrutN, soldeBrutN1);
            else if (num8.startsWith('16')) process('DA', soldeBrutN, soldeBrutN1);
            else if (num8.startsWith('17')) process('DB', soldeBrutN, soldeBrutN1);
            else if (num8.startsWith('19')) process('DC', soldeBrutN, soldeBrutN1);
            else if (num8.startsWith('48')) process('DH', soldeBrutN, soldeBrutN1);
            else if (num8.startsWith('419')) process('DI', soldeBrutN, soldeBrutN1);
            else if (num8.startsWith('40')) process('DJ', soldeBrutN, soldeBrutN1);
            else if (/^42|^43|^44/.test(num8)) process('DK', soldeBrutN, soldeBrutN1);
            else if (/^45|^46|^47/.test(num8) && !num8.startsWith('479')) process('DM', soldeBrutN, soldeBrutN1);
            else if (num8.startsWith('49')) process('DN', soldeBrutN, soldeBrutN1);
            else if (/^564|^565/.test(num8)) process('DQ', soldeBrutN, soldeBrutN1);
            else if (/^52|^53|^561|^566/.test(num8)) process('DR', soldeBrutN, soldeBrutN1);
            else if (num8.startsWith('479')) process('DV', soldeBrutN, soldeBrutN1);
        });

        const sum = (v) => {
            const CP = v.CA+v.CB+v.CD+v.CE+v.CF+v.CG+v.CH+v.CJ+v.CL+v.CM;
            const DD = v.DA+v.DB+v.DC;
            const DF = CP + DD;
            const DP = v.DH+v.DI+v.DJ+v.DK+v.DM+v.DN;
            const DT = v.DQ+v.DR;
            return { CP, DD, DF, DP, DT, DZ: DF + DP + DT + v.DV };
        };

        const tN = sum(vN); const tN1 = sum(vN1);

        const resStructure = [
            { code: 'CA', libelle: 'Capital', n: vN.CA, n1: vN1.CA },
            { code: 'CB', libelle: 'Apporteurs capital non appelé (-)', n: vN.CB, n1: vN1.CB },
            { code: 'CD', libelle: 'Primes liées au capital social', n: vN.CD, n1: vN1.CD },
            { code: 'CE', libelle: 'Écarts de réévaluation', n: vN.CE, n1: vN1.CE },
            { code: 'CF', libelle: 'Réserves indisponibles', n: vN.CF, n1: vN1.CF },
            { code: 'CG', libelle: 'Réserves libres', n: vN.CG, n1: vN1.CG },
            { code: 'CH', libelle: 'Report à nouveau (+ ou -)', n: vN.CH, n1: vN1.CH },
            { code: 'CJ', libelle: "Résultat net de l'exercice (Bénéfice + ou Perte -)", n: vN.CJ, n1: vN1.CJ },
            { code: 'CL', libelle: "Subventions d'investissement", n: vN.CL, n1: vN1.CL },
            { code: 'CM', libelle: 'Provisions réglementées', n: vN.CM, n1: vN1.CM },
            { code: 'CP', libelle: 'TOTAL CAPITAUX PROPRES ET RESSOURCES ASSIMILEES', n: tN.CP, n1: tN1.CP },
            { code: 'DA', libelle: 'Emprunts et dettes financières diverses', n: vN.DA, n1: vN1.DA },
            { code: 'DB', libelle: 'Dettes de location-acquisition', n: vN.DB, n1: vN1.DB },
            { code: 'DC', libelle: 'Provisions pour risques et charges', n: vN.DC, n1: vN1.DC },
            { code: 'DD', libelle: 'TOTAL DETTES FINANCIERES', n: tN.DD, n1: tN1.DD },
            { code: 'DF', libelle: 'TOTAL RESSOURCES STABLES', n: tN.DF, n1: tN1.DF },
            { code: 'DH', libelle: 'Dettes circulantes HAO', n: vN.DH, n1: vN1.DH },
            { code: 'DI', libelle: 'Clients, avances reçues', n: vN.DI, n1: vN1.DI },
            { code: 'DJ', libelle: "Fournisseurs d'exploitation", n: vN.DJ, n1: vN1.DJ },
            { code: 'DK', libelle: 'Dettes fiscales et sociales', n: vN.DK, n1: vN1.DK },
            { code: 'DM', libelle: 'Autres dettes', n: vN.DM, n1: vN1.DM },
            { code: 'DN', libelle: 'Provisions pour risques et charges à court terme', n: vN.DN, n1: vN1.DN },
            { code: 'DP', libelle: 'TOTAL PASSIF CIRCULANT', n: tN.DP, n1: tN1.DP },
            { code: 'DQ', libelle: "Banques, crédits d'escompte", n: vN.DQ, n1: vN1.DQ },
            { code: 'DR', libelle: 'Banques, établissements financiers et crédits de trésorerie', n: vN.DR, n1: vN1.DR },
            { code: 'DT', libelle: 'TOTAL TRESORERIE-PASSIF', n: tN.DT, n1: tN1.DT },
            { code: 'DV', libelle: 'Ecart de conversion-Passif', n: vN.DV, n1: vN1.DV },
            { code: 'DZ', libelle: 'TOTAL GENERAL', n: tN.DZ, n1: tN1.DZ }
        ];

        res.json({ success: true, passif: resStructure.map(s => ({ 
            code: s.code, libelle: s.libelle, montant_net: s.n, montant_prec: s.n1 
        }))});

    } catch (err) { 
        console.error("❌ Erreur getPassif:", err.message);
        res.status(500).json({ success: false, error: err.message }); 
    }
};