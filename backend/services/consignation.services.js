const { getDb } = require('../config/database');
const { logAction } = require('../utils/auditHelper');
const consignationRules = require('./RegleConsignation.services');

const genererIdMouvement = (prefix) => {
    return `${prefix}-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`;
};

exports.createConsignation = ({ companyId, userId, userName, data }) => {
    const db = getDb();
    
    const insertHeaderStmt = db.prepare(`
        INSERT INTO flux_emballages (
            id, company_id, sale_id, client_id, type_flux, montant_total, 
            type_garantie, montant_recu, reste_a_payer, garantie_libelle, sync_status
        ) VALUES (?, ?, ?, ?, 'CONSIGNE', ?, ?, ?, ?, ?, 'pending')
    `);
    
    const insertDetailStmt = db.prepare(`
        INSERT INTO flux_emballages_details 
        (id, company_id, flux_id, packaging_id, quantite, quantite_restante, prix_unitaire, montant_ligne, montant_penalite_unitaire, regle_tarifaire_snapshot, sync_status) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `);
    
    const updateStockStmt = db.prepare(`
        UPDATE packaging 
        SET stock_actuel = stock_actuel - ?,
            stock_consigne = stock_consigne + ?,
            sync_status = 'pending',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND company_id = ?
    `);

    const syncQueueStmt = db.prepare(`
        INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
        VALUES (?, ?, ?, ?)
    `);
    
    const { 
        tiers_id, client_nom, sale_id, items, montant_total,
        type_garantie, montant_recu, garantie_libelle 
    } = data;
    
    if (!items || items.length === 0) throw new Error("La consignation doit contenir au moins un emballage.");
    
    let saleData = db.prepare(`SELECT company_id, customer_id, id FROM sales WHERE id = ? OR lot_id = ?`).get(sale_id, sale_id);
    if (!saleData && client_nom) {
        saleData = db.prepare(`SELECT company_id, customer_id, id FROM sales WHERE nom_client_snap = ? AND statut_vente = 'VALIDEE' ORDER BY date_vente DESC LIMIT 1`).get(client_nom);
    }
    if (!saleData) throw new Error(`Consignation refusée : Vente introuvable.`);
    
    const finalCompanyId = saleData.company_id || companyId;
    const finalTiersId = saleData.customer_id || tiers_id || null;
    let fluxId;
    
    db.transaction(() => {
        fluxId = genererIdMouvement('FLUX');
        
        let totalCalcule = 0;
        for (const item of items) {
            totalCalcule += (parseFloat(item.qte || item.quantite) || 0) * (parseFloat(item.prix_unitaire || item.prix_consigne) || 0);
        }
        const finalMontantTotal = montant_total || totalCalcule;

        const finalTypeGarantie = type_garantie || 'ESPECES';
        const finalMontantRecu = finalTypeGarantie === 'PHYSIQUE' ? 0 : (parseFloat(montant_recu) || 0);
        const finalResteAPayer = finalTypeGarantie === 'PHYSIQUE' ? 0 : Math.max(0, finalMontantTotal - finalMontantRecu);
        const finalGarantieLibelle = finalTypeGarantie === 'PHYSIQUE' ? (garantie_libelle || "Pièce d'identité") : null;

        insertHeaderStmt.run(
            fluxId, 
            finalCompanyId, 
            saleData.id, 
            finalTiersId, 
            finalMontantTotal, 
            finalTypeGarantie, 
            finalMontantRecu, 
            finalResteAPayer, 
            finalGarantieLibelle
        );

        syncQueueStmt.run('flux_emballages', fluxId, 'INSERT', finalCompanyId);

        for (const item of items) {
            const targetPackagingId = item.packaging_id || item.id;
            const packaging = db.prepare('SELECT rule_id FROM packaging WHERE id = ?').get(targetPackagingId);
            
            let regleComplete = null;
            if (packaging && packaging.rule_id) {
                regleComplete = consignationRules.getRuleById(packaging.rule_id, finalCompanyId);
            }

            const calculs = consignationRules.simulerPrixRemboursement(
                targetPackagingId, new Date().toISOString(), finalCompanyId,
                regleComplete ? JSON.stringify(regleComplete) : null
            );

            const qte = parseFloat(item.qte || item.quantite) || 0;
            const pxUnit = parseFloat(item.prix_unitaire || item.prix_consigne) || 0;
            const detailId = genererIdMouvement('DET');

            insertDetailStmt.run(
                detailId, finalCompanyId, fluxId, targetPackagingId,
                qte, qte, pxUnit, (qte * pxUnit), calculs.montant_penalite_unitaire,
                regleComplete ? JSON.stringify(regleComplete) : null
            );
            
            syncQueueStmt.run('flux_emballages_details', detailId, 'INSERT', finalCompanyId);

            updateStockStmt.run(qte, qte, targetPackagingId, finalCompanyId);
            syncQueueStmt.run('packaging', targetPackagingId, 'UPDATE', finalCompanyId);
        }

        logAction({ 
            userId, 
            userName: userName || 'user', 
            actionType: 'INSERTION', 
            tableConcernee: 'flux_emballages', 
            referenceId: fluxId, 
            description: finalTypeGarantie === 'PHYSIQUE' 
                ? `Consignation créée avec Garantie Physique : ${finalGarantieLibelle}` 
                : `Consignation créée (Reçu: ${finalMontantRecu} F, Reste: ${finalResteAPayer} F)`, 
            companyId: finalCompanyId 
        });
    })();

    return fluxId;
};

