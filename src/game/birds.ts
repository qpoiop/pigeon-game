import * as THREE from 'three';
import { INK, ACCENT } from '../data/palette';
import type { BirdKind, BirdPalette } from '../data/characters';
import type { AnimInput, Bird } from './types';
import { damp, clamp, pigeonBob } from './anim';

function mat(c: number): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color: c });
}

/** Builds a rigged bird (pigeon / magpie / owl / guard variants). */
export function makeBird(pal: BirdPalette, kind: BirdKind): Bird {
  const g = new THREE.Group();
  const isOwl = kind === 'owl';
  const isMag = kind === 'magpie';
  const isGuard = kind === 'guard';

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.46, 18, 14), mat(pal.body));
  if (isMag) body.scale.set(0.82, 0.76, 1.32);
  else if (isOwl) body.scale.set(1.05, 0.92, 1.1);
  else body.scale.set(0.95, 0.82, 1.25);
  body.position.y = 0.62;
  body.castShadow = true;
  g.add(body);

  const tailLen = isMag ? 0.72 : 0.42;
  const tail = new THREE.Mesh(new THREE.BoxGeometry(isMag ? 0.2 : 0.34, 0.07, tailLen), mat(pal.wing));
  tail.position.set(0, 0.72, -(0.42 + tailLen / 2 - 0.05));
  tail.rotation.x = isMag ? -0.25 : -0.45;
  tail.castShadow = true;
  g.add(tail);

  if (!isOwl) {
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.19, 0.3, 10), mat(pal.body));
    neck.position.set(0, 0.95, 0.3);
    neck.rotation.x = 0.5;
    g.add(neck);
  }

  const head = new THREE.Group();
  const headR = isOwl ? 0.32 : 0.24;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(headR, 16, 12), mat(pal.head));
  skull.castShadow = true;
  head.add(skull);
  const beak = new THREE.Mesh(
    new THREE.ConeGeometry(isOwl ? 0.07 : 0.09, isOwl ? 0.16 : 0.24, 8),
    mat(pal.accent),
  );
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, isOwl ? -0.06 : -0.02, headR + 0.06);
  head.add(beak);
  const eyeR = isOwl ? 0.085 : 0.045;
  const eyeGeo = new THREE.SphereGeometry(eyeR, 8, 8);
  const eyeMat = mat(0xf3f2f2);
  const e1 = new THREE.Mesh(eyeGeo, eyeMat);
  e1.position.set(headR * 0.55, 0.06, headR * 0.62);
  head.add(e1);
  const e2 = new THREE.Mesh(eyeGeo, eyeMat);
  e2.position.set(-headR * 0.55, 0.06, headR * 0.62);
  head.add(e2);

  if (isOwl) {
    const pupGeo = new THREE.SphereGeometry(0.035, 6, 6);
    const pupMat = mat(INK);
    const p1 = new THREE.Mesh(pupGeo, pupMat);
    p1.position.set(headR * 0.55, 0.06, headR * 0.62 + 0.06);
    head.add(p1);
    const p2 = new THREE.Mesh(pupGeo, pupMat);
    p2.position.set(-headR * 0.55, 0.06, headR * 0.62 + 0.06);
    head.add(p2);
    const tuft1 = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 6), mat(pal.head));
    tuft1.position.set(0.18, headR + 0.06, 0);
    head.add(tuft1);
    const tuft2 = tuft1.clone();
    tuft2.position.x = -0.18;
    head.add(tuft2);
  }

  if (isGuard) {
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(headR * 0.9, headR * 1.02, 0.1, 12),
      mat(0x171514),
    );
    cap.position.set(0, headR * 0.8, 0);
    head.add(cap);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(headR * 1.6, 0.06, 0.05), mat(ACCENT));
    visor.position.set(0, 0.05, headR + 0.02);
    head.add(visor);
  } else if (!isOwl) {
    const beret = new THREE.Mesh(
      new THREE.CylinderGeometry(headR * 0.85, headR, 0.08, 12),
      mat(pal.accent),
    );
    beret.position.set(0.03, headR * 0.88, -0.02);
    beret.rotation.z = -0.18;
    head.add(beret);
  }
  head.position.set(0, isOwl ? 1.1 : 1.16, isOwl ? 0.3 : 0.42);
  g.add(head);

  function wing(side: number): THREE.Mesh {
    const w = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), mat(pal.wing));
    w.scale.set(0.28, 0.55, 1);
    w.position.set((isOwl ? 0.46 : 0.42) * side, 0.66, -0.05);
    w.rotation.z = -0.15 * side;
    w.castShadow = true;
    return w;
  }
  const w1 = wing(1);
  const w2 = wing(-1);
  g.add(w1);
  g.add(w2);

  function foot(side: number): THREE.Group {
    const f = new THREE.Group();
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.26, 6), mat(pal.accent));
    leg.position.y = 0.13;
    f.add(leg);
    const toe = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.045, 0.22), mat(pal.accent));
    toe.position.set(0, 0.02, 0.05);
    f.add(toe);
    f.position.set(0.16 * side, 0, 0.05);
    return f;
  }
  const f1 = foot(1);
  const f2 = foot(-1);
  g.add(f1);
  g.add(f2);

  return {
    group: g,
    body,
    head,
    wings: [w1, w2],
    feet: [f1, f2],
    tail,
    phase: 0,
    idleT: 0,
    baseHeadY: isOwl ? 1.1 : 1.16,
    baseHeadZ: isOwl ? 0.3 : 0.42,
    crouchBlend: 0,
    leanX: 0,
    leanZ: 0,
    lookY: 0,
    baseScaleY: body.scale.y,
    baseScaleZ: body.scale.z,
  };
}

