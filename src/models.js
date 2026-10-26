// Procedural brush models for entities LibreQuake has no model for: flags, health kits, sentry guns, dispensers.
import { boxBrush } from './world.js';

export function buildEntityModels(r, tex) {
  const M = {};
  const mk = (boxes) => r.buildBrushModel(boxes.map(([mins, maxs, t]) => boxBrush(mins, maxs, t)), tex);
  for (const [team, cl, rune] of [[0, 'flag_blue', 'met_blu_rune1'], [1, 'flag_red', 'met_brn_rune1']]) {
    M['flag' + team] = mk([
      [[-2, -2, -16], [2, 2, 56], { all: 'met_gry_trim64' }],
      [[-1, 2, 28], [1, 34, 54], { all: cl }],
      [[-4, -4, 56], [4, 4, 60], { all: rune }],
    ]);
  }
  M.health = mk([[[-12, -12, -16], [12, 12, 2], { top: 'plus_0_hp25_top_fbr', side: 'plus_0_hp25_side_fbr', bottom: 'hp_bottom' }]]);
  M.sentryBase = mk([
    [[-14, -14, 0], [14, 14, 6], { all: 'met_gry_block' }],
    [[-4, -4, 6], [4, 4, 28], { all: 'met_gry_trim64' }],
  ]);
  for (const lvl of [1, 2, 3]) for (const team of [0, 1]) {
    const body = team === 0 ? 'met_blu_panel1' : 'met_brn_panel1';
    const boxes = [[[-12, -10, -8], [10, 10, 8], { all: body }], [[10, -2, -2], [34, 2, 2], { all: 'met_gry_flat' }]];
    if (lvl >= 2) boxes.push([[10, -8, -2], [32, -4, 2], { all: 'met_gry_flat' }], [[10, 4, -2], [32, 8, 2], { all: 'met_gry_flat' }]);
    if (lvl >= 3) boxes.push([[-6, -18, 6], [14, -10, 14], { all: 'met_gry_block' }], [[-6, 10, 6], [14, 18, 14], { all: 'met_gry_block' }]);
    M[`sentryHead${lvl}_${team}`] = mk(boxes);
  }
  for (const team of [0, 1]) M['dispenser' + team] = mk([
    [[-16, -16, 0], [16, 16, 48], { top: 'ammotop', side: team === 0 ? 'met_blu_slat' : 'met_brn_slat', bottom: 'ammo_bottom' }],
    [[-17, -10, 18], [17, 10, 36], { all: 'comp1_1' }],
  ]);
  return M;
}

export const ENTITY_TEXTURES = ['met_gry_trim64', 'met_blu_rune1', 'met_brn_rune1', 'plus_0_hp25_top_fbr', 'plus_0_hp25_side_fbr', 'hp_bottom', 'met_gry_block', 'met_blu_panel1', 'met_brn_panel1', 'met_gry_flat', 'ammotop', 'ammo_bottom', 'met_blu_slat', 'met_brn_slat', 'comp1_1', 'met_blu_door1', 'met_brn_drr1a', 'sky5_blu'];

// Simple solid-colour textures with a subtle pattern (for flag cloth)
export function makeFlagTextures(r) {
  const make = (rgb) => { const w = 32, d = new Uint8Array(w * w * 4); for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) { const o = (y * w + x) * 4; const k = ((x >> 3) + (y >> 3)) & 1 ? 1 : 0.82; d[o] = rgb[0] * k; d[o + 1] = rgb[1] * k; d[o + 2] = rgb[2] * k; d[o + 3] = 255; } return r.makeTexture(d, w, w, true); };
  return { flag_blue: make([60, 110, 255]), flag_red: make([235, 50, 40]) };
}
