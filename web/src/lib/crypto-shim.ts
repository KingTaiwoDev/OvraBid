// @ts-expect-error crypto-browserify has no type declarations
import cryptoBrowserify from 'crypto-browserify';

/**
 * Browser shim for Node's `crypto` module, following the official
 * midnight-wallet-dapp recipe: crypto-browserify re-exported as named and
 * default exports so bundler-externalized `import crypto from 'crypto'`
 * call sites keep working in the browser.
 */
const {
  Cipher,
  Cipheriv,
  Decipher,
  Decipheriv,
  DiffieHellman,
  DiffieHellmanGroup,
  Hash,
  Hmac,
  Sign,
  Verify,
  constants,
  createCipheriv,
  createDecipheriv,
  createDiffieHellman,
  createDiffieHellmanGroup,
  createECDH,
  createHash,
  createHmac,
  createSign,
  createVerify,
  getCiphers,
  getDiffieHellman,
  getHashes,
  listCiphers,
  pbkdf2,
  pbkdf2Sync,
  privateDecrypt,
  privateEncrypt,
  pseudoRandomBytes,
  publicDecrypt,
  publicEncrypt,
  randomBytes,
  randomFill,
  randomFillSync,
} = cryptoBrowserify;

export {
  Cipher,
  Cipheriv,
  Decipher,
  Decipheriv,
  DiffieHellman,
  DiffieHellmanGroup,
  Hash,
  Hmac,
  Sign,
  Verify,
  constants,
  createCipheriv,
  createDecipheriv,
  createDiffieHellman,
  createDiffieHellmanGroup,
  createECDH,
  createHash,
  createHmac,
  createSign,
  createVerify,
  getCiphers,
  getDiffieHellman,
  getHashes,
  listCiphers,
  pbkdf2,
  pbkdf2Sync,
  privateDecrypt,
  privateEncrypt,
  pseudoRandomBytes,
  publicDecrypt,
  publicEncrypt,
  randomBytes,
  randomFill,
  randomFillSync,
};

export default cryptoBrowserify;
