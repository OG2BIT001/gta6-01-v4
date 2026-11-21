// Neon Tide: Coral Bay — the headless smoke test.
//
// There is no browser on this machine, so this harness stubs the pieces of
// the DOM the game touches (a canvas whose context swallows every call, a
// localStorage in a Map, a location with a query string) and then plays
// the real game: it walks Mari, steals a car, drives it, runs Selene's
// first errand end to end, trades fire with a gunman, earns four stars,
// dies, respawns, and stages every screenshot scene to prove the frames
// the dossier ships are frames the game itself can produce.
//
// Run it from the entry root:  node tools/smoke.mjs

const checks = [];
function check(name, condition) {
  checks.push({ name, ok: !!condition });
  if (!condition) console.error(`  FAIL: ${name}`);
}

/** A canvas 2d context that accepts every call and answers the few queries. */
function makeCtx(canvas) {
  const target = { canvas };
  return new Proxy(target, {
    get(t, prop) {
      if (prop in t) return t[prop];
      if (prop === 'measureText') return () => ({ width: 42 });
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (prop === 'getBoundingClientRect') return () => ({ left: 0, top: 0, width: 1280, height: 800 });
      return () => {};
    },
    set() {
      return true;
    },
  });
}

function makeCanvas() {
  const canvas = { width: 1280, height: 800, style: {} };
  canvas.getContext = () => makeCtx(canvas);
  canvas.addEventListener = () => {};
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1280, height: 800 });
  return canvas;
}

const storage = new Map();
const canvas = makeCanvas();
const listeners = {};
globalThis.window = {
  addEventListener: (name, fn) => {
    listeners[name] = fn;
  },
  location: { search: '' },
  innerWidth: 1280,
  innerHeight: 800,
  devicePixelRatio: 1,
  AudioContext: undefined,
  __shotReady: false,
};
globalThis.document = {
  getElementById: (id) => (id === 'game' ? canvas : { textContent: '' }),
};
globalThis.localStorage = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
};
globalThis.requestAnimationFrame = () => {};

const main = await import('../game/src/main.js');
const entities = await import('../game/src/entities.js');
const cityModule = await import('../game/src/city.js');
const { game, input, stepWorld } = globalThis.window.__NEON_TIDE__;
const STEP = 1 / 60;

function steps(n) {
  for (let i = 0; i < n; i += 1) stepWorld(game, STEP);
}
function teleport(x, y) {
  if (game.player.car) {
    game.player.car.x = x;
    game.player.car.y = y;
  }
  game.player.x = x;
  game.player.y = y;
}

// --- The world itself ---------------------------------------------------
check('boots to the title screen', game.screen === 'title');
check('city builds more than 120 buildings', game.city.buildings.length > 120);
check('city has palms, lamps, lots and piers', game.city.palms.length > 20 && game.city.lamps.length > 100 && game.city.lots.length > 4 && game.city.piers.length === 3);
const again = cityModule.buildCity(7);
check('the same seed builds the same city', again.buildings.length === game.city.buildings.length && again.buildings[0].x === game.city.buildings[0].x);
check('twelve named places', cityModule.PLACES.length === 12);

// --- Walking and driving --------------------------------------------------
game.screen = 'play';
const startY = game.player.y;
input.up = true;
steps(50);
input.up = false;
check('Mari walks north on the street', game.player.y < startY - 40);
const parked = game.cars.find((c) => c.kind === 'parked');
teleport(parked.x + 20, parked.y);
globalThis.window.__NEON_TIDE__.handleInteract(game);
check('E gets Mari into a parked car', game.player.car === parked);
const carPosBefore = { x: parked.x, y: parked.y };
input.up = true;
steps(30);
check('the car rolls under power', Math.abs(parked.speed) > 40 && Math.hypot(parked.x - carPosBefore.x, parked.y - carPosBefore.y) > 20);
steps(80);
input.up = false;
check('the car covers ground', Math.hypot(parked.x - carPosBefore.x, parked.y - carPosBefore.y) > 60);
globalThis.window.__NEON_TIDE__.handleInteract(game);
check('E gets Mari back out', game.player.car === null);

// --- Mission 1, end to end -------------------------------------------------
const club = cityModule.placeById('club');
teleport(club.x, club.y);
globalThis.window.__NEON_TIDE__.handleInteract(game);
check('talking to Selene opens dialogue', !!game.mission.dialogue);
let guard = 0;
while (game.mission.dialogue && guard < 12) {
  globalThis.window.__NEON_TIDE__.advanceDialogue(game);
  guard += 1;
}
check('the first errand is active after the intro', !!game.mission.active && game.mission.index === 0);
const pkg = game.pickups.find((p) => p.kind === 'package');
check('the package waits at the Mercado', !!pkg);
teleport(pkg.x, pkg.y);
steps(6);
check('walking over it picks the package up', game.hasPackage === true);
steps(4);
const objectiveAfterPickup = game.objective;
check('the objective turns toward Club Azul', !!objectiveAfterPickup && Math.abs(objectiveAfterPickup.x - club.x) < 2);
teleport(club.x, club.y);
steps(6);
guard = 0;
while (game.mission.dialogue && guard < 12) {
  globalThis.window.__NEON_TIDE__.advanceDialogue(game);
  guard += 1;
}
check('the first errand pays and closes', game.mission.completed === 1 && game.mission.index === 1);
check('the payout landed in the wallet', game.player.money >= 400);
steps(3); // the save lands at the end of the next world step
check('a save was written', storage.size > 0);

// --- Combat -----------------------------------------------------------------
const foe = entities.spawnGunman(game, game.player.x + 150, game.player.y);
input.shootKey = true;
let shots = 0;
while (!foe.down && shots < 2400) {
  game.player.angle = Math.atan2(foe.y - game.player.y, foe.x - game.player.x);
  stepWorld(game, STEP);
  shots += 1;
}
input.shootKey = false;
check('Mari shoots', game.stats.shots > 0);
check('her shots land', game.stats.hits > 0);
check('the gunman goes down', foe.down === true);

// --- The law ------------------------------------------------------------------
game.heat = 330;
steps(30);
check('330 heat is four stars', game.stars === 4);
check('four stars bring a fleet', game.cars.filter((c) => c.kind === 'police').length >= 4);
game.heat = 0;
steps(90);
check('cold heat clears the stars', game.stars === 0);

// --- Death and the way back ----------------------------------------------------
game.player.health = 0;
steps(3);
check('zero health is wasted', game.screen === 'wasted');
globalThis.window.__NEON_TIDE__.respawn(game, 50);
check('respawn returns Mari to the street at full health', game.screen === 'play' && game.player.health === 100);

// --- The screenshot scenes ------------------------------------------------------
for (const scene of ['chase', 'drive', 'foot', 'title']) {
  globalThis.window.__shotReady = false;
  globalThis.window.location.search = `?shot=${scene}&seed=7`;
  await import(`../game/src/main.js?scene=${scene}`);
  check(`?shot=${scene} stages and flags ready`, globalThis.window.__shotReady === true);
  globalThis.window.location.search = '';
}

const failed = checks.filter((c) => !c.ok);
if (failed.length > 0) {
  console.error(`SMOKE FAILED: ${failed.length}/${checks.length} checks failed`);
  process.exit(1);
}
console.log(`SMOKE OK (${checks.length} checks)`);
void main;
