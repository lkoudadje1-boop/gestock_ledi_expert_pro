const { getDb } = require('../config/database');
const ConfigPF = require('./ConfigEcrituresAuto.service'); 
const ConfigMP = require('./purchaseMpCompta.service');   
const ConfigSales = require('./saleCompta.service');      

class AutoPostingService {
    async processQueue() {
        const db = getDb();
        const pending = db.prepare("SELECT * FROM compta_queue WHERE status = 'pending' LIMIT 50").all();

        for (const job of pending) {
            try {
                db.transaction(() => {
                    // 🛡️ BRANCHEMENT SELON LA TABLE SOURCE
                    if (job.table_source === 'purchases_mp' || job.table_source === 'purchase_items_mp') {
                        ConfigMP.genererEcritureMP(job.record_id, job.company_id);
                    } 
                    else if (job.table_source === 'sales' || job.table_source === 'sale_items') {
                        ConfigSales.genererEcritureVente(job.record_id, job.company_id);
                    } 
                    else {
                        ConfigPF.genererEcritureExplicite(job.table_source, job.record_id, job.company_id);
                    }
                    
                    // 🔄 Mise à jour du statut avec marquage de synchronisation 'pending'
                    db.prepare(`
                        UPDATE compta_queue 
                        SET status = 'processed', sync_status = 'pending', updated_at = CURRENT_TIMESTAMP 
                        WHERE id = ?
                    `).run(job.id);

                    // 📡 Ajout dans la file de synchro Cloud pour la table compta_queue
                    db.prepare(`
                        INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
                        VALUES ('compta_queue', ?, 'UPDATE', ?)
                    `).run(job.id, job.company_id);
                })();
            } catch (err) {
                console.error(`❌ Erreur Posting [${job.table_source}]:`, err.message);
                
                db.prepare(`
                    UPDATE compta_queue 
                    SET status = 'error', error_log = ?, sync_status = 'pending', updated_at = CURRENT_TIMESTAMP 
                    WHERE id = ?
                `).run(err.message, job.id);

                db.prepare(`
                    INSERT INTO sync_queue (table_name, record_id, operation, company_id) 
                    VALUES ('compta_queue', ?, 'UPDATE', ?)
                `).run(job.id, job.company_id);
            }
        }
    }
}

module.exports = new AutoPostingService();