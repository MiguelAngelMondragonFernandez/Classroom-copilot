/**
 * Servicio para interactuar con Gemini vía el backend Express propio.
 * El backend valida el saldo y descuenta tokens.
 */

import api from './api';

export const askGemini = async (_userId, prompt) => {
    const data = await api.post('/api/ai/generate', { prompt });
    return data; // { answer, usage }
};
