// Neon Tide: Coral Bay — everything the player sees.
//
// render.js paints the world from the state entities.js and missions.js
// leave behind: district ground, the bay, the road grid, buildings with
// lit windows and neon after dark, traffic, police, pedestrians, gunmen,
// bullets and weather — then the HUD (money, health, wanted stars, the
// mission banner, the live minimap) and whichever screen is up: title,
// pause, wasted, busted, victory. It never changes the state it draws.

import { BUILDING, DISTRICTS, GRID, WORLD } from './config.js';
import { AVENUES, STREETS, districtAt, shoreX } from './city.js';
import { clamp } from './random.js';
import { missionProgress } from './missions.js';

/** How dark the world is at a given hour: 0 at noon, 1 at deep night. */
export function darknessAt(hour) {
  if (hour < 5) return 1;
  if (hour < 7.5) return 1 - (hour - 5) / 2.5;
  if (hour < 17.5) return 0;
  if (hour < 20) return (hour - 17.5) / 2.5;
  return 1;
}

/** A warm tint at dawn and dusk, cool blue at night, nothing at noon. */
function skyTint(hour) {
  const d = darknessAt(hour);
  if (hour > 17 && hour < 20.5) return `rgba(255, 122, 66, ${0.16 * (1 - Math.abs(hour - 18.8) / 1.8)})`;
  if (hour > 5 && hour < 8) return `rgba(255, 170, 90, ${0.12 * (1 - Math.abs(hour - 6.5) / 1.6)})`;
  return d > 0.4 ? `rgba(24, 32, 84, ${0.1 * d})` : 'rgba(0,0,0,0)';
}