exports.createDeconsignation = ({ companyId, userId, userName, data }) => {
    const db = getDb();
    const { flux_id, qte_retournee } = data; 
    const qteRetour = parseFloat(qte_retournee);

    if (isNaN(qteRetour) || qteRetour <= 0) throw new Error("Quantité invalide.");

    db.transaction(() => {
        const flux = db.prepare(`SELECT * FROM flux_emballages WHERE id = ? AND company_id = ?`).get(flux_id, companyId);
        if (!flux) throw new Error("Flux de consignation introuvable.");

        const detailOrigine = db.prepare(`
            SELECT id, packaging_id, quantite_restante, prix_unitaire, regle_tarifaire_snapshot 
            FROM flux_emballages_details 
            WHERE flux_id = ? AND company_id = ? AND quantite > 0 AND quantite_restante > 0
            LIMIT 1
        `).get(flux_id, companyId);

        if (!detailOrigine) throw new Error("Aucun emballage actif restant à déconsigner pour ce flux.");
        
        if (qteRetour > detailOrigine.quantite_restante) {
            throw new Error(`Quantité retournée (${qteRetour}) supérieure au solde restant (${detailOrigine.quantite_restante}).`);
        }

        let penaliteUnitaireAuRetour = 0;
        if (detailOrigine.regle_tarifaire_snapshot && flux.created_at) {
            try {
                const simulation = consignationRules.simulerPrixRemboursement(
                    detailOrigine.packaging_id,
                    flux.created_at,
                    companyId,
                    detailOrigine.regle_tarifaire_snapshot
                );
                penaliteUnitaireAuRetour = parseFloat(simulation.montant_penalite_unitaire) || 0;
            } catch (err) {
                console.error("❌ Erreur simulation pénalité au retour:", err);
            }
        }

        const prixUnitaire = parseFloat(detailOrigine.prix_unitaire) || 0;
        const montantLigneRetour = -qteRetour * prixUnitaire; 
        const totalPenaliteRetour = qteRetour * penaliteUnitaireAuRetour; 

        const detailRetourId = genererIdMouvement('DET-RET');
        
        db.prepare(`
            INSERT INTO flux_emballages_details 
            (id, company_id, flux_id, packaging_id, quantite, quantite_restante, prix_unitaire, montant_ligne, montant_penalite_unitaire, sync_status) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        `).run(
            detailRetourId, 
            companyId, 
            flux_id, 
            detailOrigine.packaging_id, 
            -qteRetour,       
            0,                 
            prixUnitaire,      
            montantLigneRetour,
            penaliteUnitaireAuRetour
        );

        db.prepare(`
            INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
            VALUES ('flux_emballages_details', ?, 'INSERT', ?)
        `).run(detailRetourId, companyId);

        db.prepare(`
            UPDATE flux_emballages_details 
            SET quantite_restante = quantite_restante - ?, sync_status = 'pending'
            WHERE id = ? AND company_id = ?
        `).run(qteRetour, detailOrigine.id, companyId);

        db.prepare(`
            INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
            VALUES ('flux_emballages_details', ?, 'UPDATE', ?)
        `).run(detailOrigine.id, companyId);

        const ajustementSoldeGlobal = montantLigneRetour - totalPenaliteRetour; 

        db.prepare(`
            UPDATE flux_emballages 
            SET reste_a_payer = reste_a_payer + ?, updated_at = CURRENT_TIMESTAMP, sync_status = 'pending'
            WHERE id = ? AND company_id = ?
        `).run(ajustementSoldeGlobal, flux_id, companyId);

        const verifSoldeStricte = db.prepare(`
            SELECT SUM(quantite) as solde_quantite 
            FROM flux_emballages_details 
            WHERE flux_id = ? AND company_id = ?
        `).get(flux_id, companyId);

        if (verifSoldeStricte && parseFloat(verifSoldeStricte.solde_quantite) <= 0) {
            db.prepare(`
                UPDATE flux_emballages 
                SET statut = 'SOLDE', sync_status = 'pending' 
                WHERE id = ? AND company_id = ?
            `).run(flux_id, companyId);
        } else {
            db.prepare(`
                UPDATE flux_emballages 
                SET statut = 'EN COURS', sync_status = 'pending' 
                WHERE id = ? AND company_id = ?
            `).run(flux_id, companyId);
        }

        db.prepare(`
            INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
            VALUES ('flux_emballages', ?, 'UPDATE', ?)
        `).run(flux_id, companyId);

        db.prepare(`
            UPDATE packaging 
            SET stock_actuel = stock_actuel + ?, 
                stock_consigne = stock_consigne - ?,
                sync_status = 'pending',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND company_id = ?
        `).run(qteRetour, qteRetour, detailOrigine.packaging_id, companyId);

        db.prepare(`
            INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
            VALUES ('packaging', ?, 'UPDATE', ?)
        `).run(detailOrigine.packaging_id, companyId);

        logAction({
            userId,
            userName: userName || 'user',
            actionType: 'UPDATE',
            tableConcernee: 'flux_emballages',
            referenceId: flux_id,
            description: `Déconsignation de ${qteRetour} unités (Remboursement: ${montantLigneRetour} F, Pénalité Retenu: ${totalPenaliteRetour} F) ajoutée au flux ${flux_id}`,
            companyId
        });
    })();
};

