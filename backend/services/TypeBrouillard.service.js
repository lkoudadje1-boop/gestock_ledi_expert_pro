// backend/services/TypeBrouillard.service.js
const { 
    CloudBrouillardTreso, 
    CloudBrouillardLigneTreso,
    CloudJournal,
    CloudPlanComptable
} = require('../models/cloud.model');
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
            niv1: isDirect ? false : !!d.niv1_actif,
            niv1_user: isDirect ? null : (d.niv1_user_id || null),
            niv2: isDirect ? false : !!d.niv2_actif,
            niv2_user: isDirect ? null : (d.niv2_user_id || null),
            niv3: isDirect ? false : !!d.niv3_actif,
            niv3_user: isDirect ? null : (d.niv3_user_id || null),
            niv4: isDirect ? false : !!d.niv4_actif,
            niv4_user: isDirect ? null : (d.niv4_user_id || null)
        };
    }

    /**
     * Vérifie si le brouillard peut être supprimé
     */
    async canDelete(id, companyId) {
        const count = await CloudBrouillardLigneTreso.countDocuments({ 
            brouillard_id: id.toString(), 
            company_id: companyId.toString() 
        });
        return count === 0;
    }

    /**
     * Liste les brouillards avec leurs jointures (via agrégation)
     */
    async getAll(companyId) {
        return await CloudBrouillardTreso.aggregate([
            { $match: { company_id: companyId.toString() } },
            {
                $lookup: { from: 'cloud_journaux', localField: 'journal_id', foreignField: 'localId', as: 'journal' }
            },
            {
                $lookup: { from: 'cloud_journaux', localField: 'journal_brouillon_id', foreignField: 'localId', as: 'journal_brouillon' }
            },
            {
                $lookup: { from: 'cloud_plan_comptables', localField: 'compte_treso_id', foreignField: 'localId', as: 'compte' }
            },
            { $unwind: { path: '$journal', preserveNullAndEmptyArrays: true } },
            { $unwind: { path: '$journal_brouillon', preserveNullAndEmptyArrays: true } },
            { $unwind: { path: '$compte', preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    _id: 0,
                    id: '$localId',
                    libelle: 1,
                    type: 1,
                    journal_code: '$journal.code',
                    journal_brouillon_code: '$journal_brouillon.code',
                    compte_numero: '$compte.numero_compte'
                }
            }
        ]);
    }

    /**
     * Crée un nouveau type de brouillard
     */
    async create(data, user) {
        const { companyId, id: userId, username: userName } = user;
        const sec = this.calculerSecurite(data);
        const brouillardId = `BRT-${Date.now().toString().slice(-6)}`;

        await CloudBrouillardTreso.create({
            localId: brouillardId,
            company_id: companyId.toString(),
            libelle: data.libelle.toUpperCase(),
            journal_id: data.journal_id,
            journal_brouillon_id: data.journal_brouillon_id,
            compte_treso_id: data.compte_treso_id,
            sortie_directe: sec.isDirect,
            mode_fonctionnement: sec.modeFinal,
            seuil_validation: sec.seuil,
            niv1_actif: sec.niv1, niv1_user_id: sec.niv1_user,
            niv2_actif: sec.niv2, niv2_user_id: sec.niv2_user,
            niv3_actif: sec.niv3, niv3_user_id: sec.niv3_user,
            niv4_actif: sec.niv4, niv4_user_id: sec.niv4_user,
            sync_status: 'synced'
        });

        await logAction({
            userId, userName, actionType: 'CREATE', tableConcernee: 'brouillards_treso',
            referenceId: brouillardId, 
            description: `Création du type de brouillard : ${data.libelle.toUpperCase()}`, 
            companyId: companyId.toString()
        });

        return { id: brouillardId };
    }

    /**
     * Modifie un type de brouillard
     */
    async update(id, data, user) {
        const { companyId, id: userId, username: userName } = user;
        const sec = this.calculerSecurite(data);

        const updated = await CloudBrouillardTreso.findOneAndUpdate(
            { localId: id.toString(), company_id: companyId.toString() },
            {
                libelle: data.libelle.toUpperCase(),
                journal_id: data.journal_id,
                journal_brouillon_id: data.journal_brouillon_id,
                compte_treso_id: data.compte_treso_id,
                sortie_directe: sec.isDirect,
                mode_fonctionnement: sec.modeFinal,
                seuil_validation: sec.seuil,
                niv1_actif: sec.niv1, niv1_user_id: sec.niv1_user,
                niv2_actif: sec.niv2, niv2_user_id: sec.niv2_user,
                niv3_actif: sec.niv3, niv3_user_id: sec.niv3_user,
                niv4_actif: sec.niv4, niv4_user_id: sec.niv4_user,
                updated_at: new Date()
            }
        );

        if (!updated) throw new Error("Type de brouillard introuvable.");

        await logAction({
            userId, userName, actionType: 'UPDATE', tableConcernee: 'brouillards_treso',
            referenceId: id.toString(),
            description: `Modification type brouillard : ${data.libelle.toUpperCase()}`, 
            companyId: companyId.toString()
        });

        return { success: true };
    }

    /**
     * Supprime un type de brouillard
     */
    async delete(id, user) {
        const { companyId, id: userId, username: userName } = user;

        const brouillard = await CloudBrouillardTreso.findOne({ localId: id.toString(), company_id: companyId.toString() });
        if (!brouillard) throw new Error("Type de brouillard introuvable.");

        if (!(await this.canDelete(id, companyId))) {
            throw new Error("Impossible de supprimer : opérations rattachées.");
        }

        await CloudBrouillardTreso.deleteOne({ localId: id.toString(), company_id: companyId.toString() });

        await logAction({
            userId, userName, actionType: 'DELETE', tableConcernee: 'brouillards_treso',
            referenceId: id.toString(),
            description: `Suppression du type de brouillard : ${brouillard.libelle}`,
            companyId: companyId.toString()
        });

        return { success: true };
    }
}

module.exports = new TypeBrouillardService();