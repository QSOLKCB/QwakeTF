// SPDX-License-Identifier: Apache-2.0
// Standard-mapping gamepad input for QwakeTF.
// Adapted from QSOLKCB/VANILLAJS modules/input (deadzone, neutral re-arming and
// standard-mapping selection). The FPS button layout and look curve are QwakeTF's own.

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Radial-free axis deadzone with rescaling, so output still reaches ±1. */
export function deadzone(value, zone = 0.16) {
  if (!Number.isFinite(value) || !Number.isFinite(zone) || zone < 0 || zone >= 1) return 0;
  const magnitude = clamp((Math.abs(value) - zone) / (1 - zone), 0, 1);
  return magnitude === 0 ? 0 : Math.sign(value) * magnitude;
}

// W3C "standard" gamepad layout indices.
export const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

// Held actions: the game command fields they drive while the button is down.
export const PAD_HOLD = {
  jump: PAD.A, down: PAD.B, special: PAD.X, gren2: PAD.LB, gren1: PAD.RB, attack2: PAD.LT, attack: PAD.RT,
  scores: PAD.BACK, dispenser: PAD.L3, disguise: PAD.UP, feign: PAD.DOWN,
};
// Edge actions: fire once per press.
export const PAD_PRESS = { pause: PAD.START, nextWeapon: PAD.Y, prevWeapon: PAD.LEFT, cycleWeapon: PAD.RIGHT, lastWeapon: PAD.R3 };

export const PAD_HELP = [
  ['Left stick', 'Move'], ['Right stick', 'Aim'], ['RT', 'Fire (hold to charge sniper rifle)'], ['LT', 'Sniper zoom'],
  ['A', 'Jump / swim up / respawn'], ['B', 'Swim down'], ['RB / LB', 'Primary / secondary grenade'],
  ['X', 'Detonate pipebombs, build sentry'], ['L3 (press left stick)', 'Build dispenser'], ['Y, D-pad left / right', 'Next / previous / next weapon'],
  ['R3 (press right stick)', 'Last weapon'], ['D-pad up / down', 'Disguise / feign death (Spy)'], ['Back / View', 'Scoreboard'], ['Start / Menu', 'Pause / resume; on the main or Single Player menu, start a match'],
];

/**
 * Samples the first connected standard-mapping gamepad.
 * After connecting, switching pads, or calling disarm() (pause, focus loss), every
 * button and stick must return to neutral before input is accepted again, so a
 * button held while a menu closes is not replayed as a game action.
 */
/** A sample with no input. Keeps connection details from `prev` so status displays stay correct. */
export function idleSample(prev = null) {
  const out = { connected: !!(prev && prev.connected), armed: false, id: prev ? prev.id : '', move: [0, 0], look: [0, 0], held: {}, pressed: {}, active: false };
  for (const k in PAD_HOLD) out.held[k] = false;
  for (const k in PAD_PRESS) out.pressed[k] = false;
  return out;
}

export class FpsGamepad {
  constructor() { this.identity = ''; this.armed = false; this.prev = new Set(); }
  disarm() { this.armed = false; this.prev.clear(); }
  sample(pads = [], { deadzone: zone = 0.16 } = {}) {
    const out = idleSample();
    const pad = Array.from(pads || []).find(p => p && p.connected !== false && p.mapping === 'standard');
    if (!pad) { if (this.identity) { this.identity = ''; this.disarm(); } return out; }
    out.connected = true; out.id = pad.id;
    const identity = `${pad.index}:${pad.id}`;
    if (identity !== this.identity) { this.identity = identity; this.disarm(); }
    const button = (i) => { const b = pad.buttons[i]; const v = b ? (typeof b === 'number' ? b : (b.value ?? Number(Boolean(b.pressed)))) : 0; return Number.isFinite(v) ? clamp(v, 0, 1) : 0; };
    const axis = (i) => deadzone(pad.axes[i] ?? 0, zone);
    if (!this.armed) {
      // Start is exempt so the pause button can still close menus; it is tracked as an edge below.
      this.armed = pad.buttons.every((_, i) => i === PAD.START || button(i) <= 0.1) && pad.axes.every(x => deadzone(x, zone) === 0);
      this.prev = new Set(button(PAD.START) > 0.5 ? [PAD.START] : []);
      if (!this.armed) return out;
    }
    out.armed = true;
    const down = new Set(); for (let i = 0; i < pad.buttons.length; i++) if (button(i) > 0.5) down.add(i);
    out.move = [-axis(1), axis(0)];
    out.look = [axis(3), axis(2)];
    for (const [k, i] of Object.entries(PAD_HOLD)) out.held[k] = down.has(i);
    for (const [k, i] of Object.entries(PAD_PRESS)) out.pressed[k] = down.has(i) && !this.prev.has(i);
    this.prev = down;
    out.active = down.size > 0 || out.move.some(Boolean) || out.look.some(Boolean);
    return out;
  }
}

/** Look rate in degrees per second from deflection: quadratic response for fine aim near centre. */
export function lookRate(deflection, sensitivity) { return deflection === 0 ? 0 : Math.sign(deflection) * deflection * deflection * sensitivity * 60; }
