import crypto from 'node:crypto';

/**
 * Generates a 2048-bit RSA key pair in PEM format.
 * @returns {{ publicKey: string, privateKey: string }}
 */
export function generateKeys() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });
  return { publicKey, privateKey };
}

/**
 * Encrypts a plain text string using an RSA public key.
 * @param {string} text 
 * @param {string} publicKeyPem 
 * @returns {string} Base64 encoded ciphertext
 */
export function encrypt(text, publicKeyPem) {
  if (!text || !publicKeyPem) return '';
  const buffer = Buffer.from(text, 'utf8');
  const encrypted = crypto.publicEncrypt({
    key: publicKeyPem,
    padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: 'sha256'
  }, buffer);
  return encrypted.toString('base64');
}

/**
 * Decrypts a base64 encoded ciphertext using an RSA private key.
 * @param {string} ciphertextBase64 
 * @param {string} privateKeyPem 
 * @returns {string} Decrypted plain text
 */
export function decrypt(ciphertextBase64, privateKeyPem) {
  if (!ciphertextBase64 || !privateKeyPem) return '';
  const buffer = Buffer.from(ciphertextBase64, 'base64');
  const decrypted = crypto.privateDecrypt({
    key: privateKeyPem,
    padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: 'sha256'
  }, buffer);
  return decrypted.toString('utf8');
}
