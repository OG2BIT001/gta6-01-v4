// Neon Tide: Coral Bay — particles, floating text, screen shake and weather.
//
// fx.js owns everything that lives for a second and dies: sparks off a
// fender, smoke off a wreck, the green "+$400" that floats up when a job
// pays, the kick the camera takes when the player trades paint, and the
// weather fronts that roll rain across the bay. It is deliberately dumb —
// main.js and entities.js spawn effects, render.js draws them, and the
// update step here just ages everything out.

import { WEATHER } from './config.js';
import { clamp } from './random.js';

/** Create the effects state: three pools and the camera's shake offset. */
export function createFx() {
  return {
    particles: [],
    texts: [],
    shake: 0,
    shakeX: 0,
    shakeY: 0,
    weather: { mode: 'clear', timer: 40, rain: 0 },
    raindrops: [],
  };
}

/** Burst of sparks where metal met metal (or concrete). */
export function spawnSparks(fx, x, y, count, colour) {
  for (let i = 0; i < count; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const sp = 40 + Math.random() * 190;
    fx.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.28 + Math.random() * 0.3, maxLife: 0.55, size: 1.6 + Math.random() * 1.8, colour, drag: 2.4, gravity: 0 });
  }
}

/** A soft puff of smoke or dust that grows as it fades. */
export function spawnSmoke(fx, x, y, count, colour) {
  for (let i = 0; i < count; i += 1) {
    fx.particles.push({
      x: x + (Math.random() - 0.5) * 10,
      y: y + (Math.random() - 0.5) * 10,
      vx: (Math.random() - 0.5) * 26,
      vy: -14 - Math.random() * 26,
      life: 0.7 + Math.random() * 0.7,
      maxLife: 1.3,
      size: 5 + Math.random() * 8,
      colour,
      drag: 0.6,
      gravity: -8,
      grow: 9,
    });
  }
}

/** The short red flash where a bullet landed on somebody. */
export function spawnHit(fx, x, y) {
  for (let i = 0; i < 6; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const sp = 30 + Math.random() * 110;
    fx.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.22 + Math.random() * 0.2, maxLife: 0.4, size: 1.8 + Math.random() * 1.6, colour: '#e5484d', drag: 3, gravity: 0 });
  }
}

/** Confetti for the good moments: a payout, a finished story. */
export function spawnConfetti(fx, x, y) {
  const colours = ['#ff5da2', '#6fd3e7', '#ffd166', '#9dff57', '#c792ff'];
  for (let i = 0; i < 34; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const sp = 60 + Math.random() * 220;
    fx.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, life: 0.8 + Math.random() * 0.7, maxLife: 1.4, size: 2.4 + Math.random() * 2, colour: colours[i % colours.length], drag: 1.1, gravity: 150 });
  }
}

/** A line of text that floats up and fades: payouts, warnings, praise. */
export function spawnText(fx, x, y, text, colour) {
  fx.texts.push({ x, y, text, colour: colour || '#ffffff', life: 1.5, maxLife: 1.5 });
}

/** Kick the camera. Bigger kicks for bigger meetings with the scenery. */
export function addShake(fx, amount) {
  fx.shake = clamp(fx.shake + amount, 0, 14);
}

/**
 * Advance every pool by dt and run the weather machine: clear spells and
 * rain spells alternate, and `weather.rain` eases between 0 and 1 so the
 * renderer and the rain loop can fade with the front instead of snapping.
 */
export function updateFx(fx, dt) {
  for (let i = fx.particles.length - 1; i >= 0; i -= 1) {
    const p = fx.particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      fx.particles.splice(i, 1);
      continue;
    }
    const dragK = Math.max(0, 1 - p.drag * dt);
    p.vx *= dragK;
    p.vy = p.vy * dragK + (p.gravity || 0) * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.grow) p.size += p.grow * dt;
  }
  for (let i = fx.texts.length - 1; i >= 0; i -= 1) {
    const t = fx.texts[i];
    t.life -= dt;
    t.y -= 34 * dt;
    if (t.life <= 0) fx.texts.splice(i, 1);
  }
  fx.shake = Math.max(0, fx.shake - dt * 26);
  fx.shakeX = (Math.random() - 0.5) * 2 * fx.shake;
  fx.shakeY = (Math.random() - 0.5) * 2 * fx.shake;

  const w = fx.weather;
  w.timer -= dt;
  if (w.timer <= 0) {
    if (w.mode === 'clear') {
      w.mode = 'rain';
      w.timer = WEATHER.rainMin + Math.random() * (WEATHER.rainMax - WEATHER.rainMin);
    } else {
      w.mode = 'clear';
      w.timer = WEATHER.clearMin + Math.random() * (WEATHER.clearMax - WEATHER.clearMin);
    }
  }
  const target = w.mode === 'rain' ? 1 : 0;
  w.rain += clamp(target - w.rain, -dt * 0.25, dt * 0.25);

  // Raindrops are recycled streaks around the camera; render.js positions
  // them, here they just fall and wrap.
  if (fx.raindrops.length === 0) {
    for (let i = 0; i < 130; i += 1) fx.raindrops.push({ x: Math.random(), y: Math.random(), speed: 0.9 + Math.random() * 0.7 });
  }
  for (const drop of fx.raindrops) {
    drop.y += drop.speed * dt * 1.4;
    drop.x += dt * 0.11;
    if (drop.y > 1) {
      drop.y -= 1;
      drop.x = Math.random();
    }
    if (drop.x > 1) drop.x -= 1;
  }
}
