const { generateContent } = require('../../clients/google/geminiClient');
const usersRepo = require('../users/users.repository');
const ApiError = require('../../utils/ApiError');

async function askGemini(userId, prompt) {
    const balance = await usersRepo.getTokenBalance(userId);
    if ((balance.token_balance || 0) <= 0) {
        throw ApiError.forbidden('Saldo insuficiente o usuario no registrado');
    }

    const result = await generateContent(prompt);
    const usage = result.usageMetadata || { totalTokenCount: 0 };
    const answer = result.candidates?.[0]?.content?.parts?.[0]?.text || 'Lo siento, no pude generar una respuesta.';

    await usersRepo.deductTokens(userId, usage.totalTokenCount || 0);

    return { answer, usage };
}

module.exports = { askGemini };