/** Deterministic 0..1 hash for window patterns: same building, same windows. */
function windowHash(seed, col, row) {
  let h = (seed ^ (col * 73856093) ^ (row * 19349663)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** Paint the whole frame: world first (camera space), then HUD (screen space). */
export function draw(ctx, game, w, h) {
  const camX = game.camX + game.fx.shakeX;
  const camY = game.camY + game.fx.shakeY;
  ctx.fillStyle = '#20242c';
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(-camX, -camY);
  drawWorld(ctx, game, camX, camY, w, h);
  drawActors(ctx, game, camX, camY, w, h);
  drawFxLayer(ctx, game);
  ctx.restore();
  drawWeather(ctx, game, w, h);
  if (game.screen !== 'title') drawHud(ctx, game, w, h);
  drawScreens(ctx, game, w, h);
}

/** Ground, water, roads, buildings and dressing, culled to the viewport. */
function drawWorld(ctx, game, camX, camY, w, h) {
  const city = game.city;
  const dark = darknessAt(game.hour);
  const view = { x: camX - 80, y: camY - 80, w: w + 160, h: h + 160 };

  // District ground.
  for (const d of DISTRICTS) {
    ctx.fillStyle = d.ground;
    ctx.fillRect(d.col * 1600, d.row * 1200, 1600, 1200);
  }
  // Sidewalk aprons under the road grid.
  ctx.fillStyle = '#565b60';
  for (const ax of AVENUES) ctx.fillRect(ax - GRID.road / 2 - 9, 0, GRID.road + 18, WORLD.height);
  for (const sy of STREETS) ctx.fillRect(0, sy - GRID.road / 2 - 9, WORLD.width, GRID.road + 18);

  // The bay: water east of the wobbling shoreline, with a sand rim.
  ctx.fillStyle = '#c9b083';
  ctx.beginPath();
  ctx.moveTo(shoreX(view.y) - 16, view.y);
  for (let y = view.y; y <= view.y + view.h; y += 60) ctx.lineTo(shoreX(y) - 16, y);
  ctx.lineTo(WORLD.width, view.y + view.h);
  ctx.lineTo(WORLD.width, view.y);
  ctx.closePath();
  ctx.fill();
  const swell = Math.sin(game.time * 0.7) * 6;
  ctx.fillStyle = '#1d5f7a';
  ctx.beginPath();
  ctx.moveTo(shoreX(view.y) + swell, view.y);
  for (let y = view.y; y <= view.y + view.h; y += 60) ctx.lineTo(shoreX(y) + swell + Math.sin(y / 300 + game.time * 0.4) * 4, y);
  ctx.lineTo(WORLD.width, view.y + view.h);
  ctx.lineTo(WORLD.width, view.y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(140, 210, 235, 0.25)';
  for (let i = 0; i < 7; i += 1) {
    const wy = view.y + ((i * 173 + game.time * 22) % view.h);
    ctx.fillRect(shoreX(wy) + 60 + (i % 3) * 90, wy, 90, 3);
  }
  // Piers.
  for (const pier of city.piers) {
    ctx.fillStyle = '#6d5a43';
    ctx.fillRect(pier.x, pier.y, pier.w, pier.h);
    ctx.fillStyle = '#59482f';
    for (let x = pier.x + 12; x < pier.x + pier.w; x += 30) ctx.fillRect(x, pier.y + 4, 4, pier.h - 8);
  }

  // Roads: asphalt, centre dashes, crosswalks at junctions.
  ctx.fillStyle = game.fx.weather.rain > 0.4 ? '#3d4149' : '#33373d';
  for (const ax of AVENUES) ctx.fillRect(ax - GRID.road / 2, 0, GRID.road, WORLD.height);
  for (const sy of STREETS) ctx.fillRect(0, sy - GRID.road / 2, WORLD.width, GRID.road);
  ctx.fillStyle = 'rgba(240, 220, 130, 0.55)';
  for (const ax of AVENUES) for (let y = 14; y < WORLD.height; y += 44) ctx.fillRect(ax - 2, y, 4, 24);
  for (const sy of STREETS) for (let x = 14; x < WORLD.width; x += 44) ctx.fillRect(x, sy - 2, 24, 4);
  ctx.fillStyle = 'rgba(235, 235, 235, 0.5)';
  for (const ax of AVENUES) {
    for (const sy of STREETS) {
      for (let i = -2; i <= 2; i += 1) {
        ctx.fillRect(ax - GRID.road / 2 + 4, sy + i * 9 - 2, 14, 4);
        ctx.fillRect(ax + GRID.road / 2 - 18, sy + i * 9 - 2, 14, 4);
      }
    }
  }

  // Parking lots: faded stripes on bare concrete.
  for (const lot of city.lots) {
    if (!overlaps(lot, view)) continue;
    ctx.fillStyle = '#4a4d4a';
    ctx.fillRect(lot.x, lot.y, lot.w, lot.h);
    ctx.strokeStyle = 'rgba(230,230,230,0.35)';
    ctx.lineWidth = 2;
    for (let x = lot.x + 26; x < lot.x + lot.w - 10; x += 52) {
      ctx.beginPath();
      ctx.moveTo(x, lot.y + 12);
      ctx.lineTo(x, lot.y + 52);
      ctx.stroke();
    }
  }

  // Buildings: shadow by tier, walls, roof, windows, neon.
  for (const b of city.buildings) {
    if (!overlaps(b, view)) continue;
    const lift = b.tier * 5;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(b.x + lift, b.y + lift, b.w, b.h);
    ctx.fillStyle = b.face;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x + 5, b.y + 5, b.w - 10, b.h - 10);
    // Windows: a grid whose lit pattern is fixed by the building's seed.
    const cols = Math.max(2, Math.floor(b.w / 26));
    const rows = Math.max(2, Math.floor(b.h / 26));
    for (let c = 0; c < cols; c += 1) {
      for (let r = 0; r < rows; r += 1) {
        const v = windowHash(b.winSeed, c, r);
        const lit = dark > 0.25 && v < 0.34 + dark * 0.3;
        ctx.fillStyle = lit ? BUILDING.windowLit : BUILDING.windowDark;
        ctx.globalAlpha = lit ? 0.55 + v * 0.45 : 0.8;
        ctx.fillRect(b.x + 9 + c * ((b.w - 18) / cols), b.y + 9 + r * ((b.h - 18) / rows), 8, 6);
      }
    }
    ctx.globalAlpha = 1;
    if (b.neon && dark > 0.12) {
      ctx.save();
      ctx.shadowColor = b.neon;
      ctx.shadowBlur = 16;
      ctx.fillStyle = b.neon;
      ctx.globalAlpha = 0.75 + Math.sin(game.time * 2.2 + b.winSeed) * 0.2;
      ctx.fillRect(b.x + 6, b.y + 6, Math.min(b.w - 12, 12 + b.tier * 16), 5);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  // Palms: a trunk dot and a star of fronds.
  ctx.strokeStyle = '#3f7a44';
  ctx.lineWidth = 3;
  for (const palm of city.palms) {
    if (palm.x < view.x || palm.x > view.x + view.w || palm.y < view.y || palm.y > view.y + view.h) continue;
    ctx.fillStyle = '#6d5a43';
    ctx.beginPath();
    ctx.arc(palm.x, palm.y, 3.4 * palm.s, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2 + palm.s * 2;
      ctx.moveTo(palm.x, palm.y);
      ctx.quadraticCurveTo(
        palm.x + Math.cos(a) * 11 * palm.s, palm.y + Math.sin(a) * 11 * palm.s - 3,
        palm.x + Math.cos(a) * 17 * palm.s, palm.y + Math.sin(a) * 17 * palm.s + 3,
      );
    }
    ctx.stroke();
  }

  // Lamps: posts by day, pools of light by night.
  for (const lamp of city.lamps) {
    if (lamp.x < view.x || lamp.x > view.x + view.w || lamp.y < view.y || lamp.y > view.y + view.h) continue;
    if (dark > 0.2) {
      const glow = ctx.createRadialGradient(lamp.x, lamp.y, 2, lamp.x, lamp.y, 44);
      glow.addColorStop(0, `rgba(255, 205, 110, ${0.34 * dark})`);
      glow.addColorStop(1, 'rgba(255, 205, 110, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(lamp.x - 44, lamp.y - 44, 88, 88);
    }
    ctx.fillStyle = '#22252a';
    ctx.beginPath();
    ctx.arc(lamp.x, lamp.y, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Named places: a painted pad and a sign board.
  ctx.textAlign = 'center';
  for (const place of game.cityPlaces) {
    if (place.x < view.x - 100 || place.x > view.x + view.w + 100 || place.y < view.y - 80 || place.y > view.y + view.h + 80) continue;
    ctx.fillStyle = place.kind === 'respray' ? 'rgba(255, 93, 162, 0.2)' : 'rgba(111, 211, 231, 0.14)';
    ctx.fillRect(place.x - 46, place.y - 30, 92, 60);
    ctx.strokeStyle = place.kind === 'respray' ? '#ff5da2' : '#6fd3e7';
    ctx.lineWidth = 2;
    ctx.strokeRect(place.x - 46, place.y - 30, 92, 60);
    ctx.fillStyle = '#10131a';
    ctx.fillRect(place.x - 44, place.y - 48, 88, 15);
    ctx.fillStyle = '#f2f2f2';
    ctx.font = 'bold 9px system-ui, sans-serif';
    ctx.fillText(place.name.toUpperCase().slice(0, 18), place.x, place.y - 37);
  }

  // Mission marker: a pillar of light you can see across the map.
  const objective = game.objective;
  if (objective && game.screen === 'play') {
    const pulse = 0.7 + Math.sin(game.time * 4) * 0.3;
    ctx.fillStyle = `rgba(255, 209, 102, ${0.2 * pulse})`;
    ctx.fillRect(objective.x - 7, objective.y - 900, 14, 900);
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(objective.x, objective.y, 26 + Math.sin(game.time * 4) * 5, 0, Math.PI * 2);
    ctx.stroke();
  }
  // The next job's start marker breathes green over its giver's place.
  if (!game.mission.active && game.screen === 'play') {
    const start = game.missionStart;
    if (start) {
      ctx.strokeStyle = '#9dff57';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(start.x, start.y, 20 + Math.sin(game.time * 3.2) * 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#9dff57';
      ctx.font = 'bold 17px system-ui, sans-serif';
      ctx.fillText('!', start.x, start.y + 6);
    }
  }

  // Night falls over everything at once.
  if (dark > 0.02) {
    ctx.fillStyle = `rgba(8, 10, 34, ${dark * 0.34})`;
    ctx.fillRect(view.x, view.y, view.w, view.h);
  }
  const tint = skyTint(game.hour);
  if (tint !== 'rgba(0,0,0,0)') {
    ctx.fillStyle = tint;
    ctx.fillRect(view.x, view.y, view.w, view.h);
  }
}

/** Cars, people, bullets and pickups, culled to the viewport. */
function drawActors(ctx, game, camX, camY, w, h) {
  const view = { x: camX - 90, y: camY - 90, w: w + 180, h: h + 180 };
  const dark = darknessAt(game.hour);

  for (const pickup of game.pickups) {
    if (!overlaps({ x: pickup.x - 14, y: pickup.y - 14, w: 28, h: 28 }, view)) continue;
    const bob = Math.sin((pickup.phase || 0)) * 3;
    ctx.save();
    ctx.translate(pickup.x, pickup.y + bob);
    if (pickup.kind === 'package') {
      ctx.fillStyle = '#c98d4b';
      ctx.fillRect(-10, -8, 20, 16);
      ctx.fillStyle = '#8a5f2c';
      ctx.fillRect(-10, -2, 20, 4);
    } else if (pickup.kind === 'cash') {
      ctx.fillStyle = '#3f9e4d';
      ctx.fillRect(-9, -6, 18, 12);
      ctx.fillStyle = '#c8f0cd';
      ctx.font = 'bold 9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('$', 0, 3);
    } else {
      ctx.fillStyle = '#e5484d';
      ctx.fillRect(-4, -10, 8, 20);
      ctx.fillRect(-10, -4, 20, 8);
    }
    ctx.restore();
  }

  for (const car of game.cars) {
    if (!overlaps({ x: car.x - 34, y: car.y - 34, w: 68, h: 68 }, view)) continue;
    drawCar(ctx, game, car, dark);
  }
  for (const ped of game.peds) {
    if (!overlaps({ x: ped.x - 16, y: ped.y - 16, w: 32, h: 32 }, view)) continue;
    drawPerson(ctx, ped.x, ped.y, ped.angle, ped.shirt, ped.down, 0);
  }
  for (const g of game.gunmen) {
    if (!overlaps({ x: g.x - 16, y: g.y - 16, w: 32, h: 32 }, view)) continue;
    drawPerson(ctx, g.x, g.y, g.angle, '#3a3f46', g.down, 1);
    if (!g.down) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(g.x - 13, g.y - 24, 26, 4);
      ctx.fillStyle = '#e5484d';
      ctx.fillRect(g.x - 13, g.y - 24, 26 * clamp(g.health / 68, 0, 1), 4);
    }
  }
  const player = game.player;
  if (!player.car) drawPerson(ctx, player.x, player.y, player.angle, '#ffd166', false, 2, player.stepPhase);

  // Bullet tracers.
  ctx.strokeStyle = '#ffe9a8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const b of game.bullets) {
    ctx.moveTo(b.x - b.vx * 0.014, b.y - b.vy * 0.014);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
}

/** One car, in its paint, with glass, lights and (for police) a lightbar. */
function drawCar(ctx, game, car, dark) {
  const paint = car.kind === 'police' ? '#e8ecf2' : ['#c94f4f', '#4f7dc9', '#e0a83c', '#5cae6e', '#b8bcc4', '#7a5fc0', '#3fb6b2', '#d96ba0'][car.paint % 8];
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(-21, -9, 46, 22);
  ctx.fillStyle = paint;
  roundRect(ctx, -23, -11, 46, 22, 6);
  ctx.fill();
  if (car.kind === 'police') {
    ctx.fillStyle = '#1c2733';
    ctx.fillRect(-23, -11, 15, 22);
    ctx.fillRect(9, -11, 14, 22);
  }
  ctx.fillStyle = '#18222e';
  roundRect(ctx, -6, -9, 15, 18, 3);
  ctx.fill();
  ctx.fillStyle = '#2c3e50';
  ctx.fillRect(11, -8, 5, 16);
  ctx.fillRect(-14, -8, 4, 16);
  if (dark > 0.2) {
    const beam = ctx.createLinearGradient(23, 0, 120, 0);
    beam.addColorStop(0, `rgba(255, 240, 190, ${0.3 * dark})`);
    beam.addColorStop(1, 'rgba(255, 240, 190, 0)');
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(23, -8);
    ctx.lineTo(120, -22);
    ctx.lineTo(120, 22);
    ctx.lineTo(23, 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff3c4';
    ctx.fillRect(21, -9, 3, 5);
    ctx.fillRect(21, 4, 3, 5);
    ctx.fillStyle = '#ff5a4d';
    ctx.fillRect(-24, -9, 3, 5);
    ctx.fillRect(-24, 4, 3, 5);
  }
  if (car.kind === 'police') {
    const phase = Math.sin(game.time * 11 + car.sirenPhase) > 0;
    ctx.fillStyle = phase ? '#ff3b30' : '#2f7bff';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 14;
    ctx.fillRect(-6, -8, 11, 6);
    ctx.fillStyle = phase ? '#2f7bff' : '#ff3b30';
    ctx.shadowColor = ctx.fillStyle;
    ctx.fillRect(-6, 2, 11, 6);
    ctx.shadowBlur = 0;
  }
  if (car.wrecked) {
    ctx.fillStyle = 'rgba(20,20,20,0.35)';
    roundRect(ctx, -23, -11, 46, 22, 6);
    ctx.fill();
  }
  ctx.restore();
}

/** A top-down person: shoulders, head, and a gun when armed. phase animates the stride. */
function drawPerson(ctx, x, y, angle, colour, down, armed, phase = 0) {
  ctx.save();
  ctx.translate(x, y);
  if (down) {
    ctx.rotate(angle + Math.PI / 2);
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = colour;
    roundRect(ctx, -11, -5, 22, 10, 5);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(14, 0, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#d9a066';
    ctx.fill();
    ctx.restore();
    return;
  }
  ctx.rotate(angle);
  const stride = Math.sin(phase * 6) * 2.4;
  ctx.fillStyle = '#22242a';
  ctx.fillRect(-3 + stride * 0.2, -8, 6, 5);
  ctx.fillRect(-3 - stride * 0.2, 3, 6, 5);
  ctx.fillStyle = colour;
  roundRect(ctx, -7, -8, 15, 16, 6);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(1, 0, 5.4, 0, Math.PI * 2);
  ctx.fillStyle = '#d9a066';
  ctx.fill();
  if (armed) {
    ctx.fillStyle = '#14161a';
    ctx.fillRect(6, armed === 1 ? -2 : -1.4, 11, armed === 1 ? 4 : 3);
  }
  ctx.restore();
}

/** Particles and floating text, on top of the actors. */
function drawFxLayer(ctx, game) {
  for (const p of game.fx.particles) {
    ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
    ctx.fillStyle = p.colour;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  ctx.font = 'bold 15px system-ui, sans-serif';
  for (const t of game.fx.texts) {
    ctx.globalAlpha = clamp(t.life / t.maxLife, 0, 1);
    ctx.fillStyle = t.colour;
    ctx.fillText(t.text, t.x, t.y);
  }
  ctx.globalAlpha = 1;
}

/** Rain streaks over the world (not the HUD), fading with the front. */
function drawWeather(ctx, game, w, h) {
  const rain = game.fx.weather.rain;
  if (rain < 0.03) return;
  ctx.strokeStyle = `rgba(174, 205, 235, ${0.4 * rain})`;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (const drop of game.fx.raindrops) {
    const x = drop.x * w;
    const y = drop.y * h;
    ctx.moveTo(x, y);
    ctx.lineTo(x - 5, y + 15);
  }
  ctx.stroke();
  ctx.fillStyle = `rgba(30, 40, 70, ${0.12 * rain})`;
  ctx.fillRect(0, 0, w, h);
}

/** Money, health, stars, the mission banner, the district toast, the minimap. */
function drawHud(ctx, game, w, h) {
  const player = game.player;
  ctx.textAlign = 'left';
  // Money and health, top left.
  ctx.fillStyle = 'rgba(10, 13, 20, 0.55)';
  roundRect(ctx, 14, 14, 208, 58, 8);
  ctx.fill();
  ctx.fillStyle = '#9dff57';
  ctx.font = 'bold 21px system-ui, sans-serif';
  ctx.fillText(`$${player.money}`, 26, 40);
  ctx.fillStyle = '#2b3038';
  ctx.fillRect(26, 50, 120, 9);
  ctx.fillStyle = player.health > 30 ? '#e5484d' : '#ff8a5c';
  ctx.fillRect(26, 50, 120 * clamp(player.health / 100, 0, 1), 9);
  if (player.car) {
    ctx.fillStyle = '#2b3038';
    ctx.fillRect(152, 50, 58, 9);
    ctx.fillStyle = '#6fd3e7';
    ctx.fillRect(152, 50, 58 * clamp(player.car.health / 100, 0, 1), 9);
  }
  ctx.fillStyle = '#f2f2f2';
  ctx.font = '11px system-ui, sans-serif';
  const clock = `${String(Math.floor(game.hour)).padStart(2, '0')}:${String(Math.floor((game.hour % 1) * 60)).padStart(2, '0')}`;
  ctx.fillText(`${districtAt(player.x, player.y).name} · ${clock}${game.fx.weather.rain > 0.4 ? ' · rain' : ''}`, 26, 68 - 6);

  // Wanted stars and the bust meter, top right.
  ctx.textAlign = 'right';
  for (let i = 0; i < 5; i += 1) {
    const x = w - 26 - i * 30;
    ctx.font = '24px system-ui, sans-serif';
    ctx.fillStyle = i < game.stars ? '#ffd166' : 'rgba(255,255,255,0.22)';
    if (i < game.stars && game.seen) ctx.fillStyle = Math.sin(game.time * 9) > 0 ? '#ffd166' : '#ff8a5c';
    ctx.fillText('★', x, 42);
  }
  if (game.bust > 0.02) {
    ctx.fillStyle = 'rgba(10,13,20,0.55)';
    ctx.fillRect(w - 176, 52, 150, 10);
    ctx.fillStyle = '#2f7bff';
    ctx.fillRect(w - 176, 52, 150 * game.bust, 10);
    ctx.fillStyle = '#f2f2f2';
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.fillText('BUSTED?', w - 26, 76);
  }
  ctx.textAlign = 'left';

  // The mission banner: title and the live objective.
  const progress = missionProgress(game);
  if (progress) {
    ctx.fillStyle = 'rgba(10, 13, 20, 0.55)';
    const label = `${progress.title} — ${progress.stage}/${progress.stages}`;
    ctx.font = 'bold 13px system-ui, sans-serif';
    const tw = ctx.measureText(label).width;
    roundRect(ctx, w / 2 - tw / 2 - 12, 14, tw + 24, 26, 7);
    ctx.fill();
    ctx.fillStyle = '#ffd166';
    ctx.fillText(label, w / 2 - tw / 2, 32);
  }
  if (game.objective) {
    ctx.font = '15px system-ui, sans-serif';
    const text = game.objective.text;
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(10, 13, 20, 0.5)';
    roundRect(ctx, w / 2 - tw / 2 - 12, 46, tw + 24, 28, 7);
    ctx.fill();
    ctx.fillStyle = '#f2f2f2';
    ctx.fillText(text, w / 2 - tw / 2, 65);
    // A direction arrow at the screen edge toward the marker.
    const dx = game.objective.x - (game.camX + w / 2);
    const dy = game.objective.y - (game.camY + h / 2);
    if (Math.abs(dx) > w / 2 - 60 || Math.abs(dy) > h / 2 - 60) {
      const a = Math.atan2(dy, dx);
      const ax = w / 2 + Math.cos(a) * (w / 2 - 44);
      const ay = h / 2 + Math.sin(a) * (h / 2 - 44);
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(a);
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.moveTo(13, 0);
      ctx.lineTo(-8, -8);
      ctx.lineTo(-8, 8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // District toast: the name of wherever you have just arrived.
  if (game.districtToast > 0) {
    ctx.globalAlpha = clamp(game.districtToast / 1.2, 0, 1);
    ctx.textAlign = 'center';
    ctx.font = 'bold 30px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(game.districtName, w / 2, h - 148);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  drawMinimap(ctx, game, w, h);
  drawDialogue(ctx, game, w, h);

  // Controls hint, bottom right, until it would just be noise.
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('WASD drive · E enter/talk · F/click shoot · Space handbrake · P pause · M mute', w - 14, h - 12);
  ctx.textAlign = 'left';
}

/** The live minimap: roads, the bay, blips for police, the job and you. */
function drawMinimap(ctx, game, w, h) {
  const mw = 188;
  const mh = 141;
  const mx = 14;
  const my = h - mh - 14;
  const sx = mw / WORLD.width;
  const sy = mh / WORLD.height;
  ctx.fillStyle = 'rgba(10, 14, 20, 0.78)';
  roundRect(ctx, mx - 4, my - 4, mw + 8, mh + 8, 8);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.rect(mx, my, mw, mh);
  ctx.clip();
  ctx.fillStyle = '#2c313a';
  ctx.fillRect(mx, my, mw, mh);
  ctx.fillStyle = '#1d5f7a';
  ctx.beginPath();
  ctx.moveTo(mx + shoreX(0) * sx, my);
  for (let y = 0; y <= WORLD.height; y += 200) ctx.lineTo(mx + shoreX(y) * sx, my + y * sy);
  ctx.lineTo(mx + mw, my + mh);
  ctx.lineTo(mx + mw, my);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(200,205,215,0.5)';
  ctx.lineWidth = 1;
  for (const ax of AVENUES) {
    ctx.beginPath();
    ctx.moveTo(mx + ax * sx, my);
    ctx.lineTo(mx + ax * sx, my + mh);
    ctx.stroke();
  }
  for (const syLine of STREETS) {
    ctx.beginPath();
    ctx.moveTo(mx, my + syLine * sy);
    ctx.lineTo(mx + mw, my + syLine * sy);
    ctx.stroke();
  }
  for (const place of game.cityPlaces) {
    ctx.fillStyle = place.kind === 'respray' ? '#ff5da2' : place.kind === 'hospital' ? '#e5484d' : '#6fd3e7';
    ctx.fillRect(mx + place.x * sx - 1.5, my + place.y * sy - 1.5, 3, 3);
  }
  for (const car of game.cars) {
    if (car.kind !== 'police') continue;
    ctx.fillStyle = Math.sin(game.time * 9 + car.sirenPhase) > 0 ? '#ff3b30' : '#2f7bff';
    ctx.beginPath();
    ctx.arc(mx + car.x * sx, my + car.y * sy, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  if (game.objective) {
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.arc(mx + game.objective.x * sx, my + game.objective.y * sy, 3.4 + Math.sin(game.time * 5) * 1, 0, Math.PI * 2);
    ctx.fill();
  }
  if (!game.mission.active && game.missionStart) {
    ctx.fillStyle = '#9dff57';
    ctx.beginPath();
    ctx.arc(mx + game.missionStart.x * sx, my + game.missionStart.y * sy, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // The player: a white arrow that turns with you.
  const player = game.player;
  ctx.save();
  ctx.translate(mx + player.x * sx, my + player.y * sy);
  ctx.rotate(player.angle);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(6, 0);
  ctx.lineTo(-4, -4);
  ctx.lineTo(-4, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

/** The dialogue box: speaker, line, and the prompt to continue. */
function drawDialogue(ctx, game, w, h) {
  const dialogue = game.mission.dialogue;
  if (!dialogue) return;
  const line = dialogue.lines[dialogue.index];
  if (!line) return;
  const bw = Math.min(680, w - 60);
  const bx = (w - bw) / 2;
  const by = h - 128;
  ctx.fillStyle = 'rgba(8, 10, 16, 0.88)';
  roundRect(ctx, bx, by, bw, 84, 10);
  ctx.fill();
  ctx.strokeStyle = '#6fd3e7';
  ctx.lineWidth = 1.5;
  roundRect(ctx, bx, by, bw, 84, 10);
  ctx.stroke();
  ctx.fillStyle = '#6fd3e7';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillText(line.who.toUpperCase(), bx + 18, by + 24);
  ctx.fillStyle = '#f5f7fa';
  ctx.font = '15px system-ui, sans-serif';
  wrapText(ctx, line.text, bx + 18, by + 46, bw - 36, 19);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('E ▸', bx + bw - 14, by + 76);
  ctx.textAlign = 'left';
}

/** Title, pause, wasted, busted and victory screens over the world. */
function drawScreens(ctx, game, w, h) {
  if (game.screen === 'play') return;
  if (game.screen === 'pause') {
    ctx.fillStyle = 'rgba(5, 6, 12, 0.62)';
    ctx.fillRect(0, 0, w, h);
    centreText(ctx, 'PAUSED', w / 2, h / 2 - 30, 'bold 44px system-ui, sans-serif', '#ffffff');
    centreText(ctx, 'P or Esc to keep driving · your progress is saved as you play', w / 2, h / 2 + 14, '15px system-ui, sans-serif', '#c8cfda');
    drawStats(ctx, game, w, h / 2 + 52);
    return;
  }
  if (game.screen === 'wasted') {
    ctx.fillStyle = 'rgba(30, 2, 4, 0.55)';
    ctx.fillRect(0, 0, w, h);
    centreText(ctx, 'WASTED', w / 2, h / 2 - 16, 'bold 64px system-ui, sans-serif', '#e5484d');
    centreText(ctx, 'Coral Bay General patches you up and bills the difference. Press Enter.', w / 2, h / 2 + 30, '16px system-ui, sans-serif', '#f2d7d7');
    return;
  }
  if (game.screen === 'busted') {
    ctx.fillStyle = 'rgba(4, 10, 30, 0.6)';
    ctx.fillRect(0, 0, w, h);
    centreText(ctx, 'BUSTED', w / 2, h / 2 - 16, 'bold 64px system-ui, sans-serif', '#2f7bff');
    centreText(ctx, 'The law takes its cut and your morning. Press Enter.', w / 2, h / 2 + 30, '16px system-ui, sans-serif', '#d7e4f2');
    return;
  }
  if (game.screen === 'victory') {
    ctx.fillStyle = 'rgba(10, 8, 24, 0.66)';
    ctx.fillRect(0, 0, w, h);
    centreText(ctx, 'NEON TIDE', w / 2, h / 2 - 60, 'bold 58px system-ui, sans-serif', '#ff5da2');
    centreText(ctx, 'The case is home, the tide is in, and Coral Bay knows your name.', w / 2, h / 2 - 14, '17px system-ui, sans-serif', '#f2f2f2');
    centreText(ctx, 'The city stays open: courier work is waiting at the green markers. Press Enter.', w / 2, h / 2 + 16, '15px system-ui, sans-serif', '#c8cfda');
    drawStats(ctx, game, w, h / 2 + 54);
    return;
  }
  // Title screen: the city idles behind the name of the game.
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, 'rgba(8, 8, 26, 0.5)');
  gradient.addColorStop(0.55, 'rgba(8, 8, 26, 0.18)');
  gradient.addColorStop(1, 'rgba(8, 8, 26, 0.72)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.save();
  ctx.shadowColor = '#ff5da2';
  ctx.shadowBlur = 34;
  ctx.fillStyle = '#ff5da2';
  ctx.font = 'bold 84px system-ui, sans-serif';
  ctx.fillText('NEON TIDE', w / 2, h * 0.34);
  ctx.restore();
  ctx.save();
  ctx.shadowColor = '#6fd3e7';
  ctx.shadowBlur = 22;
  ctx.fillStyle = '#6fd3e7';
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.fillText('C O R A L   B A Y', w / 2, h * 0.34 + 52);
  ctx.restore();
  ctx.fillStyle = '#e8ecf2';
  ctx.font = '15px system-ui, sans-serif';
  ctx.fillText('Nine districts. One bay. Every car is borrowed and every light is watching.', w / 2, h * 0.34 + 84);
  const options = game.hasSave ? ['NEW GAME', 'CONTINUE', 'HOW TO PLAY'] : ['NEW GAME', 'HOW TO PLAY'];
  options.forEach((label, i) => {
    const y = h * 0.58 + i * 42;
    ctx.font = game.menuIndex === i ? 'bold 23px system-ui, sans-serif' : '19px system-ui, sans-serif';
    ctx.fillStyle = game.menuIndex === i ? '#ffd166' : '#c8cfda';
    ctx.fillText(`${game.menuIndex === i ? '▸ ' : ''}${label}`, w / 2, y);
  });
  if (game.showHelp) {
    ctx.fillStyle = 'rgba(8, 10, 16, 0.92)';
    roundRect(ctx, w / 2 - 300, h * 0.52, 600, 218, 12);
    ctx.fill();
    ctx.fillStyle = '#f2f2f2';
    ctx.font = '14px system-ui, sans-serif';
    const lines = [
      'WASD / arrows — walk and drive · Shift — run',
      'E — get in or out of a car, talk, take a job, advance dialogue',
      'Mouse — aim · click or F — shoot (on foot) · Space — handbrake',
      'Follow the gold beacon to your objective; green ! starts a job.',
      'Heat fades when nobody is watching. Shine Respray (pink, $200)',
      'clears it — if the law is not close enough to watch you roll in.',
      'Finish Selene\u2019s nine jobs to own the bay. The game saves itself.',
    ];
    lines.forEach((line, i) => ctx.fillText(line, w / 2, h * 0.52 + 36 + i * 24));
  }
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText('An original open-world crime game · built with canvas and WebAudio · no libraries, no network', w / 2, h - 22);
  ctx.textAlign = 'left';
}

/** The run's numbers, shown on the pause and victory screens. */
function drawStats(ctx, game, w, y) {
  const s = game.stats;
  const line = `Jobs done ${game.mission.completed} · Cash earned $${s.cashEarned} · Cars stolen ${s.thefts} · Shots ${s.shots} · Hits ${s.hits} · Takedowns ${s.kills}`;
  centreText(ctx, line, w / 2, y, '14px system-ui, sans-serif', '#c8cfda');
}

/** Centred text helper for the screens. */
function centreText(ctx, text, x, y, font, colour) {
  ctx.font = font;
  ctx.fillStyle = colour;
  ctx.textAlign = 'center';
  ctx.fillText(text, x, y);
  ctx.textAlign = 'left';
}

/** Wrapped text for the dialogue box. */
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, yy);
      line = word;
      yy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, yy);
}

/** Rect-overlap test for viewport culling. */
function overlaps(rect, view) {
  return rect.x < view.x + view.w && rect.x + rect.w > view.x && rect.y < view.y + view.h && rect.y + rect.h > view.y;
}

/** Rounded-rectangle path (filled by the caller). */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
