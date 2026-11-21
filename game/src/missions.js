// Neon Tide: Coral Bay — the story: nine missions, one stage machine.
//
// A mission is data: a giver at a named place, a few lines of intro
// dialogue, a list of stages, a few lines of outro, and a payout. The
// stage machine below walks the list — goto a marker, lift a package,
// steal a marked car, drop marked gunmen, wreck a marked van, outrun a
// race clock, survive a yard full of guns, or shake the heat off — and
// when the last stage closes it pays and moves the story on. After the
// finale the machine switches to endless courier work.

import { AVENUES, STREETS, placeById } from './city.js';
import { commitCrime, spawnGunman } from './entities.js';
import { spawnConfetti, spawnText } from './fx.js';
import { distance } from './random.js';

/** Snap a point onto the nearest avenue so spawned cars sit on tarmac. */
function roadSnap(x, y) {
  let best = AVENUES[0];
  for (const ax of AVENUES) if (Math.abs(ax - x) < Math.abs(best - x)) best = ax;
  return { x: best + 24, y };
}

/** The intersection of the avenue and street nearest a point: always road. */
function crossing(x, y) {
  let ax = AVENUES[0];
  let sy = STREETS[0];
  for (const a of AVENUES) if (Math.abs(a - x) < Math.abs(ax - x)) ax = a;
  for (const s of STREETS) if (Math.abs(s - y) < Math.abs(sy - y)) sy = s;
  return { x: ax, y: sy };
}

/**
 * The nine story missions. Stage fields by type:
 * goto { x, y, label, needsPackage } · pickup { x, y, label } ·
 * steal { x, y, label } · kill { points: [[x, y]...], label } ·
 * destroy { x, y, label } · escape { label, grantHeat } ·
 * race { points: [[x, y]...], time, label } · survive { x, y, seconds, label }.
 */
