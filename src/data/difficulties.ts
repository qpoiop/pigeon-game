/** Difficulty presets. Each scales guard behaviour and starting equipment. */
export type DiffId = string;

export interface DiffDef {
  /** Display name (Korean). */
  name: string;
  /** Guard speed multiplier. */
  gs: number;
  /** Guard vision-range multiplier. */
  gr: number;
  /** Seconds of exposure before detection fills (lower = faster spotting). */
  dt: number;
  /** Enemy/boss damage multiplier. */
  atk: number;
  /** Attack-telegraph windup multiplier (lower = less reaction time). */
  wind: number;
  /** Boss HP multiplier. */
  bhp: number;
}

export const DIFFS: Record<DiffId, DiffDef> = {
  // wind is higher = slower attack-telegraph fill = more time to dodge
  easy: { name: '쉬움', gs: 0.62, gr: 0.85, dt: 1.05, atk: 0.6, wind: 1.75, bhp: 0.7 },
  normal: { name: '보통', gs: 0.82, gr: 1.0, dt: 0.75, atk: 1.0, wind: 1.25, bhp: 1.0 },
  hard: { name: '어려움', gs: 1.02, gr: 1.15, dt: 0.55, atk: 1.5, wind: 0.9, bhp: 1.3 },
};

export const DIFF_ORDER: DiffId[] = Object.keys(DIFFS);
