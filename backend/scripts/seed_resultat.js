/**
 * Initialisation exhaustive du Compte de Résultat (Système Normal)
 * Basé sur le document officiel fourni.
 */
const seedCompteResultat = (db, companyId) => {
    const rubriquesResultat = [
        // --- MARGE COMMERCIALE ---
        { id: 'TA', code: 'TA', libelle: 'Ventes de marchandises', parent: null, ordre: 10 },
        { id: 'RA', code: 'RA', libelle: 'Achats de marchandises', parent: null, ordre: 20 },
        { id: 'RB', code: 'RB', libelle: 'Variation de stocks de marchandises', parent: null, ordre: 30 },
        { id: 'XA', code: 'XA', libelle: 'MARGE COMMERCIALE (Somme TA à RB)', parent: null, ordre: 40 },

        // --- CHIFFRE D'AFFAIRES ---
        { id: 'TB', code: 'TB', libelle: 'Ventes de produits fabriqués', parent: null, ordre: 50 },
        { id: 'TC', code: 'TC', libelle: 'Travaux, services vendus', parent: null, ordre: 60 },
        { id: 'TD', code: 'TD', libelle: 'Produits accessoires', parent: null, ordre: 70 },
        { id: 'XB', code: 'XB', libelle: "CHIFFRE D'AFFAIRES (A+B+C+D)", parent: null, ordre: 80 },

        // --- VALEUR AJOUTÉE ---
        { id: 'TE', code: 'TE', libelle: 'Production stockée (ou déstockage)', parent: null, ordre: 90 },
        { id: 'TF', code: 'TF', libelle: 'Production immobilisée', parent: null, ordre: 100 },
        { id: 'TG', code: 'TG', libelle: "Subvention d'exploitation", parent: null, ordre: 110 },
        { id: 'TH', code: 'TH', libelle: 'Autres produits', parent: null, ordre: 120 },
        { id: 'TI', code: 'TI', libelle: "Transfert de charges d'exploitation", parent: null, ordre: 130 },
        { id: 'RC', code: 'RC', libelle: 'Achats de matières et fournitures liées', parent: null, ordre: 140 },
        { id: 'RD', code: 'RD', libelle: 'Variation de stocks de matières et fournitures', parent: null, ordre: 150 },
        { id: 'RE', code: 'RE', libelle: 'Autres achats', parent: null, ordre: 160 },
        { id: 'RF', code: 'RF', libelle: "Variation de stocks d'autres approvisionnements", parent: null, ordre: 170 },
        { id: 'RG', code: 'RG', libelle: 'Transports', parent: null, ordre: 180 },
        { id: 'RH', code: 'RH', libelle: 'Services extérieurs', parent: null, ordre: 190 },
        { id: 'RI', code: 'RI', libelle: 'Impôts et taxes', parent: null, ordre: 200 },
        { id: 'RJ', code: 'RJ', libelle: 'Autres charges', parent: null, ordre: 210 },
        { id: 'XC', code: 'XC', libelle: 'VALEUR AJOUTÉE (XB+RA+RB) + (Somme TE à RJ)', parent: null, ordre: 220 },

        // --- EBE ---
        { id: 'RK', code: 'RK', libelle: 'Charges de personnel', parent: null, ordre: 230 },
        { id: 'XD', code: 'XD', libelle: "EXCÉDENT BRUT D'EXPLOITATION (XC+RK)", parent: null, ordre: 240 },

        // --- RÉSULTAT D'EXPLOITATION ---
        { id: 'TJ', code: 'TJ', libelle: 'Reprises d amortissements, provisions et dépréciations', parent: null, ordre: 250 },
        { id: 'RL', code: 'RL', libelle: 'Dotations aux amortissements, provisions et dépréciations', parent: null, ordre: 260 },
        { id: 'XE', code: 'XE', libelle: "RÉSULTAT D'EXPLOITATION (XD+TJ+RL)", parent: null, ordre: 270 },

        // --- RÉSULTAT FINANCIER ---
        { id: 'TK', code: 'TK', libelle: 'Revenus financiers et assimilés', parent: null, ordre: 280 },
        { id: 'TL', code: 'TL', libelle: 'Reprises de provisions et dépréciations financières', parent: null, ordre: 290 },
        { id: 'TM', code: 'TM', libelle: 'Transfert de charges financières', parent: null, ordre: 300 },
        { id: 'RM', code: 'RM', libelle: 'Frais financiers et charges assimilées', parent: null, ordre: 310 },
        { id: 'RN', code: 'RN', libelle: 'Dotations aux provisions et aux dépréciations financières', parent: null, ordre: 320 },
        { id: 'XF', code: 'XF', libelle: 'RÉSULTAT FINANCIER (Somme TK à RN)', parent: null, ordre: 330 },

        // --- RÉSULTAT DES ACTIVITÉS ORDINAIRES ---
        { id: 'XG', code: 'XG', libelle: 'RÉSULTAT DES ACTIVITÉS ORDINAIRES (XE+XF)', parent: null, ordre: 340 },

        // --- HORS ACTIVITÉS ORDINAIRES (HAO) ---
        { id: 'TN', code: 'TN', libelle: 'Produits des cessions d immobilisations', parent: null, ordre: 350 },
        { id: 'TO', code: 'TO', libelle: 'Autres produits HAO', parent: null, ordre: 360 },
        { id: 'RO', code: 'RO', libelle: 'Valeurs comptables des cessions d immobilisations', parent: null, ordre: 370 },
        { id: 'RP', code: 'RP', libelle: 'Autres charges HAO', parent: null, ordre: 380 },
        { id: 'XH', code: 'XH', libelle: 'RÉSULTAT HORS ACTIVITÉS ORDINAIRES (Somme TN à RP)', parent: null, ordre: 390 },

        // --- RÉSULTAT NET ---
        { id: 'RQ', code: 'RQ', libelle: 'Participation des travailleurs', parent: null, ordre: 400 },
        { id: 'RS', code: 'RS', libelle: 'Impôts sur le résultat', parent: null, ordre: 410 },
        { id: 'XI', code: 'XI', libelle: 'RÉSULTAT NET (XG+XH+RQ+RS)', parent: null, ordre: 420 }
    ];

    const insert = db.prepare(`
        INSERT OR IGNORE INTO rubriques_etats (id, company_id, code, libelle, type_etat, parent_id, ordre)
        VALUES (@id, @company_id, @code, @libelle, 'RESULTAT', @parent, @ordre)
    `);

    db.transaction(() => {
        for (const r of rubriquesResultat) {
            insert.run({ 
                id: r.id + "_" + companyId, 
                company_id: companyId, 
                code: r.code, 
                libelle: r.libelle, 
                parent: r.parent ? r.parent + "_" + companyId : null, 
                ordre: r.ordre 
            });
        }
    })();
    console.log("✅ Compte de Résultat complet initialisé.");
};

module.exports = { seedCompteResultat };