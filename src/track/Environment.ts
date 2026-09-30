import * as T from 'three';
import type { Circuit } from './Circuit';
import { seededRandom } from '../core/math';
import { box, material, textTexture } from '../render/materials';

export function createEnvironment(circuit: Circuit) {
  const group = new T.Group();
  const sand = material('#c9c39d'),
    stone = material('#b2ab8b'),
    foliage = material('#607258');
  const dark = material('#334c43'),
    cream = material('#eee7d2');
  const coastline = [
    [-221, -335],
    [-264, -245],
    [-240, -140],
    [-235, -20],
    [-242, 95],
    [-203, 205],
    [-115, 242],
    [-30, 251],
    [120, 247],
    [244, 201],
    [302, 110],
    [308, -31],
    [274, -210],
    [169, -267],
    [13, -282],
    [-115, -297],
  ];
  const shape = new T.Shape();
  coastline.forEach(([x, z], i) => (i ? shape.lineTo(x, -z) : shape.moveTo(x, -z)));
  shape.closePath();
  const land = new T.Mesh(
    new T.ExtrudeGeometry(shape, {
      depth: 10,
      bevelEnabled: true,
      bevelSize: 5,
      bevelThickness: 3,
      bevelSegments: 2,
      steps: 1,
    }),
    [sand, stone],
  );
  land.rotation.x = -Math.PI / 2;
  land.position.y = -13;
  land.receiveShadow = true;
  group.add(land);
  // The top of the extrusion is at ground level after its bevel.
  const top = new T.Mesh(new T.ShapeGeometry(shape), sand);
  top.rotation.x = -Math.PI / 2;
  top.position.y = -0.025;
  top.receiveShadow = true;
  group.add(top);
  const sea = new T.Mesh(
    new T.PlaneGeometry(5000, 5000),
    new T.MeshStandardMaterial({ color: '#5babad', roughness: 0.36, metalness: 0.24 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -5;
  group.add(sea);
  // Two soft coastal bands keep the water readable without costly reflections.
  const shoreline = new T.LineLoop(
    new T.BufferGeometry().setFromPoints(
      coastline.map(([x, z]) => new T.Vector3(x * 1.018, -4.9, z * 1.018)),
    ),
    new T.LineBasicMaterial({ color: '#acd4c1', transparent: true, opacity: 0.65 }),
  );
  group.add(shoreline);
  const random = seededRandom(113);
  const dummy = new T.Object3D();
  const trunks = new T.InstancedMesh(
    new T.CylinderGeometry(0.22, 0.4, 4, 6),
    material('#796c50'),
    150,
  );
  const crowns = new T.InstancedMesh(new T.IcosahedronGeometry(1, 1), foliage, 150);
  const shrubs = new T.InstancedMesh(new T.IcosahedronGeometry(1, 1), material('#8a9471'), 160);
  let count = 0;
  for (let tries = 0; tries < 2000 && count < 150; tries++) {
    const x = -197 + random() * 437,
      z = -237 + random() * 440;
    if (circuit.nearest(x, z).distance < 19 || (x < -126 && z > -175 && z < 75)) continue;
    const height = 3.2 + random() * 5;
    dummy.position.set(x, height * 0.25, z);
    dummy.scale.set(1, height / 7, 1);
    dummy.rotation.set(0, random() * 6.28, 0);
    dummy.updateMatrix();
    trunks.setMatrixAt(count, dummy.matrix);
    dummy.position.y = height * 0.66;
    dummy.scale.set(1.3 + random(), height * 0.64, 1.3 + random());
    dummy.updateMatrix();
    crowns.setMatrixAt(count, dummy.matrix);
    crowns.setColorAt(
      count,
      new T.Color().setHSL(0.22 + random() * 0.07, 0.16, 0.28 + random() * 0.12),
    );
    count++;
  }
  trunks.count = crowns.count = count;
  trunks.castShadow = true;
  crowns.castShadow = true;
  group.add(trunks, crowns);
  let shrubCount = 0;
  for (let tries = 0; tries < 1000 && shrubCount < 160; tries++) {
    const x = -211 + random() * 477,
      z = -247 + random() * 465;
    if (circuit.nearest(x, z).distance < 14) continue;
    dummy.position.set(x, 0.25, z);
    dummy.scale.set(1 + random() * 2, 0.6 + random(), 1 + random() * 2);
    dummy.updateMatrix();
    shrubs.setMatrixAt(shrubCount++, dummy.matrix);
  }
  shrubs.count = shrubCount;
  group.add(shrubs);
  const rocks = new T.InstancedMesh(new T.DodecahedronGeometry(1, 0), stone, 55);
  for (let i = 0; i < 55; i++) {
    const x = -250 - random() * 50,
      z = -300 + random() * 540;
    dummy.position.set(x, -4.5, z);
    dummy.scale.set(3 + random() * 7, 1 + random() * 6, 3 + random() * 5);
    dummy.rotation.set(random(), random() * 6, random());
    dummy.updateMatrix();
    rocks.setMatrixAt(i, dummy.matrix);
  }
  group.add(rocks);
  // Distant headland: a restrained, broad silhouette across the bay.
  for (let i = 0; i < 8; i++) {
    const mountain = new T.Mesh(
      new T.ConeGeometry(100 + random() * 100, 80 + random() * 100, 7),
      material(i % 2 ? '#8a9e94' : '#98aaa0'),
    );
    mountain.position.set(-650 - random() * 240, 3, -650 + i * 185);
    mountain.rotation.y = random() * 6;
    mountain.scale.z = 1.4;
    group.add(mountain);
  }
  // Pit pavilion: shaded garages, a continuous viewing terrace and a sculptural roof.
  const pit = new T.Group();
  pit.position.set(-136, 0, -67);
  box(pit, [10, 3.5, 62], [0, 1.75, 0], cream);
  box(pit, [10.6, 0.28, 64], [0, 3.62, 0], dark);
  box(pit, [7.5, 2.7, 53], [0.7, 5.05, 0], cream);
  box(pit, [0.06, 1.8, 50], [-3.1, 5.15, 0], material('#5e8782', 0.3, 0.35));
  box(pit, [12, 0.25, 66], [-0.5, 6.55, 0], cream);
  for (let i = 0; i < 8; i++) {
    box(pit, [0.08, 2.65, 5.9], [-5.04, 1.4, -26 + i * 7.5], dark);
    box(
      pit,
      [0.12, 0.16, 5.9],
      [-5.12, 2.78, -26 + i * 7.5],
      material(i % 2 ? '#d5f06b' : '#d77a56'),
    );
  }
  group.add(pit);
  const stand = new T.Group();
  stand.position.set(-190, 0, -7);
  for (let row = 0; row < 5; row++) {
    box(stand, [1.3, 0.5 + row * 0.65, 39], [-row * 1.35, (0.5 + row * 0.65) / 2, 0], stone);
    for (let seat = 0; seat < 35; seat++)
      box(
        stand,
        [0.65, 0.15, 0.64],
        [-row * 1.35, 0.62 + row * 0.65, -18 + seat * 1.05],
        seat % 8 < 4 ? dark : cream,
      );
  }
  for (const z of [-20, 0, 20]) box(stand, [0.2, 6.5, 0.2], [-6.4, 3.25, z], dark);
  const roof = box(stand, [9, 0.2, 43], [-2.5, 6.35, 0], cream);
  roof.rotation.z = -0.07;
  group.add(stand);
  // Sailboat and lighthouse identify the coast without filling it with clutter.
  const boat = new T.Group();
  boat.position.set(-330, -4.1, 35);
  boat.rotation.y = -0.5;
  const hull = new T.Mesh(new T.SphereGeometry(1, 12, 8), cream);
  hull.scale.set(1.5, 0.8, 5);
  boat.add(hull);
  box(boat, [0.1, 12, 0.1], [0, 5.5, 0], dark);
  const sailGeo = new T.BufferGeometry();
  sailGeo.setAttribute('position', new T.Float32BufferAttribute([0, 1, 0, 0, 11, 0, 0, 1, 4.2], 3));
  sailGeo.computeVertexNormals();
  boat.add(
    new T.Mesh(sailGeo, new T.MeshStandardMaterial({ color: '#f1ebd3', side: T.DoubleSide })),
  );
  group.add(boat);
  const lighthouse = new T.Group();
  lighthouse.position.set(-213, 0, 156);
  const tower = new T.Mesh(new T.CylinderGeometry(2, 2.9, 16, 16), cream);
  tower.position.y = 8;
  tower.castShadow = true;
  lighthouse.add(tower);
  const lantern = new T.Mesh(new T.CylinderGeometry(2.4, 2.4, 2.3, 12), dark);
  lantern.position.y = 16.8;
  lighthouse.add(lantern);
  const cap = new T.Mesh(new T.ConeGeometry(3.2, 2, 12), material('#be6a4b'));
  cap.position.y = 18.7;
  lighthouse.add(cap);
  group.add(lighthouse);
  // Trackside club signs use original fictional branding.
  for (const index of [48, 148, 345, 495, 640, 764]) {
    const p = circuit.at(index),
      sign = new T.Group();
    sign.position.set(p.x + p.nx * 14, 0, p.z + p.nz * 14);
    sign.rotation.y = Math.atan2(p.tx, p.tz);
    for (const x of [-3, 3]) box(sign, [0.1, 2.6, 0.1], [x, 1.3, 0], dark);
    const panel = new T.Mesh(
      new T.BoxGeometry(7.5, 1.8, 0.15),
      new T.MeshStandardMaterial({
        map: textTexture(index % 2 ? 'VELOCE' : 'SLIPSTREAM', '#d5ed7b', '#243e37'),
      }),
    );
    panel.position.y = 2.2;
    sign.add(panel);
    group.add(sign);
  }
  return group;
}
