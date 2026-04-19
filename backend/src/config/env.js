/**
 * Carga y valida variables de entorno.
 * Requiere que dotenv.config() se haya ejecutado antes (en server.js).
 */
function loadEnv() {
    return {
        NODE_ENV: process.env.NODE_ENV || 'development',
        PORT: process.env.PORT || '3001',
        FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
    };
}

module.exports = { loadEnv };
