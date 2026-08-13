const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const { initDatabase } = require('./config/database');
const { verifyToken } = require('./middlewares/auth.middleware');
const { gatekeeper } = require('./middlewares/permissionManager');

// --- IMPORTATION DES ROUTES ---
const authRoutes = require('./routes/auth.routes');
const uniteRoutes = require('./routes/unite');
const productRoutes = require('./routes/product.routes');
const FamilleCategGroupRoutes = require('./routes/FamilleCategGroup');
const fournisseurRoutes = require('./routes/fournisseur.routes.js');
const purchaseRoutes = require('./routes/approvisionnement.route');
const nouvelleVenteRoutes = require('./routes/nouvellevente.routes');
const provisionalSaleRoutes = require('./routes/provisional_sale.routes');
const clotureVenteRoutes = require('./routes/cloturevente.routes');
const customerRoutes = require('./routes/client.route');
const staffRoutes = require('./routes/staff.routes');
const inventoryRoutes = require('./routes/inventory.routes');
const companyRoutes = require('./routes/company.routes');
const auditRoutes = require('./routes/audit');
const planRoutes = require('./routes/planRoutes');
const exerciceRoutes = require('./routes/exercice.routes');
const journalRoutes = require('./routes/CodeJournal.routes');
const journalEcritureRoutes = require('./routes/JournalEcriture.routes');
const planAnalytiqueRoutes = require('./routes/PlanAnalytique.routes');
const saisiAnalytiqueRoutes = require('./routes/SaisieAnalytique.routes');
const journalBrouillonRoutes = require('./routes/JournalEcritureBrouillon.routes');
const analytiqueBrouillonRoutes = require('./routes/SaisieAnalytiqueBrouillon.routes');
const configAutoRoutes = require('./routes/ConfirgurationAuto.routes');
const balanceRoutes = require('./routes/Rap_BalanceComptes.routes');
const othersTiersRoutes = require('./routes/others_tiers.routes');
const grandLivreRoutes = require('./routes/Rap_GrandLivreComptes.routes');
const rapAnalytiqueRoutes = require('./routes/Rap_GrandLivreAnalytique.routes');
const balanceTiersRoutes = require('./routes/Rap_BalanceTiers.routes');
const balanceAgeeRoutes = require('./routes/Rap_BalanceAgee.routes');
const bilanRoutes = require('./routes/Rap_Bilan.routes');
const balanceAnalytiqueRoutes = require('./routes/Rap_BalanceAnalytique.routes');
const ranRoutes = require('./routes/ran.routes');
const typeBrouillardRoutes = require('./routes/TypeBrouillard.routes');
const brouillardSaisieRoutes = require('./routes/Brouillard.saisie.routes');
const importExportRoutes = require('./routes/importexportEcriture.routes');
const tafirRoutes = require('./routes/Rap_tafir.routes');
const configEcrituresAutoRoutes = require('./routes/ConfigEcrituresAuto.routes');
const methodPaiementRoutes = require('./routes/MethodPaiement.routes');
const clotureRoutes = require('./routes/clotureJournalier.route');
const loadRoutes = require('./routes/load.routes');
const emballageRoutes = require('./routes/emballages.routes');
const achatemballagesRoutes = require('./routes/achatemballages.routes');
const RegleConsignationRoutes = require('./routes/RegleConsignation.routes');
const tableRoutes = require('./routes/table.routes');
const stockAdjustmentRoutes = require('./routes/stockajustement.routes');
const consignationRoutes = require('./routes/consignation.routes');
const inventairePackageRoutes = require('./routes/inventairePackage.route');
const bonCommandeRoutes = require('./routes/boncommande.route'); 

const app = express();
const PORT = process.env.PORT || 3030;

