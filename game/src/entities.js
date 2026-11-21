// Neon Tide: Coral Bay — everything that moves, and the law that hunts it.
//
// entities.js owns the actors: the player on foot and behind the wheel, the
// traffic that lanes and queues through the grid, the pedestrians who
// stroll and panic, the gunmen the story sends, the bullets both sides
// trade, and the wanted system that turns witnessed crime into stars and
// stars into police. main.js feeds it input and drains its sound events;
// render.js only ever reads what this module leaves behind.

import { CAR, GUN, HEAT, PEDS, PLAYER, POLICE, TRAFFIC, WORLD, GRID } from './config.js';
import { AVENUES, STREETS, circleHitsBuilding, isWater, placeById, randomRoadPoint, resolveBuildingCollision } from './city.js';
import { addShake, spawnHit, spawnSmoke, spawnSparks, spawnText } from './fx.js';
import { angleDelta, clamp, distance, makeRng } from './random.js';

let nextId = 1;

/** A fresh car. kind is 'traffic', 'police' or 'parked'; route drives traffic. */
function makeCar(x, y, angle, paint, kind) {
  return {
    id: nextId++,
    x, y, angle, speed: 0, steer: 0,
    health: CAR.health, paint, kind,
    route: null, turnCooldown: 0, honk: 0,
    wrecked: false, sirenPhase: Math.random() * Math.PI * 2,
  };
}

/** A fresh pedestrian with somewhere to be. */
function makePed(x, y, rng) {
  return {
    id: nextId++,
    x, y, angle: rng.range(0, Math.PI * 2),
    speed: 0, state: 'stroll', stateTimer: rng.range(1, 4),
    targetX: x, targetY: y, health: 40,
    shirt: ['#d96ba0', '#6fd3e7', '#ffd166', '#9dff57', '#f2f2f2', '#ff8a5c'][rng.int(0, 5)],
    down: false,
  };
}

/** The player: a position, a wallet, a health bar and, often, a stolen car. */
export function createPlayer() {
  return {
    x: PLAYER.start.x, y: PLAYER.start.y, angle: -Math.PI / 2,
    vx: 0, vy: 0, health: PLAYER.health, money: PLAYER.startMoney,
    car: null, shootCooldown: 0, stepPhase: 0, dead: false,
  };
}

/**
 * Seed the streets: parked cars on the lots and kerbs, the first wave of
 * traffic already rolling, and pedestrians on the sidewalks.
 */
export function createActors(city, rng) {
  const cars = [];
  const peds = [];
  for (const lot of city.lots) {
    const n = rng.int(1, 3);
    for (let i = 0; i < n; i += 1) {
      const x = lot.x + 30 + i * 54;
      const y = lot.y + lot.h / 2;
      cars.push(makeCar(x, y, rng.chance(0.5) ? 0 : Math.PI, rng.int(0, 7), 'parked'));
    }
  }
  for (let i = 0; i < TRAFFIC.count; i += 1) cars.push(spawnTrafficCar(rng, 0, 0, true));
  for (let i = 0; i < PEDS.count; i += 1) {
    const p = randomRoadPoint(rng);
    peds.push(makePed(p.x + (rng.chance(0.5) ? -1 : 1) * (GRID.road / 2 + 12), p.y, rng));
  }
  return { cars, peds, gunmen: [], bullets: [], pickups: [] };
}

/** The lane offset for a car travelling `dir` along an avenue or a street. */
function laneOffset(axis, dir) {
  return axis === 'v' ? -dir * GRID.lane : dir * GRID.lane;
}

