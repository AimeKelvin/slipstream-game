import type { VehicleState } from '../vehicle/VehiclePhysics';

/** Two-circle capsules keep side contact gentle and stop nose-to-tail overlap. */
export function resolveCarContacts(states: VehicleState[]) {
  for (let i = 0; i < states.length; i++) for (let j = i + 1; j < states.length; j++) {
    const a = states[i], b = states[j];
    if (Math.hypot(a.x - b.x, a.z - b.z) > 5.5) continue;
    for (const frontA of [-1.05, 1.05]) for (const frontB of [-1.05, 1.05]) {
      const dx = b.x + Math.sin(b.heading) * frontB - a.x - Math.sin(a.heading) * frontA;
      const dz = b.z + Math.cos(b.heading) * frontB - a.z - Math.cos(a.heading) * frontA;
      const distance = Math.hypot(dx, dz);
      if (distance >= 2.16) continue;
      const nx = distance > 0.001 ? dx / distance : 1, nz = distance > 0.001 ? dz / distance : 0;
      const push = (2.16 - distance) * 0.5;
      a.x -= nx * push; a.z -= nz * push; b.x += nx * push; b.z += nz * push;
      const closing = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
      if (closing > 0) {
        const impulse = closing * 0.52;
        a.vx -= nx * impulse; a.vz -= nz * impulse; b.vx += nx * impulse; b.vz += nz * impulse;
        a.impact = b.impact = Math.min(1, closing / 20);
        a.speed = a.vx * Math.sin(a.heading) + a.vz * Math.cos(a.heading);
        b.speed = b.vx * Math.sin(b.heading) + b.vz * Math.cos(b.heading);
      }
    }
  }
}
