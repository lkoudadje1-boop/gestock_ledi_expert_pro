// frontend/src/api/axios.js
import axios from 'axios';

// ======================================================
// URL DE BASE CLOUD (Railway - SaaS 100% Web)
// ======================================================
const BASE_URL = process.env.REACT_APP_API_URL || '/api';

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
    (config) => {
        try {
            const token = localStorage.getItem('token');

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
                localStorage.removeItem('token');
                localStorage.removeItem('user');
            } catch (err) {
                console.error('Erreur lors du nettoyage de la session :', err);
            }

            window.location.href = '/#/login';
        }

        return Promise.reject(error);
    }
);

export default API;