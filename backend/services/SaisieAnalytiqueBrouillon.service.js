// backend/services/SaisieAnalytiqueBrouillon.service.js
const { 
    CloudBrouillonLigneAnalytique, 
    CloudPlanAnalytique, 
    CloudDepartement 
} = require('../models/cloud.model');

class SaisieAnalytiqueBrouillonService {
    /**
     * Génère un ID unique (BR-LANA-XXXXXX)
     */
    generateBrLanaId() {
        const timestamp = Date.now().toString().slice(-6);
        const random = Math.floor(Math.random() * 100).toString().padStart(2, '0');
        return `BR-LANA-${timestamp}${random}`;
    }

    /**
     * Valide l'équilibre entre le montant de la ligne et le total ventilé
     */
    validerEquilibre(montantTheorique, repartitions) {
        const totalVentile = Math.round(repartitions.reduce((sum, r) => sum + parseFloat(r.montant || 0), 0) * 100) / 100;
        const attendu = Math.round(montantTheorique * 100) / 100;
        
        return {
            isEquilibre: Math.abs(attendu - totalVentile) <= 0.01,
            attendu,
            totalVentile
        };
    }

    /**
     * Résout le département ID (priorité saisie, sinon fallback plan) avec isolation multi-tenant (Cloud)
     */
    async resolveDeptId(row, companyId) {
        let finalDeptId = row.departement_id;
        const cid = companyId.toString();

        if (!finalDeptId || finalDeptId === 'DEPT-INCONNU') {
            const fallback = await CloudPlanAnalytique.findOne({ 
                localId: row.plan_analytique_id.toString(), 
                company_id: cid 
            }).lean();
            finalDeptId = fallback ? fallback.parent_dept_id : null;
        }

        if (finalDeptId) {
            const checkExist = await CloudDepartement.findOne({ 
                localId: finalDeptId.toString(), 
                company_id: cid 
            }).lean();
            if (!checkExist) {
                throw new Error(`Département invalide pour la section ${row.plan_analytique_id}`);
            }
        } else {
            throw new Error(`Aucun département valide trouvé pour la section ${row.plan_analytique_id}`);
        }

        return finalDeptId;
    }

    /**
     * Enregistre ou met à jour les ventilations analytiques sous forme de brouillon (Cloud)
     */
    async saveBrouillonVentilation(brouillonLigneId, montantTheorique, repartitions, companyId) {
        const cid = companyId.toString();

        // 1. Validation de l'équilibre
        const equilibre = this.validerEquilibre(montantTheorique, repartitions);
        if (!equilibre.isEquilibre) {
            throw new Error(`Déséquilibre analytique (Brouillon) : Le montant total ventilé (${equilibre.totalVentile}) ne correspond pas au montant attendu (${equilibre.attendu}).`);
        }

        // 2. Nettoyage préventif des anciens brouillons pour cette ligne
        await CloudBrouillonLigneAnalytique.deleteMany({ 
            ligne_brouillon_id: brouillonLigneId.toString(), 
            company_id: cid 
        });

        // 3. Insertion des nouveaux paliers de brouillon
        for (const rep of repartitions) {
            const brLanaId = this.generateBrLanaId();
            const resolvedDeptId = await this.resolveDeptId(rep, cid);
            const montantVal = Math.round((parseFloat(rep.montant) || 0) * 100) / 100;

            if (montantVal > 0) {
                await CloudBrouillonLigneAnalytique.create({
                    localId: brLanaId,
                    brouillon_ligne_id: brouillonLigneId.toString(),
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

module.exports = new SaisieAnalytiqueBrouillonService();