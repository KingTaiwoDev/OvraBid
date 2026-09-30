# Product Proposal

## What is the product, and who uses it?
OvraBid is a sealed-bid auction engine where the bid itself is a secret. A seller opens an auction; bidders submit cryptographic commitments instead of amounts; the winner is revealed and proven inside a zero-knowledge circuit; the seller settles. Nobody — not other bidders, not the seller, not a block explorer — learns anyone's bid until the reveal phase, and even then the loser amounts stay sealed forever.

Who uses it: anyone whose auction price discovery is distorted by transparency today —
- **Procurement & tendering** (companies/governments buying goods or services, where suppliers hedge their true price if they can see rivals),
- **Treasury & debt issuance** (bids on bonds/notes, where exposure leaks move markets),
- **NFT/collectivity sales & domain trades** (where sniping and bid-shadowing are rampant),
- **Grant committees and M&A processes** (sealed envelopes, on-chain).

For bidders it is a form of price protection: your budget is nobody's data. For sellers it is better price discovery: bidders bid their true valuation when the room is dark.

## Why Midnight specifically?
A sealed-bid auction is self-contradictory on a transparent chain: the ledger *is* the room. On Ethereum/L1-style chains the bid is the transaction — anyone can read your ceiling from the mempool or the explorer, wait out rivals, and snipe by the smallest margin; "sealed-bid" contracts there only hide bids until reveal, and commit-reveal schemes leak timing, size and sender-linkability, and reveal phase failures (everyone must reveal) break the game. Trusted off-chain auctioneers fix transparency but reintroduce the exact problem blockchains exist to remove: you must trust the operator not to collude, lose the data, or lie.

Midnight is the first network where the coordination state and the competitive secret can live apart by construction: the paper trail (phase, round, bid count, commitment digests, the winning amount after reveal) is public and verifiable, while each bid's amount, salt and the bidder's key exist only as private witnesses inside Compact circuits. The proof — not a promise, not an operator — enforces that a revealed bid matches its commitment (`H(salt, sk, amount) == bestCommit`) and that the winner holds the winning preimage. Compact's typed circuits plus enforced local proof generation (in the browser, via the wallet's proof server) mean there is no moment where a bid exists in plaintext anywhere but the bidder's own machine. That is not a feature Midnight adds to an auction; it is the only chain model where this auction is honest.

## Data Model
| Data Point       | Type           | Disclosed To |
|------------------|----------------|--------------|
| `phase` (NO_AUCTION→COMMIT→OPEN→CLAIMED) | Public ledger  | Everyone |
| `round` (auction count)                  | Public ledger  | Everyone |
| `bidCount` (sealed bids received)        | Public ledger  | Everyone |
| `sellerCommit` (seller key hash)         | Public ledger  | Everyone |
| `bestCommit` (current best bid digest)   | Public ledger  | Everyone |
| `winnerSKHash` (winner key hash)         | Public ledger  | Everyone |
| `bestBid` (winning amount)               | Public ledger (after OPEN only) | Everyone, post-reveal |
| bid `amount`                             | Private witness| No one (prover only) |
| per-bid `salt`                           | Private witness| No one |
| participant `secretKey`                  | Private state (browser-local) | No one — handed to circuits via the `localSecretKey` witness only |
| winning preimage knowledge               | ZK proof       | Verified by everyone, revealed to no one |

## Mainnet Feasibility
Realistic by Level 6. What already works and carries over unchanged to mainnet: the Compact contract (7 circuits, 18 in-process tests), the browser proving pipeline (FetchZkConfig + wallet proof server), Lace signing, and the indexer-backed state reads — the same architecture runs on mainnet by pointing network IDs and URIs at production. Remaining work is operational, not architectural: (1) mainnet faucet/funding and DUST registration for the deploy wallet, (2) a mainnet Lace network profile with a production proof server, (3) gas/cost-model tuning from real mainnet proving latencies (bids are small constant-time circuits; commit ≈ one proof + one tx), and (4) an external audit of the commitment/domain-separation logic before value at risk goes live. Honest risks: proof-server availability for mainstream users (mitigated by local fallback proving), wallet onboarding friction, and indexer latency for state reads. None of these block a mainnet deployment by Level 6; the contract itself is already the hard part, and it is done and tested.
