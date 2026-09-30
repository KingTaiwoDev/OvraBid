import { useState } from 'react';
import type { UseMidnight } from '../hooks/useMidnight';
import { commitBid, type CircuitCallResult } from '../lib/circuits';

type Phase = 'idle' | 'proving' | 'balancing' | 'submitting' | 'done' | 'error';

const PHASE_TEXT: Record<Exclude<Phase, 'idle'>, string> = {
  proving: 'Generating ZK proof in your browser…',
  balancing: 'Balancing transaction in your wallet…',
  submitting: 'Submitting to Midnight preprod…',
  done: 'Sealed!',
  error: 'Something went wrong.',
};

/**
 * Circuit call panel. The bid amount is generated inside the browser and fed
 * straight into the ZK circuit — it is NEVER displayed, logged, or included
 * in any transaction payload visible to the chain or the UI.
 */
export function CircuitCall({ midnight }: { midnight: UseMidnight }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<CircuitCallResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connected = midnight.status === 'connected' && midnight.contract !== null;
  const busy = phase === 'proving' || phase === 'balancing' || phase === 'submitting';

  async function sealBid() {
    if (!connected) return;
    setError(null);
    setResult(null);
    setPhase('proving');
    try {
      const res = await commitBid(midnight, {
        onProving: () => setPhase('proving'),
        onBalancing: () => setPhase('balancing'),
        onSubmitting: () => setPhase('submitting'),
      });
      setResult(res);
      setPhase('done');
      await midnight.refreshAuction();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('error');
    }
  }

  return (
    <section className="panel">
      <h2>
        Seal a bid
        {phase === 'done' ? <span className="badge">Proved without revealing your input</span> : null}
      </h2>

      <p className="muted">
        Places a sealed bid on the preprod auction. The amount is chosen randomly
        inside your browser, proven against the contract's commitment circuit,
        and never shown — not even to this page.
      </p>

      <div className="row" style={{ marginTop: 12 }}>
        <button className="primary" disabled={!connected || busy} onClick={() => void sealBid()}>
          {busy ? 'Working…' : 'Seal a secret bid'}
        </button>
        {!connected ? <span className="muted">Connect your wallet first.</span> : null}
      </div>

      {phase !== 'idle' ? <p className="status muted">{PHASE_TEXT[phase]}</p> : null}

      {result ? (
        <div className="status">
          <div className="kv">
            <span className="k">status</span>
            <span className="ok">{result.status}</span>
            <span className="k">tx id</span>
            <span style={{ wordBreak: 'break-all' }}>{result.txId}</span>
            <span className="k">round</span>
            <span>{result.round}</span>
            <span className="k">bidCount</span>
            <span>{result.bidCount}</span>
            <span className="k">your amount</span>
            <span className="warn">████ (sealed — never displayed)</span>
          </div>
          <div className="notice" style={{ marginTop: 10 }}>
            Proved without revealing your input — the chain only saw the
            commitment digest, not the amount.
          </div>
        </div>
      ) : null}

      {error ? <p className="err status">{error}</p> : null}
    </section>
  );
}
