const { getDb } = require('../config/database');

class TafirService {
    /**
     * Calcule une rubrique basée sur des préfixes de comptes
     */
    calculerRubrique(soldesObj, prefixes) {
        let total = 0;
        const prefixList = Array.isArray(prefixes) ? prefixes : [prefixes];
        Object.keys(soldesObj).forEach(num => {
            if (prefixList.some(p => num.startsWith(p))) {
                total += (soldesObj[num] || 0);
            }
        });
        return total;
    }

    /**
     * Logique de génération des données du TFT (Tableau des Flux de Trésorerie)
     */
    generateTFTData(s, s_ran, targetRows) {
        const v = {};
        const calc = (obj, pref) => this.calculerRubrique(obj, pref);

        const getMovBroad = (pref, sens, rows) => {
            let total = 0;
            rows.forEach(r => { 
                if (r.numero_compte.startsWith(pref)) {
                    total += (sens === 'D' ? r.mov_debit : r.mov_credit);
                }
            });
            return total;
        };

        // --- CALCULS DU TFT ---
        v.ZA = calc(s_ran, ['52', '53', '57', '58']) - Math.abs(calc(s_ran, '56'));
        const EBE = (calc(s, ['70', '71', '72']) * -1) - calc(s, ['60', '61', '62', '63', '64', '66']);
        v.FA = EBE + (calc(s, ['75', '77']) * -1) - calc(s, ['65', '67', '81', '89']);
        
        v.FB = (calc(s, ['485', '488']) - calc(s_ran, ['485', '488'])) * -1; 
        v.FC = (calc(s, '3') - calc(s_ran, '3')) * -1; 
        v.FD = (calc(s, ['41', '471', '472']) - calc(s_ran, ['41', '471', '472'])) * -1;
        v.FE = (calc(s_ran, ['40', '42', '43', '44', '46', '479'])) - (calc(s, ['40', '42', '43', '44', '46', '479']));

        v.BFR = v.FB + v.FC + v.FD + v.FE;
        v.ZB = v.FA + v.BFR; 

        v.FF = (calc(s, '21') - calc(s_ran, '21')) * -1; 
        v.FG = (calc(s, ['22', '23', '24']) - calc(s_ran, ['22', '23', '24'])) * -1; 
        v.FI = (calc(s, '754') * -1); 
        v.ZC = v.FF + v.FG + v.FI;

        v.FK = getMovBroad('10', 'C', targetRows); 
        v.FL = getMovBroad('14', 'C', targetRows);
        v.FM = (getMovBroad('10', 'D', targetRows) + getMovBroad('109', 'D', targetRows)) * -1; 
        v.FN = getMovBroad('12', 'D', targetRows) * -1;
        v.ZD = v.FK + v.FL + v.FM + v.FN; 

        v.FO = getMovBroad('16', 'C', targetRows);
        v.FQ = (getMovBroad('16', 'D', targetRows)) * -1;
        v.ZE = v.FO + v.FQ; 

        v.ZF = v.ZD + v.ZE; 
        v.ZG = v.ZB + v.ZC + v.ZF; 
        v.ZH = v.ZA + v.ZG; 
        
        return v;
    }
}

module.exports = new TafirService();