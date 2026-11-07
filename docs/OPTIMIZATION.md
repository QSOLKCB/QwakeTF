# Optimization record

QwakeTF's performance work follows the method of [QSOLKCB/OPT](https://github.com/QSOLKCB/OPT):
state the contract, keep a deterministic reference, change only what preserves it, and measure with
repetitions before claiming anything. No OPT code is included. OPT is a catalog of patterns and rules.

## Contract

- **Simulation:** for a seeded match, every tick must produce bit-identical game state: positions, velocities,
  view angles, health, armour, weapons, stats, bot goals, projectiles, buildings, flags, items, doors, events.
  `tools/check-parity.mjs` hashes all of this every simulated second for a 90 s 8-vs-8 match on both maps.
  The pinned hashes were recorded from the unmodified game at commit `2f87e69`, which was checked separately.
- **Rendering:** the framebuffer must be byte-identical. `tools/browser-features.cjs` compares culling on and off
  over four views (CI). `tools/bench-render.cjs` compares the whole renderer with an older `src/`.
- **Not in scope:** approximation. No change trades accuracy for speed.

## Changes

| Area | OPT record | Change | Why it is exact |
|---|---|---|---|
| World collision (`world.js`) | OPT-REDUCE-001, OPT-INV-001 | `trace()` and `pointContents()` gather grid candidates into a reused array instead of driving a generator; the point test is inlined. | Same brushes, same order and the same arithmetic. |
| Entity traces (`game.js` `traceEnt`) | OPT-REDUCE-001 | Bounds-reject each player or building with scalars before allocating the boxes for the exact sweep. | Same expressions and comparisons; only rejected candidates skip allocation. |
| A* (`nav.js`) | OPT-INV-001, OPT-POOL-001 | Search state uses persistent typed arrays reset by a generation stamp. The heap uses parallel arrays. | Same expansion order, the same heap sift and tie rules, and the same costs. |
| Nav lookup (`nav.js`) | OPT-INV-001 | Numeric spatial-hash keys replace template strings. | Keys are unique for `|cell| < 4096` on each axis; the lists and iteration order are the same. |
| Dynamic lights (`renderer.js`) | OPT-INV-001 | Lights are packed once per frame and uploaded once per shader program, not once per draw call. | Uniform values persist per program, and the light list is fixed within a frame. |
| View-projection upload (`renderer.js`) | OPT-INV-001 | The model shader receives the VP matrix only when it changes. | Uniforms persist, and only `drawModel` writes that uniform. |
| Entity culling (`main.js`) | OPT-REDUCE-001 | Players, items, buildings, projectiles and gibs entirely outside the view frustum are skipped. | The bounding sphere is exact: the maximum vertex distance over every frame, plus a margin. An object outside every clip plane writes no pixels. Flags are never culled because drawing them emits particles. |
| Light probe (`lightmap.js`) | OPT-REDUCE-001 side-effect rule | A cell whose sample point is inside solid geometry is no longer cached. | The old cache stored whichever position asked first. With culling, that would make lighting depend on draw order. |
| Sprite, particle and beam buffers | VANILLAJS RTX evidence (below) | Retained, grow-only GPU buffers updated with `bufferSubData`, plus reused CPU scratch arrays. | Same vertex bytes and draw counts; draws read only the written prefix. |
| Fixed clock (`clock.js`) | (VANILLAJS `time`) | The tick loop gets bounded catch-up (16 steps) and an epsilon, so float drift cannot skip a tick. | `Game.step` is unchanged, so the parity gate covers it. |

## Measurements

Simulation, `node tools/bench-sim.mjs 5 <original src>`: Node 22.23, a cloud container, 5 alternating runs,
90 s simulated 8-vs-8 per run. Identical state hashes were required on every run.

| Map | Original (median) | Optimized (median) | Speedup | Nav graph build |
|---|---:|---:|---:|---|
| Two Forts | 2735 ms (2481–2999) | 1736 ms (1637–2114) | **1.58×** | 668 → 594 ms |
| Well | 3050 ms (2920–3218) | 2006 ms (1841–2120) | **1.52×** | 303 → 270 ms |

Per 60 Hz tick with 16 bots, the cost falls from about 0.51 ms to 0.32 ms of CPU on Two Forts (median ÷ 5400 ticks). Runs vary by roughly ±10%. Earlier single runs during development were noisier, which is why only
these medians are reported.

Rendering, `node tools/bench-render.cjs <original src>`: headless Chromium with **SwiftShader** (software GL),
1280×720, 16 players and 6 explosions. Each version ran in its own browser, in ABBA blocks of 7 measured trials ×
40 frames, timed inside the game's own `requestAnimationFrame` loop. The framebuffer had to be identical.

| Version | `render()` CPU, median | Frame interval, median |
|---|---:|---:|
| Original | 4.95 ms | 464 ms |
| Optimized | 3.16 ms (**1.57×** less) | 447 ms |

