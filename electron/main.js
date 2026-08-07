const {
    app,
    BrowserWindow,
    Menu,
    shell,
    ipcMain,
    dialog,
    Notification
} = require('electron');
const path = require('path');
const { fork } = require('child_process');
const fs = require('fs');
const pt = require('pdf-to-printer'); // 🚀 Importation du spouleur direct
const activeClients = new Map();

// ==============================================================================
// 🔒 VERROUILLAGE D'INSTANCE UNIQUE : Empêche l'ouverture double sur la machine
// ==============================================================================
const captureDuVerrouUnique = app.requestSingleInstanceLock();

if (!captureDuVerrouUnique) {
    // Si l'application est déjà lancée, on quitte immédiatement la 2e instance
    app.quit();
} else {
    // Si l'utilisateur clique à nouveau sur l'icône, on remet l'ancienne fenêtre au premier plan
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
            
            new Notification({
                title: 'LEDI EXPERT PRO',
                body: 'L\'application est déjà active en tâche de fond sur cette machine.'
            }).show();
        }
    });
}

// --- INITIALISATION DU STOCKAGE SÉCURISÉ (ES MODULE COMPATIBLE) ---
const { machineIdSync } = require('node-machine-id');
let secureStore;

async function initSecureStore() {
    const { default: Store } = await import('electron-store');
    
    // 🛡️ Génération d'une clé unique basée sur la machine pour chiffrer la configuration locale
    const encryptionKey = machineIdSync() || "ledi_expert_fallback_secure_key_2026";

    secureStore = new Store({
        encryptionKey: encryptionKey,
        name: 'secure-app-storage'
    });

    ipcMain.handle('store:set', (event, key, value) => {
        secureStore.set(key, value);
        return true;
    });

    ipcMain.handle('store:get', (event, key) => {
        return secureStore.get(key);
    });

    ipcMain.handle('store:delete', (event, key) => {
        secureStore.delete(key);
        return true;
    });
}

let mainWindow;
let backendProcess;
let formatPapierSystemeForce = 'A5';

// --- DÉMARRAGE AUTOMATIQUE DU BACKEND EXPRESS ---
function startBackend() {
    const isDev = !app.isPackaged;
    const baseUnpacked = path.join(process.resourcesPath, 'app.asar.unpacked');
    
    // ✅ MODIFICATION SÉCURISÉE : Pointera vers backend_dist (le fichier unique obfusqué) en production
    const backendPath = isDev 
        ? path.join(__dirname, '../backend/index.js') 
        : path.join(baseUnpacked, 'backend_dist', 'index.js');

    const nodeModulesUnpacked = path.join(baseUnpacked, 'node_modules');
    const nodeModulesPacked = path.join(process.resourcesPath, 'app.asar', 'node_modules');
    
    const combinedNodePath = isDev 
        ? path.join(__dirname, '../node_modules')
        : `${nodeModulesUnpacked};${nodeModulesPacked}`;

    // 🔒 SÉCURISATION DES SECRETS : Extraction hors du code visible d'Electron.
    const child = fork(backendPath, [], {
        cwd: path.dirname(backendPath),
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
        env: { 
            ...process.env, 
            NODE_ENV: isDev ? 'development' : 'production',
            NODE_PATH: combinedNodePath,
            PORT: 3030,
            USER_DATA_PATH: app.getPath('userData'),

            // --- INJECTION DES VARIABLES (SERONT MASQUÉES AU RUNTIME) ---
            MONGO_URI: process.env.MONGO_URI || "mongodb+srv://leonadmin:leon2026@cluster0.uv1gqss.mongodb.net/erp_ledi_expert?retryWrites=true&w=majority&appName=Cluster0",
            JWT_SECRET: process.env.JWT_SECRET || "ledi_expert_secret_2026",
            LICENSE_SECRET: machineIdSync(), // Lier directement à l'ID machine unique
            EMAIL_USER: "gestionappk@gmail.com",
            EMAIL_PASS: "jvwmityegwwrmrch",
            APP_NAME: "LEDI EXPERT PRO",
            COMPANY_NAME: "Ledi Expert Pro",
            RESET_DB: "false"
        }
    });

    child.stderr.on('data', (data) => {
        const errorText = data.toString();
        console.error(`[BACKEND ERROR]: ${errorText}`);
        
        // 🎯 DISPOSITIF SÉCURITÉ : Masquer et bloquer les boîtes de dialogue système "showErrorBox" en production.
        // Les erreurs d'authentification ou SQLite restent silencieuses en arrière-plan et ne bloquent plus l'utilisateur.
        if (isDev) {
            if (errorText.includes('Error') || errorText.includes('FATAL')) {
                dialog.showErrorBox("Erreur Backend (Développement)", errorText);
            }
        }
    });

    child.stdout.on('data', (data) => console.log(`[BACKEND LOG]: ${data}`));

    child.on('exit', (code) => {
        if (code !== 0 && code !== null) {
            console.log(`🚫 Backend stoppé (Code ${code})`);
        }
    });

    return child;
}

