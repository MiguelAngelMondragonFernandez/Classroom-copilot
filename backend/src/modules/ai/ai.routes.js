const { Router } = require('express');
const { requireAuth } = require('../../middlewares/auth');
const aiController = require('./ai.controller');

const router = Router();
router.use(requireAuth);
router.post('/generate', aiController.askGemini);

module.exports = router;
