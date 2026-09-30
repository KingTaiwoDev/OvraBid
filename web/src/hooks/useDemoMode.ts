/**
 * useDemoMode — wallet-free demo of the dApp for screen recording.
 *
 * Honesty contract (this mode exists to record the Level 2 demo video and is
 * always clearly labeled in the UI as "SIMULATED — demo recording mode"):
 *   - The AUCTION runs the REAL compiled circuits, in the browser, against a
 *     simulated chain — the same in-process engine as
 *     tests/ovraBid-simulator.ts (contract.impureCircuits.commitBid, etc.).
 *   - The BID amount is generated randomly, fed into the real circuit, and is
 *     never displayed — exactly as in live mode.
 *   - The "wallet" is the user's OWN browser (localStorage key), not Lace.
 *   - Nothing touches the real preprod contract or any wallet.
 *
 * In live mode (default) useMidnight drives Lace and the real chain; demo
 * mode only ever substitutes the transport, never the circuit or the
 * privacy properties.
 */
import { useCallback, useRef, useState } from 'react';
import {
  CostModel,
  createConstructorContext,
  QueryContext,
  sampleContractAddress,
} from '@midnight-ntwrk/compact-runtime';
import { randomBytes } from '../lib/random';
import { CONTRACT_ARTIFACTS } from '../lib/contract';
import { witnesses } from '../lib/witnesses';

export interface DemoAuctionView {
  phase: number;
  phaseName: string;
  round: string;
  bidCount: string;
  bestCommit: string;
  bestBid: string | null;
  winnerSKHash: string;
}

export interface DemoCallResult {
  status: 'finalized';
  txId: string;
  round: string;
  bidCount: string;
}

export interface UseDemoMode {
  status: 'no-wallet' | 'disconnected' | 'connecting' | 'connected' | 'error';
  error: { kind: string; message: string } | null;
  walletName: string;
  address: string | null;
  auction: DemoAuctionView | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  commitBid: (cb?: {
    onProving?: () => void;
    onBalancing?: () => void;
    onSubmitting?: () => void;
  }) => Promise<DemoCallResult>;
  refreshAuction: () => Promise<DemoAuctionView | null>;
}

const ADDRESS_KEY = 'ovrabid.demo.address';
const PHASES = ['NO_AUCTION', 'COMMIT', 'OPEN', 'CLAIMED'] as const;

interface DemoLedger {
  phase: number;
  round?: bigint | number;
  bidCount?: bigint | number;
  bestCommit?: Uint8Array;
  bestBid?: { is_some: boolean; value?: bigint | number };
  winnerSKHash?: Uint8Array;
}

interface DemoChain {
  getLedger: () => DemoLedger;
  commit: (amount: bigint, salt: Uint8Array) => Promise<DemoLedger>;
}