// --- FENÊTRE PRINCIPALE ---
function createWindow() {
    const isDev = !app.isPackaged;

    mainWindow = new BrowserWindow({
        width: 1366,
        height: 850,
        minWidth: 1024,
        minHeight: 768,
        show: false,
        title: 'LEDI EXPERT PRO - Gestion de Stock & Ventes',
        icon: path.join(__dirname, '../assets/icon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'), 
            nodeIntegration: false,   // ✅ Sépare le moteur Node du Frontend [ol5wiv]
            contextIsolation: true,   // ✅ Empêche l'accès direct aux API de l'ordinateur [ol5wiv]
            sandbox: true,            // 🛡️ Isole complètement le rendu de l'interface [ol5wiv]
            devTools: isDev 
        }
    });

    // 🚀 INTERCEPTEUR DE SÉCURITÉ IMPRESSION : Forçage dynamique du format A5 / A6
    mainWindow.webContents.on('did-init-print-job', (event, options) => {
        // En fonction du bouton cliqué dans React, on écrase le A4 par défaut de Windows
        if (formatPapierSystemeForce === 'A6') {
            options.pageSize = 'A6'; // Format ticket de caisse (105mm x 148mm)
        } else {
            options.pageSize = 'A5'; // Format facture de comptoir (148mm x 210mm)
        }
        
        options.printBackground = true; // Conserve les styles CSS et graphiques du ticket
        options.margins = { marginType: 'none' }; // Supprime les marges blanches d'étirement du A4
        
        console.log(`🖨️ [MAIN PROCESS] Spouleur Windows configuré obligatoirement en : ${options.pageSize}`);
    });

    if (isDev) {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    } else {
        mainWindow.webContents.on('before-input-event', (event, input) => {
            if ((input.control && input.shift && input.key.toLowerCase() === 'i') || input.key === 'F12') {
                event.preventDefault();
            }
        });
        mainWindow.webContents.on('context-menu', (e) => e.preventDefault());
    }

    const indexPath = isDev
        ? path.join(__dirname, '../frontend/build/index.html') 
        : path.join(app.getAppPath(), 'frontend/build/index.html');

    console.log('📄 Chargement Frontend:', indexPath);
    mainWindow.loadFile(indexPath);
    mainWindow.once('ready-to-show', () => {
        mainWindow.maximize();
        mainWindow.show();
        console.log('✅ Interface ERP affichée');
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// --- GESTION DES COMMUNICATIONS (IPC) ---
ipcMain.handle('dialog:confirm', async (event, options) => {
    const result = await dialog.showMessageBox(mainWindow, {
        type: options.type || 'warning',
        buttons: ['Annuler', 'Confirmer'],
        defaultId: 0,
        cancelId: 0,
        title: options.title || 'Action Critique',
        message: options.message || 'Voulez-vous vraiment continuer ?',
        detail: options.detail || 'Cette action peut être irréversible.'
    });
    return result.response === 1;
});

ipcMain.on('print-pdf', (event, htmlContent, options) => {
    const format = (options && options.format) ? String(options.format).toUpperCase().trim() : 'A5';
    
    // 📐 Configuration stricte en microns pour graver le format A5 dans le fichier PDF
    let pageSizeConfig = { 
        width: 148000, // 148 mm (A5)
        height: 210000 // 210 mm (A5)
    }; 
    
    if (format === 'A6') { 
        pageSizeConfig = { width: 105000, height: 148000 }; 
    }

    console.log(`🖨️ [MAIN PROCESS] Création du fichier PDF matériel au format : ${format}`);

    // Window invisible pour compiler le HTML envoyé par React
    let workerWindow = new BrowserWindow({
        show: false,
        webPreferences: { 
            nodeIntegration: false, 
            contextIsolation: true 
        }
    });

    workerWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

    workerWindow.webContents.on('did-finish-load', async () => {
        try {
            // 1. On fige les données dans un fichier PDF A5 mathématique
            const pdfBuffer = await workerWindow.webContents.printToPDF({
                pageSize: pageSizeConfig,
                printBackground: true,
                margins: { top: 0, bottom: 0, left: 0, right: 0 }
            });

            // 2. Création sécurisée du chemin du fichier sur le disque dur
            const tempDir = app.getPath('temp');
            const tempPdfPath = path.join(tempDir, `invoice_${Date.now()}.pdf`);
            
            // 3. Écriture physique du fichier PDF
            fs.writeFileSync(tempPdfPath, pdfBuffer);
            console.log(`💾 Fichier PDF temporaire créé avec succès : ${tempPdfPath}`);

            // 4. Envoi forcé au spouleur Windows
            await pt.print(tempPdfPath, {
                scale: "fit" // Force l'ajustement aux dimensions physiques de la feuille
            });

            console.log(`✅ [MAIN PROCESS] Flux binaire envoyé à l'imprimante Canon.`);

            // 5. Nettoyage du fichier temporaire pour ne pas encombrer le PC
            setTimeout(() => {
                if (fs.existsSync(tempPdfPath)) {
                    fs.unlinkSync(tempPdfPath);
                }
            }, 8000);

        } catch (error) {
            console.error(`❌ [MAIN PROCESS] Erreur fatale lors de l'envoi au spouleur :`, error);
        } finally {
            if (workerWindow) {
                workerWindow.destroy();
                workerWindow = null;
            }
        }
    });
});

// ==============================================================================
// 🎯 CYCLE DE VIE GLOBAL ELECTRON : COUPLAGE ET NETTOYAGE DES SESSIONS PRODUCTION
// ==============================================================================

// Appelé uniquement si l'instance unique a été validée avec succès (Bloc 1)
if (captureDuVerrouUnique) {
    app.whenReady().then(async () => {
        // 1. Montage asynchrone du stockage chiffré par l'ID de la carte mère
        await initSecureStore();
        
        // 2. Démarrage de la base de données locale Express
        backendProcess = startBackend();
        
        // 3. Affichage de la fenêtre principale maximisée
        createWindow();

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) createWindow();
        });
    });
}

