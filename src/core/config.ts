export const SIMULATION_STEP = 1 / 120;
export const TRACK = {
  name: 'Cala Sola',
  width: 13,
  runoff: 5.5,
  samples: 1800,
  scale: 2.2,
  startIndex: 12,
} as const;
export const VEHICLE = {
  wheelbase: 3.05,
  maxSpeed: 80,
  reverseSpeed: 9,
  acceleration: 16,
  braking: 29,
  drag: 0.001,
  rollingResistance: 0.5,
  steeringRate: 5.6,
  yawResponse: 8,
  roadGrip: 20,
  grassGrip: 9,
  halfWidth: 1.24,
  halfLength: 2.43,
} as const;
export type Quality = 'low' | 'medium' | 'high';
export const QUALITY = {
  low: { pixelRatio: 1, shadows: false, shadowSize: 1024 },
  medium: { pixelRatio: 1.5, shadows: true, shadowSize: 2048 },
  high: { pixelRatio: 2, shadows: true, shadowSize: 2048 },
} as const;
