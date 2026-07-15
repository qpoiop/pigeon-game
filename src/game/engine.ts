/*
 * PIGEON PROTOCOL — 비둘기 특무 v2 — game engine.
 * Top-down 3D stealth-mission game. Ported from the design prototype's
 * <pigeon-game> web component into a framework-agnostic class so a React (or
 * any) shell can mount it. Behaviour and visuals are preserved 1:1.
 *
 * Character classes, difficulty, items (미끼/연막), mission drawer, roster,
 * voice chat and large maps all live here; static content lives in ../data.
 * Palette: Modernist — bg #f3f2f2, ink #201e1d, accent #ec3013.
 */
import * as THREE from 'three';
import { INK, BG, ACCENT, MID, PAPER } from '../data/palette';
import { CHARS, CHAR_ORDER, type CharId } from '../data/characters';
import { DIFFS, DIFF_ORDER, type DiffId } from '../data/difficulties';
import { LEVELS, type LevelDef } from '../data/levels';
import { AUGMENTS, poolFor, augDef, type AugId } from '../data/augments';
import { Sfx } from './audio';
import { Net } from './net';
import { makeBird, makeBang, makeQ, makeLabel, animBird } from './birds';
import { preloadBirdModels, birdModel } from './assets';
import { clamp, angleDelta } from './anim';
import { NavGrid } from './ai/navgrid';
import { findPath } from './ai/pathfind';
import { disposeObject } from './three-utils';
import { TPL, CSS } from './template';
import type {
  BestScore,
  Bounds,
  Film,
  GameOptions,
  Guard,
  GuardSnap,
  GuardState,
  Item,
  Particle,
  Player,
  Peer,
  PeerMesh,
  Projectile,
  Boss,
  World,
} from './types';

/** GuardState <-> snapshot index, shared by host serialise and guest apply. */
const GSTATES: GuardState[] = ['patrol', 'chase', 'lured', 'search'];

type Mode = 'menu' | 'brief' | 'play' | 'fail' | 'clear';

export class PigeonGame {
  private host: HTMLElement;
  showCones: boolean;
  camDist: number;

  private sfx = new Sfx();
  private net: Net;
  charId: CharId = 'pigeon';
  diffId: DiffId = 'normal';

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private sun!: THREE.DirectionalLight;
  private levelGroup!: THREE.Group;
  private actorGroup!: THREE.Group;
  private fxGroup!: THREE.Group;

  private player!: Player;
  private peersMeshes: Record<string, PeerMesh> = {};

  private level!: LevelDef;
  private stageIdx = 0;
  private guards: Guard[] = [];
  private boss: Boss | null = null;
  private films: Film[] = [];
  private items: Item[] = [];
  private walls: Bounds[] = [];
  private covers: Bounds[] = [];
  private nav!: NavGrid;
  private extractMesh!: THREE.Mesh;
  private filmCount = 0;
  private extractT = 0;
  private parts: Particle[] = [];
  private projectiles: Projectile[] = [];
  private arrow!: THREE.Group;
  private swipe!: THREE.Mesh;
  private swipeT = 0;
  private hurtFxUntil = 0;
  private crouchT = -100;
  /** Acquired augment levels this run (reset at the title). */
  private aug: Partial<Record<AugId, number>> = {};
  /** Live 비둘기똥 orbiters circling the player. */
  private orbiters: { mesh: THREE.Mesh; ang: number; life: number; hitT: number }[] = [];
  private aiming = false;
  private aimLine!: THREE.Mesh;

  // shared squad alarm — most recent known player location (for coordinated search)
  private alarmX = 0;
  private alarmZ = 0;

  // co-op: monotonically increasing snapshot sequence (host → guest)
  private worldSeq = 0;
  // co-op: whether each agent is currently holding the exit zone (for the snapshot)
  private coHostEsc = 0;
  private coGuestEsc = 0;
  // co-op: host-authoritative guest HP (host applies damage, broadcasts in snapshot)
  private guestHp = 0;
  private guestMax = 0;
  private guestDown = false;
  private guestHurt = 0;

  // scoring / progression (persisted in localStorage)
  private stageTime = 0;
  private spotted = 0;
  private unlock = 0;
  private best: Record<string, BestScore> = {};
  private startStageIdx = 0;
  private savedName: string | undefined;

  private mode: Mode = 'menu';
  private keys: Record<string, boolean> = {};
  private joy = new THREE.Vector2(0, 0);
  private dashT = -10;
  private moveTarget: THREE.Vector2 | null = null;

  private toastT: ReturnType<typeof setTimeout> | undefined;
  private resizeObs: ResizeObserver | undefined;
  private rafId = 0;
  private onKeyDown!: (e: KeyboardEvent) => void;
  private onKeyUp!: (e: KeyboardEvent) => void;

  // loop state
  private last = 0;
  private camPos = new THREE.Vector3(0, 16, 14);
  // game-feel / juice: decaying camera shake, hit-stop slow-mo, zoom punch
  private shakeAmp = 0;
  private hitStop = 0;
  private zoomKick = 0;
  // dash booster afterimages (fading silhouettes)
  private ghosts: { m: THREE.Mesh; t: number }[] = [];
  private lastGhost = 0;
  private lastBump = 0;
  private paused = false;
  private onPop?: () => void;
  private installEvt: { prompt: () => void; userChoice: Promise<unknown> } | null = null;
  private canInstall = false;
  private rosterT = 0;
  private mapT = 0;
  private lax = 0;
  private laz = 0;
  private lookX = 0;
  private lookZ = 0;

  constructor(host: HTMLElement, opts: GameOptions) {
    this.host = host;
    this.showCones = opts.showCones;
    this.camDist = opts.camDist;
    this.net = new Net(() => this.netStatus());
    this.loadPrefs();
  }

  /** Restore saved character/difficulty/callsign, stage unlock and best scores. */
  private loadPrefs(): void {
    try {
      const pf = JSON.parse(localStorage.getItem('pp_prefs') || '{}');
      if (CHARS[pf.char]) this.charId = pf.char;
      if (DIFFS[pf.diff]) this.diffId = pf.diff;
      if (pf.name) this.savedName = pf.name;
      this.unlock = Math.min(
        parseInt(localStorage.getItem('pp_unlock') || '0', 10) || 0,
        LEVELS.length - 1,
      );
      this.best = JSON.parse(localStorage.getItem('pp_best') || '{}') || {};
      this.sfx.muted = localStorage.getItem('pp_sound') === '0';
    } catch {
      /* first run / storage unavailable */
    }
  }

  private $ = <T extends Element = Element>(s: string): T => this.host.querySelector(s) as T;

  /** Mount DOM + Three scene and start the game. */
  init(): void {
    const style = document.createElement('style');
    style.textContent = CSS;
    this.host.appendChild(style);
    const wrap = document.createElement('div');
    wrap.innerHTML = TPL;
    this.host.appendChild(wrap.firstChild as Node);
    this.host.style.position = 'absolute';
    this.host.style.inset = '0';
    this.host.style.display = 'block';

    this.setup3D();
    this.setupInput();
    this.setupHudButtons();
    this.showTitle();
    // guard the hardware/browser back button: keep one history entry ahead so a
    // back press never closes the app — it pauses live play, and is swallowed on
    // menus/overlays instead of exiting.
    try {
      history.pushState({ pg: 1 }, '');
      this.onPop = () => {
        history.pushState({ pg: 1 }, ''); // re-arm
        if (this.mode === 'play' && !this.paused) this.pause();
      };
      window.addEventListener('popstate', this.onPop);
    } catch {
      /* history unavailable (non-browser env) — ignore */
    }
    // load any registered 3D bird models in the background; spawns before this
    // resolves (or when MODELS is empty) fall back to the procedural makeBird.
    // once loaded, re-spawn on the menu so the sourced model swaps in for its char.
    void preloadBirdModels().then(() => {
      if (this.mode === 'menu') this.spawnPlayer();
    });
    this.loop();
  }

  private applyCones(): void {
    for (const g of this.guards) g.cone.visible = this.showCones;
  }

