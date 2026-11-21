[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/OG2BIT001/gta6-01-v4/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/OG2BIT001/gta6-01-v4/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Neon Tide: Coral Bay

An original top-down open-world crime game in the spirit of GTA 6, built
from scratch with vanilla JavaScript and Canvas — no libraries, no engine,
no network. You are Mari, a driver in Coral Bay: nine districts of seeded
city wrapped around a bay, with traffic that lanes and queues, pedestrians
who stroll and panic, cars worth stealing, a five-star wanted system with
police who pursue, ram and bust, gun combat, a nine-mission story with
dialogue, and endless courier work once the story is yours.

Everything is generated or synthesised: the city is dealt from a seed, and
every sound — engine, sirens, rain, the pad score, gunfire — is WebAudio.
Nothing is borrowed from any commercial game: the city, characters,
vehicles, names, story, art and music are this entry's own.

## Play it

```
node serve.ts          # serves game/ at http://localhost:8080
```

Open the page, pick NEW GAME, and follow the green **!** to Selene at
Club Azul.

| Input | Action |
| --- | --- |
| WASD / arrows | Walk and drive |
| Shift | Run |
| E | Enter/exit a car, talk, take a job, advance dialogue |
| Mouse + click, or F | Aim and shoot (on foot) |
| Space | Handbrake |
| P / Esc | Pause |
| M | Mute |

Heat fades while nobody is watching. A Shine Respray (pink on the
minimap, $200) clears it entirely — unless the law is close enough to
watch you roll in. The game saves itself to `localStorage` as you play.

## How it is put together

- `game/src/config.js` — world size, road grid, tuning, the nine districts.
- `game/src/city.js` — the seeded city: buildings, palms, lamps, lots, piers, named places.
- `game/src/entities.js` — the player, traffic AI, police, pedestrians, gunmen, bullets and the wanted system.
- `game/src/missions.js` — the nine-mission story and courier jobs, run by one stage machine.
- `game/src/render.js` — the canvas renderer, HUD, live minimap and screens.
- `game/src/audio.js` — every sound, synthesised with WebAudio.
- `game/src/fx.js` — particles, floating text, screen shake and the weather fronts.
- `game/src/main.js` — state, input, the fixed-step loop, saves, and the `?shot=` screenshot staging.
- `main.ts` — the hand-in program: it checks the entry against the scorer's caps, copies `game/` and `screenshots/` to the output directory and writes `dossier.json` with the vendored make.fun library.

## Hand it in

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

Screenshots in `screenshots/` are staged by the game itself
(`game/?shot=chase&seed=7` and its siblings in `shots.json` set
`window.__shotReady` when the frame is ready); the shipped images are
rasterisations of those same staged scenes from the game's own generated
city data, as SESSION.md describes honestly.
