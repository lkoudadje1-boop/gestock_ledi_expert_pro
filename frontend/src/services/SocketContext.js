// frontend/src/services/SocketContext.js
import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext();

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    // 🌐 URL du backend sur Railway (ou variable d'environnement React)
    const SOCKET_URL = process.env.REACT_APP_WS_URL || 'https://ton-projet.railway.app';

    const newSocket = io(SOCKET_URL, {
      transports: ['websocket'],
      reconnection: true
    });

    // FONCTION POUR REJOINDRE LA SALLE
    const joinRoom = () => {
      const userData = localStorage.getItem('user');
      if (userData) {
        const user = JSON.parse(userData);
        const cid = user.company_id || user.companyId; 
        if (cid) {
          console.log("🏢 Tentative de rejoindre la salle :", cid);
          newSocket.emit('join_company', cid.toString());
        }
      }
    };

    newSocket.on('connect', () => {
      console.log("✅ Socket connecté au Cloud");
      joinRoom();
    });

    // 🔥 Système Nerveux : On s'assure que le dispatch est propre
    newSocket.on('DATA_EVENT', (data) => {
        console.log("📢 [SOCKET-RECEIVE]", data);
        const event = new CustomEvent('ERP_DATA_CHANGED', { 
            detail: { table: data.table, action: data.action } 
        });
        window.dispatchEvent(event);
    });

    // Écouter si l'utilisateur se connecte (changement dans le localStorage)
    window.addEventListener('storage', joinRoom);

    setSocket(newSocket);
    return () => {
        newSocket.close();
        window.removeEventListener('storage', joinRoom);
    };
  }, []);

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);