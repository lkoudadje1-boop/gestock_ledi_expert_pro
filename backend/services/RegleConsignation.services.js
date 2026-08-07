const { getDb } = require('../config/database');
const { logAction } = require('../utils/auditHelper');

/**
 * 🛠️ UTILITAIRES DE SÉCURISATION ET FORMATAGE
 */
const cleanNum = (val) =>
    Math.round((parseFloat(val) || 0) * 100) / 100;

const genererIdLocal = (prefix) => 
    `${prefix}-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`;

/**
 * Normalise de manière agressive les chaînes des types de calcul 
 * (Pour rattraper l'UI ou les anciennes lignes défectueuses en DB)
 */
const normaliserTypeCalcul = (typeStr) => {
    if (!typeStr) return 'POURCENTAGE_REPRISE';
    const upper = typeStr.toUpperCase().trim();
    
    if (upper.includes('POURCENTAGE REPRISE') || upper.includes('POURCENTAGE_REPRISE') || upper.includes('REPRISE')) {
        return 'POURCENTAGE_REPRISE';
    }
    if (upper.includes('MONTANT FIXE') || upper.includes('MONTANT_FIXE') || upper.includes('PENALITE')) {
        return 'MONTANT_FIXE_PENALITE';
    }
    if (upper.includes('VENDU')) {
        return 'CONSIDERE_VENDU';
    }
    return upper;
};

// 📌 RÉCUPÉRER TOUTES LES RÈGLES D'UNE ENTREPRISE (AVEC LEURS PALIERS)
exports.getAllRules = (companyId) => {
    const db = getDb();
    
    const rules = db.prepare(`
        SELECT * FROM packaging_rules 
        WHERE company_id = ? 
        ORDER BY created_at DESC
    `).all(companyId);

    return rules.map(rule => {
        const tiers = db.prepare(`
            SELECT * FROM packaging_rule_tiers 
            WHERE rule_id = ? AND company_id = ?
            ORDER BY jours_min ASC
        `).all(rule.id, companyId);
        
        return { ...rule, tiers };
    });
};

// 📌 RÉCUPÉRER UNE RÈGLE AVEC SES PALIERS VIA SON ID
exports.getRuleById = (id, companyId) => {
    const db = getDb();
    
    const rule = db.prepare(`
        SELECT * FROM packaging_rules 
        WHERE id = ? AND company_id = ?
    `).get(id, companyId);

    if (!rule) return null;

    const tiers = db.prepare(`
        SELECT * FROM packaging_rule_tiers 
        WHERE rule_id = ? AND company_id = ?
        ORDER BY jours_min ASC
    `).all(id, companyId);

    return { ...rule, tiers };
};

// 📌 CRÉER UNE RÈGLE ET SES PALIERS (TRANSACTIONNEL AVEC ENQUEUE CLOUD)
exports.createRuleWithTiers = ({ companyId, userId, userName, data }) => {
    const db = getDb();
    const ruleId = genererIdLocal('REG');
    const { code_regle, libelle, tiers } = data;

    validateTiersLogic(tiers);

    const transaction = db.transaction(() => {
        // 1. Insertion de la règle maîtresse
        db.prepare(`
            INSERT INTO packaging_rules (id, code_regle, libelle, company_id, sync_status)
            VALUES (?, ?, ?, ?, 'pending')
        `).run(ruleId, code_regle.toUpperCase(), libelle, companyId);

        // 2. Insertion des paliers (tiers)
        if (tiers && tiers.length > 0) {
            const insertTierStmt = db.prepare(`
                INSERT INTO packaging_rule_tiers (
                    id, rule_id, jours_min, jours_max, type_calcul, valeur, company_id, sync_status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
            `);

            for (const tier of tiers) {
                const tierId = genererIdLocal('TLR');
                insertTierStmt.run(
                    tierId,
                    ruleId,
                    parseInt(tier.jours_min, 10),
                    tier.jours_max ? parseInt(tier.jours_max, 10) : null,
                    normaliserTypeCalcul(tier.type_calcul),
                    cleanNum(tier.valeur),
                    companyId
                );

                // Ajout du palier individuel dans la file de synchronisation
                db.prepare(`
                    INSERT INTO sync_queue (table_name, record_id, operation, company_id)
                    VALUES ('packaging_rule_tiers', ?, 'INSERT', ?)
                `).run(tierId, companyId);
            }
        }

        // 3. Enqueue de la règle maîtresse pour le Cloud
        db.prepare(`
            INSERT INTO sync_queue (table_name, record_id, operation, company_id)
            VALUES ('packaging_rules', ?, 'INSERT', ?)
        `).run(ruleId, companyId);

        // 4. Track de l'action locale (Audit Trail)
        logAction({ 
            userId, userName, actionType: 'INSERTION', tableConcernee: 'packaging_rules', 
            referenceId: ruleId, description: `Création de la règle de consignation : ${code_regle} - ${libelle}`, companyId 
        });

        return ruleId;
    });

    return transaction();
};

