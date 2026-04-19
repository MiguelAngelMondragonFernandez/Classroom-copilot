const { google } = require('googleapis');

function getClassroomClient(authClient) {
    return google.classroom({ version: 'v1', auth: authClient });
}

module.exports = { getClassroomClient };
