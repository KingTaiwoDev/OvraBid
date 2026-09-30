import type { InitialAPI } from '@midnight-ntwrk/dapp-connector-api';

// Lace (Midnight edition) injects its DApp Connector API here.
declare global {
  interface Window {
    midnight?: { [walletName: string]: InitialAPI };
  }
}

export {};
