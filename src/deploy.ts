/**
 * Deploy the OvraBid sealed-bid auction contract to a Midnight network.
 *
 * Flow: wallet setup → sync → faucet wait (public networks) → DUST setup →
 * proof-server check → deploy. Derived from the create-mn-app hello-world
 * deploy script, adapted for OvraBid's witnessed private state.
 *
 * Usage: npm run deploy [-- --network preview|preprod|undeployed]
 */
import { WebSocket } from 'ws';
import * as Rx from 'rxjs';

import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';

import { resolveNetwork, getOrCreateWallet, formatWalletBackupNotice, recordDeployment } from './network';
import { createWallet, persistWalletState, unshieldedToken, type WalletContext } from './wallet';
import { ZK_CONFIG_PATH, CONTRACT_NAME, PRIVATE_STATE_ID, loadCompiledContract } from './contract-loader';
import { createOvraBidPrivateState } from './witnesses';
import { deriveSecretKey } from './derive-secret-key';

// @ts-expect-error Required for wallet sync
globalThis.WebSocket = WebSocket;

const DUST_WAIT_TIMEOUT_MS = 5 * 60 * 1000;
const RETRY_DELAY_MS = 5000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Symbol Effect uses to attach its `Cause` tree to a FiberFailure. */
const FIBER_FAILURE_CAUSE = Symbol.for('effect/Runtime/FiberFailure/Cause');

/**
 * Flatten every message reachable from an error into one string. Covers the
 * standard Error `cause` chain AND Effect's FiberFailure `Cause` tree — the
 * wallet SDK wraps submission rejections in a FiberFailure whose real error
 * (e.g. the WebSocket disconnect) lives under `Cause.error`/`Cause.defect`,
 * not the `cause` property. Without the symbol walk, the only message visible
 * is the generic "Transaction submission error".
 */
function errorMessage(err: unknown): string {
  const parts: string[] = [];
  const seen = new Set<unknown>();
  const visit = (node: unknown, depth: number): void => {
    if (!node || depth > 6 || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    const msg = (node as { message?: unknown }).message;
    if (typeof msg === 'string' && msg) parts.push(msg);
    const obj = node as Record<string, unknown>;
    visit(obj.cause, depth + 1); // Error cause chain
    visit(obj.error, depth + 1); // Effect Cause.Fail
    visit(obj.defect, depth + 1); // Effect Cause.Die
    visit(obj.left, depth + 1); // Effect Cause.Sequential / Parallel
    visit(obj.right, depth + 1);
    visit((node as Record<PropertyKey, unknown>)[FIBER_FAILURE_CAUSE], depth + 1);
  };
  visit(err, 0);
  return parts.join(' | ');
}

/**
 * Public-network RPCs occasionally drop WebSocket connections mid-submission
 * (seen on preprod: "disconnected from wss://rpc...: 1000:: Normal Closure").
 * These are safe to retry; circuit/assertion errors from the chain are not.
 */
const TRANSIENT_RPC_PATTERNS = [
  'disconnected from',
  'normal closure',
  'econnreset',
  'econnrefused',
  'etimedout',
  'und_err',
  'socket hang up',
];

function isTransientRpcError(err: unknown): boolean {
  const msg = errorMessage(err).toLowerCase();
  return TRANSIENT_RPC_PATTERNS.some((p) => msg.includes(p));
}

const { network, config: networkConfig } = resolveNetwork();
const WALLET = getOrCreateWallet(network);
const SEED = WALLET.seed;
{
  const notice = formatWalletBackupNotice(WALLET, network);
  if (notice) console.log(notice);
}

async function waitForProofServer(maxAttempts = 60, delayMs = 2000): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await fetch(networkConfig.proofServer, { method: 'GET', signal: AbortSignal.timeout(3000) });
      return true;
    } catch (err: any) {
      const code = err?.cause?.code || err?.code || '';
      if (code !== 'ECONNREFUSED' && code !== 'UND_ERR_CONNECT_TIMEOUT' && code !== 'UND_ERR_SOCKET') {
        return true;
      }
    }
    if (attempt < maxAttempts) {
      process.stdout.write(`\r  Waiting for proof server... (${attempt}/${maxAttempts})   `);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return false;
}

