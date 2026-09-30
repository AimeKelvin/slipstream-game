import { PerspectiveCamera, Vector3 } from 'three';
import { damp } from '../core/math';
import type { VehicleState } from '../vehicle/VehiclePhysics';

export class ChaseCamera {
  readonly camera = new PerspectiveCamera(53, 1, 0.1, 1600);
  private target = new Vector3();
  private desired = new Vector3();
  private look = new Vector3();
  private heading = 0;
  private initialized = false;
  close = false;
  reset() {
    this.initialized = false;
  }
  update(state: VehicleState, dt: number, showroom = false, time = 0) {
    const s = state;
    if (!this.initialized) this.heading = s.heading;
    const delta = Math.atan2(
      Math.sin(s.heading - this.heading),
      Math.cos(s.heading - this.heading),
    );
    this.heading += delta * (1 - Math.exp(-5.5 * dt));
    const fx = Math.sin(this.heading),
      fz = Math.cos(this.heading);
    if (showroom) {
      const orbit = Math.sin(time * 0.13) * 0.12;
      const a = s.heading + 0.82 + orbit;
      this.desired.set(s.x + Math.sin(a) * 9.8, 3.5, s.z + Math.cos(a) * 9.8);
      this.look.set(s.x - fz * 2.25, 0.6, s.z + fx * 2.25);
    } else {
      const speedRatio = Math.min(Math.abs(s.speed) / 75, 1);
      const distance = (this.close ? 6.6 : 8.4) + speedRatio * 1.1;
      // Velocity feed-forward offsets follow lag, keeping the car substantial at speed.
      this.desired.set(
        s.x - fx * distance + s.vx * 0.075,
        (this.close ? 2.8 : 3.5) + speedRatio * 0.35,
        s.z - fz * distance + s.vz * 0.075,
      );
      const ahead = 7 + speedRatio * 7;
      const turn = s.steering * Math.min(Math.abs(s.speed), 25) * 0.5;
      this.look.set(s.x + fx * ahead + fz * turn, 0.65, s.z + fz * ahead - fx * turn);
    }
    if (!this.initialized) {
      this.camera.position.copy(this.desired);
      this.target.copy(this.look);
      this.initialized = true;
    }
    this.camera.position.lerp(this.desired, 1 - Math.exp(-(showroom ? 3 : 11) * dt));
    this.target.lerp(this.look, 1 - Math.exp(-8 * dt));
    this.camera.lookAt(this.target);
    const fov = showroom ? 43 : 53 + Math.min(Math.abs(s.speed) / 75, 1) * 8;
    this.camera.fov = damp(this.camera.fov, fov, 3, dt);
    this.camera.updateProjectionMatrix();
  }
  resize(width: number, height: number) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}