/** Put a traffic car on a random road with a route along it. */
export function spawnTrafficCar(rng, nearX, nearY, anywhere) {
  let point = randomRoadPoint(rng);
  if (!anywhere) {
    for (let tries = 0; tries < 12; tries += 1) {
      const candidate = randomRoadPoint(rng);
      const d = distance(candidate.x, candidate.y, nearX, nearY);
      if (d > 500 && d < 1100) {
        point = candidate;
        break;
      }
    }
  }
  const axis = point.avenue !== undefined ? 'v' : 'h';
  const dir = rng.chance(0.5) ? 1 : -1;
  const car = makeCar(point.x, point.y, 0, rng.int(0, 7), 'traffic');
  car.route = { axis, dir, line: axis === 'v' ? point.avenue : point.street };
  car.x = axis === 'v' ? car.route.line + laneOffset(axis, dir) : point.x;
  car.y = axis === 'h' ? car.route.line + laneOffset(axis, dir) : point.y;
  car.angle = axis === 'v' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : dir > 0 ? 0 : Math.PI;
  car.speed = TRAFFIC.speed * rng.range(0.8, 1.05);
  return car;
}

/** Queue a sound for main.js to play this frame. */
function sound(game, name) {
  game.events.sounds.push(name);
}

/**
 * Report a crime. Witnessed crime (a pedestrian or officer near, or the
 * player already in sight) pours the full amount into the heat pool;
 * unwitnessed crime only leaks a quarter of it in as rumour.
 */
export function commitCrime(game, amount, x, y) {
  const witnessed = game.seen || game.peds.some((p) => !p.down && distance(p.x, p.y, x, y) < HEAT.witnessRadius)
    || game.cars.some((c) => c.kind === 'police' && distance(c.x, c.y, x, y) < HEAT.witnessRadius * 1.25);
  game.heat = clamp(game.heat + (witnessed ? amount : amount * 0.25), 0, HEAT.max);
  if (witnessed) game.lastCrimeAt = game.time;
}

/** How many stars the current heat pool has earned. */
export function starsForHeat(heat) {
  let stars = 0;
  for (const rung of HEAT.starAt) if (heat >= rung) stars += 1;
  return stars;
}

/**
 * The wanted system, once a frame: who can see the player, how the heat
 * drains, when a new star lands, keeping the police fleet at the size the
 * stars demand, and the bust meter that ends the run when it fills.
 */
export function updateHeat(game, dt) {
  const player = game.player;
  const px = player.car ? player.car.x : player.x;
  const py = player.car ? player.car.y : player.y;
  game.seen = game.cars.some((c) => c.kind === 'police' && distance(c.x, c.y, px, py) < 560)
    || game.peds.some((p) => !p.down && distance(p.x, p.y, px, py) < 280);

  game.heat = clamp(game.heat - (game.seen ? HEAT.decayPerSecond : HEAT.decayHiddenPerSecond) * dt, 0, HEAT.max);
  const stars = starsForHeat(game.heat);
  if (stars > game.stars) {
    sound(game, 'star');
    spawnText(game.fx, px, py - 44, `${stars} STAR${stars > 1 ? 'S' : ''}`, '#ffd166');
  }
  game.stars = stars;

  // Keep the fleet at the size the stars demand.
  const wanted = POLICE.unitsPerStar[stars];
  const active = game.cars.filter((c) => c.kind === 'police');
  if (active.length < wanted) {
    for (let i = active.length; i < wanted; i += 1) game.cars.push(spawnPoliceCar(game, px, py));
  } else if (active.length > wanted) {
    let excess = active.length - wanted;
    for (const unit of active) {
      if (excess <= 0) break;
      if (distance(unit.x, unit.y, px, py) > 700) {
        unit.kind = 'gone';
        excess -= 1;
      }
    }
    game.cars = game.cars.filter((c) => c.kind !== 'gone');
  }

  // The bust meter: an officer close by while the player crawls or stands.
  const speed = player.car ? Math.abs(player.car.speed) : Math.hypot(player.vx, player.vy);
  const officerNear = game.cars.some((c) => c.kind === 'police' && distance(c.x, c.y, px, py) < HEAT.bustRadius + (player.car ? 16 : 0));
  if (officerNear && speed < 34 && stars > 0) {
    game.bust = clamp(game.bust + HEAT.bustFillPerSecond * dt, 0, 1);
    if (game.bust >= 1) game.busted = true;
  } else {
    game.bust = clamp(game.bust - HEAT.bustDrainPerSecond * dt, 0, 1);
  }
}

