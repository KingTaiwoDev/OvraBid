/**
 * Witness wiring for the browser: identical semantics to src/witnesses.ts.
 * midnight-js calls the witness during transaction construction; it reads the
 * secret key from the user's private state (never from UI input) and returns
 * it into the circuit only.
 *
 * Ledger is typed as unknown: it only parameterizes WitnessContext and the
 * compiled module is loaded at runtime from static assets.
 */
import type { WitnessContext } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import type { OvraBidPrivateState } from './private-state-types';

export const witnesses = {
  localSecretKey: ({
    privateState,
  }: WitnessContext<unknown, OvraBidPrivateState>): [OvraBidPrivateState, Uint8Array] => [
    privateState,
    privateState.secretKey,
  ],
};