The frame interval is dominated by SwiftShader rasterization, so the CPU saving barely shows in it. A first version of
the harness rendered hundreds of frames in one synchronous call, with both pages in one browser. It reported a
spurious 200–600× gap, caused by hidden-tab GL deprioritization and command buffers that were never presented.
That harness was discarded. The present one keeps each version in its own browser and times frames inside
`requestAnimationFrame`.

SwiftShader timings include software rasterization and driver emulation. They say nothing about any particular GPU,
and no QwakeTF native-GPU measurement exists yet. As in the VANILLAJS hardware receipts, faster CPU code is not
evidence of a higher frame rate when the frame is vsync-bound.

## Evidence imported from VANILLAJS hardware runs

Artifact `vanillajs-rtx5060ti-adaptive-42310094400-1.zip` (SHA-256 `79d4a9cd7f1ca546b5d4bd12f0b264273b622da1dcafe70ae1e6aad998cedaef`;
all inner `SHA256SUMS` verified). The run was on an NVIDIA GeForce RTX 5060 Ti, driver 595.99.02, Chrome 156, with VANILLAJS at
`b39b0bd`. These are VANILLAJS workloads, not QwakeTF measurements. They guided two decisions:

- **Retained vs forced-fresh GPU buffers:** the median was 3.7 ms vs 17.5 ms CPU+driver for 32 frames, with identical
  pixels. This is why the per-frame dynamic buffers above are now retained. QwakeTF's own gain on a native GPU is unmeasured.
- **Adaptive grid broad phase:** brute force was as fast as a grid at 14–26 items. The grid won only from 58 items
  (1.1 vs 0.3 ms). QwakeTF's entity traces test at most about 20 players and buildings, so no entity grid was added.

The full-path section of the same run showed CPU kernel speedups (68.4→13.2 ms and 72.1→2.1 ms) with an unchanged
16.8 ms frame interval p95. This is why the numbers here are reported as CPU time, not FPS.

## CI: browser dependency reuse (OPT-INV-001, OPT-LEAN-001 pattern)

**Invariant.** The Playwright npm package and its Chromium build are a pure function of the runner image
(`ubuntu-24.04`), CPU architecture, Node major version (22) and the pinned Playwright version (`1.56.1`).
Every one of those inputs is part of the cache key
`qwaketf-browser-v1-ubuntu-24.04-<arch>-node22-playwright-<version>`. Changing any of them, or bumping `v1`,
forces the ordinary install path.

**Reuse rule.**
- *Restore:* `actions/cache/restore` restores `~/.cache/qwaketf-browser` and `~/.cache/ms-playwright` under that exact key.
  No prefix fallback is used, so a near-miss never restores.
- *Ordinary path:* on a miss, `npm install` runs as before.
- *Every run:* `playwright install --with-deps chromium` always runs. It installs the uncacheable system packages,
  and re-downloads the browser if its install marker is missing.
- *Verify, fail closed:* `npm ls` must report a consistent `playwright@<pin>` tree, the loaded package version must
  equal the pin, and the Chromium executable must exist and be executable.
- *Save:* happens only after a fresh install passes that verification.
- *End-to-end gate:* the two browser suites still launch the browser and play matches.

**Trust boundary.** The cache is written only by this workflow, and GitHub scopes caches to the repository and branch
(a pull request can read caches from its base branch). A hit proves the files match a previous verified install of
the same pin. It does not prove a fresh download would produce identical bytes. A cold run is the only lane that
re-proves installation from the registry: change the key, or run on a branch without a cache.

**Baseline (no cache), duration of "Install browser test dependencies":**

| Run | Duration |
|---|---:|
| [40431914866](https://github.com/QSOLKCB/QwakeTF/actions/runs/40431914866) (PR #3) | 23 s |
| [40432886585](https://github.com/QSOLKCB/QwakeTF/actions/runs/40432886585) (main) | 21 s |
| [42315339960](https://github.com/QSOLKCB/QwakeTF/actions/runs/42315339960) (PR #4, `e03fc95`) | 398 s |

The step is dominated by network variance. The first run of this change populates the cache (a miss).
Timings for a hit will be added once a later run on this branch, or on `main`, restores it. The apt part of
`--with-deps` still runs on every hit, so a hit does not remove all of the step's network time.

## Rejected candidates

- **A* result cache (OPT-INV-001 / OPT-CACHE-001).** In the parity match, only 42 of 432 (2fort) and 63 of 421 (Well)
  path queries repeated a previous `(from, to, team)` key. That reuse is too low to justify a cache, its invalidation
  rules for team doors, and its memory.
- **Entity spatial grid:** see the RTX evidence above.
- **Approximate lighting or bot perception (OPT-APPROX-001):** this would break the exact contract and was not attempted.