exports.getConsignations = (companyId, status = null) => {
    const db = getDb();
    
    let query = `
  SELECT 
    d.*,
    f.id AS id_flux,
    f.company_id,
    f.sale_id,
    f.client_id,
    c.nom AS client_nom,
    f.type_flux,
    f.montant_total,
    f.reste_a_payer,
    f.type_garantie,
    f.montant_recu,
    f.garantie_libelle,
    f.statut,
    f.created_at,
    p.nom AS emballage,
    COALESCE(d.prix_unitaire, 0) AS prix_unitaire,
    COALESCE(d.montant_ligne, 0) AS montant_ligne,
    COALESCE(d.montant_penalite_unitaire, 0) AS montant_penalite_unitaire,
    COALESCE(s.lot_id, f.sale_id, '---') AS numero_facture,
    CAST(JULIANDAY('now') - JULIANDAY(f.created_at) AS INTEGER) AS jours_ecoules_reel
FROM flux_emballages_details d
JOIN flux_emballages f ON d.flux_id = f.id
LEFT JOIN packaging p ON d.packaging_id = p.id
LEFT JOIN sales s ON f.sale_id = s.id
LEFT JOIN customers c ON f.client_id = c.id
WHERE f.company_id = ?
    `;
    
    const params = [companyId];

    if (status === 'OUVERT') {
        query += ` AND f.statut = 'EN COURS'`;
    } else if (status === 'SOLDE') {
        query += ` AND f.statut = 'SOLDE'`;
    }
    
    query += ` ORDER BY f.created_at DESC`;

    const rawResults = db.prepare(query).all(...params);
    const totauxParFlux = {};

    const lignesCalculees = rawResults.map(row => {
        let penaliteUnitaire = row.montant_penalite_unitaire || 0;
        let joursEcoules = row.jours_ecoules_reel;
        let totalLignePenalite = 0;

        if (row.quantite > 0) {
            if (row.regle_tarifaire_snapshot) {
                try {
                    const simulation = consignationRules.simulerPrixRemboursement(
                        row.packaging_id, 
                        row.created_at, 
                        companyId, 
                        row.regle_tarifaire_snapshot
                    );
                    penaliteUnitaire = simulation.montant_penalite_unitaire;
                    joursEcoules = simulation.jours_ecoules;
                } catch (err) {
                    console.error(`Erreur recalcul pénalité flux ${row.id_flux}:`, err);
                }
            }
            const qtePourCalcul = row.quantite_restante !== undefined ? row.quantite_restante : row.quantite;
            totalLignePenalite = (qtePourCalcul || 0) * penaliteUnitaire;
        } else {
            const qteRetourneeBrute = Math.abs(row.quantite || 0);
            totalLignePenalite = qteRetourneeBrute * penaliteUnitaire;
        }

        if (!totauxParFlux[row.id_flux]) {
            totauxParFlux[row.id_flux] = 0;
        }
        totauxParFlux[row.id_flux] += totalLignePenalite;

        return {
            ...row,
            montant_penalite_unitaire: row.quantite > 0 ? penaliteUnitaire : row.montant_penalite_unitaire,
            jours_ecoules_reel: joursEcoules,
            montant_penalite_detail: totalLignePenalite
        };
    });

    return lignesCalculees.map(row => {
        const totalFlux = totauxParFlux[row.id_flux] || 0;
        return {
            ...row,
            montant_penalite: totalFlux, 
            tot_penalite: totalFlux
        };
    });
};

