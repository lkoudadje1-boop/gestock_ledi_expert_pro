// backend/services/dashboard.service.js
const { 
    CloudProduct, CloudSale, CloudBrouillardTreso, CloudPayment, 
    CloudPurchase, CloudBrouillonEcriture, CloudClotureCaisse, CloudCompany 
} = require('../models/cloud.model');

exports.fetchDashboardStats = async (companyId) => {
    const todayStr = new Date().toISOString().split('T')[0];
    const startOfDay = new Date(`${todayStr}T00:00:00.000Z`);
    const endOfDay = new Date(`${todayStr}T23:59:59.999Z`);

    // 1. Produits & Alertes
    const productsList = await CloudProduct.find({ company_id: companyId.toString(), is_active: 1 }).lean();
    let totalProducts = productsList.length;
    let stockAlerts = productsList.filter(p => p.stock_actuel <= p.stockAlerte && p.stockAlerte > 0).length;

    // 2. Ventes nettes du jour (statut 'VALIDEE' ou 'RETOUR')
    const todaysSales = await CloudSale.find({
        company_id: companyId.toString(),
        statut_vente: { $in: ['VALIDEE', 'RETOUR'] },
        date_vente: { $gte: startOfDay, $lte: endOfDay }
    }).lean();
    const dailySales = todaysSales.reduce((sum, s) => sum + (Number(s.montant_total) || 0), 0);

    // 3. Trésorerie (Caisse & Banque)
    const tresos = await CloudBrouillardTreso.find({ company_id: companyId.toString(), actif: 1 }).lean();
    const cashBalance = tresos.filter(t => t.type === 'CAISSE').reduce((sum, t) => sum + (Number(t.solde_actuel) || 0), 0);
    const bankBalance = tresos.filter(t => t.type === 'BANQUE').reduce((sum, t) => sum + (Number(t.solde_actuel) || 0), 0);

    // 4. Retours cumulés (Remboursements)
    const payments = await CloudPayment.find({ 
        company_id: companyId.toString(), 
        is_active: 1 
    }).lean();
    const totalAvoirs = payments
        .filter(p => (p.type_paiement || '').trim().toUpperCase() === 'REMBOURSEMENT')
        .reduce((sum, p) => sum + (Number(p.montant) || 0), 0);

    // 5. Dettes & Crédits
    const purchases = await CloudPurchase.find({ company_id: companyId.toString() }).lean();
    const supplierDebt = purchases.reduce((sum, p) => sum + (Number(p.reste_a_payer) || 0), 0);

    const validSalesForCredit = await CloudSale.find({
        company_id: companyId.toString(),
        statut_vente: { $in: ['VALIDEE', 'RETOUR'] }
    }).lean();
    const customerCredit = validSalesForCredit.reduce((sum, s) => sum + (Number(s.reste_a_payer) || 0), 0);

    // 6. Notifications & Infos diverses
    const pendingBrouillons = await CloudBrouillonEcriture.countDocuments({
        company_id: companyId.toString(),
        statut: 'EN_ATTENTE'
    });

    const lastClosure = await CloudClotureCaisse.findOne({
        company_id: companyId.toString(),
        statut: 'VALIDE'
    }).sort({ created_at: -1 }).lean();

    const company = await CloudCompany.findOne({
        $or: [{ localId: companyId }, { _id: mongoose.isValidObjectId(companyId) ? companyId : null }]
    }).lean();

    return {
        totalProducts,
        stockAlerts,
        dailySales,
        cashBalance,
        bankBalance,
        totalAvoirs,
        supplierDebt,
        customerCredit,
        pendingBrouillons,
        lastClosureDate: lastClosure?.date_cloture || lastClosure?.created_at || null,
        licenceExpiry: company?.license_start_date || null
    };
};