// Original brush-built tribute to Quake TF's Well: tower flags, ground captures,
// a divided courtyard and a permanent water infiltration route. No BSP data imported.
import { World, CONTENTS } from './world.js';
import { Builder, BLUE, RED, teamTex } from './map_builder.js';

export function buildMap() {
  const world = new World();
  const map = { name: 'Well', world, spawns: [[], []], flags: [], caps: [], items: [], lights: [], doors: [], resupply: [], sky: 'sky5_blu', botSpots: [{}, {}] };
  map.sun = { dir: [0.24, -0.48, 0.844], color: [1, 0.95, 0.85], intensity: 1.2 };
  map.skylight = { color: [0.6, 0.66, 0.82], intensity: 1 };
  map.ambient = [0.12, 0.12, 0.14];
  const M = new Builder(world, BLUE);
  M.box(-1792, -992, -320, 1792, 992, -288, 'gravel1');
  M.box(-1792, -992, -288, -1760, 992, 768, 'rock1_1');
  M.box(1760, -992, -288, 1792, 992, 768, 'rock1_1');
  M.box(-1760, -992, -288, 1760, -960, 768, 'rock1_1');
  M.box(-1760, 960, -288, 1760, 992, 768, 'rock1_1');
  M.box(-1792, -992, 768, 1792, 992, 800, 'sky5_blu', CONTENTS.SKY);
  // The open canal crosses under the dividing wall and into each base.
  M.slab(-288, 0, -640, 640, -960, 960, 'gravel1', [[-640, 352, 640, 576]]);
  M.box(-640, 352, -288, 640, 576, -256, 'conc2_1');
  M.box(-640, 352, -256, 640, 576, -160, 'star_water2', CONTENTS.WATER);
  M.wallX(-32, 32, -704, 704, 0, 224, 'conc1_1', [[-352, 0, -192, 160], [192, 0, 352, 160]]);
  M.box(-48, -704, 224, 48, 704, 240, 'met_gry_trim64');
  // Footbridges across the canal; water remains open to the sky alongside them.
  for (const x of [-400, 400]) M.box(x - 64, 320, -16, x + 64, 608, 0, 'treadplatemetal');
  for (const team of [BLUE, RED]) {
    const B = new Builder(world, team), WALL = 'met_blu_block', FLOOR = 'met_blu_tile';
    // Continuous base ground, with a cutout for the sloping water entrance.
    B.slab(-288, 0, -1760, -640, -960, 960, FLOOR, [[-1408, 352, -640, 576]]);
    B.box(-1408, 352, -288, -640, 576, -256, 'conc2_1');
    B.box(-1408, 352, -256, -640, 576, -160, 'star_water2', CONTENTS.WATER);
    B.ramp(-1408, 352, -896, 576, -288, -256, 0, '-x', 'conc2_1');
    // The first part is a covered pipe; the inner ramp has breathing space.
    B.slab(-64, 0, -1024, -672, 352, 576, 'conc2_1');
    B.wallX(-672, -640, -960, 960, -288, 352, WALL, [[-96, 0, 96, 160], [352, -256, 576, -64], [-480, 192, -288, 320]]);
    B.box(-688, -960, 352, -624, 960, 376, 'met_blu_trim64');
    // Lobby roof and sniper balcony, reachable from the tower via a catwalk.
    B.slab(352, 384, -1120, -672, -256, 256, 'met_gry_pan1');
    B.slab(160, 192, -800, -672, -608, -256, 'treadplatemetal');
    B.box(-672, -480, 192, -576, -288, 208, 'treadplatemetal');
    // Rear flag tower, with side entrances and a long, walkable approach ramp.
    B.wallX(-1728, -1696, -512, 512, 0, 608, WALL);
    B.wallY(-544, -512, -1728, -1152, 0, 608, WALL, [[-1696, 0, -1472, 160], [-1504, 320, -1184, 448]]);
    B.wallY(512, 544, -1728, -1152, 0, 608, WALL, [[-1472, 0, -1216, 160]]);
    B.wallX(-1184, -1152, -256, 256, 0, 608, WALL, [[-96, 0, 96, 160], [-192, 320, 192, 448]]);
    B.slab(608, 640, -1728, -1152, -544, 544, 'met_gry_flat');
    B.ramp(-1536, -480, -768, -288, 0, 0, 320, '-x', 'met_gry_sqr');
    B.slab(288, 320, -1696, -1536, -480, 480, 'met_gry_sqr');
    B.slab(288, 320, -1536, -1184, -256, 256, 'met_grate');
    // Upper route to the sniper balcony descends outside the tower's south wall.
    B.ramp(-1504, -672, -864, -576, 0, 192, 320, '-x', 'met_gry_sqr');
    B.slab(288, 320, -1696, -1504, -672, -480, 'met_gry_sqr');
    B.slab(160, 192, -864, -672, -672, -576, 'met_gry_sqr');
    B.box(-1488, -48, 320, -1392, 48, 328, 'met_blu_rune1');
    map.flags.push({ team, origin: B.P([-1440, 0, 329]), yaw: B.yaw(0) });
    B.box(-1488, -64, 0, -1392, 64, 4, 'met_blu_rune1');
    map.caps.push({ team, mins: [Math.min(B.X(-1504), B.X(-1376)), -80, 0], maxs: [Math.max(B.X(-1504), B.X(-1376)), 80, 96] });
    // Separate spawn/resupply room with a team door into the south wing.
    B.wallX(-1088, -1056, -960, -768, 0, 160, WALL);
    B.wallX(-800, -768, -960, -768, 0, 160, WALL);
    B.wallY(-800, -768, -1056, -800, 0, 160, WALL, [[-992, 0, -864, 128]]);
    B.slab(160, 192, -1088, -768, -960, -768, 'met_gry_pan1');
    map.doors.push({ team, mins: [Math.min(B.X(-992), B.X(-864)), -800, 0], maxs: [Math.max(B.X(-992), B.X(-864)), -768, 128], tex: teamTex('met_blu_door1', team), lift: 124 });
    B.box(-984, -944, 0, -872, -920, 4, 'ammotop');
    map.resupply.push({ team, mins: [Math.min(B.X(-984), B.X(-872)), -944, 0], maxs: [Math.max(B.X(-984), B.X(-872)), -920, 64] });
    for (const x of [-1024, -928, -832]) for (const y of [-888, -824]) B.spawn(x, y, 25, 90);
    for (const [x, y, z] of [[-928, -832, 140], [-864, 0, 300], [-1440, 0, 580], [-1584, 320, 560], [-1280, 432, 256], [-1280, -400, 480], [-704, 464, -80]]) B.light(x, y, z, 520);
    for (const [type, x, y, z] of [['health25', -736, 192, 0], ['ammo', -1088, 192, 0], ['armor', -1568, 256, 0], ['health25', -1632, 320, 320], ['ammo', -1248, 160, 320], ['health25', -1408, 640, 0]]) B.item(type, x, y, z);
    map.spawns[team] = B.ents.spawns; map.items.push(...B.ents.items); map.lights.push(...B.ents.lights);
    const P = p => B.P(p);
    map.botSpots[team] = {
      snipe: [{ origin: P([-624, -384, 233]), yaw: B.yaw(0) }, { origin: P([-1248, 0, 345]), yaw: B.yaw(0) }],
      sentry: [{ origin: P([-1600, 128, 345]), yaw: B.yaw(0) }, { origin: P([-1280, -160, 25]), yaw: B.yaw(0) }],
      defend: [{ origin: P([-1344, 128, 345]) }, { origin: P([-1408, 640, 25]) }, { origin: P([-864, 128, 25]) }],
      pipes: [{ origin: P([-1440, 0, 329]) }, { origin: P([-1280, 0, 0]) }],
    };
  }
  world.finalize();
  return map;
}
