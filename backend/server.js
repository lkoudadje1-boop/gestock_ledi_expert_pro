const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const { io: ioClient } = require('socket.io-client');
const { initDatabase, initFinancialData, getDb } = require('./config/database');
const { verifyToken } = require('./middlewares/auth.middleware');
const { gatekeeper } = require('./middlewares/permissionManager');
const LoadService = require('./services/load.service');
const { syncLocalToCloud, syncCloudToLocal } = require('./services/sync.service');
const { restoreFromCloud } = require('./services/restore.service');

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
const regleConsignationRoutes = require('./routes/RegleConsignation.routes');
const achatemballagesRoutes = require('./routes/achatemballages.routes');
const RegleConsignationRoutes = require('./routes/RegleConsignation.routes');
const tableRoutes = require('./routes/table.routes');
const stockAdjustmentRoutes = require('./routes/stockajustement.routes');
const consignationRoutes = require('./routes/consignation.routes');
const inventairePackageRoutes = require('./routes/inventairePackage.route');
const bonCommandeRoutes = require('./routes/boncommande.route'); 
const syncRoutes = require('./routes/sync.routes'); // 🚀 IMPORTATION DES ROUTES DE SYNCHRONISATION OFFICIELLES

const app = express();
const PORT = process.env.PORT || 3030;

// --- CLOUD LISTENER ---
const setupCloudListener = (companyId) => {
    const CLOUD_URL = 'https://erp-ledi-expert-backend-v1.onrender.com';
    const cloudSocket = ioClient(CLOUD_URL, {
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: Infinity
    });

    cloudSocket.on('connect', () => {
        console.log('📡 Connecté au Cloud');
        cloudSocket.emit('join_company', String(companyId));
    });

    cloudSocket.on('DATA_CHANGED_ON_CLOUD', async () => {
        console.log('⚡ Synchronisation instantanée...');
        try {
            await syncCloudToLocal(companyId);
            console.log('✅ Synchronisation OK');
        } catch (err) {
            console.error('❌ Erreur Sync:', err.message);
        }
    });

    cloudSocket.on('disconnect', () => {
        console.log('⚠️ Déconnecté du Cloud');
    });
};

function startServer() {
    console.log('🚀 Démarrage du serveur backend...');
    
    const userDataPath = process.env.USER_DATA_PATH || __dirname;
    console.log('📂 Dossier de données détecté :', userDataPath);

    try {
        initDatabase(userDataPath);      
        console.log('✅ Base de données initialisée.');
    } catch (err) {
        console.error('❌ ERREUR CRITIQUE DB :', err);
    }

    const server = http.createServer(app);
    const db = getDb();

    let companyId = process.env.MY_COMPANY_ID;
    if (!companyId) {
        try {
            const localComp = db.prepare('SELECT id FROM companies LIMIT 1').get();
            companyId = localComp ? localComp.id : null;
        } catch (err) {
            console.log('⚠️ Aucune entreprise locale détectée');
        }
    }

    // --- VÉRIFICATION LICENCE ---
    let systemStatus = { valid: false, allowed_modules: [] };
    try {
        if (companyId) {
            systemStatus = LoadService.getSystemStatus(companyId);
            if (!systemStatus.valid) {
                console.error('❌ LICENCE INVALIDE OU EXPIRÉE :', systemStatus.reason);
            } else {
                console.log('✅ LICENCE VALIDÉE | Modules:', systemStatus.allowed_modules.join(', '));
            }
        } else {
            console.log('⚠️ Première installation détectée');
            systemStatus = { valid: true, allowed_modules: ['AUTH', 'SIGNUP'] };
        }
    } catch (err) {
        console.error('⚠️ Erreur licence:', err.message);
    }
    app.set('license', systemStatus);

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
        req.db = db;
        next();
    });

    // --- ROUTES PUBLIQUES / SYSTÈME ---
    app.use('/api/auth', authRoutes);
    app.use('/api/license', loadRoutes);
    app.use('/api/settings', require('./routes/settingsRoutes'));
    app.use('/api/company', companyRoutes);
    app.use('/api/companies', companyRoutes);
    
    // 🌐 MONTAGE DES ROUTES OFFICIELLES DE SYNCHRONISATION (PUSH / PULL)
    app.use('/api/sync', syncRoutes); 
     
    // Route de déclenchement manuel rapide
    app.post('/api/trigger-sync', verifyToken, async (req, res) => {
        try {
            if (!companyId) {
                return res.status(400).json({ success: false, error: "Aucune entreprise configurée localement." });
            }
            console.log('🔄 Lancement de la synchronisation manuelle...');
            await syncLocalToCloud();
            await syncCloudToLocal(companyId);
            res.json({ success: true, message: 'Synchronisation effectuée avec succès.' });
        } catch (err) {
            console.error('❌ Erreur lors de la synchronisation :', err.message);
            res.status(500).json({ success: false, error: err.message });
        }
    });

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
    server.listen(PORT, '0.0.0.0', async () => { 
       console.log(`🟢 ERP ACTIF SUR PORT ${PORT}`);
       if (process.send) {
            process.send('SERVER_READY'); 
       }

       // 🌐 ACTIVATION DU PONT CLOUD (Temps réel & Sync initiale)
       if (companyId) {
            setupCloudListener(companyId);
            try {
                console.log('🔄 Synchronisation initiale avec le Cloud...');
                await syncCloudToLocal(companyId);
                await syncLocalToCloud();
                console.log('✅ Synchronisation initiale terminée avec succès');
            } catch (err) {
                console.warn('⚠️ Mode hors-ligne détecté (Sync impossible pour le moment) :', err.message);
            }
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
