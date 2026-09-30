import { Buffer } from 'buffer';
import process from 'process';

// Browser polyfills the Midnight stack expects (same set as the official
// reference dApp: Buffer, process, global).
if (!('Buffer' in globalThis)) {
  (globalThis as unknown as Record<string, unknown>).Buffer = Buffer;
}
if (!('process' in globalThis)) {
  (globalThis as unknown as Record<string, unknown>).process = process;
}
if (typeof (globalThis as { process?: { env?: Record<string, string> } }).process?.env === 'undefined') {
  (globalThis as { process: { env: Record<string, string> } }).process.env = {};
}
(globalThis as unknown as Record<string, unknown>).global = globalThis;
