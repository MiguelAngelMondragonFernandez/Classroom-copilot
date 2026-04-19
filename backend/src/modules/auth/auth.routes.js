const { Router } = require('express');
const authController = require('./auth.controller');
const { requireAuth } = require('../../middlewares/auth');

const router = Router();

router.get('/google/login', authController.login);
router.get('/google/callback', authController.callback);
router.post('/refresh', requireAuth, authController.refreshToken);
router.get('/me', requireAuth, authController.getMe);
router.post('/logout', requireAuth, authController.logout);

module.exports = router;
