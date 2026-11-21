// Neon Tide: Coral Bay — the seeded city itself.
//
// buildCity(seed) deals the whole map from one number: the road grid, about
// 150 buildings with height tiers and neon, palms and street lamps, parking
// lots, the dock piers reaching into the bay, and the named places the story
// visits (the club, the market, the hospital, three respray garages and
// more). The same seed always builds the same city, which is what makes the
// screenshots reproducible and the smoke test meaningful.

import { BAY, BUILDING, DISTRICTS, GRID, WORLD } from './config.js';
import { clamp, makeRng } from './random.js';

/** X coordinate of every avenue centre line, west to east. */
export const AVENUES = [];
for (let x = GRID.origin; x < BAY.base - 120; x += GRID.pitch) AVENUES.push(x);

/** Y coordinate of every street centre line, north to south. */
export const STREETS = [];
for (let y = GRID.origin; y < WORLD.height - 160; y += GRID.pitch) STREETS.push(y);

/** The shoreline: the bay's edge wobbles east and west as y runs south. */
export function shoreX(y) {
  return BAY.base + Math.sin((y / BAY.waveLength) * Math.PI * 2) * BAY.wave;
}

/** True when the point is in the bay. */
export function isWater(x, y) {
  return x > shoreX(y);
}

/** True when the point sits on a road (avenue or street), kerb to kerb. */
export function isRoad(x, y) {
  const half = GRID.road / 2;
  for (const ax of AVENUES) if (Math.abs(x - ax) <= half) return true;
  for (const sy of STREETS) if (Math.abs(y - sy) <= half) return true;
  return false;
}

/** The district record covering a point, from the nine-district grid. */
export function districtAt(x, y) {
  const col = clamp(Math.floor(x / (WORLD.width / 3)), 0, 2);
  const row = clamp(Math.floor(y / (WORLD.height / 3)), 0, 2);
  return DISTRICTS[row * 3 + col];
}

/**
 * The named places the story and the systems use. Positions sit on block
 * corners beside roads so the player can always reach them; city generation
 * keeps their lots clear of random buildings.
 */
export const PLACES = [
  { id: 'club', name: 'Club Azul', x: 1760, y: 1560, kind: 'club' },
  { id: 'market', name: 'Mercado Central', x: 1360, y: 760, kind: 'market' },
  { id: 'docks', name: 'Coral Docks Pier 3', x: 4200, y: 2960, kind: 'docks' },
  { id: 'hospital', name: 'Coral Bay General', x: 760, y: 1560, kind: 'hospital' },
  { id: 'respray-north', name: 'Shine Respray — North', x: 2160, y: 760, kind: 'respray' },
  { id: 'respray-central', name: 'Shine Respray — Central', x: 2560, y: 1960, kind: 'respray' },
  { id: 'respray-south', name: 'Shine Respray — South', x: 1560, y: 3160, kind: 'respray' },
  { id: 'hotel', name: 'The Palms Hotel', x: 960, y: 760, kind: 'hotel' },
  { id: 'warehouse', name: 'Solana Yards Depot', x: 760, y: 2760, kind: 'warehouse' },
  { id: 'bar', name: 'Bar Medusa', x: 1960, y: 2760, kind: 'bar' },
  { id: 'marina', name: 'Marina Azul Boatyard', x: 3960, y: 760, kind: 'marina' },
  { id: 'lookout', name: 'Harbourview Lookout', x: 3760, y: 1560, kind: 'lookout' },
];

/** Look a place up by id. */
export function placeById(id) {
  return PLACES.find((place) => place.id === id);
}

/** True when a rect would crowd one of the named places' lots. */
function crowdsPlace(x, y, w, h) {
  for (const place of PLACES) {
    if (x < place.x + 58 && x + w > place.x - 58 && y < place.y + 46 && y + h > place.y - 46) return true;
  }
  return false;
}

/**
 * Build the whole city from a seed.
 * Returns { buildings, palms, lamps, lots, piers, seed } where buildings are
 * { x, y, w, h, tier, face, roof, neon, winSeed, district } and the rest are
 * simple point or rect lists the renderer and the collision code share.
 */
