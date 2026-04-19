const { Router } = require('express');
const { requireAuth } = require('../../middlewares/auth');
const usersController = require('./users.controller');

const router = Router();

router.use(requireAuth);
router.get('/me', usersController.getProfile);
router.patch('/me', usersController.updateProfile);

module.exports = router;
