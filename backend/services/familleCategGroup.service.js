const { getDb } = require('../config/database');
const { logAction } = require('../utils/auditHelper');

// Helper interne pour les IDs
function genererIdStructure(prefix) {
    return `${prefix}-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`;
}

// Vérification de verrouillage (Inventaire)
function checkInventoryLock(db, companyId) {
    const activeInv = db.prepare(`
        SELECT id FROM inventories 
        WHERE company_id = ? AND statut = 'en_cours' 
        LIMIT 1
    `).get(companyId);
    if (activeInv) throw new Error("Action bloquée : Un inventaire est en cours.");
}

// 📌 GET ALL
exports.getAll = (type, companyId) => {
    const db = getDb();
    let sql = "";
    if (type === 'familles') {
        sql = "SELECT * FROM familles WHERE company_id = ? ORDER BY nom ASC";
    } else if (type === 'categories') {
        sql = "SELECT c.*, f.nom as famille_nom FROM categories c LEFT JOIN familles f ON c.famille_id = f.id WHERE c.company_id = ? ORDER BY c.nom ASC";
    } else {
        sql = "SELECT g.*, c.nom as category_nom FROM product_groups g LEFT JOIN categories c ON g.category_id = c.id WHERE g.company_id = ? ORDER BY g.nom ASC";
    }
    return db.prepare(sql).all(companyId);
};

// 📌 CREATE
exports.create = ({ type, data, companyId, userId, userName }) => {
    const db = getDb();
    const { nom, famille_id, category_id } = data;
    
    checkInventoryLock(db, companyId);

    const prefix = type === 'familles' ? 'FAM' : (type === 'categories' ? 'CAT' : 'GRP');
    const table = type === 'groups' ? 'product_groups' : type;
    const newId = genererIdStructure(prefix);
    const nomPropre = nom.toUpperCase().trim();

    db.transaction(() => {
        if (type === 'familles') {
            db.prepare("INSERT INTO familles (id, nom, company_id, is_active, sync_status) VALUES (?, ?, ?, 1, 'pending')").run(newId, nomPropre, companyId);
        } else if (type === 'categories') {
            db.prepare("INSERT INTO categories (id, nom, famille_id, company_id, is_active, sync_status) VALUES (?, ?, ?, ?, 1, 'pending')").run(newId, nomPropre, famille_id, companyId);
        } else if (type === 'groups') {
            db.prepare("INSERT INTO product_groups (id, nom, category_id, company_id, is_active, sync_status) VALUES (?, ?, ?, ?, 1, 'pending')").run(newId, nomPropre, category_id, companyId);
        }

        db.prepare("INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES (?, ?, 'INSERT', ?)").run(table, newId, companyId);

        logAction({
            userId, userName, actionType: 'INSERTION', tableConcernee: table, referenceId: newId,
            description: `Création ${type}: ${nomPropre}`, companyId
        });
    })();
    return newId;
};

