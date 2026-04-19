const crypto = require('crypto');

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

function getKey() {
    const key = process.env.ENCRYPTION_KEY || '';
    return Buffer.from(key.padEnd(32, '0').substring(0, 32));
}

function encrypt(text) {
    if (!text) return null;
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
    const encrypted = Buffer.concat([cipher.update(String(text)), cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(encryptedText) {
    if (!encryptedText) return null;
    try {
        const [ivHex, encryptedHex] = encryptedText.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const encryptedBuffer = Buffer.from(encryptedHex, 'hex');
        const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
        const decrypted = Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]);
        return decrypted.toString();
    } catch {
        return null;
    }
}

module.exports = { encrypt, decrypt };
