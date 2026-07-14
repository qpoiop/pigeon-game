import * as THREE from 'three';

/** Texture-bearing slots a material might hold; each needs its own dispose. */
const TEXTURE_SLOTS = [
  'map',
  'lightMap',
  'aoMap',
  'emissiveMap',
  'bumpMap',
  'normalMap',
  'displacementMap',
  'roughnessMap',
  'metalnessMap',
  'alphaMap',
  'envMap',
  'specularMap',
  'gradientMap',
] as const;

function disposeMaterial(material: THREE.Material): void {
  const m = material as unknown as Record<string, unknown>;
  for (const slot of TEXTURE_SLOTS) {
    const tex = m[slot] as THREE.Texture | undefined | null;
    if (tex && (tex as THREE.Texture).isTexture) tex.dispose();
  }
  material.dispose();
}

/**
 * Recursively free the GPU resources (geometry, material(s), their textures)
 * held by an Object3D subtree. Call this after removing the object from the
 * scene graph — removing alone does not release GPU memory, so rebuilding
 * levels without disposing leaks geometries/textures over time.
 *
 * Safe to call on shared materials (Material.dispose is idempotent).
 */
export function disposeObject(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const withGeom = obj as THREE.Object3D & { geometry?: THREE.BufferGeometry };
    if (withGeom.geometry && typeof withGeom.geometry.dispose === 'function') {
      withGeom.geometry.dispose();
    }
    const withMat = obj as THREE.Object3D & {
      material?: THREE.Material | THREE.Material[];
    };
    const mat = withMat.material;
    if (Array.isArray(mat)) mat.forEach(disposeMaterial);
    else if (mat) disposeMaterial(mat);
  });
}
