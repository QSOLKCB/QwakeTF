// Unit checks for the gamepad sampler and fixed simulation clock (node tools/check-input.mjs).
import assert from 'node:assert/strict';
import { deadzone, FpsGamepad, PAD, lookRate, idleSample } from '../src/input.js';
import { FixedClock } from '../src/clock.js';

// ---- deadzone ----
assert.equal(deadzone(0.1), 0);
assert.equal(deadzone(-0.16), 0);
assert.equal(deadzone(1), 1);
assert.equal(deadzone(-1), -1);
assert(Math.abs(deadzone(0.58) - 0.5) < 1e-9, 'rescales above the deadzone');
assert.equal(deadzone(NaN), 0);
assert.equal(deadzone(0.5, 1), 0, 'invalid zone is rejected');
assert.equal(deadzone(0.5, 0), 0.5);

// ---- gamepad sampling ----
const pad = (over = {}) => {
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
  for (const [i, v] of Object.entries(over.buttons || {})) buttons[i] = { pressed: v > 0.5, value: v };
  return { index: 0, id: over.id || 'Test pad', mapping: over.mapping ?? 'standard', connected: true, buttons, axes: over.axes || [0, 0, 0, 0] };
};
const gp = new FpsGamepad();
let s = gp.sample([]);
assert.equal(s.connected, false);
s = gp.sample([null, pad({ mapping: '' })]);
assert.equal(s.connected, false, 'non-standard mappings are ignored rather than guessed');

// A button held while the pad connects must not fire until everything is released.
s = gp.sample([pad({ buttons: { [PAD.RT]: 1 } })]);
assert(s.connected && !s.armed && !s.held.attack);
s = gp.sample([pad({ axes: [0.9, 0, 0, 0] })]);
assert(!s.armed, 'a deflected stick also blocks arming');
s = gp.sample([pad()]);
assert(s.armed && !s.active);
s = gp.sample([pad({ buttons: { [PAD.RT]: 1, [PAD.A]: 1 }, axes: [0.5, -1, 1, 0] })]);
assert(s.held.attack && s.held.jump && !s.held.attack2);
assert.equal(s.move[0], 1, 'stick up moves forward');
assert(s.move[1] > 0.3 && s.move[1] < 0.5, 'analog strafe');
assert.equal(s.look[1], 1); assert.equal(s.look[0], 0);
assert(s.active);

// Edge-triggered actions fire once per press.
s = gp.sample([pad({ buttons: { [PAD.Y]: 1 } })]); assert(s.pressed.nextWeapon);
s = gp.sample([pad({ buttons: { [PAD.Y]: 1 } })]); assert(!s.pressed.nextWeapon, 'holding does not repeat');
s = gp.sample([pad()]);
s = gp.sample([pad({ buttons: { [PAD.Y]: 1 } })]); assert(s.pressed.nextWeapon, 'a fresh press fires again');

// Disarm (pause, blur) requires neutral again, but Start still toggles pause.
gp.disarm();
s = gp.sample([pad({ buttons: { [PAD.RT]: 1 } })]); assert(!s.armed && !s.held.attack);
s = gp.sample([pad()]); assert(s.armed);
gp.disarm();
s = gp.sample([pad({ buttons: { [PAD.START]: 1 } })]);
assert(s.armed && !s.pressed.pause, 'Start held across a pause does not immediately toggle again');
s = gp.sample([pad()]); s = gp.sample([pad({ buttons: { [PAD.START]: 1 } })]);
assert(s.pressed.pause);

// Switching to another controller re-arms.
s = gp.sample([pad({ id: 'Other pad', buttons: { [PAD.RT]: 1 } })]); assert(!s.armed);
// Disconnect clears state.
s = gp.sample([]); assert(!s.connected && !s.armed);

// Legacy numeric button arrays.
const legacy = new FpsGamepad();
legacy.sample([{ index: 1, id: 'L', mapping: 'standard', buttons: new Array(17).fill(0), axes: [0, 0, 0, 0] }]);
s = legacy.sample([{ index: 1, id: 'L', mapping: 'standard', buttons: Object.assign(new Array(17).fill(0), { [PAD.RT]: 1 }), axes: [0, 0, 0, 0] }]);
assert(s.held.attack);

// idleSample: no input at all, but connection details survive (used when disarming mid-frame).
{
  const live = new FpsGamepad(); live.sample([pad()]);
  const busy = live.sample([pad({ buttons: { [PAD.RT]: 1, [PAD.START]: 1 }, axes: [1, -1, 1, 1] })]);
  assert(busy.armed && busy.held.attack && busy.pressed.pause);
  const idle = idleSample(busy);
  assert.equal(idle.connected, true); assert.equal(idle.id, busy.id);
  assert.equal(idle.armed, false); assert.equal(idle.active, false);
  assert.deepEqual(idle.move, [0, 0]); assert.deepEqual(idle.look, [0, 0]);
  assert(Object.values(idle.held).every(v => v === false) && Object.values(idle.pressed).every(v => v === false));
  assert.deepEqual(Object.keys(idle.held), Object.keys(busy.held));
  assert.equal(idleSample(null).connected, false);
}

// Look response is odd and quadratic.
assert.equal(lookRate(0, 2), 0);
assert.equal(lookRate(1, 2), 120);
assert.equal(lookRate(-0.5, 2), -30);

// ---- fixed clock ----
{
  const c = new FixedClock({ step: 1 / 60, maxFrame: 0.25, maxSteps: 16 });
  let n = 0;
  for (let i = 0; i < 60; i++) c.advance(1 / 60, () => n++);
  assert.equal(n, 60, 'no steps lost to float error over one second at 60 Hz');
  n = 0; let r = c.advance(10, () => n++);
  assert.equal(n, 15, 'a long stall is clamped to maxFrame');
  assert(r.dropped > 9.7);
  n = 0; r = c.advance(1 / 120, () => n++, 0);
  assert.equal(n, 0, 'time scale 0 freezes the simulation');
  n = 0; for (let i = 0; i < 60; i++) c.advance(1 / 60, () => n++, 0.5);
  assert(n >= 29 && n <= 31, 'half time scale runs half the steps');
  const small = new FixedClock({ step: 1 / 60, maxFrame: 1, maxSteps: 4 });
  n = 0; r = small.advance(0.5, () => n++);
  assert.equal(n, 4, 'maxSteps bounds catch-up work');
  assert(small.accumulator < small.step, 'excess debt is dropped, not carried');
  r = small.advance(1 / 240, () => { });
  assert(r.alpha >= 0 && r.alpha < 1);
  assert.throws(() => new FixedClock({ step: 0 }), RangeError);
}
console.log('input and clock checks passed');
