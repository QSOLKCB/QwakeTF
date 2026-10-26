# Asset licensing review: FortressOne and its listed sources

Reviewed October 2026 from the FortressOne GitHub repositories: `fteqw-code`, `server-qwprogs` and `fte-config`, which holds the game data.
fortressone.org was not reachable from the build environment. This is a practical reading of the license files, not legal advice.

## Safe to reuse (used in QwakeTF)

| Source | License | Notes |
|---|---|---|
| **LibreQuake** | BSD-3-Clause for models, textures, sounds and graphics. GPL-2 for its QuakeC, progs.dat and pop.lmp. | Every asset in QwakeTF comes from here. Keep the copyright notice: see `assets/licenses/librequake/`. |

## Reusable with conditions (not used in QwakeTF)

| Source | License | Conditions |
|---|---|---|
| **FTE QuakeWorld engine** (`FortressOne/fteqw-code`) | GPL-2.0 | A web build of FTE is possible. Your combined work must then be GPL-2 and ship its source. |
| **OpenQuartz** (`fte-config/FortressOne/openquartz`) | GPL-2.0, with per-file notes in `openquartz/licences/` | Derivatives must be GPL. Old forum threads question the provenance of some OpenQuartz sounds. Check each file's note before use. |
| **Quake Revitalisation Project (QRP) textures** | Attribution license (QuakeOne / QRP FAQ) | Commercial and non-commercial use is allowed if you credit "Quake Revitalization Project" and its URL in credits or a readme. Many people consider it GPL-incompatible because of that clause. |
| **Quake engine code (id Software)** | GPL-2.0 | Code only. The original Quake game data is **not** free. |

## Not free to redistribute

| Source | Why |
|---|---|
| **Quake 1.06 shareware data** (`id1/pak0.pak`, which FortressOne's build script downloads) | id Software shareware license: you may only redistribute it as the unmodified shareware package. Extracting it into another game is not allowed. |
| **Team Fortress 2.8 data** (`tf28/FORTRESS/PAK0.PAK`, also downloaded at build time) | Freeware with no open license. Copyright is held by the TF authors, now Valve. |
| **FortressOne `fortress/` folder** (skins, `progs/*.mdl` such as tf_flag, disp, turret, v_srifle, the 2fort5r map, textures, sounds) | `fte-config` has no license file for this folder. The content is a mix of TF 2.8 originals and community remakes. |
| **FortressOne qwprogs** (`server-qwprogs`, game logic) | The repository has no license file. It derives from Classic Fortress and TF 2.9 QuakeC, whose license was never clearly open. |
| **DOX's Coolcrap, Plague's pak, Ruohis, OriOn's debugged models, PrimeviL, bps, Twi-** | Community packs released under informal "use with credit" terms, with no written license. Ask the authors before redistributing them. |
| **zQuake, FuhQuake, ezQuake, ozTF, hueTF, Quake Live, TFC, Fortress Forever, TF2** | These are listed by FortressOne as inspiration only. The open-source clients (ezQuake etc.) are GPL code. The commercial games' assets are proprietary. |

## What this means for QwakeTF

QwakeTF only ships LibreQuake assets plus code written for this project, so the package can be shared freely.
The LibreQuake notice must stay in `assets/licenses/librequake/`.
To get closer to the FortressOne look, the cleanest path is to add **QRP textures** with credit.
OpenQuartz and FTE are also options if you accept GPL-2 for the whole project.
Avoid the `fortress/` skins and models and the TF 2.8 and Quake shareware paks.
