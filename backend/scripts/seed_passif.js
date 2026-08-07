/**
 * Initialise la structure complète du Bilan Passif
 * @param {Object} db - L'instance de la base de données better-sqlite3
 * @param {string} companyId - L'ID de la société concernée
 */
const seedBilanPassifComplet = (db, companyId) => {
    const rubriquesPassif = [
        // --- CAPITAUX PROPRES ET RESSOURCES ASSIMILÉES ---
        { id: 'CA', code: 'CA', libelle: 'Capital', parent: null, ordre: 10 },
        { id: 'CB', code: 'CB', libelle: 'Apporteurs capital non appelé (-)', parent: null, ordre: 20 },
        { id: 'CD', code: 'CD', libelle: 'Primes liées au capital social', parent: null, ordre: 30 },
        { id: 'CE', code: 'CE', libelle: 'Ecarts de réévaluation', parent: null, ordre: 40 },
        { id: 'CF', code: 'CF', libelle: 'Réserves indisponibles', parent: null, ordre: 50 },
        { id: 'CG', code: 'CG', libelle: 'Réserves libres', parent: null, ordre: 60 },
        { id: 'CH', code: 'CH', libelle: 'Report à nouveau (+ ou -)', parent: null, ordre: 70 },
        { id: 'CJ', code: 'CJ', libelle: "Résultat net de l'exercice (bénéfice + ou perte -)", parent: null, ordre: 80 },
        { id: 'CL', code: 'CL', libelle: "Subventions d'investissement", parent: null, ordre: 90 },
        { id: 'CM', code: 'CM', libelle: 'Provisions réglementées', parent: null, ordre: 100 },
        { id: 'CP', code: 'CP', libelle: 'TOTAL CAPITAUX PROPRES ET RESSOURCES ASSIMILEES', parent: null, ordre: 110 },

        // --- DETTES FINANCIÈRES ET RESSOURCES ASSIMILÉES ---
        { id: 'DA', code: 'DA', libelle: 'Emprunts et dettes financières diverses', parent: null, ordre: 120 },
        { id: 'DB', code: 'DB', libelle: 'Dettes de location acquisition', parent: null, ordre: 130 },
        { id: 'DC', code: 'DC', libelle: 'Provisions pour risques et charges', parent: null, ordre: 140 },
        { id: 'DD', code: 'DD', libelle: 'TOTAL DETTES FINANCIERES ET RESSOURCES ASSIMILEES', parent: null, ordre: 150 },
        
        // --- TOTAL RESSOURCES STABLES ---
        { id: 'DF', code: 'DF', libelle: 'TOTAL RESSOURCES STABLES', parent: null, ordre: 160 },

        // --- PASSIF CIRCULANT ---
        { id: 'DH', code: 'DH', libelle: 'Dettes circulantes HAO', parent: null, ordre: 170 },
        { id: 'DI', code: 'DI', libelle: 'Clients, avances reçues', parent: null, ordre: 180 },
        { id: 'DJ', code: 'DJ', libelle: "Fournisseurs d'exploitation", parent: null, ordre: 190 },
        { id: 'DK', code: 'DK', libelle: 'Dettes fiscales et sociales', parent: null, ordre: 200 },
        { id: 'DM', code: 'DM', libelle: 'Autres dettes', parent: null, ordre: 210 },
        { id: 'DN', code: 'DN', libelle: 'Provisions pour risques à court terme', parent: null, ordre: 220 },
        { id: 'DP', code: 'DP', libelle: 'TOTAL PASSIF CIRCULANT', parent: null, ordre: 230 },

        // --- TRÉSORERIE PASSIF ---
        { id: 'DQ', code: 'DQ', libelle: "Banques, crédits d'escompte", parent: null, ordre: 240 },
        { id: 'DR', code: 'DR', libelle: 'Banques, établissements financiers et crédits de trésorerie', parent: null, ordre: 250 },
        { id: 'DT', code: 'DT', libelle: 'TOTAL TRESORERIE PASSIF', parent: null, ordre: 260 },

        // --- TOTAL GÉNÉRAL ---
        { id: 'DV', code: 'DV', libelle: 'Ecart de conversion-Passif', parent: null, ordre: 270 },
        { id: 'DZ', code: 'DZ', libelle: 'TOTAL GENERAL', parent: null, ordre: 280 }
    ];

    const insert = db.prepare(`
        INSERT OR IGNORE INTO rubriques_etats (id, company_id, code, libelle, type_etat, parent_id, ordre)
        VALUES (@id, @company_id, @code, @libelle, 'PASSIF', @parent, @ordre)
    `);

    db.transaction(() => {
        for (const r of rubriquesPassif) {
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
    console.log("✅ Structure du Bilan Passif initialisée.");
};

module.exports = { seedBilanPassifComplet };