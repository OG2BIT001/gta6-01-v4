// Neon Tide: Coral Bay — dump the generated city as JSON.
//
// tools/make_screenshots.py rasterises the game's screenshot scenes with
// PIL (there is no browser on this machine), and it draws the real city,
// not an invention: this tool runs the game's own generator and prints
// everything the rasteriser needs — buildings, palms, lots, piers and the
// named places — for the seed the shipped screenshots use.
//
//   node tools/dump_city.mjs [seed]

import { PLACES, buildCity } from '../game/src/city.js';

const seed = Number(process.argv[2]) || 7;
const city = buildCity(seed);
process.stdout.write(JSON.stringify({
  seed,
  buildings: city.buildings,
  palms: city.palms,
  lots: city.lots,
  piers: city.piers,
  places: PLACES,
}));
