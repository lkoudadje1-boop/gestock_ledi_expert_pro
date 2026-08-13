// backend/services/AutoPosting.service.js
const ConfigPF = require('./ConfigEcrituresAuto.service'); 
const ConfigMP = require('./purchaseMpCompta.service');   
const ConfigSales = require('./saleCompta.service');         
const { CloudComptaQueue } = require('../models/cloud.model');

class AutoPostingService {
    async processQueue() {
        try {
            // Récupérer les 50 tâches en attente dans MongoDB
            const pending = await CloudComptaQueue.find({ status: 'pending' }).limit(50).lean();

            for (const job of pending) {
                try {
                    // 🛡️ BRANCHEMENT SELON LA TABLE SOURCE (avec support asynchrone)
                    if (job.table_source === 'purchases_mp' || job.table_source === 'purchase_items_mp') {
                        await ConfigMP.genererEcritureMP(job.record_id, job.company_id);
                    } 
                    else if (job.table_source === 'sales' || job.table_source === 'sale_items') {
                        await ConfigSales.genererEcritureVente(job.record_id, job.company_id);
                    } 
                    else {
                        await ConfigPF.genererEcritureExplicite(job.table_source, job.record_id, job.company_id);
                    }
                    
                    // 🔄 Mise à jour du statut en 'processed'
                    await CloudComptaQueue.updateOne(
                        { localId: job.localId || job._id },
                        { 
                            $set: { 
                                status: 'processed', 
                                sync_status: 'synced', 
                                updated_at: new Date() 
                            } 
                        }
                    );

                } catch (err) {
                    console.error(`❌ Erreur Posting [${job.table_source}]:`, err.message);
                    
                    // Enregistrement de l'erreur sur la tâche
                    await CloudComptaQueue.updateOne(
                        { localId: job.localId || job._id },
                        { 
                            $set: { 
                                status: 'error', 
                                error_log: err.message, 
                                sync_status: 'synced', 
                                updated_at: new Date() 
                            } 
                        }
                    );
                }
            }
        } catch (error) {
            console.error("❌ Erreur critique processQueue:", error.message);
        }
    }
}

module.exports = new AutoPostingService();