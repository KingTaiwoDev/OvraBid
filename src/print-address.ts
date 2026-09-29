/**
 * Prints the preview-network wallet address (local derivation only, no sync).
 * Used to hand the user a fundable address while a deploy syncs in the background.
 */
import { WebSocket } from 'ws';
// @ts-expect-error wallet sync requires WebSocket
globalThis.WebSocket = WebSocket;

import { resolveNetwork, getOrCreateWallet, NETWORK_CONFIGS, formatWalletBackupNotice } from './network';
import { setNetworkId, getNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { createKeystore } from '@midnight-ntwrk/wallet-sdk';

const { network, config } = resolveNetwork();
if (!config.faucet) {
  console.error('Active network has no faucet (local devnet). Run with --network preview.');
  process.exit(1);
}
setNetworkId(config.networkId);

const wallet = getOrCreateWallet(network);
const notice = formatWalletBackupNotice(wallet, network);
if (notice) console.log(notice);

// Same derivation path as src/wallet.ts: NightExternal role keys → keystore.
const { HDWallet, Roles } = await import('@midnight-ntwrk/wallet-sdk');
const hd = HDWallet.fromSeed(Buffer.from(wallet.seed, 'hex'));
if (hd.type !== 'seedOk') throw new Error('invalid seed');
const result = hd.hdWallet
  .selectAccount(0)
  .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
  .deriveKeysAt(0);
if (result.type !== 'keysDerived') throw new Error('Key derivation failed');
hd.hdWallet.clear();
const keystore = createKeystore(result.keys[Roles.NightExternal], getNetworkId());

console.log(`Network: ${network}`);
console.log(`Faucet:  ${config.faucet}`);
console.log(`Wallet address: ${keystore.getBech32Address()}`);
process.exit(0);