async function createProviders(walletCtx: WalletContext) {
  // The SDK requires the private-state password to be at least 16 characters.
  // Override with PRIVATE_STATE_PASSWORD outside of local development.
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

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log(`║  Deploy OvraBid (sealed-bid auction) to ${network}`);
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const compiledContract = await loadCompiledContract();

  console.log('─── Wallet setup ───────────────────────────────────────────────\n');
  console.log('  Creating wallet...');
  const walletCtx = await createWallet({ network, networkConfig, seed: SEED });

  console.log('  Syncing with network...');
  console.log('  ℹ  This may take several minutes depending on network size.');
  console.log('     RPC disconnection messages during sync are normal and can be safely ignored.\n');
  const syncStart = Date.now();
  const syncInterval = setInterval(() => {
    const elapsed = Math.round((Date.now() - syncStart) / 1000);
    process.stdout.write(`\r  ⏳ Still syncing... (${elapsed}s elapsed)   `);
  }, 5000);
  const state = await walletCtx.wallet.waitForSyncedState();
  clearInterval(syncInterval);
  process.stdout.write('\r  ✓ Synced with network.                                      \n');

  await persistWalletState(network, walletCtx);

  const address = walletCtx.unshieldedKeystore.getBech32Address();
  let balance = state.unshielded.balances[unshieldedToken().raw] ?? 0n;
  console.log(`\n  Wallet Address: ${address}`);
  console.log(`  Balance: ${balance.toLocaleString()} tNight\n`);

  if (network === 'undeployed' && balance === 0n) {
    console.error(
      '\n❌ Genesis-seed wallet has zero NIGHT. The devnet preset may not have minted to it.\n' +
        '   Check `docker compose ps` and `docker compose logs node`. Then `docker compose down -v` and retry.\n',
    );
    await walletCtx.wallet.stop();
    process.exit(1);
  }

  // Faucet poll for public networks: pause here so the wallet can be funded.
  if (network !== 'undeployed' && networkConfig.faucet) {
    const initialBalance = await Rx.firstValueFrom(
      walletCtx.wallet.state().pipe(Rx.filter((s) => s.isSynced)),
    );
    const initialTNight = initialBalance.unshielded.balances[unshieldedToken().raw] ?? 0n;
    if (initialTNight === 0n) {
      console.log('─── Fund Wallet ────────────────────────────────────────────────\n');
      console.log(`  Wallet address: ${address}`);
      console.log(`  Faucet:         ${networkConfig.faucet}`);
      console.log('');
      console.log('  Waiting for tNIGHT to arrive (poll every 10s)...');
      const rawTimeout = Number(process.env.MIDNIGHT_FAUCET_TIMEOUT_MS);
      const timeoutMs = Number.isFinite(rawTimeout) && rawTimeout > 0 ? rawTimeout : 600_000;
      const start = Date.now();
      while (true) {
        await new Promise((r) => setTimeout(r, 10_000));
        const s = await Rx.firstValueFrom(walletCtx.wallet.state().pipe(Rx.filter((x) => x.isSynced)));
        const tn = s.unshielded.balances[unshieldedToken().raw] ?? 0n;
        if (tn > 0n) {
          console.log(`\n  Funded! tNIGHT balance: ${tn.toLocaleString()}\n`);
          break;
        }
        if (Date.now() - start > timeoutMs) {
          console.log(`\n  ❌ Funding not received within ${Math.round(timeoutMs / 60_000)} min.`);
          console.log(`  Address: ${address}`);
          console.log(`  Faucet:  ${networkConfig.faucet}`);
          console.log('  Re-run deploy after funding — your seed is preserved.\n');
          await walletCtx.wallet.stop();
          process.exit(1);
        }
        const elapsed = Math.round((Date.now() - start) / 1000);
        process.stdout.write(`\r  ...still waiting (${elapsed}s elapsed)`);
      }
    }
  }

  console.log('─── DUST Token Setup ───────────────────────────────────────────\n');

  // Registration can die on transient public-RPC WebSocket drops. Each retry
  // re-reads wallet state first, so already-registered UTXOs are skipped and a
  // retry never double-submits.
  const DUST_SUBMIT_RETRIES = 5;
  for (let attempt = 1; attempt <= DUST_SUBMIT_RETRIES; attempt++) {
    const dustState = await Rx.firstValueFrom(
      walletCtx.wallet.state().pipe(Rx.filter((s) => s.isSynced)),
    );
    const unregisteredUtxos = dustState.unshielded.availableCoins.filter(
      (c: any) => !c.meta?.registeredForDustGeneration,
    );
    if (unregisteredUtxos.length === 0) break;

    try {
      console.log(`  Registering ${unregisteredUtxos.length} NIGHT UTXOs for DUST generation...`);
      const recipe = await walletCtx.wallet.registerNightUtxosForDustGeneration(
        unregisteredUtxos,
        walletCtx.unshieldedKeystore.getPublicKey(),
        (payload) => walletCtx.unshieldedKeystore.signData(payload),
      );
      const finalized = await walletCtx.wallet.finalizeRecipe(recipe);
      await walletCtx.wallet.submitTransaction(finalized);
      break;
    } catch (err) {
      if (attempt < DUST_SUBMIT_RETRIES && isTransientRpcError(err)) {
        console.log(`  ⚠ Transient RPC error (${errorMessage(err)}) — retrying (${attempt}/${DUST_SUBMIT_RETRIES})...`);
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      throw err;
    }
  }

  const postRegistrationState = await Rx.firstValueFrom(
    walletCtx.wallet.state().pipe(Rx.filter((s) => s.isSynced)),
  );
  if (postRegistrationState.dust.balance(new Date()) === 0n) {
    console.log('  Waiting for DUST tokens...');
    try {
      await Rx.firstValueFrom(
        walletCtx.wallet.state().pipe(
          Rx.throttleTime(5000),
          Rx.filter((s) => s.isSynced),
          Rx.filter((s) => s.dust.balance(new Date()) > 0n),
          Rx.timeout({ first: DUST_WAIT_TIMEOUT_MS }),
        ),
      );
    } catch {
      const minutes = Math.round(DUST_WAIT_TIMEOUT_MS / 60000);
      console.log(`\n  ❌ No DUST generated after ${minutes} minutes.`);
      console.log('  DUST is generated by registered NIGHT UTXOs and pays transaction fees.');
      if (network !== 'undeployed') {
        console.log(`    • The ${network} faucet may not have funded this address yet`);
      }
      console.log('');
      await walletCtx.wallet.stop();
      process.exit(1);
    }
  }
  console.log('  DUST tokens ready!\n');

  console.log('─── Deploy Contract ────────────────────────────────────────────\n');
  console.log('  Checking proof server...');
  if (!(await waitForProofServer())) {
    console.log('\n  ❌ Proof server not responding. Run: npm run proof-server:start\n');
    await walletCtx.wallet.stop();
    process.exit(1);
  }
  process.stdout.write('\r  Proof server ready!                                 \n');

  console.log('  Setting up providers...');
  const providers = await createProviders(walletCtx);

  process.stdout.write('  Generating DUST...');
  await new Promise((r) => setTimeout(r, 6000));
  process.stdout.write(' done.\n');

  console.log('  Deploying contract...\n');
  const MAX_RETRIES = 20;
  let deployed: any;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      deployed = await deployContract(providers, {
        compiledContract: compiledContract as any,
        args: [],
        privateStateId: PRIVATE_STATE_ID,
        initialPrivateState: createOvraBidPrivateState(deriveSecretKey(SEED)),
      });
      break;
    } catch (err: any) {
      const fullError = errorMessage(err);
      const errMsg = err?.message || err?.toString() || '';
      const errCause = err?.cause?.message || err?.cause?.toString() || '';

      const isDustShortage =
        fullError.includes('Not enough Dust') ||
        fullError.includes('Insufficient Funds') ||
        fullError.includes('could not balance dust');

      const transient = isTransientRpcError(err);
      if (!(isDustShortage && attempt === 1)) {
        console.error(`\n  Attempt ${attempt} error: ${errMsg}`);
        if (errCause && errCause !== errMsg) console.error(`  Cause: ${errCause}`);
      }

      // Retry DUST shortages (DUST becomes spendable on later blocks) and
      // transient RPC drops. A retry after an ambiguous disconnect can in the
      // worst case deploy a duplicate contract — the address is salted — but
      // the alternative is failing a deploy whose tx actually landed.
      if ((isDustShortage || transient) && attempt < MAX_RETRIES) {
        const why = isDustShortage ? 'DUST not spendable yet' : 'transient RPC error';
        console.log(`  ⏳ ${why} — retrying in ${RETRY_DELAY_MS / 1000}s... (attempt ${attempt}/${MAX_RETRIES})`);
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      } else {
        throw err;
      }
    }
  }

  if (!deployed) throw new Error('Deployment failed after all retries');

  const contractAddress = deployed.deployTxData.public.contractAddress;
  console.log('  ✅ Contract deployed successfully!\n');
  console.log(`  Contract Address: ${contractAddress}\n`);

  // The deploy tx was finalized, but "deployed" also means "readable via the
  // indexer". Poll until the chain state shows up so the recorded address is
  // verified, not just submitted.
  console.log('  Verifying on-chain state via indexer...');
  const VERIFY_TIMEOUT_MS = 2 * 60 * 1000;
  const verifyStart = Date.now();
  let verified = false;
  while (Date.now() - verifyStart < VERIFY_TIMEOUT_MS) {
    const state = await providers.publicDataProvider.queryContractState(contractAddress);
    if (state) {
      verified = true;
      break;
    }
    await sleep(5000);
  }
  process.stdout.write('\r' + ' '.repeat(50) + '\r');
  if (verified) {
    console.log('  ✓ Contract state confirmed on-chain.\n');
  } else {
    console.log('  ⚠ Contract not yet indexed after 2 min — tx was accepted; check `npm run onchain` later.\n');
  }

  recordDeployment(network, contractAddress, address.toString());
  console.log('  Saved to .midnight-state.json\n');

  await persistWalletState(network, walletCtx);
  await walletCtx.wallet.stop();
  console.log('─── Deployment complete ────────────────────────────────────────\n');
  console.log('  Next: npm run cli\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
