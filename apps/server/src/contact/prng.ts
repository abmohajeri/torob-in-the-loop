/** Deterministic PRNG helpers (FNV-1a seed hash + mulberry32). Same seed string → same sequence. */

export function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface Rng {
  /** [0, 1) */
  next(): number;
  /** true with probability p */
  chance(p: number): boolean;
  /** integer in [min, max] */
  int(min: number, max: number): number;
  /** float in [min, max) */
  range(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
}

export function rng(seed: string): Rng {
  let a = hashSeed(seed) || 0x9e3779b9;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    chance: (p) => next() < p,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    range: (min, max) => min + next() * (max - min),
    pick: <T>(items: readonly T[]) => items[Math.floor(next() * items.length)]!,
  };
}
