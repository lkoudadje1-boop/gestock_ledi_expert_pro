/**
 * Initialisation complète du Tableau des Flux de Trésorerie (TFT)
 * Basé sur le document officiel fourni.
 */
const seedTFT = (db, companyId) => {
    const rubriquesTFT = [
        // --- TRESORERIE INITIALE ---
        { id: 'ZA', code: 'ZA', libelle: 'Trésorerie nette au 1er janvier', parent: null, ordre: 10 },

        // --- FLUX OPERATIONNELS ---
        { id: 'FA', code: 'FA', libelle: 'Capacité d Autofinancement Global (CAFG)', parent: null, ordre: 20 },
        { id: 'FB', code: 'FB', libelle: '- Actif circulant HAO (1)', parent: null, ordre: 30 },
        { id: 'FC', code: 'FC', libelle: '- Variation des stocks', parent: null, ordre: 40 },
        { id: 'FD', code: 'FD', libelle: '- Variation des créances', parent: null, ordre: 50 },
        { id: 'FE', code: 'FE', libelle: '+ Variation du passif circulant (1)', parent: null, ordre: 60 },
        { id: 'ZB', code: 'ZB', libelle: 'Flux de trésorerie provenant des activités opérationnelles (Somme FA à FE)', parent: null, ordre: 70 },

        // --- FLUX D'INVESTISSEMENT ---
        { id: 'FF', code: 'FF', libelle: '- Décaissements liés aux acquisitions d immobilisations incorporelles', parent: null, ordre: 80 },
        { id: 'FG', code: 'FG', libelle: '- Décaissements liés aux acquisitions d immobilisations corporelles', parent: null, ordre: 90 },
        { id: 'FH', code: 'FH', libelle: '- Décaissements liés aux acquisitions d immobilisations financières', parent: null, ordre: 100 },
        { id: 'FI', code: 'FI', libelle: '+ Encaissements liés aux cessions d immobilisations', parent: null, ordre: 110 },
        { id: 'FJ', code: 'FJ', libelle: '+ Encaissements liés aux cessions d immobilisations financières', parent: null, ordre: 120 },
        { id: 'ZC', code: 'ZC', libelle: 'Flux de trésorerie provenant des opérations d investissement (Somme FF à FJ)', parent: null, ordre: 130 },

        // --- FLUX DE FINANCEMENT (CAPITAUX PROPRES) ---
        { id: 'FK', code: 'FK', libelle: '+ Augmentation de capital par apports nouveaux', parent: null, ordre: 140 },
        { id: 'FL', code: 'FL', libelle: '+ Subventions d investissement reçues', parent: null, ordre: 150 },
        { id: 'FM', code: 'FM', libelle: '- Prélèvements sur le capital', parent: null, ordre: 160 },
        { id: 'FN', code: 'FN', libelle: '- Dividendes versés', parent: null, ordre: 170 },
        { id: 'ZD', code: 'ZD', libelle: 'Flux de trésorerie provenant des capitaux propres (Somme FK à FN)', parent: null, ordre: 180 },

        // --- FLUX DE FINANCEMENT (CAPITAUX ETRANGERS) ---
        { id: 'FO', code: 'FO', libelle: '+ Emprunts', parent: null, ordre: 190 },
        { id: 'FP', code: 'FP', libelle: '+ Autres dettes financières', parent: null, ordre: 200 },
        { id: 'FQ', code: 'FQ', libelle: '- Remboursements des emprunts et dettes', parent: null, ordre: 210 },
        { id: 'ZE', code: 'ZE', libelle: 'Flux de trésorerie provenant des capitaux étrangers (Somme FO à FQ)', parent: null, ordre: 220 },

        // --- SYNTHESE FINALE ---
        { id: 'ZF', code: 'ZF', libelle: 'Flux de trésorerie provenant des activités de financement (D+E)', parent: null, ordre: 230 },
        { id: 'ZG', code: 'ZG', libelle: 'VARIATION DE LA TRESORERIE NETTE DE LA PERIODE (B+C+F)', parent: null, ordre: 240 },
        { id: 'ZH', code: 'ZH', libelle: 'Trésorerie nette au 31 Décembre (G+A)', parent: null, ordre: 250 }
    ];

    const insert = db.prepare(`
        INSERT OR IGNORE INTO rubriques_etats (id, company_id, code, libelle, type_etat, parent_id, ordre)
        VALUES (@id, @company_id, @code, @libelle, 'TFT', @parent, @ordre)
    `);

    db.transaction(() => {
        for (const r of rubriquesTFT) {
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
    console.log("✅ Structure du Tableau des Flux de Trésorerie (TFT) initialisée.");
};

module.exports = { seedTFT };