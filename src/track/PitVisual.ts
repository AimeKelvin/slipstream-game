import * as T from 'three';
import type { Circuit } from './Circuit';
import { TEAMS, type SeatView } from '../network/protocol';
import type { VehicleState } from '../vehicle/VehiclePhysics';
import { box, material, textTexture } from '../render/materials';
import { batchStatic } from '../render/batchStatic';

export class PitVisual {
  readonly root = new T.Group();
  private paints: T.MeshStandardMaterial[] = [];
  private labels: T.MeshStandardMaterial[] = [];
  private names: string[] = [];
  private bodies = new T.InstancedMesh(
    new T.CylinderGeometry(0.26, 0.32, 0.85, 6),
    material('#ffffff'),
    30,
  );
  private helmets = new T.InstancedMesh(new T.SphereGeometry(0.22, 8, 6), material('#e9eadb'), 30);
  private wheels = new T.InstancedMesh(
    new T.CylinderGeometry(0.38, 0.38, 0.33, 12),
    material('#192220'),
    24,
  );
  private arms = new T.InstancedMesh(
    new T.CylinderGeometry(0.09, 0.1, 0.6, 5),
    material('#e0e5d9'),
    60,
  );
  private legs = new T.InstancedMesh(
    new T.CylinderGeometry(0.1, 0.13, 0.6, 5),
    material('#20352f'),
    60,
  );
  private dummy = new T.Object3D();
  private selected = 0;
  private marker: T.Mesh;
  constructor(private circuit: Circuit) {
    const pit = circuit.pit,
      geometry = new T.BufferGeometry();
    const positions: number[] = [],
      indices: number[] = [];
    for (let i = 0; i <= 160; i++) {
      const distance = (pit.length * i) / 160,
        p = pit.frame(distance);
      const spread = Math.min(1, distance / 50, (pit.length - distance) / 45);
      for (const offset of [12 * spread, 31 * spread])
        positions.push(p.x + p.nx * offset, 0.047, p.z + p.nz * offset);
      if (i < 160) {
        const n = i * 2;
        indices.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
      }
    }
    geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const lane = new T.Mesh(
      geometry,
      new T.MeshStandardMaterial({ color: '#495957', roughness: 1, side: T.DoubleSide }),
    );
    lane.receiveShadow = true;
    this.root.add(lane);
    const scenery = new T.Group(),
      white = material('#f1edda'),
      dark = material('#233c36'),
      cream = material('#ddd9c8');
    for (let d = 8; d < pit.length - 5; d += 7) {
      const p = pit.point(d),
        a = pit.point(d + 1);
      const dash = box(scenery, [0.14, 0.02, 3], [p.x, 0.07, p.z], white);
      dash.rotation.y = Math.atan2(a.x - p.x, a.z - p.z);
    }
    for (let slot = 0; slot < 6; slot++) {
      const p = pit.box(slot),
        garage = new T.Group();
      garage.position.set(p.x, 0, p.z);
      garage.rotation.y = p.heading;
      const paint = material(TEAMS[slot].color);
      this.paints.push(paint);
      box(garage, [8, 4.1, 16], [10, 2.05, 0], cream);
      box(garage, [0.08, 3.4, 13], [5.96, 1.75, 0], dark);
      box(garage, [11, 0.25, 18], [8.5, 4.25, 0], dark);
      box(garage, [0.15, 0.3, 16], [3.02, 4.18, 0], paint);
      box(garage, [0.2, 4.2, 0.2], [3.05, 2.1, -8], dark);
      box(garage, [0.2, 4.2, 0.2], [3.05, 2.1, 8], dark);
      for (const side of [-1, 1]) {
        box(garage, [0.12, 0.025, 7.2], [side * 1.8, 0.075, 0], white);
        box(garage, [3.7, 0.025, 0.16], [0, 0.075, side * 3.6], white);
      }
      box(garage, [3.4, 0.015, 2.2], [0, 0.07, 0], paint);
      box(garage, [0.2, 2.8, 0.2], [2.7, 1.4, 4.8], dark);
      const label = new T.MeshStandardMaterial({
        map: textTexture(
          `${TEAMS[slot].number}  ${TEAMS[slot].name.toUpperCase()}`,
          '#203c34',
          TEAMS[slot].color,
        ),
        side: T.DoubleSide,
      });
      this.labels.push(label);
      this.names.push(TEAMS[slot].name);
      const sign = new T.Mesh(new T.PlaneGeometry(5.2, 1.3), label);
      sign.position.set(1.1, 3.2, 4.8);
      sign.rotation.y = Math.PI;
      garage.add(sign);
      scenery.add(garage);
    }
    for (const [distance, text] of [
      [4, 'PIT ENTRY / 80'],
      [pit.length - 12, 'PIT EXIT'],
    ] as const) {
      const p = pit.frame(distance),
        sign = new T.Mesh(
          new T.PlaneGeometry(6, 1.5),
          new T.MeshStandardMaterial({
            map: textTexture(text, '#203c34', '#d5f06b'),
            side: T.DoubleSide,
          }),
        );
      sign.position.set(p.x + p.nx * 9, 3, p.z + p.nz * 9);
      sign.rotation.y = Math.atan2(p.tx, p.tz) + Math.PI;
      scenery.add(sign);
    }
    this.root.add(
      batchStatic(scenery),
      this.bodies,
      this.helmets,
      this.wheels,
      this.arms,
      this.legs,
    );
    this.bodies.castShadow = this.helmets.castShadow = this.wheels.castShadow = true;
    this.marker = new T.Mesh(
      new T.ConeGeometry(0.7, 1.2, 4),
      new T.MeshBasicMaterial({ color: '#d5f06b' }),
    );
    this.marker.rotation.z = Math.PI;
    this.root.add(this.marker);
    this.setTeams();
    this.update([], 0);
  }
  setTeams(seats?: SeatView[], ownSlot = 0) {
    this.selected = Math.max(0, ownSlot);
    for (let slot = 0; slot < 6; slot++) {
      const color = seats?.[slot].color ?? TEAMS[slot].color,
        name = seats?.[slot].name ?? TEAMS[slot].name;
      this.paints[slot].color.set(color);
      if (this.names[slot] !== `${name}:${color}`) {
        this.labels[slot].map?.dispose();
        this.labels[slot].map = textTexture(
          `${TEAMS[slot].number}  ${name.toUpperCase()}`,
          '#203c34',
          color,
        );
        this.labels[slot].needsUpdate = true;
        this.names[slot] = `${name}:${color}`;
      }
      for (let i = 0; i < 5; i++) this.bodies.setColorAt(slot * 5 + i, new T.Color(color));
    }
    this.bodies.instanceColor!.needsUpdate = true;
  }
  update(states: VehicleState[], time: number) {
    for (let slot = 0; slot < 6; slot++) {
      const state = states.find((s) => s.pitSlot === slot),
        box = this.circuit.pit.box(slot);
      const servicing = state?.pitPhase === 2;
      const progress = servicing ? 1 - state.pitStopTime / state.pitStopDuration : 0;
      const reach = servicing ? Math.min(1, progress * 8, (1 - progress) * 8) : 0;
      const cx = servicing ? state.x : box.x,
        cz = servicing ? state.z : box.z;
      for (let i = 0; i < 5; i++) {
        const side = i % 2 ? 1 : -1,
          front = i < 2 ? 1.5 : -1.5;
        const x = i === 4 ? 0 : side * (2.5 - reach * 0.75);
        const z = i === 4 ? 3.2 : front;
        const garageOffset = (1 - reach) * 5.2;
        this.dummy.position.set(
          cx + box.nx * (x + garageOffset) + box.tx * z,
          0.95 - reach * 0.28,
          cz + box.nz * (x + garageOffset) + box.tz * z,
        );
        const bodyX = this.dummy.position.x,
          bodyZ = this.dummy.position.z;
        for (let limb = 0; limb < 2; limb++) {
          const sign = limb ? 1 : -1,
            index = (slot * 5 + i) * 2 + limb;
          this.dummy.position.set(
            bodyX + box.nx * sign * 0.14,
            0.3 - reach * 0.06,
            bodyZ + box.nz * sign * 0.14,
          );
          this.dummy.rotation.set(reach * 0.5, box.heading, 0);
          this.dummy.scale.set(1, 1 - reach * 0.2, 1);
          this.dummy.updateMatrix();
          this.legs.setMatrixAt(index, this.dummy.matrix);
          this.dummy.position.set(
            bodyX + box.nx * sign * 0.32,
            0.92 - reach * 0.28,
            bodyZ + box.nz * sign * 0.32 + box.tz * reach * 0.18,
          );
          this.dummy.rotation.set(-reach * 0.7, box.heading, sign * 0.18);
          this.dummy.scale.set(1, 1, 1);
          this.dummy.updateMatrix();
          this.arms.setMatrixAt(index, this.dummy.matrix);
        }
        this.dummy.position.set(bodyX, 0.95 - reach * 0.28, bodyZ);
        this.dummy.rotation.set(
          reach * Math.sin(progress * Math.PI * 10) * 0.18,
          box.heading,
          -side * reach * 0.3,
        );
        this.dummy.scale.set(1, 1, 1);
        this.dummy.updateMatrix();
        this.bodies.setMatrixAt(slot * 5 + i, this.dummy.matrix);
        this.dummy.position.y += 0.65;
        this.dummy.updateMatrix();
        this.helmets.setMatrixAt(slot * 5 + i, this.dummy.matrix);
        if (i < 4) {
          this.dummy.position.y = 0.44 + reach * 0.15;
          this.dummy.position.x -= box.nx * side * 0.5;
          this.dummy.position.z -= box.nz * side * 0.5;
          this.dummy.rotation.set(0, box.heading, Math.PI / 2);
          this.dummy.updateMatrix();
          this.wheels.setMatrixAt(slot * 4 + i, this.dummy.matrix);
        }
      }
    }
    this.bodies.instanceMatrix.needsUpdate =
      this.helmets.instanceMatrix.needsUpdate =
      this.wheels.instanceMatrix.needsUpdate =
      this.arms.instanceMatrix.needsUpdate =
      this.legs.instanceMatrix.needsUpdate =
        true;
    // Instance positions span the entire pit lane; don't cull against a stale initial bound.
    this.bodies.frustumCulled =
      this.helmets.frustumCulled =
      this.wheels.frustumCulled =
      this.arms.frustumCulled =
      this.legs.frustumCulled =
        false;
    const target = this.circuit.pit.box(this.selected);
    this.marker.position.set(target.x, 4.3 + Math.sin(time * 3) * 0.16, target.z);
    this.marker.visible = states.some(
      (s) => s.pitSlot === this.selected && (s.pitRequested || s.pitPhase === 1),
    );
  }
}
