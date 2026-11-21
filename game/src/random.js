// Neon Tide: Coral Bay — the seeded random number generator.
//
// Coral Bay is built from a seed so every player, every screenshot and every
// smoke-test run sees the same city: same buildings, same palms, same neon.
// mulberry32 is tiny, fast and good enough for city dressing; the helpers
// below it (range, int, pick, chance) are the vocabulary the generators use.

/** Create a generator from a 32-bit seed. The same seed always deals the same city. */
export function makeRng(seed) {
  let state = (seed >>> 0) || 1;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    /** Next float in [0, 1). */
    next,
    /** Float in [min, max). */
    range: (min, max) => min + next() * (max - min),
    /** Integer in [min, max], both ends included. */
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    /** One element of the array. */
    pick: (items) => items[Math.floor(next() * items.length)],
    /** True with probability p. */
    chance: (p) => next() < p,
    /** A fresh seed, for streams that must not disturb the caller's sequence. */
    fork: () => Math.floor(next() * 0xffffffff) >>> 0,
  };
}

/** Clamp value into [min, max]. */
export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

/** Linear interpolation between a and b by t in [0, 1]. */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Shortest signed turn from angle `from` to angle `to`, in radians. */
export function angleDelta(from, to) {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

/** Euclidean distance between two points. */
export function distance(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}
