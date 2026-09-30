/**
 * Loads the compiled OvraBid contract for the browser dApp and joins the
 * deployed preprod instance with the user's private state.
 *
 * The compiled contract module is IMPORTED STATICALLY (bundled into the app
 * by Vite): it lives in web/public/contract/ovraBid/contract/index.js, which
 * scripts/sync-web-assets.mjs refreshes after every `npm run compile`.
 * Bundling — rather than fetching it at runtime as a bare-specifier ESM —
 * guarantees the circuits, midnight-js and the runtime share ONE copy of
 * @midnight-ntwrk/compact-runtime; a second runtime instance breaks
 * `instanceof` checks inside the compiled circuits (verified empirically).
 * Only the zkConfig assets (keys/zkir) are still fetched at runtime, by
 * FetchZkConfigProvider from the same public/ tree.
 */
// @ts-expect-error — compiler-generated module, no type declarations
import * as compiledContractModule from '../../public/contract/ovraBid/contract/index.js';
import { CompiledContract, type Contract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import type { FoundContract } from '@midnight-ntwrk/midnight-js-contracts';
import type { OvraBidProviders } from './providers';
import { PREPROD_CONTRACT_ADDRESS } from './types';
import type { OvraBidPrivateState } from './private-state-types';
import { witnesses } from './witnesses';

export const CONTRACT_NAME = 'ovraBid';
export const PRIVATE_STATE_ID = 'ovraBidPrivateState';

/** The statically-bundled compiled contract module (Contract class + ledger decoder). */
export const CONTRACT_ARTIFACTS = compiledContractModule as unknown as {
  Contract: unknown;
  ledger: (state: unknown) => Record<string, unknown>;
  pureCircuits?: Record<string, unknown>;
};

let cachedArtifacts: { Contract: unknown } | null = null;

export async function loadContractArtifacts(): Promise<{ Contract: unknown }> {
  if (cachedArtifacts) return cachedArtifacts;
  cachedArtifacts = CONTRACT_ARTIFACTS as { Contract: unknown };
  return cachedArtifacts;
}

/**
 * Builds the CompiledContract with the localSecretKey witness wired in. The
 * witness reads the user's secret key from their private state at proving
 * time — it is never a UI input. zkConfig file assets (prover/verifier keys,
 * ZKIR) are served from the same static tree.
 */
export async function buildCompiledContract(): Promise<unknown> {
  const artifacts = await loadContractArtifacts();
  const make = CompiledContract.make as unknown as (
    name: string,
    ctor: unknown,
  ) => unknown;
  const base = make(CONTRACT_NAME, artifacts.Contract);
  const withWitnesses = (
    CompiledContract.withWitnesses as unknown as (c: unknown, w: unknown) => unknown
  )(base, witnesses);
  return (CompiledContract.withCompiledFileAssets as unknown as (
    c: unknown,
    p: string,
  ) => unknown)(withWitnesses, '/contract/ovraBid');
}

export type OvraBidFoundContract = FoundContract<Contract.Any>;

export async function joinContract(
  providers: OvraBidProviders,
  initialPrivateState: OvraBidPrivateState,
): Promise<OvraBidFoundContract> {
  const compiledContract = await buildCompiledContract();
  // Type boundary: the compiled artifact's circuit-id union is structurally
  // compatible with the providers'; midnight-js's conditional generics cannot
  // verify it across the runtime import, so the join is one cast — the same
  // boundary the Node-side deploy script has.
  return findDeployedContract(providers as never, {
    compiledContract,
    contractAddress: PREPROD_CONTRACT_ADDRESS,
    privateStateId: PRIVATE_STATE_ID,
    initialPrivateState,
  } as never) as Promise<OvraBidFoundContract>;
}
