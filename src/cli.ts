/**
 * Interactive CLI for the deployed OvraBid sealed-bid auction.
 *
 * Reads the deployment recorded by the deploy script, reconnects with the
 * participant secret key derived from the same wallet seed, and offers the
 * full auction lifecycle as menu actions.
 */
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { WebSocket } from 'ws';
import { Buffer } from 'buffer';

import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';

import { resolveNetwork, getOrCreateWallet, formatWalletBackupNotice, getDeployment } from './network';
import { createWallet, persistWalletState, unshieldedToken } from './wallet';
import { ZK_CONFIG_PATH, CONTRACT_NAME, PRIVATE_STATE_ID } from './contract-loader';
import { createOvraBidPrivateState } from './witnesses';
import { deriveSecretKey } from './derive-secret-key';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';

// @ts-expect-error Required for wallet sync
globalThis.WebSocket = WebSocket;

const { network, config: networkConfig } = resolveNetwork();
const WALLET = getOrCreateWallet(network);
const SEED = WALLET.seed;
{
  const notice = formatWalletBackupNotice(WALLET, network);
  if (notice) console.log(notice);
}

async function createProviders(walletCtx: any) {
  const privateStatePassword =
    process.env.PRIVATE_STATE_PASSWORD?.trim() || 'Local-Devnet-Development-Placeholder-1';

  const walletProvider = {
    getCoinPublicKey: () => walletCtx.shieldedSecretKeys.coinPublicKey,
    getEncryptionPublicKey: () => walletCtx.shieldedSecretKeys.encryptionPublicKey,
    async balanceTx(tx: any, ttl?: Date) {
      const recipe = await walletCtx.wallet.balanceUnboundTransaction(
        tx,
        { shieldedSecretKeys: walletCtx.shieldedSecretKeys, dustSecretKey: walletCtx.dustSecretKey },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) },
      );
      return walletCtx.wallet.finalizeRecipe(recipe);
    },
    submitTx: (tx: any) => walletCtx.wallet.submitTransaction(tx) as any,
  };

  const zkConfigProvider = new NodeZkConfigProvider(ZK_CONFIG_PATH);
  const accountId = walletCtx.unshieldedKeystore.getBech32Address().toString();

  return {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: 'ovrabid-state',
      accountId,
      privateStoragePasswordProvider: () => privateStatePassword,
    }),
    publicDataProvider: indexerPublicDataProvider(networkConfig.indexer, networkConfig.indexerWS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(networkConfig.proofServer, zkConfigProvider),
    walletProvider,
    midnightProvider: walletProvider,
  };
}

