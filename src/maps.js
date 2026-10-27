import { buildMap as twoForts } from './map_2fort.js';
import { buildMap as well } from './map_well.js';

export const MAPS = [
  { id: '2fort', name: 'Two Forts', build: twoForts },
  { id: 'well', name: 'Well', build: well },
];
export function mapDefinition(id) { return MAPS.find(m => m.id === id) || MAPS[0]; }
