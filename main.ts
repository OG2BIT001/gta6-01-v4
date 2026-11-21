// Neon Tide: Coral Bay — the hand-in program for make.fun bounty gta6-01.
//
// The game itself is the static site under game/: plain files a desktop
// browser loads offline, no build step, no library, no network. This
// program is the courier, not the cargo — it checks the entry against the
// scorer's published caps, copies game/ and screenshots/ into the output
// directory, and writes dossier.json there with buildDossier from the
// vendored make.fun library, which is the summary the judge reads.
//
// Run it the way the grader does (MAKEFUN_OUTPUT_DIR stands in for /output
// outside the grader's container):
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Play the game locally with:  node serve.ts   (then open localhost:8080)

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The caps the scorer enforces (kit RULES.txt, "Before you submit"). The
// hand-in refuses early, with a plain message, anything the scorer would
// refuse late: too many game files, an oversized screenshot, a fat dossier.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};
const DOSSIER_MAX_BYTES = 1572864;

function fail(message: string): never {
  console.error(`main.ts: ${message}`);
  process.exit(1);
}

/** Every file under a directory, as paths relative to it. */
function listFiles(root: string, prefix = ''): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(join(root, prefix), { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) found.push(...listFiles(root, rel));
    else if (entry.isFile()) found.push(rel);
  }
  return found;
}

// --- Sanity checks, mine: the entry should be whole before it travels. ---
const gameDir = join(here, 'game');
if (!existsSync(join(gameDir, 'index.html'))) fail('game/index.html is missing — the game has no front door');
const gameFiles = listFiles(gameDir);
if (gameFiles.length > CAPS.game_max_files) fail(`game/ holds ${gameFiles.length} files, over the ${CAPS.game_max_files} cap`);
let gameBytes = 0;
for (const rel of gameFiles) {
  if (Buffer.byteLength(rel) > CAPS.game_path_max_bytes) fail(`game/${rel} has a path over ${CAPS.game_path_max_bytes} bytes`);
  gameBytes += statSync(join(gameDir, rel)).size;
}
if (gameBytes > CAPS.game_max_bytes) fail(`game/ weighs ${gameBytes} bytes, over the ${CAPS.game_max_bytes} cap`);

const shotsDir = join(here, 'screenshots');
const shots = existsSync(shotsDir) ? listFiles(shotsDir).filter((name) => /\.(png|jpe?g)$/i.test(name)).sort() : [];
if (shots.length < 3 || shots.length > CAPS.screenshots.max) fail(`screenshots/ holds ${shots.length} images; the bounty wants 3 or 4`);
for (const name of shots) {
  const size = statSync(join(shotsDir, name)).size;
  if (size > CAPS.screenshots.max_bytes) fail(`screenshots/${name} is ${size} bytes, over the ${CAPS.screenshots.max_bytes} cap`);
}
// shots.json is the capture list the scenes were staged from: every name it
// promises must be on disk, or the dossier would ship a scene nobody took.
const captureList = JSON.parse(readFileSync(join(here, 'shots.json'), 'utf8')) as { name: string }[];
for (const entry of captureList) {
  if (!shots.includes(entry.name)) fail(`shots.json names ${entry.name}, which is not in screenshots/`);
}

// --- The hand-in itself: copy, then summarise for the judge. ---
mkdirSync(outDir, { recursive: true });
cpSync(gameDir, join(outDir, 'game'), { recursive: true });
cpSync(shotsDir, join(outDir, 'screenshots'), { recursive: true });
const dossier = buildDossier(outDir, CAPS);
if (Buffer.byteLength(dossier) > DOSSIER_MAX_BYTES) fail(`dossier.json would be over ${DOSSIER_MAX_BYTES} bytes`);
writeFileSync(join(outDir, 'dossier.json'), dossier);

console.log(`Neon Tide: Coral Bay handed in — ${gameFiles.length} game files (${gameBytes} bytes), ${shots.length} screenshots, dossier ${Buffer.byteLength(dossier)} bytes.`);
