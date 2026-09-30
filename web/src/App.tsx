import { useMidnight } from './hooks/useMidnight';
import { WalletConnect } from './components/WalletConnect';
import { CircuitCall } from './components/CircuitCall';
import { AuctionState } from './components/AuctionState';

export function App() {
  const midnight = useMidnight();

  return (
    <div className="container">
      <h1>OvraBid</h1>
      <p className="tagline">
        A sealed-bid auction on Midnight: private bids, verifiable winner.
      </p>

      <WalletConnect midnight={midnight} />

      <CircuitCall midnight={midnight} />

      <AuctionState midnight={midnight} />

      <p className="muted" style={{ fontSize: 12 }}>
        Proofs are generated in your browser; your secret key and bid inputs never
        leave it. Transactions are submitted through your Lace wallet on preprod.
      </p>
    </div>
  );
}
