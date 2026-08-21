import { describe, expect, it } from 'engine:test';
import { sha256Hex } from '../src/sha256';

describe('Vehicle Engine Lab SHA-256 fallback', () => {
  it('matches the standard empty and abc vectors', () => {
    expect(sha256Hex(new Uint8Array())).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
    expect(sha256Hex(new Uint8Array([0x61, 0x62, 0x63]))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });

  it('hashes across multiple SHA-256 blocks without copying the input', () => {
    const bytes = new Uint8Array(1_000_000);
    bytes.fill(0x61);
    expect(sha256Hex(bytes)).toBe(
      'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0'
    );
  });
});
