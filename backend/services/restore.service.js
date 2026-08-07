// backend/services/restore.service.js
const { getDb } = require('../config/database');
const { CloudUser, CloudCompany, CloudProduct } = require('../models/cloud.model'); 

const restoreFromCloud = async (companyId) => {
    const db = getDb();
    console.log(`[RESTORE] ☁️ Récupération des données pour l'entreprise ID: ${companyId}`);

    try {
        // Récupération simultanée de toutes les données du Cloud (MongoDB)
        const [cloudCompany, cloudUsers, cloudProducts] = await Promise.all([
            CloudCompany.findOne({ localId: companyId }),
            CloudUser.find({ company_id: companyId }),
            CloudProduct.find({ company_id: companyId }) // <--- Récupération des articles
        ]);

        if (!cloudCompany) throw new Error("Données Cloud introuvables pour cette entreprise.");

        const executeRestore = db.transaction(() => {
            // A. Restauration de l'Entreprise
            const companyStmt = db.prepare(`
                INSERT INTO companies (id, company_code, name, email, sync_status)
                VALUES (?, ?, ?, ?, 'synced')
                ON CONFLICT(id) DO UPDATE SET name=excluded.name, sync_status='synced'
            `);
            companyStmt.run(cloudCompany.localId, cloudCompany.company_code, cloudCompany.name, cloudCompany.email);

            // B. Restauration des Utilisateurs (Permissions JSON incluses)
            const userStmt = db.prepare(`
                INSERT INTO users (id, username, email, password, role, company_id, fonction, permissions, sync_status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'synced')
                ON CONFLICT(id) DO UPDATE SET 
                    permissions = excluded.permissions,
                    role = excluded.role,
                    fonction = excluded.fonction,
                    sync_status = 'synced'
            `);

            cloudUsers.forEach(u => {
                userStmt.run(
                    u.localId, 
                    u.username, 
                    u.email, 
                    u.password || 'default_pass', 
                    u.role, 
                    u.company_id, 
                    u.fonction || '',
                    u.permissions ? JSON.stringify(u.permissions) : null
                );
            });

            // C. Restauration des Articles (Stock, CMP, Unité et Paliers/Remises inclus)
            if (cloudProducts.length > 0) {
                const productStmt = db.prepare(`
                    INSERT INTO products (
                        id, company_id, nom, codeBarre, unite_id, group_id, image_path,
                        prixVente, cmp, stock_actuel, stockAlerte, taxeActive, taxeTaux, 
                        remiseActive,
                        r1Active, r1Seuil, r1Montant, r1Taux, r1IsPromo, r1DateDebut, r1DateFin,
                        r2Active, r2Seuil, r2Montant, r2Taux, r2IsPromo, r2DateDebut, r2DateFin,
                        r3Active, r3Multiple, r3Montant, r3Taux, r3IsPromo, r3DateDebut, r3DateFin,
                        r4Active, r4A_Max, r4A_Montant, r4A_Taux, r4B_Max, r4B_Montant, r4B_Taux, 
                        r4C_Montant, r4C_Taux, r4IsPromo, r4DateDebut, r4DateFin,
                        is_active, sync_status
                    ) VALUES (
                        ?, ?, ?, ?, ?, ?, ?, 
                        ?, ?, ?, ?, ?, ?, 
                        ?, 
                        ?, ?, ?, ?, ?, ?, ?, 
                        ?, ?, ?, ?, ?, ?, ?, 
                        ?, ?, ?, ?, ?, ?, ?, 
                        ?, ?, ?, ?, ?, ?, ?, 
                        ?, ?, ?, ?, ?,
                        ?, 'synced'
                    )
                    ON CONFLICT(id) DO UPDATE SET 
                        nom = excluded.nom,
                        codeBarre = excluded.codeBarre,
                        unite_id = excluded.unite_id,
                        group_id = excluded.group_id,
                        image_path = excluded.image_path,
                        prixVente = excluded.prixVente,
                        cmp = excluded.cmp,
                        stock_actuel = excluded.stock_actuel,
                        stockAlerte = excluded.stockAlerte,
                        taxeActive = excluded.taxeActive,
                        taxeTaux = excluded.taxeTaux,
                        remiseActive = excluded.remiseActive,
                        r1Active = excluded.r1Active, r1Seuil = excluded.r1Seuil, r1Montant = excluded.r1Montant, r1Taux = excluded.r1Taux, r1IsPromo = excluded.r1IsPromo, r1DateDebut = excluded.r1DateDebut, r1DateFin = excluded.r1DateFin,
                        r2Active = excluded.r2Active, r2Seuil = excluded.r2Seuil, r2Montant = excluded.r2Montant, r2Taux = excluded.r2Taux, r2IsPromo = excluded.r2IsPromo, r2DateDebut = excluded.r2DateDebut, r2DateFin = excluded.r2DateFin,
                        r3Active = excluded.r3Active, r3Multiple = excluded.r3Multiple, r3Montant = excluded.r3Montant, r3Taux = excluded.r3Taux, r3IsPromo = excluded.r3IsPromo, r3DateDebut = excluded.r3DateDebut, r3DateFin = excluded.r3DateFin,
                        r4Active = excluded.r4Active, r4A_Max = excluded.r4A_Max, r4A_Montant = excluded.r4A_Montant, r4A_Taux = excluded.r4A_Taux, r4B_Max = excluded.r4B_Max, r4B_Montant = excluded.r4B_Montant, r4B_Taux = excluded.r4B_Taux, r4C_Montant = excluded.r4C_Montant, r4C_Taux = excluded.r4C_Taux, r4IsPromo = excluded.r4IsPromo, r4DateDebut = excluded.r4DateDebut, r4DateFin = excluded.r4DateFin,
                        is_active = excluded.is_active,
                        sync_status = 'synced'
                `);

                cloudProducts.forEach(p => {
                    productStmt.run(
                        p.localId, p.company_id, p.nom, p.codeBarre || null, p.unite_id || null, p.group_id || null, p.image_path || null,
                        p.prixVente || 0, p.cmp || 0, p.stock_actuel || 0, p.stockAlerte || 0, p.taxeActive || 0, p.taxeTaux || 0,
                        p.remiseActive || 0,
                        p.r1Active || 0, p.r1Seuil || 0, p.r1Montant || 0, p.r1Taux || 0, p.r1IsPromo || 0, p.r1DateDebut || null, p.r1DateFin || null,
                        p.r2Active || 0, p.r2Seuil || 0, p.r2Montant || 0, p.r2Taux || 0, p.r2IsPromo || 0, p.r2DateDebut || null, p.r2DateFin || null,
                        p.r3Active || 0, p.r3Multiple || 0, p.r3Montant || 0, p.r3Taux || 0, p.r3IsPromo || 0, p.r3DateDebut || null, p.r3DateFin || null,
                        p.r4Active || 0, p.r4A_Max || 0, p.r4A_Montant || 0, p.r4A_Taux || 0, p.r4B_Max || 0, p.r4B_Montant || 0, p.r4B_Taux || 0, p.r4C_Montant || 0, p.r4C_Taux || 0, p.r4IsPromo || 0, p.r4DateDebut || null, p.r4DateFin || null,
                        p.is_active ?? 1
                    );
                });
            }
        });

        executeRestore();
        
        return { 
            success: true, 
            details: { 
                company: cloudCompany.name, 
                users: cloudUsers.length,
                products: cloudProducts.length 
            }
        };

    } catch (error) {
        console.error("❌ [RESTORE ERROR]:", error.message);
        throw error;
    }
};

module.exports = { restoreFromCloud };