function toHex(bytes: Uint8Array | undefined): string {
  if (!bytes) return '—';
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

export function useDemoMode(): UseDemoMode {
  const [status, setStatus] = useState<UseDemoMode['status']>('disconnected');
  const [error, setError] = useState<UseDemoMode['error']>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [auction, setAuction] = useState<DemoAuctionView | null>(null);
  const chainRef = useRef<DemoChain | null>(null);

  const refreshAuction = useCallback(async (): Promise<DemoAuctionView | null> => {
    const chain = chainRef.current;
    if (!chain) return null;
    const l = chain.getLedger();
    const view: DemoAuctionView = {
      phase: l.phase,
      phaseName: PHASES[l.phase] ?? String(l.phase),
      round: String(l.round ?? '0'),
      bidCount: String(l.bidCount ?? '0'),
      bestCommit: toHex(l.bestCommit),
      bestBid:
        l.bestBid?.is_some && l.bestBid.value !== undefined ? String(l.bestBid.value) : null,
      winnerSKHash: toHex(l.winnerSKHash),
    };
    setAuction(view);
    return view;
  }, []);

  const connect = useCallback(async () => {
    setError(null);
    setStatus('connecting');
    try {
      // The demo "wallet" is the user's own browser: a stable, clearly
      // demo-scoped address stored in localStorage (never a Lace key).
      let addr = localStorage.getItem(ADDRESS_KEY);
      if (!addr) {
        addr = 'mn_addr_demo1' + toHex(randomBytes(16));
        localStorage.setItem(ADDRESS_KEY, addr);
      }
      setAddress(addr);

      // The contract module and runtime are bundled with the app (one
      // shared runtime instance — see lib/contract.ts).
      const ContractClass = CONTRACT_ARTIFACTS.Contract as new (
        w: unknown,
      ) => {
        initialState: (c: unknown) => Promise<{
          currentPrivateState: unknown;
          currentContractState: { data: unknown };
          currentZswapLocalState: unknown;
        }>;
        impureCircuits: {
          startAuction: (c: unknown) => { context: unknown };
          commitBid: (
            c: unknown,
            amount: bigint,
            salt: Uint8Array,
          ) => { context: unknown };
        };
      };

      const sk = randomBytes(32);
      const otherSk = randomBytes(32);
      const contract = new ContractClass(witnesses);
      const init = await contract.initialState(
        createConstructorContext({ secretKey: sk }, '0'.repeat(64)),
      );

      // Mutable cell holding the latest public circuit context — the
      // simulated chain. Other participants are emulated by swapping the
      // private state before their circuit, exactly like the test simulator.
      let latest = {
        currentPrivateState: init.currentPrivateState,
        currentZswapLocalState: init.currentZswapLocalState,
        costModel: CostModel.initialCostModel(),
        currentQueryContext: new QueryContext(
          init.currentContractState.data as never,
          sampleContractAddress(),
        ),
      };
      const asUser = (secretKey: Uint8Array) => ({
        ...latest,
        currentPrivateState: { secretKey },
      });

      // Seed a realistic auction: start it, one other participant bids.
      latest = contract.impureCircuits.startAuction(asUser(sk)).context as typeof latest;
      latest = contract.impureCircuits
        .commitBid(asUser(otherSk), 41_237n, randomBytes(32))
        .context as typeof latest;

      chainRef.current = {
        getLedger: () =>
          CONTRACT_ARTIFACTS.ledger(
            (latest.currentQueryContext as { state: unknown }).state,
          ) as unknown as DemoLedger,
        commit: async (amount, salt) => {
          const res = contract.impureCircuits.commitBid(asUser(sk), amount, salt);
          latest = res.context as typeof latest;
          return CONTRACT_ARTIFACTS.ledger(
            (latest.currentQueryContext as { state: unknown }).state,
          ) as unknown as DemoLedger;
        },
      };
      setStatus('connected');
      await refreshAuction();
    } catch (err) {
      setError({ kind: 'unknown', message: err instanceof Error ? err.message : String(err) });
      setStatus('error');
    }
  }, [refreshAuction]);

  const disconnect = useCallback(async () => {
    chainRef.current = null;
    setAuction(null);
    setAddress(null);
    setError(null);
    setStatus('disconnected');
  }, []);

  const commitBid = useCallback(
    async (cb?: {
      onProving?: () => void;
      onBalancing?: () => void;
      onSubmitting?: () => void;
    }): Promise<DemoCallResult> => {
      const chain = chainRef.current;
      if (!chain) throw new Error('Demo mode is not connected.');

      cb?.onProving?.();
      // Presentational pacing only: the real circuit completes in
      // milliseconds locally, so a brief pause lets each stage render for
      // viewers of the demo recording. Live mode paces itself on the actual
      // network/prover round-trips.
      await new Promise((ok) => setTimeout(ok, 1600));

      // The private input is generated here and shown nowhere.
      const n = new DataView(randomBytes(4).buffer).getUint32(0);
      const amount = BigInt((n % 99_999) + 1);
      const salt = randomBytes(32);

      const ledgerAfter = await chain.commit(amount, salt);

      cb?.onBalancing?.();
      await new Promise((ok) => setTimeout(ok, 900)); // visually distinguish the stages

      cb?.onSubmitting?.();
      await new Promise((ok) => setTimeout(ok, 900));
      const view = await refreshAuction();

      return {
        status: 'finalized',
        txId: 'demo-' + toHex(randomBytes(12)),
        round: view?.round ?? '—',
        bidCount: String(ledgerAfter.bidCount ?? view?.bidCount ?? '—'),
      };
    },
    [refreshAuction],
  );

  return {
    status,
    error,
    walletName: 'browser (demo chain — real circuits)',
    address,
    auction,
    connect,
    disconnect,
    commitBid,
    refreshAuction,
  };
}
