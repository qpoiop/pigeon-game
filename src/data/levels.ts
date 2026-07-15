/** Static level definitions. Add an entry to ship a new stage. */
export type ItemType = 'decoy' | 'smoke';

/** An axis-aligned rectangle in world space (metres), used for walls & covers. */
export interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
  /** Optional wall height (m). Omit to let the engine vary it for a skyline. */
  h?: number;
}

export interface ItemSpawn {
  t: ItemType;
  x: number;
  z: number;
}

/** patrol = detect & chase to catch; sniper = telegraphed ranged shot; charger = telegraphed lunge. */
export type GuardType = 'patrol' | 'sniper' | 'charger';

export interface GuardSpawn {
  /** Patrol waypoints as [x, z] pairs. */
  path: [number, number][];
  /** Patrol speed (m/s). */
  speed: number;
  /** Base vision range (m), before difficulty scaling. */
  range: number;
  /** Combat behaviour when the player is spotted (default patrol). */
  type?: GuardType;
}

/** Per-level colour theme so stages read as distinct places (hex ints). */
export interface LevelTheme {
  ground: number;
  outer: number;
  grid: number;
  wall: number;
}

export interface LevelDef {
  name: string;
  /** Playfield width / depth (m). */
  w: number;
  d: number;
  /** Optional colour theme; engine falls back to the default paper/ink look. */
  theme?: LevelTheme;
  /** Mission briefing text (Korean). */
  brief: string;
  /** Player spawn [x, z]. */
  spawn: [number, number];
  /** Extraction zone [x, z, width, depth]. */
  extract: [number, number, number, number];
  walls: Rect[];
  covers: Rect[];
  /** Microfilm pickup positions [x, z]. */
  films: [number, number][];
  items: ItemSpawn[];
  guards: GuardSpawn[];
}