/** A police unit joins the hunt from a road a few blocks away. */
function spawnPoliceCar(game, px, py) {
  const rng = makeRng(Math.floor(game.time * 1000) + game.cars.length * 77 + 5);
  let point = randomRoadPoint(rng);
  for (let tries = 0; tries < 14; tries += 1) {
    const candidate = randomRoadPoint(rng);
    const d = distance(candidate.x, candidate.y, px, py);
    if (d > POLICE.spawnDistance - 160 && d < POLICE.spawnDistance + 320) {
      point = candidate;
      break;
    }
  }
  const unit = makeCar(point.x, point.y, 0, 8, 'police');
  unit.speed = POLICE.speed[1];
  return unit;
}

/**
 * Shared arcade car physics: throttle, brake, steering that bites harder
 * the faster you go, and a handbrake that lets the back end step out.
 * control is { throttle: -1..1, steer: -1..1, handbrake: bool }.
 */
export function driveCar(game, car, control, dt) {
  const maxForward = car.kind === 'police' ? POLICE.speed[game.stars] || 300 : 342;
  if (control.throttle > 0) car.speed += CAR.accel * control.throttle * dt;
  else if (control.throttle < 0) car.speed -= (car.speed > 4 ? CAR.brake : CAR.accel * 0.6) * -control.throttle * dt;
  car.speed -= car.speed * CAR.drag * dt * (control.handbrake ? 1.7 : 1);
  car.speed = clamp(car.speed, -CAR.reverse, car.wrecked ? 0 : maxForward);
  const steerAuthority = clamp(Math.abs(car.speed) / 120, 0, 1) * (control.handbrake ? 1.5 : 1);
  car.steer += clamp(control.steer - car.steer, -dt * 6, dt * 6);
  car.angle += car.steer * steerAuthority * 1.9 * dt * (car.speed < 0 ? -1 : 1);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  car.x = clamp(car.x, 24, WORLD.width - 24);
  car.y = clamp(car.y, 24, WORLD.height - 24);
  if (isWater(car.x, car.y)) {
    car.speed *= 0.9;
    if (Math.random() < dt * 2) spawnSmoke(game.fx, car.x, car.y, 1, '#bcd8e8');
  }
  // Buildings are not negotiable. A short cooldown after each impact keeps
  // one long scrape along a wall from registering as a dozen crashes.
  car.crashCooldown = Math.max(0, (car.crashCooldown || 0) - dt);
  const before = Math.abs(car.speed);
  const pos = resolveBuildingCollision(game.city, car, 17);
  car.x = pos.x;
  car.y = pos.y;
  if (car.crashCooldown <= 0 && circleHitsBuilding(game.city, car.x + Math.cos(car.angle) * 18, car.y + Math.sin(car.angle) * 18, 6) && before > 130) {
    car.crashCooldown = 0.5;
    car.speed = -car.speed * 0.22;
    damageCar(game, car, (before - 120) / 22, car.x, car.y);
    sound(game, 'crash');
    addShake(game.fx, 5);
  }
}

/** Hurt a car; at zero health it is a smoking wreck and stops for good. */
export function damageCar(game, car, amount, x, y) {
  car.health -= amount;
  spawnSparks(game.fx, x, y, 5, '#ffcf6e');
  if (car.health < 45 && Math.random() < 0.3) spawnSmoke(game.fx, car.x, car.y, 1, '#555a60');
  if (car.health <= 0 && !car.wrecked) {
    car.wrecked = true;
    car.speed = 0;
    spawnSmoke(game.fx, car.x, car.y, 10, '#33373c');
    if (game.player.car === car) {
      game.player.car = null;
      game.player.x = car.x + 26;
      game.player.y = car.y;
      game.player.health -= 8;
      spawnText(game.fx, car.x, car.y - 30, 'WRECKED!', '#e5484d');
    }
  }
}

