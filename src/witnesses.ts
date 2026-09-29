/*
 * OvraBid private state + witnesses.
 *
 * The only hidden state each participant needs is a 32-byte secret key. It
 * lives in the user's private state store (never on-chain) and is handed to
 * circuits via the `localSecretKey` witness declared in ovraBid.compact.
 */
import { Ledger } from '../contracts/managed/ovraBid/contract/index.js';
import { WitnessContext } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';

export type OvraBidPrivateState = {
  readonly secretKey: Uint8Array;
};

export const createOvraBidPrivateState = (secretKey: Uint8Array): OvraBidPrivateState => ({
  secretKey,
});

export const witnesses = {
  localSecretKey: ({
    privateState,
  }: WitnessContext<Ledger, OvraBidPrivateState>): [
    OvraBidPrivateState,
    Uint8Array,
  ] => [privateState, privateState.secretKey],
};
