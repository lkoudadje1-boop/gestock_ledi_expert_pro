import React from 'react';
import Sidebar from '../components/Sidebar'; // Vérifie le chemin de ton composant Sidebar
import './Dashboard.css'; // On réutilise le CSS du dashboard pour la structure

const RolesManagement = () => {
  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="main-area">
        <div style={{ padding: '30px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '10px' }}>Droits & Accès</h1>
          <p style={{ color: '#64748b' }}>Configuration des permissions par rôle utilisateur.</p>
          <hr style={{ margin: '20px 0', border: '0.5px solid #eee' }} />
          
          <div style={{ background: '#fff', padding: '40px', borderRadius: '12px', textAlign: 'center', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
             <p style={{ fontSize: '18px', color: '#4b5563' }}>🚧 Page en cours de développement</p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default RolesManagement;