export const LEVELS: LevelDef[] = [
  {
    name: '01 — 외곽 훈련 구역',
    theme: { ground: 0xe9e7e5, outer: 0xe2e0de, grid: 0xd8d5d3, wall: 0x201e1d },
    w: 60,
    d: 40,
    brief:
      '외곽 감시 시설. 마이크로필름 4개를 회수하고 북쪽 회수 지점으로 탈출하라. 회색 은폐 구역과 아이템을 활용할 것.',
    spawn: [0, 17],
    extract: [0, -17, 5, 3.5],
    walls: [
      { x: -15, z: 8, w: 14, d: 1.4 },
      { x: 15, z: 8, w: 14, d: 1.4 },
      { x: -24, z: -2, w: 1.4, d: 14 },
      { x: 24, z: -2, w: 1.4, d: 14 },
      { x: 0, z: 2, w: 1.4, d: 10 },
      { x: -10, z: -8, w: 12, d: 1.4 },
      { x: 12, z: -8, w: 10, d: 1.4 },
      { x: -6, z: 14, w: 1.4, d: 5 },
    ],
    covers: [
      { x: -27, z: 13, w: 3.5, d: 4 },
      { x: 27, z: 13, w: 3.5, d: 4 },
      { x: 9, z: 3, w: 4, d: 3 },
      { x: -18, z: -13, w: 4, d: 3 },
      { x: 18, z: -13, w: 4, d: 3 },
      { x: 4, z: -4, w: 3, d: 3 },
    ],
    films: [
      [-27, -17],
      [27, -17],
      [-27, 3],
      [27, 3],
    ],
    items: [
      { t: 'decoy', x: -10, z: 13 },
      { t: 'smoke', x: 10, z: -13 },
    ],
    guards: [
      { path: [[-18, 4], [18, 4]], speed: 2.2, range: 8 },
      { path: [[-20, -12], [-2, -12]], speed: 2.3, range: 8, type: 'charger' },
      { path: [[20, -12], [5, -12], [5, -2]], speed: 2.3, range: 8 },
    ],
  },
  {
    name: '02 — 기록 보관소',
    theme: { ground: 0xdbe1e3, outer: 0xccd3d5, grid: 0xbfc7c9, wall: 0x222a2e },
    w: 76,
    d: 50,
    brief:
      '거대한 서고. 필름 5개 회수 후 남동쪽 하수구로 탈출. 경비 순찰선이 겹친다 — 미끼로 흐트러뜨려라.',
    spawn: [-34, 21],
    extract: [34, -21, 5, 4],
    // parallel archive shelving: each row is split by a central aisle, with
    // side aisles at the edges — weave the stacks. (distinct from L1's scatter)
    walls: [
      { x: -19, z: 15, w: 30, d: 1.4 },
      { x: 19, z: 15, w: 30, d: 1.4 },
      { x: -19, z: 7, w: 30, d: 1.4 },
      { x: 19, z: 7, w: 30, d: 1.4 },
      { x: -19, z: -1, w: 30, d: 1.4 },
      { x: 19, z: -1, w: 30, d: 1.4 },
      { x: -19, z: -9, w: 30, d: 1.4 },
      { x: 19, z: -9, w: 30, d: 1.4 },
      { x: -19, z: -17, w: 30, d: 1.4 },
      { x: 19, z: -17, w: 30, d: 1.4 },
    ],
    covers: [
      { x: -30, z: 19, w: 4, d: 3 },
      { x: 30, z: 19, w: 4, d: 3 },
      { x: -15, z: 3, w: 4, d: 3 },
      { x: 15, z: -5, w: 4, d: 3 },
      { x: 0, z: -13, w: 4, d: 3 },
      { x: -30, z: -21, w: 4, d: 3 },
    ],
    films: [
      [-30, 11],
      [30, 3],
      [0, -5],
      [-30, -13],
      [30, 19],
    ],
    items: [
      { t: 'decoy', x: -30, z: 3 },
      { t: 'decoy', x: 30, z: -13 },
      { t: 'smoke', x: 0, z: 11 },
    ],
    guards: [
      { path: [[-30, 11], [30, 11]], speed: 2.4, range: 8.5, type: 'sniper' },
      { path: [[30, 3], [-30, 3]], speed: 2.4, range: 8.5 },
      { path: [[-30, -5], [30, -5]], speed: 2.5, range: 8.5, type: 'charger' },
      { path: [[30, -13], [-30, -13]], speed: 2.5, range: 8.5 },
    ],
  },
  {
    name: '03 — 중앙 관제',
    theme: { ground: 0xece0d2, outer: 0xe3d6c4, grid: 0xd7cab6, wall: 0x2e2620 },
    w: 90,
    d: 60,
    brief: '심장부다. 필름 6개, 경비 6명. 순찰이 빠르고 시야가 넓다. 조용히, 확실하게.',
    spawn: [0, 26],
    extract: [0, -26, 6, 4],
    // central command vault entered only via top & bottom doorways, ringed by
    // wing corridors — a fortress core, distinct from L1 scatter / L2 aisles.
    walls: [
      { x: -8, z: 8, w: 7, d: 1.4 },
      { x: 8, z: 8, w: 7, d: 1.4 },
      { x: -8, z: -8, w: 7, d: 1.4 },
      { x: 8, z: -8, w: 7, d: 1.4 },
      { x: -11, z: 0, w: 1.4, d: 16 },
      { x: 11, z: 0, w: 1.4, d: 16 },
      { x: -28, z: 15, w: 22, d: 1.4 },
      { x: 28, z: 15, w: 22, d: 1.4 },
      { x: -28, z: -15, w: 22, d: 1.4 },
      { x: 28, z: -15, w: 22, d: 1.4 },
    ],
    covers: [
      { x: -38, z: 18, w: 4, d: 3 },
      { x: 38, z: 18, w: 4, d: 3 },
      { x: 0, z: 18, w: 4, d: 3 },
      { x: -15, z: -2, w: 4, d: 3 },
      { x: 15, z: -2, w: 4, d: 3 },
      { x: 0, z: -18, w: 4, d: 3 },
    ],
    films: [
      [0, 0],
      [-40, 24],
      [40, 24],
      [-40, -24],
      [40, -24],
      [0, 20],
    ],
    items: [
      { t: 'decoy', x: -30, z: 22 },
      { t: 'smoke', x: 30, z: 22 },
      { t: 'decoy', x: 0, z: -20 },
      { t: 'smoke', x: -40, z: 0 },
    ],
    guards: [
      { path: [[-16, 11], [16, 11]], speed: 2.7, range: 9, type: 'sniper' },
      { path: [[16, -11], [-16, -11]], speed: 2.7, range: 9, type: 'charger' },
      { path: [[-40, 20], [-40, -20]], speed: 2.6, range: 9, type: 'sniper' },
      { path: [[40, 20], [40, -20]], speed: 2.6, range: 9 },
      { path: [[-15, 14], [-15, -14]], speed: 2.8, range: 9 },
      { path: [[15, 14], [15, -14]], speed: 2.8, range: 9, type: 'charger' },
    ],
  },
];
