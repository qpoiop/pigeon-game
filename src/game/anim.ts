/**
 * Pure animation math — no THREE, no state — so the procedural character
 * animation in birds.ts can be unit-tested and reused. Everything here is a
 * deterministic function of its inputs.
 */

const TAU = Math.PI * 2;

/**
 * Framerate-independent exponential approach of `current` toward `target`.
 * `lambda` is the responsiveness (larger = snappier); the result is stable for
 * any dt because it uses the exact exponential rather than `x += (t-x)*k*dt`.
 */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return target + (current - target) * Math.exp(-lambda * dt);
}

/** Clamp `v` into [lo, hi]. */
export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Shortest signed difference a-b wrapped to (-π, π]. */
export function angleDelta(a: number, b: number): number {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/**
 * The iconic pigeon walk head-thrust as a function of the (unwrapped) step
 * phase. Pigeons hold the head fixed in space, then dart it forward — so the
 * head's local offset drifts back slowly, then snaps forward. Returns a value
 * in [-1, 1] (forward positive), periodic with period 1.
 */
export function pigeonBob(phase: number): number {
  const s = phase - Math.floor(phase); // 0..1
  // slow backward drift for the first ~65%, quick forward thrust after.
  if (s < 0.65) {
    return 1 - (s / 0.65) * 2; // +1 → -1, linear hold-and-drift
  }
  // sharp thrust back to +1 with an ease-out
  const u = (s - 0.65) / 0.35; // 0..1
  return -1 + (1 - Math.cos(u * Math.PI)) ; // -1 → +1 via raised cosine
}
