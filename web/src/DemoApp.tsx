import { useDemoMode } from './hooks/useDemoMode';
import { WalletConnect } from './components/WalletConnect';
import { CircuitCallDemo } from './components/CircuitCallDemo';
import { AuctionState } from './components/AuctionState';

/**
 * Demo app — the same panels as the live App, driven by the simulated chain.
 * Every panel is labeled so a viewer can never mistake this for live mode.
 */
export function DemoApp() {
  const midnight = useDemoMode();

  return (
    <div className="container">
      <h1>OvraBid</h1>
      <p className="tagline">
        A sealed-bid auction on Midnight: private bids, verifiable winner.
      </p>

      <div className="notice" style={{ marginBottom: 14 }}>
        <strong>SIMULATED — demo recording mode.</strong> The auction runs the real OvraBid
        circuits locally in this browser; no Lace wallet and no preprod contract are involved.
        The live dApp is this same site without the demo flag — this mode exists only to record
        the demo video.
      </div>

      <WalletConnect midnight={midnight} />

      <CircuitCallDemo midnight={midnight} />

      <AuctionState midnight={midnight} />

      <p className="muted" style={{ fontSize: 12 }}>
        The circuits and witnesses are identical to the live deployment; only the transport is
        simulated. Your secret key and bid inputs never leave this browser.
      </p>
    </div>
  );
}
