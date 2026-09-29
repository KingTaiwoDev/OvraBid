import { createHash } from 'node:crypto';

/**
 * Derives a participant's 32-byte OvraBid secret key from a Midnight wallet
 * seed. Deterministic, so the deploy script and the CLI (separate processes)
 * derive the identical key from the same wallet — the key itself never
 * leaves the private-state store.
 */
export function deriveSecretKey(seedHex: string): Uint8Array {
  return new Uint8Array(createHash('sha256').update(Buffer.from(seedHex, 'hex')).digest());
}
