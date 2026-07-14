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
import { Sfx } from './audio';
import { Net } from './net';
import { makeBird, makeBang, makeLabel, animBird } from './birds';
import { clamp, angleDelta } from './anim';
import { NavGrid } from './ai/navgrid';
import { findPath } from './ai/pathfind';
import { searchPoint, flankPoint } from './ai/squad';
import { disposeObject } from './three-utils';
import { TPL, CSS } from './template';
import type {
  BestScore,
  Bounds,
  Decoy,
  Film,
  GameOptions,
  Guard,
  GuardSnap,
  GuardState,
  Item,
  Particle,
  Player,
  PeerMesh,
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
  private inv = { decoy: 0, smoke: 0 };

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private sun!: THREE.DirectionalLight;
  private levelGroup!: THREE.Group;
  private actorGroup!: THREE.Group;
  private fxGroup!: THREE.Group;
  private raycaster!: THREE.Raycaster;
  private groundPlane!: THREE.Plane;

  private player!: Player;
  private peersMeshes: Record<string, PeerMesh> = {};

  private level!: LevelDef;
  private stageIdx = 0;
  private guards: Guard[] = [];
  private films: Film[] = [];
  private items: Item[] = [];
  private decoys: Decoy[] = [];
  private walls: Bounds[] = [];
  private covers: Bounds[] = [];
  private nav!: NavGrid;
  private extractMesh!: THREE.Mesh;
  private filmCount = 0;
  private extractT = 0;
  private parts: Particle[] = [];
  private arrow!: THREE.Group;

  // shared squad alarm — most recent known player location (for coordinated search)
  private alarmX = 0;
  private alarmZ = 0;

  // co-op: monotonically increasing snapshot sequence (host → guest)
  private worldSeq = 0;
  // co-op: whether each agent is currently holding the exit zone (for the snapshot)
  private coHostEsc = 0;
  private coGuestEsc = 0;

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

    this.spawnPlayer();
    this.peersMeshes = {};

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(this.host);
    this.resize();

    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  }

  private spawnPlayer(): void {
    const old = this.player as Player | undefined;
    const C = CHARS[this.charId];
    const p = makeBird(C.pal, C.kind) as Player;
    p.pos = old ? old.pos : new THREE.Vector2(0, 0);
    p.facing = old ? old.facing : 0;
    p.crouch = false;
    p.smokeUntil = 0;
    if (old) {
      this.actorGroup.remove(old.group);
      disposeObject(old.group);
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
    this.player = p;
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
    this.guards = [];
    this.films = [];
    this.items = [];
    this.decoys = [];

    const mat = (c: number) => new THREE.MeshLambertMaterial({ color: c });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(L.w, L.d), mat(PAPER));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.levelGroup.add(ground);
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(L.w + 80, L.d + 80), mat(0xe2e0de));
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -0.02;
    outer.receiveShadow = true;
    this.levelGroup.add(outer);
    const grid = new THREE.GridHelper(Math.max(L.w, L.d), Math.max(L.w, L.d) / 2, 0xd8d5d3, 0xd8d5d3);
    grid.position.y = 0.01;
    this.levelGroup.add(grid);

    const frameMat = mat(INK);
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
      bar(wl.x, wl.z, wl.w, wl.d, 1.7);
      this.walls.push({
        minX: wl.x - wl.w / 2,
        maxX: wl.x + wl.w / 2,
        minZ: wl.z - wl.d / 2,
        maxZ: wl.z + wl.d / 2,
      });
    }

    this.covers = [];
    for (const cv of L.covers) {
      const cm = new THREE.Mesh(
        new THREE.PlaneGeometry(cv.w, cv.d),
        new THREE.MeshBasicMaterial({ color: 0xc9c6c3, transparent: true, opacity: 0.75 }),
      );
      cm.rotation.x = -Math.PI / 2;
      cm.position.set(cv.x, 0.02, cv.z);
      this.levelGroup.add(cm);
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.PlaneGeometry(cv.w, cv.d)),
        new THREE.LineBasicMaterial({ color: MID }),
      );
      edges.rotation.x = -Math.PI / 2;
      edges.position.set(cv.x, 0.03, cv.z);
      this.levelGroup.add(edges);
      bar(cv.x - cv.w / 4, cv.z - cv.d / 4, cv.w / 3, cv.d / 3, 0.55, mat(0xc2bfbc));
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
      const pg = makeBird({ body: 0x2b2825, head: 0x201e1d, wing: 0x171514, accent: 0xec3013 }, 'guard');
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
      this.guards.push({
        model: pg,
        cone,
        bang,
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
      });
    }

    // reset player
    this.player.pos.set(L.spawn[0], L.spawn[1]);
    this.player.facing = Math.PI;
    this.player.crouch = false;
    this.player.smokeUntil = 0;
    this.$('.pg-b-crouch').classList.remove('onn');
    this.moveTarget = null;
    this.filmCount = 0;
    this.extractT = 0;
    this.stageTime = 0;
    this.spotted = 0;
    this.inv = { decoy: D.start.decoy, smoke: D.start.smoke };
    const mpc = this.$<HTMLCanvasElement>('.pg-map');
    if (mpc) {
      mpc.width = 150;
      mpc.height = Math.max(60, Math.round((150 * L.d) / L.w));
    }
    this.$('.pg-stage').textContent = L.name;
    this.updFilms();
    this.updInv();
    this.$('.pg-objective').textContent = '목표 — 마이크로필름 회수 후 적색 구역으로 탈출';
    this.updDrawer();
  }

  /* ---------- HUD updates ---------- */
  private updFilms(): void {
    this.$('.pg-films').innerHTML = '필름 <b>' + this.filmCount + '</b>/' + this.level.films.length;
  }
  private updInv(): void {
    this.$('.pg-inv').innerHTML = '미끼 <b>' + this.inv.decoy + '</b> · 연막 <b>' + this.inv.smoke + '</b>';
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
      '<h3>장비</h3><ul>' +
      '<li><span>미끼 (1키) — 경비를 유인</span><b>' +
      this.inv.decoy +
      '</b></li>' +
      '<li><span>연막 (2키) — 5초 은신</span><b>' +
      this.inv.smoke +
      '</b></li></ul>';
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
      if (e.code === 'Digit1') this.useDecoy();
      if (e.code === 'Digit2') this.useSmoke();
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(e.code) >= 0) e.preventDefault();
      this.moveTarget = null;
    };
    this.onKeyUp = (e: KeyboardEvent) => {
      this.keys[e.code] = false;
    };
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);

    const canvas = this.$<HTMLCanvasElement>('.pg-canvas');
    canvas.addEventListener('pointerdown', (e) => {
      if (this.mode !== 'play') return;
      this.sfx.ensure();
      const rect = canvas.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.raycaster.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
      const pt = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(this.groundPlane, pt)) {
        this.moveTarget = new THREE.Vector2(pt.x, pt.z);
      }
    });

    const stick = this.$<HTMLElement>('.pg-stick');
    const knob = this.$<HTMLElement>('.pg-knob');
    let stickId: number | null = null;
    const setKnob = (dx: number, dy: number) => {
      knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    };
    const moveStick = (e: PointerEvent) => {
      const r = stick.getBoundingClientRect();
      let dx = e.clientX - (r.left + r.width / 2);
      let dy = e.clientY - (r.top + r.height / 2);
      const len = Math.hypot(dx, dy);
      const max = r.width / 2 - 10;
      if (len > max) {
        dx *= max / len;
        dy *= max / len;
      }
      setKnob(dx, dy);
      this.joy.set(dx / max, dy / max);
      this.moveTarget = null;
      this.sfx.ensure();
    };
    stick.addEventListener('pointerdown', (e) => {
      stickId = e.pointerId;
      stick.setPointerCapture(stickId);
      moveStick(e);
    });
    stick.addEventListener('pointermove', (e) => {
      if (e.pointerId === stickId) moveStick(e);
    });
    const endStick = (e: PointerEvent) => {
      if (e.pointerId === stickId) {
        stickId = null;
        this.joy.set(0, 0);
        setKnob(0, 0);
      }
    };
    stick.addEventListener('pointerup', endStick);
    stick.addEventListener('pointercancel', endStick);

    this.$('.pg-b-dash').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.dash();
    });
    this.$('.pg-b-crouch').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.toggleCrouch();
    });
    this.$('.pg-b-decoy').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.useDecoy();
    });
    this.$('.pg-b-smoke').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.useSmoke();
    });
    if (window.matchMedia && window.matchMedia('(pointer:coarse)').matches) {
      this.$('.pg-touch').classList.add('show');
    }
  }

  private toggleCrouch(): void {
    this.player.crouch = !this.player.crouch;
    this.$('.pg-b-crouch').classList.toggle('onn', this.player.crouch);
    this.sfx.ensure();
    this.sfx.ui();
  }
  private dash(): void {
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
  /** Bundled "you've been spotted" feedback: sound + shake + freeze + zoom. */
  private alarm(): void {
    this.sfx.alert();
    this.addShake(0.34);
    this.freeze(0.07);
    this.kickZoom(1.8);
  }

  private useDecoy(): void {
    if (this.mode !== 'play') return;
    if (this.inv.decoy <= 0) {
      this.toast('미끼가 없다 — 맵에서 회수하라');
      return;
    }
    this.inv.decoy--;
    this.updInv();
    this.updDrawer();
    this.sfx.ensure();
    this.sfx.use();
    const P = this.player;
    const dx = Math.sin(P.facing);
    const dz = Math.cos(P.facing);
    const x = P.pos.x + dx * 3;
    const z = P.pos.y + dz * 3;
    const g = new THREE.Group();
    const cube = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.34, 0.34),
      new THREE.MeshLambertMaterial({ color: INK }),
    );
    cube.position.y = 0.2;
    cube.castShadow = true;
    g.add(cube);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.6, 0.03, 8, 32),
      new THREE.MeshBasicMaterial({ color: ACCENT }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    g.add(ring);
    g.position.set(x, 0, z);
    this.fxGroup.add(g);
    this.decoys.push({ x, z, mesh: g, t: 6 });
    this.toast('미끼 투척 — 경비가 유인된다');
  }
  private useSmoke(): void {
    if (this.mode !== 'play') return;
    if (this.inv.smoke <= 0) {
      this.toast('연막이 없다 — 맵에서 회수하라');
      return;
    }
    this.inv.smoke--;
    this.updInv();
    this.updDrawer();
    this.sfx.ensure();
    this.sfx.use();
    this.player.smokeUntil = performance.now() / 1000 + 5;
    this.toast('연막 전개 — 5초간 은신');
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
        '<li><b>이동</b><span>WASD / 화살표 · 바닥 클릭 · 모바일 조이스틱</span></li>' +
        '<li><b>숨기 (C)</b><span>느리지만 덜 띈다. 회색 은폐 구역에선 완전 은신</span></li>' +
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
    this.buildLevel(idx);
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
    this.overlay(
      '<div class="pg-panel"><div class="hd"><span class="k">' +
        (last ? 'All clear' : 'Stage clear') +
        ' · Rank ' +
        rank +
        '</span><h1>' +
        (last ? '작전 완수' : '탈출 성공') +
        '</h1></div>' +
        '<div class="bd"><p>' +
        (last
          ? '모든 마이크로필름이 본부로 전달되었다. 훌륭한 비행이었다, 요원.'
          : '필름 ' + this.level.films.length + '개 회수. 다음 구역으로 이동한다.') +
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
        '</ul></div>' +
        '<div class="ft">' +
        (last
          ? '<button class="pg-btn pg-again">처음부터 →</button>'
          : '<button class="pg-btn pg-next">다음 스테이지 →</button>') +
        '<button class="pg-btn ghost pg-menu">타이틀로</button></div></div>',
    );
    if (last) this.$('.pg-again').addEventListener('click', () => this.startStage(0));
    else this.$('.pg-next').addEventListener('click', () => this.startStage(this.stageIdx + 1));
    this.$('.pg-menu').addEventListener('click', () => this.showTitle());
  }

  /* ---------- Sim helpers ---------- */
  private inWall(x: number, z: number, pad = 0): boolean {
    for (const w of this.walls) {
      if (x > w.minX - pad && x < w.maxX + pad && z > w.minZ - pad && z < w.maxZ + pad) return true;
    }
    return false;
  }
  private los(ax: number, az: number, bx: number, bz: number): boolean {
    const dx = bx - ax;
    const dz = bz - az;
    const dist = Math.hypot(dx, dz);
    const steps = Math.ceil(dist / 0.4);
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
  private collide(pos: THREE.Vector2, r: number): void {
    const hw = this.level.w / 2 - r;
    const hd = this.level.d / 2 - r;
    pos.x = Math.max(-hw, Math.min(hw, pos.x));
    pos.y = Math.max(-hd, Math.min(hd, pos.y));
    for (const w of this.walls) {
      const cx = Math.max(w.minX, Math.min(w.maxX, pos.x));
      const cz = Math.max(w.minZ, Math.min(w.maxZ, pos.y));
      const dx = pos.x - cx;
      const dz = pos.y - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        const d = Math.sqrt(d2) || 0.001;
        pos.x = cx + (dx / d) * r;
        pos.y = cz + (dz / d) * r;
      }
    }
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
      if (this.mode !== 'play' && this.arrow) this.arrow.visible = false;
      if (this.mode === 'play') {
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
        const il = Math.hypot(ix, iz);
        if (il > 1) {
          ix /= il;
          iz /= il;
        }
        const dashing = t - this.dashT < 0.22;
        const maxSp = (P.crouch ? 2.1 : 4.4) * C.speed * (dashing ? 2.3 : 1);
        P.pos.x += ix * maxSp * dt;
        P.pos.y += iz * maxSp * dt;
        this.collide(P.pos, 0.5);
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
        // items
        for (const itm of this.items) {
          if (itm.got) continue;
          itm.core.rotation.y = t * 1.6;
          if (Math.hypot(itm.x - P.pos.x, itm.z - P.pos.y) < 1.1) {
            itm.got = true;
            itm.mesh.visible = false;
            this.burst(itm.x, itm.z, MID, 8);
            this.addShake(0.07);
            this.inv[itm.t]++;
            this.updInv();
            this.updDrawer();
            this.sfx.item();
            this.toast(itm.t === 'decoy' ? '미끼 획득 (1키)' : '연막 획득 (2키)');
          }
        }
        // decoys tick
        for (let dI = this.decoys.length - 1; dI >= 0; dI--) {
          const dc = this.decoys[dI];
          dc.t -= dt;
          dc.mesh.children[1].scale.setScalar(1 + Math.sin(t * 5) * 0.15);
          if (dc.t <= 0) {
            this.fxGroup.remove(dc.mesh);
            this.decoys.splice(dI, 1);
          }
        }
        // extraction — co-op: both agents must hold the exit zone together
        const ex = this.level.extract;
        const ready = this.filmCount === this.films.length;
        (this.extractMesh.material as THREE.MeshBasicMaterial).opacity = ready
          ? 0.28 + Math.sin(t * 5) * 0.12
          : 0.08;
        const inExit = (ax: number, az: number) =>
          Math.abs(ax - ex[0]) < ex[2] / 2 && Math.abs(az - ex[1]) < ex[3] / 2;
        this.coHostEsc = ready && inExit(P.pos.x, P.pos.y) ? 1 : 0;
        this.coGuestEsc = ready && gp && inExit(gp.x, gp.z) ? 1 : 0;
        if (this.coHostEsc === 1 && (!gp || this.coGuestEsc === 1)) {
          this.extractT += dt;
          const pct = Math.min(100, Math.round((this.extractT / 1.2) * 100));
          this.$('.pg-objective').textContent = (gp ? '동반 탈출 중… ' : '탈출 중… ') + pct + '%';
          if (this.extractT > 1.2) this.clearStage();
        } else {
          this.extractT = 0;
          if (this.coHostEsc === 1 && gp && this.coGuestEsc === 0)
            this.$('.pg-objective').textContent = '동료의 탈출을 기다리는 중…';
        }
        // objective arrow — point at nearest un-got film, or the exit once ready
        let atx: number | null = null;
        let atz: number | null = null;
        if (!ready) {
          let bd2 = 1e9;
          for (let af = 0; af < this.films.length; af++) {
            const afl = this.films[af];
            if (afl.got) continue;
            const ad2 =
              (afl.x - P.pos.x) * (afl.x - P.pos.x) + (afl.z - P.pos.y) * (afl.z - P.pos.y);
            if (ad2 < bd2) {
              bd2 = ad2;
              atx = afl.x;
              atz = afl.z;
            }
          }
        } else {
          atx = ex[0];
          atz = ex[1];
        }
        if (this.arrow) {
          if (atx !== null && atz !== null) {
            this.arrow.visible = true;
            this.arrow.position.set(P.pos.x, 0.06, P.pos.y);
            this.arrow.rotation.y = Math.atan2(atx - P.pos.x, atz - P.pos.y);
          } else this.arrow.visible = false;
        }
        // guards
        let maxDetect = 0;
        const hidden = smokeActive || (P.crouch && this.inCover(P.pos.x, P.pos.y));
        const D = DIFFS[this.diffId];
        // squad coordination: stable slots so searchers fan out and chasers flank.
        // nearest chaser gets slot 0 (direct pursuit); the rest cut off escape.
        const chasers = this.guards
          .filter((g) => g.state === 'chase')
          .sort(
            (a, b) =>
              Math.hypot(a.pos.x - P.pos.x, a.pos.y - P.pos.y) -
              Math.hypot(b.pos.x - P.pos.x, b.pos.y - P.pos.y),
          );
        const searchers = this.guards.filter((g) => g.state === 'search');
        for (let gI = 0; gI < this.guards.length; gI++) {
          const G = this.guards[gI];
          let gSpeed = 0;
          if (G.state === 'chase') {
            // chase whichever agent is nearest — host player or, on host, the guest
            let ctx = P.pos.x;
            let ctz = P.pos.y;
            if (gp) {
              const dh = Math.hypot(P.pos.x - G.pos.x, P.pos.y - G.pos.y);
              const dgs = Math.hypot(gp.x - G.pos.x, gp.z - G.pos.y);
              if (dgs < dh) {
                ctx = gp.x;
                ctz = gp.z;
              }
            }
            const cd = Math.hypot(ctx - G.pos.x, ctz - G.pos.y);
            const fg = flankPoint(ctx, ctz, this.lax, this.laz, chasers.indexOf(G), chasers.length);
            const wp = this.guardWaypoint(G, fg.x, fg.z, dt);
            const mdx = wp.x - G.pos.x;
            const mdz = wp.z - G.pos.y;
            const md = Math.hypot(mdx, mdz);
            if (md > 0.01) {
              const sp = G.speed * 1.65;
              G.pos.x += (mdx / md) * sp * dt;
              G.pos.y += (mdz / md) * sp * dt;
              G.facing = Math.atan2(mdx, mdz);
              gSpeed = sp;
            }
            this.collide(G.pos, 0.55);
            if (cd < 0.95) this.fail();
            const seeNow = !hidden && this.los(G.pos.x, G.pos.y, ctx, ctz) && cd < G.range * 1.5;
            if (seeNow) {
              G.loseT = 0;
              G.lsx = ctx;
              G.lsz = ctz;
            } else {
              G.loseT += dt;
              if (G.loseT > 2.4) {
                G.state = 'search';
                G.searchT = 0;
                G.detect = 0.4;
                G.bang.visible = false;
                this.alarmX = G.lsx;
                this.alarmZ = G.lsz;
              }
            }
          } else if (G.state === 'search') {
            // coordinated sweep: each searcher gets a distinct point around the alarm
            const sp2 = searchPoint(
              this.alarmX,
              this.alarmZ,
              searchers.indexOf(G),
              searchers.length,
              6,
            );
            const sdx = sp2.x - G.pos.x;
            const sdz = sp2.z - G.pos.y;
            const sd = Math.hypot(sdx, sdz);
            if (sd > 1) {
              const wp = this.guardWaypoint(G, sp2.x, sp2.z, dt);
              const mdx = wp.x - G.pos.x;
              const mdz = wp.z - G.pos.y;
              const md = Math.hypot(mdx, mdz) || 1;
              G.pos.x += (mdx / md) * G.speed * 1.2 * dt;
              G.pos.y += (mdz / md) * G.speed * 1.2 * dt;
              G.facing = Math.atan2(mdx, mdz);
              gSpeed = G.speed * 1.2;
              this.collide(G.pos, 0.55);
            } else {
              G.searchT += dt;
              G.facing += dt * 1.7;
              if (G.searchT > 3) G.state = 'patrol';
            }
            const vdx2 = P.pos.x - G.pos.x;
            const vdz2 = P.pos.y - G.pos.y;
            const vd2 = Math.hypot(vdx2, vdz2);
            let seen2 = false;
            if (!hidden && vd2 < G.range * (P.crouch ? 0.55 : 1) * C.detect) {
              let ang2 = Math.atan2(vdx2, vdz2) - G.facing;
              while (ang2 > Math.PI) ang2 -= Math.PI * 2;
              while (ang2 < -Math.PI) ang2 += Math.PI * 2;
              if (Math.abs(ang2) < G.fov / 2 && this.los(G.pos.x, G.pos.y, P.pos.x, P.pos.y)) {
                seen2 = true;
                G.detect = Math.min(1, G.detect + dt / (D.dt * 0.6));
                if (G.detect >= 1) {
                  G.state = 'chase';
                  G.loseT = 0;
                  G.bang.visible = true;
                  this.alarm();
                  this.spotted++;
                  this.alarmX = P.pos.x;
                  this.alarmZ = P.pos.y;
                }
              }
            }
            if (!seen2) G.detect = Math.max(0.15, G.detect - dt / 1.2);
          } else {
            // lure check
            if (G.state !== 'lured' && this.decoys.length) {
              for (let dj = 0; dj < this.decoys.length; dj++) {
                const dcx = this.decoys[dj];
                if (
                  Math.hypot(dcx.x - G.pos.x, dcx.z - G.pos.y) < 11 &&
                  this.los(G.pos.x, G.pos.y, dcx.x, dcx.z)
                ) {
                  G.state = 'lured';
                  G.lure = dcx;
                  break;
                }
              }
            }
            if (G.state === 'lured') {
              const lu = G.lure;
              if (!lu || lu.t <= 0) {
                G.state = 'patrol';
                G.lure = null;
              } else {
                const ldx = lu.x - G.pos.x;
                const ldz = lu.z - G.pos.y;
                const ld = Math.hypot(ldx, ldz);
                if (ld > 1.2) {
                  const wp = this.guardWaypoint(G, lu.x, lu.z, dt);
                  const mdx = wp.x - G.pos.x;
                  const mdz = wp.z - G.pos.y;
                  const md = Math.hypot(mdx, mdz) || 1;
                  G.pos.x += (mdx / md) * G.speed * dt;
                  G.pos.y += (mdz / md) * G.speed * dt;
                  G.facing = Math.atan2(mdx, mdz);
                  gSpeed = G.speed;
                } else {
                  G.facing = Math.atan2(ldx, ldz);
                }
                this.collide(G.pos, 0.55);
              }
            } else {
              const tp = G.path[(G.seg + 1) % G.path.length];
              const pdx = tp[0] - G.pos.x;
              const pdz = tp[1] - G.pos.y;
              const pd = Math.hypot(pdx, pdz);
              if (pd < 0.15) G.seg = (G.seg + 1) % G.path.length;
              else {
                G.pos.x += (pdx / pd) * G.speed * dt;
                G.pos.y += (pdz / pd) * G.speed * dt;
                const wantG = Math.atan2(pdx, pdz);
                let dg = wantG - G.facing;
                while (dg > Math.PI) dg -= Math.PI * 2;
                while (dg < -Math.PI) dg += Math.PI * 2;
                G.facing += dg * Math.min(1, dt * 6);
                gSpeed = G.speed;
              }
            }
            // detection (also while lured)
            const vdx = P.pos.x - G.pos.x;
            const vdz = P.pos.y - G.pos.y;
            const vd = Math.hypot(vdx, vdz);
            const effRange = G.range * (P.crouch ? 0.55 : 1) * C.detect;
            let inCone = false;
            if (!hidden && vd < effRange) {
              let ang = Math.atan2(vdx, vdz) - G.facing;
              while (ang > Math.PI) ang -= Math.PI * 2;
              while (ang < -Math.PI) ang += Math.PI * 2;
              if (Math.abs(ang) < G.fov / 2 && this.los(G.pos.x, G.pos.y, P.pos.x, P.pos.y))
                inCone = true;
            }
            if (inCone) {
              if (G.detect === 0) this.sfx.spotted();
              G.detect = Math.min(1, G.detect + dt / D.dt);
              if (G.detect >= 1) {
                G.state = 'chase';
                G.loseT = 0;
                G.bang.visible = true;
                this.alarm();
                this.spotted++;
                this.alarmX = P.pos.x;
                this.alarmZ = P.pos.y;
                // raise the alarm: nearby patrolling guards start searching too
                for (let gJ = 0; gJ < this.guards.length; gJ++) {
                  const G2 = this.guards[gJ];
                  if (
                    G2 !== G &&
                    G2.state === 'patrol' &&
                    Math.hypot(G2.pos.x - G.pos.x, G2.pos.y - G.pos.y) < 16
                  ) {
                    G2.state = 'search';
                    G2.lsx = P.pos.x;
                    G2.lsz = P.pos.y;
                    G2.searchT = 0;
                    G2.detect = Math.max(G2.detect, 0.3);
                  }
                }
              }
            } else G.detect = Math.max(0, G.detect - dt / 1.2);
          }
          // co-op: a non-chasing guard can also notice the guest and flip to chase
          if (gp && G.state !== 'chase') {
            const ggx = gp.x - G.pos.x;
            const ggz = gp.z - G.pos.y;
            const ggd = Math.hypot(ggx, ggz);
            if (!hidden && ggd < G.range * (gp.crouch ? 0.55 : 1)) {
              let gga = Math.atan2(ggx, ggz) - G.facing;
              while (gga > Math.PI) gga -= Math.PI * 2;
              while (gga < -Math.PI) gga += Math.PI * 2;
              if (Math.abs(gga) < G.fov / 2 && this.los(G.pos.x, G.pos.y, gp.x, gp.z)) {
                G.detect = Math.min(1, G.detect + dt / D.dt);
                if (G.detect >= 1) {
                  G.state = 'chase';
                  G.loseT = 0;
                  G.bang.visible = true;
                  this.alarm();
                  this.spotted++;
                  this.alarmX = gp.x;
                  this.alarmZ = gp.z;
                }
              }
            }
          }
          maxDetect = Math.max(maxDetect, G.state === 'chase' ? 1 : G.detect);
          const gw = G.state === 'chase' ? 2 : G.detect;
          if (gw > threatW) {
            threatW = gw;
            threatX = G.pos.x;
            threatZ = G.pos.y;
          }
          (G.cone.material as THREE.MeshBasicMaterial).opacity =
            0.08 + G.detect * 0.18 + (G.state === 'chase' ? 0.14 : 0);
          G.model.group.position.set(G.pos.x, 0, G.pos.y);
          G.model.group.rotation.y = G.facing;
          // guards lock their gaze onto the player once they notice something
          const gLook =
            G.state === 'chase' || G.state === 'search' || G.detect > 0.2
              ? clamp(angleDelta(Math.atan2(P.pos.x - G.pos.x, P.pos.y - G.pos.y), G.facing), -0.8, 0.8)
              : 0;
          animBird(G.model, { speed: gSpeed, dt, t: t + gI * 3, crouch: false, lookYaw: gLook });
        }
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
        this.net.send(P, this.stageIdx, this.charId);
      }
      P.group.position.set(P.pos.x, 0, P.pos.y);
      P.group.rotation.y = P.facing;
      animBird(P, {
        speed,
        dt,
        t,
        crouch: P.crouch,
        turn: pTurn,
        dash: clamp(1 - (t - this.dashT) / 0.35, 0, 1),
        lookYaw: pLook,
      });
      this.updatePeers();
      // zoom punch eases the camera in on impact, then relaxes back out
      if (this.zoomKick > 0.001) this.zoomKick = Math.max(0, this.zoomKick - realDt * 4);
      const cd2 = this.camDist - this.zoomKick;
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
    if (w.fail === 1) this.fail();
    else if (w.cleared === 1) this.clearStage();
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
        const pg = makeBird({ body: 0xb9b6b3, head: 0x8a8683, wing: 0x6d6a67, accent: 0x8a8683 }, kind);
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
