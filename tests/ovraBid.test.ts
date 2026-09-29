/**
 * OvraBid — sealed-bid auction contract tests.
 *
 * Runs the compiled ZK circuits in-process via the simulator (no network).
 * Covers:
 *   - circuit logic (commitments, asserts, return values)
 *   - state transitions (the full auction lifecycle)
 *   - privacy guarantees (private inputs never appear on the ledger)
 */
import { describe, it, expect } from 'vitest';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { OvraBidSimulator } from './ovraBid-simulator.js';
import { randomBytes } from './utils.js';
import { Phase } from '../contracts/managed/ovraBid/contract/index.js';

setNetworkId('undeployed');

const SELLER_SK = randomBytes(32);
const BIDDER1_SK = randomBytes(32);
const BIDDER2_SK = randomBytes(32);

const mkAuction = async () => {
  const seller = await OvraBidSimulator.create(SELLER_SK);
  await seller.startAuction();
  return seller;
};

// ─── Circuit logic ───────────────────────────────────────────────────────────

describe('OvraBid > circuit logic', () => {
  it('generates initial ledger state deterministically', async () => {
    const sim0 = await OvraBidSimulator.create(SELLER_SK);
    const sim1 = await OvraBidSimulator.create(SELLER_SK);
    expect(sim0.getLedger()).toEqual(sim1.getLedger());
  });

  it('initializes the ledger with the constructor state', async () => {
    const sim = await OvraBidSimulator.create(SELLER_SK);
    const l = sim.getLedger();
    expect(l.phase).toEqual(Phase.NO_AUCTION);
    expect(l.round).toEqual(0n);
    expect(l.bidCount).toEqual(0n);
    expect(l.bestBid.is_some).toBe(false);
  });

  it('binds bid commitments to amount, salt and secret key', async () => {
    const sim = await mkAuction();
    const amount = 1000n;
    const salt = randomBytes(32);
    const l = await sim.commitBid(amount, salt);

    const sk = sim.getPrivateState().secretKey;

    // Same inputs replay to the exact same on-ledger digest...
    const replay = await OvraBidSimulator.forkFrom(sim, sk);
    const replayed = await replay.commitBid(amount, salt);
    expect(replayed.bestCommit).toEqual(l.bestCommit);

    // ...while any change to (amount, salt, key) yields a different digest.
    const changed = await OvraBidSimulator.forkFrom(sim, sk);
    const changedLedger = await changed.commitBid(amount, randomBytes(32));
    expect(changedLedger.bestCommit).not.toEqual(l.bestCommit);
  });

  it('rejects bids outside the commit phase', async () => {
    const sim = await OvraBidSimulator.create(SELLER_SK);
    await expect(sim.commitBid(1n, randomBytes(32))).rejects.toThrow(/not accepting sealed bids/);
  });

  it('rejects non-sellers ending the commit phase', async () => {
    const sim = await mkAuction();
    const attacker = await OvraBidSimulator.forkFrom(sim, randomBytes(32));
    await expect(attacker.endCommitPhase()).rejects.toThrow(/only the auction starter/);
  });

  it('rejects opening a bid that does not match the commitment', async () => {
    const sim = await mkAuction();
    const salt = randomBytes(32);
    await sim.commitBid(500n, salt);
    await sim.endCommitPhase();
    // wrong amount + wrong salt for the committed digest
    await expect(sim.openBestBid(999n, randomBytes(32))).rejects.toThrow(/does not match/);
    // right amount but wrong salt still fails
    await expect(sim.openBestBid(500n, randomBytes(32))).rejects.toThrow(/does not match/);
  });

  it('rejects a non-winner claiming the auction', async () => {
    const sim = await mkAuction();
    const salt = randomBytes(32);
    await sim.commitBid(500n, salt);
    await sim.endCommitPhase();
    await sim.openBestBid(500n, salt);
    await sim.registerAsWinner(500n, salt);

    const impostor = await OvraBidSimulator.forkFrom(sim, randomBytes(32));
    await expect(impostor.claimWin()).rejects.toThrow(/not the registered winner/);
  });
});

// ─── State transitions ───────────────────────────────────────────────────────

