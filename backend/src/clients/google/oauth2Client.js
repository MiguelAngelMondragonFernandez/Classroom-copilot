const { google } = require('googleapis');

let oauth2Client = null;

const SCOPES = [
    'https://www.googleapis.com/auth/classroom.courses.readonly',
    'https://www.googleapis.com/auth/classroom.coursework.me',
    'https://www.googleapis.com/auth/classroom.coursework.students',
    'https://www.googleapis.com/auth/classroom.topics',
    'https://www.googleapis.com/auth/classroom.courseworkmaterials',
    'https://www.googleapis.com/auth/drive.file',
    'openid',
    'email',
    'profile',
];

function getOAuth2Client() {
    if (!oauth2Client) {
        oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );
    }
    return oauth2Client;
}

function buildAuthenticatedClient(accessToken, refreshToken) {
    const client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );
    client.setCredentials({ access_token: accessToken, refresh_token: refreshToken });
    return client;
}

function getAuthUrl(state) {
    return getOAuth2Client().generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent',
        state,
    });
}

module.exports = { getOAuth2Client, buildAuthenticatedClient, getAuthUrl, SCOPES };
