import type { EasingType } from '../types';

export type EasingFn = (t: number) => number;

/** CSS cubic-bezier(x1, y1, x2, y2) as a function of progress. */
function cubicBezier(x1: number, y1: number, x2: number, y2: number): EasingFn {
  const sample = (a: number, b: number, t: number) =>
    ((1 - 3 * b + 3 * a) * t + (3 * b - 6 * a)) * t * t + 3 * a * t;
  const slope = (a: number, b: number, t: number) =>
    3 * (1 - 3 * b + 3 * a) * t * t + 2 * (3 * b - 6 * a) * t + 3 * a;

  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    // Newton steps, then bisection if the slope is too flat to trust
    let t = x;
    for (let i = 0; i < 6; i++) {
      const d = slope(x1, x2, t);
      if (Math.abs(d) < 1e-6) break;
      const next = t - (sample(x1, x2, t) - x) / d;
      if (next < 0 || next > 1) break;
      t = next;
    }
    if (Math.abs(sample(x1, x2, t) - x) > 1e-4) {
      let lo = 0;
      let hi = 1;
      t = x;
      for (let i = 0; i < 24; i++) {
        const v = sample(x1, x2, t);
        if (Math.abs(v - x) < 1e-5) break;
        if (v < x) lo = t;
        else hi = t;
        t = (lo + hi) / 2;
      }
    }
    return sample(y1, y2, t);
  };
}

// Damped spring that settles at 1, with a small overshoot
const SPRING_END = 1 - Math.exp(-6.5) * Math.cos(10);
const spring: EasingFn = (t) => {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return (1 - Math.exp(-6.5 * t) * Math.cos(10 * t)) / SPRING_END;
};

const EASINGS: Record<EasingType, EasingFn> = {
  linear: (t) => t,
  'ease-in': cubicBezier(0.42, 0, 1, 1),
  'ease-out': cubicBezier(0, 0, 0.58, 1),
  'ease-in-out': cubicBezier(0.42, 0, 0.58, 1),
  spring,
};

export function getEasing(name: EasingType | undefined): EasingFn {
  return EASINGS[name ?? 'ease-out'] ?? EASINGS['ease-out'];
}

/** Gentle start and stop, used for the camera pan across a section. */
export const easeInOutSine: EasingFn = (t) => -(Math.cos(Math.PI * Math.min(1, Math.max(0, t))) - 1) / 2;
