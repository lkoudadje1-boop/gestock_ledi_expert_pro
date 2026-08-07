const { getDb } = require('../config/database');
const { logAction } = require('../utils/auditHelper');

function genererIdClient() {
    return `CUS-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`;
}

// 📌 GET ALL
exports.getAllCustomers = (companyId) => {
    const db = getDb();

    return db.prepare(`
        SELECT * FROM customers 
        WHERE company_id = ? 
        ORDER BY nom ASC
    `).all(companyId);
};

// 📌 CREATE
exports.createCustomer = ({ companyId, userId, userName, data }) => {
    const db = getDb();
    const { nom, nif, telephone, email, adresse } = data;

    const customerId = genererIdClient();

    db.transaction(() => {
        db.prepare(`
            INSERT INTO customers (
                id, company_id, nom, nif, contact, telephone, email, adresse, is_active, sync_status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'pending')
        `).run(
            customerId,
            companyId,
            nom.toUpperCase(),
            nif || '0',
            nom.toUpperCase(),
            telephone || '',
            email || '',
            adresse || ''
        );

        db.prepare(`
            INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
            VALUES ('customers', ?, 'INSERT', ?)
        `).run(customerId, companyId);

        logAction({
            userId,
            userName,
            actionType: 'INSERTION',
            tableConcernee: 'customers',
            referenceId: customerId,
            description: `Création du client: ${nom.toUpperCase()}`,
            companyId
        });
    })();

    return customerId;
};

// 📌 UPDATE
exports.updateCustomer = ({ id, companyId, userId, userName, data }) => {
    const db = getDb();
    const { nom, nif, telephone, email, adresse } = data;

    let result;

    db.transaction(() => {
        result = db.prepare(`
            UPDATE customers 
            SET nom = ?, nif = ?, contact = ?, telephone = ?, email = ?, adresse = ?, sync_status = 'pending'
            WHERE id = ? AND company_id = ?
        `).run(
            nom.toUpperCase(),
            nif || '0',
            nom.toUpperCase(),
            telephone || '',
            email || '',
            adresse || '',
            id,
            companyId
        );

        if (result.changes > 0) {
            db.prepare(`
                INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
                VALUES ('customers', ?, 'UPDATE', ?)
            `).run(id, companyId);

            logAction({
                userId,
                userName,
                actionType: 'MODIFICATION',
                tableConcernee: 'customers',
                referenceId: id,
                description: `Mise à jour du client: ${nom.toUpperCase()}`,
                companyId
            });
        }
    })();

    return result;
};

// 📌 STATUS
exports.updateStatus = ({ id, companyId, userId, userName, is_active }) => {
    const db = getDb();
    let result;

    db.transaction(() => {
        result = db.prepare(`
            UPDATE customers 
            SET is_active = ?, sync_status = 'pending'
            WHERE id = ? AND company_id = ?
        `).run(is_active ? 1 : 0, id, companyId);

        if (result.changes > 0) {
            db.prepare(`
                INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
                VALUES ('customers', ?, 'UPDATE', ?)
            `).run(id, companyId);

            logAction({
                userId,
                userName,
                actionType: 'MODIFICATION',
                tableConcernee: 'customers',
                referenceId: id,
                description: `Statut client ${id} → ${is_active ? 'Actif' : 'Archivé'}`,
                companyId
            });
        }
    })();

    return result;
};

// 📌 DELETE
exports.deleteCustomer = ({ id, companyId, userId, userName }) => {
    const db = getDb();
    let result;

    db.transaction(() => {
        db.prepare(`
            INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
            VALUES ('customers', ?, 'DELETE', ?)
        `).run(id, companyId);

        result = db.prepare(`
            DELETE FROM customers 
            WHERE id = ? AND company_id = ?
        `).run(id, companyId);

        if (result.changes > 0) {
            logAction({
                userId,
                userName,
                actionType: 'SUPPRESSION',
                tableConcernee: 'customers',
                referenceId: id,
                description: `Suppression client ${id}`,
                companyId
            });
        }
    })();

    return result;
};