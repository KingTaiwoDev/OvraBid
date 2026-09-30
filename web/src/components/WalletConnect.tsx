import type { ConnectStatus } from '../lib/types';

/**
 * Structural view of the wallet state — satisfied both by the live
 * `useMidnight` hook and by the demo-mode hook, so this panel renders
 * identically in either mode.
 */
export interface WalletPanelModel {
  status: ConnectStatus;
  error: { kind: string; message: string } | null;
  walletName: string | null;
  address: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

const STATUS_TEXT: Record<string, string> = {
  'no-wallet': 'Lace (Midnight edition) not detected — install the extension and refresh.',
  disconnected: 'Wallet disconnected.',
  connecting: 'Connecting to Lace…',
  connected: 'Wallet connected.',
  error: 'Connection failed.',
};

export function WalletConnect({ midnight }: { midnight: WalletPanelModel }) {
  const { status, error, walletName, address, connect, disconnect } = midnight;
  const connecting = status === 'connecting';

  return (
    <section className="panel">
      <h2>Wallet</h2>

      {status === 'connected' && address ? (
        <div className="row">
          <span className="ok">●</span>
          <span>
            {walletName ?? 'wallet'} <span className="badge">preprod</span>
          </span>
        </div>
      ) : null}

      {status === 'connected' && address ? (
        <div className="address" style={{ marginTop: 10 }}>
          {address}
        </div>
      ) : null}

      {status !== 'connected' ? <p className="muted">{STATUS_TEXT[status]}</p> : null}

      {error ? <p className="err">{error.message}</p> : null}

      <div className="row" style={{ marginTop: 12 }}>
        {status === 'connected' ? (
          <button className="danger" onClick={() => void disconnect()}>
            Disconnect
          </button>
        ) : (
          <button
            className="primary"
            disabled={connecting || status === 'no-wallet'}
            onClick={() => void connect()}
          >
            {connecting ? 'Connecting…' : 'Connect Lace'}
          </button>
        )}
      </div>
    </section>
  );
}