function formatLedger(ledger: any): string {
  const buf = (b: Uint8Array) => Buffer.from(b).toString('hex');
  const phaseNames = ['NO_AUCTION', 'COMMIT', 'OPEN', 'CLAIMED'];
  const bestBid = ledger.bestBid.is_some ? `${ledger.bestBid.value} tNight` : '(sealed)';
  return [
    `  phase:        ${phaseNames[ledger.phase]} (${ledger.phase})`,
    `  round:        ${ledger.round}`,
    `  bidCount:     ${ledger.bidCount}`,
    `  sellerCommit: 0x${buf(ledger.sellerCommit)}`,
    `  bestCommit:   0x${buf(ledger.bestCommit)}`,
    `  bestBid:      ${bestBid}`,
    `  winnerSKHash: 0x${buf(ledger.winnerSKHash)}`,
  ].join('\n');
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                   OvraBid — sealed-bid auction               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const rl = createInterface({ input: stdin, output: stdout });

  const deployment = getDeployment(network);
  if (!deployment) {
    console.error(`No deploy on file for network ${network}. Run \`npm run deploy -- --network ${network}\` first.`);
    process.exit(1);
  }
  console.log(`  Contract: ${deployment.address}`);
  console.log(`  Network:  ${network}\n`);

  try {
    console.log('  Connecting to wallet...');
    const walletCtx = await createWallet({ network, networkConfig, seed: SEED });

    console.log('  Syncing with network...');
    console.log('  ℹ  This may take several minutes. RPC disconnection messages during sync are normal.\n');
    const syncStart = Date.now();
    const syncInterval = setInterval(() => {
      const elapsed = Math.round((Date.now() - syncStart) / 1000);
      process.stdout.write(`\r  ⏳ Still syncing... (${elapsed}s elapsed)   `);
    }, 5000);
    const state = await walletCtx.wallet.waitForSyncedState();
    clearInterval(syncInterval);
    process.stdout.write('\r  ✓ Synced with network.                                      \n');
    await persistWalletState(network, walletCtx);

    const balance = state.unshielded.balances[unshieldedToken().raw] ?? 0n;
    console.log(`  Balance: ${balance.toLocaleString()} tNight\n`);

    if (balance === 0n && network !== 'undeployed' && networkConfig.faucet) {
      console.log('  ⚠ Wallet has no tNight. Fund it from the faucet to send transactions:');
      console.log(`     ${networkConfig.faucet}`);
      console.log(`     Wallet address: ${walletCtx.unshieldedKeystore.getBech32Address()}\n`);
    }

    console.log('  Connecting to contract...');
    const providers = await createProviders(walletCtx);
    const deployed: any = await findDeployedContract(providers, {
      compiledContract: (await loadCompiled()) as any,
      contractAddress: deployment.address,
      privateStateId: PRIVATE_STATE_ID,
      initialPrivateState: createOvraBidPrivateState(deriveSecretKey(SEED)),
    });
    console.log('  ✅ Connected!\n');

    let running = true;
    while (running) {
      console.log('─── Menu ───────────────────────────────────────────────────────');
      console.log('  1. Read auction state');
      console.log('  2. Start auction (seller)');
      console.log('  3. Commit sealed bid (amount + private salt)');
      console.log('  4. End commit phase (seller)');
      console.log('  5. Open best bid (reveal amount + salt)');
      console.log('  6. Register as winner');
      console.log('  7. Claim win');
      console.log('  8. Settle auction (seller)');
      console.log('  9. Check wallet balance');
      console.log('  10. Exit\n');

      const choice = await rl.question('  Your choice: ');

      try {
        switch (choice.trim()) {
          case '1': {
            const cs = await providers.publicDataProvider.queryContractState(deployment.address);
            if (cs) {
              const artifacts = await loadArtifacts();
              const ledger = artifacts.ledger(cs.data);
              console.log('\n' + formatLedger(ledger) + '\n');
            } else {
              console.log('\n  No contract state found.\n');
            }
            break;
          }
          case '2':
            console.log('\n  Submitting (30-60s)...');
            await deployed.callTx.startAuction();
            console.log('  ✅ Auction started — phase is now COMMIT\n');
            break;
          case '3': {
            const amount = await rl.question('  Bid amount (tNight): ');
            const amt = BigInt(amount.trim());
            // The salt is generated locally and never revealed to the chain.
            const salt = new Uint8Array(32);
            crypto.getRandomValues(salt);
            console.log('\n  Submitting sealed bid (salt stays private)...');
            await deployed.callTx.commitBid(amt, salt);
            console.log('  ✅ Bid committed. Keep this salt to reveal later:');
            console.log(`     0x${Buffer.from(salt).toString('hex')}\n`);
            break;
          }
          case '4':
            console.log('\n  Submitting...');
            await deployed.callTx.endCommitPhase();
            console.log('  ✅ Commit phase ended — phase is now OPEN\n');
            break;
          case '5': {
            const amount = await rl.question('  Bid amount to reveal: ');
            const saltHex = (await rl.question('  Salt (0x...): ')).trim().replace(/^0x/, '');
            if (!/^[0-9a-fA-F]{64}$/.test(saltHex)) throw new Error('Salt must be 32 bytes (64 hex chars)');
            console.log('\n  Submitting reveal...');
            await deployed.callTx.openBestBid(BigInt(amount.trim()), Uint8Array.from(Buffer.from(saltHex, 'hex')));
            console.log('  ✅ Best bid opened on-chain\n');
            break;
          }
          case '6': {
            const amount = await rl.question('  Bid amount to register: ');
            const saltHex = (await rl.question('  Salt (0x...): ')).trim().replace(/^0x/, '');
            if (!/^[0-9a-fA-F]{64}$/.test(saltHex)) throw new Error('Salt must be 32 bytes (64 hex chars)');
            console.log('\n  Submitting...');
            await deployed.callTx.registerAsWinner(BigInt(amount.trim()), Uint8Array.from(Buffer.from(saltHex, 'hex')));
            console.log('  ✅ Registered as winner (key hash on-chain, key stays private)\n');
            break;
          }
          case '7': {
            console.log('\n  Submitting claim...');
            const tx = await deployed.callTx.claimWin();
            console.log(`  ✅ Win claimed. Price: ${tx.public.result ?? '(see state)'} — check option 1\n`);
            break;
          }
          case '8':
            console.log('\n  Submitting settle...');
            await deployed.callTx.settle();
            console.log('  ✅ Auction settled — phase is now NO_AUCTION\n');
            break;
          case '9': {
            const s = await walletCtx.wallet.waitForSyncedState();
            console.log(`\n  tNight: ${(s.unshielded.balances[unshieldedToken().raw] ?? 0n).toLocaleString()}`);
            console.log(`  DUST:   ${s.dust.balance(new Date()).toLocaleString()}\n`);
            break;
          }
          case '10':
            running = false;
            console.log('\n  👋 Goodbye!\n');
            break;
          default:
            console.log('\n  ❌ Invalid choice. Please enter 1-10.\n');
        }
      } catch (error) {
        console.error('\n  ❌ Failed:', error instanceof Error ? error.message : error, '\n');
      }
    }

    await persistWalletState(network, walletCtx);
    await walletCtx.wallet.stop();
  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error);
  } finally {
    rl.close();
  }
}

async function loadCompiled() {
  const { loadCompiledContract } = await import('./contract-loader');
  return loadCompiledContract();
}

async function loadArtifacts() {
  const { pathToFileURL } = await import('node:url');
  const { ZK_CONFIG_PATH } = await import('./contract-loader');
  return import(`${pathToFileURL(ZK_CONFIG_PATH).href}/contract/index.js`);
}

main().catch(console.error);