exports.updateConsignation = ({ companyId, userId, userName, fluxId, data }) => {
    const db = getDb();
    
    const { items, montant_total, type_garantie, montant_recu, garantie_libelle } = data;

    const aDesRetours = db.prepare(`
        SELECT COUNT(*) as count 
        FROM flux_emballages_details 
        WHERE flux_id = ? AND company_id = ? AND quantite < 0
    `).get(fluxId, companyId);

    if (aDesRetours.count > 0) {
        throw new Error("Impossible de modifier cette consignation : des retours (déconsignations) ont déjà été enregistrés.");
    }

    if (!items || items.length === 0) throw new Error("La consignation doit contenir au moins un emballage.");
    
    db.transaction(() => {
        const anciensDetails = db.prepare(`SELECT id, packaging_id, quantite FROM flux_emballages_details WHERE flux_id = ?`).all(fluxId);
        const syncQueueStmt = db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES (?, ?, ?, ?)`);
        
        for (const detail of anciensDetails) {
            db.prepare(`
                UPDATE packaging 
                SET stock_actuel = stock_actuel + ?, stock_consigne = stock_consigne - ?, sync_status = 'pending', updated_at = CURRENT_TIMESTAMP 
                WHERE id = ? AND company_id = ?
            `).run(detail.quantite, detail.quantite, detail.packaging_id, companyId);
            syncQueueStmt.run('packaging', detail.packaging_id, 'UPDATE', companyId);
            syncQueueStmt.run('flux_emballages_details', detail.id, 'DELETE', companyId);
        }

        db.prepare(`DELETE FROM flux_emballages_details WHERE flux_id = ?`).run(fluxId);

        let totalCalcule = 0;
        
        const insertDetailStmt = db.prepare(`
            INSERT INTO flux_emballages_details 
            (id, company_id, flux_id, packaging_id, quantite, quantite_restante, prix_unitaire, montant_ligne, montant_penalite_unitaire, regle_tarifaire_snapshot, sync_status) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        `);

        for (const item of items) {
            const targetPackagingId = item.packaging_id || item.id;
            const qte = parseFloat(item.qte || item.quantite) || 0;
            const pxUnit = parseFloat(item.prix_unitaire || item.prix_consigne) || 0;
            const detailId = genererIdMouvement('DET');
            
            totalCalcule += (qte * pxUnit);

            const packaging = db.prepare('SELECT rule_id FROM packaging WHERE id = ?').get(targetPackagingId);
            const regleComplete = packaging?.rule_id ? consignationRules.getRuleById(packaging.rule_id, companyId) : null;
            const calculs = consignationRules.simulerPrixRemboursement(
                targetPackagingId, new Date().toISOString(), companyId,
                regleComplete ? JSON.stringify(regleComplete) : null
            );

            insertDetailStmt.run(
                detailId, companyId, fluxId, targetPackagingId,
                qte, qte, pxUnit, (qte * pxUnit), calculs.montant_penalite_unitaire,
                regleComplete ? JSON.stringify(regleComplete) : null
            );
            
            syncQueueStmt.run('flux_emballages_details', detailId, 'INSERT', companyId);
            
            db.prepare(`
                UPDATE packaging 
                SET stock_actuel = stock_actuel - ?, stock_consigne = stock_consigne + ?, sync_status = 'pending', updated_at = CURRENT_TIMESTAMP 
                WHERE id = ? AND company_id = ?
            `).run(qte, qte, targetPackagingId, companyId);
            syncQueueStmt.run('packaging', targetPackagingId, 'UPDATE', companyId);
        }

        const finalMontantTotal = montant_total || totalCalcule;
        const finalTypeGarantie = type_garantie || 'ESPECES';
        
        const finalMontantRecu = finalTypeGarantie === 'PHYSIQUE' ? 0 : (parseFloat(montant_recu) || 0);
        const finalResteAPayer = finalTypeGarantie === 'PHYSIQUE' ? 0 : Math.max(0, finalMontantTotal - finalMontantRecu);
        const finalGarantieLibelle = finalTypeGarantie === 'PHYSIQUE' ? (garantie_libelle || "Pièce d'identité") : null;

        db.prepare(`
            UPDATE flux_emballages 
            SET montant_total = ?, 
                type_garantie = ?, 
                montant_recu = ?, 
                reste_a_payer = ?, 
                garantie_libelle = ?, 
                sync_status = 'pending',
                updated_at = CURRENT_TIMESTAMP 
            WHERE id = ? AND company_id = ?
        `).run(finalMontantTotal, finalTypeGarantie, finalMontantRecu, finalResteAPayer, finalGarantieLibelle, fluxId, companyId);

        syncQueueStmt.run('flux_emballages', fluxId, 'UPDATE', companyId);

        logAction({ 
            userId, 
            userName, 
            actionType: 'MODIFICATION', 
            tableConcernee: 'flux_emballages', 
            referenceId: fluxId, 
            description: finalTypeGarantie === 'PHYSIQUE'
                ? `Consignation mise à jour avec Garantie Physique : ${finalGarantieLibelle}`
                : `Consignation mise à jour (Reçu: ${finalMontantRecu} F, Reste: ${finalResteAPayer} F)`, 
            companyId 
        });
    })();

    return fluxId;
};

exports.deleteConsignation = ({ companyId, userId, userName, fluxId }) => {
    const db = getDb();
    
    const aDesRetours = db.prepare(`
        SELECT COUNT(*) as count 
        FROM flux_emballages_details 
        WHERE flux_id = ? AND company_id = ? AND quantite < 0
    `).get(fluxId, companyId);

    if (aDesRetours.count > 0) {
        throw new Error("Impossible de supprimer cette consignation : des retours (déconsignations) ont déjà été enregistrés.");
    }

    db.transaction(() => {
        const details = db.prepare(`SELECT id, packaging_id, quantite FROM flux_emballages_details WHERE flux_id = ?`).all(fluxId);
        const syncQueueStmt = db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES (?, ?, ?, ?)`);

        for (const d of details) {
            db.prepare(`
                UPDATE packaging 
                SET stock_actuel = stock_actuel + ?, stock_consigne = stock_consigne - ?, sync_status = 'pending', updated_at = CURRENT_TIMESTAMP 
                WHERE id = ? AND company_id = ?
            `).run(d.quantite, d.quantite, d.packaging_id, companyId);
            syncQueueStmt.run('packaging', d.packaging_id, 'UPDATE', companyId);
            syncQueueStmt.run('flux_emballages_details', d.id, 'DELETE', companyId);
        }
        
        db.prepare(`DELETE FROM flux_emballages_details WHERE flux_id = ?`).run(fluxId);
        db.prepare(`DELETE FROM flux_emballages WHERE id = ? AND company_id = ?`).run(fluxId, companyId);
        
        syncQueueStmt.run('flux_emballages', fluxId, 'DELETE', companyId);
        
        logAction({ userId, userName, actionType: 'SUPPRESSION', tableConcernee: 'flux_emballages', referenceId: fluxId, description: `Consignation supprimée`, companyId });
    })();
};

exports.getConsignationById = (companyId, fluxId) => {
    const db = getDb();
    
    const header = db.prepare(`
        SELECT 
            f.*, 
            f.type_garantie,
            f.montant_recu,
            f.garantie_libelle,
            s.lot_id, 
            s.id as numero_technique_vente
        FROM flux_emballages f
        LEFT JOIN sales s ON f.sale_id = s.id
        WHERE f.id = ? AND f.company_id = ?
    `).get(fluxId, companyId);

    if (!header) return null;

    const items = db.prepare(`
        SELECT d.*, p.nom as nom_emballage 
        FROM flux_emballages_details d
        LEFT JOIN packaging p ON d.packaging_id = p.id
        WHERE d.flux_id = ? AND d.company_id = ?
    `).all(fluxId, companyId);

    return {
        ...header,
        numero_facture: header.lot_id || header.sale_id, 
        items: items
    };
};