/**
 * Loads the compiled OvraBid contract artifacts from contracts/managed/ovraBid
 * and builds the Compact `CompiledContract` used by deploy / CLI / e2e scripts.
 */
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import { witnesses } from './witnesses.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ZK_CONFIG_PATH = path.resolve(__dirname, '..', 'contracts', 'managed', 'ovraBid');

/** OvraBid's contract name as passed to CompiledContract.make. */
export const CONTRACT_NAME = 'ovraBid';

/** Identifier under which OvraBid private state (secret keys) is stored. */
export const PRIVATE_STATE_ID = 'ovraBidPrivateState';

export async function loadCompiledContract(): Promise<unknown> {
  const contractPath = path.join(ZK_CONFIG_PATH, 'contract', 'index.js');
  const artifacts = await import(pathToFileURL(contractPath).href);
  // effect-ts's conditional generics cannot infer types from pre-built
  // witness objects, so the combinators are applied directly (data-first)
  // with a single untyped boundary — same runtime shape as the scaffold.
  const base = CompiledContract.make(CONTRACT_NAME, artifacts.Contract);
  const withWitnesses = (CompiledContract.withWitnesses as any)(base, witnesses);
  return (CompiledContract.withCompiledFileAssets as any)(withWitnesses, ZK_CONFIG_PATH);
}
