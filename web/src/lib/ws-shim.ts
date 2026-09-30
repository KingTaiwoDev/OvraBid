/**
 * Browser shim for isomorphic-ws: guarantee the named `WebSocket` export is
 * the browser-native implementation. The indexer public data provider imports
 * { WebSocket } from 'isomorphic-ws', whose browser build can come through
 * bundlers as default-only; aliasing the module here keeps Apollo's
 * graphql-ws subscriptions working.
 */
const WebSocketImpl = globalThis.WebSocket;

export { WebSocketImpl as WebSocket };
export default WebSocketImpl;
