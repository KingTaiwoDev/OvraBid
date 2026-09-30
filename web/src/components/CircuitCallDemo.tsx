import { useState } from 'react';
import type { UseDemoMode, DemoCallResult } from '../hooks/useDemoMode';

type Phase = 'idle' | 'proving' | 'balancing' | 'submitting' | 'done' | 'error';

const PHASE_TEXT: Record<Exclude<Phase, 'idle'>, string> = {
  proving: 'Generating ZK proof in your browser…',
  balancing: 'Sealing on the demo chain…',
  submitting: 'Submitting to the demo chain…',
  done: 'Sealed!',
  error: 'Something went wrong.',
};

/**
 * Demo-mode twin of CircuitCall: same phases, same copy, same privacy
 * surface. The chain behind it is simulated; the circuit and the "never
 * displayed" guarantee are the real ones.
 */
export function CircuitCallDemo({ midnight }: { midnight: UseDemoMode }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<DemoCallResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connected = midnight.status === 'connected';
  const busy = phase === 'proving' || phase === 'balancing' || phase === 'submitting';

  async function sealBid() {
    if (!connected) return;
    setError(null);
    setResult(null);
    setPhase('proving');
    try {
      const res = await midnight.commitBid({
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
        <span className="privacy-badge" title="Your bid amount is a private circuit input — it is never displayed, logged, or put on-chain">
          PRIVATE — amount sealed
        </span>
        <span className="badge" style={{ marginLeft: 8 }}>
          SIMULATED — demo recording mode
        </span>
        {phase === 'done' ? (
          <span className="badge">Proved without revealing your input</span>
        ) : null}
      </h2>

      <p className="muted">
        Places a sealed bid on a <strong>simulated</strong> auction running the real OvraBid
        circuits in your browser. The amount is chosen randomly, proven against the commitment
        circuit, and never shown — not even to this page. No wallet, no testnet tokens involved.
      </p>

      <div className="row" style={{ marginTop: 12 }}>
        <button className="primary" disabled={!connected || busy} onClick={() => void sealBid()}>
          {busy ? 'Working…' : 'Seal a secret bid'}
        </button>
        {!connected ? <span className="muted">Connect your wallet first.</span> : null}
      </div>

      {phase !== 'idle' ? (
        <p className="status muted" role="status" aria-busy={busy}>
          {busy ? (
            <span className="spinner-row">
              <span className="spinner" aria-hidden="true" />
              {PHASE_TEXT[phase]}
            </span>
          ) : (
            PHASE_TEXT[phase]
          )}
        </p>
      ) : null}

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
            Proved without revealing your input — even the demo chain only ever saw the commitment
            digest, not the amount.
          </div>
        </div>
      ) : null}

      {error ? <p className="err status">{error}</p> : null}
    </section>
  );
}
