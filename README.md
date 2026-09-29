# OvraBid

> A sealed-bid auction on Midnight: private bids, verifiable winner.

## Contract Address

| Network  | Address                          |
|----------|----------------------------------|
| Preview  | `PENDING_DEPLOYMENT`             |
| Preprod  | Not deployed                     |

## What This Does

OvraBid implements a **sealed-bid auction** as a Midnight smart contract written in Compact.

In a traditional on-chain auction, every bid is public — bidders can wait at the finish line and snipe the highest offer at the last second, and everyone learns your budget. OvraBid fixes this with zero-knowledge proofs:

1. **Commit** — each bidder submits a cryptographic *commitment* (`persistentHash` of their bid amount, a fresh random salt, and their secret key) instead of the bid itself. On-chain, a bid is just an opaque 32-byte digest.
2. **Open** — after the commit window closes, the current best bidder reveals their amount *inside the ZK circuit*: the circuit checks that `H(salt, sk, amount) == bestCommit` holds. A revealed bid can therefore never be forged — the proof only verifies for the person who actually made the commitment.
3. **Claim** — the winner registers themselves (again via a hash equality inside the circuit) and claims the auction. The circuit verifies "I know the secret key whose hash equals `winnerSKHash`" without revealing the key.

The contract supports **multi-round auctions**: after settlement the seller can start the next round, and the `round` counter keeps climbing.

## Privacy Model

**What is PUBLIC (on-chain, visible to anyone):**
- `phase` — the auction lifecycle: `NO_AUCTION → COMMIT → OPEN → CLAIMED`
- `round` — how many auctions this contract has hosted
- `bidCount` — how many sealed bids have been committed since deployment (cumulative; Compact's `Counter` ledger type is deliberately append-only)
- `sellerCommit` — hash binding the auction to its seller's secret key
- `bestCommit` — the commitment digest of the current best bid
- `bestBid` — the winning amount, only *after* the open phase
- `winnerSKHash` — hash binding the win to the winner's secret key

**What is PRIVATE (private witnesses / circuit arguments, never on-chain):**
- `secretKey` — each participant's 32-byte key, held in the user's private state and handed to circuits via the `localSecretKey` witness
- bid `amount` — a circuit argument of `commitBid` / `openBestBid` / `registerAsWinner`; circuit arguments are private by default in Compact
- `salt` — a fresh random 32-byte value per bid, generated client-side and never revealed to the chain (only fed to the reveal circuits)

**What the user PROVES without revealing:**
- `commitBid` — "I know amount+salt such that `persistentHash([domain, salt, sk, amount])` equals the commitment I just wrote" — enforced by the ZK circuit
- `openBestBid` / `registerAsWinner` — "I know the preimage of `bestCommit`" (the exact amount, salt and key)
- `claimWin` — "I hold the secret key whose domain-separated hash equals `winnerSKHash`"
- seller actions — "I am the seller" via `sellerCommit` hash equality, without revealing the key

## Tech Stack

- **Midnight Network** (privacy-first blockchain with ZK proofs)
- **Compact** — Midnight's smart contract language for zero-knowledge circuits
- Node.js v22+, Docker (proof server)
- TypeScript, Vitest, midnight-js SDK 4.1.1

## Prerequisites

- Node.js ≥ 22 (`node --version`)
- Docker running (`docker info`)
- The Compact compiler toolchain (installed via the [compact devtools](https://github.com/midnightntwrk/compact/releases)):
  ```bash
  curl -sL https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
  source "$HOME/.local/bin/env"
  compact update 0.31.1   # 0.31.1 matches compact-runtime 0.16.0 + midnight-js 4.1.1
  compact --version
  ```

## Setup

```bash
git clone https://github.com/KingTaiwoDev/OvraBid.git
cd OvraBid
npm install

# start the proof server (port 6300)
npm run proof-server:start

# compile the contract (creates contracts/managed/ovraBid)
npm run compile
```

Deploy to the **Preview** testnet:

```bash
npm run deploy -- --network preview
```

The script generates a wallet on first use, prints its address and the faucet URL, and waits for you to fund it at https://midnight-tmnight-preview.nethermind.dev (the seed is preserved in `.midnight-state.json`, gitignored). After funding, the deploy completes and prints the **contract address**.

Interact with the deployed auction:

```bash
npm run cli          # interactive menu: start / commit / open / claim / settle
```

## Run Tests

```bash
npm test
```

18 tests run the compiled ZK circuits entirely in-process (no network, no prover) via a simulator, covering:
- **Circuit logic** — commitment binding, phase guards, authorization asserts
- **State transitions** — the full lifecycle `NO_AUCTION → COMMIT → OPEN → CLAIMED → NO_AUCTION`, multi-round replay, multi-participant bidding
- **Privacy guarantees** — bid amounts, salts and secret keys never appear in any public ledger field; bids with different salts are unlinkable

## Initial Idea

[LEAVE PLACEHOLDER — I will fill this in manually]

## Screenshots

[LEAVE PLACEHOLDER — I will add compile output and contract address screenshots]