export const STORY = [
  {
    title: 'First Errand', giver: 'Selene', place: 'club', pay: 400,
    intro: [
      { who: 'Selene', text: 'You are Mari, yes? The one who can drive and keep her mouth shut. Good. I am Selene.' },
      { who: 'Selene', text: 'A package waits at Mercado Central. Tito will hand it over. Bring it back to my door, untouched.' },
      { who: 'Mari', text: 'And if anyone asks what is in it?' },
      { who: 'Selene', text: 'Then you drove too slowly. Go.' },
    ],
    stages: [
      { type: 'pickup', at: 'market', label: 'Collect the package at Mercado Central' },
      { type: 'goto', at: 'club', label: 'Deliver the package to Club Azul', needsPackage: true },
    ],
    outro: [
      { who: 'Selene', text: 'Sealed, dry and on time. Coral Bay runs on people like you, Mari.' },
      { who: 'Selene', text: 'Come back when you want real work. It pays better and asks worse.' },
    ],
  },
  {
    title: 'Borrowed Wheels', giver: 'Tito', place: 'market', pay: 550,
    intro: [
      { who: 'Tito', text: 'Mari! My cousin parks his shiny coupe at the Palms Hotel and brags about the alarm. The alarm, Mari.' },
      { who: 'Tito', text: 'Bring me that coupe. Not a scratch story — the car. I want to watch his face at Sunday dinner.' },
    ],
    stages: [
      { type: 'steal', near: 'hotel', label: 'Steal the coupe at The Palms Hotel' },
      { type: 'goto', at: 'market', label: 'Bring the coupe back to Mercado Central' },
    ],
    outro: [
      { who: 'Tito', text: 'Ha! The alarm sings, the cousin cries, Tito pays. Family is beautiful.' },
    ],
  },
  {
    title: 'Pier Pressure', giver: 'Captain Ilya', place: 'docks', pay: 700,
    intro: [
      { who: 'Captain Ilya', text: 'A grey van sits at Marina Azul full of goods that fell off a ship that does not exist.' },
      { who: 'Captain Ilya', text: 'Make the van stop existing too. Then make yourself scarce — the law dislikes paperwork fires.' },
    ],
    stages: [
      { type: 'destroy', near: 'marina', label: 'Wreck the grey van at Marina Azul' },
      { type: 'escape', label: 'Lose the heat', grantHeat: 210 },
    ],
    outro: [
      { who: 'Captain Ilya', text: 'The bay keeps secrets and so do I. Good work, captain of the land.' },
    ],
  },
  {
    title: 'Night Shift', giver: 'Dr. Park', place: 'hospital', pay: 650,
    intro: [
      { who: 'Dr. Park', text: 'A heart cooler waits at the Solana Yards depot. The patient it belongs to is already on my table.' },
      { who: 'Dr. Park', text: 'Pick it up and follow the beacons back to me. Fast, Mari. Careful is for other nights.' },
    ],
    stages: [
      { type: 'pickup', at: 'warehouse', label: 'Collect the heart cooler at Solana Yards' },
      { type: 'race', points: [[1520, 1520], [1120, 1520], [720, 1520]], time: 75, label: 'Race the cooler to Coral Bay General' },
    ],
    outro: [
      { who: 'Dr. Park', text: 'Still cold. Still a chance. Whatever they pay you, it is not enough — take mine too.' },
    ],
  },
  {
    title: 'The Medusa Tab', giver: 'Lucia', place: 'bar', pay: 800,
    intro: [
      { who: 'Lucia', text: 'Three men drank my bar dry, shot my mirror and called it a tab. They are hiding in Solana Yards.' },
      { who: 'Lucia', text: 'Close the tab, Mari. All three pages of it.' },
    ],
    stages: [
      { type: 'goto', at: 'warehouse', label: 'Go to Solana Yards' },
      { type: 'kill', points: [[700, 2830], [830, 2700], [760, 2620]], label: 'Close the tab: drop Lucia\u2019s three debtors' },
    ],
    outro: [
      { who: 'Lucia', text: 'The mirror I replace. The message stays. Drinks are on the house, hero.' },
    ],
  },
  {
    title: 'High Value', giver: 'Madame Okafor', place: 'hotel', pay: 950,
    intro: [
      { who: 'Madame Okafor', text: 'A collector in Neon Mile keeps a scarlet roadster he does not deserve and I do.' },
      { who: 'Madame Okafor', text: 'Take it to Captain Ilya at the docks. If the city objects, outrun its objections.' },
    ],
    stages: [
      { type: 'steal', nearPoint: [1760, 1640], label: 'Steal the scarlet roadster in Neon Mile' },
      { type: 'goto', at: 'docks', label: 'Deliver the roadster to Coral Docks' },
      { type: 'escape', label: 'Shake off the heat', grantHeat: 0 },
    ],
    outro: [
      { who: 'Madame Okafor', text: 'Scarlet suits the bay far better than a garage. We will do business again.' },
    ],
  },
  {
    title: 'Harbour Run', giver: 'The Commodore', place: 'marina', pay: 900,
    intro: [
      { who: 'The Commodore', text: 'Every year the yacht club times the harbour run. Every year some landsman wins it in a stolen car.' },
      { who: 'The Commodore', text: 'This year it is you. Hit every beacon around Harbourview before the clock eats your pride.' },
    ],
    stages: [
      { type: 'race', points: [[3120, 1120], [3520, 1520], [3120, 1920], [2720, 1520]], time: 95, label: 'Run the harbour beacons' },
    ],
    outro: [
      { who: 'The Commodore', text: 'The club is furious, the stopwatch is honest, and the money is yours.' },
    ],
  },
  {
    title: 'Yard Dogs', giver: 'Foreman Ruiz', place: 'warehouse', pay: 1100,
    intro: [
      { who: 'Foreman Ruiz', text: 'A crew has been lifting copper out of my yard three nights running. Tonight I am paying a fence.' },
      { who: 'Foreman Ruiz', text: 'You are the fence, Mari. Stand in my yard and be extremely unfriendly for three quarters of a minute.' },
    ],
    stages: [
      { type: 'survive', at: 'warehouse', seconds: 45, label: 'Hold Solana Yards against the copper crew' },
    ],
    outro: [
      { who: 'Foreman Ruiz', text: 'Quiet yard, full moon, empty ambulance. You fence beautifully.' },
    ],
  },
  {
    title: 'Neon Tide', giver: 'Selene', place: 'club', pay: 2000,
    intro: [
      { who: 'Selene', text: 'Last job, Mari, and it is the one the whole bay will feel. A case waits at Pier 3, Coral Docks.' },
      { who: 'Selene', text: 'Bring it home through the beacons. Every light in this city will be watching — give them a show worth the name.' },
    ],
    stages: [
      { type: 'pickup', at: 'docks', label: 'Collect the case at Coral Docks Pier 3' },
      { type: 'race', points: [[3520, 2320], [2720, 1920], [1920, 1920]], time: 110, label: 'Run the case home through the beacons' },
      { type: 'goto', at: 'club', label: 'Deliver the case to Club Azul', needsPackage: true },
      { type: 'escape', label: 'Vanish into the Neon Tide', grantHeat: 330 },
    ],
    outro: [
      { who: 'Selene', text: 'The tide came in and it carried your name. Coral Bay is yours now, Mari — all nine districts of it.' },
      { who: 'Selene', text: 'The club still needs a driver, though. Old habits pay.' },
    ],
  },
];