// 📌 STATUS
exports.updateStatus = ({ type, id, is_active, companyId, userId, userName }) => {
    const db = getDb();
    const table = type === 'groups' ? 'product_groups' : type;
    
    checkInventoryLock(db, companyId);
    const activeValue = Number(is_active) === 1 ? 1 : 0;

    return db.transaction(() => {
        // Liste pour mémoriser tous les enregistrements modifiés en cascade afin d'alimenter la sync_queue
        let subCategories = [];
        let subGroups = [];
        let subProducts = [];
        
        // --- 🟢 CAS 1 : LIBÉRATION (RESTAURATION COHÉRENTE DE LA LIGNÉE) ---
        if (activeValue === 1) {
            if (type === 'categories') {
                const gp = db.prepare(`SELECT f.is_active, f.nom FROM familles f JOIN categories c ON c.famille_id = f.id WHERE c.id = ? AND c.company_id = ?`).get(id, companyId);
                if (gp && Number(gp.is_active) === 0) throw new Error(`🚫 Grand-parent (Famille "${gp.nom}") enfermé. Impossible de restaurer.`);
            } 
            else if (type === 'groups') {
                const lineage = db.prepare(`
                    SELECT c.is_active as cat_active, c.nom as cat_nom, f.is_active as fam_active, f.nom as fam_nom
                    FROM product_groups g
                    JOIN categories c ON g.category_id = c.id
                    JOIN familles f ON c.famille_id = f.id
                    WHERE g.id = ? AND g.company_id = ?
                `).get(id, companyId);
                if (lineage && (Number(lineage.fam_active) === 0 || Number(lineage.cat_active) === 0)) {
                    throw new Error(`🚫 Lignée verrouillée (Famille ou Catégorie enfermée).`);
                }
            }

            // ⚡ CASCADE DE LIBÉRATION + SÉCURISATION DES IDS POUR LA SYNCHRONISATION
            if (type === 'familles') {
                subCategories = db.prepare(`SELECT id FROM categories WHERE famille_id = ? AND company_id = ?`).all(id, companyId).map(r => r.id);
                subGroups = db.prepare(`SELECT id FROM product_groups WHERE category_id IN (SELECT id FROM categories WHERE famille_id = ?) AND company_id = ?`).all(id, companyId).map(r => r.id);
                subProducts = db.prepare(`SELECT id FROM products WHERE group_id IN (SELECT id FROM product_groups WHERE category_id IN (SELECT id FROM categories WHERE famille_id = ?)) AND company_id = ?`).all(id, companyId).map(r => r.id);

                db.prepare(`UPDATE categories SET is_active = 1, sync_status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE famille_id = ? AND company_id = ?`).run(id, companyId);
                db.prepare(`UPDATE product_groups SET is_active = 1, sync_status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE category_id IN (SELECT id FROM categories WHERE famille_id = ?) AND company_id = ?`).run(id, companyId);
                db.prepare(`UPDATE products SET is_active = 1, sync_status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE group_id IN (SELECT id FROM product_groups WHERE category_id IN (SELECT id FROM categories WHERE famille_id = ?)) AND company_id = ?`).run(id, companyId);
            } 
            else if (type === 'categories') {
                subGroups = db.prepare(`SELECT id FROM product_groups WHERE category_id = ? AND company_id = ?`).all(id, companyId).map(r => r.id);
                subProducts = db.prepare(`SELECT id FROM products WHERE group_id IN (SELECT id FROM product_groups WHERE category_id = ?) AND company_id = ?`).all(id, companyId).map(r => r.id);

                db.prepare(`UPDATE product_groups SET is_active = 1, sync_status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE category_id = ? AND company_id = ?`).run(id, companyId);
                // 🛠️ CORRECTION EXÉCUTÉE ICI : Retrait du doublon d'argument "id" pour éviter le crash SQL
                db.prepare(`UPDATE products SET is_active = 1, sync_status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE group_id IN (SELECT id FROM product_groups WHERE category_id = ?) AND company_id = ?`).run(id, companyId);
            }
            else if (type === 'groups') {
                subProducts = db.prepare(`SELECT id FROM products WHERE group_id = ? AND company_id = ?`).all(id, companyId).map(r => r.id);
                db.prepare(`UPDATE products SET is_active = 1, sync_status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE group_id = ? AND company_id = ?`).run(id, companyId);
            }
        }

        // --- 🔴 CAS 2 : ARCHIVAGE (VÉRIFICATION SÉCURISÉE DU STOCK RESTE EN AMONT) ---
        else {
            // Extraction préalable des identifiants impactés pour la file de synchronisation réseau
            if (type === 'familles') {
                subCategories = db.prepare(`SELECT id FROM categories WHERE famille_id = ? AND company_id = ?`).all(id, companyId).map(r => r.id);
                subGroups = db.prepare(`SELECT id FROM product_groups WHERE category_id IN (SELECT id FROM categories WHERE famille_id = ?) AND company_id = ?`).all(id, companyId).map(r => r.id);
                subProducts = db.prepare(`SELECT id FROM products WHERE group_id IN (SELECT id FROM product_groups WHERE category_id IN (SELECT id FROM categories WHERE famille_id = ?)) AND company_id = ?`).all(id, companyId).map(r => r.id);
            } 
            else if (type === 'categories') {
                subGroups = db.prepare(`SELECT id FROM product_groups WHERE category_id = ? AND company_id = ?`).all(id, companyId).map(r => r.id);
                subProducts = db.prepare(`SELECT id FROM products WHERE group_id IN (SELECT id FROM product_groups WHERE category_id = ?) AND company_id = ?`).all(id, companyId).map(r => r.id);
            }
            else if (type === 'groups') {
                subProducts = db.prepare(`SELECT id FROM products WHERE group_id = ? AND company_id = ?`).all(id, companyId).map(r => r.id);
            }

            // 🛡️ VERROU COMPTABLE COMPLEMENTAIRE : Interdire l'archivage en cascade s'il reste du stock sur un produit de la lignée
            if (subProducts.length > 0) {
                const checkStockStmt = db.prepare(`SELECT nom, stock_actuel FROM products WHERE id = ? AND stock_actuel > 0`);
                for (const prodId of subProducts) {
                    const itemAvecStock = checkStockStmt.get(prodId);
                    if (itemAvecStock) {
                        throw new Error(`🚫 Opération refusée : Impossible d'archiver la structure, car l'article "${itemAvecStock.nom}" possède encore ${itemAvecStock.stock_actuel} unité(s) en stock.`);
                    }
                }
            }

            // EXECUTION DES EXCLUSIONS EN CASCADE
            if (type === 'familles') {
                db.prepare(`UPDATE categories SET is_active = 0, sync_status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE famille_id = ? AND company_id = ?`).run(id, companyId);
                db.prepare(`UPDATE product_groups SET is_active = 0, sync_status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE category_id IN (SELECT id FROM categories WHERE famille_id = ?) AND company_id = ?`).run(id, companyId);
                db.prepare(`UPDATE products SET is_active = 0, sync_status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE group_id IN (SELECT id FROM product_groups WHERE category_id IN (SELECT id FROM categories WHERE famille_id = ?)) AND company_id = ?`).run(id, companyId);
            } 
            else if (type === 'categories') {
                db.prepare(`UPDATE product_groups SET is_active = 0, sync_status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE category_id = ? AND company_id = ?`).run(id, companyId);
                db.prepare(`UPDATE products SET is_active = 0, sync_status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE group_id IN (SELECT id FROM product_groups WHERE category_id = ?) AND company_id = ?`).run(id, companyId);
            }
            else if (type === 'groups') {
                db.prepare(`UPDATE products SET is_active = 0, sync_status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE group_id = ? AND company_id = ?`).run(id, companyId);
            }
        }

        // 3️⃣ INSERER COMPLÈTEMENT LES IDS CASCADÉS DANS LA FILE D'ATTENTE SYNC_QUEUE
        const syncQueueStmt = db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES (?, ?, 'UPDATE', ?)`);
        
        subCategories.forEach(subId => syncQueueStmt.run('categories', subId, companyId));
        subGroups.forEach(subId => syncQueueStmt.run('product_groups', subId, companyId));
        subProducts.forEach(subId => syncQueueStmt.run('products', subId, companyId));

        // 4️⃣ MISE À JOUR FINALE ET QUEUE DE L'ÉLÉMENT RACINE DECLENCHEUR
        const result = db.prepare(`UPDATE ${table} SET is_active = ?, sync_status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND company_id = ?`).run(activeValue, id, companyId);
        syncQueueStmt.run(table, id, companyId);

        logAction({
            userId, userName, actionType: 'MODIFICATION',
            tableConcernee: table, referenceId: id,
            description: `${activeValue === 1 ? 'RESTAURATION' : 'ARCHIVAGE'} en cascade structurelle pour l'ID : ${id}`,
            companyId
        });

        return result;
    })();
};
exports.update = ({ type, id, data, companyId, userId, userName }) => {
    const db = getDb();
    const { nom, famille_id, category_id } = data;
    
    checkInventoryLock(db, companyId);

    const table = type === 'groups' ? 'product_groups' : type;
    const nomPropre = nom ? nom.toUpperCase().trim() : null;

    if (!nomPropre) {
        throw new Error("Le nom de l'élément de structure ne peut pas être vide.");
    }

    return db.transaction(() => {
        // 🛠️ MISE À JOUR ADAPTATIVE DES CHAMPS TEXTUELS SELON LE MODULE
        if (type === 'familles') {
            db.prepare(`
                UPDATE familles 
                SET nom = ?, sync_status = 'pending', updated_at = CURRENT_TIMESTAMP 
                WHERE id = ? AND company_id = ?
            `).run(nomPropre, id, companyId);
        } 
        else if (type === 'categories') {
            if (!famille_id) throw new Error("La famille associée est obligatoire.");
            db.prepare(`
                UPDATE categories 
                SET nom = ?, famille_id = ?, sync_status = 'pending', updated_at = CURRENT_TIMESTAMP 
                WHERE id = ? AND company_id = ?
            `).run(nomPropre, famille_id, id, companyId);
        } 
        else if (type === 'groups') {
            if (!category_id) throw new Error("La catégorie associée est obligatoire.");
            db.prepare(`
                UPDATE product_groups 
                SET nom = ?, category_id = ?, sync_status = 'pending', updated_at = CURRENT_TIMESTAMP 
                WHERE id = ? AND company_id = ?
            `).run(nomPropre, category_id, id, companyId);
        }

        // 💾 ALIMENTATION DE LA QUEUE DE SYNCHRONISATION RÉSEAU
        db.prepare(`
            INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
            VALUES (?, ?, 'UPDATE', ?)
        `).run(table, id, companyId);

        logAction({
            userId, userName, actionType: 'MODIFICATION', tableConcernee: table, referenceId: id,
            description: `Modification du nom de la ${type} (ID: ${id}) -> ${nomPropre}`, companyId
        });

        return true;
    })();
};

