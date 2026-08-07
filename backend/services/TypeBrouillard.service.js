const { getDb } = require('../config/database');
const { logAction } = require('../utils/auditHelper');

class TypeBrouillardService {
    /**
     * Calcule les paramètres de sécurité selon le mode de sortie
     */
    calculerSecurite(d) {
        const isDirect = parseInt(d.sortie_directe) === 1;
        return {
            isDirect,
            modeFinal: isDirect ? 'DIRECT' : d.mode_fonctionnement,
            seuil: isDirect ? 1 : d.seuil_validation,
            niv1: isDirect ? 0 : (d.niv1_actif ? 1 : 0),
            niv1_user: isDirect ? null : (d.niv1_user_id || null),
            niv2: isDirect ? 0 : (d.niv2_actif ? 1 : 0),
            niv2_user: isDirect ? null : (d.niv2_user_id || null),
            niv3: isDirect ? 0 : (d.niv3_actif ? 1 : 0),
            niv3_user: isDirect ? null : (d.niv3_user_id || null),
            niv4: isDirect ? 0 : (d.niv4_actif ? 1 : 0),
            niv4_user: isDirect ? null : (d.niv4_user_id || null)
        };
    }

    /**
     * Vérifie si le brouillard peut être supprimé (absence de mouvements)
     */
    async canDelete(id, companyId) {
        const db = getDb();
        const check = db.prepare(`
            SELECT COUNT(*) as total FROM brouillard_lignes_treso 
            WHERE brouillard_id = ? AND company_id = ?
        `).get(id, companyId);
        return check.total === 0;
    }

    /**
     * Liste les brouillards avec leurs jointures
     */
    async getAll(companyId) {
        const db = getDb();
        return db.prepare(`
            SELECT b.*, j.code as journal_code, jb.code as journal_brouillon_code, pc.numero_compte as compte_numero
            FROM brouillards_treso b
            LEFT JOIN journaux j ON b.journal_id = j.id
            LEFT JOIN journaux jb ON b.journal_brouillon_id = jb.id
            LEFT JOIN plan_comptable pc ON b.compte_treso_id = pc.id
            WHERE b.company_id = ?
        `).all(companyId);
    }

    /**
     * Crée un nouveau type de brouillard de trésorerie
     */
    async create(data, user) {
        const db = getDb();
        const { companyId, id: userId, username: userName } = user;
        const sec = this.calculerSecurite(data);
        const brouillardId = `BRT-${Date.now().toString().slice(-6)}`;

        const result = db.transaction(() => {
            db.prepare(`
                INSERT INTO brouillards_treso (
                    id, company_id, libelle, journal_id, journal_brouillon_id, compte_treso_id,
                    sortie_directe, mode_fonctionnement, seuil_validation,
                    niv1_actif, niv1_user_id, niv2_actif, niv2_user_id,
                    niv3_actif, niv3_user_id, niv4_actif, niv4_user_id, sync_status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
            `).run(
                brouillardId, companyId, data.libelle.toUpperCase(), data.journal_id, data.journal_brouillon_id, data.compte_treso_id,
                sec.isDirect ? 1 : 0, sec.modeFinal, sec.seuil,
                sec.niv1, sec.niv1_user, sec.niv2, sec.niv2_user,
                sec.niv3, sec.niv3_user, sec.niv4, sec.niv4_user
            );

            db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('brouillards_treso', ?, 'INSERT', ?)").run(brouillardId, companyId);

            return { id: brouillardId };
        })();

        // 💡 Log d'audit après succès du paramétrage
        logAction({
            userId,
            userName,
            actionType: 'CREATE',
            tableConcernee: 'brouillards_treso',
            referenceId: brouillardId,
            description: `Création du type de brouillard : ${data.libelle.toUpperCase()} (Mode: ${sec.modeFinal})`,
            companyId
        });

        return result;
    }

    /**
     * Modifie un type de brouillard existant
     */
    async update(id, data, user) {
        const db = getDb();
        const { companyId, id: userId, username: userName } = user;
        const sec = this.calculerSecurite(data);

        db.transaction(() => {
            const existing = db.prepare('SELECT id FROM brouillards_treso WHERE id = ? AND company_id = ?').get(id, companyId);
            if (!existing) throw new Error("Type de brouillard introuvable.");

            db.prepare(`
                UPDATE brouillards_treso 
                SET libelle = ?, journal_id = ?, journal_brouillon_id = ?, compte_treso_id = ?,
                    sortie_directe = ?, mode_fonctionnement = ?, seuil_validation = ?,
                    niv1_actif = ?, niv1_user_id = ?, niv2_actif = ?, niv2_user_id = ?,
                    niv3_actif = ?, niv3_user_id = ?, niv4_actif = ?, niv4_user_id = ?,
                    sync_status = 'pending', updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND company_id = ?
            `).run(
                data.libelle.toUpperCase(), data.journal_id, data.journal_brouillon_id, data.compte_treso_id,
                sec.isDirect ? 1 : 0, sec.modeFinal, sec.seuil,
                sec.niv1, sec.niv1_user, sec.niv2, sec.niv2_user,
                sec.niv3, sec.niv3_user, sec.niv4, sec.niv4_user,
                id, companyId
            );

            db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('brouillards_treso', ?, 'UPDATE', ?)").run(id, companyId);
        })();

        // 💡 Log d'audit après la modification du paramétrage
        logAction({
            userId,
            userName,
            actionType: 'UPDATE',
            tableConcernee: 'brouillards_treso',
            referenceId: id,
            description: `Modification du type de brouillard : ${data.libelle.toUpperCase()} (Mode final : ${sec.modeFinal})`,
            companyId
        });

        return { success: true };
    }

    /**
     * Supprime un type de brouillard de trésorerie (si aucun mouvement rattaché)
     */
    async delete(id, user) {
        const db = getDb();
        const { companyId, id: userId, username: userName } = user;

        const label = db.transaction(() => {
            const current = db.prepare('SELECT libelle FROM brouillards_treso WHERE id = ? AND company_id = ?').get(id, companyId);
            if (!current) throw new Error("Type de brouillard introuvable.");

            // Utilisation synchrone de la vérification de suppression à l'intérieur de la transaction
            const check = db.prepare(`
                SELECT COUNT(*) as total FROM brouillard_lignes_treso 
                WHERE brouillard_id = ? AND company_id = ?
            `).get(id, companyId);

            if (check.total > 0) {
                throw new Error("Impossible de supprimer : des écritures ou mouvements sont rattachés à ce brouillard.");
            }

            db.prepare('DELETE FROM brouillards_treso WHERE id = ? AND company_id = ?').run(id, companyId);
            db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES ('brouillards_treso', ?, 'DELETE', ?)").run(id, companyId);

            return current.libelle;
        })();

        // 💡 Log d'audit après suppression définitive
        logAction({
            userId,
            userName,
            actionType: 'DELETE',
            tableConcernee: 'brouillards_treso',
            referenceId: id,
            description: `Suppression du type de brouillard : ${label}`,
            companyId
        });

        return { success: true };
    }
}

module.exports = new TypeBrouillardService();