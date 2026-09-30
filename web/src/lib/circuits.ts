/**
 * Circuit call flow for the browser dApp: seal a bid.
 *
 * The amount is generated inside the browser (never rendered, never sent
 * anywhere except into the ZK circuit), proved via the proof server, balanced
 * by the wallet, and submitted on-chain — `callTx` does all of that in one
 * awaited promise that resolves once the transaction is finalized. The chain
 * only ever sees the commitment digest.
 */
import { randomBytes } from './random';
import type { UseMidnight, AuctionStateView } from '../hooks/useMidnight';

export interface CircuitCallCallbacks {
  onProving?: () => void;
  onBalancing?: () => void;
  onSubmitting?: () => void;
}

export interface CircuitCallResult {
  status: 'finalized';
  txId: string;
  round: string;
  bidCount: string;
}

const SALT_BYTES = 32;

export async function commitBid(
  midnight: UseMidnight,
  cb: CircuitCallCallbacks = {},
): Promise<CircuitCallResult> {
  const handle = midnight.contract;
  if (!handle) throw new Error('Wallet is not connected.');

  // Private inputs: generated here, shown nowhere.
  const amount = randomBidAmount();
  const salt = randomBytes(SALT_BYTES);

  cb.onProving?.();
  // One awaited promise: witness construction → local ZK proof → wallet
  // balancing → wallet-signed submission → finalization watch. The private
  // inputs exist only inside this closure and the proof.
  const flip = setTimeout(() => cb.onBalancing?.(), 1500);
  try {
    const finalized = (await handle.callTx.commitBid(amount, salt)) as unknown as {
      public: { txId: string };
    };
    clearTimeout(flip);

    cb.onSubmitting?.();
    const auction = (await midnight.refreshAuction()) as AuctionStateView | null;

    return {
      status: 'finalized',
      txId: finalized.public.txId,
      round: auction?.round ?? '—',
      bidCount: auction?.bidCount ?? '—',
    };
  } catch (err) {
    clearTimeout(flip);
    throw err;
  }
}

/** Uniform in [1, 100_000) — a realistic bid range, irrelevant to the proof. */
function randomBidAmount(): bigint {
  const bytes = randomBytes(4);
  const n = ((bytes[0]! << 24) | (bytes[1]! << 16) | (bytes[2]! << 8) | bytes[3]!) >>> 0;
  return BigInt((n % 99_999) + 1);
}
