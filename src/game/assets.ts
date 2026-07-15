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
 * Registry: BirdKind → .glb URL. Drop a model in `public/` and add an entry
 * here to switch that species to 3D. Relative to the app base (`./`).
 */
export const MODELS: Partial<Record<BirdKind, string>> = {
  // pigeon: 'pigeon/pigeon.glb', // disabled: rig-less static mesh looked stiff
  //   + undersized; awaiting a replacement model. Procedural makeBird meanwhile.
};

/**
 * Per-model normalisation. A sourced mesh comes in at an arbitrary origin,
 * scale and forward axis; we recentre it (feet on y=0, centred on x/z), scale
 * to a common height, and rotate its forward to +Z so `group.rotation.y=facing`
 * points it the right way. `yaw` is the fix-up if a model faces the wrong way.
 */
const NORM: Partial<Record<BirdKind, { height: number; yaw: number }>> = {
  pigeon: { height: 1.35, yaw: 0 },
};

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
/**
 * Recentre + rescale + reorient a raw model in place, and swap its meshes onto
 * the game's lit material (vertex colours preserved) with recomputed normals
 * (simplification can drop them). Returns a container ready to parent/clone.
 */
function normalizeModel(root: THREE.Object3D, height: number, yaw: number): THREE.Group {
  root.updateWorldMatrix(true, true);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.computeVertexNormals();
    const hasColor = !!m.geometry.getAttribute('color');
    m.material = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: hasColor });
    m.castShadow = false;
    m.receiveShadow = false;
  });
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const s = height / (size.y || 1);
  // centre on x/z, drop feet to y=0 (offsets are pre-scale, in the wrap's space)
  root.position.x -= center.x;
  root.position.z -= center.z;
  root.position.y -= box.min.y;
  root.rotation.y += yaw; // fix forward axis → +Z
  const wrap = new THREE.Group();
  wrap.scale.setScalar(s);
  wrap.add(root);
  return wrap;
}

/**
 * Wrap a rig-less model as a static `Bird`: the visible mesh lives directly on
 * the group (which the engine positions + yaws), while the limb fields point at
 * empty dummies so `animBird`'s per-limb writes are harmless no-ops. Result:
 * the model slides + turns with the actor but doesn't flap (no skeleton).
 */
function buildStaticBird(model: THREE.Object3D): Bird {
  const group = new THREE.Group();
  group.add(model);
  const dummy = () => {
    const g = new THREE.Group();
    group.add(g);
    return g;
  };
  const body = dummy();
  return {
    group,
    body: body as unknown as THREE.Mesh,
    head: dummy(),
    wings: [dummy() as unknown as THREE.Mesh, dummy() as unknown as THREE.Mesh],
    feet: [dummy(), dummy()],
    tail: dummy() as unknown as THREE.Mesh,
    phase: 0,
    idleT: 0,
    baseHeadY: 0,
    baseHeadZ: 0,
    crouchBlend: 0,
    leanX: 0,
    leanZ: 0,
    lookY: 0,
    baseScaleY: 1,
    baseScaleZ: 1,
  };
}

export function buildBirdFromObject(root: THREE.Object3D): Bird | null {
  const find = (n: string) => root.getObjectByName(n);
  // rig-less sourced model (single mesh) → static Bird (no procedural limbs)
  if (REQUIRED.some((n) => !find(n))) return buildStaticBird(root);
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
        let root = await loadGLTF(MODELS[kind]!);
        const nz = NORM[kind];
        if (nz) root = normalizeModel(root, nz.height, nz.yaw);
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

/** A cloned, normalised model root for static display (e.g. the title hero). */
export function heroModel(kind: BirdKind): THREE.Object3D | null {
  const tpl = templates.get(kind);
  return tpl ? tpl.clone(true) : null;
}