/**
 * The player, on foot or in a car. Input is the shared input object main.js
 * fills from the keyboard and mouse. Walking slides along walls; driving
 * hands the car to driveCar and keeps the player's feet where the car is.
 */
export function updatePlayer(game, input, dt) {
  const player = game.player;
  player.shootCooldown = Math.max(0, player.shootCooldown - dt);
  if (player.car) {
    const control = {
      throttle: (input.up ? 1 : 0) + (input.down ? -1 : 0),
      steer: (input.right ? 1 : 0) + (input.left ? -1 : 0),
      handbrake: input.handbrake,
    };
    driveCar(game, player.car, control, dt);
    player.x = player.car.x;
    player.y = player.car.y;
    player.angle = player.car.angle;
    if (Math.abs(player.car.speed) > 40) player.stepPhase += dt * Math.abs(player.car.speed) * 0.02;
    return;
  }
  const run = input.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
  let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  const len = Math.hypot(mx, my) || 1;
  mx = (mx / len) * run;
  my = (my / len) * run;
  player.vx += clamp(mx - player.vx, -dt * 1400, dt * 1400);
  player.vy += clamp(my - player.vy, -dt * 1400, dt * 1400);
  player.x += player.vx * dt;
  player.y += player.vy * dt;
  player.x = clamp(player.x, 16, WORLD.width - 16);
  player.y = clamp(player.y, 16, WORLD.height - 16);
  if (isWater(player.x, player.y)) {
    player.x -= player.vx * dt * 1.4;
    player.y -= player.vy * dt * 1.4;
    player.vx *= 0.6;
    player.vy *= 0.6;
  }
  const pos = resolveBuildingCollision(game.city, player, PLAYER.radius);
  player.x = pos.x;
  player.y = pos.y;
  const moving = Math.hypot(player.vx, player.vy);
  if (moving > 12) {
    player.angle = Math.atan2(player.vy, player.vx);
    player.stepPhase += dt * moving * 0.055;
  }
}

/**
 * Getting in and out of cars. Stealing a traffic car throws its driver
 * onto the pavement (a crime, if anyone sees) and hands the player the
 * wheel; parked cars just open. Returns true when the state changed.
 */