export function buildCity(seed) {
  const rng = makeRng(seed);
  const buildings = [];
  const palms = [];
  const lamps = [];
  const lots = [];
  const piers = [];

  // One block at a time: the rectangle between two avenues and two streets.
  for (let ai = 0; ai < AVENUES.length - 1; ai += 1) {
    for (let si = 0; si < STREETS.length - 1; si += 1) {
      const bx = AVENUES[ai] + GRID.road / 2 + 14;
      const by = STREETS[si] + GRID.road / 2 + 14;
      const bw = GRID.pitch - GRID.road - 28;
      const bh = GRID.pitch - GRID.road - 28;
      if (isWater(bx + bw, by + bh / 2)) continue;
      const district = districtAt(bx + bw / 2, by + bh / 2);
      const roll = rng.next();
      if (roll < 0.09) {
        // An open lot: parking stripes and palms, no building to hit.
        lots.push({ x: bx, y: by, w: bw, h: bh });
        for (let p = 0; p < 3; p += 1) palms.push({ x: bx + rng.range(16, bw - 16), y: by + rng.range(16, bh - 16), s: rng.range(0.8, 1.25) });
        continue;
      }
      // One slab tower, a side-by-side pair, or a four-block quad with an
      // alley cross — the richer the district, the more towers it stacks.
      const shape = rng.next();
      let footprints;
      if (shape < 0.22) {
        footprints = [{ x: bx + bw * 0.08, y: by + bh * 0.08, w: bw * 0.84, h: bh * 0.84 }];
      } else if (shape < 0.62) {
        footprints = [
          { x: bx, y: by, w: bw * 0.46, h: bh },
          { x: bx + bw * 0.54, y: by, w: bw * 0.46, h: bh },
        ];
      } else {
        footprints = [
          { x: bx, y: by, w: bw * 0.46, h: bh * 0.46 },
          { x: bx + bw * 0.54, y: by, w: bw * 0.46, h: bh * 0.46 },
          { x: bx, y: by + bh * 0.54, w: bw * 0.46, h: bh * 0.46 },
          { x: bx + bw * 0.54, y: by + bh * 0.54, w: bw * 0.46, h: bh * 0.46 },
        ];
      }
      for (const fp of footprints) {
        if (crowdsPlace(fp.x, fp.y, fp.w, fp.h)) continue;
        const tier = 1 + Math.min(3, Math.floor(rng.next() * 2.2 + district.wealth * 1.6));
        buildings.push({
          x: fp.x,
          y: fp.y,
          w: fp.w,
          h: fp.h,
          tier,
          face: rng.pick(BUILDING.faces),
          roof: rng.pick(BUILDING.roofs),
          neon: rng.chance(0.24 + district.wealth * 0.3) ? rng.pick(BUILDING.neon) : null,
          winSeed: rng.int(1, 0xffffff),
          district: district.name,
        });
      }
      // Palms lean over the block's corners.
      if (rng.chance(0.7)) palms.push({ x: bx + rng.range(4, 26), y: by + rng.range(4, 26), s: rng.range(0.85, 1.3) });
      if (rng.chance(0.5)) palms.push({ x: bx + bw - rng.range(4, 26), y: by + bh - rng.range(4, 26), s: rng.range(0.85, 1.3) });
    }
  }

  // Street lamps march along both kerbs of every avenue and street.
  for (const ax of AVENUES) {
    for (let y = 90; y < WORLD.height - 60; y += 150) {
      if (!isWater(ax + GRID.road / 2 + 8, y)) lamps.push({ x: ax - GRID.road / 2 - 7, y });
      if (!isWater(ax + GRID.road / 2 + 8, y)) lamps.push({ x: ax + GRID.road / 2 + 7, y: y + 75 });
    }
  }
  for (const sy of STREETS) {
    for (let x = 140; x < BAY.base - 60; x += 170) {
      lamps.push({ x, y: sy - GRID.road / 2 - 7 });
      lamps.push({ x: x + 85, y: sy + GRID.road / 2 + 7 });
    }
  }

  // Three piers reach from Coral Docks into the bay.
  for (const py of [2720, 2960, 3200]) {
    const sx = shoreX(py);
    piers.push({ x: sx - 30, y: py - 26, w: 300, h: 52 });
  }

  return { buildings, palms, lamps, lots, piers, seed };
}

/** True when a circle at (x, y) with radius r overlaps any building. */
export function circleHitsBuilding(city, x, y, r) {
  for (const b of city.buildings) {
    const nx = clamp(x, b.x, b.x + b.w);
    const ny = clamp(y, b.y, b.y + b.h);
    const dx = x - nx;
    const dy = y - ny;
    if (dx * dx + dy * dy < r * r) return true;
  }
  return false;
}

/**
 * Push a circle out of every building it overlaps, sliding along the faces.
 * Mutates and returns the { x, y } passed in; the caller keeps the velocity.
 */
export function resolveBuildingCollision(city, pos, r) {
  for (const b of city.buildings) {
    const nx = clamp(pos.x, b.x, b.x + b.w);
    const ny = clamp(pos.y, b.y, b.y + b.h);
    let dx = pos.x - nx;
    let dy = pos.y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      pos.x = nx + (dx / d) * r;
      pos.y = ny + (dy / d) * r;
    } else {
      // Centre is inside the rect: leave by the nearest face.
      const left = pos.x - b.x;
      const right = b.x + b.w - pos.x;
      const top = pos.y - b.y;
      const bottom = b.y + b.h - pos.y;
      const m = Math.min(left, right, top, bottom);
      if (m === left) pos.x = b.x - r;
      else if (m === right) pos.x = b.x + b.w + r;
      else if (m === top) pos.y = b.y - r;
      else pos.y = b.y + b.h + r;
    }
    dx = 0;
    dy = 0;
  }
  return pos;
}

/** A random point on a random road, for spawning traffic and walkers. */
export function randomRoadPoint(rng) {
  if (rng.chance(0.5)) {
    const ax = rng.pick(AVENUES);
    return { x: ax + rng.range(-GRID.road / 2 + 12, GRID.road / 2 - 12), y: rng.range(120, WORLD.height - 120), avenue: ax };
  }
  const sy = rng.pick(STREETS);
  return { x: rng.range(120, BAY.base - 160), y: sy + rng.range(-GRID.road / 2 + 12, GRID.road / 2 - 12), street: sy };
}
