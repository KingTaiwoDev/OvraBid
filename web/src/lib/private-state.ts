/**
 * OvraBid private state for the browser dApp.
 *
 * Mirrors src/witnesses.ts: each participant's only hidden state is a 32-byte
 * secret key, stored in the browser's private-state store (encrypted
 * IndexedDB via levelPrivateStateProvider) and handed to circuits through the
 * `localSecretKey` witness. It never leaves the browser and never appears in
 * any transaction payload.
 */
import { randomBytes } from './random';
import type { OvraBidPrivateState } from './private-state-types';

export type { OvraBidPrivateState } from './private-state-types';

export const createOvraBidPrivateState = (secretKey: Uint8Array): OvraBidPrivateState => ({
  secretKey,
});

/** A fresh random key for first-time participants. */
export const freshSecretKey = (): Uint8Array => randomBytes(32);
