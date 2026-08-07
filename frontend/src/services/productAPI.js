// frontend/src/services/productAPI.js
import API from './api'; // 🚀 C'est la seule chose dont on a besoin

export const productAPI = {
  // Liste simple
  getAll: () => API.get('/products'),
  
  // Détail avec les jointures
  getById: (id) => API.get(`/products/${id}`),
  
  // Création (Route /full)
  create: (data) => API.post('/products/full', data),
  
  // Mise à jour
  update: (id, data) => API.put(`/products/${id}`, data),
  
  // Changement de statut (Archivage)
  updateStatus: (id, is_active) => API.patch(`/products/${id}/status`, { is_active }),

  // Suppression
  delete: (id) => API.delete(`/products/${id}`)
};