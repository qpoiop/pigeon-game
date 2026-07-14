import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { disposeObject } from './three-utils';

describe('disposeObject', () => {
  it('disposes geometry and material of every mesh in the subtree', () => {
    const root = new THREE.Group();
    const geo1 = new THREE.BoxGeometry(1, 1, 1);
    const mat1 = new THREE.MeshBasicMaterial();
    const mesh1 = new THREE.Mesh(geo1, mat1);
    const child = new THREE.Group();
    const geo2 = new THREE.SphereGeometry(1);
    const mat2 = new THREE.MeshLambertMaterial();
    const mesh2 = new THREE.Mesh(geo2, mat2);
    child.add(mesh2);
    root.add(mesh1);
    root.add(child);

    const spies = [geo1, mat1, geo2, mat2].map((r) => vi.spyOn(r, 'dispose'));
    disposeObject(root);
    for (const s of spies) expect(s).toHaveBeenCalledTimes(1);
  });

  it('disposes a material texture (e.g. a sprite map)', () => {
    const canvas = { width: 2, height: 2 } as unknown as HTMLCanvasElement;
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex });
    const sprite = new THREE.Sprite(mat);
    const texSpy = vi.spyOn(tex, 'dispose');
    const matSpy = vi.spyOn(mat, 'dispose');
    disposeObject(sprite);
    expect(texSpy).toHaveBeenCalledTimes(1);
    expect(matSpy).toHaveBeenCalledTimes(1);
  });

  it('handles an array of materials', () => {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const a = new THREE.MeshBasicMaterial();
    const b = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(geo, [a, b]);
    const spyA = vi.spyOn(a, 'dispose');
    const spyB = vi.spyOn(b, 'dispose');
    disposeObject(mesh);
    expect(spyA).toHaveBeenCalledTimes(1);
    expect(spyB).toHaveBeenCalledTimes(1);
  });

  it('does not throw on a bare object with no geometry/material', () => {
    expect(() => disposeObject(new THREE.Group())).not.toThrow();
  });
});
