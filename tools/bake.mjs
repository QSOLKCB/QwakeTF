import { buildMap } from '../src/map_2fort.js';
import { visibleFaces, bakeLightmaps, LM_SIZE } from '../src/lightmap.js';
const map = buildMap(); const t0 = Date.now();
const faces = visibleFaces(map.world); console.log('visible faces', faces.length, 'ms', Date.now() - t0);
const t1 = Date.now();
const r = await bakeLightmaps(map.world, faces, { lights: map.lights, sun: map.sun, sky: map.skylight, ambient: map.ambient });
console.log('bake ms', Date.now() - t1, 'atlas rows used', r.used, 'of', LM_SIZE, 'lights', map.lights.length);
