/**
 * Initialise la structure complète du Bilan Actif (Référentiel Image)
 * @param {Object} db - L'instance de la base de données better-sqlite3
 * @param {string} companyId - L'ID de la société concernée
 */
const seedBilanActifComplet = (db, companyId) => {
    const rubriquesActif = [
        // IMMOBILISATIONS INCORPORELLES
        { id: 'AD', code: 'AD', libelle: 'IMMOBILISATIONS INCORPORELLES', parent: null, ordre: 10 },
        { id: 'AE', code: 'AE', libelle: 'Frais de développement et de prospection', parent: 'AD', ordre: 11 },
        { id: 'AF', code: 'AF', libelle: 'Brevets, licences, logiciels et droits similaires', parent: 'AD', ordre: 12 },
        { id: 'AG', code: 'AG', libelle: 'Fonds commercial et droit au bail', parent: 'AD', ordre: 13 },
        { id: 'AH', code: 'AH', libelle: 'Autres immobilisations incorporelles', parent: 'AD', ordre: 14 },

        // IMMOBILISATIONS CORPORELLES
        { id: 'AI', code: 'AI', libelle: 'IMMOBILISATIONS CORPORELLES', parent: null, ordre: 20 },
        { id: 'AJ', code: 'AJ', libelle: 'Terrains (1)', parent: 'AI', ordre: 21 },
        { id: 'AK', code: 'AK', libelle: 'Bâtiments (1)', parent: 'AI', ordre: 22 },
        { id: 'AL', code: 'AL', libelle: 'Aménagements, agencements et installations', parent: 'AI', ordre: 23 },
        { id: 'AM', code: 'AM', libelle: 'Matériel, mobiliers et actifs biologiques', parent: 'AI', ordre: 24 },
        { id: 'AN', code: 'AN', libelle: 'Matériel de transport', parent: 'AI', ordre: 25 },
        
        { id: 'AP', code: 'AP', libelle: 'AVANCES ET ACOMPTES VERSÉS SUR IMMOBILISATIONS', parent: null, ordre: 30 },
        { id: 'AQ', code: 'AQ', libelle: 'IMMOBILISATIONS FINANCIÈRES', parent: null, ordre: 40 },
        { id: 'AR', code: 'AR', libelle: 'Titres de participation', parent: 'AQ', ordre: 41 },
        { id: 'AS', code: 'AS', libelle: 'Autres immobilisations financières', parent: 'AQ', ordre: 42 },

        { id: 'AZ', code: 'AZ', libelle: 'TOTAL ACTIF IMMOBILISÉ', parent: null, ordre: 50 },

        // ACTIF CIRCULANT
        { id: 'BA', code: 'BA', libelle: 'ACTIF CIRCULANT HAO', parent: null, ordre: 60 },
        { id: 'BB', code: 'BB', libelle: 'STOCKS ET EN-COURS', parent: null, ordre: 70 },
        { id: 'BG', code: 'BG', libelle: 'CRÉANCES ET EMPLOIS ASSIMILÉS', parent: null, ordre: 80 },
        { id: 'BH', code: 'BH', libelle: 'Fournisseurs avances versées', parent: 'BG', ordre: 81 },
        { id: 'BI', code: 'BI', libelle: 'Clients', parent: 'BG', ordre: 82 },
        { id: 'BJ', code: 'BJ', libelle: 'Autres créances', parent: 'BG', ordre: 83 },

        { id: 'BK', code: 'BK', libelle: 'TOTAL ACTIF CIRCULANT', parent: null, ordre: 90 },

        // TRÉSORERIE ACTIF
        { id: 'BQ', code: 'BQ', libelle: 'Titres de placement', parent: null, ordre: 100 },
        { id: 'BR', code: 'BR', libelle: 'Valeurs à encaisser', parent: null, ordre: 110 },
        { id: 'BS', code: 'BS', libelle: 'Banques, chèques postaux, caisse et assimilés', parent: null, ordre: 120 },

        { id: 'BT', code: 'BT', libelle: 'TOTAL TRÉSORERIE ACTIF', parent: null, ordre: 130 },
        { id: 'BU', code: 'BU', libelle: 'Ecart de conversion-Actif', parent: null, ordre: 140 },
        { id: 'BZ', code: 'BZ', libelle: 'TOTAL GÉNÉRAL', parent: null, ordre: 150 }
    ];

    // Utilisation de INSERT OR IGNORE pour éviter les crashs si déjà présent
    const insert = db.prepare(`
        INSERT OR IGNORE INTO rubriques_etats (id, company_id, code, libelle, type_etat, parent_id, ordre)
        VALUES (@id, @company_id, @code, @libelle, 'BILAN', @parent, @ordre)
    `);

    db.transaction(() => {
        for (const r of rubriquesActif) {
            insert.run({ 
                id: r.id + "_" + companyId, // ID unique par société
                company_id: companyId, 
                code: r.code, 
                libelle: r.libelle, 
                parent: r.parent ? r.parent + "_" + companyId : null, 
                ordre: r.ordre 
            });
        }
    })();
};

module.exports = { seedBilanActifComplet };