/**
 * Queries the preview indexer for the deployed OvraBid contract state.
 * Verifies the contract is indexed and readable on-chain.
 */
import { WebSocket } from 'ws';
// @ts-expect-error wallet sync requires WebSocket
globalThis.WebSocket = WebSocket;

import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { pathToFileURL } from 'node:url';
import { ZK_CONFIG_PATH } from '../src/contract-loader';

const ADDRESS = 'e85ec45682de57e3fea9855b0db8918168c4ff87ae429380d862d58fda786bdb';

const provider = indexerPublicDataProvider(
  'https://indexer.preview.midnight.network/api/v4/graphql',
  'wss://indexer.preview.midnight.network/api/v4/graphql/ws',
);

const state = await provider.queryContractState(ADDRESS);
if (!state) {
  console.log('NOT YET INDEXED — the deploy tx may still be propagating.');
  process.exit(1);
}

const artifacts = await import(`${pathToFileURL(ZK_CONFIG_PATH).href}/contract/index.js`);
const ledger = artifacts.ledger(state.data);
const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');
const phaseNames = ['NO_AUCTION', 'COMMIT', 'OPEN', 'CLAIMED'];

console.log('✅ OvraBid is live on preview and indexed by the chain');
console.log(`   address:     ${ADDRESS}`);
console.log(`   phase:       ${phaseNames[ledger.phase]}`);
console.log(`   round:       ${ledger.round}`);
console.log(`   bidCount:    ${ledger.bidCount}`);
console.log(`   bestCommit:  0x${hex(ledger.bestCommit)}`);
console.log(`   bestBid:     ${ledger.bestBid.is_some ? ledger.bestBid.value : '(sealed)'}`);
process.exit(0);
