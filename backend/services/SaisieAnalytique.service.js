// backend/services/SaisieAnalytique.service.js
const { 
    CloudLigneAnalytique, 
    CloudPlanAnalytique, 
    CloudDepartement 
} = require('../models/cloud.model');

class SaisieAnalytiqueService {
    /**
     * Génère un ID unique LANA
     */
    generateLanaId() {
        const timestamp = Date.now().toString().slice(-6);
        const random = Math.floor(Math.random() * 100).toString().padStart(2, '0');
        return `LANA-${timestamp}${random}`;
    }

    /**
     * Valide l'équilibre entre le montant comptable et la ventilation analytique
     */
    checkEquilibre(montantComptable, repartitions) {
        const totalVentile = Math.round(repartitions.reduce((sum, r) => sum + parseFloat(r.montant || 0), 0) * 100) / 100;
        const attendu = Math.round(montantComptable * 100) / 100;
        return {
            isEquilibre: Math.abs(attendu - totalVentile) <= 0.01,
            attendu,
            totalVentile
        };
    }

    /**
     * Résout le département ID (prend celui de la ligne ou le fallback du plan analytique)
     */
    async resolveDepartement(row, companyId) {
        let finalDeptId = row.departement_id;
        const cid = companyId.toString();

        if (!finalDeptId || finalDeptId === 'DEPT-INCONNU') {
            const planAnalytique = await CloudPlanAnalytique.findOne({ 
                localId: row.plan_analytique_id.toString(), 
                company_id: cid 
            }).lean();
            finalDeptId = planAnalytique ? planAnalytique.parent_dept_id : null;
        }

        if (finalDeptId) {
            const exists = await CloudDepartement.findOne({ 
                localId: finalDeptId.toString(), 
                company_id: cid 
            }).lean();
            if (!exists) {
                throw new Error(`Le département pour la section ${row.plan_analytique_id} est invalide.`);
            }
        } else {
            throw new Error(`Aucun département valide trouvé pour la section ${row.plan_analytique_id}.`);
        }

        return finalDeptId;
    }

    /**
     * Enregistre ou met à jour les ventilations analytiques pour une écriture / ligne comptable (Cloud)
     */
    async saveVentilation(ligneEcritureId, montantComptable, repartitions, companyId) {
        const cid = companyId.toString();

        // 1. Validation de l'équilibre
        const equilibre = this.checkEquilibre(montantComptable, repartitions);
        if (!equilibre.isEquilibre) {
            throw new Error(`Déséquilibre analytique : Le montant total ventilé (${equilibre.totalVentile}) ne correspond pas au montant comptable (${equilibre.attendu}).`);
        }

        // 2. Nettoyage préventif des anciennes ventilations pour cette ligne d'écriture
        await CloudLigneAnalytique.deleteMany({ 
            ligne_ecriture_id: ligneEcritureId.toString(), 
            company_id: cid 
        });

        // 3. Insertion des nouvelles ventilations
        for (const rep of repartitions) {
            const lanaId = this.generateLanaId();
            const resolvedDeptId = await this.resolveDepartement(rep, cid);
            const montantVal = Math.round((parseFloat(rep.montant) || 0) * 100) / 100;

            if (montantVal > 0) {
                await CloudLigneAnalytique.create({
                    localId: lanaId,
                    ligne_ecriture_id: ligneEcritureId.toString(),
                    plan_analytique_id: rep.plan_analytique_id.toString(),
                    departement_id: resolvedDeptId.toString(),
                    montant: montantVal,
                    company_id: cid,
                    sync_status: 'synced'
                });
            }
        }

        return { success: true, count: repartitions.length };
    }
}

module.exports = new SaisieAnalytiqueService();