/** Fresh mission-runner state, stored on the game object. */
export function createMissions() {
  return {
    index: 0,
    active: null,
    dialogue: null,
    courierCount: 0,
    completed: 0,
  };
}

/** Where the next job starts, or null while one is running. */
export function missionStartPlace(game) {
  const M = game.mission;
  if (M.active) return null;
  if (M.index < STORY.length) return placeById(STORY[M.index].place);
  return placeById(['club', 'market', 'marina', 'bar'][M.courierCount % 4]);
}

/** The HUD objective for the current stage, with its world marker. */
export function currentObjective(game) {
  const M = game.mission;
  if (!M.active || M.dialogue) return null;
  const run = M.active;
  const stage = run.def.stages[run.stageIndex];
  if (!stage) return null;
  let text = stage.label;
  if (stage.type === 'race') text = `${stage.label} — beacon ${run.checkpoint + 1}/${stage.points.length}, ${Math.ceil(run.timer)}s`;
  if (stage.type === 'survive') text = `${stage.label} — ${Math.ceil(run.timer)}s`;
  if (stage.type === 'escape') text = `${stage.label} (${game.stars} star${game.stars === 1 ? '' : 's'})`;
  return { text, x: run.markerX, y: run.markerY };
}

/** Begin the next story mission, or a courier job once the story is done. */
export function startMission(game) {
  const M = game.mission;
  if (M.active) return;
  let def;
  if (M.index < STORY.length) {
    def = STORY[M.index];
  } else {
    def = makeCourier(M.courierCount);
    M.courierCount += 1;
  }
  M.active = {
    def,
    stageIndex: -1,
    checkpoint: 0,
    timer: 0,
    targetCar: null,
    targetVan: null,
    markerX: 0,
    markerY: 0,
    waveTimer: 0,
    failed: false,
  };
  M.dialogue = { lines: def.intro, index: 0, phase: 'intro' };
  game.events.sounds.push('mission');
}

/** Build an endless courier job: a pickup and a timed delivery. */
function makeCourier(n) {
  const routes = [
    { from: 'market', to: 'docks', pay: 420 },
    { from: 'club', to: 'marina', pay: 360 },
    { from: 'warehouse', to: 'hotel', pay: 380 },
    { from: 'bar', to: 'lookout', pay: 340 },
    { from: 'docks', to: 'market', pay: 430 },
  ];
  const route = routes[n % routes.length];
  const a = placeById(route.from);
  const b = placeById(route.to);
  const time = Math.round(distance(a.x, a.y, b.x, b.y) / 16);
  return {
    title: `Courier Run ${n + 1}`, giver: 'The City', place: route.from, pay: route.pay, courier: true,
    intro: [{ who: 'Dispatcher', text: `Package at ${a.name}, wanted at ${b.name}. The clock is the whole conversation.` }],
    stages: [
      { type: 'pickup', at: route.from, label: `Collect the package at ${a.name}` },
      { type: 'race', points: [[b.x, b.y]], time, label: `Deliver to ${b.name}` },
    ],
    outro: [{ who: 'Dispatcher', text: 'Received and signed. Another one is already waiting.' }],
  };
}

/** Advance the open dialogue by one line; closing it starts the stages. */
export function advanceDialogue(game) {
  const M = game.mission;
  if (!M.dialogue) return;
  M.dialogue.index += 1;
  game.events.sounds.push('ui');
  if (M.dialogue.index >= M.dialogue.lines.length) {
    const phase = M.dialogue.phase;
    M.dialogue = null;
    if (phase === 'intro') beginStage(game, 0);
    else finishMission(game);
  }
}

