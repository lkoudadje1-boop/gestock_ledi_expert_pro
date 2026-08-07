const express = require('express');
const router = express.Router();
const achatController = require('../controllers/achatemballages.controller');
const { verifyToken } = require('../middlewares/auth.middleware');
const verifyLicense = require('../middlewares/license.middleware');

router.get('/', verifyToken, achatController.getAll);
router.post('/', verifyToken, verifyLicense('GESTOCK'), achatController.createAchat);
router.put('/:id', verifyToken, verifyLicense('GESTOCK'), achatController.updateAchat);
router.post('/:id/action', verifyToken, verifyLicense('GESTOCK'), achatController.handleAction);

module.exports = router;