// backend/services/RegleConsignation.services.js
const { CloudPackagingRule, CloudPackagingRuleTier, CloudPackaging } = require('../models/cloud.model');
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
exports.getAllRules = async (companyId) => {
    const cid = companyId.toString();
    const rules = await CloudPackagingRule.find({ company_id: cid }).sort({ createdAt: -1 }).lean();

    const results = [];
    for (const rule of rules) {
        const tiers = await CloudPackagingRuleTier.find({ rule_id: rule.localId, company_id: cid }).sort({ jours_min: 1 }).lean();
        results.push({ ...rule, id: rule.localId, tiers });
    }

    return results;
};

// 📌 RÉCUPÉRER UNE RÈGLE AVEC SES PALIERS VIA SON ID
exports.getRuleById = async (id, companyId) => {
    const cid = companyId.toString();
    const rule = await CloudPackagingRule.findOne({ localId: id.toString(), company_id: cid }).lean();

    if (!rule) return null;

    const tiers = await CloudPackagingRuleTier.find({ rule_id: id.toString(), company_id: cid }).sort({ jours_min: 1 }).lean();

    return { ...rule, id: rule.localId, tiers };
};

// 📌 CRÉER UNE RÈGLE ET SES PALIERS (CLOUD MONGODB)
exports.createRuleWithTiers = async ({ companyId, userId, userName, data }) => {
    const cid = companyId.toString();
    const ruleId = genererIdLocal('REG');
    const { code_regle, libelle, tiers } = data;

    validateTiersLogic(tiers);

    // 1. Insertion de la règle maîtresse
    await CloudPackagingRule.create({
        localId: ruleId,
        code_regle: code_regle.toUpperCase(),
        libelle,
        company_id: cid,
        sync_status: 'synced'
    });

    // 2. Insertion des paliers (tiers)
    if (tiers && tiers.length > 0) {
        for (const tier of tiers) {
            const tierId = genererIdLocal('TLR');
            await CloudPackagingRuleTier.create({
                localId: tierId,
                rule_id: ruleId,
                jours_min: parseInt(tier.jours_min, 10),
                jours_max: tier.jours_max ? parseInt(tier.jours_max, 10) : null,
                type_calcul: normaliserTypeCalcul(tier.type_calcul),
                valeur: cleanNum(tier.valeur),
                company_id: cid,
                sync_status: 'synced'
            });
        }
    }

    // 3. Track de l'action (Audit Trail)
    await logAction({ 
        userId, userName, actionType: 'INSERTION', tableConcernee: 'packaging_rules', 
        referenceId: ruleId, description: `Création de la règle de consignation : ${code_regle} - ${libelle}`, companyId: cid 
    });

    return ruleId;
};

// 📌 MODIFIER UNE RÈGLE ET SES PALIERS
exports.updateRuleWithTiers = async ({ id, companyId, userId, userName, data }) => {
    const cid = companyId.toString();
    const { code_regle, libelle, tiers } = data;

    validateTiersLogic(tiers);

    // 1. Mettre à jour la règle maîtresse
    const updateResult = await CloudPackagingRule.updateOne(
        { localId: id.toString(), company_id: cid },
        { 
            code_regle: code_regle.toUpperCase(), 
            libelle, 
            sync_status: 'synced', 
            updated_at: new Date() 
        }
    );

    if (updateResult.matchedCount === 0) throw new Error("Règle de consignation introuvable ou non modifiée.");

    // 2. Purger les anciens paliers
    await CloudPackagingRuleTier.deleteMany({ rule_id: id.toString(), company_id: cid });

    // 3. Réinsérer les nouveaux paliers mis à jour
    if (tiers && tiers.length > 0) {
        for (const tier of tiers) {
            const tierId = genererIdLocal('TLR');
            await CloudPackagingRuleTier.create({
                localId: tierId,
                rule_id: id.toString(),
                jours_min: parseInt(tier.jours_min, 10),
                jours_max: tier.jours_max ? parseInt(tier.jours_max, 10) : null,
                type_calcul: normaliserTypeCalcul(tier.type_calcul),
                valeur: cleanNum(tier.valeur),
                company_id: cid,
                sync_status: 'synced'
            });
        }
    }

    await logAction({ 
        userId, userName, actionType: 'MODIFICATION', tableConcernee: 'packaging_rules', 
        referenceId: id.toString(), description: `Mise à jour globale de la règle de consignation ID: ${id}`, companyId: cid 
    });

    return { modifiedCount: 1 };
};

