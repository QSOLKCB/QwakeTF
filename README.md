# QwakeTF

A browser-based, single-player tribute to **QuakeWorld Team Fortress** and **FortressOne**, with AI bots.
Everything (engine, maps, physics, bot AI) is original JavaScript + WebGL 2. All art and sound come from
**LibreQuake** (BSD-3-Clause), so the whole package can be shared freely.

## Play it

**Play online:** [QwakeTF on GitHub Pages](https://qsolkcb.github.io/QwakeTF/).

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
- **Map: Well.** Select it in Single Player. An original tribute to Quake TF's `well6`, with two
  industrial forts, a central dividing wall, tower-top flags, capture pads at the foot of each tower,
  sniper balconies and water infiltration routes. Ramps connect the tower and balcony; water passages
  are open from match start. This is a new layout inspired by Well, not an exact port of its BSP,
  lifts or detpack-operated grates. It uses the same bundled LibreQuake assets as Two Forts.
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
- **Controller support:** any standard-layout gamepad (Xbox, PlayStation, most others in Chrome, Edge and Firefox) plays
  alongside mouse and keyboard, with analog movement, adjustable look sensitivity, deadzone and inversion. See the table below.
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

### Controller

| Button (standard layout) | Action |
|---|---|
| Left stick / right stick | Move (analog) / aim |
| RT / LT | Fire (hold to charge sniper rifle) / sniper zoom |
| A / B | Jump, swim up, respawn / swim down |
| RB / LB | Primary / secondary grenade (hold to prime) |
| X | Detonate pipebombs (Demoman), build sentry (Engineer) |
| L3 (press left stick) | Build dispenser (Engineer) |
| Y, D-pad right / D-pad left | Next / previous weapon |
| R3 (press right stick) | Last weapon |
| D-pad up / down | Disguise / feign death (Spy) |
| Back (View) / Start (Menu) | Scoreboard / pause and resume |

On the main or Single Player menu, **Start** begins a match with your last Single Player settings. After a controller
connects, and whenever the game pauses or loses focus, release all buttons and sticks once to activate it, so a button
held while a menu closes does not fire. Unplugging the controller mid-match, or hiding the browser tab, pauses the game.
Look sensitivity, stick deadzone and inversion are in **Settings**, or use the console: `joy_sensitivity`, `joy_deadzone`,
`joy_invert`, `joy_status`. `timescale 0.5` slows the match for practising rocket jumps (single player only).

## Project layout

```
index.html, style.css      page shell and menus styling
src/main.js                app: loading, input, camera, entity rendering
src/input.js               standard-mapping gamepad sampling (adapted from VANILLAJS)
src/clock.js               fixed 60 Hz simulation clock with bounded catch-up (adapted from VANILLAJS)
src/game.js                game rules: players, damage, flags, items, doors, buildings
src/weapons.js             weapons, projectiles and grenades
src/bots.js                bot AI
src/nav.js                 automatic navigation graph and A* pathfinding
src/pmove.js               QuakeWorld-style player physics
src/world.js               convex-brush world and collision traces
src/maps.js                map selection registry
src/map_2fort.js           the Two Forts map
src/map_well.js            the Well-inspired map
src/map_builder.js         shared mirrored brush helpers
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

## GitHub Pages

The `Game checks` workflow deploys `main` to GitHub Pages after the launcher, asset-integrity and Chromium checks pass. Pull requests run the checks without deploying.

Repository **Settings → Pages → Source** must be **GitHub Actions**. To redeploy manually, open **Actions → Game checks → Run workflow** and select `main`. The deployment includes the modular game, assets, standalone build and licence notices. No package installation or server is required for players.

## Gameplay checks

Run `node tools/check-gameplay.mjs` for water-entry/exit routes in both directions, Scout and Spy
movement, spawn clearance, navigation to flags/capture pads, repeated matches, automatic round resets,
drowning/respawn state, and explosive movement. Normal drowning still applies after prolonged full
submersion; use Space to swim up for air. Water entrances do not damage enemies or restrict classes.

New matches remove the previous match's door colliders, so returning to the menu and starting again
does not leave an invisible closed door in the spawn room. Map changes also release old world and door
rendering resources. The standalone build includes both maps and the same fixes as HTTP play.

## Performance and determinism checks

`node tools/check-parity.mjs` runs a seeded 8-vs-8 bot match for 90 simulated seconds on each map and hashes the
complete game state every second. The hashes are pinned to the pre-optimization game, so performance work must
reproduce gameplay **exactly**. Update the pinned values (`--print`) only for an intentional gameplay change.

`node tools/bench-sim.mjs 5 <dir>` times the same match against an older `src/` (for example
`git archive <rev> src | tar -x -C <dir>`), alternating runs and requiring identical hashes.
`node tools/bench-render.cjs <dir>` does the same for rendering in Chromium, requiring an identical framebuffer.
See [docs/OPTIMIZATION.md](docs/OPTIMIZATION.md) for what was optimized, the measurements and their limits.

## Startup checks

Run `node tools/check-launcher.cjs` to check disk/HTTP launching and verify every embedded asset against `assets/`.
GitHub Actions also tests both maps, red-bot spawn exits, restarts and map switching in Chromium using both disk and HTTP URLs.

## Credits and licensing

The gamepad sampler (`src/input.js`) and fixed-step clock (`src/clock.js`) are adapted from
[QSOLKCB/VANILLAJS](https://github.com/QSOLKCB/VANILLAJS) (Apache-2.0). Performance changes follow the
contract-and-evidence method of [QSOLKCB/OPT](https://github.com/QSOLKCB/OPT) (Apache-2.0); no OPT code is included.

See `ASSET_LICENSES.md` for the review of FortressOne's asset sources and which ones can be reused.
LibreQuake license and credits are in `assets/licenses/librequake/`.
Well's design reference is Jim Kaufman's (Sgt.Thundercok) [original well6 readme](https://www.filefactory.org/tf/file/703).
No original Well geometry, BSP, textures or other game data have been imported.
QwakeTF is a fan project and is not affiliated with id Software, Valve or the FortressOne team.
