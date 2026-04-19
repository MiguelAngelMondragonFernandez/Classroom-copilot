const authService = require('./auth.service');
const logger = require('../../utils/logger');

const COOKIE_OPTS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
};

async function login(req, res, next) {
    try {
        const state = Math.random().toString(36).substring(2);
        const url = authService.getLoginUrl(state);
        res.redirect(url);
    } catch (err) {
        next(err);
    }
}

async function callback(req, res, next) {
    try {
        const { code } = req.query;
        if (!code) return res.status(400).json({ success: false, error: 'Código de autorización faltante' });

        const { user, sessionToken, accessToken } = await authService.handleCallback(code);

        res.cookie('session_token', sessionToken, COOKIE_OPTS);

        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        res.redirect(`${frontendUrl}/auth/success?token=${sessionToken}&access_token=${accessToken}`);
    } catch (err) {
        logger.error({ err }, 'Error en OAuth callback');
        next(err);
    }
}

async function refreshToken(req, res, next) {
    try {
        const accessToken = await authService.refreshAccessToken(req.user.id);
        res.json({ success: true, data: { access_token: accessToken } });
    } catch (err) {
        next(err);
    }
}

async function getMe(req, res, next) {
    try {
        const user = await authService.getUserById(req.user.id);
        const { refresh_token, ...safeUser } = user;
        res.json({ success: true, data: safeUser });
    } catch (err) {
        next(err);
    }
}

async function logout(req, res) {
    res.clearCookie('session_token', { ...COOKIE_OPTS, maxAge: 0 });
    res.json({ success: true, message: 'Sesión cerrada' });
}

module.exports = { login, callback, refreshToken, getMe, logout };
