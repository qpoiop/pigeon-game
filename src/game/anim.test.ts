import { describe, it, expect } from 'vitest';
import { damp, clamp, angleDelta, pigeonBob } from './anim';

describe('damp', () => {
  it('moves toward the target and converges', () => {
    let x = 0;
    for (let i = 0; i < 200; i++) x = damp(x, 10, 8, 1 / 60);
    expect(x).toBeCloseTo(10, 3);
  });

  it('is roughly framerate-independent (same time, different dt → same result)', () => {
    let a = 0;
    for (let i = 0; i < 60; i++) a = damp(a, 1, 5, 1 / 60);
    let b = 0;
    for (let i = 0; i < 120; i++) b = damp(b, 1, 5, 1 / 120);
    expect(a).toBeCloseTo(b, 4);
  });

  it('never overshoots the target', () => {
    let x = 0;
    for (let i = 0; i < 500; i++) {
      x = damp(x, 1, 20, 1 / 30);
      expect(x).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
});

describe('clamp', () => {
  it('bounds values', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });
});

describe('angleDelta', () => {
  it('returns the shortest signed rotation', () => {
    expect(angleDelta(0.1, -0.1)).toBeCloseTo(0.2, 6);
    // wrapping the short way around ±π
    expect(angleDelta(3.0, -3.0)).toBeCloseTo(6 - Math.PI * 2, 6);
    expect(Math.abs(angleDelta(3.0, -3.0))).toBeLessThan(Math.PI);
  });
});

describe('pigeonBob', () => {
  it('stays within [-1, 1]', () => {
    for (let p = 0; p < 4; p += 0.017) {
      const v = pigeonBob(p);
      expect(v).toBeGreaterThanOrEqual(-1 - 1e-9);
      expect(v).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('is periodic with period 1', () => {
    for (const p of [0.13, 0.42, 0.7, 0.95]) {
      expect(pigeonBob(p)).toBeCloseTo(pigeonBob(p + 3), 6);
    }
  });

  it('thrusts forward late in the cycle (rises after the hold)', () => {
    expect(pigeonBob(0.7)).toBeLessThan(pigeonBob(0.95));
  });
});
