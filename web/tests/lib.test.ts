import { describe, it, expect } from 'vitest';
import { classifyWalletError, OVRA_CIRCUITS, PREPROD_CONTRACT_ADDRESS } from '../src/lib/types';
import { randomBytes } from '../src/lib/random';

describe('wallet error classification', () => {
  it('recognizes user rejection', () => {
    const e = classifyWalletError(new Error('Request rejected by user'));
    expect(e.kind).toBe('rejected');
  });

  it('recognizes network mismatch', () => {
    const e = classifyWalletError(new Error('wallet is on network preview'));
    expect(e.kind).toBe('network-mismatch');
  });

  it('classifies anything else as unknown', () => {
    const e = classifyWalletError(new Error('socket hang up'));
    expect(e.kind).toBe('unknown');
  });

  it('stringifies non-Error values', () => {
    const e = classifyWalletError('nope');
    expect(e.kind).toBe('unknown');
    expect(e.message).toBe('nope');
  });
});

describe('random helper', () => {
  it('returns the requested number of bytes', () => {
    expect(randomBytes(32).length).toBe(32);
  });

  it('returns different bytes on successive calls', () => {
    const a = randomBytes(16);
    const b = randomBytes(16);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });
});

describe('contract wiring constants', () => {
  it('targets the Level 1 preprod deployment', () => {
    expect(PREPROD_CONTRACT_ADDRESS).toBe(
      'fc8c852adc8ad6f6a784b4c8d338140380acd1c723c4a853ef4904df099f533b',
    );
  });

  it('exposes all seven circuits of the deployed contract', () => {
    expect(OVRA_CIRCUITS).toHaveLength(7);
  });
});
