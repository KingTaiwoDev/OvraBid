/**
 * Builds the standard Midnight provider set for the browser, sourcing:
 *   - zkConfig (prover/verifier keys, ZKIR) from the site's own static assets
 *   - indexer + proof server URIs from the connected wallet's configuration
 *   - balancing + submission through the wallet (keys never leave Lace)
 *
 * This mirrors src/deploy.ts's createProviders, except that in the browser the
 * wallet is the balancing and submitting authority (Lace shows the user the
 * transaction before it goes on-chain) and the zkConfig comes from
 * web/public/contract/ovraBid via FetchZkConfigProvider.
 */
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import type { MidnightProviders, UnboundTransaction } from '@midnight-ntwrk/midnight-js-types';
import { Transaction, type FinalizedTransaction, type TransactionId } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import type { OvraBidCircuitId } from './types';

export type OvraBidProviders = MidnightProviders<OvraBidCircuitId>;

export async function buildProviders(
  connectedAPI: ConnectedAPI,
): Promise<OvraBidProviders> {
  const config = await connectedAPI.getConfiguration();
  const shielded = await connectedAPI.getShieldedAddresses();

  // Static zkConfig assets served from web/public/contract/ovraBid
  // (keys/{circuit}.prover|.verifier and zkir/{circuit}.bzkir).
  const zkConfigProvider = new FetchZkConfigProvider<OvraBidCircuitId>(
    `${window.location.origin}/contract/ovraBid`,
  );

  // Transactions are balanced (coin-selected, fee-estimated) inside the
  // wallet, then submitted by it. Serialized as hex for the connector.
  const walletProvider = {
    getCoinPublicKey: (): string => shielded.shieldedCoinPublicKey,
    getEncryptionPublicKey: (): string => shielded.shieldedEncryptionPublicKey,
    balanceTx: async (tx: UnboundTransaction): Promise<FinalizedTransaction> => {
      const hex = toHex(tx.serialize());
      const { tx: balancedHex } = await connectedAPI.balanceUnsealedTransaction(hex);
      return Transaction.deserialize('signature', 'proof', 'binding', fromHex(balancedHex)) as FinalizedTransaction;
    },
  };

  const midnightProvider = {
    submitTx: async (tx: FinalizedTransaction): Promise<TransactionId> => {
      const [txId] = tx.identifiers();
      await connectedAPI.submitTransaction(toHex(tx.serialize()));
      return txId ?? '';
    },
  };

  const proofUri = config.proverServerUri;
  if (!proofUri) {
    throw new Error(
      'The wallet did not report a proof-server URI (proverServerUri). ' +
        'Open Lace settings and make sure a preprod proof server is configured, then reconnect.',
    );
  }

  return {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: 'ovrabid-web',
      accountId: shielded.shieldedAddress,
      privateStoragePasswordProvider: () => 'OvraBid-web-local-encryption-1',
    }),
    publicDataProvider: indexerPublicDataProvider(config.indexerUri, config.indexerWsUri),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(proofUri, zkConfigProvider),
    walletProvider: walletProvider as OvraBidProviders['walletProvider'],
    midnightProvider: midnightProvider as OvraBidProviders['midnightProvider'],
  };
}

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

function fromHex(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}
