const { getDb } = require('../config/database');
const { logAction } = require('../utils/auditHelper');

/**
 * On vérifie s'il y a de l'argent encaissé non clôturé
 */
exports.checkSessionActive = (companyId, userId) => {
    const db = getDb();
    
    const result = db.prepare(`
        SELECT COUNT(*) as count 
        FROM payments 
        WHERE company_id = ? 
          AND (caissier_id = ? OR user_id = ?) 
          AND (cloture_id IS NULL OR is_cloture = 0)
          AND is_active = 1
          AND TRIM(UPPER(type_paiement)) != 'REMBOURSEMENT'
    `).get(companyId, userId, userId);

    return result.count > 0;
};

/**
 * Récupère l'état théorique (Ventes + Recouvrements)
 */
exports.getEtatTheoriqueActuel = (companyId, caissierId) => {
    const db = getDb();
    
    return db.prepare(`
        SELECT 
            pm.id as payment_method_id,
            pm.libelle as methode,
            pm.libelle as mode, 
            IFNULL(SUM(p.montant), 0) as theorique
        FROM payment_methods pm
        LEFT JOIN payments p ON p.moyen_paiement = pm.libelle 
            AND p.company_id = ? 
            AND (p.created_by = ? OR p.user_id = ?) 
            AND p.cloture_id IS NULL
        WHERE pm.company_id = ?
          AND pm.is_active = 1
        GROUP BY pm.id, pm.libelle
    `).all(companyId, caissierId, caissierId, companyId);
};

exports.validerCloture = (data, context) => {
    const db = getDb();
    const { 
        id, solde_ouverture, total_theorique_global, 
        total_reel_global, details, observation 
    } = data;
    
    const { companyId, userId, userName } = context; 
    const auditUser = userName || 'user'; 
    
    const totalTheorique = Number(total_theorique_global || 0);
    const totalReel = Number(total_reel_global || 0);
    const ecart_global = totalReel - totalTheorique;

    return db.transaction(() => {
        // 1. INSERTION MAÎTRE (Clôture principale)
        const stmtMaster = db.prepare(`
            INSERT INTO clotures_caisse (
                id, caissier_id, solde_ouverture, total_theorique_global, 
                total_reel_global, ecart_global, statut, observation, company_id, 
                sync_status, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, 'VALIDE', ?, ?, 'pending', ?)
        `);

        stmtMaster.run(
            id, userId, Number(solde_ouverture || 0), 
            totalTheorique, totalReel, ecart_global, 
            observation || '', companyId, auditUser
        );

        // 🔄 Ajout de l'en-tête de clôture dans la file de synchronisation Cloud
        db.prepare(`
            INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
            VALUES ('clotures_caisse', ?, 'INSERT', ?)
        `).run(id, companyId);

        // 2. INSERTION DÉTAILS
        const stmtDetail = db.prepare(`
            INSERT INTO cloture_details_paiements (
                id, cloture_id, payment_method_id, 
                montant_theorique, montant_reel, 
                commentaire_detaille, company_id, 
                sync_status, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
        `);

        const stmtGetMethodId = db.prepare(`
            SELECT id FROM payment_methods 
            WHERE (id = ? OR code = ?) AND company_id = ? 
            LIMIT 1
        `);

        details.forEach((d, index) => {
            const mTheorique = Number(d.montant_theorique || 0);
            const mReel = Number(d.montant_reel || 0);
            const detailId = `DET-${id}-${index}`;

            let methodId = d.payment_method_id;
            if (!methodId || methodId === 'undefined') {
                const methodRow = stmtGetMethodId.get(d.payment_method_id, d.mode, companyId);
                methodId = methodRow ? methodRow.id : null;
            }

            if (!methodId) {
                throw new Error(`ID de méthode de paiement introuvable pour : ${d.mode}`);
            }

            stmtDetail.run(
                detailId, 
                id, 
                methodId, 
                mTheorique, 
                mReel, 
                d.commentaire_detaille || null, 
                companyId, 
                auditUser
            );

            // 🔄 Ajout du détail de paiement dans la file de synchronisation Cloud
            db.prepare(`
                INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
                VALUES ('cloture_details_paiements', ?, 'INSERT', ?)
            `).run(detailId, companyId);
        });

        // 3. MISE À JOUR DES ENREGISTREMENTS (Verrouillage comptable)
        // Récupération des IDs des paiements mis à jour pour les logger en 'pending' dans la sync_queue
        const paymentsToUpdate = db.prepare(`
            SELECT id FROM payments 
            WHERE (caissier_id = ? OR user_id = ?) 
              AND company_id = ? 
              AND is_cloture = 0
        `).all(userId, userId, companyId);

        db.prepare(`
            UPDATE payments 
            SET is_cloture = 1, cloture_id = ?, sync_status = 'pending' 
            WHERE (caissier_id = ? OR user_id = ?) 
              AND company_id = ? 
              AND is_cloture = 0
        `).run(id, userId, userId, companyId);

        paymentsToUpdate.forEach(p => {
            db.prepare(`
                INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
                VALUES ('payments', ?, 'UPDATE', ?)
            `).run(p.id, companyId);
        });

        // Récupération des IDs des sale_items mis à jour pour la synchronisation
        const saleItemsToUpdate = db.prepare(`
            SELECT id FROM sale_items 
            WHERE id_vente IN (
                SELECT id FROM sales 
                WHERE (caissier_id = ? OR user_id = ?) 
                  AND company_id = ? 
                  AND is_active = 1
                  AND statut_vente IN ('VALIDEE', 'RETOUR')
            ) AND is_cloture = 0
        `).all(userId, userId, companyId);

        db.prepare(`
            UPDATE sale_items 
            SET is_cloture = 1, sync_status = 'pending'
            WHERE id_vente IN (
                SELECT id FROM sales 
                WHERE (caissier_id = ? OR user_id = ?) 
                  AND company_id = ? 
                  AND is_active = 1
                  AND statut_vente IN ('VALIDEE', 'RETOUR')
            ) AND is_cloture = 0
        `).run(userId, userId, companyId);

        saleItemsToUpdate.forEach(si => {
            db.prepare(`
                INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
                VALUES ('sale_items', ?, 'UPDATE', ?)
            `).run(si.id, companyId);
        });

        // 4. LOG D'AUDIT
        if (typeof logAction === 'function') {
            logAction({
                userId, 
                userName: auditUser, 
                actionType: 'INSERTION', 
                tableConcernee: 'clotures_caisse',
                referenceId: id, 
                description: `Clôture validée. Total Réel: ${totalReel}, Écart: ${ecart_global}`, 
                companyId
            });
        }

        return id;
    })(); 
};