/** Set up a stage: spawn its package, car, van or gunmen, set its marker. */
function beginStage(game, index) {
  const M = game.mission;
  const run = M.active;
  run.stageIndex = index;
  run.checkpoint = 0;
  const stage = run.def.stages[index];
  if (!stage) return;
  const target = stage.at ? placeById(stage.at) : stage.near ? placeById(stage.near) : null;
  if (stage.type === 'pickup') {
    game.hasPackage = false;
    game.pickups.push({ x: target.x + 26, y: target.y + 18, kind: 'package' });
    run.markerX = target.x + 26;
    run.markerY = target.y + 18;
  } else if (stage.type === 'goto') {
    run.markerX = target.x;
    run.markerY = target.y;
  } else if (stage.type === 'steal') {
    const base = stage.nearPoint ? { x: stage.nearPoint[0], y: stage.nearPoint[1] } : { x: target.x + 60, y: target.y + 90 };
    const spot = roadSnap(base.x, base.y);
    const car = {
      id: 9000 + M.index * 10 + index, x: spot.x, y: spot.y, angle: Math.PI / 2, speed: 0, steer: 0,
      health: 100, paint: stage === run.def.stages[0] && run.def.title === 'High Value' ? 0 : 3,
      kind: 'parked', route: null, turnCooldown: 0, honk: 0, wrecked: false, sirenPhase: 0,
    };
    game.cars.push(car);
    run.targetCar = car;
    run.markerX = car.x;
    run.markerY = car.y;
  } else if (stage.type === 'kill') {
    for (const [gx, gy] of stage.points) spawnGunman(game, gx, gy);
    run.markerX = stage.points[0][0];
    run.markerY = stage.points[0][1];
  } else if (stage.type === 'destroy') {
    const spot = roadSnap(target.x + 90, target.y + 60);
    const van = {
      id: 9500 + M.index, x: spot.x, y: spot.y, angle: -Math.PI / 2, speed: 0, steer: 0,
      health: 130, paint: 4, kind: 'parked', route: null, turnCooldown: 0, honk: 0, wrecked: false, sirenPhase: 0,
    };
    game.cars.push(van);
    run.targetVan = van;
    run.markerX = van.x;
    run.markerY = van.y;
  } else if (stage.type === 'escape') {
    if (stage.grantHeat) commitCrime(game, stage.grantHeat, game.player.x, game.player.y);
    run.markerX = game.player.x;
    run.markerY = game.player.y;
  } else if (stage.type === 'race') {
    run.timer = stage.time;
    const first = crossing(stage.points[0][0], stage.points[0][1]);
    run.markerX = first.x;
    run.markerY = first.y;
  } else if (stage.type === 'survive') {
    run.timer = stage.seconds;
    run.waveTimer = 0;
    run.markerX = target.x;
    run.markerY = target.y;
  }
}

/** Close the current stage and move on, or roll the outro dialogue. */
function completeStage(game) {
  const M = game.mission;
  const run = M.active;
  game.events.sounds.push('pickup');
  if (run.stageIndex + 1 >= run.def.stages.length) {
    M.dialogue = { lines: run.def.outro, index: 0, phase: 'outro' };
  } else {
    beginStage(game, run.stageIndex + 1);
  }
}

/** Pay out, celebrate, and free the runner for the next job. */
function finishMission(game) {
  const M = game.mission;
  const run = M.active;
  game.player.money += run.def.pay;
  game.stats.cashEarned += run.def.pay;
  M.completed += 1;
  if (!run.def.courier) M.index += 1;
  spawnText(game.fx, game.player.x, game.player.y - 46, `${run.def.title.toUpperCase()} — $${run.def.pay}`, '#9dff57');
  spawnConfetti(game.fx, game.player.x, game.player.y);
  game.events.sounds.push('cash');
  game.events.sounds.push('mission');
  M.active = null;
  if (!run.def.courier && M.index >= STORY.length && !game.storyComplete) {
    game.storyComplete = true;
    game.victoryPending = true;
  }
  game.saveRequested = true;
}

/** Fail the active mission (a race clock ran out): it can be retaken. */
function failMission(game, why) {
  const M = game.mission;
  spawnText(game.fx, game.player.x, game.player.y - 46, why, '#e5484d');
  game.events.sounds.push('wasted');
  M.active = null;
  M.dialogue = null;
  game.hasPackage = false;
  game.pickups = game.pickups.filter((p) => p.kind !== 'package');
}

