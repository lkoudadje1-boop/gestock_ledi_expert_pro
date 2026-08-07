const { getDb } = require('../config/database');
const { logAction } = require('../utils/auditHelper');

function genererIdArticle() {
    return `EMB-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`;
}

exports.createPackaging = ({ companyId, userId, userName, data }) => {
    const db = getDb();
    const { nom, unite_id, rule_id, prix_consigne, prix_deconsigne, prix_achat, stock_alerte } = data;
    
    const packagingId = genererIdArticle();

    db.transaction(() => {
// Dans createPackaging
db.prepare(`
    INSERT INTO packaging (
        id, nom, unite_id, rule_id, prix_consigne, prix_deconsigne, 
        prix_achat, stock_alerte, company_id, sync_status, cmp -- AJOUTEZ CMP ICI
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0) -- Valeur par défaut 0
`).run(
    packagingId, nom.toUpperCase(), unite_id, rule_id || null, 
    prix_consigne || 0, prix_deconsigne || 0, prix_achat || 0, 
    stock_alerte || 0, companyId
);
        db.prepare(`
            INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
            VALUES ('packaging', ?, 'INSERT', ?)
        `).run(packagingId, companyId);

        logAction({
            userId,
            userName,
            actionType: 'INSERTION',
            tableConcernee: 'packaging',
            referenceId: packagingId,
            description: `Création de l'emballage: ${nom.toUpperCase()}`,
            companyId
        });
    })();

    return packagingId;
};

// Récupérer tous les emballages d'une entreprise
// Récupérer tous les emballages d'une entreprise
exports.getAllPackagings = (companyId) => {
    const db = getDb();
    try {
        // 1. On récupère les packagings, le nom de l'unité ET les infos de la règle globale
        const packagings = db.prepare(`
            SELECT 
                p.*, 
                u.nom as unite_nom,
                r.code_regle,
                r.libelle as regle_libelle
            FROM packaging p
            LEFT JOIN unites u ON p.unite_id = u.id
            LEFT JOIN packaging_rules r ON p.rule_id = r.id
            WHERE p.company_id = ?
        `).all(companyId);

        // 2. Pour chaque packaging, on va chercher ses paliers de règles (tiers) s'il a une règle associée
        return packagings.map(pkg => {
            let tiers = [];
            
            if (pkg.rule_id) {
                tiers = db.prepare(`
                    SELECT id, jours_min, jours_max, type_calcul, valeur 
                    FROM packaging_rule_tiers 
                    WHERE rule_id = ? AND company_id = ?
                    ORDER BY jours_min ASC
                `).all(pkg.rule_id, companyId);
            }

            // On assemble le tout proprement pour le frontend
            return {
                ...pkg,
                regle: pkg.rule_id ? {
                    id: pkg.rule_id,
                    code_regle: pkg.code_regle,
                    libelle: pkg.regle_libelle,
                    tiers: tiers
                } : null
            };
        });

    } catch (error) {
        console.warn("⚠️ Échec de la récupération complète des packagings avec règles :", error.message);
        
        // Solution de secours sans jointures complexes pour éviter de bloquer l'application
        try {
            return db.prepare(`
                SELECT *, NULL as unite_nom, NULL as regle 
                FROM packaging 
                WHERE company_id = ?
            `).all(companyId);
        } catch (fallbackError) {
            console.error("Erreur critique sur la table packaging :", fallbackError.message);
            return [];
        }
    }
};

// Récupérer un emballage par son ID
exports.getPackagingById = (id, companyId) => {
    const db = getDb();
    return db.prepare(`
        SELECT * FROM packaging 
        WHERE id = ? AND company_id = ?
    `).get(id, companyId);
};

// Mettre à jour un emballage
exports.updatePackaging = ({ id, companyId, userId, userName, data }) => {
    const db = getDb();
    const { nom, unite_id, rule_id, prix_consigne, prix_deconsigne, prix_achat, stock_alerte } = data;

    let info;
    db.transaction(() => {
     // Dans updatePackaging
const result = db.prepare(`
    UPDATE packaging 
    SET nom = ?, unite_id = ?, rule_id = ?, prix_consigne = ?, 
        prix_deconsigne = ?, prix_achat = ?, stock_alerte = ?, 
        cmp = ?, sync_status = 'pending' -- AJOUTEZ CMP = ? ICI
    WHERE id = ? AND company_id = ?
`).run(
    nom.toUpperCase(), unite_id, rule_id || null, 
    prix_consigne || 0, prix_deconsigne || 0, prix_achat || 0, 
    stock_alerte || 0, data.cmp || 0, id, companyId // AJOUTEZ data.cmp || 0 ICI
);

        info = result.changes;

        if (info > 0) {
            // Ajouter à la queue de synchro pour le serveur distant
            db.prepare(`
                INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
                VALUES ('packaging', ?, 'UPDATE', ?)
            `).run(id, companyId);

            // Tracer l'action
            logAction({
                userId,
                userName,
                actionType: 'MODIFICATION',
                tableConcernee: 'packaging',
                referenceId: id,
                description: `Modification de l'emballage: ${nom.toUpperCase()}`,
                companyId
            });
        }
    })();

    return info;
};

// Supprimer un emballage
exports.deletePackaging = ({ id, companyId, userId, userName }) => {
    const db = getDb();
    let info;

    db.transaction(() => {
        // Optionnel : Récupérer le nom avant suppression pour un log d'audit plus précis
        const current = db.prepare('SELECT nom FROM packaging WHERE id = ? AND company_id = ?').get(id, companyId);
        
        const result = db.prepare(`
            DELETE FROM packaging 
            WHERE id = ? AND company_id = ?
        `).run(id, companyId);

        info = result.changes;

        if (info > 0) {
            db.prepare(`
                INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
                VALUES ('packaging', ?, 'DELETE', ?)
            `).run(id, companyId);

            logAction({
                userId,
                userName,
                actionType: 'SUPPRESSION',
                tableConcernee: 'packaging',
                referenceId: id,
                description: `Suppression de l'emballage: ${current ? current.nom : id}`,
                companyId
            });
        }
    })();

    return info;
};