const jwt = require('jsonwebtoken');
const ApiError = require('../utils/ApiError');

function requireAuth(req, res, next) {
    try {
        const token = req.cookies?.session_token || extractBearerToken(req);
        if (!token) throw ApiError.unauthorized('Se requiere autenticación');

        const payload = jwt.verify(token, process.env.JWT_SECRET);
        req.user = payload;
        next();
    } catch (err) {
        if (err instanceof ApiError) return next(err);
        if (err.name === 'TokenExpiredError') return next(ApiError.unauthorized('Sesión expirada'));
        if (err.name === 'JsonWebTokenError') return next(ApiError.unauthorized('Token inválido'));
        next(ApiError.unauthorized());
    }
}

function extractBearerToken(req) {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
    return null;
}

module.exports = { requireAuth };
