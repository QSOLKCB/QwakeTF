// Team Fortress class, weapon and grenade definitions (values approximate QuakeWorld TF 2.x)
export const TEAM_NAMES = ['Blue', 'Red'];
export const TEAM_COLORS = [13, 4];           // quake palette rows for shirt/pants
export const TEAM_RGB = [[0.35, 0.55, 1.0], [1.0, 0.35, 0.3]];
export const TEAM_CSS = ['#5c8dff', '#ff5a4d'];

export const CLASSES = {
  scout:    { name: 'Scout',     health: 75,  armor: 50,  maxArmor: 50,  armorType: 0.3, speed: 400, weapons: ['axe', 'shotgun', 'nailgun'],                 ammo: { shells: 17, nails: 100, rockets: 0, cells: 50 },  maxAmmo: { shells: 50, nails: 200, rockets: 25, cells: 100 }, gren1: ['caltrop', 3], gren2: ['conc', 2], desc: 'Fastest class. Caltrops & concussion grenades. Weak but can grab flags fast.' },
  sniper:   { name: 'Sniper',    primary: 1, health: 90,  armor: 50,  maxArmor: 50,  armorType: 0.3, speed: 300, weapons: ['axe', 'sniperrifle', 'autorifle', 'nailgun'], ammo: { shells: 60, nails: 50, rockets: 0, cells: 0 },    maxAmmo: { shells: 75, nails: 100, rockets: 25, cells: 50 },  gren1: ['frag', 2], gren2: ['flash', 1], desc: 'Charged sniper rifle (hold fire). Autorifle for close range.' },
  soldier:  { name: 'Soldier',   health: 100, armor: 200, maxArmor: 200, armorType: 0.8, speed: 240, weapons: ['axe', 'shotgun', 'supershotgun', 'rocketlauncher'], ammo: { shells: 50, nails: 0, rockets: 10, cells: 0 }, maxAmmo: { shells: 100, nails: 100, rockets: 50, cells: 50 }, gren1: ['frag', 4], gren2: ['nail', 1], desc: 'Heavy armour and a rocket launcher. Rocket jump with fire + jump.' },
  demoman:  { name: 'Demoman',   health: 90,  armor: 120, maxArmor: 120, armorType: 0.6, speed: 280, weapons: ['axe', 'shotgun', 'grenadelauncher', 'pipelauncher'], ammo: { shells: 30, nails: 0, rockets: 20, cells: 0 }, maxAmmo: { shells: 75, nails: 50, rockets: 50, cells: 50 }, gren1: ['frag', 4], gren2: ['mirv', 2], desc: 'Grenade launcher and remote-detonated pipebombs (press E / detpipe).' },
  medic:    { name: 'Medic',     health: 90,  armor: 100, maxArmor: 100, armorType: 0.6, speed: 320, weapons: ['medikit', 'shotgun', 'supershotgun', 'supernailgun'], ammo: { shells: 50, nails: 50, rockets: 0, cells: 0 }, maxAmmo: { shells: 75, nails: 150, rockets: 25, cells: 50 }, gren1: ['frag', 3], gren2: ['conc', 2], desc: 'Heals teammates with the medikit, infects enemies. Health regenerates. Conc-jump!' },
  hwguy:    { name: 'HWGuy',     health: 100, armor: 300, maxArmor: 300, armorType: 0.8, speed: 230, weapons: ['axe', 'shotgun', 'supershotgun', 'assaultcannon'], ammo: { shells: 200, nails: 0, rockets: 0, cells: 0 }, maxAmmo: { shells: 200, nails: 200, rockets: 25, cells: 50 }, gren1: ['frag', 4], gren2: ['mirv', 1], desc: 'Slow tank with an assault cannon that spins up and shreds anything.' },
  pyro:     { name: 'Pyro',      health: 100, armor: 150, maxArmor: 150, armorType: 0.6, speed: 300, weapons: ['axe', 'shotgun', 'flamethrower', 'incendiary'], ammo: { shells: 40, nails: 0, rockets: 15, cells: 120 }, maxAmmo: { shells: 40, nails: 50, rockets: 20, cells: 200 }, gren1: ['frag', 1], gren2: ['napalm', 4], desc: 'Flamethrower and incendiary cannon. Sets enemies on fire.' },
  spy:      { name: 'Spy',       health: 90,  armor: 100, maxArmor: 100, armorType: 0.6, speed: 300, weapons: ['knife', 'tranq', 'supershotgun', 'nailgun'], ammo: { shells: 40, nails: 50, rockets: 0, cells: 0 }, maxAmmo: { shells: 40, nails: 100, rockets: 15, cells: 30 }, gren1: ['frag', 2], gren2: ['gas', 2], desc: 'Disguise as the enemy (T), feign death (F). Backstabs with the knife kill instantly.' },
  engineer: { name: 'Engineer',  health: 80,  armor: 50,  maxArmor: 50,  armorType: 0.3, speed: 300, weapons: ['spanner', 'railgun', 'supershotgun'], ammo: { shells: 30, nails: 50, rockets: 0, cells: 130 }, maxAmmo: { shells: 50, nails: 50, rockets: 30, cells: 200 }, gren1: ['frag', 2], gren2: ['emp', 2], desc: 'Builds sentry guns and dispensers (E). Spanner repairs and upgrades.' },
};
export const CLASS_LIST = Object.keys(CLASSES);