  /* ---------- 3D setup ---------- */
  private setup3D(): void {
    const canvas = this.$<HTMLCanvasElement>('.pg-canvas');
    const r = new THREE.WebGLRenderer({ canvas, antialias: true });
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer = r;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BG);
    scene.fog = new THREE.Fog(BG, 38, 80);
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 220);
    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(14, 26, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -36;
    sun.shadow.camera.right = 36;
    sun.shadow.camera.top = 36;
    sun.shadow.camera.bottom = -36;
    sun.shadow.bias = -0.0004;
    scene.add(sun);
    scene.add(sun.target);
    this.sun = sun;

    this.levelGroup = new THREE.Group();
    scene.add(this.levelGroup);
    this.actorGroup = new THREE.Group();
    scene.add(this.actorGroup);
    this.fxGroup = new THREE.Group();
    scene.add(this.fxGroup);

    this.parts = [];
    const arrowMesh = new THREE.Mesh(
      new THREE.ConeGeometry(0.16, 0.5, 3),
      new THREE.MeshBasicMaterial({ color: ACCENT }),
    );
    arrowMesh.rotation.x = Math.PI / 2;
    arrowMesh.position.set(0, 0.06, 1.7);
    const arrowG = new THREE.Group();
    arrowG.add(arrowMesh);
    arrowG.visible = false;
    scene.add(arrowG);
    this.arrow = arrowG;

    // melee swipe arc (flat sector) — flashes in front on attack to show reach
    const swGeo = new THREE.CircleGeometry(1, 22, -Math.PI / 2 - 1.15, 2.3);
    swGeo.rotateX(-Math.PI / 2);
    this.swipe = new THREE.Mesh(
      swGeo,
      new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0, depthWrite: false }),
    );
    this.swipe.position.y = 0.08;
    this.swipe.visible = false;
    this.fxGroup.add(this.swipe);

    // owl aim line (hold-to-aim sniper skill); box along local Z, clipped at walls
    this.aimLine = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.05, 1),
      new THREE.MeshBasicMaterial({ color: 0xe0a021, transparent: true, opacity: 0.4, depthWrite: false }),
    );
    this.aimLine.visible = false;
    this.fxGroup.add(this.aimLine);

    this.spawnPlayer();
    this.peersMeshes = {};

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(this.host);
    this.resize();

  }

  private spawnPlayer(): void {
    const old = this.player as Player | undefined;
    const C = CHARS[this.charId];
    const p = (birdModel(C.kind) ?? makeBird(C.pal, C.kind)) as Player;
    p.pos = old ? old.pos : new THREE.Vector2(0, 0);
    p.facing = old ? old.facing : 0;
    p.crouch = false;
    p.smokeUntil = 0;
    p.maxHp = C.combat.hp;
    p.hp = C.combat.hp;
    p.hurtUntil = 0;
    p.atkT = -10;
    p.skillT = -100;
    p.braceUntil = 0;
    p.downed = false;
    if (old) {
      this.actorGroup.remove(old.group);
      // skinned models reuse one shared loaded instance — disposing it would
      // free the geometry/skeleton the next spawn needs. Only dispose procedural.
      if (!old.mixer) disposeObject(old.group);
    }
    this.actorGroup.add(p.group);
    const sm = new THREE.Mesh(
      new THREE.SphereGeometry(1.1, 14, 10),
      new THREE.MeshBasicMaterial({ color: 0xb9b6b3, transparent: true, opacity: 0.4, depthWrite: false }),
    );
    sm.position.y = 0.7;
    sm.visible = false;
    p.group.add(sm);
    p.smokeShell = sm;
    const br = new THREE.Mesh(
      new THREE.SphereGeometry(0.95, 14, 10),
      new THREE.MeshBasicMaterial({ color: 0x8ad0ff, transparent: true, opacity: 0.3, depthWrite: false }),
    );
    br.position.y = 0.7;
    br.visible = false;
    p.group.add(br);
    p.braceShell = br;
    this.player = p;
    this.$('.pg-b-skill .sk').textContent = C.skill.name;
  }

  private resize(): void {
    const w = this.host.clientWidth || 800;
    const h = this.host.clientHeight || 600;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Remove and dispose every child of a group (frees GPU memory on rebuild). */
  private clearGroup(group: THREE.Group): void {
    for (let i = group.children.length - 1; i >= 0; i--) {
      const child = group.children[i];
      disposeObject(child);
      group.remove(child);
    }
  }

  /* ---------- Level build ---------- */
  private buildLevel(idx: number): void {
    const L = LEVELS[idx];
    this.level = L;
    this.stageIdx = idx;
    // free the previous stage's GPU resources before rebuilding
    this.clearGroup(this.levelGroup);
    this.clearGroup(this.fxGroup);
    this.ghosts = []; // fxGroup clear disposed the meshes; drop the stale refs
    this.orbiters = []; // ditto for 비둘기똥 orbiters
    this.projectiles = [];
    this.guards = [];
    this.films = [];
    this.items = [];

    const mat = (c: number) => new THREE.MeshLambertMaterial({ color: c });
    // per-level theme gives each stage its own palette; fall back to paper/ink
    const th = L.theme ?? { ground: PAPER, outer: 0xe2e0de, grid: 0xd8d5d3, wall: INK };
    this.scene.background = new THREE.Color(th.outer); // backdrop matches the stage
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(L.w, L.d), mat(th.ground));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.levelGroup.add(ground);
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(L.w + 80, L.d + 80), mat(th.outer));
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -0.02;
    outer.receiveShadow = true;
    this.levelGroup.add(outer);
    const grid = new THREE.GridHelper(Math.max(L.w, L.d), Math.max(L.w, L.d) / 2, th.grid, th.grid);
    grid.position.y = 0.01;
    this.levelGroup.add(grid);

    const frameMat = mat(th.wall);
    const bar = (x: number, z: number, w: number, d: number, h: number, m?: THREE.Material) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m || frameMat);
      b.position.set(x, h / 2, z);
      b.castShadow = true;
      b.receiveShadow = true;
      this.levelGroup.add(b);
      return b;
    };
    const t = 0.3;
    const hw = L.w / 2;
    const hd = L.d / 2;
    bar(0, -hd - t / 2, L.w + t * 2, t, 0.5);
    bar(0, hd + t / 2, L.w + t * 2, t, 0.5);
    bar(-hw - t / 2, 0, t, L.d, 0.5);
    bar(hw + t / 2, 0, t, L.d, 0.5);

    this.walls = [];
    for (const wl of L.walls) {
      // vary height for a skyline (deterministic per position) unless authored
      const wh = wl.h ?? 1.5 + ((Math.abs(Math.round(wl.x) * 31 + Math.round(wl.z) * 17)) % 4) * 0.5;
      bar(wl.x, wl.z, wl.w, wl.d, wh);
      this.walls.push({
        minX: wl.x - wl.w / 2,
        maxX: wl.x + wl.w / 2,
        minZ: wl.z - wl.d / 2,
        maxZ: wl.z + wl.d / 2,
      });
    }

    this.covers = [];
    for (const cv of L.covers) {
      // teal-tinted zone so it clearly reads as a functional hiding spot
      const cm = new THREE.Mesh(
        new THREE.PlaneGeometry(cv.w, cv.d),
        new THREE.MeshBasicMaterial({ color: 0x18a6c4, transparent: true, opacity: 0.3 }),
      );
      cm.rotation.x = -Math.PI / 2;
      cm.position.set(cv.x, 0.02, cv.z);
      this.levelGroup.add(cm);
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.PlaneGeometry(cv.w, cv.d)),
        new THREE.LineBasicMaterial({ color: 0x18a6c4 }),
      );
      edges.rotation.x = -Math.PI / 2;
      edges.position.set(cv.x, 0.03, cv.z);
      this.levelGroup.add(edges);
      this.covers.push({
        minX: cv.x - cv.w / 2,
        maxX: cv.x + cv.w / 2,
        minZ: cv.z - cv.d / 2,
        maxZ: cv.z + cv.d / 2,
      });
    }

    // Guard navigation grid, built from the interior walls (radius-inflated).
    this.nav = new NavGrid(L.w / 2, L.d / 2, this.walls, 1, 0.55);

    for (let f = 0; f < L.films.length; f++) {
      const fp = L.films[f];
      const fg = new THREE.Group();
      const core = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.28),
        new THREE.MeshLambertMaterial({ color: ACCENT, emissive: ACCENT, emissiveIntensity: 0.35 }),
      );
      core.position.y = 0.8;
      core.castShadow = true;
      fg.add(core);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.5, 0.03, 8, 32),
        new THREE.MeshBasicMaterial({ color: ACCENT }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.06;
      fg.add(ring);
      fg.position.set(fp[0], 0, fp[1]);
      this.levelGroup.add(fg);
      this.films.push({ x: fp[0], z: fp[1], mesh: fg, core, got: false });
    }

    for (const id of L.items) {
      const ig = new THREE.Group();
      let im: THREE.Mesh;
      if (id.t === 'decoy') {
        im = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), new THREE.MeshLambertMaterial({ color: INK }));
        const stripe = new THREE.Mesh(
          new THREE.BoxGeometry(0.42, 0.1, 0.42),
          new THREE.MeshLambertMaterial({ color: ACCENT }),
        );
        stripe.position.y = 0.1;
        im.add(stripe);
      } else {
        im = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), new THREE.MeshLambertMaterial({ color: MID }));
      }
      im.position.y = 0.7;
      im.castShadow = true;
      ig.add(im);
      const iring = new THREE.Mesh(
        new THREE.TorusGeometry(0.5, 0.025, 8, 32),
        new THREE.MeshBasicMaterial({ color: MID }),
      );
      iring.rotation.x = -Math.PI / 2;
      iring.position.y = 0.06;
      ig.add(iring);
      ig.position.set(id.x, 0, id.z);
      this.levelGroup.add(ig);
      this.items.push({ t: id.t, x: id.x, z: id.z, mesh: ig, core: im, got: false });
    }

    const ex = L.extract;
    const exg = new THREE.Group();
    const exEdge = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(ex[2], ex[3])),
      new THREE.LineBasicMaterial({ color: ACCENT }),
    );
    exEdge.rotation.x = -Math.PI / 2;
    exEdge.position.y = 0.04;
    exg.add(exEdge);
    const exFill = new THREE.Mesh(
      new THREE.PlaneGeometry(ex[2], ex[3]),
      new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.12 }),
    );
    exFill.rotation.x = -Math.PI / 2;
    exFill.position.y = 0.035;
    exg.add(exFill);
    exg.position.set(ex[0], 0, ex[1]);
    this.levelGroup.add(exg);
    this.extractMesh = exFill;

    const D = DIFFS[this.diffId];
    for (let gI = 0; gI < L.guards.length; gI++) {
      const gd = L.guards[gI];
      const pg =
        birdModel('guard') ??
        makeBird({ body: 0x2b2825, head: 0x201e1d, wing: 0x171514, accent: 0xec3013 }, 'guard');
      pg.group.scale.setScalar(1.12);
      this.levelGroup.add(pg.group);
      const range = gd.range * D.gr;
      const fov = Math.PI * 0.42;
      const coneGeo = new THREE.CircleGeometry(range, 26, -Math.PI / 2 - fov / 2, fov);
      coneGeo.rotateX(-Math.PI / 2);
      const cone = new THREE.Mesh(
        coneGeo,
        new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.1, depthWrite: false }),
      );
      cone.position.y = 0.05;
      pg.group.add(cone);
      cone.visible = this.showCones;
      const bang = makeBang();
      bang.position.y = 2.0;
      bang.visible = false;
      pg.group.add(bang);
      // telegraph beam: a bar (along local Z) shown from the guard toward its
      // target during windup — scaled/rotated per frame. Ascend-style warning.
      const tele = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.05, 1),
        new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.4, depthWrite: false }),
      );
      tele.visible = false;
      this.fxGroup.add(tele);
      // radial attack zone (flat filled circle) + '?' awareness sprite
      const zoneGeo = new THREE.CircleGeometry(1, 30);
      zoneGeo.rotateX(-Math.PI / 2);
      const zone = new THREE.Mesh(
        zoneGeo,
        new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0, depthWrite: false }),
      );
      zone.position.y = 0.05;
      zone.visible = false;
      this.fxGroup.add(zone);
      const qmark = makeQ();
      qmark.position.y = 2.6;
      qmark.visible = false;
      pg.group.add(qmark);
      // small overhead HP bar (billboard sprite, hidden until the guard takes a hit)
      const hpbar = new THREE.Sprite(
        new THREE.SpriteMaterial({ color: 0xec3013, depthTest: false }),
      );
      hpbar.scale.set(1.9, 0.3, 1);
      hpbar.position.y = 2.5;
      hpbar.visible = false;
      pg.group.add(hpbar);
      const gtype = gd.type ?? 'radial';
      this.guards.push({
        model: pg,
        cone,
        bang,
        hp: 3,
        maxHp: 3,
        hpbar,
        hurtFlash: 0,
        stuckT: 0,
        aggro: 0,
        path: gd.path,
        seg: 0,
        speed: gd.speed * D.gs,
        range,
        fov,
        pos: new THREE.Vector2(gd.path[0][0], gd.path[0][1]),
        facing: 0,
        detect: 0,
        state: 'patrol',
        loseT: 0,
        lureT: 0,
        lure: null,
        lsx: 0,
        lsz: 0,
        searchT: 0,
        navPath: null,
        navIdx: 0,
        repathT: 0,
        goalX: 0,
        goalZ: 0,
        down: false,
        gtype,
        atkCd: -100,
        wind: 0,
        lunge: 0,
        lvx: 0,
        lvz: 0,
        tele,
        zone,
        qmark,
        aimX: 0,
        aimZ: 0,
      });
    }

    // boss (final stage): a large commander with 3 telegraphed attack patterns
    if (L.boss) {
      const bm =
        birdModel('guard') ??
        makeBird({ body: 0x1a1614, head: 0x120f0e, wing: 0x0e0c0b, accent: 0xec3013 }, 'guard');
      bm.group.scale.setScalar(2.6);
      this.levelGroup.add(bm.group);
      const btele = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.05, 1),
        new THREE.MeshBasicMaterial({ color: 0xec3013, transparent: true, opacity: 0.4, depthWrite: false }),
      );
      btele.visible = false;
      this.fxGroup.add(btele);
      const bring = new THREE.Mesh(
        new THREE.RingGeometry(0.86, 1, 40),
        new THREE.MeshBasicMaterial({
          color: 0xec3013,
          transparent: true,
          opacity: 0.35,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      bring.rotation.x = -Math.PI / 2;
      bring.position.y = 0.06;
      bring.visible = false;
      this.fxGroup.add(bring);
      const bhp = Math.round(L.boss.hp * DIFFS[this.diffId].bhp);
      this.boss = {
        model: bm,
        pos: new THREE.Vector2(L.boss.x, L.boss.z),
        facing: Math.PI,
        hp: bhp,
        maxHp: bhp,
        phase: 0,
        pattern: 2,
        timer: 1.6,
        lvx: 0,
        lvz: 0,
        hurtFlash: 0,
        tele: btele,
        ring: bring,
      };
    } else {
      this.boss = null;
    }

    // reset player
    this.player.pos.set(L.spawn[0], L.spawn[1]);
    this.player.hp = this.player.maxHp;
    this.player.hurtUntil = 0;
    this.player.skillT = -100;
    this.player.braceUntil = 0;
    this.player.downed = false; // revive at each stage
    // co-op: (re)initialise host-tracked guest HP from the teammate's character
    const lp = this.livePeer();
    this.guestMax = lp ? CHARS[lp.char]?.combat.hp || 4 : 0;
    this.guestHp = this.guestMax;
    this.guestDown = false;
    this.guestHurt = 0;
    this.projectiles = [];
    this.player.facing = Math.PI;
    this.player.crouch = false;
    this.player.smokeUntil = 0;
    this.$('.pg-b-crouch').classList.remove('onn');
    this.moveTarget = null;
    this.filmCount = 0;
    this.extractT = 0;
    this.stageTime = 0;
    this.spotted = 0;
    const mpc = this.$<HTMLCanvasElement>('.pg-map');
    if (mpc) {
      mpc.width = 150;
      mpc.height = Math.max(60, Math.round((150 * L.d) / L.w));
    }
    this.$('.pg-stage').textContent = L.name;
    this.updFilms();
    this.updHp();
    this.updBossHp();
    this.$('.pg-objective').textContent = this.boss
      ? '목표 — 적 사령관 제압'
      : '목표 — 마이크로필름 회수 후 적색 구역으로 탈출';
    this.updDrawer();
  }

  /* ---------- HUD updates ---------- */
  private updFilms(): void {
    this.$('.pg-films').innerHTML = '필름 <b>' + this.filmCount + '</b>/' + this.level.films.length;
  }
  private toast(msg: string): void {
    const el = this.$('.pg-toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => el.classList.remove('show'), 1800);
  }

  private netStatus(): void {
    const el = this.$('.pg-net');
    const s = this.net.status;
    el.classList.toggle('on', s === 'on');
    el.textContent =
      s === 'on' ? '온라인 · ' + this.net.room : s === 'connecting' ? '접속 중…' : '오프라인 (싱글)';
    this.updRoster();
  }

  /* ---------- Roster & Drawer ---------- */
  private updRoster(): void {
    const el = this.$('.pg-roster');
    if (!el) return;
    let html =
      '<div class="pr me"><span class="sq"></span>' +
      (this.net.name || 'AGENT') +
      ' · ' +
      CHARS[this.charId].name +
      (this.net.voice.enabled && !this.net.voice.muted ? ' <span class="mic">MIC</span>' : '') +
      '</div>';
    const now = performance.now();
    for (const id in this.net.peers) {
      const p = this.net.peers[id];
      if (now - p.seen > 6000) continue;
      html +=
        '<div class="pr"><span class="sq"></span>' +
        (p.name || '요원') +
        ' · ' +
        (CHARS[p.char] ? CHARS[p.char].name : '비둘기') +
        ' · S' +
        ((p.stage | 0) + 1) +
        (p.mic ? ' <span class="mic">MIC</span>' : '') +
        '</div>';
    }
    el.innerHTML = html;
  }

  private updDrawer(): void {
    const bd = this.$('.pg-dr-bd');
    if (!bd || !this.level) return;
    const L = this.level;
    let h = '<h3>작전 — ' + L.name + '</h3><p class="brief">' + L.brief + '</p>';
    h += '<h3>체크리스트</h3><ul>';
    for (let i = 0; i < this.films.length; i++) {
      const f = this.films[i];
      h +=
        '<li><span>마이크로필름 #' +
        (i + 1) +
        '</span>' +
        (f.got ? '<span class="ok">회수</span>' : '<span class="todo">미회수</span>') +
        '</li>';
    }
    const ready = this.filmCount === this.films.length;
    h +=
      '<li><span>회수 지점 탈출</span>' +
      (ready ? '<span class="ok">개방됨</span>' : '<span class="todo">필름 전부 필요</span>') +
      '</li></ul>';
    h +=
      '<h3>요원 — ' +
      CHARS[this.charId].name +
      ' · ' +
      DIFFS[this.diffId].name +
      '</h3>' +
      '<p class="brief">' +
      CHARS[this.charId].desc +
      '</p>';
    h += '<h3>참가자</h3><ul>';
    h +=
      '<li><span>' +
      (this.net.name || 'AGENT') +
      ' (나)</span><span class="ok">' +
      CHARS[this.charId].name +
      '</span></li>';
    const now = performance.now();
    let any = false;
    for (const id in this.net.peers) {
      const p = this.net.peers[id];
      if (now - p.seen > 6000) continue;
      any = true;
      h +=
        '<li><span>' +
        (p.name || '요원') +
        (p.mic ? ' · MIC' : '') +
        '</span><span class="todo">S' +
        ((p.stage | 0) + 1) +
        '</span></li>';
    }
    if (!any)
      h +=
        '<li><span class="todo">' +
        (this.net.status === 'on' ? '같은 방의 다른 요원 없음' : '오프라인 — 싱글 작전') +
        '</span></li>';
    h += '</ul>';
    bd.innerHTML = h;
  }

  private toggleDrawer(force?: boolean): void {
    const d = this.$('.pg-drawer');
    const open = force !== undefined ? force : !d.classList.contains('open');
    d.classList.toggle('open', open);
    if (open) this.updDrawer();
  }

  /* ---------- HUD buttons ---------- */
  private setupHudButtons(): void {
    this.$('.pg-missionbtn').addEventListener('click', () => {
      this.sfx.ensure();
      this.sfx.ui();
      this.toggleDrawer();
    });
    this.$('.pg-dr-x').addEventListener('click', () => this.toggleDrawer(false));
    this.$('.pg-pausebtn').addEventListener('click', () => this.pause());
    // custom install (add-to-home-screen) flow
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.installEvt = e as unknown as { prompt: () => void; userChoice: Promise<unknown> };
      this.canInstall = true;
      if (this.mode === 'menu') this.$('.pg-install').classList.add('show');
    });
    window.addEventListener('appinstalled', () => {
      this.canInstall = false;
      this.$('.pg-install').classList.remove('show');
    });
    this.$('.pg-install').addEventListener('click', () => {
      if (this.installEvt) {
        this.installEvt.prompt();
        void this.installEvt.userChoice.finally(() => {
          this.installEvt = null;
          this.canInstall = false;
          this.$('.pg-install').classList.remove('show');
        });
      } else {
        this.toast('브라우저 공유/메뉴 → "홈 화면에 추가"');
      }
    });
    // iOS Safari never fires beforeinstallprompt — offer manual instructions
    const iOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (iOS && !standalone) this.canInstall = true;
    (this.$('.pg-drawer') as HTMLElement).style.pointerEvents = 'auto';
    this.$('.pg-mic').addEventListener('click', async () => {
      this.sfx.ensure();
      const v = this.net.voice;
      const btn = this.$('.pg-mic');
      if (!v.enabled) {
        btn.textContent = 'MIC 요청중';
        const ok = await v.enable();
        if (!ok) {
          btn.textContent = 'MIC 불가';
          this.toast('마이크 권한이 거부되었습니다');
          return;
        }
        btn.textContent = 'MIC 켜짐';
        btn.classList.add('onn');
        if (this.net.status !== 'on') this.toast('음성은 온라인(방 코드 입력) 시 다른 요원에게 전달됩니다');
      } else {
        v.setMuted(!v.muted);
        btn.textContent = v.muted ? 'MIC 꺼짐' : 'MIC 켜짐';
        btn.classList.toggle('onn', !v.muted);
      }
      this.updRoster();
    });
  }

  /* ---------- Input ---------- */
  private setupInput(): void {
    this.onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (this.mode === 'play') {
          e.preventDefault();
          if (this.paused) this.resume();
          else this.pause();
        }
        return;
      }
      if (this.paused) return; // swallow gameplay keys while paused
      if (e.code === 'Tab' || e.code === 'KeyM') {
        if (this.mode === 'play') {
          e.preventDefault();
          this.toggleDrawer();
        }
        return;
      }
      if (this.mode !== 'play') return;
      this.keys[e.code] = true;
      if (e.code === 'KeyC' || e.code === 'ControlLeft') this.toggleCrouch();
      if (e.code === 'ShiftLeft' || e.code === 'Space') {
        this.dash();
        e.preventDefault();
      }
      if (e.code === 'KeyF' || e.code === 'KeyJ') this.attack();
      if ((e.code === 'KeyE' || e.code === 'KeyK') && !e.repeat) this.skillPress();
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(e.code) >= 0) e.preventDefault();
      this.moveTarget = null;
    };
    this.onKeyUp = (e: KeyboardEvent) => {
      this.keys[e.code] = false;
      if (e.code === 'KeyE' || e.code === 'KeyK') this.skillRelease();
    };
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    // close the relay socket when the tab is hidden/closed so the DO slot frees
    // immediately instead of lingering as a zombie until TCP timeout
    window.addEventListener('pagehide', () => {
      try {
        this.net.ws?.close();
      } catch {
        /* noop */
      }
    });

    const canvas = this.$<HTMLCanvasElement>('.pg-canvas');
    // dynamic joystick: press ANYWHERE on the field and drag to steer. The press
    // point is the anchor; the drag offset from it is the movement vector.
    let joyId: number | null = null;
    let ax = 0;
    let ay = 0;
    canvas.addEventListener('pointerdown', (e) => {
      if (this.mode !== 'play') return;
      this.sfx.ensure();
      joyId = e.pointerId;
      ax = e.clientX;
      ay = e.clientY;
      this.joy.set(0, 0);
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* capture unsupported */
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerId !== joyId) return;
      const max = 56; // px drag for full tilt
      let jx = (e.clientX - ax) / max;
      let jy = (e.clientY - ay) / max;
      const l = Math.hypot(jx, jy);
      if (l > 1) {
        jx /= l;
        jy /= l;
      }
      this.joy.set(jx, jy);
    });
    const endJoy = (e: PointerEvent) => {
      if (e.pointerId === joyId) {
        joyId = null;
        this.joy.set(0, 0);
      }
    };
    canvas.addEventListener('pointerup', endJoy);
    canvas.addEventListener('pointercancel', endJoy);
    // scroll to zoom the camera in/out during play
    canvas.addEventListener(
      'wheel',
      (e) => {
        if (this.mode !== 'play') return;
        this.camDist = Math.max(11, Math.min(24, this.camDist + Math.sign(e.deltaY)));
        e.preventDefault();
      },
      { passive: false },
    );

    this.$('.pg-b-skill').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.skillPress();
    });
    this.$('.pg-b-skill').addEventListener('pointerup', (e) => {
      e.preventDefault();
      this.skillRelease();
    });
    this.$('.pg-b-skill').addEventListener('pointercancel', () => this.skillRelease());
    this.$('.pg-b-attack').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.attack();
    });
    this.$('.pg-b-dash').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.dash();
    });
    this.$('.pg-b-crouch').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.toggleCrouch();
    });
  }

  private static readonly CROUCH_CD = 4.5;
  private toggleCrouch(): void {
    if (this.mode !== 'play' || this.player.downed) return;
    const now = performance.now() / 1000;
    if (this.player.crouch) {
      // standing up is always allowed; the cooldown runs from when you stand
      this.player.crouch = false;
      this.crouchT = now;
    } else {
      if (now - this.crouchT < PigeonGame.CROUCH_CD) {
        this.toast('숨기 재사용 대기 중');
        return;
      }
      this.player.crouch = true;
    }
    this.$('.pg-b-crouch').classList.toggle('onn', this.player.crouch);
    this.sfx.ensure();
    this.sfx.ui();
  }
  private dash(): void {
    if (this.mode !== 'play' || this.player.downed) return;
    const now = performance.now() / 1000;
    if (now - this.dashT < CHARS[this.charId].dashCd) return;
    this.dashT = now;
    this.addShake(0.12);
    this.sfx.ensure();
    this.sfx.dash();
    if (this.player) this.burst(this.player.pos.x, this.player.pos.y, 0xc9c6c3, 5);
  }

  /** Spawn a short-lived cube-debris burst at a ground position. */
  private burst(x: number, z: number, color: number, n = 8): void {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.12, 0.12),
        new THREE.MeshBasicMaterial({ color }),
      );
      m.position.set(x, 0.6, z);
      const a = Math.random() * Math.PI * 2;
      this.fxGroup.add(m);
      this.parts.push({
        m,
        vx: Math.sin(a) * (1 + Math.random() * 2),
        vz: Math.cos(a) * (1 + Math.random() * 2),
        vy: 2 + Math.random() * 2,
        t: 0.6,
      });
    }
  }

  /* ---------- Game feel / juice ---------- */
  /** Add decaying camera shake (amplitude in world units), capped. */
  private addShake(a: number): void {
    this.shakeAmp = Math.min(0.8, this.shakeAmp + a);
  }
  /** Request a hit-stop of `sec` seconds (slow-mo impact freeze). */
  private freeze(sec: number): void {
    this.hitStop = Math.max(this.hitStop, sec);
  }
  /** Punch the camera in by `m` metres, easing back out. */
  private kickZoom(m: number): void {
    this.zoomKick = Math.min(4, Math.max(this.zoomKick, m));
  }
  /** Dash booster afterimage: a fading, expanding silhouette left behind. */
  private spawnGhost(P: Player): void {
    const now = performance.now();
    if (now - this.lastGhost < 26) return; // throttle so the count stays sane
    this.lastGhost = now;
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 8, 6),
      new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.42, depthWrite: false }),
    );
    m.scale.set(0.85, 0.8, 1.25);
    m.position.set(P.pos.x, 0.62, P.pos.y);
    m.rotation.y = P.facing;
    this.fxGroup.add(m);
    this.ghosts.push({ m, t: 0.32 });
  }

  /* ---------- Combat ---------- */

  /** Player attack — melee arc (downs guards in front) or a ranged projectile. */
  private attack(): void {
    if (this.mode !== 'play' || this.player.downed) return;
    const P = this.player;
    const cb = CHARS[this.charId].combat;
    const now = performance.now() / 1000;
    if (now - P.atkT < cb.atkCd) return;
    P.atkT = now;
    this.sfx.ensure();
    if (cb.atk === 'ranged') {
      this.spawnProjectile(P.pos.x, P.pos.y, P.facing, cb.dmg, cb.projSpeed ?? 24, false);
      // muzzle flash so the shot reads clearly
      this.burst(P.pos.x + Math.sin(P.facing) * 0.9, P.pos.y + Math.cos(P.facing) * 0.9, 0x18a6c4, 8);
      this.addShake(0.09);
      this.kickZoom(0.5);
      this.sfx.dash();
    } else {
      const reach = cb.range * 1.4; // longer reach + a wider arc so hits land
      let hit = false;
      for (const G of this.guards) {
        if (G.down) continue;
        const dx = G.pos.x - P.pos.x;
        const dz = G.pos.y - P.pos.y;
        if (Math.hypot(dx, dz) > reach) continue;
        let a = Math.atan2(dx, dz) - P.facing;
        while (a > Math.PI) a -= Math.PI * 2;
        while (a < -Math.PI) a += Math.PI * 2;
        if (Math.abs(a) < 1.3) {
          this.damageGuard(G, cb.dmg);
          hit = true;
        }
      }
      // melee can also strike the boss (larger reach for its size)
      const bs = this.boss;
      if (bs && bs.hp > 0) {
        const dx = bs.pos.x - P.pos.x;
        const dz = bs.pos.y - P.pos.y;
        if (Math.hypot(dx, dz) < reach + 1.6) {
          let a = Math.atan2(dx, dz) - P.facing;
          while (a > Math.PI) a -= Math.PI * 2;
          while (a < -Math.PI) a += Math.PI * 2;
          if (Math.abs(a) < 1.3) {
            this.damageBoss(cb.dmg);
            hit = true;
          }
        }
      }
      // bigger strike puff + a wide swipe arc flashing the reach in front
      this.burst(
        P.pos.x + Math.sin(P.facing) * reach * 0.55,
        P.pos.y + Math.cos(P.facing) * reach * 0.55,
        ACCENT,
        hit ? 16 : 10,
      );
      this.swipe.position.set(P.pos.x, 0.08, P.pos.y);
      this.swipe.rotation.y = P.facing;
      this.swipe.scale.setScalar(reach * 1.15);
      this.swipe.visible = true;
      this.swipeT = 0.24;
      this.addShake(hit ? 0.28 : 0.12);
      if (hit) this.freeze(0.06);
      this.sfx.ui();
    }
    if ((this.aug.shock || 0) > 0) this.shockwave(P.pos.x, P.pos.y);
  }

  /** Shockwave augment: AoE pulse around a point that scales with its level. */
  private shockwave(x: number, z: number): void {
    const lv = this.aug.shock || 0;
    const r = 2.5 + lv;
    for (const G of this.guards) {
      if (!G.down && Math.hypot(G.pos.x - x, G.pos.y - z) < r) this.damageGuard(G, lv);
    }
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(r * 0.5, 0.12, 8, 28),
      new THREE.MeshBasicMaterial({ color: 0x18a6c4, transparent: true, opacity: 0.7, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.2, z);
    ring.scale.setScalar(0.6);
    this.fxGroup.add(ring);
    this.ghosts.push({ m: ring, t: 0.3 });
  }

  /** Spawn a travelling projectile. `enemy` shots hit the player; player shots hit guards. */
  private spawnProjectile(
    x: number,
    z: number,
    facing: number,
    dmg: number,
    speed: number,
    enemy: boolean,
    pierce = false,
  ): void {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(pierce ? 0.32 : 0.26, 10, 8),
      new THREE.MeshBasicMaterial({ color: enemy ? ACCENT : pierce ? 0xe0a021 : 0x18a6c4 }),
    );
    m.position.set(x, 0.7, z);
    this.fxGroup.add(m);
    this.projectiles.push({
      mesh: m,
      x,
      z,
      vx: Math.sin(facing) * speed,
      vz: Math.cos(facing) * speed,
      life: 2.4,
      dmg,
      enemy,
      pierce,
    });
  }

  /* ---------- Augment-derived stats ---------- */
  /** Signature-skill cooldown after the skillcd augment. */
  private skillCd(): number {
    const base = CHARS[this.charId].skill.cd;
    return base * Math.max(0.4, 1 - 0.15 * (this.aug.skillcd || 0));
  }
  /** Signature-skill damage after the skillpow augment. */
  private skillDmg(): number {
    return (CHARS[this.charId].skill.dmg ?? 2) + 2 * (this.aug.skillpow || 0);
  }
  /** Movement-speed multiplier from the speed augment. */
  private moveMul(): number {
    return 1 + 0.12 * (this.aug.speed || 0);
  }

  /** Skill button press: owl (snipe) holds to aim; others fire instantly. */
  private skillPress(): void {
    if (this.mode !== 'play' || this.player.downed) return;
    const sk = CHARS[this.charId].skill;
    if (performance.now() / 1000 - this.player.skillT < this.skillCd()) return; // on cooldown
    if (sk.id === 'snipe') this.aiming = true;
    else this.skill();
  }

  /** Skill button release: fire the held (owl) snipe shot. */
  private skillRelease(): void {
    if (!this.aiming) return;
    this.aiming = false;
    this.aimLine.visible = false;
    this.$('.pg-b-skill').classList.remove('aim');
    this.skill();
  }

  private skill(): void {
    if (this.mode !== 'play' || this.player.downed) return;
    const now = performance.now() / 1000;
    if (now - this.player.skillT < this.skillCd()) return;
    this.player.skillT = now;
    this.sfx.ensure();
    switch (CHARS[this.charId].skill.id) {
      case 'poop':
        this.skillPoop();
        break;
      case 'backstab':
        this.skillBackstab();
        break;
      case 'snipe':
        this.skillSnipe();
        break;
      default:
        this.skillBlink();
        break;
    }
  }

  /** 비둘기: launch 1..3 orbiting bombs that strike guards they sweep past. */
  private skillPoop(): void {
    const count = 1 + (this.aug.poop || 0);
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.32, 10, 8),
        new THREE.MeshLambertMaterial({ color: 0x8a6a3a }),
      );
      m.position.y = 0.7;
      this.fxGroup.add(m);
      this.orbiters.push({ mesh: m, ang: (i / count) * Math.PI * 2, life: 6, hitT: 0 });
    }
    this.addShake(0.12);
    this.sfx.item();
    this.toast('비둘기똥 전개');
  }

  /** 까치: dash behind the nearest guard in reach and strike hard. */
  private skillBackstab(): void {
    const P = this.player;
    const R = 3 + 2 * (this.aug.backstab || 0);
    let best: Guard | null = null;
    let bd = R;
    for (const G of this.guards) {
      if (G.down) continue;
      const d = Math.hypot(G.pos.x - P.pos.x, G.pos.y - P.pos.y);
      if (d < bd) {
        bd = d;
        best = G;
      }
    }
    this.burst(P.pos.x, P.pos.y, ACCENT, 6);
    if (best) {
      const dx = best.pos.x - P.pos.x;
      const dz = best.pos.y - P.pos.y;
      const dl = Math.hypot(dx, dz) || 1;
      P.pos.set(best.pos.x + (dx / dl) * 1.2, best.pos.y + (dz / dl) * 1.2); // land behind
      this.collide(P.pos, 0.5);
      P.facing = Math.atan2(best.pos.x - P.pos.x, best.pos.y - P.pos.y);
      this.damageGuard(best, this.skillDmg() + 3); // backstab bonus
    } else {
      P.pos.set(P.pos.x + Math.sin(P.facing) * 4, P.pos.y + Math.cos(P.facing) * 4);
      this.collide(P.pos, 0.5);
    }
    this.burst(P.pos.x, P.pos.y, ACCENT, 8);
    this.dashT = performance.now() / 1000; // reuse dash stretch + trail
    this.addShake(0.24);
    this.kickZoom(1.1);
    this.sfx.dash();
  }

  /** 부엉이: a long hitscan snipe beam dealing heavy damage along the aim. */
  private skillSnipe(): void {
    const P = this.player;
    const range = 12 + 4 * (this.aug.snipe || 0);
    const dmg = this.skillDmg() + 4;
    const sinf = Math.sin(P.facing);
    const cosf = Math.cos(P.facing);
    const reach = Math.min(range, this.wallDist(P.pos.x, P.pos.y, P.facing, range));
    for (const G of this.guards) {
      if (G.down) continue;
      const rx = G.pos.x - P.pos.x;
      const rz = G.pos.y - P.pos.y;
      const along = rx * sinf + rz * cosf; // projection onto the beam
      if (along < 0 || along > reach) continue;
      if (Math.abs(rx * cosf - rz * sinf) < 1.1) this.damageGuard(G, dmg); // perpendicular dist
    }
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.05, reach),
      new THREE.MeshBasicMaterial({ color: 0xe0a021, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    beam.position.set(P.pos.x + (sinf * reach) / 2, 0.5, P.pos.y + (cosf * reach) / 2);
    beam.rotation.y = P.facing;
    this.fxGroup.add(beam);
    this.ghosts.push({ m: beam, t: 0.3 }); // reuse the fade-and-remove path
    this.burst(P.pos.x + sinf * 0.9, P.pos.y + cosf * 0.9, 0xe0a021, 8);
    this.addShake(0.24);
    this.kickZoom(1.0);
    this.sfx.dash();
  }

  /** 참새 제비돌격: a fast charge that strikes every guard passed through. */
  private skillBlink(): void {
    const P = this.player;
    const now = performance.now() / 1000;
    const dist = 8 + 3 * (this.aug.dart || 0);
    const sx = P.pos.x;
    const sz = P.pos.y;
    const tx = sx + Math.sin(P.facing) * dist;
    const tz = sz + Math.cos(P.facing) * dist;
    for (let i = 1; i <= 14; i++) {
      const px = sx + (tx - sx) * (i / 14);
      const pz = sz + (tz - sz) * (i / 14);
      for (const G of this.guards)
        if (!G.down && Math.hypot(G.pos.x - px, G.pos.y - pz) < 1.6)
          this.damageGuard(G, this.skillDmg());
    }
    this.burst(sx, sz, ACCENT, 6);
    P.pos.set(tx, tz);
    this.collide(P.pos, 0.5);
    this.burst(P.pos.x, P.pos.y, ACCENT, 8);
    this.dashT = now;
    this.addShake(0.22);
    this.kickZoom(1.1);
    this.sfx.dash();
  }

  /** Roguelite augments: apply a pick, and roll a 3-card choice at stage clear. */
  private applyAug(id: AugId): void {
    this.aug[id] = (this.aug[id] || 0) + 1;
    this.updAugs();
    this.sfx.pickup();
  }

  /** Up to 3 distinct, non-maxed augments offered to the current agent. */
  private rollAugChoices(): AugId[] {
    const pool = poolFor(this.charId).filter((a) => (this.aug[a.id] || 0) < a.max);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, 3).map((a) => a.id);
  }

  /** HUD strip of acquired augments with level pips. */
  private updAugs(): void {
    const el = this.$<HTMLElement>('.pg-augs');
    if (!el) return;
    let h = '';
    for (const a of AUGMENTS) {
      const lv = this.aug[a.id] || 0;
      if (lv <= 0) continue;
      let pips = '';
      for (let i = 0; i < a.max; i++) pips += '<i' + (i < lv ? ' class="on"' : '') + '></i>';
      h +=
        '<div class="ag" style="--c:#' +
        a.color.toString(16).padStart(6, '0') +
        '"><span class="ic">' +
        a.icon +
        '</span><span class="nm">' +
        a.name +
        '</span><span class="pips">' +
        pips +
        '</span></div>';
    }
    el.innerHTML = h;
    el.classList.toggle('show', h !== '');
  }

  /** Take a guard down: incapacitated, laid flat, no longer a threat. */
  private downGuard(G: Guard): void {
    if (G.down) return;
    G.down = true;
    G.state = 'patrol';
    G.detect = 0;
    G.wind = 0;
    G.lunge = 0;
    G.bang.visible = false;
    G.cone.visible = false;
    G.tele.visible = false;
    G.hpbar.visible = false;
    G.model.group.rotation.z = Math.PI / 2;
    G.model.group.position.y = 0.15;
    this.burst(G.pos.x, G.pos.y, 0x8a8683, 8);
    this.sfx.pickup();
  }

  /** Deal damage to a guard; downs it at 0 HP. Shows its overhead HP bar. */
  private damageGuard(G: Guard, dmg: number): void {
    if (G.down) return;
    G.hp -= dmg;
    G.aggro = 3; // getting hit alerts the guard even without line of sight
    G.hurtFlash = 1;
    G.hpbar.visible = true;
    G.hpbar.scale.x = 1.9 * Math.max(0, G.hp / G.maxHp);
    // knock the guard back off the player + a bold two-tone hit spark
    const kx = G.pos.x - this.player.pos.x;
    const kz = G.pos.y - this.player.pos.y;
    const kl = Math.hypot(kx, kz) || 1;
    G.pos.x += (kx / kl) * 0.5;
    G.pos.y += (kz / kl) * 0.5;
    this.collide(G.pos, 0.55);
    this.burst(G.pos.x, G.pos.y, ACCENT, 12);
    this.burst(G.pos.x, G.pos.y, 0xffffff, 8);
    this.addShake(0.12);
    if (G.hp <= 0) this.downGuard(G);
    else this.sfx.spotted();
  }

  /** Apply damage to the player (with a brief invulnerability window). */
  private hurtPlayer(dmg: number): void {
    const P = this.player;
    const now = performance.now();
    if (P.downed) return; // already incapacitated
    if (now < P.hurtUntil || now < P.braceUntil) return; // i-frames or brace immunity
    P.hurtUntil = now + 700;
    this.hurtFxUntil = now + 340; // red screen vignette flash
    // all hurtPlayer callers are enemy sources → scale by difficulty
    P.hp -= Math.max(1, Math.round(dmg * DIFFS[this.diffId].atk));
    this.addShake(0.32);
    this.freeze(0.06);
    this.kickZoom(1.4);
    this.sfx.spotted();
    if (P.hp <= 0) {
      P.hp = 0;
      // co-op: go down instead of failing while the guest is still up
      const teammateUp = this.net.role() !== 'solo' && this.guestMax > 0 && !this.guestDown;
      if (teammateUp) {
        P.downed = true;
        this.toast('쓰러졌다 — 동료가 구역을 클리어하면 부활한다');
        this.addShake(0.4);
      } else {
        this.updHp();
        this.fail();
        return;
      }
    }
    this.updHp();
  }

  /** A teammate seen within the last few seconds (co-op), else null. */
  private livePeer(): Peer | null {
    const now = performance.now();
    for (const id in this.net.peers) {
      const p = this.net.peers[id];
      if (now - p.seen < 5000) return p;
    }
    return null;
  }

  /** Host-side: apply damage to the guest (host-authoritative guest HP). */
  private hurtGuest(dmg: number): void {
    const now = performance.now();
    if (this.guestMax <= 0 || this.guestDown) return;
    if (now < this.guestHurt) return;
    this.guestHurt = now + 700;
    this.guestHp -= Math.max(1, Math.round(dmg * DIFFS[this.diffId].atk));
    if (this.guestHp <= 0) {
      this.guestHp = 0;
      if (!this.player.downed) this.guestDown = true; // teammate up → guest goes down
      else this.fail(); // both down
    }
  }

  /** Enemy damage at a point: hits the host player and/or the guest within radius. */
  private hurtAt(x: number, z: number, r: number, dmg: number): boolean {
    let hit = false;
    const P = this.player;
    if (!P.downed && Math.hypot(x - P.pos.x, z - P.pos.y) < r) {
      this.hurtPlayer(dmg);
      hit = true;
    }
    const gp = this.guestPos();
    if (gp && this.guestMax > 0 && !this.guestDown && Math.hypot(x - gp.x, z - gp.z) < r) {
      this.hurtGuest(dmg);
      hit = true;
    }
    return hit;
  }

  /** Redraw the HP pip bar. */
  private updHp(): void {
    const P = this.player;
    if (!P) return;
    const ratio = P.maxHp > 0 ? Math.max(0, P.hp / P.maxHp) : 0;
    this.$<HTMLElement>('.pg-hp-fill').style.width = ratio * 100 + '%';
    this.$('.pg-hp-n').textContent = Math.max(0, Math.ceil(P.hp)) + ' / ' + P.maxHp;
    this.$<HTMLElement>('.pg-hp').classList.toggle('low', ratio <= 0.34);
  }

  /** Co-op: teammate HP pips + downed marker. */
  private updPeerHp(): void {
    const peer = this.livePeer();
    const el = this.$<HTMLElement>('.pg-peerhp');
    if (!peer || !peer.mhp) {
      el.classList.remove('show');
      return;
    }
    el.classList.add('show');
    el.classList.toggle('down', peer.down === 1);
    let s = '<span class="l">' + (peer.name || '동료') + '</span>';
    for (let i = 0; i < peer.mhp; i++) s += i < peer.hp ? '<i></i>' : '<i class="e"></i>';
    if (peer.down === 1) s += '<span class="l" style="color:#ec3013;margin-left:4px">DOWN</span>';
    el.innerHTML = s;
  }

  /** Ability-slot cooldown sweeps (attack / skill / dash), Duckov-style. */
  private updAbilities(t: number): void {
    const P = this.player;
    const C = CHARS[this.charId];
    const slot = (cls: string, last: number, cd: number) => {
      const el = this.$<HTMLElement>(cls + ' .cd');
      const rem = Math.max(0, cd - (t - last));
      if (rem > 0.05) {
        el.style.background =
          'conic-gradient(rgba(20,18,17,.5) ' + (rem / cd) * 360 + 'deg, transparent 0)';
        el.textContent = rem >= 0.6 ? String(Math.ceil(rem)) : '';
      } else {
        el.style.background = 'transparent';
        el.textContent = '';
      }
    };
    slot('.pg-b-skill', P.skillT, C.skill.cd);
    slot('.pg-b-dash', this.dashT, C.dashCd);
    this.$('.pg-b-attack').classList.toggle('dim', t - P.atkT < C.combat.atkCd);
    // crouch shows its reuse cooldown only while standing
    if (P.crouch) {
      const cr = this.$<HTMLElement>('.pg-b-crouch .cd');
      cr.style.background = 'transparent';
      cr.textContent = '';
    } else {
      slot('.pg-b-crouch', this.crouchT, PigeonGame.CROUCH_CD);
    }
  }

  /* ---------- Boss ---------- */
  private updBossHp(): void {
    const b = this.boss;
    const el = this.$<HTMLElement>('.pg-bosshp');
    if (!b || b.hp <= 0) {
      el.classList.remove('show');
      return;
    }
    el.classList.add('show');
    this.$<HTMLElement>('.pg-bosshpfill').style.width = Math.max(0, (b.hp / b.maxHp) * 100) + '%';
  }

  private damageBoss(dmg: number): void {
    const b = this.boss;
    if (!b || b.hp <= 0) return;
    b.hp -= dmg;
    b.hurtFlash = 1;
    this.burst(b.pos.x, b.pos.y, 0xec3013, 6);
    this.sfx.spotted();
    this.updBossHp();
    if (b.hp <= 0) {
      b.tele.visible = false;
      b.ring.visible = false;
      this.burst(b.pos.x, b.pos.y, 0xec3013, 24);
      this.addShake(0.6);
      this.freeze(0.15);
      this.clearStage();
    }
  }

  /** Boss AI: cycle through spread-shot / charge / slam, each telegraphed. */
  private bossTick(dt: number, t: number): void {
    const b = this.boss;
    if (!b || b.hp <= 0) return;
    const P = this.player;
    const pdx = P.pos.x - b.pos.x;
    const pdz = P.pos.y - b.pos.y;
    const pdist = Math.hypot(pdx, pdz) || 0.001;
    const enrage = b.hp < b.maxHp * 0.4;
    const wind = DIFFS[this.diffId].wind;
    const face = () => {
      let da = Math.atan2(pdx, pdz) - b.facing;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      b.facing += da * Math.min(1, dt * (b.phase === 1 ? 4 : 3));
    };
    b.timer -= dt;
    b.hurtFlash = Math.max(0, b.hurtFlash - dt * 3);
    if (b.phase === 0) {
      face();
      if (pdist > 8) {
        b.pos.x += Math.sin(b.facing) * 4.6 * dt;
        b.pos.y += Math.cos(b.facing) * 4.6 * dt;
        this.collide(b.pos, 1.3);
      }
      if (b.timer <= 0) {
        b.pattern = (b.pattern + 1) % 3;
        b.phase = 1;
        b.timer = (b.pattern === 0 ? 0.9 : b.pattern === 1 ? 0.7 : 1.0) * (enrage ? 0.7 : 1) * wind;
      }
    } else if (b.phase === 1) {
      face();
      const fl = 0.25 + 0.4 * Math.abs(Math.sin(t * 22));
      if (b.pattern === 2) {
        b.ring.visible = true;
        b.ring.position.set(b.pos.x, 0.06, b.pos.y);
        b.ring.scale.setScalar(10);
        (b.ring.material as THREE.MeshBasicMaterial).opacity = fl;
      } else {
        const len = b.pattern === 0 ? 16 : 14;
        b.tele.visible = true;
        b.tele.scale.set(b.pattern === 0 ? 3.4 : 1.6, 1, len);
        b.tele.rotation.y = b.facing;
        b.tele.position.set(
          b.pos.x + (Math.sin(b.facing) * len) / 2,
          0.1,
          b.pos.y + (Math.cos(b.facing) * len) / 2,
        );
        (b.tele.material as THREE.MeshBasicMaterial).opacity = fl;
      }
      if (b.timer <= 0) {
        b.tele.visible = false;
        b.ring.visible = false;
        if (b.pattern === 0) {
          for (const off of [-0.6, -0.3, 0, 0.3, 0.6])
            this.spawnProjectile(b.pos.x, b.pos.y, b.facing + off, 1, 17, true);
          this.sfx.alert();
          b.phase = 0;
          b.timer = enrage ? 0.8 : 1.2;
        } else if (b.pattern === 1) {
          b.lvx = Math.sin(b.facing) * 23;
          b.lvz = Math.cos(b.facing) * 23;
          b.phase = 2;
          b.timer = 0.55;
        } else {
          this.hurtAt(b.pos.x, b.pos.y, 10, 2);
          this.burst(b.pos.x, b.pos.y, 0xec3013, 16);
          this.addShake(0.4);
          b.phase = 0;
          b.timer = enrage ? 0.8 : 1.2;
        }
      }
    } else {
      b.pos.x += b.lvx * dt;
      b.pos.y += b.lvz * dt;
      this.collide(b.pos, 1.3);
      this.hurtAt(b.pos.x, b.pos.y, 1.8, 2);
      if (b.timer <= 0) {
        b.phase = 0;
        b.timer = enrage ? 0.8 : 1.2;
      }
    }
    b.model.group.position.set(b.pos.x, 0, b.pos.y);
    b.model.group.rotation.y = b.facing;
    b.model.group.scale.setScalar(2.6 * (1 + b.hurtFlash * 0.06));
    animBird(b.model, { speed: b.phase === 2 ? 18 : 2, dt, t, crouch: false });
  }

  /* ---------- Overlays ---------- */
  private overlay(html: string): void {
    const ov = this.$<HTMLElement>('.pg-overlay');
    ov.innerHTML = html;
    ov.classList.add('show');
    ov.style.pointerEvents = 'auto';
  }
  private closeOverlay(): void {
    this.$('.pg-overlay').classList.remove('show');
  }

  private showTitle(): void {
    this.mode = 'menu';
    this.aug = {};
    this.paused = false;
    if (this.canInstall) this.$('.pg-install').classList.add('show');
    this.net.disconnect(); // returning to title = leave the room (frees the DO slot)
    this.sfx.stopAmb();
    this.buildLevel(0);
    this.toggleDrawer(false);

    let charBtns = '';
    for (const cid of CHAR_ORDER) {
      const C = CHARS[cid];
      charBtns +=
        '<button class="pg-char' +
        (cid === this.charId ? ' sel' : '') +
        '" data-c="' +
        cid +
        '">' +
        '<span class="nm">' +
        C.name +
        '</span><span class="rl">' +
        C.role +
        '</span><span class="ds">' +
        C.desc +
        '</span></button>';
    }
    let diffBtns = '';
    for (const did of DIFF_ORDER) {
      diffBtns +=
        '<button data-d="' +
        did +
        '" class="' +
        (did === this.diffId ? 'sel' : '') +
        '">' +
        DIFFS[did].name +
        '</button>';
    }
    const coneBtns =
      '<button data-v="true" class="' +
      (this.showCones ? 'sel' : '') +
      '">켜짐</button><button data-v="false" class="' +
      (!this.showCones ? 'sel' : '') +
      '">꺼짐</button>';
    if (this.startStageIdx > this.unlock) this.startStageIdx = 0;
    let stageBtns = '';
    for (let sI = 0; sI < LEVELS.length; sI++) {
      const locked = sI > this.unlock;
      const bst = this.best['s' + sI];
      stageBtns +=
        '<button data-s="' +
        sI +
        '"' +
        (locked ? ' disabled' : '') +
        ' class="' +
        (sI === this.startStageIdx ? 'sel' : '') +
        '">' +
        ('0' + (sI + 1)) +
        (locked ? ' 잠금' : bst ? ' · ' + bst.rank : '') +
        '</button>';
    }

    this.overlay(
      '<div class="pg-panel"><div class="hd"><span class="k">Classified</span><h1>Pigeon Protocol<br>비둘기 특무</h1></div>' +
        '<div class="bd">' +
        '<div class="pg-lbl">요원 선택</div><div class="pg-chars">' +
        charBtns +
        '</div>' +
        '<div class="pg-lbl">난이도</div><div class="pg-seg pg-diff">' +
        diffBtns +
        '</div>' +
        '<div class="pg-lbl">스테이지 (클리어 시 해제 · 최고 랭크)</div><div class="pg-seg pg-stagesel">' +
        stageBtns +
        '</div>' +
        '<div class="pg-lbl">설정</div>' +
        '<div class="pg-set">' +
        '<div class="pg-field"><label>경비 시야콘 표시</label><div class="pg-toggle pg-cone">' +
        coneBtns +
        '</div></div>' +
        '<div class="pg-field"><label>카메라 거리</label><div class="pg-range">' +
        '<input class="pg-cam" type="range" min="11" max="24" step="1" value="' +
        this.camDist +
        '"><span class="val">' +
        this.camDist +
        'm</span></div></div>' +
        '</div>' +
        '<div class="pg-lbl">신원</div>' +
        '<div class="pg-row">' +
        '<div class="pg-field"><label>콜사인</label><input class="pg-name" maxlength="10" value="' +
        (this.savedName || 'AGENT-' + Math.floor(Math.random() * 90 + 10)) +
        '"></div>' +
        '<div class="pg-field"><label>작전 방 코드 (온라인 · 선택)</label><input class="pg-room" maxlength="12" placeholder="예: NEST-7"></div>' +
        '</div>' +
        '<div class="pg-lbl">브리핑</div>' +
        '<ul class="pg-rules">' +
        '<li><b>이동</b><span>WASD / 방향키 · 모바일: 화면 아무 곳이나 눌러 드래그</span></li>' +
        '<li><b>일시정지 (Esc)</b><span>카메라 거리·사운드 조절 / 재시도</span></li>' +
        '<li><b>숨기 (C)</b><span>느리지만 덜 띈다. 청록색 은폐 구역에선 완전 은신</span></li>' +
        '<li><b>공격 (F)</b><span>요원 성향에 따라 근접 타격 또는 원거리 사격. 경비 제압</span></li>' +
        '<li><b>스킬 (E)</b><span>' +
        CHARS[this.charId].skill.name +
        ' — ' +
        CHARS[this.charId].skill.desc +
        '</span></li>' +
        '<li><b>대시 (Shift)</b><span>짧은 돌진</span></li>' +
        '<li><b>미끼 (1)</b><span>경비를 그 자리로 유인</span></li>' +
        '<li><b>연막 (2)</b><span>5초간 완전 은신</span></li>' +
        '<li><b>임무 (Tab)</b><span>체크리스트 · 장비 · 참가자 확인</span></li>' +
        '</ul>' +
        '<div class="pg-hint">같은 방 코드의 요원이 함께 보이며, 상단 MIC 버튼으로 음성채팅(P2P)이 연결됩니다. 무료 공개 릴레이라 불안정할 수 있고, 방 코드를 비우면 싱글 작전입니다.</div>' +
        '</div>' +
        '<div class="ft"><button class="pg-btn pg-go">작전 개시 →</button></div></div>',
    );

    const ov = this.$<HTMLElement>('.pg-overlay');
    ov.querySelectorAll('.pg-char').forEach((b) => {
      b.addEventListener('click', () => {
        this.charId = b.getAttribute('data-c') as CharId;
        ov.querySelectorAll('.pg-char').forEach((x) => x.classList.toggle('sel', x === b));
        this.sfx.ensure();
        this.sfx.ui();
      });
    });
    ov.querySelectorAll('.pg-diff button').forEach((b) => {
      b.addEventListener('click', () => {
        this.diffId = b.getAttribute('data-d') as DiffId;
        ov.querySelectorAll('.pg-diff button').forEach((x) => x.classList.toggle('sel', x === b));
        this.sfx.ensure();
        this.sfx.ui();
      });
    });
    ov.querySelectorAll('.pg-cone button').forEach((b) => {
      b.addEventListener('click', () => {
        this.showCones = b.getAttribute('data-v') === 'true';
        ov.querySelectorAll('.pg-cone button').forEach((x) => x.classList.toggle('sel', x === b));
        this.applyCones();
        this.sfx.ensure();
        this.sfx.ui();
      });
    });
    ov.querySelectorAll<HTMLButtonElement>('.pg-stagesel button').forEach((b) => {
      b.addEventListener('click', () => {
        if (b.disabled) return;
        this.startStageIdx = parseInt(b.getAttribute('data-s') || '0', 10) || 0;
        ov.querySelectorAll('.pg-stagesel button').forEach((x) => x.classList.toggle('sel', x === b));
        this.sfx.ensure();
        this.sfx.ui();
      });
    });
    const cam = this.$<HTMLInputElement>('.pg-cam');
    const camVal = ov.querySelector('.pg-range .val') as HTMLElement;
    cam.addEventListener('input', () => {
      this.camDist = parseFloat(cam.value) || 16;
      camVal.textContent = cam.value + 'm';
    });

    this.$('.pg-go').addEventListener('click', () => {
      this.sfx.ensure();
      this.sfx.ui();
      const room = (this.$<HTMLInputElement>('.pg-room').value || '').trim().toUpperCase();
      const name = (this.$<HTMLInputElement>('.pg-name').value || 'AGENT').trim();
      if (room && this.net.status !== 'on') this.net.connect(room, name);
      else this.net.name = name;
      this.netStatus();
      try {
        localStorage.setItem(
          'pp_prefs',
          JSON.stringify({ char: this.charId, diff: this.diffId, name }),
        );
      } catch {
        /* storage unavailable */
      }
      this.spawnPlayer();
      this.startStage(this.startStageIdx);
    });
  }

  private startStage(idx: number): void {
    this.aiming = false;
    if (this.aimLine) this.aimLine.visible = false;
    if (idx === 0) this.aug = {}; // fresh run — clear augments
    this.$('.pg-install').classList.remove('show');
    this.buildLevel(idx);
    this.updAugs();
    this.mode = 'brief';
    const L = LEVELS[idx];
    this.overlay(
      '<div class="pg-panel"><div class="hd"><span class="k">Stage ' +
        (idx + 1) +
        '/' +
        LEVELS.length +
        ' · ' +
        DIFFS[this.diffId].name +
        '</span><h1>' +
        L.name +
        '</h1></div>' +
        '<div class="bd"><p>' +
        L.brief +
        '</p>' +
        '<ul class="pg-rules">' +
        '<li><b>필름</b><span>' +
        L.films.length +
        '개</span></li>' +
        '<li><b>경비</b><span>' +
        L.guards.length +
        '명</span></li>' +
        '<li><b>요원</b><span>' +
        CHARS[this.charId].name +
        ' · ' +
        CHARS[this.charId].role +
        '</span></li>' +
        '</ul></div>' +
        '<div class="ft"><button class="pg-btn pg-go2">잠입 →</button></div></div>',
    );
    this.$('.pg-go2').addEventListener('click', () => {
      this.sfx.ensure();
      this.sfx.ui();
      this.sfx.startAmb();
      this.closeOverlay();
      this.mode = 'play';
    });
  }

  private fail(): void {
    if (this.mode !== 'play') return;
    this.mode = 'fail';
    // heavy impact on capture
    this.addShake(0.55);
    this.freeze(0.14);
    this.kickZoom(2.4);
    this.sfx.stopAmb();
    this.sfx.fail();
    this.overlay(
      '<div class="pg-panel"><div class="hd"><span class="k">Mission failed</span><h1>발각되었다</h1></div>' +
        '<div class="bd"><p>경비에게 붙잡혔다. 같은 스테이지를 처음부터 다시 시도한다.</p></div>' +
        '<div class="ft"><button class="pg-btn pg-retry">재시도 →</button><button class="pg-btn ghost pg-menu">타이틀로</button></div></div>',
    );
    this.$('.pg-retry').addEventListener('click', () => this.startStage(this.stageIdx));
    this.$('.pg-menu').addEventListener('click', () => this.showTitle());
  }

  /* ---------- Pause / in-game options ---------- */
  private pause(): void {
    if (this.mode !== 'play' || this.paused) return;
    this.paused = true;
    this.sfx.stopAmb();
    const on = !this.sfx.muted;
    this.overlay(
      '<div class="pg-panel"><div class="hd"><span class="k">Paused</span><h1>일시정지</h1></div>' +
        '<div class="bd"><div class="pg-set">' +
        '<div class="pg-field"><label>카메라 거리</label><div class="pg-range"><input class="pg-cam2" type="range" min="11" max="24" step="1" value="' +
        this.camDist +
        '"><span class="val">' +
        this.camDist +
        'm</span></div></div>' +
        '<div class="pg-field"><label>사운드</label><div class="pg-toggle pg-sound">' +
        '<button data-v="1"' +
        (on ? ' class="sel"' : '') +
        '>켜짐</button><button data-v="0"' +
        (on ? '' : ' class="sel"') +
        '>꺼짐</button></div></div>' +
        '</div></div>' +
        '<div class="ft"><button class="pg-btn pg-resume">재개 →</button><button class="pg-btn ghost pg-retry2">재시도</button><button class="pg-btn ghost pg-menu2">타이틀로</button></div></div>',
    );
    const cam = this.$<HTMLInputElement>('.pg-cam2');
    cam.addEventListener('input', () => {
      this.camDist = parseFloat(cam.value) || 16;
      (this.$('.pg-cam2') as HTMLElement).parentElement!.querySelector('.val')!.textContent =
        cam.value + 'm';
    });
    this.host.querySelectorAll('.pg-sound button').forEach((b) =>
      b.addEventListener('click', () => {
        this.setSound((b as HTMLElement).dataset.v === '1');
        this.host.querySelectorAll('.pg-sound button').forEach((x) => x.classList.remove('sel'));
        b.classList.add('sel');
      }),
    );
    this.$('.pg-resume').addEventListener('click', () => this.resume());
    this.$('.pg-retry2').addEventListener('click', () => {
      this.paused = false;
      this.startStage(this.stageIdx);
    });
    this.$('.pg-menu2').addEventListener('click', () => {
      this.paused = false;
      this.showTitle();
    });
  }

  private resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.closeOverlay();
    if (!this.sfx.muted) {
      this.sfx.ensure();
      this.sfx.startAmb();
    }
  }

  private setSound(on: boolean): void {
    this.sfx.muted = !on;
    try {
      localStorage.setItem('pp_sound', on ? '1' : '0');
    } catch {
      /* storage unavailable */
    }
    if (!on) this.sfx.stopAmb();
  }

  private clearStage(): void {
    this.mode = 'clear';
    this.sfx.stopAmb();
    this.sfx.clear();
    const last = this.stageIdx >= LEVELS.length - 1;
    const secs = Math.round(this.stageTime);
    const mmss = Math.floor(secs / 60) + ':' + ('0' + (secs % 60)).slice(-2);
    const par = [90, 150, 210][this.stageIdx] || 120;
    const rank =
      this.spotted === 0 && secs <= par
        ? 'S'
        : this.spotted <= 1 && secs <= par * 1.5
          ? 'A'
          : this.spotted <= 3
            ? 'B'
            : 'C';
    const order: Record<string, number> = { S: 4, A: 3, B: 2, C: 1 };
    try {
      const key = 's' + this.stageIdx;
      const prev = this.best[key];
      if (
        !prev ||
        order[rank] > order[prev.rank] ||
        (order[rank] === order[prev.rank] && secs < prev.time)
      ) {
        this.best[key] = { rank, time: secs };
        localStorage.setItem('pp_best', JSON.stringify(this.best));
      }
      if (!last && this.stageIdx + 1 > this.unlock) {
        this.unlock = this.stageIdx + 1;
        localStorage.setItem('pp_unlock', String(this.unlock));
      }
    } catch {
      /* storage unavailable */
    }
    const nextIdx = this.stageIdx + 1;
    const choices = last ? [] : this.rollAugChoices();
    let cards = '';
    if (choices.length) {
      cards = '<div class="pg-cardhd">증강 선택 — 하나를 고르시오</div><div class="pg-cards">';
      for (const id of choices) {
        const a = augDef(id);
        const lv = (this.aug[id] || 0) + 1;
        cards +=
          '<button class="pg-card" data-a="' +
          id +
          '" style="--c:#' +
          a.color.toString(16).padStart(6, '0') +
          '"><span class="ic">' +
          a.icon +
          '</span><span class="nm">' +
          a.name +
          '</span><span class="lv">Lv.' +
          lv +
          ' / ' +
          a.max +
          '</span><span class="ds">' +
          a.desc +
          '</span></button>';
      }
      cards += '</div>';
    }
    this.overlay(
      '<div class="pg-panel"><div class="hd"><span class="k">' +
        (last ? 'All clear' : 'Stage clear') +
        ' · Rank ' +
        rank +
        '</span><h1>' +
        (last ? '작전 완수' : '구역 정리 완료') +
        '</h1></div>' +
        '<div class="bd"><p>' +
        (last
          ? '적 사령관을 제압했다. 작전 완수 — 훌륭한 비행이었다, 요원.'
          : '적 경비를 전원 제압했다. 증강을 하나 획득하고 다음 구역으로 이동한다.') +
        '</p>' +
        '<ul class="pg-rules">' +
        '<li><b>랭크</b><span>' +
        rank +
        '</span></li>' +
        '<li><b>시간</b><span>' +
        mmss +
        '</span></li>' +
        '<li><b>발각</b><span>' +
        this.spotted +
        '회</span></li>' +
        '</ul>' +
        cards +
        '</div>' +
        '<div class="ft">' +
        (last
          ? '<button class="pg-btn pg-again">처음부터 →</button>'
          : choices.length
            ? ''
            : '<button class="pg-btn pg-next">다음 스테이지 →</button>') +
        '<button class="pg-btn ghost pg-menu">타이틀로</button></div></div>',
    );
    if (last) {
      this.$('.pg-again').addEventListener('click', () => this.startStage(0));
    } else if (choices.length) {
      this.overlayEl().querySelectorAll<HTMLElement>('.pg-card').forEach((c) => {
        c.addEventListener('click', () => {
          this.applyAug(c.dataset.a as AugId);
          this.startStage(nextIdx);
        });
      });
    } else {
      this.$('.pg-next').addEventListener('click', () => this.startStage(nextIdx));
    }
    this.$('.pg-menu').addEventListener('click', () => this.showTitle());
  }

  private overlayEl(): HTMLElement {
    return this.$<HTMLElement>('.pg-overlay');
  }

  /* ---------- Sim helpers ---------- */
  private inWall(x: number, z: number, pad = 0): boolean {
    for (const w of this.walls) {
      if (x > w.minX - pad && x < w.maxX + pad && z > w.minZ - pad && z < w.maxZ + pad) return true;
    }
    return false;
  }

  /** Distance forward (along `facing`) until a wall blocks — used to clip the vision cone. */
  private wallDist(x: number, z: number, facing: number, max: number): number {
    const sx = Math.sin(facing);
    const sz = Math.cos(facing);
    for (let d = 0.4; d < max; d += 0.4) if (this.inWall(x + sx * d, z + sz * d, 0)) return d;
    return max;
  }
  private los(ax: number, az: number, bx: number, bz: number): boolean {
    const dx = bx - ax;
    const dz = bz - az;
    const dist = Math.hypot(dx, dz);
    const steps = Math.ceil(dist / 0.25);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (this.inWall(ax + dx * t, az + dz * t, 0)) return false;
    }
    return true;
  }
  private inCover(x: number, z: number): boolean {
    for (const c of this.covers) {
      if (x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ) return true;
    }
    return false;
  }
  /** Returns true if the actor was pushed out of a wall this call (for FX). */
  private collide(pos: THREE.Vector2, r: number): boolean {
    let hit = false;
    const hw = this.level.w / 2 - r;
    const hd = this.level.d / 2 - r;
    pos.x = Math.max(-hw, Math.min(hw, pos.x));
    pos.y = Math.max(-hd, Math.min(hd, pos.y));
    for (const w of this.walls) {
      // Minkowski-expanded AABB: grow the wall by the actor radius; if the point
      // lands inside, push it out along the axis of least penetration. Unlike the
      // old closest-point test this also resolves DEEP penetration (center inside
      // the wall), which let thin walls / fast dashes / low-fps steps tunnel through.
      const minX = w.minX - r;
      const maxX = w.maxX + r;
      const minZ = w.minZ - r;
      const maxZ = w.maxZ + r;
      if (pos.x > minX && pos.x < maxX && pos.y > minZ && pos.y < maxZ) {
        const dL = pos.x - minX;
        const dR = maxX - pos.x;
        const dT = pos.y - minZ;
        const dB = maxZ - pos.y;
        const m = Math.min(dL, dR, dT, dB);
        if (m === dL) pos.x = minX;
        else if (m === dR) pos.x = maxX;
        else if (m === dT) pos.y = minZ;
        else pos.y = maxZ;
        hit = true;
      }
    }
    return hit;
  }

  /**
   * Next point a guard should steer toward to reach (gx,gz) without walking
   * through walls. Straight line when there's clear line-of-sight; otherwise
   * an A* route is cached and followed, recomputed periodically or when the
   * goal moves. Keeps chases feeling direct in the open, correct around walls.
   */
  private guardWaypoint(G: Guard, gx: number, gz: number, dt: number): { x: number; z: number } {
    G.repathT -= dt;
    if (this.los(G.pos.x, G.pos.y, gx, gz)) {
      G.navPath = null;
      return { x: gx, z: gz };
    }
    const goalMoved = Math.hypot(gx - G.goalX, gz - G.goalZ) > 2;
    if (!G.navPath || G.repathT <= 0 || goalMoved) {
      G.navPath = findPath(this.nav, G.pos.x, G.pos.y, gx, gz);
      G.navIdx = 0;
      G.repathT = 0.4;
      G.goalX = gx;
      G.goalZ = gz;
    }
    const path = G.navPath;
    if (!path || !path.length) return { x: gx, z: gz };
    while (
      G.navIdx < path.length - 1 &&
      Math.hypot(path[G.navIdx].x - G.pos.x, path[G.navIdx].z - G.pos.y) < 0.7
    ) {
      G.navIdx++;
    }
    return path[G.navIdx];
  }

  /* ---------- Main loop ---------- */
  private loop(): void {
    this.last = performance.now();
    const frame = (now: number) => {
      this.rafId = requestAnimationFrame(frame);
      const realDt = Math.min((now - this.last) / 1000, 0.05);
      this.last = now;
      // hit-stop: briefly crush the sim step to ~0 for impact on big events
      if (this.hitStop > 0) this.hitStop -= realDt;
      const dt = this.hitStop > 0 ? realDt * 0.06 : realDt;
      const t = now / 1000;
      const P = this.player;
      const C = CHARS[this.charId];
      let speed = 0;
      // player animation drivers, set inside the play block, read at render
      let pTurn = 0;
      let pLook = 0;
      let threatX = 0;
      let threatZ = 0;
      let threatW = 0;
      this.rosterT += dt;
      if (this.rosterT > 1) {
        this.rosterT = 0;
        this.updRoster();
        if (this.$('.pg-drawer').classList.contains('open')) this.updDrawer();
      }
      const smokeActive = t < (P.smokeUntil || 0);
      if (P.smokeShell) {
        P.smokeShell.visible = smokeActive;
        if (smokeActive) {
          (P.smokeShell.material as THREE.MeshBasicMaterial).opacity = 0.25 + Math.sin(t * 6) * 0.1;
          P.smokeShell.rotation.y = t;
        }
      }
      // brace-immunity shell + skill cooldown dim on the button
      const braceOn = performance.now() < P.braceUntil;
      if (P.braceShell) {
        P.braceShell.visible = braceOn;
        if (braceOn) (P.braceShell.material as THREE.MeshBasicMaterial).opacity = 0.22 + Math.sin(t * 10) * 0.1;
      }
      if (this.mode === 'play') {
        this.updAbilities(t);
        this.updPeerHp();
      }
      for (let pI = this.parts.length - 1; pI >= 0; pI--) {
        const pp = this.parts[pI];
        pp.t -= dt;
        pp.vy -= 8 * dt;
        pp.m.position.x += pp.vx * dt;
        pp.m.position.z += pp.vz * dt;
        pp.m.position.y += pp.vy * dt;
        pp.m.scale.setScalar(Math.max(pp.t / 0.6, 0.01));
        if (pp.t <= 0 || pp.m.position.y < 0.02) {
          this.fxGroup.remove(pp.m);
          this.parts.splice(pI, 1);
        }
      }
      // dash afterimages: fade + swell, then dispose
      for (let gI = this.ghosts.length - 1; gI >= 0; gI--) {
        const gh = this.ghosts[gI];
        gh.t -= dt;
        (gh.m.material as THREE.MeshBasicMaterial).opacity = 0.42 * Math.max(0, gh.t / 0.32);
        gh.m.scale.multiplyScalar(1 + dt * 0.6);
        if (gh.t <= 0) {
          this.fxGroup.remove(gh.m);
          (gh.m.material as THREE.Material).dispose();
          gh.m.geometry.dispose();
          this.ghosts.splice(gI, 1);
        }
      }
      // 비둘기똥 orbiters: circle the player, striking guards they sweep past
      if (this.orbiters.length) {
        const OR = 1.7;
        for (let oi = this.orbiters.length - 1; oi >= 0; oi--) {
          const o = this.orbiters[oi];
          o.life -= dt;
          o.ang += dt * 3.2;
          o.hitT -= dt;
          const ox = P.pos.x + Math.sin(o.ang) * OR;
          const oz = P.pos.y + Math.cos(o.ang) * OR;
          o.mesh.position.set(ox, 0.7, oz);
          if (o.hitT <= 0 && this.mode === 'play') {
            for (const G of this.guards) {
              if (G.down) continue;
              if (Math.hypot(G.pos.x - ox, G.pos.y - oz) < 0.9) {
                this.damageGuard(G, this.skillDmg());
                o.hitT = 0.5;
                break;
              }
            }
          }
          if (o.life <= 0) {
            this.fxGroup.remove(o.mesh);
            (o.mesh.material as THREE.Material).dispose();
            o.mesh.geometry.dispose();
            this.orbiters.splice(oi, 1);
          }
        }
      }
      // damage vignette flash (drains after a hit)
      {
        const hv = Math.max(0, (this.hurtFxUntil - now) / 340);
        this.$<HTMLElement>('.pg-hurt').style.opacity = String(hv * 0.9);
      }
      // melee swipe arc fade
      if (this.swipeT > 0) {
        this.swipeT -= realDt;
        (this.swipe.material as THREE.MeshBasicMaterial).opacity = 0.72 * Math.max(0, this.swipeT / 0.24);
        if (this.swipeT <= 0) this.swipe.visible = false;
      }
      if (this.mode !== 'play' && this.arrow) this.arrow.visible = false;
      if (this.mode === 'play' && !this.paused) {
        this.stageTime += dt;
        let ix = 0;
        let iz = 0;
        if (this.keys.KeyW || this.keys.ArrowUp) iz -= 1;
        if (this.keys.KeyS || this.keys.ArrowDown) iz += 1;
        if (this.keys.KeyA || this.keys.ArrowLeft) ix -= 1;
        if (this.keys.KeyD || this.keys.ArrowRight) ix += 1;
        ix += this.joy.x;
        iz += this.joy.y;
        if (this.moveTarget) {
          const tdx = this.moveTarget.x - P.pos.x;
          const tdz = this.moveTarget.y - P.pos.y;
          const td = Math.hypot(tdx, tdz);
          if (td < 0.25) this.moveTarget = null;
          else {
            ix = tdx / td;
            iz = tdz / td;
          }
        }
        if (P.downed) {
          ix = 0;
          iz = 0;
        }
        const il = Math.hypot(ix, iz);
        if (il > 1) {
          ix /= il;
          iz /= il;
        }
        const dashing = t - this.dashT < 0.32;
        const maxSp = (P.crouch ? 2.1 : 4.4) * C.speed * this.moveMul() * (dashing ? 3.1 : 1);
        // booster afterimages while dashing — spawn a fading silhouette each frame
        if (dashing) this.spawnGhost(P);
        P.pos.x += ix * maxSp * dt;
        P.pos.y += iz * maxSp * dt;
        // wall bump: dust puff + micro shake when driving into a wall (throttled)
        if (this.collide(P.pos, 0.5) && il > 0.3) {
          const nowMs = performance.now();
          if (nowMs - this.lastBump > 150) {
            this.lastBump = nowMs;
            this.burst(P.pos.x, P.pos.y, 0xb4b0ac, 4);
            this.addShake(0.05 + (dashing ? 0.12 : 0));
          }
        }
        speed = il * maxSp;
        this.lax = ix * 2.4;
        this.laz = iz * 2.4;
        if (il > 0.05) {
          const want = Math.atan2(ix, iz);
          let da = want - P.facing;
          while (da > Math.PI) da -= Math.PI * 2;
          while (da < -Math.PI) da += Math.PI * 2;
          P.facing += da * Math.min(1, dt * 10);
          pTurn = da;
        }
        // --- co-op role: guest renders the host's snapshot; host/solo simulate ---
        const coRole = this.net.role();
        const gp = coRole === 'host' ? this.guestPos() : null;
        if (coRole === 'guest') {
          this.applyWorld(dt, t);
        } else {
        // films
        for (let f = 0; f < this.films.length; f++) {
          const fl = this.films[f];
          if (fl.got) continue;
          fl.core.rotation.y = t * 2.2;
          fl.core.position.y = 0.8 + Math.sin(t * 2.5 + f) * 0.08;
          if (Math.hypot(fl.x - P.pos.x, fl.z - P.pos.y) < 1.1) {
            fl.got = true;
            fl.mesh.visible = false;
            this.burst(fl.x, fl.z, ACCENT, 10);
            this.addShake(0.1);
            this.kickZoom(0.6);
            this.filmCount++;
            this.updFilms();
            this.updDrawer();
            this.sfx.pickup();
            if (this.filmCount === this.films.length) {
              this.$('.pg-objective').textContent = '목표 — 적색 회수 구역으로 탈출하라';
              this.toast('필름 전부 회수 — 탈출구 개방');
            }
          }
        }
        // extraction — co-op: both agents must hold the exit zone together
        // (skipped on boss stages, where the win condition is defeating the boss)
        const ex = this.level.extract;
        const ready = !this.boss && this.filmCount === this.films.length;
        (this.extractMesh.material as THREE.MeshBasicMaterial).opacity = ready
          ? 0.28 + Math.sin(t * 5) * 0.12
          : 0.08;
        const inExit = (ax: number, az: number) =>
          Math.abs(ax - ex[0]) < ex[2] / 2 && Math.abs(az - ex[1]) < ex[3] / 2;
        // downed teammates are carried: they count as "ready" without holding the exit,
        // but at least one living agent must actually reach it to trigger extraction.
        const guestDown = this.livePeer()?.down === 1;
        this.coHostEsc = ready && (P.downed || inExit(P.pos.x, P.pos.y)) ? 1 : 0;
        this.coGuestEsc = ready && gp && (guestDown || inExit(gp.x, gp.z)) ? 1 : 0;
        const aliveInExit =
          (!P.downed && inExit(P.pos.x, P.pos.y)) ||
          (!!gp && !guestDown && inExit(gp.x, gp.z));
        if (this.boss) {
          /* boss stage: objective handled by boss HP, no extraction */
        } else if (this.coHostEsc === 1 && (!gp || this.coGuestEsc === 1) && aliveInExit) {
          this.extractT += dt;
          const pct = Math.min(100, Math.round((this.extractT / 1.2) * 100));
          this.$('.pg-objective').textContent = (gp ? '동반 탈출 중… ' : '탈출 중… ') + pct + '%';
          if (this.extractT > 1.2) this.clearStage();
        } else {
          this.extractT = 0;
          if (this.coHostEsc === 1 && gp && this.coGuestEsc === 0)
            this.$('.pg-objective').textContent = '동료의 탈출을 기다리는 중…';
        }
        // primary clear condition: defeat every guard on non-boss stages (host/solo
        // decides; the guest gets the cleared flag via the world snapshot)
        if (!this.boss && this.net.role() !== 'guest') {
          let alive = 0;
          for (const g of this.guards) if (!g.down) alive++;
          this.$('.pg-objective').textContent =
            alive > 0 ? '목표 — 적 전원 제압 · 남은 적 ' + alive : '적 소탕 완료';
          if (alive === 0 && this.mode === 'play') this.clearStage();
        }
        // objective arrow — on boss stages point at the boss; otherwise at the
        // nearest surviving guard (clear = defeat them all)
        let atx: number | null = null;
        let atz: number | null = null;
        if (this.boss) {
          atx = this.boss.pos.x;
          atz = this.boss.pos.y;
        } else {
          let bd2 = 1e9;
          for (const g of this.guards) {
            if (g.down) continue;
            const ad2 = (g.pos.x - P.pos.x) ** 2 + (g.pos.y - P.pos.y) ** 2;
            if (ad2 < bd2) {
              bd2 = ad2;
              atx = g.pos.x;
              atz = g.pos.y;
            }
          }
        }
        if (this.arrow) {
          if (atx !== null && atz !== null) {
            this.arrow.visible = true;
            this.arrow.position.set(P.pos.x, 0.06, P.pos.y);
            this.arrow.rotation.y = Math.atan2(atx - P.pos.x, atz - P.pos.y);
          } else this.arrow.visible = false;
        }
        // owl hold-to-aim: a line from the player, clipped at the first wall ahead
        if (this.aiming) {
          const len = this.wallDist(P.pos.x, P.pos.y, P.facing, 16);
          this.aimLine.visible = true;
          this.aimLine.scale.set(0.5, 1, len);
          this.aimLine.rotation.y = P.facing;
          this.aimLine.position.set(
            P.pos.x + (Math.sin(P.facing) * len) / 2,
            0.12,
            P.pos.y + (Math.cos(P.facing) * len) / 2,
          );
          (this.aimLine.material as THREE.MeshBasicMaterial).opacity = 0.32 + 0.3 * Math.abs(Math.sin(t * 12));
          this.$<HTMLElement>('.pg-b-skill').classList.add('aim');
        } else if (this.aimLine.visible) {
          this.aimLine.visible = false;
          this.$<HTMLElement>('.pg-b-skill').classList.remove('aim');
        }
        let maxDetect = 0;
        const gr = this.guardsTick(dt, t, P, gp, smokeActive);
        maxDetect = gr.alert;
        if (gr.tw > threatW) {
          threatW = gr.tw;
          threatX = gr.tx;
          threatZ = gr.tz;
        }
        this.bossTick(dt, t);
        this.$<HTMLElement>('.pg-alertfill').style.width = maxDetect * 100 + '%';
        if (threatW > 0.25) {
          pLook = clamp(
            angleDelta(Math.atan2(threatX - P.pos.x, threatZ - P.pos.y), P.facing),
            -0.7,
            0.7,
          );
        }
        if (coRole === 'host') {
          // include the transition so the guest ends the stage in lock-step
          // (cast: fail()/clearStage() above may have moved mode off 'play')
          const m = this.mode as Mode;
          const failFlag = m === 'fail' ? 1 : 0;
          const clearedFlag = m !== 'play' && !failFlag ? 1 : 0;
          this.net.sendWorld(
            this.buildWorld(maxDetect, this.coHostEsc, this.coGuestEsc, clearedFlag, failFlag),
          );
        }
        } // end host/solo simulation branch
        // projectiles: advance, resolve hits (enemy->player, player->guards), expire
        for (let prI = this.projectiles.length - 1; prI >= 0; prI--) {
          const pr = this.projectiles[prI];
          pr.life -= dt;
          pr.x += pr.vx * dt;
          pr.z += pr.vz * dt;
          pr.mesh.position.set(pr.x, 0.7, pr.z);
          let gone = pr.life <= 0 || this.inWall(pr.x, pr.z, 0);
          if (!gone && pr.enemy) {
            if (this.hurtAt(pr.x, pr.z, 0.6, pr.dmg)) gone = true;
          } else if (!gone) {
            for (const G of this.guards) {
              if (G.down) continue;
              if (Math.hypot(pr.x - G.pos.x, pr.z - G.pos.y) < 0.7) {
                this.damageGuard(G, pr.dmg);
                if (!pr.pierce) {
                  gone = true;
                  break;
                }
              }
            }
            if (!gone && this.boss && this.boss.hp > 0) {
              if (Math.hypot(pr.x - this.boss.pos.x, pr.z - this.boss.pos.y) < 2.2) {
                this.damageBoss(pr.dmg);
                if (!pr.pierce) gone = true;
              }
            }
          }
          if (gone) {
            this.fxGroup.remove(pr.mesh);
            (pr.mesh.material as THREE.Material).dispose();
            pr.mesh.geometry.dispose();
            this.projectiles.splice(prI, 1);
          }
        }
        this.net.send(P, this.stageIdx, this.charId);
      }
      P.group.position.set(P.pos.x, 0, P.pos.y);
      P.group.rotation.y = P.facing;
      if (this.mode === 'menu') P.group.rotation.y = t * 0.5; // title hero: slow showcase spin
      animBird(P, {
        speed,
        dt,
        t,
        crouch: P.crouch,
        turn: pTurn,
        dash: clamp(1 - (t - this.dashT) / 0.45, 0, 1),
        lookYaw: pLook,
      });
      this.updatePeers();
      // zoom punch eases the camera in on impact, then relaxes back out
      if (this.zoomKick > 0.001) this.zoomKick = Math.max(0, this.zoomKick - realDt * 4);
      // portrait screens have a narrow horizontal FOV (vertical fov is fixed), so
      // pull the camera back so mobile isn't cramped. Landscape (aspect>=1) is unaffected.
      const aspect = this.camera.aspect || 1;
      const fit = aspect < 1 ? Math.min(1.9, Math.pow(1 / aspect, 0.6)) : 1;
      const cd2 = (this.camDist - this.zoomKick) * fit;
      const lax = this.mode === 'play' ? this.lax : 0;
      const laz = this.mode === 'play' ? this.laz : 0;
      this.lookX += (lax - this.lookX) * Math.min(1, dt * 2);
      this.lookZ += (laz - this.lookZ) * Math.min(1, dt * 2);
      this.camPos.set(P.pos.x + this.lookX, cd2, P.pos.y + this.lookZ + cd2 * 0.72);
      this.camera.position.lerp(this.camPos, Math.min(1, dt * 4));
      // decaying screen shake, applied after the lerp so it stays punchy
      if (this.shakeAmp > 0.001) {
        this.shakeAmp = Math.max(0, this.shakeAmp - realDt * 2.4);
        const a = this.shakeAmp;
        this.camera.position.x += (Math.random() * 2 - 1) * a;
        this.camera.position.z += (Math.random() * 2 - 1) * a;
        this.camera.position.y += (Math.random() * 2 - 1) * a * 0.4;
      }
      this.camera.lookAt(P.pos.x + this.lookX * 0.7, 0.4, P.pos.y + this.lookZ * 0.7);
      this.sun.position.set(P.pos.x + 14, 26, P.pos.y + 10);
      this.sun.target.position.set(P.pos.x, 0, P.pos.y);
      this.sun.target.updateMatrixWorld();
      // minimap only matters during play; redraw at ~20fps, not every frame
      this.mapT += dt;
      if (this.mode === 'play' && this.mapT >= 0.05) {
        this.mapT = 0;
        this.drawMap();
      }
      this.renderer.render(this.scene, this.camera);
    };
    this.rafId = requestAnimationFrame(frame);
  }

  /* ---------- Co-op (host-authoritative world sync) ---------- */

  /** Host side: the live guest's position (2-player — the single recent peer). */
  private guestPos(): { x: number; z: number; crouch: boolean } | null {
    const now = performance.now();
    for (const id in this.net.peers) {
      const p = this.net.peers[id];
      if (now - p.seen > 5000) continue;
      return { x: p.x, z: p.z, crouch: p.crouch === 1 };
    }
    return null;
  }

  /** Host side: serialise the authoritative world for broadcast to the guest. */
  private buildWorld(alert: number, he: number, ge: number, cleared: number, fail: number): World {
    const guards: GuardSnap[] = this.guards.map((G) => ({
      x: +G.pos.x.toFixed(2),
      z: +G.pos.y.toFixed(2),
      ry: +G.facing.toFixed(2),
      s: GSTATES.indexOf(G.state),
      d: +G.detect.toFixed(2),
    }));
    let films = 0;
    this.films.forEach((f, i) => {
      if (f.got) films |= 1 << i;
    });
    let items = 0;
    this.items.forEach((it, i) => {
      if (it.got) items |= 1 << i;
    });
    return {
      seq: ++this.worldSeq,
      guards,
      films,
      items,
      ax: +this.alarmX.toFixed(2),
      az: +this.alarmZ.toFixed(2),
      alert: +alert.toFixed(2),
      ready: this.filmCount === this.films.length ? 1 : 0,
      he,
      ge,
      ghp: this.guestHp,
      gmax: this.guestMax,
      gdn: this.guestDown ? 1 : 0,
      cleared,
      fail,
    };
  }

  /**
   * Guest side: render the host's authoritative snapshot instead of simulating.
   * Guards are posed from the snapshot; taken films/items are hidden; alarm and
   * HUD mirror the host; a cleared/failed flag ends the stage in lock-step.
   */
  private applyWorld(dt: number, t: number): void {
    const w = this.net.world;
    if (!w) return;
    for (let i = 0; i < this.guards.length && i < w.guards.length; i++) {
      const G = this.guards[i];
      const s = w.guards[i];
      const moved = Math.hypot(s.x - G.pos.x, s.z - G.pos.y);
      G.pos.x = s.x;
      G.pos.y = s.z;
      G.facing = s.ry;
      G.state = GSTATES[s.s] ?? 'patrol';
      G.detect = s.d;
      (G.cone.material as THREE.MeshBasicMaterial).opacity =
        0.08 + G.detect * 0.18 + (G.state === 'chase' ? 0.14 : 0);
      G.cone.scale.setScalar(
        Math.max(0.06, this.wallDist(G.pos.x, G.pos.y, G.facing, G.range) / G.range),
      );
      G.bang.visible = G.state === 'chase';
      G.model.group.position.set(G.pos.x, 0, G.pos.y);
      G.model.group.rotation.y = G.facing;
      animBird(G.model, {
        speed: Math.min(moved / Math.max(dt, 1e-3), G.speed * 1.65),
        dt,
        t: t + i * 3,
        crouch: false,
      });
    }
    let filmDelta = false;
    for (let i = 0; i < this.films.length; i++) {
      if (w.films & (1 << i) && !this.films[i].got) {
        this.films[i].got = true;
        this.films[i].mesh.visible = false;
        filmDelta = true;
      }
    }
    if (filmDelta) {
      this.filmCount = this.films.filter((f) => f.got).length;
      this.updFilms();
      this.updDrawer();
    }
    for (let i = 0; i < this.items.length; i++) {
      if (w.items & (1 << i) && !this.items[i].got) {
        this.items[i].got = true;
        this.items[i].mesh.visible = false;
      }
    }
    this.alarmX = w.ax;
    this.alarmZ = w.az;
    const ready = w.ready === 1;
    (this.extractMesh.material as THREE.MeshBasicMaterial).opacity = ready
      ? 0.28 + Math.sin(t * 5) * 0.12
      : 0.08;
    this.$<HTMLElement>('.pg-alertfill').style.width = w.alert * 100 + '%';
    // guest HP is host-authoritative — read it from the snapshot
    if (w.gmax > 0) {
      const P = this.player;
      P.maxHp = w.gmax;
      P.hp = w.ghp;
      P.downed = w.gdn === 1;
      this.updHp();
    }
    if (w.fail === 1) this.fail();
    else if (w.cleared === 1) this.clearStage();
  }

  /* ---------- Guard AI (distance awareness → zone attack) ---------- */
  private hideZone(G: Guard): void {
    G.zone.visible = false;
    G.tele.visible = false;
  }

  /** Grow + fade-in the attack-zone telegraph as the windup fills (0..1). */
  private showZone(G: Guard, fill: number, ZR: number, ZL: number, ZW: number): void {
    const op = 0.15 + fill * 0.4;
    if (G.gtype === 'radial') {
      G.tele.visible = false;
      G.zone.visible = true;
      G.zone.position.set(G.pos.x, 0.05, G.pos.y);
      G.zone.scale.setScalar(ZR * (0.4 + 0.6 * fill));
      (G.zone.material as THREE.MeshBasicMaterial).opacity = op;
    } else {
      G.zone.visible = false;
      G.tele.visible = true;
      const ang = Math.atan2(G.aimX - G.pos.x, G.aimZ - G.pos.y);
      const len = ZL * (0.4 + 0.6 * fill);
      G.tele.scale.set(ZW * 2, 1, len);
      G.tele.rotation.y = ang;
      G.tele.position.set(G.pos.x + (Math.sin(ang) * len) / 2, 0.1, G.pos.y + (Math.cos(ang) * len) / 2);
      (G.tele.material as THREE.MeshBasicMaterial).opacity = op;
    }
  }

  /** Damage any agent inside the guard's attack zone (radial circle or forward line). */
  private zoneHit(G: Guard, ZR: number, ZL: number, ZW: number): void {
    const ang = Math.atan2(G.aimX - G.pos.x, G.aimZ - G.pos.y);
    const hit = (px: number, pz: number, guest: boolean) => {
      let inside: boolean;
      if (G.gtype === 'radial') {
        inside = Math.hypot(px - G.pos.x, pz - G.pos.y) <= ZR;
      } else {
        const rx = px - G.pos.x;
        const rz = pz - G.pos.y;
        const fwd = rx * Math.sin(ang) + rz * Math.cos(ang);
        const side = rx * Math.cos(ang) - rz * Math.sin(ang);
        inside = fwd > 0 && fwd < ZL && Math.abs(side) < ZW;
      }
      if (inside && this.los(G.pos.x, G.pos.y, px, pz)) {
        if (guest) this.hurtGuest(1);
        else this.hurtPlayer(1);
      }
    };
    if (!this.player.downed) hit(this.player.pos.x, this.player.pos.y, false);
    const gp = this.guestPos();
    if (gp && this.guestMax > 0 && !this.guestDown) hit(gp.x, gp.z, true);
  }

  /** One patrol step (A* routing + anti-stuck); returns the move speed. */
  private patrolStep(G: Guard, dt: number): number {
    const tp = G.path[(G.seg + 1) % G.path.length];
    if (Math.hypot(tp[0] - G.pos.x, tp[1] - G.pos.y) < 0.4) {
      G.seg = (G.seg + 1) % G.path.length;
      G.stuckT = 0;
      return 0;
    }
    const bx = G.pos.x;
    const bz = G.pos.y;
    const wp = this.guardWaypoint(G, tp[0], tp[1], dt);
    const mx = wp.x - G.pos.x;
    const mz = wp.z - G.pos.y;
    const m = Math.hypot(mx, mz) || 1;
    G.pos.x += (mx / m) * G.speed * dt;
    G.pos.y += (mz / m) * G.speed * dt;
    let dg = Math.atan2(mx, mz) - G.facing;
    while (dg > Math.PI) dg -= Math.PI * 2;
    while (dg < -Math.PI) dg += Math.PI * 2;
    G.facing += dg * Math.min(1, dt * 6);
    this.collide(G.pos, 0.55);
    if (Math.hypot(G.pos.x - bx, G.pos.y - bz) < G.speed * dt * 0.3) G.stuckT += dt;
    else G.stuckT = 0;
    if (G.stuckT > 1) {
      G.seg = (G.seg + 1) % G.path.length;
      G.navPath = null;
      G.stuckT = 0;
    }
    return G.speed;
  }

  /**
   * New enemy model: distance-based awareness (?/!) then a telegraphed attack
   * zone (radial or line) that fills while the guard is frozen; when it fills,
   * anyone inside takes damage. Then a cooldown. Returns HUD alert + threat.
   */
  private guardsTick(
    dt: number,
    t: number,
    P: Player,
    gp: { x: number; z: number; crouch: boolean } | null,
    smokeActive: boolean,
  ): { alert: number; tw: number; tx: number; tz: number } {
    let alert = 0;
    let tw = 0;
    let tx = 0;
    let tz = 0;
    const D = DIFFS[this.diffId];
    const AWARE = 10 * D.gr;
    const ALERT = 6 * D.gr;
    const windDur = 1.35 * D.wind;
    const cdDur = 2.4;
    const ZR = 4.5;
    const ZL = 11;
    const ZW = 1.4;
    for (let gI = 0; gI < this.guards.length; gI++) {
      const G = this.guards[gI];
      if (G.down) continue;
      G.hurtFlash = Math.max(0, G.hurtFlash - dt * 4);
      let ax = P.pos.x;
      let az = P.pos.y;
      let acrouch = P.crouch;
      let aHidden = smokeActive || (P.crouch && this.inCover(P.pos.x, P.pos.y));
      if (gp) {
        const dh = Math.hypot(P.pos.x - G.pos.x, P.pos.y - G.pos.y);
        const dgs = Math.hypot(gp.x - G.pos.x, gp.z - G.pos.y);
        if (dgs < dh) {
          ax = gp.x;
          az = gp.z;
          acrouch = gp.crouch;
          aHidden = false;
        }
      }
      const adx = ax - G.pos.x;
      const adz = az - G.pos.y;
      const dist = Math.hypot(adx, adz) || 0.001;
      const seen = !aHidden && this.los(G.pos.x, G.pos.y, ax, az);
      const cm = acrouch ? 0.6 : 1;
      const inAware = seen && dist <= AWARE * cm;
      const inAlert = seen && dist <= ALERT * cm;
      // aggro: alerted while >0. detected when the player gets close (or on a
      // hit — see damageGuard); decays and drops once the player is far/unseen.
      if (inAlert) G.aggro = 3;
      else if (G.aggro > 0)
        G.aggro = Math.max(0, G.aggro - dt * (!seen || dist > AWARE * cm ? 1.2 : 0.5));
      const alerted = G.aggro > 0;
      const aware = !alerted && inAware; // suspicious but keeps patrolling
      const reach = G.gtype === 'line' ? ALERT * cm : ZR + 0.4;
      // only lock onto the player once actually alerted; aware guards patrol on
      if (alerted || G.wind > 0) {
        let da = Math.atan2(adx, adz) - G.facing;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        G.facing += da * Math.min(1, dt * 7);
      }
      let gSpeed = 0;
      if (G.wind > 0) {
        G.wind -= dt;
        this.showZone(G, Math.min(1, 1 - G.wind / windDur), ZR, ZL, ZW);
        if (G.wind <= 0) {
          this.hideZone(G);
          this.zoneHit(G, ZR, ZL, ZW);
          G.atkCd = t;
          this.addShake(0.12);
        }
        alert = 1;
        tw = 2;
        tx = G.pos.x;
        tz = G.pos.y;
      } else if (alerted && dist <= reach && t - G.atkCd > cdDur) {
        G.wind = windDur;
        G.aimX = ax;
        G.aimZ = az;
        this.sfx.alert();
        alert = Math.max(alert, 1);
      } else if (alerted) {
        // engaged: close in to attack range (chase only after being alerted)
        this.hideZone(G);
        const wp = this.guardWaypoint(G, ax, az, dt);
        const mx = wp.x - G.pos.x;
        const mz = wp.z - G.pos.y;
        const m = Math.hypot(mx, mz) || 1;
        const chSpeed = G.speed * 1.12;
        G.pos.x += (mx / m) * chSpeed * dt;
        G.pos.y += (mz / m) * chSpeed * dt;
        this.collide(G.pos, 0.55);
        gSpeed = chSpeed;
        alert = Math.max(alert, 0.85);
        if (tw < 2) {
          tw = 2;
          tx = G.pos.x;
          tz = G.pos.y;
        }
      } else {
        // patrol — aware guards keep walking their route (just a '?' overhead)
        gSpeed = this.patrolStep(G, dt);
        this.hideZone(G);
        if (aware) alert = Math.max(alert, 0.4);
      }
      G.bang.visible = alerted || G.wind > 0;
      G.qmark.visible = aware && G.wind <= 0;
      G.cone.visible = false;
      G.model.group.position.set(G.pos.x, 0, G.pos.y);
      G.model.group.rotation.y = G.facing;
      G.model.group.scale.setScalar(1.12 * (1 + G.hurtFlash * 0.32));
      G.hpbar.visible = G.hp < G.maxHp;
      G.hpbar.scale.x = 1.9 * Math.max(0, G.hp / G.maxHp);
      const gLook = aware ? clamp(angleDelta(Math.atan2(adx, adz), G.facing), -0.8, 0.8) : 0;
      animBird(G.model, { speed: gSpeed, dt, t: t + gI * 3, crouch: false, lookYaw: gLook });
    }
    return { alert, tw, tx, tz };
  }

  /** 2D minimap: walls, covers, films, items, exit, guards (by state), peers, player. */
  private drawMap(): void {
    const mp = this.$<HTMLCanvasElement>('.pg-map');
    if (!mp || !this.level || !this.walls) return;
    const L = this.level;
    const c = mp.getContext('2d');
    if (!c) return;
    const W = mp.width;
    const H = mp.height;
    const sx = W / L.w;
    const sz = H / L.d;
    const X = (x: number) => (x + L.w / 2) * sx;
    const Z = (z: number) => (z + L.d / 2) * sz;
    c.fillStyle = '#eceae8';
    c.fillRect(0, 0, W, H);
    c.fillStyle = '#c9c6c3';
    for (const cv of this.covers) {
      c.fillRect(X(cv.minX), Z(cv.minZ), (cv.maxX - cv.minX) * sx, (cv.maxZ - cv.minZ) * sz);
    }
    c.fillStyle = '#201e1d';
    for (const wl of this.walls) {
      c.fillRect(
        X(wl.minX),
        Z(wl.minZ),
        Math.max(1.5, (wl.maxX - wl.minX) * sx),
        Math.max(1.5, (wl.maxZ - wl.minZ) * sz),
      );
    }
    c.fillStyle = '#ec3013';
    for (const f of this.films) {
      if (f.got) continue;
      c.fillRect(X(f.x) - 2, Z(f.z) - 2, 4, 4);
    }
    c.fillStyle = '#8a8683';
    for (const it of this.items) {
      if (it.got) continue;
      c.fillRect(X(it.x) - 1.5, Z(it.z) - 1.5, 3, 3);
    }
    const ex = L.extract;
    const ready = this.filmCount === this.films.length;
    c.strokeStyle = '#ec3013';
    c.lineWidth = 1.5;
    c.strokeRect(X(ex[0] - ex[2] / 2), Z(ex[1] - ex[3] / 2), ex[2] * sx, ex[3] * sz);
    if (ready && Math.floor(performance.now() / 400) % 2) {
      c.fillStyle = 'rgba(236,48,19,.5)';
      c.fillRect(X(ex[0] - ex[2] / 2), Z(ex[1] - ex[3] / 2), ex[2] * sx, ex[3] * sz);
    }
    for (const G of this.guards) {
      c.fillStyle =
        G.state === 'chase' ? '#ec3013' : G.state === 'search' ? '#c92a10' : '#201e1d';
      c.beginPath();
      c.arc(X(G.pos.x), Z(G.pos.y), 2.4, 0, 7);
      c.fill();
      c.strokeStyle = 'rgba(32,30,29,.4)';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(X(G.pos.x), Z(G.pos.y));
      c.lineTo(X(G.pos.x + Math.sin(G.facing) * 3), Z(G.pos.y + Math.cos(G.facing) * 3));
      c.stroke();
    }
    c.fillStyle = '#8a8683';
    for (const id in this.peersMeshes) {
      const pm = this.peersMeshes[id];
      c.beginPath();
      c.arc(X(pm.x), Z(pm.z), 2.2, 0, 7);
      c.fill();
    }
    c.fillStyle = '#ec3013';
    c.strokeStyle = '#f3f2f2';
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(X(this.player.pos.x), Z(this.player.pos.y), 3.2, 0, 7);
    c.fill();
    c.stroke();
  }

  private updatePeers(): void {
    const now = performance.now();
    const peers = this.net.peers;
    for (const id in peers) {
      const p = peers[id];
      const stale = now - p.seen > 4000 || p.stage !== this.stageIdx;
      let m = this.peersMeshes[id];
      if (stale) {
        if (m) {
          this.actorGroup.remove(m.pg.group);
          disposeObject(m.pg.group);
          delete this.peersMeshes[id];
        }
        if (now - p.seen > 15000) {
          this.net.voice.drop(id);
          delete peers[id];
          this.updRoster();
        }
        continue;
      }
      if (!m || m.char !== p.char) {
        if (m) {
          this.actorGroup.remove(m.pg.group);
          disposeObject(m.pg.group);
        }
        const kind = CHARS[p.char] ? CHARS[p.char].kind : 'pigeon';
        const pg =
          birdModel(kind, true) ?? // peers clone (secondary consumer)
          makeBird({ body: 0xb9b6b3, head: 0x8a8683, wing: 0x6d6a67, accent: 0x8a8683 }, kind);
        const label = makeLabel(p.name || '요원');
        label.position.y = 1.9;
        pg.group.add(label);
        this.actorGroup.add(pg.group);
        m = this.peersMeshes[id] = { pg, x: p.x, z: p.z, ry: p.ry, char: p.char };
      }
      m.x += (p.x - m.x) * 0.15;
      m.z += (p.z - m.z) * 0.15;
      let dr = p.ry - m.ry;
      while (dr > Math.PI) dr -= Math.PI * 2;
      while (dr < -Math.PI) dr += Math.PI * 2;
      m.ry += dr * 0.15;
      const moving = Math.hypot(p.x - m.x, p.z - m.z) > 0.05;
      m.pg.group.position.set(m.x, 0, m.z);
      m.pg.group.rotation.y = m.ry;
      animBird(m.pg, { speed: moving ? 3 : 0, dt: 1 / 60, t: now / 1000, crouch: !!p.crouch });
    }
  }

  /** Tear down listeners, RAF and GPU resources when the shell unmounts. */
  dispose(): void {
    cancelAnimationFrame(this.rafId);
    this.sfx.dispose();
    this.resizeObs?.disconnect();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    clearTimeout(this.toastT);
    try {
      this.net.ws?.close();
    } catch {
      /* noop */
    }
    for (const id in this.net.voice.pcs) this.net.voice.drop(id);
    if (this.net.voice.stream) this.net.voice.stream.getTracks().forEach((tr) => tr.stop());
    try {
      if (this.scene) disposeObject(this.scene);
      this.renderer?.dispose();
    } catch {
      /* noop */
    }
  }
}
