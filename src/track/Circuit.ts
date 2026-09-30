import { CatmullRomCurve3, Vector3 } from 'three';
import { TRACK } from '../core/config';

export interface TrackSample {
  x: number;
  z: number;
  tx: number;
  tz: number;
  nx: number;
  nz: number;
  distance: number;
}
export interface TrackContact {
  index: number;
  x: number;
  z: number;
  nx: number;
  nz: number;
  offset: number;
  distance: number;
}

/** Closed, arc-length sampled centerline shared by rendering, physics and future AI. */
export class Circuit {
  readonly samples: TrackSample[];
  readonly length: number;
  readonly curve: CatmullRomCurve3;
  constructor() {
    const points = [
      [-160, -115],
      [-160, 10],
      [-153, 105],
      [-120, 154],
      [-56, 171],
      [4, 144],
      [42, 83],
      [89, 63],
      [149, 100],
      [191, 98],
      [206, 56],
      [174, 15],
      [114, -12],
      [96, -60],
      [145, -99],
      [170, -154],
      [139, -196],
      [80, -195],
      [30, -147],
      [-27, -161],
      [-85, -197],
      [-137, -179],
    ];
    this.curve = new CatmullRomCurve3(
      points.map(([x, z]) => new Vector3(x, 0, z)),
      true,
      'centripetal',
    );
    this.curve.arcLengthDivisions = 4000;
    this.length = this.curve.getLength();
    this.samples = Array.from({ length: TRACK.samples }, (_, i) => {
      const t = i / TRACK.samples;
      const p = this.curve.getPointAt(t);
      const d = this.curve.getTangentAt(t).normalize();
      return { x: p.x, z: p.z, tx: d.x, tz: d.z, nx: d.z, nz: -d.x, distance: t * this.length };
    });
  }
  at(index: number) {
    return this.samples[
      ((index % this.samples.length) + this.samples.length) % this.samples.length
    ];
  }
  /** Search near the last segment during normal driving; global search only for resets. */
  nearest(x: number, z: number, hint?: number): TrackContact {
    let best = Infinity;
    let result!: TrackContact;
    const start = hint === undefined ? 0 : hint - 30;
    const end = hint === undefined ? this.samples.length : hint + 31;
    for (let n = start; n < end; n++) {
      const a = this.at(n),
        b = this.at(n + 1);
      const dx = b.x - a.x,
        dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
      const px = a.x + dx * t,
        pz = a.z + dz * t;
      const dist2 = (x - px) ** 2 + (z - pz) ** 2;
      if (dist2 < best) {
        best = dist2;
        result = {
          index: (n + this.samples.length) % this.samples.length,
          x: px,
          z: pz,
          nx: a.nx,
          nz: a.nz,
          offset: (x - px) * a.nx + (z - pz) * a.nz,
          distance: Math.sqrt(dist2),
        };
      }
    }
    return result;
  }
}
