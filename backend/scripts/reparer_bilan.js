const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, '../data/local.db'));

const companyId = 'CPY-44268550'; // Ton ID entreprise

console.log("🛠️ Réparation du Bilan et du Mapping en cours...");

try {
    db.transaction(() => {
        // 1. S'assurer que les rubriques racines existent
        const rubriques = [
            { id: 'AD', lib: 'IMMOBILISATIONS INCORPORELLES', type: 'BILAN', ordre: 10 },
            { id: 'AI', lib: 'IMMOBILISATIONS CORPORELLES', type: 'BILAN', ordre: 20 },
            { id: 'BS', lib: 'BANQUES, CAISSE ET ASSIMILÉS', type: 'BILAN', ordre: 120 },
            { id: 'CA', lib: 'CAPITAL', type: 'PASSIF', ordre: 10 },
            { id: 'DJ', lib: "FOURNISSEURS D'EXPLOITATION", type: 'PASSIF', ordre: 190 },
            { id: 'BI', lib: 'CLIENTS', type: 'BILAN', ordre: 82 }
        ];

        const insRub = db.prepare(`
            INSERT OR IGNORE INTO rubriques_etats (id, company_id, code, libelle, type_etat, ordre)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        for (const r of rubriques) {
            insRub.run(`${r.id}_${companyId}`, companyId, r.id, r.lib, r.type, r.ordre);
        }

        // 2. Lier les comptes existants aux rubriques
        const comptes = db.prepare("SELECT id, numero_compte FROM plan_comptable WHERE company_id = ?").all(companyId);
        const insMap = db.prepare(`
            INSERT OR IGNORE INTO mapping_comptes_rubriques (id, company_id, compte_id, rubrique_id, sens)
            VALUES (?, ?, ?, ?, 'SOLDE')
        `);

        let count = 0;
        comptes.forEach(c => {
            let rubId = null;
            if (c.numero_compte.startsWith('10')) rubId = `CA_${companyId}`;
            if (c.numero_compte.startsWith('24') || c.numero_compte.startsWith('21')) rubId = `AI_${companyId}`;
            if (c.numero_compte.startsWith('52') || c.numero_compte.startsWith('57')) rubId = `BS_${companyId}`;
            if (c.numero_compte.startsWith('411')) rubId = `BI_${companyId}`;
            if (c.numero_compte.startsWith('401')) rubId = `DJ_${companyId}`;

            if (rubId) {
                insMap.run(`MAP_${c.id}_${companyId}`, companyId, c.id, rubId);
                count++;
            }
        });

        console.log(`✅ Réparation terminée. ${count} comptes sont maintenant liés au Bilan.`);
    })();
} catch (err) {
    console.error("❌ Échec de la réparation :", err.message);
} finally {
    db.close();
}