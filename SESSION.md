# Build session log — gta6-01 "Make GTA 6", entry v4

Game: **Neon Tide: Coral Bay** — an original top-down open-world crime game
(own city, characters, vehicles, names, story, art and sound; nothing from
any commercial game). Built by **OG2BIT, a Muse Spark agent, for Mateo**,
in one recorded session, as a fresh build: every file below was written with
the session's own write/edit tools. Earlier entries' code was not read or
copied; the design was informed by the v2 session's prose notes only.

## Conventions learned from the kit

Read the kit's `competition.yaml`, `kit.json`, and the starter's `main.ts`,
`serve.ts`, `shots.json`, `game/index.html` and `game/src/shots.js` as text:
ES modules under `game/src/`, `?shot=<scene>&seed=N` staging with
`window.__shotReady`, a fixed 1/60 s step, and a `main.ts` that copies
`game/` + `screenshots/` to the output dir and writes `dossier.json` with
`buildDossier` from `vendor/makefun-game.ts`. Screenshot caps from
RULES.txt: 3–4 images, each ≤ 256 KiB, long side ≤ 1280, short side ≥ 480;
dossier ≤ 1.5 MiB. There is no local grade for this competition (the scorer
stays on the server), so verification is syntax checks, a headless play of
the game's own code, and a local `main.ts` run.

## Vendor file

`vendor/makefun-game.ts` was placed by the parent before the session and is
byte-identical to the kit's starter copy (sha256
`dc67187521b24025ff952f8c231485a6eb92d6d71d29edd2a08154ffb4376129`,
56,282 bytes — matches kit.json).

## What was built (all in this session)

- `game/src/config.js` (132) — world size, road grid, tuning, heat/police/
  combat numbers, the nine district definitions and palettes.
- `game/src/random.js` (57) — mulberry32 seeded RNG and geometry helpers.
- `game/src/city.js` (227) — the seeded city: avenues/streets grid, 134
  buildings (seed 7) with height tiers, lit-window seeds and neon, ~85
  palms, ~860 lamps, parking lots, three dock piers, a wobbling bay
  shoreline, and the 12 named places the story uses. Building density was
  tuned over three test passes (single/pair/quad footprints, lot rate,
  place clearance) from ~95 to 134 buildings.
- `game/src/entities.js` (687) — the player on foot and driving (arcade
  physics, handbrake, building crashes with a scrape cooldown added after
  testing), traffic AI that lanes/queues/turns and recycles toward the
  player, pedestrians who stroll and flee, police pursuit with ramming
  and a bust meter, the witnessed-crime heat system and its five stars,
  respray garages, strafing burst-fire gunmen, bullets and pickups.
- `game/src/missions.js` (488) — the nine-mission story (Selene's arc from
  a first errand to the Neon Tide finale) with intro/outro dialogue, run
  by one stage machine (goto / pickup / steal / kill / destroy / escape /
  race / survive), plus endless courier jobs after the finale.
- `game/src/render.js` (812) — the top-down renderer (district ground, bay,
  roads and crosswalks, buildings with seed-fixed lit windows and neon,
  lamp glow, headlight beams, police lightbars), day/night cycle with
  dawn/dusk tints, rain, the HUD (money, health, wanted stars, bust meter,
  mission banner, objective arrow, district toast), the live minimap with
  police blips, the dialogue box, and the title/pause/wasted/busted/
  victory screens.
- `game/src/audio.js` (245) — all-synthesised WebAudio: engine and siren
  loops, rain noise, a drifting pad score, and a dozen one-shots. No audio
  files; every call is a no-op without an AudioContext.
- `game/src/fx.js` (141) — pooled particles, floating text, screen shake
  and the weather fronts.
- `game/src/main.js` (471) — state, keyboard/mouse input, the fixed-step
  loop, the screen machine, localStorage saves, respawn rules, and the
  `?shot=` staging for the four screenshot scenes.
- `game/index.html` (19), `serve.ts` (59, a local static server),
  `shots.json` (the four capture scenes), `README.md`, `LICENSE`
  (MIT, with the literal SPDX line).
- `main.ts` (85) — the hand-in program, written for this entry: it refuses
  early anything the scorer would refuse late (game file count/bytes/path
  caps, screenshot count and sizes, a shots.json cross-check added after
  the first test run, dossier size), then copies and writes the dossier
  through the vendor library.
- `tools/smoke.mjs` (191) — a DOM-stub harness that plays the real game.
- `tools/dump_city.mjs` (22) and `tools/make_screenshots.py` (396) — the
  screenshot pipeline described below.

## Verification (everything run twice, same results)

- `node --check` passes on every game module and both Node tools.
- **SMOKE OK (30 checks)**, twice — the harness loads the real game under
  Node and plays it: title boot; the seed-7 city (134 buildings, palms,
  lamps, lots, 3 piers, deterministic rebuild); Mari walks; E enters a
  parked car, it rolls and covers ground, E exits; mission 1 end-to-end
  (Selene's dialogue, the Mercado package pickup, delivery, $400 payout,
  mission 2 unlocked, a save written); a spawned gunman is shot down
  (shots and hits counted); heat 330 → four stars and a police fleet, and
  cold heat clears them; death → wasted → respawn at full health; and all
  four `?shot=` scenes (chase, drive, foot, title) stage and set
  `window.__shotReady`.
- `MAKEFUN_OUTPUT_DIR=out node main.ts`, twice — clean both times, byte-
  identical dossier: **748,354 bytes** (cap 1,572,864), 10 game files
  (124,722 bytes), 4 screenshots. The first run correctly refused before
  the screenshots existed, which is the sanity check doing its job.

## Screenshots — how they were made

The four files in `screenshots/` are **PIL rasterisations, not browser
captures** (there is no browser on this machine). `tools/dump_city.mjs`
runs the game's own generator, and `tools/make_screenshots.py` draws that
exact seed-7 geometry — same buildings, windows, palms, lots and piers —
staging the same scenes `main.js` stages for `?shot=` (a four-star night
chase in Harbourview with the first errand's objective up, a dusk drive on
the Neon Mile, the Mercado conversation with its dialogue box, and the
title screen), with the HUD and minimap mirroring `render.js`. The cover
and title frames were inspected visually in-session; the lamp glow was
softened with a blur pass after the first inspection. All four are
1280×800 JPEGs of 106–123 KB, under the 256 KiB cap. No screenshot shows
anything the game does not contain.
