import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Collapse static props by material so track decoration does not cost a draw per seat. */
export function batchStatic(root: T.Group) {
  root.updateMatrixWorld(true);
  const inverseRoot = root.matrixWorld.clone().invert();
  const buckets = new Map<
    string,
    { material: T.Material; geometries: T.BufferGeometry[]; shadows: boolean }
  >();
  const originals: T.Mesh[] = [];
  root.traverse((object) => {
    if (
      !(object instanceof T.Mesh) ||
      object instanceof T.InstancedMesh ||
      Array.isArray(object.material)
    )
      return;
    const attributes = Object.keys(object.geometry.attributes).sort().join(',');
    const key = `${object.material.uuid}:${object.castShadow}:${attributes}`;
    if (!buckets.has(key))
      buckets.set(key, { material: object.material, geometries: [], shadows: object.castShadow });
    const transform = new T.Matrix4().multiplyMatrices(inverseRoot, object.matrixWorld);
    const geo = object.geometry.clone().applyMatrix4(transform);
    if (geo.index) {
      buckets.get(key)!.geometries.push(geo.toNonIndexed());
      geo.dispose();
    } else buckets.get(key)!.geometries.push(geo);
    originals.push(object);
  });
  for (const original of originals) original.removeFromParent();
  for (const bucket of buckets.values()) {
    const geometry = mergeGeometries(bucket.geometries, false);
    if (!geometry) throw new Error('Static geometry could not be batched');
    const mesh = new T.Mesh(geometry, bucket.material);
    mesh.castShadow = bucket.shadows;
    mesh.receiveShadow = true;
    root.add(mesh);
    bucket.geometries.forEach((g) => g.dispose());
  }
  const geometries = new Set(originals.map((mesh) => mesh.geometry));
  geometries.forEach((g) => g.dispose());
  return root;
}
