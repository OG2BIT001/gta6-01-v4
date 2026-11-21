// Neon Tide: Coral Bay — the game itself: state, input, the loop, the law
// of the land and the saves. main.js wires the modules together: city.js
// builds the world, entities.js moves everyone in it, missions.js tells
// the story, fx.js and audio.js dress it, render.js paints it. What lives
// here is the frame that holds them: the screen machine (title, play,
// pause, wasted, busted, victory), the fixed-step loop, the camera, the
// day clock, and the ?shot= staging the screenshots are taken from.

import { DAY, GUN, HEAT, PLAYER, STEP, WORLD } from './config.js';
import { PLACES, buildCity, districtAt, placeById } from './city.js';
import {
  commitCrime, createActors, createPlayer, fireBullet, tryEnterExitCar,
  updateBullets, updateGunmen, updateHeat, updatePickups,
  updatePlayer, updatePolice, updateRespray, updateTraffic, updatePeds,
} from './entities.js';
import {
  abortMission, advanceDialogue, createMissions, currentObjective,
  missionStartPlace, startMission, updateMissions,
} from './missions.js';
import { createFx, spawnText, updateFx } from './fx.js';
import { createAudio, playSound, setMuted, unlock, updateAudio } from './audio.js';
import { draw } from './render.js';
import { clamp, makeRng } from './random.js';

const SAVE_KEY = 'neontide-coral-bay-v4';
const canvas = document.getElementById('game');
const ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
const status = document.getElementById('status');

/** The one input object every system reads: keys, mouse, and edges. */
const input = {
  up: false, down: false, left: false, right: false,
  run: false, handbrake: false, shoot: false,
  mouseX: 0, mouseY: 0, interactPressed: false, confirmPressed: false,
};

/** Assemble a fresh Coral Bay: city, actors, player, story, effects. */
export function createGame(seed) {
  const city = buildCity(seed);
  const rng = makeRng(seed * 7919 + 13);
  const actors = createActors(city, rng);
  const game = {
    seed,
    city,
    cityPlaces: PLACES,
    rng,
    fx: createFx(),
    audio: createAudio(),
    screen: 'title',
    menuIndex: 0,
    showHelp: false,
    hasSave: false,
    time: 0,
    hour: DAY.startHour,
    player: createPlayer(),
    cars: actors.cars,
    peds: actors.peds,
    gunmen: actors.gunmen,
    bullets: actors.bullets,
    pickups: actors.pickups,
    mission: createMissions(),
    heat: 0,
    stars: 0,
    bust: 0,
    seen: false,
    busted: false,
    hasPackage: false,
    gunfireAt: null,
    lastCrimeAt: -99,
    resprayWarnAt: 0,
    storyComplete: false,
    victoryPending: false,
    saveRequested: false,
    camX: 0,
    camY: 0,
    districtName: '',
    districtToast: 0,
    objective: null,
    missionStart: null,
    events: { sounds: [] },
    stats: { shots: 0, hits: 0, kills: 0, thefts: 0, pedsHit: 0, cashEarned: 0 },
  };
  game.districtName = districtAt(game.player.x, game.player.y).name;
  return game;
}