// weapon kinds: 'hitscan' | 'projectile' | 'melee' | 'special'
export const WEAPONS = {
  axe:            { name: 'Axe',            model: 'v_axe',   kind: 'melee',   damage: 20, rate: 0.5, range: 64, sound: 'weapons/ax1', hitSound: 'player/axhit2', anim: 'axe', viewFrames: [1, 2, 3, 4], ammo: null },
  knife:          { name: 'Knife',          model: 'v_axe',   kind: 'melee',   damage: 40, rate: 0.5, range: 64, sound: 'weapons/ax1', hitSound: 'player/axhit2', anim: 'axe', viewFrames: [1, 2, 3, 4], ammo: null, backstab: true },
  medikit:        { name: 'Medikit',        model: 'v_axe',   kind: 'melee',   damage: 10, rate: 0.5, range: 64, sound: 'weapons/ax1', hitSound: 'items/health1', anim: 'axe', viewFrames: [1, 2, 3, 4], ammo: null, heal: 50, infect: true },
  spanner:        { name: 'Spanner',        model: 'v_axe',   kind: 'melee',   damage: 20, rate: 0.5, range: 64, sound: 'weapons/ax1', hitSound: 'weapons/tink1', anim: 'axe', viewFrames: [1, 2, 3, 4], ammo: null, wrench: true },
  shotgun:        { name: 'Shotgun',        model: 'v_shot',  kind: 'hitscan', damage: 4, pellets: 6, spread: 0.04, rate: 0.5, sound: 'weapons/guncock', anim: 'shot', viewFrames: [1, 0], ammo: 'shells', use: 1 },
  supershotgun:   { name: 'Super Shotgun',  model: 'v_shot2', kind: 'hitscan', damage: 4, pellets: 14, spread: 0.08, rate: 0.7, sound: 'weapons/shotgn2', anim: 'shot', viewFrames: [1, 0, 2], ammo: 'shells', use: 2 },
  nailgun:        { name: 'Nailgun',        model: 'v_nail',  kind: 'projectile', proj: 'nail', damage: 9, rate: 0.1, speed: 1000, sound: 'weapons/rocket1i', anim: 'nail', viewFrames: [2, 3], ammo: 'nails', use: 1 },
  supernailgun:   { name: 'Super Nailgun',  model: 'v_nail2', kind: 'projectile', proj: 'snail', damage: 13, rate: 0.1, speed: 1000, sound: 'weapons/spike2', anim: 'nail', viewFrames: [1, 2], ammo: 'nails', use: 2 },
  autorifle:      { name: 'Autorifle',      model: 'v_nail',  kind: 'hitscan', damage: 8, pellets: 1, spread: 0.01, rate: 0.1, sound: 'weapons/rocket1i', anim: 'nail', viewFrames: [2, 3], ammo: 'shells', use: 1 },
  sniperrifle:    { name: 'Sniper Rifle',   model: 'v_light', kind: 'sniper',  damage: 50, maxDamage: 300, chargeTime: 2.5, rate: 1.5, sound: 'weapons/lstart', anim: 'light', viewFrames: [0], ammo: 'shells', use: 1, zoom: true },
  rocketlauncher: { name: 'Rocket Launcher', model: 'v_rock2', kind: 'projectile', proj: 'rocket', damage: 100, radius: 140, rate: 0.8, speed: 1000, sound: 'weapons/sgun1', anim: 'rock', viewFrames: [0, 1, 2], ammo: 'rockets', use: 1 },
  grenadelauncher:{ name: 'Grenade Launcher', model: 'v_rock', kind: 'projectile', proj: 'glgrenade', damage: 100, radius: 140, rate: 0.6, speed: 800, sound: 'weapons/grenade', anim: 'rock', viewFrames: [1, 2], ammo: 'rockets', use: 1 },
  pipelauncher:   { name: 'Pipebomb Launcher', model: 'v_rock', kind: 'projectile', proj: 'pipebomb', damage: 110, radius: 150, rate: 0.6, speed: 700, sound: 'weapons/grenade', anim: 'rock', viewFrames: [1, 2], ammo: 'rockets', use: 1, maxPipes: 8 },
  assaultcannon:  { name: 'Assault Cannon', model: 'v_nail2', kind: 'hitscan', damage: 8, pellets: 3, spread: 0.07, rate: 0.1, sound: 'weapons/guncock', anim: 'nail', viewFrames: [1, 2], ammo: 'shells', use: 1, spinup: 0.8, slow: 0.4 },
  flamethrower:   { name: 'Flamethrower',   model: 'v_light', kind: 'projectile', proj: 'flame', damage: 7, rate: 0.12, speed: 700, sound: null, anim: 'light', viewFrames: [1, 2], ammo: 'cells', use: 1, loop: 'ambience/fire1' },
  incendiary:     { name: 'Incendiary Cannon', model: 'v_rock2', kind: 'projectile', proj: 'incrocket', damage: 55, radius: 120, rate: 1.2, speed: 900, sound: 'weapons/sgun1', anim: 'rock', viewFrames: [0, 1], ammo: 'rockets', use: 3 },
  railgun:        { name: 'Railgun',        model: 'v_light', kind: 'projectile', proj: 'rail', damage: 25, rate: 0.4, speed: 1500, sound: 'weapons/lhit', anim: 'light', viewFrames: [1, 2], ammo: 'nails', use: 1 },
  tranq:          { name: 'Tranquilizer',   model: 'v_shot',  kind: 'projectile', proj: 'dart', damage: 18, rate: 1.0, speed: 1200, sound: 'weapons/guncock', anim: 'shot', viewFrames: [1, 0], ammo: 'shells', use: 1 },
};

