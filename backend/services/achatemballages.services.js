const { getDb } = require('../config/database');
const { logAction } = require('../utils/auditHelper');

function genererIdAchat() {
    return `PURCH-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`;
}

// 💡 Utilitaire interne pour enregistrer les actions dans la file de synchro
function queueSync(db, tableName, recordId, operation, companyId) {
    db.prepare(`
        INSERT INTO sync_queue (table_name, record_id, operation, company_id)
        VALUES (?, ?, ?, ?)
    `).run(tableName, String(recordId), operation, companyId);
}

exports.getAllAchats = (companyId) => {
    const db = getDb();
    return db.prepare(`
        SELECT pp.*, p.nom as emballage_nom, COALESCE(p.cmp, 0) as cmp_actuel
        FROM packaging_purchases pp
        LEFT JOIN packaging p ON pp.packaging_id = p.id
        WHERE pp.company_id = ?
        ORDER BY pp.created_at DESC
    `).all(companyId);
};

exports.createAchat = ({ companyId, userId, userName, data }) => {
    const db = getDb();
    const { packaging_id, supplier_id, quantite, montant_facture, facture_ref } = data;
    
    const qte = Number(quantite);
    const total = Number(montant_facture);
    const prix = qte > 0 ? total / qte : 0;

    const id = genererIdAchat();
    const movId = `MOV-${Date.now()}`;

    db.transaction(() => {
        const pkg = db.prepare('SELECT stock_actuel, cmp FROM packaging WHERE id = ? AND company_id = ?').get(packaging_id, companyId);
        
        const stockAvant = pkg.stock_actuel || 0;
        const cmpAvant = pkg.cmp || 0;
        const stockApres = stockAvant + qte;
        
        const nouveauCmp = ((stockAvant * cmpAvant) + total) / stockApres;

        // 1. Insertion Achat
        db.prepare(`INSERT INTO packaging_purchases (id, packaging_id, supplier_id, user_id, quantite, prix_unitaire, montant_total, facture_ref, company_id, sync_status) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`)
          .run(id, packaging_id, supplier_id, userId, qte, prix, total, facture_ref, companyId);
        queueSync(db, 'packaging_purchases', id, 'INSERT', companyId);

        // 2. Mise à jour Packaging (Stock & CMP)
        db.prepare(`UPDATE packaging SET stock_actuel = ?, cmp = ?, sync_status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND company_id = ?`)
          .run(stockApres, nouveauCmp, packaging_id, companyId);
        queueSync(db, 'packaging', packaging_id, 'UPDATE', companyId);

        // 3. Mouvement de stock
        db.prepare(`INSERT INTO packaging_movements (id, packaging_id, type_mouvement, reference_id, quantite, stock_avant, stock_apres, user_id, company_id, sync_status) 
                    VALUES (?, ?, 'ACHAT', ?, ?, ?, ?, ?, ?, 'pending')`)
          .run(movId, packaging_id, id, qte, stockAvant, stockApres, userId, companyId);
        queueSync(db, 'packaging_movements', movId, 'INSERT', companyId);
        
        logAction({ userId, userName, actionType: 'INSERTION', tableConcernee: 'packaging_purchases', referenceId: id, description: `Achat ${packaging_id}`, companyId });
    })();
    return id;
};

exports.updateAchat = (id, companyId, userId, userName, data) => {
    const db = getDb();
    const { quantite, prix_unitaire, supplier_id, facture_ref } = data;
    const nouveau_total = quantite * prix_unitaire;

    db.transaction(() => {
        const old = db.prepare('SELECT * FROM packaging_purchases WHERE id = ? AND company_id = ?').get(id, companyId);
        const diff = quantite - old.quantite;
        
        db.prepare(`UPDATE packaging SET stock_actuel = stock_actuel + ?, sync_status = 'pending' WHERE id = ? AND company_id = ?`)
          .run(diff, old.packaging_id, companyId);
        queueSync(db, 'packaging', old.packaging_id, 'UPDATE', companyId);

        db.prepare(`UPDATE packaging_purchases SET supplier_id=?, quantite=?, prix_unitaire=?, montant_total=?, facture_ref=?, sync_status='pending', updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`)
          .run(supplier_id, quantite, prix_unitaire, nouveau_total, facture_ref, id, companyId);
        queueSync(db, 'packaging_purchases', id, 'UPDATE', companyId);
          
        logAction({ userId, userName, actionType: 'MODIFICATION', tableConcernee: 'packaging_purchases', referenceId: id, companyId });
    })();
};

exports.handleAction = (id, companyId, userId, userName, action) => {
    const db = getDb();
    const cleanNum = (val) => Math.round((parseFloat(val) || 0) * 100) / 100;
    const movId = `MOV-ANN-${Date.now()}`;

    db.transaction(() => {
        const achat = db.prepare('SELECT * FROM packaging_purchases WHERE id = ? AND company_id = ?').get(id, companyId);
        if (!achat) throw new Error("Achat introuvable");

        if (action === 'DELETE') {
            const pkg = db.prepare('SELECT stock_actuel, cmp FROM packaging WHERE id = ? AND company_id = ?').get(achat.packaging_id, companyId);
            
            const stockAvant = pkg.stock_actuel || 0;
            const cmpAvant = pkg.cmp || 0;
            const qteAnnulee = achat.quantite;
            const prixAchatInitial = achat.prix_unitaire;
            
            const stockApres = cleanNum(stockAvant - qteAnnulee);
            let nouveauCmp = cmpAvant;

            if (stockApres > 0) {
                const valeurTotaleAvant = stockAvant * cmpAvant;
                const valeurAchatAnnulee = qteAnnulee * prixAchatInitial;
                nouveauCmp = cleanNum((valeurTotaleAvant - valeurAchatAnnulee) / stockApres);
                if (nouveauCmp < 0) nouveauCmp = cmpAvant;
            }

            db.prepare(`UPDATE packaging_purchases SET is_active = 0, is_cancelled = 1, sync_status = 'pending' WHERE id = ?`).run(id);
            queueSync(db, 'packaging_purchases', id, 'UPDATE', companyId);

            db.prepare(`UPDATE packaging SET stock_actuel = ?, cmp = ?, sync_status = 'pending' WHERE id = ? AND company_id = ?`)
              .run(stockApres, nouveauCmp, achat.packaging_id, companyId);
            queueSync(db, 'packaging', achat.packaging_id, 'UPDATE', companyId);

            db.prepare(`INSERT INTO packaging_movements (id, packaging_id, type_mouvement, reference_id, quantite, stock_avant, stock_apres, user_id, company_id, sync_status) 
                        VALUES (?, ?, 'ANNULATION_ACHAT', ?, ?, ?, ?, ?, ?, 'pending')`)
              .run(movId, achat.packaging_id, id, -qteAnnulee, stockAvant, stockApres, userId, companyId);
            queueSync(db, 'packaging_movements', movId, 'INSERT', companyId);

        } else if (action === 'ARCHIVE') {
            db.prepare(`UPDATE packaging_purchases SET is_active = 0, is_archive = 1, sync_status = 'pending' WHERE id = ?`).run(id);
            queueSync(db, 'packaging_purchases', id, 'UPDATE', companyId);
        }

        logAction({ userId, userName, actionType: action, tableConcernee: 'packaging_purchases', referenceId: id, companyId });
    })();
};