// 📌 SUPPRIMER UNE RÈGLE ET TOUS SES PALIERS ASSOCIÉS
exports.deleteRule = async ({ id, companyId, userId, userName }) => {
    const cid = companyId.toString();

    await CloudPackagingRuleTier.deleteMany({ rule_id: id.toString(), company_id: cid });
    const result = await CloudPackagingRule.deleteOne({ localId: id.toString(), company_id: cid });

    await logAction({ 
        userId, userName, actionType: 'SUPPRESSION', tableConcernee: 'packaging_rules', 
        referenceId: id.toString(), description: `Suppression de la règle de consignation ID: ${id}`, companyId: cid 
    });

    return { deletedCount: result.deletedCount };
};

// 📌 VÉRIFIER SI LA RÈGLE EST LIÉE À DES EMBALLAGES ACTIFS
exports.isRuleLinkedToPackaging = async (ruleId, companyId) => {
    const cid = companyId.toString();
    const count = await CloudPackaging.countDocuments({
        rule_id: ruleId.toString(),
        company_id: cid,
        is_active: 1
    });
    
    return count > 0;
};

// 📌 SIMULER LE PRIX DE REMBOURSEMENT AUTOMATIQUE (CLOUD)
exports.simulerPrixRemboursement = async (packagingId, dateConsignation, companyId, regleSnapshotJson = null) => {
    const cid = companyId.toString();

    // 1. Récupérer les prix de base de l'emballage
    const packaging = await CloudPackaging.findOne({ localId: packagingId.toString(), company_id: cid }).lean();

    if (!packaging) {
        throw new Error("Emballage introuvable.");
    }

    const prixConsigneBase = packaging.prix_consigne || 0;
    const prixDeconsigneBase = packaging.prix_deconsigne || 0;

    // 2. Calculer les jours écoulés par rapport à la date actuelle
    const datePropre = new Date(dateConsignation);
    const today = new Date();
    const diffTime = Math.abs(today - datePropre);
    const joursEcoules = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));

    // 3. Charger les paliers : Soit depuis le SNAPSHOT, soit depuis la DB
    let tiers = [];

    if (regleSnapshotJson) {
        try {
            const ruleObj = JSON.parse(regleSnapshotJson);
            tiers = ruleObj.tiers || [];
        } catch (e) {
            console.error("Erreur lecture snapshot, bascule vers mode dynamique", e);
        }
    }

    if (tiers.length === 0) {
        if (packaging.rule_id) {
            tiers = await CloudPackagingRuleTier.find({ rule_id: packaging.rule_id.toString(), company_id: cid }).sort({ jours_min: 1 }).lean();
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
        const jMax = current.jours_max !== null && current.jours_max !== undefined && current.jours_max !== '' ? parseInt(current.jours_max, 10) : null;

        if (isNaN(jMin) || jMin < 0) {
            throw new Error(`Le jour minimum (${current.jours_min}) doit être un entier positif.`);
        }
        if (jMax !== null && jMax <= jMin) {
            throw new Error(`Incohérence sur les bornes : Le jour maximum (${jMax}) doit être strictement supérieur au jour minimum (${jMin}).`);
        }

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
            const prevMax = previous.jours_max !== null && previous.jours_max !== undefined && previous.jours_max !== '' ? parseInt(previous.jours_max, 10) : null;

            if (prevMax === null) {
                throw new Error("Interdiction de superposition : Aucun palier additionnel ne peut être traité après un palier défini avec une limite maximale infinie.");
            }
            if (jMin !== prevMax + 1) {
                throw new Error(`Discontinuité de configuration détectée : Le palier courant débute à J+${jMin}, tandis que le précédent se clôturait à J+${prevMax}. (Valeur consécutive attendue : ${prevMax + 1})`);
            }
        }
    }
}