export const GRENADES = {
  frag:    { name: 'Frag Grenade',       damage: 120, radius: 160, fuse: 3.8 },
  conc:    { name: 'Concussion Grenade', damage: 0,   radius: 240, fuse: 3.8, knock: 2.2 },
  nail:    { name: 'Nail Grenade',       damage: 50,  radius: 120, fuse: 3.8, nailTime: 3.0 },
  mirv:    { name: 'Mirv Grenade',       damage: 100, radius: 150, fuse: 3.8, bomblets: 4 },
  napalm:  { name: 'Napalm Grenade',     damage: 30,  radius: 140, fuse: 3.8, fire: 5 },
  emp:     { name: 'EMP Grenade',        damage: 60,  radius: 240, fuse: 3.8, emp: true },
  caltrop: { name: 'Caltrops',           damage: 10,  radius: 0,   fuse: 0, caltrops: 6 },
  flash:   { name: 'Flash Grenade',      damage: 0,   radius: 300, fuse: 3.8, flash: true },
  gas:     { name: 'Hallucinogen Gas',   damage: 0,   radius: 200, fuse: 3.8, gas: 6 },
};

export const PROJECTILES = {
  nail:      { model: 'spike',   gravity: 0,   bounce: false, size: 0 },
  snail:     { model: 's_spike', gravity: 0,   bounce: false, size: 0 },
  rocket:    { model: 'missile', gravity: 0,   bounce: false, size: 0, trail: 'rocket', light: true },
  incrocket: { model: 'missile', gravity: 0,   bounce: false, size: 0, trail: 'fire', light: true },
  glgrenade: { model: 'grenade', gravity: 1,   bounce: true,  size: 2, fuse: 2.5, trail: 'grenade' },
  pipebomb:  { model: 'grenade', gravity: 1,   bounce: true,  size: 2, fuse: -1, trail: 'grenade' },
  flame:     { model: null,      gravity: 0.1, bounce: false, size: 4, life: 0.35 },
  rail:      { model: 'laser',   gravity: 0,   bounce: false, size: 0, light: true },
  dart:      { model: 'spike',   gravity: 0,   bounce: false, size: 0 },
  handgren:  { model: 'grenade', gravity: 1,   bounce: true,  size: 2, trail: 'grenade' },
  bomblet:   { model: 'grenade', gravity: 1,   bounce: true,  size: 2, fuse: 0.8 },
  caltrop:   { model: 's_spike', gravity: 1,   bounce: true,  size: 1 },
};

export const ITEMS = {
  health25: { name: 'Health', model: null, brush: { size: [16, 16, 16], tex: { top: 'plus_0_hp25_top_fbr', side: 'plus_0_hp25_side_fbr' } }, respawn: 20, sound: 'items/health1' },
  ammo:     { name: 'Ammo pack', model: 'backpack', respawn: 20, sound: 'weapons/pkup' },
  armor:    { name: 'Armor', model: 'armor', respawn: 25, sound: 'items/armor1' },
};

// Player hull
export const PL_MINS = [-16, -16, -24], PL_MAXS = [16, 16, 32], VIEW_HEIGHT = 22;

// Quake player.mdl frame table
export const PFRAMES = {
  axrun: [0, 6], rockrun: [6, 6], stand: [12, 5], axstnd: [17, 12], axpain: [29, 6], pain: [35, 6],
  axdeth: [41, 9], deatha: [50, 11], deathb: [61, 9], deathc: [70, 15], deathd: [85, 9], deathe: [94, 9],
  nailatt: [103, 2], light: [105, 2], rockatt: [107, 6], shotatt: [113, 6], axatt: [119, 6], axattb: [125, 6], axattc: [131, 6], axattd: [137, 6],
};

export const SENTRY = { buildCost: 130, upgradeCost: 130, health: [150, 180, 216], damage: [10, 10, 12], rate: [0.2, 0.1, 0.1], range: 1000, rocketLevel: 3 };
export const DISPENSER = { buildCost: 100, health: 150 };
