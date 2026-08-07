const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, '../data/local.db'));

const companyId = 'CPY-44268550'; // Ton ID actuel

console.log("🚀 Lancement du mapping forcé pour le Bilan...");

try {
    db.transaction(() => {
        // 1. On s'assure que les rubriques racines existent (Exemple pour le Capital 'CA')
        // Tu peux répéter cela pour AD, AI, etc. si nécessaire
        db.prepare(`
            INSERT OR IGNORE INTO rubriques_etats (id, company_id, code, libelle, type_etat, ordre)
            VALUES (?, ?, 'CA', 'CAPITAL', 'PASSIF', 10)
        `).run(`CA_${companyId}`, companyId);

        console.log("✅ Rubriques de base vérifiées.");

        // 2. Récupération des comptes de ton plan comptable
        const comptes = db.prepare("SELECT id, numero_compte FROM plan_comptable WHERE company_id = ?").all(companyId);

        const insertMapping = db.prepare(`
            INSERT OR IGNORE INTO mapping_comptes_rubriques (id, company_id, compte_id, rubrique_id, sens)
            VALUES (?, ?, ?, ?, 'SOLDE')
        `);

        let count = 0;
        for (const cpte of comptes) {
            let rubCode = null;
            const n = cpte.numero_compte;

            // Logique de mapping SYSCOHADA simplifiée
            if (n.startsWith('10')) rubCode = 'CA'; // Capital -> CA
            else if (n.startsWith('24')) rubCode = 'AI'; // Matériel -> AI
            else if (n.startsWith('21')) rubCode = 'AD'; // Logiciels -> AD
            else if (n.startsWith('52')) rubCode = 'BS'; // Banque -> BS
            else if (n.startsWith('411')) rubCode = 'BI'; // Clients -> BI
            else if (n.startsWith('401')) rubCode = 'DJ'; // Fournisseurs -> DJ

            if (rubCode) {
                const rubId = `${rubCode}_${companyId}`;
                const mapId = `MAP_${cpte.id}_${rubCode}`;
                insertMapping.run(mapId, companyId, cpte.id, rubId);
                count++;
            }
        }
        console.log(`✅ ${count} comptes ont été liés aux rubriques du Bilan.`);
    })();
} catch (err) {
    console.error("❌ Erreur critique :", err.message);
} finally {
    db.close();
}