const express = require('express');
const router = express.Router();
const productController = require('../controllers/product.controller');
const { verifyToken } = require('../middlewares/auth.middleware');
const { checkCompanyAccess } = require('../middlewares/company.middleware');
// Import du middleware de licence
const verifyLicense = require('../middlewares/license.middleware');
const multer = require('multer');

// Configuration de multer en mémoire pour l'import CSV
const upload = multer();

// --- MIDDLEWARES GLOBAUX ---
router.use(verifyToken);
router.use(checkCompanyAccess);
// Toutes les actions sur les produits nécessitent le module GESTOCK
router.use(verifyLicense('GESTOCK'));

// --- 📌 1. ROUTES D'IMPORT / EXPORT ---

// Route d'exportation complète
router.get('/csv/export', productController.exportProductsCSV);

// Route d'importation complète
router.post('/csv/import', upload.single('file'), productController.importProductsCSV);


// --- 📌 2. ROUTES DE LECTURE ---
router.get('/history/all', productController.getProductHistory);
router.get('/', productController.getAllProducts);
router.get('/:id/history', productController.getProductHistory);
router.get('/:id', productController.getProductById);


// --- 📌 3. ROUTES D'ACTIONS ---

// Création complète
router.post('/full', productController.createProduct);

// Mise à jour de l'article
router.put('/:id', productController.updateProduct);

// Changement de statut (Archivage sécurisé)
router.patch('/:id/status', productController.updateStatus);

module.exports = router;