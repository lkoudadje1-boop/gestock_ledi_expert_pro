/**
 * AUTO-MAPPER SYSCOHADA (Classes 1 à 9)
 * Version 2.0 : Inclus la gestion des Amortissements (28) et Dépréciations (29/39/49)
 * Lie automatiquement les comptes aux rubriques pour l'affichage Brut/Amort/Net.
 */

const runFullAutoMapping = (db, companyId) => {
    console.log(`🔍 Démarrage du mapping automatique pour la société : ${companyId}`);

    // 1. Récupération des comptes et des rubriques existantes
    const comptes = db.prepare("SELECT id, numero_compte FROM plan_comptable WHERE company_id = ?").all(companyId);
    
    const rubriquesExistantes = db.prepare("SELECT code FROM rubriques_etats WHERE company_id = ?")
        .all(companyId)
        .map(r => r.code);

    const insertMapping = db.prepare(`
        INSERT OR IGNORE INTO mapping_comptes_rubriques (id, company_id, compte_id, rubrique_id, sens)
        VALUES (@id, @company_id, @compte_id, @rubrique_id, 'SOLDE')
    `);

    db.transaction(() => {
        let mappingCount = 0;

        comptes.forEach(compte => {
            let rub = null;
            const n = compte.numero_compte;

            // --- CLASSE 2 : ACTIF IMMOBILISÉ (BRUT 21-27 & AMORTISSEMENTS 28-29) ---
            // On mappe le compte principal ET son amortissement sur le même code de rubrique
            
            // IMMOBILISATIONS INCORPORELLES
            if (n.startsWith('21') || n.startsWith('281') || n.startsWith('291')) rub = 'AD'; 
            
            // IMMOBILISATIONS CORPORELLES
            else if (n.startsWith('22') || n.startsWith('282') || n.startsWith('292')) rub = 'AJ'; // Terrains
            else if (n.startsWith('23') || n.startsWith('283') || n.startsWith('293')) rub = 'AK'; // Bâtiments
            else if (n.startsWith('245') || n.startsWith('2845')) rub = 'AN'; // Matériel de transport
            
            // Matériel, mobilier et actifs biologiques (Le reste de la classe 24)
            else if ((n.startsWith('24') || n.startsWith('284')) && !rub) rub = 'AM'; 
            
            // AVANCES ET IMMOS FINANCIÈRES
            else if (n.startsWith('25') || n.startsWith('285')) rub = 'AP';
            else if (n.startsWith('26') || n.startsWith('27') || n.startsWith('286') || n.startsWith('296')) rub = 'AQ';

            // --- CLASSE 1 : RESSOURCES STABLES (PASSIF) ---
            else if (n.startsWith('101')) rub = 'CA';      // Capital
            else if (n.startsWith('109')) rub = 'CB';      // Capital non appelé
            else if (n.startsWith('11')) rub = 'CF';       // Réserves
            else if (n.startsWith('12')) rub = 'CH';       // Report à nouveau
            else if (n.startsWith('13')) rub = 'CJ';       // Résultat net
            else if (n.startsWith('16')) rub = 'DA';       // Emprunts

            // --- CLASSE 3 : STOCKS (ET DÉPRÉCIATIONS 39) ---
            else if (n.startsWith('3') || n.startsWith('39')) rub = 'BB';

            // --- CLASSE 4 : TIERS (ACTIF CIRCULANT & DÉPRÉCIATIONS 49) ---
            else if (n.startsWith('411') || n.startsWith('491')) rub = 'BI'; // Clients
            else if (n.startsWith('409') || n.startsWith('490')) rub = 'BH'; // Avances fournisseurs
            else if (n.startsWith('401')) rub = 'DJ'; // Fournisseurs (Passif)
            else if (n.startsWith('42') || n.startsWith('43') || n.startsWith('44')) rub = 'DK'; // État / Sociaux

            // --- CLASSE 5 : TRÉSORERIE ---
            else if (n.startsWith('52') || n.startsWith('57') || n.startsWith('58')) rub = 'BS'; // Banques/Caisses
            else if (n.startsWith('50')) rub = 'BQ'; // Titres de placement

            // --- CLASSE 6 : CHARGES (RÉSULTAT) ---
            else if (n.startsWith('601')) rub = 'RA'; // Achats Marchandises
            else if (n.startsWith('602')) rub = 'RC'; // Achats Matières
            else if (n.startsWith('61')) rub = 'RG';  // Transports
            else if (n.startsWith('62') || n.startsWith('63')) rub = 'RH'; // Services extérieurs
            else if (n.startsWith('66')) rub = 'RK';  // Personnel
            else if (n.startsWith('68')) rub = 'RL';  // Dotations Amortissements (Pour le résultat)

            // --- CLASSE 7 : PRODUITS (RÉSULTAT) ---
            else if (n.startsWith('701')) rub = 'TA'; // Ventes Marchandises
            else if (n.startsWith('702')) rub = 'TB'; // Ventes Produits Finis
            else if (n.startsWith('706')) rub = 'TC'; // Services vendus

            // --- CLASSE 8 : HAO ---
            else if (n.startsWith('8')) rub = 'XH';

            // 🎯 INSERTION DANS LA TABLE DE MAPPING
            if (rub && rubriquesExistantes.includes(rub)) {
                const rubId = `${rub}_${companyId}`;
                // ID unique pour éviter les doublons et les troncatures
                const mappingId = `MAP_${compte.id.replace(/-/g, '_')}_${rub}_${companyId}`;

                insertMapping.run({
                    id: mappingId,
                    company_id: companyId,
                    compte_id: compte.id,
                    rubrique_id: rubId
                });
                mappingCount++;
            }
        });

        console.log(`✅ Transaction terminée : ${mappingCount} comptes (Brut + Amortissements) mappés avec succès.`);
    })();
};

module.exports = { runFullAutoMapping };