/** Persist the run: money, story progress, stats and where Mari stands. */
function saveGame(game) {
  try {
    const data = {
      money: game.player.money,
      missionIndex: game.mission.index,
      completed: game.mission.completed,
      courierCount: game.mission.courierCount,
      storyComplete: game.storyComplete,
      stats: game.stats,
      hour: game.hour,
      x: game.player.x,
      y: game.player.y,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    game.hasSave = true;
  } catch {
    // A browser that refuses storage just loses the save, not the game.
  }
}

/** Read a saved run back, or return null when there is none worth having. */
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.money !== 'number' || typeof data.missionIndex !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

/** Apply a save to a fresh game (Continue on the title screen). */
function applySave(game, data) {
  game.player.money = data.money;
  game.player.x = data.x;
  game.player.y = data.y;
  game.mission.index = data.missionIndex;
  game.mission.completed = data.completed || 0;
  game.mission.courierCount = data.courierCount || 0;
  game.storyComplete = !!data.storyComplete;
  game.stats = Object.assign(game.stats, data.stats || {});
  game.hour = data.hour || DAY.startHour;
}

/** The E key's whole world: dialogue first, then jobs, then car doors. */
function handleInteract(game) {
  if (game.screen !== 'play') return;
  if (game.mission.dialogue) {
    advanceDialogue(game);
    return;
  }
  const start = missionStartPlace(game);
  if (start && !game.mission.active) {
    const d = Math.hypot(game.player.x - start.x, game.player.y - start.y);
    if (d < 64 && !game.player.car) {
      startMission(game);
      return;
    }
  }
  tryEnterExitCar(game);
}

/** Shooting: on foot, toward the mouse (or facing), at the pistol's pace. */
function updateShooting(game, dt) {
  const player = game.player;
  if (player.car || game.mission.dialogue) return;
  if (!input.shoot && !input.shootKey) return;
  if (player.shootCooldown > 0) return;
  player.shootCooldown = GUN.playerCooldown;
  let angle = player.angle;
  if (input.mouseSeen) {
    const wx = game.camX + input.mouseX;
    const wy = game.camY + input.mouseY;
    angle = Math.atan2(wy - player.y, wx - player.x);
  }
  player.angle = angle;
  fireBullet(game, 'player', player.x + Math.cos(angle) * 16, player.y + Math.sin(angle) * 16, angle);
  commitCrime(game, HEAT.crimeShot, player.x, player.y);
  game.stats.shots += 1;
  game.events.sounds.push('shot');
}

/** One fixed step of the living world, in the order the systems depend on. */
export function stepWorld(game, dt) {
  game.time += dt;
  game.hour = (game.hour + (dt * 24) / DAY.secondsPerDay) % 24;
  if (game.screen === 'title') {
    // The title idles over Neon Mile: traffic rolls, the bay breathes.
    updateTraffic(game, dt);
    updatePeds(game, dt);
    updateFx(game.fx, dt);
    game.camX = clamp(1500 + Math.sin(game.time * 0.05) * 320 - viewW() / 2, 0, Math.max(0, WORLD.width - viewW()));
    game.camY = clamp(1500 + Math.cos(game.time * 0.037) * 260 - viewH() / 2, 0, Math.max(0, WORLD.height - viewH()));
    return;
  }
  if (game.screen !== 'play') return;

  if (input.interactPressed) {
    input.interactPressed = false;
    handleInteract(game);
  }
  updatePlayer(game, input, dt);
  updateShooting(game, dt);
  updateTraffic(game, dt);
  updatePolice(game, dt);
  updatePeds(game, dt);
  updateGunmen(game, dt);
  updateBullets(game, dt);
  updatePickups(game, dt);
  updateHeat(game, dt);
  updateRespray(game);
  updateMissions(game, dt);
  updateFx(game.fx, dt);

  // Camera follows whoever Mari is right now.
  const px = game.player.car ? game.player.car.x : game.player.x;
  const py = game.player.car ? game.player.car.y : game.player.y;
  game.camX = clamp(px - viewW() / 2, 0, Math.max(0, WORLD.width - viewW()));
  game.camY = clamp(py - viewH() / 2, 0, Math.max(0, WORLD.height - viewH()));

  // District arrivals announce themselves once.
  const here = districtAt(px, py).name;
  if (here !== game.districtName) {
    game.districtName = here;
    game.districtToast = 2.4;
    if (status) status.textContent = `Entered ${here}`;
  }
  game.districtToast = Math.max(0, game.districtToast - dt);

  game.objective = currentObjective(game);
  game.missionStart = missionStartPlace(game);

  // Sound direction for the loops, then this frame's one-shots.
  let policeDistance = 9999;
  for (const car of game.cars) {
    if (car.kind === 'police') policeDistance = Math.min(policeDistance, Math.hypot(car.x - px, car.y - py));
  }
  updateAudio(game.audio, dt, {
    driving: !!game.player.car,
    speed: game.player.car ? game.player.car.speed : 0,
    throttle: input.up,
    policeDistance,
    rain: game.fx.weather.rain,
    playing: true,
  });
  for (const name of game.events.sounds) playSound(game.audio, name);
  game.events.sounds.length = 0;

  if (game.saveRequested) {
    game.saveRequested = false;
    saveGame(game);
  }
  // The two ways a run ends.
  if (game.player.health <= 0 && !game.player.dead) {
    game.player.dead = true;
    game.screen = 'wasted';
    abortMission(game);
    playSound(game.audio, 'wasted');
  }
  if (game.busted) {
    game.busted = false;
    game.screen = 'busted';
    abortMission(game);
    playSound(game.audio, 'busted');
  }
  if (game.victoryPending && !game.mission.dialogue) {
    game.victoryPending = false;
    game.screen = 'victory';
  }
}

/** Put Mari back on her feet after a wasted or busted run. */
function respawn(game, fined) {
  const hospital = placeById('hospital');
  game.player.car = null;
  game.player.x = hospital.x + 30;
  game.player.y = hospital.y + 44;
  game.player.health = PLAYER.health;
  game.player.dead = false;
  game.player.money = Math.max(0, game.player.money - fined);
  game.heat = 0;
  game.stars = 0;
  game.bust = 0;
  game.cars = game.cars.filter((car) => car.kind !== 'police');
  game.screen = 'play';
  spawnText(game.fx, game.player.x, game.player.y - 40, fined > 0 ? `-$${fined}` : 'BACK ON THE STREET', '#ffd166');
  saveGame(game);
}

/** Title-menu activation: New Game, Continue, How to Play. */
function activateMenu(game) {
  const options = game.hasSave ? ['new', 'continue', 'help'] : ['new', 'help'];
  const choice = options[clamp(game.menuIndex, 0, options.length - 1)];
  playSound(game.audio, 'ui');
  if (choice === 'new') {
    const fresh = createGame(game.seed);
    fresh.audio = game.audio;
    fresh.hasSave = game.hasSave;
    Object.assign(game, fresh);
    game.screen = 'play';
    spawnText(game.fx, game.player.x, game.player.y - 44, 'Find Selene at Club Azul — follow the green !', '#9dff57');
  } else if (choice === 'continue') {
    const data = loadSave();
    if (data) applySave(game, data);
    game.screen = 'play';
  } else {
    game.showHelp = !game.showHelp;
  }
}

/** Keyboard and mouse wiring. Everything lands in `input` or fires an edge. */
function wireInput(game) {
  const keys = {
    KeyW: 'up', ArrowUp: 'up',
    KeyS: 'down', ArrowDown: 'down',
    KeyA: 'left', ArrowLeft: 'left',
    KeyD: 'right', ArrowRight: 'right',
    ShiftLeft: 'run', ShiftRight: 'run',
    Space: 'handbrake',
    KeyF: 'shootKey',
  };
  window.addEventListener('keydown', (event) => {
    unlock(game.audio);
    if (keys[event.code]) {
      input[keys[event.code]] = true;
      if (event.code === 'Space') event.preventDefault();
    }
    if (event.code === 'KeyE' && !event.repeat) input.interactPressed = true;
    if (event.code === 'KeyM' && !event.repeat) setMuted(game.audio, !game.audio.muted);
    if (game.screen === 'title') {
      const count = game.hasSave ? 3 : 2;
      if (event.code === 'ArrowUp' || event.code === 'KeyW') game.menuIndex = (game.menuIndex + count - 1) % count;
      if (event.code === 'ArrowDown' || event.code === 'KeyS') game.menuIndex = (game.menuIndex + 1) % count;
      if (event.code === 'Enter') activateMenu(game);
    } else if (event.code === 'KeyP' || event.code === 'Escape') {
      if (game.screen === 'play') {
        game.screen = 'pause';
        saveGame(game);
      } else if (game.screen === 'pause') game.screen = 'play';
    } else if (event.code === 'Enter') {
      if (game.screen === 'wasted') respawn(game, Math.min(150, Math.floor(game.player.money * 0.12) + 25));
      else if (game.screen === 'busted') respawn(game, Math.min(220, Math.floor(game.player.money * 0.18) + 40));
      else if (game.screen === 'victory') game.screen = 'play';
      else if (game.screen === 'pause') game.screen = 'play';
    }
  });
  window.addEventListener('keyup', (event) => {
    if (keys[event.code]) input[keys[event.code]] = false;
  });
  canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    input.mouseX = (event.clientX - rect.left) * (canvas.width / rect.width);
    input.mouseY = (event.clientY - rect.top) * (canvas.height / rect.height);
    input.mouseSeen = true;
  });
  canvas.addEventListener('mousedown', () => {
    unlock(game.audio);
    if (game.screen === 'title') activateMenu(game);
    else if (game.mission.dialogue) advanceDialogue(game);
    else input.shoot = true;
  });
  window.addEventListener('mouseup', () => {
    input.shoot = false;
  });
  window.addEventListener('resize', fitCanvas);
}

