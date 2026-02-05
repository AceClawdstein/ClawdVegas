import { describe, it, expect } from 'vitest';

describe('Project Setup', () => {
  it('should have a working test environment', () => {
    expect(true).toBe(true);
  });

  it('should support BigInt for monetary calculations', () => {
    const amount1 = BigInt(1000000);
    const amount2 = BigInt(500000);
    const total = amount1 + amount2;
    expect(total).toBe(BigInt(1500000));
  });
});