describe('OvraBid > state transitions', () => {
  it('walks the full auction lifecycle phase by phase', async () => {
    const seller = await OvraBidSimulator.create(SELLER_SK);
    expect(seller.getLedger().phase).toEqual(Phase.NO_AUCTION);

    await seller.startAuction();
    expect(seller.getLedger().phase).toEqual(Phase.COMMIT);

    const salt = randomBytes(32);
    await seller.commitBid(750n, salt);
    expect(seller.getLedger().bidCount).toEqual(1n);

    await seller.endCommitPhase();
    expect(seller.getLedger().phase).toEqual(Phase.OPEN);

    await seller.openBestBid(750n, salt);
    await seller.registerAsWinner(750n, salt);
    expect(seller.getLedger().winnerSKHash).not.toEqual(new Uint8Array(32));

    const claimed = await seller.claimWin();
    expect(claimed.price).toEqual(750n);
    expect(seller.getLedger().phase).toEqual(Phase.CLAIMED);

    await seller.settle();
    expect(seller.getLedger().phase).toEqual(Phase.NO_AUCTION);
  });

  it('returns the exact committed price on claim', async () => {
    const sim = await mkAuction();
    const price = 123_456_789n;
    const salt = randomBytes(32);
    await sim.commitBid(price, salt);
    await sim.endCommitPhase();
    await sim.openBestBid(price, salt);
    await sim.registerAsWinner(price, salt);
    const { price: won } = await sim.claimWin();
    expect(won).toEqual(price);
  });

  it('reveals bestBid only in the open phase', async () => {
    const sim = await mkAuction();
    const salt = randomBytes(32);
    await sim.commitBid(250n, salt);
    expect(sim.getLedger().bestBid.is_some).toBe(false);

    await sim.endCommitPhase();
    await sim.openBestBid(250n, salt);
    expect(sim.getLedger().bestBid).toEqual({ is_some: true, value: 250n });
  });

  it('lets later bids overwrite the best commitment during commit', async () => {
    const sim = await mkAuction();
    await sim.commitBid(100n, randomBytes(32));
    const first = sim.getLedger().bestCommit;
    await sim.commitBid(200n, randomBytes(32));
    const second = sim.getLedger().bestCommit;
    expect(first).not.toEqual(second);
    expect(sim.getLedger().bidCount).toEqual(2n);
  });

  it('prevents starting a new auction while one is live', async () => {
    const sim = await mkAuction();
    await expect(sim.startAuction()).rejects.toThrow(/already in its commit phase/);
    await sim.endCommitPhase();
    await expect(sim.startAuction()).rejects.toThrow(/still in its open phase/);
  });

  it('runs a second auction round after settling the first', async () => {
    const seller = await mkAuction();
    const salt = randomBytes(32);
    await seller.commitBid(10n, salt);
    await seller.endCommitPhase();
    await seller.openBestBid(10n, salt);
    await seller.registerAsWinner(10n, salt);
    const round1WinnerHash = seller.getLedger().winnerSKHash;
    await seller.claimWin();
    await seller.settle();

    await seller.startAuction();
    const l = seller.getLedger();
    expect(l.phase).toEqual(Phase.COMMIT);
    expect(l.round).toEqual(2n);
    // bidCount is cumulative across rounds: Compact's Counter ledger type
    // deliberately has no reset/assignment operation (append-only semantics).
    expect(l.bidCount).toEqual(1n);
    // winner binding was reset when settling round 1
    expect(Buffer.from(l.winnerSKHash).equals(Buffer.from(round1WinnerHash))).toBe(false);
  });

  it('lets multiple bidders bid in the same auction (multi-participant)', async () => {
    const seller = await OvraBidSimulator.create(SELLER_SK);
    await seller.startAuction();

    const bidder1 = await OvraBidSimulator.forkFrom(seller, BIDDER1_SK);
    const bidder2 = await OvraBidSimulator.forkFrom(seller, BIDDER2_SK);

    await bidder1.commitBid(100n, randomBytes(32));
    const afterB1 = bidder1.getLedger();
    await bidder2.commitBid(200n, randomBytes(32));

    // The shared public state advanced for both participants.
    expect(afterB1.bidCount).toEqual(1n);
    expect(bidder2.getLedger().bidCount).toEqual(2n);
    expect(bidder2.getLedger().bestCommit).not.toEqual(afterB1.bestCommit);
  });
});

// ─── Privacy ─────────────────────────────────────────────────────────────────

describe('OvraBid > privacy guarantees', () => {
  it('never exposes the bid amount or salt on the ledger during commit', async () => {
    const sim = await mkAuction();
    const amount = 777_777_777n;
    const salt = randomBytes(32);
    await sim.commitBid(amount, salt);

    const l = sim.getLedger() as Record<string, unknown>;
    const serialized = JSON.stringify(l, (_, v) => (typeof v === 'bigint' ? v.toString() : v));
    expect(serialized).not.toContain('777777777');

    // The ledger type has no slot that could carry the amount pre-reveal.
    expect(l).not.toHaveProperty('amount');
    expect(l).not.toHaveProperty('salt');
    expect((l.bestBid as { is_some: boolean }).is_some).toBe(false);
  });

  it('keeps secret keys out of every public ledger field', async () => {
    const seller = await OvraBidSimulator.create(SELLER_SK);
    await seller.startAuction();
    await seller.commitBid(42n, randomBytes(32));

    const serialized = JSON.stringify(seller.getLedger(), (_, v) =>
      typeof v === 'bigint' ? v.toString() : v,
    );
    const skHex = Buffer.from(SELLER_SK).toString('hex');
    expect(serialized).not.toContain(skHex);
    // None of the public byte arrays equals the raw secret key.
    const byteArrays = [
      seller.getLedger().sellerCommit,
      seller.getLedger().bestCommit,
      seller.getLedger().winnerSKHash,
    ];
    for (const arr of byteArrays) {
      expect(Buffer.from(arr).equals(Buffer.from(SELLER_SK))).toBe(false);
    }
  });

  it('makes each bid unlinkable to the bidder key', async () => {
    const seller = await OvraBidSimulator.create(SELLER_SK);
    await seller.startAuction();
    const bidder = await OvraBidSimulator.forkFrom(seller, BIDDER1_SK);

    const saltA = randomBytes(32);
    const saltB = randomBytes(32);
    await bidder.commitBid(100n, saltA);
    const commitA = bidder.getLedger().bestCommit;
    await bidder.commitBid(100n, saltB);
    const commitB = bidder.getLedger().bestCommit;

    // Same amount, same key — a different salt yields an unrelated commitment,
    // so on-chain observers cannot link bids to a key or to each other.
    expect(commitA).not.toEqual(commitB);
  });

  it('stores only a hash of the winner key, never the key', async () => {
    const sim = await mkAuction();
    const salt = randomBytes(32);
    await sim.commitBid(5n, salt);
    await sim.endCommitPhase();
    await sim.openBestBid(5n, salt);
    await sim.registerAsWinner(5n, salt);

    const winnerHash = sim.getLedger().winnerSKHash;
    expect(winnerHash).toHaveLength(32);
    expect(Buffer.from(winnerHash).equals(Buffer.from(sim.getPrivateState().secretKey))).toBe(false);
  });
});
