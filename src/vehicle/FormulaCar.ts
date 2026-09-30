import * as T from 'three';
import { box, cylinderBetween, hull, material, textTexture } from '../render/materials';
import { damp } from '../core/math';
import type { VehicleState } from './VehiclePhysics';
import { batchStatic } from '../render/batchStatic';

export class FormulaCar {
  readonly root = new T.Group();
  private body = new T.Group();
  private frontWheels: T.Group[] = [];
  private tires: T.Group[] = [];
  private brakeLight: T.MeshBasicMaterial;
  constructor(livery: { color: string; name: string; number: string } = { color: '#d5f06b', name: 'Veloce', number: '07' }) {
    const paint = material(livery.color, 0.32, 0.3);
    const dark = material('#152525', 0.42, 0.4);
    const carbon = material('#1b2021', 0.8, 0.1);
    const rubber = material('#171a1b', 0.96);
    const silver = material('#a7b4ac', 0.28, 0.8);
    const accent = material('#edf2ce', 0.45);
    this.root.add(this.body);
    const b = this.body;
    b.add(
      hull(
        [
          [-2.02, 0.62, 0.21, 0.36],
          [-1.3, 0.78, 0.2, 0.39],
          [0.55, 0.73, 0.2, 0.37],
          [2.1, 0.21, 0.28, 0.37],
        ],
        carbon,
      ),
    );
    b.add(
      hull(
        [
          [-1.83, 0.2, 0.32, 0.57],
          [-0.7, 0.44, 0.3, 0.82],
          [0.42, 0.34, 0.33, 0.75],
          [1.65, 0.16, 0.35, 0.51],
          [2.21, 0.13, 0.32, 0.38],
        ],
        paint,
      ),
    );
    // Sculpted undercut sidepods with dark intake mouths.
    for (const side of [-1, 1]) {
      const pod = hull(
        [
          [-1.5, 0.17, 0.3, 0.46],
          [-0.95, 0.28, 0.29, 0.66],
          [0.35, 0.3, 0.3, 0.66],
          [0.68, 0.22, 0.37, 0.56],
        ],
        paint,
      );
      pod.position.x = side * 0.54;
      b.add(pod);
      box(b, [0.35, 0.14, 0.035], [side * 0.55, 0.48, 0.69], carbon);
      box(b, [0.05, 0.045, 1.5], [side * 0.76, 0.31, -0.3], accent);
    }
    b.add(
      hull(
        [
          [-1.8, 0.12, 0.44, 0.59],
          [-0.66, 0.27, 0.5, 1.01],
          [-0.3, 0.26, 0.5, 0.96],
        ],
        dark,
      ),
    );
    // Cockpit recess, helmet, halo and airbox.
    const cockpit = new T.Mesh(new T.SphereGeometry(0.34, 20, 12), carbon);
    cockpit.scale.set(0.82, 0.3, 1.35);
    cockpit.position.set(0, 0.76, 0.05);
    b.add(cockpit);
    const helmet = new T.Mesh(new T.SphereGeometry(0.2, 20, 12), material('#f6eee0', 0.32));
    helmet.position.set(0, 0.85, -0.06);
    helmet.castShadow = true;
    b.add(helmet);
    const visor = new T.Mesh(
      new T.SphereGeometry(0.205, 20, 12, 0, Math.PI * 2, Math.PI * 0.34, Math.PI * 0.23),
      dark,
    );
    visor.position.copy(helmet.position);
    b.add(visor);
    const haloCurve = new T.CatmullRomCurve3([
      new T.Vector3(-0.3, 0.92, -0.31),
      new T.Vector3(-0.35, 0.98, 0.19),
      new T.Vector3(0, 1.01, 0.49),
      new T.Vector3(0.35, 0.98, 0.19),
      new T.Vector3(0.3, 0.92, -0.31),
    ]);
    const halo = new T.Mesh(new T.TubeGeometry(haloCurve, 24, 0.034, 6, false), dark);
    halo.castShadow = true;
    b.add(halo);
    cylinderBetween(b, new T.Vector3(0, 1.01, 0.49), new T.Vector3(0, 0.63, 0.73), 0.032, dark);
    // Layered wings, endplates and diffuser.
    for (let i = 0; i < 3; i++) {
      const wing = box(
        b,
        [2.03 - i * 0.13, 0.045, 0.18],
        [0, 0.22 + i * 0.067, 2.14 - i * 0.19],
        i === 1 ? paint : dark,
      );
      wing.rotation.x = -0.11;
    }
    for (const side of [-1, 1]) {
      box(b, [0.055, 0.24, 0.65], [side * 1.02, 0.3, 1.98], paint);
      box(b, [0.055, 0.44, 0.72], [side * 0.88, 0.96, -1.98], paint);
      box(b, [0.06, 0.58, 0.16], [side * 0.28, 0.64, -1.98], carbon);
      for (const z of [-1.35, 1.45]) {
        for (const anchor of [-0.28, 0.28]) {
          cylinderBetween(
            b,
            new T.Vector3(side * 0.31, 0.39, z + anchor),
            new T.Vector3(side * 0.95, 0.34, z),
            0.023,
            carbon,
          );
          cylinderBetween(
            b,
            new T.Vector3(side * 0.34, 0.6, z + anchor),
            new T.Vector3(side * 0.93, 0.43, z),
            0.02,
            carbon,
          );
        }
      }
    }
    box(b, [1.76, 0.07, 0.44], [0, 0.93, -1.96], dark);
    box(b, [1.73, 0.075, 0.19], [0, 1.1, -2.17], paint);
    const wingLabel = new T.Mesh(
      new T.PlaneGeometry(1.42, 0.24),
      new T.MeshStandardMaterial({
        map: textTexture(livery.name.toUpperCase(), '#152525', '#eff6d8'),
        roughness: 0.65,
      }),
    );
    wingLabel.position.set(0, 0.98, -2.192);
    wingLabel.rotation.y = Math.PI;
    b.add(wingLabel);
    for (let x = -0.48; x <= 0.5; x += 0.24) box(b, [0.025, 0.17, 0.52], [x, 0.2, -1.92], carbon);
    this.brakeLight = new T.MeshBasicMaterial({ color: '#662a20' });
    box(b, [0.16, 0.1, 0.035], [0, 0.45, -2.12], this.brakeLight);
    const number = new T.Mesh(
      new T.PlaneGeometry(0.24, 0.43),
      new T.MeshStandardMaterial({ map: textTexture(livery.number, livery.color, '#182b28', 128, 256) }),
    );
    number.rotation.x = -Math.PI / 2 + 0.193;
    number.position.set(0, 0.627, 1.08);
    b.add(number);
    for (const z of [-1.42, 1.49]) {
      for (const side of [-1, 1]) {
        const wheel = new T.Group();
        wheel.position.set(side * 0.99, 0.39, z);
        this.root.add(wheel);
        const spin = new T.Group();
        wheel.add(spin);
        this.tires.push(spin);
        if (z > 0) this.frontWheels.push(wheel);
        const width = z < 0 ? 0.47 : 0.35;
        const tire = new T.Mesh(new T.CylinderGeometry(0.39, 0.39, width, 28, 1), rubber);
        tire.rotation.z = Math.PI / 2;
        tire.castShadow = true;
        spin.add(tire);
        for (const face of [-1, 1]) {
          const rim = new T.Mesh(new T.CylinderGeometry(0.245, 0.245, 0.017, 20), dark);
          rim.rotation.z = Math.PI / 2;
          rim.position.x = face * (width / 2 + 0.005);
          spin.add(rim);
          const ring = new T.Mesh(new T.TorusGeometry(0.3, 0.012, 5, 28), paint);
          ring.rotation.y = Math.PI / 2;
          ring.position.x = face * (width / 2 + 0.014);
          spin.add(ring);
          for (let j = 0; j < 8; j++) {
            const a = (j / 8) * Math.PI * 2;
            const spoke = box(
              spin,
              [0.019, 0.033, 0.19],
              [face * (width / 2 + 0.017), Math.sin(a) * 0.11, Math.cos(a) * 0.11],
              silver,
            );
            spoke.rotation.x = -a;
          }
        }
      }
    }
    batchStatic(this.body);
    for (const tire of this.tires) batchStatic(tire);
    // Soft contact shadow remains on low quality where dynamic shadows are disabled.
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(32, 32, 5, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(0,0,0,0.48)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    const shadow = new T.Mesh(
      new T.PlaneGeometry(3.8, 6.2),
      new T.MeshBasicMaterial({
        map: new T.CanvasTexture(canvas),
        transparent: true,
        depthWrite: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.016;
    this.root.add(shadow);
  }
  update(s: VehicleState, dt: number, brake: number) {
    this.root.position.set(s.x, 0.055, s.z);
    this.root.rotation.y = s.heading;
    this.body.rotation.z = damp(this.body.rotation.z, -s.lateralForce * 0.0018, 7, dt);
    this.body.rotation.x = damp(this.body.rotation.x, -s.acceleration * 0.0018, 7, dt);
    for (const wheel of this.frontWheels) wheel.rotation.y = s.steering;
    for (const tire of this.tires) tire.rotation.x += (s.speed * dt) / 0.39;
    this.brakeLight.color.set(brake > 0 ? '#ff483b' : '#662a20');
  }
}
