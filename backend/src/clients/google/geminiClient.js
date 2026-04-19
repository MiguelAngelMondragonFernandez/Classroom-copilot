const https = require('https');

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

async function generateContent(prompt) {
    const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash-latest';
    const apiKey = process.env.GEMINI_API_KEY;

    const url = `${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`;
    const body = JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
    });

    return new Promise((resolve, reject) => {
        const req = https.request(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        }, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.error) return reject(new Error(`Gemini API Error: ${parsed.error.message}`));
                    resolve(parsed);
                } catch (e) {
                    reject(new Error('Error parseando respuesta de Gemini'));
                }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

module.exports = { generateContent };
