// scripts/test-stock.js
const stockService = require('../services/stock.service');
const { getDb } = require('../config/database');

async function testStockService() {
  const db = getDb();
  console.log('🧪 Test du moteur de stock...');

  try {
    // 1. Création d'un article de test
    const testId = "TEST-STOCK-999";
    db.prepare(`
        INSERT OR REPLACE INTO products (id, nom, company_id, stock_actuel) 
        VALUES (?, 'ARTICLE TEST STOCK', 1, 0)
    `).run(testId);

    // 2. Opérations de stock
    await stockService.addStock(testId, 100);
    console.log('✅ Stock ajouté : 100');

    await stockService.removeStock(testId, 40);
    console.log('✅ Stock retiré : 40');

    // 3. Vérification
    const stock = await stockService.getStock(testId);
    console.log('📊 Stock final mesuré :', stock); 

    if (stock === 60) {
      console.log('🚀 SUCCÈS : Le calcul de stock est correct !');
    } else {
      console.error('❌ ÉCHEC : Le stock devrait être 60.');
    }

  } catch (err) {
    console.error('❌ Erreur durant le test :', err.message);
  }
}

testStockService();