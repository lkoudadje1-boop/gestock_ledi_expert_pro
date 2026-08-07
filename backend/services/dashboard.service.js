const { getDb } = require('../config/database');

exports.fetchDashboardStats = (companyId) => {
    const db = getDb();
    const today = new Date().toISOString().split('T')[0];

    // 1. Produits & Alertes
    const products = db.prepare(`
        SELECT COUNT(*) as total,
        SUM(CASE WHEN stock_actuel <= stockAlerte AND stockAlerte > 0 THEN 1 ELSE 0 END) as alerts
        FROM products WHERE company_id = ? AND is_active = 1
    `).get(companyId);

    // 2. Ventes nettes du jour (Modifié : Prise en compte de 'VALIDEE' et 'RETOUR')
    // 🔑 Note : s.montant_total est déjà recalculé net (Ventes - Retours) dans handleReturnSaleItem
    const sales = db.prepare(`
        SELECT SUM(montant_total) as total FROM sales 
        WHERE company_id = ? 
        AND statut_vente IN ('VALIDEE', 'RETOUR') -- 🔑 Inclus les ventes qui ont eu un retour
        AND strftime('%Y-%m-%d', date_vente) = ?
    `).get(companyId, today);

    // 3. Trésorerie
    const cash = db.prepare(`
        SELECT SUM(solde_actuel) as total FROM brouillards_treso 
        WHERE company_id = ? AND type = 'CAISSE' AND actif = 1
    `).get(companyId);

    const bank = db.prepare(`
        SELECT SUM(solde_actuel) as total FROM brouillards_treso 
        WHERE company_id = ? AND type = 'BANQUE' AND actif = 1
    `).get(companyId);

    // 4. Retours cumulés (Modifié : Calculé sur la somme des remboursements financiers réels)
    // 🔑 Permet de suivre exactement le flux de sortie d'argent dû aux avoirs clients
    const avoirs = db.prepare(`
        SELECT IFNULL(SUM(montant), 0) as total FROM payments 
        WHERE company_id = ? 
        AND TRIM(UPPER(type_paiement)) = 'REMBOURSEMENT'
        AND is_active = 1
    `).get(companyId);

    // 5. Dettes & Crédits (Modifié : Crédits clients basés sur les ventes valides ET les retours partiels)
    const supplierDebt = db.prepare(`SELECT SUM(reste_a_payer) as total FROM purchases WHERE company_id = ?`).get(companyId);
    const customerCredit = db.prepare(`
        SELECT SUM(reste_a_payer) as total FROM sales 
        WHERE company_id = ? 
        AND statut_vente IN ('VALIDEE', 'RETOUR') -- 🔑 Inclus le reste à payer mis à jour après retour
    `).get(companyId);

    // 6. NOTIFICATIONS
    const brouillons = db.prepare(`
        SELECT COUNT(*) as count FROM brouillon_ecritures 
        WHERE company_id = ? AND statut = 'EN_ATTENTE'
    `).get(companyId);

    const lastClosure = db.prepare(`
        SELECT date_cloture FROM clotures_caisse 
        WHERE company_id = ? AND statut = 'VALIDE'
        ORDER BY date_cloture DESC LIMIT 1
    `).get(companyId);

    const company = db.prepare(`
        SELECT license_start_date FROM companies WHERE id = ?
    `).get(companyId);

    return {
        totalProducts: products?.total || 0,
        stockAlerts: products?.alerts || 0,
        dailySales: sales?.total || 0,
        cashBalance: cash?.total || 0,
        bankBalance: bank?.total || 0,
        totalAvoirs: avoirs?.total || 0,
        supplierDebt: supplierDebt?.total || 0,
        customerCredit: customerCredit?.total || 0,
        pendingBrouillons: brouillons?.count || 0,
        lastClosureDate: lastClosure?.date_cloture || null,
        licenceExpiry: company?.license_start_date || null
    };
};
