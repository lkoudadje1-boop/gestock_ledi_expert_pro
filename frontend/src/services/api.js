// frontend/src/services/api.js
import axios from 'axios';
import { io } from 'socket.io-client';

/**
 * ==========================================
 * CONFIGURATION ERP LEDI EXPERT PRO (100% WEB SAAS)
 * ==========================================
 */

// URL de base du backend sur Railway (modifiable via variable d'environnement React)
const BASE_URL = process.env.REACT_APP_API_URL || 'https://ton-projet.railway.app/api';
const SOCKET_URL = process.env.REACT_APP_WS_URL || 'https://ton-projet.railway.app';

console.log('🚀 LEDI ERP - Mode Cloud Web activé');
console.log(`📡 Connexion au serveur : ${BASE_URL}`);

/**
 * ==========================================
 * INITIALISATION SOCKET.IO
 * ==========================================
 */

export const socket = io(SOCKET_URL, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    timeout: 10000,
});

/**
 * ==========================================
 * ÉVÉNEMENTS SOCKET
 * ==========================================
 */

socket.on('connect', () => {
    console.log('✅ Socket connecté au Cloud');
    joinCompanyRoom();
});

socket.on('disconnect', () => {
    console.log('❌ Socket déconnecté');
});

socket.on('connect_error', (err) => {
    console.error('❌ Erreur Socket.IO :', err.message);
});

/**
 * ==========================================
 * REJOINDRE LA ROOM ENTREPRISE
 * ==========================================
 */

export const joinCompanyRoom = () => {
    try {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const companyId = user.company_id || user.companyId;

        if (companyId && socket.connected) {
            socket.emit('join_company', companyId.toString());
            console.log(`🏢 Room entreprise rejointe : ${companyId}`);
        }
    } catch (err) {
        console.error('Erreur joinCompanyRoom :', err);
    }
};

/**
 * ==========================================
 * CONFIGURATION AXIOS
 * ==========================================
 */

const API = axios.create({
    baseURL: BASE_URL,
    headers: {
        'Content-Type': 'application/json'
    }
});

/**
 * ==========================================
 * INTERCEPTEUR DE REQUÊTE
 * ==========================================
 */

API.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        const user = JSON.parse(localStorage.getItem('user') || '{}');

        const companyId =
            user.company_id ||
            user.companyId ||
            localStorage.getItem('companyId') ||
            1;

        // JWT
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }

        // Société active (Multi-tenant)
        config.headers['x-company-id'] = companyId;

        // Infos utilisateur
        if (user.id) {
            config.headers['x-user-id'] = user.id;
            config.headers['x-user-permissions'] = JSON.stringify(user.permissions || {});
            config.headers['x-license-caps'] = JSON.stringify(user.mod || []);
        }

        return config;
    },
    (error) => Promise.reject(error)
);

/**
 * ==========================================
 * INTERCEPTEUR DE RÉPONSE
 * ==========================================
 */

API.interceptors.response.use(
    (response) => {
        const method = response.config.method?.toLowerCase();

        // Synchronisation temps réel optionnelle
        if (['get','post','put','delete','patch','options'].includes(method)) {
            const user = JSON.parse(localStorage.getItem('user') || '{}');
            const companyId = user.company_id || user.companyId;

            if (companyId && socket.connected) {
                socket.emit('DATA_CHANGED', {
                    companyId: companyId.toString(),
                    url: response.config.url
                });
            }
        }

        return response;
    },
    (error) => {
        // Serveur inaccessible
        if (!error.response) {
            console.error('🌐 ERREUR RÉSEAU : Impossible de joindre le serveur Railway.');
            console.error(`📡 URL testée : ${BASE_URL}`);
            return Promise.reject(error);
        }

        // 403 - Permissions insuffisantes
        if (error.response.status === 403) {
            console.warn('⛔ Accès refusé');
            return Promise.reject(error);
        }

        // 401 - Session expirée
        if (error.response.status === 401) {
            console.warn('🔒 Session expirée');

            localStorage.removeItem('token');
            localStorage.removeItem('user');

            if (!window.location.hash.includes('/login')) {
                window.location.href = '/#/login';
            }
        }

        return Promise.reject(error);
    }
);

export default API;