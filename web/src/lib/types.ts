/**
 * Wallet / contract wiring for the OvraBid browser dApp.
 *
 * Pattern (Midnight dApp standard for midnight-js 4.1.x):
 *   - Lace injects its DApp Connector API at window.midnight.mnLace
 *   - connect() returns a ConnectedAPI whose getConfiguration() supplies the
 *     indexer and proof-server URIs for the connected network
 *   - the dApp builds the standard provider set around those URIs, with the
 *     wallet's own balancing/submission endpoints used as wallet/midnight
 *     providers (keys never leave the wallet; proofs run in the browser)
 */

/** The circuit ids of the deployed OvraBid contract. */
export type OvraBidCircuitId =
  | 'startAuction'
  | 'commitBid'
  | 'endCommitPhase'
  | 'openBestBid'
  | 'registerAsWinner'
  | 'claimWin'
  | 'settle';

export const OVRA_CIRCUITS: readonly OvraBidCircuitId[] = [
  'startAuction',
  'commitBid',
  'endCommitPhase',
  'openBestBid',
  'registerAsWinner',
  'claimWin',
  'settle',
];

/** OvraBid contract deployed to Midnight preprod (recorded in Level 1). */
export const PREPROD_CONTRACT_ADDRESS =
  'fc8c852adc8ad6f6a784b4c8d338140380acd1c723c4a853ef4904df099f533b';

/** NetworkId handed to wallet.connect() — the dApp is preprod-only. */
export const TARGET_NETWORK_ID = 'preprod';

export type ConnectStatus =
  | 'no-wallet'
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

export interface WalletError {
  kind: 'not-installed' | 'rejected' | 'network-mismatch' | 'unknown';
  message: string;
}

export function classifyWalletError(err: unknown): WalletError {
  const raw = err instanceof Error ? err.message : String(err);
  const msg = raw.toLowerCase();
  if (msg.includes('reject') || msg.includes('denied') || msg.includes('cancel')) {
    return { kind: 'rejected', message: 'Connection request was rejected in the wallet.' };
  }
  if (msg.includes('network') || msg.includes('chain') || msg.includes('networkid')) {
    return {
      kind: 'network-mismatch',
      message: `Wallet is not on preprod (${raw}). Switch networks in Lace and reconnect.`,
    };
  }
  return { kind: 'unknown', message: raw };
}
