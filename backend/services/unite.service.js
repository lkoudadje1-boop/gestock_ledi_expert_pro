const { getDb } = require('../config/database');
const { logAction } = require('../utils/auditHelper');
const crypto = require('crypto');

class UniteService {
    /**
     * Récupère la liste des unités actives
     */
    findAll(companyId) {
        const db = getDb();
        return db.prepare(`
            SELECT id, code, libelle, coefficient, unite_reference 
            FROM unites 
            WHERE (company_id = ? OR company_id IS NULL) 
            AND is_active = 1
            ORDER BY libelle ASC
        `).all(companyId);
    }

    /**
     * Crée une nouvelle unité de mesure
     */
    async create(data, user) {
        const db = getDb();
        const { companyId, id: userId, username: userName } = user;
        
        // Validation
        const coeffFmt = parseFloat(data.coefficient);
        if (isNaN(coeffFmt) || coeffFmt <= 0) {
            throw new Error("Le coefficient doit être un nombre supérieur à 0.");
        }
        
        const id = `UNT-${crypto.randomUUID().slice(-8)}`; 
        const codeFmt = data.code.toUpperCase().trim();
        const libelleFmt = data.libelle.trim();
        const refFmt = data.unite_reference ? data.unite_reference.trim() : 'Bouteille';

        const result = db.transaction(() => {
            db.prepare(`
                INSERT INTO unites (id, code, libelle, coefficient, unite_reference, company_id, sync_status, is_active)
                VALUES (?, ?, ?, ?, ?, ?, 'pending', 1)
            `).run(id, codeFmt, libelleFmt, coeffFmt, refFmt, companyId);
            
            db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('unites', ?, 'INSERT', ?)").run(id, companyId);
            return id;
        })();

        logAction({
            userId, userName,
            actionType: 'CREATE',
            tableConcernee: 'unites',
            referenceId: id,
            description: `Création unité: ${libelleFmt} (1 ${codeFmt} = ${coeffFmt} ${refFmt})`,
            companyId
        });

        return result;
    }

    /**
     * Modifie une unité de mesure existante
     */
    async update(id, data, user) {
        const db = getDb();
        const { companyId, id: userId, username: userName } = user;
        
        const coeffFmt = parseFloat(data.coefficient);
        if (isNaN(coeffFmt) || coeffFmt <= 0) {
            throw new Error("Le coefficient doit être un nombre supérieur à 0.");
        }

        const codeFmt = data.code.toUpperCase().trim();
        const refFmt = data.unite_reference ? data.unite_reference.trim() : 'Bouteille';

        db.transaction(() => {
            const existing = db.prepare('SELECT id FROM unites WHERE id = ? AND company_id = ?').get(id, companyId);
            if (!existing) throw new Error("Unité de mesure introuvable.");

            db.prepare(`
                UPDATE unites 
                SET code = ?, libelle = ?, coefficient = ?, unite_reference = ?, sync_status = 'pending', updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND company_id = ?
            `).run(codeFmt, data.libelle.trim(), coeffFmt, refFmt, id, companyId);

            db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('unites', ?, 'UPDATE', ?)").run(id, companyId);
        })();

        logAction({
            userId, userName,
            actionType: 'UPDATE',
            tableConcernee: 'unites',
            referenceId: id,
            description: `Modification unité: ${data.libelle}`,
            companyId
        });

        return { success: true };
    }

    /**
     * Supprime une unité de mesure (Soft Delete)
     */
    async delete(id, user) {
        const db = getDb();
        const { companyId, id: userId, username: userName } = user;

        const libelleUnite = db.transaction(() => {
            const current = db.prepare('SELECT libelle FROM unites WHERE id = ? AND company_id = ?').get(id, companyId);
            if (!current) throw new Error("Unité de mesure introuvable.");

            // Vérification intégrité avant désactivation
            const inUse = db.prepare("SELECT id FROM products WHERE unite_id = ? LIMIT 1").get(id);
            if (inUse) {
                throw new Error("Impossible : Cette unité est utilisée par des produits.");
            }

            // Désactivation au lieu de suppression physique
            db.prepare("UPDATE unites SET is_active = 0, sync_status = 'pending' WHERE id = ? AND company_id = ?").run(id, companyId);
            db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('unites', ?, 'DELETE', ?)").run(id, companyId);

            return current.libelle;
        })();

        logAction({
            userId, userName,
            actionType: 'DELETE',
            tableConcernee: 'unites',
            referenceId: id,
            description: `Désactivation de l'unité : ${libelleUnite}`,
            companyId
        });

        return { success: true };
    }
}

module.exports = new UniteService();