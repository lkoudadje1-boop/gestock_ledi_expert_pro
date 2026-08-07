import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// 🔌 SÉCURITÉ ET LANGUES GLOBALES
import './locales/i18n'; // ✅ AJOUTÉ ICI : Active le moteur de langues pour tout l'ERP

// Supprime ou commente la ligne ci-dessous si le fichier n'existe pas dans /src
// import './index.css'; 

const root = ReactDOM.createRoot(document.getElementById('root'));

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
