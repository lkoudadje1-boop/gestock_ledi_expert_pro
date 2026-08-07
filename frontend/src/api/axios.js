import axios from 'axios';

// ======================================================
// DÉTECTION DE L'ENVIRONNEMENT
// ======================================================
const isElectron = navigator.userAgent.toLowerCase().includes('electron');
const isLocalhost =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';

// ======================================================
// URLS
// ======================================================
const CLOUD_URL = 'https://erp-ledi-expert-backend-v1.onrender.com/api';

// Adresse par défaut pour le développement
const DEFAULT_LOCAL_URL = 'http://127.0.0.1:3030/api';

// ======================================================
// CONSTRUCTION DYNAMIQUE DE L'URL
// ======================================================
let BASE_URL = CLOUD_URL;

if (isElectron || isLocalhost) {
    // Adresse du serveur enregistrée
    const savedServerIP = localStorage.getItem('server_ip');

    if (savedServerIP) {
        BASE_URL = `http://${savedServerIP}:3030/api`;
    } else {
        BASE_URL = DEFAULT_LOCAL_URL;
    }
}

// ======================================================
// INSTANCE AXIOS
// ======================================================
const API = axios.create({
    baseURL: BASE_URL,
    timeout: 30000
});

// ======================================================
// INTERCEPTEUR DE REQUÊTE
// ======================================================
API.interceptors.request.use(
    async (config) => {
        let token = null;

        try {
            if (window.electronAPI?.secureStorage) {
                token = await window.electronAPI.secureStorage.get('token');
            } else {
                token = localStorage.getItem('token');
            }

            if (token) {
                config.headers.Authorization = `Bearer ${token}`;
            }

            return config;
        } catch (err) {
            console.error('Erreur récupération token :', err);
            return config;
        }
    },
    (error) => Promise.reject(error)
);

// ======================================================
// INTERCEPTEUR DE RÉPONSE
// ======================================================
API.interceptors.response.use(
    (response) => response,

    async (error) => {

        const isLoginPage = window.location.hash.includes('/login');

        if (
            error.response &&
            error.response.status === 401 &&
            !isLoginPage
        ) {
            console.warn('🔒 Session expirée.');

            try {

                if (window.electronAPI?.secureStorage) {
                    await window.electronAPI.secureStorage.delete('token');
                    await window.electronAPI.secureStorage.delete('user');
                } else {
                    localStorage.removeItem('token');
                    localStorage.removeItem('user');
                }

            } catch (err) {
                console.error(err);
            }

            window.location.href = '/#/login';
        }

        return Promise.reject(error);
    }
);

export default API;