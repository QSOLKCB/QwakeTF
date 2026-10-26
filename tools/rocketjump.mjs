import { buildMap } from '../src/map_2fort.js';
import { Game } from '../src/game.js';
const g = new Game({ map: buildMap(), nav: null, assets: null, audio: null });
const p = g.addPlayer({ name: 'S', team: 0, cls: 'soldier' }); g.respawnPlayer(p); p.origin = [-200, 0, 25];
let maxZ = 0;
for (let i = 0; i < 180; i++) { p.cmd.angles = [89, 0, 0]; p.cmd.jump = i >= 30 && i < 34; p.cmd.attack = i >= 32 && i < 34; g.step(1 / 60); maxZ = Math.max(maxZ, p.origin[2]); }
console.log('rocket jump peak height above floor', Math.round(maxZ - 24), 'health', p.health, 'armor', p.armor);
