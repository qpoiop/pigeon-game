import type { LevelDef, LevelTheme, Rect, GuardSpawn } from './levels';

/**
 * Procedural corridor-maze generator. Produces a `LevelDef` compatible with the
 * hand-authored ones: a filled grid is carved into corridors (walls dominate,
 * paths are threaded through), with a cleared spawn safe-zone, a far exit door
 * tucked in a corner, and guards patrolling short corridor segments.
 *
 * Guaranteed connected: the base is a perfect maze (every room reachable); the
 * safe-zone carve + extra loop-openings only ever remove walls, and the exit /
 * guards sit on open cells — so spawn can always path to the exit and to every
 * guard waypoint. `src/game/ai/mapgen-nav.test.ts` asserts this across seeds.
 */
export interface GenOpts {
  seed: number;
  /** Grid cells (both must be odd; interior rooms sit on odd indices). */
  gw: number;
  gh: number;
  /** World size of one cell (m). */
  cell: number;
  guards: number;
  theme: LevelTheme;
  name: string;
  brief: string;
}

/** Deterministic mulberry32 PRNG so a seed reproduces a map (for tests). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function genLevel(o: GenOpts): LevelDef {
  const { gw, gh, cell } = o;
  const rand = mulberry32(o.seed);
  // grid: wall[y][x] = true (solid) until carved
  const wall: boolean[][] = Array.from({ length: gh }, () => Array(gw).fill(true));
  const inBounds = (x: number, y: number) => x > 0 && y > 0 && x < gw - 1 && y < gh - 1;

  // recursive-backtracker maze over odd "room" cells, knocking out the wall between
  const stack: [number, number][] = [[1, 1]];
  wall[1][1] = false;
  const dirs: [number, number][] = [
    [0, -2],
    [0, 2],
    [-2, 0],
    [2, 0],
  ];
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const opts = dirs
      .map(([dx, dy]) => [cx + dx, cy + dy, dx, dy] as [number, number, number, number])
      .filter(([nx, ny]) => inBounds(nx, ny) && wall[ny][nx]);
    if (!opts.length) {
      stack.pop();
      continue;
    }
    const [nx, ny, dx, dy] = opts[Math.floor(rand() * opts.length)];
    wall[cy + dy / 2][cx + dx / 2] = false;
    wall[ny][nx] = false;
    stack.push([nx, ny]);
  }

  // a few extra openings so it's not all dead-ends (still only removes walls)
  const loops = Math.floor(gw * gh * 0.05);
  for (let i = 0; i < loops; i++) {
    const x = 1 + Math.floor(rand() * (gw - 2));
    const y = 1 + Math.floor(rand() * (gh - 2));
    if ((x % 2 === 1) !== (y % 2 === 1)) wall[y][x] = false; // only wall-between cells
  }

  // spawn safe-zone: clear a ~3-cell radius around the spawn room corner
  const sc: [number, number] = [1, 1];
  const SAFE = 3;
  for (let y = Math.max(1, sc[1] - SAFE); y <= Math.min(gh - 2, sc[1] + SAFE); y++)
    for (let x = Math.max(1, sc[0] - SAFE); x <= Math.min(gw - 2, sc[0] + SAFE); x++)
      wall[y][x] = false;

  // exit in the far corner (force its room open)
  const ec: [number, number] = [gw - 2, gh - 2];
  wall[ec[1]][ec[0]] = false;

  const W = gw * cell;
  const D = gh * cell;
  const cx = (x: number) => x * cell - W / 2 + cell / 2;
  const cz = (y: number) => y * cell - D / 2 + cell / 2;

  // emit interior wall cells, merging horizontal runs per row into fewer rects
  const walls: Rect[] = [];
  for (let y = 1; y < gh - 1; y++) {
    let run = 0;
    for (let x = 1; x <= gw - 1; x++) {
      const solid = x < gw - 1 && wall[y][x];
      if (solid) {
        run++;
      } else if (run) {
        const x0 = x - run;
        walls.push({ x: (cx(x0) + cx(x - 1)) / 2, z: cz(y), w: run * cell, d: cell });
        run = 0;
      }
    }
  }

  const spawn: [number, number] = [cx(sc[0]), cz(sc[1])];
  const extract: [number, number, number, number] = [cx(ec[0]), cz(ec[1]), cell * 0.9, cell * 0.9];

  // collect open cells for guard placement
  const open: [number, number][] = [];
  for (let y = 1; y < gh - 1; y++)
    for (let x = 1; x < gw - 1; x++) if (!wall[y][x]) open.push([x, y]);
  const isOpen = (x: number, y: number) => inBounds(x, y) && !wall[y][x];

  const guards: GuardSpawn[] = [];
  const step4: [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (let i = 0; i < o.guards && open.length; i++) {
    // an open cell well away from the spawn safe-zone
    let gc = open[Math.floor(rand() * open.length)];
    for (let tries = 0; tries < 40; tries++) {
      const c = open[Math.floor(rand() * open.length)];
      if (Math.abs(c[0] - sc[0]) + Math.abs(c[1] - sc[1]) > SAFE + 2) {
        gc = c;
        break;
      }
    }
    // patrol: walk along an open corridor a few cells, then back
    const dir = step4[Math.floor(rand() * 4)];
    let px = gc[0];
    let py = gc[1];
    for (let s = 0; s < 4; s++) {
      if (isOpen(px + dir[0], py + dir[1])) {
        px += dir[0];
        py += dir[1];
      } else break;
    }
    const path: [number, number][] =
      px === gc[0] && py === gc[1]
        ? [[cx(gc[0]), cz(gc[1])]] // couldn't move → stationary post
        : [
            [cx(gc[0]), cz(gc[1])],
            [cx(px), cz(py)],
          ];
    guards.push({
      path,
      speed: 2.1 + rand() * 0.5,
      range: 8,
      type: rand() < 0.5 ? 'radial' : 'line',
    });
  }

  return {
    name: o.name,
    w: W,
    d: D,
    theme: o.theme,
    brief: o.brief,
    spawn,
    extract,
    walls,
    covers: [],
    films: [],
    items: [],
    guards,
  };
}

/** Per-stage generation presets (index 0..2; the boss stage stays hand-authored). */
export const STAGE_GEN: { gw: number; gh: number; cell: number; guards: number }[] = [
  { gw: 13, gh: 9, cell: 4.5, guards: 6 },
  { gw: 15, gh: 11, cell: 4.5, guards: 8 },
  { gw: 17, gh: 13, cell: 4.5, guards: 10 },
];