exports.processMassiveImport = async (type, items, user) => {
    const db = getDb();
    const prefix = type === 'familles' ? 'FAM' : (type === 'categories' ? 'CAT' : 'GRP');
    const table = type === 'groups' ? 'product_groups' : type;

    return db.transaction(() => {
        for (const item of items) {
            // 🎯 GÉNÉRATION AUTO DE L'ID
            const newId = `${prefix}-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`;
            const nomPropre = item.nom.toUpperCase().trim();
            
            let parentId = null;

            // Recherche du parent par nom
            if (type === 'categories' && item.parentNom) {
                const parent = db.prepare("SELECT id FROM familles WHERE nom = ? AND company_id = ?")
                                 .get(item.parentNom.toUpperCase(), user.companyId);
                if (!parent) throw new Error(`La famille '${item.parentNom}' est introuvable. Importation annulée.`);
                parentId = parent.id;
            } 
            else if (type === 'groups' && item.parentNom) {
                const parent = db.prepare("SELECT id FROM categories WHERE nom = ? AND company_id = ?")
                                 .get(item.parentNom.toUpperCase(), user.companyId);
                if (!parent) throw new Error(`La catégorie '${item.parentNom}' est introuvable. Importation annulée.`);
                parentId = parent.id;
            }

            // Insertion SQL
            if (type === 'familles') {
                db.prepare(`INSERT INTO familles (id, nom, company_id, is_active, sync_status) VALUES (?, ?, ?, ?, 'pending')`)
                  .run(newId, nomPropre, user.companyId, item.is_active);
            } else if (type === 'categories') {
                db.prepare(`INSERT INTO categories (id, nom, famille_id, company_id, is_active, sync_status) VALUES (?, ?, ?, ?, ?, 'pending')`)
                  .run(newId, nomPropre, parentId, user.companyId, item.is_active);
            } else if (type === 'groups') {
                db.prepare(`INSERT INTO product_groups (id, nom, category_id, company_id, is_active, sync_status) VALUES (?, ?, ?, ?, ?, 'pending')`)
                  .run(newId, nomPropre, parentId, user.companyId, item.is_active);
            }

            // Enregistrement pour la synchronisation Cloud
            db.prepare(`INSERT INTO sync_queue (table_name, record_id, operation, company_id) VALUES (?, ?, 'INSERT', ?)`)
              .run(table, newId, user.companyId);
        }
    })();
};