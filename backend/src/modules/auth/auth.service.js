const jwt = require('jsonwebtoken');
const { google } = require('googleapis');
const { getOAuth2Client, getAuthUrl, buildAuthenticatedClient } = require('../../clients/google/oauth2Client');
const authRepo = require('./auth.repository');
const ApiError = require('../../utils/ApiError');

function generateSessionToken(user) {
    return jwt.sign(
        { id: user.id, googleId: user.google_id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
}

function getLoginUrl(state) {
    return getAuthUrl(state);
}

async function handleCallback(code) {
    const client = getOAuth2Client();
    const { tokens } = await client.getToken(code);

    client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const { data: profile } = await oauth2.userinfo.get();

    const user = await authRepo.upsertUser({
        googleId: profile.id,
        email: profile.email,
        displayName: profile.name,
        photoUrl: profile.picture,
        refreshToken: tokens.refresh_token,
    });

    const sessionToken = generateSessionToken(user);
    return { user, sessionToken, accessToken: tokens.access_token };
}

async function refreshAccessToken(userId) {
    const user = await authRepo.findById(userId);
    if (!user || !user.refresh_token) throw ApiError.unauthorized('No hay sesión activa');

    const client = buildAuthenticatedClient(null, user.refresh_token);
    const { credentials } = await client.refreshAccessToken();

    if (credentials.refresh_token) {
        await authRepo.updateRefreshToken(userId, credentials.refresh_token);
    }
    return credentials.access_token;
}

async function getUserById(id) {
    return authRepo.findById(id);
}

module.exports = { getLoginUrl, handleCallback, refreshAccessToken, getUserById, generateSessionToken };
