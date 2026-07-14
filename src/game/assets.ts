/**
 * 3D model pipeline (glTF + Draco) — "Path A" integration.
 *
 * A sourced model plugs in by exposing named child nodes matching the Bird
 * interface (see docs/asset-plan.md §7.3); we map those nodes onto a `Bird`
 * so the existing procedural `animBird` drives them unchanged — no skeletal
 * clips required. Until a model is registered in MODELS this is inert and the
 * game keeps using the procedural `makeBird`, so shipping this is zero-risk.
 *
 * The heavy loaders are dynamically imported the first time a model is actually
 * requested, so they add nothing to the main bundle while MODELS is empty.
 */
import * as THREE from 'three';
import type { Bird } from './types';
import type { BirdKind } from '../data/characters';

/**
 * Registry: BirdKind → .glb URL. Empty by design — drop a model in
 * `public/models/` and add an entry here to switch that species to 3D.
 * e.g. `pigeon: 'models/pigeon.glb'`.
 */
export const MODELS: Partial<Record<BirdKind, string>> = {};

/** Draco decoder location. For offline/self-host, copy the decoder to public/draco/. */
const DRACO_PATH = 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';

/** Required node names (Path A contract). Left/right explicit; see asset-plan §7.3. */
const REQUIRED = ['body', 'head', 'tail', 'wing_R', 'wing_L', 'foot_R', 'foot_L'] as const;

/**
 * Assemble a `Bird` from a loaded model root by looking up the contract nodes.
 * Returns null (caller falls back to procedural) if any required node is absent,
 * so a mis-authored asset degrades gracefully instead of throwing at runtime.
 *
 * animBird only ever reads/writes `.position`, `.rotation` and `.scale`, which
 * exist on every Object3D, so the mesh-typed Bird fields are satisfied by casts.
 */
export function buildBirdFromObject(root: THREE.Object3D): Bird | null {
  const find = (n: string) => root.getObjectByName(n);
  for (const n of REQUIRED) if (!find(n)) return null;
  const body = find('body')!;
  const head = find('head')!;
  const tail = find('tail')!;
  const wR = find('wing_R')!;
  const wL = find('wing_L')!;
  const fR = find('foot_R')!;
  const fL = find('foot_L')!;
  return {
    group: root as THREE.Group,
    body: body as THREE.Mesh,
    head: head as THREE.Group,
    wings: [wR as THREE.Mesh, wL as THREE.Mesh],
    feet: [fR as THREE.Group, fL as THREE.Group],
    tail: tail as THREE.Mesh,
    phase: 0,
    idleT: 0,
    // captured from the authored rest pose so animBird offsets stay relative
    baseHeadY: head.position.y,
    baseHeadZ: head.position.z,
    crouchBlend: 0,
    leanX: 0,
    leanZ: 0,
    lookY: 0,
    baseScaleY: body.scale.y || 1,
    baseScaleZ: body.scale.z || 1,
  };
}

/** Loaded model roots, keyed by kind. Cloned per spawn. */
const templates = new Map<BirdKind, THREE.Object3D>();

/** Dynamically load a .glb (with Draco) and return its scene root. */
async function loadGLTF(url: string): Promise<THREE.Object3D> {
  const [{ GLTFLoader }, { DRACOLoader }] = await Promise.all([
    import('three/examples/jsm/loaders/GLTFLoader.js'),
    import('three/examples/jsm/loaders/DRACOLoader.js'),
  ]);
  const draco = new DRACOLoader();
  draco.setDecoderPath(DRACO_PATH);
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);
  const gltf = await loader.loadAsync(url);
  return gltf.scene;
}

/**
 * Preload every registered model into the template cache. Fire-and-forget at
 * startup; spawns before it resolves simply use the procedural fallback. Errors
 * are swallowed so a missing/broken asset never breaks the game.
 */
export async function preloadBirdModels(): Promise<void> {
  await Promise.all(
    (Object.keys(MODELS) as BirdKind[]).map(async (kind) => {
      try {
        const root = await loadGLTF(MODELS[kind]!);
        if (buildBirdFromObject(root)) templates.set(kind, root);
      } catch {
        /* leave uncached → procedural fallback */
      }
    }),
  );
}

/**
 * Return a fresh `Bird` from the cached model for `kind`, or null if none is
 * loaded (caller falls back to `makeBird`). The template is deep-cloned so each
 * actor animates independently.
 */
export function birdModel(kind: BirdKind): Bird | null {
  const tpl = templates.get(kind);
  if (!tpl) return null;
  return buildBirdFromObject(tpl.clone(true));
}
