// "Two Forts" - an original 2fort-style capture-the-flag layout built from convex brushes.
// Blue base occupies negative X, red base is the mirror image. Mid is a moat with a bridge.
import { World, CONTENTS } from './world.js';
import { Builder, BLUE, RED, teamTex } from './map_builder.js';
export { BLUE, RED } from './map_builder.js';

export function buildMap() {
  const world = new World();
  const map = { name: 'Two Forts', world, spawns: [[], []], flags: [], caps: [], items: [], lights: [], doors: [], resupply: [], sky: 'sky5_blu', botSpots: [{}, {}] };
  map.sun = { dir: norm([0.25, -0.45, 0.86]), color: [1.0, 0.95, 0.85], intensity: 1.2 };
  map.skylight = { color: [0.6, 0.66, 0.82], intensity: 1.0 };
  map.ambient = [0.10, 0.10, 0.12];

  // ---------------- shared middle ----------------
  const M = new Builder(world, BLUE);
  const ROCK = { all: 'rock1_1' }, GRAVEL = 'gravel1', TREAD = 'treadplatemetal';
  M.box(-384, -800, -288, 384, 800, -256, GRAVEL, CONTENTS.SOLID, { texScale: 1 });            // moat floor
  M.box(-384, -800, -256, 384, 800, -160, 'star_water2', CONTENTS.WATER);                       // moat water
  M.box(-384, -96, -16, 384, 96, 0, { top: TREAD, side: 'met_gry_trim64', bottom: 'met_gry_flat' }); // bridge
  for (const px of [-192, 0, 192]) for (const py of [-80, 80]) M.box(px - 16, py - 16, -256, px + 16, py + 16, -16, 'met_gry_block'); // bridge pillars
  M.box(-1600, 800, -288, 1600, 832, 640, ROCK, CONTENTS.SOLID, { texScale: 2 });                 // north cliff
  M.box(-1600, -832, -288, 1600, -800, 640, ROCK, CONTENTS.SOLID, { texScale: 2 });               // south cliff
  M.box(-1600, -832, -288, -1536, 832, 640, ROCK, CONTENTS.SOLID, { texScale: 2 });               // west back wall
  M.box(1536, -832, -288, 1600, 832, 640, ROCK, CONTENTS.SOLID, { texScale: 2 });                 // east back wall
  M.box(-1600, -832, 640, 1600, 832, 672, 'sky5_blu', CONTENTS.SKY);                            // sky
  M.box(-1600, -832, -320, 1600, 832, -288, 'gravel1', CONTENTS.SOLID);                           // under-floor seal
  // a few floating lights under the bridge so the water is not pitch black
  for (const px of [-256, 0, 256]) map.lights.push({ origin: [px, 0, -40], radius: 300, color: [0.6, 0.7, 1.0], intensity: 0.8 });

  // ---------------- bases ----------------
  for (const team of [BLUE, RED]) {
    const B = new Builder(world, team);
    const WALL = 'met_blu_block', FLOOR = 'met_blu_tile', CEIL = 'met_gry_pan1', TRIM = 'met_blu_trim64', LIT = 'met_blu_lit3';
    const BWALL = 'met_blu_rect', BFLOOR = 'met_gry_sqr', CFLOOR = 'met_grate', SEWER = 'conc2_1', RUNE = 'met_blu_rune1', PAN = 'met_blu_pan1';
    const FL = { top: FLOOR, side: TRIM, bottom: CEIL };       // generic floor slab
    const BFL = { top: BFLOOR, side: BWALL, bottom: CEIL };
    const CL = { bottom: CEIL, side: TRIM, top: 'met_gry_flat' };

    // --- front wall (facing the moat) with front door + water tunnel ---
    B.wallX(-416, -384, -800, 800, -288, 192, { all: WALL }, [[-64, 0, 64, 128], [352, -256, 448, -150]]);
    B.box(-416, 352, -256, -384, 448, -160, 'star_water2', CONTENTS.WATER);                     // water in the tunnel
    B.box(-416, -800, 192, -384, 800, 232, { all: 'conc1_1' });                                    // parapet
    B.box(-384, -256, -16, -320, 256, 0, { top: TREAD, side: 'met_gry_trim64' });                  // apron outside the front door
    B.box(-384, 256, -16, -320, 800, 0, { top: 'conc1_1', side: 'conc1_2' });                      // ledge north
    B.box(-384, -800, -16, -320, -256, 0, { top: 'conc1_1', side: 'conc1_2' });                    // ledge south
    B.wallX(-320, -316, -800, 800, 0, 40, { all: 'met_gry_trim64' }, [[-256, 0, 256, 40]]);         // low railing on the ledges

    // --- battlements (z=192) ---
    B.slab(160, 192, -544, -384, -800, 800, { top: TREAD, side: TRIM, bottom: CEIL });
    B.wallX(-576, -544, -800, 288, 192, 352, { all: WALL });                                         // back wall (south part)
    B.box(-1536, -800, 352, -544, 800, 384, { all: 'met_gry_flat' });                                 // roof
    // cap pad
    B.box(-544, 480, 192, -416, 640, 194, { all: RUNE });
    map.caps.push({ team, mins: B.P([-544, 480, 192]).map((v, i) => i === 0 ? Math.min(v, B.X(-416)) : v), maxs: B.P([-416, 640, 300]).map((v, i) => i === 0 ? Math.max(v, B.X(-544)) : v) });
    B.item('ammo', -464, -400, 192); B.item('health25', -464, 0, 192);

    // --- front hall H: x[-800,-416] y[-256,256] z[0,160] ---
    B.slab(-32, 0, -800, -416, -256, 256, FL);
    B.slab(160, 192, -800, -544, -256, 256, CL);
    B.wallY(256, 288, -800, -416, -32, 192, { all: WALL }, [[-768, 0, -608, 128]]);                  // north wall, door to ramp room
    B.wallY(-288, -256, -800, -416, -32, 192, { all: WALL }, [[-704, 0, -576, 128]]);                // south wall, door to down-ramp
    B.wallX(-832, -800, -256, 256, -32, 192, { all: WALL }, [[-64, 0, 64, 128]]);                     // west wall, team door to spawn
    for (const sy of [-224, 224]) B.box(-640, sy - 32, 0, -576, sy + 32, 64, { all: 'crate', top: 'crate0_top' }); // crates
    B.light(-608, 128, 140, 420); B.light(-608, -128, 140, 420); B.light(-760, 0, 140, 300);
    B.fixture(-608, 128, 160, LIT); B.fixture(-608, -128, 160, LIT); B.fixture(-760, 0, 160, LIT);
    B.item('health25', -704, 200, 0); B.item('health25', -704, -200, 0); B.item('ammo', -480, 200, 0); B.item('ammo', -480, -200, 0);

    // --- spawn room P: x[-1056,-832] y[-192,192] ---
    B.slab(-32, 0, -1056, -832, -192, 192, { top: PAN, side: TRIM, bottom: CEIL });
    B.slab(160, 192, -1056, -832, -192, 192, CL);
    B.wallX(-1088, -1056, -224, 224, -32, 192, { all: WALL });
    B.wallY(192, 224, -1088, -800, -32, 192, { all: WALL });
    B.wallY(-224, -192, -1088, -800, -32, 192, { all: WALL });
    B.light(-944, 0, 140, 420, [0.9, 0.95, 1.0]); B.fixture(-944, 0, 160, LIT);
    // team door (mover) between P and H
    {
      const o = B.P([-816, 0, 64]);
      map.doors.push({ team, mins: [Math.min(B.X(-832), B.X(-800)), -64, 0], maxs: [Math.max(B.X(-832), B.X(-800)), 64, 128], tex: teamTex('met_blu_door1', team), lift: 124 });
    }
    // resupply pads
    for (const py of [-120, 120]) { B.box(-1000, py - 32, 0, -936, py + 32, 4, { top: py < 0 ? 'plus_0_hp25_top_fbr' : 'ammotop', side: 'hp15_side' }); map.resupply.push({ team, mins: [Math.min(B.X(-1000), B.X(-936)), py - 32, 0], maxs: [Math.max(B.X(-1000), B.X(-936)), py + 32, 64] }); }
    for (const sx of [-1030, -880]) for (const sy of [-150, -50, 50, 150]) B.spawn(sx, sy, 25, 0);

    // --- ramp room R: x[-1056,-576] y[288,768] z[0,352] ---
    B.slab(-32, 0, -1056, -576, 288, 768, FL);
    B.ramp(-704, 320, -576, 672, 0, 0, 192, '+y', { top: 'met_gry_sqr', side: TRIM });
    B.box(-704, 288, 0, -576, 320, 1, { all: 'met_gry_sqr' });                                        // tiny lip (visual)
    B.slab(160, 192, -1056, -576, 672, 768, { top: 'met_gry_sqr', side: TRIM, bottom: CEIL });          // upper landing
    B.wallY(256, 288, -1056, -800, -32, 352, { all: WALL });                                          // south wall west part
    B.wallY(256, 288, -800, -576, 192, 352, { all: WALL });                                           // south wall above hall wall
    B.wallY(256, 288, -576, -544, -32, 352, { all: WALL });                                           // corner filler
    B.wallX(-576, -544, 288, 800, -32, 352, { all: WALL }, [[672, 192, 768, 320]]);                   // east wall, door to battlements
    B.wallX(-1088, -1056, 288, 800, -32, 352, { all: WALL });
    B.wallY(768, 800, -1088, -544, -32, 352, { all: WALL });
    // railing on the landing edge
    B.box(-1056, 672, 192, -704, 676, 224, { all: 'met_gry_trim64' });
    B.light(-816, 480, 300, 520); B.light(-640, 400, 150, 300); B.light(-816, 720, 320, 400); B.light(-980, 330, 150, 300);
    B.fixture(-816, 480, 352, LIT); B.fixture(-816, 720, 352, LIT);
    B.item('health25', -992, 330, 0); B.item('ammo', -992, 720, 192); B.item('armor', -640, 720, 192);

    // --- down ramp shaft D: interior x[-704,-576] y[-768,-288], floor from 0 down to -192 ---
    B.slab(-32, 0, -704, -576, -320, -288, FL);
    B.ramp(-704, -704, -576, -320, -224, -192, 0, '+y', { top: 'met_gry_sqr', side: TRIM });
    B.slab(-224, -192, -704, -576, -768, -704, BFL);
    B.slab(160, 192, -704, -576, -768, -288, CL);
    B.wallX(-736, -704, -800, -288, -224, 192, { all: WALL }, [[-768, -192, -640, -64]]);             // west wall, door to C1
    B.wallX(-576, -544, -800, -288, -224, 192, { all: WALL });
    B.light(-640, -480, 130, 400); B.light(-640, -736, -90, 300); B.fixture(-640, -480, 160, LIT);
    B.item('ammo', -620, -740, -192);

    // --- corridor C1: x[-1088,-736] y[-768,-640] z[-192,-64] ---
    B.slab(-224, -192, -1088, -736, -768, -640, { top: CFLOOR, side: BWALL, bottom: CEIL });
    B.slab(-64, -32, -1088, -736, -768, -640, CL);
    B.wallY(-640, -608, -1088, -736, -224, -32, { all: BWALL });
    B.light(-912, -704, -80, 320, [1, 0.9, 0.8]); B.fixture(-912, -704, -64, LIT);

    // --- flag room F: x[-1472,-1120] y[-768,-288] z[-192,-32] ---
    B.slab(-224, -192, -1472, -1120, -768, -288, BFL);
    B.slab(-32, 0, -1472, -1120, -768, -288, CL);
    B.wallX(-1120, -1088, -800, -256, -224, 0, { all: BWALL }, [[-768, -192, -640, -64]]);            // east wall, door from C1
    B.wallY(-288, -256, -1504, -1088, -224, 0, { all: BWALL }, [[-1344, -192, -1216, -64]]);          // north wall, door from C3
    B.wallX(-1504, -1472, -800, -256, -224, 0, { all: BWALL });
    B.wallY(-800, -768, -1504, -544, -224, 0, { all: BWALL });                                         // south wall shared with D/C1
    B.box(-1424, -560, -192, -1360, -496, -184, { all: RUNE });                                         // flag stand
    map.flags.push({ team, origin: B.P([-1392, -528, -183]), yaw: B.yaw(0) });
    B.light(-1296, -528, -60, 420); B.light(-1420, -400, -60, 300, [1, 0.9, 0.8]); B.light(-1420, -660, -60, 300, [1, 0.9, 0.8]); B.light(-1160, -300, -60, 260);
    B.fixture(-1296, -528, -32, LIT); B.fixture(-1420, -400, -32, LIT); B.fixture(-1420, -660, -32, LIT);
    B.item('health25', -1200, -320, -192); B.item('armor', -1200, -740, -192); B.item('ammo', -1440, -320, -192);
    for (const [cx, cy] of [[-1300, -730], [-1448, -740]]) B.box(cx - 32, cy - 32, -192, cx + 32, cy + 32, -128, { all: 'crate', top: 'crate0_top' });

    // --- corridor C3: x[-1344,-1216] y[-256,352] (north-south) ---
    B.slab(-224, -192, -1344, -1216, -256, 352, { top: CFLOOR, side: BWALL, bottom: CEIL });
    B.slab(-64, -32, -1344, -1216, -256, 352, CL);
    B.wallX(-1376, -1344, -256, 352, -224, -32, { all: BWALL });
    B.wallX(-1216, -1184, -256, 352, -224, -32, { all: BWALL });
    B.light(-1280, 0, -80, 320); B.light(-1280, 256, -80, 320); B.light(-1280, -200, -80, 260); B.fixture(-1280, 0, -64, LIT); B.fixture(-1280, 256, -64, LIT);
    B.item('health25', -1280, 100, -192);

    // --- corridor C2: x[-1344,-832] y[352,480] (east-west), joins C3 at its west end ---
    B.slab(-224, -192, -1344, -832, 352, 480, { top: CFLOOR, side: BWALL, bottom: CEIL });
    B.slab(-64, -32, -1344, -832, 352, 480, CL);
    B.wallY(480, 512, -1376, -800, -224, -32, { all: BWALL });
    B.wallY(320, 352, -1216, -832, -224, -32, { all: BWALL });
    B.wallX(-1376, -1344, 352, 512, -224, -32, { all: BWALL });
    B.light(-1088, 416, -80, 360); B.light(-1300, 416, -80, 260); B.fixture(-1088, 416, -64, LIT);

    // --- sewer S: x[-800,-416] y[320,544], floor -256, water to -160, ceiling -32 ---
    B.slab(-288, -256, -800, -416, 320, 544, { all: SEWER });
    B.box(-800, 320, -256, -416, 544, -160, 'star_water2', CONTENTS.WATER);
    B.ramp(-800, 352, -544, 480, -288, -256, -192, '-x', { all: SEWER });
    B.slab(-32, 0, -576, -416, 320, 544, { all: SEWER });                                              // ceiling piece not covered by ramp room floor
    B.wallY(544, 576, -832, -416, -288, -32, { all: SEWER });
    B.wallY(288, 320, -832, -416, -288, -32, { all: SEWER });
    B.wallX(-832, -800, 288, 576, -288, -32, { all: SEWER }, [[352, -192, 480, -64]]);                 // west wall, door to C2
    B.light(-600, 432, -60, 380, [0.8, 0.9, 1.0]); B.light(-760, 416, -100, 260); B.light(-400, 400, -200, 220, [0.5, 0.7, 1.0], 0.8);
    B.fixture(-600, 432, -32, LIT);

    // spawn list + bot spots
    map.spawns[team] = B.ents.spawns;
    for (const it of B.ents.items) map.items.push(it);
    for (const l of B.ents.lights) map.lights.push(l);
    const P = (p) => B.P(p), Y = (y) => B.yaw(y);
    map.botSpots[team] = {
      snipe: [{ origin: P([-440, -500, 217]), yaw: Y(0) }, { origin: P([-440, 500, 217]), yaw: Y(0) }, { origin: P([-440, -150, 217]), yaw: Y(0) }],
      sentry: [{ origin: P([-1300, -560, -167]), yaw: Y(90) }, { origin: P([-1180, -400, -167]), yaw: Y(180) }, { origin: P([-600, 0, 25]), yaw: Y(0) }, { origin: P([-640, -740, -167]), yaw: Y(90) }],
      defend: [{ origin: P([-1250, -500, -167]) }, { origin: P([-1400, -700, -167]) }, { origin: P([-620, 0, 25]) }, { origin: P([-900, 480, 25]) }, { origin: P([-1280, 100, -167]) }, { origin: P([-640, -600, -100]) }, { origin: P([-470, 300, 217]) }],
      pipes: [{ origin: P([-1392, -528, -184]) }, { origin: P([-1100, -700, -192]) }, { origin: P([-1280, -240, -192]) }],
    };
  }
  world.finalize();
  return map;
}

function norm(v) { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; }