/**
 * Historique avec agrégation JSON des détails
 */
exports.getHistory = (companyId) => {
    const db = getDb();
    return db.prepare(`
        SELECT 
            c.id,
            c.caissier_id,
            c.total_theorique_global as attendu,
            c.total_reel_global as reel,
            c.ecart_global as ecart,
            c.statut,
            c.observation as note_cloture,
            c.created_at as date_cloture,
            u.username as utilisateur,
            (SELECT JSON_GROUP_ARRAY(
                JSON_OBJECT(
                    'methode', pm.libelle,
                    'theorique', dp.montant_theorique,
                    'reel', dp.montant_reel,
                    'ecart', dp.ecart,
                    'commentaire', dp.commentaire_detaille
                )
            )
             FROM cloture_details_paiements dp
             JOIN payment_methods pm ON dp.payment_method_id = pm.id
             WHERE dp.cloture_id = c.id
            ) as tous_details
        FROM clotures_caisse c
        JOIN users u ON c.caissier_id = u.id
        WHERE c.company_id = ?
        ORDER BY c.created_at DESC
    `).all(companyId).map(row => ({
        ...row,
        tous_details: row.tous_details ? JSON.parse(row.tous_details) : []
    }));
};

exports.archiverSession = (clotureId, companyId) => {
    const db = getDb();
    return db.transaction(() => {
        db.prepare(`
            UPDATE clotures_caisse 
            SET statut = 'ARCHIVE', sync_status = 'pending' 
            WHERE id = ? AND company_id = ?
        `).run(clotureId, companyId);

        db.prepare(`
            INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
            VALUES ('clotures_caisse', ?, 'UPDATE', ?)
        `).run(clotureId, companyId);
    })();
};