/**
 * Reachability guarantee for the procedural maze generator: across many seeds
 * (and every stage preset), the spawn's free region must include the exit and
 * every guard patrol waypoint — i.e. the generated map is always winnable and no
 * guard is boxed in. Mirrors levels-nav.test for the hand-authored stages.
 */
import { describe, it, expect } from 'vitest';
import { NavGrid } from './navgrid';
import { findPath } from './pathfind';
import { genLevel, STAGE_GEN, type GenOpts } from '../../data/mapgen';
import type { LevelDef } from '../../data/levels';
import type { Bounds } from '../types';

const THEME = { ground: 0xe9e7e5, outer: 0xe2e0de, grid: 0xd8d5d3, wall: 0x201e1d };

function wallsOf(L: LevelDef): Bounds[] {
  return L.walls.map((w) => ({
    minX: w.x - w.w / 2,
    maxX: w.x + w.w / 2,
    minZ: w.z - w.d / 2,
    maxZ: w.z + w.d / 2,
  }));
}

function reachable(grid: NavGrid, sx: number, sz: number): Set<number> {
  const seen = new Set<number>();
  const start = grid.nearestFree(grid.cellX(sx), grid.cellZ(sz));
  if (!start) return seen;
  const queue: [number, number][] = [start];
  seen.add(start[1] * grid.cols + start[0]);
  while (queue.length) {
    const [cx, cz] = queue.pop()!;
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (grid.isBlockedCell(nx, nz)) continue;
      const key = nz * grid.cols + nx;
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push([nx, nz]);
    }
  }
  return seen;
}

// a spread of seeds per stage preset
const CASES: [number, number][] = [];
for (let s = 0; s < STAGE_GEN.length; s++) for (let seed = 1; seed <= 12; seed++) CASES.push([s, seed]);

describe.each(CASES)('generated stage %i seed %i', (stage, seed) => {
  const g = STAGE_GEN[stage];
  const opts: GenOpts = { seed, ...g, theme: THEME, name: 'gen', brief: '' };
  const L = genLevel(opts);
  const grid = new NavGrid(L.w / 2, L.d / 2, wallsOf(L), 1, 0.55);
  const comp = reachable(grid, L.spawn[0], L.spawn[1]);
  const inComp = (x: number, z: number) => {
    const free = grid.nearestFree(grid.cellX(x), grid.cellZ(z));
    return !!free && comp.has(free[1] * grid.cols + free[0]);
  };

  it('has the requested guard count', () => {
    expect(L.guards.length).toBe(g.guards);
  });

  it('exit is reachable from spawn', () => {
    expect(inComp(L.extract[0], L.extract[1])).toBe(true);
  });

  it('every guard waypoint is reachable from spawn', () => {
    for (const gd of L.guards) for (const p of gd.path) expect(inComp(p[0], p[1])).toBe(true);
  });

  it('a guard can path to the exit', () => {
    for (const gd of L.guards) {
      const path = findPath(grid, gd.path[0][0], gd.path[0][1], L.extract[0], L.extract[1]);
      expect(path).not.toBeNull();
    }
  });
});
