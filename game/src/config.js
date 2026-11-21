// Neon Tide: Coral Bay — shared tuning, palette and district definitions.
//
// Every module imports from here so the world has one source of truth: the
// size of Coral Bay, the road grid the traffic drives on, how fast heat
// builds and fades, and the colours each of the nine districts wears after
// dark. Nothing in this file touches the DOM, so the headless smoke harness
// can load the whole game under Node.

/** The fixed simulation step, in seconds: the world always advances in 1/60 slices. */
export const STEP = 1 / 60;

/** World size in pixels. Coral Bay is a 4,800 by 3,600 slab of coast. */
export const WORLD = { width: 4800, height: 3600 };

/**
 * The road grid. Avenues run north-south, streets east-west, each centred on
 * a multiple of GRID.pitch with the first line GRID.origin pixels in. Roads
 * are GRID.road wide; the blocks between them hold the buildings.
 */
export const GRID = { origin: 320, pitch: 400, road: 104, lane: 26 };

/** The bay eats the east edge of the map; shoreX(y) in city.js follows this. */
export const BAY = { base: 4420, wave: 90, waveLength: 1150 };

/** Player tuning: on foot and behind the wheel. */
export const PLAYER = {
  radius: 13,
  walkSpeed: 168,
  runSpeed: 252,
  health: 100,
  startMoney: 120,
  start: { x: 1052, y: 1908 },
};

/** Car tuning shared by traffic, police and whatever the player steals. */
export const CAR = {
  length: 46,
  width: 22,
  accel: 340,
  brake: 520,
  reverse: 150,
  drag: 0.62,
  grip: 7.5,
  health: 100,
};

/** Traffic: how many civilian cars the city keeps alive and how they behave. */
export const TRAFFIC = { count: 26, speed: 148, cautiousSpeed: 84, gap: 74 };

/** Pedestrians: how many walkers the sidewalks keep and how fast they stroll. */
export const PEDS = { count: 34, speed: 52, fleeSpeed: 128 };

/**
 * The wanted system. Heat is a 0..500 pool: crimes witnessed by a pedestrian
 * or an officer pour into it, time out of sight drains it, and each star
 * threshold is a rung of police response. A respray costs RESPRAY_COST and
 * empties the pool; the bust meter fills while an officer is close and the
 * player is slow, and empties the run when it tops out.
 */
export const HEAT = {
  max: 500,
  starAt: [1, 90, 190, 300, 410],
  decayPerSecond: 3.2,
  decayHiddenPerSecond: 9,
  crimeShot: 26,
  crimeHit: 42,
  crimeTheft: 30,
  crimeCrash: 12,
  crimeKill: 85,
  witnessRadius: 300,
  bustRadius: 64,
  bustFillPerSecond: 0.55,
  bustDrainPerSecond: 0.8,
  resprayCost: 200,
};

/** Police response per star: how many units hunt and how hard they drive. */
export const POLICE = {
  unitsPerStar: [0, 2, 3, 4, 6, 8],
  speed: [0, 265, 285, 305, 330, 355],
  ramDamage: 9,
  spawnDistance: 760,
};

/** Combat: the player's pistol and the gunmen's answering fire. */
export const GUN = {
  playerDamage: 34,
  playerRange: 460,
  playerCooldown: 0.21,
  gunmanDamage: 9,
  gunmanRange: 380,
  gunmanHealth: 68,
  bulletSpeed: 880,
};

/** A full day in Coral Bay takes this many real seconds; dusk sits at 0.78. */
export const DAY = { secondsPerDay: 420, startHour: 15.5 };

/** Weather fronts: clear spells and rain spells alternate inside these ranges. */
export const WEATHER = { clearMin: 55, clearMax: 130, rainMin: 26, rainMax: 60 };

/**
 * The nine districts, west to east, north to south. Each paints its ground,
 * trims its buildings and lends its name to the HUD when the player crosses
 * into it. `wealth` steers building height and neon density in city.js.
 */
export const DISTRICTS = [
  { name: 'Palm Heights', col: 0, row: 0, ground: '#3d4a3a', trim: '#8fd0a0', wealth: 0.9 },
  { name: 'Mercado Viejo', col: 1, row: 0, ground: '#4a4234', trim: '#e8b34b', wealth: 0.45 },
  { name: 'Marina Azul', col: 2, row: 0, ground: '#37474f', trim: '#6fd3e7', wealth: 0.75 },
  { name: 'The Flats', col: 0, row: 1, ground: '#41413c', trim: '#b8b0a0', wealth: 0.3 },
  { name: 'Neon Mile', col: 1, row: 1, ground: '#3a3f52', trim: '#ff5da2', wealth: 1 },
  { name: 'Harbourview', col: 2, row: 1, ground: '#3c4650', trim: '#7fb2ff', wealth: 0.6 },
  { name: 'Solana Yards', col: 0, row: 2, ground: '#474034', trim: '#d98e4a', wealth: 0.25 },
  { name: 'Calle Sol', col: 1, row: 2, ground: '#4c3a3a', trim: '#ff8a5c', wealth: 0.5 },
  { name: 'Coral Docks', col: 2, row: 2, ground: '#39434a', trim: '#5ce1c6', wealth: 0.4 },
];

/** Building paint by height tier, day face and the neon signs they carry. */
export const BUILDING = {
  faces: ['#5a6270', '#6b5a4e', '#54606e', '#63586a', '#4e6258', '#706452'],
  roofs: ['#3c4149', '#453b33', '#39424c', '#423a49', '#35443d', '#4c443a'],
  neon: ['#ff5da2', '#6fd3e7', '#ffd166', '#9dff57', '#c792ff', '#ff8a5c'],
  windowLit: '#ffd98a',
  windowDark: '#2b3038',
};

/** Civilian car paint; police and the player's starter car override it. */
export const CAR_PAINT = ['#c94f4f', '#4f7dc9', '#e0a83c', '#5cae6e', '#b8bcc4', '#7a5fc0', '#3fb6b2', '#d96ba0'];

/** The four screenshot scenes shots.json names, in cover-first order. */
export const SHOT_SCENES = ['chase', 'drive', 'foot', 'title'];
