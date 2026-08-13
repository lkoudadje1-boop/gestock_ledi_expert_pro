// backend/services/unite.service.js
const { CloudUnite, CloudProduct } = require('../models/cloud.model');
const { logAction } = require('../utils/auditHelper');
const crypto = require('crypto');

class UniteService {
    /**
     * Récupère la liste des unités actives
     */
    async findAll(companyId) {
        return await CloudUnite.find({
            company_id: companyId.toString(),
            is_active: true
        })
        .select('localId code libelle coefficient unite_reference')
        .sort({ libelle: 1 })
        .lean();
    }

    /**
     * Crée une nouvelle unité de mesure
     */
    async create(data, user) {
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

        await CloudUnite.create({
            localId: id,
            code: codeFmt,
            libelle: libelleFmt,
            coefficient: coeffFmt,
            unite_reference: refFmt,
            company_id: companyId.toString(),
            sync_status: 'synced',
            is_active: true
        });

        await logAction({
            userId, userName,
            actionType: 'CREATE',
            tableConcernee: 'unites',
            referenceId: id,
            description: `Création unité: ${libelleFmt} (1 ${codeFmt} = ${coeffFmt} ${refFmt})`,
            companyId: companyId.toString()
        });

        return id;
    }

    /**
     * Modifie une unité de mesure existante
     */
    async update(id, data, user) {
        const { companyId, id: userId, username: userName } = user;
        
        const coeffFmt = parseFloat(data.coefficient);
        if (isNaN(coeffFmt) || coeffFmt <= 0) {
            throw new Error("Le coefficient doit être un nombre supérieur à 0.");
        }

        const codeFmt = data.code.toUpperCase().trim();
        const libelleFmt = data.libelle.trim();
        const refFmt = data.unite_reference ? data.unite_reference.trim() : 'Bouteille';

        const updated = await CloudUnite.findOneAndUpdate(
            { localId: id.toString(), company_id: companyId.toString() },
            { 
                code: codeFmt, 
                libelle: libelleFmt, 
                coefficient: coeffFmt, 
                unite_reference: refFmt, 
                sync_status: 'synced', 
                updated_at: new Date() 
            }
        );

        if (!updated) throw new Error("Unité de mesure introuvable.");

        await logAction({
            userId, userName,
            actionType: 'UPDATE',
            tableConcernee: 'unites',
            referenceId: id.toString(),
            description: `Modification unité: ${libelleFmt}`,
            companyId: companyId.toString()
        });

        return { success: true };
    }

    /**
     * Supprime une unité de mesure (Soft Delete)
     */
    async delete(id, user) {
        const { companyId, id: userId, username: userName } = user;

        const unite = await CloudUnite.findOne({ localId: id.toString(), company_id: companyId.toString() });
        if (!unite) throw new Error("Unité de mesure introuvable.");

        // Vérification intégrité avant désactivation
        const inUse = await CloudProduct.findOne({ unite_id: id.toString() });
        if (inUse) {
            throw new Error("Impossible : Cette unité est utilisée par des produits.");
        }

        // Désactivation au lieu de suppression physique
        unite.is_active = false;
        unite.sync_status = 'synced';
        await unite.save();

        await logAction({
            userId, userName,
            actionType: 'DELETE',
            tableConcernee: 'unites',
            referenceId: id.toString(),
            description: `Désactivation de l'unité : ${unite.libelle}`,
            companyId: companyId.toString()
        });

        return { success: true };
    }
}

module.exports = new UniteService();