/**
 * The stage machine's per-frame step. Only runs while a mission is active
 * and no dialogue is open; each stage type knows its own finish line.
 */
export function updateMissions(game, dt) {
  const M = game.mission;
  if (!M.active || M.dialogue) return;
  const run = M.active;
  const stage = run.def.stages[run.stageIndex];
  if (!stage) return;
  const player = game.player;
  const px = player.car ? player.car.x : player.x;
  const py = player.car ? player.car.y : player.y;

  switch (stage.type) {
    case 'pickup':
      if (game.hasPackage) completeStage(game);
      break;
    case 'goto':
      if (distance(px, py, run.markerX, run.markerY) < 52) {
        if (stage.needsPackage && !game.hasPackage) break;
        if (stage.needsPackage) game.hasPackage = false;
        // A stolen car delivered is a stolen car handed over.
        if (run.targetCar && player.car === run.targetCar) {
          run.targetCar.kind = 'parked';
          player.car = null;
          player.x = run.markerX + 30;
          player.y = run.markerY;
          run.targetCar = null;
        }
        completeStage(game);
      }
      break;
    case 'steal':
      run.markerX = run.targetCar.x;
      run.markerY = run.targetCar.y;
      if (player.car === run.targetCar) completeStage(game);
      break;
    case 'kill': {
      const alive = game.gunmen.some((g) => !g.down);
      const remaining = game.gunmen.filter((g) => !g.down);
      if (remaining.length > 0) {
        run.markerX = remaining[0].x;
        run.markerY = remaining[0].y;
      }
      if (!alive) completeStage(game);
      break;
    }
    case 'destroy':
      run.markerX = run.targetVan.x;
      run.markerY = run.targetVan.y;
      if (run.targetVan.wrecked || run.targetVan.health <= 0) completeStage(game);
      break;
    case 'escape':
      run.markerX = px;
      run.markerY = py;
      if (game.stars === 0 && game.heat < 4) completeStage(game);
      break;
    case 'race': {
      run.timer -= dt;
      if (run.timer <= 0) {
        failMission(game, 'OUT OF TIME — JOB FAILED');
        break;
      }
      const point = crossing(stage.points[run.checkpoint][0], stage.points[run.checkpoint][1]);
      run.markerX = point.x;
      run.markerY = point.y;
      if (distance(px, py, point.x, point.y) < 64) {
        run.checkpoint += 1;
        game.events.sounds.push('pickup');
        spawnText(game.fx, px, py - 34, `BEACON ${run.checkpoint}/${stage.points.length}`, '#6fd3e7');
        if (run.checkpoint >= stage.points.length) {
          game.hasPackage = false; // delivered, whichever job sent it
          completeStage(game);
        }
      }
      break;
    }
    case 'survive': {
      run.timer -= dt;
      run.waveTimer -= dt;
      const centre = placeById(stage.at);
      if (run.waveTimer <= 0 && game.gunmen.filter((g) => !g.down).length < 3) {
        run.waveTimer = 7;
        const angle = Math.random() * Math.PI * 2;
        spawnGunman(game, centre.x + Math.cos(angle) * 210, centre.y + Math.sin(angle) * 210);
      }
      if (distance(px, py, centre.x, centre.y) > 340) {
        spawnText(game.fx, px, py - 40, 'GET BACK TO THE YARD!', '#ffd166');
        run.timer += dt; // the clock only runs while Mari holds the yard
      }
      if (run.timer <= 0) completeStage(game);
      break;
    }
    default:
      break;
  }
}

/** Abandon the active mission (the run ended: wasted or busted). */
export function abortMission(game) {
  const M = game.mission;
  M.active = null;
  M.dialogue = null;
  game.hasPackage = false;
  game.pickups = game.pickups.filter((p) => p.kind !== 'package');
  game.gunmen = game.gunmen.filter((g) => g.down);
}

/** Progress summary for the HUD: which mission, which stage of how many. */
export function missionProgress(game) {
  const M = game.mission;
  if (!M.active) return null;
  return { title: M.active.def.title, stage: M.active.stageIndex + 1, stages: M.active.def.stages.length };
}
