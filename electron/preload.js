const { contextBridge, ipcRenderer } = require('electron');

// Expose les fonctionnalités système au monde React de manière sécurisée (Sandbox Compliant) [ol5wiv]
contextBridge.exposeInMainWorld('electronAPI', {
    // Dialogues
    confirm: (options) => ipcRenderer.invoke('dialog:confirm', options),
    
    // Notifications
    notify: (title, body) => ipcRenderer.send('notify', { title, body }),
    
    // Impression
    getPrinters: () => ipcRenderer.invoke('get-printers'),
    printPDF: (htmlContent, options) => ipcRenderer.send('print-pdf', htmlContent, options),
    
    // Informations système et Verrouillage Matériel (Anti-Copie) [vq3yx0, mtb7pq]
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    getMachineId: () => ipcRenderer.invoke('get-machine-id'), // 🛡️ AJOUTÉ : Ouvre le tunnel pour le MID physique [vq3yx0]

    // --- INTERFACE DE STOCKAGE SÉCURISÉ (AES-256) ---
    secureStorage: {
        set: (key, value) => ipcRenderer.invoke('store:set', key, value),
        get: (key) => ipcRenderer.invoke('store:get', key),
        delete: (key) => ipcRenderer.invoke('store:delete', key)
    }
});
