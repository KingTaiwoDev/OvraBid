import type { UseMidnight } from '../hooks/useMidnight';

export function AuctionState({ midnight }: { midnight: UseMidnight }) {
  const { auction, status } = midnight;
  const connected = status === 'connected';

  return (
    <section className="panel">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>Auction state (public, on-chain)</h2>
        <button disabled={!connected} onClick={() => void midnight.refreshAuction()}>
          Refresh
        </button>
      </div>

      {!connected ? (
        <p className="muted">Connect your wallet to read the live auction state.</p>
      ) : !auction ? (
        <p className="muted">No indexed state yet…</p>
      ) : (
        <div className="kv" style={{ marginTop: 12 }}>
          <span className="k">phase</span>
          <span className="ok">{auction.phaseName}</span>
          <span className="k">round</span>
          <span>{auction.round}</span>
          <span className="k">bidCount</span>
          <span>{auction.bidCount}</span>
          <span className="k">bestCommit</span>
          <span style={{ wordBreak: 'break-all' }}>0x{auction.bestCommit}</span>
          <span className="k">bestBid</span>
          <span>{auction.bestBid ?? '(sealed)'}</span>
          <span className="k">winnerSKHash</span>
          <span style={{ wordBreak: 'break-all' }}>0x{auction.winnerSKHash}</span>
        </div>
      )}
    </section>
  );
}
