import type { LevelDef, LevelTheme, Rect, GuardSpawn, GuardType } from './levels';

/** Enemy classes the generator draws from, so mobs vary in HP / speed / reach /
 *  attack shape / size instead of all being identical grunts. */
const GUARD_CLASSES: {
  cls: string;
  hp: number;
  speed: number;
  range: number;
  type: GuardType;
  scale: number;
  tint: number;
}[] = [
  { cls: 'scout', hp: 2, speed: 2.9, range: 7, type: 'radial', scale: 0.95, tint: 0x3fae6b },
  { cls: 'guard', hp: 3, speed: 2.3, range: 8.5, type: 'radial', scale: 1.1, tint: 0x8a8683 },
  { cls: 'guard', hp: 3, speed: 2.2, range: 9, type: 'line', scale: 1.1, tint: 0x8a8683 },
  { cls: 'heavy', hp: 5, speed: 1.6, range: 8, type: 'radial', scale: 1.4, tint: 0xec3013 },
  { cls: 'sniper', hp: 3, speed: 2.0, range: 13, type: 'line', scale: 1.05, tint: 0xe0a021 },
];

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
  const { cell } = o;
  const rand = mulberry32(o.seed);
  // vary the grid a little per seed so maps don't all feel the same size (stays odd)
  const gw = o.gw + [-2, 0, 2][Math.floor(rand() * 3)];
  const gh = o.gh + [-2, 0, 2][Math.floor(rand() * 3)];
  // spawn in a random corner; exit in the diagonally-opposite one (far + hidden)
  const corners: [number, number][] = [
    [1, 1],
    [gw - 2, 1],
    [1, gh - 2],
    [gw - 2, gh - 2],
  ];
  const si = Math.floor(rand() * 4);
  const sc = corners[si];
  const ec = corners[3 - si];

  // grid: wall[y][x] = true (solid) until carved
  const wall: boolean[][] = Array.from({ length: gh }, () => Array(gw).fill(true));
  const inBounds = (x: number, y: number) => x > 0 && y > 0 && x < gw - 1 && y < gh - 1;

  // recursive-backtracker maze over odd "room" cells, knocking out the wall between
  const stack: [number, number][] = [sc];
  wall[sc[1]][sc[0]] = false;
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

  // a few extra openings so it's not all dead-ends (still only removes walls).
  // kept low so the maze stays wall-dense rather than opening into rooms.
  const loops = Math.floor(gw * gh * 0.015);
  for (let i = 0; i < loops; i++) {
    const x = 1 + Math.floor(rand() * (gw - 2));
    const y = 1 + Math.floor(rand() * (gh - 2));
    if ((x % 2 === 1) !== (y % 2 === 1)) wall[y][x] = false; // only wall-between cells
  }

  // spawn safe-zone: clear just a 1-cell radius around the spawn (small breathing room)
  const SAFE = 1;
  for (let y = Math.max(1, sc[1] - SAFE); y <= Math.min(gh - 2, sc[1] + SAFE); y++)
    for (let x = Math.max(1, sc[0] - SAFE); x <= Math.min(gw - 2, sc[0] + SAFE); x++)
      wall[y][x] = false;

  // ensure the exit room is open
  wall[ec[1]][ec[0]] = false;

  const W = gw * cell;
  const D = gh * cell;
  const cx = (x: number) => x * cell - W / 2 + cell / 2;
  const cz = (y: number) => y * cell - D / 2 + cell / 2;

  // emit ALL wall cells (incl. the border ring) so the perimeter is solid wall,
  // not an empty strip. Merge horizontal runs per row into fewer rects.
  const walls: Rect[] = [];
  for (let y = 0; y < gh; y++) {
    let run = 0;
    for (let x = 0; x <= gw; x++) {
      const solid = x < gw && wall[y][x];
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
  // push the exit out against the border corner so the door sits on the map edge
  const edX = ec[0] >= gw / 2 ? 1 : -1;
  const edZ = ec[1] >= gh / 2 ? 1 : -1;
  const extract: [number, number, number, number] = [
    cx(ec[0]) + edX * cell * 0.3,
    cz(ec[1]) + edZ * cell * 0.3,
    cell * 0.9,
    cell * 0.9,
  ];

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
  // each guard gets a UNIQUE start cell — overlapping spawns hid a guard under
  // another, so "kill them all" left one alive and the exit never unlocked.
  const used = new Set<string>([sc[0] + ',' + sc[1]]);
  const farFromSpawn = (c: [number, number]) =>
    Math.abs(c[0] - sc[0]) + Math.abs(c[1] - sc[1]) > SAFE + 2;
  for (let i = 0; i < o.guards && open.length; i++) {
    let gc: [number, number] | undefined;
    for (let tries = 0; tries < 60; tries++) {
      const c = open[Math.floor(rand() * open.length)];
      if (!used.has(c[0] + ',' + c[1]) && farFromSpawn(c)) {
        gc = c;
        break;
      }
    }
    if (!gc) gc = open.find((c) => !used.has(c[0] + ',' + c[1])); // any free cell
    if (!gc) break; // no distinct cells left
    used.add(gc[0] + ',' + gc[1]);
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
    const k = GUARD_CLASSES[Math.floor(rand() * GUARD_CLASSES.length)];
    guards.push({
      path,
      speed: k.speed + rand() * 0.3,
      range: k.range,
      type: k.type,
      hp: k.hp,
      scale: k.scale,
      tint: k.tint,
      cls: k.cls,
    });
  }

  // scatter crate obstacles in open cells (cover + blocks sight; not on spawn /
  // exit / a guard post). Small enough to squeeze past in a corridor.
  const covers: Rect[] = [];
  const nCrates = Math.floor(open.length * 0.16);
  const cSize = cell * 0.5;
  for (let i = 0; i < nCrates; i++) {
    const c = open[Math.floor(rand() * open.length)];
    if (used.has(c[0] + ',' + c[1])) continue; // avoid guard posts
    if (Math.abs(c[0] - sc[0]) + Math.abs(c[1] - sc[1]) <= SAFE + 1) continue; // not in spawn
    if (c[0] === ec[0] && c[1] === ec[1]) continue; // not on the exit
    used.add(c[0] + ',' + c[1]);
    covers.push({ x: cx(c[0]), z: cz(c[1]), w: cSize, d: cSize });
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
    covers,
    films: [],
    items: [],
    guards,
  };
}

/** Per-stage generation presets (index 0..2; the boss stage stays hand-authored). */
export const STAGE_GEN: { gw: number; gh: number; cell: number; guards: number }[] = [
  { gw: 11, gh: 9, cell: 4, guards: 5 },
  { gw: 13, gh: 11, cell: 4, guards: 7 },
  { gw: 15, gh: 11, cell: 4, guards: 9 },
];