// Nettoyage strict à la fermeture complète de l'application
app.on('window-all-closed', () => {
    // Sur Windows/Linux, on coupe l'application. On préserve le comportement spécifique Mac OS.
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// 🛡️ SÉCURITÉ ANTI-PROCESSUS FANTÔME : Destruction du backend Node à la sortie de l'ERP
app.on('will-quit', () => {
    if (backendProcess) {
        console.log("🛑 [MAIN PROCESS] Extinction programmée du processus enfant Express Node.js...");
        backendProcess.kill();
        backendProcess = null;
    }
});

// --- GESTION DES COMMUNICATIONS ET DES ÉCOUTEURS D'ÉVÉNEMENTS (IPC) ---

ipcMain.on('notify', (event, { title, body }) => {
    new Notification({ title, body }).show();
});

ipcMain.handle('get-app-version', () => {
    return app.getVersion();
});

ipcMain.handle('get-machine-id', () => {
    try {
        const { machineIdSync } = require('node-machine-id');
        return machineIdSync(); // Extrait l'UUID matériel unique du PC (Carte mère / Disque principal) [vq3yx0]
    } catch (err) {
        console.error("❌ Impossible de capturer le Machine ID local :", err.message);
        return "ERROR_CAPTURE_HARDWARE_ID";
    }
});

ipcMain.handle('get-printers', async () => {
    return await mainWindow.webContents.getPrintersAsync();
});

// 🚀 IMPRESSION DIRECTE AVEC INJECTION GÉOMÉTRIQUE STRICTE SELON LE FORMAT SÉLECTIONNÉ
ipcMain.on('print-pdf', (event, htmlContent, options = {}) => {
    let workerWindow = new BrowserWindow({
        show: false,
        webPreferences: { 
            nodeIntegration: false, 
            contextIsolation: true,
            sandbox: true // 🛡️ Sécurise aussi la fenêtre d'impression en arrière-plan [ol5wiv]
        }
    });

    workerWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
    
    workerWindow.webContents.on('did-finish-load', () => {
        const printOptions = {
            silent: options.silent !== undefined ? options.silent : true,
            printBackground: true,
            deviceName: options.printerName || ''
        };

        if (options.format === 'ticket') {
            printOptions.pageSize = { width: 80000, height: 200000 }; // Ticket de caisse thermique 80mm
        } else if (options.format === 'A5') {
            printOptions.pageSize = 'A5'; // Facture comptoir analytique
        } else if (options.format === 'half-A5') {
            printOptions.pageSize = { width: 105000, height: 148000 }; // Demi-page
        } else {
            printOptions.pageSize = 'A4';
        }

        workerWindow.webContents.print(printOptions, (success, failureReason) => {
            if (!success) console.error(`❌ Échec impression: ${failureReason}`);
            workerWindow.close();
        });
    });
});

// --- MENU DE L'APPLICATION ---
function createMenu() {
    const menuTemplate = [
        { label: 'Application', submenu: [{ label: 'Actualiser', role: 'reload' }, { type: 'separator' }, { label: 'Quitter', role: 'quit' }] },
        { label: 'Édition', submenu: [{ label: 'Annuler', role: 'undo' }, { label: 'Rétablir', role: 'redo' }, { type: 'separator' }, { label: 'Couper', role: 'cut' }, { label: 'Copier', role: 'copy' }, { label: 'Coller', role: 'paste' }] },
        { label: 'Affichage', submenu: [{ label: 'Plein écran', role: 'togglefullscreen' }] }
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
}

// ==============================================================================
// 🎯 CYCLE DE VIE GLOBAL : INITIALISATION CONDITIONNÉE PAR LE VERROU UNIQUE (BLOC 1)
// ==============================================================================

if (captureDuVerrouUnique) {
    app.whenReady().then(() => {
        initSecureStore().then(() => {
            console.log('🚀 Démarrage ERP LEDI EXPERT PRO...');
            backendProcess = startBackend();
            
            createMenu();
            if (backendProcess) {
                backendProcess.on('message', (msg) => {
                    if (msg === 'SERVER_READY') {
                        console.log('✅ Backend prêt, ouverture de la fenêtre...');
                        if (!mainWindow) createWindow();
                    }
                });
            } else {
                console.error("❌ Impossible de démarrer le backend. Ouverture forcée de l'interface...");
                createWindow();
            }
            
            // Timeout de sécurité pour charger la fenêtre principale quoi qu'il arrive
            setTimeout(() => {
                if (!mainWindow) {
                    console.warn("⚠️ Timeout : Ouverture forcée de l'interface.");
                    createWindow();
                }
            }, 10000);
        });
    });
}

// 🛡️ BLINDAGE DE SÉCURITÉ CONTRE LE HIJACKING RÉSEAU ET LES SITES TIERS (ANTI-XSS)
app.on('web-contents-created', (event, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
        // Rediriger uniquement les protocoles de navigation vers le navigateur natif de l'ordinateur
        if (url.startsWith('https:')) {
            shell.openExternal(url);
        }
        return { action: 'deny' }; // Bloquer l'ouverture de fenêtres de script non sécurisées
    });

    contents.on('will-navigate', (event, navigationUrl) => {
        event.preventDefault();
    });
});

// --- NETTOYAGE ABSOLU ET DESTRUCTION DES REQUÊTES EN ARRIÈRE-PLAN ---
app.on('window-all-closed', () => {
    if (backendProcess) {
        backendProcess.kill();
        backendProcess = null;
    }
    if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
    if (backendProcess) {
        backendProcess.kill();
        backendProcess = null;
    }
});
