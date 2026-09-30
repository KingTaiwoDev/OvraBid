/**
 * Queries the network indexer for the deployed OvraBid contract state.
 * Verifies the contract is indexed and readable on-chain.
 *
 * Usage: npm run onchain [-- --network preview|preprod|undeployed]
 * Falls back to the active network in .midnight-state.json, then preview.
 */
import { WebSocket } from 'ws';
// @ts-expect-error wallet sync requires WebSocket
globalThis.WebSocket = WebSocket;

import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { pathToFileURL } from 'node:url';
import { NETWORK_CONFIGS, parseNetworkFlag, resolveNetwork, getDeployment, type NetworkId } from '../src/network';
import { ZK_CONFIG_PATH } from '../src/contract-loader';

// Address may also be overridden via OVRA_CONTRACT_ADDRESS (e.g. to inspect
// someone else's deployment).
const ADDRESS_OVERRIDE = process.env.OVRA_CONTRACT_ADDRESS?.trim();

function pickNetwork(): NetworkId {
  const flag = parseNetworkFlag(process.argv);
  if (flag) return flag;
  const state = resolveNetwork({ argv: [process.argv[0], process.argv[1]] });
  return state.source === 'default' ? 'preview' : state.network;
}

const network = pickNetwork();
const config = NETWORK_CONFIGS[network];
const deployment = getDeployment(network);
const ADDRESS = ADDRESS_OVERRIDE || deployment?.address;

if (!ADDRESS) {
  console.log(`No deployment recorded for ${network}. Deploy first: npm run deploy -- --network ${network}`);
  process.exit(1);
}

const provider = indexerPublicDataProvider(config.indexer, config.indexerWS);

const state = await provider.queryContractState(ADDRESS);
if (!state) {
  console.log(`NOT YET INDEXED on ${network} — the deploy tx may still be propagating.`);
  process.exit(1);
}

const artifacts = await import(`${pathToFileURL(ZK_CONFIG_PATH).href}/contract/index.js`);
const ledger = artifacts.ledger(state.data);
const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');
const phaseNames = ['NO_AUCTION', 'COMMIT', 'OPEN', 'CLAIMED'];

console.log(`✅ OvraBid is live on ${network} and indexed by the chain`);
console.log(`   address:     ${ADDRESS}`);
console.log(`   phase:       ${phaseNames[ledger.phase]}`);
console.log(`   round:       ${ledger.round}`);
console.log(`   bidCount:    ${ledger.bidCount}`);
console.log(`   bestCommit:  0x${hex(ledger.bestCommit)}`);
console.log(`   bestBid:     ${ledger.bestBid.is_some ? ledger.bestBid.value : '(sealed)'}`);
process.exit(0);
