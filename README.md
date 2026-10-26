# QwakeTF

A browser-based, single-player tribute to **QuakeWorld Team Fortress** and **FortressOne**, with AI bots.
Everything (engine, map, physics, bot AI) is original JavaScript + WebGL 2. All art and sound come from
**LibreQuake** (BSD-3-Clause), so the whole package can be shared freely.

## Play it

**Easiest:** extract the complete ZIP and double-click `index.html` in Chrome, Edge or Firefox.
When opened from disk it automatically opens `dist/QwakeTF-standalone.html`, which embeds the game and assets.
You can also open that standalone file directly; no server or install is needed.
Keep the `dist/` folder beside `index.html` when using the automatic launcher.

**From source** (for hacking on the code): browsers block ES modules from `file://`, so serve the folder:

- Windows: double-click `start-server.bat`
- macOS / Linux: run `sh start-server.sh` (also works after extracting a ZIP)
- Or any static server, e.g. `python3 -m http.server 8000` / `npx serve`, then open http://localhost:8000

Requires a browser with WebGL 2 (any current desktop browser).

## What's in the game

- **Map: Two Forts.** An original 2fort-style layout with two mirrored bases. Each has a spawn room with a team-only
  door and resupply pads, a ramp room, battlements with a capture pad, a basement flag room, and a sewer.
  A water tunnel leads to the moat, which a bridge crosses.
- **All 9 classes:** Scout, Sniper, Soldier, Demoman, Medic, HWGuy, Pyro, Spy, Engineer, each with its TF weapons and both
  grenade types. Weapons include charged sniper shots with headshots and leg hits, remote pipebombs, the assault cannon spin-up,
  flamethrower and burning, medikit healing and infection, and the tranquilizer.
  Grenades: frag, concussion, nail, MIRV, napalm, EMP, caltrops, flash and gas.
- **Spy:** disguise (T) fools enemy bots, sentries and team doors. Feign death (V) and backstabs are also in.
- **Engineer:** sentry gun (levels 1 to 3, rockets at level 3) and dispenser. Spanner repairs, re-arms and upgrades.
  Engineers spawn with 130 cells, exactly one level-1 sentry. Resupply or ammo packs give you metal to upgrade.
- **QuakeWorld-style movement:** air control, step-up, swimming, rocket jumps, concussion jumps and fall damage.
- **AI bots:** they pick team-balanced classes and split into offence and defence roles.
  They capture, escort and chase flag carriers, and they return dropped flags.
  Engineers build, repair and upgrade. Medics heal, snipers hold sniper spots, and demomen lay pipe traps.
  Spies disguise. Bots lead their projectile aim, throw grenades and strafe in fights.
  A navigation graph is generated automatically from the map geometry when the game loads.
- Quake-style FOV: the default is 90, measured on a 4:3 view, so a 16:9 screen shows about 106° horizontally. Change it in Settings or with `fov` in the console.
- Baked lightmaps with sun, sky and point lights, plus dynamic lights, particles, explosions, gibs, 3D positional audio and a HUD.
  The scoreboard, kill feed, capture limit and time limit are configurable.

## Controls

| Key | Action |
|---|---|
| W A S D / Mouse | Move / aim |
| Left click | Fire (hold to charge the sniper rifle) |
| Right click | Sniper zoom |
| Space | Jump, swim up, respawn |
| C | Swim down |
| 1–4, mouse wheel, Q | Select weapon, previous weapon |
| G / F | Primary / secondary grenade (hold to prime, release to throw; it explodes in hand after 3.8 s) |
| E (or middle click) | Detonate pipebombs (Demoman), build a sentry (Engineer) |
| R | Build a dispenser (Engineer) |
| T / V | Disguise / feign death (Spy) |
| K | Suicide (respawn, e.g. after changing class) |
| M / N | Change class / team |
| Tab | Scoreboard |
| F1 or H | In-game help |
| Esc | Pause menu |
| ~ (backquote) | Console: `fov 90`, `sensitivity 4`, `addbot red hwguy`, `removebot`, `botskill 0.8`, `kill`, `class medic`, `help` |

## Project layout

```
index.html, style.css      page shell and menus styling
src/main.js                app: loading, input, camera, entity rendering
src/game.js                game rules: players, damage, flags, items, doors, buildings
src/weapons.js             weapons, projectiles and grenades
src/bots.js                bot AI
src/nav.js                 automatic navigation graph and A* pathfinding
src/pmove.js               QuakeWorld-style player physics
src/world.js               convex-brush world and collision traces
src/map_2fort.js           the Two Forts map (brushes, lights, spawns, flags, bot spots)
src/lightmap.js            lightmap baker
src/renderer.js            WebGL 2 renderer
src/formats.js, assets.js  Quake .mdl/.spr/palette loaders, asset loading
src/hud.js, ui.js          HUD and menus
assets/                    LibreQuake models, sounds, textures and palette (BSD-3)
tools/                     headless bot simulation and build scripts (Node 18+)
dist/                      single-file standalone build
```

Headless bot match, which is useful for tuning the AI: `node tools/sim.mjs 300 6` (seconds, bots per team).
Rebuild the standalone file after code changes:
```
npx esbuild src/main.js --bundle --format=iife --minify --outfile=dist/bundle.js
node tools/build-standalone.mjs
```

## Startup checks

Run `node tools/check-launcher.cjs` to check disk/HTTP launching and verify every embedded asset against `assets/`.
GitHub Actions also tests the main menu and a running match in Chromium using both disk and HTTP URLs.

## Credits and licensing

See `ASSET_LICENSES.md` for the review of FortressOne's asset sources and which ones can be reused.
LibreQuake license and credits are in `assets/licenses/librequake/`.
QwakeTF is a fan project and is not affiliated with id Software, Valve or the FortressOne team.
