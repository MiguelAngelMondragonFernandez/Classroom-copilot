const aiService = require('./ai.service');
const ApiError = require('../../utils/ApiError');

async function askGemini(req, res, next) {
    try {
        const { prompt } = req.body;
        if (!prompt) return next(ApiError.badRequest('El campo prompt es requerido'));
        const data = await aiService.askGemini(req.user.id, prompt);
        res.json({ success: true, data });
    } catch (err) { next(err); }
}

module.exports = { askGemini };