/** The red "!" alert sprite that pops over an alarmed guard. */
export function makeBang(): THREE.Sprite {
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 64;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#ec3013';
  c.font = '900 56px Archivo, sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('!', 32, 36);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true }));
  sp.scale.set(0.7, 0.7, 1);
  return sp;
}

/** The amber "?" awareness sprite (guard suspicious but not yet alerted). */
export function makeQ(): THREE.Sprite {
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 64;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#e0a021';
  c.font = '900 52px Archivo, sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('?', 32, 36);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true }));
  sp.scale.set(0.62, 0.62, 1);
  return sp;
}

/** A floating name tag for a networked peer. */
export function makeLabel(text: string): THREE.Sprite {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 64;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#201e1d';
  c.font = '700 30px Archivo, sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(text.slice(0, 12), 128, 32);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true }));
  sp.scale.set(2.2, 0.55, 1);
  return sp;
}

/**
 * Layered procedural bird animation. On top of the original walk/idle cycle it
 * adds eased state so motion reads as natural weight rather than snapping:
 *  - eased crouch blend (smooth duck down / stand up)
 *  - the iconic pigeon head-thrust while walking (+ organic idle pecks)
 *  - a side-to-side waddle, and a forward lean + bank into turns from velocity
 *  - a dash lunge (anticipation, forward pitch, body stretch, wings swept back)
 *  - a head glance toward a threat/objective
 * Purely cosmetic — no gameplay state is read or written here.
 */
export function animBird(P: Bird, input: AnimInput): void {
  const { speed, dt, t, crouch } = input;
  const turn = input.turn ?? 0;
  const dash = clamp(input.dash ?? 0, 0, 1);
  const lookYaw = input.lookYaw ?? 0;
  const moving = speed > 0.15;
  const speedN = clamp(speed / 5, 0, 1);

  // eased state
  P.crouchBlend = damp(P.crouchBlend, crouch ? 1 : 0, 10, dt);
  const cb = P.crouchBlend;
  const leanXTarget = -(speedN * 0.14) - dash * 0.28; // pitch forward with speed / dash
  const leanZTarget = clamp(-turn * 0.9, -0.32, 0.32); // bank into the turn
  P.leanX = damp(P.leanX, leanXTarget, 9, dt);
  P.leanZ = damp(P.leanZ, leanZTarget, 9, dt);
  P.lookY = damp(P.lookY, lookYaw, 6, dt);

  P.phase += speed * dt * 3.4;
  const s = Math.sin(P.phase * Math.PI);

  // legs plant on the ground; stride grows with speed
  const lift = 0.11 - cb * 0.05;
  P.feet[0].position.z = 0.05 + (moving ? s * 0.22 : 0);
  P.feet[0].position.y = moving ? Math.max(0, s) * lift : 0;
  P.feet[1].position.z = 0.05 + (moving ? -s * 0.22 : 0);
  P.feet[1].position.y = moving ? Math.max(0, -s) * lift : 0;

  // body: crouch lower, vertical bob, dash stretch, forward lean + waddle/bank
  const baseY = -0.16 * cb;
  const bob = moving ? Math.abs(s) * 0.05 : Math.sin(t * 1.8) * 0.015;
  P.body.position.y = 0.62 + baseY + bob;
  const waddle = moving ? s * 0.06 * (1 - cb) : 0;
  P.body.rotation.x = cb * 0.28 + (moving ? 0.1 : 0) + P.leanX;
  P.body.rotation.z = P.leanZ + waddle;
  // multiply the authored silhouette scale so dash stretch keeps each species' shape
  P.body.scale.z = P.baseScaleZ * (1 + dash * 0.28 - Math.abs(waddle) * 0.1);
  P.body.scale.y = P.baseScaleY * (1 - dash * 0.12);

  // head: pigeon thrust while walking, organic pecks when idle, glance + lean
  const hy = P.baseHeadY + baseY * 1.4 - cb * 0.14;
  if (moving) {
    P.head.position.z = P.baseHeadZ + pigeonBob(P.phase) * 0.09;
    P.head.position.y = hy + Math.abs(s) * 0.02;
    P.head.rotation.x = 0.05 + cb * 0.25 + P.leanX * 0.5;
    P.head.rotation.y = P.lookY;
    P.idleT = 0;
  } else {
    P.idleT += dt;
    const peck = Math.max(0, Math.sin(P.idleT * 1.1 - 2)) * 0.5;
    // layered low-frequency noise → head never sits perfectly still
    const idleLook = Math.sin(P.idleT * 0.7) * 0.5 + Math.sin(P.idleT * 0.23 + 1) * 0.18;
    P.head.position.z = P.baseHeadZ + peck * 0.12;
    P.head.position.y = hy - peck * 0.3;
    P.head.rotation.x = peck * 0.9 + P.leanX * 0.5;
    P.head.rotation.y = idleLook + P.lookY;
  }

  // wings: flutter with gait, flare/sweep back on a dash, asymmetry on a bank
  const flut = moving ? Math.sin(P.phase * Math.PI * 2) * 0.08 * Math.min(speed / 4, 1) : 0;
  const sweep = dash * 0.5;
  const bankTilt = P.leanZ * 0.6;
  P.wings[0].rotation.z = -0.15 + flut - sweep + bankTilt;
  P.wings[1].rotation.z = 0.15 - flut + sweep + bankTilt;
  P.wings[0].rotation.x = -sweep * 0.6;
  P.wings[1].rotation.x = -sweep * 0.6;

  // tail steers/counterbalances
  P.tail.rotation.x = -0.45 + (moving ? s * 0.08 : Math.sin(t * 2.3) * 0.04) - dash * 0.2;
  P.tail.rotation.z = -P.leanZ * 0.5;
}
