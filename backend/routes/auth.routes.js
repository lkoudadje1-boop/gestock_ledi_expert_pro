const express = require('express');
const router = express.Router();
const structureCtrl = require('../controllers/familleCategGroup.controller');
const { verifyToken } = require('../middlewares/auth.middleware'); 
const { checkCompanyAccess } = require('../middlewares/company.middleware');
// Import du gendarme de licence
const verifyLicense = require('../middlewares/license.middleware');

const { 
    signup, 
    login, 
    logout, 
    checkEmailAvailability, 
    forgotPassword, 
    resetPassword,
    createUserByAdmin,
    getUsers,          
    updateUser,        
    toggleUserStatus   
} = require('../controllers/auth.controller');

// --- ROUTES AUTHENTIFICATION (Publiques ou Semi-Publiques) ---
// Note : signup et login restent sans verifyLicense pour permettre l'accès initial
router.post('/signup', signup);
router.post('/login', login);
router.post('/logout', verifyToken, logout); 

router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.get('/check-email', checkEmailAvailability);

// --- ROUTES COLLABORATEURS (Protégées par SYSTEM ou USERS) ---

// Consultation de la liste (SYSTEM selon ton mapping /api/auth)
router.get('/users/liste', 
    verifyToken, 
    checkCompanyAccess, 
    verifyLicense('SYSTEM'), 
    getUsers
);

router.get('/users', 
    verifyToken, 
    checkCompanyAccess, 
    verifyLicense('SYSTEM'), 
    getUsers
);

// Création et Modification (USERS selon ton mapping /api/staff)
router.post('/create-user', 
    verifyToken, 
    checkCompanyAccess, 
    verifyLicense('SYSTEM'), 
    createUserByAdmin
);

router.put('/users/:id', 
    verifyToken, 
    checkCompanyAccess, 
    verifyLicense('SYSTEM'), 
    updateUser
); 

router.patch('/users/:id/status', 
    verifyToken, 
    checkCompanyAccess, 
    verifyLicense('SYSTEM'), 
    toggleUserStatus
);

// Mise à jour des structures produits (GESTOCK selon ton mapping /api)
router.patch('/status-update/:type/:id', 
    verifyToken, 
    checkCompanyAccess, 
    verifyLicense('GESTOCK'), 
    structureCtrl.updateStatus
);

module.exports = router;