export function tryEnterExitCar(game) {
  const player = game.player;
  if (player.car) {
    const car = player.car;
    player.car = null;
    player.x = car.x + Math.cos(car.angle + Math.PI / 2) * 26;
    player.y = car.y + Math.sin(car.angle + Math.PI / 2) * 26;
    const pos = resolveBuildingCollision(game.city, player, PLAYER.radius);
    player.x = pos.x;
    player.y = pos.y;
    sound(game, 'door');
    return true;
  }
  let best = null;
  let bestD = 46;
  for (const car of game.cars) {
    if (car.kind === 'police' || car.wrecked) continue;
    const d = distance(player.x, player.y, car.x, car.y);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  if (!best) return false;
  if (best.kind === 'traffic') {
    // The driver bails out and runs; the street remembers.
    const driver = makePed(best.x + 20, best.y + 8, makeRng(best.id * 31 + 7));
    driver.state = 'flee';
    driver.stateTimer = 3;
    driver.angle = Math.atan2(driver.y - best.y, driver.x - best.x);
    game.peds.push(driver);
    commitCrime(game, HEAT.crimeTheft, best.x, best.y);
    game.stats.thefts += 1;
    spawnText(game.fx, best.x, best.y - 30, 'STOLEN', '#ffd166');
  }
  best.kind = 'player';
  player.car = best;
  sound(game, 'door');
  return true;
}

/** Traffic: follow the lane, mind the car ahead, turn at some corners. */
export function updateTraffic(game, dt) {
  for (const car of game.cars) {
    if (car.kind !== 'traffic' || !car.route) continue;
    const route = car.route;
    // The point on the lane line a short way ahead of the car.
    const along = route.axis === 'v' ? car.y : car.x;
    const ahead = along + route.dir * 78;
    let tx = route.axis === 'v' ? route.line + laneOffset(route.axis, route.dir) : ahead;
    let ty = route.axis === 'v' ? ahead : route.line + laneOffset(route.axis, route.dir);
    // Slow for the car in front and for cross traffic in the junction.
    let wanted = TRAFFIC.speed;
    for (const other of game.cars) {
      if (other === car || other.kind === 'gone') continue;
      const gapD = distance(car.x, car.y, other.x, other.y);
      if (gapD < TRAFFIC.gap && Math.abs(angleDelta(car.angle, Math.atan2(other.y - car.y, other.x - car.x))) < 0.6) {
        wanted = Math.min(wanted, gapD < 40 ? 0 : TRAFFIC.cautiousSpeed);
      }
    }
    car.speed += clamp(wanted - car.speed, -dt * 260, dt * 150);
    const desired = Math.atan2(ty - car.y, tx - car.x);
    car.angle += clamp(angleDelta(car.angle, desired), -dt * 2.4, dt * 2.4);
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    // At a junction, sometimes take the crossing road.
    car.turnCooldown -= dt;
    const crossLines = route.axis === 'v' ? STREETS : AVENUES;
    if (car.turnCooldown <= 0) {
      for (const line of crossLines) {
        const alongNow = route.axis === 'v' ? car.y : car.x;
        if (Math.abs(alongNow - line) < 7 && game.rng.chance(0.012)) {
          const newDir = game.rng.chance(0.5) ? 1 : -1;
          car.route = { axis: route.axis === 'v' ? 'h' : 'v', dir: newDir, line };
          car.turnCooldown = 2.5;
          break;
        }
      }
    }
    // Off the map, in the bay, or left behind on the far side of the city:
    // quietly retire and let the top-up below deal a fresh car near Mari.
    if (car.x < 40 || car.x > WORLD.width - 40 || car.y < 40 || car.y > WORLD.height - 40 || isWater(car.x, car.y)
      || distance(car.x, car.y, game.player.x, game.player.y) > 1700) {
      car.kind = 'gone';
    }
    const pos = resolveBuildingCollision(game.city, car, 15);
    car.x = pos.x;
    car.y = pos.y;
  }
  game.cars = game.cars.filter((c) => c.kind !== 'gone');
  const rolling = game.cars.filter((c) => c.kind === 'traffic').length;
  if (rolling < TRAFFIC.count - 4 && Math.random() < dt * 0.7) {
    game.cars.push(spawnTrafficCar(game.rng, game.player.x, game.player.y, false));
  }
}

/** Police: hunt the player, ram what they drive, box in what they run. */
export function updatePolice(game, dt) {
  const player = game.player;
  const px = player.car ? player.car.x : player.x;
  const py = player.car ? player.car.y : player.y;
  for (const unit of game.cars) {
    if (unit.kind !== 'police') continue;
    const d = distance(unit.x, unit.y, px, py);
    const targetSpeed = clamp(d * 1.4, 90, POLICE.speed[game.stars] || 280);
    // Aim at where the player is going, not where they were.
    const lead = player.car ? clamp(Math.abs(player.car.speed) / 300, 0, 0.5) : 0.1;
    const tx = px + Math.cos(player.angle) * d * lead * 0.4;
    const ty = py + Math.sin(player.angle) * d * lead * 0.4;
    const desired = Math.atan2(ty - unit.y, tx - unit.x);
    unit.angle += clamp(angleDelta(unit.angle, desired), -dt * 2.1, dt * 2.1);
    unit.speed += clamp(targetSpeed - unit.speed, -dt * 320, dt * 210);
    unit.x += Math.cos(unit.angle) * unit.speed * dt;
    unit.y += Math.sin(unit.angle) * unit.speed * dt;
    const pos = resolveBuildingCollision(game.city, unit, 16);
    unit.x = pos.x;
    unit.y = pos.y;
    // Ramming the player's car trades damage both ways.
    if (player.car && distance(unit.x, unit.y, player.car.x, player.car.y) < 34 && Math.abs(unit.speed) > 60) {
      damageCar(game, player.car, POLICE.ramDamage * dt * 3.2, player.car.x, player.car.y);
      damageCar(game, unit, 2.2 * dt * 3, unit.x, unit.y);
      if (Math.random() < dt * 6) sound(game, 'crash');
      addShake(game.fx, 1.6);
    }
    // An officer on top of a fleeing player on foot is a problem for them.
    if (!player.car && d < 30) {
      player.health -= dt * 4;
    }
  }
}

/** Pedestrians: stroll the sidewalks, flee danger, fall when hit. */
export function updatePeds(game, dt) {
  const player = game.player;
  for (const ped of game.peds) {
    if (ped.down) continue;
    ped.stateTimer -= dt;
    // Danger: gunfire, a fast car close, or the player's own driving line.
    let threat = null;
    if (game.gunfireAt && game.time - game.gunfireAt.time < 1.6 && distance(ped.x, ped.y, game.gunfireAt.x, game.gunfireAt.y) < 260) {
      threat = game.gunfireAt;
    }
    for (const car of game.cars) {
      if (Math.abs(car.speed) > 120 && distance(ped.x, ped.y, car.x, car.y) < 56) threat = car;
    }
    if (threat && ped.state !== 'flee') {
      ped.state = 'flee';
      ped.stateTimer = 2.2;
      ped.angle = Math.atan2(ped.y - threat.y, ped.x - threat.x);
    }
    if (ped.state === 'flee') {
      ped.speed = PEDS.fleeSpeed;
      if (ped.stateTimer <= 0) ped.state = 'stroll';
    } else {
      ped.speed = PEDS.speed;
      if (ped.stateTimer <= 0 || distance(ped.x, ped.y, ped.targetX, ped.targetY) < 10) {
        ped.stateTimer = game.rng.range(2, 6);
        const p = randomRoadPoint(game.rng);
        ped.targetX = clamp(p.x + (game.rng.chance(0.5) ? -1 : 1) * (GRID.road / 2 + 13), 30, WORLD.width - 30);
        ped.targetY = clamp(p.y + game.rng.range(-160, 160), 30, WORLD.height - 30);
      }
      ped.angle = Math.atan2(ped.targetY - ped.y, ped.targetX - ped.x);
    }
    ped.x += Math.cos(ped.angle) * ped.speed * dt;
    ped.y += Math.sin(ped.angle) * ped.speed * dt;
    ped.x = clamp(ped.x, 14, WORLD.width - 14);
    ped.y = clamp(ped.y, 14, WORLD.height - 14);
    if (isWater(ped.x, ped.y)) ped.angle += Math.PI * dt * 3;
    const pos = resolveBuildingCollision(game.city, ped, 10);
    ped.x = pos.x;
    ped.y = pos.y;
    // Stepped in front of something fast: down, and somebody saw it.
    for (const car of game.cars) {
      if (Math.abs(car.speed) > 90 && distance(ped.x, ped.y, car.x, car.y) < 17) {
        ped.down = true;
        ped.health = 0;
        spawnHit(game.fx, ped.x, ped.y);
        commitCrime(game, HEAT.crimeHit, ped.x, ped.y);
        if (car === player.car) game.stats.pedsHit += 1;
        sound(game, 'hit');
        break;
      }
    }
  }
  // The city replaces its walkers slowly.
  if (game.peds.filter((p) => !p.down).length < PEDS.count - 6 && Math.random() < dt * 0.5) {
    const p = randomRoadPoint(game.rng);
    game.peds.push(makePed(p.x, p.y, game.rng));
  }
}

/** A gunman the story sent: keeps his range, strafes, fires in bursts. */
export function spawnGunman(game, x, y) {
  const gunman = {
    id: nextId++, x, y, angle: 0, health: GUN.gunmanHealth,
    state: 'fight', burstLeft: 0, burstTimer: 0.6 + Math.random() * 0.8,
    strafeDir: Math.random() < 0.5 ? 1 : -1, strafeTimer: 1.4,
    down: false,
  };
  game.gunmen.push(gunman);
  return gunman;
}

/** Gunmen fight: close to range, strafe sideways, trade bursts. */
export function updateGunmen(game, dt) {
  const player = game.player;
  const px = player.car ? player.car.x : player.x;
  const py = player.car ? player.car.y : player.y;
  for (const g of game.gunmen) {
    if (g.down) continue;
    const d = distance(g.x, g.y, px, py);
    g.angle = Math.atan2(py - g.y, px - g.x);
    g.strafeTimer -= dt;
    if (g.strafeTimer <= 0) {
      g.strafeTimer = 1 + Math.random() * 1.2;
      g.strafeDir *= -1;
    }
    let mx = 0;
    let my = 0;
    if (d > 250) {
      mx = Math.cos(g.angle);
      my = Math.sin(g.angle);
    } else if (d < 130) {
      mx = -Math.cos(g.angle);
      my = -Math.sin(g.angle);
    }
    mx += Math.cos(g.angle + Math.PI / 2) * g.strafeDir * 0.7;
    my += Math.sin(g.angle + Math.PI / 2) * g.strafeDir * 0.7;
    const ml = Math.hypot(mx, my) || 1;
    g.x += (mx / ml) * 74 * dt;
    g.y += (my / ml) * 74 * dt;
    const pos = resolveBuildingCollision(game.city, g, 11);
    g.x = pos.x;
    g.y = pos.y;
    // Fire control: bursts of three, then a breath.
    g.burstTimer -= dt;
    if (g.burstTimer <= 0 && d < GUN.gunmanRange) {
      if (g.burstLeft <= 0) g.burstLeft = 3;
      fireBullet(game, 'gunman', g.x, g.y, g.angle + (Math.random() - 0.5) * 0.09);
      g.burstLeft -= 1;
      g.burstTimer = g.burstLeft > 0 ? 0.13 : 0.9 + Math.random() * 0.7;
    }
  }
  game.gunmen = game.gunmen.filter((g) => !g.down || game.time - (g.downAt || 0) < 20);
}

/** Loose a bullet. `from` is 'player' or 'gunman'; spread is applied by callers. */
export function fireBullet(game, from, x, y, angle) {
  game.bullets.push({
    x, y,
    vx: Math.cos(angle) * GUN.bulletSpeed,
    vy: Math.sin(angle) * GUN.bulletSpeed,
    life: GUN.playerRange / GUN.bulletSpeed,
    from,
  });
  game.gunfireAt = { x, y, time: game.time };
}

/** Bullets fly, hit buildings, cars, gunmen, pedestrians and the player. */
export function updateBullets(game, dt) {
  const player = game.player;
  for (let i = game.bullets.length - 1; i >= 0; i -= 1) {
    const b = game.bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    let dead = b.life <= 0 || isWater(b.x, b.y);
    if (!dead && circleHitsBuilding(game.city, b.x, b.y, 2)) {
      spawnSparks(game.fx, b.x, b.y, 2, '#ffd98a');
      dead = true;
    }
    if (!dead && b.from === 'player') {
      for (const g of game.gunmen) {
        if (!g.down && distance(b.x, b.y, g.x, g.y) < 12) {
          g.health -= GUN.playerDamage;
          spawnHit(game.fx, g.x, g.y);
          game.stats.hits += 1;
          sound(game, 'hit');
          if (g.health <= 0) {
            g.down = true;
            g.downAt = game.time;
            commitCrime(game, HEAT.crimeKill, g.x, g.y);
            game.stats.kills += 1;
            if (Math.random() < 0.4) game.pickups.push({ x: g.x, y: g.y, kind: 'cash', amount: 40 });
            spawnText(game.fx, g.x, g.y - 24, 'DOWN', '#e5484d');
          }
          dead = true;
          break;
        }
      }
      if (!dead) {
        for (const car of game.cars) {
          if (distance(b.x, b.y, car.x, car.y) < 20) {
            damageCar(game, car, 12, b.x, b.y);
            if (car.kind === 'traffic') commitCrime(game, HEAT.crimeShot, b.x, b.y);
            dead = true;
            break;
          }
        }
      }
    }
    if (!dead && b.from === 'gunman') {
      const px = player.car ? player.car.x : player.x;
      const py = player.car ? player.car.y : player.y;
      const radius = player.car ? 20 : 12;
      if (distance(b.x, b.y, px, py) < radius) {
        if (player.car) damageCar(game, player.car, GUN.gunmanDamage, b.x, b.y);
        else {
          player.health -= GUN.gunmanDamage;
          spawnHit(game.fx, px, py);
          sound(game, 'hit');
        }
        dead = true;
      }
    }
    if (dead) game.bullets.splice(i, 1);
  }
}

/** Pickups: walk or drive over cash, health and packages to collect them. */
export function updatePickups(game, dt) {
  const player = game.player;
  const px = player.car ? player.car.x : player.x;
  const py = player.car ? player.car.y : player.y;
  for (let i = game.pickups.length - 1; i >= 0; i -= 1) {
    const pickup = game.pickups[i];
    pickup.phase = (pickup.phase || 0) + dt * 3;
    if (distance(px, py, pickup.x, pickup.y) < 30) {
      if (pickup.kind === 'cash') {
        player.money += pickup.amount || 25;
        spawnText(game.fx, px, py - 30, `+$${pickup.amount || 25}`, '#9dff57');
        sound(game, 'cash');
      } else if (pickup.kind === 'health') {
        player.health = clamp(player.health + 35, 0, PLAYER.health);
        spawnText(game.fx, px, py - 30, '+HEALTH', '#9dff57');
        sound(game, 'pickup');
      } else if (pickup.kind === 'package') {
        game.hasPackage = true;
        spawnText(game.fx, px, py - 30, 'PACKAGE ON BOARD', '#6fd3e7');
        sound(game, 'pickup');
      }
      game.pickups.splice(i, 1);
    }
  }
  // The hospital keeps a health pickup by its door.
  if (!game.pickups.some((p) => p.kind === 'health') && Math.random() < dt * 0.05) {
    const hospital = placeById('hospital');
    game.pickups.push({ x: hospital.x + 40, y: hospital.y + 30, kind: 'health' });
  }
}

/**
 * Respray garages: roll a wanted car into a Shine Respray marker with the
 * money in your pocket and the heat comes off — unless the law is close
 * enough to watch you do it.
 */
export function updateRespray(game) {
  const player = game.player;
  if (!player.car || game.stars === 0) return;
  for (const place of game.cityPlaces) {
    if (place.kind !== 'respray') continue;
    if (distance(player.car.x, player.car.y, place.x, place.y) > 58) continue;
    const watched = game.cars.some((c) => c.kind === 'police' && distance(c.x, c.y, place.x, place.y) < 240);
    if (watched) {
      if (game.time - (game.resprayWarnAt || 0) > 3) {
        game.resprayWarnAt = game.time;
        spawnText(game.fx, place.x, place.y - 40, 'TOO HOT — LOSE THEM FIRST', '#e5484d');
      }
      return;
    }
    if (player.money < HEAT.resprayCost) {
      if (game.time - (game.resprayWarnAt || 0) > 3) {
        game.resprayWarnAt = game.time;
        spawnText(game.fx, place.x, place.y - 40, `NEED $${HEAT.resprayCost}`, '#e5484d');
      }
      return;
    }
    player.money -= HEAT.resprayCost;
    game.heat = 0;
    game.stars = 0;
    player.car.paint = game.rng.int(0, 7);
    player.car.health = Math.min(CAR.health, player.car.health + 30);
    spawnSmoke(game.fx, player.car.x, player.car.y, 12, '#cfd6dd');
    spawnText(game.fx, place.x, place.y - 40, 'FRESH PAINT — HEAT OFF', '#9dff57');
    sound(game, 'spray');
  }
}
