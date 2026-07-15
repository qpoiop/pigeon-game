import * as THREE from 'three';
import type { CharId } from '../data/characters';
import type { ItemType, GuardType } from '../data/levels';

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
  /** Path B (skeletal) models: an AnimationMixer playing a baked clip; when set,
   *  animBird ticks it and skips the procedural limb pass. */
  mixer?: THREE.AnimationMixer;
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
  braceShell?: THREE.Mesh;
  /** Combat: current / max hit points, and invulnerability window end (perf ms). */
  hp: number;
  maxHp: number;
  hurtUntil: number;
  /** Last time an attack was fired (s), for cooldown. */
  atkT: number;
  /** Last time the active skill fired (s), and the brace-immunity end (perf ms). */
  skillT: number;
  braceUntil: number;
  /** Co-op: incapacitated (HP 0 but a teammate is alive); revives next stage. */
  downed: boolean;
}

/** Final-stage boss: HP + a small pattern state machine. */
export interface Boss {
  model: Bird;
  pos: THREE.Vector2;
  facing: number;
  hp: number;
  maxHp: number;
  /** 0 = idle/approach, 1 = windup (telegraph), 2 = charging. */
  phase: number;
  /** 0 = spread shot, 1 = charge, 2 = slam. */
  pattern: number;
  timer: number;
  lvx: number;
  lvz: number;
  hurtFlash: number;
  /** Line telegraph (spread/charge) + slam danger ring. */
  tele: THREE.Mesh;
  ring: THREE.Mesh;
}

/** A player or enemy projectile travelling across the field. */
export interface Projectile {
  mesh: THREE.Mesh;
  x: number;
  z: number;
  vx: number;
  vz: number;
  life: number;
  dmg: number;
  /** True = fired by an enemy (hits player); false = player shot (hits guards). */
  enemy: boolean;
  /** Pierces through guards instead of stopping on the first hit. */
  pierce?: boolean;
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
  /** Combat: taken down by the player (incapacitated, no longer a threat). */
  down: boolean;
  /** Hit points (takes multiple hits) + a small overhead HP bar. */
  hp: number;
  maxHp: number;
  hpbar: THREE.Sprite;
  hurtFlash: number;
  /** Seconds spent making no patrol progress (anti-stuck safety). */
  stuckT: number;
  /** Aggro timer (s): >0 = alerted (engages); decays when the player is far/unseen. */
  aggro: number;
  /** Base model scale (varies by enemy class); hurt-flash multiplies this. */
  baseScale: number;
  /** Attacker behaviour. */
  gtype: GuardType;
  /** Last attack time (s) for cooldown. */
  atkCd: number;
  /** Telegraph windup remaining (s); >0 means winding up an attack. */
  wind: number;
  /** Lunge (charger) remaining (s) + its velocity. */
  lunge: number;
  lvx: number;
  lvz: number;
  /** Telegraph beam mesh (line zone) + radial zone mesh. */
  tele: THREE.Mesh;
  zone: THREE.Mesh;
  /** '?' awareness sprite (bang = '!'). */
  qmark: THREE.Sprite;
  /** Locked aim point for a line attack. */
  aimX: number;
  aimZ: number;
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
  /** Co-op combat: current / max HP and downed flag from the peer. */
  hp: number;
  mhp: number;
  down: number;
}

export interface PeerMesh {
  pg: Bird;
  x: number;
  z: number;
  ry: number;
  char: CharId;
}

/** One guard's authoritative pose in a host→guest world snapshot. */
export interface GuardSnap {
  x: number;
  z: number;
  ry: number;
  /** GuardState index: 0 patrol, 1 chase, 2 lured, 3 search. */
  s: number;
  /** detect 0..1 (drives the cone colour / bang). */
  d: number;
}

/**
 * Host-authoritative world snapshot broadcast to the guest ~15Hz. The host owns
 * the guard AI, pickups, alarm and win/lose; the guest renders this instead of
 * running its own simulation. Films/items are bitmasks (bit i = entry i taken)
 * to stay well under the relay's per-message byte cap.
 */
export interface World {
  seq: number;
  guards: GuardSnap[];
  films: number;
  items: number;
  ax: number;
  az: number;
  /** HUD alert level 0..1 (max guard detect). */
  alert: number;
  /** 1 once every film is collected (exit armed). */
  ready: number;
  /** Per-player escape flags for the co-op clear. */
  he: number;
  ge: number;
  /** Host-authoritative guest HP / max / downed (guest reads these). */
  ghp: number;
  gmax: number;
  gdn: number;
  cleared: number;
  /** 1 when a guard caught either agent — shared mission fail. */
  fail: number;
}

export interface GameOptions {
  showCones: boolean;
  camDist: number;
}
