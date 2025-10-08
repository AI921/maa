// generate_turn_credentials.js
const crypto = require('crypto');

function genCred(sharedSecret, ttlSeconds = 3600) {
  const expiry = Math.floor(Date.now() / 1000) + ttlSeconds;
  const rand = crypto.randomBytes(4).toString('hex');
  const username = `${expiry}:${rand}`;
  const hmac = crypto.createHmac('sha1', sharedSecret);
  hmac.update(username);
  const credential = hmac.digest('base64');
  return { username, credential, ttl: ttlSeconds };
}

const secret = process.argv[2] || process.env.TURN_SHARED_SECRET;
const ttl = parseInt(process.argv[3] || '3600', 10);
if (!secret) {
  console.error('Usage: node generate_turn_credentials.js <shared_secret> [ttl_seconds]');
  process.exit(2);
}
console.log(genCred(secret, ttl));
