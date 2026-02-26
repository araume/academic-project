const { Storage } = require('@google-cloud/storage');
const crypto = require('crypto');

let storageClient;
const signedUrlCache = new Map();
const SIGNED_URL_CACHE_MAX_ENTRIES = 5000;
const SIGNED_URL_REFRESH_BUFFER_MS = 90 * 1000;

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

function normalizeStorageKey(rawKey) {
  if (!rawKey) return null;
  const bucketName = (process.env.GCS_BUCKET || '').trim();
  const original = String(rawKey).trim();
  if (!original) return null;

  let key = original;

  if (key.startsWith('gs://')) {
    key = key.replace(/^gs:\/\//i, '');
    if (bucketName && key.startsWith(`${bucketName}/`)) {
      key = key.slice(bucketName.length + 1);
    }
    return key || null;
  }

  if (/^https?:\/\//i.test(key)) {
    try {
      const parsed = new URL(key);
      const host = (parsed.hostname || '').toLowerCase();
      const pathname = parsed.pathname || '';

      if (host === 'storage.googleapis.com' || host === 'storage.cloud.google.com') {
        const parts = pathname.replace(/^\/+/, '').split('/');
        if (parts.length >= 2 && (!bucketName || parts[0] === bucketName)) {
          const objectKey = decodeURIComponent(parts.slice(1).join('/'));
          return objectKey || null;
        }
      }

      if (host.endsWith('.storage.googleapis.com')) {
        const subdomainBucket = host.slice(0, -'.storage.googleapis.com'.length);
        if (!bucketName || subdomainBucket === bucketName) {
          const objectKey = decodeURIComponent(pathname.replace(/^\/+/, ''));
          return objectKey || null;
        }
      }

      if (pathname.startsWith('/download/storage/v1/b/')) {
        const match = pathname.match(/^\/download\/storage\/v1\/b\/([^/]+)\/o\/(.+)$/i);
        if (match) {
          const urlBucket = decodeURIComponent(match[1]);
          if (!bucketName || urlBucket === bucketName) {
            const objectKey = decodeURIComponent(match[2]);
            return objectKey || null;
          }
        }
      }
    } catch (error) {
      return key;
    }
    return key;
  }

  if (bucketName && key.startsWith(`/${bucketName}/`)) {
    key = key.slice(bucketName.length + 2);
  } else if (bucketName && key.startsWith(`${bucketName}/`)) {
    key = key.slice(bucketName.length + 1);
  }

  if (key.startsWith('/')) {
    key = key.slice(1);
  }

  return key || null;
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
  const normalized = normalizeStorageKey(key);
  if (!normalized) return;
  const bucket = getBucket();
  await bucket.file(normalized).delete({ ignoreNotFound: true });
}

async function getSignedUrl(key, ttlMinutes = 60) {
  const normalized = normalizeStorageKey(key);
  if (!normalized) {
    throw new Error('Missing storage object key for signed URL generation.');
  }
  const ttl = Number(ttlMinutes) || 60;
  const cacheKey = `${ttl}:${normalized}`;
  const now = Date.now();
  const cached = signedUrlCache.get(cacheKey);
  if (cached && cached.expiresAt - now > SIGNED_URL_REFRESH_BUFFER_MS) {
    return cached.url;
  }

  const bucket = getBucket();
  const expires = now + ttl * 60 * 1000;
  const [url] = await bucket.file(normalized).getSignedUrl({
    version: 'v4',
    action: 'read',
    expires,
  });

  signedUrlCache.set(cacheKey, { url, expiresAt: expires });
  if (signedUrlCache.size > SIGNED_URL_CACHE_MAX_ENTRIES) {
    const oldestKey = signedUrlCache.keys().next().value;
    if (oldestKey) signedUrlCache.delete(oldestKey);
  }

  return url;
}

async function objectExists(key) {
  const normalized = normalizeStorageKey(key);
  if (!normalized) return false;
  const bucket = getBucket();
  const [exists] = await bucket.file(normalized).exists();
  return exists;
}

module.exports = {
  uploadToStorage,
  deleteFromStorage,
  getSignedUrl,
  objectExists,
  normalizeStorageKey,
  async downloadFromStorage(key) {
    const normalized = normalizeStorageKey(key);
    if (!normalized) return null;
    const bucket = getBucket();
    const [buffer] = await bucket.file(normalized).download();
    return buffer;
  },
};
