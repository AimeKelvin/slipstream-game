import * as T from 'three';
import { Circuit } from './Circuit';
import { TRACK } from '../core/config';
import { box, material, textTexture } from '../render/materials';
import { seededRandom } from '../core/math';

function ribbon(
  circuit: Circuit,
  inner: number,
  outer: number,
  y: number,
  mat: T.Material,
  curb = false,
) {
  const positions: number[] = [],
    uvs: number[] = [],
    indices: number[] = [],
    colors: number[] = [];
  const red = new T.Color('#d77658'),
    white = new T.Color('#f3eddb');
  for (let i = 0; i < circuit.samples.length; i++) {
    const a = circuit.at(i),
      b = circuit.at(i + 1);
    for (const [p, offset] of [
      [a, inner],
      [a, outer],
      [b, inner],
      [b, outer],
    ] as const) {
      positions.push(p.x + p.nx * offset, y, p.z + p.nz * offset);
      uvs.push(p.x / 12, p.z / 12);
      const color = Math.floor(i / 3) % 2 === 0 ? red : white;
      colors.push(color.r, color.g, color.b);
    }
    const n = i * 4;
    indices.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
  if (curb) geo.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new T.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

export function createTrack(circuit: Circuit) {
  const group = new T.Group();
  group.name = 'Cala Sola circuit';
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d')!,
    random = seededRandom(47);
  const data = ctx.createImageData(512, 512);
  for (let i = 0; i < data.data.length; i += 4) {
    const v = 58 + random() * 5;
    data.data[i] = v;
    data.data[i + 1] = v + 3;
    data.data[i + 2] = v + 2;
    data.data[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  const asphalt = new T.CanvasTexture(canvas);
  asphalt.wrapS = asphalt.wrapT = T.RepeatWrapping;
  asphalt.colorSpace = T.SRGBColorSpace;
  asphalt.anisotropy = 8;
  const road = new T.MeshStandardMaterial({ map: asphalt, roughness: 1, side: T.DoubleSide });
  const gravel = material('#c4b999');
  gravel.side = T.DoubleSide;
  const edge = material('#edead9');
  edge.side = T.DoubleSide;
  const curbs = new T.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.85,
    side: T.DoubleSide,
  });
  group.add(ribbon(circuit, -12.2, 12.2, 0.005, gravel));
  group.add(ribbon(circuit, -6.5, 6.5, 0.035, road));
  for (const side of [-1, 1]) {
    group.add(ribbon(circuit, side * 6.18, side * 6.31, 0.044, edge));
    group.add(ribbon(circuit, side * 6.5, side * 7.25, 0.065, curbs, true));
  }
  const dummy = new T.Object3D();
  const barrierCount = Math.ceil(circuit.samples.length / 3) * 2;
  const barriers = new T.InstancedMesh(
    new T.BoxGeometry(1, 0.8, 1),
    material('#ddd9c8', 0.83),
    barrierCount,
  );
  const tops = new T.InstancedMesh(
    new T.BoxGeometry(1, 0.13, 1),
    material('#476158'),
    barrierCount,
  );
  let n = 0;
  for (let i = 0; i < circuit.samples.length; i += 3) {
    const a = circuit.at(i),
      b = circuit.at(i + 3);
    for (const side of [-1, 1]) {
      const ax = a.x + a.nx * side * 12.2,
        az = a.z + a.nz * side * 12.2;
      const bx = b.x + b.nx * side * 12.2,
        bz = b.z + b.nz * side * 12.2;
      dummy.position.set((ax + bx) / 2, 0.4, (az + bz) / 2);
      dummy.rotation.set(0, Math.atan2(bx - ax, bz - az), 0);
      dummy.scale.set(0.5, 1, Math.hypot(bx - ax, bz - az) + 0.08);
      dummy.updateMatrix();
      barriers.setMatrixAt(n, dummy.matrix);
      dummy.position.y = 0.865;
      dummy.updateMatrix();
      tops.setMatrixAt(n, dummy.matrix);
      n++;
    }
  }
  barriers.castShadow = true;
  barriers.receiveShadow = true;
  group.add(barriers, tops);
  // A physical grid and finish stripe make the pit straight immediately readable.
  const start = circuit.at(TRACK.startIndex + 5);
  const grid = new T.Group();
  grid.position.set(start.x, 0.06, start.z);
  grid.rotation.y = Math.atan2(start.tx, start.tz);
  const light = material('#eae9d7'),
    dark = material('#272f2e');
  for (let x = 0; x < 18; x++)
    for (let z = 0; z < 2; z++) {
      box(grid, [0.69, 0.01, 0.69], [-6 + x * 0.7, 0, z * 0.7], (x + z) % 2 ? light : dark);
    }
  for (let slot = 0; slot < 6; slot++) {
    const x = slot % 2 ? 2.8 : -2.8,
      z = -8 - slot * 6;
    box(grid, [2.2, 0.015, 0.12], [x, 0, z], light);
    for (const side of [-1, 1]) box(grid, [0.12, 0.015, 1.7], [x + side * 1.1, 0, z - 0.8], light);
  }
  const steel = material('#3d514c', 0.6, 0.35);
  for (const side of [-1, 1]) box(grid, [0.32, 5.5, 0.4], [side * 10.5, 2.75, 2], steel);
  box(grid, [21.6, 0.92, 0.45], [0, 5.5, 2], steel);
  const sign = new T.Mesh(
    new T.PlaneGeometry(15, 0.85),
    new T.MeshStandardMaterial({
      map: textTexture('C A L A   S O L A', '#243e37', '#f0edda'),
      side: T.DoubleSide,
    }),
  );
  sign.position.set(0, 5.51, 1.765);
  sign.rotation.y = Math.PI;
  grid.add(sign);
  for (let i = 0; i < 5; i++) {
    box(grid, [0.44, 0.52, 0.25], [(i - 2) * 0.63, 4.72, 2], dark);
    const lamp = new T.Mesh(new T.CircleGeometry(0.13, 12), material('#502a23'));
    lamp.position.set((i - 2) * 0.63, 4.72, 1.865);
    lamp.rotation.y = Math.PI;
    grid.add(lamp);
  }
  group.add(grid);
  // Distance boards before major turns.
  for (const index of [83, 250, 393, 570, 688, 800]) {
    for (let j = 0; j < 3; j++) {
      const p = circuit.at(index - j * 13);
      const board = new T.Mesh(new T.BoxGeometry(1.45, 1.3, 0.13), [
        steel,
        steel,
        steel,
        steel,
        new T.MeshStandardMaterial({
          map: textTexture(String(50 + j * 50), '#ecebdc', '#243e37', 256, 256),
        }),
        steel,
      ]);
      board.position.set(p.x + p.nx * 10.8, 1.8, p.z + p.nz * 10.8);
      board.rotation.y = Math.atan2(p.tx, p.tz) + Math.PI;
      group.add(board);
    }
  }
  return group;
}
