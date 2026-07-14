import * as THREE from 'three';
import type { CharId } from '../data/characters';
import type { ItemType } from '../data/levels';

/** A rigged bird model plus the state its procedural animation needs. */
export interface Bird {
  group: THREE.Group;
  body: THREE.Mesh;
  head: THREE.Group;
  wings: [THREE.Mesh, THREE.Mesh];
  feet: [THREE.Group, THREE.Group];
  tail: THREE.Mesh;
  phase: number;
  idleT: number;
  baseHeadY: number;
  baseHeadZ: number;
  // eased procedural-animation state (see animBird)
  crouchBlend: number;
  leanX: number;
  leanZ: number;
  lookY: number;
  /** Body's authored silhouette scale, so dash squash/stretch multiplies rather than replaces it. */
  baseScaleY: number;
  baseScaleZ: number;
}

/** Per-frame inputs that drive the layered bird animation. */
export interface AnimInput {
  /** World-space movement speed (m/s). */
  speed: number;
  dt: number;
  /** Global time (s). */
  t: number;
  crouch: boolean;
  /** Signed turn amount toward the desired heading (radians); banks the body. */
  turn?: number;
  /** Dash intensity 0..1 (1 = just launched); adds a lunge + stretch. */
  dash?: number;
  /** Desired head yaw relative to facing (radians) — glance toward a threat/goal. */
  lookYaw?: number;
}

/** The player's bird carries movement state and the smoke shell. */
export interface Player extends Bird {
  pos: THREE.Vector2;
  facing: number;
  crouch: boolean;
  smokeUntil: number;
  smokeShell?: THREE.Mesh;
}

export type GuardState = 'patrol' | 'chase' | 'lured' | 'search';

export interface Guard {
  model: Bird;
  cone: THREE.Mesh;
  bang: THREE.Sprite;
  path: [number, number][];
  seg: number;
  speed: number;
  range: number;
  fov: number;
  pos: THREE.Vector2;
  facing: number;
  detect: number;
  state: GuardState;
  loseT: number;
  lureT: number;
  lure: Decoy | null;
  /** Last-seen player position, chased down while in the `search` state. */
  lsx: number;
  lsz: number;
  /** Seconds spent searching the last-seen spot before giving up. */
  searchT: number;
  /** Cached A* route (world waypoints) toward the current dynamic goal. */
  navPath: { x: number; z: number }[] | null;
  navIdx: number;
  /** Seconds until the route is recomputed. */
  repathT: number;
  /** Goal the cached route was built for (repath when it moves far). */
  goalX: number;
  goalZ: number;
}

/** A short-lived debris cube thrown by pickups / dashes. */
export interface Particle {
  m: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  t: number;
}

/** Per-stage best result, persisted in localStorage. */
export interface BestScore {
  rank: string;
  time: number;
}

export interface Film {
  x: number;
  z: number;
  mesh: THREE.Group;
  core: THREE.Mesh;
  got: boolean;
}

export interface Item {
  t: ItemType;
  x: number;
  z: number;
  mesh: THREE.Group;
  core: THREE.Mesh;
  got: boolean;
}

export interface Decoy {
  x: number;
  z: number;
  mesh: THREE.Group;
  t: number;
}

/** Axis-aligned bounds used for collision / cover / line-of-sight tests. */
export interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Remote player state received over the relay. */
export interface Peer {
  x: number;
  z: number;
  ry: number;
  stage: number;
  name: string;
  crouch: number;
  char: CharId;
  mic: number;
  seen: number;
}

export interface PeerMesh {
  pg: Bird;
  x: number;
  z: number;
  ry: number;
  char: CharId;
}

export interface GameOptions {
  showCones: boolean;
  camDist: number;
}