// 📌 MODIFIER UNE RÈGLE ET SES PALIERS (PURGE ET RECONSTRUCTION TRACÉE)
exports.updateRuleWithTiers = ({ id, companyId, userId, userName, data }) => {
    const db = getDb();
    const { code_regle, libelle, tiers } = data;

    validateTiersLogic(tiers);

    const transaction = db.transaction(() => {
        // 1. Récupérer les ID des anciens paliers pour notifier leur suppression au Cloud
        const oldTiers = db.prepare(`SELECT id FROM packaging_rule_tiers WHERE rule_id = ? AND company_id = ?`).all(id, companyId);
        for (const oldTier of oldTiers) {
            db.prepare(`
                INSERT INTO sync_queue (table_name, record_id, operation, company_id)
                VALUES ('packaging_rule_tiers', ?, 'DELETE', ?)
            `).run(oldTier.id, companyId);
        }

        // 2. Mettre à jour la règle maîtresse
        const updateResult = db.prepare(`
            UPDATE packaging_rules 
            SET code_regle = ?, libelle = ?, sync_status = 'pending', updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND company_id = ?
        `).run(code_regle.toUpperCase(), libelle, id, companyId);

        if (updateResult.changes === 0) throw new Error("Règle de consignation introuvable ou non modifiée.");

        // 3. Purger localement les anciens paliers
        db.prepare(`DELETE FROM packaging_rule_tiers WHERE rule_id = ? AND company_id = ?`).run(id, companyId);

        // 4. Réinsérer les nouveaux paliers mis à jour
        if (tiers && tiers.length > 0) {
            const insertTierStmt = db.prepare(`
                INSERT INTO packaging_rule_tiers (
                    id, rule_id, jours_min, jours_max, type_calcul, valeur, company_id, sync_status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
            `);

            for (const tier of tiers) {
                const tierId = genererIdLocal('TLR');
                insertTierStmt.run(
                    tierId,
                    id,
                    parseInt(tier.jours_min, 10),
                    tier.jours_max ? parseInt(tier.jours_max, 10) : null,
                    normaliserTypeCalcul(tier.type_calcul),
                    cleanNum(tier.valeur),
                    companyId
                );

                // Enqueue du nouveau palier
                db.prepare(`
                    INSERT INTO sync_queue (table_name, record_id, operation, company_id)
                    VALUES ('packaging_rule_tiers', ?, 'INSERT', ?)
                `).run(tierId, companyId);
            }
        }

        // 5. Enqueue de la modification de la règle maîtresse
        db.prepare(`
            INSERT INTO sync_queue (table_name, record_id, operation, company_id)
            VALUES ('packaging_rules', ?, 'UPDATE', ?)
        `).run(id, companyId);

        logAction({ 
            userId, userName, actionType: 'MODIFICATION', tableConcernee: 'packaging_rules', 
            referenceId: id, description: `Mise à jour globale de la règle de consignation ID: ${id}`, companyId 
        });

        return { changes: 1 };
    });

    return transaction();
};

