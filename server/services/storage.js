const { Storage } = require('@google-cloud/storage');
const crypto = require('crypto');

let storageClient;

function getStorageClient() {
  if (storageClient) {
    return storageClient;
  }
  const json = process.env.GCS_SERVICE_ACCOUNT_JSON;
  if (json) {
    const credentials = JSON.parse(json);
    storageClient = new Storage({ credentials, projectId: credentials.project_id });
  } else {
    storageClient = new Storage();
  }
  return storageClient;
}

function getBucket() {
  const bucketName = process.env.GCS_BUCKET;
  if (!bucketName) {
    throw new Error('Missing GCS_BUCKET in env.');
  }
  const storage = getStorageClient();
  return storage.bucket(bucketName);
}

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function buildObjectKey(prefix, filename) {
  const safe = sanitizeFilename(filename);
  const nonce = crypto.randomBytes(6).toString('hex');
  const timestamp = Date.now();
  return `${prefix}/${timestamp}-${nonce}-${safe}`;
}

async function uploadToStorage({ buffer, filename, mimeType, prefix }) {
  const bucket = getBucket();
  const key = buildObjectKey(prefix || 'uploads', filename);
  const file = bucket.file(key);

  await file.save(buffer, {
    contentType: mimeType || 'application/octet-stream',
    resumable: false,
    metadata: {
      cacheControl: 'private, max-age=0, no-transform',
    },
  });

  return { key };
}

async function deleteFromStorage(key) {
  if (!key) return;
  const bucket = getBucket();
  await bucket.file(key).delete({ ignoreNotFound: true });
}

async function getSignedUrl(key, ttlMinutes = 60) {
  const bucket = getBucket();
  const expires = Date.now() + ttlMinutes * 60 * 1000;
  const [url] = await bucket.file(key).getSignedUrl({
    version: 'v4',
    action: 'read',
    expires,
  });
  return url;
}

module.exports = {
  uploadToStorage,
  deleteFromStorage,
  getSignedUrl,
  async downloadFromStorage(key) {
    if (!key) return null;
    const bucket = getBucket();
    const [buffer] = await bucket.file(key).download();
    return buffer;
  },
};
