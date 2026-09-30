/**
 * useMidnight — the single integration point between the React tree and the
 * Midnight stack.
 *
 * State machine: no-wallet → disconnected → connecting → connected.
 * On connect: Lace's connect() is called with the target network, providers
 * are built from the wallet's configuration, the user's private state is
 * initialized (first run generates a 32-byte secret key inside their browser;
 * later visits reuse the stored key), and the deployed preprod contract is
 * joined. On disconnect everything is released and cleared.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import { buildProviders, type OvraBidProviders } from '../lib/providers';
import {
  joinContract,
  PRIVATE_STATE_ID,
  CONTRACT_ARTIFACTS,
  type OvraBidFoundContract,
} from '../lib/contract';
import { createOvraBidPrivateState, freshSecretKey } from '../lib/private-state';
import {
  TARGET_NETWORK_ID,
  PREPROD_CONTRACT_ADDRESS,
  isAcceptableNetwork,
  classifyWalletError,
  type ConnectStatus,
  type WalletError,
} from '../lib/types';

export interface AuctionStateView {
  phase: number;
  phaseName: string;
  round: string;
  bidCount: string;
  bestCommit: string;
  bestBid: string | null;
  winnerSKHash: string;
}

const PHASES = ['NO_AUCTION', 'COMMIT', 'OPEN', 'CLAIMED'] as const;

export interface UseMidnight {
  status: ConnectStatus;
  error: WalletError | null;
  walletName: string | null;
  address: string | null;
  contract: OvraBidFoundContract | null;
  auction: AuctionStateView | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  refreshAuction: () => Promise<AuctionStateView | null>;
}

function detectWallet(): {
  name: string;
  api: { connect: (n: string) => Promise<ConnectedAPI> };
} | null {
  const wallets = window.midnight;
  if (!wallets) return null;
  // Prefer Lace, fall back to the first injected wallet.
  const preferred = wallets['mnLace'] ?? Object.values(wallets)[0];
  if (!preferred) return null;
  const name = wallets['mnLace'] ? 'mnLace' : Object.keys(wallets)[0];
  return { name, api: preferred as unknown as { connect: (n: string) => Promise<ConnectedAPI> } };
}

function toHex(bytes: Uint8Array | undefined): string {
  if (!bytes) return '—';
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

export function useMidnight(): UseMidnight {
  const [status, setStatus] = useState<ConnectStatus>('disconnected');
  const [error, setError] = useState<WalletError | null>(null);
  const [walletName, setWalletName] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [contract, setContract] = useState<OvraBidFoundContract | null>(null);
  const [auction, setAuction] = useState<AuctionStateView | null>(null);
  const providersRef = useRef<OvraBidProviders | null>(null);
  const connectedRef = useRef<ConnectedAPI | null>(null);

  // Initial wallet detection.
  useEffect(() => {
    if (!detectWallet()) setStatus('no-wallet');
  }, []);

  const refreshAuction = useCallback(async (): Promise<AuctionStateView | null> => {
    const handle = contract;
    const providers = providersRef.current;
    if (!handle || !providers) return null;
    const state = await providers.publicDataProvider.queryContractState(
      handle.deployTxData.public.contractAddress,
    );
    if (!state) {
      setAuction(null);
      return null;
    }
    // Decode the ledger with the compiled contract's own decoder (bundled
    // with the app — see lib/contract.ts for why it must not be a separate
    // runtime instance).
    const ledger = CONTRACT_ARTIFACTS.ledger((state as unknown as { data: unknown }).data);
    const bestBid = ledger.bestBid as { is_some: boolean; value?: bigint } | undefined;
    const view: AuctionStateView = {
      phase: ledger.phase as number,
      phaseName: PHASES[ledger.phase as number] ?? String(ledger.phase),
      round: String(ledger.round ?? '0'),
      bidCount: String(ledger.bidCount ?? '0'),
      bestCommit: toHex(ledger.bestCommit as Uint8Array | undefined),
      bestBid: bestBid?.is_some && bestBid.value !== undefined ? String(bestBid.value) : null,
      winnerSKHash: toHex(ledger.winnerSKHash as Uint8Array | undefined),
    };
    setAuction(view);
    return view;
  }, [contract]);

  const connect = useCallback(async () => {
    setError(null);
    setStatus('connecting');
    try {
      const wallet = detectWallet();
      if (!wallet) {
        setStatus('no-wallet');
        return;
      }
      setWalletName(wallet.name);
      const connectedAPI = await wallet.api.connect(TARGET_NETWORK_ID);
      connectedRef.current = connectedAPI;

      // Network guard: reject only explicit mainnet — the wallet's own
      // indexer/proof-server configuration determines what it can reach.
      const config = await connectedAPI.getConfiguration();
      if (!isAcceptableNetwork(config.networkId)) {
        throw Object.assign(
          new Error(`Wallet reported networkId ${config.networkId}, expected preprod`),
          { code: 'network-mismatch' },
        );
      }
      console.info('[OvraBid] wallet network:', config.networkId ?? '(unspecified)');

      const providers = await buildProviders(connectedAPI);
      providersRef.current = providers;
      const { unshieldedAddress } = await connectedAPI.getUnshieldedAddress();
      setAddress(unshieldedAddress);

      // First visit generates the participant's 32-byte secret key inside
      // their own browser store; later visits reuse the stored key.
      const secretKey = await loadOrCreateSecretKey(providers);
      const handle = await joinContract(providers, createOvraBidPrivateState(secretKey));
      setContract(handle);
      setStatus('connected');

      await refreshAuction();
    } catch (err) {
      const classified = classifyWalletError(err);
      setError(classified);
      setStatus(
        (err as { code?: string })?.code === 'network-mismatch' ? 'error' : 'disconnected',
      );
    }
  }, [refreshAuction]);

  const disconnect = useCallback(async () => {
    connectedRef.current = null;
    providersRef.current = null;
    setContract(null);
    setAuction(null);
    setAddress(null);
    setWalletName(null);
    setError(null);
    setStatus(detectWallet() ? 'disconnected' : 'no-wallet');
  }, []);

  return {
    status,
    error,
    walletName,
    address,
    contract,
    auction,
    connect,
    disconnect,
    refreshAuction,
  };
}

/**
 * Loads the stored secret key, or creates and stores a fresh one on first
 * use. The key never leaves the browser: it is read from / written to the
 * encrypted private-state store only.
 */
async function loadOrCreateSecretKey(providers: OvraBidProviders): Promise<Uint8Array> {
  const store = providers.privateStateProvider;
  // Private-state operations are scoped per contract address.
  store.setContractAddress?.(`0x${PREPROD_CONTRACT_ADDRESS}` as never);
  const existing = await store.get(PRIVATE_STATE_ID);
  const stored = (existing as unknown as { secretKey?: Uint8Array } | null)?.secretKey;
  if (stored && stored.length === 32) return stored;
  const fresh = freshSecretKey();
  await store.set(PRIVATE_STATE_ID, createOvraBidPrivateState(fresh));
  return fresh;
}
