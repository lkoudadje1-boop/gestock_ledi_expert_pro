const { getDb } = require('../config/database');
const { logAction } = require('../utils/auditHelper');

class PlanTiersService {
    // 1. Récupérer les tiers et les entités disponibles
    async getAllData(type, companyId) {
        const db = getDb();
        
        const tiersQuery = `
            SELECT pt.*, pc.numero_compte as collectif_numero, pc.intitule as collectif_nom
            FROM plan_tiers pt
            LEFT JOIN plan_comptable pc ON pt.compte_collectif_id = pc.id
            WHERE pt.company_id = ?
            ORDER BY pt.numero_tiers ASC
        `;
        const tiersEnregistres = db.prepare(tiersQuery).all(companyId);

        let disponibles = [];
        if (type === 'SALARIE') {
            disponibles = db.prepare(`
                SELECT id, name as nom FROM staff WHERE company_id = ?
                UNION
                SELECT id, username as nom FROM users WHERE company_id = ?
            `).all(companyId, companyId);
        } else if (type === 'CLIENT') {
            disponibles = db.prepare(`SELECT id, nom FROM customers WHERE company_id = ?`).all(companyId);
        } else if (type === 'FOURNISSEUR') {
            disponibles = db.prepare(`SELECT id, nom FROM suppliers WHERE company_id = ?`).all(companyId);
        } else if (type === 'AUTRE') {
            disponibles = db.prepare(`SELECT id, nom FROM others_tiers WHERE company_id = ?`).all(companyId);
        }

        return { tiersEnregistres, disponibles };
    }

    // 2. Logique de suggestion de numéro auxiliaire
    getSuggestionNum(nom, collectifId, companyId) {
        const db = getDb();
        const collectif = db.prepare("SELECT numero_compte FROM plan_comptable WHERE id = ? AND company_id = ?")
                            .get(collectifId, companyId);
        
        if (!collectif) throw new Error("Collectif introuvable");

        const prefixeCompte = collectif.numero_compte.toString().substring(0, 4);
        const nomNettoye = nom.replace(/\s+/g, '').toUpperCase();
        const baseSuggestion = `${prefixeCompte}${nomNettoye}`;

        const existants = db.prepare(`
            SELECT numero_tiers FROM plan_tiers 
            WHERE company_id = ? AND numero_tiers LIKE ?
        `).all(companyId, `${baseSuggestion}%`);

        const index = existants.length > 0 ? existants.length : "";
        return `${baseSuggestion}${index}`;
    }

    // 3. Création
    createTier(body, user) {
        const db = getDb();
        const companyId = user.companyId || user.company_id;
        const { numero_tiers, nom, type_tiers, compte_collectif_id, reference_id, delai_paiement } = body;
        const id = `TIR-${Date.now()}`;

        db.transaction(() => {
            db.prepare(`
                INSERT INTO plan_tiers (id, company_id, compte_collectif_id, numero_tiers, nom, type_tiers, reference_id, delai_paiement, sync_status, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)
            `).run(id, companyId, compte_collectif_id, numero_tiers, nom.toUpperCase(), type_tiers, reference_id || null, delai_paiement || 0);

            db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('plan_tiers', ?, 'INSERT', ?)")
              .run(id, companyId);

            logAction({
                userId: user.userId || user.id, userName: user.username,
                actionType: 'INSERTION', tableConcernee: 'plan_tiers', referenceId: id,
                description: `Création du tiers auxiliaire ${numero_tiers} (${type_tiers}) pour ${nom}. Délai: ${delai_paiement} jours.`,
                companyId
            });
        })();
        return id;
    }

    // 4. Mise à jour
    updateTier(id, body, user) {
        const db = getDb();
        const companyId = user.companyId || user.company_id;
        const { numero_tiers, nom, compte_collectif_id, delai_paiement } = body;

        db.transaction(() => {
            db.prepare(`
                UPDATE plan_tiers 
                SET numero_tiers = ?, nom = ?, compte_collectif_id = ?, delai_paiement = ?, sync_status = 'pending', updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND company_id = ?
            `).run(numero_tiers, nom.toUpperCase(), compte_collectif_id, delai_paiement || 0, id, companyId);

            db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('plan_tiers', ?, 'UPDATE', ?)")
              .run(id, companyId);

            logAction({
                userId: user.userId || user.id, userName: user.username,
                actionType: 'MODIFICATION', tableConcernee: 'plan_tiers', referenceId: id,
                description: `Mise à jour du tiers ${numero_tiers} (${nom}). Nouveau délai: ${delai_paiement}j`,
                companyId
            });
        })();
    }