async function startServer() {
    console.log('🚀 Démarrage du serveur backend (100% Cloud)...');
    
    try {
        // Connexion à MongoDB Atlas
        await initDatabase();      
        console.log('✅ Base de données Cloud initialisée.');
    } catch (err) {
        console.error('❌ ERREUR CRITIQUE DB CLOUD :', err);
        process.exit(1);
    }

    const server = http.createServer(app);

    // --- SOCKET.IO ---
    const io = new Server(server, {
        cors: { origin: '*', methods: ['GET', 'POST'] }
    });

    io.on('connection', (socket) => {
        console.log('🔌 Socket connecté:', socket.id);
        socket.on('join_company', (id) => {
            socket.join(String(id));
            console.log(`🏢 Salle entreprise: ${id}`);
        });
    });
    app.set('io', io);

    // --- MIDDLEWARES & CORS ---
    app.use(cors({
        origin: true,
        methods: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization','x-user-id', 'x-user-permissions','x-company-id','x-license-caps', 'x-required-permission'],
        credentials: true
    }));

    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ limit: '50mb', extended: true }));

    app.use((req, res, next) => {
        req.io = io;
        next();
    });

    // --- ROUTES PUBLIQUES / SYSTÈME ---
    app.use('/api/auth', authRoutes);
    app.use('/api/license', loadRoutes);
    app.use('/api/settings', require('./routes/settingsRoutes'));
    app.use('/api/company', companyRoutes);
    app.use('/api/companies', companyRoutes);

    app.use(gatekeeper);
    app.use('/api/audit', verifyToken, auditRoutes);
    app.use('/api/products', verifyToken, productRoutes);
    app.use('/api/unites', verifyToken, uniteRoutes);
    app.use('/api/suppliers', verifyToken, fournisseurRoutes);
    app.use('/api/customers', verifyToken, customerRoutes);
    app.use('/api/purchases', verifyToken, purchaseRoutes);
    app.use('/api/others-tiers', verifyToken, othersTiersRoutes);
    app.use('/api/sales', verifyToken, nouvelleVenteRoutes);
    app.use('/api/provisional-sales', verifyToken, provisionalSaleRoutes);
    app.use('/api/pos', verifyToken, clotureVenteRoutes);
    app.use('/api/dashboard', verifyToken, require('./routes/dashboard.routes'));
    app.use('/api/staff', verifyToken, staffRoutes);
    app.use('/api/inventories', verifyToken, inventoryRoutes);
    app.use('/api/plan-comptable', verifyToken, planRoutes);
    app.use('/api/compta/tiers', verifyToken, require('./routes/planTiers.routes.js'));
    app.use('/api/plan-comptable/exercices', verifyToken, exerciceRoutes);
    app.use('/api/plan-comptable/journaux', verifyToken, journalRoutes);
    app.use('/api/plan-comptable/ecritures', verifyToken, journalEcritureRoutes);
    app.use('/api/plan-comptable/ecritures-brouillon', verifyToken, journalBrouillonRoutes);
    app.use('/api/rapports-comptables', verifyToken, rapAnalytiqueRoutes);
    app.use('/api/plan-comptable/paiements', verifyToken, methodPaiementRoutes);
    app.use('/api/compta/rapports', verifyToken, balanceTiersRoutes);
    app.use('/api/analytique/saisie-brouillon', verifyToken, analytiqueBrouillonRoutes);
    app.use('/api/compta/rapports', verifyToken, balanceRoutes);
    app.use('/api/rapports-comptables', verifyToken, grandLivreRoutes);
    app.use('/api/compta/ran', verifyToken, ranRoutes);
    app.use('/api/compta/rapports', verifyToken, balanceAnalytiqueRoutes);
    app.use('/api/plan-comptable/rapports', verifyToken, balanceAgeeRoutes);
    app.use('/api/compta/rapports', verifyToken, bilanRoutes);
    app.use('/api/treso/brouillards', verifyToken, typeBrouillardRoutes);
    app.use('/api/treso/operations', verifyToken, brouillardSaisieRoutes);
    app.use('/api/compta', verifyToken, importExportRoutes);
    app.use('/api/compta/rapports', verifyToken, tafirRoutes);
    app.use('/api/analytique/repartitions', verifyToken, configAutoRoutes);
    app.use('/api/analytique/saisie', verifyToken, saisiAnalytiqueRoutes);
    app.use('/api/analytique', verifyToken, planAnalytiqueRoutes);
    app.use('/api/articles', verifyToken, FamilleCategGroupRoutes);
    app.use('/api/config-compta', verifyToken, configEcrituresAutoRoutes);
    app.use('/api/compta/cloture', verifyToken, clotureRoutes);
    app.use('/api/gestion-tables', verifyToken, tableRoutes);
    app.use('/api/achats-emballages', verifyToken, achatemballagesRoutes);
    app.use('/api/emballages/rules', verifyToken, RegleConsignationRoutes);
    app.use('/api/emballages', verifyToken, emballageRoutes);
    app.use('/api/consignations', verifyToken, consignationRoutes);
    app.use('/api/stock-adjustments', stockAdjustmentRoutes);
    app.use('/api/inventaireemb', verifyToken, inventairePackageRoutes);
    app.use('/api/purchase-orders', verifyToken, bonCommandeRoutes);

    // --- SERVIR LE FRONTEND REACT (PRODUCTION / CLOUD) ---
    const frontendBuildPath = path.join(__dirname, "../frontend/build");
    app.use(express.static(frontendBuildPath));

    app.get('*', (req, res) => {
        if (req.path.startsWith('/api')) {
            return res.status(404).json({ error: 'Route API introuvable' });
        }
        res.sendFile(path.join(frontendBuildPath, 'index.html'));
    });

    // --- DÉMARRAGE ÉCOUTE ---
    server.listen(PORT, '0.0.0.0', () => { 
       console.log(`🟢 ERP CLOUD ACTIF SUR PORT ${PORT}`);
       if (process.send) {
            process.send('SERVER_READY'); 
       }
    }).on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`❌ Le port ${PORT} est déjà utilisé`);
            process.exit(1);
        } else {
            console.error('❌ Erreur serveur:', err);
        }
    });
}

module.exports = { startServer };