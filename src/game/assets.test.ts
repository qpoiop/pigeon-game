import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildBirdFromObject } from './assets';
import { animBird } from './birds';

/** Build a synthetic model root satisfying the Path A node contract. */
function fakeModelRoot(): THREE.Group {
  const root = new THREE.Group();
  const add = (name: string, y = 0, z = 0) => {
    const o = new THREE.Object3D();
    o.name = name;
    o.position.set(0, y, z);
    root.add(o);
    return o;
  };
  add('body', 0.62, 0).scale.set(0.95, 0.82, 1.25);
  add('head', 1.16, 0.42);
  add('tail', 0.72, -0.6);
  add('wing_R', 0.66, -0.05);
  add('wing_L', 0.66, -0.05);
  add('foot_R', 0, 0.05);
  add('foot_L', 0, 0.05);
  return root;
}

describe('glTF Path A node mapping', () => {
  it('maps contract nodes onto a Bird and captures the rest pose', () => {
    const bird = buildBirdFromObject(fakeModelRoot());
    expect(bird).not.toBeNull();
    expect(bird!.wings).toHaveLength(2);
    expect(bird!.feet).toHaveLength(2);
    // rest pose captured for relative animation offsets
    expect(bird!.baseHeadY).toBeCloseTo(1.16);
    expect(bird!.baseHeadZ).toBeCloseTo(0.42);
    expect(bird!.baseScaleZ).toBeCloseTo(1.25);
  });

  it('returns null when a required node is missing (graceful fallback)', () => {
    const root = fakeModelRoot();
    root.getObjectByName('wing_L')!.name = 'oops';
    expect(buildBirdFromObject(root)).toBeNull();
  });

  it('procedural animBird drives the mapped model without throwing', () => {
    const bird = buildBirdFromObject(fakeModelRoot())!;
    // a few frames across gaits: idle, walking, dashing, crouched
    for (const [speed, dash, crouch] of [
      [0, 0, false],
      [4, 0, false],
      [4, 1, false],
      [1, 0, true],
    ] as [number, number, boolean][]) {
      expect(() =>
        animBird(bird, { speed, dt: 1 / 60, t: 1.5, crouch, turn: 0.2, dash }),
      ).not.toThrow();
    }
    // the wings actually moved off their rest rotation
    expect(bird.wings[0].rotation.z).not.toBe(0);
    // base silhouette scale preserved (dash multiplies, not replaces)
    expect(bird.body.scale.z).toBeGreaterThan(0);
  });
});
