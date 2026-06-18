import crypto from 'crypto';

/**
 * Encrypts a plain text string using an RSA public key.
 * @param text The plain text to encrypt
 * @param publicKeyPem The PEM encoded public key
 * @returns Base64 encoded ciphertext
 */
export function encrypt(text: string, publicKeyPem: string): string {
  if (!text || !publicKeyPem) return '';
  const buffer = Buffer.from(text, 'utf8');
  const encrypted = crypto.publicEncrypt({
    key: publicKeyPem,
    padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: 'sha256'
  }, buffer);
  return encrypted.toString('base64');
}
