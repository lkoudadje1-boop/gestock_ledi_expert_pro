const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, '../data/local.db'));

const companyId = 'CPY-44268550'; 

console.log("🛠️ Réparation forcée du mapping Bilan...");

try {
    db.transaction(() => {
        // 1. On force la création des rubriques Passif (le Capital manquait)
        db.prepare(`
            INSERT OR IGNORE INTO rubriques_etats (id, company_id, code, libelle, type_etat, ordre)
            VALUES (?, ?, 'CA', 'CAPITAL', 'PASSIF', 10)
        `).run(`CA_${companyId}`, companyId);

        // 2. On lie les comptes du Plan Comptable
        const comptes = db.prepare("SELECT id, numero_compte FROM plan_comptable WHERE company_id = ?").all(companyId);
        
        const insMap = db.prepare(`
            INSERT OR IGNORE INTO mapping_comptes_rubriques (id, company_id, compte_id, rubrique_id, sens)
            VALUES (?, ?, ?, ?, 'SOLDE')
        `);

        let count = 0;
        for (const c of comptes) {
            let target = null;
            if (c.numero_compte.startsWith('10')) target = 'CA'; // Capital
            if (c.numero_compte.startsWith('24')) target = 'AI'; // Matériel
            if (c.numero_compte.startsWith('52')) target = 'BS'; // Banques
            if (c.numero_compte.startsWith('411')) target = 'BI'; // Clients

            if (target) {
                // On génère un ID de mapping propre sans troncature
                const mapId = `MAP_${target}_${c.id}_${companyId}`;
                insMap.run(mapId, companyId, c.id, `${target}_${companyId}`);
                count++;
            }
        }
        console.log(`✅ ${count} comptes liés avec succès.`);
    })();
} catch (err) {
    console.error("❌ Erreur :", err.message);
} finally {
    db.close();
}