    // 5. Suppression
    deleteTier(id, user) {
        const db = getDb();
        const companyId = user.companyId || user.company_id;

        db.transaction(() => {
            const tiers = db.prepare("SELECT numero_tiers, nom FROM plan_tiers WHERE id = ? AND company_id = ?").get(id, companyId);
            if (!tiers) throw new Error("Tiers introuvable.");

            db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('plan_tiers', ?, 'DELETE', ?)")
              .run(id, companyId);

            db.prepare("DELETE FROM plan_tiers WHERE id = ? AND company_id = ?").run(id, companyId);

            logAction({
                userId: user.userId || user.id, userName: user.username,
                actionType: 'SUPPRESSION', tableConcernee: 'plan_tiers', referenceId: id,
                description: `Suppression du compte tiers ${tiers.numero_tiers} (${tiers.nom})`,
                companyId
            });
        })();
    }

    // 6. Importation Massive
    async importMassive(tiersData, user) {
        const db = getDb();
        const companyId = user.companyId || user.company_id;
        const timestamp = Date.now();

        db.transaction(() => {
            const stmtInsertTiers = db.prepare(`
                INSERT OR REPLACE INTO plan_tiers (id, company_id, compte_collectif_id, numero_tiers, nom, type_tiers, delai_paiement, reference_id, sync_status, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)
            `);

            const stmtSync = db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES (?, ?, ?, ?)`);

            tiersData.forEach((t, index) => {
                const collectif = db.prepare("SELECT id FROM plan_comptable WHERE numero_compte = ? AND company_id = ?").get(t.numCollectif, companyId);
                if (!collectif) return;

                let referenceId = null;
                const nomMaj = t.nom.toUpperCase();

                // Gestion entités sources
                if (['CLIENT', 'FOURNISSEUR', 'SALARIE', 'AUTRE'].includes(t.type)) {
                    const map = { CLIENT: ['customers', 'CUST-'], FOURNISSEUR: ['suppliers', 'SUPP-'], SALARIE: ['staff', 'STF-'], AUTRE: ['others_tiers', 'OTR-'] };
                    const [table, prefix] = map[t.type];
                    const colNom = t.type === 'SALARIE' ? 'name' : 'nom';
                    
                    let entity = db.prepare(`SELECT id FROM ${table} WHERE ${colNom} = ? AND company_id = ?`).get(nomMaj, companyId);
                    if (!entity) {
                        referenceId = `${prefix}${timestamp}-${index}`;
                        const insertSql = t.type === 'AUTRE' 
                            ? `INSERT INTO ${table} (id, nom, company_id, sync_status, is_active, nif) VALUES (?, ?, ?, 'pending', 1, '0')`
                            : `INSERT INTO ${table} (id, ${colNom}, company_id, sync_status ${t.type === 'SALARIE' ? ', is_active' : ''}) VALUES (?, ?, ?, 'pending' ${t.type === 'SALARIE' ? ', 1' : ''})`;
                        db.prepare(insertSql).run(referenceId, nomMaj, companyId);
                        stmtSync.run(table, referenceId, 'INSERT', companyId);
                    } else referenceId = entity.id;
                }

                const tiersId = `TIR-${timestamp}-${index}`;
                stmtInsertTiers.run(tiersId, companyId, collectif.id, t.num, nomMaj, t.type, t.delai, referenceId);
                stmtSync.run('plan_tiers', tiersId, 'INSERT', companyId);
            });

            logAction({
                userId: user.userId || user.id, userName: user.username,
                actionType: 'INSERTION', tableConcernee: 'plan_tiers',
                description: `Importation massive (${tiersData.length} tiers).`,
                companyId
            });
        })();
    }
}

module.exports = new PlanTiersService();