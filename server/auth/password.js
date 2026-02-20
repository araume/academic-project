const crypto = require('crypto');

const KEY_LENGTH = 64;
const COST = 16384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, KEY_LENGTH, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELIZATION,
  });
  return `scrypt:${COST}:${BLOCK_SIZE}:${PARALLELIZATION}:${salt}:${derivedKey.toString('hex')}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.startsWith('scrypt:')) {
    return false;
  }
  const parts = storedHash.split(':');
  if (parts.length !== 6) {
    return false;
  }
  const cost = Number(parts[1]);
  const blockSize = Number(parts[2]);
  const parallel = Number(parts[3]);
  const salt = parts[4];
  const hash = parts[5];
  const derivedKey = crypto.scryptSync(password, salt, KEY_LENGTH, {
    N: cost,
    r: blockSize,
    p: parallel,
  });
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), derivedKey);
}

module.exports = {
  hashPassword,
  verifyPassword,
};
