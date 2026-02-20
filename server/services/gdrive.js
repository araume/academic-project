const { google } = require('googleapis');
const { Readable } = require('stream');

let driveClient;

function buildDriveClient() {
  const clientId = process.env.GDRIVE_CLIENT_ID;
  const clientSecret = process.env.GDRIVE_CLIENT_SECRET;
  const redirectUri = process.env.GDRIVE_REDIRECT_URI;
  const refreshToken = process.env.GDRIVE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !redirectUri || !refreshToken) {
    throw new Error('Missing Google Drive credentials in env.');
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  driveClient = google.drive({ version: 'v3', auth: oauth2Client });
  return driveClient;
}

function getDriveClient() {
  if (!driveClient) {
    return buildDriveClient();
  }
  return driveClient;
}

async function uploadToDrive({ buffer, filename, mimeType, folderId, makePublic }) {
  const drive = getDriveClient();
  const fileMetadata = {
    name: filename,
    parents: folderId ? [folderId] : undefined,
  };

  const media = {
    mimeType,
    body: Readable.from(buffer),
  };

  const createResponse = await drive.files.create({
    requestBody: fileMetadata,
    media,
    fields: 'id, webViewLink, webContentLink',
  });

  const fileId = createResponse.data.id;
  if (makePublic && fileId) {
    await drive.permissions.create({
      fileId,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    });
  }

  return {
    id: fileId,
    webViewLink: createResponse.data.webViewLink,
    webContentLink: createResponse.data.webContentLink,
  };
}

module.exports = {
  uploadToDrive,
  async deleteFromDrive(fileId) {
    const drive = getDriveClient();
    if (!fileId) {
      return;
    }
    await drive.files.delete({ fileId });
  },
};
