const { google } = require('googleapis');

function getDriveClient(authClient) {
    return google.drive({ version: 'v3', auth: authClient });
}

function getDocsClient(authClient) {
    return google.docs({ version: 'v1', auth: authClient });
}

function getSlidesClient(authClient) {
    return google.slides({ version: 'v1', auth: authClient });
}

module.exports = { getDriveClient, getDocsClient, getSlidesClient };
