const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboard.controller');
const { verifyToken } = require('../middlewares/auth.middleware');
// Import du middleware de licence
const verifyLicense = require('../middlewares/license.middleware');

/**
 * Selon ton routeMapping : 
 * '/api' => 'GESTOCK'
 */

// Cette route correspond à : GET /api/dashboard/stats
router.get('/stats', 
    verifyToken, 
    verifyLicense('GESTOCK'), 
    dashboardController.getStats
);

module.exports = router;