/** Canvas pixels follow the window, capped so big monitors stay smooth. */
function fitCanvas() {
  if (!canvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
}

function viewW() {
  return canvas ? canvas.width : 1280;
}

function viewH() {
  return canvas ? canvas.height : 800;
}

/**
 * Stage one of the screenshot scenes and freeze it ready for capture:
 * the world is stepped forward with a scripted Mari so the frame is a
 * real moment of the real game, then painted, then flagged ready.
 */
function stageShot(game, name) {
  const player = game.player;
  game.screen = 'play';
  if (name === 'title') {
    game.screen = 'title';
    game.hour = 19.1;
    for (let i = 0; i < 240; i += 1) stepWorld(game, STEP);
  } else if (name === 'drive') {
    game.hour = 18.7;
    const car = game.cars.find((c) => c.kind === 'traffic') || game.cars[0];
    car.kind = 'player';
    player.car = car;
    car.x = 1520;
    car.y = 1576;
    car.angle = 0;
    car.speed = 205;
    player.x = car.x;
    player.y = car.y;
    input.up = true;
    for (let i = 0; i < 150; i += 1) stepWorld(game, STEP);
    input.up = false;
  } else if (name === 'chase') {
    game.hour = 21.3;
    startMission(game);
    while (game.mission.dialogue) advanceDialogue(game);
    const car = game.cars.find((c) => c.kind === 'traffic') || game.cars[0];
    car.kind = 'player';
    player.car = car;
    car.x = 2320;
    car.y = 1176;
    car.angle = 0;
    car.speed = 240;
    player.x = car.x;
    player.y = car.y;
    game.heat = 330;
    input.up = true;
    for (let i = 0; i < 200; i += 1) stepWorld(game, STEP);
    input.up = false;
    game.objective = currentObjective(game);
  } else {
    // foot: Mari at the Mercado, mid-conversation with the city around her.
    game.hour = 10.4;
    const market = placeById('market');
    player.x = market.x + 8;
    player.y = market.y + 52;
    player.angle = -Math.PI / 3;
    startMission(game); // Selene's first errand opens the dialogue UI
    game.mission.dialogue = { lines: [
      { who: 'Tito', text: 'Mari! You are Selene\u2019s new driver? She called ahead — the package is the blue cooler by my stall.' },
      { who: 'Mari', text: 'And the whole market is watching me take it. Comforting.' },
    ], index: 0, phase: 'intro' };
    input.down = true;
    for (let i = 0; i < 60; i += 1) stepWorld(game, STEP);
    input.down = false;
  }
  game.objective = currentObjective(game);
  game.missionStart = missionStartPlace(game);
  if (ctx) {
    draw(ctx, game, viewW(), viewH());
    draw(ctx, game, viewW(), viewH());
  }
  window.__shotReady = true;
}

/** Boot: a shot scene if the URL asks for one, otherwise the title screen. */
function boot() {
  const params = new URLSearchParams(window.location.search);
  const seed = Number(params.get('seed')) || 7;
  const game = createGame(seed);
  game.hasSave = !!loadSave();
  if (params.get('shot')) {
    stageShot(game, params.get('shot'));
  }
  wireInput(game);
  fitCanvas();
  window.__NEON_TIDE__ = { game, input, createGame, stepWorld, startMission, advanceDialogue, handleInteract, respawn };
  if (!ctx) return;
  let last = performance.now();
  let accumulator = 0;
  const frame = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    accumulator += dt;
    while (accumulator >= STEP) {
      stepWorld(game, STEP);
      accumulator -= STEP;
    }
    draw(ctx, game, viewW(), viewH());
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') boot();