// 📌 SUPPRIMER UNE RÈGLE ET TOUS SES PALIERS ASSOCIES
exports.deleteRule = ({ id, companyId, userId, userName }) => {
    const db = getDb();

    const transaction = db.transaction(() => {
        const linkedTiers = db.prepare(`SELECT id FROM packaging_rule_tiers WHERE rule_id = ? AND company_id = ?`).all(id, companyId);
        for (const tier of linkedTiers) {
            db.prepare(`
                INSERT INTO sync_queue (table_name, record_id, operation, company_id)
                VALUES ('packaging_rule_tiers', ?, 'DELETE', ?)
            `).run(tier.id, companyId);
        }

        db.prepare(`
            INSERT INTO sync_queue (table_name, record_id, operation, company_id)
            VALUES ('packaging_rules', ?, 'DELETE', ?)
        `).run(id, companyId);

        const result = db.prepare("DELETE FROM packaging_rules WHERE id = ? AND company_id = ?").run(id, companyId);

        logAction({ 
            userId, userName, actionType: 'SUPPRESSION', tableConcernee: 'packaging_rules', 
            referenceId: id, description: `Suppression de la règle de consignation ID: ${id}`, companyId 
        });

        return result;
    });

    return transaction();
};

// 📌 VÉRIFIER SI LA RÈGLE EST LIÉE À DES EMBALLAGES ACTIFS
exports.isRuleLinkedToPackaging = (ruleId, companyId) => {
    const db = getDb();
    const result = db.prepare(`
        SELECT COUNT(*) as count FROM packaging 
        WHERE rule_id = ? AND company_id = ? AND is_active = 1
    `).get(ruleId, companyId);
    
    return result.count > 0;
};

// 📌 SIMULER LE PRIX DE REMBOURSEMENT AUTOMATIQUE (VERSION ENRICHIE ET CORRIGÉE)
/**
 * Calcule le prix de déconsignation unitaire.
 * Utilise en priorité le snapshot s'il est fourni, sinon recalcule en temps réel (rétroactif).
 * @param {string} packagingId - ID de l'emballage
 * @param {string} dateConsignation - Date de création de la consignation (ISO)
 * @param {string} companyId - ID de l'entreprise
 * @param {string|null} regleSnapshotJson - JSON optionnel contenant la règle figée
 */
exports.simulerPrixRemboursement = (packagingId, dateConsignation, companyId, regleSnapshotJson = null) => {
    const db = getDb();

    // 1. Récupérer les prix de base de l'emballage
    const packaging = db.prepare(`
        SELECT prix_consigne, prix_deconsigne 
        FROM packaging 
        WHERE id = ? AND company_id = ?
    `).get(packagingId, companyId);

    if (!packaging) {
        throw new Error("Emballage introuvable.");
    }

    const prixConsigneBase = packaging.prix_consigne || 0;
    const prixDeconsigneBase = packaging.prix_deconsigne || 0;

    // 2. Calculer les jours écoulés (Toujours basé sur la date du flux d'origine)
    const datePropre = dateConsignation.split('T')[0]; 
    const dateQuery = db.prepare(`
        SELECT CAST(julianday(date('now')) - julianday(date(?)) AS INTEGER) AS jours_ecoules
    `).get(datePropre);
    const joursEcoules = Math.max(0, dateQuery ? dateQuery.jours_ecoules : 0);

    // 3. Charger les paliers : Soit depuis le SNAPSHOT, soit depuis la DB
    let tiers = [];

    if (regleSnapshotJson) {
        try {
            const ruleObj = JSON.parse(regleSnapshotJson);
            tiers = ruleObj.tiers || []; // Utilise les paliers figés
        } catch (e) {
            console.error("Erreur lecture snapshot, bascule vers mode dynamique", e);
        }
    }

    // Si pas de snapshot (ou erreur), on va chercher dans la DB (Mode historique/dynamique)
    if (tiers.length === 0) {
        const pkg = db.prepare(`SELECT rule_id FROM packaging WHERE id = ? AND company_id = ?`).get(packagingId, companyId);
        if (pkg && pkg.rule_id) {
            tiers = db.prepare(`
                SELECT jours_min, jours_max, type_calcul, valeur 
                FROM packaging_rule_tiers 
                WHERE rule_id = ? AND company_id = ?
                ORDER BY jours_min ASC
            `).all(pkg.rule_id, companyId);
        }
    }

    // 4. Trouver le palier correspondant
    const palierApplique = tiers.find(t => {
        const respecteMin = joursEcoules >= t.jours_min;
        const respecteMax = (t.jours_max === null || t.jours_max === undefined) || (joursEcoules <= t.jours_max);
        return respecteMin && respecteMax;
    });

    if (!palierApplique) {
        return {
            prix_unitaire_remboursement: prixDeconsigneBase,
            jours_ecoules: joursEcoules,
            montant_penalite_unitaire: 0,
            type_calcul_applique: 'STANDARD'
        };
    }

    // 5. Calcul des montants
    let prixRemboursementUnitaire = prixDeconsigneBase;
    let montantPenaliteUnitaire = 0;
    const typeCalculEffectif = normaliserTypeCalcul(palierApplique.type_calcul);

    switch (typeCalculEffectif) {
        case 'POURCENTAGE_REPRISE':
            prixRemboursementUnitaire = (prixDeconsigneBase * palierApplique.valeur) / 100;
            montantPenaliteUnitaire = Math.max(0, prixDeconsigneBase - prixRemboursementUnitaire);
            break;
        case 'MONTANT_FIXE_PENALITE':
            montantPenaliteUnitaire = palierApplique.valeur;
            prixRemboursementUnitaire = Math.max(0, prixDeconsigneBase - montantPenaliteUnitaire);
            break;
        case 'CONSIDERE_VENDU':
            prixRemboursementUnitaire = 0;
            montantPenaliteUnitaire = prixConsigneBase; 
            break;
        default:
            prixRemboursementUnitaire = prixDeconsigneBase;
            break;
    }

    return {
        prix_unitaire_remboursement: cleanNum(prixRemboursementUnitaire),
        jours_ecoules: joursEcoules,
        montant_penalite_unitaire: cleanNum(montantPenaliteUnitaire),
        type_calcul_applique: typeCalculEffectif
    };
};

/**
 * 🔒 LOGIQUE DE VÉRIFICATION ET DE COHÉRENCE CHRONOLOGIQUE DES PALIERS
 */
function validateTiersLogic(tiers) {
    if (!tiers || tiers.length === 0) {
        throw new Error("Une règle de consignation doit obligatoirement contenir au moins un palier.");
    }

    // Tri pour l'analyse
    tiers.sort((a, b) => parseInt(a.jours_min, 10) - parseInt(b.jours_min, 10));

    for (let i = 0; i < tiers.length; i++) {
        const current = tiers[i];
        const jMin = parseInt(current.jours_min, 10);
        const jMax = current.jours_max ? parseInt(current.jours_max, 10) : null;

        if (isNaN(jMin) || jMin < 0) {
            throw new Error(`Le jour minimum (${current.jours_min}) doit être un entier positif.`);
        }
        if (jMax !== null && jMax <= jMin) {
            throw new Error(`Incohérence sur les bornes : Le jour maximum (${jMax}) doit être strictement supérieur au jour minimum (${jMin}).`);
        }

        // Utilisation du normalisateur pour passer la validation JS même si l'UI envoie du texte brut
        const typeNormalise = normaliserTypeCalcul(current.type_calcul);
        const typesAutorises = ['POURCENTAGE_REPRISE', 'MONTANT_FIXE_PENALITE', 'CONSIDERE_VENDU'];
        
        if (!typesAutorises.includes(typeNormalise)) {
            throw new Error(`Le type de calcul '${current.type_calcul}' n'est pas valide.`);
        }

        if (cleanNum(current.valeur) < 0) {
            throw new Error("La valeur associée à un palier de tarification ne peut pas être négative.");
        }

        if (i > 0) {
            const previous = tiers[i - 1];
            const prevMax = previous.jours_max ? parseInt(previous.jours_max, 10) : null;

            if (prevMax === null) {
                throw new Error("Interdiction de superposition : Aucun palier additionnel ne peut être traité après un palier défini avec une limite maximale infinie.");
            }
            if (jMin !== prevMax + 1) {
                throw new Error(`Discontinuité de configuration détectée : Le palier courant débute à J+${jMin}, tandis que le précédent se clôturait à J+${prevMax}. (Valeur consécutive attendue : ${prevMax + 1})`);
            }
        }
    }
}